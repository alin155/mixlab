import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import test from "node:test";
import {
  buildCutterApiServerInputFromDesktopConfig,
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
      workspace_root: String.raw`C:\Users\Allen\Videos\MixLabLocal`
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
      assert.equal(input.auth_mode, undefined);
      return fakeServer as unknown as Server;
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
