import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildFfmpegCoverImagePlan,
  buildFfmpegCutPlan,
  resolveFfmpegRuntime,
  type CutMode
} from "../../ffmpeg-core/src/index.ts";
import {
  allocateNextLocalClipId,
  appendUsageEvent,
  buildLocalClipArtifactPaths,
  createCutterLoginApplication,
  ensureCutterSessionForDevice,
  getCutterSourceVideoDetail,
  getLocalClipDetail,
  listCutterSourceLibrary,
  listLocalClips,
  searchCutterSourceLibrary,
  writeLocalClipManifest,
  validateCutterSession,
  type CutterUserRecord,
  type CutterSourceLibrarySearchGroup,
  type CutterSourceLibrarySearchResult,
  type CutterSourceVideoCard,
  type CutterSourceVideoDetail,
  type LocalClipView
} from "../../library-fs/src/index.ts";
import {
  buildProjectClipOutputFile,
  getExportClipDetail,
  deleteProjectOutputs,
  exportClipsDirectory,
  listClipLists,
  listCutJobs,
  listExportClips,
  readClipList,
  retryCutJob,
  runCutJob,
  runNextCutJob,
  submitClipListToQueue,
  writeClipList,
  type ClipListManifest,
  type CutJobSourceDetail,
  type CoverRunner,
  type ExportClipView,
  type RunNextCutJobInput,
  type WriteClipListItemInput
} from "../../cutter-local/src/index.ts";
import {
  createSegmentSpanSelection,
  resolveSourceVideoPath,
  type TranscriptSegment
} from "../../protocol/src/index.ts";

export interface CreateCutterApiServerInput {
  library_root: string;
  workspace_root?: string;
  searchd_base_url?: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
  usage_event_recorder?: CutterUsageEventRecorder;
  auth_mode?: "reviewed" | "local_trusted";
  trusted_user_id?: string;
  trusted_username?: string;
  now?: () => string;
  cut_runner?: CutterClipCutRunner;
  cover_runner?: CoverRunner;
  open_path?: CutterPathOpener;
}

export interface CutterApiRuntimeConfig extends CreateCutterApiServerInput {
  host: string;
  port: number;
}

export type CutterAuthMode = "reviewed" | "local_trusted";

export interface CutterApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

interface ApiSourceVideoUrls {
  detail_url: string;
  media_url: string;
  cover_url: string;
  subtitles_url: string;
}

type ApiSourceVideoCard = CutterSourceVideoCard & ApiSourceVideoUrls;
type ApiSourceVideoDetail = CutterSourceVideoDetail & ApiSourceVideoUrls;
type ApiSearchGroup = CutterSourceLibrarySearchGroup & ApiSourceVideoUrls;

const SOURCE_VIDEO_ID_PATTERN = /^V\d{6}$/;
const LOCAL_CLIP_ID_PATTERN = /^(?:LC|E)\d{6}$/;
const CUT_JOB_ID_PATTERN = /^CJ\d{8}-\d{4}$/;

export interface CutterClipCutRunnerInput {
  source_video_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
}

export type CutterClipCutRunner = (input: CutterClipCutRunnerInput) => Promise<void> | void;
export type CutterPathOpener = (targetPath: string) => Promise<void> | void;

export type CutterUsageEventRecorder = (
  libraryRoot: string,
  event: Parameters<typeof appendUsageEvent>[1]
) => Promise<void> | void;

interface CreateLocalClipRequestBody {
  source_video_id?: unknown;
  start_segment_id?: unknown;
  end_segment_id?: unknown;
  begin_ms?: unknown;
  end_ms?: unknown;
  selected_text?: unknown;
  pre_roll_ms?: unknown;
  post_roll_ms?: unknown;
  cut_mode?: unknown;
  title?: unknown;
}

interface CreateClipListRequestBody {
  library_id?: unknown;
  project_id?: unknown;
  title?: unknown;
  items?: unknown;
}

interface SubmitCutJobsRequestBody {
  clip_list_id?: unknown;
}

interface OpenExportDirectoryRequestBody {
  project_id?: unknown;
  project_title?: unknown;
}

interface LocalClipSelection {
  source_video_id: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  pre_roll_ms: number;
  post_roll_ms: number;
  selected_text: string;
}

interface CutterLoginRequestBody {
  username?: unknown;
  device_id?: unknown;
  device_name?: unknown;
}

interface AuthenticatedCutterSession {
  user: CutterUserRecord;
  device_id: string;
}

interface CutterRuntimeStatusPayload {
  mode: "api";
  mode_label: string;
  api_ready: boolean;
  generated_at: string;
  library_id: string;
  library_root_label: string;
  library_root_path: string;
  available_video_count: number;
  workspace_enabled: boolean;
  workspace_root_label: string;
  workspace_root_path: string;
  local_clip_count: number;
  ffmpeg_status: "可用" | "不可用";
  ffmpeg_source: "内置" | "环境配置" | "未检测到";
  local_runtime: {
    cpu_usage_percent: number;
    disk_io_bytes_per_second?: number;
  };
  search_backend: CutterSearchBackendStatus;
  current_user: {
    user_id: string;
    username: string;
    display_name: string;
  };
}

interface CutterSearchBackendStatus {
  mode: "searchd" | "sqlite-index" | "transcript-artifact-fallback";
  preferred_mode: "searchd" | "sqlite-index" | "transcript-artifact-fallback";
  label: string;
  healthy: boolean;
  degraded: boolean;
  index_version: string;
  source_video_count: number;
  segment_count: number;
  response_ms?: number;
  message: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function localCpuUsagePercent(): number {
  const coreCount = Math.max(1, os.cpus().length);
  const loadAverage = os.loadavg()[0] ?? 0;
  return clampPercent((loadAverage / coreCount) * 100);
}

export function parseIostatDiskIoBytesPerSecond(output: string): number | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let mbColumnIndexes: number[] = [];
  let latestBytesPerSecond: number | undefined;

  for (const line of lines) {
    const columns = line.split(/\s+/);
    if (columns.includes("MB/s")) {
      mbColumnIndexes = columns
        .map((column, index) => (column === "MB/s" ? index : -1))
        .filter((index) => index >= 0);
      continue;
    }

    if (mbColumnIndexes.length === 0 || !/^-?\d/.test(columns[0] ?? "")) {
      continue;
    }

    const totalMbPerSecond = mbColumnIndexes.reduce((total, index) => {
      const value = Number.parseFloat(columns[index] ?? "");
      return Number.isFinite(value) ? total + Math.max(0, value) : total;
    }, 0);
    latestBytesPerSecond = Math.round(totalMbPerSecond * 1024 * 1024);
  }

  return latestBytesPerSecond;
}

async function localDiskIoBytesPerSecond(): Promise<number | undefined> {
  if (process.platform !== "darwin") {
    return undefined;
  }

  return new Promise((resolve) => {
    const child = spawn("iostat", ["-d", "-w", "1", "-c", "2"]);
    let settled = false;
    let output = "";

    const finish = (value: number | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(undefined);
    }, 1500);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => finish(undefined));
    child.on("close", () => finish(parseIostatDiskIoBytesPerSecond(output)));
  });
}

const LOCAL_DISK_IO_CACHE_TTL_MS = 10_000;
let localDiskIoCache: {
  value: number | undefined;
  expires_at_ms: number;
  sampling: boolean;
} = {
  value: undefined,
  expires_at_ms: 0,
  sampling: false
};

function cachedLocalDiskIoBytesPerSecond(nowMs = Date.now()): number | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  if (nowMs < localDiskIoCache.expires_at_ms) {
    return localDiskIoCache.value;
  }

  if (!localDiskIoCache.sampling) {
    localDiskIoCache = {
      ...localDiskIoCache,
      sampling: true
    };
    void localDiskIoBytesPerSecond()
      .then((value) => {
        localDiskIoCache = {
          value,
          expires_at_ms: Date.now() + LOCAL_DISK_IO_CACHE_TTL_MS,
          sampling: false
        };
      })
      .catch(() => {
        localDiskIoCache = {
          value: localDiskIoCache.value,
          expires_at_ms: Date.now() + LOCAL_DISK_IO_CACHE_TTL_MS,
          sampling: false
        };
      });
  }

  return localDiskIoCache.value;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultCutterWorkspaceRoot(): string {
  return path.join(os.homedir(), "Movies", "MixLabLocal");
}

export function resolveCutterApiRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): CutterApiRuntimeConfig {
  const libraryRoot =
    optionalTrimmed(env.MIXLAB_CUTTER_LIBRARY_ROOT) ??
    optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_ROOT);

  if (!libraryRoot) {
    throw new Error("MIXLAB_CUTTER_LIBRARY_ROOT or MIXLAB_PREPROCESS_LIBRARY_ROOT is required");
  }

  const rawPort = optionalTrimmed(env.MIXLAB_CUTTER_API_PORT);
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3789;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MIXLAB_CUTTER_API_PORT must be an integer between 1 and 65535");
  }

  const rawAuthMode = optionalTrimmed(env.MIXLAB_CUTTER_AUTH_MODE);
  if (rawAuthMode && rawAuthMode !== "reviewed" && rawAuthMode !== "local_trusted") {
    throw new Error("MIXLAB_CUTTER_AUTH_MODE must be reviewed or local_trusted");
  }
  const authMode: CreateCutterApiServerInput["auth_mode"] =
    rawAuthMode === "reviewed" || rawAuthMode === "local_trusted" ? rawAuthMode : undefined;

  return {
    library_root: libraryRoot,
    workspace_root: optionalTrimmed(env.MIXLAB_CUTTER_WORKSPACE_ROOT) ?? defaultCutterWorkspaceRoot(),
    searchd_base_url:
      optionalTrimmed(env.MIXLAB_SEARCHD_BASE_URL) ??
      optionalTrimmed(env.MIXLAB_CUTTER_SEARCHD_BASE_URL),
    host: optionalTrimmed(env.MIXLAB_CUTTER_API_HOST) ?? "127.0.0.1",
    port,
    ...(authMode ? { auth_mode: authMode } : {}),
    trusted_user_id: optionalTrimmed(env.MIXLAB_CUTTER_TRUSTED_USER_ID),
    trusted_username: optionalTrimmed(env.MIXLAB_CUTTER_TRUSTED_USERNAME)
  };
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,DELETE,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Range,X-MixLab-Device-Id,X-MixLab-Session-Token"
  );
  response.setHeader("Access-Control-Expose-Headers", "Content-Length,Content-Range,Accept-Ranges");
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function writeNoContent(response: ServerResponse): void {
  setCorsHeaders(response);
  response.writeHead(204);
  response.end();
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string
): void {
  writeJson(response, statusCode, {
    error: {
      code,
      message
    }
  } satisfies CutterApiErrorBody);
}

