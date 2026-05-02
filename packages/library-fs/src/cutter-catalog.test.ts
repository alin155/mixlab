import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  listCutterVisibleSourceVideos,
  publishReadySourceVideo,
  scanSourceVideos
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-cutter-catalog-${Date.now()}-`), {
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

async function completeFirstVideoToReady(libraryRoot: string): Promise<void> {
  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z"
  });
  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-05-01T00:10:00Z",
    media: {
      duration_ms: 123_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: "sha256:test"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }
  });
  await publishReadySourceVideo({
    library_root: libraryRoot,
    source_video_id: "V000001",
    index_version: "v000001",
    now: "2026-05-01T00:15:00Z"
  });
}

test("lists only cutter-visible ready source videos", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "b.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });
  await completeFirstVideoToReady(libraryRoot);
  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:20:00Z"
  });

  const catalog = await listCutterVisibleSourceVideos({
    library_root: libraryRoot
  });

  assert.equal(catalog.available_video_count, 1);
  assert.deepEqual(
    catalog.videos.map((video) => video.source_video_id),
    ["V000001"]
  );
  assert.equal(catalog.videos[0]?.preprocess_status, "ready");
  assert.equal(catalog.videos[0]?.visible_to_cutters, true);
  assert.equal(catalog.videos[0]?.cover_path, ".mixlab-library/videos/V000001/cover.jpg");
});
