import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readUsageMetrics } from "../../packages/library-fs/src/index.ts";
import {
  importLegacyUsageEvents,
  type UsageMigrationMode,
  type UsageMigrationProgress,
  type LegacyUsageImportReport
} from "../../packages/library-fs/src/usage-service-migration.ts";
import {
  UsageServiceError,
  UsageServiceStore,
  resolveUsageServiceCapacityConfig
} from "../../packages/library-fs/src/usage-service-store.ts";

const LEGACY_USAGE_EVENTS_RELATIVE_PATH = ".mixlab-library/usage-events/events.ndjson";

export interface UsageMigrationVerificationField {
  field: string;
  service: number;
  legacy: number;
  match: boolean;
}

export interface UsageMigrationVerification {
  status: "match" | "known-difference" | "mismatch";
  store_id: string;
  service_event_count: number;
  legacy_event_store: {
    line_count: number;
    valid_line_count: number;
    malformed_line_count: number;
  };
  known_differences: {
    missing_event_id_lines: number;
    malformed_lines: number;
  };
  compared_fields: UsageMigrationVerificationField[];
  mismatched_fields: string[];
}

const COMPARED_METRIC_FIELDS = [
  "search_request_count",
  "search_hit_count",
  "search_empty_count",
  "search_failure_count",
  "searchd_search_count",
  "sqlite_index_search_count",
  "fallback_search_count",
  "source_detail_view_count",
  "transcript_selection_count",
  "add_to_cut_list_count",
  "cut_submission_count",
  "cut_success_count",
  "cut_failure_count",
  "local_clip_count",
  "reuse_local_clip_count",
  "active_user_count"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function countKnownLegacyDifferences(legacyRoot: string): Promise<{
  missing_event_id_lines: number;
  malformed_lines: number;
}> {
  let raw = "";

  try {
    raw = await readFile(path.join(legacyRoot, LEGACY_USAGE_EVENTS_RELATIVE_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { missing_event_id_lines: 0, malformed_lines: 0 };
    }
    throw error;
  }

  let missingEventIdLines = 0;
  let malformedLines = 0;

  for (const line of raw.split(/\r?\n/u)) {
    if (line.trim() === "") {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;

      if (!isRecord(parsed)) {
        malformedLines += 1;
        continue;
      }

      const isEnvelopeShape = parsed.schema_version === "1.0" && isRecord(parsed.payload);
      const hasEventId = typeof parsed.event_id === "string" && parsed.event_id.trim() !== "";

      if (!isEnvelopeShape && !hasEventId) {
        missingEventIdLines += 1;
      }
    } catch {
      malformedLines += 1;
    }
  }

  return { missing_event_id_lines: missingEventIdLines, malformed_lines: malformedLines };
}

/** Compare service aggregation with a recomputation from the legacy NDJSON file. */
export async function verifyMigratedUsageMetrics(input: {
  legacy_root: string;
  state_root: string;
}): Promise<UsageMigrationVerification> {
  const capacity = resolveUsageServiceCapacityConfig(process.env);
  const store = new UsageServiceStore(input.state_root, {
    retention_days: capacity.retention_days,
    max_events: capacity.max_events,
    auto_prune: false,
    read_only: true
  });

  try {
    const serviceMetrics = store.metrics(undefined, {
      generated_at: new Date().toISOString()
    });
    const legacyMetrics = await readUsageMetrics(input.legacy_root);
    const knownDifferences = await countKnownLegacyDifferences(input.legacy_root);
    const comparedFields: UsageMigrationVerificationField[] = COMPARED_METRIC_FIELDS.map((field) => {
      const serviceValue = serviceMetrics.metrics[field];
      const legacyValue = legacyMetrics[field];
      return {
        field,
        service: serviceValue,
        legacy: legacyValue,
        match: serviceValue === legacyValue
      };
    });
    const mismatchedFields = comparedFields
      .filter((field) => !field.match)
      .map((field) => field.field);
    const hasKnownDifferences = knownDifferences.missing_event_id_lines > 0 ||
      knownDifferences.malformed_lines > 0;
    const status = mismatchedFields.length === 0
      ? "match"
      : hasKnownDifferences ? "known-difference" : "mismatch";

    return {
      status,
      store_id: store.id,
      service_event_count: serviceMetrics.event_count,
      legacy_event_store: {
        line_count: legacyMetrics.event_store.line_count,
        valid_line_count: legacyMetrics.event_store.valid_line_count,
        malformed_line_count: legacyMetrics.event_store.malformed_line_count
      },
      known_differences: knownDifferences,
      compared_fields: comparedFields,
      mismatched_fields: mismatchedFields
    };
  } finally {
    store.close();
  }
}

export function usageMigrationHelp(): string {
  return [
    "用法：",
    "  import <legacy_library_root> <usage_service_state_root> [--dry-run|--apply] [--legacy-writers-stopped] [--verify]",
    "",
    "说明：只读取旧库 .mixlab-library/usage-events/events.ndjson，绝不会修改/移动该文件。",
    "      --apply 需要同时提供 --legacy-writers-stopped 表示旧事件写入者已停止。",
    "      --verify 比较服务聚合与 NDJSON 重算；仅 --verify（不带 --apply/--dry-run）时只做校验。",
    "      无 event_id 的旧行属已知差异（迁移会补稳定 id，旧读路径记为坏行），报告会列出。"
  ].join("\n");
}

export async function runUsageServiceMigrationCli(argv: string[]): Promise<number> {
  const [operation, legacyRoot, stateRoot, ...rest] = argv;

  if (operation !== "import" || !legacyRoot || !stateRoot) {
    console.error(usageMigrationHelp());
    return 2;
  }

  const apply = rest.includes("--apply");
  const dryRun = rest.includes("--dry-run");
  const verify = rest.includes("--verify");
  const legacyWritersStopped = rest.includes("--legacy-writers-stopped");

  if (apply && dryRun) {
    console.error("--apply 与 --dry-run 不能同时使用");
    return 2;
  }

  const mode: UsageMigrationMode = apply ? "apply" : "dry-run";
  const verifyOnly = verify && !apply && !dryRun;
  let report: LegacyUsageImportReport | null = null;

  try {
    if (!verifyOnly) {
      report = await importLegacyUsageEvents({
        legacy_root: legacyRoot,
        state_root: stateRoot,
        mode,
        legacy_writers_stopped: legacyWritersStopped,
        on_progress(progress: UsageMigrationProgress) {
          if (!process.stderr.isTTY) {
            return;
          }
          process.stderr.write(JSON.stringify(progress) + "\n");
        }
      });
    }

    const verification = verify
      ? await verifyMigratedUsageMetrics({
        legacy_root: legacyRoot,
        state_root: stateRoot
      })
      : null;

    console.log(JSON.stringify({ import: report, verification }, null, 2));

    return verification?.status === "mismatch" ? 1 : 0;
  } catch (error) {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code ?? "usage_migration_failed"
    }));
    return 1;
  }
}

const isDirectRun = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exitCode = await runUsageServiceMigrationCli(process.argv.slice(2));
}
