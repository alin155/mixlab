import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminPreprocessReadRoutes,
  type AdminPreprocessReadRouteApiInput,
  type AdminPreprocessReadRouteDeps
} from "./admin-preprocess-read-routes.ts";

interface TestApiInput extends AdminPreprocessReadRouteApiInput {
  now: string;
}

interface TestSourceVideoDetail {
  source_video_id: string;
}

interface TestJobLog {
  log_path: string;
  entries: string[];
}

interface TestSupervisorStatus {
  state: "idle" | "running";
}

interface TestSafety {
  status: "healthy" | "blocked";
  checked_at: string;
}

interface TestProcessHistory {
  now: string;
  window_days: number;
  limit: number;
  source_folder_name: string;
  preprocess_status: string;
  event_type: string;
}

interface TestProcessHistoryReadiness {
  ready_for_process_history: boolean;
  reason: string;
}

function makeDeps(
  overrides: Partial<AdminPreprocessReadRouteDeps<
    TestApiInput,
    TestSourceVideoDetail,
    TestJobLog,
    TestSupervisorStatus,
    TestSafety,
    TestProcessHistory,
    TestProcessHistoryReadiness
  >> = {}
): AdminPreprocessReadRouteDeps<
  TestApiInput,
  TestSourceVideoDetail,
  TestJobLog,
  TestSupervisorStatus,
  TestSafety,
  TestProcessHistory,
  TestProcessHistoryReadiness
