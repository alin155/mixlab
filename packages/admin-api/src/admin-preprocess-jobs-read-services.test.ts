import assert from "node:assert/strict";
import test from "node:test";
import type { AdminSettings } from "../../library-fs/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { createAdminPreprocessJobsReadServices } from "./admin-preprocess-jobs-read-services.ts";
import type {
  AdminPreprocessJobRecord,
  AdminPreprocessJobsRuntimeLoad
} from "./admin-preprocess-jobs-query.ts";

interface TestApiInput {
  library_root: string;
  now?: () => string;
  request_id: string;
}

function settings(concurrentJobs: number): AdminSettings {
  return {
    schema_version: "1.0",
    library_name: "测试素材库",
    updated_at: "2026-06-27T05:10:00.000Z",
    source_folders: [],
    artifact_library: {
      mode: "default",
      path: "/tmp/test-library/.mixlab-library",
      migration_required: false
    },
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: concurrentJobs,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: false
    }
  };
}

function manifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: `素材 ${input.source_video_id}`,
    relative_path: `${input.source_video_id}.mp4`,
    logical_uri: `mixlab://source-videos/${input.source_video_id}`,
    duration_ms: 120_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `sha256:${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  };
}

function healthyRuntimeLoad(): AdminPreprocessJobsRuntimeLoad {
  return {
    overall_status: "healthy",
    disk: { status: "healthy" },
    network: { status: "healthy" },
    cpu: { status: "healthy" },
    memory: { status: "healthy" }
  };
}

test("preprocess jobs read services assemble paged read-model reads", async () => {
  const events: string[] = [];
  const services = createAdminPreprocessJobsReadServices<TestApiInput>({
    async read_admin_settings(libraryRoot) {
      events.push(`settings:${libraryRoot}`);
      return settings(3);
    },
    async read_library_manifest(libraryRoot) {
      events.push(`library:${libraryRoot}`);
      return {
        video_count: 2,
        ready_video_count: 1,
        processing_video_count: 1,
        queued_video_count: 0,
        unprocessed_video_count: 0,
        failed_video_count: 0,
        index_required_video_count: 0
      };
    },
    async read_preprocess_job_manifest_page(input) {
      events.push(`page:${input.library_root}:${input.offset}:${input.limit}`);
      return {
        manifests: [
          manifest({ source_video_id: "V000001", preprocess_status: "processing" }),
          manifest({ source_video_id: "V000002", preprocess_status: "ready" })
        ],
        preprocess_jobs: [{
          source_video_id: "V000002",
          claimed_at: "2026-06-27T05:00:00.000Z",
          completed_at: "2026-06-27T05:01:00.000Z",
          indexed_at: "2026-06-27T05:02:00.000Z"
        }],
        actual_data_source: "admin-read-model",
        cache_status: "hit"
      };
    },
    async read_all_source_video_manifests() {
      throw new Error("paged read-model service should not fall back to all manifests");
    },
    async read_preprocess_job(libraryRoot, sourceVideoId): Promise<AdminPreprocessJobRecord | null> {
      events.push(`job:${libraryRoot}:${sourceVideoId}`);
      return {
        source_video_id: sourceVideoId,
        status: "processing",
        attempt: 1,
        claimed_at: "2026-06-27T05:03:00.000Z",
        current_stage: "asr"
      };
    },
    async read_runtime_load(input) {
      events.push(`runtime:${input.request_id}:${input.library_root}`);
      return healthyRuntimeLoad();
    }
  });

  const result = await services.read_preprocess_jobs_with_runtime_meta({
    library_root: "/tmp/PublicLibrary",
    request_id: "req-r206",
    now: () => "2026-06-27T05:10:00.000Z"
  }, {
    limit: 2,
    offset: 8
  });

  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.deepEqual(result.jobs.jobs.map((job) => [job.source_video_id, job.status]), [
    ["V000001", "running"],
    ["V000002", "done"]
  ]);
  assert.deepEqual(events, [
    "settings:/tmp/PublicLibrary",
    "library:/tmp/PublicLibrary",
    "page:/tmp/PublicLibrary:8:2",
    "job:/tmp/PublicLibrary:V000001",
    "runtime:req-r206:/tmp/PublicLibrary"
  ]);
});

test("preprocess jobs read services preserve unpaged manifest fallback", async () => {
  const events: string[] = [];
  const services = createAdminPreprocessJobsReadServices<TestApiInput>({
    async read_admin_settings(libraryRoot) {
      events.push(`settings:${libraryRoot}`);
      return settings(1);
    },
    async read_library_manifest() {
      throw new Error("unpaged fallback should not require library counts");
    },
    async read_preprocess_job_manifest_page() {
      throw new Error("unpaged fallback should not read the read-model page");
    },
    async read_all_source_video_manifests(libraryRoot) {
      events.push(`manifests:${libraryRoot}`);
      return [
        manifest({ source_video_id: "V000003", preprocess_status: "queued" })
      ];
    },
    async read_preprocess_job(): Promise<AdminPreprocessJobRecord | null> {
      throw new Error("queued manifest should not need a physical job record");
    },
    async read_runtime_load(input) {
      events.push(`runtime:${input.request_id}:${input.library_root}`);
      return healthyRuntimeLoad();
    }
  });

  const result = await services.read_preprocess_jobs_with_runtime_meta({
    library_root: "/tmp/PublicLibrary",
    request_id: "req-fallback",
    now: () => "2026-06-27T05:20:00.000Z"
  });

  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "unknown");
  assert.deepEqual(result.jobs.jobs.map((job) => [job.source_video_id, job.status]), [
    ["V000003", "queued"]
  ]);
  assert.deepEqual(events, [
    "settings:/tmp/PublicLibrary",
    "manifests:/tmp/PublicLibrary",
    "runtime:req-fallback:/tmp/PublicLibrary"
  ]);
});
