import test from "node:test";
import assert from "node:assert/strict";
import type { LibraryCounts, PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import type { UsageMetrics } from "../../library-fs/src/index.ts";
import {
  dominantAdminDashboardMetricsDataSource,
  getAdminDashboardMetrics,
  type AdminDashboardPreprocessJob
} from "./admin-dashboard-metrics-query.ts";

function manifest(input: {
  id: string;
  status: PreprocessStatus;
  duration_ms?: number;
  file_size?: number;
}): SourceVideoManifest {
  return {
    source_video_id: input.id,
    title: input.id,
    relative_path: `${input.id}.mp4`,
    logical_uri: `mixlab://source-video/${input.id}`,
    duration_ms: input.duration_ms ?? 0,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: input.file_size ?? 0,
    content_hash: `${input.id}-hash`,
    preprocess_status: input.status,
    visible_to_cutters: input.status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  };
}

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

const summaryLibrary: LibraryCounts = {
  video_count: 101,
  ready_video_count: 96,
  processing_video_count: 1,
  queued_video_count: 2,
  unprocessed_video_count: 0,
  failed_video_count: 1,
  index_required_video_count: 1
};

test("dashboard metrics query builds manifest-backed metrics for small libraries", async () => {
  const manifests = [
    manifest({ id: "V000001", status: "ready", duration_ms: 120_000, file_size: 4096 }),
    manifest({ id: "V000002", status: "queued", duration_ms: 60_000, file_size: 2048 }),
    manifest({ id: "V000003", status: "failed", duration_ms: 30_000, file_size: 1024 })
  ];
  const jobs = new Map<string, AdminDashboardPreprocessJob>([
    ["V000001", {
      claimed_at: "2026-05-02T10:00:00.000Z",
      completed_at: "2026-05-02T10:00:05.000Z"
    }],
    ["V000003", {
      failed_at: "2026-05-02T11:00:00.000Z"
    }]
  ]);

  const metrics = await getAdminDashboardMetrics({
    library_root: "/tmp/library",
    now: "2026-05-02T12:00:00.000Z",
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest() {
      return null;
    },
    async read_manifests() {
      return manifests;
    },
    async read_current_index_version() {
      return "v000001";
    },
    async read_current_index_metadata() {
      throw new Error("small library should use transcript metrics reader");
    },
    async read_transcript_metrics() {
      return {
        transcript_video_count: 1,
        character_count: 12,
        segment_count: 2
      };
    },
    async read_preprocess_job(_libraryRoot, sourceVideoId) {
      return jobs.get(sourceVideoId) ?? null;
    },
    async read_usage_metrics() {
      return usageMetrics({
        search_request_count: 3,
        add_to_cut_list_count: 2
      });
    },
    async read_runtime_load_metrics() {
      return { overall_status: "healthy" };
    }
  });

  assert.equal(metrics.material.video_count, 3);
  assert.equal(metrics.material.ready_video_count, 1);
  assert.equal(metrics.material.total_duration_ms, 210_000);
  assert.equal(metrics.material.ready_duration_ms, 120_000);
  assert.equal(metrics.material.total_size_bytes, 7168);
  assert.equal(metrics.transcript.character_count, 12);
  assert.equal(metrics.transcript.current_index_version, "v000001");
  assert.equal(metrics.production.completed_today_count, 1);
  assert.equal(metrics.production.failed_today_count, 1);
  assert.equal(metrics.production.average_video_process_ms, 5_000);
  assert.equal(metrics.production.estimated_queue_done_at, "2026-05-02T12:00:05.000Z");
  assert.equal(metrics.usage.search_request_count, 3);
  assert.deepEqual(metrics.runtime_load, { overall_status: "healthy" });
  assert.equal(metrics.sources.material.data_source, "source-video-manifest");
  assert.equal(metrics.sources.material.scan_mode, "status-scan");
  assert.equal(metrics.sources.transcript.data_source, "transcript-artifacts");
  assert.equal(metrics.sources.production.data_source, "source-video-manifest");
  assert.equal(metrics.sources.usage.data_source, "usage-events");
  assert.equal(metrics.sources.risk.data_source, "source-video-manifest");
  assert.equal(metrics.sources.runtime_load.data_source, "runtime-telemetry");
  assert.equal(dominantAdminDashboardMetricsDataSource(metrics), "usage-events");
});

test("dashboard metrics query uses library summary mode without manifest reads for large libraries", async () => {
  let manifestReadCount = 0;

  const metrics = await getAdminDashboardMetrics({
    library_root: "/tmp/library",
    now: "2026-05-02T12:00:00.000Z",
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest() {
      return summaryLibrary;
    },
    async read_status_summary() {
      return summaryLibrary;
    },
    async read_material_summary() {
      return {
        video_count: 101,
        ready_video_count: 96,
        total_duration_ms: 9_600_000,
        ready_duration_ms: 9_000_000,
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
      throw new Error("large library summary mode must not read manifests");
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
    async read_transcript_metrics() {
      throw new Error("large library summary mode must not scan transcript artifacts");
    },
    async read_preprocess_job() {
      throw new Error("large library summary mode must not scan preprocess jobs");
    },
    async read_usage_metrics() {
      return {
        metrics: usageMetrics(),
        actual_data_source: "admin-read-model"
      };
    },
    async read_runtime_load_metrics() {
      return { overall_status: "attention" };
    }
  });

  assert.equal(manifestReadCount, 0);
  assert.equal(metrics.material.video_count, 101);
  assert.equal(metrics.material.ready_video_count, 96);
  assert.equal(metrics.material.total_duration_ms, 9_600_000);
  assert.equal(metrics.material.ready_duration_ms, 9_000_000);
  assert.equal(metrics.material.total_size_bytes, 55_000);
  assert.equal(metrics.transcript.transcript_video_count, 96);
  assert.equal(metrics.transcript.segment_count, 972_776);
  assert.equal(metrics.production.completed_today_count, 4);
  assert.equal(metrics.production.failed_today_count, 1);
  assert.equal(metrics.production.average_video_process_ms, 30_000);
  assert.equal(metrics.production.estimated_queue_done_at, "2026-05-02T12:01:30.000Z");
  assert.equal(metrics.risk.failed_video_count, 1);
  assert.equal(metrics.risk.index_required_video_count, 1);
  assert.equal(metrics.sources.material.data_source, "admin-read-model");
  assert.equal(metrics.sources.material.scan_mode, "no-scan");
  assert.equal(metrics.sources.production.data_source, "admin-read-model");
  assert.equal(metrics.sources.transcript.data_source, "current-index");
  assert.equal(metrics.sources.usage.data_source, "admin-read-model");
  assert.equal(metrics.sources.usage.scan_mode, "no-scan");
  assert.equal(metrics.sources.risk.data_source, "admin-read-model");
  assert.equal(dominantAdminDashboardMetricsDataSource(metrics), "admin-read-model");
});

test("dashboard metrics query records component timings for large-library cold reads", async () => {
  const componentTimings: Array<{
    name: string;
    duration_ms: number;
    data_source?: string;
    cache_status?: string;
    detail?: string;
  }> = [];
  let nowMs = 0;

  const metrics = await getAdminDashboardMetrics({
    library_root: "/tmp/library",
    now: "2026-05-02T12:00:00.000Z",
    full_dashboard_metrics_max_manifests: 100,
    runtime_now_ms() {
      nowMs += 5;
      return nowMs;
    },
    record_component_timing(component) {
      componentTimings.push(component);
    },
    async read_library_manifest() {
      return summaryLibrary;
    },
    async read_status_summary() {
      return summaryLibrary;
    },
    async read_material_summary() {
      return {
        video_count: 101,
        ready_video_count: 96,
        total_duration_ms: 9_600_000,
        ready_duration_ms: 9_000_000,
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
      throw new Error("large library timing path must not read manifests");
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
    async read_transcript_metrics() {
      throw new Error("large library timing path must not scan transcript artifacts");
    },
    async read_preprocess_job() {
      throw new Error("large library timing path must not scan preprocess jobs");
    },
    async read_usage_metrics() {
      return {
        metrics: usageMetrics(),
        actual_data_source: "admin-read-model",
        cache_status: "hit",
        projection_status: "summary-hit"
      };
    },
    async read_runtime_load_metrics() {
      return { overall_status: "healthy" };
    }
  });

  assert.equal(metrics.material.video_count, 101);
  assert.deepEqual(
    componentTimings.map((component) => component.name),
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
  assert.equal(componentTimings.every((component) => component.duration_ms === 5), true);
  assert.equal(componentTimings.find((component) => component.name === "usage_metrics")?.data_source, "admin-read-model");
  assert.equal(componentTimings.find((component) => component.name === "usage_metrics")?.cache_status, "hit");
  assert.equal(componentTimings.find((component) => component.name === "usage_metrics")?.detail, "usage_projection=summary-hit");
  assert.equal(componentTimings.find((component) => component.name === "preprocess_jobs")?.detail, "summary-mode");
});

test("dashboard metrics query falls back to manifest counts when library summary is missing", async () => {
  const metrics = await getAdminDashboardMetrics({
    library_root: "/tmp/library",
    now: "2026-05-02T12:00:00.000Z",
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest() {
      return null;
    },
    async read_manifests() {
      return [
        manifest({ id: "V000001", status: "index-required", duration_ms: 10_000, file_size: 100 }),
        manifest({ id: "V000002", status: "unprocessed", duration_ms: 5_000, file_size: 50 })
      ];
    },
    async read_current_index_version() {
      return "";
    },
    async read_current_index_metadata() {
      return null;
    },
    async read_transcript_metrics() {
      return {
        transcript_video_count: 0,
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
      return { overall_status: "healthy" };
    }
  });

  assert.equal(metrics.material.video_count, 2);
  assert.equal(metrics.material.unprocessed_duration_ms, 5_000);
  assert.equal(metrics.risk.index_required_video_count, 1);
  assert.equal(metrics.transcript.current_index_version, "");
});
