import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

type HttpMethod = "GET";

type ProbeName =
  | "auth_status"
  | "library_status"
  | "data_loading_plan"
  | "operation_log"
  | "restore_plan";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

interface ProbeDefinition {
  name: ProbeName;
  method: HttpMethod;
  path: string;
  timeout_ms: number;
  notes: string;
}

export interface ProbeResult {
  name: ProbeName;
  method: HttpMethod;
  path: string;
  duration_ms: number;
  http_status: number | null;
  ok: boolean;
  api_ok: boolean | null;
  response_bytes: number;
  data: unknown;
  error_code?: string;
  message?: string;
}

export interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface EnvironmentSummary {
  auth_mode: string;
  authenticated: boolean | null;
  library_root: string;
  library_updated_at: string;
  current_index_version: string;
  video_count: number | null;
  ready_video_count: number | null;
  processing_video_count: number | null;
  queued_video_count: number | null;
  index_required_video_count: number | null;
  failed_video_count: number | null;
}

interface DataLoadingContractSummary {
  restore_plan_endpoint_found: boolean;
  restore_plan_method: string;
  restore_plan_phase: string;
  restore_plan_scan_mode: string;
  restore_plan_data_source: string;
  restore_plan_refresh: string;
  restore_endpoint_found: boolean;
  restore_method: string;
  restore_phase: string;
  restore_scan_mode: string;
  restore_data_source: string;
  restore_refresh: string;
}

interface OperationLogSnapshotSummary {
  found: boolean;
  event_id: string;
  occurred_at: string;
  area: string;
  action: string;
  event_type: string;
  command: string;
  holder: string;
  snapshot_id: string;
  snapshot_kind: string;
  rollback_status: string;
  manifest_relative_path: string;
  captured_file_count: number | null;
  missing_file_count: number | null;
  skipped_file_count: number | null;
  failed_file_count: number | null;
}

interface RestorePlanSummary {
  can_restore: boolean | null;
  command: string;
  snapshot_id: string;
  snapshot_kind: string;
  file_count: number | null;
  restorable_file_count: number | null;
  blocked_file_count: number | null;
  blockers: string[];
  files: Array<{
    label: string;
    status: string;
    target_status: string;
    snapshot_status: string;
    source_relative_path: string;
  }>;
}

interface RestoreDrillPlan {
  mode: "plan-only";
  snapshot_id: string;
  ready_for_future_restore_drill: boolean;
  future_action: "separately-gated-post-restore" | "no-op";
  separate_execution_required: true;
  required_environment: Record<string, string>;
  allowed_future_request: string;
  forbidden_effects: string[];
  post_run_invariants: string[];
}

