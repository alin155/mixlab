import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendUsageEvent,
  type UsageMetrics
} from "../../library-fs/src/index.ts";
import {
  adminUsageMetricsStorePath,
  readAdminUsageMetricsWithRuntime
} from "./admin-usage-metrics-query.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-usage-metrics-"));
}

function usageEventsPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson");
}

async function writeUsageEvents(libraryRoot: string, text: string): Promise<void> {
  await mkdir(path.dirname(usageEventsPath(libraryRoot)), { recursive: true });
  await writeFile(usageEventsPath(libraryRoot), text, "utf8");
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

test("usage metrics query persists a fresh summary and reads it from the admin read model", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeUsageEvents(libraryRoot, "{\"event_id\":\"evt-1\"}\n");
  let rawReadCount = 0;

  const first = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    now: () => "2026-06-26T12:00:00.000Z",
    async read_usage_metrics() {
      rawReadCount += 1;
      return usageMetrics({
        search_request_count: 3,
        active_user_count: 2,
        recent_keywords: ["现金流"]
      });
    }
  });

  assert.equal(first.actual_data_source, "usage-events");
  assert.equal(first.cache_status, "miss");
  assert.equal(first.projection_status, "summary-stored");
  assert.equal(first.metrics.search_request_count, 3);
  assert.equal(rawReadCount, 1);
  assert.equal(path.basename(adminUsageMetricsStorePath(libraryRoot)), "usage-metrics.sqlite");

  const second = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      throw new Error("fresh summary should avoid raw usage-events reads");
    }
  });

  assert.equal(second.actual_data_source, "admin-read-model");
  assert.equal(second.cache_status, "hit");
  assert.equal(second.projection_status, "summary-hit");
  assert.equal(second.projection_path, adminUsageMetricsStorePath(libraryRoot));
  assert.equal(second.metrics.search_request_count, 3);
  assert.equal(second.metrics.active_user_count, 2);
  assert.deepEqual(second.metrics.recent_keywords, ["现金流"]);
});

test("usage metrics query can reuse an incrementally updated projection after append", async () => {
  const libraryRoot = await makeLibraryRoot();
  await appendUsageEvent(libraryRoot, {
    user_id: "CU000001",
    username: "小王",
    device_id: "device-1",
    event_type: "search",
    occurred_at: "2026-05-03T10:00:00.000Z",
    source_video_id: "V000001",
    query: "现金流",
    search_mode: "searchd",
    search_elapsed_ms: 10,
    result_status: "success"
  });

  const first = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    now: () => "2026-06-26T12:00:00.000Z"
  });
  assert.equal(first.actual_data_source, "usage-events");
  assert.equal(first.cache_status, "miss");
  assert.equal(first.projection_status, "summary-stored");
  assert.equal(first.metrics.search_request_count, 1);

  await appendUsageEvent(libraryRoot, {
    user_id: "CU000002",
    username: "小李",
    device_id: "device-2",
    event_type: "search",
    occurred_at: "2026-05-03T10:01:00.000Z",
    source_video_id: "V000002",
    query: "组织效率",
    search_mode: "sqlite-index",
    search_elapsed_ms: 30,
    result_status: "empty"
  });

  const second = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      throw new Error("incremental projection should avoid raw usage-events reads");
    }
  });

  assert.equal(second.actual_data_source, "admin-read-model");
  assert.equal(second.cache_status, "hit");
  assert.equal(second.projection_status, "summary-hit");
  assert.equal(second.metrics.search_request_count, 2);
  assert.equal(second.metrics.search_hit_count, 1);
  assert.equal(second.metrics.search_empty_count, 1);
  assert.equal(second.metrics.search_latency_p50_ms, 10);
  assert.equal(second.metrics.search_latency_p95_ms, 30);
  assert.equal(second.metrics.core_search_request_count, 2);
  assert.equal(second.metrics.core_search_latency_max_ms, 30);
  assert.deepEqual(second.metrics.recent_keywords, ["组织效率", "现金流"]);
  assert.deepEqual(second.metrics.most_used_source_video_ids, ["V000001", "V000002"]);
  assert.equal(second.metrics.active_user_count, 2);
});

test("usage metrics query invalidates the summary when usage-events file changes", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeUsageEvents(libraryRoot, "line-a\n");
  let rawReadCount = 0;

  await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      rawReadCount += 1;
      return usageMetrics({ search_request_count: 1 });
    }
  });

  await writeUsageEvents(libraryRoot, "line-a\nline-b\n");
  const afterChange = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      rawReadCount += 1;
      return usageMetrics({ search_request_count: 2 });
    }
  });

  assert.equal(afterChange.actual_data_source, "usage-events");
  assert.equal(afterChange.cache_status, "miss");
  assert.equal(afterChange.projection_status, "summary-stored");
  assert.equal(afterChange.metrics.search_request_count, 2);
  assert.equal(rawReadCount, 2);
});

test("usage metrics query can summarize a missing usage-events file", async () => {
  const libraryRoot = await makeLibraryRoot();
  let rawReadCount = 0;

  const first = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      rawReadCount += 1;
      return usageMetrics();
    }
  });
  const second = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      throw new Error("missing file summary should be reusable");
    }
  });

  assert.equal(first.actual_data_source, "usage-events");
  assert.equal(first.cache_status, "miss");
  assert.equal(first.projection_status, "summary-stored");
  assert.equal(second.actual_data_source, "admin-read-model");
  assert.equal(second.cache_status, "hit");
  assert.equal(second.projection_status, "summary-hit");
  assert.equal(rawReadCount, 1);
});

test("usage metrics query does not persist a summary if usage-events changes during the raw read", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeUsageEvents(libraryRoot, "before\n");
  let rawReadCount = 0;

  const first = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      rawReadCount += 1;
      await writeUsageEvents(libraryRoot, "before\nafter\n");
      return usageMetrics({ search_request_count: 1 });
    }
  });
  const second = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      rawReadCount += 1;
      return usageMetrics({ search_request_count: 2 });
    }
  });

  assert.equal(first.actual_data_source, "usage-events");
  assert.equal(first.cache_status, "miss");
  assert.equal(first.projection_status, "usage-events-changed-during-read");
  assert.equal(second.actual_data_source, "usage-events");
  assert.equal(second.cache_status, "miss");
  assert.equal(second.projection_status, "summary-stored");
  assert.equal(second.metrics.search_request_count, 2);
  assert.equal(rawReadCount, 2);
});

test("usage metrics query exposes summary write failures without failing dashboard reads", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeUsageEvents(libraryRoot, "{\"event_id\":\"evt-1\"}\n");

  const first = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      return usageMetrics({
        search_request_count: 5
      });
    },
    async write_usage_metrics_summary_projection() {
      throw new Error("simulated sqlite write failure");
    }
  });

  assert.equal(first.actual_data_source, "usage-events");
  assert.equal(first.cache_status, "miss");
  assert.equal(first.projection_status, "summary-write-failed");
  assert.equal(first.projection_path, adminUsageMetricsStorePath(libraryRoot));
  assert.equal(first.metrics.search_request_count, 5);

  const second = await readAdminUsageMetricsWithRuntime({
    library_root: libraryRoot,
    async read_usage_metrics() {
      return usageMetrics({
        search_request_count: 6
      });
    }
  });

  assert.equal(second.actual_data_source, "usage-events");
  assert.equal(second.cache_status, "miss");
  assert.equal(second.projection_status, "summary-stored");
  assert.equal(second.metrics.search_request_count, 6);
});
