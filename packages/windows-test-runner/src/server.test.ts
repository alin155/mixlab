import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { RUNNER_VERSION } from "./config.ts";
import { startStartupRun, parseStartupRunRequest } from "./startup-run.ts";
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

async function readMockRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function createMockCutterApi(input: {
  authMode?: "local_trusted" | "reviewed";
  deviceId?: string;
  sessionToken?: string;
  username?: string;
  password?: string;
} = {}): Server {
  const authMode = input.authMode ?? "local_trusted";
  const deviceId = input.deviceId ?? "acceptance-device";
  const sessionToken = input.sessionToken ?? "acceptance-session";
  const username = input.username ?? "hqh";
  const password = input.password ?? "hqh123456";
  function isAuthenticated(request: IncomingMessage): boolean {
    return (
      request.headers["x-mixlab-device-id"] === deviceId &&
      request.headers["x-mixlab-session-token"] === sessionToken
    );
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (url.pathname === "/health") {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/cutter/auth/mode") {
      response.end(JSON.stringify({ auth_mode: authMode, local_trusted: authMode === "local_trusted" }));
      return;
    }
    if (url.pathname === "/cutter/auth/login" && request.method === "POST") {
      const body = await readMockRequestBody(request) as Record<string, unknown>;
      if (
        body.username !== username ||
        body.password !== password ||
        body.device_id !== deviceId
      ) {
        response.statusCode = 401;
        response.end(JSON.stringify({
          error: {
            code: "invalid_credentials",
            message: "账号或密码不正确"
          }
        }));
        return;
      }
      response.end(JSON.stringify({
        data: {
          user: {
            username,
            status: "approved"
          },
          session: {
            device_id: deviceId,
            session_token: sessionToken
          }
        }
      }));
      return;
    }
    if (authMode === "reviewed" && !isAuthenticated(request)) {
      response.statusCode = 401;
      response.end(JSON.stringify({
        error: {
          code: "login_required",
          message: "请先登录剪辑工作台"
        }
      }));
      return;
    }
    if (url.pathname === "/cutter/runtime-status") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          mode: "api",
          mode_label: "真实 Cutter API 模式",
          api_ready: true,
          auth_mode: authMode,
          library_id: "lib-main",
          library_root_label: "source-library",
          available_video_count: 1,
          workspace_enabled: true,
          workspace_root_label: "workspace",
          ffmpeg_status: "可用",
          ffmpeg_source: "内置",
          release_cache: {
            cache_root_path: "C:\\MixLab\\release-cache",
            cache_size_bytes: 2048,
            cached_release_count: 1
          },
          local_cache: {
            cache_root_path: "C:\\MixLab\\local-cache",
            thumbnail_cache_root_path: "C:\\MixLab\\local-cache\\thumbnails",
            thumbnail_cache_size_bytes: 1024,
            thumbnail_cache_max_bytes: 1024 * 1024,
            thumbnail_cache_manifest_entry_count: 1,
            source_video_cache: {
              cache_root_path: "C:\\MixLab\\local-cache\\source-videos",
              size_bytes: 4096,
              cached_video_count: 1
            },
            cut_temp_cache: {
              cache_root_path: "C:\\MixLab\\local-cache\\cut-temp",
              size_bytes: 512
            }
          },
          source_video_preflight: {
            status: "pass",
            sample_source_video_id: "C0001"
          }
        }
      }));
      return;
    }
    if (url.pathname === "/cutter/source-library") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          library_id: "lib-main",
          available_video_count: 1,
          videos: [{
            source_video_id: "C0001",
            title: "测试素材",
            duration_ms: 60_000,
            detail_url: "/cutter/source-videos/C0001"
          }]
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
          search_mode: "searchd",
          groups: [{
            source_video_id: "C0001",
            title: "测试素材",
            hit_count: 2,
            detail_url: "/cutter/source-videos/C0001",
            hit_segments: [{
              segment_id: "S0001",
              begin_ms: 0,
              end_ms: 3000,
              text: "第一场公开课讲现金流。"
            }]
          }]
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
          duration_ms: 60_000,
          transcript: {
            full_text: "第一场公开课讲现金流。",
            segments: [{
              segment_id: "S0001",
              begin_ms: 0,
              end_ms: 3000,
              text: "第一场公开课讲现金流。"
            }]
          },
          keyframes: {
            keyframes_ms: []
          }
        }
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/cutter/clip-lists") {
      await readMockRequestBody(request);
      response.statusCode = 201;
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          clip_list_id: "CLSMOKE",
          title: "Windows验收剪切",
          item_count: 1,
          items: []
        }
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/cutter/cut-jobs") {
      await readMockRequestBody(request);
      response.statusCode = 201;
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          submitted_count: 1,
          jobs: [{
            cut_job_id: "CJSMOKE",
            status: "pending"
          }]
        }
      }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/cutter/cut-jobs/run-next") {
      response.end(JSON.stringify({
        schema_version: "1.0",
        data: {
          cut_job_id: "CJSMOKE",
          status: "done",
          export_clip_id: "ESMOKE",
          output_file: "projects/Windows验收剪切/001-smoke.mp4",
          phase_timings: [
            { phase_id: "resolve_source", label: "准备源素材", status: "done", duration_ms: 125 },
            { phase_id: "cut_media", label: "剪切/重编码", status: "done", duration_ms: 900 }
          ]
        }
      }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/cutter/cut-jobs") {
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
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = JSON.parse(await readFile(
    path.join(packageRoot, "package.json"),
    "utf8"
  )) as { version: string };

  assert.equal(RUNNER_VERSION, packageJson.version);
});

