import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TranscriptSegment } from "../../protocol/src/index.ts";
import { readSourceTranscriptSqliteIndexMetadata } from "../../search-sqlite/src/index.ts";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  publishIndexRequiredSourceVideos,
  resolveCurrentSourceTranscriptIndexFilePath,
  scanSourceVideos,
  searchCutterSourceLibrary
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-search-sqlite-integration-"));
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

async function completeVideoToIndexRequired(input: {
  library_root: string;
  source_video_id: string;
  duration_ms: number;
  full_text: string;
  segments: TranscriptSegment[];
}): Promise<void> {
  await claimNextPreprocessJob({
    library_root: input.library_root,
    worker_id: "worker-a",
    now: "2026-05-02T00:01:00Z"
  });
  await writeReadyArtifacts(input);
  await completePreprocessArtifacts({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    now: "2026-05-02T00:10:00Z",
    media: {
      duration_ms: input.duration_ms,
      width: 1920,
      height: 1080,
      fps: 25,
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
}

async function prepareLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "01_现金流.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "02_组织增长.mov"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "03_未完成.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  return libraryRoot;
}

test("ready publication writes a searchable SQLite index package", async () => {
  const libraryRoot = await prepareLibrary();

  await completeVideoToIndexRequired({
    library_root: libraryRoot,
    source_video_id: "V000001",
    duration_ms: 123_000,
    full_text: "现金流，是企业的血液。不是账面数字。",
    segments: [
      segment({
        source_video_id: "V000001",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液"
      })
    ]
  });

  const published = await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    now: "2026-05-02T00:20:00Z"
  });

  assert.deepEqual(published.published_source_video_ids, ["V000001"]);
  const indexPath = await resolveCurrentSourceTranscriptIndexFilePath(libraryRoot);
  assert.equal((await stat(indexPath)).isFile(), true);
  assert.deepEqual(readSourceTranscriptSqliteIndexMetadata(indexPath), {
    library_id: "lib_main_001",
    index_version: "v000001",
    created_at: "2026-05-02T00:20:00Z",
    source_video_count: 1,
    segment_count: 1,
    schema_version: "1.0"
  });

  const result = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "现金流，是企业的血液",
    limit: 20
  });

  assert.deepEqual(
    result.groups.map((group) => group.source_video_id),
    ["V000001"]
  );
  assert.equal(result.groups[0]?.hit_segments[0]?.text, "现金流，是企业的血液。");
});

test("cutter search follows current index refresh while hidden videos stay absent", async () => {
  const libraryRoot = await prepareLibrary();

  await completeVideoToIndexRequired({
    library_root: libraryRoot,
    source_video_id: "V000001",
    duration_ms: 123_000,
    full_text: "现金流，是企业的血液。不是账面数字。",
    segments: [
      segment({
        source_video_id: "V000001",
        index: 0,
        begin_ms: 1000,
        end_ms: 3600,
        text: "现金流，是企业的血液。",
        normalized_text: "现金流是企业的血液"
      })
    ]
  });
  await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    now: "2026-05-02T00:20:00Z"
  });

  await completeVideoToIndexRequired({
    library_root: libraryRoot,
    source_video_id: "V000002",
    duration_ms: 88_000,
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

  assert.deepEqual(
    (await searchCutterSourceLibrary({
      library_root: libraryRoot,
      query: "组织效率",
      limit: 20
    })).groups,
    []
  );

  const secondPublish = await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    now: "2026-05-02T00:40:00Z"
  });

  assert.equal(secondPublish.index_version, "v000002");
  assert.deepEqual(
    readSourceTranscriptSqliteIndexMetadata(
      await resolveCurrentSourceTranscriptIndexFilePath(libraryRoot)
    ),
    {
      library_id: "lib_main_001",
      index_version: "v000002",
      created_at: "2026-05-02T00:40:00Z",
      source_video_count: 2,
      segment_count: 2,
      schema_version: "1.0"
    }
  );

  const refreshed = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "组织效率",
    limit: 20
  });

  assert.deepEqual(
    refreshed.groups.map((group) => group.source_video_id),
    ["V000002"]
  );

  const stillHidden = await searchCutterSourceLibrary({
    library_root: libraryRoot,
    query: "未完成",
    limit: 20
  });
  assert.deepEqual(stillHidden.groups, []);
});
