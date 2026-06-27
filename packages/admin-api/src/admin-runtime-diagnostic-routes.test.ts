import assert from "node:assert/strict";
import test from "node:test";
import {
  handleAdminRuntimeDiagnosticRoutes,
  matchAdminDoctorExportPath,
  matchAdminDoctorRunPath,
  matchAdminSettingsTestAsrPath,
  type AdminRuntimeDiagnosticRouteApiInput,
  type AdminRuntimeDiagnosticRouteDeps
} from "./admin-runtime-diagnostic-routes.ts";

interface TestApiInput extends AdminRuntimeDiagnosticRouteApiInput {
  library_id: string;
}

type TestDeps = AdminRuntimeDiagnosticRouteDeps<
  TestApiInput,
  { generated_at: string; root: string },
  { file_name: string; root: string },
  { passed: boolean; message: string }
>;

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    refresh_runtime_secrets: () => undefined,
    run_doctor: async (input) => ({
      generated_at: "2026-06-26T00:00:00.000Z",
      root: `${input.library_id}:${input.library_root}`
    }),
    export_doctor: async (input) => ({
      file_name: "mixlab-doctor.json",
      root: `${input.library_id}:${input.library_root}`
    }),
    test_asr: (input) => ({
      passed: true,
      message: input.library_root
    }),
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  deps?: TestDeps;
}) {
  return handleAdminRuntimeDiagnosticRoutes({
    method: input.method ?? "POST",
    pathname: input.pathname,
    api_input: {
      library_root: "/tmp/PublicLibrary",
      library_id: "lib_test"
    },
    deps: input.deps ?? makeDeps()
  });
}

test("runtime diagnostic route matchers identify only their exact endpoints", () => {
  assert.equal(matchAdminDoctorRunPath("/api/admin/doctor/run"), true);
  assert.equal(matchAdminDoctorExportPath("/api/admin/doctor/export"), true);
  assert.equal(matchAdminSettingsTestAsrPath("/api/admin/settings/test-asr"), true);
  assert.equal(matchAdminDoctorRunPath("/api/admin/doctor/run/extra"), false);
  assert.equal(matchAdminDoctorExportPath("/api/admin/doctor/report"), false);
  assert.equal(matchAdminSettingsTestAsrPath("/api/admin/settings/runtime"), false);
});

test("doctor run refreshes runtime secrets before dispatching with full API input", async () => {
  const events: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/doctor/run",
    deps: makeDeps({
      refresh_runtime_secrets: () => {
        events.push("refresh");
      },
      run_doctor: async (input) => {
        events.push(`doctor:${input.library_id}:${input.library_root}`);
        return {
          generated_at: "2026-06-26T00:01:00.000Z",
          root: input.library_root
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(events, ["refresh", "doctor:lib_test:/tmp/PublicLibrary"]);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        generated_at: "2026-06-26T00:01:00.000Z",
        root: "/tmp/PublicLibrary"
      }
    });
  }
});

test("doctor export refreshes runtime secrets before dispatching", async () => {
  const events: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/doctor/export",
    deps: makeDeps({
      refresh_runtime_secrets: async () => {
        events.push("refresh");
      },
      export_doctor: async (input) => {
        events.push(`export:${input.library_id}`);
        return {
          file_name: "doctor-export.json",
          root: input.library_root
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(events, ["refresh", "export:lib_test"]);
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        file_name: "doctor-export.json",
        root: "/tmp/PublicLibrary"
      }
    });
  }
});

test("settings test-asr refreshes runtime secrets before returning the injected result", async () => {
  const events: string[] = [];
  const result = await callRoute({
    pathname: "/api/admin/settings/test-asr",
    deps: makeDeps({
      refresh_runtime_secrets: () => {
        events.push("refresh");
      },
      test_asr: (input) => {
        events.push(`asr:${input.library_root}`);
        return {
          passed: false,
          message: "DashScope API Key 未配置。"
        };
      }
    })
  });

  assert.equal(result.handled, true);
  assert.deepEqual(events, ["refresh", "asr:/tmp/PublicLibrary"]);
  if (result.handled) {
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        passed: false,
        message: "DashScope API Key 未配置。"
      }
    });
  }
});

test("runtime diagnostic routes ignore unrelated routes and non-post methods", async () => {
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/doctor/run"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/doctor/report"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "PATCH",
    pathname: "/api/admin/settings/test-asr"
  }), {
    handled: false
  });
});

test("runtime diagnostic routes bubble refresh errors before dispatching", async () => {
  let doctorCalls = 0;
  await assert.rejects(
    () => callRoute({
      pathname: "/api/admin/doctor/run",
      deps: makeDeps({
        refresh_runtime_secrets: () => {
          throw new Error("runtime secret refresh failed");
        },
        run_doctor: async () => {
          doctorCalls += 1;
          return {
            generated_at: "",
            root: ""
          };
        }
      })
    }),
    /runtime secret refresh failed/
  );
  assert.equal(doctorCalls, 0);
});