test("startup run request creates a report pointer for firewall-hidden backup runners", async () => {
  const root = await tempRoot();
  const config = runnerConfig({
    reportsRoot: path.join(root, "reports"),
    cutterApiBaseUrl: "http://127.0.0.1:1"
  });
  const runner = createWindowsTestRunnerServer(runnerConfig({
    reportsRoot: path.join(root, "reports"),
    cutterApiBaseUrl: "http://127.0.0.1:1"
  }));
  try {
    const request = parseStartupRunRequest(JSON.stringify({
      suite: "probe_api",
      options: { timeout_ms: 1 }
    }));
    assert.equal(request?.suite, "probe_api");
    const record = startStartupRun({
      config,
      store: runner.store,
      request: request!
    });
    const pointerPath = path.join(root, "reports", "startup-run-latest.json");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(50);
      const pointer = JSON.parse(await readFile(pointerPath, "utf8")) as Record<string, unknown>;
      if (pointer.status === "failed") {
        assert.equal(pointer.run_id, record.run_id);
        assert.equal(pointer.suite, "probe_api");
        assert.equal(pointer.failure_category, "api_health_timeout");
        assert.equal(typeof pointer.report_path, "string");
        return;
      }
    }
    assert.fail("startup run pointer was not updated with terminal status");
  } finally {
    await close(runner.server);
    await rmRoot(root);
  }
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

test("runner supports planned non-destructive Windows app acceptance suites", async () => {
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

    for (const suite of ["app_runtime_smoke", "real_data_smoke", "cache_smoke", "windows_acceptance"]) {
      const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suite })
      });
      assert.equal(createResponse.status, 202);
      const created = await createResponse.json() as { run: RunSummary };
      const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
      assert.equal(finished.status, "passed");

      const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as Record<string, unknown>;
      assert.equal(report.status, "passed");
      assert.ok(report[suite]);
    }

    const acceptanceResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suite: "windows_acceptance" })
    });
    assert.equal(acceptanceResponse.status, 202);
    const created = await acceptanceResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      windows_acceptance: {
        app_runtime_smoke: {
          local_trusted: boolean;
          source_library: { available_video_count: number; returned_count: number };
        };
        real_data_smoke: {
          selected_detail: {
            transcript_character_count: number;
            transcript_segment_count: number;
          };
          cut_jobs: {
            job_count: number;
            done_count: number;
            failed_count: number;
          };
        };
        cache_smoke: {
          observed_cache_bucket_count: number;
          total_observed_cache_size_bytes: number;
        };
      };
    };
    assert.equal(report.windows_acceptance.app_runtime_smoke.local_trusted, true);
    assert.equal(report.windows_acceptance.app_runtime_smoke.source_library.available_video_count, 1);
    assert.equal(report.windows_acceptance.app_runtime_smoke.source_library.returned_count, 1);
    assert.equal(report.windows_acceptance.real_data_smoke.selected_detail.transcript_character_count, "第一场公开课讲现金流。".length);
    assert.equal(report.windows_acceptance.real_data_smoke.selected_detail.transcript_segment_count, 1);
    assert.equal(report.windows_acceptance.real_data_smoke.cut_jobs.job_count, 2);
    assert.equal(report.windows_acceptance.real_data_smoke.cut_jobs.done_count, 1);
    assert.equal(report.windows_acceptance.real_data_smoke.cut_jobs.failed_count, 1);
    assert.equal(report.windows_acceptance.cache_smoke.observed_cache_bucket_count, 4);
    assert.equal(report.windows_acceptance.cache_smoke.total_observed_cache_size_bytes, 7680);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("windows acceptance supports reviewed auth with supplied cutter session headers", async () => {
  const root = await tempRoot();
  const deviceId = "acceptance-device";
  const sessionToken = "acceptance-session";
  const api = createMockCutterApi({
    authMode: "reviewed",
    deviceId,
    sessionToken
  });
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
        suite: "windows_acceptance",
        options: {
          auth_headers: {
            device_id: deviceId,
            session_token: sessionToken
          }
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      windows_acceptance: {
        app_runtime_smoke: {
          auth_mode: string;
          local_trusted: boolean;
          source_library: { available_video_count: number; returned_count: number };
        };
        real_data_smoke: {
          selected_detail: {
            transcript_segment_count: number;
          };
        };
      };
    };
    assert.equal(report.windows_acceptance.app_runtime_smoke.auth_mode, "reviewed");
    assert.equal(report.windows_acceptance.app_runtime_smoke.local_trusted, false);
    assert.equal(report.windows_acceptance.app_runtime_smoke.source_library.available_video_count, 1);
    assert.equal(report.windows_acceptance.app_runtime_smoke.source_library.returned_count, 1);
    assert.equal(report.windows_acceptance.real_data_smoke.selected_detail.transcript_segment_count, 1);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("windows acceptance can login with reviewed cutter credentials without leaking secrets", async () => {
  const root = await tempRoot();
  const deviceId = "acceptance-device";
  const sessionToken = "acceptance-session";
  const password = "hqh123456";
  const api = createMockCutterApi({
    authMode: "reviewed",
    deviceId,
    sessionToken,
    username: "hqh",
    password
  });
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
        suite: "windows_acceptance",
        options: {
          auth_credentials: {
            username: "hqh",
            password,
            device_id: deviceId,
            device_name: "Windows Runner"
          }
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const reportText = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).text();
    assert.equal(reportText.includes(password), false);
    assert.equal(reportText.includes(sessionToken), false);

    const report = JSON.parse(reportText) as {
      windows_acceptance: {
        app_runtime_smoke: {
          auth_mode: string;
          local_trusted: boolean;
          auth_source: string;
          checks: Array<{ id: string; body?: unknown }>;
        };
        real_data_smoke: {
          selected_detail: {
            transcript_segment_count: number;
          };
        };
      };
    };
    assert.equal(report.windows_acceptance.app_runtime_smoke.auth_mode, "reviewed");
    assert.equal(report.windows_acceptance.app_runtime_smoke.local_trusted, false);
    assert.equal(report.windows_acceptance.app_runtime_smoke.auth_source, "credentials");
    assert.equal(report.windows_acceptance.app_runtime_smoke.checks.some((check) => check.id === "auth_login"), true);
    assert.equal(
      report.windows_acceptance.app_runtime_smoke.checks.find((check) => check.id === "auth_login")?.body,
      undefined
    );
    assert.equal(report.windows_acceptance.real_data_smoke.selected_detail.transcript_segment_count, 1);
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("runner supports real cut smoke with a generated cut job", async () => {
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
      body: JSON.stringify({ suite: "real_cut_smoke", options: { query: "第一场", max_duration_ms: 1500 } })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      real_cut_smoke: {
        selected_source_video_id: string;
        clip_list_id: string;
        cut_job_id: string;
        run_next_status: string;
        export_clip_id: string;
        output_file: string;
        phase_timings: Array<{ phase_id: string; duration_ms: number }>;
      };
    };
    assert.equal(report.real_cut_smoke.selected_source_video_id, "C0001");
    assert.equal(report.real_cut_smoke.clip_list_id, "CLSMOKE");
    assert.equal(report.real_cut_smoke.cut_job_id, "CJSMOKE");
    assert.equal(report.real_cut_smoke.run_next_status, "done");
    assert.equal(report.real_cut_smoke.export_clip_id, "ESMOKE");
    assert.equal(report.real_cut_smoke.output_file, "projects/Windows验收剪切/001-smoke.mp4");
    assert.deepEqual(
      report.real_cut_smoke.phase_timings.map((phase) => phase.phase_id),
      ["resolve_source", "cut_media"]
    );
  } finally {
    await close(api);
    if (runner) {
      await close(runner.server);
    }
    await rmRoot(root);
  }
});

test("runner supports desktop UI screenshot smoke in mock mode", async () => {
  const root = await tempRoot();
  let runnerBaseUrl = "";
  let runner: ReturnType<typeof createWindowsTestRunnerServer> | undefined;
  try {
    runner = createWindowsTestRunnerServer(runnerConfig({
      reportsRoot: path.join(root, "reports"),
      cutterApiBaseUrl: "http://127.0.0.1:9"
    }));
    runnerBaseUrl = await listen(runner.server);

    const createResponse = await fetch(`${runnerBaseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        suite: "desktop_ui_screenshot_smoke",
        options: {
          mock_screenshots: true
        }
      })
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json() as { run: RunSummary };
    const finished = await waitForRun(runnerBaseUrl, created.run.run_id);
    assert.equal(finished.status, "passed");

    const report = await (await fetch(`${runnerBaseUrl}/runs/${created.run.run_id}/report`)).json() as {
      status: string;
      desktop_ui_screenshot_smoke: {
        captured_count: number;
        pages: Array<{ id: string; screenshot_path: string; ok: boolean }>;
      };
    };
    assert.equal(report.status, "passed");
    assert.equal(report.desktop_ui_screenshot_smoke.captured_count, 8);
    assert.deepEqual(
      report.desktop_ui_screenshot_smoke.pages.map((page) => page.id),
      [
        "project-home",
        "material-locator",
        "cut-tasks",
        "local-library",
        "public-library",
        "source-detail",
        "cache-management",
        "settings"
      ]
    );
    for (const page of report.desktop_ui_screenshot_smoke.pages) {
      assert.equal(page.ok, true);
      await stat(page.screenshot_path);
    }
  } finally {
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
      body: JSON.stringify({ suite: "not_a_real_suite" })
    });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: string };
    assert.match(body.error, /Supported suites/);
  } finally {
    await close(runner.server);
    await rmRoot(root);
  }
});
