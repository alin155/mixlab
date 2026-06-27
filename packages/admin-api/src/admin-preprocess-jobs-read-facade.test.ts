import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  listAdminPreprocessJobsWithRuntimeMeta
} from "./admin-preprocess-jobs-read-facade.ts";
import type {
  AdminPreprocessJobRecord,
  AdminPreprocessJobsRuntimeLoad
} from "./admin-preprocess-jobs-query.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
  duration_ms?: number;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: `素材 ${input.source_video_id}`,
    relative_path: `${input.source_video_id}.mp4`,
    logical_uri: `mixlab://source-videos/${input.source_video_id}`,
    duration_ms: input.duration_ms ?? 120_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `sha256:${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: `transcripts/${input.source_video_id}.json`,
    srt_path: `subtitles/${input.source_video_id}.srt`,
    keyframes_path: `keyframes/${input.source_video_id}`,
    cover_path: `covers/${input.source_video_id}.jpg`
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

test("preprocess jobs facade reads paged read-model data with ready job snapshots", async () => {
  const events: string[] = [];
  const result = await listAdminPreprocessJobsWithRuntimeMeta({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      now: () => "2026-06-27T00:10:00.000Z"
    },
    options: {
      limit: 2,
      offset: 4
    },
    deps: {
      async read_concurrent_job_count(libraryRoot) {
        events.push(`concurrency:${libraryRoot}`);
        return 2;
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
            sourceVideoManifest({ source_video_id: "V000001", preprocess_status: "processing" }),
            sourceVideoManifest({ source_video_id: "V000002", preprocess_status: "ready" })
          ],
          preprocess_jobs: [{
            source_video_id: "V000002",
            status: "ready",
            attempt: 1,
            claimed_at: "2026-06-27T00:01:00.000Z",
            completed_at: "2026-06-27T00:05:00.000Z",
            indexed_at: "2026-06-27T00:06:00.000Z"
          }],
          actual_data_source: "admin-read-model",
          cache_status: "hit"
        };
      },
      async read_all_source_video_manifests() {
        throw new Error("manifest fallback should not run for paged read-model requests");
      },
      async read_preprocess_job(libraryRoot, sourceVideoId) {
        events.push(`job:${libraryRoot}:${sourceVideoId}`);
        return {
          source_video_id: sourceVideoId,
          status: "processing",
          attempt: 2,
          claimed_at: "2026-06-27T00:09:00.000Z",
          current_stage: "asr"
        };
      },
      async read_runtime_load(input) {
        events.push(`runtime:${input.library_root}`);
        return healthyRuntimeLoad();
      }
    }
  });

  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.deepEqual(result.jobs.jobs.map((job) => [job.source_video_id, job.status]), [
    ["V000001", "running"],
    ["V000002", "done"]
  ]);
  assert.equal(result.jobs.jobs[1]?.completed_at, "2026-06-27T00:05:00.000Z");
  assert.deepEqual(result.component_timings.map((component) => component.name), [
    "concurrency_policy",
    "library_counts",
    "preprocess_job_page",
    "job_record_supplement",
    "runtime_load"
  ]);
  assert.equal(result.component_timings[2]?.data_source, "admin-read-model");
  assert.equal(result.component_timings[2]?.scan_mode, "paged-list");
  assert.equal(result.component_timings[2]?.cache_status, "hit");
  assert.match(result.component_timings[2]?.detail ?? "", /offset=4;limit=2;manifests=2;snapshots=1/);
  assert.equal(result.component_timings[3]?.scan_mode, "single-id");
  assert.match(result.component_timings[3]?.detail ?? "", /reads=1/);
  assert.equal(result.component_timings[4]?.data_source, "runtime-telemetry");
  assert.deepEqual(events, [
    "concurrency:/tmp/PublicLibrary",
    "library:/tmp/PublicLibrary",
    "page:/tmp/PublicLibrary:4:2",
    "job:/tmp/PublicLibrary:V000001",
    "runtime:/tmp/PublicLibrary"
  ]);
});

test("preprocess jobs facade falls back to manifests when no limit is supplied", async () => {
  const events: string[] = [];
  const result = await listAdminPreprocessJobsWithRuntimeMeta({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      now: () => "2026-06-27T00:20:00.000Z"
    },
    deps: {
      async read_concurrent_job_count(libraryRoot) {
        events.push(`concurrency:${libraryRoot}`);
        return 1;
      },
      async read_library_manifest() {
        throw new Error("library counts should not be required for unpaged manifest fallback");
      },
      async read_preprocess_job_manifest_page() {
        throw new Error("read-model page should not run without a limit");
      },
      async read_all_source_video_manifests(libraryRoot) {
        events.push(`manifests:${libraryRoot}`);
        return [
          sourceVideoManifest({ source_video_id: "V000003", preprocess_status: "queued" })
        ];
      },
      async read_preprocess_job(_libraryRoot, _sourceVideoId): Promise<AdminPreprocessJobRecord | null> {
        throw new Error("queued manifests should not read physical job records");
      },
      async read_runtime_load(input) {
        events.push(`runtime:${input.library_root}`);
        return healthyRuntimeLoad();
      }
    }
  });

  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "unknown");
  assert.deepEqual(result.jobs.jobs.map((job) => [job.source_video_id, job.status]), [
    ["V000003", "queued"]
  ]);
  assert.deepEqual(result.component_timings.map((component) => component.name), [
    "concurrency_policy",
    "manifest_fallback",
    "runtime_load"
  ]);
  assert.equal(result.component_timings[1]?.data_source, "source-video-manifest");
  assert.equal(result.component_timings[1]?.scan_mode, "status-scan");
  assert.match(result.component_timings[1]?.detail ?? "", /manifests=1/);
  assert.deepEqual(events, [
    "concurrency:/tmp/PublicLibrary",
    "manifests:/tmp/PublicLibrary",
    "runtime:/tmp/PublicLibrary"
  ]);
});
