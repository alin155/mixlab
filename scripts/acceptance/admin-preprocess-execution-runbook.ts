import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyLiveReadonlyTarget } from "./admin-docker-release-live-readonly.ts";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/data/PublicLibrary";
const DEFAULT_EXPECTED_READY_COUNT = 10471;
const DEFAULT_EXPECTED_INDEX_VERSION = "v010471";
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_COUNT = 10;
const DEFAULT_RUNNER_BASE_URL = "http://192.168.1.20:3799";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory = "scope" | "readiness" | "snapshot" | "execution" | "publish" | "cutter";

interface RunbookGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_runbook_ready: boolean;
  required_evidence?: string;
}

interface RunbookSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  runbook_blockers: string[];
}

export interface AdminPreprocessExecutionRunbookReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-preprocess-execution-runbook";
  runbook_ready: boolean;
  execution_allowed: false;
  mutates_nas_files: false;
  publish_allowed: false;
  docker_deploy_allowed: false;
  sources: {
    readiness_report: string;
  };
  target: {
    base_url: string;
    normalized_base_url: string;
    safe_to_probe: boolean;
    classification: string;
    source_video_ids: string[];
    expected_library_root: string;
    expected_ready_count_before: number;
    expected_index_version_before: string;
    expected_ready_count_after_publish: number;
    expected_index_version_after_publish: string;
    batch_size: number;
    max_count: number;
    runner_base_url: string;
    real_cut_query: string;
  };
  observations: {
    readiness_status: string;
    phase_0_1_readiness_ready: boolean | null;
    single_video_smoke_review_ready: boolean | null;
    ready_video_count: number | null;
    queued_video_count: number | null;
    processing_video_count: number | null;
    index_required_video_count: number | null;
    current_index_version: string;
    preprocess_safe_to_start: boolean | null;
    supervisor_state: string;
    windows_acceptance_status: string;
    cutter_visible_ready_count: number | null;
    cutter_release_version: string;
  };
  write_boundary: {
    runbook_only: true;
    allowed_execute_command: "validate:admin-preprocess-small-batch-smoke";
    allowed_publish_endpoint: "/api/admin/source-videos/:source_video_id/publish";
    forbidden_effects: string[];
  };
  runbook: {
    refresh_readiness: string;
    dry_run_batch: string;
    execute_batch: string;
    pre_publish_proof: string;
    publish_selected_sources: string[];
    windows_acceptance: string;
    real_cut_smoke: string;
    post_publish_proof: string;
    cutter_compatibility_proof: string;
  };
  gates: RunbookGate[];
  summary: RunbookSummary;
  result: {
    status: "ready-for-controlled-execution" | "blocked" | "failed";
    summary: string;
  };
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

