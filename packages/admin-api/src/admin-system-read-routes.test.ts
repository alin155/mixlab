import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminSystemReadRoutes,
  type AdminSystemReadRouteApiInput,
  type AdminSystemReadRouteDeps
} from "./admin-system-read-routes.ts";

interface TestApiInput extends AdminSystemReadRouteApiInput {
  library_id: string;
}

interface TestCutterUser {
  id: string;
  username: string;
}

interface TestPublicCutterUser {
  id: string;
  label: string;
}

function makeDeps(
  overrides: Partial<AdminSystemReadRouteDeps<
    TestApiInput,
    { root_path: string },
    { library_name: string },
    { ffmpeg: { available: boolean } },
    { generated_at: string },
    TestCutterUser,
    TestPublicCutterUser
  >> = {}
): AdminSystemReadRouteDeps<
  TestApiInput,
  { root_path: string },
  { library_name: string },
  { ffmpeg: { available: boolean } },
  { generated_at: string },
  TestCutterUser,
  TestPublicCutterUser
> {
  return {
    read_library_status: async (input) => ({
      root_path: `${input.library_id}:${input.library_root}`
    }),
    read_settings_config: async (libraryRoot) => ({
      library_name: libraryRoot
    }),
    refresh_runtime_secrets: () => undefined,
    read_runtime_settings: async () => ({
      ffmpeg: {
        available: true
      }
    }),
    read_doctor_report: async () => ({
      generated_at: "2026-06-25T00:00:00.000Z"
    }),
    list_cutter_users: async () => ({
      users: [
        {
          id: "CU000001",
          username: "cutter-a"
        }
      ]
    }),
    to_public_cutter_user: (user) => ({
      id: user.id,
      label: user.username
    }),
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: AdminSystemReadRouteDeps<
    TestApiInput,
    { root_path: string },
    { library_name: string },
    { ffmpeg: { available: boolean } },
    { generated_at: string },
    TestCutterUser,
    TestPublicCutterUser
  >;
}) {
  return handleAdminSystemReadRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      library_id: "lib_test"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("system read routes handle library status with full API input", async () => {
  const result = await callRoute({ pathname: "/api/admin/library/status" });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(result.body, {
    ok: true,
    data: {
      root_path: "lib_test:/tmp/PublicLibrary"
    }
  });
});

test("system read routes handle settings config without runtime refresh", async () => {
  const events: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/settings/config",
    deps: makeDeps({
      read_settings_config: async (libraryRoot) => {
        events.push(`settings:${libraryRoot}`);
        return {
          library_name: "MixLab"
        };
      },
      refresh_runtime_secrets: () => {
        events.push("refresh");
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(events, ["settings:/tmp/PublicLibrary"]);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        library_name: "MixLab"
      }
    });
  }
});

test("system read routes refresh runtime secrets before runtime settings and doctor report", async () => {
  const runtimeEvents: string[] = [];
  const runtimeResult = await callRoute({
    pathname: "/api/admin/settings/runtime",
    deps: makeDeps({
      refresh_runtime_secrets: async () => {
        runtimeEvents.push("refresh");
      },
      read_runtime_settings: async (libraryRoot) => {
        runtimeEvents.push(`runtime:${libraryRoot}`);
        return {
          ffmpeg: {
            available: false
          }
        };
      }
    })
  });

  assert.equal(runtimeResult.handled, true);
  assert.deepEqual(runtimeEvents, ["refresh", "runtime:/tmp/PublicLibrary"]);

  const doctorEvents: string[] = [];
  const doctorResult = await callRoute({
    pathname: "/api/admin/doctor/report",
    deps: makeDeps({
      refresh_runtime_secrets: () => {
        doctorEvents.push("refresh");
      },
      read_doctor_report: async (input) => {
        doctorEvents.push(`doctor:${input.library_id}:${input.library_root}`);
        return {
          generated_at: "2026-06-25T01:00:00.000Z"
        };
      }
    })
  });

  assert.equal(doctorResult.handled, true);
  assert.deepEqual(doctorEvents, ["refresh", "doctor:lib_test:/tmp/PublicLibrary"]);
});

test("system read routes handle cutter users through public projection", async () => {
  const result = await callRoute({
    pathname: "/api/admin/cutter-users",
    deps: makeDeps({
      list_cutter_users: async (libraryRoot) => ({
        users: [
          {
            id: "CU000001",
            username: libraryRoot
          },
          {
            id: "CU000002",
            username: "second"
          }
        ]
      })
    })
  });

  assert.equal(result.handled, true);
  if (!result.handled) {
    return;
  }

  assert.deepEqual(result.body, {
    ok: true,
    data: {
      users: [
        {
          id: "CU000001",
          label: "/tmp/PublicLibrary"
        },
        {
          id: "CU000002",
          label: "second"
        }
      ]
    }
  });
});

test("system read routes ignore unrelated routes and non-get methods", async () => {
  assert.deepEqual(await callRoute({ pathname: "/api/admin/library/path-checks" }), {
    handled: false
  });
  assert.deepEqual(await callRoute({ method: "PATCH", pathname: "/api/admin/settings/config" }), {
    handled: false
  });
});