export function cutterApiInfrastructureErrorPayload(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} | null {
  if (hasErrorCode(error, "ENOSPC") || errorMessageIncludes(error, "no space left on device")) {
    return {
      statusCode: 507,
      code: "insufficient_storage",
      message: "本机磁盘空间不足，无法写入剪切任务或本地素材。请清理 MixLab 本地缓存或更换本地工作区后重试。"
    };
  }

  return null;
}

function hasErrorCode(error: unknown, code: string, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown };
  return record.code === code || hasErrorCode(record.cause, code, depth + 1);
}

function errorMessageIncludes(error: unknown, needle: string, depth = 0): boolean {
  if (!error || depth > 3) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes(needle)) {
    return true;
  }

  if (typeof error === "object") {
    return errorMessageIncludes((error as { cause?: unknown }).cause, needle, depth + 1);
  }

  return false;
}

function apiResponse(data: unknown): { schema_version: "1.0"; data: unknown } {
  return {
    schema_version: "1.0",
    data
  };
}

function sourceVideoUrls(sourceVideoId: string): ApiSourceVideoUrls {
  return {
    detail_url: `/cutter/source-videos/${sourceVideoId}`,
    media_url: `/cutter/source-videos/${sourceVideoId}/media`,
    cover_url: `/cutter/source-videos/${sourceVideoId}/cover`,
    subtitles_url: `/cutter/source-videos/${sourceVideoId}/subtitles.srt`
  };
}

function localClipUrls(localClipId: string): {
  detail_url: string;
  media_url: string;
} {
  return {
    detail_url: `/cutter/local-clips/${localClipId}`,
    media_url: `/cutter/local-clips/${localClipId}/media`
  };
}

function addLocalClipUrls<T extends { local_clip_id: string }>(item: T): T & {
  detail_url: string;
  media_url: string;
} {
  return {
    ...item,
    ...localClipUrls(item.local_clip_id)
  };
}

function addSourceVideoUrls<T extends { source_video_id: string }>(item: T): T & ApiSourceVideoUrls {
  return {
    ...item,
    ...sourceVideoUrls(item.source_video_id)
  };
}

function parsePositiveLimit(value: string | null): number {
  if (value === null || value.trim() === "") {
    return 20;
  }

  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  return limit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function numberField(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanField(record: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSearchdBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function searchdSourceSearchUrl(input: {
  base_url: string;
  query: string;
  limit: number;
  cursor?: string;
}): string {
  const url = new URL(`${normalizeSearchdBaseUrl(input.base_url)}/source-search`);
  url.searchParams.set("query", input.query);
  url.searchParams.set("limit", String(input.limit));
  if (input.cursor) {
    url.searchParams.set("cursor", input.cursor);
  }

  return url.toString();
}

function searchdSourceVideoDetailUrl(input: {
  base_url: string;
  source_video_id: string;
}): string {
  return `${normalizeSearchdBaseUrl(input.base_url)}/source-videos/${encodeURIComponent(input.source_video_id)}/detail`;
}

function searchdHealthUrl(baseUrl: string): string {
  return `${normalizeSearchdBaseUrl(baseUrl)}/health`;
}

function unwrapSearchdPayload(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.data)) {
    return value.data;
  }

  return value;
}

function coerceSearchdHitSegment(value: unknown): CutterSourceLibrarySearchGroup["hit_segments"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const segmentId = stringField(value, "segment_id");
  const text = stringField(value, "text");
  if (!segmentId || !text) {
    return null;
  }

  const ranges = Array.isArray(value.match_ranges)
    ? value.match_ranges
        .filter((range): range is [number, number] =>
          Array.isArray(range) &&
          range.length === 2 &&
          typeof range[0] === "number" &&
          typeof range[1] === "number"
        )
    : [];
  const matchType = value.match_type === "tolerant" ? "tolerant" : value.match_type === "exact" ? "exact" : undefined;

  return {
    segment_id: segmentId,
    begin_ms: numberField(value, "begin_ms"),
    end_ms: numberField(value, "end_ms"),
    text,
    match_ranges: ranges,
    ...(typeof value.match_id === "string" ? { match_id: value.match_id } : {}),
    ...(matchType ? { match_type: matchType } : {})
  };
}

function coerceSearchdGroup(value: unknown): CutterSourceLibrarySearchGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceVideoId = stringField(value, "source_video_id");
  const title = stringField(value, "title");
  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId) || !title) {
    return null;
  }

  const hitSegments = Array.isArray(value.hit_segments)
    ? value.hit_segments
        .map(coerceSearchdHitSegment)
        .filter((segment): segment is CutterSourceLibrarySearchGroup["hit_segments"][number] => Boolean(segment))
    : [];

  if (hitSegments.length === 0) {
    return null;
  }

  return {
    source_video_id: sourceVideoId,
    title,
    duration_ms: numberField(value, "duration_ms"),
    hit_count: Math.max(1, Math.round(numberField(value, "hit_count", hitSegments.length))),
    best_excerpt: stringField(value, "best_excerpt", hitSegments[0]?.text ?? ""),
    hit_segments: hitSegments,
    relative_path: stringField(value, "relative_path"),
    source_video_file_path: stringField(value, "source_video_file_path"),
    cover_path: stringField(value, "cover_path"),
    cover_file_path: stringField(value, "cover_file_path"),
    transcript_character_count: Math.max(0, Math.round(numberField(value, "transcript_character_count")))
  };
}

function coerceSearchdResult(input: {
  payload: unknown;
  query: string;
  limit: number;
  cursor?: string;
  elapsed_ms: number;
}): CutterSourceLibrarySearchResult {
  const record = unwrapSearchdPayload(input.payload);
  if (!isRecord(record)) {
    throw new Error("invalid_searchd_response");
  }

  const groups = Array.isArray(record.groups)
    ? record.groups
        .map(coerceSearchdGroup)
        .filter((group): group is CutterSourceLibrarySearchGroup => Boolean(group))
    : [];
  const normalizedQuery = stringField(record, "normalized_query", input.query.trim());

  return {
    query: stringField(record, "query", input.query),
    normalized_query: normalizedQuery,
    groups,
    cursor: stringField(record, "cursor", input.cursor ?? ""),
    next_cursor: stringField(record, "next_cursor"),
    has_more: booleanField(record, "has_more"),
    returned_count: Math.max(0, Math.round(numberField(record, "returned_count", groups.length))),
    limit: Math.max(1, Math.round(numberField(record, "limit", input.limit))),
    index_version: stringField(record, "index_version"),
    search_ms: Math.max(0, Math.round(numberField(record, "search_ms", input.elapsed_ms))),
    search_mode: "searchd"
  };
}

function coerceSearchdTranscriptSegment(value: unknown): TranscriptSegment | null {
  if (!isRecord(value)) {
    return null;
  }

  const segmentId = stringField(value, "segment_id");
  const text = stringField(value, "text");
  if (!segmentId || !text) {
    return null;
  }

  return {
    segment_id: segmentId,
    index: Math.max(0, Math.round(numberField(value, "index"))),
    begin_ms: Math.max(0, Math.round(numberField(value, "begin_ms"))),
    end_ms: Math.max(0, Math.round(numberField(value, "end_ms"))),
    begin_char: Math.max(0, Math.round(numberField(value, "begin_char"))),
    end_char: Math.max(0, Math.round(numberField(value, "end_char", text.length))),
    normalized_begin_char: Math.max(0, Math.round(numberField(value, "normalized_begin_char"))),
    normalized_end_char: Math.max(0, Math.round(numberField(value, "normalized_end_char"))),
    text,
    normalized_text: stringField(value, "normalized_text"),
    confidence: numberField(value, "confidence", 1)
  };
}

function coerceSearchdTranscript(value: unknown): CutterSourceVideoDetail["transcript"] {
  if (!isRecord(value)) {
    throw new Error("invalid_searchd_response");
  }

  const sourceVideoId = stringField(value, "source_video_id");
  const segments = Array.isArray(value.segments)
    ? value.segments
        .map(coerceSearchdTranscriptSegment)
        .filter((segment): segment is TranscriptSegment => Boolean(segment))
    : [];

  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId) || segments.length === 0) {
    throw new Error("invalid_searchd_response");
  }

  return {
    schema_version: stringField(value, "schema_version", "1.0"),
    source_video_id: sourceVideoId,
    provider: stringField(value, "provider", "sqlite-index"),
    model: stringField(value, "model", "source-transcript-index"),
    generated_at: stringField(value, "generated_at"),
    duration_ms: Math.max(0, Math.round(numberField(value, "duration_ms"))),
    full_text: stringField(value, "full_text", segments.map((segment) => segment.text).join("")),
    segments
  };
}

