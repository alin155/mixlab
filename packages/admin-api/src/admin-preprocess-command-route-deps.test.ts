import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminPreprocessCommandRouteDeps,
  createAdminPreprocessCommandRouteServerDeps
} from "./admin-preprocess-command-route-deps.ts";
import type { AdminBulkPreprocessRouteResult } from "./admin-preprocess-command-routes.ts";

interface TestApiInput {
  library_root: string;
  request_id: string;
}

interface TestRuntimePolicy {
  concurrent_jobs: number;
}

interface TestSafety {
  safe_to_start: boolean;
}

interface TestSupervisor {
  state: "running" | "idle";
  worker_id?: string;
}

interface TestPublicSupervisor {
  state: "running" | "idle";
}

interface TestBulkResult extends AdminBulkPreprocessRouteResult {
  source_video_ids: string[];
}

interface TestActor {
  id: string;
}

test("preprocess command route server deps preserve command context and injected helpers", async () => {
  const actor: TestActor = { id: "admin-1" };
  const now = () => "2026-06-26T23:20:01.000Z";
  const calls: Array<{ name: string; input: unknown }> = [];
  const cleared: string[] = [];
  const deps = createAdminPreprocessCommandRouteServerDeps<
    TestApiInput,
    TestRuntimePolicy,
    TestSafety,
    TestSupervisor,
    TestPublicSupervisor,
    TestBulkResult,
    TestActor
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-26T23:20:00.000Z",
    actor,
    now,
    read_request_json: async () => ({
      limit: 2
    }),
    async read_admin_settings(libraryRoot) {
      calls.push({ name: "settings", input: libraryRoot });
      return {
        runtime_policy: {
          concurrent_jobs: 2
        }
      };
    },
    async refresh_runtime_secrets() {
      calls.push({ name: "refresh-secrets", input: null });
    },
    preprocess_runner_available: false,
    env: {
      DASHSCOPE_API_KEY: "test-key"
    },
    assert_real_preprocess_start_ready(env) {
      calls.push({ name: "real-ready", input: env.DASHSCOPE_API_KEY });
    },
    async read_preprocess_safety(input) {
      calls.push({ name: "safety", input });
      return {
        safe_to_start: true
      };
    },
    assert_preprocess_safe_to_start(safety) {
      calls.push({ name: "assert-safe", input: safety });
    },
    start_preprocess_supervisor(input) {
      calls.push({ name: "start", input });
      return {
        state: "running",
        worker_id: "worker-1"
      };
    },
    stop_preprocess_supervisor() {
      calls.push({ name: "stop", input: null });
      return {
        state: "idle"
      };
    },
    read_preprocess_supervisor_status: () => ({
      state: "idle",
      worker_id: "worker-1"
    }),
    to_public_preprocess_supervisor_status(status) {
      calls.push({ name: "public-supervisor", input: status });
      return {
        state: status.state
      };
    },
    async run_bulk_transition_command(input) {
      calls.push({ name: "bulk", input });
      return {
        affected_count: 2,
        source_video_ids: ["V000001", "V000002"]
      };
    },
    recover_processing_supervisor_block(input) {
      calls.push({ name: "recover-block", input });
      return null;
    },
    clear_source_video_page_cache(libraryRoot) {
      cleared.push(libraryRoot);
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-1"
  };
  const requestBody = await deps.read_request_json();
  const settings = await deps.read_admin_settings(apiInput.library_root);
  await deps.refresh_runtime_secrets();
  deps.assert_real_preprocess_start_ready();
  const safety = await deps.read_preprocess_safety(apiInput);
  deps.assert_preprocess_safe_to_start(safety);
  const started = deps.start_preprocess_supervisor({
    limit: 2,
    runtime_policy: settings.runtime_policy
  });
  const stopped = deps.stop_preprocess_supervisor();
  const bulk = await deps.run_bulk_transition_command({
    api_input: apiInput,
    command: "preprocess-queue-unprocessed"
  });
  const supervisor = deps.read_preprocess_supervisor_status();
  const block = deps.recover_processing_supervisor_block({
    command: "preprocess-recover-processing",
    supervisor_state: supervisor.state
  });
  deps.clear_source_video_page_cache(apiInput.library_root);

  assert.deepEqual(requestBody, {
    limit: 2
  });
  assert.deepEqual(started, {
    state: "running"
  });
  assert.deepEqual(stopped, {
    state: "idle"
  });
  assert.deepEqual(bulk, {
    affected_count: 2,
    source_video_ids: ["V000001", "V000002"]
  });
  assert.equal(block, null);
  assert.deepEqual(cleared, ["/tmp/PublicLibrary"]);
  assert.deepEqual(calls, [
    {
      name: "settings",
      input: "/tmp/PublicLibrary"
    },
    {
      name: "refresh-secrets",
      input: null
    },
    {
      name: "real-ready",
      input: "test-key"
    },
    {
      name: "safety",
      input: {
        api_input: apiInput,
        include_processing_guard: true
      }
    },
    {
      name: "assert-safe",
      input: {
        safe_to_start: true
      }
    },
    {
      name: "start",
      input: {
        limit: 2,
        runtime_policy: {
          concurrent_jobs: 2
        }
      }
    },
    {
      name: "public-supervisor",
      input: {
        state: "running",
        worker_id: "worker-1"
      }
    },
    {
      name: "stop",
      input: null
    },
    {
      name: "public-supervisor",
      input: {
        state: "idle"
      }
    },
    {
      name: "bulk",
      input: {
        library_root: "/tmp/PublicLibrary",
        library_id: "mixlab",
        library_name: "MixLab",
        command: "preprocess-queue-unprocessed",
        command_now: "2026-06-26T23:20:00.000Z",
        actor,
        now
      }
    },
    {
      name: "public-supervisor",
      input: {
        state: "idle",
        worker_id: "worker-1"
      }
    },
    {
      name: "recover-block",
      input: {
        command: "preprocess-recover-processing",
        supervisor_state: "idle"
      }
    }
  ]);
});

