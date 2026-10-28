import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertRunnerSecurityConfig,
  DEFAULT_MAX_BODY_BYTES,
  isLoopbackHost,
  resolveRunnerConfig
} from "./config.ts";
import {
  createWindowsTestRunnerServer,
  evaluateRunRequestSecurity
} from "./server.ts";
import { assertInstallerWithinShareRoot } from "./actions/install-latest-and-smoke.ts";
import type { RunnerConfig } from "./types.ts";

const AUTH_TOKEN = "0123456789abcdef-runner-token";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-runner-security-"));
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  server.close();
  await once(server, "close");
}

async function secureRunnerConfig(shareRoot: string): Promise<RunnerConfig> {
  return {
    host: "127.0.0.1",
    port: 0,
    share_root: shareRoot,
    reports_root: path.join(shareRoot, "reports"),
    cutter_api_base_url: "http://127.0.0.1:1",
    runner_version: "test",
    auth_token: AUTH_TOKEN,
    require_destructive_confirm: true,
    require_installer_sha256: true,
    max_body_bytes: 256
  };
}

test("runner defaults to loopback and derives security defaults", () => {
  const config = resolveRunnerConfig({});
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3799);
  assert.equal(config.require_destructive_confirm, true);
  assert.equal(config.require_installer_sha256, false);
  assert.equal(config.max_body_bytes, DEFAULT_MAX_BODY_BYTES);
});

test("LAN binding requires a strong token", () => {
  const lanConfig = resolveRunnerConfig({
    MIXLAB_WINDOWS_TEST_RUNNER_HOST: "0.0.0.0"
  });
  assert.equal(isLoopbackHost(lanConfig.host), false);
  assert.throws(() => assertRunnerSecurityConfig(lanConfig), /MIXLAB_WINDOWS_TEST_RUNNER_TOKEN/);

  const withToken = resolveRunnerConfig({
    MIXLAB_WINDOWS_TEST_RUNNER_HOST: "192.168.1.20",
    MIXLAB_WINDOWS_TEST_RUNNER_TOKEN: AUTH_TOKEN
  });
  assert.doesNotThrow(() => assertRunnerSecurityConfig(withToken));

  const weakToken = resolveRunnerConfig({
    MIXLAB_WINDOWS_TEST_RUNNER_HOST: "192.168.1.20",
    MIXLAB_WINDOWS_TEST_RUNNER_TOKEN: "short"
  });
  assert.throws(() => assertRunnerSecurityConfig(weakToken), /至少需要/);
});

test("runner requires a token and keeps health public", async () => {
  const shareRoot = await tempRoot();
  const runner = createWindowsTestRunnerServer(await secureRunnerConfig(shareRoot));
  const baseUrl = await listen(runner.server);
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const unauthorized = await fetch(`${baseUrl}/status`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${baseUrl}/status`, {
      headers: { authorization: `Bearer ${AUTH_TOKEN}` }
    });
    assert.equal(authorized.status, 200);

    const headerToken = await fetch(`${baseUrl}/version`, {
      headers: { "x-mixlab-runner-token": AUTH_TOKEN }
    });
    assert.equal(headerToken.status, 200);
  } finally {
    await close(runner.server);
    await rm(shareRoot, { recursive: true, force: true });
  }
});

test("runner rejects foreign browser origins", async () => {
  const shareRoot = await tempRoot();
  const runner = createWindowsTestRunnerServer(await secureRunnerConfig(shareRoot));
  const baseUrl = await listen(runner.server);
  try {
    const rejected = await fetch(`${baseUrl}/status`, {
      headers: {
        authorization: `Bearer ${AUTH_TOKEN}`,
        origin: "https://evil.example"
      }
    });
    assert.equal(rejected.status, 403);
    const allowed = await fetch(`${baseUrl}/status`, {
      headers: {
        authorization: `Bearer ${AUTH_TOKEN}`,
        origin: "http://127.0.0.1:5173"
      }
    });
    assert.equal(allowed.status, 200);
  } finally {
    await close(runner.server);
    await rm(shareRoot, { recursive: true, force: true });
  }
});

test("runner rejects oversized request bodies", async () => {
  const shareRoot = await tempRoot();
  const runner = createWindowsTestRunnerServer(await secureRunnerConfig(shareRoot));
  const baseUrl = await listen(runner.server);
  try {
    const oversizedBody = JSON.stringify({
      suite: "probe_api",
      padding: "x".repeat(4096)
    });
    const response = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AUTH_TOKEN}`,
        "content-type": "application/json"
      },
      body: oversizedBody
    });
    assert.equal(response.status, 413);
  } finally {
    await close(runner.server);
    await rm(shareRoot, { recursive: true, force: true });
  }
});

test("destructive suites require explicit confirm when configured", async () => {
  const shareRoot = await tempRoot();
  const config = await secureRunnerConfig(shareRoot);
  const rejected = evaluateRunRequestSecurity({ suite: "windows_acceptance" }, config);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.code, "confirm_required");
  }
  const confirmed = evaluateRunRequestSecurity({ suite: "windows_acceptance", confirm: true }, config);
  assert.equal(confirmed.ok, true);

  const nonDestructive = evaluateRunRequestSecurity({ suite: "probe_api" }, config);
  assert.equal(nonDestructive.ok, true);

  const disabled = evaluateRunRequestSecurity(
    { suite: "windows_acceptance" },
    { ...config, require_destructive_confirm: false }
  );
  assert.equal(disabled.ok, true);
});

test("installer_path must point to an .exe inside the share root", async () => {
  const shareRoot = await tempRoot();
  const inside = path.join(shareRoot, "MixLab Cutter_0.19_setup.exe");
  await writeFile(inside, "fake", "utf8");
  assert.equal(assertInstallerWithinShareRoot(shareRoot, inside), path.resolve(inside));

  const outside = path.join(os.tmpdir(), "MixLab Cutter_outside_setup.exe");
  assert.throws(() => assertInstallerWithinShareRoot(shareRoot, outside), /inside the Runner share root/);

  const nonExe = path.join(shareRoot, "payload.txt");
  await writeFile(nonExe, "fake", "utf8");
  assert.throws(() => assertInstallerWithinShareRoot(shareRoot, nonExe), /Windows \.exe installer/);

  await rm(shareRoot, { recursive: true, force: true });
});
