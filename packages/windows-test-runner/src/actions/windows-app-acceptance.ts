import { runLaunchAppProbe } from "./launch-app-probe.ts";
import type {
  ApiProbeResult,
  AppRuntimeSmokeReport,
  CacheSmokeReport,
  CutPhaseTimingSummary,
  CutJobsSmokeSummary,
  FailureCategory,
  RealCutSmokeReport,
  RealDataSmokeReport,
  RuntimeCacheBucketSummary,
  RuntimeStatusSmokeSummary,
  SearchSmokeSummary,
  SourceLibrarySmokeSummary,
  SourceVideoDetailSmokeSummary,
  WindowsAcceptanceReport
} from "../types.ts";

interface SmokeResult<TReport> {
  report: TReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}

interface JsonRequestResult {
  check: ApiProbeResult;
  body: unknown;
}

interface CutterAuthHeaders {
  device_id: string;
  session_token: string;
}

interface CutterAuthCredentials {
  username: string;
  password: string;
  device_id: string;
  device_name: string;
}

interface ResolvedCutterAuth {
  headers?: CutterAuthHeaders;
  source: "none" | "headers" | "credentials";
  login_check?: ApiProbeResult;
  failure_message?: string;
}

const DEFAULT_QUERIES = ["第一场", "现金流", "中国", "2026"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dataRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return {};
  }
  return isRecord(body.data) ? body.data : body;
}

function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function getBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function getArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const strings = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return strings.length > 0 ? strings : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readAuthHeaders(options: Record<string, unknown> | undefined): CutterAuthHeaders | undefined {
  const auth = options?.auth_headers;
  if (!isRecord(auth)) {
    return undefined;
  }
  const deviceId = getString(auth, ["device_id", "deviceId"]);
  const sessionToken = getString(auth, ["session_token", "sessionToken"]);
  if (!deviceId || !sessionToken) {
    return undefined;
  }
  return {
    device_id: deviceId,
    session_token: sessionToken
  };
}

function readAuthCredentials(options: Record<string, unknown> | undefined): CutterAuthCredentials | undefined {
  const credentials = options?.auth_credentials;
  if (!isRecord(credentials)) {
    return undefined;
  }
  const username = getString(credentials, ["username", "user_name"]);
  const password = getString(credentials, ["password"]);
  const deviceId = getString(credentials, ["device_id", "deviceId"]);
  const deviceName = getString(credentials, ["device_name", "deviceName"]) ?? "MixLab Windows Test Runner";
  if (!username || !password || !deviceId) {
    return undefined;
  }
  return {
    username,
    password,
    device_id: deviceId,
    device_name: deviceName
  };
}

function authHeaderRecord(auth: CutterAuthHeaders | undefined): Record<string, string> {
  return auth
    ? {
        "X-MixLab-Device-Id": auth.device_id,
        "X-MixLab-Session-Token": auth.session_token
      }
    : {};
}

async function resolveAuthHeaders(input: {
  baseUrl: string;
  timeoutMs: number;
  options?: Record<string, unknown>;
}): Promise<ResolvedCutterAuth> {
  const suppliedHeaders = readAuthHeaders(input.options);
  if (suppliedHeaders) {
    return {
      headers: suppliedHeaders,
      source: "headers"
    };
  }

  const credentials = readAuthCredentials(input.options);
  if (!credentials) {
    return { source: "none" };
  }

  const login = await requestJson({
    id: "auth_login",
    path: "/cutter/auth/login",
    baseUrl: input.baseUrl,
    timeoutMs: input.timeoutMs,
    method: "POST",
    includeBody: false,
    body: {
      username: credentials.username,
      password: credentials.password,
      device_id: credentials.device_id,
      device_name: credentials.device_name
    }
  });

  if (!login.check.ok) {
    return {
      source: "credentials",
      login_check: login.check,
      failure_message: login.check.error ?? `Cutter login failed with status ${login.check.status_code ?? "n/a"}.`
    };
  }

  const data = dataRecord(login.body);
  const session = isRecord(data.session) ? data.session : {};
  const deviceId = getString(session, ["device_id", "deviceId"]);
  const sessionToken = getString(session, ["session_token", "sessionToken"]);
  if (!deviceId || !sessionToken) {
    return {
      source: "credentials",
      login_check: login.check,
      failure_message: "Cutter login did not return a usable session."
    };
  }

  return {
    headers: {
      device_id: deviceId,
      session_token: sessionToken
    },
    source: "credentials",
    login_check: login.check
  };
}

