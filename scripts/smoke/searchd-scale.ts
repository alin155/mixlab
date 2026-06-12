import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  normalizeTranscriptText,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../packages/protocol/src/index.ts";
import {
  publishIndexPackage
} from "../../packages/library-fs/src/index.ts";
import {
  createSourceTranscriptSqliteIndexBytes,
  type SourceTranscriptSqliteVideo
} from "../../packages/search-sqlite/src/index.ts";
import { createCutterApiServer } from "../../packages/cutter-api/src/index.ts";

const LIBRARY_ID = "lib_main_001";
const INDEX_VERSION = "v000001";
const DEFAULT_VIDEO_COUNT = 2000;
const DEFAULT_SEGMENTS_PER_VIDEO = 24;
const DEFAULT_SEARCH_RUNS = 50;
const COMMON_QUERY = "现金流";
const UNIQUE_QUERY = "定位词1024";
const SEARCH_HTTP_P95_SLA_MS = 1200;
const SEARCHD_INTERNAL_P95_SLA_MS = 300;
const DETAIL_HTTP_P95_SLA_MS = 1200;

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

function formatSourceVideoId(value: number): string {
  return `V${String(value).padStart(6, "0")}`;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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
    confidence: 0.98
  };
}

function buildScaleSegments(input: {
  source_video_id: string;
  video_index: number;
  segments_per_video: number;
  target_video_id: string;
}): TranscriptSegment[] {
  let beginChar = 0;
  let normalizedBeginChar = 0;
  const segments: TranscriptSegment[] = [];

  for (let index = 0; index < input.segments_per_video; index += 1) {
    const uniqueText =
      input.source_video_id === input.target_video_id && index === Math.floor(input.segments_per_video / 2)
        ? ` ${UNIQUE_QUERY} 出现在这条完整文案的中段，用来验证详情定位。`
        : "";
    const text =
      `第 ${input.video_index + 1} 条素材第 ${index + 1} 句，${COMMON_QUERY} 指标正在变化，剪辑师需要快速定位关键词所在上下文。${uniqueText}`;
    const normalizedText = normalizeTranscriptText(text);
    segments.push(segment({
      source_video_id: input.source_video_id,
      index,
      begin_ms: index * 1600,
      end_ms: index * 1600 + 1200,
      text,
      begin_char: beginChar,
      normalized_begin_char: normalizedBeginChar
    }));
    beginChar += text.length;
    normalizedBeginChar += normalizedText.length;
  }

  return segments;
}

function buildScaleVideos(input: {
  video_count: number;
  segments_per_video: number;
  target_video_id: string;
}): SourceTranscriptSqliteVideo[] {
  return Array.from({ length: input.video_count }, (_, index) => {
    const sourceVideoId = formatSourceVideoId(index + 1);

    return {
      source_video_id: sourceVideoId,
      title: `规模验证素材 ${String(index + 1).padStart(4, "0")}`,
      duration_ms: input.segments_per_video * 1600,
      relative_path: `${sourceVideoId}.mp4`,
      cover_path: `.mixlab-library/videos/${sourceVideoId}/cover.jpg`,
      segments: buildScaleSegments({
        source_video_id: sourceVideoId,
        video_index: index,
        segments_per_video: input.segments_per_video,
        target_video_id: input.target_video_id
      })
    };
  });
}

async function writeTargetManifest(input: {
  library_root: string;
  target_video: SourceTranscriptSqliteVideo;
}): Promise<void> {
  const sourceVideoId = input.target_video.source_video_id;
  const videoDir = path.join(input.library_root, ".mixlab-library", "videos", sourceVideoId);
  const sourcePath = path.join(input.library_root, "source-videos", `${sourceVideoId}.mp4`);

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await mkdir(videoDir, { recursive: true });
  await writeFile(sourcePath, `synthetic source video for ${sourceVideoId}\n`);
  await writeFile(path.join(videoDir, "subtitles.srt"), "1\n00:00:00,000 --> 00:00:01,200\n规模验证字幕\n");
  await writeFile(path.join(videoDir, "keyframes.json"), jsonBytes({
    schema_version: "1.0",
    keyframes_ms: [0, 1600, 3200]
  }));
  await writeFile(path.join(videoDir, "cover.jpg"), `cover placeholder ${sourceVideoId}\n`);
  await writeFile(path.join(input.library_root, ".mixlab-library", "library.json"), jsonBytes({
    library_id: LIBRARY_ID,
    name: "规模验证素材库",
    version: "1.0",
    created_at: "2026-05-04T11:00:00.000Z",
    updated_at: "2026-05-04T11:00:00.000Z",
    source_video_ids: [sourceVideoId],
    video_count: 1,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0
  }));

  const manifest: SourceVideoManifest = {
    source_video_id: sourceVideoId,
    title: input.target_video.title,
    relative_path: `${sourceVideoId}.mp4`,
    logical_uri: `library://source-video/${sourceVideoId}`,
    duration_ms: input.target_video.duration_ms,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1,
    content_hash: `sha256:scale-${sourceVideoId}`,
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: `.mixlab-library/videos/${sourceVideoId}/transcript.json`,
    srt_path: `.mixlab-library/videos/${sourceVideoId}/subtitles.srt`,
    keyframes_path: `.mixlab-library/videos/${sourceVideoId}/keyframes.json`,
    cover_path: `.mixlab-library/videos/${sourceVideoId}/cover.jpg`
  };

  await writeFile(path.join(videoDir, "source-video.json"), jsonBytes(manifest));
  await writeFile(path.join(videoDir, "transcript.json"), jsonBytes({
    schema_version: "1.0",
    source_video_id: sourceVideoId,
    provider: "scale-smoke",
    model: "synthetic",
    generated_at: "2026-05-04T11:00:00.000Z",
    duration_ms: input.target_video.duration_ms,
    full_text: input.target_video.segments.map((item) => item.text).join(""),
    segments: input.target_video.segments
  }));
}

