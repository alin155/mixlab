import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminLibraryCommandRoutes,
  matchAdminLibraryInitPath,
  matchAdminLibraryScanApplyPath,
  matchAdminLibraryScanPreviewPath,
  type AdminLibraryCommandRouteCommandInput,
  type AdminLibraryCommandRouteDeps
} from "./admin-library-command-routes.ts";
import { AdminScanApplyBlockedError } from "./admin-scan-planner.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestLibraryManifest {
  library_id: string;
  name: string;
  video_count: number;
}

interface TestScanPreview {
  blocked: boolean;
  inactive_ready_count: number;
}

interface TestReadModelHandoff {
  command: string;
  stale_mark: {
    applied: boolean;
  };
}

interface TestScanApplyResult {
  total_video_count: number;
  new_video_count: number;
  read_model: TestReadModelHandoff | null;
}

interface TestReconcileSchedule {
  policy: string;
  requested: boolean;
}

type TestDeps = AdminLibraryCommandRouteDeps<
  TestApiInput,
  TestLibraryManifest,
  TestScanPreview,
  TestReadModelHandoff,
  TestScanApplyResult,
  TestReconcileSchedule
>;

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    run_library_init_command: async () => ({
      library_id: "lib_main_001",
      name: "测试素材库",
      video_count: 0
    }),
    run_library_scan_apply_command: async () => ({
      total_video_count: 1,
      new_video_count: 1,
      read_model: {
        command: "library-scan",
        stale_mark: {
          applied: true
        }
      }
    }),
    run_library_scan_preview_command: async () => ({
      blocked: false,
      inactive_ready_count: 0
    }),
    schedule_read_model_reconcile_after_scan: () => ({
      policy: "post-scan-reconcile-v1",
      requested: true
    }),
    clear_source_video_page_cache: () => undefined,
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: TestDeps;
}) {
  return handleAdminLibraryCommandRoutes({
    method: input.method ?? "POST",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("library command routes match only command endpoints", () => {
  assert.equal(matchAdminLibraryInitPath("/api/admin/library/init"), true);
  assert.equal(matchAdminLibraryInitPath("/api/admin/library/init/extra"), false);
  assert.equal(matchAdminLibraryScanApplyPath("/api/admin/library/scan"), true);
  assert.equal(matchAdminLibraryScanApplyPath("/api/admin/library/scan-preview"), false);
  assert.equal(matchAdminLibraryScanPreviewPath("/api/admin/library/scan-preview"), true);
});

test("library init route dispatches through injected command service and clears source-video caches", async () => {
  const initCalls: Array<AdminLibraryCommandRouteCommandInput<TestApiInput>> = [];
  const cleared: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/library/init",
    deps: makeDeps({
      run_library_init_command: async (input) => {
        initCalls.push(input);
        return {
          library_id: "lib_main_001",
          name: "测试素材库",
          video_count: 0
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(initCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      }
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      library_id: "lib_main_001",
      name: "测试素材库",
      video_count: 0
    }
  });
});

test("library scan route schedules read-model reconcile and returns the preserved handoff shape", async () => {
  const scanCalls: Array<AdminLibraryCommandRouteCommandInput<TestApiInput>> = [];
  const scheduled: Array<TestReadModelHandoff | null> = [];
  const cleared: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/library/scan",
    deps: makeDeps({
      run_library_scan_apply_command: async (input) => {
        scanCalls.push(input);
        return {
          total_video_count: 2,
          new_video_count: 1,
          read_model: {
            command: "library-scan",
            stale_mark: {
              applied: true
            }
          }
        };
      },
      schedule_read_model_reconcile_after_scan: ({ handoff }) => {
        scheduled.push(handoff);
        return {
          policy: "post-scan-reconcile-v1",
          requested: true
        };
      },
      clear_source_video_page_cache: (libraryRoot) => {
        cleared.push(libraryRoot);
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(scanCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      }
    }
  ]);
  assert.deepEqual(scheduled, [
    {
      command: "library-scan",
      stale_mark: {
        applied: true
      }
    }
  ]);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      total_video_count: 2,
      new_video_count: 1,
      read_model: {
        command: "library-scan",
        stale_mark: {
          applied: true
        },
        reconcile_schedule: {
          policy: "post-scan-reconcile-v1",
          requested: true
        }
      }
    }
  });
});

test("library scan route preserves null read-model handoff scheduling behavior", async () => {
  const scheduled: Array<TestReadModelHandoff | null> = [];
  const result = await callRoute({
    pathname: "/api/admin/library/scan",
    deps: makeDeps({
      run_library_scan_apply_command: async () => ({
        total_video_count: 0,
        new_video_count: 0,
        read_model: null
      }),
      schedule_read_model_reconcile_after_scan: ({ handoff }) => {
        scheduled.push(handoff);
        return {
          policy: "post-scan-reconcile-v1",
          requested: false
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(scheduled, [null]);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        total_video_count: 0,
        new_video_count: 0,
        read_model: null
      }
    });
  }
});

test("library scan route maps scan-apply protection blocks to conflict responses", async () => {
  const preview = {
    blocked: true,
    inactive_ready_count: 1
  };
  let clearCalls = 0;
  const result = await callRoute({
    pathname: "/api/admin/library/scan",
    deps: makeDeps({
      run_library_scan_apply_command: async () => {
        throw new AdminScanApplyBlockedError("扫描会移除已就绪素材", preview as never);
      },
      clear_source_video_page_cache: () => {
        clearCalls += 1;
      }
    })
  });

  assert.equal(result.handled, true);
  assert.equal(clearCalls, 0);
  if (result.handled) {
    assert.equal(result.status_code, 409);
    assert.deepEqual(result.body, {
      ok: false,
      error_code: "scan_blocked",
      message: "扫描会移除已就绪素材",
      details: {
        preview
      }
    });
  }
});

test("library command routes map docker mvp command blocks without cache side effects", async () => {
  const details = {
    mode: "v0.1",
    command: "library-init",
    policy: "docker-mvp-v0.1",
    allowed_surface: ["管理端登录", "剪辑师管理", "受控预处理队列"]
  };
  let clearCalls = 0;
  const init = await callRoute({
    pathname: "/api/admin/library/init",
    deps: makeDeps({
      run_library_init_command: async () => {
        throw Object.assign(new Error("Docker MVP v0.1 已阻断高风险管理端命令：library-init"), {
          code: "admin_mvp_command_blocked",
          details
        });
      },
      clear_source_video_page_cache: () => {
        clearCalls += 1;
      }
    })
  });
  const scan = await callRoute({
    pathname: "/api/admin/library/scan",
    deps: makeDeps({
      run_library_scan_apply_command: async () => {
        throw Object.assign(new Error("Docker MVP v0.1 已阻断高风险管理端命令：library-scan"), {
          code: "admin_mvp_command_blocked",
          details: {
            ...details,
            command: "library-scan"
          }
        });
      },
      schedule_read_model_reconcile_after_scan: () => {
        throw new Error("reconcile should not be scheduled");
      },
      clear_source_video_page_cache: () => {
        clearCalls += 1;
      }
    })
  });

  for (const result of [init, scan]) {
    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.status_code, 409);
      assert.equal(result.body.ok, false);
      assert.equal(result.body.error_code, "admin_mvp_command_blocked");
    }
  }
  assert.equal(clearCalls, 0);
});

test("library scan route preserves unexpected error bubbling", async () => {
  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/library/scan",
      deps: makeDeps({
        run_library_scan_apply_command: async () => {
          throw new Error("unexpected scan failure");
        }
      })
    }),
    /unexpected scan failure/
  );
});

