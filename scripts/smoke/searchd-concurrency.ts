import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeTranscriptText,
  type TranscriptSegment
} from "../../packages/protocol/src/index.ts";
import {
  approveCutterUser,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  createCutterLoginApplication,
  publishIndexRequiredSourceVideos,
  refreshLibraryCounts,
  readUsageMetrics,
  scanSourceVideos
} from "../../packages/library-fs/src/index.ts";
import { createCutterApiServer } from "../../packages/cutter-api/src/index.ts";
import type { UsageMetrics } from "../../packages/library-fs/src/index.ts";

const LIBRARY_ID = "lib_main_001";
const EDITOR_COUNT = 50;
const DEFAULT_VIDEO_COUNT = EDITOR_COUNT;
const DEFAULT_SEGMENTS_PER_VIDEO = 4;
const SEARCH_P95_SLA_MS = 1500;
const DETAIL_P95_SLA_MS = 1500;
const CUT_P95_SLA_MS = 1500;
const REPORT_PATH_ENV = "MIXLAB_SEARCHD_CONCURRENCY_REPORT_PATH";
const RUN_ROOT_ENV = "MIXLAB_SEARCHD_CONCURRENCY_RUN_ROOT";
const VIDEO_COUNT_ENV = "MIXLAB_SEARCHD_CONCURRENCY_VIDEOS";
const SEGMENTS_PER_VIDEO_ENV = "MIXLAB_SEARCHD_CONCURRENCY_SEGMENTS_PER_VIDEO";
const SEARCH_QUERIES = ["现金流", "利润", "客户", "增长", "品牌"] as const;
const MIN_DISTINCT_SEARCH_QUERY_COUNT = SEARCH_QUERIES.length;

interface EditorSession {
  user_id: string;
  username: string;
  headers: Record<string, string>;
}

interface EditorApiRuntime {
  editor: EditorSession;
  workspace_id: string;
  api_base_url: string;
  api_server: Server;
}