export interface RestoreDrillPlanReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "plan-only";
  api_base_url: string;
  expected_library_root: string;
  snapshot_id: string;
  operation_log_limit: number;
  max_file_count: number;
  requests: ProbeResult[];
  environment: EnvironmentSummary;
  data_loading_contract: DataLoadingContractSummary;
  operation_log_snapshot: OperationLogSnapshotSummary;
  restore_plan: RestorePlanSummary;
  restore_drill_plan: RestoreDrillPlan;
  gates: GateCheck[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3889";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_OPERATION_LOG_LIMIT = 100;
const DEFAULT_MAX_FILE_COUNT = 10;

export function buildProbeDefinitions(input: {
  snapshot_id: string;
  operation_log_limit: number;
}): ProbeDefinition[] {
  return [
    {
      name: "auth_status",
      method: "GET",
      path: "/api/admin/auth/status",
      timeout_ms: 5_000,
      notes: "Authentication mode and session visibility."
    },
    {
      name: "library_status",
      method: "GET",
      path: "/api/admin/library/status",
      timeout_ms: 8_000,
      notes: "Public-library root, counts and current index status."
    },
    {
      name: "data_loading_plan",
      method: "GET",
      path: "/api/admin/data-loading/plan",
      timeout_ms: 5_000,
      notes: "Machine-readable route and command loading contract."
    },
    {
      name: "operation_log",
      method: "GET",
      path: `/api/admin/operation-log?limit=${input.operation_log_limit}`,
      timeout_ms: 5_000,
      notes: "Bounded operation-log tail used to confirm the selected snapshot metadata."
    },
    {
      name: "restore_plan",
      method: "GET",
      path: `/api/admin/command-snapshots/${encodeURIComponent(input.snapshot_id)}/restore-plan`,
      timeout_ms: 8_000,
      notes: "Read-only restore safety plan for one selected command snapshot."
    }
  ];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}ms`;
}

function formatCount(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

async function requestJson(input: {
  api_base_url: string;
  definition: ProbeDefinition;
  session_token?: string;
}): Promise<ProbeResult> {
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (input.session_token) {
    headers["X-MixLab-Admin-Session-Token"] = input.session_token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.definition.timeout_ms);
  const started = performance.now();

  try {
    const response = await fetch(`${input.api_base_url}${input.definition.path}`, {
      method: input.definition.method,
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const envelope = envelopeFromJson(parsed);
    const apiOk = typeof envelope.ok === "boolean" ? envelope.ok : null;
    return {
      name: input.definition.name,
      method: input.definition.method,
      path: input.definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: response.status,
      ok: response.ok && apiOk !== false,
      api_ok: apiOk,
      response_bytes: Buffer.byteLength(text, "utf8"),
      data: envelope.data,
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined
    };
  } catch (error) {
    return {
      name: input.definition.name,
      method: input.definition.method,
      path: input.definition.path,
      duration_ms: roundMs(performance.now() - started),
      http_status: null,
      ok: false,
      api_ok: null,
      response_bytes: 0,
      data: null,
      error_code: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function dataFor(requests: ProbeResult[], name: ProbeName): unknown {
  return requests.find((request) => request.name === name)?.data ?? null;
}

function findEndpoint(dataLoadingPlan: unknown, endpointPath: string): Record<string, unknown> {
  const endpoints = Array.isArray(asRecord(dataLoadingPlan).endpoints)
    ? asRecord(dataLoadingPlan).endpoints as unknown[]
    : [];
  return asRecord(endpoints.find((endpoint) =>
    asString(asRecord(endpoint).endpoint) === endpointPath
  ));
}

function summarizeEnvironment(requests: ProbeResult[]): EnvironmentSummary {
  const auth = asRecord(dataFor(requests, "auth_status"));
  const library = asRecord(dataFor(requests, "library_status"));
  return {
    auth_mode: asString(auth.auth_mode),
    authenticated: asBoolean(auth.authenticated),
    library_root: asString(library.root_path),
    library_updated_at: asString(library.updated_at),
    current_index_version: asString(library.current_index_version),
    video_count: asNumber(library.video_count),
    ready_video_count: asNumber(library.ready_video_count),
    processing_video_count: asNumber(library.processing_video_count),
    queued_video_count: asNumber(library.queued_video_count),
    index_required_video_count: asNumber(library.index_required_video_count),
    failed_video_count: asNumber(library.failed_video_count)
  };
}

function summarizeDataLoadingContract(requests: ProbeResult[]): DataLoadingContractSummary {
  const dataLoadingPlan = dataFor(requests, "data_loading_plan");
  const restorePlan = findEndpoint(
    dataLoadingPlan,
    "/api/admin/command-snapshots/:snapshot_id/restore-plan"
  );
  const restore = findEndpoint(
    dataLoadingPlan,
    "/api/admin/command-snapshots/:snapshot_id/restore"
  );
  return {
    restore_plan_endpoint_found: Object.keys(restorePlan).length > 0,
    restore_plan_method: asString(restorePlan.method),
    restore_plan_phase: asString(restorePlan.phase),
    restore_plan_scan_mode: asString(restorePlan.scan_mode),
    restore_plan_data_source: asString(restorePlan.data_source),
    restore_plan_refresh: asString(restorePlan.refresh),
    restore_endpoint_found: Object.keys(restore).length > 0,
    restore_method: asString(restore.method),
    restore_phase: asString(restore.phase),
    restore_scan_mode: asString(restore.scan_mode),
    restore_data_source: asString(restore.data_source),
    restore_refresh: asString(restore.refresh)
  };
}

function commandSnapshotFromEvent(event: unknown): Record<string, unknown> {
  return asRecord(asRecord(asRecord(event).details).command_snapshot);
}

function summarizeOperationLogSnapshot(
  requests: ProbeResult[],
  snapshotId: string
): OperationLogSnapshotSummary {
  const operationLog = asRecord(dataFor(requests, "operation_log"));
  const events = Array.isArray(operationLog.events) ? operationLog.events : [];
  const event = asRecord(events.find((candidate) =>
    asString(commandSnapshotFromEvent(candidate).snapshot_id) === snapshotId
  ));
  const details = asRecord(event.details);
  const snapshot = asRecord(details.command_snapshot);

  return {
    found: Object.keys(event).length > 0,
    event_id: asString(event.event_id),
    occurred_at: asString(event.occurred_at),
    area: asString(event.area),
    action: asString(event.action),
    event_type: asString(event.event_type),
    command: asString(details.command),
    holder: asString(details.holder),
    snapshot_id: asString(snapshot.snapshot_id),
    snapshot_kind: asString(snapshot.snapshot_kind),
    rollback_status: asString(snapshot.rollback_status),
    manifest_relative_path: asString(snapshot.manifest_relative_path),
    captured_file_count: asNumber(snapshot.captured_file_count),
    missing_file_count: asNumber(snapshot.missing_file_count),
    skipped_file_count: asNumber(snapshot.skipped_file_count),
    failed_file_count: asNumber(snapshot.failed_file_count)
  };
}

function summarizeRestorePlan(requests: ProbeResult[]): RestorePlanSummary {
  const plan = asRecord(dataFor(requests, "restore_plan"));
  const files = Array.isArray(plan.files) ? plan.files : [];
  return {
    can_restore: asBoolean(plan.can_restore),
    command: asString(plan.command),
    snapshot_id: asString(plan.snapshot_id),
    snapshot_kind: asString(plan.snapshot_kind),
    file_count: asNumber(plan.file_count),
    restorable_file_count: asNumber(plan.restorable_file_count),
    blocked_file_count: asNumber(plan.blocked_file_count),
    blockers: asStringArray(plan.blockers),
    files: files.map((file) => {
      const record = asRecord(file);
      return {
        label: asString(record.label),
        status: asString(record.status),
        target_status: asString(record.target_status),
        snapshot_status: asString(record.snapshot_status),
        source_relative_path: asString(record.source_relative_path)
      };
    })
  };
}

function gate(name: string, passed: boolean, detail: string): GateCheck {
  return { name, passed, detail };
}

function futureForbiddenEffects(): string[] {
  return [
    "Do not run POST restore during this plan-only gate.",
    "Do not modify source-video manifests, preprocess-job files, library.json, release/index artifacts, or source media in this step.",
    "Do not requeue, rerun, delete, hide, or downline ready source videos.",
    "Do not start scan, apply, reconcile, repair, publish, queue, retry, cancel, or Docker commands.",
    "Do not change Cutter release/index/search protocols."
  ];
}

function futureInvariants(): string[] {
  return [
    "library.video_count stays unchanged across the future restore drill.",
    "library.ready_video_count stays unchanged across the future restore drill unless a separately approved restore target explicitly proves otherwise.",
    "library.updated_at is recorded before and after the future restore drill.",
    "current_index_version stays unchanged unless a separately approved release/index restore is the target.",
    "Cutter release/index/search smoke remains compatible after any future restore drill.",
    "A new command-snapshot-restore operation-log event is present after any future restore execution."
  ];
}

function buildRestoreDrillPlan(input: {
  api_base_url: string;
  snapshot_id: string;
  gates_passed: boolean;
}): RestoreDrillPlan {
  return {
    mode: "plan-only",
    snapshot_id: input.snapshot_id,
    ready_for_future_restore_drill: input.gates_passed,
    future_action: input.gates_passed ? "separately-gated-post-restore" : "no-op",
    separate_execution_required: true,
    required_environment: input.gates_passed
      ? {
          MIXLAB_ADMIN_API_BASE_URL: input.api_base_url,
          MIXLAB_ADMIN_RESTORE_SNAPSHOT_ID: input.snapshot_id,
          MIXLAB_ADMIN_RESTORE_ALLOW: "true"
        }
      : {},
    allowed_future_request: input.gates_passed
      ? `POST /api/admin/command-snapshots/${input.snapshot_id}/restore`
      : "",
    forbidden_effects: futureForbiddenEffects(),
    post_run_invariants: futureInvariants()
  };
}

export function buildGateChecks(input: {
  expected_library_root: string;
  max_file_count: number;
  snapshot_id: string;
  requests: ProbeResult[];
  environment: EnvironmentSummary;
  data_loading_contract: DataLoadingContractSummary;
  operation_log_snapshot: OperationLogSnapshotSummary;
  restore_plan: RestorePlanSummary;
}): GateCheck[] {
  const requestFailures = input.requests
    .filter((request) => !request.ok)
    .map((request) => `${request.name}:${request.http_status ?? request.error_code ?? "failed"}`);
  const noRestoreExecution = input.requests.every((request) =>
    request.method === "GET" &&
      !/\/command-snapshots\/[^/]+\/restore(?:$|\?)/.test(request.path) &&
      !/\/scan|\/apply|\/publish|\/repair|\/queue|\/retry|\/cancel|\/reconcile(?:$|\?)/.test(request.path)
  );
  const snapshotCapturedCleanly =
    input.operation_log_snapshot.snapshot_kind === "file-capture" &&
    (input.operation_log_snapshot.captured_file_count ?? 0) > 0 &&
    (input.operation_log_snapshot.missing_file_count ?? 0) === 0 &&
    (input.operation_log_snapshot.skipped_file_count ?? 0) === 0 &&
    (input.operation_log_snapshot.failed_file_count ?? 0) === 0;
  const restorePlanClean =
    input.restore_plan.can_restore === true &&
    (input.restore_plan.file_count ?? 0) > 0 &&
    input.restore_plan.restorable_file_count === input.restore_plan.file_count &&
    input.restore_plan.blocked_file_count === 0 &&
    input.restore_plan.blockers.length === 0;

  return [
    gate(
      "get-only-plan",
      noRestoreExecution,
      `requests=${input.requests.map((request) => `${request.method} ${request.path}`).join(", ")}`
    ),
    gate(
      "request-success",
      requestFailures.length === 0,
      requestFailures.length === 0 ? "all probe requests returned ok" : requestFailures.join(",")
    ),
    gate(
      "library-root",
      input.environment.library_root === input.expected_library_root,
      `root_path=${input.environment.library_root || "unknown"}, expected=${input.expected_library_root}`
    ),
    gate(
      "protected-invariants-recorded",
      input.environment.video_count !== null &&
        input.environment.ready_video_count !== null &&
        Boolean(input.environment.library_updated_at) &&
        Boolean(input.environment.current_index_version),
      `total=${formatCount(input.environment.video_count)}, ready=${formatCount(input.environment.ready_video_count)}, updated_at=${input.environment.library_updated_at || "unknown"}, index=${input.environment.current_index_version || "unknown"}`
    ),
    gate(
      "data-loading-contract",
      input.data_loading_contract.restore_plan_endpoint_found &&
        input.data_loading_contract.restore_plan_method === "GET" &&
        input.data_loading_contract.restore_plan_phase === "command" &&
        input.data_loading_contract.restore_plan_scan_mode === "no-scan" &&
        input.data_loading_contract.restore_plan_data_source === "command-snapshot" &&
        input.data_loading_contract.restore_endpoint_found &&
        input.data_loading_contract.restore_method === "POST" &&
        input.data_loading_contract.restore_phase === "command" &&
        input.data_loading_contract.restore_scan_mode === "no-scan" &&
        input.data_loading_contract.restore_data_source === "command-snapshot" &&
        input.data_loading_contract.restore_refresh === "command-only",
      `restore_plan=${input.data_loading_contract.restore_plan_method || "missing"}/${input.data_loading_contract.restore_plan_scan_mode || "unknown"}, restore=${input.data_loading_contract.restore_method || "missing"}/${input.data_loading_contract.restore_scan_mode || "unknown"}`
    ),
    gate(
      "snapshot-in-operation-log",
      input.operation_log_snapshot.found &&
        input.operation_log_snapshot.snapshot_id === input.snapshot_id &&
        Boolean(input.operation_log_snapshot.event_id),
      `snapshot_id=${input.operation_log_snapshot.snapshot_id || "missing"}, event_id=${input.operation_log_snapshot.event_id || "missing"}`
    ),
    gate(
      "file-capture-snapshot",
      snapshotCapturedCleanly,
      `kind=${input.operation_log_snapshot.snapshot_kind || "unknown"}, captured=${formatCount(input.operation_log_snapshot.captured_file_count)}, missing=${formatCount(input.operation_log_snapshot.missing_file_count)}, skipped=${formatCount(input.operation_log_snapshot.skipped_file_count)}, failed=${formatCount(input.operation_log_snapshot.failed_file_count)}`
    ),
    gate(
      "restore-plan-restorable",
      restorePlanClean,
      `can_restore=${String(input.restore_plan.can_restore)}, file_count=${formatCount(input.restore_plan.file_count)}, restorable=${formatCount(input.restore_plan.restorable_file_count)}, blocked=${formatCount(input.restore_plan.blocked_file_count)}, blockers=${input.restore_plan.blockers.join(",") || "none"}`
    ),
    gate(
      "bounded-file-count",
      input.restore_plan.file_count !== null &&
        input.restore_plan.file_count > 0 &&
        input.restore_plan.file_count <= input.max_file_count,
      `file_count=${formatCount(input.restore_plan.file_count)}, max=${input.max_file_count}`
    )
  ];
}

export function buildReport(input: {
  generated_at: string;
  api_base_url: string;
  expected_library_root: string;
  snapshot_id: string;
  operation_log_limit: number;
  max_file_count: number;
  requests: ProbeResult[];
}): RestoreDrillPlanReport {
  const environment = summarizeEnvironment(input.requests);
  const dataLoadingContract = summarizeDataLoadingContract(input.requests);
  const operationLogSnapshot = summarizeOperationLogSnapshot(input.requests, input.snapshot_id);
  const restorePlan = summarizeRestorePlan(input.requests);
  const gates = buildGateChecks({
    expected_library_root: input.expected_library_root,
    max_file_count: input.max_file_count,
    snapshot_id: input.snapshot_id,
    requests: input.requests,
    environment,
    data_loading_contract: dataLoadingContract,
    operation_log_snapshot: operationLogSnapshot,
    restore_plan: restorePlan
  });
  const passed = gates.every((check) => check.passed);
  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: "tsx scripts/acceptance/admin-command-restore-drill-plan.ts",
    mode: "plan-only",
    api_base_url: input.api_base_url,
    expected_library_root: input.expected_library_root,
    snapshot_id: input.snapshot_id,
    operation_log_limit: input.operation_log_limit,
    max_file_count: input.max_file_count,
    requests: input.requests,
    environment,
    data_loading_contract: dataLoadingContract,
    operation_log_snapshot: operationLogSnapshot,
    restore_plan: restorePlan,
    restore_drill_plan: buildRestoreDrillPlan({
      api_base_url: input.api_base_url,
      snapshot_id: input.snapshot_id,
      gates_passed: passed
    }),
    gates,
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed
        ? `plan-only restore drill gate passed for ${input.snapshot_id}; future POST restore still requires a separate destructive-action gate`
        : `failed gates: ${gates.filter((check) => !check.passed).map((check) => check.name).join(", ")}`
    }
  };
}

function renderGateRows(checks: GateCheck[]): string {
  return checks
    .map((check) => `| ${check.name} | ${check.passed ? "pass" : "fail"} | ${check.detail.replaceAll("|", "\\|")} |`)
    .join("\n");
}

function renderRequestRows(requests: ProbeResult[]): string {
  return requests
    .map((request) => `| ${request.name} | ${request.method} | \`${request.path}\` | ${request.http_status ?? "n/a"} | ${request.ok ? "ok" : "failed"} | ${formatMs(request.duration_ms)} | ${request.response_bytes} |`)
    .join("\n");
}

