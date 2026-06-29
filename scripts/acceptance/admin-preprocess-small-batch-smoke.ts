import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AdminPreprocessSingleVideoSmokeReport,
  runAdminPreprocessSingleVideoSmoke
} from "./admin-preprocess-single-video-smoke.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";
const DEFAULT_MAX_COUNT = 5;
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POST_FILE_WAIT_TIMEOUT_MS = 180 * 1000;
const DEFAULT_POST_FILE_WAIT_INTERVAL_MS = 5000;

type BatchStatus = "dry-run-ready" | "passed" | "failed";

interface BatchItem {
  source_video_id: string;
  status: "dry-run-ready" | "passed" | "blocked" | "failed";
  dry_run_ready: boolean;
  single_video_smoke_passed: boolean;
  ready_video_count_after: number | null;
  processing_video_count_after: number | null;
  current_index_version_after: string;
  source_status_after: string;
  source_visible_after: boolean | null;
  direct_source_status: string;
  direct_job_status: string;
  direct_ready_count: number | null;
  direct_queued_count: number | null;
  direct_processing_count: number | null;
  direct_index_required_count: number | null;
  post_file_attempts: number;
  post_file_refresh_attempted: boolean;
  dry_run_blockers: string[];
  execute_blockers: string[];
  json_path: string;
  markdown_path: string;
}

export interface AdminPreprocessSmallBatchSmokeReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-preprocess-small-batch-smoke";
  execution_mode: "dry-run" | "execute";
  status: BatchStatus;
  mutates_nas_files: boolean;
  target: {
    base_url: string;
    source_video_ids: string[];
    expected_library_root: string;
    expected_ready_count: number;
    expected_index_version: string;
    max_count: number;
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
    attempted_count: number;
    passed_count: number;
    failed_count: number;
    stopped_on_failure: boolean;
    blockers: string[];
  };
  items: BatchItem[];
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

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function itemFromSingleReport(report: AdminPreprocessSingleVideoSmokeReport): BatchItem {
  return {
    source_video_id: report.target.source_video_id,
    status: report.result.status,
    dry_run_ready: report.dry_run_ready,
    single_video_smoke_passed: report.single_video_smoke_passed,
    ready_video_count_after: report.observed.ready_video_count_after,
    processing_video_count_after: report.observed.processing_video_count_after,
    current_index_version_after: report.observed.current_index_version_after,
    source_status_after: report.observed.source_status_after,
    source_visible_after: report.observed.source_visible_after,
    direct_source_status: asString(report.post_file_check.source_video_manifest.fields.preprocess_status),
    direct_job_status: asString(report.post_file_check.preprocess_job.fields.status),
    direct_ready_count: asNumber(report.post_file_check.library_manifest.fields.ready_video_count),
    direct_queued_count: asNumber(report.post_file_check.library_manifest.fields.queued_video_count),
    direct_processing_count: asNumber(report.post_file_check.library_manifest.fields.processing_video_count),
    direct_index_required_count: asNumber(report.post_file_check.library_manifest.fields.index_required_video_count),
    post_file_attempts: report.post_file_check.attempt_count,
    post_file_refresh_attempted: report.post_file_check.refresh_attempted,
    dry_run_blockers: [...report.summary.dry_run_blockers],
    execute_blockers: [...report.summary.execute_blockers],
    json_path: report.artifacts?.json_path ?? "",
    markdown_path: report.artifacts?.markdown_path ?? ""
  };
}

function buildStatus(input: {
  execute: boolean;
  requested_count: number;
  max_count: number;
  items: BatchItem[];
}): BatchStatus {
  if (input.requested_count === 0 || input.requested_count > input.max_count) {
    return "failed";
  }
  if (input.execute) {
    return input.items.length === input.requested_count &&
      input.items.every((item) => item.single_video_smoke_passed)
      ? "passed"
      : "failed";
  }
  return input.items.length === input.requested_count &&
    input.items.every((item) => item.dry_run_ready)
    ? "dry-run-ready"
    : "failed";
}

