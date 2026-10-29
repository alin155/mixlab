import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCutterApiServerInputFromDesktopConfig,
  createAsyncUsageEventRecorder,
  readCutterDesktopConfig,
  resolveDesktopSidecarConfigPath,
  shouldRunDirectSidecar,
  startCutterApiSidecar
} from "./desktop-sidecar.ts";

class FakeServer extends EventEmitter {
  listenPort?: number;
  listenHost?: string;
  closed = false;

  listen(port: number, host: string, callback?: () => void): this {
    this.listenPort = port;
    this.listenHost = host;
    queueMicrotask(() => callback?.());
    return this;
  }

  close(callback?: (error?: Error) => void): this {
    this.closed = true;
    queueMicrotask(() => callback?.());
    return this;
  }
}

function makeWritable() {
  const chunks: string[] = [];
  return {
    chunks,
    stream: {
      write(chunk: string) {
        chunks.push(chunk);
        return true;
      }
    }
  };
}

test("resolves desktop sidecar config path from args before env", () => {
  assert.equal(
    resolveDesktopSidecarConfigPath({
      args: ["--config", String.raw`C:\MixLab\desktop-config.json`],
      env: { MIXLAB_DESKTOP_CONFIG_PATH: String.raw`D:\ignored.json` }
    }),
    String.raw`C:\MixLab\desktop-config.json`
  );

  assert.equal(
    resolveDesktopSidecarConfigPath({
      args: [],
      env: { MIXLAB_DESKTOP_CONFIG_PATH: String.raw`D:\MixLab\desktop-config.json` }
    }),
    String.raw`D:\MixLab\desktop-config.json`
  );
});

test("rejects missing desktop sidecar config path", () => {
  assert.throws(
    () => resolveDesktopSidecarConfigPath({ args: [], env: {} }),
    /MIXLAB_DESKTOP_CONFIG_PATH/
  );
});

test("runs direct sidecar entrypoint inside pkg packaged exe", () => {
  assert.equal(
    shouldRunDirectSidecar({
      module_url: "file:///snapshot/mixlab/packages/cutter-api/src/desktop-sidecar.ts",
      script_path: String.raw`C:\Program Files\MixLab Cutter\cutter-api-sidecar.exe`,
      is_pkg: true
    }),
    true
  );
});

test("maps desktop config to reviewed cutter API server input without mutating public library path", () => {
  assert.deepEqual(
    buildCutterApiServerInputFromDesktopConfig({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
      ffmpeg_path: String.raw`C:\Program Files\MixLab Cutter\bin\ffmpeg.exe`,
      ffprobe_path: String.raw`C:\Program Files\MixLab Cutter\bin\ffprobe.exe`
    }),
    {
      library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
      workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
      release_cache_root: String.raw`C:\Users\Allen\Videos\MixLabLocal\cache`,
      auto_run_cut_queue: true,
      auth_mode: "reviewed"
    }
  );
});