export function renderMarkdown(report: RestoreDrillPlanReport): string {
  return `# Admin Command Restore Drill Plan ${report.generated_at}

## Scope

This is a plan-only restore drill readiness report for one selected command snapshot. It is GET-only and does not call POST restore, scan, apply, reconcile, repair, publish, queue, retry, cancel, Docker upload, or Cutter protocol work.

## Candidate

- Snapshot id: \`${report.snapshot_id}\`
- API: \`${report.api_base_url}\`
- Expected library root: \`${report.expected_library_root}\`
- Operation-log limit: \`${report.operation_log_limit}\`
- Max file count: \`${report.max_file_count}\`
- Future action: \`${report.restore_drill_plan.future_action}\`
- Future request: \`${report.restore_drill_plan.allowed_future_request || "none"}\`

## Environment

- Actual library root: \`${report.environment.library_root || "unknown"}\`
- Auth mode: \`${report.environment.auth_mode || "unknown"}\`
- Authenticated: \`${String(report.environment.authenticated)}\`
- Current index: \`${report.environment.current_index_version || "unknown"}\`
- Library updated at: \`${report.environment.library_updated_at || "unknown"}\`
- Counts: total \`${formatCount(report.environment.video_count)}\`, ready \`${formatCount(report.environment.ready_video_count)}\`, queued \`${formatCount(report.environment.queued_video_count)}\`, processing \`${formatCount(report.environment.processing_video_count)}\`, index-required \`${formatCount(report.environment.index_required_video_count)}\`

## Data Loading Contract

- Restore plan endpoint: found \`${String(report.data_loading_contract.restore_plan_endpoint_found)}\`, method \`${report.data_loading_contract.restore_plan_method || "unknown"}\`, phase \`${report.data_loading_contract.restore_plan_phase || "unknown"}\`, scan mode \`${report.data_loading_contract.restore_plan_scan_mode || "unknown"}\`, source \`${report.data_loading_contract.restore_plan_data_source || "unknown"}\`
- Restore execution endpoint: found \`${String(report.data_loading_contract.restore_endpoint_found)}\`, method \`${report.data_loading_contract.restore_method || "unknown"}\`, phase \`${report.data_loading_contract.restore_phase || "unknown"}\`, scan mode \`${report.data_loading_contract.restore_scan_mode || "unknown"}\`, source \`${report.data_loading_contract.restore_data_source || "unknown"}\`, refresh \`${report.data_loading_contract.restore_refresh || "unknown"}\`

## Operation Log Snapshot

- Found: \`${String(report.operation_log_snapshot.found)}\`
- Event id: \`${report.operation_log_snapshot.event_id || "unknown"}\`
- Occurred at: \`${report.operation_log_snapshot.occurred_at || "unknown"}\`
- Action: \`${report.operation_log_snapshot.action || "unknown"}\`
- Command: \`${report.operation_log_snapshot.command || "unknown"}\`
- Snapshot kind: \`${report.operation_log_snapshot.snapshot_kind || "unknown"}\`
- Rollback status: \`${report.operation_log_snapshot.rollback_status || "unknown"}\`
- Manifest: \`${report.operation_log_snapshot.manifest_relative_path || "unknown"}\`
- Files: captured \`${formatCount(report.operation_log_snapshot.captured_file_count)}\`, missing \`${formatCount(report.operation_log_snapshot.missing_file_count)}\`, skipped \`${formatCount(report.operation_log_snapshot.skipped_file_count)}\`, failed \`${formatCount(report.operation_log_snapshot.failed_file_count)}\`

## Restore Plan

- Can restore: \`${String(report.restore_plan.can_restore)}\`
- Command: \`${report.restore_plan.command || "unknown"}\`
- Snapshot kind: \`${report.restore_plan.snapshot_kind || "unknown"}\`
- Files: total \`${formatCount(report.restore_plan.file_count)}\`, restorable \`${formatCount(report.restore_plan.restorable_file_count)}\`, blocked \`${formatCount(report.restore_plan.blocked_file_count)}\`
- Blockers: \`${report.restore_plan.blockers.join(", ") || "none"}\`

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
${renderGateRows(report.gates)}

## Requests

| Probe | Method | Path | HTTP | Result | Duration | Bytes |
| --- | --- | --- | --- | --- | --- | --- |
${renderRequestRows(report.requests)}

## Future Restore Drill Requirements

Required environment for any future destructive restore drill:

${Object.entries(report.restore_drill_plan.required_environment).map(([key, value]) => `- \`${key}=${value}\``).join("\n") || "- none; gates did not pass"}

