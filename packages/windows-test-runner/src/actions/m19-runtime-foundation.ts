import { runLaunchAppProbe } from "./launch-app-probe.ts";
import type {
  ApiProbeResult,
  FailureCategory,
  M19CandidateDetailSummary,
  M19CutQueueSummary,
  M19RuntimeFoundationReport,
  M19TimedApiCheck
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

interface SourceVideoGroup {
  source_video_id: string;
  title?: string;
  relative_path?: string;
  hit_segments: Array<{
    segment_id?: string;
    begin_ms?: number;
    end_ms?: number;
    text?: string;
  }>;
}

interface SourceVideoDetail {
  source_video_id?: string;
  title?: string;
  relative_path?: string;
  transcript?: {
    segments?: Array<{
      segment_id?: string;
      begin_ms?: number;
      end_ms?: number;
      text?: string;
    }>;
  };
}

interface CutJob {
  cut_job_id?: string;
  source_video_id?: string;
  status?: string;
}

const DEFAULT_QUERY = "第一场";
const DEFAULT_QUERIES = ["第一场", "现金流", "中国", "2026", "美国"];

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

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const result = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return result.length > 0 ? result : fallback;
}

function authHeaderRecord(auth: CutterAuthHeaders | undefined): Record<string, string> {
  return auth
    ? {
        "X-MixLab-Device-Id": auth.device_id,
        "X-MixLab-Session-Token": auth.session_token
      }
    : {};
}

function readAuthHeaders(options: Record<string, unknown> | undefined): CutterAuthHeaders | undefined {
  const auth = options?.auth_headers;
  if (!isRecord(auth)) {
    return undefined;
  }
  const deviceId = getString(auth, ["device_id", "deviceId"]);
  const sessionToken = getString(auth, ["session_token", "sessionToken"]);
  return deviceId && sessionToken ? { device_id: deviceId, session_token: sessionToken } : undefined;
}

function readAuthCredentials(options: Record<string, unknown> | undefined): CutterAuthCredentials | undefined {
  const credentials = options?.auth_credentials;
  if (!isRecord(credentials)) {
    return undefined;
  }
  const username = getString(credentials, ["username", "user_name"]);
  const password = getString(credentials, ["password"]);
  const deviceId = getString(credentials, ["device_id", "deviceId"]);
  const deviceName = getString(credentials, ["device_name", "deviceName"]) ?? "MixLab Windows M19 Runner";
  return username && password && deviceId
    ? { username, password, device_id: deviceId, device_name: deviceName }
    : undefined;
}

