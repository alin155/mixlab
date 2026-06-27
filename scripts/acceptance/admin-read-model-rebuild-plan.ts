import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

type HttpMethod = "GET";

type ProbeName =
  | "auth_status"
  | "library_status"
  | "read_model_status"
  | "reconcile_status"
  | "process_history_readiness"
  | "process_history";

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

interface ProjectionReadinessSummary {
  status: string;
  reason: string;
  scan_mode: string;
  requires_background_reconcile: boolean | null;
  safe_for_page_request: boolean | null;
  video_count: number | null;
  current_video_count: number | null;
}

interface EnvironmentSummary {
  auth_mode: string;
  authenticated: boolean | null;
  library_root: string;
  library_updated_at: string;
  current_index_version: string;
  video_count: number | null;
  ready_video_count: number | null;
  queued_video_count: number | null;
  processing_video_count: number | null;
  failed_video_count: number | null;
  index_required_video_count: number | null;
  disk_available_bytes: number | null;
  disk_total_bytes: number | null;
  admin_read_model: {
    storage: string;
    exists: boolean | null;
    freshness: string;
    video_count: number | null;
    store_path: string;
    reconciliation_action: string;
    reconciliation_reason: string;
    reconciliation_scan_mode: string;
    safe_for_page_request: boolean | null;
    projections: {
      material_summary: ProjectionReadinessSummary;
      production_summary: ProjectionReadinessSummary;
      process_history: ProjectionReadinessSummary;
    };
  };
}

interface ProcessHistoryReadinessSummary {
  ready: boolean | null;
  reason: string;
  last_error: string;
  actual_data_source: string;
  scan_mode: string;
  expected_job_snapshot_rows: number | null;
  snapshot_complete: boolean | null;
  snapshot_metadata_row_count: number | null;
  snapshot_table_row_count: number | null;
}

interface CurrentProcessHistorySummary {
  status: "hit" | "safe-miss" | "unexpected" | "unavailable";
  available: boolean | null;
  actual_data_source: string;
  cache_status: string;
  scan_mode: string;
  returned_count: number | null;
}

interface RebuildPlan {
  mode: "plan-only";
  needed: boolean;
  planned_action: "no-op" | "force-rebuild-derived-admin-read-model";
  reason: string;
  separate_execution_required: true;
  runner: "scripts/acceptance/admin-read-model-reconcile.ts";
  required_environment: Record<string, string>;
  allowed_mutation_paths: string[];
  forbidden_effects: string[];
  post_run_invariants: string[];
}

