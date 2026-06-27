import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

type HttpMethod = "GET";

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

type ProbeName =
  | "auth_status"
  | "library_status"
  | "read_model_status"
  | "data_loading_plan"
  | "process_history_readiness"
  | "process_history";

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

interface ProcessHistorySummary {
  available: boolean | null;
  status: "hit" | "safe-miss" | "unexpected" | "unavailable";
  actual_data_source: string;
  cache_status: string;
  scan_mode: string;
  returned_count: number | null;
  item_count: number;
  window_days: number | null;
  limit: number | null;
}

interface ProcessHistoryReadinessSummary {
  ready: boolean | null;
  reason: string;
  actual_data_source: string;
  scan_mode: string;
  expected_job_snapshot_rows: number | null;
  snapshot_complete: boolean | null;
  snapshot_metadata_row_count: number | null;
  snapshot_table_row_count: number | null;
  metadata_row_count_matches: boolean | null;
  table_row_count_matches: boolean | null;
}

export interface ProcessHistoryLiveReadonlyReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  api_base_url: string;
  expected_library_root: string;
  requested_limit: number;
  requested_window_days: number;
  environment: {
    auth_mode: string;
    authenticated: boolean | null;
    library_root: string;
    library_updated_at: string;
    current_index_version: string;
    video_count: number | null;
    ready_video_count: number | null;
    admin_read_model: {
      storage: string;
      exists: boolean | null;
      freshness: string;
      video_count: number | null;
      reconciliation_action: string;
      reconciliation_reason: string;
      reconciliation_scan_mode: string;
      safe_for_page_request: boolean | null;
    };
  };
  data_loading_contract: {
    endpoint_found: boolean;
    scan_mode: string;
    owner: string;
    read_model: string;
    route_found: boolean;
    readiness_endpoint_found: boolean;
    readiness_scan_mode: string;
    readiness_read_model: string;
    readiness_route_found: boolean;
  };
  process_history: ProcessHistorySummary;
  process_history_readiness: ProcessHistoryReadinessSummary;
  requests: ProbeResult[];
  gates: GateCheck[];
  notes: string[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3889";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_DAYS = 30;

export function buildProbeDefinitions(input: {
  limit: number;
  window_days: number;
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
      name: "read_model_status",
      method: "GET",
      path: "/api/admin/read-model/status",
      timeout_ms: 5_000,
      notes: "No-scan read-model freshness and page-safety status."
    },
    {
      name: "data_loading_plan",
      method: "GET",
      path: "/api/admin/data-loading/plan",
      timeout_ms: 5_000,
      notes: "Machine-readable route-owned loading contract."
    },
    {
      name: "process_history_readiness",
      method: "GET",
      path: "/api/admin/preprocess/process-history/readiness",
      timeout_ms: 5_000,
      notes: "No-scan read-model readiness diagnostic for process-history rows."
    },
    {
      name: "process_history",
      method: "GET",
      path: `/api/admin/preprocess/process-history?limit=${input.limit}&window_days=${input.window_days}`,
      timeout_ms: 8_000,
      notes: "Route-owned preprocess process-history Query API."
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

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}ms`;
}

function formatCount(value: number | null): string {
  return value === null ? "n/a" : String(value);
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

function requestByName(requests: ProbeResult[], name: ProbeName): ProbeResult | null {
  return requests.find((request) => request.name === name) ?? null;
}

function dataFor(requests: ProbeResult[], name: ProbeName): unknown {
  return requestByName(requests, name)?.data ?? null;
}

function adminReadModelStatus(readModelStatus: unknown): Record<string, unknown> {
  return asRecord(asRecord(readModelStatus).admin_read_model);
}

function reconciliationStatus(readModelStatus: unknown): Record<string, unknown> {
  return asRecord(adminReadModelStatus(readModelStatus).reconciliation);
}

function findEndpoint(dataLoadingPlan: unknown, endpointPath: string): Record<string, unknown> {
  const endpoints = Array.isArray(asRecord(dataLoadingPlan).endpoints)
    ? asRecord(dataLoadingPlan).endpoints as unknown[]
    : [];
  return asRecord(endpoints.find((endpoint) =>
    asString(asRecord(endpoint).endpoint) === endpointPath
  ));
}

function routeOwnsEndpoint(dataLoadingPlan: unknown, endpointPath: string): boolean {
  const routes = Array.isArray(asRecord(dataLoadingPlan).routes)
    ? asRecord(dataLoadingPlan).routes as unknown[]
    : [];
  return routes.some((route) => {
    const record = asRecord(route);
    const endpoints = Array.isArray(record.endpoints) ? record.endpoints : [];
    return asString(record.route) === "preprocess-jobs" &&
      endpoints.some((endpoint) => endpoint === endpointPath);
  });
}

function summarizeProcessHistory(data: unknown): ProcessHistorySummary {
  const history = asRecord(data);
  const summary = asRecord(history.summary);
  const items = Array.isArray(history.items) ? history.items : [];
  const available = asBoolean(history.history_available);
  const cacheStatus = asString(history.cache_status);
  const scanMode = asString(history.scan_mode);
  const actualDataSource = asString(history.actual_data_source);
  const status = actualDataSource === "admin-read-model" && scanMode === "no-scan"
    ? available === true && cacheStatus === "hit"
      ? "hit"
      : available === false && cacheStatus === "miss"
        ? "safe-miss"
        : "unexpected"
    : "unavailable";

  return {
    available,
    status,
    actual_data_source: actualDataSource,
    cache_status: cacheStatus,
    scan_mode: scanMode,
    returned_count: asNumber(summary.returned_count),
    item_count: items.length,
    window_days: asNumber(history.window_days),
    limit: asNumber(history.limit)
  };
}

function summarizeProcessHistoryReadiness(data: unknown): ProcessHistoryReadinessSummary {
  const readiness = asRecord(data);
  return {
    ready: asBoolean(readiness.ready_for_process_history),
    reason: asString(readiness.reason),
    actual_data_source: asString(readiness.actual_data_source),
    scan_mode: asString(readiness.scan_mode),
    expected_job_snapshot_rows: asNumber(readiness.expected_job_snapshot_rows),
    snapshot_complete: asBoolean(readiness.snapshot_complete),
    snapshot_metadata_row_count: asNumber(readiness.snapshot_metadata_row_count),
    snapshot_table_row_count: asNumber(readiness.snapshot_table_row_count),
    metadata_row_count_matches: asBoolean(readiness.metadata_row_count_matches),
    table_row_count_matches: asBoolean(readiness.table_row_count_matches)
  };
}

function gate(name: string, passed: boolean, detail: string): GateCheck {
  return { name, passed, detail };
}

export function buildGateChecks(input: {
  expected_library_root: string;
  requested_limit: number;
  requested_window_days: number;
  requests: ProbeResult[];
  data_loading_contract: ProcessHistoryLiveReadonlyReport["data_loading_contract"];
  process_history: ProcessHistorySummary;
  process_history_readiness: ProcessHistoryReadinessSummary;
}): GateCheck[] {
  const libraryStatus = asRecord(dataFor(input.requests, "library_status"));
  const readModelStatus = dataFor(input.requests, "read_model_status");
  const readModel = adminReadModelStatus(readModelStatus);
  const reconciliation = reconciliationStatus(readModelStatus);
  const requestFailures = input.requests
    .filter((request) => !request.ok)
    .map((request) => `${request.name}:${request.http_status ?? request.error_code ?? "failed"}`);

  return [
    gate(
      "get-only-probe",
      input.requests.every((request) => request.method === "GET"),
      `methods=${input.requests.map((request) => `${request.name}:${request.method}`).join(",")}`
    ),
    gate(
      "request-success",
      requestFailures.length === 0,
      requestFailures.length === 0 ? "all probe requests returned ok" : requestFailures.join(",")
    ),
    gate(
      "library-root",
      asString(libraryStatus.root_path) === input.expected_library_root,
      `root_path=${asString(libraryStatus.root_path) || "unknown"}, expected=${input.expected_library_root}`
    ),
    gate(
      "read-model-page-safe",
      asString(readModel.storage) === "sqlite" &&
        asBoolean(readModel.exists) === true &&
        asString(readModel.freshness) === "fresh" &&
        asString(reconciliation.scan_mode) === "no-scan" &&
        asBoolean(reconciliation.safe_for_page_request) === true,
      `storage=${asString(readModel.storage) || "unknown"}, exists=${String(asBoolean(readModel.exists) ?? "unknown")}, freshness=${asString(readModel.freshness) || "unknown"}, scan_mode=${asString(reconciliation.scan_mode) || "unknown"}, safe_for_page_request=${String(asBoolean(reconciliation.safe_for_page_request) ?? "unknown")}`
    ),
    gate(
      "data-loading-contract",
      input.data_loading_contract.endpoint_found &&
        input.data_loading_contract.route_found &&
        input.data_loading_contract.scan_mode === "no-scan" &&
        input.data_loading_contract.readiness_endpoint_found &&
        input.data_loading_contract.readiness_route_found &&
        input.data_loading_contract.readiness_scan_mode === "no-scan",
      `endpoint_found=${input.data_loading_contract.endpoint_found}, route_found=${input.data_loading_contract.route_found}, scan_mode=${input.data_loading_contract.scan_mode || "unknown"}, read_model=${input.data_loading_contract.read_model || "unknown"}, readiness_endpoint_found=${input.data_loading_contract.readiness_endpoint_found}, readiness_route_found=${input.data_loading_contract.readiness_route_found}, readiness_scan_mode=${input.data_loading_contract.readiness_scan_mode || "unknown"}, readiness_read_model=${input.data_loading_contract.readiness_read_model || "unknown"}`
    ),
    gate(
      "process-history-no-scan",
      input.process_history.actual_data_source === "admin-read-model" &&
        input.process_history.scan_mode === "no-scan" &&
        (input.process_history.status === "hit" || input.process_history.status === "safe-miss"),
      `status=${input.process_history.status}, actual_data_source=${input.process_history.actual_data_source || "unknown"}, cache_status=${input.process_history.cache_status || "unknown"}, scan_mode=${input.process_history.scan_mode || "unknown"}`
    ),
    gate(
      "process-history-readiness-no-scan",
      input.process_history_readiness.actual_data_source === "admin-read-model" &&
        input.process_history_readiness.scan_mode === "no-scan" &&
        Boolean(input.process_history_readiness.reason),
      `ready=${String(input.process_history_readiness.ready)}, reason=${input.process_history_readiness.reason || "unknown"}, expected=${formatCount(input.process_history_readiness.expected_job_snapshot_rows)}, metadata=${formatCount(input.process_history_readiness.snapshot_metadata_row_count)}, table=${formatCount(input.process_history_readiness.snapshot_table_row_count)}, scan_mode=${input.process_history_readiness.scan_mode || "unknown"}`
    ),
    gate(
      "process-history-bounded",
      input.process_history.limit === input.requested_limit &&
        input.process_history.window_days === input.requested_window_days &&
        input.process_history.item_count <= input.requested_limit &&
        (input.process_history.returned_count === null ||
          input.process_history.returned_count <= input.requested_limit),
      `limit=${formatCount(input.process_history.limit)}, window_days=${formatCount(input.process_history.window_days)}, item_count=${input.process_history.item_count}, returned_count=${formatCount(input.process_history.returned_count)}`
    )
  ];
}

export function buildReport(input: {
  generated_at: string;
  api_base_url: string;
  expected_library_root: string;
  requested_limit: number;
  requested_window_days: number;
  requests: ProbeResult[];
}): ProcessHistoryLiveReadonlyReport {
  const authStatus = asRecord(dataFor(input.requests, "auth_status"));
  const libraryStatus = asRecord(dataFor(input.requests, "library_status"));
  const readModelStatus = dataFor(input.requests, "read_model_status");
  const readModel = adminReadModelStatus(readModelStatus);
  const reconciliation = reconciliationStatus(readModelStatus);
  const dataLoadingPlan = dataFor(input.requests, "data_loading_plan");
  const processHistoryEndpoint = findEndpoint(dataLoadingPlan, "/api/admin/preprocess/process-history");
  const processHistoryReadinessEndpoint = findEndpoint(
    dataLoadingPlan,
    "/api/admin/preprocess/process-history/readiness"
  );
  const processHistory = summarizeProcessHistory(dataFor(input.requests, "process_history"));
  const processHistoryReadiness = summarizeProcessHistoryReadiness(
    dataFor(input.requests, "process_history_readiness")
  );
  const dataLoadingContract = {
    endpoint_found: Object.keys(processHistoryEndpoint).length > 0,
    scan_mode: asString(processHistoryEndpoint.scan_mode),
    owner: asString(processHistoryEndpoint.owner),
    read_model: asString(processHistoryEndpoint.read_model),
    route_found: routeOwnsEndpoint(dataLoadingPlan, "/api/admin/preprocess/process-history"),
    readiness_endpoint_found: Object.keys(processHistoryReadinessEndpoint).length > 0,
    readiness_scan_mode: asString(processHistoryReadinessEndpoint.scan_mode),
    readiness_read_model: asString(processHistoryReadinessEndpoint.read_model),
    readiness_route_found: routeOwnsEndpoint(
      dataLoadingPlan,
      "/api/admin/preprocess/process-history/readiness"
    )
  };
  const reportWithoutGates = {
    schema_version: "1.0" as const,
    generated_at: input.generated_at,
    command: "tsx scripts/acceptance/admin-process-history-live-readonly.ts",
    api_base_url: input.api_base_url,
    expected_library_root: input.expected_library_root,
    requested_limit: input.requested_limit,
    requested_window_days: input.requested_window_days,
    environment: {
      auth_mode: asString(authStatus.auth_mode),
      authenticated: asBoolean(authStatus.authenticated),
      library_root: asString(libraryStatus.root_path),
      library_updated_at: asString(libraryStatus.updated_at),
      current_index_version: asString(libraryStatus.current_index_version),
      video_count: asNumber(libraryStatus.video_count),
      ready_video_count: asNumber(libraryStatus.ready_video_count),
      admin_read_model: {
        storage: asString(readModel.storage),
        exists: asBoolean(readModel.exists),
        freshness: asString(readModel.freshness),
        video_count: asNumber(readModel.video_count),
        reconciliation_action: asString(reconciliation.action),
        reconciliation_reason: asString(reconciliation.reason),
        reconciliation_scan_mode: asString(reconciliation.scan_mode),
        safe_for_page_request: asBoolean(reconciliation.safe_for_page_request)
      }
    },
    data_loading_contract: dataLoadingContract,
    process_history: processHistory,
    process_history_readiness: processHistoryReadiness,
    requests: input.requests,
    gates: [] as GateCheck[],
    notes: [
      "All probe requests use GET only.",
      "This probe never starts, cancels, applies, repairs, publishes, rebuilds, or deploys any command.",
      "A process-history hit proves the live admin.sqlite job snapshot can serve the route-owned panel. A safe miss is still acceptable as no-scan evidence but means the live read model needs a separate gated rebuild before the panel can show rows.",
      "The admin.sqlite read model is a rebuildable query projection; source-video manifests, preprocess-job files and release/index outputs remain the durable facts."
    ],
    result: {
      passed: false,
      status: "failed" as const,
      summary: ""
    }
  };
  const gates = buildGateChecks({
    expected_library_root: input.expected_library_root,
    requested_limit: input.requested_limit,
    requested_window_days: input.requested_window_days,
    requests: input.requests,
    data_loading_contract: dataLoadingContract,
    process_history: processHistory,
    process_history_readiness: processHistoryReadiness
  });
  const passed = gates.every((check) => check.passed);
  return {
    ...reportWithoutGates,
    gates,
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed
        ? `process-history ${processHistory.status} through ${processHistory.actual_data_source || "unknown"} with ${processHistory.scan_mode || "unknown"}; readiness=${processHistoryReadiness.reason || "unknown"}`
        : `failed gates: ${gates.filter((check) => !check.passed).map((check) => check.name).join(", ")}`
    }
  };
}

export function renderMarkdown(report: ProcessHistoryLiveReadonlyReport): string {
  const failedGates = report.gates.filter((gateCheck) => !gateCheck.passed);
  const requestRows = report.requests.map((request) => [
    request.name,
    request.method,
    request.path,
    request.http_status ?? "n/a",
    request.ok ? "ok" : "failed",
    formatMs(request.duration_ms),
    request.response_bytes
  ]);

  return `# Admin Process History Live Readonly Probe ${report.generated_at}

## Scope

This report validates the route-owned preprocess process-history read-model contract against a live Admin API. It is GET-only and does not start reconcile, scan, apply, repair, publish, rebuild, Docker upload, or Cutter protocol work.

## Environment

- API: \`${report.api_base_url}\`
- Expected library root: \`${report.expected_library_root}\`
- Actual library root: \`${report.environment.library_root || "unknown"}\`
- Auth mode: \`${report.environment.auth_mode || "unknown"}\`
- Authenticated: \`${String(report.environment.authenticated)}\`
- Current index: \`${report.environment.current_index_version || "unknown"}\`
- Library updated at: \`${report.environment.library_updated_at || "unknown"}\`
- Counts: total \`${formatCount(report.environment.video_count)}\`, ready \`${formatCount(report.environment.ready_video_count)}\`

## Read Model

- Storage: \`${report.environment.admin_read_model.storage || "unknown"}\`
- Exists: \`${String(report.environment.admin_read_model.exists ?? "unknown")}\`
- Freshness: \`${report.environment.admin_read_model.freshness || "unknown"}\`
- Video count: \`${formatCount(report.environment.admin_read_model.video_count)}\`
- Reconciliation: action \`${report.environment.admin_read_model.reconciliation_action || "unknown"}\`, reason \`${report.environment.admin_read_model.reconciliation_reason || "unknown"}\`, scan mode \`${report.environment.admin_read_model.reconciliation_scan_mode || "unknown"}\`, safe for page request \`${String(report.environment.admin_read_model.safe_for_page_request ?? "unknown")}\`

## Data Loading Contract

- Endpoint found: \`${String(report.data_loading_contract.endpoint_found)}\`
- Route found: \`${String(report.data_loading_contract.route_found)}\`
- Owner: \`${report.data_loading_contract.owner || "unknown"}\`
- Read model: \`${report.data_loading_contract.read_model || "unknown"}\`
- Scan mode: \`${report.data_loading_contract.scan_mode || "unknown"}\`
- Readiness endpoint found: \`${String(report.data_loading_contract.readiness_endpoint_found)}\`
- Readiness route found: \`${String(report.data_loading_contract.readiness_route_found)}\`
- Readiness read model: \`${report.data_loading_contract.readiness_read_model || "unknown"}\`
- Readiness scan mode: \`${report.data_loading_contract.readiness_scan_mode || "unknown"}\`

## Process History

- Status: \`${report.process_history.status}\`
- Available: \`${String(report.process_history.available)}\`
- Actual data source: \`${report.process_history.actual_data_source || "unknown"}\`
- Cache status: \`${report.process_history.cache_status || "unknown"}\`
- Scan mode: \`${report.process_history.scan_mode || "unknown"}\`
- Window days: \`${formatCount(report.process_history.window_days)}\`
- Limit: \`${formatCount(report.process_history.limit)}\`
- Returned count: \`${formatCount(report.process_history.returned_count)}\`
- Item count: \`${report.process_history.item_count}\`

## Process History Readiness

- Ready: \`${String(report.process_history_readiness.ready)}\`
- Reason: \`${report.process_history_readiness.reason || "unknown"}\`
- Actual data source: \`${report.process_history_readiness.actual_data_source || "unknown"}\`
- Scan mode: \`${report.process_history_readiness.scan_mode || "unknown"}\`
- Expected job snapshot rows: \`${formatCount(report.process_history_readiness.expected_job_snapshot_rows)}\`
- Snapshot complete: \`${String(report.process_history_readiness.snapshot_complete)}\`
- Snapshot metadata row count: \`${formatCount(report.process_history_readiness.snapshot_metadata_row_count)}\`
- Snapshot table row count: \`${formatCount(report.process_history_readiness.snapshot_table_row_count)}\`
- Metadata row count matches: \`${String(report.process_history_readiness.metadata_row_count_matches)}\`
- Table row count matches: \`${String(report.process_history_readiness.table_row_count_matches)}\`

## Gates

| gate | result | detail |
| --- | --- | --- |
${report.gates.map((gateCheck) => `| ${gateCheck.name} | ${gateCheck.passed ? "pass" : "fail"} | ${gateCheck.detail.replaceAll("|", "\\|")} |`).join("\n")}

## Requests

| name | method | path | status | result | duration | bytes |
| --- | --- | --- | ---: | --- | ---: | ---: |
${requestRows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}

## Result

- Status: \`${report.result.status}\`
- Summary: ${report.result.summary}
- Failed gates: ${failedGates.length > 0 ? failedGates.map((gateCheck) => `\`${gateCheck.name}\``).join(", ") : "none"}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const apiBaseUrl = trimTrailingSlash(process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  const outputDir = process.env.MIXLAB_ADMIN_PROCESS_HISTORY_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const expectedLibraryRoot = process.env.MIXLAB_ADMIN_EXPECTED_LIBRARY_ROOT ?? DEFAULT_EXPECTED_LIBRARY_ROOT;
  const limit = parsePositiveInt(process.env.MIXLAB_ADMIN_PROCESS_HISTORY_LIMIT, DEFAULT_LIMIT);
  const windowDays = parsePositiveInt(
    process.env.MIXLAB_ADMIN_PROCESS_HISTORY_WINDOW_DAYS,
    DEFAULT_WINDOW_DAYS
  );
  const sessionToken = process.env.MIXLAB_ADMIN_SESSION_TOKEN?.trim() || undefined;
  const logProgress = process.env.MIXLAB_ADMIN_PROCESS_HISTORY_PROGRESS !== "false";
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const definitions = buildProbeDefinitions({ limit, window_days: windowDays });

  if (logProgress) {
    console.error(
      `[admin-process-history-live] api=${apiBaseUrl} expected_library_root=${expectedLibraryRoot} ` +
        `limit=${limit} window_days=${windowDays}`
    );
  }

  const requests: ProbeResult[] = [];
  for (const definition of definitions) {
    if (logProgress) {
      console.error(`[admin-process-history-live] start ${definition.name}`);
    }
    const result = await requestJson({
      api_base_url: apiBaseUrl,
      definition,
      session_token: sessionToken
    });
    requests.push(result);
    if (logProgress) {
      console.error(
        `[admin-process-history-live] done ${definition.name} status=${result.http_status ?? "n/a"} ` +
          `ok=${result.ok} duration_ms=${result.duration_ms}`
      );
    }
  }

  const report = buildReport({
    generated_at: generatedAt,
    api_base_url: apiBaseUrl,
    expected_library_root: expectedLibraryRoot,
    requested_limit: limit,
    requested_window_days: windowDays,
    requests
  });

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `admin-process-history-live-readonly-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-process-history-live-readonly-${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(JSON.stringify({
    ok: report.result.passed,
    status: report.result.status,
    summary: report.result.summary,
    json_path: jsonPath,
    markdown_path: markdownPath,
    process_history: report.process_history,
    process_history_readiness: report.process_history_readiness,
    failed_gates: report.gates.filter((gateCheck) => !gateCheck.passed).map((gateCheck) => gateCheck.name)
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
