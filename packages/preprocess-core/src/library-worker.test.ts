import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addAdminSourceFolder, scanSourceVideos } from "../../library-fs/src/index.ts";
import { runLibraryTextPreprocessWorker } from "./library-worker.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-library-worker-${Date.now()}-`), {
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

function deterministicNow(): () => string {
  let index = 0;

  return () => `2026-05-02T00:${String(index++).padStart(2, "0")}:00Z`;
}

test("scans, claims and completes one text preprocessed source video as index-required", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "课程", "a.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "课程", "b.mp4"));

  const result = await runLibraryTextPreprocessWorker({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    worker_id: "worker-a",
    limit: 1,
    audio_mode: "mp3_16k_mono_64k",
    now: deterministicNow(),
    async probe_source_video(input) {
      assert.equal(input.source_video_id, "V000001");
      assert.equal(path.basename(input.source_video_path), "a.mp4");

      return {
        duration_ms: 4_000,
        width: 1280,
        height: 720,
        fps: 25,
        codec: "h264"
      };
    },
    async get_content_hash(sourceVideoPath) {
      return `sha256:${path.basename(sourceVideoPath)}`;
    },
    async preprocess_source_video(input) {
      assert.equal(input.source_video_id, "V000001");
      assert.equal(input.audio_mode, "mp3_16k_mono_64k");

      return {
        source_video_id: input.source_video_id,
        audio_path: ".mixlab-library/videos/V000001/asr-audio/audio.mp3",
        audio_object_key: "temporary/V000001/audio.mp3",
        audio_file_url: "oss://temporary/V000001/audio.mp3",
        asr_task_id: "task-v000001",
        transcription_url: "https://example.com/V000001.json",
        transcript_path: ".mixlab-library/videos/V000001/transcript.json",
        srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
        duration_ms: 4_000,
        segment_count: 1
      };
    }
  });

  assert.equal(result.scan_result.total_video_count, 2);
  assert.equal(result.total_claimed_count, 1);
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.failed_count, 0);
  assert.equal(result.items[0]?.status, "succeeded");

  const firstManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const secondManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );

  assert.equal(firstManifest.preprocess_status, "index-required");
  assert.equal(firstManifest.visible_to_cutters, false);
  assert.equal(firstManifest.content_hash, "sha256:a.mp4");
  assert.equal(firstManifest.cover_path, "");
  assert.equal(secondManifest.preprocess_status, "unprocessed");
  assert.equal(library.index_required_video_count, 1);
  assert.equal(library.unprocessed_video_count, 1);
});

test("writes live preprocess stages while a worker handles a claimed video", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "a.mp4"));

  const result = await runLibraryTextPreprocessWorker({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    worker_id: "worker-a",
    limit: 1,
    now: deterministicNow(),
    async probe_source_video() {
      const job = await readJson<Record<string, unknown>>(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
      );

      assert.equal(job.current_stage, "probe-media");

      return {
        duration_ms: 4_000,
        width: 1280,
        height: 720,
        fps: 25,
        codec: "h264"
      };
    },
    async get_content_hash(sourceVideoPath) {
      return `sha256:${path.basename(sourceVideoPath)}`;
    },
    async preprocess_source_video(input) {
      await input.on_stage?.("extract-audio");
      const extractJob = await readJson<Record<string, unknown>>(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
      );
      assert.equal(extractJob.current_stage, "extract-audio");

      await input.on_stage?.("asr");
      const asrJob = await readJson<Record<string, unknown>>(
        path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "preprocess-job.json")
      );
      assert.equal(asrJob.current_stage, "asr");

      return {
        source_video_id: input.source_video_id,
        audio_path: ".mixlab-library/videos/V000001/asr-audio/audio.mp3",
        audio_object_key: "temporary/V000001/audio.mp3",
        audio_file_url: "oss://temporary/V000001/audio.mp3",
        asr_task_id: "task-v000001",
        transcription_url: "https://example.com/V000001.json",
        transcript_path: ".mixlab-library/videos/V000001/transcript.json",
        srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
        duration_ms: 4_000,
        segment_count: 1
      };
    }
  });

  assert.equal(result.succeeded_count, 1);
  assert.equal(result.failed_count, 0);
});

