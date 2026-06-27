import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as flushAsyncTasks } from "node:timers/promises";
import type { UsageMetrics } from "../../library-fs/src/index.ts";
import {
  createAdminDashboardMetricsReader,
  type AdminDashboardMetricsRuntimeResult
} from "./admin-dashboard-metrics-cache.ts";
import type {
  AdminDashboardMetrics,
  AdminDashboardMetricsInput
} from "./admin-dashboard-metrics-query.ts";
import { getAdminDashboardMetrics } from "./admin-dashboard-metrics-query.ts";

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

function makeDashboardMetricsInput(input: {
  library_root: string;
  read_usage_metrics: () => Promise<UsageMetrics>;
  read_runtime_load_metrics?: () => Promise<{ label: string }>;
}): AdminDashboardMetricsInput<{ label: string }> {
  return {
    library_root: input.library_root,
    now: "2026-05-02T12:00:00.000Z",
    full_dashboard_metrics_max_manifests: 100,
    async read_library_manifest() {
      return {
        video_count: 101,
        ready_video_count: 96,
        processing_video_count: 1,
        queued_video_count: 2,
        unprocessed_video_count: 0,
        failed_video_count: 1,
        index_required_video_count: 1
      };
    },
    async read_manifests() {
      throw new Error("large dashboard metrics must stay in summary mode");
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
      throw new Error("large dashboard metrics must not scan transcript artifacts");
    },
    async read_preprocess_job() {
      throw new Error("large dashboard metrics must not scan preprocess jobs");
    },
    read_usage_metrics: input.read_usage_metrics,
    read_runtime_load_metrics: input.read_runtime_load_metrics ?? (async () => ({ label: "runtime" }))
  };
}

function assertMetrics(
  result: AdminDashboardMetricsRuntimeResult<{ label: string }>,
  input: {
    cache_status: "hit" | "miss" | "pending";
    search_request_count: number;
  }
): AdminDashboardMetrics<{ label: string }> {
  assert.equal(result.actual_data_source, "usage-events");
  assert.equal(result.cache_status, input.cache_status);
  assert.equal(result.data.material.video_count, 101);
  assert.equal(result.data.usage.search_request_count, input.search_request_count);
  return result.data;
}

test("dashboard metrics reader caches repeated reads by library root", async () => {
  let nowMs = 1_000;
  let usageReadCount = 0;
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 500,
    now_ms: () => nowMs
  });
  const input = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    async read_usage_metrics() {
      usageReadCount += 1;
      return usageMetrics({ search_request_count: usageReadCount });
    }
  });

  assertMetrics(await reader.read(input), {
    cache_status: "miss",
    search_request_count: 1
  });
  assertMetrics(await reader.read(input), {
    cache_status: "hit",
    search_request_count: 1
  });
  assert.equal(usageReadCount, 1);

  nowMs = 1_600;
  assertMetrics(await reader.read(input), {
    cache_status: "miss",
    search_request_count: 2
  });
  assert.equal(usageReadCount, 2);
});

test("dashboard metrics reader isolates cache entries by library root", async () => {
  let usageReadCount = 0;
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 1_000,
    now_ms: () => 1_000
  });
  const makeInput = (libraryRoot: string) => makeDashboardMetricsInput({
    library_root: libraryRoot,
    async read_usage_metrics() {
      usageReadCount += 1;
      return usageMetrics({ search_request_count: usageReadCount });
    }
  });

  assertMetrics(await reader.read(makeInput("/tmp/library-a")), {
    cache_status: "miss",
    search_request_count: 1
  });
  assertMetrics(await reader.read(makeInput("/tmp/library-b")), {
    cache_status: "miss",
    search_request_count: 2
  });
  assertMetrics(await reader.read(makeInput("/tmp/library-a")), {
    cache_status: "hit",
    search_request_count: 1
  });
  assert.equal(usageReadCount, 2);
});

test("dashboard metrics reader preserves actual data source from the query loader", async () => {
  let loadCount = 0;
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 1_000,
    now_ms: () => 1_000,
    async load_metrics(input) {
      loadCount += 1;
      return {
        data: await getAdminDashboardMetrics(input),
        actual_data_source: "admin-read-model"
      };
    }
  });
  const input = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    async read_usage_metrics() {
      return usageMetrics({ search_request_count: 5 });
    }
  });

  const first = await reader.read(input);
  const second = await reader.read(input);

  assert.equal(first.actual_data_source, "admin-read-model");
  assert.equal(first.cache_status, "miss");
  assert.equal(second.actual_data_source, "admin-read-model");
  assert.equal(second.cache_status, "hit");
  assert.equal(loadCount, 1);
});

