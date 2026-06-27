import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminPreprocessCommandRoutes,
  matchAdminPreprocessQueueUnprocessedPath,
  matchAdminPreprocessRecoverProcessingPath,
  matchAdminPreprocessRetryFailedPath,
  matchAdminPreprocessSupervisorStartPath,
  matchAdminPreprocessSupervisorStopPath,
  type AdminBulkPreprocessRouteCommand,
  type AdminBulkPreprocessRouteCommandInput,
  type AdminBulkPreprocessRouteResult,
  type AdminPreprocessCommandRouteApiInput,
  type AdminPreprocessCommandRouteDeps,
  type AdminPreprocessSupervisorStartInput
} from "./admin-preprocess-command-routes.ts";

interface TestApiInput extends AdminPreprocessCommandRouteApiInput {
  request_id: string;
}

interface TestRuntimePolicy {
  concurrency: number;
}

type TestSafety = Record<string, unknown> & {
  safe_to_start: boolean;
  blockers: Array<{ code: string; message: string }>;
};

interface TestSupervisorStatus {
  state: "idle" | "running" | "stopping";
  state_label: string;
}

interface TestBulkTransitionResult extends AdminBulkPreprocessRouteResult {
  affected_count: number;
  source_video_ids: string[];
}

function makeDeps(
  overrides: Partial<AdminPreprocessCommandRouteDeps<
    TestApiInput,
    TestRuntimePolicy,
    TestSafety,
    TestSupervisorStatus,
    TestBulkTransitionResult
  >> = {}
): AdminPreprocessCommandRouteDeps<
  TestApiInput,
  TestRuntimePolicy,
  TestSafety,
  TestSupervisorStatus,
  TestBulkTransitionResult
