import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

type HttpMethod = "GET" | "POST";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

interface RequestResult {
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

interface ProbeResult {
  name: string;
  request: RequestResult;
}

interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface ReconcileReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "dry-run" | "apply" | "skip";
  api_base_url: string;
  expected_library_root: string;
  allow_reconcile: boolean;
  force_reconcile: boolean;
  preflight: {
    passed: boolean;
    checks: GateCheck[];
  };
  before: {
    library_status: unknown;
    read_model_status: unknown;
    reconcile_status: unknown;
  };
  action: {
    started: boolean;
    accepted: boolean;
    terminal_status: string;
    terminal_phase: string;
    poll_count: number;
    duration_ms: number | null;
    start_response: unknown;
    terminal_response: unknown;
  };
  after: {
    library_status: unknown;
    read_model_status: unknown;
    operation_log: unknown;
    probes: ProbeResult[];
  };
  invariants: GateCheck[];
  result: {
    passed: boolean;
    status: "passed" | "dry-run" | "failed";
    summary: string;
  };
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3889";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_STABLE_STATUS_TIMEOUT_MS = 180 * 1000;
const DEFAULT_MIN_DISK_AVAILABLE_BYTES = 1024 * 1024 * 1024;

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

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}ms`;
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

async function requestJson(input: {
  api_base_url: string;
  method: HttpMethod;
  path: string;
  timeout_ms: number;
  session_token?: string;
}): Promise<RequestResult> {
  const url = `${input.api_base_url}${input.path}`;
  const headers: Record<string, string> = {
    accept: "application/json"
  };
  if (input.method === "POST") {
    headers["content-type"] = "application/json";
  }
  if (input.session_token) {
    headers["X-MixLab-Admin-Session-Token"] = input.session_token;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeout_ms);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: input.method,
      headers,
      body: input.method === "POST" ? "{}" : undefined,
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
      method: input.method,
      path: input.path,
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
      method: input.method,
      path: input.path,
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

function readModelOverview(status: unknown): Record<string, unknown> {
  return asRecord(asRecord(status).admin_read_model);
}

function sourceVideoStatusOverview(status: unknown): Record<string, unknown> {
  return asRecord(asRecord(status).source_video_status);
}

function reconciliationOverview(status: unknown): Record<string, unknown> {
  return asRecord(readModelOverview(status).reconciliation);
}

function projectionOverview(status: unknown, name: string): Record<string, unknown> {
  return asRecord(asRecord(readModelOverview(status).projections)[name]);
}

function countsByStatus(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

function gate(name: string, passed: boolean, detail: string): GateCheck {
  return { name, passed, detail };
}

export function buildPreflightChecks(input: {
  expected_library_root: string;
  library_status: unknown;
  read_model_status: unknown;
  reconcile_status: unknown;
  min_disk_available_bytes: number;
}): GateCheck[] {
  const library = asRecord(input.library_status);
  const readModel = readModelOverview(input.read_model_status);
  const sourceVideoStatus = sourceVideoStatusOverview(input.read_model_status);
  const reconciliation = reconciliationOverview(input.read_model_status);
  const reconcileStatus = asRecord(input.reconcile_status);
  const rootPath = asString(library.root_path);
  const diskAvailable = asNumber(library.disk_available_bytes);
  const action = asString(reconciliation.action);
  const reason = asString(reconciliation.reason);
  const scanMode = asString(reconciliation.scan_mode);
  const sourceFreshness = asString(sourceVideoStatus.freshness);
  const sourcePersisted = asString(sourceVideoStatus.persisted);
  const storeFreshness = asString(readModel.freshness);

  return [
    gate(
      "library-root",
      rootPath === input.expected_library_root,
      `root_path=${rootPath || "unknown"}, expected=${input.expected_library_root}`
    ),
    gate(
      "disk-available",
      diskAvailable !== null && diskAvailable >= input.min_disk_available_bytes,
      `disk_available_bytes=${diskAvailable ?? "n/a"}, minimum=${input.min_disk_available_bytes}`
    ),
    gate(
      "source-video-status-fresh",
      sourceFreshness === "fresh" && sourcePersisted === "fresh",
      `source-video-status freshness=${sourceFreshness || "unknown"}, persisted=${sourcePersisted || "unknown"}`
    ),
    gate(
      "reconcile-not-running",
      asString(reconcileStatus.status) !== "running",
      `status=${asString(reconcileStatus.status) || "unknown"}, phase=${asString(reconcileStatus.phase) || "unknown"}`
    ),
    gate(
      "reconcile-action-safe",
      action === "none" || action === "build" || action === "rebuild",
      `action=${action || "unknown"}, reason=${reason || "unknown"}, scan_mode=${scanMode || "unknown"}`
    ),
    gate(
      "no-manual-review",
      action !== "manual-review",
      `action=${action || "unknown"}, freshness=${storeFreshness || "unknown"}`
    )
  ];
}

export function buildInvariantChecks(input: {
  before_library_status: unknown;
  after_library_status: unknown;
  before_read_model_status: unknown;
  after_read_model_status: unknown;
  action_started: boolean;
  terminal_status: string;
}): GateCheck[] {
  const beforeLibrary = asRecord(input.before_library_status);
  const afterLibrary = asRecord(input.after_library_status);
  const afterReadModel = readModelOverview(input.after_read_model_status);
  const afterSourceVideoStatus = sourceVideoStatusOverview(input.after_read_model_status);
  const afterReconciliation = reconciliationOverview(input.after_read_model_status);
  const afterMaterialProjection = projectionOverview(input.after_read_model_status, "material_summary");
  const afterProductionProjection = projectionOverview(input.after_read_model_status, "production_summary");
  const afterProcessHistoryProjection = projectionOverview(input.after_read_model_status, "process_history");
  const afterCounts = countsByStatus(afterReadModel.counts_by_status);
  const afterLibraryUpdatedAt = asString(afterLibrary.updated_at);
  const beforeLibraryUpdatedAt = asString(beforeLibrary.updated_at);

  const checks = [
    gate(
      "library-total-count-unchanged",
      asNumber(beforeLibrary.video_count) === asNumber(afterLibrary.video_count),
      `before=${asNumber(beforeLibrary.video_count) ?? "n/a"}, after=${asNumber(afterLibrary.video_count) ?? "n/a"}`
    ),
    gate(
      "library-ready-count-unchanged",
      asNumber(beforeLibrary.ready_video_count) === asNumber(afterLibrary.ready_video_count),
      `before=${asNumber(beforeLibrary.ready_video_count) ?? "n/a"}, after=${asNumber(afterLibrary.ready_video_count) ?? "n/a"}`
    ),
    gate(
      "library-updated-at-unchanged",
      beforeLibraryUpdatedAt === afterLibraryUpdatedAt,
      `before=${beforeLibraryUpdatedAt || "unknown"}, after=${afterLibraryUpdatedAt || "unknown"}`
    ),
    gate(
      "current-index-version-unchanged",
      asString(beforeLibrary.current_index_version) === asString(afterLibrary.current_index_version),
      `before=${asString(beforeLibrary.current_index_version) || "unknown"}, after=${asString(afterLibrary.current_index_version) || "unknown"}`
    ),
    gate(
      "source-video-status-remains-fresh",
      asString(afterSourceVideoStatus.freshness) === "fresh",
      `freshness=${asString(afterSourceVideoStatus.freshness) || "unknown"}`
    )
  ];

  if (input.action_started) {
    checks.push(
      gate(
        "reconcile-terminal-success",
        input.terminal_status === "succeeded" || input.terminal_status === "skipped",
        `terminal_status=${input.terminal_status || "unknown"}`
      ),
      gate(
        "admin-read-model-fresh",
        asString(afterReadModel.freshness) === "fresh",
        `freshness=${asString(afterReadModel.freshness) || "unknown"}`
      ),
      gate(
        "admin-read-model-safe-for-page",
        asBoolean(afterReconciliation.safe_for_page_request) === true,
        `safe_for_page_request=${String(asBoolean(afterReconciliation.safe_for_page_request) ?? "unknown")}`
      ),
      gate(
        "admin-read-model-no-scan",
        asString(afterReconciliation.scan_mode) === "no-scan",
        `scan_mode=${asString(afterReconciliation.scan_mode) || "unknown"}`
      ),
      gate(
        "admin-read-model-counts-match-library",
        asNumber(afterReadModel.video_count) === asNumber(afterLibrary.video_count) &&
          asNumber(afterCounts.ready) === asNumber(afterLibrary.ready_video_count) &&
          asNumber(afterCounts.queued) === asNumber(afterLibrary.queued_video_count) &&
          asNumber(afterCounts.processing) === asNumber(afterLibrary.processing_video_count) &&
          asNumber(afterCounts.failed) === asNumber(afterLibrary.failed_video_count) &&
          asNumber(afterCounts["index-required"]) === asNumber(afterLibrary.index_required_video_count),
        `store_total=${asNumber(afterReadModel.video_count) ?? "n/a"}, library_total=${asNumber(afterLibrary.video_count) ?? "n/a"}`
      ),
      gate(
        "dashboard-material-projection-ready",
        asString(afterMaterialProjection.status) === "ready" &&
          asString(afterMaterialProjection.reason) === "ready" &&
          asBoolean(afterMaterialProjection.requires_background_reconcile) === false &&
          asBoolean(afterMaterialProjection.safe_for_page_request) === true,
        `status=${asString(afterMaterialProjection.status) || "unknown"}, reason=${asString(afterMaterialProjection.reason) || "unknown"}, requires_background_reconcile=${String(asBoolean(afterMaterialProjection.requires_background_reconcile) ?? "unknown")}`
      ),
      gate(
        "dashboard-production-projection-ready",
        asString(afterProductionProjection.status) === "ready" &&
          asString(afterProductionProjection.reason) === "ready" &&
          asBoolean(afterProductionProjection.requires_background_reconcile) === false &&
          asBoolean(afterProductionProjection.safe_for_page_request) === true,
        `status=${asString(afterProductionProjection.status) || "unknown"}, reason=${asString(afterProductionProjection.reason) || "unknown"}, requires_background_reconcile=${String(asBoolean(afterProductionProjection.requires_background_reconcile) ?? "unknown")}`
      ),
      gate(
        "process-history-projection-ready",
        asString(afterProcessHistoryProjection.status) === "ready" &&
          asString(afterProcessHistoryProjection.reason) === "ready" &&
          asBoolean(afterProcessHistoryProjection.requires_background_reconcile) === false &&
          asBoolean(afterProcessHistoryProjection.safe_for_page_request) === true,
        `status=${asString(afterProcessHistoryProjection.status) || "unknown"}, reason=${asString(afterProcessHistoryProjection.reason) || "unknown"}, requires_background_reconcile=${String(asBoolean(afterProcessHistoryProjection.requires_background_reconcile) ?? "unknown")}`
      )
    );
  }

  return checks;
}

async function pollReconcile(input: {
  api_base_url: string;
  session_token?: string;
  poll_timeout_ms: number;
  poll_interval_ms: number;
  log_progress: boolean;
}): Promise<{ status: unknown; poll_count: number; duration_ms: number }> {
  const started = performance.now();
  let pollCount = 0;
  while (performance.now() - started < input.poll_timeout_ms) {
    pollCount += 1;
    const status = await requestJson({
      api_base_url: input.api_base_url,
      method: "GET",
      path: "/api/admin/read-model/reconcile/status",
      timeout_ms: 10_000,
      session_token: input.session_token
    });
    const data = asRecord(status.data);
    const state = asString(data.status);
    const phase = asString(data.phase);
    const progress = asRecord(data.progress);
    if (input.log_progress) {
      console.error(
        `[admin-read-model-reconcile] poll=${pollCount} status=${state || "unknown"} ` +
          `phase=${phase || "unknown"} percent=${asNumber(progress.percent) ?? "n/a"}`
      );
    }
    if (["succeeded", "skipped", "cancelled", "failed"].includes(state)) {
      return {
        status: status.data,
        poll_count: pollCount,
        duration_ms: roundMs(performance.now() - started)
      };
    }
    await new Promise((resolve) => setTimeout(resolve, input.poll_interval_ms));
  }

  throw new Error(`Timed out waiting for read-model reconcile after ${input.poll_timeout_ms}ms`);
}

async function waitForReadModelStatus(input: {
  api_base_url: string;
  session_token?: string;
  require_admin_fresh: boolean;
  require_source_fresh: boolean;
  timeout_ms: number;
  poll_interval_ms: number;
  log_progress: boolean;
}): Promise<ProbeResult> {
  const started = performance.now();
  let pollCount = 0;
  while (performance.now() - started < input.timeout_ms) {
    pollCount += 1;
    const probe = await runProbe({
      api_base_url: input.api_base_url,
      session_token: input.session_token,
      name: "read_model_status_after",
      path: "/api/admin/read-model/status",
      timeout_ms: 10_000
    });
    const adminReadModel = readModelOverview(probe.request.data);
    const sourceVideoStatus = sourceVideoStatusOverview(probe.request.data);
    const reconciliation = reconciliationOverview(probe.request.data);
    const adminReady = !input.require_admin_fresh ||
      (asString(adminReadModel.freshness) === "fresh" &&
        asBoolean(reconciliation.safe_for_page_request) === true);
    const sourceReady = !input.require_source_fresh ||
      asString(sourceVideoStatus.freshness) === "fresh";

    if (input.log_progress) {
      console.error(
        `[admin-read-model-reconcile] status-poll=${pollCount} ` +
          `admin=${asString(adminReadModel.freshness) || "unknown"} ` +
          `source=${asString(sourceVideoStatus.freshness) || "unknown"}`
      );
    }
    if (probe.request.ok && adminReady && sourceReady) {
      return probe;
    }
    await new Promise((resolve) => setTimeout(resolve, input.poll_interval_ms));
  }

  return runProbe({
    api_base_url: input.api_base_url,
    session_token: input.session_token,
    name: "read_model_status_after",
    path: "/api/admin/read-model/status",
    timeout_ms: 10_000
  });
}

async function runProbe(input: {
  api_base_url: string;
  session_token?: string;
  name: string;
  path: string;
  method?: HttpMethod;
  timeout_ms?: number;
}): Promise<ProbeResult> {
  return {
    name: input.name,
    request: await requestJson({
      api_base_url: input.api_base_url,
      method: input.method ?? "GET",
      path: input.path,
      timeout_ms: input.timeout_ms ?? 15_000,
      session_token: input.session_token
    })
  };
}

function renderGateRows(checks: GateCheck[]): string {
  return checks
    .map((check) => `| ${check.name} | ${check.passed ? "pass" : "fail"} | ${check.detail.replaceAll("|", "\\|")} |`)
    .join("\n");
}

function renderProbeRows(probes: ProbeResult[]): string {
  return probes
    .map((probe) => (
      `| ${probe.name} | ${probe.request.method} ${probe.request.path.replaceAll("|", "\\|")} | ` +
      `${probe.request.http_status ?? "n/a"} | ${probe.request.ok ? "pass" : "fail"} | ${formatMs(probe.request.duration_ms)} |`
    ))
    .join("\n");
}

function projectionLine(label: string, projection: Record<string, unknown>): string {
  return `- ${label}: status \`${asString(projection.status) || "unknown"}\`, reason \`${asString(projection.reason) || "unknown"}\`, scan mode \`${asString(projection.scan_mode) || "unknown"}\`, requires background reconcile \`${String(asBoolean(projection.requires_background_reconcile) ?? "unknown")}\`, safe for page request \`${String(asBoolean(projection.safe_for_page_request) ?? "unknown")}\``;
}

