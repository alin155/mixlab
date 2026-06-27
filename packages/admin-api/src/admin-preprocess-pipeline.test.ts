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

test("controlled preprocess policy disables scan and publish in docker mvp mode", () => {
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
  assert.deepEqual(result.disabled_actions, ["auto-scan", "auto-publish-index"]);
  assert.deepEqual(result.runtime_policy, {
    audio_mode: "mp3_16k_mono_64k",
    concurrent_jobs: 2,
    auto_scan_enabled: false,
    auto_queue_enabled: true,
    auto_publish_index_enabled: false
  });
});

test("docker mvp preprocess pipeline queues existing manifests without scan or auto publish", async () => {
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

  assert.deepEqual(result.controlled_policy.disabled_actions, ["auto-scan", "auto-publish-index"]);
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