test("marks failed videos and continues processing later claimed videos", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "b.mp4"));

  const result = await runLibraryTextPreprocessWorker({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    worker_id: "worker-a",
    limit: 2,
    now: deterministicNow(),
    async probe_source_video() {
      return {
        duration_ms: 4_000,
        width: 1280,
        height: 720,
        fps: 25,
        codec: "h264"
      };
    },
    async get_content_hash(sourceVideoPath) {
      return `sha256:${path.basename(sourceVideoPath)}`;
    },
    async preprocess_source_video(input) {
      if (input.source_video_id === "V000001") {
        throw new Error("DashScope task failed");
      }

      return {
        source_video_id: input.source_video_id,
        audio_path: ".mixlab-library/videos/V000002/asr-audio/audio.mp3",
        audio_object_key: "temporary/V000002/audio.mp3",
        audio_file_url: "oss://temporary/V000002/audio.mp3",
        asr_task_id: "task-v000002",
        transcription_url: "https://example.com/V000002.json",
        transcript_path: ".mixlab-library/videos/V000002/transcript.json",
        srt_path: ".mixlab-library/videos/V000002/subtitles.srt",
        duration_ms: 4_000,
        segment_count: 1
      };
    }
  });

  assert.deepEqual(
    result.items.map((item) => ({
      source_video_id: item.source_video_id,
      status: item.status
    })),
    [
      {
        source_video_id: "V000001",
        status: "failed"
      },
      {
        source_video_id: "V000002",
        status: "succeeded"
      }
    ]
  );
  assert.equal(result.succeeded_count, 1);
  assert.equal(result.failed_count, 1);

  const failedManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const succeededManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );

  assert.equal(failedManifest.preprocess_status, "failed");
  assert.equal(failedManifest.visible_to_cutters, false);
  assert.equal(succeededManifest.preprocess_status, "index-required");
  assert.equal(library.failed_video_count, 1);
  assert.equal(library.processing_video_count, 0);
  assert.equal(library.index_required_video_count, 1);
});

test("can skip scanning and only consume queued videos for pipeline cycles", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyVideo(path.join(libraryRoot, "source-videos", "b.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const firstManifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "source-video.json"
  );
  const firstManifest = await readJson<Record<string, unknown>>(firstManifestPath);
  await writeFile(
    firstManifestPath,
    `${JSON.stringify({ ...firstManifest, preprocess_status: "queued" }, null, 2)}\n`
  );

  const result = await runLibraryTextPreprocessWorker({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    worker_id: "worker-a",
    limit: 2,
    scan_before_claim: false,
    claim_statuses: ["queued"],
    now: deterministicNow(),
    async probe_source_video(input) {
      assert.equal(input.source_video_id, "V000001");
      return {
        duration_ms: 4_000,
        width: 1280,
        height: 720,
        fps: 25,
        codec: "h264"
      };
    },
    async get_content_hash(sourceVideoPath) {
      return `sha256:${path.basename(sourceVideoPath)}`;
    },
    async preprocess_source_video(input) {
      return {
        source_video_id: input.source_video_id,
        audio_path: ".mixlab-library/videos/V000001/asr-audio/audio.mp3",
        audio_object_key: "temporary/V000001/audio.mp3",
        audio_file_url: "oss://temporary/V000001/audio.mp3",
        asr_task_id: "task-v000001",
        transcription_url: "https://example.com/V000001.json",
        transcript_path: ".mixlab-library/videos/V000001/transcript.json",
        srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
        duration_ms: 4_000,
        segment_count: 1
      };
    }
  });

  assert.equal(result.scan_result.total_video_count, 2);
  assert.equal(result.scan_result.new_video_count, 0);
  assert.deepEqual(result.items.map((item) => item.source_video_id), ["V000001"]);

  const secondManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  assert.equal(secondManifest.preprocess_status, "unprocessed");
});

test("preprocesses non-default configured source folder files by physical path", async () => {
  const libraryRoot = await makeLibraryRoot();
  const courseSource = path.join(libraryRoot, "course-source");
  const sourceVideoPath = path.join(courseSource, "课程", "现金流.mp4");

  await writeDummyVideo(sourceVideoPath);
  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: courseSource,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  const result = await runLibraryTextPreprocessWorker({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    worker_id: "worker-a",
    limit: 1,
    now: deterministicNow(),
    async probe_source_video(input) {
      assert.equal(input.source_video_path, sourceVideoPath);

      return {
        duration_ms: 4_000,
        width: 1280,
        height: 720,
        fps: 25,
        codec: "h264"
      };
    },
    async get_content_hash(sourceVideoPathInput) {
      assert.equal(sourceVideoPathInput, sourceVideoPath);
      return "sha256:external";
    },
    async preprocess_source_video(input) {
      assert.equal(input.source_video_path, sourceVideoPath);

      return {
        source_video_id: input.source_video_id,
        audio_path: ".mixlab-library/videos/V000001/asr-audio/audio.mp3",
        audio_object_key: "temporary/V000001/audio.mp3",
        audio_file_url: "oss://temporary/V000001/audio.mp3",
        asr_task_id: "task-v000001",
        transcription_url: "https://example.com/V000001.json",
        transcript_path: ".mixlab-library/videos/V000001/transcript.json",
        srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
        duration_ms: 4_000,
        segment_count: 1
      };
    }
  });

  assert.equal(result.items[0]?.source_video_path, sourceVideoPath);
  assert.equal(result.succeeded_count, 1);
});
