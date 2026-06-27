import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminCutterUserCommandRoutes,
  matchAdminCutterUserApprovePath,
  matchAdminCutterUserDisablePath,
  matchAdminCutterUserPasswordPath,
  type AdminCutterUserApproveRouteCommandInput,
  type AdminCutterUserCommandRouteDeps,
  type AdminCutterUserDisableRouteCommandInput,
  type AdminCutterUserPasswordRouteCommandInput
} from "./admin-cutter-user-command-routes.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestApprovalResult {
  status: "approved";
  user: {
    user_id: string;
    status: "approved";
  };
  session: {
    user_id: string;
    device_id: string;
  };
}

interface TestPublicUser {
  user_id: string;
  status: "approved" | "disabled";
}

type TestDeps = AdminCutterUserCommandRouteDeps<TestApiInput, TestApprovalResult, TestPublicUser>;

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    read_request_json: async () => ({ new_password: "Cutter67890" }),
    run_approve_cutter_user: async ({ user_id }) => ({
      status: "approved",
      user: {
        user_id,
        status: "approved"
      },
      session: {
        user_id,
        device_id: "device-a"
      }
    }),
    run_disable_cutter_user: async ({ user_id }) => ({
      user_id,
      status: "disabled"
    }),
    run_reset_cutter_user_password: async ({ user_id }) => ({
      user_id,
      status: "approved"
    }),
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: TestDeps;
}) {
  return handleAdminCutterUserCommandRoutes({
    method: input.method ?? "POST",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      request_id: "req-1"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("cutter user command routes match only expected mutation endpoints", async () => {
  assert.equal(matchAdminCutterUserApprovePath("/api/admin/cutter-users/CU000001/approve"), "CU000001");
  assert.equal(matchAdminCutterUserApprovePath("/api/admin/cutter-users/CU1000000000000/approve"), "CU1000000000000");
  assert.equal(matchAdminCutterUserApprovePath("/api/admin/cutter-users/C000001/approve"), null);
  assert.equal(matchAdminCutterUserApprovePath("/api/admin/cutter-users/CU000001/approve/extra"), null);

  assert.equal(matchAdminCutterUserDisablePath("/api/admin/cutter-users/CU000001/disable"), "CU000001");
  assert.equal(matchAdminCutterUserPasswordPath("/api/admin/cutter-users/CU000001/password"), "CU000001");

  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/cutter-users/CU000001/approve"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    pathname: "/api/admin/cutter-users/CU000001"
  }), {
    handled: false
  });
});

test("approve route dispatches through injected command service", async () => {
  const calls: Array<AdminCutterUserApproveRouteCommandInput<TestApiInput>> = [];
  const result = await callRoute({
    pathname: "/api/admin/cutter-users/CU1000000000000/approve",
    deps: makeDeps({
      run_approve_cutter_user: async (input) => {
        calls.push(input);
        return {
          status: "approved",
          user: {
            user_id: input.user_id,
            status: "approved"
          },
          session: {
            user_id: input.user_id,
            device_id: "device-b"
          }
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(calls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      user_id: "CU1000000000000"
    }
  ]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      status: "approved",
      user: {
        user_id: "CU1000000000000",
        status: "approved"
      },
      session: {
        user_id: "CU1000000000000",
        device_id: "device-b"
      }
    }
  });
});

test("approve route maps known domain errors and bubbles unknown failures", async () => {
  for (const [message, statusCode, errorCode] of [
    ["剪辑师用户不存在", 404, "not_found"],
    ["只有待审核剪辑师用户可以通过审核", 400, "invalid_request"],
    ["剪辑师设备不存在", 400, "invalid_request"]
  ] as const) {
    const result = await callRoute({
      pathname: "/api/admin/cutter-users/CU000001/approve",
      deps: makeDeps({
        run_approve_cutter_user: async () => {
          throw new Error(message);
        }
      })
    });
    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.status_code, statusCode);
      assert.deepEqual(result.body, {
        ok: false,
        error_code: errorCode,
        message
      });
    }
  }

  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/cutter-users/CU000001/approve",
      deps: makeDeps({
        run_approve_cutter_user: async () => {
          throw new Error("storage write failed");
        }
      })
    }),
    /storage write failed/
  );
});

