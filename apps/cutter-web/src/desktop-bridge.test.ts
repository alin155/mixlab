import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDesktopUpdate,
  desktopAppVersion,
  downloadDesktopUpdate,
  installDesktopUpdate,
  launchDesktopRepairTool,
  openDesktopDirectory,
  resolveDesktopBridgeEnvironment,
  resolveRuntimeApiBaseUrl,
  startDesktopEngine,
  waitForDesktopEngineReady
} from "./desktop-bridge.ts";

test("desktop bridge falls back to web mode without Tauri globals", () => {
  assert.deepEqual(resolveDesktopBridgeEnvironment({}), {
    mode: "web",
    desktop_available: false
  });
});

test("desktop bridge exposes fixed local API address only inside Tauri", () => {
  assert.deepEqual(resolveDesktopBridgeEnvironment({ __TAURI_INTERNALS__: {} }), {
    mode: "desktop",
    desktop_available: true,
    api_base_url: "http://127.0.0.1:3789"
  });

  assert.deepEqual(resolveDesktopBridgeEnvironment({ __TAURI__: {} }), {
    mode: "desktop",
    desktop_available: true,
    api_base_url: "http://127.0.0.1:3789"
  });
});

test("runtime API base URL keeps web env behavior and overrides only inside desktop", () => {
  assert.equal(
    resolveRuntimeApiBaseUrl({
      vite_api_base_url: "http://127.0.0.1:4000",
      global_like: {}
    }),
    "http://127.0.0.1:4000"
  );

  assert.equal(
    resolveRuntimeApiBaseUrl({
      vite_api_base_url: "",
      global_like: { __TAURI_INTERNALS__: {} }
    }),
    "http://127.0.0.1:3789"
  );
});

test("runtime API base URL uses same-origin cutter engine pages as real API mode", () => {
  assert.equal(
    resolveRuntimeApiBaseUrl({
      vite_api_base_url: "",
      global_like: {},
      location_origin: "http://127.0.0.1:3789"
    }),
    "http://127.0.0.1:3789"
  );

  assert.equal(
    resolveRuntimeApiBaseUrl({
      vite_api_base_url: "",
      global_like: {},
      location_origin: "http://localhost:3789"
    }),
    "http://localhost:3789"
  );

  assert.equal(
    resolveRuntimeApiBaseUrl({
      vite_api_base_url: "",
      global_like: {},
      location_origin: "http://127.0.0.1:5173"
    }),
    ""
  );
});

test("desktop engine readiness waits for health endpoint success", async () => {
  const requestedUrls: string[] = [];
  const statuses = [false, true];

  await waitForDesktopEngineReady({
    api_base_url: "http://127.0.0.1:3789",
    attempts: 2,
    delay_ms: 0,
    sleep_fn: async () => {},
    fetch_fn: async (url) => {
      requestedUrls.push(String(url));
      return { ok: statuses.shift() ?? false } as Response;
    }
  });

  assert.deepEqual(requestedUrls, [
    "http://127.0.0.1:3789/health",
    "http://127.0.0.1:3789/health"
  ]);
});

test("desktop engine readiness fails when health endpoint never responds", async () => {
  await assert.rejects(
    () => waitForDesktopEngineReady({
      attempts: 2,
      delay_ms: 0,
      sleep_fn: async () => {},
      fetch_fn: async () => {
        throw new Error("connection refused");
      }
    }),
    /启动超时/
  );
});

test("desktop engine startup delegates sidecar spawning to the native desktop host", async () => {
  const calls: unknown[] = [];

  await startDesktopEngine(String.raw`C:\Users\Allen\AppData\Roaming\MixLab Cutter\cutter-desktop-config.json`, {
    invoke_fn: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return undefined as T;
    },
    wait_for_ready: async () => {}
  });

  assert.deepEqual(calls, [
    {
      command: "desktop_start_engine",
      args: {
        configPath: String.raw`C:\Users\Allen\AppData\Roaming\MixLab Cutter\cutter-desktop-config.json`
      }
    }
  ]);
});

test("desktop app version delegates to the native desktop host", async () => {
  const calls: unknown[] = [];

  const version = await desktopAppVersion({
    invoke_fn: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return "0.18.4" as T;
    }
  });

  assert.equal(version, "0.18.4");
  assert.deepEqual(calls, [{ command: "desktop_app_version", args: undefined }]);
});

test("desktop directory opening delegates to the native desktop host", async () => {
  const calls: unknown[] = [];

  await openDesktopDirectory(String.raw`C:\Users\Allen\AppData\Roaming\MixLab Cutter\logs`, {
    invoke_fn: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return undefined as T;
    }
  });

  assert.deepEqual(calls, [
    {
      command: "desktop_open_directory",
      args: {
        pathValue: String.raw`C:\Users\Allen\AppData\Roaming\MixLab Cutter\logs`
      }
    }
  ]);
});

test("desktop update commands delegate to native host", async () => {
  const calls: unknown[] = [];
  const invoke_fn = async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    if (command === "desktop_check_update") {
      return {
        available: true,
        current_version: "0.18.26",
        latest_version: "0.18.27",
        notes: "更新说明",
        size_bytes: 1024,
        manifest: {
          version: "0.18.27",
          installer: "MixLab Cutter_0.18.27_x64-setup-abc.exe",
          sha256: "abc"
        }
      } as T;
    }
    if (command === "desktop_download_update") {
      return String.raw`C:\Users\Allen\AppData\Local\MixLab Cutter\updates\MixLab Cutter_0.18.27_x64-setup-abc.exe` as T;
    }
    return undefined as T;
  };

  const checked = await checkDesktopUpdate({ invoke_fn });
  assert.equal(checked.latest_version, "0.18.27");
  const downloaded = await downloadDesktopUpdate(
    {
      version: "0.18.27",
      installer: "MixLab Cutter_0.18.27_x64-setup-abc.exe",
      sha256: "abc"
    },
    { invoke_fn }
  );
  assert.match(downloaded, /updates/);
  await installDesktopUpdate(downloaded, "abc", { invoke_fn });

  assert.equal(calls.length, 3);
  assert.deepEqual((calls[0] as { command: string }).command, "desktop_check_update");
  assert.equal((calls[1] as { command: string }).command, "desktop_download_update");
  assert.equal((calls[2] as { command: string }).command, "desktop_install_update");
  assert.deepEqual((calls[2] as { args: Record<string, unknown> }).args, { installerPath: downloaded, expectedSha256: "abc" });
});

test("desktop bridge launches the bundled repair tool as a separate process", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const path = await launchDesktopRepairTool("manual", {
    invoke_fn: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return String.raw`C:\Program Files\MixLab Cutter\binaries\MixLab Cutter 修复工具.exe` as T;
    }
  });
  assert.equal(calls[0]?.command, "desktop_launch_repair_tool");
  assert.deepEqual(calls[0]?.args, { source: "manual" });
  assert.match(path, /MixLab Cutter 修复工具\.exe$/u);
});

