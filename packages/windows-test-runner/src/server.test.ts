import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { RUNNER_VERSION } from "./config.ts";
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

async function freePort(): Promise<number> {
  const server = createServer();
  const baseUrl = await listen(server);
  await close(server);
  return Number(new URL(baseUrl).port);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rmRoot(root: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastError;
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
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          api_ready: true,
          available_video_count: 1,
          release_cache: {
            ready: true,
            sync_status: "ready",
            cache_size_bytes: 1024
          },
          local_cache: {
            source_video_cache: {
              size_bytes: 2048,
              file_count: 1
            }
          },
          source_video_preflight: {
            status: "ready",
            readable_count: 1
          }
        }
      }));
      return;
    }
    if (url.pathname === "/cutter/source-library") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          available_video_count: 1,
          videos: [{ source_video_id: "C0001", title: "测试素材" }]
        }
      }));
      return;
    }
    if (url.pathname === "/cutter/source-search") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          query: url.searchParams.get("query") ?? "",
          normalized_query: url.searchParams.get("query") ?? "",
          search_ms: 7,
          search_mode: "sqlite-index",
          groups: [
            {
              source_video_id: "C0001",
              title: "测试素材",
              hit_count: 2,
              best_excerpt: "第一场公开课",
              hit_segments: [
                { segment_id: "C0001-S0001", begin_ms: 1000, end_ms: 2500, text: "第一场公开课" }
              ]
            }
          ]
        }
      }));
      return;
    }
    if (url.pathname === "/cutter/source-videos/C0001") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          source_video_id: "C0001",
          title: "测试素材",
          duration_ms: 10000,
          media_url: "/cutter/source-videos/C0001/media",
          cover_url: "/cutter/source-videos/C0001/cover",
          detail_url: "/cutter/source-videos/C0001",
          subtitles_url: "/cutter/source-videos/C0001/subtitles.srt",
          transcript: {
            full_text: "第一场公开课，测试文案。",
            segments: [
              { segment_id: "C0001-S0001", begin_ms: 1000, end_ms: 2500, text: "第一场公开课" }
            ]
          },
          keyframes: {
            keyframes_ms: []
          }
        }
      }));
      return;
    }
    if (url.pathname === "/cutter/cut-jobs") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          job_count: 2,
          jobs: [
            { cut_job_id: "CJ0001", status: "done" },
            { cut_job_id: "CJ0002", status: "failed" }
          ]
        }
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

test("runtime Runner version matches package version", async () => {
  const packageJson = JSON.parse(await readFile(
    path.join(process.cwd(), "package.json"),
    "utf8"
  )) as { version: string };

  assert.equal(RUNNER_VERSION, packageJson.version);
});

