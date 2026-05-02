import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TranscriptSegment } from "../../protocol/src/index.ts";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  getCutterSourceVideoDetail,
  listCutterSourceLibrary,
  publishReadySourceVideo,
  scanSourceVideos,
  searchCutterSourceLibrary
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-source-library-"));
}

async function writeDummyVideo(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "dummy-video-bytes");
}

function segment(input: {
  source_video_id: string;
  index: number;
  begin_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
}): TranscriptSegment {
  return {
    segment_id: `${input.source_video_id}-S${String(input.index + 1).padStart(6, "0")}`,
    index: input.index,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    begin_char: 0,
    end_char: input.text.length,
    normalized_begin_char: 0,
    normalized_end_char: input.normalized_text.length,
    text: input.text,
    normalized_text: input.normalized_text,
    confidence: 0.96
  };
}

async function writeReadyArtifacts(input: {
  library_root: string;
  source_video_id: string;
  full_text: string;
  segments: TranscriptSegment[];
}): Promise<void> {
  const videoDir = path.join(
    input.library_root,
    ".mixlab-library",
    "videos",
    input.source_video_id
  );

  await mkdir(videoDir, { recursive: true });
  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        source_video_id: input.source_video_id,
        provider: "dashscope",
        model: "paraformer-v2",
        generated_at: "2026-05-02T00:00:00Z",
        duration_ms: 123_000,
        full_text: input.full_text,
        segments: input.segments
      },
      null,
      2
    )}\n`
  );
  await writeFile(path.join(videoDir, "subtitles.srt"), "1\n00:00:00,000 --> 00:00:01,000\n测试\n");
  await writeFile(
    path.join(videoDir, "keyframes.json"),
    `${JSON.stringify({ schema_version: "1.0", keyframes_ms: [0, 5000, 10000] }, null, 2)}\n`
  );
  await writeFile(path.join(videoDir, "cover.jpg"), "cover-bytes");
}

async function completeVideoToReady(input: {
  library_root: string;
  source_video_id: string;
  duration_ms: number;
}): Promise<void> {
  await completePreprocessArtifacts({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    now: "2026-05-02T00:10:00Z",
    media: {
      duration_ms: input.duration_ms,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: `sha256:${input.source_video_id}`
    },
    artifacts: {
      transcript_path: `.mixlab-library/videos/${input.source_video_id}/transcript.json`,
      srt_path: `.mixlab-library/videos/${input.source_video_id}/subtitles.srt`,
      keyframes_path: `.mixlab-library/videos/${input.source_video_id}/keyframes.json`,
      cover_path: `.mixlab-library/videos/${input.source_video_id}/cover.jpg`
    }
  });
  await publishReadySourceVideo({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    index_version: "v000001",
    now: "2026-05-02T00:15:00Z"
  });
}

async function prepareLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "01_现金流.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "02_组织增长.mov"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-02T00:01:00Z"
  });
  await writeReadyArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    full_text: "现金流，是企业的血液。不是账面数字。",
    segments: [
      segment({
        source_video_id: "V000001",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液"
      }),
      segment({
        source_video_id: "V000001",
        index: 1,
        begin_ms: 3600,
        end_ms: 6200,
        text: "不是账面数字。",
        normalized_text: "不是账面数字"
      })
    ]
  });
  await completeVideoToReady({
    library_root: libraryRoot,
    source_video_id: "V000001",
    duration_ms: 123_000
  });

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-02T00:20:00Z"
  });
  await writeReadyArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    full_text: "组织效率决定增长。",
    segments: [
      segment({
        source_video_id: "V000002",
        index: 0,
        begin_ms: 2000,
        end_ms: 5200,
        text: "组织效率决定增长。",
        normalized_text: "组织效率决定增长"
      })
    ]
  });
  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000002",
    now: "2026-05-02T00:25:00Z",
    media: {
      duration_ms: 88_000,
      width: 1280,
      height: 720,
      fps: 25,
      codec: "h264",
      content_hash: "sha256:V000002"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000002/transcript.json",
      srt_path: ".mixlab-library/videos/V000002/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000002/keyframes.json",
      cover_path: ".mixlab-library/videos/V000002/cover.jpg"
    }
  });

  return libraryRoot;
}

test("lists only ready source videos as cutter library cards with resolved assets", async () => {
  const libraryRoot = await prepareLibrary();

  const library = await listCutterSourceLibrary({ library_root: libraryRoot });

  assert.equal(library.available_video_count, 1);
  assert.deepEqual(
    library.videos.map((video) => video.source_video_id),
    ["V000001"]
  );
  assert.equal(library.videos[0]?.title, "01_现金流");
  assert.equal(
    library.videos[0]?.source_video_file_path,
    path.join(libraryRoot, "source-videos", "01_现金流.mp4")
  );
  assert.equal(
    library.videos[0]?.cover_file_path,
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg")
  );
});

test("returns cutter source video detail with full transcript and playable source path", async () => {
  const libraryRoot = await prepareLibrary();

  const detail = await getCutterSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000001"
  });

  assert.equal(detail?.source_video_id, "V000001");
  assert.equal(detail?.source_video_file_path, path.join(libraryRoot, "source-videos", "01_现金流.mp4"));
  assert.equal(detail?.transcript.full_text, "现金流，是企业的血液。不是账面数字。");
  assert.deepEqual(
    detail?.transcript.segments.map((item) => item.segment_id),
    ["V000001-S000001", "V000001-S000002"]
  );
  assert.deepEqual(detail?.keyframes.keyframes_ms, [0, 5000, 10000]);

  const hiddenDetail = await getCutterSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000002"
  });
  assert.equal(hiddenDetail, null);
});

test("hides ready source videos with missing published artifacts from cutters", async () => {
  const libraryRoot = await prepareLibrary();

  await rm(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg"));

  const library = await listCutterSourceLibrary({ library_root: libraryRoot });
  assert.equal(library.available_video_count, 0);

  const detail = await getCutterSourceVideoDetail({
    library_root: libraryRoot,
    source_video_id: "V000001"
  });
  assert.equal(detail, null);

  const result = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "现金流",
    limit: 10
  });
  assert.deepEqual(result.groups, []);
});

test("searches only cutter-visible ready transcripts and enriches groups with cover paths", async () => {
  const libraryRoot = await prepareLibrary();

  const result = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "现金流",
    limit: 20
  });

  assert.equal(result.normalized_query, "现金流");
  assert.deepEqual(
    result.groups.map((group) => group.source_video_id),
    ["V000001"]
  );
  assert.equal(result.groups[0]?.cover_file_path, path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg"));
  assert.equal(result.groups[0]?.hit_segments[0]?.text, "现金流，是企业的血液。");

  const hiddenOnly = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "组织效率",
    limit: 20
  });
  assert.deepEqual(hiddenOnly.groups, []);
});

test("falls back to ready transcript artifacts when the current sqlite search index is invalid", async () => {
  const libraryRoot = await prepareLibrary();
  const indexVersionDir = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    "v000001"
  );

  await mkdir(indexVersionDir, { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
    `${JSON.stringify({ library_id: "lib_main_001", current_version: "v000001" }, null, 2)}\n`
  );
  await writeFile(path.join(indexVersionDir, "index.sqlite"), "{\"not\":\"sqlite\"}\n");

  const result = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "现金流",
    limit: 20
  });

  assert.deepEqual(
    result.groups.map((group) => group.source_video_id),
    ["V000001"]
  );
  assert.equal(result.groups[0]?.hit_segments[0]?.text, "现金流，是企业的血液。");
});