export function renderMarkdown(report: ReconcileReport): string {
  const beforeLibrary = asRecord(report.before.library_status);
  const beforeReadModel = readModelOverview(report.before.read_model_status);
  const beforeReconciliation = reconciliationOverview(report.before.read_model_status);
  const beforeMaterialProjection = projectionOverview(report.before.read_model_status, "material_summary");
  const beforeProductionProjection = projectionOverview(report.before.read_model_status, "production_summary");
  const beforeProcessHistoryProjection = projectionOverview(report.before.read_model_status, "process_history");
  const afterReadModel = readModelOverview(report.after.read_model_status);
  const afterReconciliation = reconciliationOverview(report.after.read_model_status);
  const afterMaterialProjection = projectionOverview(report.after.read_model_status, "material_summary");
  const afterProductionProjection = projectionOverview(report.after.read_model_status, "production_summary");
  const afterProcessHistoryProjection = projectionOverview(report.after.read_model_status, "process_history");

  return `# Admin Read Model Reconcile ${report.generated_at}

## Scope

This report gates a real NAS admin.sqlite read-model reconcile. It may write generated read-model metadata under \`.mixlab-library/admin-read-model/\` and operation-log entries, but it must not modify source-video manifests, library counts, release/index artifacts, or Cutter protocol data.

## Environment

- API: \`${report.api_base_url}\`
- Expected library root: \`${report.expected_library_root}\`
- Mode: \`${report.mode}\`
- Allow reconcile: \`${String(report.allow_reconcile)}\`
- Force reconcile: \`${String(report.force_reconcile)}\`
- Library root: \`${asString(beforeLibrary.root_path) || "unknown"}\`
- Counts before: total \`${asNumber(beforeLibrary.video_count) ?? "n/a"}\`, ready \`${asNumber(beforeLibrary.ready_video_count) ?? "n/a"}\`, queued \`${asNumber(beforeLibrary.queued_video_count) ?? "n/a"}\`, index-required \`${asNumber(beforeLibrary.index_required_video_count) ?? "n/a"}\`

## Preflight Gates

| gate | status | detail |
| --- | --- | --- |
${renderGateRows(report.preflight.checks)}

## Read Model Before

- admin.sqlite freshness: \`${asString(beforeReadModel.freshness) || "unknown"}\`
- admin.sqlite exists: \`${String(asBoolean(beforeReadModel.exists) ?? "unknown")}\`
- reconciliation action: \`${asString(beforeReconciliation.action) || "unknown"}\`
- reconciliation reason: \`${asString(beforeReconciliation.reason) || "unknown"}\`
- scan mode: \`${asString(beforeReconciliation.scan_mode) || "unknown"}\`
- safe for page request: \`${String(asBoolean(beforeReconciliation.safe_for_page_request) ?? "unknown")}\`
${projectionLine("material projection", beforeMaterialProjection)}
${projectionLine("production projection", beforeProductionProjection)}
${projectionLine("process-history projection", beforeProcessHistoryProjection)}

## Reconcile Action

- Started: \`${String(report.action.started)}\`
- Accepted: \`${String(report.action.accepted)}\`
- Terminal status: \`${report.action.terminal_status || "n/a"}\`
- Terminal phase: \`${report.action.terminal_phase || "n/a"}\`
- Poll count: \`${report.action.poll_count}\`
- Duration: \`${formatMs(report.action.duration_ms)}\`

## Read Model After

- admin.sqlite freshness: \`${asString(afterReadModel.freshness) || "unknown"}\`
- admin.sqlite exists: \`${String(asBoolean(afterReadModel.exists) ?? "unknown")}\`
- admin.sqlite video count: \`${asNumber(afterReadModel.video_count) ?? "n/a"}\`
- reconciliation action: \`${asString(afterReconciliation.action) || "unknown"}\`
- reconciliation reason: \`${asString(afterReconciliation.reason) || "unknown"}\`
- scan mode: \`${asString(afterReconciliation.scan_mode) || "unknown"}\`
- safe for page request: \`${String(asBoolean(afterReconciliation.safe_for_page_request) ?? "unknown")}\`
${projectionLine("material projection", afterMaterialProjection)}
${projectionLine("production projection", afterProductionProjection)}
${projectionLine("process-history projection", afterProcessHistoryProjection)}

## Invariants

| invariant | status | detail |
| --- | --- | --- |
${renderGateRows(report.invariants)}

## Post-Reconcile Probes

| probe | request | status | gate | duration |
| --- | --- | ---: | --- | ---: |
${renderProbeRows(report.after.probes)}

## Result

- Status: \`${report.result.status}\`
- Passed: \`${String(report.result.passed)}\`
- Summary: ${report.result.summary}
`;
}

