import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  publishReadySourceVideo,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
import { writeSourceTranscriptSqliteIndex } from "../../search-sqlite/src/index.ts";
import { exportMixlabDoctorReport, runMixlabDoctor } from "./index.ts";

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

async function writeCurrentIndexPackage(
  libraryRoot: string,
  input: {
    index_version: string;
    source_video_ids: string[];
    created_at: string;
  }
): Promise<void> {
  const indexRoot = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index"
  );
  const versionRoot = path.join(indexRoot, input.index_version);

  await mkdir(versionRoot, { recursive: true });
  await writeFile(
    path.join(indexRoot, "current.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      current_version: input.index_version,
      updated_at: input.created_at
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(versionRoot, "index-manifest.json"),
    `${JSON.stringify({
      index_version: input.index_version,
      library_id: "lib_main_001",
      created_at: input.created_at,
      ready_video_count: input.source_video_ids.length,
      source_video_ids: input.source_video_ids,
      schema_version: "1.0"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeSourceTranscriptSqliteIndex({
    index_file_path: path.join(versionRoot, "index.sqlite"),
    library_id: "lib_main_001",
    index_version: input.index_version,
    created_at: input.created_at,
    videos: input.source_video_ids.map((sourceVideoId) => ({
      source_video_id: sourceVideoId,
      title: sourceVideoId,
      duration_ms: 4000,
      relative_path: `${sourceVideoId}.mp4`,
      cover_path: `.mixlab-library/videos/${sourceVideoId}/cover.jpg`,
      segments: []
    }))
  });
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
  assert.equal(byId(report, "preprocess-logs-writable").status, "pass");
  assert.equal(byId(report, "library-counts").status, "pass");
  assert.equal(byId(report, "source-video-manifests").status, "fail");
  assert.match(byId(report, "source-video-manifests").message, /missing-cover/);
  assert.equal(byId(report, "current-index").status, "fail");
  assert.equal(byId(report, "preprocess-logs").status, "pass");
  assert.equal(byId(report, "local-clips").status, "warn");
  assert.match(byId(report, "local-clips").message, /LC000001/);
  assert.deepEqual(byId(report, "local-clips").details, {
    error_count: 1
  });
  assert.equal(byId(report, "ffmpeg").status, "pass");
  assert.equal(byId(report, "ffprobe").status, "pass");
  assert.equal(byId(report, "asr-config").status, "pass");
  assert.deepEqual(byId(report, "asr-config").details, {
    dashscope_api_key_configured: true,
    asr_model: "paraformer-v2"
  });
  assert.equal(JSON.stringify(report).includes("sk-do-not-leak"), false);
  assert.equal(report.summary.warn >= 1, true);
  assert.equal(report.summary.fail >= 2, true);
});

test("accepts ready source video manifests from configured source folders", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceRoot = path.join(libraryRoot, "course-source");
  const sourceVideoPath = path.join(sourceRoot, "课程", "现金流.mp4");

  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeDummyVideo(sourceVideoPath);
  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: sourceRoot,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });
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
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg"),
    "cover-bytes",
    "utf8"
  );
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
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }
  });
  await publishReadySourceVideo({
    library_root: libraryRoot,
    source_video_id: "V000001",
    index_version: "v000001",
    now: "2026-05-02T00:03:00Z"
  });

  const report = await runMixlabDoctor({
    library_root: libraryRoot,
    now: "2026-05-02T08:00:00Z",
    env: {}
  });

  assert.equal(byId(report, "source-video-manifests").status, "pass");
});

test("validates current index package sqlite metadata and preprocess logs", async () => {
  const libraryRoot = await makeBrokenReadyLibrary();
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "missing-cover.jpg"),
    "cover-bytes",
    "utf8"
  );
  await writeCurrentIndexPackage(libraryRoot, {
    index_version: "v000001",
    source_video_ids: ["V000001"],
    created_at: "2026-05-02T00:03:00Z"
  });

  const report = await runMixlabDoctor({
    library_root: libraryRoot,
    now: "2026-05-02T08:00:00Z",
    env: {}
  });

  assert.equal(byId(report, "source-video-manifests").status, "pass");
  assert.equal(byId(report, "current-index").status, "pass");
  assert.deepEqual(byId(report, "current-index").details, {
    current_version: "v000001",
    ready_video_count: 1
  });
  assert.equal(byId(report, "preprocess-logs").status, "pass");
});

test("uses summary-mode doctor checks for large public libraries", async () => {
  const libraryRoot = await makeLibraryRoot();

  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await mkdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000001"), { recursive: true });
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "sample.mp4"));
  await writeTextArtifacts(libraryRoot, "V000001");
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg"),
    "cover-bytes",
    "utf8"
  );
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
    `${JSON.stringify({
      source_video_id: "V000001",
      title: "sample",
      relative_path: "sample.mp4",
      logical_uri: "library://source-video/V000001",
      duration_ms: 4000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 17,
      content_hash: "stat:size:17:mtime_ms:1",
      preprocess_status: "ready",
      visible_to_cutters: true,
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes.json",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    `${JSON.stringify({
      library_id: "lib_main_001",
      name: "主素材库",
      version: "1.0",
      updated_at: "2026-05-02T00:03:00Z",
      video_count: 1000,
      ready_video_count: 1000,
      processing_video_count: 0,
      queued_video_count: 0,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0
    }, null, 2)}\n`,
    "utf8"
  );
  await writeCurrentIndexPackage(libraryRoot, {
    index_version: "v000001",
    source_video_ids: ["V000001"],
    created_at: "2026-05-02T00:03:00Z"
  });

  const report = await runMixlabDoctor({
    library_root: libraryRoot,
    now: "2026-05-02T08:00:00Z",
    env: {}
  });

  assert.equal(byId(report, "source-video-manifests").status, "pass");
  assert.deepEqual(byId(report, "source-video-manifests").details, {
    mode: "sample",
    checked_count: 1,
    total_count: 1000,
    sample_limit: 8,
    file_existence_check: "skipped"
  });
  assert.equal(byId(report, "preprocess-logs").status, "pass");
  assert.deepEqual(byId(report, "preprocess-logs").details, {
    mode: "summary",
    log_file_count: 0,
    expected_log_count: 1000
  });
});

test("warns when lifecycle manifests are missing preprocess logs", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "ready-without-log.mp4"));
  await writeTextArtifacts(libraryRoot, "V000001");
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg"),
    "cover-bytes",
    "utf8"
  );
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
    `${JSON.stringify({
      source_video_id: "V000001",
      title: "ready-without-log",
      relative_path: "ready-without-log.mp4",
      logical_uri: "library://source-video/V000001",
      duration_ms: 4000,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "h264",
      file_size: 17,
      content_hash: "stat:size:17:mtime_ms:1",
      preprocess_status: "ready",
      visible_to_cutters: true,
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes.json",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }, null, 2)}\n`,
    "utf8"
  );

  const report = await runMixlabDoctor({
    library_root: libraryRoot,
    now: "2026-05-02T08:00:00Z",
    env: {}
  });

  assert.equal(byId(report, "preprocess-logs").status, "warn");
  assert.match(byId(report, "preprocess-logs").message, /V000001/);
  assert.deepEqual(byId(report, "preprocess-logs").details, {
    log_file_count: 0,
    expected_log_count: 1,
    error_count: 1
  });
});

test("exports doctor report as a JSON artifact under the public library", async () => {
  const libraryRoot = await makeBrokenReadyLibrary();
  const exported = await exportMixlabDoctorReport({
    library_root: libraryRoot,
    now: "2026-05-02T08:00:00Z",
    env: {
      DASHSCOPE_API_KEY: "sk-do-not-leak",
      MIXLAB_ASR_MODEL: "paraformer-v2"
    }
  });

  assert.equal(exported.file_name, "mixlab-doctor-2026-05-02T08-00-00Z.json");
  assert.equal(
    exported.relative_path,
    `.mixlab-library/exports/doctor/${exported.file_name}`
  );
  assert.equal(exported.report.generated_at, "2026-05-02T08:00:00Z");

  const exportedJson = await readFile(exported.file_path, "utf8");
  assert.equal(exportedJson.endsWith("\n"), true);
  assert.equal(exportedJson.includes("sk-do-not-leak"), false);
  assert.deepEqual(JSON.parse(exportedJson), exported.report);
});