test("dashboard metrics reader exposes cold component timings without reusing them on cache hits", async () => {
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 1_000,
    now_ms: () => 1_000,
    async load_metrics(input) {
      return {
        data: await getAdminDashboardMetrics(input),
        actual_data_source: "admin-read-model",
        component_timings: [{
          name: "usage_metrics",
          duration_ms: 42,
          data_source: "admin-read-model",
          scan_mode: "no-scan",
          scan_reason: "background-metrics"
        }]
      };
    }
  });
  const input = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    async read_usage_metrics() {
      return usageMetrics({ search_request_count: 5 });
    }
  });

  const first = await reader.read(input);
  const second = await reader.read(input);

  assert.equal(first.cache_status, "miss");
  assert.deepEqual(first.component_timings?.map((component) => component.name), ["usage_metrics"]);
  assert.equal(first.component_timings?.[0]?.duration_ms, 42);
  assert.equal(second.cache_status, "hit");
  assert.deepEqual(second.component_timings?.map((component) => component.name), ["dashboard_metrics_cache"]);
  assert.equal(second.component_timings?.[0]?.cache_status, "hit");
});

test("dashboard metrics reader does not cache failed loads", async () => {
  let usageReadCount = 0;
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 1_000,
    now_ms: () => 1_000
  });
  const input = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    async read_usage_metrics() {
      usageReadCount += 1;
      if (usageReadCount === 1) {
        throw new Error("temporary usage read failure");
      }
      return usageMetrics({ search_request_count: usageReadCount });
    }
  });

  await assert.rejects(() => reader.read(input), /temporary usage read failure/);
  assertMetrics(await reader.read(input), {
    cache_status: "miss",
    search_request_count: 2
  });
  assert.equal(usageReadCount, 2);
});

test("dashboard metrics reader coalesces concurrent misses", async () => {
  let resolveUsageMetrics: ((value: UsageMetrics) => void) | undefined;
  let usageReadCount = 0;
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 1_000,
    now_ms: () => 1_000
  });
  const input = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    read_usage_metrics() {
      usageReadCount += 1;
      return new Promise<UsageMetrics>((resolve) => {
        resolveUsageMetrics = resolve;
      });
    }
  });

  const firstRead = reader.read(input);
  const secondRead = reader.read(input);
  await flushAsyncTasks();
  assert.equal(usageReadCount, 1);
  resolveUsageMetrics?.(usageMetrics({ search_request_count: 7 }));

  assertMetrics(await firstRead, {
    cache_status: "miss",
    search_request_count: 7
  });
  assertMetrics(await secondRead, {
    cache_status: "pending",
    search_request_count: 7
  });
  assert.equal(usageReadCount, 1);
});

test("dashboard metrics reader clear prevents stale in-flight reads from repopulating cache", async () => {
  let resolveUsageMetrics: ((value: UsageMetrics) => void) | undefined;
  let usageReadCount = 0;
  const reader = createAdminDashboardMetricsReader<{ label: string }>({
    ttl_ms: 1_000,
    now_ms: () => 1_000
  });
  const firstInput = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    read_usage_metrics() {
      usageReadCount += 1;
      return new Promise<UsageMetrics>((resolve) => {
        resolveUsageMetrics = resolve;
      });
    }
  });

  const firstRead = reader.read(firstInput);
  await flushAsyncTasks();
  assert.equal(usageReadCount, 1);
  reader.clear("/tmp/library-a");
  resolveUsageMetrics?.(usageMetrics({ search_request_count: 1 }));
  assertMetrics(await firstRead, {
    cache_status: "miss",
    search_request_count: 1
  });

  const secondInput = makeDashboardMetricsInput({
    library_root: "/tmp/library-a",
    async read_usage_metrics() {
      usageReadCount += 1;
      return usageMetrics({ search_request_count: usageReadCount });
    }
  });
  assertMetrics(await reader.read(secondInput), {
    cache_status: "miss",
    search_request_count: 2
  });
  assert.equal(usageReadCount, 2);
});