test("library scan-preview route dispatches without scheduling or cache clearing", async () => {
  const previewCalls: Array<AdminLibraryCommandRouteCommandInput<TestApiInput>> = [];
  let scheduleCalls = 0;
  let clearCalls = 0;
  const result = await callRoute({
    pathname: "/api/admin/library/scan-preview",
    deps: makeDeps({
      run_library_scan_preview_command: async (input) => {
        previewCalls.push(input);
        return {
          blocked: true,
          inactive_ready_count: 1
        };
      },
      schedule_read_model_reconcile_after_scan: () => {
        scheduleCalls += 1;
        return {
          policy: "post-scan-reconcile-v1",
          requested: false
        };
      },
      clear_source_video_page_cache: () => {
        clearCalls += 1;
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(previewCalls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      }
    }
  ]);
  assert.equal(scheduleCalls, 0);
  assert.equal(clearCalls, 0);
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        blocked: true,
        inactive_ready_count: 1
      }
    });
  }
});

test("library command routes ignore reads wrong methods and unrelated paths", async () => {
  let commandCalls = 0;
  const deps = makeDeps({
    run_library_init_command: async () => {
      commandCalls += 1;
      return {
        library_id: "lib_main_001",
        name: "测试素材库",
        video_count: 0
      };
    },
    run_library_scan_apply_command: async () => {
      commandCalls += 1;
      return {
        total_video_count: 0,
        new_video_count: 0,
        read_model: null
      };
    },
    run_library_scan_preview_command: async () => {
      commandCalls += 1;
      return {
        blocked: false,
        inactive_ready_count: 0
      };
    }
  });

  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/library/init",
    deps
  }), { handled: false });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/library/scan",
    deps
  }), { handled: false });
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/library/scan/extra",
    deps
  }), { handled: false });
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/other",
    deps
  }), { handled: false });
  assert.equal(commandCalls, 0);
});