> {
  return {
    read_source_video_detail: async (_libraryRoot, sourceVideoId) => ({
      source_video_id: sourceVideoId
    }),
    read_preprocess_job_log: async (_libraryRoot, sourceVideoId) => ({
      log_path: `.mixlab-library/videos/${sourceVideoId}/preprocess.log`,
      entries: [`${sourceVideoId}:ok`]
    }),
    read_preprocess_supervisor_status: () => ({
      state: "idle"
    }),
    read_preprocess_safety: async (input) => ({
      status: "healthy",
      checked_at: input.now
    }),
    read_preprocess_process_history: async (_input, options) => ({
      now: options.now,
      window_days: options.window_days,
      limit: options.limit,
      source_folder_name: options.source_folder_name,
      preprocess_status: options.preprocess_status,
      event_type: options.event_type
    }),
    read_preprocess_process_history_readiness: async () => ({
      ready_for_process_history: false,
      reason: "snapshot_incomplete"
    }),
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  searchParams?: URLSearchParams;
  deps?: AdminPreprocessReadRouteDeps<
    TestApiInput,
    TestSourceVideoDetail,
    TestJobLog,
    TestSupervisorStatus,
    TestSafety,
    TestProcessHistory,
    TestProcessHistoryReadiness
  >;
}) {
  return handleAdminPreprocessReadRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: input.searchParams,
    request_now: "2026-06-25T00:00:00.000Z",
    api_input: {
      library_root: "/tmp/PublicLibrary",
      now: "2026-06-25T00:00:00.000Z"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("preprocess read routes handle job logs for existing task records", async () => {
  let capturedLibraryRoot = "";
  let capturedSourceVideoId = "";
  const result = await callRoute({
    pathname: "/api/admin/preprocess/jobs/J000123/log",
    deps: makeDeps({
      read_preprocess_job_log: async (libraryRoot, sourceVideoId) => {
        capturedLibraryRoot = libraryRoot;
        capturedSourceVideoId = sourceVideoId;
        return {
          log_path: "job.log",
          entries: ["started", "done"]
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(capturedLibraryRoot, "/tmp/PublicLibrary");
  assert.equal(capturedSourceVideoId, "V000123");
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      job_id: "J000123",
      log_path: "job.log",
      entries: ["started", "done"]
    }
  });
});

test("preprocess read routes return not found for missing valid-shaped job records", async () => {
  const result = await callRoute({
    pathname: "/api/admin/preprocess/jobs/J000404/log",
    deps: makeDeps({
      read_source_video_detail: async () => null
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.equal(result.status_code, 404);
  assert.deepEqual(result.body, {
    ok: false,
    error_code: "not_found",
    message: "预处理任务不存在"
  });
});

test("preprocess read routes handle supervisor status and safety", async () => {
  const supervisor = await callRoute({
    pathname: "/api/admin/preprocess/supervisor/status",
    deps: makeDeps({
      read_preprocess_supervisor_status: () => ({
        state: "running"
      })
    })
  });

  assert.equal(supervisor.handled, true);
  if (supervisor.handled) {
    assert.deepEqual(supervisor.body, {
      ok: true,
      data: {
        state: "running"
      }
    });
  }

  let capturedInput: TestApiInput | undefined;
  const safety = await callRoute({
    pathname: "/api/admin/preprocess/safety",
    deps: makeDeps({
      read_preprocess_safety: async (input) => {
        capturedInput = input;
        return {
          status: "blocked",
          checked_at: input.now
        };
      }
    })
  });

  assert.deepEqual(capturedInput, {
    library_root: "/tmp/PublicLibrary",
    now: "2026-06-25T00:00:00.000Z"
  });
  assert.equal(safety.handled, true);
  if (safety.handled) {
    assert.deepEqual(safety.body, {
      ok: true,
      data: {
        status: "blocked",
        checked_at: "2026-06-25T00:00:00.000Z"
      }
    });
  }
});

test("preprocess read routes expose bounded process history options", async () => {
  let capturedInput: TestApiInput | undefined;
  let capturedOptions: TestProcessHistory | undefined;
  const result = await callRoute({
    pathname: "/api/admin/preprocess/process-history",
    searchParams: new URLSearchParams(
      "limit=999&window_days=0&source_folder_name=%E8%AF%BE%E7%A8%8B&preprocess_status=failed&event_type=failed"
    ),
    deps: makeDeps({
      read_preprocess_process_history: async (input, options) => {
        capturedInput = input;
        capturedOptions = options;
        return {
          now: options.now,
          window_days: options.window_days,
          limit: options.limit,
          source_folder_name: options.source_folder_name,
          preprocess_status: options.preprocess_status,
          event_type: options.event_type
        };
      }
    })
  });

  assert.deepEqual(capturedInput, {
    library_root: "/tmp/PublicLibrary",
    now: "2026-06-25T00:00:00.000Z"
  });
  assert.deepEqual(capturedOptions, {
    now: "2026-06-25T00:00:00.000Z",
    window_days: 1,
    limit: 200,
    source_folder_name: "课程",
    preprocess_status: "failed",
    event_type: "failed"
  });
  assert.equal(result.handled, true);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        now: "2026-06-25T00:00:00.000Z",
        window_days: 1,
        limit: 200,
        source_folder_name: "课程",
        preprocess_status: "failed",
        event_type: "failed"
      }
    });
  }
});

test("preprocess read routes drop unsupported process history filters", async () => {
  let capturedOptions: TestProcessHistory | undefined;
  await callRoute({
    pathname: "/api/admin/preprocess/process-history",
    searchParams: new URLSearchParams(
      "source_folder_name=%20%E8%B6%85%E9%95%BF%E8%AF%BE%E7%A8%8B%20&preprocess_status=deleted&event_type=scan"
    ),
    deps: makeDeps({
      read_preprocess_process_history: async (_input, options) => {
        capturedOptions = {
          now: options.now,
          window_days: options.window_days,
          limit: options.limit,
          source_folder_name: options.source_folder_name,
          preprocess_status: options.preprocess_status,
          event_type: options.event_type
        };
        return capturedOptions;
      }
    })
  });

  assert.deepEqual(capturedOptions, {
    now: "2026-06-25T00:00:00.000Z",
    window_days: 30,
    limit: 50,
    source_folder_name: "超长课程",
    preprocess_status: "",
    event_type: ""
  });
});

test("preprocess read routes expose process history readiness without query bounds", async () => {
  let capturedInput: TestApiInput | undefined;
  const result = await callRoute({
    pathname: "/api/admin/preprocess/process-history/readiness",
    deps: makeDeps({
      read_preprocess_process_history_readiness: async (input) => {
        capturedInput = input;
        return {
          ready_for_process_history: true,
          reason: "ready"
        };
      }
    })
  });

  assert.deepEqual(capturedInput, {
    library_root: "/tmp/PublicLibrary",
    now: "2026-06-25T00:00:00.000Z"
  });
  assert.equal(result.handled, true);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        ready_for_process_history: true,
        reason: "ready"
      }
    });
  }
});

test("preprocess read routes ignore unrelated malformed and non-get routes", async () => {
  assert.deepEqual(await callRoute({ pathname: "/api/admin/preprocess/jobs/JABC/log" }), {
    handled: false
  });
  assert.deepEqual(await callRoute({ pathname: "/api/admin/preprocess/jobs" }), {
    handled: false
  });
  assert.deepEqual(await callRoute({ method: "POST", pathname: "/api/admin/preprocess/supervisor/status" }), {
    handled: false
  });
});