function buildBlockers(input: {
  source_video_ids: string[];
  max_count: number;
  items: BatchItem[];
  execute: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.source_video_ids.length === 0) {
    blockers.push("source-video-ids-required");
  }
  if (input.source_video_ids.length > input.max_count) {
    blockers.push("source-video-id-count-exceeds-max");
  }
  for (const item of input.items) {
    const itemBlockers = input.execute ? item.execute_blockers : item.dry_run_blockers;
    for (const blocker of itemBlockers) {
      blockers.push(`${item.source_video_id}:${blocker}`);
    }
  }
  return blockers;
}

function renderMarkdown(report: AdminPreprocessSmallBatchSmokeReport): string {
  const itemRows = report.items.map((item) => [
    item.source_video_id,
    item.status,
    String(item.dry_run_ready),
    String(item.single_video_smoke_passed),
    item.source_status_after || "n/a",
    String(item.ready_video_count_after),
    item.current_index_version_after || "n/a",
    String(item.direct_index_required_count),
    String(item.post_file_refresh_attempted),
    item.json_path
  ].join(" | "));

  return `# Admin Preprocess Small Batch Smoke

- Generated at: ${report.generated_at}
- Execution mode: ${report.execution_mode}
- Status: ${report.status}
- Mutates NAS files: ${String(report.mutates_nas_files)}
- Source videos: ${report.target.source_video_ids.join(", ") || "none"}
- Expected ready count: ${report.target.expected_ready_count}
- Expected index version: ${report.target.expected_index_version}
- Stop on failure: ${String(report.target.stop_on_failure)}
- Blockers: ${report.summary.blockers.join(", ") || "none"}

## Write Boundary

- Publish allowed: false
- Docker deploy allowed: false
- Automatic worker allowed: false
- Allowed POST paths: ${report.allowed_write_boundary.allowed_post_paths.join(", ") || "none"}

## Items

source_video_id | status | dry_run_ready | passed | source_after | ready_after | index_after | direct_index_required | refreshed | json
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
${itemRows.join("\n") || "none | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a"}
`;
}

