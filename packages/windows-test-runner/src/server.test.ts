import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { createWindowsTestRunnerServer } from "./server.ts";
import type { RunnerConfig, RunnerStatus, RunSummary } from "./types.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-windows-test-runner-"));
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

function createMockCutterApi(): Server {
  return createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (url.pathname === "/health") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/cutter/auth/mode") {
      response.end(JSON.stringify({ auth_mode: "local_trusted", local_trusted: true }));
      return;
    }
    if (url.pathname === "/cutter/runtime-status") {
      response.end(JSON.stringify({ ok: true, release_version: "v000001" }));
      return;
    }
    if (url.pathname === "/cutter/source-library") {
      response.end(JSON.stringify({
        total: 1,
        items: [{ source_video_id: "C0001", title: "测试素材" }]
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
}

function runnerConfig(input: { reportsRoot: string; cutterApiBaseUrl: string }): RunnerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    share_root: path.dirname(input.reportsRoot),
    reports_root: input.reportsRoot,
    cutter_api_base_url: input.cutterApiBaseUrl,
    runner_version: "test"
  };
}

async function waitForRun(baseUrl: string, runId: string): Promise<Record<string, unknown>> {
  const terminal = new Set<RunnerStatus>(["passed", "failed", "cancelled"]);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/runs/${runId}`);
    assert.equal(response.status, 200);
    const body = await response.json() as { run: Record<string, unknown> };
    if (terminal.has(body.run.status as RunnerStatus)) {
      return body.run;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Run ${runId} did not finish`);
}

test("runner exposes health, version, status, and a passing probe_api run", async () => {
  const root = await tempRoot();
  const api = createMockCutterApi();
  let apiBaseUrl = "";
  let runnerBaseUrl = "";
  let runner: ReturnType<typeof createWindowsTestRunnerServer> | undefined;
  try {
    apiBaseUrl = await listen(api);
    runner = createWindowsTestRunnerServer(runnerConfig({
      reportsRoot: path.join(root, "reports"),
      cutterApiBaseUrl: apiBaseUrl
    }));
    runnerBaseUrl = await listen(runner.server);

    assert.deepEqual(await (await fetch(`${runnerBaseUrl}/health`)).json(), {
      ok: true,
      runner: "mixlab-windows-test-runner",
      runner_version: "test"
    });
    assert.deepEqual(await (await fetch(`${runnerBaseUrl}/version`)).json(), {
      runner_version: "test"
    });
    const status = await (await fetch(`${runnerBaseUrl}/status`)).json() as Record<string, unknown>;
    assert.equal(status.cutter_api_base_url, apiBaseUrl);

    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suite: "probe_api" })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const reportResponse = await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`);
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json() as {
      status: string;
      probe_api: { probes: Array<{ id: string; ok: boolean }> };
    };
    assert.equal(report.status, "passed");
    assert.deepEqual(report.probe_api.probes.map((probe) => [probe.id, probe.ok]), [
      ["health", true],
      ["auth_mode", true],
      ["runtime_status", true],
      ["source_library_first_page", true]
    ]);

    await stat(path.join(root, "reports", created.run.run_id, "report.json"));
    await stat(path.join(root, "reports", created.run.run_id, "summary.md"));
    const timelineText = await readFile(path.join(root, "reports", created.run.run_id, "timeline.ndjson"), "utf8");
    assert.match(timelineText, /"stage":"passed"/);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("probe_api run fails with api_health_timeout when the cutter API is unavailable", async () => {
  const root = await tempRoot();
  const runner = createWindowsTestRunnerServer(runnerConfig({
    reportsRoot: path.join(root, "reports"),
    cutterApiBaseUrl: "http://127.0.0.1:9"
  }));
  let runnerBaseUrl = "";
  try {
    runnerBaseUrl = await listen(runner.server);
    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suite: "probe_api", options: { timeout_ms: 100 } })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "failed");
    assert.equal(finished.failure_category, "api_health_timeout");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      failure_category: string;
    };
    assert.equal(report.status, "failed");
    assert.equal(report.failure_category, "api_health_timeout");
  } finally {
    await close(runner.server);
    await rm(root, { recursive: true, force: true });
  }
});

test("runner rejects unsupported run suites", async () => {
  const root = await tempRoot();
  const runner = createWindowsTestRunnerServer(runnerConfig({
    reportsRoot: path.join(root, "reports"),
    cutterApiBaseUrl: "http://127.0.0.1:3789"
  }));
  try {
    const runnerBaseUrl = await listen(runner.server);
    const response = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suite: "install_latest_and_smoke" })
    });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: string };
    assert.match(body.error, /Phase 1/);
  } finally {
    await close(runner.server);
    await rm(root, { recursive: true, force: true });
  }
});