function coerceSearchdSourceVideoDetailPayload(payload: unknown): {
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path: string;
  cover_path: string;
  transcript: CutterSourceVideoDetail["transcript"];
} {
  const record = unwrapSearchdPayload(payload);
  if (!isRecord(record)) {
    throw new Error("invalid_searchd_response");
  }

  const sourceVideoId = stringField(record, "source_video_id");
  const title = stringField(record, "title");
  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId) || !title) {
    throw new Error("invalid_searchd_response");
  }

  return {
    source_video_id: sourceVideoId,
    title,
    duration_ms: Math.max(0, Math.round(numberField(record, "duration_ms"))),
    relative_path: stringField(record, "relative_path"),
    cover_path: stringField(record, "cover_path"),
    transcript: coerceSearchdTranscript(record.transcript)
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : {};
}

async function readSearchdBackendStatus(input: {
  searchd_base_url: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
}): Promise<CutterSearchBackendStatus> {
  const startedAt = Date.now();
  const fetchImpl = input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, input.searchd_timeout_ms ?? 800));

  try {
    const response = await fetchImpl(searchdHealthUrl(input.searchd_base_url), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);
    const record = unwrapSearchdPayload(payload);

    if (!response.ok || !isRecord(record)) {
      throw new Error("searchd_unavailable");
    }

    return {
      mode: "searchd",
      preferred_mode: "searchd",
      label: "本地 searchd",
      healthy: true,
      degraded: false,
      index_version: stringField(record, "index_version"),
      source_video_count: Math.max(0, Math.round(numberField(record, "source_video_count"))),
      segment_count: Math.max(0, Math.round(numberField(record, "segment_count"))),
      response_ms: Math.max(0, Date.now() - startedAt),
      message: "本地 Tantivy 搜索索引可用"
    };
  } finally {
    clearTimeout(timeout);
  }
}

type SearchCursorBackend = "none" | "searchd" | "local-index" | "unknown";

function searchCursorBackend(cursor: string | undefined): SearchCursorBackend {
  const normalized = cursor?.trim();
  if (!normalized) {
    return "none";
  }

  if (normalized.startsWith("searchd:")) {
    return "searchd";
  }

  if (normalized.startsWith("sqlite:") || normalized.startsWith("artifact:")) {
    return "local-index";
  }

  return "unknown";
}

function failedSearchAttemptMode(
  cursor: string | undefined
): Parameters<typeof appendUsageEvent>[1]["search_mode"] | undefined {
  const normalized = cursor?.trim();
  if (normalized?.startsWith("searchd:")) {
    return "searchd";
  }
  if (normalized?.startsWith("sqlite:")) {
    return "sqlite-index";
  }
  if (normalized?.startsWith("artifact:")) {
    return "transcript-artifact-fallback";
  }

  return undefined;
}

async function searchCutterSourceLibraryViaSearchd(input: {
  searchd_base_url: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
  query: string;
  limit: number;
  cursor?: string;
}): Promise<CutterSourceLibrarySearchResult> {
  const startedAt = Date.now();
  const fetchImpl = input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, input.searchd_timeout_ms ?? 1500));

  try {
    const response = await fetchImpl(searchdSourceSearchUrl({
      base_url: input.searchd_base_url,
      query: input.query,
      limit: input.limit,
      cursor: input.cursor
    }), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      const data = unwrapSearchdPayload(payload);
      const errorCode = isRecord(data) && isRecord(data.error)
        ? stringField(data.error, "code")
        : isRecord(data)
          ? stringField(data, "code")
          : "";
      if (errorCode === "invalid_search_cursor" || response.status === 400) {
        throw new Error("invalid_search_cursor");
      }

      throw new Error("searchd_unavailable");
    }

    return coerceSearchdResult({
      payload,
      query: input.query,
      limit: input.limit,
      cursor: input.cursor,
      elapsed_ms: Date.now() - startedAt
    });
  } catch (error) {
    if ((error as Error).message === "invalid_search_cursor") {
      throw error;
    }

    throw new Error("searchd_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function libraryRelativeFilePath(libraryRoot: string, libraryRelativePath: string): string {
  const normalized = libraryRelativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("artifact path must be a library-relative path");
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("artifact path cannot escape library root");
  }

  return path.join(libraryRoot, ...parts);
}

function optionalLibraryRelativeFilePath(libraryRoot: string, libraryRelativePath: string): string {
  return optionalTrimmed(libraryRelativePath)
    ? libraryRelativeFilePath(libraryRoot, libraryRelativePath)
    : "";
}

function searchdTranscriptDetail(input: {
  library_root: string;
  indexed: ReturnType<typeof coerceSearchdSourceVideoDetailPayload>;
}): CutterSourceVideoDetail {
  const artifactRoot = `.mixlab-library/videos/${input.indexed.source_video_id}`;

  return {
    source_video_id: input.indexed.source_video_id,
    title: input.indexed.title,
    duration_ms: input.indexed.duration_ms,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: 0,
    relative_path: input.indexed.relative_path,
    logical_uri: "",
    source_video_file_path: input.indexed.relative_path
      ? resolveSourceVideoPath({
          mount_root: input.library_root,
          relative_path: input.indexed.relative_path
        })
      : "",
    cover_path: input.indexed.cover_path,
    cover_file_path: optionalLibraryRelativeFilePath(input.library_root, input.indexed.cover_path),
    transcript_path: `${artifactRoot}/transcript.json`,
    transcript_file_path: libraryRelativeFilePath(input.library_root, `${artifactRoot}/transcript.json`),
    srt_path: `${artifactRoot}/subtitles.srt`,
    srt_file_path: libraryRelativeFilePath(input.library_root, `${artifactRoot}/subtitles.srt`),
    keyframes_path: `${artifactRoot}/keyframes.json`,
    keyframes_file_path: libraryRelativeFilePath(input.library_root, `${artifactRoot}/keyframes.json`),
    transcript: input.indexed.transcript,
    srt: "",
    keyframes: {
      schema_version: "1.0",
      keyframes_ms: []
    }
  };
}

async function searchCutterSourceVideoTranscriptDetailViaSearchd(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
}): Promise<CutterSourceVideoDetail | null> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  if (!searchdBaseUrl) {
    return null;
  }

  const fetchImpl = input.api_input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, input.api_input.searchd_timeout_ms ?? 1500));

  try {
    const response = await fetchImpl(searchdSourceVideoDetailUrl({
      base_url: searchdBaseUrl,
      source_video_id: input.source_video_id
    }), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("searchd_unavailable");
    }

    return searchdTranscriptDetail({
      library_root: input.api_input.library_root,
      indexed: coerceSearchdSourceVideoDetailPayload(payload)
    });
  } catch (error) {
    if ((error as Error).message === "invalid_searchd_response") {
      throw error;
    }

    throw new Error("searchd_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCutterSourceVideoDetailViaSearchd(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
}): Promise<CutterSourceVideoDetail | null> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  if (!searchdBaseUrl) {
    return null;
  }

  const fetchImpl = input.api_input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, input.api_input.searchd_timeout_ms ?? 1500));

  try {
    const response = await fetchImpl(searchdSourceVideoDetailUrl({
      base_url: searchdBaseUrl,
      source_video_id: input.source_video_id
    }), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("searchd_unavailable");
    }

    return searchdTranscriptDetail({
      library_root: input.api_input.library_root,
      indexed: coerceSearchdSourceVideoDetailPayload(payload)
    });
  } catch (error) {
    if ((error as Error).message === "invalid_searchd_response") {
      throw error;
    }

    throw new Error("searchd_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCutterSourceLibraryWithPreferredBackend(input: {
  api_input: CreateCutterApiServerInput;
  query: string;
  limit: number;
  cursor?: string;
}): Promise<CutterSourceLibrarySearchResult> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  const cursorBackend = searchCursorBackend(input.cursor);
  if (searchdBaseUrl && cursorBackend !== "local-index") {
    try {
      return await searchCutterSourceLibraryViaSearchd({
        searchd_base_url: searchdBaseUrl,
        searchd_fetch: input.api_input.searchd_fetch,
        searchd_timeout_ms: input.api_input.searchd_timeout_ms,
        query: input.query,
        limit: input.limit,
        cursor: input.cursor
      });
    } catch (error) {
      if ((error as Error).message === "invalid_search_cursor" || cursorBackend === "searchd" || cursorBackend === "unknown") {
        throw error;
      }
      // First-page search remains usable if local searchd is restarting or absent.
      // Cursor continuations stay on the same backend to avoid mixing result windows.
    }
  }

  return searchCutterSourceLibrary({
    library_root: input.api_input.library_root,
    query: input.query,
    limit: input.limit,
    cursor: input.cursor
  });
}

function parseSourceVideoRoute(
  pathname: string
): { source_video_id: string; action: "" | "media" | "cover" | "subtitles.srt" } | undefined {
  const match = /^\/cutter\/source-videos\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);

  if (!match) {
    return undefined;
  }

  const sourceVideoId = match[1] ?? "";
  const action = match[2] ?? "";

  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) {
    throw new Error("invalid_source_video_id");
  }

  if (action !== "" && action !== "media" && action !== "cover" && action !== "subtitles.srt") {
    throw new Error("not_found");
  }

  return {
    source_video_id: sourceVideoId,
    action
  };
}

function parseLocalClipRoute(
  pathname: string
): { local_clip_id: string; action: "" | "media" | "cover" | "subtitles.srt" } | undefined {
  const match = /^\/cutter\/local-clips\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);

  if (!match) {
    return undefined;
  }

  const localClipId = match[1] ?? "";
  const action = match[2] ?? "";

  if (!LOCAL_CLIP_ID_PATTERN.test(localClipId)) {
    throw new Error("invalid_local_clip_id");
  }

  if (action !== "" && action !== "media" && action !== "cover" && action !== "subtitles.srt") {
    throw new Error("not_found");
  }

  return {
    local_clip_id: localClipId,
    action
  };
}

