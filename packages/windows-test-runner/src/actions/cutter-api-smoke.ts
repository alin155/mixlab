import type {
  CutterApiSmokeReport,
  CutterSmokeCheck,
  FailureCategory
} from "../types.ts";

interface SmokeOptions {
  timeout_ms?: number;
  source_limit?: number;
  queries?: string[];
}

interface RequestResult {
  check: CutterSmokeCheck;
  body?: unknown;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return strings.length > 0 ? strings : undefined;
}

function readOptions(value: Record<string, unknown> | undefined): SmokeOptions {
  return {
    timeout_ms: readPositiveNumber(value?.timeout_ms, 8000),
    source_limit: Math.min(50, Math.max(1, Math.floor(readPositiveNumber(value?.source_limit, 20)))),
    queries: readStringArray(value?.queries)
  };
}

function buildUrl(baseUrl: string, pathName: string): string {
  return new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function requestJson(input: {
  id: string;
  path: string;
  baseUrl: string;
  timeoutMs: number;
}): Promise<RequestResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const url = buildUrl(input.baseUrl, input.path);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) as unknown : null;
    } catch {
      body = text.slice(0, 1000);
    }
    return {
      check: {
        id: input.id,
        path: input.path,
        ok: response.ok,
        status_code: response.status,
        elapsed_ms: Date.now() - started
      },
      body
    };
  } catch (error) {
    return {
      check: {
        id: input.id,
        path: input.path,
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

function dataObject(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const root = body as Record<string, unknown>;
  const data = root.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : root;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function summarizeRuntime(data: Record<string, unknown> | undefined): CutterApiSmokeReport["runtime"] {
  if (!data) {
    return undefined;
  }
  const releaseCache = objectValue(data.release_cache);
  const localCache = objectValue(data.local_cache);
  const sourceVideoCache = objectValue(localCache?.source_video_cache);
  const preflight = objectValue(data.source_video_preflight);
  return {
    available_video_count: numberValue(data.available_video_count),
    auth_mode: stringValue(data.auth_mode),
    release_cache_ready: typeof releaseCache?.ready === "boolean" ? releaseCache.ready : undefined,
    release_cache_sync_status: stringValue(releaseCache?.sync_status),
    release_cache_size_bytes: numberValue(releaseCache?.cache_size_bytes),
    source_video_cache_size_bytes: numberValue(sourceVideoCache?.size_bytes),
    source_video_cache_file_count: numberValue(sourceVideoCache?.file_count),
    source_video_preflight_status: stringValue(preflight?.status),
    source_video_preflight_readable_count: numberValue(preflight?.readable_count)
  };
}

function summarizeCutJobs(data: Record<string, unknown> | undefined): CutterApiSmokeReport["cut_jobs"] {
  if (!data) {
    return undefined;
  }
  const jobs = arrayValue(data.jobs);
  const counts = {
    failed_count: 0,
    running_count: 0,
    pending_count: 0,
    done_count: 0
  };
  for (const job of jobs) {
    const status = objectValue(job)?.status;
    if (status === "failed") counts.failed_count += 1;
    if (status === "running") counts.running_count += 1;
    if (status === "pending") counts.pending_count += 1;
    if (status === "done") counts.done_count += 1;
  }
  return {
    job_count: numberValue(data.job_count) ?? jobs.length,
    ...counts
  };
}

function defaultQueries(): string[] {
  return ["第一场", "现金流", "中国", "2026"];
}

export async function runCutterApiSmoke(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<{
  report: CutterApiSmokeReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const options = readOptions(input.options);
  const queries = options.queries ?? defaultQueries();
  const timeoutMs = options.timeout_ms ?? 8000;
  const sourceLimit = options.source_limit ?? 20;
  const report: CutterApiSmokeReport = {
    api_base_url: input.apiBaseUrl,
    query_candidates: queries,
    checks: []
  };

  const runtime = await requestJson({
    id: "runtime_status",
    path: "/cutter/runtime-status",
    baseUrl: input.apiBaseUrl,
    timeoutMs
  });
  report.checks.push(runtime.check);
  report.runtime = summarizeRuntime(dataObject(runtime.body));
  await input.onEvent?.("runtime_status", "Checked cutter runtime status.", report.runtime);

  const library = await requestJson({
    id: "source_library",
    path: `/cutter/source-library?limit=${sourceLimit}`,
    baseUrl: input.apiBaseUrl,
    timeoutMs
  });
  report.checks.push(library.check);
  const libraryData = dataObject(library.body);
  const videos = arrayValue(libraryData?.videos);
  const firstVideo = objectValue(videos[0]);
  report.source_library = libraryData
    ? {
        available_video_count: numberValue(libraryData.available_video_count) ?? numberValue(libraryData.total) ?? videos.length,
        returned_count: videos.length,
        first_source_video_id: stringValue(firstVideo?.source_video_id),
        first_title: stringValue(firstVideo?.title)
      }
    : undefined;
  await input.onEvent?.("source_library", "Checked public source library first page.", report.source_library);

  let selectedSourceVideoId: string | undefined;
  for (const query of queries) {
    const search = await requestJson({
      id: `source_search:${query}`,
      path: `/cutter/source-search?query=${encodeURIComponent(query)}&limit=10`,
      baseUrl: input.apiBaseUrl,
      timeoutMs
    });
    report.checks.push(search.check);
    const searchData = dataObject(search.body);
    const groups = arrayValue(searchData?.groups);
    const firstGroup = objectValue(groups[0]);
    if (search.check.ok && groups.length > 0) {
      selectedSourceVideoId = stringValue(firstGroup?.source_video_id);
      report.search = {
        query,
        groups_count: groups.length,
        hit_count: groups.reduce((sum, group) => sum + (numberValue(objectValue(group)?.hit_count) ?? 0), 0),
        search_ms: numberValue(searchData?.search_ms),
        search_mode: stringValue(searchData?.search_mode),
        source_video_id: selectedSourceVideoId,
        title: stringValue(firstGroup?.title)
      };
      await input.onEvent?.("source_search", "Found search results.", report.search);
      break;
    }
  }

  selectedSourceVideoId ??= report.source_library?.first_source_video_id;
  if (selectedSourceVideoId) {
    const detail = await requestJson({
      id: "source_video_detail",
      path: `/cutter/source-videos/${encodeURIComponent(selectedSourceVideoId)}`,
      baseUrl: input.apiBaseUrl,
      timeoutMs
    });
    report.checks.push(detail.check);
    const detailData = dataObject(detail.body);
    const transcript = objectValue(detailData?.transcript);
    const segments = arrayValue(transcript?.segments);
    report.detail = detailData
      ? {
          source_video_id: selectedSourceVideoId,
          title: stringValue(detailData.title),
          transcript_character_count: stringValue(transcript?.full_text)?.length ?? 0,
          segment_count: segments.length
        }
      : undefined;
    await input.onEvent?.("source_video_detail", "Loaded selected source video detail.", report.detail);
  }

  const jobs = await requestJson({
    id: "cut_jobs",
    path: "/cutter/cut-jobs",
    baseUrl: input.apiBaseUrl,
    timeoutMs
  });
  report.checks.push(jobs.check);
  report.cut_jobs = summarizeCutJobs(dataObject(jobs.body));
  await input.onEvent?.("cut_jobs", "Checked cut job queue.", report.cut_jobs);

  const failedCheck = report.checks.find((check) => !check.ok);
  if (failedCheck) {
    return {
      report,
      passed: false,
      failure_category: "api_smoke_failure",
      failure_message: `${failedCheck.id} failed: ${failedCheck.error ?? `HTTP ${failedCheck.status_code ?? "n/a"}`}`
    };
  }
  if (!report.source_library || report.source_library.available_video_count <= 0 || report.source_library.returned_count <= 0) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: "Public source library returned no visible source videos."
    };
  }
  if (!report.search || !report.search.source_video_id) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: `No search result found for query candidates: ${queries.join(", ")}`
    };
  }
  if (!report.detail || report.detail.segment_count <= 0 || report.detail.transcript_character_count <= 0) {
    return {
      report,
      passed: false,
      failure_category: "real_data_unavailable",
      failure_message: "Selected source video did not return a full transcript detail."
    };
  }

  return { report, passed: true };
}