test("disable route dispatches and maps not found", async () => {
  const calls: Array<AdminCutterUserDisableRouteCommandInput<TestApiInput>> = [];
  const result = await callRoute({
    pathname: "/api/admin/cutter-users/CU000002/disable",
    deps: makeDeps({
      run_disable_cutter_user: async (input) => {
        calls.push(input);
        return {
          user_id: input.user_id,
          status: "disabled"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.deepEqual(calls, [
      {
        api_input: {
          library_root: "/tmp/PublicLibrary",
          request_id: "req-1"
        },
        user_id: "CU000002"
      }
    ]);
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        user_id: "CU000002",
        status: "disabled"
      }
    });
  }

  const notFound = await callRoute({
    pathname: "/api/admin/cutter-users/CU000002/disable",
    deps: makeDeps({
      run_disable_cutter_user: async () => {
        throw new Error("剪辑师用户不存在");
      }
    })
  });
  assert.equal(notFound.handled, true);
  if (notFound.handled) {
    assert.equal(notFound.status_code, 404);
    assert.deepEqual(notFound.body, {
      ok: false,
      error_code: "not_found",
      message: "剪辑师用户不存在"
    });
  }

  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/cutter-users/CU000002/disable",
      deps: makeDeps({
        run_disable_cutter_user: async () => {
          throw new Error("store unavailable");
        }
      })
    }),
    /store unavailable/
  );
});

test("password route validates request body and dispatches through injected command service", async () => {
  const calls: Array<AdminCutterUserPasswordRouteCommandInput<TestApiInput>> = [];
  const result = await callRoute({
    pathname: "/api/admin/cutter-users/CU000003/password",
    deps: makeDeps({
      read_request_json: async () => ({ new_password: "  Cutter67890  " }),
      run_reset_cutter_user_password: async (input) => {
        calls.push(input);
        return {
          user_id: input.user_id,
          status: "approved"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(calls, [
    {
      api_input: {
        library_root: "/tmp/PublicLibrary",
        request_id: "req-1"
      },
      user_id: "CU000003",
      new_password: "Cutter67890"
    }
  ]);
  assert.equal(result.status_code, 200);
  assert.deepEqual(result.body, {
    ok: true,
    data: {
      user_id: "CU000003",
      status: "approved"
    }
  });
});

test("password route maps json and password validation errors", async () => {
  for (const [message, expectedMessage, statusCode, errorCode] of [
    ["invalid_json", "请求 JSON 格式不正确", 400, "invalid_request"],
    ["剪辑师用户不存在", "剪辑师用户不存在", 404, "not_found"],
    ["密码至少需要 8 位", "密码至少需要 8 位", 400, "invalid_request"],
    ["密码需要同时包含字母和数字", "密码需要同时包含字母和数字", 400, "invalid_request"]
  ] as const) {
    const result = await callRoute({
      pathname: "/api/admin/cutter-users/CU000004/password",
      deps: makeDeps({
        read_request_json: async () => {
          if (message === "invalid_json") {
            throw new Error("invalid_json");
          }
          return { new_password: "Cutter67890" };
        },
        run_reset_cutter_user_password: async () => {
          throw new Error(message);
        }
      })
    });

    assert.equal(result.handled, true);
    if (result.handled) {
      assert.equal(result.status_code, statusCode);
      assert.deepEqual(result.body, {
        ok: false,
        error_code: errorCode,
        message: expectedMessage
      });
    }
  }

  const missingPassword = await callRoute({
    pathname: "/api/admin/cutter-users/CU000004/password",
    deps: makeDeps({
      read_request_json: async () => ({})
    })
  });
  assert.equal(missingPassword.handled, true);
  if (missingPassword.handled) {
    assert.equal(missingPassword.status_code, 400);
    assert.deepEqual(missingPassword.body, {
      ok: false,
      error_code: "invalid_request",
      message: "新密码不能为空"
    });
  }

  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/cutter-users/CU000004/password",
      deps: makeDeps({
        run_reset_cutter_user_password: async () => {
          throw new Error("store unavailable");
        }
      })
    }),
    /store unavailable/
  );
});
