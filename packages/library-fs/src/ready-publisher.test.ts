import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readSourceTranscriptSqliteIndexMetadata } from "../../search-sqlite/src/index.ts";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  completeReadyVisualArtifacts,
  listCutterVisibleSourceVideos,
  publishIndexRequiredSourceVideos,
  readCurrentIndexPointer,
  resolveCurrentSourceTranscriptIndexFilePath,
  scanSourceVideos
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-ready-publisher-${Date.now()}-`), {
    recursive: true
  });

  if (!root) {
    throw new Error("failed to create test library root");
  }

  return root;
}

async function writeDummyVideo(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "dummy-video-bytes");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeTextArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);

  await mkdir(videoDir, { recursive: true });
  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      source_video_id: sourceVideoId,
      full_text: "现金流，是企业的血液。",
      duration_ms: 4_000,
      segments: [
        {
          segment_id: `${sourceVideoId}-S000001`,
          index: 0,
          begin_ms: 0,
          end_ms: 4_000,
          begin_char: 0,
          end_char: 10,
          normalized_begin_char: 0,
          normalized_end_char: 9,
          text: "现金流，是企业的血液。",
          normalized_text: "现金流是企业的血液",
          confidence: 0.95
        }
      ]
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(videoDir, "subtitles.srt"),
    "1\n00:00:00,000 --> 00:00:04,000\n现金流，是企业的血液。\n",
    "utf8"
  );
}

async function makeIndexRequiredLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "b.mp4"));
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
  await writeTextArtifacts(libraryRoot, "V000001");
  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-05-02T00:02:00Z",
    media: {
      duration_ms: 4_000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      content_hash: "stat:size:123:mtime_ms:456"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: "",
      cover_path: ""
    }
  });

  return libraryRoot;
}

test("writes ready visual artifacts while keeping an index-required video hidden", async () => {
  const libraryRoot = await makeIndexRequiredLibrary();
  const coverPath = ".mixlab-library/videos/V000001/cover.jpg";

  await writeFile(path.join(libraryRoot, coverPath), "fake-jpeg");

  await completeReadyVisualArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    cover_path: coverPath,
    keyframes_ms: [0, 2_000, 4_000],
    now: "2026-05-02T00:03:00Z"
  });

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const keyframes = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "keyframes.json")
  );

  assert.equal(manifest.preprocess_status, "index-required");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(manifest.cover_path, coverPath);
  assert.equal(manifest.keyframes_path, ".mixlab-library/videos/V000001/keyframes.json");
  assert.deepEqual(keyframes.keyframes_ms, [0, 2_000, 4_000]);
});

test("publishes complete index-required videos into a new index package and cutter catalog", async () => {
  const libraryRoot = await makeIndexRequiredLibrary();
  const coverPath = ".mixlab-library/videos/V000001/cover.jpg";

  await writeFile(path.join(libraryRoot, coverPath), "fake-jpeg");
  await completeReadyVisualArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    cover_path: coverPath,
    keyframes_ms: [0, 2_000, 4_000],
    now: "2026-05-02T00:03:00Z"
  });

  const result = await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    now: "2026-05-02T00:04:00Z"
  });

  assert.deepEqual(result, {
    index_version: "v000001",
    published_source_video_ids: ["V000001"],
    ready_video_count: 1,
    skipped_source_video_ids: []
  });
  assert.equal((await readCurrentIndexPointer(libraryRoot)).current_version, "v000001");

  const indexManifest = await readJson<Record<string, unknown>>(
    path.join(
      libraryRoot,
      ".mixlab-library",
      "indexes",
      "source-transcript-index",
      "v000001",
      "index-manifest.json"
    )
  );
  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  const catalog = await listCutterVisibleSourceVideos({
    library_root: libraryRoot
  });

  assert.deepEqual(indexManifest.source_video_ids, ["V000001"]);
  assert.deepEqual(
    readSourceTranscriptSqliteIndexMetadata(await resolveCurrentSourceTranscriptIndexFilePath(libraryRoot)),
    {
      library_id: "lib_main_001",
      index_version: "v000001",
      created_at: "2026-05-02T00:04:00Z",
      source_video_count: 1,
      segment_count: 1,
      schema_version: "1.0"
    }
  );
  assert.equal(manifest.preprocess_status, "ready");
  assert.equal(manifest.visible_to_cutters, true);
  assert.equal(library.index_required_video_count, 0);
  assert.equal(library.ready_video_count, 1);
  assert.deepEqual(
    catalog.videos.map((video) => video.source_video_id),
    ["V000001"]
  );
  assert.equal(
    (await stat(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg")))
      .isFile(),
    true
  );
});

test("keeps incomplete index-required videos hidden during ready publishing", async () => {
  const libraryRoot = await makeIndexRequiredLibrary();

  const result = await publishIndexRequiredSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    now: "2026-05-02T00:04:00Z"
  });

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );

  assert.deepEqual(result, {
    index_version: "",
    published_source_video_ids: [],
    ready_video_count: 0,
    skipped_source_video_ids: ["V000001"]
  });
  assert.equal(manifest.preprocess_status, "index-required");
  assert.equal(manifest.visible_to_cutters, false);
});
