import assert from "node:assert/strict";
import test from "node:test";
import type { UsageMetrics } from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { createAdminDashboardReadServices } from "./admin-dashboard-read-services.ts";

interface TestApiInput {
  library_root: string;
  library_id?: string;
  library_name?: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
}

const libraryCounts: LibraryCounts = {
  video_count: 101,
  ready_video_count: 96,
  processing_video_count: 1,
  queued_video_count: 2,
  unprocessed_video_count: 0,
  failed_video_count: 1,
  index_required_video_count: 1
};

function usageMetrics(overrides: Partial<UsageMetrics> = {}): UsageMetrics {
  return {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
    search_failure_count: 0,
    search_latency_p50_ms: 0,
    search_latency_p95_ms: 0,
    search_latency_max_ms: 0,
    searchd_search_count: 0,
    sqlite_index_search_count: 0,
    fallback_search_count: 0,
    search_backend_unknown_count: 0,
    core_search_request_count: 0,
    core_search_failure_count: 0,
    core_search_latency_p50_ms: 0,
    core_search_latency_p95_ms: 0,
    core_search_latency_max_ms: 0,
    core_searchd_search_count: 0,
    core_sqlite_index_search_count: 0,
    core_fallback_search_count: 0,
    core_search_backend_unknown_count: 0,
    source_detail_view_count: 0,
    transcript_selection_count: 0,
    add_to_cut_list_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    cut_failure_count: 0,
    local_clip_count: 0,
    reuse_local_clip_count: 0,
    active_user_count: 0,
    recent_keywords: [],
    most_used_source_video_ids: [],
    users: [],
    event_store: {
      line_count: 0,
      valid_line_count: 0,
      malformed_line_count: 0,
      malformed_lines: [],
      warning: ""
    },
    ...overrides
  };
}

function createServices(events: string[] = []) {
  return createAdminDashboardReadServices<TestApiInput, { overall_status: string }>({
    full_transcript_metrics_max_manifests: 100,
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest(libraryRoot) {
      events.push(`library-manifest:${libraryRoot}`);
      return {
        ...libraryCounts,
        library_id: "lib-test",
        name: "测试公共素材库",
        version: "1.0",
        updated_at: "2026-06-27T05:00:00.000Z"
      };
    },
    async read_source_video_manifests() {
      throw new Error("library manifest should avoid full source-video manifest reads");
    },
    async read_current_index_version(libraryRoot) {
      events.push(`current-index:${libraryRoot}`);
      return "v010471";
    },
    async read_primary_source_videos_path(libraryRoot) {
      events.push(`source-path:${libraryRoot}`);
      return `${libraryRoot}/source-videos`;
    },
    mixlab_library_path(libraryRoot) {
      events.push(`mixlab-root:${libraryRoot}`);
      return `${libraryRoot}/.mixlab-library`;
    },
    async read_status_read_model_store(input) {
      events.push(`status-read-model:${input.library_root}:${input.library.video_count}`);
      return {
        freshness: "fresh",
        video_count: input.library.video_count,
        counts_by_status: {
          ready: input.library.ready_video_count,
          processing: input.library.processing_video_count,
          queued: input.library.queued_video_count,
          unprocessed: input.library.unprocessed_video_count,
          failed: input.library.failed_video_count,
          "index-required": input.library.index_required_video_count
        }
      };
    },
    refresh_status_read_model_in_background(libraryRoot) {
      events.push(`refresh-status:${libraryRoot}`);
    },
    async read_material_summary(libraryRoot, library) {
      events.push(`material:${libraryRoot}:${library.video_count}`);
      return {
        video_count: library.video_count,
        ready_video_count: library.ready_video_count,
        total_duration_ms: 960_000,
        ready_duration_ms: 900_000,
        unprocessed_duration_ms: 0,
        total_size_bytes: 55_000
      };
    },
    async read_production_summary(libraryRoot, library, now) {
      events.push(`production:${libraryRoot}:${library.video_count}:${now}`);
      return {
        completed_today_count: 4,
        failed_today_count: 1,
        average_video_process_ms: 30_000
      };
    },
    async read_manifests() {
      throw new Error("large dashboard reads should use read-model summaries");
    },
    async read_current_index_metadata(libraryRoot) {
      events.push(`index-metadata:${libraryRoot}`);
      return {
        source_video_count: 96,
        segment_count: 972_776
      };
    },
    async read_transcript_summary() {
      throw new Error("large dashboard reads should use current-index metadata");
    },
    async read_preprocess_job() {
      throw new Error("large dashboard reads should use production summaries");
    },
    async read_usage_metrics() {
      throw new Error("usage runtime wrapper should own the usage read");
    },
    async read_usage_metrics_with_runtime(input) {
      events.push(`usage:${input.library_root}:${input.now()}`);
      return {
        metrics: usageMetrics({ search_request_count: 9 }),
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        projection_status: "summary-hit",
        projection_path: "/tmp/PublicLibrary/.mixlab-library/admin-read-model/usage-metrics.sqlite"
      };
    },
    async read_runtime_load_metrics(input) {
      events.push(`runtime:${input.library_root}`);
      return { overall_status: "healthy" };
    },
    async disk_usage(libraryRoot) {
      events.push(`disk:${libraryRoot}`);
      return {
        total: 1_000,
        available: 400
      };
    }
  });
}