async function main(): Promise<void> {
  const apiBaseUrl = trimTrailingSlash(process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  const outputDir = process.env.MIXLAB_ADMIN_RECONCILE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const expectedLibraryRoot =
    process.env.MIXLAB_ADMIN_READ_MODEL_EXPECT_ROOT?.trim() ||
    process.env.MIXLAB_ADMIN_EXPECTED_LIBRARY_ROOT?.trim() ||
    DEFAULT_EXPECTED_LIBRARY_ROOT;
  const sessionToken = process.env.MIXLAB_ADMIN_SESSION_TOKEN?.trim() || undefined;
  const allowReconcile = process.env.MIXLAB_ADMIN_READ_MODEL_RECONCILE_ALLOW === "true";
  const forceReconcile = process.env.MIXLAB_ADMIN_READ_MODEL_RECONCILE_FORCE === "true";
  const pollTimeoutMs = parsePositiveInt(
    process.env.MIXLAB_ADMIN_READ_MODEL_RECONCILE_TIMEOUT_MS,
    DEFAULT_POLL_TIMEOUT_MS
  );
  const pollIntervalMs = parsePositiveInt(
    process.env.MIXLAB_ADMIN_READ_MODEL_RECONCILE_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS
  );
  const stableStatusTimeoutMs = parsePositiveInt(
    process.env.MIXLAB_ADMIN_READ_MODEL_STABLE_STATUS_TIMEOUT_MS,
    DEFAULT_STABLE_STATUS_TIMEOUT_MS
  );
  const minDiskAvailableBytes = parsePositiveInt(
    process.env.MIXLAB_ADMIN_READ_MODEL_MIN_DISK_BYTES,
    DEFAULT_MIN_DISK_AVAILABLE_BYTES
  );
  const logProgress = process.env.MIXLAB_ADMIN_READ_MODEL_RECONCILE_PROGRESS !== "false";
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));

  const health = await runProbe({ api_base_url: apiBaseUrl, session_token: sessionToken, name: "health", path: "/health" });
  const authStatus = await runProbe({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    name: "auth_status",
    path: "/api/admin/auth/status"
  });
  const beforeLibrary = await runProbe({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    name: "library_status_before",
    path: "/api/admin/library/status"
  });
  const beforeReadModel = await runProbe({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    name: "read_model_status_before",
    path: "/api/admin/read-model/status"
  });
  const beforeReconcile = await runProbe({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    name: "reconcile_status_before",
    path: "/api/admin/read-model/reconcile/status"
  });

  const preflightChecks = [
    gate("health", health.request.ok, `status=${health.request.http_status ?? "n/a"}`),
    gate("auth-status", authStatus.request.ok, `status=${authStatus.request.http_status ?? "n/a"}`),
    gate("library-status", beforeLibrary.request.ok, `status=${beforeLibrary.request.http_status ?? "n/a"}`),
    gate("read-model-status", beforeReadModel.request.ok, `status=${beforeReadModel.request.http_status ?? "n/a"}`),
    gate("reconcile-status", beforeReconcile.request.ok, `status=${beforeReconcile.request.http_status ?? "n/a"}`),
    ...buildPreflightChecks({
      expected_library_root: expectedLibraryRoot,
      library_status: beforeLibrary.request.data,
      read_model_status: beforeReadModel.request.data,
      reconcile_status: beforeReconcile.request.data,
      min_disk_available_bytes: minDiskAvailableBytes
    })
  ];

  const preflightPassed = preflightChecks.every((check) => check.passed);
  const beforeAdminReadModel = readModelOverview(beforeReadModel.request.data);
  const beforeReconciliation = reconciliationOverview(beforeReadModel.request.data);
  const alreadyFresh = asString(beforeAdminReadModel.freshness) === "fresh" &&
    asBoolean(beforeReconciliation.safe_for_page_request) === true;

  let mode: ReconcileReport["mode"] = allowReconcile ? "apply" : "dry-run";
  let startResponse: unknown = null;
  let terminalResponse: unknown = beforeReconcile.request.data;
  let actionStarted = false;
  let actionAccepted = false;
  let terminalStatus = asString(asRecord(beforeReconcile.request.data).status);
  let terminalPhase = asString(asRecord(beforeReconcile.request.data).phase);
  let pollCount = 0;
  let actionDurationMs: number | null = null;

  if (alreadyFresh && !forceReconcile) {
    mode = "skip";
  } else if (preflightPassed && allowReconcile) {
    const startedAt = performance.now();
    const started = await requestJson({
      api_base_url: apiBaseUrl,
      method: "POST",
      path: "/api/admin/read-model/reconcile",
      timeout_ms: 15_000,
      session_token: sessionToken
    });
    startResponse = started.data;
    actionStarted = true;
    actionAccepted = started.ok && asBoolean(asRecord(started.data).accepted) === true;
    if (!actionAccepted) {
      terminalResponse = asRecord(started.data).status ?? started.data;
      terminalStatus = asString(asRecord(terminalResponse).status);
      terminalPhase = asString(asRecord(terminalResponse).phase);
      actionDurationMs = roundMs(performance.now() - startedAt);
    } else {
      const polled = await pollReconcile({
        api_base_url: apiBaseUrl,
        session_token: sessionToken,
        poll_timeout_ms: pollTimeoutMs,
        poll_interval_ms: pollIntervalMs,
        log_progress: logProgress
      });
      terminalResponse = polled.status;
      terminalStatus = asString(asRecord(terminalResponse).status);
      terminalPhase = asString(asRecord(terminalResponse).phase);
      pollCount = polled.poll_count;
      actionDurationMs = roundMs(performance.now() - startedAt);
    }
  }

  const afterLibrary = await runProbe({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    name: "library_status_after",
    path: "/api/admin/library/status"
  });
  const afterReadModel = await waitForReadModelStatus({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    require_admin_fresh: actionStarted || alreadyFresh,
    require_source_fresh: asString(sourceVideoStatusOverview(beforeReadModel.request.data).freshness) === "fresh",
    timeout_ms: stableStatusTimeoutMs,
    poll_interval_ms: pollIntervalMs,
    log_progress: logProgress
  });
  const operationLog = await runProbe({
    api_base_url: apiBaseUrl,
    session_token: sessionToken,
    name: "operation_log",
    path: "/api/admin/operation-log?limit=20"
  });
  const postProbes = [
    await runProbe({
      api_base_url: apiBaseUrl,
      session_token: sessionToken,
      name: "source_videos_index_required",
      path: "/api/admin/source-videos?status=index-required&limit=20"
    }),
    await runProbe({
      api_base_url: apiBaseUrl,
      session_token: sessionToken,
      name: "source_videos_queued",
      path: "/api/admin/source-videos?status=queued&limit=20"
    }),
    await runProbe({
      api_base_url: apiBaseUrl,
      session_token: sessionToken,
      name: "preprocess_jobs",
      path: "/api/admin/preprocess/jobs?limit=20"
    }),
    await runProbe({
      api_base_url: apiBaseUrl,
      session_token: sessionToken,
      name: "process_history_readiness",
      path: "/api/admin/preprocess/process-history/readiness"
    }),
    await runProbe({
      api_base_url: apiBaseUrl,
      session_token: sessionToken,
      name: "process_history",
      path: "/api/admin/preprocess/process-history?limit=20&window_days=30"
    })
  ];
  const processHistoryReadinessProbe = postProbes.find((probe) => probe.name === "process_history_readiness");
  const processHistoryReadiness = asRecord(processHistoryReadinessProbe?.request.data);
  const processHistoryProbe = postProbes.find((probe) => probe.name === "process_history");
  const processHistory = asRecord(processHistoryProbe?.request.data);
  const shouldRequireProcessHistoryReady = allowReconcile || alreadyFresh;

  const invariants = [
    ...buildInvariantChecks({
      before_library_status: beforeLibrary.request.data,
      after_library_status: afterLibrary.request.data,
      before_read_model_status: beforeReadModel.request.data,
      after_read_model_status: afterReadModel.request.data,
      action_started: actionStarted,
      terminal_status: terminalStatus
    }),
    gate(
      "operation-log-readable",
      operationLog.request.ok,
      `status=${operationLog.request.http_status ?? "n/a"}`
    ),
    gate(
      "post-probes-pass",
      postProbes.every((probe) => probe.request.ok),
      postProbes.map((probe) => `${probe.name}:${probe.request.ok ? "ok" : probe.request.error_code ?? "fail"}`).join(", ")
    ),
    gate(
      "process-history-readiness-ready",
      !shouldRequireProcessHistoryReady ||
        (
          processHistoryReadinessProbe?.request.ok === true &&
          asBoolean(processHistoryReadiness.ready_for_process_history) === true &&
          asString(processHistoryReadiness.reason) === "ready"
        ),
      shouldRequireProcessHistoryReady
        ? `ready=${String(asBoolean(processHistoryReadiness.ready_for_process_history) ?? "unknown")}, reason=${asString(processHistoryReadiness.reason) || "unknown"}`
        : "not required in dry-run mode"
    ),
    gate(
      "process-history-no-scan-hit",
      !shouldRequireProcessHistoryReady ||
        (
          processHistoryProbe?.request.ok === true &&
          asBoolean(processHistory.history_available) === true &&
          asString(processHistory.actual_data_source) === "admin-read-model" &&
          asString(processHistory.scan_mode) === "no-scan"
        ),
      shouldRequireProcessHistoryReady
        ? `history_available=${String(asBoolean(processHistory.history_available) ?? "unknown")}, source=${asString(processHistory.actual_data_source) || "unknown"}, scan_mode=${asString(processHistory.scan_mode) || "unknown"}`
        : "not required in dry-run mode"
    )
  ];

  const applyPassed = preflightPassed &&
    ((alreadyFresh && !forceReconcile) ||
      (actionStarted && actionAccepted && (terminalStatus === "succeeded" || terminalStatus === "skipped"))) &&
    invariants.every((check) => check.passed);
  const dryRunPassed = preflightPassed && !allowReconcile;
  const passed = allowReconcile || alreadyFresh ? applyPassed : dryRunPassed;
  const status: ReconcileReport["result"]["status"] = passed
    ? allowReconcile || alreadyFresh
      ? "passed"
      : "dry-run"
    : "failed";

  const report: ReconcileReport = {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: "tsx scripts/acceptance/admin-read-model-reconcile.ts",
    mode,
    api_base_url: apiBaseUrl,
    expected_library_root: expectedLibraryRoot,
    allow_reconcile: allowReconcile,
    force_reconcile: forceReconcile,
    preflight: {
      passed: preflightPassed,
      checks: preflightChecks
    },
    before: {
      library_status: beforeLibrary.request.data,
      read_model_status: beforeReadModel.request.data,
      reconcile_status: beforeReconcile.request.data
    },
    action: {
      started: actionStarted,
      accepted: actionAccepted,
      terminal_status: terminalStatus,
      terminal_phase: terminalPhase,
      poll_count: pollCount,
      duration_ms: actionDurationMs,
      start_response: startResponse,
      terminal_response: terminalResponse
    },
    after: {
      library_status: afterLibrary.request.data,
      read_model_status: afterReadModel.request.data,
      operation_log: operationLog.request.data,
      probes: postProbes
    },
    invariants,
    result: {
      passed,
      status,
      summary: passed
        ? actionStarted
          ? "admin.sqlite reconcile completed and post-run invariants passed."
          : alreadyFresh
          ? "admin.sqlite was already fresh and safe for page requests."
          : "Preflight passed; reconcile was not started because allow flag is not enabled."
        : "One or more reconcile gates failed. Inspect preflight, terminal status, and invariants."
    }
  };

  const jsonPath = path.join(outputDir, `admin-read-model-reconcile-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-read-model-reconcile-${stamp}.md`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(JSON.stringify({
    ok: report.result.passed,
    status: report.result.status,
    json_path: jsonPath,
    markdown_path: markdownPath,
    generated_at: report.generated_at,
    mode: report.mode,
    action_started: report.action.started,
    terminal_status: report.action.terminal_status,
    failed_gates: [
      ...report.preflight.checks,
      ...report.invariants
    ].filter((check) => !check.passed).map((check) => check.name)
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