function buildUrl(baseUrl: string, pathName: string): string {
  return new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 1000);
  }
}

async function requestJson(input: {
  id: string;
  path: string;
  baseUrl: string;
  timeoutMs: number;
  includeBody?: boolean;
  method?: "GET" | "POST";
  body?: unknown;
  auth?: CutterAuthHeaders;
}): Promise<JsonRequestResult> {
  const url = buildUrl(input.baseUrl, input.path);
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const headers = {
    ...authHeaderRecord(input.auth),
    ...(input.body === undefined ? {} : { "content-type": "application/json" })
  };
  try {
    const response = await fetch(url, {
      method: input.method ?? "GET",
      headers: Object.keys(headers).length === 0 ? undefined : headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal
    });
    const body = await readResponseBody(response);
    const check: ApiProbeResult = {
      id: input.id,
      path: input.path,
      url,
      ok: response.ok,
      status_code: response.status,
      elapsed_ms: Date.now() - started
    };
    if (input.includeBody !== false) {
      check.body = body;
    }
    return { check, body };
  } catch (error) {
    return {
      check: {
        id: input.id,
        path: input.path,
        url,
        ok: false,
        status_code: null,
        elapsed_ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      },
      body: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sourceLibrarySummary(body: unknown, elapsedMs: number): SourceLibrarySmokeSummary {
  const data = dataRecord(body);
  const videos = getArray(data, ["videos", "items", "source_videos"]);
  const firstVideo = isRecord(videos[0]) ? videos[0] : {};
  const availableVideoCount = getNumber(data, [
    "available_video_count",
    "total",
    "total_count",
    "count"
  ]) ?? videos.length;

  return {
    library_id: getString(data, ["library_id"]),
    available_video_count: availableVideoCount,
    returned_count: videos.length,
    first_source_video_id: getString(firstVideo, ["source_video_id", "id"]),
    first_title: getString(firstVideo, ["title", "name"]),
    elapsed_ms: elapsedMs
  };
}

function cacheBucketSummary(record: Record<string, unknown> | undefined, sizeKeys: string[]): RuntimeCacheBucketSummary | undefined {
  if (!record) {
    return undefined;
  }
  return {
    cache_root_path: getString(record, ["cache_root_path", "root_path", "path"]),
    size_bytes: getNumber(record, sizeKeys),
    file_count: getNumber(record, ["file_count", "entry_count", "cached_release_count"]),
    cached_video_count: getNumber(record, ["cached_video_count"]),
    max_bytes: getNumber(record, ["max_bytes", "cache_max_bytes"]),
    last_error: getString(record, ["last_error", "error"])
  };
}

function runtimeStatusSummary(body: unknown, elapsedMs: number): RuntimeStatusSmokeSummary {
  const data = dataRecord(body);
  const releaseCache = isRecord(data.release_cache) ? data.release_cache : undefined;
  const localCache = isRecord(data.local_cache) ? data.local_cache : undefined;
  const sourceVideoCache = localCache && isRecord(localCache.source_video_cache)
    ? localCache.source_video_cache
    : undefined;
  const cutTempCache = localCache && isRecord(localCache.cut_temp_cache)
    ? localCache.cut_temp_cache
    : undefined;

  const thumbnailCacheRecord = localCache
    ? {
        cache_root_path: localCache.thumbnail_cache_root_path,
        size_bytes: localCache.thumbnail_cache_size_bytes,
        max_bytes: localCache.thumbnail_cache_max_bytes,
        file_count: localCache.thumbnail_cache_manifest_entry_count
      }
    : undefined;

  return {
    mode: getString(data, ["mode"]),
    mode_label: getString(data, ["mode_label"]),
    api_ready: getBoolean(data, ["api_ready"]),
    auth_mode: getString(data, ["auth_mode"]),
    library_id: getString(data, ["library_id"]),
    library_root_label: getString(data, ["library_root_label"]),
    library_root_path: getString(data, ["library_root_path"]),
    available_video_count: getNumber(data, ["available_video_count"]),
    workspace_enabled: getBoolean(data, ["workspace_enabled"]),
    workspace_root_label: getString(data, ["workspace_root_label"]),
    workspace_root_path: getString(data, ["workspace_root_path"]),
    ffmpeg_status: getString(data, ["ffmpeg_status"]),
    ffmpeg_source: getString(data, ["ffmpeg_source"]),
    release_cache: cacheBucketSummary(releaseCache, ["size_bytes", "cache_size_bytes"]),
    thumbnail_cache: cacheBucketSummary(thumbnailCacheRecord, ["size_bytes", "thumbnail_cache_size_bytes"]),
    source_video_cache: cacheBucketSummary(sourceVideoCache, ["size_bytes", "cache_size_bytes"]),
    cut_temp_cache: cacheBucketSummary(cutTempCache, ["size_bytes", "cache_size_bytes"]),
    source_video_preflight: data.source_video_preflight,
    elapsed_ms: elapsedMs
  };
}

function searchSummary(query: string, body: unknown, elapsedMs: number): SearchSmokeSummary {
  const data = dataRecord(body);
  const groups = getArray(data, ["groups"]);
  const firstGroup = isRecord(groups[0]) ? groups[0] : {};
  let totalHitCount = 0;
  for (const group of groups) {
    if (isRecord(group)) {
      totalHitCount += getNumber(group, ["hit_count"]) ?? 0;
    }
  }

  return {
    query,
    elapsed_ms: elapsedMs,
    returned_group_count: groups.length,
    total_hit_count: totalHitCount,
    search_ms: getNumber(data, ["search_ms"]),
    search_mode: getString(data, ["search_mode"]),
    first_source_video_id: getString(firstGroup, ["source_video_id", "id"]),
    first_title: getString(firstGroup, ["title", "name"]),
    first_detail_url: getString(firstGroup, ["detail_url"])
  };
}

function sourceVideoDetailSummary(sourceVideoId: string, body: unknown, elapsedMs: number): SourceVideoDetailSmokeSummary {
  const data = dataRecord(body);
  const transcript = isRecord(data.transcript) ? data.transcript : {};
  const segments = getArray(transcript, ["segments"]);
  const fullText = getString(transcript, ["full_text"]) ?? "";
  let segmentTextLength = 0;
  for (const segment of segments) {
    if (isRecord(segment)) {
      segmentTextLength += (getString(segment, ["text"]) ?? "").length;
    }
  }

  return {
    source_video_id: getString(data, ["source_video_id", "id"]) ?? sourceVideoId,
    title: getString(data, ["title", "name"]),
    elapsed_ms: elapsedMs,
    transcript_character_count: fullText.length > 0 ? fullText.length : segmentTextLength,
    transcript_segment_count: segments.length
  };
}

function firstTranscriptSegment(body: unknown): Record<string, unknown> | undefined {
  const data = dataRecord(body);
  const transcript = isRecord(data.transcript) ? data.transcript : {};
  return getArray(transcript, ["segments"]).find((segment) => {
    if (!isRecord(segment)) {
      return false;
    }
    const beginMs = getNumber(segment, ["begin_ms"]);
    const endMs = getNumber(segment, ["end_ms"]);
    const text = getString(segment, ["text"]);
    return beginMs !== undefined && endMs !== undefined && endMs > beginMs && Boolean(text);
  }) as Record<string, unknown> | undefined;
}

function safeSmokeId(date = new Date()): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function phaseTimingSummary(value: unknown): CutPhaseTimingSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((phase) => ({
      phase_id: getString(phase, ["phase_id"]),
      label: getString(phase, ["label"]),
      status: getString(phase, ["status"]),
      duration_ms: getNumber(phase, ["duration_ms"])
    }));
}

function runNextSummary(body: unknown): Record<string, unknown> {
  return dataRecord(body);
}

function cutJobsSummary(body: unknown, elapsedMs: number): CutJobsSmokeSummary {
  const data = dataRecord(body);
  const jobs = getArray(data, ["jobs", "items"]);
  let pendingCount = 0;
  let runningCount = 0;
  let doneCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  for (const job of jobs) {
    if (!isRecord(job)) {
      continue;
    }
    const status = getString(job, ["status"]);
    if (status === "pending") {
      pendingCount += 1;
    } else if (status === "running") {
      runningCount += 1;
    } else if (status === "done") {
      doneCount += 1;
    } else if (status === "failed") {
      failedCount += 1;
    } else if (status === "cancelled") {
      cancelledCount += 1;
    }
  }

  return {
    elapsed_ms: elapsedMs,
    job_count: getNumber(data, ["job_count", "total", "total_count", "count"]) ?? jobs.length,
    pending_count: pendingCount,
    running_count: runningCount,
    done_count: doneCount,
    failed_count: failedCount,
    cancelled_count: cancelledCount
  };
}

function observedCacheBuckets(runtime: RuntimeStatusSmokeSummary | undefined): RuntimeCacheBucketSummary[] {
  if (!runtime) {
    return [];
  }
  return [
    runtime.release_cache,
    runtime.thumbnail_cache,
    runtime.source_video_cache,
    runtime.cut_temp_cache
  ].filter((bucket): bucket is RuntimeCacheBucketSummary => Boolean(bucket));
}

export async function runAppRuntimeSmoke(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<SmokeResult<AppRuntimeSmokeReport>> {
  const timeoutMs = readPositiveNumber(input.options?.api_probe_timeout_ms, 5000);
  const maxLibraryElapsedMs = readPositiveNumber(input.options?.public_library_max_elapsed_ms, 1000);
  let resolvedAuth = await resolveAuthHeaders({
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    options: {
      auth_headers: input.options?.auth_headers
    }
  });
  let authHeaders = resolvedAuth.headers;
  const launch = await runLaunchAppProbe({
    apiBaseUrl: input.apiBaseUrl,
    options: {
      ...input.options,
      skip_api_probe: true
    },
    onEvent: input.onEvent
  });
  const checks: ApiProbeResult[] = [];
  const report: AppRuntimeSmokeReport = {
    api_base_url: input.apiBaseUrl,
    launch_app_probe: launch.report,
    checks,
    public_library_max_elapsed_ms: maxLibraryElapsedMs,
    auth_source: resolvedAuth.source
  };

  if (!launch.passed) {
    return {
      report,
      passed: false,
      failure_category: launch.failure_category,
      failure_message: launch.failure_message
    };
  }

  await input.onEvent?.("app_runtime_auth", "Checking desktop auth mode.");
  const auth = await requestJson({
    id: "auth_mode",
    path: "/cutter/auth/mode",
    baseUrl: input.apiBaseUrl,
    timeoutMs
  });
  checks.push(auth.check);
  const authData = dataRecord(auth.body);
  const authMode = getString(authData, ["auth_mode", "mode"]);
  const localTrusted = getBoolean(authData, ["local_trusted"]) === true || authMode === "local_trusted";
  report.auth_mode = authMode;
  report.local_trusted = localTrusted;
  if (!auth.check.ok) {
    return {
      report,
      passed: false,
      failure_category: "api_auth_failure",
      failure_message: auth.check.error ?? `Auth mode probe failed with status ${auth.check.status_code ?? "n/a"}.`
    };
  }
  if (!localTrusted && authMode !== "reviewed") {
    return {
      report,
      passed: false,
      failure_category: "api_auth_failure",
      failure_message: `Auth mode is ${authMode ?? "unknown"}, expected local_trusted or reviewed.`
    };
  }
  if (!localTrusted && !authHeaders) {
    await input.onEvent?.("app_runtime_login", "Logging in with supplied Cutter credentials for reviewed auth.");
    resolvedAuth = await resolveAuthHeaders({
      baseUrl: input.apiBaseUrl,
      timeoutMs,
      options: input.options
    });
    authHeaders = resolvedAuth.headers;
    report.auth_source = resolvedAuth.source;
    if (resolvedAuth.login_check) {
      checks.push(resolvedAuth.login_check);
    }
    if (!authHeaders) {
      return {
        report,
        passed: false,
        failure_category: "api_auth_failure",
        failure_message: resolvedAuth.failure_message ?? "Reviewed auth requires options.auth_headers or options.auth_credentials."
      };
    }
  }

  await input.onEvent?.("app_runtime_status", "Reading cutter runtime status.");
  const runtime = await requestJson({
    id: "runtime_status",
    path: "/cutter/runtime-status",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(runtime.check);
  report.runtime_status = runtimeStatusSummary(runtime.body, runtime.check.elapsed_ms);
  if (!runtime.check.ok) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: runtime.check.error ?? `Runtime status failed with status ${runtime.check.status_code ?? "n/a"}.`
    };
  }

  await input.onEvent?.("app_runtime_source_library", "Reading public source library first page.");
  const library = await requestJson({
    id: "source_library_first_page",
    path: "/cutter/source-library?limit=20",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(library.check);
  report.source_library = sourceLibrarySummary(library.body, library.check.elapsed_ms);
  if (!library.check.ok || report.source_library.available_video_count <= 0 || report.source_library.returned_count <= 0) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: library.check.error ?? "Source library did not return visible real data."
    };
  }
  if (library.check.elapsed_ms > maxLibraryElapsedMs) {
    return {
      report,
      passed: false,
      failure_category: "public_library_slow",
      failure_message: `Source library first page took ${library.check.elapsed_ms}ms, over ${maxLibraryElapsedMs}ms.`
    };
  }

  return { report, passed: true };
}

export async function runRealDataSmoke(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<SmokeResult<RealDataSmokeReport>> {
  const timeoutMs = readPositiveNumber(input.options?.api_probe_timeout_ms, 5000);
  const limit = readPositiveNumber(input.options?.search_limit, 10);
  const queries = readStringArray(input.options?.queries, DEFAULT_QUERIES);
  const checks: ApiProbeResult[] = [];
  const report: RealDataSmokeReport = {
    api_base_url: input.apiBaseUrl,
    queries,
    checks,
    searches: []
  };
  const resolvedAuth = await resolveAuthHeaders({
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    options: input.options
  });
  const authHeaders = resolvedAuth.headers;
  if (resolvedAuth.login_check) {
    checks.push(resolvedAuth.login_check);
  }
  if (resolvedAuth.failure_message) {
    return {
      report,
      passed: false,
      failure_category: "api_auth_failure",
      failure_message: resolvedAuth.failure_message
    };
  }

  await input.onEvent?.("real_data_source_library", "Reading public source library.");
  const library = await requestJson({
    id: "source_library_first_page",
    path: "/cutter/source-library?limit=20",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(library.check);
  report.source_library = sourceLibrarySummary(library.body, library.check.elapsed_ms);
  if (!library.check.ok || report.source_library.available_video_count <= 0 || report.source_library.returned_count <= 0) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: library.check.error ?? "Source library did not return visible real data."
    };
  }

  for (const query of queries) {
    await input.onEvent?.("real_data_search", `Searching public source library: ${query}`);
    const search = await requestJson({
      id: `search_${query}`,
      path: `/cutter/source-search?query=${encodeURIComponent(query)}&limit=${limit}`,
      baseUrl: input.apiBaseUrl,
      timeoutMs,
      auth: authHeaders
    });
    checks.push(search.check);
    const summary = searchSummary(query, search.body, search.check.elapsed_ms);
    report.searches.push(summary);
    if (search.check.ok && summary.returned_group_count > 0 && summary.first_source_video_id) {
      report.selected_search = summary;
      break;
    }
  }

  if (!report.selected_search?.first_source_video_id) {
    return {
      report,
      passed: false,
      failure_category: "search_failure",
      failure_message: `No search result returned for queries: ${queries.join(", ")}.`
    };
  }

  const selectedSourceVideoId = report.selected_search.first_source_video_id;
  const detailPath = report.selected_search.first_detail_url ?? `/cutter/source-videos/${encodeURIComponent(selectedSourceVideoId)}`;
  await input.onEvent?.("real_data_detail", "Reading selected source video full transcript.", {
    source_video_id: selectedSourceVideoId
  });
  const detail = await requestJson({
    id: "source_video_detail",
    path: detailPath,
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    includeBody: false,
    auth: authHeaders
  });
  checks.push(detail.check);
  report.selected_detail = sourceVideoDetailSummary(selectedSourceVideoId, detail.body, detail.check.elapsed_ms);
  if (!detail.check.ok || report.selected_detail.transcript_character_count <= 0 || report.selected_detail.transcript_segment_count <= 0) {
    return {
      report,
      passed: false,
      failure_category: "transcript_failure",
      failure_message: detail.check.error ?? "Selected source video detail did not expose a full transcript."
    };
  }

  await input.onEvent?.("real_data_cut_jobs", "Reading cut job queue.");
  const cutJobs = await requestJson({
    id: "cut_jobs",
    path: "/cutter/cut-jobs",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(cutJobs.check);
  report.cut_jobs = cutJobsSummary(cutJobs.body, cutJobs.check.elapsed_ms);
  if (!cutJobs.check.ok) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: cutJobs.check.error ?? `Cut jobs request failed with status ${cutJobs.check.status_code ?? "n/a"}.`
    };
  }

  return { report, passed: true };
}

export async function runCacheSmoke(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<SmokeResult<CacheSmokeReport>> {
  const timeoutMs = readPositiveNumber(input.options?.api_probe_timeout_ms, 5000);
  const checks: ApiProbeResult[] = [];
  const report: CacheSmokeReport = {
    api_base_url: input.apiBaseUrl,
    checks,
    total_observed_cache_size_bytes: 0,
    observed_cache_bucket_count: 0
  };
  const resolvedAuth = await resolveAuthHeaders({
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    options: input.options
  });
  const authHeaders = resolvedAuth.headers;
  if (resolvedAuth.login_check) {
    checks.push(resolvedAuth.login_check);
  }
  if (resolvedAuth.failure_message) {
    return {
      report,
      passed: false,
      failure_category: "api_auth_failure",
      failure_message: resolvedAuth.failure_message
    };
  }

  await input.onEvent?.("cache_runtime_status", "Reading cache status from cutter runtime.");
  const runtime = await requestJson({
    id: "runtime_status",
    path: "/cutter/runtime-status",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(runtime.check);
  report.runtime_status = runtimeStatusSummary(runtime.body, runtime.check.elapsed_ms);
  const buckets = observedCacheBuckets(report.runtime_status);
  report.observed_cache_bucket_count = buckets.length;
  let totalSize = 0;
  for (const bucket of buckets) {
    totalSize += bucket.size_bytes ?? 0;
  }
  report.total_observed_cache_size_bytes = totalSize;

  if (!runtime.check.ok) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: runtime.check.error ?? `Runtime status failed with status ${runtime.check.status_code ?? "n/a"}.`
    };
  }
  if (report.observed_cache_bucket_count === 0) {
    return {
      report,
      passed: false,
      failure_category: "cache_not_growing",
      failure_message: "Runtime status did not expose release/local cache buckets."
    };
  }

  return { report, passed: true };
}

export async function runRealCutSmoke(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<SmokeResult<RealCutSmokeReport>> {
  const timeoutMs = readPositiveNumber(input.options?.api_probe_timeout_ms, 5000);
  const cutTimeoutMs = readPositiveNumber(input.options?.cut_timeout_ms, 180_000);
  const query = typeof input.options?.query === "string" && input.options.query.trim()
    ? input.options.query.trim()
    : "第一场";
  const cutMode = typeof input.options?.cut_mode === "string" && input.options.cut_mode.trim()
    ? input.options.cut_mode.trim()
    : "copy";
  const maxDurationMs = readPositiveNumber(input.options?.max_duration_ms, 1_500);
  const checks: ApiProbeResult[] = [];
  const smokeId = safeSmokeId();
  const projectTitle = `Windows验收剪切-${smokeId}`;
  const projectId = `PWINSMOKE${smokeId}`;
  const report: RealCutSmokeReport = {
    api_base_url: input.apiBaseUrl,
    checks,
    query,
    cut_mode: cutMode,
    project_id: projectId,
    project_title: projectTitle
  };
  const resolvedAuth = await resolveAuthHeaders({
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    options: input.options
  });
  const authHeaders = resolvedAuth.headers;
  if (resolvedAuth.login_check) {
    checks.push(resolvedAuth.login_check);
  }
  if (resolvedAuth.failure_message) {
    return {
      report,
      passed: false,
      failure_category: "api_auth_failure",
      failure_message: resolvedAuth.failure_message
    };
  }

  await input.onEvent?.("real_cut_runtime", "Checking app runtime before real cut.");
  const runtime = await runAppRuntimeSmoke({
    apiBaseUrl: input.apiBaseUrl,
    options: input.options,
    onEvent: input.onEvent
  });
  report.app_runtime_smoke = runtime.report;
  if (!runtime.passed) {
    return {
      report,
      passed: false,
      failure_category: runtime.failure_category,
      failure_message: runtime.failure_message
    };
  }

  await input.onEvent?.("real_cut_queue_guard", "Checking cut queue is idle before creating a smoke cut.");
  const queueBefore = await requestJson({
    id: "cut_jobs_before",
    path: "/cutter/cut-jobs",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(queueBefore.check);
  const queueBeforeSummary = cutJobsSummary(queueBefore.body, queueBefore.check.elapsed_ms);
  if (!queueBefore.check.ok) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: queueBefore.check.error ?? "Could not read cut queue before real cut smoke."
    };
  }
  const allowBusyQueue = input.options?.allow_busy_queue === true;
  if (!allowBusyQueue && (queueBeforeSummary.pending_count > 0 || queueBeforeSummary.running_count > 0)) {
    return {
      report,
      passed: false,
      failure_category: "cut_failure",
      failure_message: `Cut queue is not idle: pending=${queueBeforeSummary.pending_count}, running=${queueBeforeSummary.running_count}.`
    };
  }

  await input.onEvent?.("real_cut_search", `Searching public source library for real cut: ${query}`);
  const search = await requestJson({
    id: "real_cut_search",
    path: `/cutter/source-search?query=${encodeURIComponent(query)}&limit=10`,
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: authHeaders
  });
  checks.push(search.check);
  const searchInfo = searchSummary(query, search.body, search.check.elapsed_ms);
  if (!search.check.ok || !searchInfo.first_source_video_id) {
    return {
      report,
      passed: false,
      failure_category: "search_failure",
      failure_message: search.check.error ?? `No searchable source video found for ${query}.`
    };
  }
  report.selected_source_video_id = searchInfo.first_source_video_id;
  report.selected_title = searchInfo.first_title;

  const detailPath = searchInfo.first_detail_url ?? `/cutter/source-videos/${encodeURIComponent(searchInfo.first_source_video_id)}`;
  await input.onEvent?.("real_cut_detail", "Reading source detail for real cut.", {
    source_video_id: searchInfo.first_source_video_id
  });
  const detail = await requestJson({
    id: "real_cut_source_detail",
    path: detailPath,
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    includeBody: false,
    auth: authHeaders
  });
  checks.push(detail.check);
  if (!detail.check.ok) {
    return {
      report,
      passed: false,
      failure_category: "transcript_failure",
      failure_message: detail.check.error ?? "Could not read source detail for real cut smoke."
    };
  }

  const detailData = dataRecord(detail.body);
  const segment = firstTranscriptSegment(detail.body);
  if (!segment) {
    return {
      report,
      passed: false,
      failure_category: "transcript_failure",
      failure_message: "Selected source detail has no usable transcript segment."
    };
  }

  const segmentId = getString(segment, ["segment_id"]);
  const beginMs = getNumber(segment, ["begin_ms"]);
  const segmentEndMs = getNumber(segment, ["end_ms"]);
  const text = getString(segment, ["text"]) ?? "";
  if (!segmentId || beginMs === undefined || segmentEndMs === undefined || segmentEndMs <= beginMs) {
    return {
      report,
      passed: false,
      failure_category: "transcript_failure",
      failure_message: "Selected transcript segment is incomplete."
    };
  }

  const endMs = Math.min(segmentEndMs, beginMs + maxDurationMs);
  const selectedText = text.slice(0, 120);
  const sourceTitle = getString(detailData, ["title", "name"]) ?? searchInfo.first_title ?? searchInfo.first_source_video_id;
  const sourceRelativePath = getString(detailData, ["source_relative_path", "relative_path", "path"]) ?? sourceTitle;
  report.selected_title = sourceTitle;
  report.selected_segment_id = segmentId;
  report.selected_text_preview = selectedText;
  report.begin_ms = beginMs;
  report.end_ms = endMs;
  report.selected_duration_ms = endMs - beginMs;

  await input.onEvent?.("real_cut_create_clip_list", "Creating smoke cut list.", {
    source_video_id: searchInfo.first_source_video_id,
    begin_ms: beginMs,
    end_ms: endMs
  });
  const clipList = await requestJson({
    id: "real_cut_create_clip_list",
    path: "/cutter/clip-lists",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    method: "POST",
    auth: authHeaders,
    body: {
      library_id: runtime.report.runtime_status?.library_id ?? "lib_main_001",
      project_id: projectId,
      title: projectTitle,
      items: [{
        source_video_id: searchInfo.first_source_video_id,
        source_title: sourceTitle,
        source_relative_path: sourceRelativePath,
        start_segment_id: segmentId,
        end_segment_id: segmentId,
        begin_ms: beginMs,
        end_ms: endMs,
        selected_text: selectedText,
        cut_mode: cutMode,
        pre_roll_ms: 0,
        post_roll_ms: 0
      }]
    }
  });
  checks.push(clipList.check);
  const clipListData = dataRecord(clipList.body);
  const clipListId = getString(clipListData, ["clip_list_id"]);
  report.clip_list_id = clipListId;
  if (!clipList.check.ok || !clipListId) {
    return {
      report,
      passed: false,
      failure_category: "cut_failure",
      failure_message: clipList.check.error ?? `Could not create clip list, status ${clipList.check.status_code ?? "n/a"}.`
    };
  }

  await input.onEvent?.("real_cut_submit_queue", "Submitting smoke cut list to queue.", {
    clip_list_id: clipListId
  });
  const submit = await requestJson({
    id: "real_cut_submit_jobs",
    path: "/cutter/cut-jobs",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    method: "POST",
    auth: authHeaders,
    body: { clip_list_id: clipListId }
  });
  checks.push(submit.check);
  const submitData = dataRecord(submit.body);
  const jobs = getArray(submitData, ["jobs"]);
  const firstJob = isRecord(jobs[0]) ? jobs[0] : {};
  const cutJobId = getString(firstJob, ["cut_job_id"]);
  report.cut_job_id = cutJobId;
  if (!submit.check.ok || !cutJobId) {
    return {
      report,
      passed: false,
      failure_category: "cut_failure",
      failure_message: submit.check.error ?? `Could not submit cut job, status ${submit.check.status_code ?? "n/a"}.`
    };
  }

  await input.onEvent?.("real_cut_run_next", "Running smoke cut job.", {
    cut_job_id: cutJobId
  });
  const runNext = await requestJson({
    id: "real_cut_run_next",
    path: "/cutter/cut-jobs/run-next",
    baseUrl: input.apiBaseUrl,
    timeoutMs: cutTimeoutMs,
    method: "POST",
    auth: authHeaders
  });
  checks.push(runNext.check);
  const runData = runNextSummary(runNext.body);
  report.run_next_elapsed_ms = runNext.check.elapsed_ms;
  report.run_next_status = getString(runData, ["status"]);
  report.export_clip_id = getString(runData, ["export_clip_id"]);
  report.output_file = getString(runData, ["output_file"]);
  report.phase_timings = phaseTimingSummary(runData.phase_timings);
  if (!runNext.check.ok || report.run_next_status !== "done") {
    return {
      report,
      passed: false,
      failure_category: "cut_failure",
      failure_message: runNext.check.error ?? `Real cut smoke finished with status ${report.run_next_status ?? "unknown"}.`
    };
  }
  if (getString(runData, ["cut_job_id"]) !== cutJobId) {
    return {
      report,
      passed: false,
      failure_category: "cut_failure",
      failure_message: `run-next executed ${getString(runData, ["cut_job_id"]) ?? "unknown"} instead of smoke job ${cutJobId}.`
    };
  }
  if (!report.export_clip_id || !report.output_file) {
    return {
      report,
      passed: false,
      failure_category: "cut_failure",
      failure_message: "Real cut smoke did not return export output metadata."
    };
  }

  return { report, passed: true };
}

export async function runWindowsAcceptance(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<SmokeResult<WindowsAcceptanceReport>> {
  const report: WindowsAcceptanceReport = {
    api_base_url: input.apiBaseUrl
  };

  const appRuntime = await runAppRuntimeSmoke(input);
  report.app_runtime_smoke = appRuntime.report;
  if (!appRuntime.passed) {
    return {
      report,
      passed: false,
      failure_category: appRuntime.failure_category,
      failure_message: appRuntime.failure_message
    };
  }

  const realData = await runRealDataSmoke(input);
  report.real_data_smoke = realData.report;
  if (!realData.passed) {
    return {
      report,
      passed: false,
      failure_category: realData.failure_category,
      failure_message: realData.failure_message
    };
  }

  const cache = await runCacheSmoke(input);
  report.cache_smoke = cache.report;
  if (!cache.passed) {
    return {
      report,
      passed: false,
      failure_category: cache.failure_category,
      failure_message: cache.failure_message
    };
  }

  return { report, passed: true };
}