test("launch_runner starts a backup Runner process on a requested port", async () => {
  const root = await tempRoot();
  const backupPort = await freePort();
  const fakeRunnerScript = path.join(root, "fake-runner.mjs");
  const reportsRoot = path.join(root, "reports");
  let runnerBaseUrl = "";
  let runner: ReturnType<typeof createWindowsTestRunnerServer> | undefined;
  let childPid: number | undefined;
  try {
    await writeFile(fakeRunnerScript, `
      import { createServer } from "node:http";
      const port = Number(process.env.MIXLAB_WINDOWS_TEST_RUNNER_PORT);
      const server = createServer((request, response) => {
        response.setHeader("content-type", "application/json; charset=utf-8");
        if (request.url === "/version") {
          response.end(JSON.stringify({ runner_version: "backup-test" }));
          return;
        }
        if (request.url === "/health") {
          response.end(JSON.stringify({ ok: true, runner_version: "backup-test" }));
          return;
        }
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false }));
      });
      server.listen(port, "127.0.0.1");
    `, "utf8");

    runner = createWindowsTestRunnerServer(runnerConfig({
      reportsRoot,
      cutterApiBaseUrl: "http://127.0.0.1:9"
    }));
    runnerBaseUrl = await listen(runner.server);

    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "launch_runner",
        options: {
          port: backupPort,
          runner_path: process.execPath,
          runner_args: [fakeRunnerScript],
          copy_runner: false,
          version_expected: "backup-test",
          timeout_ms: 5000
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      launch_runner: {
        requested_port: number;
        observed_runner_version?: string;
        ready: boolean;
        copied_runner: boolean;
        child_pid?: number;
      };
    };
    assert.equal(report.status, "passed");
    assert.equal(report.launch_runner.ready, true);
    assert.equal(report.launch_runner.requested_port, backupPort);
    assert.equal(report.launch_runner.observed_runner_version, "backup-test");
    assert.equal(report.launch_runner.copied_runner, false);
    childPid = report.launch_runner.child_pid;
  } finally {
    if (childPid) {
      try {
        process.kill(childPid);
      } catch {
        // The fake backup process may already have exited.
      }
    }
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

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
    assert.match(timelineText, /"stage":"starting"/);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("cutter_api_smoke validates search, detail, cache, and cut queue shape", async () => {
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

    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "cutter_api_smoke",
        options: {
          queries: ["第一场"],
          source_limit: 20
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      cutter_api_smoke: {
        runtime?: {
          available_video_count?: number;
          release_cache_ready?: boolean;
          source_video_cache_size_bytes?: number;
        };
        source_library?: {
          available_video_count: number;
          returned_count: number;
        };
        search?: {
          query: string;
          groups_count: number;
          source_video_id?: string;
        };
        detail?: {
          source_video_id: string;
          transcript_character_count: number;
          segment_count: number;
        };
        cut_jobs?: {
          job_count: number;
          failed_count: number;
          done_count: number;
        };
        checks: Array<{ id: string; ok: boolean }>;
      };
    };
    assert.equal(report.status, "passed");
    assert.equal(report.cutter_api_smoke.runtime?.available_video_count, 1);
    assert.equal(report.cutter_api_smoke.runtime?.release_cache_ready, true);
    assert.equal(report.cutter_api_smoke.runtime?.source_video_cache_size_bytes, 2048);
    assert.equal(report.cutter_api_smoke.source_library?.returned_count, 1);
    assert.equal(report.cutter_api_smoke.search?.source_video_id, "C0001");
    assert.equal(report.cutter_api_smoke.detail?.source_video_id, "C0001");
    assert.equal(report.cutter_api_smoke.detail?.segment_count, 1);
    assert.equal(report.cutter_api_smoke.cut_jobs?.failed_count, 1);
    assert.deepEqual(report.cutter_api_smoke.checks.map((check) => [check.id, check.ok]), [
      ["runtime_status", true],
      ["source_library", true],
      ["source_search:第一场", true],
      ["source_video_detail", true],
      ["cut_jobs", true]
    ]);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
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
    await rmRoot(root);
  }
});

test("launch_app_probe starts an app candidate and runs cutter API probes", async () => {
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

    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "launch_app_probe",
        options: {
          app_path: process.execPath,
          app_args: ["-e", "setTimeout(() => {}, 250)"],
          force_launch: true,
          api_ready_timeout_ms: 1000
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      launch_app_probe: {
        app_started: boolean;
        app_executable_path: string;
        api_ready: boolean;
        candidates: Array<{ path: string; exists: boolean }>;
      };
    };
    assert.equal(report.status, "passed");
    assert.equal(report.launch_app_probe.app_started, true);
    assert.equal(report.launch_app_probe.app_executable_path, process.execPath);
    assert.equal(report.launch_app_probe.api_ready, true);
    assert.equal(report.launch_app_probe.candidates[0].exists, true);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("launch_app_probe discovers a nested MixLab Cutter executable", async () => {
  const root = await tempRoot();
  const previousSearchRoot = process.env.MIXLAB_CUTTER_APP_SEARCH_ROOT;
  const nestedDir = path.join(root, "vendor", "mixlab-cutter");
  const nestedAppPath = path.join(nestedDir, "MixLab Cutter.exe");
  const api = createMockCutterApi();
  let apiBaseUrl = "";
  let runnerBaseUrl = "";
  let runner: ReturnType<typeof createWindowsTestRunnerServer> | undefined;
  try {
    await mkdir(nestedDir, { recursive: true });
    await copyFile(process.execPath, nestedAppPath);
    await chmod(nestedAppPath, 0o755);
    process.env.MIXLAB_CUTTER_APP_SEARCH_ROOT = root;

    apiBaseUrl = await listen(api);
    runner = createWindowsTestRunnerServer(runnerConfig({
      reportsRoot: path.join(root, "reports"),
      cutterApiBaseUrl: apiBaseUrl
    }));
    runnerBaseUrl = await listen(runner.server);

    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "launch_app_probe",
        options: {
          app_args: ["-e", ""],
          force_launch: true,
          api_ready_timeout_ms: 1000
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      launch_app_probe: {
        app_executable_path: string;
        candidates: Array<{ path: string; exists: boolean }>;
      };
    };
    assert.equal(report.status, "passed");
    assert.equal(report.launch_app_probe.app_executable_path, nestedAppPath);
    assert.ok(report.launch_app_probe.candidates.some((candidate) => (
      candidate.path === nestedAppPath && candidate.exists
    )));
  } finally {
    if (previousSearchRoot === undefined) {
      delete process.env.MIXLAB_CUTTER_APP_SEARCH_ROOT;
    } else {
      process.env.MIXLAB_CUTTER_APP_SEARCH_ROOT = previousSearchRoot;
    }
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("launch_app_probe reports app_executable_not_found for missing app paths", async () => {
  const root = await tempRoot();
  const missingAppPath = path.join(root, "missing", "MixLab Cutter.exe");
  const runner = createWindowsTestRunnerServer(runnerConfig({
    reportsRoot: path.join(root, "reports"),
    cutterApiBaseUrl: "http://127.0.0.1:9"
  }));
  try {
    const runnerBaseUrl = await listen(runner.server);
    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "launch_app_probe",
        options: {
          app_path: missingAppPath,
          api_ready_timeout_ms: 100
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "failed");
    assert.equal(finished.failure_category, "app_executable_not_found");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      launch_app_probe: {
        candidates: Array<{ path: string; exists: boolean }>;
      };
    };
    assert.equal(report.status, "failed");
    assert.equal(report.launch_app_probe.candidates[0].path, missingAppPath);
    assert.equal(report.launch_app_probe.candidates[0].exists, false);
  } finally {
    await close(runner.server);
    await rmRoot(root);
  }
});

test("launch_app_probe attaches desktop diagnostics when API readiness times out", async () => {
  const root = await tempRoot();
  const previousAppData = process.env.APPDATA;
  const appDataRoot = path.join(root, "AppData", "Roaming");
  const logDir = path.join(appDataRoot, "MixLab Cutter", "logs");
  await mkdir(logDir, { recursive: true });
  await writeFile(
    path.join(logDir, "desktop-host.ndjson"),
    `${JSON.stringify({ event: "engine_sidecar_missing", details: { error: "missing sidecar" } })}\n`,
    "utf8"
  );

  const runner = createWindowsTestRunnerServer(runnerConfig({
    reportsRoot: path.join(root, "reports"),
    cutterApiBaseUrl: "http://127.0.0.1:9"
  }));
  try {
    process.env.APPDATA = appDataRoot;
    const runnerBaseUrl = await listen(runner.server);
    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "launch_app_probe",
        options: {
          app_path: process.execPath,
          app_args: ["-e", ""],
          force_launch: true,
          api_ready_timeout_ms: 100
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "failed");
    assert.equal(finished.failure_category, "api_health_timeout");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      launch_app_probe: {
        desktop_diagnostics?: {
          files: Array<{ path: string; exists: boolean; tail?: string }>;
        };
      };
    };
    const desktopHostLog = report.launch_app_probe.desktop_diagnostics?.files.find((file) => (
      file.path.endsWith(path.join("MixLab Cutter", "logs", "desktop-host.ndjson"))
    ));
    assert.equal(desktopHostLog?.exists, true);
    assert.match(desktopHostLog?.tail ?? "", /engine_sidecar_missing/);
  } finally {
    if (previousAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = previousAppData;
    }
    await close(runner.server);
    await rmRoot(root);
  }
});

test("runner keeps HTTP reports available when the shared report directory cannot be written", async () => {
  const root = await tempRoot();
  const api = createMockCutterApi();
  let apiBaseUrl = "";
  let runnerBaseUrl = "";
  let runner: ReturnType<typeof createWindowsTestRunnerServer> | undefined;
  try {
    apiBaseUrl = await listen(api);
    const blockedReportsRoot = path.join(root, "reports-blocker");
    await writeFile(blockedReportsRoot, "not a directory", "utf8");
    runner = createWindowsTestRunnerServer(runnerConfig({
      reportsRoot: blockedReportsRoot,
      cutterApiBaseUrl: apiBaseUrl
    }));
    runnerBaseUrl = await listen(runner.server);

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
      report_write_error?: string;
      probe_api: { probes: Array<{ id: string; ok: boolean }> };
    };
    assert.equal(report.status, "passed");
    assert.match(report.report_write_error ?? "", /ENOTDIR|not a directory|Failed to/i);
    assert.deepEqual(report.probe_api.probes.map((probe) => [probe.id, probe.ok]), [
      ["health", true],
      ["auth_mode", true],
      ["runtime_status", true],
      ["source_library_first_page", true]
    ]);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
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
    assert.match(body.error, /Supported suites/);
  } finally {
    await close(runner.server);
    await rmRoot(root);
  }
});
