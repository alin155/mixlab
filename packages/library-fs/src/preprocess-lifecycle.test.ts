import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  completeReadyVisualArtifacts,
  failPreprocessJob,
  preprocessJobLogPath,
  publishReadySourceVideo,
  readPreprocessJobLog,
  refreshLibraryCounts,
  scanSourceVideos,
  updatePreprocessJobStage
} from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-preprocess-${Date.now()}-`), {
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

async function makeScannedLibrary(): Promise<string> {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyVideo(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "b.mp4"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  return libraryRoot;
}

test("claims unprocessed source videos as invisible processing jobs", async () => {
  const libraryRoot = await makeScannedLibrary();

  const firstJob = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z"
  });
  const secondJob = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:02:00Z"
  });

  assert.deepEqual(firstJob, {
    source_video_id: "V000001",
    worker_id: "worker-a",
    status: "processing",
    attempt: 1,
    claimed_at: "2026-05-01T00:01:00Z"
  });
  assert.equal(secondJob?.source_video_id, "V000002");

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const job = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
  );

  assert.equal(manifest.preprocess_status, "processing");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(job.worker_id, "worker-a");
  assert.equal(job.attempt, 1);

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.equal(log.path, preprocessJobLogPath("V000001"));
  assert.equal(log.exists, true);
  assert.match(log.content, /2026-05-01T00:01:00Z\tV000001\tprocessing\tworker worker-a claimed attempt 1/);
});

test("updates a claimed preprocessing job with the current live stage", async () => {
  const libraryRoot = await makeScannedLibrary();

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z"
  });

  await updatePreprocessJobStage({
    library_root: libraryRoot,
    source_video_id: "V000001",
    stage: "extract-audio",
    now: "2026-05-01T00:02:00Z"
  });

  const job = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
  );

  assert.equal(job.status, "processing");
  assert.equal(job.worker_id, "worker-a");
  assert.equal(job.claimed_at, "2026-05-01T00:01:00Z");
  assert.equal(job.current_stage, "extract-audio");
  assert.equal(job.stage_updated_at, "2026-05-01T00:02:00Z");

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /processing\tworker worker-a claimed attempt 1/);
  assert.match(log.content, /extract-audio\tstage changed to extract-audio/);
});

test("builds an auditable task record snapshot when the physical preprocess log is missing", async () => {
  const libraryRoot = await makeScannedLibrary();
  const videoRoot = path.join(libraryRoot, ".mixlab-library", "videos", "V000001");
  const manifestPath = path.join(videoRoot, "source-video.json");
  const manifest = await readJson<Record<string, unknown>>(manifestPath);

  await writeFile(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      title: "历史任务",
      preprocess_status: "processing",
      visible_to_cutters: false
    }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(videoRoot, "preprocess-job.json"),
    `${JSON.stringify({
      source_video_id: "V000001",
      worker_id: "worker-a",
      status: "processing",
      attempt: 2,
      claimed_at: "2026-05-01T00:01:00Z",
      current_stage: "asr",
      stage_updated_at: "2026-05-01T00:03:00Z",
      error_message: "callback https://example.com/result.json?Signature=secret&security-token=secret Bearer token-value"
    }, null, 2)}\n`,
    "utf8"
  );

  const log = await readPreprocessJobLog(libraryRoot, "V000001");

  assert.equal(log.path, preprocessJobLogPath("V000001"));
  assert.equal(log.exists, false);
  assert.equal(log.record_source, "preprocess-job");
  assert.match(log.content, /MixLab preprocess task record snapshot/);
  assert.match(log.content, /title: 历史任务/);
  assert.match(log.content, /manifest_status: processing/);
  assert.match(log.content, /worker_id: worker-a/);
  assert.match(log.content, /current_stage: asr/);
  assert.equal(log.content.includes("Signature=secret"), false);
  assert.equal(log.content.includes("security-token=secret"), false);
  assert.equal(log.content.includes("https://example.com"), false);
  assert.equal(log.content.includes("Bearer token-value"), false);
});

test("claims queued source videos before unprocessed source videos", async () => {
  const libraryRoot = await makeScannedLibrary();
  const queuedManifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000002",
    "source-video.json"
  );
  const queuedManifest = await readJson<Record<string, unknown>>(queuedManifestPath);

  await writeFile(
    queuedManifestPath,
    `${JSON.stringify({ ...queuedManifest, preprocess_status: "queued" }, null, 2)}\n`
  );

  const job = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z"
  });
  const firstManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const secondManifest = await readJson<Record<string, unknown>>(queuedManifestPath);

  assert.equal(job?.source_video_id, "V000002");
  assert.equal(firstManifest.preprocess_status, "unprocessed");
  assert.equal(secondManifest.preprocess_status, "processing");
});

test("queued-only claiming does not claim unprocessed source videos", async () => {
  const libraryRoot = await makeScannedLibrary();

  const noQueuedJob = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z",
    claim_statuses: ["queued"]
  });
  assert.equal(noQueuedJob, null);

  const queuedManifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000002",
    "source-video.json"
  );
  const queuedManifest = await readJson<Record<string, unknown>>(queuedManifestPath);
  await writeFile(
    queuedManifestPath,
    `${JSON.stringify({ ...queuedManifest, preprocess_status: "queued" }, null, 2)}\n`
  );

  const queuedJob = await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:02:00Z",
    claim_statuses: ["queued"]
  });
  const firstManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );

  assert.equal(queuedJob?.source_video_id, "V000002");
  assert.equal(firstManifest.preprocess_status, "unprocessed");
});

test("completed preprocessing becomes index-required and remains hidden from cutters", async () => {
  const libraryRoot = await makeScannedLibrary();

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

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );

  assert.equal(manifest.preprocess_status, "index-required");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(manifest.duration_ms, 123_000);
  assert.equal(manifest.transcript_path, ".mixlab-library/videos/V000001/transcript.json");
  assert.equal(library.processing_video_count, 0);
  assert.equal(library.index_required_video_count, 1);
  assert.equal(library.ready_video_count, 0);

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /build-index\ttext preprocess artifacts completed/);
});

test("can defer library count refresh while preparing batch preprocessing artifacts", async () => {
  const libraryRoot = await makeScannedLibrary();

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z",
    refresh_library_counts: false
  });
  await completePreprocessArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-05-01T00:10:00Z",
    refresh_library_counts: false,
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

  const staleLibrary = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  assert.equal(staleLibrary.unprocessed_video_count, 2);
  assert.equal(staleLibrary.index_required_video_count, 0);

  await refreshLibraryCounts(libraryRoot, "2026-05-01T00:11:00Z");
  const refreshedLibrary = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );

  assert.equal(refreshedLibrary.unprocessed_video_count, 1);
  assert.equal(refreshedLibrary.processing_video_count, 0);
  assert.equal(refreshedLibrary.index_required_video_count, 1);
});

test("text-only preprocessing can become index-required before cover and keyframes exist", async () => {
  const libraryRoot = await makeScannedLibrary();

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
      keyframes_path: "",
      cover_path: ""
    }
  });

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );

  assert.equal(manifest.preprocess_status, "index-required");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(manifest.cover_path, "");
  assert.equal(manifest.keyframes_path, "");

  await completeReadyVisualArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-05-01T00:12:00Z",
    cover_path: ".mixlab-library/videos/V000001/cover.jpg",
    keyframes_ms: [0, 60_000]
  });

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /build-index\ttext preprocess artifacts completed/);
  assert.match(log.content, /build-keyframes\tready visual artifacts completed/);
});

test("failed preprocessing becomes hidden failed source video and refreshes counts", async () => {
  const libraryRoot = await makeScannedLibrary();

  await claimNextPreprocessJob({
    library_root: libraryRoot,
    worker_id: "worker-a",
    now: "2026-05-01T00:01:00Z"
  });

  await failPreprocessJob({
    library_root: libraryRoot,
    source_video_id: "V000001",
    now: "2026-05-01T00:03:00Z",
    error_stage: "asr",
    error_message: "DashScope task failed"
  });

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  const job = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
  );

  assert.equal(manifest.preprocess_status, "failed");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(library.processing_video_count, 0);
  assert.equal(library.failed_video_count, 1);
  assert.equal(job.status, "failed");
  assert.equal(job.error_stage, "asr");
  assert.equal(job.error_message, "DashScope task failed");
  assert.equal(job.failed_at, "2026-05-01T00:03:00Z");

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /asr\tfailed: DashScope task failed/);
});

test("publishes indexed videos as cutter-visible ready source videos", async () => {
  const libraryRoot = await makeScannedLibrary();

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

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  const job = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
  );

  assert.equal(manifest.preprocess_status, "ready");
  assert.equal(manifest.visible_to_cutters, true);
  assert.equal(library.index_required_video_count, 0);
  assert.equal(library.ready_video_count, 1);
  assert.equal(job.index_version, "v000001");

  const log = await readPreprocessJobLog(libraryRoot, "V000001");
  assert.match(log.content, /publish-ready\tpublished to index v000001/);
});
