import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_ADMIN_WEB_URL = "http://127.0.0.1:5176/";
const DEFAULT_ADMIN_API_BASE_URL = "http://127.0.0.1:3889/";
const DEFAULT_CUTTER_WEB_URL = "http://127.0.0.1:5177/";
const DEFAULT_CUTTER_API_BASE_URL = "http://127.0.0.1:3789/";
const DEFAULT_SEARCHD_BASE_URL = "http://127.0.0.1:3799/";
const DEFAULT_LOCAL_WEB_REPORT_PATH = "docs/acceptance/artifacts/local-web-sanity.json";
const DEFAULT_REAL_NAS_50_REPORT_PATH = "docs/acceptance/artifacts/real-nas-50-editor-report.json";
const DEFAULT_QUERY = "现金流";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_WAIT_MS = 0;
const DEFAULT_POLL_MS = 3_000;

type FetchLike = typeof fetch;

interface EndpointStatus {
  label: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

interface LiveLocalRealNasStatus {
  admin_index_version: string;
  admin_ready_video_count: number;
  admin_total_video_count: number;
  admin_queued_count: number;
  admin_processing_count: number;
  admin_failed_count: number;
  admin_index_required_count: number;
  public_library_root: string;
  searchd_index_version: string;
  searchd_source_video_count: number;
  searchd_transcript_segment_count: number;
  cutter_public_available_video_count: number;
  cutter_search_query: string;
  cutter_search_index_version: string;
  cutter_search_mode: string;
  cutter_search_ms: number;
  cutter_search_returned_count: number;
  cutter_search_first_source_video_id: string;
  cutter_search_first_segment_id: string;
  cutter_search_first_segment_contains_query: boolean;
}

interface SavedLocalRealNasStatus {
  local_web_report_path: string;
  local_web_index_version: string;
  local_web_source_video_count: number;
  local_web_transcript_segment_count: number;
  local_web_local_clip_id: string;
  real_nas_50_report_path: string;
  real_nas_50_index_version: string;
  real_nas_50_source_video_count: number;
  real_nas_50_transcript_segment_count: number;
  real_nas_50_editor_count: number;
  real_nas_50_search_query_count: number;
}

export interface LocalRealNasStatusReport {
  ok: boolean;
  read_only: true;
  ready_for_manual_web_test: boolean;
  ready_for_evidence_refresh: boolean;
  attempt_count: number;
  waited_ms: number;
  errors: string[];
  warnings: string[];
  endpoints: EndpointStatus[];
  live: LiveLocalRealNasStatus;
  saved: SavedLocalRealNasStatus;
}

interface LocalRealNasStatusOptions {
  adminWebUrl?: string;
  adminApiBaseUrl?: string;
  cutterWebUrl?: string;
  cutterApiBaseUrl?: string;
  searchdBaseUrl?: string;
  query?: string;
  localWebReportPath?: string;
  realNas50ReportPath?: string;
  timeoutMs?: number;
  waitMs?: number;
  pollMs?: number;
  fetchImpl?: FetchLike;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numericEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampPollMs(value: number): number {
  return Math.max(250, Math.min(60_000, Math.floor(value)));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function envUrl(names: string[], fallback: string): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return normalizeBaseUrl(value);
    }
  }

  return fallback;
}

function endpointUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
  const url = new URL(path.replace(/^\/+/, ""), normalizeBaseUrl(baseUrl));
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchJson(input: {
  url: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
}): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.url, {
      method: "GET",
      signal: controller.signal
    });
    const text = await response.text();
    let parsed: unknown = {};
    if (text.trim()) {
      parsed = JSON.parse(text);
    }

    return {
      ok: response.ok,
      status: response.status,
      data: parsed
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {},
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function envelopeData(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return isRecord(value.data) ? value.data : value;
}

async function checkEndpoint(input: {
  label: string;
  url: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
}): Promise<EndpointStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.url, {
      method: "GET",
      signal: controller.signal
    });
    await response.arrayBuffer();
    return {
      label: input.label,
      url: input.url,
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      label: input.label,
      url: input.url,
      ok: false,
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function savedStatusFromReports(input: {
  localWebReportPath: string;
  localWebReport: Record<string, unknown>;
  realNas50ReportPath: string;
  realNas50Report: Record<string, unknown>;
}): SavedLocalRealNasStatus {
  const searchdIndex = isRecord(input.localWebReport.searchd_index) ? input.localWebReport.searchd_index : {};
  const closedLoop = isRecord(input.localWebReport.material_locator_closed_loop)
    ? input.localWebReport.material_locator_closed_loop
    : {};
  const realNasUsage = isRecord(input.realNas50Report.metrics) && isRecord(input.realNas50Report.metrics.usage)
    ? input.realNas50Report.metrics.usage
    : {};

  return {
    local_web_report_path: input.localWebReportPath,
    local_web_index_version: stringField(searchdIndex, "index_version"),
    local_web_source_video_count: numberField(searchdIndex, "source_video_count"),
    local_web_transcript_segment_count: numberField(searchdIndex, "segment_count"),
    local_web_local_clip_id: stringField(closedLoop, "local_clip_id"),
    real_nas_50_report_path: input.realNas50ReportPath,
    real_nas_50_index_version: stringField(input.realNas50Report, "search_index_version"),
    real_nas_50_source_video_count: numberField(input.realNas50Report, "indexed_source_video_count"),
    real_nas_50_transcript_segment_count: numberField(input.realNas50Report, "indexed_transcript_segment_count"),
    real_nas_50_editor_count: numberField(input.realNas50Report, "editor_count") ||
      numberField(realNasUsage, "active_user_count"),
    real_nas_50_search_query_count: numberField(input.realNas50Report, "search_query_count")
  };
}

export function evaluateLocalRealNasStatus(input: {
  endpoints: EndpointStatus[];
  live: LiveLocalRealNasStatus;
  saved: SavedLocalRealNasStatus;
}): {
  errors: string[];
  warnings: string[];
  ready_for_manual_web_test: boolean;
  ready_for_evidence_refresh: boolean;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const evidenceRefreshBlockingWarnings: string[] = [];
  for (const endpoint of input.endpoints) {
    if (!endpoint.ok) {
      errors.push(`${endpoint.label} endpoint is not reachable`);
    }
  }
  if (!input.live.public_library_root.includes("PublicLibrary")) {
    errors.push("admin public library root must point to PublicLibrary");
  }
  if (!input.live.admin_index_version) {
    errors.push("admin current index version is missing");
  }
  if (!input.live.searchd_index_version) {
    errors.push("searchd index version is missing");
  }
  if (input.live.cutter_search_mode !== "searchd") {
    errors.push("cutter search must use searchd");
  }
  if (input.live.cutter_search_returned_count <= 0) {
    errors.push("cutter search must return at least one result");
  }
  if (!input.live.cutter_search_first_segment_contains_query) {
    errors.push("cutter first search hit must contain the audited query");
  }
  if (input.live.admin_index_version && input.live.searchd_index_version &&
    input.live.admin_index_version !== input.live.searchd_index_version) {
    const warning = `admin current index ${input.live.admin_index_version} differs from searchd ${input.live.searchd_index_version}; searchd may still be hot-refreshing`;
    warnings.push(warning);
    evidenceRefreshBlockingWarnings.push(warning);
  }
  if (input.live.searchd_index_version && input.live.cutter_search_index_version &&
    input.live.searchd_index_version !== input.live.cutter_search_index_version) {
    const warning = `cutter search index ${input.live.cutter_search_index_version} differs from searchd ${input.live.searchd_index_version}`;
    warnings.push(warning);
    evidenceRefreshBlockingWarnings.push(warning);
  }
  if (input.live.searchd_source_video_count > 0 &&
    input.live.cutter_public_available_video_count > 0 &&
    input.live.searchd_source_video_count !== input.live.cutter_public_available_video_count) {
    const warning = `cutter public library count ${input.live.cutter_public_available_video_count} differs from searchd source count ${input.live.searchd_source_video_count}`;
    warnings.push(warning);
    evidenceRefreshBlockingWarnings.push(warning);
  }
  if (input.saved.local_web_index_version && input.live.searchd_index_version &&
    input.saved.local_web_index_version !== input.live.searchd_index_version) {
    warnings.push(
      `saved local Web report ${input.saved.local_web_index_version} differs from live searchd ${input.live.searchd_index_version}`
    );
  }
  if (input.saved.real_nas_50_index_version && input.live.searchd_index_version &&
    input.saved.real_nas_50_index_version !== input.live.searchd_index_version) {
    warnings.push(
      `saved 50-editor report ${input.saved.real_nas_50_index_version} differs from live searchd ${input.live.searchd_index_version}`
    );
  }

  return {
    errors,
    warnings,
    ready_for_manual_web_test: errors.length === 0,
    ready_for_evidence_refresh: errors.length === 0 && evidenceRefreshBlockingWarnings.length === 0
  };
}

async function collectLocalRealNasStatusSnapshot(input: {
  adminWebUrl: string;
  adminApiBaseUrl: string;
  cutterWebUrl: string;
  cutterApiBaseUrl: string;
  searchdBaseUrl: string;
  query: string;
  localWebReportPath: string;
  realNas50ReportPath: string;
  timeoutMs: number;
  fetchImpl: FetchLike;
  attemptCount: number;
  waitedMs: number;
}): Promise<LocalRealNasStatusReport> {
  const {
    adminWebUrl,
    adminApiBaseUrl,
    cutterWebUrl,
    cutterApiBaseUrl,
    searchdBaseUrl,
    query,
    localWebReportPath,
    realNas50ReportPath,
    timeoutMs,
    fetchImpl,
    attemptCount,
    waitedMs
  } = input;
  const urls = {
    adminStatus: endpointUrl(adminApiBaseUrl, "/api/admin/library/status"),
    cutterHealth: endpointUrl(cutterApiBaseUrl, "/health"),
    cutterSourceLibrary: endpointUrl(cutterApiBaseUrl, "/cutter/source-library", { limit: "1" }),
    cutterSearch: endpointUrl(cutterApiBaseUrl, "/cutter/source-search", { query, limit: "1" }),
    searchdHealth: endpointUrl(searchdBaseUrl, "/health")
  };
  const [
    adminWebEndpoint,
    cutterWebEndpoint,
    adminApiEndpoint,
    cutterApiEndpoint,
    searchdEndpoint,
    adminStatusResponse,
    searchdHealthResponse,
    cutterSourceLibraryResponse,
    cutterSearchResponse,
    localWebReport,
    realNas50Report
  ] = await Promise.all([
    checkEndpoint({ label: "admin web", url: adminWebUrl, timeoutMs, fetchImpl }),
    checkEndpoint({ label: "cutter web", url: cutterWebUrl, timeoutMs, fetchImpl }),
    checkEndpoint({ label: "admin api", url: urls.adminStatus, timeoutMs, fetchImpl }),
    checkEndpoint({ label: "cutter api", url: urls.cutterHealth, timeoutMs, fetchImpl }),
    checkEndpoint({ label: "searchd", url: urls.searchdHealth, timeoutMs, fetchImpl }),
    fetchJson({ url: urls.adminStatus, timeoutMs, fetchImpl }),
    fetchJson({ url: urls.searchdHealth, timeoutMs, fetchImpl }),
    fetchJson({ url: urls.cutterSourceLibrary, timeoutMs, fetchImpl }),
    fetchJson({ url: urls.cutterSearch, timeoutMs, fetchImpl }),
    readJsonFile(localWebReportPath),
    readJsonFile(realNas50ReportPath)
  ]);
  const adminStatus = envelopeData(adminStatusResponse.data);
  const searchdHealth = envelopeData(searchdHealthResponse.data);
  const sourceLibrary = envelopeData(cutterSourceLibraryResponse.data);
  const cutterSearch = envelopeData(cutterSearchResponse.data);
  const groups = Array.isArray(cutterSearch.groups) ? cutterSearch.groups.filter(isRecord) : [];
  const firstGroup = groups[0] ?? {};
  const hitSegments = Array.isArray(firstGroup.hit_segments) ? firstGroup.hit_segments.filter(isRecord) : [];
  const firstSegment = hitSegments[0] ?? {};
  const firstSegmentText = stringField(firstSegment, "text");
  const live: LiveLocalRealNasStatus = {
    admin_index_version: stringField(adminStatus, "current_index_version"),
    admin_ready_video_count: numberField(adminStatus, "ready_video_count"),
    admin_total_video_count: numberField(adminStatus, "video_count"),
    admin_queued_count: numberField(adminStatus, "queued_video_count"),
    admin_processing_count: numberField(adminStatus, "processing_video_count"),
    admin_failed_count: numberField(adminStatus, "failed_video_count"),
    admin_index_required_count: numberField(adminStatus, "index_required_video_count"),
    public_library_root: stringField(adminStatus, "root_path"),
    searchd_index_version: stringField(searchdHealth, "index_version"),
    searchd_source_video_count: numberField(searchdHealth, "source_video_count"),
    searchd_transcript_segment_count: numberField(searchdHealth, "segment_count"),
    cutter_public_available_video_count: numberField(sourceLibrary, "available_video_count"),
    cutter_search_query: query,
    cutter_search_index_version: stringField(cutterSearch, "index_version"),
    cutter_search_mode: stringField(cutterSearch, "search_mode"),
    cutter_search_ms: numberField(cutterSearch, "search_ms"),
    cutter_search_returned_count: numberField(cutterSearch, "returned_count"),
    cutter_search_first_source_video_id: stringField(firstGroup, "source_video_id"),
    cutter_search_first_segment_id: stringField(firstSegment, "segment_id"),
    cutter_search_first_segment_contains_query: firstSegmentText.includes(query)
  };
  const saved = savedStatusFromReports({
    localWebReportPath,
    localWebReport,
    realNas50ReportPath,
    realNas50Report
  });
  const endpoints = [
    adminWebEndpoint,
    cutterWebEndpoint,
    adminApiEndpoint,
    cutterApiEndpoint,
    searchdEndpoint
  ];
  const evaluation = evaluateLocalRealNasStatus({ endpoints, live, saved });

  return {
    ok: evaluation.errors.length === 0,
    read_only: true,
    ready_for_manual_web_test: evaluation.ready_for_manual_web_test,
    ready_for_evidence_refresh: evaluation.ready_for_evidence_refresh,
    attempt_count: attemptCount,
    waited_ms: waitedMs,
    errors: evaluation.errors,
    warnings: evaluation.warnings,
    endpoints,
    live,
    saved
  };
}

export async function runLocalRealNasStatus(
  options: LocalRealNasStatusOptions = {}
): Promise<LocalRealNasStatusReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const waitMs = Math.max(0, Math.floor(
    options.waitMs ?? numericEnv("MIXLAB_LOCAL_REAL_NAS_STATUS_WAIT_MS", DEFAULT_WAIT_MS)
  ));
  const pollMs = clampPollMs(options.pollMs ?? numericEnv("MIXLAB_LOCAL_REAL_NAS_STATUS_POLL_MS", DEFAULT_POLL_MS));
  const adminWebUrl = normalizeBaseUrl(options.adminWebUrl ?? envUrl(
    ["MIXLAB_ADMIN_WEB_URL", "MIXLAB_ADMIN_WEB_BASE_URL"],
    DEFAULT_ADMIN_WEB_URL
  ));
  const adminApiBaseUrl = normalizeBaseUrl(options.adminApiBaseUrl ?? envUrl(
    ["MIXLAB_ADMIN_API_BASE_URL"],
    DEFAULT_ADMIN_API_BASE_URL
  ));
  const cutterWebUrl = normalizeBaseUrl(options.cutterWebUrl ?? envUrl(
    ["MIXLAB_CUTTER_WEB_URL", "MIXLAB_CUTTER_WEB_BASE_URL"],
    DEFAULT_CUTTER_WEB_URL
  ));
  const cutterApiBaseUrl = normalizeBaseUrl(options.cutterApiBaseUrl ?? envUrl(
    ["MIXLAB_CUTTER_API_BASE_URL"],
    DEFAULT_CUTTER_API_BASE_URL
  ));
  const searchdBaseUrl = normalizeBaseUrl(options.searchdBaseUrl ?? envUrl(
    ["MIXLAB_SEARCHD_BASE_URL"],
    DEFAULT_SEARCHD_BASE_URL
  ));
  const query = options.query ?? process.env.MIXLAB_LOCAL_REAL_NAS_STATUS_QUERY ?? DEFAULT_QUERY;
  const localWebReportPath = options.localWebReportPath ??
    process.env.MIXLAB_LOCAL_WEB_SANITY_REPORT ??
    DEFAULT_LOCAL_WEB_REPORT_PATH;
  const realNas50ReportPath = options.realNas50ReportPath ??
    process.env.MIXLAB_REAL_NAS_50_REPORT_PATH ??
    DEFAULT_REAL_NAS_50_REPORT_PATH;
  const startedAt = Date.now();
  let attemptCount = 0;
  let lastReport: LocalRealNasStatusReport | undefined;

  do {
    if (attemptCount > 0) {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, waitMs - elapsed);
      await wait(Math.min(pollMs, remaining));
    }
    attemptCount += 1;
    lastReport = await collectLocalRealNasStatusSnapshot({
      adminWebUrl,
      adminApiBaseUrl,
      cutterWebUrl,
      cutterApiBaseUrl,
      searchdBaseUrl,
      query,
      localWebReportPath,
      realNas50ReportPath,
      timeoutMs,
      fetchImpl,
      attemptCount,
      waitedMs: Date.now() - startedAt
    });
  } while (
    waitMs > 0 &&
      lastReport.ok &&
      !lastReport.ready_for_evidence_refresh &&
      Date.now() - startedAt < waitMs
  );

  if (!lastReport) {
    throw new Error("local real NAS status did not run");
  }

  return lastReport;
}

async function main(): Promise<void> {
  const report = await runLocalRealNasStatus();
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