export interface RebuildPlanReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "plan-only";
  api_base_url: string;
  expected_library_root: string;
  min_disk_available_bytes: number;
  requests: ProbeResult[];
  environment: EnvironmentSummary;
  reconcile_status: {
    status: string;
    phase: string;
  };
  process_history_readiness: ProcessHistoryReadinessSummary;
  current_process_history: CurrentProcessHistorySummary;
  rebuild_plan: RebuildPlan;
  gates: GateCheck[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3889";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_MIN_DISK_AVAILABLE_BYTES = 1024 * 1024 * 1024;

export function buildProbeDefinitions(): ProbeDefinition[] {
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
      notes: "Public-library root, counts, disk, and current index status."
    },
    {
      name: "read_model_status",
      method: "GET",
      path: "/api/admin/read-model/status",
      timeout_ms: 8_000,
      notes: "No-scan Admin read-model freshness and page-safety status."
    },
    {
      name: "reconcile_status",
      method: "GET",
      path: "/api/admin/read-model/reconcile/status",
      timeout_ms: 5_000,
      notes: "Read-only background reconciler status."
    },
    {
      name: "process_history_readiness",
      method: "GET",
      path: "/api/admin/preprocess/process-history/readiness",
      timeout_ms: 5_000,
      notes: "No-scan readiness reason for process-history rows."
    },
    {
      name: "process_history",
      method: "GET",
      path: "/api/admin/preprocess/process-history?limit=20&window_days=30",
      timeout_ms: 20_000,
      notes: "Current route-owned process-history response."
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

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatBytes(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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

function adminReadModel(readModelStatus: unknown): Record<string, unknown> {
  return asRecord(asRecord(readModelStatus).admin_read_model);
}

function reconciliation(readModelStatus: unknown): Record<string, unknown> {
  return asRecord(adminReadModel(readModelStatus).reconciliation);
}

function summarizeProjection(readModel: Record<string, unknown>, name: string): ProjectionReadinessSummary {
  const projection = asRecord(asRecord(readModel.projections)[name]);
  return {
    status: asString(projection.status) || "unavailable",
    reason: asString(projection.reason) || "missing_projection_status",
    scan_mode: asString(projection.scan_mode) || "no-scan",
    requires_background_reconcile: asBoolean(projection.requires_background_reconcile),
    safe_for_page_request: asBoolean(projection.safe_for_page_request),
    video_count: asNumber(projection.video_count),
    current_video_count: asNumber(projection.current_video_count)
  };
}

function summarizeEnvironment(requests: ProbeResult[]): EnvironmentSummary {
  const auth = asRecord(dataFor(requests, "auth_status"));
  const library = asRecord(dataFor(requests, "library_status"));
  const readModelStatus = dataFor(requests, "read_model_status");
  const readModel = adminReadModel(readModelStatus);
  const reconcile = reconciliation(readModelStatus);
  return {
    auth_mode: asString(auth.auth_mode),
    authenticated: asBoolean(auth.authenticated),
    library_root: asString(library.root_path),
    library_updated_at: asString(library.updated_at),
    current_index_version: asString(library.current_index_version),
    video_count: asNumber(library.video_count),
    ready_video_count: asNumber(library.ready_video_count),
    queued_video_count: asNumber(library.queued_video_count),
    processing_video_count: asNumber(library.processing_video_count),
    failed_video_count: asNumber(library.failed_video_count),
    index_required_video_count: asNumber(library.index_required_video_count),
    disk_available_bytes: asNumber(library.disk_available_bytes),
    disk_total_bytes: asNumber(library.disk_total_bytes),
    admin_read_model: {
      storage: asString(readModel.storage),
      exists: asBoolean(readModel.exists),
      freshness: asString(readModel.freshness),
      video_count: asNumber(readModel.video_count),
      store_path: asString(readModel.path),
      reconciliation_action: asString(reconcile.action),
      reconciliation_reason: asString(reconcile.reason),
      reconciliation_scan_mode: asString(reconcile.scan_mode),
      safe_for_page_request: asBoolean(reconcile.safe_for_page_request),
      projections: {
        material_summary: summarizeProjection(readModel, "material_summary"),
        production_summary: summarizeProjection(readModel, "production_summary"),
        process_history: summarizeProjection(readModel, "process_history")
      }
    }
  };
}

function summarizeReadiness(requests: ProbeResult[]): ProcessHistoryReadinessSummary {
  const readiness = asRecord(dataFor(requests, "process_history_readiness"));
  return {
    ready: asBoolean(readiness.ready_for_process_history),
    reason: asString(readiness.reason),
    last_error: asString(readiness.last_error),
    actual_data_source: asString(readiness.actual_data_source),
    scan_mode: asString(readiness.scan_mode),
    expected_job_snapshot_rows: asNumber(readiness.expected_job_snapshot_rows),
    snapshot_complete: asBoolean(readiness.snapshot_complete),
    snapshot_metadata_row_count: asNumber(readiness.snapshot_metadata_row_count),
    snapshot_table_row_count: asNumber(readiness.snapshot_table_row_count)
  };
}

function summarizeCurrentHistory(requests: ProbeResult[]): CurrentProcessHistorySummary {
  const history = asRecord(dataFor(requests, "process_history"));
  const summary = asRecord(history.summary);
  const available = asBoolean(history.history_available);
  const actualDataSource = asString(history.actual_data_source);
  const cacheStatus = asString(history.cache_status);
  const scanMode = asString(history.scan_mode);
  const status = actualDataSource === "admin-read-model" && scanMode === "no-scan"
    ? available === true && cacheStatus === "hit"
      ? "hit"
      : available === false && cacheStatus === "miss"
        ? "safe-miss"
        : "unexpected"
    : "unavailable";
  return {
    status,
    available,
    actual_data_source: actualDataSource,
    cache_status: cacheStatus,
    scan_mode: scanMode,
    returned_count: asNumber(summary.returned_count)
  };
}

function summarizeReconcileStatus(requests: ProbeResult[]): RebuildPlanReport["reconcile_status"] {
  const status = asRecord(dataFor(requests, "reconcile_status"));
  return {
    status: asString(status.status),
    phase: asString(status.phase)
  };
}

function gate(name: string, passed: boolean, detail: string): GateCheck {
  return { name, passed, detail };
}

function rebuildNeeded(readiness: ProcessHistoryReadinessSummary): boolean {
  return readiness.ready !== true;
}

function projectionRebuildReasons(environment: EnvironmentSummary): string[] {
  return Object.entries(environment.admin_read_model.projections)
    .filter(([, projection]) =>
      projection.requires_background_reconcile === true ||
        projection.status === "missing" ||
        projection.status === "incomplete" ||
        projection.status === "stale"
    )
    .map(([name, projection]) =>
      `projection_incomplete:${name}:${projection.reason || projection.status || "unknown"}`
    );
}

function rebuildReason(input: {
  environment: EnvironmentSummary;
  readiness: ProcessHistoryReadinessSummary;
}): string {
  const reasons = [
    ...(input.readiness.ready !== true
      ? [`process_history:${input.readiness.reason || "unknown"}`]
      : []),
    ...projectionRebuildReasons(input.environment)
  ];
  return reasons.length > 0 ? reasons.join("; ") : input.readiness.reason || "ready";
}

function allowedReadModelPaths(environment: EnvironmentSummary): string[] {
  const storePath = environment.admin_read_model.store_path ||
    `${environment.library_root}/.mixlab-library/admin-read-model/admin.sqlite`;
  return [
    storePath,
    path.posix.join(path.posix.dirname(storePath.replaceAll("\\", "/")), "admin.sqlite-*"),
    path.posix.dirname(storePath.replaceAll("\\", "/"))
  ];
}

function allowedOperationLogPaths(environment: EnvironmentSummary): string[] {
  const libraryRoot = environment.library_root || DEFAULT_EXPECTED_LIBRARY_ROOT;
  return [
    path.posix.join(libraryRoot.replaceAll("\\", "/"), ".mixlab-library", "admin", "operation-log", "events.ndjson")
  ];
}

function buildRebuildPlan(input: {
  api_base_url: string;
  expected_library_root: string;
  environment: EnvironmentSummary;
  readiness: ProcessHistoryReadinessSummary;
}): RebuildPlan {
  const needed = rebuildNeeded(input.readiness) || projectionRebuildReasons(input.environment).length > 0;
  const reason = rebuildReason(input);
  return {
    mode: "plan-only",
    needed,
    planned_action: needed ? "force-rebuild-derived-admin-read-model" : "no-op",
    reason,
    separate_execution_required: true,
    runner: "scripts/acceptance/admin-read-model-reconcile.ts",
    required_environment: needed
      ? {
          MIXLAB_ADMIN_API_BASE_URL: input.api_base_url,
          MIXLAB_ADMIN_READ_MODEL_EXPECT_ROOT: input.expected_library_root,
          MIXLAB_ADMIN_READ_MODEL_RECONCILE_ALLOW: "true",
          MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE: "true"
        }
      : {},
    allowed_mutation_paths: needed
      ? [
          ...allowedReadModelPaths(input.environment),
          ...allowedOperationLogPaths(input.environment)
        ]
      : [],
    forbidden_effects: [
      "Do not modify source-video manifests.",
      "Do not modify library.json counts or library.updated_at.",
      "Do not modify release/index artifacts or Cutter release/search protocols.",
      "Do not requeue, rerun, delete, hide, or downline ready source videos.",
      "Do not upload Docker images or change NAS container configuration in this step.",
      "Do not use operation-log audit entries as a business-state source of truth."
    ],
    post_run_invariants: [
      "library.video_count stays unchanged.",
      "library.ready_video_count stays unchanged.",
      "library.updated_at stays unchanged.",
      "current_index_version stays unchanged.",
      "admin-read-model freshness becomes fresh and safe_for_page_request remains true.",
      "dashboard material, dashboard production, and process-history projections become ready or the follow-up run is treated as failed.",
      "process-history readiness becomes ready or the follow-up run is treated as failed."
    ]
  };
}

export function buildGateChecks(input: {
  expected_library_root: string;
  min_disk_available_bytes: number;
  requests: ProbeResult[];
  environment: EnvironmentSummary;
  reconcile_status: RebuildPlanReport["reconcile_status"];
  readiness: ProcessHistoryReadinessSummary;
  current_history: CurrentProcessHistorySummary;
  rebuild_plan: RebuildPlan;
}): GateCheck[] {
  const requestFailures = input.requests
    .filter((request) => !request.ok)
    .map((request) => `${request.name}:${request.http_status ?? request.error_code ?? "failed"}`);
  const invariantFields = [
    input.environment.video_count,
    input.environment.ready_video_count,
    input.environment.library_updated_at,
    input.environment.current_index_version
  ];
  const noPostOrCommandPaths = input.requests.every((request) =>
    request.method === "GET" &&
      !/\/reconcile(?:$|\?)|\/scan|\/apply|\/publish|\/repair|\/queue|\/retry|\/cancel/.test(request.path)
  );
  const projectionReasons = projectionRebuildReasons(input.environment);

  return [
    gate(
      "get-only-plan",
      noPostOrCommandPaths,
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
      "disk-available",
      input.environment.disk_available_bytes !== null &&
        input.environment.disk_available_bytes >= input.min_disk_available_bytes,
      `disk_available=${formatBytes(input.environment.disk_available_bytes)}, minimum=${formatBytes(input.min_disk_available_bytes)}`
    ),
    gate(
      "reconcile-not-running",
      input.reconcile_status.status !== "running",
      `status=${input.reconcile_status.status || "unknown"}, phase=${input.reconcile_status.phase || "unknown"}`
    ),
    gate(
      "process-history-currently-no-scan",
      input.current_history.actual_data_source === "admin-read-model" &&
        input.current_history.scan_mode === "no-scan",
      `status=${input.current_history.status}, source=${input.current_history.actual_data_source || "unknown"}, scan_mode=${input.current_history.scan_mode || "unknown"}`
    ),
    gate(
      "readiness-explains-state",
      input.readiness.actual_data_source === "admin-read-model" &&
        input.readiness.scan_mode === "no-scan" &&
      Boolean(input.readiness.reason),
      `ready=${String(input.readiness.ready)}, reason=${input.readiness.reason || "unknown"}, last_error=${input.readiness.last_error || "none"}`
    ),
    gate(
      "projection-plan-covers-background-reconcile",
      projectionReasons.length === 0 ||
        (input.rebuild_plan.needed === true &&
          input.rebuild_plan.planned_action === "force-rebuild-derived-admin-read-model"),
      `projection_reasons=${projectionReasons.join(", ") || "none"}, plan_needed=${String(input.rebuild_plan.needed)}`
    ),
    gate(
      "bounded-mutation-scope-only",
      input.rebuild_plan.allowed_mutation_paths.every((targetPath) =>
        targetPath.includes("/.mixlab-library/admin-read-model") ||
          targetPath.includes("/.mixlab-library/admin/operation-log/")
      ) && input.rebuild_plan.forbidden_effects.length >= 5,
      `allowed=${input.rebuild_plan.allowed_mutation_paths.join(", ") || "none"}, forbidden=${input.rebuild_plan.forbidden_effects.length}`
    ),
    gate(
      "protected-invariants-recorded",
      invariantFields.every((value) => value !== null && value !== ""),
      `total=${formatCount(input.environment.video_count)}, ready=${formatCount(input.environment.ready_video_count)}, updated_at=${input.environment.library_updated_at || "unknown"}, index=${input.environment.current_index_version || "unknown"}`
    )
  ];
}

export function buildReport(input: {
  generated_at: string;
  api_base_url: string;
  expected_library_root: string;
  min_disk_available_bytes: number;
  requests: ProbeResult[];
}): RebuildPlanReport {
  const environment = summarizeEnvironment(input.requests);
  const readiness = summarizeReadiness(input.requests);
  const currentHistory = summarizeCurrentHistory(input.requests);
  const reconcileStatus = summarizeReconcileStatus(input.requests);
  const rebuildPlan = buildRebuildPlan({
    api_base_url: input.api_base_url,
    expected_library_root: input.expected_library_root,
    environment,
    readiness
  });
  const gates = buildGateChecks({
    expected_library_root: input.expected_library_root,
    min_disk_available_bytes: input.min_disk_available_bytes,
    requests: input.requests,
    environment,
    reconcile_status: reconcileStatus,
    readiness,
    current_history: currentHistory,
    rebuild_plan: rebuildPlan
  });
  const passed = gates.every((check) => check.passed);
  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: "tsx scripts/acceptance/admin-read-model-rebuild-plan.ts",
    mode: "plan-only",
    api_base_url: input.api_base_url,
    expected_library_root: input.expected_library_root,
    min_disk_available_bytes: input.min_disk_available_bytes,
    requests: input.requests,
    environment,
    reconcile_status: reconcileStatus,
    process_history_readiness: readiness,
    current_process_history: currentHistory,
    rebuild_plan: rebuildPlan,
    gates,
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed
        ? rebuildPlan.needed
          ? `plan-only rebuild gate passed; reason=${rebuildPlan.reason}; execute separate reconcile runner if proceeding`
          : "plan-only rebuild gate passed; no rebuild needed"
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
    .map((request) => (
      `| ${request.name} | ${request.method} ${request.path.replaceAll("|", "\\|")} | ` +
      `${request.http_status ?? "n/a"} | ${request.ok ? "pass" : "fail"} | ${formatMs(request.duration_ms)} |`
    ))
    .join("\n");
}

function renderProjectionRows(projections: EnvironmentSummary["admin_read_model"]["projections"]): string {
  return Object.entries(projections)
    .map(([name, projection]) => (
      `| ${name} | ${projection.status || "unknown"} | ${projection.reason || "unknown"} | ` +
      `${projection.scan_mode || "unknown"} | ${String(projection.requires_background_reconcile ?? "unknown")} | ` +
      `${String(projection.safe_for_page_request ?? "unknown")} | ${formatCount(projection.video_count)} | ` +
      `${formatCount(projection.current_video_count)} |`
    ))
    .join("\n");
}

export function renderMarkdown(report: RebuildPlanReport): string {
  return `# Admin Read Model Rebuild Plan ${report.generated_at}

## Scope

This is a plan-only gate for a live NAS Admin read-model rebuild or migration. It uses GET requests only and does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work.

## Environment

- API: \`${report.api_base_url}\`
- Expected library root: \`${report.expected_library_root}\`
- Actual library root: \`${report.environment.library_root || "unknown"}\`
- Auth mode: \`${report.environment.auth_mode || "unknown"}\`
- Authenticated: \`${String(report.environment.authenticated)}\`
- Current index: \`${report.environment.current_index_version || "unknown"}\`
- Library updated at: \`${report.environment.library_updated_at || "unknown"}\`
- Counts: total \`${formatCount(report.environment.video_count)}\`, ready \`${formatCount(report.environment.ready_video_count)}\`, queued \`${formatCount(report.environment.queued_video_count)}\`, processing \`${formatCount(report.environment.processing_video_count)}\`, failed \`${formatCount(report.environment.failed_video_count)}\`, index-required \`${formatCount(report.environment.index_required_video_count)}\`
- Disk: ${formatBytes(report.environment.disk_available_bytes)} available / ${formatBytes(report.environment.disk_total_bytes)} total

## Current Read Model

- Store path: \`${report.environment.admin_read_model.store_path || "unknown"}\`
- Storage: \`${report.environment.admin_read_model.storage || "unknown"}\`
- Exists: \`${String(report.environment.admin_read_model.exists ?? "unknown")}\`
- Freshness: \`${report.environment.admin_read_model.freshness || "unknown"}\`
- Video count: \`${formatCount(report.environment.admin_read_model.video_count)}\`
- Reconciliation: action \`${report.environment.admin_read_model.reconciliation_action || "unknown"}\`, reason \`${report.environment.admin_read_model.reconciliation_reason || "unknown"}\`, scan mode \`${report.environment.admin_read_model.reconciliation_scan_mode || "unknown"}\`, safe for page request \`${String(report.environment.admin_read_model.safe_for_page_request ?? "unknown")}\`
- Reconciler runtime: status \`${report.reconcile_status.status || "unknown"}\`, phase \`${report.reconcile_status.phase || "unknown"}\`

## Read Model Projection Readiness

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
${renderProjectionRows(report.environment.admin_read_model.projections)}

## Process History State

- Current process-history status: \`${report.current_process_history.status}\`
- Current process-history source: \`${report.current_process_history.actual_data_source || "unknown"}\`
- Current process-history scan mode: \`${report.current_process_history.scan_mode || "unknown"}\`
- Readiness ready: \`${String(report.process_history_readiness.ready)}\`
- Readiness reason: \`${report.process_history_readiness.reason || "unknown"}\`
- Last error: \`${report.process_history_readiness.last_error || "none"}\`
- Expected job snapshot rows: \`${formatCount(report.process_history_readiness.expected_job_snapshot_rows)}\`
- Snapshot metadata row count: \`${formatCount(report.process_history_readiness.snapshot_metadata_row_count)}\`
- Snapshot table row count: \`${formatCount(report.process_history_readiness.snapshot_table_row_count)}\`

## Plan

- Mode: \`${report.rebuild_plan.mode}\`
- Needed: \`${String(report.rebuild_plan.needed)}\`
- Planned action: \`${report.rebuild_plan.planned_action}\`
- Reason: \`${report.rebuild_plan.reason}\`
- Separate execution required: \`${String(report.rebuild_plan.separate_execution_required)}\`
- Runner: \`${report.rebuild_plan.runner}\`

Required environment for a later execution:

${Object.entries(report.rebuild_plan.required_environment).length > 0
  ? Object.entries(report.rebuild_plan.required_environment).map(([key, value]) => `- \`${key}=${value}\``).join("\n")
  : "- none"}

Allowed mutation paths for later execution:

${report.rebuild_plan.allowed_mutation_paths.length > 0
  ? report.rebuild_plan.allowed_mutation_paths.map((targetPath) => `- \`${targetPath}\``).join("\n")
  : "- none"}

Forbidden effects:

${report.rebuild_plan.forbidden_effects.map((effect) => `- ${effect}`).join("\n")}

Post-run invariants:

${report.rebuild_plan.post_run_invariants.map((invariant) => `- ${invariant}`).join("\n")}

## Gates

| gate | status | detail |
| --- | --- | --- |
${renderGateRows(report.gates)}

## Requests

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
${renderRequestRows(report.requests)}

## Result

- Status: \`${report.result.status}\`
- Passed: \`${String(report.result.passed)}\`
- Summary: ${report.result.summary}
`;
}

async function main(): Promise<void> {
  const apiBaseUrl = trimTrailingSlash(process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  const outputDir = process.env.MIXLAB_ADMIN_READ_MODEL_REBUILD_PLAN_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const expectedLibraryRoot = process.env.MIXLAB_ADMIN_EXPECTED_LIBRARY_ROOT ?? DEFAULT_EXPECTED_LIBRARY_ROOT;
  const minDiskAvailableBytes = parsePositiveInt(
    process.env.MIXLAB_ADMIN_READ_MODEL_REBUILD_MIN_DISK_BYTES,
    DEFAULT_MIN_DISK_AVAILABLE_BYTES
  );
  const sessionToken = process.env.MIXLAB_ADMIN_SESSION_TOKEN?.trim() || undefined;
  const logProgress = process.env.MIXLAB_ADMIN_READ_MODEL_REBUILD_PLAN_PROGRESS !== "false";
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));

  if (logProgress) {
    console.error(
      `[admin-read-model-rebuild-plan] api=${apiBaseUrl} ` +
        `expected_library_root=${expectedLibraryRoot} min_disk=${minDiskAvailableBytes}`
    );
  }

  const requests: ProbeResult[] = [];
  for (const definition of buildProbeDefinitions()) {
    if (logProgress) {
      console.error(`[admin-read-model-rebuild-plan] start ${definition.name}`);
    }
    const result = await requestJson({
      api_base_url: apiBaseUrl,
      definition,
      session_token: sessionToken
    });
    requests.push(result);
    if (logProgress) {
      console.error(
        `[admin-read-model-rebuild-plan] done ${definition.name} ` +
          `status=${result.http_status ?? "n/a"} ok=${result.ok} duration_ms=${result.duration_ms}`
      );
    }
  }

  const report = buildReport({
    generated_at: generatedAt,
    api_base_url: apiBaseUrl,
    expected_library_root: expectedLibraryRoot,
    min_disk_available_bytes: minDiskAvailableBytes,
    requests
  });

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `admin-read-model-rebuild-plan-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-read-model-rebuild-plan-${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(JSON.stringify({
    ok: report.result.passed,
    status: report.result.status,
    summary: report.result.summary,
    json_path: jsonPath,
    markdown_path: markdownPath,
    rebuild_plan: report.rebuild_plan,
    failed_gates: report.gates.filter((check) => !check.passed).map((check) => check.name)
  }, null, 2));

  if (!report.result.passed) {
    process.exitCode = 1;
  }
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
