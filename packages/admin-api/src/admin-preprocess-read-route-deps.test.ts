import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminPreprocessReadRouteDeps,
  createAdminPreprocessReadRouteServerDeps
} from "./admin-preprocess-read-route-deps.ts";
import type {
  AdminPreprocessProcessHistoryLibrary,
  AdminPreprocessProcessHistoryQueryDeps
} from "./admin-preprocess-process-history-query.ts";
import type { AdminReadModelStorePreprocessProcessHistoryReadiness } from "./admin-read-model-store.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestSourceVideoDetail {
  source_video_id: string;
}

interface TestJobLog {
  log_path: string;
}

interface TestSupervisor {
  state: "running" | "idle";
}

interface TestPublicSupervisor {
  public_state: "running" | "idle";
}

interface TestSafety {
  status: "healthy" | "blocked";
}

const library: AdminPreprocessProcessHistoryLibrary = {
  video_count: 2,
  ready_video_count: 1,
  processing_video_count: 1,
  queued_video_count: 0,
  unprocessed_video_count: 0,
  failed_video_count: 0,
  index_required_video_count: 0,
  updated_at: "2026-06-26T23:10:00.000Z"
};

function readiness(): AdminReadModelStorePreprocessProcessHistoryReadiness {
  return {
    source: "admin-read-model-store",
    store_path: "/tmp/PublicLibrary/.mixlab-library/admin-read-model/admin.sqlite",
    store_exists: true,
    store_freshness: "fresh",
    generated_at: "2026-06-26T23:11:00.000Z",
    library_updated_at: "2026-06-26T23:10:00.000Z",
    current_library_updated_at: "2026-06-26T23:10:00.000Z",
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

test("preprocess read route deps preserve read helpers and compose process history queries", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const processHistoryDeps: AdminPreprocessProcessHistoryQueryDeps = {
    async read_library_manifest(libraryRoot) {
      calls.push({ name: "library", input: libraryRoot });
      return library;
    },
    async read_process_history_from_store(input) {
      calls.push({ name: "history", input });
      return null;
    },
    async read_process_history_readiness_from_store(input) {
      calls.push({ name: "readiness", input });
      return readiness();
    }
  };

  const deps = createAdminPreprocessReadRouteDeps<
    TestApiInput,
    TestSourceVideoDetail,
    TestJobLog,
    TestSupervisor,
    TestSafety
  >({
    ...processHistoryDeps,
    async read_source_video_detail(libraryRoot, sourceVideoId) {
      calls.push({ name: "detail", input: { libraryRoot, sourceVideoId } });
      return {
        source_video_id: sourceVideoId
      };
    },
    async read_preprocess_job_log(libraryRoot, sourceVideoId) {
      calls.push({ name: "job-log", input: { libraryRoot, sourceVideoId } });
      return {
        log_path: `${libraryRoot}/${sourceVideoId}.log`
      };
    },
    read_preprocess_supervisor_status: () => ({
      state: "running"
    }),
    async read_preprocess_safety(input) {
      calls.push({ name: "safety", input });
      return {
        status: "healthy"
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const detail = await deps.read_source_video_detail(apiInput.library_root, "V000123");
  const log = await deps.read_preprocess_job_log(apiInput.library_root, "V000123");
  const supervisor = deps.read_preprocess_supervisor_status();
  const safety = await deps.read_preprocess_safety(apiInput);
  const history = await deps.read_preprocess_process_history(apiInput, {
    now: "2026-06-26T23:12:00.000Z",
    window_days: 7,
    limit: 25,
    source_folder_name: "课程",
    preprocess_status: "ready",
    event_type: "completed"
  });
  const historyReadiness = await deps.read_preprocess_process_history_readiness(apiInput);

  assert.deepEqual(detail, {
    source_video_id: "V000123"
  });
  assert.deepEqual(log, {
    log_path: "/tmp/PublicLibrary/V000123.log"
  });
  assert.deepEqual(supervisor, {
    state: "running"
  });
  assert.deepEqual(safety, {
    status: "healthy"
  });
  assert.equal(history.history_available, false);
  assert.deepEqual(history.filters, {
    source_folder_name: "课程",
    preprocess_status: "ready",
    event_type: "completed"
  });
  assert.equal(historyReadiness.ready_for_process_history, true);
  assert.equal(historyReadiness.scan_mode, "no-scan");
  assert.deepEqual(calls, [
    {
      name: "detail",
      input: {
        libraryRoot: "/tmp/PublicLibrary",
        sourceVideoId: "V000123"
      }
    },
    {
      name: "job-log",
      input: {
        libraryRoot: "/tmp/PublicLibrary",
        sourceVideoId: "V000123"
      }
    },
    {
      name: "safety",
      input: apiInput
    },
    {
      name: "library",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "history",
      input: {
        library_root: "/tmp/PublicLibrary",
        library,
        now: "2026-06-26T23:12:00.000Z",
        window_days: 7,
        limit: 25,
        filters: {
          source_folder_name: "课程",
          preprocess_status: "ready",
          event_type: "completed"
        }
      }
    },
    {
      name: "library",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "readiness",
      input: {
        library_root: "/tmp/PublicLibrary",
        library
      }
    }
  ]);
});

test("preprocess read route server deps project supervisor status and keep safety processing guard enabled", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const processHistoryDeps: AdminPreprocessProcessHistoryQueryDeps = {
    async read_library_manifest(libraryRoot) {
      calls.push({ name: "library", input: libraryRoot });
      return library;
    },
    async read_process_history_from_store(input) {
      calls.push({ name: "history", input });
      return null;
    },
    async read_process_history_readiness_from_store(input) {
      calls.push({ name: "readiness", input });
      return readiness();
    }
  };

  const deps = createAdminPreprocessReadRouteServerDeps<
    TestApiInput,
    TestSourceVideoDetail,
    TestJobLog,
    TestSupervisor,
    TestPublicSupervisor,
    TestSafety
  >({
    ...processHistoryDeps,
    async read_source_video_detail(libraryRoot, sourceVideoId) {
      calls.push({ name: "detail", input: { libraryRoot, sourceVideoId } });
      return {
        source_video_id: sourceVideoId
      };
    },
    async read_preprocess_job_log(libraryRoot, sourceVideoId) {
      calls.push({ name: "job-log", input: { libraryRoot, sourceVideoId } });
      return {
        log_path: `${libraryRoot}/${sourceVideoId}.log`
      };
    },
    read_preprocess_supervisor_status() {
      calls.push({ name: "supervisor-runtime", input: null });
      return {
        state: "running"
      };
    },
    to_public_preprocess_supervisor_status(status) {
      calls.push({ name: "supervisor-public", input: status });
      return {
        public_state: status.state
      };
    },
    async read_preprocess_safety(input) {
      calls.push({ name: "safety", input });
      return {
        status: input.include_processing_guard ? "healthy" : "blocked"
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-server"
  };

  const supervisor = deps.read_preprocess_supervisor_status();
  const safety = await deps.read_preprocess_safety(apiInput);
  const historyReadiness = await deps.read_preprocess_process_history_readiness(apiInput);

  assert.deepEqual(supervisor, {
    public_state: "running"
  });
  assert.deepEqual(safety, {
    status: "healthy"
  });
  assert.equal(historyReadiness.ready_for_process_history, true);
  assert.deepEqual(calls, [
    {
      name: "supervisor-runtime",
      input: null
    },
    {
      name: "supervisor-public",
      input: {
        state: "running"
      }
    },
    {
      name: "safety",
      input: {
        api_input: apiInput,
        include_processing_guard: true
      }
    },
    {
      name: "library",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "readiness",
      input: {
        library_root: "/tmp/PublicLibrary",
        library
      }
    }
  ]);
});