interface SearchdHealthSnapshot {
  index_version: string;
  source_video_count: number;
  segment_count: number;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

export async function writeSearchdConcurrencyReport(
  report: Record<string, unknown>,
  reportPath: string
): Promise<string> {
  const resolvedPath = path.resolve(reportPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, jsonBytes(report), "utf8");
  return resolvedPath;
}

export async function createSearchdConcurrencyRunDirectory(prefix: string): Promise<string> {
  const runRoot = process.env[RUN_ROOT_ENV]?.trim();
  if (!runRoot) {
    return mkdtemp(path.join(os.tmpdir(), prefix));
  }

  const resolvedRunRoot = path.resolve(runRoot);
  await mkdir(resolvedRunRoot, { recursive: true });
  return mkdtemp(path.join(resolvedRunRoot, prefix));
}

function segment(input: {
  source_video_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  text: string;
  begin_char: number;
  normalized_begin_char: number;
}): TranscriptSegment {
  const normalizedText = normalizeTranscriptText(input.text);

  return {
    segment_id: `${input.source_video_id}-S${String(input.index + 1).padStart(6, "0")}`,
    index: input.index,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    begin_char: input.begin_char,
    end_char: input.begin_char + input.text.length,
    normalized_begin_char: input.normalized_begin_char,
    normalized_end_char: input.normalized_begin_char + normalizedText.length,
    text: input.text,
    normalized_text: normalizedText,
    confidence: 0.99
  };
}

function buildSegments(sourceVideoId: string, videoIndex: number, segmentsPerVideo: number): TranscriptSegment[] {
  const baseTexts = [
    `现金流和利润，是第 ${videoIndex + 1} 条素材的核心线索。`,
    "剪辑师需要围绕客户增长，在完整文案里快速定位这句话。",
    "公共素材库命中后，可以继续选择品牌上下文片段。",
    "现金流变化也会影响后续的剪辑判断。"
  ];
  const texts = Array.from({ length: segmentsPerVideo }, (_, index) =>
    baseTexts[index] ?? `第 ${videoIndex + 1} 条素材的第 ${index + 1} 段补充文案，用于扩大并发验收索引。`
  );
  let beginChar = 0;
  let normalizedBeginChar = 0;

  return texts.map((text, index) => {
    const normalizedText = normalizeTranscriptText(text);
    const current = segment({
      source_video_id: sourceVideoId,
      index,
      begin_ms: index * 1800,
      end_ms: index * 1800 + 1500,
      text,
      begin_char: beginChar,
      normalized_begin_char: normalizedBeginChar
    });
    beginChar += text.length;
    normalizedBeginChar += normalizedText.length;
    return current;
  });
}

function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = String(ms % 1000).padStart(3, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0");
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");

  return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

function srtBytes(segments: TranscriptSegment[]): string {
  return `${segments
    .map((item, index) =>
      [
        String(index + 1),
        `${formatSrtTime(item.begin_ms)} --> ${formatSrtTime(item.end_ms)}`,
        item.text
      ].join("\n")
    )
    .join("\n\n")}\n`;
}

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function startEditorApiRuntime(input: {
  editor: EditorSession;
  library_root: string;
  searchd_base_url: string;
}): Promise<EditorApiRuntime> {
  const workspaceRoot = await createSearchdConcurrencyRunDirectory(
    `mixlab-searchd-concurrency-workspace-${input.editor.user_id}-`
  );
  const apiServer = createCutterApiServer({
    library_root: input.library_root,
    workspace_root: workspaceRoot,
    searchd_base_url: input.searchd_base_url,
    searchd_timeout_ms: 3000,
    now: () => new Date().toISOString(),
    cut_runner: async (cutInput) => {
      await mkdir(path.dirname(cutInput.output_path), { recursive: true });
      await writeFile(
        cutInput.output_path,
        `synthetic cut ${cutInput.begin_ms}-${cutInput.end_ms} ${cutInput.cut_mode}\n`
      );
    }
  });
  await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
  const apiPort = (apiServer.address() as AddressInfo).port;

  return {
    editor: input.editor,
    workspace_id: path.basename(workspaceRoot),
    api_base_url: `http://127.0.0.1:${apiPort}`,
    api_server: apiServer
  };
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function waitForSearchdReady(input: {
  child: ChildProcess;
  base_url: string;
  expected_video_count: number;
  expected_segment_count: number;
}): Promise<SearchdHealthSnapshot> {
  const startedAt = Date.now();
  const timeoutMs = 60_000;
  let lastError = "";

  input.child.stdout?.on("data", (chunk) => process.stdout.write(String(chunk)));
  input.child.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));

  while (Date.now() - startedAt < timeoutMs) {
    if (input.child.exitCode !== null) {
      throw new Error(`searchd 提前退出：${input.child.exitCode}`);
    }

    try {
      const response = await fetch(`${input.base_url}/health`, {
        headers: { Accept: "application/json" }
      });
      const body = await response.json() as any;
      const indexVersion = String(body.data?.index_version ?? "").trim();
      const sourceVideoCount = Number(body.data?.source_video_count);
      const segmentCount = Number(body.data?.segment_count);
      if (
        response.ok &&
        indexVersion &&
        Number.isInteger(sourceVideoCount) &&
        Number.isInteger(segmentCount) &&
        sourceVideoCount >= input.expected_video_count &&
        segmentCount >= input.expected_segment_count
      ) {
        return {
          index_version: indexVersion,
          source_video_count: sourceVideoCount,
          segment_count: segmentCount
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`等待 searchd 启动超时：${lastError}`);
}

async function createConcurrentLibrary(
  libraryRoot: string,
  videoCount: number,
  segmentsPerVideo: number
): Promise<string[]> {
  const sourceVideosRoot = path.join(libraryRoot, "source-videos");
  await mkdir(sourceVideosRoot, { recursive: true });

  for (let index = 0; index < videoCount; index += 1) {
    const fileName = `${String(index + 1).padStart(3, "0")}_现金流并发素材.mp4`;
    await writeFile(
      path.join(sourceVideosRoot, fileName),
      `mixlab synthetic source video ${index + 1}\n`
    );
  }

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: LIBRARY_ID,
    library_name: "主素材库",
    now: "2026-05-04T10:00:00.000Z"
  });

  const sourceVideoIds: string[] = [];

  for (let index = 0; index < videoCount; index += 1) {
    const job = await claimNextPreprocessJob({
      library_root: libraryRoot,
      worker_id: "concurrency-smoke-worker",
      now: `2026-05-04T10:${String(index + 1).padStart(2, "0")}:00.000Z`,
      refresh_library_counts: false
    });

    if (!job) {
      throw new Error(`未能领取第 ${index + 1} 个预处理任务`);
    }

    const sourceVideoId = job.source_video_id;
    const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
    const segments = buildSegments(sourceVideoId, index, segmentsPerVideo);
    await mkdir(videoDir, { recursive: true });
    await writeFile(
      path.join(videoDir, "transcript.json"),
      jsonBytes({
        schema_version: "1.0",
        source_video_id: sourceVideoId,
        provider: "concurrency-smoke",
        model: "manual",
        generated_at: "2026-05-04T10:30:00.000Z",
        duration_ms: 7200,
        full_text: segments.map((item) => item.text).join(""),
        segments
      })
    );
    await writeFile(path.join(videoDir, "subtitles.srt"), srtBytes(segments));
    await writeFile(
      path.join(videoDir, "keyframes.json"),
      jsonBytes({ schema_version: "1.0", keyframes_ms: [0, 1800, 3600, 5400] })
    );
    await writeFile(path.join(videoDir, "cover.jpg"), `cover placeholder ${sourceVideoId}\n`);

    await completePreprocessArtifacts({
      library_root: libraryRoot,
      source_video_id: sourceVideoId,
      now: "2026-05-04T10:31:00.000Z",
      refresh_library_counts: false,
      media: {
        duration_ms: 7200,
        width: 1920,
        height: 1080,
        fps: 25,
        codec: "h264",
        content_hash: `sha256:concurrency-smoke-${sourceVideoId}`
      },
      artifacts: {
        transcript_path: `.mixlab-library/videos/${sourceVideoId}/transcript.json`,
        srt_path: `.mixlab-library/videos/${sourceVideoId}/subtitles.srt`,
        keyframes_path: `.mixlab-library/videos/${sourceVideoId}/keyframes.json`,
        cover_path: `.mixlab-library/videos/${sourceVideoId}/cover.jpg`
      }
    });
    sourceVideoIds.push(sourceVideoId);
  }
  await refreshLibraryCounts(libraryRoot, "2026-05-04T10:39:00.000Z");

  const published = await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: LIBRARY_ID,
    source_video_ids: sourceVideoIds,
    now: "2026-05-04T10:40:00.000Z"
  });