function contentTypeForSourceVideo(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".mp4" || extension === ".m4v") {
    return "video/mp4";
  }

  if (extension === ".mov") {
    return "video/quicktime";
  }

  if (extension === ".webm") {
    return "video/webm";
  }

  if (extension === ".mkv") {
    return "video/x-matroska";
  }

  return "application/octet-stream";
}

function contentTypeForImage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number
): { start: number; end: number } | undefined {
  if (!rangeHeader) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

  if (!match) {
    throw new Error("invalid_range");
  }

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";

  if (startText === "" && endText === "") {
    throw new Error("invalid_range");
  }

  if (startText === "") {
    const suffixLength = Number.parseInt(endText, 10);

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw new Error("invalid_range");
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1
    };
  }

  const start = Number.parseInt(startText, 10);
  const end = endText === "" ? fileSize - 1 : Number.parseInt(endText, 10);

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    throw new Error("invalid_range");
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}

async function streamFile(input: {
  request: IncomingMessage;
  response: ServerResponse;
  file_path: string;
  content_type: string;
  range_enabled: boolean;
}): Promise<void> {
  const fileStat = await stat(input.file_path);
  const range = input.range_enabled
    ? parseRangeHeader(input.request.headers.range, fileStat.size)
    : undefined;

  setCorsHeaders(input.response);

  if (input.range_enabled) {
    input.response.setHeader("Accept-Ranges", "bytes");
  }

  if (range) {
    input.response.writeHead(206, {
      "Content-Type": input.content_type,
      "Content-Length": range.end - range.start + 1,
      "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`
    });
    createReadStream(input.file_path, { start: range.start, end: range.end }).pipe(
      input.response
    );
    return;
  }

  input.response.writeHead(200, {
    "Content-Type": input.content_type,
    "Content-Length": fileStat.size
  });
  createReadStream(input.file_path).pipe(input.response);
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > 1_000_000) {
      throw new Error("request_body_too_large");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

function requiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }

  return optionalTrimmed(value);
}

function requiredChineseString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function requestIpAddress(request: IncomingMessage): string | undefined {
  const forwardedFor = firstHeaderValue(request.headers["x-forwarded-for"]);
  const forwardedIp = forwardedFor.split(",")[0]?.trim();
  if (forwardedIp) {
    return forwardedIp;
  }

  return request.socket.remoteAddress?.trim() || undefined;
}

function currentNow(input: CreateCutterApiServerInput): string {
  return input.now?.() ?? new Date().toISOString();
}

function trustedDesktopSession(input: CreateCutterApiServerInput): AuthenticatedCutterSession {
  const now = currentNow(input);
  const userId = input.trusted_user_id?.trim() || "CU-DESKTOP-LOCAL";
  const username = input.trusted_username?.trim() || "Allen";

  return {
    user: {
      user_id: userId,
      username,
      display_name: username,
      status: "approved",
      applied_at: now,
      approved_at: now,
      rejected_at: "",
      disabled_at: "",
      last_login_at: now,
      last_used_at: now,
      note: "Windows 桌面端本地可信会话",
      devices: [
        {
          device_id: "desktop-local",
          device_name: "MixLab Windows Desktop",
          status: "active",
          first_seen_at: now,
          last_login_at: now
        }
      ]
    },
    device_id: "desktop-local"
  };
}

async function requireCutterSession(input: {
  api_input: CreateCutterApiServerInput;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<AuthenticatedCutterSession | null> {
  if (input.api_input.auth_mode === "local_trusted") {
    return trustedDesktopSession(input.api_input);
  }

  const deviceId = firstHeaderValue(input.request.headers["x-mixlab-device-id"]);
  const sessionToken = firstHeaderValue(input.request.headers["x-mixlab-session-token"]);

  if (!deviceId || !sessionToken) {
    writeError(input.response, 401, "login_required", "请先登录剪辑工作台");
    return null;
  }

  const validation = await validateCutterSession(input.api_input.library_root, {
    device_id: deviceId,
    session_token: sessionToken,
    now: currentNow(input.api_input)
  });

  if (!validation.ok) {
    writeError(input.response, 401, "login_required", validation.reason);
    return null;
  }

  return {
    user: validation.user,
    device_id: deviceId
  };
}

async function recordCutterUsageEventBestEffort(input: {
  api_input: CreateCutterApiServerInput;
  auth: AuthenticatedCutterSession;
  event_type: Parameters<typeof appendUsageEvent>[1]["event_type"];
  source_video_id?: string;
  cut_job_id?: string;
  query?: string;
  search_mode?: Parameters<typeof appendUsageEvent>[1]["search_mode"];
  search_page_type?: Parameters<typeof appendUsageEvent>[1]["search_page_type"];
  search_elapsed_ms?: number;
  selected_duration_ms?: number;
  result_status?: Parameters<typeof appendUsageEvent>[1]["result_status"];
}): Promise<void> {
  try {
    const recorder = input.api_input.usage_event_recorder ?? appendUsageEvent;
    await recorder(input.api_input.library_root, {
      user_id: input.auth.user.user_id,
      username: input.auth.user.username,
      device_id: input.auth.device_id,
      event_type: input.event_type,
      occurred_at: currentNow(input.api_input),
      source_video_id: input.source_video_id,
      cut_job_id: input.cut_job_id,
      query: input.query,
      search_mode: input.search_mode,
      search_page_type: input.search_page_type,
      search_elapsed_ms: input.search_elapsed_ms,
      selected_duration_ms: input.selected_duration_ms,
      result_status: input.result_status
    });
  } catch {
    // Usage analytics are best-effort for cutter workflows. Do not let malformed
    // history or write failures turn successful search/view/cut actions into 500s.
  }
}

async function recordCutterUsageEventsBestEffort(
  events: Array<Parameters<typeof recordCutterUsageEventBestEffort>[0]>
): Promise<void> {
  for (const event of events) {
    await recordCutterUsageEventBestEffort(event);
  }
}

function selectedDurationMs(input: { begin_ms: number; end_ms: number }): number {
  return Math.max(input.end_ms - input.begin_ms, 0);
}

function optionalNonNegativeInteger(value: unknown, fallback: number, key: string): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return value;
}

function requiredNonNegativeInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return value;
}

function parseCutMode(value: unknown): CutMode {
  if (value === undefined || value === null || value === "") {
    return "copy";
  }

  if (value === "copy" || value === "smart" || value === "precise") {
    return value;
  }

  throw new Error("cut_mode must be copy, smart, or precise");
}

function formatClipTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function runFfmpegAsync(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`);
      reject(new Error(`ffmpeg clip cut failed: ${reason}`));
    });
  });
}

function defaultOpenPath(targetPath: string): Promise<void> {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [targetPath]]
      : process.platform === "win32"
        ? ["explorer", [targetPath]]
        : ["xdg-open", [targetPath]];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function defaultCutRunner(input: CutterClipCutRunnerInput): Promise<void> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfmpegCutPlan({
    source_path: input.source_video_path,
    output_path: input.output_path,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    cut_mode: input.cut_mode
  });

  await runFfmpegAsync(runtime.ffmpeg_path, plan.args);
}

async function defaultCoverRunner(input: {
  source_video_path: string;
  output_path: string;
  at_ms: number;
  width: number;
}): Promise<void> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfmpegCoverImagePlan({
    source_path: input.source_video_path,
    output_path: input.output_path,
    at_ms: input.at_ms,
    width: input.width
  });

  await runFfmpegAsync(runtime.ffmpeg_path, plan.args);
}

const VISIBLE_DETAIL_CACHE_TTL_MS = 10_000;

interface VisibleDetailCacheEntry {
  expires_at_ms: number;
  promise: Promise<CutterSourceVideoDetail | null>;
}

const visibleDetailCacheByInput = new WeakMap<
  CreateCutterApiServerInput,
  Map<string, VisibleDetailCacheEntry>
>();

async function loadVisibleDetailUncached(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  try {
    const searchdDetail = await searchCutterSourceVideoDetailViaSearchd({
      api_input: input,
      source_video_id: sourceVideoId
    });

    if (searchdDetail) {
      return searchdDetail;
    }
  } catch {
    // If searchd is restarting or does not expose detail yet, preserve the
    // existing artifact-backed detail path.
  }

  try {
    return await getCutterSourceVideoDetail({
      library_root: input.library_root,
      source_video_id: sourceVideoId
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function loadVisibleDetail(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  const nowMs = Date.now();
  let cache = visibleDetailCacheByInput.get(input);
  if (!cache) {
    cache = new Map();
    visibleDetailCacheByInput.set(input, cache);
  }

  const cached = cache.get(sourceVideoId);
  if (cached && cached.expires_at_ms > nowMs) {
    return cached.promise;
  }

  const promise = loadVisibleDetailUncached(input, sourceVideoId).catch((error) => {
    cache.delete(sourceVideoId);
    throw error;
  });
  cache.set(sourceVideoId, {
    expires_at_ms: nowMs + VISIBLE_DETAIL_CACHE_TTL_MS,
    promise
  });

  return promise;
}

async function loadReadableTranscriptDetail(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  const visibleDetail = await loadVisibleDetail(input, sourceVideoId);
  if (visibleDetail) {
    return visibleDetail;
  }

  try {
    const searchdDetail = await searchCutterSourceVideoTranscriptDetailViaSearchd({
      api_input: input,
      source_video_id: sourceVideoId
    });

    if (searchdDetail) {
      return searchdDetail;
    }
  } catch {
    // Preserve direct detail access while searchd is restarting or rebuilding.
  }

  return loadVisibleDetail(input, sourceVideoId);
}

async function readLibraryId(libraryRoot: string): Promise<string> {
  try {
    const library = JSON.parse(
      await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8")
    ) as { library_id?: unknown };

    if (typeof library.library_id === "string" && library.library_id.trim()) {
      return library.library_id.trim();
    }
  } catch {
    // A hand-built fixture may not have library.json; keep the local bridge usable.
  }

  return "local-library";
}

async function readReadyVideoCount(libraryRoot: string): Promise<number> {
  try {
    const current = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
        "utf8"
      )
    ) as { current_version?: unknown };

    if (typeof current.current_version === "string" && current.current_version.trim()) {
      const manifest = JSON.parse(
        await readFile(
          path.join(
            libraryRoot,
            ".mixlab-library",
            "indexes",
            "source-transcript-index",
            current.current_version,
            "index-manifest.json"
          ),
          "utf8"
        )
      ) as { ready_video_count?: unknown; source_video_ids?: unknown };

      if (typeof manifest.ready_video_count === "number") {
        return manifest.ready_video_count;
      }

      if (Array.isArray(manifest.source_video_ids)) {
        return manifest.source_video_ids.length;
      }
    }
  } catch {
    // Fall through to library.json for older or partially built libraries.
  }

  try {
    const library = JSON.parse(
      await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8")
    ) as { ready_video_count?: unknown };

    if (typeof library.ready_video_count === "number") {
      return library.ready_video_count;
    }
  } catch {
    // A hand-built fixture may not have library.json.
  }

  return 0;
}

async function readSqliteSearchBackendStatus(input: {
  library_root: string;
  preferred_mode?: CutterSearchBackendStatus["preferred_mode"];
  degraded_reason?: string;
}): Promise<CutterSearchBackendStatus> {
  const preferredMode = input.preferred_mode ?? "sqlite-index";

  try {
    const current = JSON.parse(
      await readFile(
        path.join(input.library_root, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
        "utf8"
      )
    ) as { current_version?: unknown };
    const currentVersion =
      typeof current.current_version === "string" && current.current_version.trim()
        ? current.current_version.trim()
        : "";

    if (currentVersion) {
      const manifest = JSON.parse(
        await readFile(
          path.join(
            input.library_root,
            ".mixlab-library",
            "indexes",
            "source-transcript-index",
            currentVersion,
            "index-manifest.json"
          ),
          "utf8"
        )
      ) as Record<string, unknown>;
      const sourceVideoCount = typeof manifest.ready_video_count === "number"
        ? manifest.ready_video_count
        : Array.isArray(manifest.source_video_ids)
          ? manifest.source_video_ids.length
          : 0;
      const degraded = preferredMode !== "sqlite-index";

      return {
        mode: "sqlite-index",
        preferred_mode: preferredMode,
        label: degraded ? "本地索引（searchd 未响应）" : "本地索引",
        healthy: true,
        degraded,
        index_version: stringField(manifest, "index_version", currentVersion),
        source_video_count: Math.max(0, Math.round(sourceVideoCount)),
        segment_count: 0,
        message: degraded
          ? "本地 searchd 未响应，首批搜索会降级到 SQLite 索引"
          : "SQLite 搜索索引可用"
      };
    }
  } catch {
    // Fall through to transcript artifact fallback.
  }

  return {
    mode: "transcript-artifact-fallback",
    preferred_mode: preferredMode,
    label: preferredMode === "searchd" ? "文案兜底（searchd 未响应）" : "文案兜底",
    healthy: true,
    degraded: true,
    index_version: "",
    source_video_count: await readReadyVideoCount(input.library_root),
    segment_count: 0,
    message: input.degraded_reason ?? "未发现可用搜索索引，搜索会读取文案 artifact 兜底"
  };
}

async function readSearchBackendStatus(
  input: CreateCutterApiServerInput
): Promise<CutterSearchBackendStatus> {
  const searchdBaseUrl = optionalTrimmed(input.searchd_base_url);

  if (searchdBaseUrl) {
    try {
      return await readSearchdBackendStatus({
        searchd_base_url: searchdBaseUrl,
        searchd_fetch: input.searchd_fetch,
        searchd_timeout_ms: input.searchd_timeout_ms
      });
    } catch {
      return readSqliteSearchBackendStatus({
        library_root: input.library_root,
        preferred_mode: "searchd",
        degraded_reason: "本地 searchd 未响应，搜索会降级到可用的本地索引或文案兜底"
      });
    }
  }

  return readSqliteSearchBackendStatus({
    library_root: input.library_root
  });
}

function pathLabel(filePath: string | undefined, fallback: string): string {
  if (!filePath) {
    return fallback;
  }

  return path.basename(filePath) || filePath;
}

async function runtimeStatusForSession(input: {
  api_input: CreateCutterApiServerInput;
  auth: AuthenticatedCutterSession;
}): Promise<CutterRuntimeStatusPayload> {
  const localClips = input.api_input.workspace_root
    ? await listExportClips({ workspace_root: input.api_input.workspace_root })
    : await listLocalClips({ library_root: input.api_input.library_root });

  let ffmpegStatus: CutterRuntimeStatusPayload["ffmpeg_status"] = "不可用";
  let ffmpegSource: CutterRuntimeStatusPayload["ffmpeg_source"] = "未检测到";

  try {
    const runtime = resolveFfmpegRuntime();
    ffmpegStatus = "可用";
    ffmpegSource = runtime.source === "env" ? "环境配置" : "内置";
  } catch {
    ffmpegStatus = "不可用";
  }

  const diskIoBytesPerSecond = cachedLocalDiskIoBytesPerSecond();

  return {
    mode: "api",
    mode_label: "真实 Cutter API 模式",
    api_ready: true,
    generated_at: input.api_input.now?.() ?? new Date().toISOString(),
    library_id: await readLibraryId(input.api_input.library_root),
    library_root_label: pathLabel(input.api_input.library_root, "公共素材库"),
    library_root_path: input.api_input.library_root,
    available_video_count: await readReadyVideoCount(input.api_input.library_root),
    workspace_enabled: Boolean(input.api_input.workspace_root),
    workspace_root_label: pathLabel(input.api_input.workspace_root, "未启用本地剪切工作区"),
    workspace_root_path: input.api_input.workspace_root ?? "",
    local_clip_count: localClips.local_clip_count,
    ffmpeg_status: ffmpegStatus,
    ffmpeg_source: ffmpegSource,
    local_runtime: {
      cpu_usage_percent: localCpuUsagePercent(),
      ...(typeof diskIoBytesPerSecond === "number"
        ? { disk_io_bytes_per_second: diskIoBytesPerSecond }
        : {})
    },
    search_backend: await readSearchBackendStatus(input.api_input),
    current_user: {
      user_id: input.auth.user.user_id,
      username: input.auth.user.username,
      display_name: input.auth.user.display_name
    }
  };
}

function workspaceRootOrThrow(input: CreateCutterApiServerInput): string {
  if (!input.workspace_root) {
    throw new Error("workspace_root is required for cutter workspace routes");
  }

  return input.workspace_root;
}

function workspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("workspace path must be relative");
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.includes("..")) {
    throw new Error("workspace path must be relative");
  }

  return path.join(workspaceRoot, ...parts);
}

function toWorkspaceLocalClipPayload(clip: ExportClipView): ExportClipView & {
  detail_url: string;
  media_url: string;
  cover_url?: string;
  subtitles_url?: string;
  relative_path: string;
} {
  return {
    ...addLocalClipUrls(clip),
    ...(clip.cover_file_path ? { cover_url: `/cutter/local-clips/${clip.local_clip_id}/cover` } : {}),
    ...(clip.subtitles_file_path ? { subtitles_url: `/cutter/local-clips/${clip.local_clip_id}/subtitles.srt` } : {}),
    relative_path: clip.local_asset_relative_path ?? clip.output_file
  };
}

function parseClipListItems(value: unknown): WriteClipListItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("items must contain at least one cut-list row");
  }

  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`items[${index}] must be an object`);
    }

    const item = raw as Record<string, unknown>;

    return {
      source_video_id: requiredString(item.source_video_id, `items[${index}].source_video_id`),
      source_title: requiredString(item.source_title, `items[${index}].source_title`),
      source_relative_path: requiredString(item.source_relative_path, `items[${index}].source_relative_path`),
      start_segment_id: requiredString(item.start_segment_id, `items[${index}].start_segment_id`),
      end_segment_id: requiredString(item.end_segment_id, `items[${index}].end_segment_id`),
      begin_ms: requiredNonNegativeInteger(item.begin_ms, `items[${index}].begin_ms`),
      end_ms: requiredNonNegativeInteger(item.end_ms, `items[${index}].end_ms`),
      selected_text: requiredString(item.selected_text, `items[${index}].selected_text`),
      cut_mode: parseCutMode(item.cut_mode),
      pre_roll_ms: optionalNonNegativeInteger(item.pre_roll_ms, 0, `items[${index}].pre_roll_ms`),
      post_roll_ms: optionalNonNegativeInteger(item.post_roll_ms, 0, `items[${index}].post_roll_ms`)
    };
  });
}

function preciseLocalClipSelectionRequested(body: CreateLocalClipRequestBody): boolean {
  return body.begin_ms !== undefined ||
    body.end_ms !== undefined ||
    body.selected_text !== undefined;
}

function resolveLocalClipSelection(input: {
  source_video_id: string;
  segments: TranscriptSegment[];
  body: CreateLocalClipRequestBody;
}): LocalClipSelection {
  const startSegmentId = requiredString(input.body.start_segment_id, "start_segment_id");
  const endSegmentId = requiredString(input.body.end_segment_id, "end_segment_id");
  const preRollMs = optionalNonNegativeInteger(input.body.pre_roll_ms, 0, "pre_roll_ms");
  const postRollMs = optionalNonNegativeInteger(input.body.post_roll_ms, 0, "post_roll_ms");

  if (!preciseLocalClipSelectionRequested(input.body)) {
    return createSegmentSpanSelection({
      source_video_id: input.source_video_id,
      segments: input.segments,
      start_segment_id: startSegmentId,
      end_segment_id: endSegmentId,
      pre_roll_ms: preRollMs,
      post_roll_ms: postRollMs
    });
  }

  const segmentSpan = createSegmentSpanSelection({
    source_video_id: input.source_video_id,
    segments: input.segments,
    start_segment_id: startSegmentId,
    end_segment_id: endSegmentId
  });
  const beginMs = requiredNonNegativeInteger(input.body.begin_ms, "begin_ms");
  const endMs = requiredNonNegativeInteger(input.body.end_ms, "end_ms");
  const selectedText = requiredString(input.body.selected_text, "selected_text");

  if (endMs <= beginMs) {
    throw new Error("end_ms must be greater than begin_ms");
  }

  if (beginMs < segmentSpan.begin_ms || endMs > segmentSpan.end_ms) {
    throw new Error("precise selection must stay within selected transcript segments");
  }

  return {
    source_video_id: input.source_video_id,
    start_segment_id: segmentSpan.start_segment_id,
    end_segment_id: segmentSpan.end_segment_id,
    begin_ms: Math.max(0, beginMs - preRollMs),
    end_ms: endMs + postRollMs,
    pre_roll_ms: preRollMs,
    post_roll_ms: postRollMs,
    selected_text: selectedText
  };
}

function localClipSelectionErrorPayload(error: unknown): { code: string; message: string } | undefined {
  const message = error instanceof Error ? error.message : "";

  if (
    message === "segment not found" ||
    message === "start segment must be before end segment" ||
    message === "start_segment_id is required" ||
    message === "end_segment_id is required"
  ) {
    return {
      code: "invalid_segment_selection",
      message
    };
  }

  if (
    message === "begin_ms must be a non-negative integer" ||
    message === "end_ms must be a non-negative integer" ||
    message === "selected_text is required" ||
    message === "end_ms must be greater than begin_ms" ||
    message === "precise selection must stay within selected transcript segments"
  ) {
    return {
      code: "invalid_precise_selection",
      message
    };
  }

  return undefined;
}

function cutJobSourceFromDetail(detail: CutterSourceVideoDetail): CutJobSourceDetail {
  return {
    source_video_id: detail.source_video_id,
    title: detail.title,
    relative_path: detail.relative_path,
    source_video_file_path: detail.source_video_file_path,
    duration_ms: detail.duration_ms,
    width: detail.width,
    height: detail.height,
    fps: detail.fps,
    codec: detail.codec,
    file_size: detail.file_size,
    transcript_segments: detail.transcript.segments
  };
}

async function runWorkspaceCutJob(input: {
  api_input: CreateCutterApiServerInput;
  workspace_root: string;
  cut_job_id?: string;
  resolved_sources?: Map<string, CutJobSourceDetail>;
  persist_phase_progress?: boolean;
}): ReturnType<typeof runNextCutJob> {
  const cutRunner = input.api_input.cut_runner ?? defaultCutRunner;
  const coverRunner = input.api_input.cover_runner ?? (input.api_input.cut_runner ? undefined : defaultCoverRunner);

  const runInput: RunNextCutJobInput = {
    workspace_root: input.workspace_root,
    library_root: input.api_input.library_root,
    now: () => input.api_input.now?.() ?? new Date().toISOString(),
    resolve_source: async (job) => {
      if (/^E\d{6}$/.test(job.source_video_id)) {
        const clip = await getExportClipDetail({
          workspace_root: input.workspace_root,
          export_clip_id: job.source_video_id
        });

        if (!clip) {
          return null;
        }

        return {
          source_video_id: clip.export_clip_id,
          title: clip.title,
          relative_path: clip.local_asset_relative_path ?? clip.output_file,
          source_video_file_path: clip.media_file_path,
          duration_ms: clip.duration_ms,
          width: clip.width,
          height: clip.height,
          fps: clip.fps,
          codec: clip.codec,
          file_size: clip.file_size,
          transcript_segments: clip.transcript_segments
        };
      }

      const cachedSource = input.resolved_sources?.get(job.source_video_id);
      if (cachedSource) {
        return cachedSource;
      }

      const detail = await loadVisibleDetail(input.api_input, job.source_video_id);

      if (!detail) {
        return null;
      }

      return cutJobSourceFromDetail(detail);
    },
    cut_runner: cutRunner,
    persist_phase_progress: input.persist_phase_progress,
    ...(coverRunner ? { cover_runner: coverRunner } : {})
  };

  return input.cut_job_id
    ? runCutJob({ ...runInput, cut_job_id: input.cut_job_id })
    : runNextCutJob(runInput);
}

async function resolveProjectOutputDirectory(input: {
  workspace_root: string;
  project_id?: string;
  project_title?: string;
}): Promise<string | undefined> {
  if (input.project_id) {
    const catalog = await listExportClips({ workspace_root: input.workspace_root });
    const matchedClip = catalog.clips.find((clip) =>
      clip.project_id === input.project_id && clip.project_output_file
    );

    if (matchedClip?.project_output_file) {
      return path.dirname(workspaceRelativePath(input.workspace_root, matchedClip.project_output_file));
    }
  }

  if (input.project_title) {
    return path.dirname(workspaceRelativePath(input.workspace_root, buildProjectClipOutputFile({
      project_title: input.project_title,
      project_clip_order: 1,
      source_title: "本地素材"
    })));
  }

  return undefined;
}

async function openWorkspaceExportDirectory(
  input: CreateCutterApiServerInput,
  body: OpenExportDirectoryRequestBody = {}
): Promise<{ path: string }> {
  const workspaceRoot = workspaceRootOrThrow(input);
  const projectId = optionalString(body.project_id, "project_id");
  const projectTitle = optionalString(body.project_title, "project_title");
  const targetPath = await resolveProjectOutputDirectory({
    workspace_root: workspaceRoot,
    project_id: projectId,
    project_title: projectTitle
  }) ?? exportClipsDirectory(workspaceRoot);
  const openPath = input.open_path ?? defaultOpenPath;

  await mkdir(targetPath, { recursive: true });
  await openPath(targetPath);

  return { path: targetPath };
}

async function createWorkspaceLocalClip(input: {
  api_input: CreateCutterApiServerInput;
  body: CreateLocalClipRequestBody;
}): Promise<ExportClipView> {
  const workspaceRoot = workspaceRootOrThrow(input.api_input);
  const sourceVideoId = requiredString(input.body.source_video_id, "source_video_id");

  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) {
    throw new Error("invalid_source_video_id");
  }

  const detail = await loadVisibleDetail(input.api_input, sourceVideoId);

  if (!detail) {
    throw new Error("source_video_not_found");
  }

  const selection = resolveLocalClipSelection({
    source_video_id: sourceVideoId,
    segments: detail.transcript.segments,
    body: input.body
  });
  const createdAt = input.api_input.now?.() ?? new Date().toISOString();
  const clipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: await readLibraryId(input.api_input.library_root),
    title:
      typeof input.body.title === "string" && input.body.title.trim()
        ? input.body.title.trim()
        : `${detail.title} ${formatClipTime(selection.begin_ms)}-${formatClipTime(selection.end_ms)}`,
    items: [{
      source_video_id: sourceVideoId,
      source_title: detail.title,
      source_relative_path: detail.relative_path,
      start_segment_id: selection.start_segment_id,
      end_segment_id: selection.end_segment_id,
      begin_ms: selection.begin_ms + selection.pre_roll_ms,
      end_ms: selection.end_ms - selection.post_roll_ms,
      selected_text: selection.selected_text,
      cut_mode: parseCutMode(input.body.cut_mode),
      pre_roll_ms: selection.pre_roll_ms,
      post_roll_ms: selection.post_roll_ms
    }],
    now: createdAt
  });
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: createdAt
  });
  const submittedJob = submission.jobs[0];

  if (!submittedJob) {
    throw new Error("cut job did not submit");
  }

  const job = await runWorkspaceCutJob({
    api_input: input.api_input,
    workspace_root: workspaceRoot,
    cut_job_id: submittedJob.cut_job_id,
    resolved_sources: new Map([[sourceVideoId, cutJobSourceFromDetail(detail)]]),
    persist_phase_progress: false
  });

  if (!job || job.status !== "done" || !job.export_clip_id) {
    throw new Error(job?.error_message ?? "cut job did not complete");
  }

  const clip = await getExportClipDetail({
    workspace_root: workspaceRoot,
    export_clip_id: job.export_clip_id
  });

  if (!clip) {
    throw new Error("export clip not found after cut");
  }

  return clip;
}

export function createCutterApiServer(input: CreateCutterApiServerInput): Server {
  return createServer(async (request, response) => {
    try {
      setCorsHeaders(response);

      if (request.method === "OPTIONS") {
        writeNoContent(response);
        return;
      }

      if (
        request.method !== "GET" &&
        request.method !== "HEAD" &&
        request.method !== "POST" &&
        request.method !== "DELETE"
      ) {
        writeError(response, 405, "method_not_allowed", "Only GET, HEAD, POST, DELETE, and OPTIONS are supported");
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "POST" && url.pathname === "/cutter/auth/request-login") {
        try {
          const body = (await readRequestJson(request)) as CutterLoginRequestBody;
          if (input.auth_mode === "local_trusted") {
            const auth = trustedDesktopSession(input);
            const deviceId = typeof body.device_id === "string" && body.device_id.trim()
              ? body.device_id.trim()
              : auth.device_id;
            const now = currentNow(input);
            writeJson(response, 200, apiResponse({
              user: auth.user,
              session: {
                user_id: auth.user.user_id,
                device_id: deviceId,
                session_token: "desktop-local-trusted",
                created_at: now,
                last_seen_at: now
              }
            }));
            return;
          }

          const deviceId = requiredChineseString(body.device_id, "设备 ID 不能为空");
          const now = currentNow(input);
          const application = await createCutterLoginApplication(input.library_root, {
            username: requiredChineseString(body.username, "用户名不能为空"),
            device_id: deviceId,
            device_name: requiredChineseString(body.device_name, "设备名称不能为空"),
            now,
            ip_address: requestIpAddress(request),
            user_agent: firstHeaderValue(request.headers["user-agent"]) || undefined
          });
          const session = application.status === "approved"
            ? await ensureCutterSessionForDevice(input.library_root, {
                user_id: application.user_id,
                device_id: deviceId,
                now
              })
            : undefined;
          writeJson(response, 200, apiResponse({
            user: application,
            ...(session ? { session } : {})
          }));
          return;
        } catch (error) {
          const message = (error as Error).message;
          writeError(
            response,
            400,
            "invalid_login_request",
            message === "invalid_json" ? "请求 JSON 格式不正确" : message
          );
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/cutter/local-clips") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const body = (await readRequestJson(request)) as CreateLocalClipRequestBody;

        if (input.workspace_root) {
          try {
            const clip = await createWorkspaceLocalClip({
              api_input: input,
              body
            });
            writeJson(response, 201, apiResponse(toWorkspaceLocalClipPayload(clip)));
            await recordCutterUsageEventsBestEffort([
              {
                api_input: input,
                auth,
                event_type: "select_transcript_span",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              },
              {
                api_input: input,
                auth,
                event_type: "submit_cut_job",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              },
              {
                api_input: input,
                auth,
                event_type: "cut_success",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              },
              {
                api_input: input,
                auth,
                event_type: "create_local_clip",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              }
            ]);
            return;
          } catch (error) {
            if ((error as Error).message === "invalid_source_video_id") {
              writeError(
                response,
                400,
                "invalid_source_video_id",
                "source_video_id must use V000001 format"
              );
              return;
            }

            if ((error as Error).message === "source_video_not_found") {
              writeError(response, 404, "source_video_not_found", "Source video not found");
              return;
            }

            const selectionError = localClipSelectionErrorPayload(error);
            if (selectionError) {
              writeError(response, 400, selectionError.code, selectionError.message);
              return;
            }

            throw error;
          }
        }

        const sourceVideoId = requiredString(body.source_video_id, "source_video_id");

        if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) {
          writeError(
            response,
            400,
            "invalid_source_video_id",
            "source_video_id must use V000001 format"
          );
          return;
        }

        const detail = await loadVisibleDetail(input, sourceVideoId);

        if (!detail) {
          writeError(response, 404, "source_video_not_found", "Source video not found");
          return;
        }

        let selection: LocalClipSelection;
        try {
          selection = resolveLocalClipSelection({
            source_video_id: sourceVideoId,
            segments: detail.transcript.segments,
            body
          });
        } catch (error) {
          const selectionError = localClipSelectionErrorPayload(error);
          if (selectionError) {
            writeError(response, 400, selectionError.code, selectionError.message);
            return;
          }

          throw error;
        }
        const cutMode = parseCutMode(body.cut_mode);
        const localClipId = await allocateNextLocalClipId(input.library_root);
        const clipPaths = buildLocalClipArtifactPaths({
          library_root: input.library_root,
          local_clip_id: localClipId
        });
        const cutRunner = input.cut_runner ?? defaultCutRunner;

        await mkdir(path.dirname(clipPaths.media_file_path), { recursive: true });
        await cutRunner({
          source_video_path: detail.source_video_file_path,
          output_path: clipPaths.media_file_path,
          begin_ms: selection.begin_ms,
          end_ms: selection.end_ms,
          cut_mode: cutMode
        });

        const manifest = await writeLocalClipManifest({
          library_root: input.library_root,
          local_clip_id: localClipId,
          title:
            typeof body.title === "string" && body.title.trim()
              ? body.title.trim()
              : `${detail.title} ${formatClipTime(selection.begin_ms)}-${formatClipTime(selection.end_ms)}`,
          source_video_id: sourceVideoId,
          source_title: detail.title,
          source_relative_path: detail.relative_path,
          begin_ms: selection.begin_ms,
          end_ms: selection.end_ms,
          selected_text: selection.selected_text,
          cut_mode: cutMode,
          media_path: clipPaths.media_path,
          created_at: input.now?.() ?? new Date().toISOString()
        });

        writeJson(response, 201, apiResponse({
          ...manifest,
          media_file_path: clipPaths.media_file_path,
          ...localClipUrls(localClipId)
        }));
        await recordCutterUsageEventsBestEffort([
          {
            api_input: input,
            auth,
            event_type: "select_transcript_span",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          },
          {
            api_input: input,
            auth,
            event_type: "submit_cut_job",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          },
          {
            api_input: input,
            auth,
            event_type: "cut_success",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          },
          {
            api_input: input,
            auth,
            event_type: "create_local_clip",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          }
        ]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/clip-lists") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const body = (await readRequestJson(request)) as CreateClipListRequestBody;
        const clipList = await writeClipList({
          workspace_root: workspaceRoot,
          library_id: requiredString(body.library_id, "library_id"),
          project_id: optionalString(body.project_id, "project_id"),
          title: requiredString(body.title, "title"),
          items: parseClipListItems(body.items),
          now: input.now?.() ?? new Date().toISOString()
        });

        writeJson(response, 201, apiResponse(clipList));
        await recordCutterUsageEventsBestEffort(
          clipList.items.map((item) => ({
            api_input: input,
            auth,
            event_type: "add_to_cut_list",
            source_video_id: item.source_video_id,
            selected_duration_ms: selectedDurationMs(item)
          }))
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cut-jobs") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const body = (await readRequestJson(request)) as SubmitCutJobsRequestBody;
        const clipListId = requiredString(body.clip_list_id, "clip_list_id");
        const clipList = await readClipList({
          workspace_root: workspaceRoot,
          clip_list_id: clipListId
        });

        if (!clipList) {
          writeError(response, 404, "clip_list_not_found", "Clip list not found");
          return;
        }

        const submission = await submitClipListToQueue({
          workspace_root: workspaceRoot,
          clip_list: clipList,
          now: input.now?.() ?? new Date().toISOString()
        });
        writeJson(response, 201, apiResponse(submission));
        await recordCutterUsageEventsBestEffort(
          submission.jobs.map((job) => ({
            api_input: input,
            auth,
            event_type: "submit_cut_job",
            source_video_id: job.source_video_id,
            cut_job_id: job.cut_job_id,
            selected_duration_ms: selectedDurationMs(job)
          }))
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cut-jobs/run-next") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const job = await runWorkspaceCutJob({
          api_input: input,
          workspace_root: workspaceRoot
        });
        writeJson(response, 200, apiResponse(job));
        if (job && (job.status === "done" || job.status === "failed")) {
          await recordCutterUsageEventBestEffort({
            api_input: input,
            auth,
            event_type: job.status === "done" ? "cut_success" : "cut_failure",
            source_video_id: job.source_video_id,
            cut_job_id: job.cut_job_id,
            selected_duration_ms: selectedDurationMs(job)
          });
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/workspace/open-export-directory") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const body = (await readRequestJson(request)) as OpenExportDirectoryRequestBody;
        writeJson(response, 200, apiResponse(await openWorkspaceExportDirectory(input, body)));
        return;
      }

      const cutJobRetryMatch = /^\/cutter\/cut-jobs\/([^/]+)\/retry$/.exec(url.pathname);
      if (request.method === "POST" && cutJobRetryMatch) {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const cutJobId = cutJobRetryMatch[1] ?? "";
        if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
          writeError(response, 400, "invalid_cut_job_id", "剪切任务编号格式不正确");
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        try {
          writeJson(response, 200, apiResponse(await retryCutJob({
            workspace_root: workspaceRoot,
            cut_job_id: cutJobId,
            now: input.now?.() ?? new Date().toISOString()
          })));
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "cut job not found") {
            writeError(response, 404, "cut_job_not_found", "剪切任务不存在");
            return;
          }

          if (message === "only failed cut jobs can be retried") {
            writeError(response, 409, "cut_job_not_failed", "只有失败任务需要重试");
            return;
          }

          throw error;
        }
        return;
      }

      const projectOutputsDeleteMatch = /^\/cutter\/projects\/([^/]+)\/outputs$/.exec(url.pathname);
      if (request.method === "DELETE" && projectOutputsDeleteMatch) {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        try {
          writeJson(response, 200, apiResponse(await deleteProjectOutputs({
            workspace_root: workspaceRoot,
            project_id: decodeURIComponent(projectOutputsDeleteMatch[1] ?? "")
          })));
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "project_id must be a safe project identifier") {
            writeError(response, 400, "invalid_project_id", "项目编号格式不正确");
            return;
          }

          throw error;
        }
        return;
      }

      if (request.method === "POST") {
        writeError(response, 404, "not_found", "Route not found");
        return;
      }

      if (url.pathname === "/health") {
        writeJson(response, 200, apiResponse({ ok: true }));
        return;
      }

      if (url.pathname === "/cutter/auth/mode") {
        const authMode: CutterAuthMode = input.auth_mode === "local_trusted" ? "local_trusted" : "reviewed";
        writeJson(response, 200, apiResponse({
          auth_mode: authMode,
          local_trusted: authMode === "local_trusted",
          trusted_username: authMode === "local_trusted"
            ? (input.trusted_username?.trim() || "Allen")
            : ""
        }));
        return;
      }

      if (url.pathname === "/cutter/auth/status") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        writeJson(response, 200, apiResponse({
          ok: true,
          user: auth.user
        }));
        return;
      }

      if (url.pathname === "/cutter/runtime-status") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        writeJson(response, 200, apiResponse(await runtimeStatusForSession({
          api_input: input,
          auth
        })));
        return;
      }

      if (url.pathname === "/cutter/source-library") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
        const library = await listCutterSourceLibrary({
          library_root: input.library_root,
          limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : undefined,
          offset: Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0
        });
        const videos: ApiSourceVideoCard[] = library.videos.map(addSourceVideoUrls);
        writeJson(
          response,
          200,
          apiResponse({
            library_id: await readLibraryId(input.library_root),
            ...library,
            videos
          })
        );
        return;
      }

      if (url.pathname === "/cutter/source-search") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const query = url.searchParams.get("query") ?? "";
        const cursor = optionalTrimmed(url.searchParams.get("cursor") ?? undefined);
        const startedAt = Date.now();
        let result: CutterSourceLibrarySearchResult;
        try {
          result = await searchCutterSourceLibraryWithPreferredBackend({
            api_input: input,
            query,
            limit: parsePositiveLimit(url.searchParams.get("limit")),
            cursor
          });
        } catch (error) {
          await recordCutterUsageEventBestEffort({
            api_input: input,
            auth,
            event_type: "search",
            query,
            search_mode: failedSearchAttemptMode(cursor),
            search_page_type: cursor ? "cursor" : "first",
            search_elapsed_ms: Math.max(0, Date.now() - startedAt),
            result_status: "failure"
          });
          throw error;
        }
        const groups: ApiSearchGroup[] = result.groups.map(addSourceVideoUrls);
        writeJson(
          response,
          200,
          apiResponse({
            ...result,
            groups
          })
        );
        await recordCutterUsageEventBestEffort({
          api_input: input,
          auth,
          event_type: "search",
          query,
          search_mode: result.search_mode,
          search_page_type: cursor ? "cursor" : "first",
          search_elapsed_ms: result.search_ms,
          result_status: groups.length > 0 ? "success" : "empty"
        });
        return;
      }

      if (url.pathname === "/cutter/clip-lists") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        writeJson(response, 200, apiResponse(await listClipLists({
          workspace_root: workspaceRoot
        })));
        return;
      }

      if (url.pathname === "/cutter/cut-jobs") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        if (!input.workspace_root) {
          writeJson(response, 200, apiResponse({
            job_count: 0,
            jobs: []
          }));
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        writeJson(response, 200, apiResponse(await listCutJobs({
          workspace_root: workspaceRoot
        })));
        return;
      }

      if (url.pathname === "/cutter/local-clips") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        if (input.workspace_root) {
          const catalog = await listExportClips({
            workspace_root: input.workspace_root
          });
          writeJson(response, 200, apiResponse({
            ...catalog,
            clips: catalog.clips.map(toWorkspaceLocalClipPayload)
          }));
          return;
        }

        const catalog = await listLocalClips({
          library_root: input.library_root
        });
        writeJson(response, 200, apiResponse({
          ...catalog,
          clips: catalog.clips.map((clip) => ({
            ...clip,
            ...localClipUrls(clip.local_clip_id)
          }))
        }));
        return;
      }

      let localClipRoute;

      try {
        localClipRoute = parseLocalClipRoute(url.pathname);
      } catch (error) {
        if ((error as Error).message === "invalid_local_clip_id") {
          writeError(
            response,
            400,
            "invalid_local_clip_id",
            "local_clip_id must use LC000001 or E000001 format"
          );
          return;
        }

        writeError(response, 404, "not_found", "Route not found");
        return;
      }

      if (localClipRoute) {
        if (localClipRoute.action === "") {
          if (!(await requireCutterSession({
            api_input: input,
            request,
            response
          }))) {
            return;
          }
        }

        if (input.workspace_root) {
          if (!/^E\d{6}$/.test(localClipRoute.local_clip_id)) {
            writeError(response, 404, "local_clip_not_found", "Local clip not found");
            return;
          }

          const clip = await getExportClipDetail({
            workspace_root: input.workspace_root,
            export_clip_id: localClipRoute.local_clip_id
          });

          if (!clip) {
            writeError(response, 404, "local_clip_not_found", "Local clip not found");
            return;
          }

          if (localClipRoute.action === "") {
            writeJson(response, 200, apiResponse(toWorkspaceLocalClipPayload(clip)));
            return;
          }

          if (localClipRoute.action === "cover") {
            if (!clip.cover_file_path) {
              writeError(response, 404, "local_clip_cover_not_found", "Local clip cover not found");
              return;
            }

            await streamFile({
              request,
              response,
              file_path: clip.cover_file_path,
              content_type: contentTypeForImage(clip.cover_file_path),
              range_enabled: false
            });
            return;
          }

          if (localClipRoute.action === "subtitles.srt") {
            if (!clip.subtitles_file_path) {
              writeError(response, 404, "local_clip_subtitles_not_found", "Local clip subtitles not found");
              return;
            }

            await streamFile({
              request,
              response,
              file_path: clip.subtitles_file_path,
              content_type: "text/plain; charset=utf-8",
              range_enabled: false
            });
            return;
          }

          // Media streams are intentionally not header-gated: browser video elements
          // cannot reliably attach the custom cutter auth headers after an approved
          // page has loaded the URL.
          await streamFile({
            request,
            response,
            file_path: clip.media_file_path,
            content_type: "video/mp4",
            range_enabled: true
          });
          return;
        }

        const clip = await getLocalClipDetail({
          library_root: input.library_root,
          local_clip_id: localClipRoute.local_clip_id
        });

        if (!clip) {
          writeError(response, 404, "local_clip_not_found", "Local clip not found");
          return;
        }

        if (localClipRoute.action === "") {
          writeJson(response, 200, apiResponse({
            ...clip,
            ...localClipUrls(clip.local_clip_id)
          }));
          return;
        }

        if (localClipRoute.action !== "media") {
          writeError(response, 404, "local_clip_artifact_not_found", "Local clip artifact not found");
          return;
        }

        // Media streams are intentionally not header-gated; see the workspace
        // branch above for the browser playback rationale.
        await streamFile({
          request,
          response,
          file_path: clip.media_file_path,
          content_type: "video/mp4",
          range_enabled: true
        });
        return;
      }

      let route;

      try {
        route = parseSourceVideoRoute(url.pathname);
      } catch (error) {
        if ((error as Error).message === "invalid_source_video_id") {
          writeError(
            response,
            400,
            "invalid_source_video_id",
            "source_video_id must use V000001 format"
          );
          return;
        }

        writeError(response, 404, "not_found", "Route not found");
        return;
      }

      if (route) {
        if (route.action === "") {
          const auth = await requireCutterSession({
            api_input: input,
            request,
            response
          });

          if (!auth) {
            return;
          }

          const detail = await loadReadableTranscriptDetail(input, route.source_video_id);

          if (!detail) {
            writeError(response, 404, "source_video_not_found", "Source video not found");
            return;
          }

          writeJson(response, 200, apiResponse(addSourceVideoUrls(detail) as ApiSourceVideoDetail));
          await recordCutterUsageEventBestEffort({
            api_input: input,
            auth,
            event_type: "view_source_video",
            source_video_id: detail.source_video_id
          });
          return;
        }

        const detail = await loadVisibleDetail(input, route.source_video_id);

        if (!detail) {
          writeError(response, 404, "source_video_not_found", "Source video not found");
          return;
        }

        // Media, covers, and subtitles are allowed without custom auth headers so
        // authenticated pages can hand URLs to native video/img/subtitle loaders.
        if (route.action === "media") {
          await streamFile({
            request,
            response,
            file_path: detail.source_video_file_path,
            content_type: contentTypeForSourceVideo(detail.source_video_file_path),
            range_enabled: true
          });
          return;
        }

        if (route.action === "cover") {
          await streamFile({
            request,
            response,
            file_path: detail.cover_file_path,
            content_type: contentTypeForImage(detail.cover_file_path),
            range_enabled: false
          });
          return;
        }

        if (route.action === "subtitles.srt") {
          await streamFile({
            request,
            response,
            file_path: detail.srt_file_path,
            content_type: "text/plain; charset=utf-8",
            range_enabled: false
          });
          return;
        }
      }

      writeError(response, 404, "not_found", "Route not found");
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error as Error);
        return;
      }

      if ((error as Error).message === "invalid_range") {
        writeError(response, 416, "invalid_range", "Range header is invalid");
        return;
      }

      if ((error as Error).message === "limit must be an integer between 1 and 100") {
        writeError(response, 400, "invalid_limit", "limit must be an integer between 1 and 100");
        return;
      }

      if ((error as Error).message === "invalid_search_cursor") {
        writeError(response, 400, "invalid_search_cursor", "搜索分页游标格式不正确");
        return;
      }

      if ((error as Error).message === "searchd_unavailable") {
        writeError(response, 502, "searchd_unavailable", "本地搜索服务暂不可用，请重试搜索。");
        return;
      }

      const infrastructureError = cutterApiInfrastructureErrorPayload(error);
      if (infrastructureError) {
        writeError(
          response,
          infrastructureError.statusCode,
          infrastructureError.code,
          infrastructureError.message
        );
        return;
      }

      writeError(response, 500, "internal_error", "Internal server error");
    }
  });
}