async function writeArtifacts(input: {
  report: AdminPreprocessSmallBatchSmokeReport;
  output_dir?: string;
  date: Date;
}): Promise<AdminPreprocessSmallBatchSmokeReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });
  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-preprocess-small-batch-smoke-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-preprocess-small-batch-smoke-${stamp}.md`);
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

export async function runAdminPreprocessSmallBatchSmoke(input: {
  base_url?: string;
  source_video_ids?: string[];
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  session_token?: string;
  readiness_report_path?: string;
  library_mount_root?: string;
  execute?: boolean;
  max_count?: number;
  stop_on_failure?: boolean;
  poll_timeout_ms?: number;
  poll_interval_ms?: number;
  post_file_wait_timeout_ms?: number;
  post_file_wait_interval_ms?: number;
  post_file_refresh_command?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
  run_single_video_smoke?: typeof runAdminPreprocessSingleVideoSmoke;
} = {}): Promise<AdminPreprocessSmallBatchSmokeReport> {
  const date = input.date ?? new Date();
  const sourceVideoIds = input.source_video_ids ?? [];
  const maxCount = input.max_count ?? DEFAULT_MAX_COUNT;
  const execute = input.execute === true;
  const stopOnFailure = input.stop_on_failure ?? true;
  const runSingle = input.run_single_video_smoke ?? runAdminPreprocessSingleVideoSmoke;
  const items: BatchItem[] = [];

  if (sourceVideoIds.length > 0 && sourceVideoIds.length <= maxCount) {
    for (let index = 0; index < sourceVideoIds.length; index += 1) {
      const singleReport = await runSingle({
        base_url: input.base_url,
        source_video_id: sourceVideoIds[index],
        expected_library_root: input.expected_library_root,
        expected_ready_count: input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT,
        expected_index_version: input.expected_index_version ?? DEFAULT_EXPECTED_INDEX_VERSION,
        session_token: input.session_token,
        readiness_report_path: input.readiness_report_path,
        library_mount_root: input.library_mount_root,
        execute,
        poll_timeout_ms: input.poll_timeout_ms ?? DEFAULT_POLL_TIMEOUT_MS,
        poll_interval_ms: input.poll_interval_ms ?? DEFAULT_POLL_INTERVAL_MS,
        post_file_wait_timeout_ms: input.post_file_wait_timeout_ms ?? DEFAULT_POST_FILE_WAIT_TIMEOUT_MS,
        post_file_wait_interval_ms: input.post_file_wait_interval_ms ?? DEFAULT_POST_FILE_WAIT_INTERVAL_MS,
        post_file_refresh_command: input.post_file_refresh_command,
        output_dir: input.output_dir,
        command: `batch:${input.command ?? "tsx scripts/acceptance/admin-preprocess-small-batch-smoke.ts"}`,
        date: new Date(date.getTime() + (index + 1) * 1000)
      });
      const item = itemFromSingleReport(singleReport);
      items.push(item);

      const itemOk = execute ? item.single_video_smoke_passed : item.dry_run_ready;
      if (!itemOk && stopOnFailure) {
        break;
      }
    }
  }

  const status = buildStatus({
    execute,
    requested_count: sourceVideoIds.length,
    max_count: maxCount,
    items
  });
  const blockers = buildBlockers({
    source_video_ids: sourceVideoIds,
    max_count: maxCount,
    items,
    execute
  });
  const report: AdminPreprocessSmallBatchSmokeReport = {
    schema_version: "1.0",
    generated_at: date.toISOString(),
    command: input.command ?? "tsx scripts/acceptance/admin-preprocess-small-batch-smoke.ts",
    mode: "admin-preprocess-small-batch-smoke",
    execution_mode: execute ? "execute" : "dry-run",
    status,
    mutates_nas_files: execute,
    target: {
      base_url: optionalTrimmed(input.base_url),
      source_video_ids: sourceVideoIds,
      expected_library_root: optionalTrimmed(input.expected_library_root) || DEFAULT_EXPECTED_LIBRARY_ROOT,
      expected_ready_count: input.expected_ready_count ?? DEFAULT_EXPECTED_READY_COUNT,
      expected_index_version: optionalTrimmed(input.expected_index_version) || DEFAULT_EXPECTED_INDEX_VERSION,
      max_count: maxCount,
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
      attempted_count: items.length,
      passed_count: execute
        ? items.filter((item) => item.single_video_smoke_passed).length
        : items.filter((item) => item.dry_run_ready).length,
      failed_count: items.filter((item) => execute ? !item.single_video_smoke_passed : !item.dry_run_ready).length,
      stopped_on_failure: stopOnFailure && items.length < sourceVideoIds.length,
      blockers
    },
    items,
    artifacts: null
  };

  return writeArtifacts({
    report,
    output_dir: input.output_dir,
    date
  });
}

async function main(): Promise<void> {
  const report = await runAdminPreprocessSmallBatchSmoke({
    base_url: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_BASE_URL,
    source_video_ids: parseSourceVideoIds(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_SOURCE_VIDEO_IDS),
    expected_library_root: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parseExpectedReadyCount(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_EXPECT_READY_COUNT),
    expected_index_version: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_EXPECT_INDEX_VERSION,
    session_token: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_SESSION_TOKEN,
    readiness_report_path: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_READINESS_REPORT,
    library_mount_root: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_LIBRARY_MOUNT,
    execute: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_EXECUTE === "1",
    max_count: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_MAX_COUNT, DEFAULT_MAX_COUNT),
    stop_on_failure: parseBoolean(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_STOP_ON_FAILURE, true),
    poll_timeout_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS),
    poll_interval_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    post_file_wait_timeout_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_POST_FILE_WAIT_TIMEOUT_MS, DEFAULT_POST_FILE_WAIT_TIMEOUT_MS),
    post_file_wait_interval_ms: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_POST_FILE_WAIT_INTERVAL_MS, DEFAULT_POST_FILE_WAIT_INTERVAL_MS),
    post_file_refresh_command: process.env.MIXLAB_ADMIN_PREPROCESS_BATCH_POST_FILE_REFRESH_COMMAND,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    execution_mode: report.execution_mode,
    status: report.status,
    mutates_nas_files: report.mutates_nas_files,
    requested_count: report.summary.requested_count,
    attempted_count: report.summary.attempted_count,
    passed_count: report.summary.passed_count,
    failed_count: report.summary.failed_count,
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
