import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminRuntimeDiagnosticRouteDeps,
  createAdminRuntimeDiagnosticRouteServerDeps
} from "./admin-runtime-diagnostic-route-deps.ts";

interface TestApiInput {
  library_root: string;
  library_id: string;
}

interface TestEnv {
  DASHSCOPE_API_KEY?: string;
}

test("runtime diagnostic route deps preserve refresh, environment, and diagnostic clocks", async () => {
  const env: TestEnv = {
    DASHSCOPE_API_KEY: "test-key"
  };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminRuntimeDiagnosticRouteDeps<
    TestApiInput,
    TestEnv,
    { generated_at: string; root: string; has_key: boolean },
    { exported_at: string; root: string; has_key: boolean },
    { passed: boolean; message: string }
  >({
    env,
    diagnostic_now() {
      calls.push({ name: "clock", input: null });
      return "2026-06-27T00:20:00.000Z";
    },
    refresh_runtime_secrets() {
      calls.push({ name: "refresh", input: null });
    },
    async run_doctor_command(input) {
      calls.push({ name: "doctor", input });
      return {
        generated_at: input.now,
        root: input.library_root,
        has_key: Boolean(input.env.DASHSCOPE_API_KEY)
      };
    },
    async export_doctor_command(input) {
      calls.push({ name: "export", input });
      return {
        exported_at: input.now,
        root: input.library_root,
        has_key: Boolean(input.env.DASHSCOPE_API_KEY)
      };
    },
    test_asr_config(input) {
      calls.push({ name: "asr", input });
      return {
        passed: Boolean(input.env.DASHSCOPE_API_KEY?.trim()),
        message: `${input.api_input.library_id}:${input.api_input.library_root}`
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    library_id: "lib_test"
  };
  await deps.refresh_runtime_secrets();
  const doctor = await deps.run_doctor(apiInput);
  const exported = await deps.export_doctor(apiInput);
  const asr = await deps.test_asr(apiInput);

  assert.deepEqual(doctor, {
    generated_at: "2026-06-27T00:20:00.000Z",
    root: "/tmp/PublicLibrary",
    has_key: true
  });
  assert.deepEqual(exported, {
    exported_at: "2026-06-27T00:20:00.000Z",
    root: "/tmp/PublicLibrary",
    has_key: true
  });
  assert.deepEqual(asr, {
    passed: true,
    message: "lib_test:/tmp/PublicLibrary"
  });
  assert.deepEqual(calls, [
    {
      name: "refresh",
      input: null
    },
    {
      name: "clock",
      input: null
    },
    {
      name: "doctor",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T00:20:00.000Z",
        env
      }
    },
    {
      name: "clock",
      input: null
    },
    {
      name: "export",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T00:20:00.000Z",
        env
      }
    },
    {
      name: "asr",
      input: {
        api_input: {
          library_root: "/tmp/PublicLibrary",
          library_id: "lib_test"
        },
        env
      }
    }
  ]);
});

test("runtime diagnostic route server deps own Doctor wiring and safe ASR config projection", async () => {
  const env: TestEnv = {
    DASHSCOPE_API_KEY: "  test-key  "
  };
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminRuntimeDiagnosticRouteServerDeps<
    TestApiInput,
    TestEnv,
    { generated_at: string; root: string; has_key: boolean },
    { exported_at: string; root: string; has_key: boolean }
  >({
    env,
    diagnostic_now() {
      calls.push({ name: "clock", input: null });
      return "2026-06-27T03:45:00.000Z";
    },
    refresh_runtime_secrets() {
      calls.push({ name: "refresh", input: null });
    },
    async run_doctor_report(input) {
      calls.push({ name: "doctor", input });
      return {
        generated_at: input.now,
        root: input.library_root,
        has_key: Boolean(input.env.DASHSCOPE_API_KEY?.trim())
      };
    },
    async export_doctor_report(input) {
      calls.push({ name: "export", input });
      return {
        exported_at: input.now,
        root: input.library_root,
        has_key: Boolean(input.env.DASHSCOPE_API_KEY?.trim())
      };
    },
    read_dashscope_api_key(env) {
      calls.push({ name: "read-key", input: env.DASHSCOPE_API_KEY });
      return env.DASHSCOPE_API_KEY;
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    library_id: "lib_test"
  };
  await deps.refresh_runtime_secrets();
  const doctor = await deps.run_doctor(apiInput);
  const exported = await deps.export_doctor(apiInput);
  const asr = await deps.test_asr(apiInput);

  assert.deepEqual(doctor, {
    generated_at: "2026-06-27T03:45:00.000Z",
    root: "/tmp/PublicLibrary",
    has_key: true
  });
  assert.deepEqual(exported, {
    exported_at: "2026-06-27T03:45:00.000Z",
    root: "/tmp/PublicLibrary",
    has_key: true
  });
  assert.deepEqual(asr, {
    passed: true,
    message: "DashScope API Key 已配置，未执行真实音频提交。"
  });
  assert.deepEqual(calls, [
    {
      name: "refresh",
      input: null
    },
    {
      name: "clock",
      input: null
    },
    {
      name: "doctor",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T03:45:00.000Z",
        env
      }
    },
    {
      name: "clock",
      input: null
    },
    {
      name: "export",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T03:45:00.000Z",
        env
      }
    },
    {
      name: "read-key",
      input: "  test-key  "
    }
  ]);
});

test("runtime diagnostic route server deps report missing ASR key without real audio submission", async () => {
  const deps = createAdminRuntimeDiagnosticRouteServerDeps<
    TestApiInput,
    TestEnv,
    { generated_at: string },
    { exported_at: string }
  >({
    env: {},
    diagnostic_now: () => "2026-06-27T03:46:00.000Z",
    refresh_runtime_secrets: () => undefined,
    async run_doctor_report(input) {
      return {
        generated_at: input.now
      };
    },
    async export_doctor_report(input) {
      return {
        exported_at: input.now
      };
    },
    read_dashscope_api_key: (env) => env.DASHSCOPE_API_KEY
  });

  assert.deepEqual(await deps.test_asr({
    library_root: "/tmp/PublicLibrary",
    library_id: "lib_test"
  }), {
    passed: false,
    message: "DashScope API Key 未配置。"
  });
});