test("rejects desktop config when local workspace overlaps public library", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mixlab-desktop-sidecar-config-"));
  const configPath = path.join(dir, "desktop-config.json");
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: String.raw`\\NAS\MixLab\PublicLibrary`,
        local_workspace_root: String.raw`\\NAS\MixLab\PublicLibrary`
      }),
      "utf8"
    );

    await assert.rejects(() => readCutterDesktopConfig(configPath), /本地工作区不能与公共素材库/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("maps desktop searchd env to cutter API server input", () => {
  assert.deepEqual(
    buildCutterApiServerInputFromDesktopConfig(
      {
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: String.raw`D:\MixLabPublicLibrary`,
        local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
      },
      {
        MIXLAB_SEARCHD_BASE_URL: " http://127.0.0.1:3799 ",
        MIXLAB_CUTTER_SEARCHD_CACHE_ROOT: String.raw`C:\Users\Allen\AppData\Local\MixLab Cutter\cache\searchd`
      }
    ),
    {
      library_root: String.raw`D:\MixLabPublicLibrary`,
      workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
      release_cache_root: String.raw`C:\Users\Allen\Videos\MixLabLocal\cache`,
      auto_run_cut_queue: true,
      auth_mode: "reviewed",
      searchd_cache_root: String.raw`C:\Users\Allen\AppData\Local\MixLab Cutter\cache\searchd`,
      searchd_base_url: "http://127.0.0.1:3799",
      searchd_timeout_ms: 20000,
      searchd_first_page_timeout_ms: 10000,
      searchd_cursor_timeout_ms: 4000,
      searchd_retry_attempts: 8,
      searchd_retry_backoff_ms: 1200,
      searchd_first_page_budget_ms: 18000
    }
  );
});

test("maps desktop searchd timeout env to cutter API server input", () => {
  const input = buildCutterApiServerInputFromDesktopConfig(
    {
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`D:\MixLabPublicLibrary`,
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
    },
    {
      MIXLAB_SEARCHD_BASE_URL: "http://127.0.0.1:3799",
      MIXLAB_SEARCHD_TIMEOUT_MS: " 7500 "
    }
  );

  assert.equal(input.searchd_timeout_ms, 7500);
});

test("maps explicit desktop local trusted env to cutter API server input", () => {
  assert.deepEqual(
    buildCutterApiServerInputFromDesktopConfig(
      {
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: String.raw`D:\MixLabPublicLibrary`,
        local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
      },
      {
        MIXLAB_CUTTER_AUTH_MODE: "local_trusted",
        MIXLAB_CUTTER_TRUSTED_USERNAME: " Allen "
      }
    ),
    {
      library_root: String.raw`D:\MixLabPublicLibrary`,
      workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`,
      release_cache_root: String.raw`C:\Users\Allen\Videos\MixLabLocal\cache`,
      auto_run_cut_queue: true,
      auth_mode: "local_trusted",
      trusted_username: "Allen"
    }
  );
});

test("starts cutter API sidecar and emits lifecycle events", async () => {
  const stdout = makeWritable();
  const fakeServer = new FakeServer();
  const result = await startCutterApiSidecar({
    config_path: String.raw`C:\MixLab\desktop-config.json`,
    read_config: async () => ({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`D:\MixLabPublicLibrary`,
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
    }),
    create_server: (input) => {
      assert.equal(input.library_root, String.raw`D:\MixLabPublicLibrary`);
      assert.equal(input.workspace_root, String.raw`C:\Users\Allen\Videos\MixLabLocal`);
      assert.equal(input.release_cache_root, String.raw`C:\Users\Allen\Videos\MixLabLocal\cache`);
      assert.equal(input.auto_run_cut_queue, true);
      assert.equal(input.auth_mode, "reviewed");
      assert.equal(input.trusted_username, undefined);
      assert.equal(input.searchd_base_url, "http://127.0.0.1:3799");
      assert.equal(input.searchd_timeout_ms, 20000);
      return fakeServer as unknown as Server;
    },
    env: {
      MIXLAB_SEARCHD_BASE_URL: "http://127.0.0.1:3799"
    },
    stdout: stdout.stream
  });

  assert.equal(fakeServer.listenHost, "127.0.0.1");
  assert.equal(fakeServer.listenPort, 3789);
  assert.deepEqual(
    stdout.chunks.map((chunk) => JSON.parse(chunk)),
    [
      { event: "starting", stage: "sidecar_startup" },
      { event: "ready", api_address: "http://127.0.0.1:3789" }
    ]
  );

  await result.stop();
  assert.equal(fakeServer.closed, true);
});

test("starts cutter API sidecar when packaged GUI stdout is unavailable", async () => {
  const fakeServer = new FakeServer();
  const logged: unknown[] = [];
  const result = await startCutterApiSidecar({
    config_path: String.raw`C:\MixLab\desktop-config.json`,
    read_config: async () => ({
      api_host: "127.0.0.1",
      api_port: 3789,
      public_library_root: String.raw`D:\MixLabPublicLibrary`,
      local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
    }),
    create_server: () => fakeServer as unknown as Server,
    log_event: (event) => {
      logged.push(event);
    },
    stdout: {
      write() {
        throw new Error("stdout unavailable");
      }
    }
  });

  assert.equal(fakeServer.listenHost, "127.0.0.1");
  assert.equal(fakeServer.listenPort, 3789);
  assert.deepEqual(logged, [
    { event: "starting", stage: "sidecar_startup" },
    { event: "ready", api_address: "http://127.0.0.1:3789" }
  ]);

  await result.stop();
  assert.equal(fakeServer.closed, true);
  assert.deepEqual(logged, [
    { event: "starting", stage: "sidecar_startup" },
    { event: "ready", api_address: "http://127.0.0.1:3789" },
    { event: "stopping" }
  ]);
});

test("logs sidecar failure after config has been loaded", async () => {
  const stdout = makeWritable();
  const logged: unknown[] = [];

  await assert.rejects(
    () => startCutterApiSidecar({
      config_path: String.raw`C:\MixLab\desktop-config.json`,
      read_config: async () => ({
        api_host: "127.0.0.1",
        api_port: 3789,
        public_library_root: String.raw`D:\MixLabPublicLibrary`,
        local_workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
      }),
      create_server: () => {
        throw new Error("端口已被占用");
      },
      log_event: (event) => {
        logged.push(event);
      },
      stdout: stdout.stream
    }),
    /端口已被占用/
  );

  assert.deepEqual(
    logged,
    [
      { event: "starting", stage: "sidecar_startup" },
      { event: "failed", stage: "sidecar_startup", error: "端口已被占用" }
    ]
  );
  assert.deepEqual(
    stdout.chunks.map((chunk) => JSON.parse(chunk)),
    [
      { event: "starting", stage: "sidecar_startup" },
      { event: "failed", stage: "sidecar_startup", error: "端口已被占用" }
    ]
  );
});

test("async usage recorder hands events to the worker pipe without awaiting the request path", async () => {
  const writes: string[] = [];
  const child = new EventEmitter() as EventEmitter & {
    stdin: EventEmitter & { writable: boolean; write: (chunk: string) => boolean };
    killed: boolean;
  };
  child.stdin = Object.assign(new EventEmitter(), {
    writable: true,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    }
  });
  child.killed = false;

  const recorder = createAsyncUsageEventRecorder({ spawn_child: () => child as never });
  recorder.record("C:\\logs\\usage-worker-test", {
    event_id: "11111111-1111-4111-8111-111111111111",
    user_id: "CU000001",
    username: "Allen",
    device_id: "cutter-test",
    event_type: "view_source_video",
    occurred_at: "2026-10-30T00:00:00.000Z",
    source_video_id: "V000001"
  } as never);

  const writeDeadline = Date.now() + 2000;
  while (writes.length === 0 && Date.now() < writeDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(writes.length, 1);
  const payload = JSON.parse(writes[0]!) as { library_root: string; event: { event_type: string } };
  assert.equal(payload.library_root, "C:\\logs\\usage-worker-test");
  assert.equal(payload.event.event_type, "view_source_video");
  await recorder.dispose();
});

test("async usage recorder does not resend accepted events when the worker pipe backpressures", async () => {
  const writes: string[] = [];
  const child = new EventEmitter() as EventEmitter & {
    stdin: EventEmitter & { writable: boolean; write: (chunk: string) => boolean; end: () => void };
    killed: boolean;
  };
  child.stdin = Object.assign(new EventEmitter(), {
    writable: true,
    write: (chunk: string) => {
      writes.push(chunk);
      return false;
    },
    end: () => undefined
  });
  child.killed = false;

  const recorder = createAsyncUsageEventRecorder({ spawn_child: () => child as never });
  recorder.record("C:/logs/usage-worker-test", {
    event_id: "44444444-4444-4444-8444-444444444444",
    user_id: "CU000001",
    username: "Allen",
    device_id: "cutter-test",
    event_type: "view_source_video",
    occurred_at: "2026-10-30T00:00:00.000Z",
    source_video_id: "V000004"
  } as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(writes.length, 1);
  assert.equal(recorder.stats().sent, 1);

  child.stdin.emit("drain");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(writes.length, 1);

  await recorder.dispose();
});

test("async usage recorder bounds its in-memory queue and exposes dropped stats", async () => {
  const recorder = createAsyncUsageEventRecorder({
    queue_limit: 1,
    spawn_child: () => {
      throw new Error("worker unavailable");
    }
  });
  const event = {
    event_id: "22222222-2222-4222-8222-222222222222",
    user_id: "CU000001",
    username: "Allen",
    device_id: "cutter-test",
    event_type: "view_source_video",
    occurred_at: "2026-10-30T00:00:00.000Z",
    source_video_id: "V000002"
  };

  recorder.record("C:\\logs\\usage-worker-test", event as never);
  recorder.record("C:\\logs\\usage-worker-test", event as never);

  const stats = recorder.stats();
  assert.equal(stats.queued, 1);
  assert.equal(stats.dropped, 1);
  assert.equal(stats.worker_alive, false);
  await recorder.dispose();
});

test("async usage recorder best-effort flushes queued events before shutdown", async () => {
  const writes: string[] = [];
  const child = new EventEmitter() as EventEmitter & {
    stdin: EventEmitter & { writable: boolean; write: (chunk: string) => boolean; end: () => void };
    killed: boolean;
  };
  child.stdin = Object.assign(new EventEmitter(), {
    writable: true,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
    end: () => {
      queueMicrotask(() => child.emit("exit", 0));
    }
  });
  child.killed = false;

  const recorder = createAsyncUsageEventRecorder({ spawn_child: () => child as never });
  recorder.record("C:\\logs\\usage-worker-test", {
    event_id: "33333333-3333-4333-8333-333333333333",
    user_id: "CU000001",
    username: "Allen",
    device_id: "cutter-test",
    event_type: "search",
    occurred_at: "2026-10-30T00:00:00.000Z",
    query: "test",
    result_status: "success"
  } as never);

  await recorder.dispose();
  assert.equal(writes.length, 1);
});