  if (published.ready_video_count !== videoCount) {
    throw new Error(`发布后的 ready 数量不正确：${published.ready_video_count}`);
  }

  return sourceVideoIds;
}

async function createApprovedEditorSessions(libraryRoot: string): Promise<EditorSession[]> {
  const sessions: EditorSession[] = [];

  for (let index = 0; index < EDITOR_COUNT; index += 1) {
    const suffix = String(index + 1).padStart(2, "0");
    const username = `并发烟测剪辑师-${suffix}`;
    const application = await createCutterLoginApplication(libraryRoot, {
      username,
      device_id: `concurrency-smoke-device-${suffix}`,
      device_name: `并发烟测剪辑端 ${suffix}`,
      now: "2026-05-04T10:45:00.000Z"
    });
    const approved = await approveCutterUser(libraryRoot, {
      user_id: application.user_id,
      now: "2026-05-04T10:46:00.000Z"
    });

    sessions.push({
      user_id: application.user_id,
      username,
      headers: {
        "x-mixlab-device-id": approved.session.device_id,
        "x-mixlab-session-token": approved.session.session_token
      }
    });
  }

  return sessions;
}

async function fetchJson(input: {
  url: string;
  headers: Record<string, string>;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<any> {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...input.headers
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body)
  });
  const text = await response.text();
  const body = text.trim() ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${input.url}: ${text.slice(0, 300)}`);
  }

  return body;
}

async function timed<T>(operation: () => Promise<T>): Promise<{ duration_ms: number; value: T }> {
  const startedAt = performance.now();
  const value = await operation();

  return {
    duration_ms: performance.now() - startedAt,
    value
  };
}

function percentile(values: number[], rank: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function searchQueryForEditor(index: number): string {
  return SEARCH_QUERIES[index % SEARCH_QUERIES.length]!;
}

function searchQueryDistribution(editorRuns: Array<{ search_query: string }>): Record<string, number> {
  return editorRuns.reduce<Record<string, number>>((distribution, run) => {
    distribution[run.search_query] = (distribution[run.search_query] ?? 0) + 1;
    return distribution;
  }, {});
}

function summarize(values: number[]): {
  count: number;
  min_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
} {
  return {
    count: values.length,
    min_ms: roundMs(Math.min(...values)),
    p50_ms: roundMs(percentile(values, 50)),
    p95_ms: roundMs(percentile(values, 95)),
    max_ms: roundMs(Math.max(...values))
  };
}

async function waitForUsageMetrics(
  libraryRoot: string,
  predicate: (metrics: UsageMetrics) => boolean
): Promise<UsageMetrics> {
  const deadline = Date.now() + 5000;
  let latest = await readUsageMetrics(libraryRoot);

  while (Date.now() < deadline) {
    latest = await readUsageMetrics(libraryRoot);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return latest;
}

function assertUsageMetrics(metrics: UsageMetrics): void {
  if (metrics.active_user_count !== EDITOR_COUNT) {
    throw new Error(`活跃剪辑师计数不正确：${metrics.active_user_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.search_request_count !== EDITOR_COUNT) {
    throw new Error(`搜索请求计数不正确：${metrics.search_request_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.searchd_search_count !== EDITOR_COUNT) {
    throw new Error(`searchd 搜索计数不正确：${metrics.searchd_search_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.search_failure_count !== 0) {
    throw new Error(`搜索失败计数不为 0：${metrics.search_failure_count}`);
  }
  if (metrics.source_detail_view_count !== EDITOR_COUNT) {
    throw new Error(`完整文案详情计数不正确：${metrics.source_detail_view_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.transcript_selection_count !== EDITOR_COUNT) {
    throw new Error(`文案选区计数不正确：${metrics.transcript_selection_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.cut_submission_count !== EDITOR_COUNT) {
    throw new Error(`剪辑提交计数不正确：${metrics.cut_submission_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.cut_success_count !== EDITOR_COUNT) {
    throw new Error(`剪辑成功计数不正确：${metrics.cut_success_count} != ${EDITOR_COUNT}`);
  }
  if (metrics.local_clip_count !== EDITOR_COUNT) {
    throw new Error(`本地片段计数不正确：${metrics.local_clip_count} != ${EDITOR_COUNT}`);
  }
  const usersWithOneSearch = metrics.users.filter((user) => user.search_request_count === 1).length;
  if (usersWithOneSearch !== EDITOR_COUNT) {
    throw new Error(`按用户搜索计数不正确：${usersWithOneSearch} 个用户各 1 次搜索，预期 ${EDITOR_COUNT}`);
  }
  const usersWithSearchFailures = metrics.users.filter((user) => user.search_failure_count > 0).length;
  if (usersWithSearchFailures !== 0) {
    throw new Error(`有 ${usersWithSearchFailures} 个剪辑师出现搜索失败，预期 0`);
  }
  const usersWithOneCut = metrics.users.filter((user) =>
    user.transcript_selection_count === 1 &&
    user.cut_submission_count === 1 &&
    user.cut_success_count === 1 &&
    user.local_clip_count === 1
  ).length;
  if (usersWithOneCut !== EDITOR_COUNT) {
    throw new Error(`按用户剪辑计数不正确：${usersWithOneCut} 个用户完成 1 次剪辑，预期 ${EDITOR_COUNT}`);
  }
}

function assertSearchResult(body: any): void {
  if (body.data?.search_mode !== "searchd") {
    throw new Error(`并发搜索未走 searchd：${body.data?.search_mode ?? "unknown"}`);
  }
  if (typeof body.data?.index_version !== "string" || body.data.index_version.trim() === "") {
    throw new Error("并发搜索缺少 searchd index_version");
  }
  if (!Array.isArray(body.data?.groups) || body.data.groups.length === 0) {
    throw new Error("并发搜索未返回公共素材命中");
  }
  if (!body.data.groups.every((group: any) => group.hit_segments?.length > 0)) {
    throw new Error("并发搜索返回了缺少命中片段的结果组");
  }
}

function assertSearchResultHasEnoughPublicSources(body: any): void {
  assertSearchResult(body);
  if (body.data.groups.length < EDITOR_COUNT) {
    throw new Error(`并发搜索返回的公共素材组不足：${body.data.groups.length} < ${EDITOR_COUNT}`);
  }
}

function pickSearchHit(body: any, index: number): {
  source_video_id: string;
  segment_id: string;
  match_range: [number, number];
  search_result_rank: number;
  search_result_group_count: number;
  search_result_limit: number;
} {
  assertSearchResult(body);
  const groups = body.data.groups as any[];
  const groupIndex = index % groups.length;
  const group = groups[groupIndex];
  const hitSegment = group?.hit_segments?.[0];
  const matchRange = Array.isArray(hitSegment?.match_ranges)
    ? hitSegment.match_ranges.find((range: unknown): range is [number, number] =>
        Array.isArray(range) &&
        range.length === 2 &&
        typeof range[0] === "number" &&
        typeof range[1] === "number" &&
        range[0] >= 0 &&
        range[1] > range[0]
      )
    : undefined;

  if (
    typeof group?.source_video_id !== "string" ||
    typeof hitSegment?.segment_id !== "string" ||
    !matchRange
  ) {
    throw new Error("并发搜索命中缺少可定位的 source_video_id、segment_id 或 match_ranges");
  }

  return {
    source_video_id: group.source_video_id,
    segment_id: hitSegment.segment_id,
    match_range: matchRange,
    search_result_rank: groupIndex + 1,
    search_result_group_count: groups.length,
    search_result_limit: EDITOR_COUNT
  };
}

function assertDetailResult(body: any, sourceVideoId: string, searchQuery: string): void {
  if (body.data?.source_video_id !== sourceVideoId) {
    throw new Error(`详情 source_video_id 不正确：${body.data?.source_video_id ?? "unknown"}`);
  }
  if (body.data?.transcript?.provider !== "sqlite-index") {
    throw new Error(`详情完整文案未走 searchd index：${body.data?.transcript?.provider ?? "unknown"}`);
  }
  if (!String(body.data?.transcript?.full_text ?? "").includes(searchQuery)) {
    throw new Error("详情完整文案缺少关键词");
  }
  if (!Array.isArray(body.data?.transcript?.segments) || body.data.transcript.segments.length < 4) {
    throw new Error("详情完整文案段落不完整");
  }
}

function detailSegmentForSearchHit(body: any, segmentId: string): any {
  const segments = body.data?.transcript?.segments;
  const segment = Array.isArray(segments)
    ? segments.find((item: any) => item.segment_id === segmentId)
    : undefined;

  if (!segment) {
    throw new Error(`完整文案详情缺少搜索命中的段落：${segmentId}`);
  }
  if (
    typeof segment.text !== "string" ||
    typeof segment.begin_char !== "number" ||
    typeof segment.end_char !== "number" ||
    segment.end_char <= segment.begin_char
  ) {
    throw new Error(`完整文案段落缺少可验证的文本或字符位置：${segmentId}`);
  }

  return segment;
}

function fullTranscriptProofForDetail(body: any, sourceVideoId: string, selectedText: string): {
  source_video_id: string;
  segment_count: number;
  begin_char: number;
  end_char: number;
  char_count: number;
  text_sha256: string;
} {
  const transcript = body.data?.transcript;
  const segments = Array.isArray(transcript?.segments) ? transcript.segments : [];
  const fullText = String(transcript?.full_text ?? "");
  if (body.data?.source_video_id !== sourceVideoId) {
    throw new Error("完整文案 source_video_id 与素材不一致");
  }
  if (segments.length < 4 || fullText.length <= selectedText.length) {
    throw new Error("完整文案上下文不足，无法证明视频级全文定位");
  }

  return {
    source_video_id: sourceVideoId,
    segment_count: segments.length,
    begin_char: 0,
    end_char: fullText.length,
    char_count: fullText.length,
    text_sha256: sha256Hex(fullText)
  };
}

function assertLocalClipResult(
  body: any,
  sourceVideoId: string,
  selectedText: string,
  beginMs: number,
  endMs: number
): void {
  if (body.data?.source_video_id !== sourceVideoId) {
    throw new Error(`本地片段 source_video_id 不正确：${body.data?.source_video_id ?? "unknown"}`);
  }
  if (!String(body.data?.local_clip_id ?? "").startsWith("E")) {
    throw new Error(`工作区本地片段 ID 不正确：${body.data?.local_clip_id ?? "unknown"}`);
  }
  if (body.data?.selected_text !== selectedText) {
    throw new Error("本地片段没有保留完整文案选区文本");
  }
  if (body.data?.begin_ms !== beginMs || body.data?.end_ms !== endMs) {
    throw new Error("本地片段没有保留完整文案选区时间段");
  }
  if (
    typeof body.data?.relative_path !== "string" ||
    body.data.relative_path.trim() === "" ||
    body.data.relative_path.includes("\\") ||
    body.data.relative_path.split("/").includes("..")
  ) {
    throw new Error("本地片段缺少工作区相对输出路径");
  }
  if (!Number.isInteger(body.data?.file_size) || body.data.file_size <= 0) {
    throw new Error(`本地片段缺少非空输出文件大小：${body.data?.file_size ?? "unknown"}`);
  }
  if (typeof body.data?.content_hash !== "string" || !/^[a-f0-9]{64}$/i.test(body.data.content_hash)) {
    throw new Error("本地片段缺少输出文件 sha256 指纹");
  }
  if (typeof body.data?.media_url !== "string" || !body.data.media_url.includes("/cutter/local-clips/")) {
    throw new Error("本地片段缺少可播放 media_url");
  }
}

export async function runSearchdConcurrencySmoke(): Promise<void> {
  const videoCount = positiveIntegerEnv(VIDEO_COUNT_ENV, DEFAULT_VIDEO_COUNT);
  const segmentsPerVideo = positiveIntegerEnv(SEGMENTS_PER_VIDEO_ENV, DEFAULT_SEGMENTS_PER_VIDEO);
  const libraryRoot = await createSearchdConcurrencyRunDirectory("mixlab-searchd-concurrency-library-");
  const searchdCacheRoot = await createSearchdConcurrencyRunDirectory("mixlab-searchd-concurrency-cache-");
  const sourceVideoIds = await createConcurrentLibrary(libraryRoot, videoCount, segmentsPerVideo);
  const expectedIndexedSegmentCount = sourceVideoIds.length * segmentsPerVideo;
  const editors = await createApprovedEditorSessions(libraryRoot);

  const searchdPort = await freePort();
  const searchdBaseUrl = `http://127.0.0.1:${searchdPort}`;
  const searchd = spawn(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      "packages/searchd/Cargo.toml",
      "--",
      "--library-root",
      libraryRoot,
      "--cache-root",
      searchdCacheRoot,
      "--host",
      "127.0.0.1",
      "--port",
      String(searchdPort)
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  const editorApiRuntimes: EditorApiRuntime[] = [];

  try {
    const searchdHealth = await waitForSearchdReady({
      child: searchd,
      base_url: searchdBaseUrl,
      expected_video_count: sourceVideoIds.length,
      expected_segment_count: expectedIndexedSegmentCount
    });
    if (searchdHealth.source_video_count !== sourceVideoIds.length) {
      throw new Error(
        `searchd health 素材数与生成索引不一致：${searchdHealth.source_video_count} != ${sourceVideoIds.length}`
      );
    }
    if (searchdHealth.segment_count !== expectedIndexedSegmentCount) {
      throw new Error(
        `searchd health 字幕段数与生成索引不一致：${searchdHealth.segment_count} != ${expectedIndexedSegmentCount}`
      );
    }

    editorApiRuntimes.push(...await Promise.all(editors.map((editor) =>
      startEditorApiRuntime({
        editor,
        library_root: libraryRoot,
        searchd_base_url: searchdBaseUrl
      })
    )));

    const runtimeStatus = await fetchJson({
      url: `${editorApiRuntimes[0]!.api_base_url}/cutter/runtime-status`,
      headers: editorApiRuntimes[0]!.editor.headers
    });
    if (runtimeStatus.data?.search_backend?.mode !== "searchd") {
      throw new Error(`运行状态未启用 searchd：${runtimeStatus.data?.search_backend?.mode ?? "unknown"}`);
    }
    const runtimeSearchIndexVersion = String(runtimeStatus.data?.search_backend?.index_version ?? "").trim();
    if (!runtimeSearchIndexVersion) {
      throw new Error("运行状态缺少 searchd index_version");
    }
    if (runtimeSearchIndexVersion !== searchdHealth.index_version) {
      throw new Error(
        `运行状态 searchd index_version 与 health 不一致：${runtimeSearchIndexVersion} != ${searchdHealth.index_version}`
      );
    }

    const editorRuns = await Promise.all(Array.from({ length: EDITOR_COUNT }, async (_, index) => {
      const editorRuntime = editorApiRuntimes[index]!;
      const editor = editorRuntime.editor;
      const searchQuery = searchQueryForEditor(index);
      const search = await timed(async () => {
        const body = await fetchJson({
          url: `${editorRuntime.api_base_url}/cutter/source-search?query=${encodeURIComponent(searchQuery)}&limit=${EDITOR_COUNT}`,
          headers: editor.headers
        });
        assertSearchResultHasEnoughPublicSources(body);
        return body;
      });
      const searchHit = pickSearchHit(search.value, index);
      const searchIndexVersion = String(search.value.data.index_version ?? "").trim();
      if (searchIndexVersion !== runtimeSearchIndexVersion) {
        throw new Error(`搜索 index_version 与运行状态不一致：${searchIndexVersion} != ${runtimeSearchIndexVersion}`);
      }
      const sourceVideoId = searchHit.source_video_id;
      const detail = await timed(async () => {
        const body = await fetchJson({
          url: `${editorRuntime.api_base_url}/cutter/source-videos/${sourceVideoId}`,
          headers: editor.headers
        });
        assertDetailResult(body, sourceVideoId, searchQuery);
        return body;
      });
      const selectedSegment = detailSegmentForSearchHit(detail.value, searchHit.segment_id);
      const selectedText = String(selectedSegment.text);
      const fullTranscriptProof = fullTranscriptProofForDetail(detail.value, sourceVideoId, selectedText);
      const searchResultBeginChar = Number(selectedSegment.begin_char) + searchHit.match_range[0];
      const searchResultEndChar = Number(selectedSegment.begin_char) + searchHit.match_range[1];
      const searchResultText = selectedText.slice(searchHit.match_range[0], searchHit.match_range[1]);
      if (searchResultText !== searchQuery) {
        throw new Error(`搜索命中范围文本不等于查询关键词：${searchResultText}`);
      }
      const cut = await timed(async () => {
        const body = await fetchJson({
          url: `${editorRuntime.api_base_url}/cutter/local-clips`,
          method: "POST",
          headers: editor.headers,
          body: {
            source_video_id: sourceVideoId,
            start_segment_id: selectedSegment.segment_id,
            end_segment_id: selectedSegment.segment_id,
            begin_ms: selectedSegment.begin_ms,
            end_ms: selectedSegment.end_ms,
            selected_text: selectedText,
            cut_mode: "copy"
          }
        });
        assertLocalClipResult(body, sourceVideoId, selectedText, selectedSegment.begin_ms, selectedSegment.end_ms);
        return body;
      });

      return {
        user_id: editor.user_id,
        username: editor.username,
        workspace_id: editorRuntime.workspace_id,
        source_video_id: sourceVideoId,
        selected_segment_id: String(selectedSegment.segment_id),
        search_query: searchQuery,
        search_result_source_video_id: sourceVideoId,
        search_result_rank: searchHit.search_result_rank,
        search_result_group_count: searchHit.search_result_group_count,
        search_result_limit: searchHit.search_result_limit,
        search_result_segment_id: searchHit.segment_id,
        search_result_begin_char: searchResultBeginChar,
        search_result_end_char: searchResultEndChar,
        search_result_text_sha256: sha256Hex(searchResultText),
        full_transcript_source_video_id: fullTranscriptProof.source_video_id,
        full_transcript_segment_id: String(selectedSegment.segment_id),
        full_transcript_segment_count: fullTranscriptProof.segment_count,
        full_transcript_begin_char: fullTranscriptProof.begin_char,
        full_transcript_end_char: fullTranscriptProof.end_char,
        full_transcript_char_count: fullTranscriptProof.char_count,
        full_transcript_text_sha256: fullTranscriptProof.text_sha256,
        selected_text_begin_char: selectedSegment.begin_char,
        selected_text_end_char: selectedSegment.end_char,
        selected_text_char_count: selectedText.length,
        selected_text_sha256: sha256Hex(selectedText),
        selected_begin_ms: selectedSegment.begin_ms,
        selected_end_ms: selectedSegment.end_ms,
        local_clip_id: String(cut.value.data.local_clip_id),
        local_clip_source_video_id: String(cut.value.data.source_video_id),
        local_clip_selected_text_sha256: sha256Hex(String(cut.value.data.selected_text)),
        local_clip_relative_path: String(cut.value.data.relative_path),
        local_clip_file_size_bytes: Number(cut.value.data.file_size),
        local_clip_content_sha256: String(cut.value.data.content_hash),
        local_clip_begin_ms: Number(cut.value.data.begin_ms),
        local_clip_end_ms: Number(cut.value.data.end_ms),
        search_backend: "searchd",
        search_index_version: searchIndexVersion,
        location_verified: true,
        completed_closed_loop: true,
        workspace_output_written: true,
        public_library_written: false,
        search_ms: roundMs(search.duration_ms),
        detail_ms: roundMs(detail.duration_ms),
        cut_ms: roundMs(cut.duration_ms)
      };
    }));

    const distinctSourceVideoCount = new Set(editorRuns.map((item) => item.source_video_id)).size;
    if (distinctSourceVideoCount !== EDITOR_COUNT) {
      throw new Error(`50 并发闭环没有覆盖 50 个不同公共素材：${distinctSourceVideoCount} != ${EDITOR_COUNT}`);
    }
    const distinctSearchIndexVersions = new Set(editorRuns.map((item) => item.search_index_version));
    if (distinctSearchIndexVersions.size !== 1 || !distinctSearchIndexVersions.has(runtimeSearchIndexVersion)) {
      throw new Error("50 并发闭环混用了多个 searchd index_version");
    }
    const searchQueries = [...new Set(editorRuns.map((item) => item.search_query))];
    if (searchQueries.length < MIN_DISTINCT_SEARCH_QUERY_COUNT) {
      throw new Error(`50 并发闭环覆盖关键词不足：${searchQueries.length} < ${MIN_DISTINCT_SEARCH_QUERY_COUNT}`);
    }

    const search = summarize(editorRuns.map((item) => item.search_ms));
    const detail = summarize(editorRuns.map((item) => item.detail_ms));
    const cut = summarize(editorRuns.map((item) => item.cut_ms));

    if (search.p95_ms > SEARCH_P95_SLA_MS) {
      throw new Error(`50 并发搜索 p95 过高：${search.p95_ms}ms > ${SEARCH_P95_SLA_MS}ms`);
    }
    if (detail.p95_ms > DETAIL_P95_SLA_MS) {
      throw new Error(`50 并发详情 p95 过高：${detail.p95_ms}ms > ${DETAIL_P95_SLA_MS}ms`);
    }
    if (cut.p95_ms > CUT_P95_SLA_MS) {
      throw new Error(`50 并发剪辑 p95 过高：${cut.p95_ms}ms > ${CUT_P95_SLA_MS}ms`);
    }
    const usage = await waitForUsageMetrics(
      libraryRoot,
      (current) =>
        current.active_user_count === EDITOR_COUNT &&
        current.searchd_search_count === EDITOR_COUNT &&
        current.source_detail_view_count === EDITOR_COUNT &&
        current.cut_success_count === EDITOR_COUNT &&
        current.local_clip_count === EDITOR_COUNT
    );
    assertUsageMetrics(usage);

    const report = {
      status: "passed",
      editor_count: EDITOR_COUNT,
      active_user_count: usage.active_user_count,
      distinct_source_video_count: distinctSourceVideoCount,
      search_query_count: searchQueries.length,
      search_queries: searchQueries,
      search_query_distribution: searchQueryDistribution(editorRuns),
      indexed_source_video_count: sourceVideoIds.length,
      indexed_transcript_segment_count: expectedIndexedSegmentCount,
      search_index_version: runtimeSearchIndexVersion,
      searchd_health_index_version: searchdHealth.index_version,
      searchd_health_source_video_count: searchdHealth.source_video_count,
      searchd_health_segment_count: searchdHealth.segment_count,
      all_searches_passed: true,
      all_cuts_written_to_local_workspaces: true,
      public_library_not_written_by_cutters: true,
      no_cross_workspace_outputs: true,
      search_sla_ms: SEARCH_P95_SLA_MS,
      detail_sla_ms: DETAIL_P95_SLA_MS,
      cut_sla_ms: CUT_P95_SLA_MS,
      metrics: {
        search,
        detail,
        cut,
        usage: {
          search_request_count: usage.search_request_count,
          searchd_search_count: usage.searchd_search_count,
          search_failure_count: usage.search_failure_count,
          source_detail_view_count: usage.source_detail_view_count,
          transcript_selection_count: usage.transcript_selection_count,
          cut_submission_count: usage.cut_submission_count,
          cut_success_count: usage.cut_success_count,
          local_clip_count: usage.local_clip_count
        }
      },
      editor_sessions: editorRuns
    };
    const reportPath = process.env[REPORT_PATH_ENV]?.trim();

    if (reportPath) {
      const resolvedReportPath = await writeSearchdConcurrencyReport(report, reportPath);
      console.log(`Wrote 50-editor searchd concurrency report to ${resolvedReportPath}`);
      console.log(JSON.stringify({
        status: report.status,
        editor_count: report.editor_count,
        distinct_source_video_count: report.distinct_source_video_count,
        search_query_count: report.search_query_count,
        search_queries: report.search_queries,
        indexed_source_video_count: report.indexed_source_video_count,
        indexed_transcript_segment_count: report.indexed_transcript_segment_count,
        metrics: report.metrics
      }, null, 2));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    for (const editorRuntime of editorApiRuntimes) {
      await closeServer(editorRuntime.api_server);
    }
    await stopChild(searchd);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runSearchdConcurrencySmoke().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
