import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminSystemReadRouteDeps,
  createAdminSystemReadRouteServerDeps
} from "./admin-system-read-route-deps.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestEnv {
  node_env: string;
}

interface TestCutterUser {
  id: string;
  username: string;
}

test("system read route deps preserve read helpers and environment-aware runtime inputs", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const env: TestEnv = {
    node_env: "test"
  };

  const deps = createAdminSystemReadRouteDeps<
    TestApiInput,
    TestEnv,
    { root_path: string },
    { library_name: string },
    { ffmpeg_env: string; root: string },
    { generated_at: string; env_name: string },
    TestCutterUser,
    { id: string; label: string }
  >({
    env,
    diagnostic_now() {
      calls.push({ name: "now", input: null });
      return "2026-06-27T00:00:00.000Z";
    },
    async read_library_status(input) {
      calls.push({ name: "library-status", input });
      return {
        root_path: input.library_root
      };
    },
    async read_settings_config(libraryRoot) {
      calls.push({ name: "settings-config", input: libraryRoot });
      return {
        library_name: libraryRoot
      };
    },
    refresh_runtime_secrets() {
      calls.push({ name: "refresh", input: null });
    },
    async read_runtime_settings(input) {
      calls.push({ name: "runtime-settings", input });
      return {
        ffmpeg_env: input.env.node_env,
        root: input.library_root
      };
    },
    async read_doctor_report(input) {
      calls.push({ name: "doctor", input });
      return {
        generated_at: input.now,
        env_name: input.env.node_env
      };
    },
    async list_cutter_users(libraryRoot) {
      calls.push({ name: "cutter-users", input: libraryRoot });
      return {
        users: [
          {
            id: "CU000001",
            username: "alice"
          }
        ]
      };
    },
    to_public_cutter_user(user) {
      calls.push({ name: "public-user", input: user });
      return {
        id: user.id,
        label: user.username
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const libraryStatus = await deps.read_library_status(apiInput);
  const settingsConfig = await deps.read_settings_config(apiInput.library_root);
  await deps.refresh_runtime_secrets();
  const runtimeSettings = await deps.read_runtime_settings(apiInput.library_root);
  const doctorReport = await deps.read_doctor_report(apiInput);
  const cutterUsers = await deps.list_cutter_users(apiInput.library_root);
  const publicUser = deps.to_public_cutter_user(cutterUsers.users[0]);

  assert.deepEqual(libraryStatus, {
    root_path: "/tmp/PublicLibrary"
  });
  assert.deepEqual(settingsConfig, {
    library_name: "/tmp/PublicLibrary"
  });
  assert.deepEqual(runtimeSettings, {
    ffmpeg_env: "test",
    root: "/tmp/PublicLibrary"
  });
  assert.deepEqual(doctorReport, {
    generated_at: "2026-06-27T00:00:00.000Z",
    env_name: "test"
  });
  assert.deepEqual(publicUser, {
    id: "CU000001",
    label: "alice"
  });
  assert.deepEqual(calls, [
    {
      name: "library-status",
      input: apiInput
    },
    {
      name: "settings-config",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "refresh",
      input: null
    },
    {
      name: "runtime-settings",
      input: {
        library_root: "/tmp/PublicLibrary",
        env
      }
    },
    {
      name: "now",
      input: null
    },
    {
      name: "doctor",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T00:00:00.000Z",
        env
      }
    },
    {
      name: "cutter-users",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "public-user",
      input: {
        id: "CU000001",
        username: "alice"
      }
    }
  ]);
});

test("system read route deps generate a fresh doctor timestamp per call", async () => {
  const timestamps = [
    "2026-06-27T00:01:00.000Z",
    "2026-06-27T00:02:00.000Z"
  ];

  const deps = createAdminSystemReadRouteDeps<
    TestApiInput,
    Record<string, never>,
    { ok: true },
    { ok: true },
    { ok: true },
    { generated_at: string },
    TestCutterUser,
    { id: string }
  >({
    env: {},
    diagnostic_now() {
      const timestamp = timestamps.shift();
      assert.ok(timestamp);
      return timestamp;
    },
    async read_library_status() {
      return { ok: true };
    },
    async read_settings_config() {
      return { ok: true };
    },
    refresh_runtime_secrets() {
      return undefined;
    },
    async read_runtime_settings() {
      return { ok: true };
    },
    async read_doctor_report(input) {
      return {
        generated_at: input.now
      };
    },
    async list_cutter_users() {
      return {
        users: []
      };
    },
    to_public_cutter_user(user) {
      return {
        id: user.id
      };
    }
  });

  const first = await deps.read_doctor_report({
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  });
  const second = await deps.read_doctor_report({
    library_root: "/tmp/PublicLibrary",
    request_id: "req-2"
  });

  assert.deepEqual(first, {
    generated_at: "2026-06-27T00:01:00.000Z"
  });
  assert.deepEqual(second, {
    generated_at: "2026-06-27T00:02:00.000Z"
  });
  assert.deepEqual(timestamps, []);
});

test("system read route server deps wire direct services and projections", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const env: TestEnv = {
    node_env: "server-test"
  };

  const deps = createAdminSystemReadRouteServerDeps<
    TestApiInput,
    TestEnv,
    { root_path: string },
    { library_name: string },
    { ffmpeg_env: string; root: string },
    { generated_at: string; env_name: string },
    TestCutterUser,
    { id: string; label: string }
  >({
    env,
    diagnostic_now() {
      calls.push({ name: "now", input: null });
      return "2026-06-27T04:20:00.000Z";
    },
    async read_library_status_service(input) {
      calls.push({ name: "library-status", input });
      return {
        root_path: input.library_root
      };
    },
    async read_settings_config_service(libraryRoot) {
      calls.push({ name: "settings-config", input: libraryRoot });
      return {
        library_name: libraryRoot
      };
    },
    refresh_runtime_secrets_service() {
      calls.push({ name: "refresh", input: null });
    },
    async read_runtime_settings_service(input) {
      calls.push({ name: "runtime-settings", input });
      return {
        ffmpeg_env: input.env.node_env,
        root: input.library_root
      };
    },
    async read_doctor_report_service(input) {
      calls.push({ name: "doctor", input });
      return {
        generated_at: input.now,
        env_name: input.env.node_env
      };
    },
    async list_cutter_users_service(libraryRoot) {
      calls.push({ name: "cutter-users", input: libraryRoot });
      return {
        users: [
          {
            id: "CU000002",
            username: "bob"
          }
        ]
      };
    },
    project_public_cutter_user(user) {
      calls.push({ name: "public-user", input: user });
      return {
        id: user.id,
        label: user.username
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-server"
  };
  const libraryStatus = await deps.read_library_status(apiInput);
  const settingsConfig = await deps.read_settings_config(apiInput.library_root);
  await deps.refresh_runtime_secrets();
  const runtimeSettings = await deps.read_runtime_settings(apiInput.library_root);
  const doctorReport = await deps.read_doctor_report(apiInput);
  const cutterUsers = await deps.list_cutter_users(apiInput.library_root);
  const publicUser = deps.to_public_cutter_user(cutterUsers.users[0]);

  assert.deepEqual(libraryStatus, {
    root_path: "/tmp/PublicLibrary"
  });
  assert.deepEqual(settingsConfig, {
    library_name: "/tmp/PublicLibrary"
  });
  assert.deepEqual(runtimeSettings, {
    ffmpeg_env: "server-test",
    root: "/tmp/PublicLibrary"
  });
  assert.deepEqual(doctorReport, {
    generated_at: "2026-06-27T04:20:00.000Z",
    env_name: "server-test"
  });
  assert.deepEqual(publicUser, {
    id: "CU000002",
    label: "bob"
  });
  assert.deepEqual(calls, [
    {
      name: "library-status",
      input: apiInput
    },
    {
      name: "settings-config",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "refresh",
      input: null
    },
    {
      name: "runtime-settings",
      input: {
        library_root: "/tmp/PublicLibrary",
        env
      }
    },
    {
      name: "now",
      input: null
    },
    {
      name: "doctor",
      input: {
        library_root: "/tmp/PublicLibrary",
        now: "2026-06-27T04:20:00.000Z",
        env
      }
    },
    {
      name: "cutter-users",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "public-user",
      input: {
        id: "CU000002",
        username: "bob"
      }
    }
  ]);
});