test("dashboard read services assemble library status and refresh non-ready manifest counts", async () => {
  const events: string[] = [];
  const services = createServices(events);

  const status = await services.read_library_status({
    library_root: "/tmp/PublicLibrary",
    now: () => "2026-06-27T05:00:00.000Z"
  });

  assert.equal(status.library_id, "lib-test");
  assert.equal(status.name, "测试公共素材库");
  assert.equal(status.root_path, "/tmp/PublicLibrary");
  assert.equal(status.source_videos_path, "/tmp/PublicLibrary/source-videos");
  assert.equal(status.mixlab_library_path, "/tmp/PublicLibrary/.mixlab-library");
  assert.equal(status.current_index_version, "v010471");
  assert.equal(status.index_status, "needs-publish");
  assert.equal(status.disk_total_bytes, 1_000);
  assert.equal(status.disk_available_bytes, 400);
  assert.deepEqual(events, [
    "library-manifest:/tmp/PublicLibrary",
    "current-index:/tmp/PublicLibrary",
    "disk:/tmp/PublicLibrary",
    "refresh-status:/tmp/PublicLibrary",
    "source-path:/tmp/PublicLibrary",
    "mixlab-root:/tmp/PublicLibrary"
  ]);
});

test("dashboard read services keep large dashboard metrics on read-model summaries", async () => {
  const events: string[] = [];
  const services = createServices(events);

  const result = await services.read_dashboard_metrics({
    library_root: "/tmp/PublicLibrary",
    now: () => "2026-06-27T05:01:00.000Z"
  });

  assert.equal(result.cache_status, "miss");
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.data.material.video_count, 101);
  assert.equal(result.data.transcript.segment_count, 972_776);
  assert.equal(result.data.usage.search_request_count, 9);
  assert.deepEqual(result.data.runtime_load, { overall_status: "healthy" });
  assert.equal(result.data.sources.material.data_source, "admin-read-model");
  assert.equal(result.data.sources.transcript.data_source, "current-index");
  assert.equal(result.data.sources.usage.data_source, "admin-read-model");
  assert.deepEqual(events, [
    "library-manifest:/tmp/PublicLibrary",
    "status-read-model:/tmp/PublicLibrary:101",
    "material:/tmp/PublicLibrary:101",
    "production:/tmp/PublicLibrary:101:2026-06-27T05:01:00.000Z",
    "current-index:/tmp/PublicLibrary",
    "index-metadata:/tmp/PublicLibrary",
    "usage:/tmp/PublicLibrary:2026-06-27T05:01:00.000Z",
    "runtime:/tmp/PublicLibrary"
  ]);
});

test("dashboard read services expose runtime load reader for preprocess jobs", async () => {
  const events: string[] = [];
  const services = createServices(events);

  assert.deepEqual(await services.read_runtime_load_metrics({
    library_root: "/tmp/PublicLibrary"
  }), {
    overall_status: "healthy"
  });
  assert.deepEqual(events, ["runtime:/tmp/PublicLibrary"]);
});