async function requestJson(input: {
  id: string;
  path: string;
  baseUrl: string;
  timeoutMs: number;
  method?: "GET" | "POST";
  auth?: CutterAuthHeaders;
  body?: unknown;
  includeBody?: boolean;
}): Promise<JsonRequestResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const url = `${input.baseUrl.replace(/\/+$/, "")}${input.path}`;
  try {
    const response = await fetch(url, {
      method: input.method ?? "GET",
      signal: controller.signal,
      headers: {
        ...authHeaderRecord(input.auth),
        ...(input.body ? { "Content-Type": "application/json" } : {})
      },
      body: input.body ? JSON.stringify(input.body) : undefined
    });
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      body = JSON.parse(text) as unknown;
    }
    return {
      body,
      check: {
        id: input.id,
        path: input.path,
        url,
        ok: response.ok,
        status_code: response.status,
        elapsed_ms: Date.now() - started,
        ...(input.includeBody === false ? {} : { body }),
        ...(response.ok ? {} : { error: text.slice(0, 500) })
      }
    };
  } catch (error) {
    return {
      body: {},
      check: {
        id: input.id,
        path: input.path,
        url,
        ok: false,
        status_code: null,
        elapsed_ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAuth(input: {
  baseUrl: string;
  timeoutMs: number;
  options?: Record<string, unknown>;
}): Promise<{
  headers?: CutterAuthHeaders;
  source: "none" | "headers" | "credentials";
  login_check?: ApiProbeResult;
  failure_message?: string;
}> {
  const supplied = readAuthHeaders(input.options);
  if (supplied) {
    return { headers: supplied, source: "headers" };
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
      failure_message: "Cutter login did not return a device/session token."
    };
  }
  return {
    headers: { device_id: deviceId, session_token: sessionToken },
    source: "credentials",
    login_check: login.check
  };
}

function timedSummary(check: ApiProbeResult, body: unknown): M19TimedApiCheck {
  const data = dataRecord(body);
  return {
    id: check.id,
    path: check.path,
    elapsed_ms: check.elapsed_ms,
    ok: check.ok,
    status_code: check.status_code,
    item_count: getArray(data, ["videos", "clips", "jobs", "groups"]).length,
    total_count: getNumber(data, ["available_video_count", "job_count", "total_count"]),
    error: check.error
  };
}

function fail<TReport>(report: TReport, category: FailureCategory, message: string): SmokeResult<TReport> {
  return { report, passed: false, failure_category: category, failure_message: message };
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function firstTranscriptSegment(detail: SourceVideoDetail, preferredSegmentId?: string): {
  segment_id?: string;
  begin_ms?: number;
  end_ms?: number;
  text?: string;
} | undefined {
  const segments = detail.transcript?.segments ?? [];
  return segments.find((segment) => segment.segment_id === preferredSegmentId) ?? segments[0];
}

function detailSummary(sourceVideoId: string, body: unknown, elapsedMs: number): M19CandidateDetailSummary {
  const data = dataRecord(body);
  const transcript = isRecord(data.transcript) ? data.transcript : {};
  const segments = getArray(transcript, ["segments"]);
  let characterCount = 0;
  for (const segment of segments) {
    if (isRecord(segment)) {
      characterCount += getString(segment, ["text"])?.length ?? 0;
    }
  }
  return {
    source_video_id: sourceVideoId,
    elapsed_ms: elapsedMs,
    transcript_character_count: characterCount,
    transcript_segment_count: segments.length
  };
}

function searchGroups(body: unknown): SourceVideoGroup[] {
  return getArray(dataRecord(body), ["groups"])
    .filter(isRecord)
    .map((group) => ({
      source_video_id: getString(group, ["source_video_id"]) ?? "",
      title: getString(group, ["title"]),
      relative_path: getString(group, ["relative_path"]),
      hit_segments: getArray(group, ["hit_segments"]).filter(isRecord).map((segment) => ({
        segment_id: getString(segment, ["segment_id"]),
        begin_ms: getNumber(segment, ["begin_ms"]),
        end_ms: getNumber(segment, ["end_ms"]),
        text: getString(segment, ["text"])
      }))
    }))
    .filter((group) => group.source_video_id && group.hit_segments.length > 0);
}

async function collectUniqueGroups(input: {
  apiBaseUrl: string;
  auth: CutterAuthHeaders;
  timeoutMs: number;
  queries: string[];
  count: number;
}): Promise<SourceVideoGroup[]> {
  const byId = new Map<string, SourceVideoGroup>();
  for (const query of input.queries) {
    const search = await requestJson({
      id: `candidate_search_${query}`,
      path: `/cutter/source-search?query=${encodeURIComponent(query)}&limit=20`,
      baseUrl: input.apiBaseUrl,
      timeoutMs: input.timeoutMs,
      auth: input.auth,
      includeBody: false
    });
    if (!search.check.ok) {
      continue;
    }
    for (const group of searchGroups(search.body)) {
      if (!byId.has(group.source_video_id)) {
        byId.set(group.source_video_id, group);
      }
      if (byId.size >= input.count) {
        return [...byId.values()];
      }
    }
  }
  return [...byId.values()];
}

async function submitCutBatch(input: {
  apiBaseUrl: string;
  auth: CutterAuthHeaders;
  timeoutMs: number;
  cutTimeoutMs: number;
  libraryId: string;
  query: string;
  groups: SourceVideoGroup[];
}): Promise<SmokeResult<M19CutQueueSummary>> {
  const details: Array<{ group: SourceVideoGroup; detail: SourceVideoDetail }> = [];
  for (const group of input.groups) {
    const detail = await requestJson({
      id: `cut_detail_${group.source_video_id}`,
      path: `/cutter/source-videos/${encodeURIComponent(group.source_video_id)}`,
      baseUrl: input.apiBaseUrl,
      timeoutMs: input.timeoutMs,
      auth: input.auth,
      includeBody: false
    });
    if (!detail.check.ok) {
      return fail({
        submitted_job_ids: [],
        submit_ms: 0,
        during_cut_responsiveness: {
          source_library_ms: 0,
          search_ms: 0,
          cut_jobs_ms: 0,
          source_library_count: 0,
          search_group_count: 0,
          cut_job_count: 0
        },
        final_statuses: {},
        poll_ms: 0
      }, "transcript_failure", detail.check.error ?? `Could not read ${group.source_video_id} before cut.`);
    }
    details.push({ group, detail: dataRecord(detail.body) as SourceVideoDetail });
  }

  const items = details.map(({ group, detail }, index) => {
    const segment = firstTranscriptSegment(detail, group.hit_segments[0]?.segment_id);
    if (!segment?.segment_id || segment.begin_ms === undefined || segment.end_ms === undefined || segment.end_ms <= segment.begin_ms) {
      throw new Error(`No usable transcript segment for ${group.source_video_id}.`);
    }
    return {
      source_video_id: detail.source_video_id ?? group.source_video_id,
      source_title: detail.title ?? group.title ?? group.source_video_id,
      source_relative_path: (detail.relative_path ?? group.relative_path ?? `${group.source_video_id}.mp4`).replace(/\\/g, "/"),
      start_segment_id: segment.segment_id,
      end_segment_id: segment.segment_id,
      begin_ms: segment.begin_ms,
      end_ms: segment.end_ms,
      selected_text: segment.text ?? group.hit_segments[0]?.text ?? "",
      cut_mode: "copy",
      pre_roll_ms: 0,
      post_roll_ms: 0,
      order: index + 1
    };
  });

  const clipListStarted = Date.now();
  const clipList = await requestJson({
    id: "m19_create_clip_list",
    path: "/cutter/clip-lists",
    baseUrl: input.apiBaseUrl,
    timeoutMs: input.timeoutMs,
    method: "POST",
    auth: input.auth,
    body: {
      library_id: input.libraryId,
      title: `M19 runtime queue ${new Date().toISOString()}`,
      items
    }
  });
  const clipListId = getString(dataRecord(clipList.body), ["clip_list_id"]);
  if (!clipList.check.ok || !clipListId) {
    return fail({
      submitted_job_ids: [],
      submit_ms: Date.now() - clipListStarted,
      during_cut_responsiveness: {
        source_library_ms: 0,
        search_ms: 0,
        cut_jobs_ms: 0,
        source_library_count: 0,
        search_group_count: 0,
        cut_job_count: 0
      },
      final_statuses: {},
      poll_ms: 0
    }, "cut_failure", clipList.check.error ?? "Could not create M19 clip list.");
  }

  const submit = await requestJson({
    id: "m19_submit_cut_jobs",
    path: "/cutter/cut-jobs",
    baseUrl: input.apiBaseUrl,
    timeoutMs: input.timeoutMs,
    method: "POST",
    auth: input.auth,
    body: { clip_list_id: clipListId }
  });
  const submitData = dataRecord(submit.body);
  const submittedJobIds = getArray(submitData, ["jobs"])
    .filter(isRecord)
    .map((job) => getString(job, ["cut_job_id"]))
    .filter((jobId): jobId is string => Boolean(jobId));
  const submitMs = Date.now() - clipListStarted;
  if (!submit.check.ok || submittedJobIds.length !== items.length) {
    return fail({
      clip_list_id: clipListId,
      submitted_job_ids: submittedJobIds,
      submit_ms: submitMs,
      during_cut_responsiveness: {
        source_library_ms: 0,
        search_ms: 0,
        cut_jobs_ms: 0,
        source_library_count: 0,
        search_group_count: 0,
        cut_job_count: 0
      },
      final_statuses: {},
      poll_ms: 0
    }, "cut_failure", submit.check.error ?? `Expected ${items.length} submitted jobs, got ${submittedJobIds.length}.`);
  }

  const [library, search, cutJobs] = await Promise.all([
    requestJson({
      id: "m19_during_cut_source_library",
      path: "/cutter/source-library?limit=20",
      baseUrl: input.apiBaseUrl,
      timeoutMs: input.timeoutMs,
      auth: input.auth,
      includeBody: false
    }),
    requestJson({
      id: "m19_during_cut_search",
      path: `/cutter/source-search?query=${encodeURIComponent(input.query)}&limit=10`,
      baseUrl: input.apiBaseUrl,
      timeoutMs: input.timeoutMs,
      auth: input.auth,
      includeBody: false
    }),
    requestJson({
      id: "m19_during_cut_jobs",
      path: "/cutter/cut-jobs?limit=50",
      baseUrl: input.apiBaseUrl,
      timeoutMs: input.timeoutMs,
      auth: input.auth,
      includeBody: false
    })
  ]);

  const libraryData = dataRecord(library.body);
  const searchData = dataRecord(search.body);
  const cutJobsData = dataRecord(cutJobs.body);
  const duringCutResponsiveness = {
    source_library_ms: library.check.elapsed_ms,
    search_ms: search.check.elapsed_ms,
    cut_jobs_ms: cutJobs.check.elapsed_ms,
    source_library_count: getArray(libraryData, ["videos"]).length,
    search_group_count: getArray(searchData, ["groups"]).length,
    cut_job_count: getArray(cutJobsData, ["jobs"]).length
  };
  if (!library.check.ok || !search.check.ok || !cutJobs.check.ok) {
    return fail({
      clip_list_id: clipListId,
      submitted_job_ids: submittedJobIds,
      submit_ms: submitMs,
      during_cut_responsiveness: duringCutResponsiveness,
      final_statuses: {},
      poll_ms: 0
    }, "cut_failure", "One or more page APIs failed while cuts were running.");
  }
  if (library.check.elapsed_ms > 1000 || search.check.elapsed_ms > 1000 || cutJobs.check.elapsed_ms > 1000) {
    return fail({
      clip_list_id: clipListId,
      submitted_job_ids: submittedJobIds,
      submit_ms: submitMs,
      during_cut_responsiveness: duringCutResponsiveness,
      final_statuses: {},
      poll_ms: 0
    }, "cut_failure", `Page APIs were slow during cuts: library=${library.check.elapsed_ms}ms, search=${search.check.elapsed_ms}ms, jobs=${cutJobs.check.elapsed_ms}ms.`);
  }

  const pollStarted = Date.now();
  let finalStatuses: Record<string, string> = {};
  while (Date.now() - pollStarted < input.cutTimeoutMs) {
    const catalog = await requestJson({
      id: "m19_cut_jobs_poll",
      path: "/cutter/cut-jobs?limit=200",
      baseUrl: input.apiBaseUrl,
      timeoutMs: input.timeoutMs,
      auth: input.auth,
      includeBody: false
    });
    if (!catalog.check.ok) {
      return fail({
        clip_list_id: clipListId,
        submitted_job_ids: submittedJobIds,
        submit_ms: submitMs,
        during_cut_responsiveness: duringCutResponsiveness,
        final_statuses: finalStatuses,
        poll_ms: Date.now() - pollStarted
      }, "cut_failure", catalog.check.error ?? "Could not poll cut jobs.");
    }
    finalStatuses = Object.fromEntries(
      getArray(dataRecord(catalog.body), ["jobs"])
        .filter(isRecord)
        .map((job): CutJob => ({
          cut_job_id: getString(job, ["cut_job_id"]),
          source_video_id: getString(job, ["source_video_id"]),
          status: getString(job, ["status"])
        }))
        .filter((job) => job.cut_job_id && submittedJobIds.includes(job.cut_job_id))
        .map((job) => [job.cut_job_id!, job.status ?? "unknown"])
    );
    const statuses = submittedJobIds.map((jobId) => finalStatuses[jobId]);
    if (statuses.includes("failed") || statuses.includes("cancelled")) {
      return fail({
        clip_list_id: clipListId,
        submitted_job_ids: submittedJobIds,
        submit_ms: submitMs,
        during_cut_responsiveness: duringCutResponsiveness,
        final_statuses: finalStatuses,
        poll_ms: Date.now() - pollStarted
      }, "cut_failure", `M19 queued cuts failed or cancelled: ${JSON.stringify(finalStatuses)}`);
    }
    if (statuses.every((status) => status === "done")) {
      return {
        report: {
          clip_list_id: clipListId,
          submitted_job_ids: submittedJobIds,
          submit_ms: submitMs,
          during_cut_responsiveness: duringCutResponsiveness,
          final_statuses: finalStatuses,
          poll_ms: Date.now() - pollStarted
        },
        passed: true
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return fail({
    clip_list_id: clipListId,
    submitted_job_ids: submittedJobIds,
    submit_ms: submitMs,
    during_cut_responsiveness: duringCutResponsiveness,
    final_statuses: finalStatuses,
    poll_ms: Date.now() - pollStarted
  }, "cut_failure", `M19 queued cuts did not finish before timeout: ${JSON.stringify(finalStatuses)}`);
}

export async function runM19RuntimeFoundation(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<SmokeResult<M19RuntimeFoundationReport>> {
  const timeoutMs = readPositiveNumber(input.options?.api_probe_timeout_ms, 5000);
  const cutTimeoutMs = readPositiveNumber(input.options?.cut_timeout_ms, 420_000);
  const query = typeof input.options?.query === "string" && input.options.query.trim()
    ? input.options.query.trim()
    : DEFAULT_QUERY;
  const candidateCount = Math.max(5, Math.min(10, Math.trunc(readPositiveNumber(input.options?.candidate_count, 5))));
  const cutCount = Math.max(5, Math.min(10, Math.trunc(readPositiveNumber(input.options?.cut_count, 5))));
  const minPublicVideos = readPositiveNumber(input.options?.min_public_videos, 10_000);
  const queries = readStringArray(input.options?.queries, DEFAULT_QUERIES);
  const report: M19RuntimeFoundationReport = {
    api_base_url: input.apiBaseUrl,
    target: "M19 Runtime Foundation v1"
  };

  await input.onEvent?.("m19_launch", "Launching Windows Cutter for M19 runtime foundation.");
  const launch = await runLaunchAppProbe({
    apiBaseUrl: input.apiBaseUrl,
    options: {
      ...input.options,
      skip_api_probe: true
    },
    onEvent: input.onEvent
  });
  report.launch_app_probe = launch.report;
  if (!launch.passed) {
    return fail(report, launch.failure_category ?? "app_launch_failure", launch.failure_message ?? "Could not launch Cutter app.");
  }

  const auth = await resolveAuth({
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    options: input.options
  });
  report.auth_source = auth.source;
  if (!auth.headers) {
    return fail(report, "api_auth_failure", auth.failure_message ?? "M19 reviewed auth requires auth_credentials or auth_headers.");
  }

  await input.onEvent?.("m19_runtime", "Reading runtime status.");
  const runtime = await requestJson({
    id: "m19_runtime_status",
    path: "/cutter/runtime-status",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: auth.headers,
    includeBody: false
  });
  const runtimeData = dataRecord(runtime.body);
  const releaseCache = isRecord(runtimeData.release_cache) ? runtimeData.release_cache : {};
  const searchBackend = isRecord(runtimeData.search_backend) ? runtimeData.search_backend : {};
  report.runtime = {
    elapsed_ms: runtime.check.elapsed_ms,
    available_video_count: getNumber(runtimeData, ["available_video_count"]),
    release_cache_ready: getBoolean(releaseCache, ["ready"]),
    search_backend_mode: getString(searchBackend, ["mode"]),
    search_backend_response_ms: getNumber(searchBackend, ["response_ms"])
  };
  if (!runtime.check.ok) {
    return fail(report, "real_data_unavailable", runtime.check.error ?? "Runtime status failed.");
  }
  if ((report.runtime.available_video_count ?? 0) < minPublicVideos) {
    return fail(report, "real_data_unavailable", `Expected at least ${minPublicVideos} public videos, got ${report.runtime.available_video_count ?? 0}.`);
  }

  await input.onEvent?.("m19_source_library", "Checking paged source-library first page.");
  const firstPage = await requestJson({
    id: "m19_source_library_limit_20",
    path: "/cutter/source-library?limit=20",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: auth.headers,
    includeBody: false
  });
  report.source_library_first_page = timedSummary(firstPage.check, firstPage.body);
  if (!firstPage.check.ok || firstPage.check.elapsed_ms > 1000 || (report.source_library_first_page.item_count ?? 0) > 20) {
    return fail(report, "public_library_slow", `Source library first page failed M19: ok=${firstPage.check.ok}, elapsed=${firstPage.check.elapsed_ms}ms, count=${report.source_library_first_page.item_count ?? 0}.`);
  }

  const defaultPage = await requestJson({
    id: "m19_source_library_default",
    path: "/cutter/source-library",
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: auth.headers,
    includeBody: false
  });
  report.source_library_default_page = timedSummary(defaultPage.check, defaultPage.body);
  if (!defaultPage.check.ok || (report.source_library_default_page.item_count ?? 0) > 20) {
    return fail(report, "real_data_unavailable", `Source library default page must stay bounded, got ${report.source_library_default_page.item_count ?? 0}.`);
  }

  await input.onEvent?.("m19_cached_revisit", "Checking cached API revisit timings.");
  const cachedTargets = [
    ["project_home", "/cutter/cut-jobs?limit=20"],
    ["local_library", "/cutter/local-clips?limit=20"],
    ["public_library", "/cutter/source-library?limit=20"]
  ] as const;
  report.cached_revisit = {};
  for (const [id, path] of cachedTargets) {
    await requestJson({ id: `${id}_warm`, path, baseUrl: input.apiBaseUrl, timeoutMs, auth: auth.headers, includeBody: false });
    const revisit = await requestJson({ id, path, baseUrl: input.apiBaseUrl, timeoutMs, auth: auth.headers, includeBody: false });
    const summary = timedSummary(revisit.check, revisit.body);
    report.cached_revisit[id] = summary;
    if (!summary.ok || summary.elapsed_ms > 200) {
      return fail(report, "real_data_unavailable", `${id} cached API revisit took ${summary.elapsed_ms}ms.`);
    }
  }

  await input.onEvent?.("m19_rapid_switch", "Running rapid 30-step API switch simulation.");
  const switchPaths = [
    "/cutter/runtime-status",
    "/cutter/source-library?limit=20",
    "/cutter/local-clips?limit=20",
    `/cutter/source-search?query=${encodeURIComponent(query)}&limit=10`,
    "/cutter/cut-jobs?limit=50",
    "/cutter/source-library?limit=20"
  ];
  const switchChecks: M19TimedApiCheck[] = [];
  for (let index = 0; index < 30; index += 1) {
    const path = switchPaths[index % switchPaths.length]!;
    const check = await requestJson({
      id: `m19_switch_${index + 1}`,
      path,
      baseUrl: input.apiBaseUrl,
      timeoutMs,
      auth: auth.headers,
      includeBody: false
    });
    const summary = timedSummary(check.check, check.body);
    switchChecks.push(summary);
    if (!summary.ok || summary.elapsed_ms > 1000) {
      return fail(report, "real_data_unavailable", `Rapid switch ${index + 1} failed or was slow: ${path}, ${summary.elapsed_ms}ms.`);
    }
  }
  const switchTimes = switchChecks.map((check) => check.elapsed_ms);
  report.rapid_switch = {
    iterations: switchChecks.length,
    max_ms: Math.max(...switchTimes),
    p95_ms: percentile95(switchTimes),
    checks: switchChecks
  };

  await input.onEvent?.("m19_search", `Checking first search page for ${query}.`);
  const search = await requestJson({
    id: "m19_search_first_page",
    path: `/cutter/source-search?query=${encodeURIComponent(query)}&limit=10`,
    baseUrl: input.apiBaseUrl,
    timeoutMs,
    auth: auth.headers,
    includeBody: false
  });
  const searchData = dataRecord(search.body);
  const firstSearchGroups = searchGroups(search.body);
  report.search_first_page = {
    query,
    elapsed_ms: search.check.elapsed_ms,
    group_count: firstSearchGroups.length,
    total_hit_count: getNumber(searchData, ["total_hit_count"]),
    search_mode: getString(searchData, ["search_mode"]),
    next_cursor: getString(searchData, ["next_cursor"])
  };
  if (!search.check.ok || search.check.elapsed_ms > 1000 || firstSearchGroups.length === 0 || firstSearchGroups.length > 10) {
    return fail(report, "search_failure", `Search first page failed M19: ok=${search.check.ok}, elapsed=${search.check.elapsed_ms}ms, groups=${firstSearchGroups.length}.`);
  }

  await input.onEvent?.("m19_candidate_switch", "Checking rapid candidate detail switching.");
  const candidateGroups = await collectUniqueGroups({
    apiBaseUrl: input.apiBaseUrl,
    auth: auth.headers,
    timeoutMs,
    queries,
    count: Math.max(candidateCount, cutCount)
  });
  if (candidateGroups.length < cutCount) {
    return fail(report, "search_failure", `Expected ${cutCount} unique candidate videos, got ${candidateGroups.length}.`);
  }
  const detailResults = await Promise.all(candidateGroups.slice(0, candidateCount).map(async (group) => {
    const detail = await requestJson({
      id: `m19_candidate_detail_${group.source_video_id}`,
      path: `/cutter/source-videos/${encodeURIComponent(group.source_video_id)}`,
      baseUrl: input.apiBaseUrl,
      timeoutMs,
      auth: auth.headers,
      includeBody: false
    });
    return { group, detail };
  }));
  const details: M19CandidateDetailSummary[] = detailResults.map(({ group, detail }) =>
    detailSummary(group.source_video_id, detail.body, detail.check.elapsed_ms)
  );
  report.candidate_switch = {
    requested_count: candidateCount,
    completed_count: details.filter((detail) => detail.transcript_segment_count > 0).length,
    details
  };
  if (detailResults.some(({ detail }) => !detail.check.ok || detail.check.elapsed_ms > 1000) || report.candidate_switch.completed_count < candidateCount) {
    return fail(report, "transcript_failure", "Rapid candidate detail switching failed or returned incomplete transcripts.");
  }

  await input.onEvent?.("m19_cut_queue", `Submitting ${cutCount} queued cuts from different videos.`);
  const cutQueue = await submitCutBatch({
    apiBaseUrl: input.apiBaseUrl,
    auth: auth.headers,
    timeoutMs,
    cutTimeoutMs,
    libraryId: getString(runtimeData, ["library_id"]) ?? "lib_main_001",
    query,
    groups: candidateGroups.slice(0, cutCount)
  });
  report.cut_queue = cutQueue.report;
  if (!cutQueue.passed) {
    return fail(report, cutQueue.failure_category ?? "cut_failure", cutQueue.failure_message ?? "M19 cut queue failed.");
  }

  return { report, passed: true };
}
