import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  publishReadySourceVideo,
  scanSourceVideos
} from "../../packages/library-fs/src/index.ts";

async function writeDummyVideo(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "mixlab-spike-video-bytes");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main(): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-preprocess-lifecycle-"));

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "访谈.mov"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  const job = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-local-1",
    now: "2026-05-01T00:01:00Z"
  });

  if (!job) {
    throw new Error("expected one unprocessed source video to claim");
  }

  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: job.source_video_id,
    now: "2026-05-01T00:10:00Z",
    media: {
      duration_ms: 123_000,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: "h264",
      content_hash: "sha256:spike"
    },
    artifacts: {
      transcript_path: `.mixlab-library/videos/${job.source_video_id}/transcript.json`,
      srt_path: `.mixlab-library/videos/${job.source_video_id}/subtitles.srt`,
      keyframes_path: `.mixlab-library/videos/${job.source_video_id}/keyframes`,
      cover_path: `.mixlab-library/videos/${job.source_video_id}/cover.jpg`
    }
  });

  const afterArtifacts = await readJson(
    path.join(libraryRoot, ".mixlab-library", "videos", job.source_video_id, "source-video.json")
  );

  await publishReadySourceVideo({
    library_root: libraryRoot,
    source_video_id: job.source_video_id,
    index_version: "v000001",
    now: "2026-05-01T00:15:00Z"
  });

  const afterReady = await readJson(
    path.join(libraryRoot, ".mixlab-library", "videos", job.source_video_id, "source-video.json")
  );
  const library = await readJson(path.join(libraryRoot, ".mixlab-library", "library.json"));
  const jobRecord = await readJson(
    path.join(libraryRoot, ".mixlab-library", "videos", job.source_video_id, "preprocess-job.json")
  );

  console.log(`Library root: ${libraryRoot}`);
  console.log("\nClaimed job:");
  console.log(JSON.stringify(job, null, 2));
  console.log("\nAfter artifacts complete (hidden, index-required):");
  console.log(JSON.stringify(afterArtifacts, null, 2));
  console.log("\nAfter index publication (visible, ready):");
  console.log(JSON.stringify(afterReady, null, 2));
  console.log("\nlibrary.json counts:");
  console.log(JSON.stringify(library, null, 2));
  console.log("\npreprocess-job.json:");
  console.log(JSON.stringify(jobRecord, null, 2));
}

await main();
