import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveDesktopBridgeEnvironment,
  resolveRuntimeApiBaseUrl,
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