test("preprocess command route deps accept public supervisor status without server projection", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminPreprocessCommandRouteDeps<
    TestApiInput,
    TestRuntimePolicy,
    TestSafety,
    TestPublicSupervisor,
    TestBulkResult,
    TestActor
  >({
    library_id: "mixlab",
    library_name: "MixLab",
    command_now: "2026-06-27T04:00:00.000Z",
    read_request_json: async () => ({}),
    async read_admin_settings() {
      return {
        runtime_policy: {
          concurrent_jobs: 1
        }
      };
    },
    async refresh_runtime_secrets() {},
    preprocess_runner_available: true,
    env: {},
    assert_real_preprocess_start_ready() {
      calls.push({ name: "real-ready", input: null });
    },
    async read_preprocess_safety(input) {
      calls.push({ name: "safety", input });
      return {
        safe_to_start: true
      };
    },
    assert_preprocess_safe_to_start(safety) {
      calls.push({ name: "assert-safe", input: safety });
    },
    start_preprocess_supervisor(input) {
      calls.push({ name: "start-public", input });
      return {
        state: "running"
      };
    },
    stop_preprocess_supervisor() {
      calls.push({ name: "stop-public", input: null });
      return {
        state: "idle"
      };
    },
    read_preprocess_supervisor_status() {
      calls.push({ name: "status-public", input: null });
      return {
        state: "idle"
      };
    },
    async run_bulk_transition_command(input) {
      calls.push({ name: "bulk", input });
      return {
        affected_count: 0,
        source_video_ids: []
      };
    },
    recover_processing_supervisor_block(input) {
      calls.push({ name: "recover-block", input });
      return null;
    },
    clear_source_video_page_cache() {}
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    request_id: "req-public"
  };
  const started = deps.start_preprocess_supervisor({
    runtime_policy: {
      concurrent_jobs: 1
    }
  });
  const stopped = deps.stop_preprocess_supervisor();
  const supervisor = deps.read_preprocess_supervisor_status();
  const safety = await deps.read_preprocess_safety(apiInput);
  deps.assert_preprocess_safe_to_start(safety);

  assert.deepEqual(started, { state: "running" });
  assert.deepEqual(stopped, { state: "idle" });
  assert.deepEqual(supervisor, { state: "idle" });
  assert.deepEqual(calls, [
    {
      name: "start-public",
      input: {
        runtime_policy: {
          concurrent_jobs: 1
        }
      }
    },
    {
      name: "stop-public",
      input: null
    },
    {
      name: "status-public",
      input: null
    },
    {
      name: "safety",
      input: {
        api_input: apiInput,
        include_processing_guard: true
      }
    },
    {
      name: "assert-safe",
      input: {
        safe_to_start: true
      }
    }
  ]);
});
