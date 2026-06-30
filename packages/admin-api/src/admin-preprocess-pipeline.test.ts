import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createRealPreprocessRunner,
  resolveAdminControlledPreprocessPolicy,
  runAdminPreprocessPipeline
} from "./admin-preprocess-pipeline.ts";
import {
  readAdminOperationLog
} from "./admin-operation-log.ts";
import {
  writeAdminLibraryManifest
} from "./admin-library-commands.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-preprocess-pipeline-"));
}

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.source_video_id,
    relative_path: `source-videos/${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: "",
    description: "测试视频",
    tags: ["测试"],
    lecturer: "测试讲师",
    course: "测试课程",
    category: "测试分类"
  };
}

async function writeSourceVideoManifest(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<void> {
  const targetPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    manifest.source_video_id,
    "source-video.json"
  );
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function artifactPath(sourceVideoId: string, fileName: string): string {
  return `.mixlab-library/videos/${sourceVideoId}/${fileName}`;
}

async function writeTextArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const videoRoot = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
  await mkdir(videoRoot, { recursive: true });
  await writeFile(path.join(videoRoot, "transcript.json"), JSON.stringify({
    schema_version: "1.0",
    source_video_id: sourceVideoId,
    full_text: `${sourceVideoId} 文案`,
    duration_ms: 4_000,
    segments: [{
      segment_id: `${sourceVideoId}-S000001`,
      index: 0,
      begin_ms: 0,
      end_ms: 4_000,
      text: `${sourceVideoId} 文案`,
      normalized_text: `${sourceVideoId}文案`
    }]
  }), "utf8");
  await writeFile(
    path.join(videoRoot, "subtitles.srt"),
    `1\n00:00:00,000 --> 00:00:04,000\n${sourceVideoId} 文案\n`,
    "utf8"
  );
}

async function writeVisualArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const videoRoot = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
  await mkdir(videoRoot, { recursive: true });
  await writeFile(path.join(videoRoot, "cover.jpg"), "cover", "utf8");
  await writeFile(path.join(videoRoot, "keyframes.json"), JSON.stringify({
    source_video_id: sourceVideoId,
    keyframes_ms: [0, 4_000]
  }), "utf8");
}

test("real preprocess runner blocks startup before resolving ffmpeg/asr when DashScope key is missing", async () => {
  const runner = createRealPreprocessRunner({
    library_root: "/tmp/mixlab-admin-preprocess-pipeline-missing-key",
    library_id: "lib_main_001",
    library_name: "测试素材库",
    env: {},
    now: () => "2026-05-02T12:00:00.000Z",
    media: {
      async create_cover() {
        throw new Error("unexpected cover generation");
      }
    }
  });

  await assert.rejects(
    () => runner.runOnce({
      runtime_policy: {
        audio_mode: "mp3_16k_mono_64k",
        concurrent_jobs: 1,
        auto_scan_enabled: false,
        auto_queue_enabled: false,
        auto_publish_index_enabled: false
      }
    }),
    /语音识别接口密钥未配置/
  );
});

test("preprocess pipeline preserves scan/cache and worker-cycle contract from extracted module", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "a.mp4"), "video-a");
  let cacheClearRoot = "";
  let workerCycleCount = 0;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 2,
      auto_scan_enabled: true,
      auto_queue_enabled: false,
      auto_publish_index_enabled: false
    },
    now: () => "2026-05-02T12:00:00.000Z",
    media: {
      async create_cover() {
        throw new Error("unexpected cover generation");
      }
    },
    clear_source_video_page_cache(libraryRootToClear) {
      cacheClearRoot = libraryRootToClear;
    },
    async run_worker_cycle(workerInput) {
      workerCycleCount += 1;
      assert.equal(workerInput.library_root, libraryRoot);
      assert.equal(workerInput.library_id, "lib_main_001");
      assert.equal(workerInput.library_name, "测试素材库");
      assert.equal(workerInput.limit, 2);
      assert.equal(workerInput.audio_mode, "mp3_16k_mono_64k");
      assert.equal(workerInput.scan_before_claim, false);
      assert.deepEqual(workerInput.claim_statuses, ["queued"]);

      return {
        scan_result: {
          total_video_count: 0,
          new_video_count: 0,
          existing_video_count: 0,
          source_video_ids: []
        },
        total_claimed_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        items: []
      };
    }
  });

  assert.equal(result.scan_result.total_video_count, 1);
  assert.equal(result.scan_result.new_video_count, 1);
  assert.equal(result.total_claimed_count, 0);
  assert.equal(result.published_count, 0);
  assert.equal(workerCycleCount, 1);
  assert.equal(cacheClearRoot, libraryRoot);
});

test("preprocess pipeline treats explicit limit as total claimed count for the run", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  const workerLimits: number[] = [];

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    limit: 3,
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 2,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: false
    },
    now: () => "2026-05-02T12:30:00.000Z",
    media: {
      async create_cover() {
        throw new Error("unexpected cover generation");
      }
    },
    async run_worker_cycle(workerInput) {
      const claimedCount = workerInput.limit ?? 0;
      workerLimits.push(claimedCount);
      return {
        scan_result: {
          total_video_count: 0,
          new_video_count: 0,
          existing_video_count: 0,
          source_video_ids: []
        },
        total_claimed_count: claimedCount,
        succeeded_count: claimedCount,
        failed_count: 0,
        items: []
      };
    }
  });

  assert.deepEqual(workerLimits, [2, 1]);
  assert.equal(result.total_claimed_count, 3);
  assert.equal(result.succeeded_count, 3);
});

test("controlled preprocess policy disables scan but keeps scoped auto publish in docker mvp mode", () => {
  const result = resolveAdminControlledPreprocessPolicy({
    docker_mvp_mode: "v0.1",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 2,
      auto_scan_enabled: true,
      auto_queue_enabled: true,
      auto_publish_index_enabled: true
    }
  });

  assert.equal(result.docker_mvp_mode, "v0.1");
  assert.deepEqual(result.disabled_actions, ["auto-scan"]);
  assert.deepEqual(result.runtime_policy, {
    audio_mode: "mp3_16k_mono_64k",
    concurrent_jobs: 2,
    auto_scan_enabled: false,
    auto_queue_enabled: true,
    auto_publish_index_enabled: true
  });
});

test("docker mvp preprocess pipeline queues existing manifests without scan", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  await writeFile(path.join(libraryRoot, "source-videos", "V000001.mp4"), "video-a");
  await writeFile(path.join(libraryRoot, "source-videos", "new-file-that-must-not-scan.mp4"), "video-new");
  await writeSourceVideoManifest(libraryRoot, sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed"
  }));
  let workerCycleCount = 0;

  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    docker_mvp_mode: "v0.1",
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: true,
      auto_queue_enabled: true,
      auto_publish_index_enabled: true
    },
    now: () => "2026-06-27T00:00:00.000Z",
    media: {
      async create_cover() {
        throw new Error("docker mvp must not auto publish");
      }
    },
    async run_worker_cycle(workerInput) {
      workerCycleCount += 1;
      assert.equal(workerInput.scan_before_claim, false);
      assert.deepEqual(workerInput.claim_statuses, ["queued"]);

      return {
        scan_result: {
          total_video_count: 1,
          new_video_count: 0,
          existing_video_count: 1,
          source_video_ids: ["V000001"]
        },
        total_claimed_count: 0,
        succeeded_count: 0,
        failed_count: 0,
        items: []
      };
    }
  });

  assert.deepEqual(result.controlled_policy.disabled_actions, ["auto-scan"]);
  assert.deepEqual(result.scan_result.source_video_ids, ["V000001"]);
  assert.equal(result.scan_result.new_video_count, 0);
  assert.equal(result.published_count, 0);
  assert.deepEqual(result.published_source_video_ids, []);
  assert.equal(workerCycleCount, 1);
  await assert.rejects(
    () => readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"), "utf8"),
    /ENOENT/
  );

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-27T00:00:01.000Z",
    limit: 20
  });
  const succeededActions = log.events
    .filter((event) => event.event_type === "succeeded")
    .map((event) => event.action);
  assert.deepEqual(succeededActions, ["preprocess-queue-unprocessed-pipeline"]);
});

test("scoped auto publish only releases source videos succeeded in the current pipeline run", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });

  const historical = {
    ...sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "index-required"
    }),
    relative_path: "V000001.mp4",
    transcript_path: artifactPath("V000001", "transcript.json"),
    srt_path: artifactPath("V000001", "subtitles.srt"),
    cover_path: artifactPath("V000001", "cover.jpg"),
    keyframes_path: artifactPath("V000001", "keyframes.json")
  };
  const current = {
    ...sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "index-required"
    }),
    relative_path: "V000002.mp4",
    transcript_path: artifactPath("V000002", "transcript.json"),
    srt_path: artifactPath("V000002", "subtitles.srt")
  };

  for (const manifest of [historical, current]) {
    await writeFile(path.join(libraryRoot, "source-videos", manifest.relative_path), "video", "utf8");
    await writeTextArtifacts(libraryRoot, manifest.source_video_id);
    await writeSourceVideoManifest(libraryRoot, manifest);
  }
  await writeVisualArtifacts(libraryRoot, "V000001");
  await writeAdminLibraryManifest({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    now: "2026-06-27T00:00:00.000Z"
  });

  const createdCovers: string[] = [];
  const result = await runAdminPreprocessPipeline({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "测试素材库",
    docker_mvp_mode: "v0.1",
    limit: 1,
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    now: () => "2026-06-27T00:01:00.000Z",
    media: {
      async create_cover(input) {
        createdCovers.push(input.output_path);
        await mkdir(path.dirname(input.output_path), { recursive: true });
        await writeFile(input.output_path, "cover", "utf8");
      }
    },
    async run_worker_cycle() {
      return {
        scan_result: {
          total_video_count: 2,
          new_video_count: 0,
          existing_video_count: 2,
          source_video_ids: ["V000001", "V000002"]
        },
        total_claimed_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        items: [{
          status: "succeeded",
          source_video_id: "V000002",
          source_video_path: path.join(libraryRoot, "source-videos", "V000002.mp4"),
          result: {
            source_video_id: "V000002",
            audio_path: artifactPath("V000002", "asr-audio/audio.mp3"),
            audio_object_key: "temporary/V000002/audio.mp3",
            audio_file_url: "oss://temporary/V000002/audio.mp3",
            asr_task_id: "task-V000002",
            transcription_url: "https://example.com/V000002.json",
            transcript_path: artifactPath("V000002", "transcript.json"),
            srt_path: artifactPath("V000002", "subtitles.srt"),
            duration_ms: 4_000,
            segment_count: 1
          }
        }]
      };
    }
  });

  assert.equal(result.published_count, 1);
  assert.deepEqual(result.published_source_video_ids, ["V000002"]);
  assert.equal(createdCovers.length, 1);

  const historicalAfter = JSON.parse(
    await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"), "utf8")
  ) as SourceVideoManifest;
  const currentAfter = JSON.parse(
    await readFile(path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"), "utf8")
  ) as SourceVideoManifest;

  assert.equal(historicalAfter.preprocess_status, "index-required");
  assert.equal(historicalAfter.visible_to_cutters, false);
  assert.equal(currentAfter.preprocess_status, "ready");
  assert.equal(currentAfter.visible_to_cutters, true);
});
