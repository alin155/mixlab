import { createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import {
  buildFfmpegCutPlan,
  resolveFfmpegRuntime,
  type CutMode
} from "../../ffmpeg-core/src/index.ts";
import {
  allocateNextLocalClipId,
  buildLocalClipArtifactPaths,
  getCutterSourceVideoDetail,
  getLocalClipDetail,
  listCutterSourceLibrary,
  listLocalClips,
  searchCutterSourceLibrary,
  writeLocalClipManifest,
  type CutterSourceLibrarySearchGroup,
  type CutterSourceVideoCard,
  type CutterSourceVideoDetail,
  type LocalClipView
} from "../../library-fs/src/index.ts";
import {
  getExportClipDetail,
  listClipLists,
  listCutJobs,
  listExportClips,
  readClipList,
  runNextCutJob,
  submitClipListToQueue,
  writeClipList,
  type ClipListManifest,
  type ExportClipView,
  type WriteClipListItemInput
} from "../../cutter-local/src/index.ts";
import { createSegmentSpanSelection } from "../../protocol/src/index.ts";

export interface CreateCutterApiServerInput {
  library_root: string;
  workspace_root?: string;
  now?: () => string;
  cut_runner?: CutterClipCutRunner;
}

export interface CutterApiRuntimeConfig extends CreateCutterApiServerInput {
  host: string;
  port: number;
}

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

export interface CutterClipCutRunnerInput {
  source_video_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
}

export type CutterClipCutRunner = (input: CutterClipCutRunnerInput) => Promise<void> | void;

interface CreateLocalClipRequestBody {
  source_video_id?: unknown;
  start_segment_id?: unknown;
  end_segment_id?: unknown;
  pre_roll_ms?: unknown;
  post_roll_ms?: unknown;
  cut_mode?: unknown;
  title?: unknown;
}

interface CreateClipListRequestBody {
  library_id?: unknown;
  title?: unknown;
  items?: unknown;
}

interface SubmitCutJobsRequestBody {
  clip_list_id?: unknown;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

  return {
    library_root: libraryRoot,
    workspace_root: optionalTrimmed(env.MIXLAB_CUTTER_WORKSPACE_ROOT),
    host: optionalTrimmed(env.MIXLAB_CUTTER_API_HOST) ?? "127.0.0.1",
    port
  };
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Range");
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
): { local_clip_id: string; action: "" | "media" } | undefined {
  const match = /^\/cutter\/local-clips\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);

  if (!match) {
    return undefined;
  }

  const localClipId = match[1] ?? "";
  const action = match[2] ?? "";

  if (!LOCAL_CLIP_ID_PATTERN.test(localClipId)) {
    throw new Error("invalid_local_clip_id");
  }

  if (action !== "" && action !== "media") {
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
    return "smart";
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

async function defaultCutRunner(input: CutterClipCutRunnerInput): Promise<void> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfmpegCutPlan({
    source_path: input.source_video_path,
    output_path: input.output_path,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    cut_mode: input.cut_mode
  });
  const result = spawnSync(runtime.ffmpeg_path, plan.args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`ffmpeg clip cut failed: ${result.stderr}`);
  }
}

