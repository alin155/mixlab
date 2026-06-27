import assert from "node:assert/strict";
import test from "node:test";
import {
  readAdminPreprocessProcessHistoryQuery,
  readAdminPreprocessProcessHistoryReadinessQuery,
  type AdminPreprocessProcessHistoryLibrary,
  type AdminPreprocessProcessHistoryQueryDeps
} from "./admin-preprocess-process-history-query.ts";
import type {
  AdminReadModelStorePreprocessProcessHistory,
  AdminReadModelStorePreprocessProcessHistoryReadiness
} from "./admin-read-model-store.ts";

const library: AdminPreprocessProcessHistoryLibrary = {
  video_count: 2,
  ready_video_count: 1,
  processing_video_count: 1,
  queued_video_count: 0,
  unprocessed_video_count: 0,
  failed_video_count: 0,
  index_required_video_count: 0,
  updated_at: "2026-06-26T20:00:00.000Z"
};

function historyFixture(): AdminReadModelStorePreprocessProcessHistory {
  return {
    source: "admin-read-model-store",
    generated_at: "2026-06-26T20:01:00.000Z",
    library_updated_at: "2026-06-26T20:00:00.000Z",
    window_days: 7,
    limit: 25,
    filters: {
      source_folder_name: "课程",
      preprocess_status: "ready",
      event_type: "completed"
    },
    filter_options: {
      source_folder_names: ["课程"],
      preprocess_statuses: ["ready"],
      event_types: ["completed"]
    },
    summary: {
      returned_count: 1,
      completed_count: 1,
      failed_count: 0,
      active_count: 0,
      average_process_ms: 2000,
      tracked_count: 1,
      tracked_completed_count: 1,
      tracked_failed_count: 0,
      tracked_active_count: 0,
      tracked_average_process_ms: 2000,
      window_start_at: "2026-06-19T20:01:00.000Z",
      newest_event_at: "2026-06-26T19:59:00.000Z",
      oldest_event_at: "2026-06-26T19:59:00.000Z",
      status_counts: {
        unprocessed: 0,
        queued: 0,
        processing: 0,
        ready: 1,
        failed: 0,
        "index-required": 0
      },
      event_counts: {
        failed: 0,
        indexed: 0,
        completed: 1,
        claimed: 0,
        status: 0
      },
      source_folder_summaries: [{
        source_folder_name: "课程",
        tracked_count: 1,
        completed_count: 1,
        failed_count: 0,
        active_count: 0,
        average_process_ms: 2000,
        newest_event_at: "2026-06-26T19:59:00.000Z"
      }],
      daily_trend: [{
        date: "2026-06-26",
        tracked_count: 1,
        completed_count: 1,
        failed_count: 0,
        active_count: 0,
        average_process_ms: 2000
      }]
    },
    items: [{
      source_video_id: "V000001",
      title: "课程 A",
      preprocess_status: "ready",
      source_folder_name: "课程",
      visible_to_cutters: true,
      claimed_at: "2026-06-26T19:58:00.000Z",
      completed_at: "2026-06-26T19:59:00.000Z",
      indexed_at: "2026-06-26T20:00:00.000Z",
      failed_at: "",
      last_event_at: "2026-06-26T19:59:00.000Z",
      last_event_type: "completed",
      elapsed_ms: 2000
    }]
  };
}

function readinessFixture(): AdminReadModelStorePreprocessProcessHistoryReadiness {
  return {
    source: "admin-read-model-store",
    store_path: "/tmp/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite",
    store_exists: true,
    store_freshness: "fresh",
    generated_at: "2026-06-26T20:01:00.000Z",
    library_updated_at: "2026-06-26T20:00:00.000Z",
    current_library_updated_at: "2026-06-26T20:00:00.000Z",
    scan_mode: "no-scan",
    ready_for_process_history: true,
    reason: "ready",
    expected_job_snapshot_rows: 2,
    snapshot_complete: true,
    snapshot_metadata_row_count: 2,
    snapshot_table_row_count: 2,
    projection_complete: true,
    projection_metadata_row_count: 2,
    projection_table_row_count: 2,
    metadata_row_count_matches: true,
    table_row_count_matches: true,
    projection_row_count_matches: true,
    last_error: ""
  };
}

function makeDeps(
  overrides: Partial<AdminPreprocessProcessHistoryQueryDeps> = {}
): AdminPreprocessProcessHistoryQueryDeps {
  return {
    read_library_manifest: async () => library,
    read_process_history_from_store: async () => historyFixture(),
    read_process_history_readiness_from_store: async () => readinessFixture(),
    ...overrides
  };
}

test("process-history query wraps read-model hits with no-scan runtime metadata", async () => {
  let capturedLibraryRoot = "";
  let capturedLibrary: AdminPreprocessProcessHistoryLibrary | undefined;
  const result = await readAdminPreprocessProcessHistoryQuery(
    makeDeps({
      read_process_history_from_store: async (input) => {
        capturedLibraryRoot = input.library_root;
        capturedLibrary = input.library;
        assert.equal(input.now, "2026-06-26T20:02:00.000Z");
        assert.equal(input.window_days, 7);
        assert.equal(input.limit, 25);
        assert.deepEqual(input.filters, {
          source_folder_name: "课程",
          preprocess_status: "ready",
          event_type: "completed"
        });
        return historyFixture();
      }
    }),
    {
      library_root: "/tmp/PublicLibrary",
      now: "2026-06-26T20:02:00.000Z",
      window_days: 7,
      limit: 25,
      source_folder_name: "课程",
      preprocess_status: "ready",
      event_type: "completed"
    }
  );

  assert.equal(capturedLibraryRoot, "/tmp/PublicLibrary");
  assert.deepEqual(capturedLibrary, library);
  assert.equal(result.schema_version, "1.0");
  assert.equal(result.history_available, true);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.equal(result.scan_mode, "no-scan");
  assert.equal(result.scan_reason, "route-owned-page");
  assert.equal(result.items.length, 1);
});

test("process-history query returns a no-scan empty response when the store is incomplete", async () => {
  const result = await readAdminPreprocessProcessHistoryQuery(
    makeDeps({
      read_process_history_from_store: async () => null
    }),
    {
      library_root: "/tmp/PublicLibrary",
      now: "2026-06-26T20:02:00.000Z",
      window_days: 30,
      limit: 50,
      source_folder_name: "",
      preprocess_status: "",
      event_type: ""
    }
  );

  assert.equal(result.history_available, false);
  assert.equal(result.generated_at, "2026-06-26T20:02:00.000Z");
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.scan_mode, "no-scan");
  assert.deepEqual(result.filter_options, {
    source_folder_names: [],
    preprocess_statuses: [],
    event_types: []
  });
  assert.equal(result.summary.returned_count, 0);
  assert.deepEqual(result.items, []);
});

test("process-history readiness query preserves store status and adds route-safe metadata", async () => {
  const result = await readAdminPreprocessProcessHistoryReadinessQuery(
    makeDeps(),
    {
      library_root: "/tmp/PublicLibrary",
      checked_at: "2026-06-26T20:03:00.000Z"
    }
  );

  assert.equal(result.schema_version, "1.0");
  assert.equal(result.checked_at, "2026-06-26T20:03:00.000Z");
  assert.equal(result.ready_for_process_history, true);
  assert.equal(result.reason, "ready");
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.scan_mode, "no-scan");
  assert.equal(result.scan_reason, "read-model-health");
});