function parseSourceVideoIds(value: string | undefined): string[] {
  return [...new Set((value ?? "")
    .split(/[,\s]+/u)
    .map((item) => item.trim())
    .filter(Boolean))];
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getPath(root: unknown, parts: string[]): unknown {
  let current: unknown = root;
  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function gate(input: RunbookGate): RunbookGate {
  return input;
}

function summarize(gates: RunbookGate[]): RunbookSummary {
  const blockers = gates
    .filter((item) => item.blocks_runbook_ready && item.status !== "pass")
    .map((item) => item.id);
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    runbook_blockers: blockers
  };
}

function shell(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function plannedIndexVersion(readyCount: number): string {
  return `v${String(readyCount).padStart(6, "0")}`;
}

function loadReadinessObservations(report: unknown): AdminPreprocessExecutionRunbookReport["observations"] {
  const root = asRecord(report);
  const observed = asRecord(root.observed);
  const result = asRecord(root.result);
  return {
    readiness_status: asString(result.status),
    phase_0_1_readiness_ready: asBoolean(root.phase_0_1_readiness_ready),
    single_video_smoke_review_ready: asBoolean(root.single_video_smoke_review_ready),
    ready_video_count: asNumber(observed.ready_video_count),
    queued_video_count: asNumber(observed.queued_video_count),
    processing_video_count: asNumber(observed.processing_video_count),
    index_required_video_count: asNumber(observed.index_required_video_count),
    current_index_version: asString(observed.current_index_version),
    preprocess_safe_to_start: asBoolean(observed.preprocess_safe_to_start),
    supervisor_state: asString(observed.supervisor_state),
    windows_acceptance_status: asString(observed.windows_acceptance_status),
    cutter_visible_ready_count: asNumber(observed.cutter_visible_ready_count),
    cutter_release_version: asString(observed.cutter_release_version)
  };
}

function envLines(values: Record<string, string | number>): string[] {
  return Object.entries(values).map(([key, value]) => `${key}=${shell(String(value))} \\`);
}

function buildRunbook(input: {
  base_url: string;
  source_video_ids: string[];
  expected_library_root: string;
  expected_ready_count_before: number;
  expected_index_version_before: string;
  expected_ready_count_after_publish: number;
  expected_index_version_after_publish: string;
  batch_size: number;
  max_count: number;
  readiness_report_path: string;
  runner_base_url: string;
  real_cut_query: string;
}): AdminPreprocessExecutionRunbookReport["runbook"] {
  const sourceIds = input.source_video_ids.join(",");
  const realCutSourceVideoId = input.source_video_ids[0] ?? "<selected-published-source-video-id>";
  const commonBatchEnv = {
    MIXLAB_ACCEPTANCE_OUTPUT_DIR: DEFAULT_OUTPUT_DIR,
    MIXLAB_ADMIN_PREPROCESS_BATCH_BASE_URL: input.base_url,
    MIXLAB_ADMIN_PREPROCESS_BATCH_SOURCE_VIDEO_IDS: sourceIds,
    MIXLAB_ADMIN_PREPROCESS_BATCH_EXPECT_LIBRARY_ROOT: input.expected_library_root,
    MIXLAB_ADMIN_PREPROCESS_BATCH_EXPECT_READY_COUNT: input.expected_ready_count_before,
    MIXLAB_ADMIN_PREPROCESS_BATCH_EXPECT_INDEX_VERSION: input.expected_index_version_before,
    MIXLAB_ADMIN_PREPROCESS_BATCH_SESSION_TOKEN: "<temporary-admin-session-token>",
    MIXLAB_ADMIN_PREPROCESS_BATCH_READINESS_REPORT: input.readiness_report_path,
    MIXLAB_ADMIN_PREPROCESS_BATCH_LIBRARY_MOUNT: "/Volumes/MixLab/PublicLibrary",
    MIXLAB_ADMIN_PREPROCESS_BATCH_MAX_COUNT: input.max_count,
    MIXLAB_ADMIN_PREPROCESS_BATCH_STOP_ON_FAILURE: "true",
    MIXLAB_ADMIN_PREPROCESS_BATCH_SNAPSHOT_READ_MODEL: "true"
  };
  const prePublishProofEnv = {
    MIXLAB_ACCEPTANCE_OUTPUT_DIR: DEFAULT_OUTPUT_DIR,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_BASE_URL: input.base_url,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SOURCE_VIDEO_IDS: sourceIds,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_PROOF_PHASE: "pre-publish",
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_LIBRARY_ROOT: input.expected_library_root,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_READY_COUNT: input.expected_ready_count_before,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_INDEX_VERSION: input.expected_index_version_before,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SESSION_TOKEN: "<temporary-admin-session-token>",
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_LIBRARY_MOUNT: "/Volumes/MixLab/PublicLibrary"
  };
  const postPublishProofEnv = {
    MIXLAB_ACCEPTANCE_OUTPUT_DIR: DEFAULT_OUTPUT_DIR,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_BASE_URL: input.base_url,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SOURCE_VIDEO_IDS: sourceIds,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_PROOF_PHASE: "post-publish",
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_LIBRARY_ROOT: input.expected_library_root,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_READY_COUNT: input.expected_ready_count_after_publish,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_EXPECT_INDEX_VERSION: input.expected_index_version_after_publish,
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_SESSION_TOKEN: "<temporary-admin-session-token>",
    MIXLAB_ADMIN_PREPROCESS_POST_BATCH_LIBRARY_MOUNT: "/Volumes/MixLab/PublicLibrary",
    MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT: "<windows_acceptance-report.json>",
    MIXLAB_CUTTER_REAL_CUT_REPORT: "<real_cut_smoke-report.json>"
  };

  return {
    refresh_readiness: [
      ...envLines({
        MIXLAB_ACCEPTANCE_OUTPUT_DIR: DEFAULT_OUTPUT_DIR,
        MIXLAB_ADMIN_PREPROCESS_READINESS_BASE_URL: input.base_url,
        MIXLAB_ADMIN_PREPROCESS_READINESS_EXPECT_LIBRARY_ROOT: input.expected_library_root,
        MIXLAB_ADMIN_PREPROCESS_READINESS_EXPECT_READY_COUNT: input.expected_ready_count_before,
        MIXLAB_ADMIN_PREPROCESS_READINESS_EXPECT_INDEX_VERSION: input.expected_index_version_before,
        MIXLAB_ADMIN_PREPROCESS_READINESS_SESSION_TOKEN: "<temporary-admin-session-token>",
        MIXLAB_ADMIN_WORKER_ENV_PROOF_REPORT: "<admin-worker-env-proof.json>",
        MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT: "<windows_acceptance-report.json>"
      }),
      "npm run validate:admin-preprocess-production-readiness -- --pretty false"
    ].join("\n"),
    dry_run_batch: [
      ...envLines({
        ...commonBatchEnv,
        MIXLAB_ADMIN_PREPROCESS_BATCH_EXECUTE: "0"
      }),
      "npm run validate:admin-preprocess-small-batch-smoke -- --pretty false"
    ].join("\n"),
    execute_batch: [
      ...envLines({
        ...commonBatchEnv,
        MIXLAB_ADMIN_PREPROCESS_BATCH_EXECUTE: "1"
      }),
      "npm run validate:admin-preprocess-small-batch-smoke -- --pretty false"
    ].join("\n"),
    pre_publish_proof: [
      ...envLines(prePublishProofEnv),
      "npm run validate:admin-preprocess-post-batch-proof -- --pretty false"
    ].join("\n"),
    publish_selected_sources: input.source_video_ids.map((sourceVideoId) => [
      `curl --noproxy '*' -sS -X POST ${shell(`${input.base_url}/api/admin/source-videos/${sourceVideoId}/publish`)} \\`,
      "  -H \"accept: application/json\" \\",
      "  -H \"X-MixLab-Admin-Session-Token: <temporary-admin-session-token>\""
    ].join("\n")),
    windows_acceptance: [
      `curl --noproxy '*' -sS -X POST ${shell(`${input.runner_base_url}/runs`)} -H "content-type: application/json" --data-raw '{\"suite\":\"windows_acceptance\",\"options\":{\"auth_credentials\":{\"username\":\"<cutter-username>\",\"password\":\"<cutter-password>\"}}}'`,
      "curl --noproxy '*' -sS '<runner-base-url>/runs/<windows_acceptance_run_id>/report' > '<windows_acceptance-report.json>'"
    ].join("\n"),
    real_cut_smoke: [
      `curl --noproxy '*' -sS -X POST ${shell(`${input.runner_base_url}/runs`)} -H "content-type: application/json" --data-raw '{\"suite\":\"real_cut_smoke\",\"options\":{\"query\":${JSON.stringify(input.real_cut_query)},\"source_video_id\":${JSON.stringify(realCutSourceVideoId)},\"cut_mode\":\"copy\",\"max_duration_ms\":1500,\"auth_credentials\":{\"username\":\"<cutter-username>\",\"password\":\"<cutter-password>\"}}}'`,
      "curl --noproxy '*' -sS '<runner-base-url>/runs/<real_cut_smoke_run_id>/report' > '<real_cut_smoke-report.json>'"
    ].join("\n"),
    post_publish_proof: [
      ...envLines(postPublishProofEnv),
      "npm run validate:admin-preprocess-post-batch-proof -- --pretty false"
    ].join("\n"),
    cutter_compatibility_proof: [
      ...envLines({
        MIXLAB_ACCEPTANCE_OUTPUT_DIR: DEFAULT_OUTPUT_DIR,
        MIXLAB_CUTTER_EXPECTED_READY_COUNT: input.expected_ready_count_after_publish,
        MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION: input.expected_index_version_after_publish,
        MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT: "<windows_acceptance-report.json>",
        MIXLAB_CUTTER_REAL_CUT_REPORT: "<real_cut_smoke-report.json>"
      }),
      "npm run validate:admin-cutter-compatibility-proof"
    ].join("\n")
  };
}

function renderMarkdown(report: AdminPreprocessExecutionRunbookReport): string {
  return `# Admin Preprocess Execution Runbook

Generated: ${report.generated_at}

Status: ${report.result.status}

Runbook ready: ${report.runbook_ready ? "yes" : "no"}

Execution allowed by this report: no

This report is plan-only. It reads an archived readiness report and writes local runbook artifacts. It does not start workers, publish sources, call Windows Runner, mutate NAS files, deploy Docker, or change Cutter protocols.

## Target

- Base URL: ${report.target.base_url || "not configured"}
- Source videos: ${report.target.source_video_ids.join(", ") || "none"}
- Before: ready=${report.target.expected_ready_count_before}, index=${report.target.expected_index_version_before}
- After publish target: ready=${report.target.expected_ready_count_after_publish}, index=${report.target.expected_index_version_after_publish}
- Batch size: ${report.target.batch_size}
- Max count: ${report.target.max_count}

## Gates

| Gate | Category | Status | Evidence | Required Evidence |
| --- | --- | --- | --- | --- |
${report.gates.map((item) => [
  item.id,
  item.category,
  item.status,
  item.evidence,
  item.required_evidence ?? "n/a"
].join(" | ")).join("\n")}

## Runbook

### Refresh Readiness

\`\`\`sh
${report.runbook.refresh_readiness}
\`\`\`

### Dry Run Batch

\`\`\`sh
${report.runbook.dry_run_batch}
\`\`\`

### Execute Batch

\`\`\`sh
${report.runbook.execute_batch}
\`\`\`

### Pre-Publish Proof

\`\`\`sh
${report.runbook.pre_publish_proof}
\`\`\`

### Publish Selected Sources

${report.runbook.publish_selected_sources.map((command) => `\`\`\`sh\n${command}\n\`\`\``).join("\n\n") || "none"}

### Windows Acceptance

\`\`\`sh
${report.runbook.windows_acceptance}
\`\`\`

### Real Cut Smoke

\`\`\`sh
${report.runbook.real_cut_smoke}
\`\`\`

### Post-Publish Proof

\`\`\`sh
${report.runbook.post_publish_proof}
\`\`\`

### Cutter Compatibility Proof

\`\`\`sh
${report.runbook.cutter_compatibility_proof}
\`\`\`

## Artifacts

- JSON: ${report.artifacts?.json_path ?? "not written"}
- Markdown: ${report.artifacts?.markdown_path ?? "not written"}
`;
}

