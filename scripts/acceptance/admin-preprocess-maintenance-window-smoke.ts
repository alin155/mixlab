import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AdminPreprocessSmallBatchSmokeReport,
  runAdminPreprocessSmallBatchSmoke
} from "./admin-preprocess-small-batch-smoke.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_BATCHES = 2;
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POST_FILE_WAIT_TIMEOUT_MS = 180 * 1000;
const DEFAULT_POST_FILE_WAIT_INTERVAL_MS = 5000;

type WindowStatus = "dry-run-ready" | "passed" | "failed";

interface LibraryStatusSnapshot {
  ok: boolean;
  error: string;
  ready_video_count: number | null;
  queued_video_count: number | null;
  processing_video_count: number | null;
  index_required_video_count: number | null;
  current_index_version: string;
  updated_at: string;
}

interface WindowBatchItem {
  batch_index: number;
  source_video_ids: string[];
  status: "dry-run-ready" | "passed" | "failed";
  before: LibraryStatusSnapshot;
  after: LibraryStatusSnapshot;
  blockers: string[];
  json_path: string;
  markdown_path: string;
}

export interface AdminPreprocessMaintenanceWindowSmokeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-preprocess-maintenance-window-smoke";
  execution_mode: "dry-run" | "execute";
  status: WindowStatus;
  mutates_nas_files: boolean;
  target: {
    base_url: string;
    source_video_ids: string[];
    expected_library_root: string;
    expected_ready_count: number;
    expected_index_version: string;
    batch_size: number;
    max_batches: number;
    stop_on_failure: boolean;
    session_token_present: boolean;
  };
  allowed_write_boundary: {
    execute_requested: boolean;
    allowed_post_paths: string[];
    publish_allowed: false;
    docker_deploy_allowed: false;
    automatic_worker_allowed: false;
  };
  summary: {
    requested_count: number;
    attempted_batches: number;
    passed_batches: number;
    failed_batches: number;
    stopped_on_failure: boolean;
    blockers: string[];
  };
  batches: WindowBatchItem[];
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function optionalTrimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseExpectedReadyCount(value: string | undefined): number {
  return parsePositiveInteger(value, DEFAULT_EXPECTED_READY_COUNT);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseSourceVideoIds(value: string | undefined): string[] {
  return [...new Set((value ?? "")
    .split(/[,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chunkIds(sourceVideoIds: string[], batchSize: number, maxBatches: number): string[][] {
  return sourceVideoIds
    .slice(0, batchSize * maxBatches)
    .reduce<string[][]>((batches, sourceVideoId, index) => {
      const batchIndex = Math.floor(index / batchSize);
      batches[batchIndex] ??= [];
      batches[batchIndex].push(sourceVideoId);
      return batches;
    }, []);
}

function emptyStatusSnapshot(error: string): LibraryStatusSnapshot {
  return {
    ok: false,
    error,
    ready_video_count: null,
    queued_video_count: null,
    processing_video_count: null,
    index_required_video_count: null,
    current_index_version: "",
    updated_at: ""
  };
}

function dataFromJson(value: unknown): unknown {
  const record = asRecord(value);
  return Object.prototype.hasOwnProperty.call(record, "data") ? record.data : value;
}

async function fetchLibraryStatus(input: {
  base_url?: string;
  session_token?: string;
  fetch_impl?: typeof fetch;
}): Promise<LibraryStatusSnapshot> {
  const baseUrl = trimTrailingSlash(optionalTrimmed(input.base_url));
  if (!baseUrl) {
    return emptyStatusSnapshot("base URL is not configured.");
  }

  const headers: Record<string, string> = {};
  if (input.session_token) {
    headers["X-MixLab-Admin-Session-Token"] = input.session_token;
  }

  try {
    const fetchImpl = input.fetch_impl ?? fetch;
    const response = await fetchImpl(`${baseUrl}/api/admin/library/status`, { headers });
    const json = await response.json().catch(() => null) as unknown;
    const data = asRecord(dataFromJson(json));
    return {
      ok: response.ok,
      error: response.ok ? "" : `HTTP ${response.status}`,
      ready_video_count: asNumber(data.ready_video_count),
      queued_video_count: asNumber(data.queued_video_count),
      processing_video_count: asNumber(data.processing_video_count),
      index_required_video_count: asNumber(data.index_required_video_count),
      current_index_version: asString(data.current_index_version),
      updated_at: asString(data.updated_at)
    };
  } catch (error) {
    return emptyStatusSnapshot(errorMessage(error));
  }
}

function statusBlockers(input: {
  snapshot: LibraryStatusSnapshot;
  expected_ready_count: number;
  expected_index_version: string;
  label: string;
}): string[] {
  const blockers: string[] = [];
  if (!input.snapshot.ok) {
    blockers.push(`${input.label}-library-status-unavailable`);
  }
  if (input.snapshot.ready_video_count !== input.expected_ready_count) {
    blockers.push(`${input.label}-ready-count-drift`);
  }
  if (input.snapshot.current_index_version !== input.expected_index_version) {
    blockers.push(`${input.label}-index-version-drift`);
  }
  if (input.snapshot.processing_video_count !== 0) {
    blockers.push(`${input.label}-processing-not-idle`);
  }
  return blockers;
}

function buildWindowStatus(input: {
  execute: boolean;
  requested_count: number;
  capacity: number;
  blockers: string[];
  batches: WindowBatchItem[];
}): WindowStatus {
  if (input.requested_count === 0 || input.requested_count > input.capacity || input.blockers.length > 0) {
    return "failed";
  }
  const allBatchesPassed = input.batches.length > 0 && input.batches.every((batch) => batch.blockers.length === 0);
  return allBatchesPassed ? input.execute ? "passed" : "dry-run-ready" : "failed";
}

function renderMarkdown(report: AdminPreprocessMaintenanceWindowSmokeReport): string {
  const rows = report.batches.map((batch) => [
    String(batch.batch_index),
    batch.source_video_ids.join(", "),
    batch.status,
    String(batch.before.ready_video_count),
    String(batch.before.queued_video_count),
    String(batch.before.index_required_video_count),
    String(batch.after.ready_video_count),
    String(batch.after.queued_video_count),
    String(batch.after.index_required_video_count),
    batch.blockers.join(", ") || "none",
    batch.json_path
  ].join(" | "));

  return `# Admin Preprocess Maintenance Window Smoke

- Generated at: ${report.generated_at}
- Execution mode: ${report.execution_mode}
- Status: ${report.status}
- Mutates NAS files: ${String(report.mutates_nas_files)}
- Source videos: ${report.target.source_video_ids.join(", ") || "none"}
- Batch size: ${report.target.batch_size}
- Max batches: ${report.target.max_batches}
- Expected ready count: ${report.target.expected_ready_count}
- Expected index version: ${report.target.expected_index_version}
- Stop on failure: ${String(report.target.stop_on_failure)}
- Blockers: ${report.summary.blockers.join(", ") || "none"}

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: ${report.allowed_write_boundary.allowed_post_paths.join(", ") || "none"}

## Batches

batch | source_video_ids | status | ready_before | queued_before | index_required_before | ready_after | queued_after | index_required_after | blockers | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
${rows.join("\n") || "none | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a"}
`;
}

async function writeArtifacts(input: {
  report: AdminPreprocessMaintenanceWindowSmokeReport;
  output_dir?: string;
  date: Date;
}): Promise<AdminPreprocessMaintenanceWindowSmokeReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });
  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-preprocess-maintenance-window-smoke-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-preprocess-maintenance-window-smoke-${stamp}.md`);
  const report = {
    ...input.report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");
  return report;
}

export async function runAdminPreprocessMaintenanceWindowSmoke(input: {
  base_url?: string;
  source_video_ids?: string[];
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  session_token?: string;
  readiness_report_path?: string;
  library_mount_root?: string;
  execute?: boolean;
  batch_size?: number;
  max_batches?: number;
  stop_on_failure?: boolean;
  poll_timeout_ms?: number;
  poll_interval_ms?: number;
  post_file_wait_timeout_ms?: number;
  post_file_wait_interval_ms?: number;
  post_file_refresh_command?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
  fetch_impl?: typeof fetch;
  run_small_batch_smoke?: typeof runAdminPreprocessSmallBatchSmoke;
} = {}): Promise<AdminPreprocessMaintenanceWindowSmokeReport> {
  const date = input.date ?? new Date();
  const sourceVideoIds = input.source_video_ids ?? [];
  const batchSize = input.batch_size ?? DEFAULT_BATCH_SIZE;
  const maxBatches = input.max_batches ?? DEFAULT_MAX_BATCHES;
  const expectedReadyCount = input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT;
  const expectedIndexVersion = input.expected_index_version ?? DEFAULT_EXPECTED_INDEX_VERSION;
  const execute = input.execute === true;
  const stopOnFailure = input.stop_on_failure ?? true;
  const capacity = batchSize * maxBatches;
  const runSmallBatch = input.run_small_batch_smoke ?? runAdminPreprocessSmallBatchSmoke;
  const topLevelBlockers: string[] = [];
  const batches: WindowBatchItem[] = [];

  if (sourceVideoIds.length === 0) {
    topLevelBlockers.push("source-video-ids-required");
  }
  if (sourceVideoIds.length > capacity) {
    topLevelBlockers.push("source-video-id-count-exceeds-window-capacity");
  }

  if (topLevelBlockers.length === 0) {
    const chunks = chunkIds(sourceVideoIds, batchSize, maxBatches);
    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex += 1) {
      const before = await fetchLibraryStatus({
        base_url: input.base_url,
        session_token: input.session_token,
        fetch_impl: input.fetch_impl
      });
      const beforeBlockers = statusBlockers({
        snapshot: before,
        expected_ready_count: expectedReadyCount,
        expected_index_version: expectedIndexVersion,
        label: `batch-${batchIndex + 1}-before`
      });
      if (beforeBlockers.length > 0) {
        batches.push({
          batch_index: batchIndex + 1,
          source_video_ids: chunks[batchIndex] ?? [],
          status: "failed",
          before,
          after: before,
          blockers: beforeBlockers,
          json_path: "",
          markdown_path: ""
        });
        if (stopOnFailure) {
          break;
        }
        continue;
      }

      const batchReport = await runSmallBatch({
        base_url: input.base_url,
        source_video_ids: chunks[batchIndex],
        expected_library_root: input.expected_library_root,
        expected_ready_count: expectedReadyCount,
        expected_index_version: expectedIndexVersion,
        session_token: input.session_token,
        readiness_report_path: input.readiness_report_path,
        library_mount_root: input.library_mount_root,
        execute,
        max_count: batchSize,
        stop_on_failure: true,
        poll_timeout_ms: input.poll_timeout_ms ?? DEFAULT_POLL_TIMEOUT_MS,
        poll_interval_ms: input.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS,
        post_file_wait_timeout_ms: input.post_file_wait_timeout_ms ?? DEFAULT_POST_FILE_WAIT_TIMEOUT_MS,
        post_file_wait_interval_ms: input.post_file_wait_interval_ms ?? DEFAULT_POST_FILE_WAIT_INTERVAL_MS,
        post_file_refresh_command: input.post_file_refresh_command,
        output_dir: input.output_dir,
        command: `window:${input.command ?? "tsx scripts/acceptance/admin-preprocess-maintenance-window-smoke.ts"}`,
        date: new Date(date.getTime() + (batchIndex + 1) * 60_000)
      });
      const after = await fetchLibraryStatus({
        base_url: input.base_url,
        session_token: input.session_token,
        fetch_impl: input.fetch_impl
      });
      const afterBlockers = statusBlockers({
        snapshot: after,
        expected_ready_count: expectedReadyCount,
        expected_index_version: expectedIndexVersion,
        label: `batch-${batchIndex + 1}-after`
      });
      const batchBlockers = [
        ...batchReport.summary.blockers.map((blocker) => `batch-${batchIndex + 1}:${blocker}`),
        ...afterBlockers
      ];
      batches.push({
        batch_index: batchIndex + 1,
        source_video_ids: chunks[batchIndex] ?? [],
        status: batchReport.status === "passed" || batchReport.status === "dry-run-ready" ? batchReport.status : "failed",
        before,
        after,
        blockers: batchBlockers,
        json_path: batchReport.artifacts?.json_path ?? "",
        markdown_path: batchReport.artifacts?.markdown_path ?? ""
      });

      if (batchBlockers.length > 0 && stopOnFailure) {
        break;
      }
    }
  }

  const blockers = [
    ...topLevelBlockers,
    ...batches.flatMap((batch) => batch.blockers)
  ];
  const status = buildWindowStatus({
    execute,
    requested_count: sourceVideoIds.length,
    capacity,
    blockers,
    batches
  });
  const report: AdminPreprocessMaintenanceWindowSmokeReport = {
    schema_version: "1.0",
    generated_at: date.toISOString(),
    command: input.command ?? "tsx scripts/acceptance/admin-preprocess-maintenance-window-smoke.ts",
    mode: "admin-preprocess-maintenance-window-smoke",
    execution_mode: execute ? "execute" : "dry-run",
    status,
    mutates_nas_files: execute,
    target: {
      base_url: optionalTrimmed(input.base_url),
      source_video_ids: sourceVideoIds,
      expected_library_root: optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT,
      expected_ready_count: expectedReadyCount,
      expected_index_version: optionalTrimmed(input.expected_index_version) || DEFAULT_EXPECTED_INDEX_VERSION,
      batch_size: batchSize,
      max_batches: maxBatches,
      stop_on_failure: stopOnFailure,
      session_token_present: Boolean(optionalTrimmed(input.session_token))
    },
    allowed_write_boundary: {
      execute_requested: execute,
      allowed_post_paths: execute ? ["/api/admin/preprocess/supervisor/start"] : [],
      publish_allowed: false,
      docker_deploy_allowed: false,
      automatic_worker_allowed: false
    },
    summary: {
      requested_count: sourceVideoIds.length,
      attempted_batches: batches.length,
      passed_batches: batches.filter((batch) => batch.blockers.length === 0).length,
      failed_batches: batches.filter((batch) => batch.blockers.length > 0).length,
      stopped_on_failure: stopOnFailure && batches.length < Math.ceil(Math.min(sourceVideoIds.length, capacity) / batchSize),
      blockers
    },
    batches,
    artifacts: null
  };

  return writeArtifacts({
    report,
    output_dir: input.output_dir,
    date
  });
}

async function main(): Promise<void> {
  const report = await runAdminPreprocessMaintenanceWindowSmoke({
    base_url: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_BASE_URL,
    source_video_ids: parseSourceVideoIds(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_SOURCE_VIDEO_IDS),
    expected_library_root: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parseExpectedReadyCount(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_EXPECT_READY_COUNT),
    expected_index_version: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_EXPECT_INDEX_VERSION,
    session_token: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_SESSION_TOKEN,
    readiness_report_path: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_READINESS_REPORT,
    library_mount_root: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_LIBRARY_MOUNT,
    execute: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_EXECUTE === "1",
    batch_size: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    max_batches: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_MAX_BATCHES, DEFAULT_MAX_BATCHES),
    stop_on_failure: parseBoolean(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_STOP_ON_FAILURE, true),
    poll_timeout_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS),
    poll_interval_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    post_file_wait_timeout_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_POST_FILE_WAIT_TIMEOUT_MS, DEFAULT_POST_FILE_WAIT_TIMEOUT_MS),
    post_file_wait_interval_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_POST_FILE_WAIT_INTERVAL_MS, DEFAULT_POST_FILE_WAIT_INTERVAL_MS),
    post_file_refresh_command: process.env.MIXLAB_ADMIN_PREPROCESS_WINDOW_POST_FILE_REFRESH_COMMAND,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    execution_mode: report.execution_mode,
    status: report.status,
    mutates_nas_files: report.mutates_nas_files,
    requested_count: report.summary.requested_count,
    attempted_batches: report.summary.attempted_batches,
    passed_batches: report.summary.passed_batches,
    failed_batches: report.summary.failed_batches,
    blockers: report.summary.blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.status === "failed") {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
