import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  publishReadySourceVideo,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
import { runMixlabDoctor } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-doctor-core-"));
}

async function writeDummyVideo(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "dummy-video-bytes");
}

async function writeTextArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);

  await mkdir(videoDir, { recursive: true });
  await writeFile(
    path.join(videoDir, "transcript.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      source_video_id: sourceVideoId,
      provider: "dashscope",
      model: "paraformer-v2",
      generated_at: "2026-05-02T00:00:00Z",
      duration_ms: 4000,
      full_text: "现金流，是企业的血液。",
      segments: []
    })}\n`,
    "utf8"
  );
  await writeFile(
    path.join(videoDir, "subtitles.srt"),
    "1\n00:00:00,000 --> 00:00:04,000\n现金流，是企业的血液。\n",
    "utf8"
  );
  await writeFile(
    path.join(videoDir, "keyframes.json"),
    `${JSON.stringify({ source_video_id: sourceVideoId, keyframes_ms: [0, 2000, 4000] })}\n`,
    "utf8"
  );
}

async function makeBrokenReadyLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "broken-ready.mp4"));
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
      duration_ms: 4000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      content_hash: "stat:size:17:mtime_ms:1"
    },
    artifacts: {
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes.json",
      cover_path: ".mixlab-library/videos/V000001/missing-cover.jpg"
    }
  });
  await publishReadySourceVideo({
    library_root: libraryRoot,
    source_video_id: "V000001",
    index_version: "v000001",
    now: "2026-05-02T00:03:00Z"
  });

  await mkdir(path.join(libraryRoot, ".mixlab-library", "local-clips", "LC000001"), {
    recursive: true
  });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "local-clips", "LC000001", "local-clip.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      local_clip_id: "bad",
      title: "",
      source_video_id: "V000001",
      source_title: "broken-ready",
      source_relative_path: "broken-ready.mp4",
      begin_ms: 3000,
      end_ms: 1000,
      duration_ms: 1,
      selected_text: "",
      cut_mode: "turbo",
      media_path: "../clip.mp4",
      created_at: "2026-05-02T00:04:00Z"
    })}\n`,
    "utf8"
  );

  return libraryRoot;
}

function byId(report: Awaited<ReturnType<typeof runMixlabDoctor>>, checkId: string) {
  const check = report.checks.find((item) => item.check_id === checkId);

  if (!check) {
    throw new Error(`missing doctor check ${checkId}`);
  }

  return check;
}

test("reports library health, incomplete ready artifacts, malformed local clips, and redacted ASR config", async () => {
  const libraryRoot = await makeBrokenReadyLibrary();
  const report = await runMixlabDoctor({
    library_root: libraryRoot,
    now: "2026-05-02T08:00:00Z",
    env: {
      DASHSCOPE_API_KEY: "sk-do-not-leak",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    }
  });

  assert.equal(report.schema_version, "1.0");
  assert.equal(report.generated_at, "2026-05-02T08:00:00Z");
  assert.equal(byId(report, "public-root").status, "pass");
  assert.equal(byId(report, "source-videos-readable").status, "pass");
  assert.equal(byId(report, "mixlab-library-writable").status, "pass");
  assert.equal(byId(report, "library-counts").status, "pass");
  assert.equal(byId(report, "source-video-manifests").status, "fail");
  assert.match(byId(report, "source-video-manifests").message, /missing-cover/);
  assert.equal(byId(report, "current-index").status, "fail");
  assert.equal(byId(report, "local-clips").status, "fail");
  assert.match(byId(report, "local-clips").message, /LC000001/);
  assert.equal(byId(report, "ffmpeg").status, "pass");
  assert.equal(byId(report, "ffprobe").status, "pass");
  assert.equal(byId(report, "asr-config").status, "pass");
  assert.deepEqual(byId(report, "asr-config").details, {
    dashscope_api_key_configured: true,
    asr_model: "paraformer-v2"
  });
  assert.equal(JSON.stringify(report).includes("sk-do-not-leak"), false);
  assert.equal(report.summary.fail >= 3, true);
});
