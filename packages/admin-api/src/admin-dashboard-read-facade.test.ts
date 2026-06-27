import assert from "node:assert/strict";
import test from "node:test";
import type { UsageMetrics } from "../../library-fs/src/index.ts";
import type {
  LibraryCounts,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import { createAdminDashboardReadFacade } from "./admin-dashboard-read-facade.ts";

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

function manifest(sourceVideoId: string): SourceVideoManifest {
  return {
    source_video_id: sourceVideoId,
    title: sourceVideoId,
    relative_path: `${sourceVideoId}.mp4`,
    logical_uri: `mixlab://source-video/${sourceVideoId}`,
    duration_ms: 10_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `${sourceVideoId}-hash`,
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  };
}

const largeLibrary: LibraryCounts = {
  video_count: 101,
  ready_video_count: 96,
  processing_video_count: 1,
  queued_video_count: 2,
  unprocessed_video_count: 0,
  failed_video_count: 1,
  index_required_video_count: 1
};

test("dashboard read facade keeps large dashboard reads on read-model and runtime sources", async () => {
  let manifestReadCount = 0;
  let usageReadCount = 0;
  let runtimeReadCount = 0;
  const facade = createAdminDashboardReadFacade<{ overall_status: string }>({
    full_transcript_metrics_max_manifests: 100,
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest() {
      return largeLibrary;
    },
    async read_status_summary() {
      return largeLibrary;
    },
    async read_material_summary() {
      return {
        video_count: 101,
        ready_video_count: 96,
        total_duration_ms: 960_000,
        ready_duration_ms: 900_000,
        unprocessed_duration_ms: 0,
        total_size_bytes: 55_000
      };
    },
    async read_production_summary() {
      return {
        completed_today_count: 4,
        failed_today_count: 1,
        average_video_process_ms: 30_000
      };
    },
    async read_manifests() {
      manifestReadCount += 1;
      throw new Error("large dashboard reads should use summaries");
    },
    async read_current_index_version() {
      return "v010471";
    },
    async read_current_index_metadata() {
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
    async read_usage_metrics_with_runtime() {
      usageReadCount += 1;
      return {
        metrics: usageMetrics({ search_request_count: 9 }),
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        projection_status: "summary-hit",
        projection_path: "/tmp/library/.mixlab-library/admin-read-model/usage-metrics.sqlite"
      };
    },
    async read_runtime_load_metrics() {
      runtimeReadCount += 1;
      return { overall_status: "healthy" };
    }
  });

  const result = await facade.read_dashboard_metrics({
    library_root: "/tmp/library",
    now: () => "2026-05-02T12:00:00.000Z"
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
  assert.deepEqual(
    result.component_timings?.map((component) => component.name),
    [
      "library_manifest",
      "status_summary",
      "material_summary",
      "production_summary",
      "current_index_version",
      "transcript_metrics",
      "preprocess_jobs",
      "usage_metrics",
      "runtime_load"
    ]
  );
  assert.equal(
    result.component_timings?.find((component) => component.name === "usage_metrics")?.data_source,
    "admin-read-model"
  );
  assert.equal(manifestReadCount, 0);
  assert.equal(usageReadCount, 1);
  assert.equal(runtimeReadCount, 1);

  const cached = await facade.read_dashboard_metrics({
    library_root: "/tmp/library",
    now: () => "2026-05-02T12:00:01.000Z"
  });
  assert.equal(cached.cache_status, "hit");
  assert.equal(usageReadCount, 1);
  assert.equal(runtimeReadCount, 1);
});

test("dashboard read facade exposes transcript and runtime readers as route dependencies", async () => {
  let transcriptSummaryReadCount = 0;
  const facade = createAdminDashboardReadFacade<{ overall_status: string }>({
    full_transcript_metrics_max_manifests: 10,
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest() {
      return null;
    },
    async read_status_summary() {
      return null;
    },
    async read_material_summary() {
      return null;
    },
    async read_production_summary() {
      return null;
    },
    async read_manifests() {
      return [];
    },
    async read_current_index_version() {
      return "v000001";
    },
    async read_current_index_metadata() {
      return null;
    },
    async read_transcript_summary() {
      transcriptSummaryReadCount += 1;
      return {
        full_text: "hello world",
        character_count: 11,
        segment_count: 2
      };
    },
    async read_preprocess_job() {
      return null;
    },
    async read_usage_metrics() {
      return usageMetrics();
    },
    async read_usage_metrics_with_runtime() {
      return {
        metrics: usageMetrics(),
        actual_data_source: "usage-events",
        cache_status: "miss",
        projection_status: "summary-stored",
        projection_path: "/tmp/library/.mixlab-library/admin-read-model/usage-metrics.sqlite"
      };
    },
    async read_runtime_load_metrics() {
      return { overall_status: "attention" };
    }
  });

  const transcript = await facade.read_transcript_metrics({
    library_root: "/tmp/library",
    manifests: [manifest("V000001")]
  });
  const runtime = await facade.read_runtime_load_metrics({
    library_root: "/tmp/library"
  });

  assert.deepEqual(transcript, {
    transcript_video_count: 1,
    character_count: 11,
    segment_count: 2
  });
  assert.equal(transcriptSummaryReadCount, 1);
  assert.deepEqual(runtime, { overall_status: "attention" });
});

test("dashboard read facade coalesces short-lived runtime load telemetry", async () => {
  let nowMs = 1_000;
  let runtimeReadCount = 0;
  let resolveFirstRuntimeRead: ((value: { overall_status: string }) => void) | undefined;
  const firstRuntimeRead = new Promise<{ overall_status: string }>((resolve) => {
    resolveFirstRuntimeRead = resolve;
  });
  const facade = createAdminDashboardReadFacade<{ overall_status: string }>({
    full_transcript_metrics_max_manifests: 10,
    full_dashboard_metrics_max_manifests: 100,
    runtime_load_cache_ttl_ms: 2_000,
    runtime_load_cache_now_ms: () => nowMs,
    async read_library_manifest() {
      return null;
    },
    async read_status_summary() {
      return null;
    },
    async read_material_summary() {
      return null;
    },
    async read_production_summary() {
      return null;
    },
    async read_manifests() {
      return [];
    },
    async read_current_index_version() {
      return "v000001";
    },
    async read_current_index_metadata() {
      return null;
    },
    async read_transcript_summary() {
      return {
        full_text: "",
        character_count: 0,
        segment_count: 0
      };
    },
    async read_preprocess_job() {
      return null;
    },
    async read_usage_metrics() {
      return usageMetrics();
    },
    async read_runtime_load_metrics() {
      runtimeReadCount += 1;
      if (runtimeReadCount === 1) {
        return firstRuntimeRead;
      }
      return { overall_status: `runtime-${runtimeReadCount}` };
    }
  });

  const first = facade.read_runtime_load_metrics({
    library_root: "/tmp/library"
  });
  const pending = facade.read_runtime_load_metrics({
    library_root: "/tmp/library"
  });
  resolveFirstRuntimeRead?.({ overall_status: "runtime-1" });

  assert.deepEqual(await first, { overall_status: "runtime-1" });
  assert.deepEqual(await pending, { overall_status: "runtime-1" });
  assert.equal(runtimeReadCount, 1);

  assert.deepEqual(await facade.read_runtime_load_metrics({
    library_root: "/tmp/library"
  }), { overall_status: "runtime-1" });
  assert.equal(runtimeReadCount, 1);

  nowMs = 3_500;
  assert.deepEqual(await facade.read_runtime_load_metrics({
    library_root: "/tmp/library"
  }), { overall_status: "runtime-2" });
  assert.equal(runtimeReadCount, 2);

  assert.deepEqual(await facade.read_runtime_load_metrics({
    library_root: "/tmp/other-library"
  }), { overall_status: "runtime-3" });
  assert.equal(runtimeReadCount, 3);

  facade.clear_dashboard_metrics_cache("/tmp/library");
  assert.deepEqual(await facade.read_runtime_load_metrics({
    library_root: "/tmp/library"
  }), { overall_status: "runtime-4" });
  assert.equal(runtimeReadCount, 4);
});