async function writeArtifacts(input: {
  report: AdminPreprocessExecutionRunbookReport;
  output_dir?: string;
  date: Date;
}): Promise<AdminPreprocessExecutionRunbookReport> {
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  await mkdir(outputDir, { recursive: true });
  const stamp = timestampForFile(input.date);
  const jsonPath = path.join(outputDir, `admin-preprocess-execution-runbook-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-preprocess-execution-runbook-${stamp}.md`);
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

export async function runAdminPreprocessExecutionRunbook(input: {
  readiness_report_path?: string;
  base_url?: string;
  source_video_ids?: string[];
  expected_library_root?: string;
  expected_ready_count?: number;
  expected_index_version?: string;
  batch_size?: number;
  max_count?: number;
  runner_base_url?: string;
  real_cut_query?: string;
  output_dir?: string;
  command?: string;
  date?: Date;
} = {}): Promise<AdminPreprocessExecutionRunbookReport> {
  const date = input.date ?? new Date();
  const readinessPath = optionalTrimmed(input.readiness_report_path);
  const readiness = readinessPath
    ? JSON.parse(await readFile(readinessPath, "utf8")) as unknown
    : {};
  const observations = loadReadinessObservations(readiness);
  const readinessTarget = asRecord(asRecord(readiness).target);
  const sourceVideoIds = input.source_video_ids ?? [];
  const expectedLibraryRoot = optionalTrimmed(input.expected_library_root) ||
    asString(readinessTarget.expected_library_root) ||
    DEFAULT_EXPECTED_LIBRARY_ROOT;
  const expectedReadyBefore = input.expected_ready_count ??
    observations.ready_video_count ??
    DEFAULT_EXPECTED_READY_COUNT;
  const expectedIndexBefore = optionalTrimmed(input.expected_index_version) ||
    observations.current_index_version ||
    DEFAULT_EXPECTED_INDEX_VERSION;
  const expectedReadyAfterPublish = expectedReadyBefore + sourceVideoIds.length;
  const expectedIndexAfterPublish = plannedIndexVersion(expectedReadyAfterPublish);
  const baseUrl = optionalTrimmed(input.base_url) ||
    asString(readinessTarget.base_url);
  const classification = classifyLiveReadonlyTarget(baseUrl);
  const batchSize = input.batch_size ?? DEFAULT_BATCH_SIZE;
  const maxCount = input.max_count ?? DEFAULT_MAX_COUNT;
  const runnerBaseUrl = optionalTrimmed(input.runner_base_url) || DEFAULT_RUNNER_BASE_URL;
  const realCutQuery = optionalTrimmed(input.real_cut_query) || "<query matching one selected published source>";
  const runbook = buildRunbook({
    base_url: baseUrl,
    source_video_ids: sourceVideoIds,
    expected_library_root: expectedLibraryRoot,
    expected_ready_count_before: expectedReadyBefore,
    expected_index_version_before: expectedIndexBefore,
    expected_ready_count_after_publish: expectedReadyAfterPublish,
    expected_index_version_after_publish: expectedIndexAfterPublish,
    batch_size: batchSize,
    max_count: maxCount,
    readiness_report_path: readinessPath || "<readiness-report.json>",
    runner_base_url: runnerBaseUrl,
    real_cut_query: realCutQuery
  });
  const duplicateCount = sourceVideoIds.length - new Set(sourceVideoIds).size;
  const readinessReady = observations.readiness_status === "ready-for-single-video-review" &&
    observations.phase_0_1_readiness_ready === true &&
    observations.single_video_smoke_review_ready === true;
  const baselineOk = observations.ready_video_count === expectedReadyBefore &&
    observations.current_index_version === expectedIndexBefore &&
    observations.processing_video_count === 0;
  const cutterOk = observations.windows_acceptance_status === "passed" &&
    observations.cutter_visible_ready_count === expectedReadyBefore &&
    observations.cutter_release_version === expectedIndexBefore;
  const gates = [
    gate({
      id: "readiness-report-provided",
      title: "Readiness report is provided",
      category: "readiness",
      status: readinessPath ? "pass" : "blocked",
      evidence: readinessPath || "MIXLAB_ADMIN_PREPROCESS_RUNBOOK_READINESS_REPORT is not set.",
      blocks_runbook_ready: true,
      required_evidence: readinessPath ? undefined : "Provide the latest admin-preprocess-production-readiness JSON report."
    }),
    gate({
      id: "readiness-report-ready",
      title: "Readiness report is ready for single-video review",
      category: "readiness",
      status: readinessReady ? "pass" : readinessPath ? "blocked" : "blocked",
      evidence: `status=${observations.readiness_status || "unknown"}, phase_0_1=${String(observations.phase_0_1_readiness_ready)}, single_video_review=${String(observations.single_video_smoke_review_ready)}.`,
      blocks_runbook_ready: true,
      required_evidence: readinessReady ? undefined : "Refresh readiness until it returns ready-for-single-video-review."
    }),
    gate({
      id: "nas-admin-target",
      title: "Runbook targets NAS Docker Admin",
      category: "scope",
      status: classification.safe_to_probe ? "pass" : "blocked",
      evidence: classification.evidence,
      blocks_runbook_ready: true,
      required_evidence: classification.safe_to_probe ? undefined : "Use the NAS Docker Admin base URL, not localhost or NAS desktop."
    }),
    gate({
      id: "source-video-ids-explicit-and-bounded",
      title: "Source video ids are explicit and bounded",
      category: "scope",
      status: sourceVideoIds.length > 0 && sourceVideoIds.length <= maxCount && duplicateCount === 0 ? "pass" : "blocked",
      evidence: `source_video_ids=${sourceVideoIds.join(", ") || "none"}, count=${sourceVideoIds.length}, max_count=${maxCount}, duplicate_count=${duplicateCount}.`,
      blocks_runbook_ready: true,
      required_evidence: "Provide 1-10 explicit queued source ids for the controlled runbook."
    }),
    gate({
      id: "pre-execution-baseline-preserved",
      title: "Pre-execution ready/index baseline is preserved",
      category: "readiness",
      status: baselineOk ? "pass" : readinessPath ? "fail" : "blocked",
      evidence: `ready=${String(observations.ready_video_count)}, processing=${String(observations.processing_video_count)}, index=${observations.current_index_version || "unknown"}.`,
      blocks_runbook_ready: true,
      required_evidence: baselineOk ? undefined : `Expected ready=${expectedReadyBefore}, processing=0, index=${expectedIndexBefore}.`
    }),
    gate({
      id: "preprocess-runtime-safe",
      title: "Preprocess runtime is safe to start",
      category: "execution",
      status: observations.preprocess_safe_to_start === true && observations.supervisor_state === "idle" ? "pass" : readinessPath ? "blocked" : "blocked",
      evidence: `safe_to_start=${String(observations.preprocess_safe_to_start)}, supervisor=${observations.supervisor_state || "unknown"}.`,
      blocks_runbook_ready: true,
      required_evidence: "Readiness must show safe_to_start=true and supervisor idle."
    }),
    gate({
      id: "windows-cutter-baseline-preserved",
      title: "Windows Cutter baseline is preserved before execution",
      category: "cutter",
      status: cutterOk ? "pass" : readinessPath ? "blocked" : "blocked",
      evidence: `windows=${observations.windows_acceptance_status || "unknown"}, visible_ready=${String(observations.cutter_visible_ready_count)}, release=${observations.cutter_release_version || "unknown"}.`,
      blocks_runbook_ready: true,
      required_evidence: "Readiness must be backed by Windows acceptance for the current ready/index baseline."
    }),
    gate({
      id: "pre-smoke-snapshot-command-present",
      title: "Runbook preserves pre-smoke snapshot requirement",
      category: "snapshot",
      status: runbook.execute_batch.includes("MIXLAB_ADMIN_PREPROCESS_BATCH_SNAPSHOT_READ_MODEL") &&
        runbook.execute_batch.includes("MIXLAB_ADMIN_PREPROCESS_BATCH_LIBRARY_MOUNT")
        ? "pass"
        : "blocked",
      evidence: "Execute command routes through small-batch smoke with snapshot_read_model=true and library mount configured.",
      blocks_runbook_ready: true
    }),
    gate({
      id: "execution-command-is-explicit",
      title: "Execution command is explicit and bounded",
      category: "execution",
      status: runbook.execute_batch.includes("MIXLAB_ADMIN_PREPROCESS_BATCH_EXECUTE=\"1\"") &&
        runbook.execute_batch.includes(`MIXLAB_ADMIN_PREPROCESS_BATCH_SOURCE_VIDEO_IDS=${shell(sourceVideoIds.join(","))}`) &&
        runbook.execute_batch.includes(`MIXLAB_ADMIN_PREPROCESS_BATCH_MAX_COUNT=${shell(String(maxCount))}`)
        ? "pass"
        : "blocked",
      evidence: "Execution command requires EXECUTE=1, explicit selected ids, max count, and temporary session placeholder.",
      blocks_runbook_ready: true
    }),
    gate({
      id: "publish-and-post-publish-proof-command-present",
      title: "Runbook includes publish and post-publish proof",
      category: "publish",
      status: runbook.publish_selected_sources.length === sourceVideoIds.length &&
        runbook.post_publish_proof.includes("MIXLAB_ADMIN_PREPROCESS_POST_BATCH_PROOF_PHASE=\"post-publish\"") &&
        runbook.post_publish_proof.includes("MIXLAB_CUTTER_REAL_CUT_REPORT")
        ? "pass"
        : "blocked",
      evidence: `publish_commands=${runbook.publish_selected_sources.length}, post_publish_expected_ready=${expectedReadyAfterPublish}, post_publish_expected_index=${expectedIndexAfterPublish}.`,
      blocks_runbook_ready: true,
      required_evidence: "Post-publish proof must require Windows acceptance and real_cut_smoke for one selected published source."
    })
  ];
  const summary = summarize(gates);
  const status = summary.failed > 0 ? "failed" : summary.runbook_blockers.length === 0 ? "ready-for-controlled-execution" : "blocked";
  const report: AdminPreprocessExecutionRunbookReport = {
    schema_version: "1.0",
    generated_at: date.toISOString(),
    command: input.command ?? "tsx scripts/acceptance/admin-preprocess-execution-runbook.ts",
    mode: "admin-preprocess-execution-runbook",
    runbook_ready: status === "ready-for-controlled-execution",
    execution_allowed: false,
    mutates_nas_files: false,
    publish_allowed: false,
    docker_deploy_allowed: false,
    sources: {
      readiness_report: readinessPath
    },
    target: {
      base_url: baseUrl,
      normalized_base_url: classification.normalized_base_url,
      safe_to_probe: classification.safe_to_probe,
      classification: classification.evidence,
      source_video_ids: sourceVideoIds,
      expected_library_root: expectedLibraryRoot,
      expected_ready_count_before: expectedReadyBefore,
      expected_index_version_before: expectedIndexBefore,
      expected_ready_count_after_publish: expectedReadyAfterPublish,
      expected_index_version_after_publish: expectedIndexAfterPublish,
      batch_size: batchSize,
      max_count: maxCount,
      runner_base_url: runnerBaseUrl,
      real_cut_query: realCutQuery
    },
    observations,
    write_boundary: {
      runbook_only: true,
      allowed_execute_command: "validate:admin-preprocess-small-batch-smoke",
      allowed_publish_endpoint: "/api/admin/source-videos/:source_video_id/publish",
      forbidden_effects: [
        "This runbook command does not execute preprocessing.",
        "This runbook command does not publish source videos.",
        "This runbook command does not call Windows Runner.",
        "This runbook command does not deploy Docker.",
        "This runbook command does not mutate NAS files."
      ]
    },
    runbook,
    gates,
    summary,
    result: {
      status,
      summary: status === "ready-for-controlled-execution"
        ? "Controlled preprocess execution runbook is ready. Execute commands remain separate, explicit, and proof-gated."
        : status === "failed"
          ? "Controlled preprocess execution runbook failed because a hard baseline invariant drifted."
          : "Controlled preprocess execution runbook is blocked until the listed evidence is available."
    },
    artifacts: null
  };

  return writeArtifacts({
    report,
    output_dir: input.output_dir,
    date
  });
}

async function main(): Promise<void> {
  const report = await runAdminPreprocessExecutionRunbook({
    readiness_report_path: process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_READINESS_REPORT,
    base_url: process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_BASE_URL,
    source_video_ids: parseSourceVideoIds(process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_SOURCE_VIDEO_IDS),
    expected_library_root: process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_EXPECT_LIBRARY_ROOT,
    expected_ready_count: parseOptionalPositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_EXPECT_READY_COUNT),
    expected_index_version: process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_EXPECT_INDEX_VERSION,
    batch_size: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    max_count: parsePositiveInteger(process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_MAX_COUNT, DEFAULT_MAX_COUNT),
    runner_base_url: process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_RUNNER_BASE_URL,
    real_cut_query: process.env.MIXLAB_ADMIN_PREPROCESS_RUNBOOK_REAL_CUT_QUERY,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    runbook_ready: report.runbook_ready,
    execution_allowed: report.execution_allowed,
    mutates_nas_files: report.mutates_nas_files,
    source_video_ids: report.target.source_video_ids,
    runbook_blockers: report.summary.runbook_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));

  if (report.result.status !== "ready-for-controlled-execution") {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