async function loadVisibleDetail(
  libraryRoot: string,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  try {
    return await getCutterSourceVideoDetail({
      library_root: libraryRoot,
      source_video_id: sourceVideoId
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
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

function workspaceRootOrThrow(input: CreateCutterApiServerInput): string {
  if (!input.workspace_root) {
    throw new Error("workspace_root is required for cutter workspace routes");
  }

  return input.workspace_root;
}

function toWorkspaceLocalClipPayload(clip: ExportClipView): ExportClipView & {
  detail_url: string;
  media_url: string;
} {
  return addLocalClipUrls(clip);
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

async function runWorkspaceCutJob(input: {
  api_input: CreateCutterApiServerInput;
  workspace_root: string;
}): ReturnType<typeof runNextCutJob> {
  const cutRunner = input.api_input.cut_runner ?? defaultCutRunner;

  return runNextCutJob({
    workspace_root: input.workspace_root,
    library_root: input.api_input.library_root,
    now: () => input.api_input.now?.() ?? new Date().toISOString(),
    resolve_source: async (job) => {
      const detail = await loadVisibleDetail(input.api_input.library_root, job.source_video_id);

      if (!detail) {
        return null;
      }

      return {
        source_video_id: detail.source_video_id,
        title: detail.title,
        relative_path: detail.relative_path,
        source_video_file_path: detail.source_video_file_path
      };
    },
    cut_runner: cutRunner
  });
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

  const detail = await loadVisibleDetail(input.api_input.library_root, sourceVideoId);

  if (!detail) {
    throw new Error("source_video_not_found");
  }

  const selection = createSegmentSpanSelection({
    source_video_id: sourceVideoId,
    segments: detail.transcript.segments,
    start_segment_id: requiredString(input.body.start_segment_id, "start_segment_id"),
    end_segment_id: requiredString(input.body.end_segment_id, "end_segment_id"),
    pre_roll_ms: optionalNonNegativeInteger(input.body.pre_roll_ms, 0, "pre_roll_ms"),
    post_roll_ms: optionalNonNegativeInteger(input.body.post_roll_ms, 0, "post_roll_ms")
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
      begin_ms: selection.begin_ms,
      end_ms: selection.end_ms,
      selected_text: selection.selected_text,
      cut_mode: parseCutMode(input.body.cut_mode),
      pre_roll_ms: selection.pre_roll_ms,
      post_roll_ms: selection.post_roll_ms
    }],
    now: createdAt
  });
  await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: createdAt
  });
  const job = await runWorkspaceCutJob({
    api_input: input.api_input,
    workspace_root: workspaceRoot
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
        request.method !== "POST"
      ) {
        writeError(response, 405, "method_not_allowed", "Only GET, HEAD, POST, and OPTIONS are supported");
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "POST" && url.pathname === "/cutter/local-clips") {
        const body = (await readRequestJson(request)) as CreateLocalClipRequestBody;

        if (input.workspace_root) {
          try {
            const clip = await createWorkspaceLocalClip({
              api_input: input,
              body
            });
            writeJson(response, 201, apiResponse(toWorkspaceLocalClipPayload(clip)));
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

        const detail = await loadVisibleDetail(input.library_root, sourceVideoId);

        if (!detail) {
          writeError(response, 404, "source_video_not_found", "Source video not found");
          return;
        }

        const selection = createSegmentSpanSelection({
          source_video_id: sourceVideoId,
          segments: detail.transcript.segments,
          start_segment_id: requiredString(body.start_segment_id, "start_segment_id"),
          end_segment_id: requiredString(body.end_segment_id, "end_segment_id"),
          pre_roll_ms: optionalNonNegativeInteger(body.pre_roll_ms, 0, "pre_roll_ms"),
          post_roll_ms: optionalNonNegativeInteger(body.post_roll_ms, 0, "post_roll_ms")
        });
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
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/clip-lists") {
        const workspaceRoot = workspaceRootOrThrow(input);
        const body = (await readRequestJson(request)) as CreateClipListRequestBody;
        const clipList = await writeClipList({
          workspace_root: workspaceRoot,
          library_id: requiredString(body.library_id, "library_id"),
          title: requiredString(body.title, "title"),
          items: parseClipListItems(body.items),
          now: input.now?.() ?? new Date().toISOString()
        });

        writeJson(response, 201, apiResponse(clipList));
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cut-jobs") {
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
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cut-jobs/run-next") {
        const workspaceRoot = workspaceRootOrThrow(input);
        const job = await runWorkspaceCutJob({
          api_input: input,
          workspace_root: workspaceRoot
        });
        writeJson(response, 200, apiResponse(job));
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

      if (url.pathname === "/cutter/source-library") {
        const library = await listCutterSourceLibrary({
          library_root: input.library_root
        });
        const videos: ApiSourceVideoCard[] = library.videos.map(addSourceVideoUrls);
        writeJson(
          response,
          200,
          apiResponse({
            ...library,
            videos
          })
        );
        return;
      }

      if (url.pathname === "/cutter/source-search") {
        const result = await searchCutterSourceLibrary({
          library_root: input.library_root,
          query: url.searchParams.get("query") ?? "",
          limit: parsePositiveLimit(url.searchParams.get("limit"))
        });
        const groups: ApiSearchGroup[] = result.groups.map(addSourceVideoUrls);
        writeJson(
          response,
          200,
          apiResponse({
            ...result,
            groups
          })
        );
        return;
      }

      if (url.pathname === "/cutter/clip-lists") {
        const workspaceRoot = workspaceRootOrThrow(input);
        writeJson(response, 200, apiResponse(await listClipLists({
          workspace_root: workspaceRoot
        })));
        return;
      }

      if (url.pathname === "/cutter/cut-jobs") {
        const workspaceRoot = workspaceRootOrThrow(input);
        writeJson(response, 200, apiResponse(await listCutJobs({
          workspace_root: workspaceRoot
        })));
        return;
      }

      if (url.pathname === "/cutter/local-clips") {
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
        const detail = await loadVisibleDetail(input.library_root, route.source_video_id);

        if (!detail) {
          writeError(response, 404, "source_video_not_found", "Source video not found");
          return;
        }

        if (route.action === "") {
          writeJson(response, 200, apiResponse(addSourceVideoUrls(detail) as ApiSourceVideoDetail));
          return;
        }

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
            content_type: "image/jpeg",
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

      writeError(response, 500, "internal_error", "Internal server error");
    }
  });
}