Forbidden effects for this plan step:

${report.restore_drill_plan.forbidden_effects.map((effect) => `- ${effect}`).join("\n")}

Post-run invariants for any future restore execution:

${report.restore_drill_plan.post_run_invariants.map((invariant) => `- ${invariant}`).join("\n")}

## Result

- Status: \`${report.result.status}\`
- Summary: ${report.result.summary}
`;
}

async function writeReportFiles(report: RestoreDrillPlanReport, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const stamp = timestampForFile(new Date(report.generated_at));
  const baseName = `admin-command-restore-drill-plan-${stamp}`;
  await writeFile(path.join(outputDir, `${baseName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outputDir, `${baseName}.md`), renderMarkdown(report));
}

export async function runRestoreDrillPlan(input: {
  api_base_url: string;
  expected_library_root: string;
  snapshot_id: string;
  operation_log_limit: number;
  max_file_count: number;
  output_dir: string;
  session_token?: string;
}): Promise<RestoreDrillPlanReport> {
  const generatedAt = new Date().toISOString();
  const requests: ProbeResult[] = [];
  for (const definition of buildProbeDefinitions({
    snapshot_id: input.snapshot_id,
    operation_log_limit: input.operation_log_limit
  })) {
    requests.push(await requestJson({
      api_base_url: input.api_base_url,
      definition,
      session_token: input.session_token
    }));
  }
  const report = buildReport({
    generated_at: generatedAt,
    api_base_url: input.api_base_url,
    expected_library_root: input.expected_library_root,
    snapshot_id: input.snapshot_id,
    operation_log_limit: input.operation_log_limit,
    max_file_count: input.max_file_count,
    requests
  });
  await writeReportFiles(report, input.output_dir);
  return report;
}

async function main(): Promise<void> {
  const snapshotId = process.env.MIXLAB_ADMIN_RESTORE_SNAPSHOT_ID?.trim();
  if (!snapshotId) {
    throw new Error("MIXLAB_ADMIN_RESTORE_SNAPSHOT_ID is required for a restore drill plan.");
  }

  const report = await runRestoreDrillPlan({
    api_base_url: trimTrailingSlash(process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL),
    expected_library_root: process.env.MIXLAB_ADMIN_RESTORE_EXPECT_ROOT ?? DEFAULT_EXPECTED_LIBRARY_ROOT,
    snapshot_id: snapshotId,
    operation_log_limit: parsePositiveInt(
      process.env.MIXLAB_ADMIN_RESTORE_OPERATION_LOG_LIMIT,
      DEFAULT_OPERATION_LOG_LIMIT
    ),
    max_file_count: parsePositiveInt(
      process.env.MIXLAB_ADMIN_RESTORE_MAX_FILE_COUNT,
      DEFAULT_MAX_FILE_COUNT
    ),
    output_dir: process.env.MIXLAB_ADMIN_RESTORE_PLAN_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR,
    session_token: process.env.MIXLAB_ADMIN_SESSION_TOKEN
  });

  console.log(renderMarkdown(report));
  if (!report.result.passed) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