> {
  return {
    read_request_json: async () => ({
      limit: 1
    }),
    read_admin_settings: async () => ({
      runtime_policy: {
        concurrency: 1
      }
    }),
    refresh_runtime_secrets: async () => undefined,
    assert_real_preprocess_start_ready: () => undefined,
    read_preprocess_safety: async () => ({
      safe_to_start: true,
      blockers: []
    }),
    assert_preprocess_safe_to_start: () => undefined,
    start_preprocess_supervisor: () => ({
      state: "running",
      state_label: "运行中"
    }),
    stop_preprocess_supervisor: () => ({
      state: "idle",
      state_label: "未运行"
    }),
    run_bulk_transition_command: async () => ({
      affected_count: 1,
      source_video_ids: ["V000001"]
    }),
    read_preprocess_supervisor_status: () => ({
      state: "idle"
    }),
    recover_processing_supervisor_block: () => null,
    clear_source_video_page_cache: () => undefined,
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: AdminPreprocessCommandRouteDeps<
    TestApiInput,
    TestRuntimePolicy,
    TestSafety,
    TestSupervisorStatus,
    TestBulkTransitionResult
  >;
}) {
  return handleAdminPreprocessCommandRoutes({
    method: input.method ?? "POST",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("preprocess command routes dispatch bulk queue and retry commands without changing response shape", async () => {
  const calls: Array<AdminBulkPreprocessRouteCommandInput<TestApiInput>> = [];
  const cleared: string[] = [];
  const deps = makeDeps({
    run_bulk_transition_command: async (input) => {
      calls.push(input);
      return {
        affected_count: input.command === "preprocess-queue-unprocessed" ? 2 : 1,
        source_video_ids: input.command === "preprocess-queue-unprocessed"
          ? ["V000001", "V000002"]
          : ["V000003"]
      };
    },
    clear_source_video_page_cache: (libraryRoot) => {
      cleared.push(libraryRoot);
    }
  });

  const queued = await callRoute({
    pathname: "/api/admin/preprocess/queue-unprocessed",
    deps
  });
  const retried = await callRoute({
    pathname: "/api/admin/preprocess/retry-failed",
    deps
  });

  assert.equal(queued.handled, true);
  assert.equal(retried.handled, true);
  assert.deepEqual(calls.map((call) => ({
    api_input: call.api_input,
    command: call.command
  })), [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      command: "preprocess-queue-unprocessed"
    },
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      command: "preprocess-retry-failed"
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary", "/tmp/PublicLibrary"]);
  if (queued.handled) {
    assert.equal(queued.status_code, 200);
    assert.deepEqual(queued.body, {
      ok: true,
      data: {
        affected_count: 2,
        source_video_ids: ["V000001", "V000002"]
      }
    });
  }
  if (retried.handled) {
    assert.equal(retried.status_code, 200);
    assert.deepEqual(retried.body, {
      ok: true,
      data: {
        affected_count: 1,
        source_video_ids: ["V000003"]
      }
    });
  }
});

test("preprocess command routes recover processing checks supervisor block before command", async () => {
  let commandCalls = 0;
  let cacheClears = 0;
  const blocked = await callRoute({
    pathname: "/api/admin/preprocess/recover-processing",
    deps: makeDeps({
      read_preprocess_supervisor_status: () => ({
        state: "running"
      }),
      recover_processing_supervisor_block: (input) => input.supervisor_state === "running"
        ? {
            error_code: "invalid_request",
            message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
          }
        : null,
      run_bulk_transition_command: async () => {
        commandCalls += 1;
        return {
          affected_count: 1,
          source_video_ids: ["V000004"]
        };
      },
      clear_source_video_page_cache: () => {
        cacheClears += 1;
      }
    })
  });

  assert.equal(blocked.handled, true);
  assert.equal(commandCalls, 0);
  assert.equal(cacheClears, 0);
  if (blocked.handled) {
    assert.equal(blocked.status_code, 409);
    assert.deepEqual(blocked.body, {
      ok: false,
      error_code: "invalid_request",
      message: "预处理流水线仍在运行，不能恢复正在处理的任务。"
    });
  }
});

test("preprocess command routes recover processing adds previous user-facing message", async () => {
  const commands: AdminBulkPreprocessRouteCommand[] = [];
  const cleared: string[] = [];
  const recovered = await callRoute({
    pathname: "/api/admin/preprocess/recover-processing",
    deps: makeDeps({
      run_bulk_transition_command: async (input) => {
        commands.push(input.command);
        return {
          affected_count: 3,
          source_video_ids: ["V000004", "V000005", "V000006"]
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });
  const none = await callRoute({
    pathname: "/api/admin/preprocess/recover-processing",
    deps: makeDeps({
      run_bulk_transition_command: async (input) => {
        commands.push(input.command);
        return {
          affected_count: 0,
          source_video_ids: []
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.deepEqual(commands, ["preprocess-recover-processing", "preprocess-recover-processing"]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary", "/tmp/PublicLibrary"]);
  assert.equal(recovered.handled, true);
  assert.equal(none.handled, true);
  if (recovered.handled) {
    assert.equal(recovered.status_code, 200);
    assert.deepEqual(recovered.body, {
      ok: true,
      data: {
        affected_count: 3,
        source_video_ids: ["V000004", "V000005", "V000006"],
        message: "已恢复 3 个停滞中的处理任务。"
      }
    });
  }
  if (none.handled) {
    assert.equal(none.status_code, 200);
    assert.deepEqual(none.body, {
      ok: true,
      data: {
        affected_count: 0,
        source_video_ids: [],
        message: "没有需要恢复的处理中任务。"
      }
    });
  }
});

test("preprocess command routes leave cache untouched when bulk command fails", async () => {
  let cacheClears = 0;
  await assert.rejects(
    callRoute({
      pathname: "/api/admin/preprocess/queue-unprocessed",
      deps: makeDeps({
        run_bulk_transition_command: async () => {
          throw new Error("writer lease unavailable");
        },
        clear_source_video_page_cache: () => {
          cacheClears += 1;
        }
      })
    }),
    /writer lease unavailable/
  );
  assert.equal(cacheClears, 0);
});

test("preprocess command routes start supervisor after settings secrets and safety gates", async () => {
  const events: string[] = [];
  let startInput: AdminPreprocessSupervisorStartInput<TestRuntimePolicy> | undefined;
  let safetyInput: TestApiInput | undefined;
  const result = await callRoute({
    pathname: "/api/admin/preprocess/supervisor/start",
    deps: makeDeps({
      read_request_json: async () => {
        events.push("read-body");
        return {
          limit: 2
        };
      },
      read_admin_settings: async (libraryRoot) => {
        events.push(`settings:${libraryRoot}`);
        return {
          runtime_policy: {
            concurrency: 3
          }
        };
      },
      refresh_runtime_secrets: async () => {
        events.push("refresh-secrets");
      },
      assert_real_preprocess_start_ready: () => {
        events.push("real-ready");
      },
      read_preprocess_safety: async (input) => {
        events.push("safety");
        safetyInput = input;
        return {
          safe_to_start: true,
          blockers: []
        };
      },
      assert_preprocess_safe_to_start: () => {
        events.push("assert-safe");
      },
      start_preprocess_supervisor: (input) => {
        events.push("start");
        startInput = input;
        return {
          state: "running",
          state_label: "运行中"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(events, [
    "read-body",
    "settings:/tmp/PublicLibrary",
    "refresh-secrets",
    "real-ready",
    "safety",
    "assert-safe",
    "start"
  ]);
  assert.deepEqual(safetyInput, {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  });
  assert.deepEqual(startInput, {
    limit: 2,
    runtime_policy: {
      concurrency: 3
    }
  });
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        state: "running",
        state_label: "运行中"
      }
    });
  }
});

test("preprocess command routes block supervisor start when safety gate fails", async () => {
  let startCalls = 0;
  const result = await callRoute({
    pathname: "/api/admin/preprocess/supervisor/start",
    deps: makeDeps({
      read_preprocess_safety: async () => ({
        safe_to_start: false,
        blockers: [
          {
            code: "processing-needs-recovery",
            message: "V001440 需要恢复"
          }
        ]
      }),
      assert_preprocess_safe_to_start: () => {
        throw new Error("V001440 需要恢复后才能启动");
      },
      start_preprocess_supervisor: () => {
        startCalls += 1;
        return {
          state: "running",
          state_label: "运行中"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.equal(startCalls, 0);
  if (result.handled) {
    assert.equal(result.status_code, 409);
    assert.deepEqual(result.body, {
      ok: false,
      error_code: "preprocess_start_blocked",
      message: "V001440 需要恢复后才能启动",
      details: {
        safety: {
          safe_to_start: false,
          blockers: [
            {
              code: "processing-needs-recovery",
              message: "V001440 需要恢复"
            }
          ]
        }
      }
    });
  }
});

test("preprocess command routes preserve invalid-request behavior for start failures", async () => {
  const invalidLimit = await callRoute({
    pathname: "/api/admin/preprocess/supervisor/start",
    deps: makeDeps({
      read_request_json: async () => ({
        limit: 0
      })
    })
  });

  assert.equal(invalidLimit.handled, true);
  if (invalidLimit.handled) {
    assert.equal(invalidLimit.status_code, 400);
    assert.deepEqual(invalidLimit.body, {
      ok: false,
      error_code: "invalid_request",
      message: "本次限制必须是正整数"
    });
  }

  const missingAsrKey = await callRoute({
    pathname: "/api/admin/preprocess/supervisor/start",
    deps: makeDeps({
      assert_real_preprocess_start_ready: () => {
        throw new Error("语音识别接口密钥未配置，无法启动真实预处理服务");
      }
    })
  });

  assert.equal(missingAsrKey.handled, true);
  if (missingAsrKey.handled) {
    assert.equal(missingAsrKey.status_code, 400);
    assert.deepEqual(missingAsrKey.body, {
      ok: false,
      error_code: "invalid_request",
      message: "语音识别接口密钥未配置，无法启动真实预处理服务"
    });
  }
});

test("preprocess command routes stop supervisor and ignore unrelated routes", async () => {
  const stop = await callRoute({
    pathname: "/api/admin/preprocess/supervisor/stop",
    deps: makeDeps({
      stop_preprocess_supervisor: () => ({
        state: "stopping",
        state_label: "停止中"
      })
    })
  });

  assert.equal(stop.handled, true);
  if (stop.handled) {
    assert.equal(stop.status_code, 200);
    assert.deepEqual(stop.body, {
      ok: true,
      data: {
        state: "stopping",
        state_label: "停止中"
      }
    });
  }

  assert.equal(matchAdminPreprocessSupervisorStartPath("/api/admin/preprocess/supervisor/start"), true);
  assert.equal(matchAdminPreprocessSupervisorStopPath("/api/admin/preprocess/supervisor/stop"), true);
  assert.equal(matchAdminPreprocessQueueUnprocessedPath("/api/admin/preprocess/queue-unprocessed"), true);
  assert.equal(matchAdminPreprocessRetryFailedPath("/api/admin/preprocess/retry-failed"), true);
  assert.equal(matchAdminPreprocessRecoverProcessingPath("/api/admin/preprocess/recover-processing"), true);
  assert.equal(matchAdminPreprocessSupervisorStartPath("/api/admin/preprocess/supervisor/start/now"), false);
  assert.equal(matchAdminPreprocessSupervisorStopPath("/api/admin/preprocess/supervisor"), false);
  assert.equal(matchAdminPreprocessQueueUnprocessedPath("/api/admin/preprocess/queue"), false);
  assert.equal(matchAdminPreprocessRetryFailedPath("/api/admin/preprocess/retry"), false);
  assert.equal(matchAdminPreprocessRecoverProcessingPath("/api/admin/preprocess/recover-processing/V000001"), false);
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/preprocess/supervisor/start"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/preprocess/queue-unprocessed"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    pathname: "/api/admin/preprocess/jobs/J000001/log"
  }), {
    handled: false
  });
});