async function createScaleIndex(input: {
  library_root: string;
  video_count: number;
  segments_per_video: number;
}): Promise<{ target_video_id: string; segment_count: number; build_ms: number }> {
  const startedAt = performance.now();
  const targetVideoId = formatSourceVideoId(Math.max(1, Math.floor(input.video_count / 2)));
  const videos = buildScaleVideos({
    video_count: input.video_count,
    segments_per_video: input.segments_per_video,
    target_video_id: targetVideoId
  });

  const indexSqliteBytes = await createSourceTranscriptSqliteIndexBytes({
    library_id: LIBRARY_ID,
    index_version: INDEX_VERSION,
    created_at: "2026-05-04T11:00:00.000Z",
    videos
  });
  await publishIndexPackage({
    library_root: input.library_root,
    manifest: {
      schema_version: "1.0",
      library_id: LIBRARY_ID,
      index_version: INDEX_VERSION,
      created_at: "2026-05-04T11:00:00.000Z",
      ready_video_count: input.video_count,
      source_video_ids: videos.map((video) => video.source_video_id)
    },
    index_sqlite_bytes: indexSqliteBytes
  });
  const targetVideo = videos.find((video) => video.source_video_id === targetVideoId);
  if (!targetVideo) {
    throw new Error("target video not generated");
  }
  await writeTargetManifest({
    library_root: input.library_root,
    target_video: targetVideo
  });

  return {
    target_video_id: targetVideoId,
    segment_count: input.video_count * input.segments_per_video,
    build_ms: performance.now() - startedAt
  };
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

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function fetchJson(input: {
  url: string;
  headers?: Record<string, string>;
}): Promise<any> {
  const response = await fetch(input.url, {
    headers: {
      Accept: "application/json",
      ...input.headers
    }
  });
  const text = await response.text();
  const body = text.trim() ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${input.url}: ${text.slice(0, 300)}`);
  }

  return body;
}

async function waitForSearchdReady(input: {
  child: ChildProcess;
  base_url: string;
  expected_video_count: number;
  expected_segment_count: number;
}): Promise<number> {
  const startedAt = performance.now();
  const timeoutMs = 120_000;
  let lastError = "";

  input.child.stdout?.on("data", (chunk) => process.stdout.write(String(chunk)));
  input.child.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));

  while (performance.now() - startedAt < timeoutMs) {
    if (input.child.exitCode !== null) {
      throw new Error(`searchd 提前退出：${input.child.exitCode}`);
    }

    try {
      const body = await fetchJson({ url: `${input.base_url}/health` });
      if (
        body.data?.index_version &&
        body.data?.source_video_count >= input.expected_video_count &&
        body.data?.segment_count >= input.expected_segment_count
      ) {
        return performance.now() - startedAt;
      }
      lastError = `health payload ${JSON.stringify(body.data ?? {})}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`等待 searchd 大索引启动超时：${lastError}`);
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

function assertCutterApiSearch(body: any, query: string, targetVideoId: string): void {
  if (body.data?.search_mode !== "searchd") {
    throw new Error(`规模搜索未走 searchd：${body.data?.search_mode ?? "unknown"}`);
  }
  if (query === COMMON_QUERY) {
    if (body.data?.returned_count !== 20) {
      throw new Error(`高命中搜索返回数量不正确：${body.data?.returned_count ?? "unknown"}`);
    }
    if (!Array.isArray(body.data?.groups) || body.data.groups.some((group: any) => group.hit_segments?.length < 1)) {
      throw new Error("高命中搜索缺少命中片段");
    }
    return;
  }

  if (body.data?.groups?.[0]?.source_video_id !== targetVideoId) {
    throw new Error(`唯一关键词未定位到目标视频：${body.data?.groups?.[0]?.source_video_id ?? "unknown"}`);
  }
}

function assertDetail(body: any, targetVideoId: string): void {
  if (body.data?.source_video_id !== targetVideoId) {
    throw new Error(`详情 source_video_id 不正确：${body.data?.source_video_id ?? "unknown"}`);
  }
  if (body.data?.transcript?.provider !== "sqlite-index") {
    throw new Error(`详情不是来自本地索引：${body.data?.transcript?.provider ?? "unknown"}`);
  }
  if (!String(body.data?.transcript?.full_text ?? "").includes(UNIQUE_QUERY)) {
    throw new Error("详情完整文案缺少唯一定位词");
  }
}

function textSliceByCharacterRange(text: string, range: [number, number]): string {
  return Array.from(text).slice(range[0], range[1]).join("");
}

function assertSearchHitMapsToFullTranscript(input: {
  search_body: any;
  detail_body: any;
  target_video_id: string;
}): void {
  const group = input.search_body.data?.groups?.[0];
  if (group?.source_video_id !== input.target_video_id) {
    throw new Error(`唯一关键词搜索没有命中目标视频：${group?.source_video_id ?? "unknown"}`);
  }

  const hitSegment = group.hit_segments?.find((segment: any) =>
    Array.isArray(segment.match_ranges) &&
    segment.match_ranges.some((range: [number, number]) =>
      textSliceByCharacterRange(String(segment.text ?? ""), range) === UNIQUE_QUERY
    )
  );
  if (!hitSegment) {
    throw new Error("唯一关键词搜索结果没有给出可映射的命中范围");
  }

  const detailSegments = input.detail_body.data?.transcript?.segments;
  const fullText = String(input.detail_body.data?.transcript?.full_text ?? "");
  const detailSegment = Array.isArray(detailSegments)
    ? detailSegments.find((segment: any) => segment.segment_id === hitSegment.segment_id)
    : undefined;
  if (!detailSegment) {
    throw new Error(`完整文案详情缺少搜索命中的段落：${hitSegment.segment_id}`);
  }
  if (detailSegment.text !== hitSegment.text) {
    throw new Error("搜索命中段落文本与完整文案详情段落不一致");
  }
  if (
    typeof detailSegment.begin_char !== "number" ||
    typeof detailSegment.end_char !== "number"
  ) {
    throw new Error("完整文案详情段落缺少字符偏移，无法定位搜索命中");
  }
  if (
    textSliceByCharacterRange(fullText, [detailSegment.begin_char, detailSegment.end_char]) !==
      detailSegment.text
  ) {
    throw new Error("完整文案段落字符偏移无法还原段落文本");
  }

  const matchRange = hitSegment.match_ranges.find((range: [number, number]) =>
    textSliceByCharacterRange(hitSegment.text, range) === UNIQUE_QUERY
  ) as [number, number] | undefined;
  if (!matchRange) {
    throw new Error("搜索命中范围没有覆盖唯一关键词");
  }

  const fullTextRange: [number, number] = [
    detailSegment.begin_char + matchRange[0],
    detailSegment.begin_char + matchRange[1]
  ];
  if (textSliceByCharacterRange(fullText, fullTextRange) !== UNIQUE_QUERY) {
    throw new Error("搜索命中范围无法映射回完整文案里的唯一关键词位置");
  }
}

async function main(): Promise<void> {
  const videoCount = positiveIntegerEnv("MIXLAB_SCALE_SMOKE_VIDEOS", DEFAULT_VIDEO_COUNT);
  const segmentsPerVideo = positiveIntegerEnv("MIXLAB_SCALE_SMOKE_SEGMENTS_PER_VIDEO", DEFAULT_SEGMENTS_PER_VIDEO);
  const searchRuns = positiveIntegerEnv("MIXLAB_SCALE_SMOKE_SEARCH_RUNS", DEFAULT_SEARCH_RUNS);
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-searchd-scale-library-"));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-searchd-scale-workspace-"));
  const searchdCacheRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-searchd-scale-cache-"));
  const scaleIndex = await createScaleIndex({
    library_root: libraryRoot,
    video_count: videoCount,
    segments_per_video: segmentsPerVideo
  });
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
  let apiServer: Server | undefined;

  try {
    const searchdReadyMs = await waitForSearchdReady({
      child: searchd,
      base_url: searchdBaseUrl,
      expected_video_count: videoCount,
      expected_segment_count: scaleIndex.segment_count
    });

    apiServer = createCutterApiServer({
      library_root: libraryRoot,
      workspace_root: workspaceRoot,
      searchd_base_url: searchdBaseUrl,
      searchd_timeout_ms: 3000,
      auth_mode: "local_trusted",
      trusted_username: "规模烟测剪辑师",
      now: () => new Date().toISOString()
    });
    await new Promise<void>((resolve) => apiServer!.listen(0, "127.0.0.1", resolve));
    const apiPort = (apiServer.address() as AddressInfo).port;
    const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
    const runtimeStatus = await fetchJson({ url: `${apiBaseUrl}/cutter/runtime-status` });
    if (runtimeStatus.data?.search_backend?.mode !== "searchd") {
      throw new Error(`Cutter API 未连接 searchd：${runtimeStatus.data?.search_backend?.mode ?? "unknown"}`);
    }

    const searchRunsResult = await Promise.all(Array.from({ length: searchRuns }, async (_, runIndex) => {
      const query = runIndex % 10 === 0 ? UNIQUE_QUERY : COMMON_QUERY;
      const result = await timed(async () => {
        const body = await fetchJson({
          url: `${apiBaseUrl}/cutter/source-search?query=${encodeURIComponent(query)}&limit=20`
        });
        assertCutterApiSearch(body, query, scaleIndex.target_video_id);
        return body;
      });

      return {
        http_ms: result.duration_ms,
        searchd_ms: Math.max(0, Number(result.value.data?.search_ms ?? 0))
      };
    }));
    const detailRunsResult = await Promise.all(Array.from({ length: 10 }, async () =>
      timed(async () => {
        const body = await fetchJson({
          url: `${apiBaseUrl}/cutter/source-videos/${scaleIndex.target_video_id}`
        });
        assertDetail(body, scaleIndex.target_video_id);
        return body;
      })
    ));
    const locationSearch = await timed(async () => {
      const body = await fetchJson({
        url: `${apiBaseUrl}/cutter/source-search?query=${encodeURIComponent(UNIQUE_QUERY)}&limit=20`
      });
      assertCutterApiSearch(body, UNIQUE_QUERY, scaleIndex.target_video_id);
      return body;
    });
    const locationDetail = await timed(async () => {
      const body = await fetchJson({
        url: `${apiBaseUrl}/cutter/source-videos/${scaleIndex.target_video_id}`
      });
      assertDetail(body, scaleIndex.target_video_id);
      return body;
    });
    assertSearchHitMapsToFullTranscript({
      search_body: locationSearch.value,
      detail_body: locationDetail.value,
      target_video_id: scaleIndex.target_video_id
    });
    const searchHttp = summarize(searchRunsResult.map((item) => item.http_ms));
    const searchdInternal = summarize(searchRunsResult.map((item) => item.searchd_ms));
    const detailHttp = summarize([
      ...detailRunsResult.map((item) => item.duration_ms),
      locationDetail.duration_ms
    ]);

    if (searchHttp.p95_ms > SEARCH_HTTP_P95_SLA_MS) {
      throw new Error(`大索引 Cutter API 搜索 p95 过高：${searchHttp.p95_ms}ms > ${SEARCH_HTTP_P95_SLA_MS}ms`);
    }
    if (searchdInternal.p95_ms > SEARCHD_INTERNAL_P95_SLA_MS) {
      throw new Error(`大索引 searchd 内部搜索 p95 过高：${searchdInternal.p95_ms}ms > ${SEARCHD_INTERNAL_P95_SLA_MS}ms`);
    }
    if (detailHttp.p95_ms > DETAIL_HTTP_P95_SLA_MS) {
      throw new Error(`大索引详情 p95 过高：${detailHttp.p95_ms}ms > ${DETAIL_HTTP_P95_SLA_MS}ms`);
    }

    console.log(JSON.stringify({
      status: "passed",
      indexed_source_video_count: videoCount,
      indexed_transcript_segment_count: scaleIndex.segment_count,
      target_video_id: scaleIndex.target_video_id,
      common_query: COMMON_QUERY,
      unique_query: UNIQUE_QUERY,
      metrics: {
        sqlite_index_build_ms: roundMs(scaleIndex.build_ms),
        searchd_ready_ms: roundMs(searchdReadyMs),
        cutter_api_search_http: searchHttp,
        searchd_internal_search: searchdInternal,
        cutter_api_detail_http: detailHttp,
        full_transcript_location: {
          search_http_ms: roundMs(locationSearch.duration_ms),
          detail_http_ms: roundMs(locationDetail.duration_ms),
          verified_query: UNIQUE_QUERY
        }
      },
      sla_ms: {
        cutter_api_search_http_p95: SEARCH_HTTP_P95_SLA_MS,
        searchd_internal_search_p95: SEARCHD_INTERNAL_P95_SLA_MS,
        cutter_api_detail_http_p95: DETAIL_HTTP_P95_SLA_MS
      },
      library_root: libraryRoot,
      workspace_root: workspaceRoot,
      searchd_cache_root: searchdCacheRoot
    }, null, 2));
  } finally {
    if (apiServer) {
      await closeServer(apiServer);
    }
    await stopChild(searchd);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
