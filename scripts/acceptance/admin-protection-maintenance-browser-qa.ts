import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
  createFixtureAdminApiClient,
  type AdminReadModelReconcilerCancelResult,
  type AdminReadModelReconcilerStartResult,
  type AdminReadModelReconcilerStatus
} from "../../apps/admin-web/src/api.ts";

const START_RECONCILE_ENDPOINT = "/api/admin/read-model/reconcile";
const CANCEL_RECONCILE_ENDPOINT = "/api/admin/read-model/reconcile/cancel";
const STATUS_RECONCILE_ENDPOINT = "/api/admin/read-model/reconcile/status";
const OPERATIONS_OVERVIEW_ENDPOINT = "/api/admin/operations/overview";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const SERVER_START_TIMEOUT_MS = 30_000;
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COMMAND = "tsx scripts/acceptance/admin-protection-maintenance-browser-qa.ts";
const ALLOWED_COMMAND_POST_ENDPOINTS = [
  START_RECONCILE_ENDPOINT,
  CANCEL_RECONCILE_ENDPOINT
] as const;

type CommandPostEndpoint = typeof ALLOWED_COMMAND_POST_ENDPOINTS[number];

interface MockApiRequestRecord {
  id: number;
  method: string;
  path: string;
  search: string;
  started_at: string;
  response_sent_at: string;
  status_code: number | null;
  duration_ms: number | null;
  request_body_excerpt: string;
}

export interface BrowserQaGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AdminProtectionMaintenanceBrowserQaReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  api_base_url: string;
  web_base_url: string;
  output_dir: string;
  scenario: {
    route_under_test: "protection";
    expected_command_posts: readonly CommandPostEndpoint[];
    isolated_from_real_admin_api: true;
    nas_mutation_allowed: false;
  };
  browser: {
    final_hash: string;
    body_text_excerpt: string;
    screenshot_path: string;
    initial_start_disabled: boolean;
    initial_cancel_disabled: boolean;
    cancel_enabled_after_start: boolean;
    cancel_disabled_after_cancel: boolean;
    body_contains_cancel_requested: boolean;
    console_errors: string[];
    failed_api_requests: string[];
  };
  mock_api: {
    request_count: number;
    records: MockApiRequestRecord[];
    command_post_count: number;
    start_post_count: number;
    cancel_post_count: number;
    status_get_count: number;
    operations_overview_get_count: number;
    forbidden_command_posts: MockApiRequestRecord[];
  };
  timings: {
    controls_visible_wait_ms: number;
    start_command_observed_wait_ms: number;
    cancel_command_observed_wait_ms: number;
    total_ms: number;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
    screenshot_path: string;
  };
  gates: BrowserQaGate[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function gate(name: string, passed: boolean, detail: string): BrowserQaGate {
  return { name, passed, detail };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  label: string
): Promise<number> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return roundMs(performance.now() - startedAt);
    }
    await wait(25);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a local port")));
        return;
      }

      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function envelope(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

function errorEnvelope(errorCode: string, message: string): string {
  return JSON.stringify({
    ok: false,
    error_code: errorCode,
    message
  });
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: string,
  record: MockApiRequestRecord
): void {
  if (response.destroyed || response.writableEnded) {
    return;
  }

  record.response_sent_at = new Date().toISOString();
  record.status_code = statusCode;
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-MixLab-Admin-Session-Token",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(body);
}

function corsOptions(response: ServerResponse): void {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-MixLab-Admin-Session-Token",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
  });
  response.end();
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function withReconcileState(
  status: AdminReadModelReconcilerStatus,
  patch: Partial<AdminReadModelReconcilerStatus> & {
    progress?: Partial<AdminReadModelReconcilerStatus["progress"]>;
  }
): AdminReadModelReconcilerStatus {
  return {
    ...status,
    ...patch,
    progress: {
      ...status.progress,
      ...(patch.progress ?? {})
    },
    events: patch.events ?? status.events
  };
}

function idleReconcileStatus(status: AdminReadModelReconcilerStatus): AdminReadModelReconcilerStatus {
  return withReconcileState(status, {
    status: "idle",
    phase: "idle",
    cancel_requested: false,
    started_at: "",
    finished_at: "",
    snapshot_video_count: 0,
    message: "Mock read-model reconcile is idle.",
    result: null,
    error_code: "",
    error_message: "",
    progress: {
      scanned_source_video_count: 0,
      preprocess_job_snapshot_count: 0,
      current_step: "idle",
      step_completed_count: 0,
      step_total_count: 0,
      step_percent: 0,
      percent: 0,
      message: "Idle."
    },
    events: []
  });
}

function runningReconcileStatus(status: AdminReadModelReconcilerStatus): AdminReadModelReconcilerStatus {
  const now = new Date().toISOString();

  return withReconcileState(status, {
    status: "running",
    phase: "scanning",
    scan_mode: "full-reconcile",
    cancel_requested: false,
    started_at: status.started_at || now,
    finished_at: "",
    message: "Mock read-model reconcile started.",
    result: null,
    error_code: "",
    error_message: "",
    progress: {
      scanned_source_video_count: 4,
      preprocess_job_snapshot_count: 2,
      current_step: "preprocess-job-snapshots",
      step_completed_count: 2,
      step_total_count: status.progress.total_preprocess_job_snapshot_count,
      step_percent: 20,
      percent: 30,
      message: "Mock reconcile is reading preprocess job snapshots."
    },
    events: [
      {
        at: now,
        event_type: "started",
        phase: "starting",
        message: "Mock read-model reconcile started.",
        scanned_source_video_count: 0,
        total_source_video_count: status.progress.total_source_video_count,
        preprocess_job_snapshot_count: 0,
        total_preprocess_job_snapshot_count: status.progress.total_preprocess_job_snapshot_count,
        current_step: "starting",
        step_completed_count: 0,
        step_total_count: status.progress.total_preprocess_job_snapshot_count,
        step_percent: 0
      }
    ]
  });
}

function cancelRequestedReconcileStatus(status: AdminReadModelReconcilerStatus): AdminReadModelReconcilerStatus {
  const now = new Date().toISOString();

  return withReconcileState(status, {
    status: "running",
    phase: "scanning",
    cancel_requested: true,
    message: "Mock read-model reconcile cancellation requested.",
    progress: {
      message: "Cancel requested; waiting for a safe checkpoint."
    },
    events: [
      {
        at: now,
        event_type: "cancel-requested",
        phase: "scanning",
        message: "Mock read-model reconcile cancellation requested.",
        scanned_source_video_count: status.progress.scanned_source_video_count,
        total_source_video_count: status.progress.total_source_video_count,
        preprocess_job_snapshot_count: status.progress.preprocess_job_snapshot_count,
        total_preprocess_job_snapshot_count: status.progress.total_preprocess_job_snapshot_count,
        current_step: status.progress.current_step,
        step_completed_count: status.progress.step_completed_count,
        step_total_count: status.progress.step_total_count,
        step_percent: status.progress.step_percent
      },
      ...status.events
    ]
  });
}

function isCommandMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function commandPostRecords(records: readonly MockApiRequestRecord[]): MockApiRequestRecord[] {
  return records.filter((record) => record.method === "POST");
}

function startPostRecords(records: readonly MockApiRequestRecord[]): MockApiRequestRecord[] {
  return records.filter((record) => record.method === "POST" && record.path === START_RECONCILE_ENDPOINT);
}

function cancelPostRecords(records: readonly MockApiRequestRecord[]): MockApiRequestRecord[] {
  return records.filter((record) => record.method === "POST" && record.path === CANCEL_RECONCILE_ENDPOINT);
}

function forbiddenCommandPostRecords(records: readonly MockApiRequestRecord[]): MockApiRequestRecord[] {
  return records.filter((record) => {
    if (!isCommandMethod(record.method)) {
      return false;
    }
    return record.method !== "POST" ||
      !ALLOWED_COMMAND_POST_ENDPOINTS.includes(record.path as CommandPostEndpoint);
  });
}

function createMockAdminApiServer(): Promise<{
  server: http.Server;
  baseUrl: string;
  records: MockApiRequestRecord[];
}> {
  const fixture = createFixtureAdminApiClient();
  const records: MockApiRequestRecord[] = [];
  let nextId = 1;
  let reconcileStatusPromise = fixture.getReadModelReconcileStatus().then(idleReconcileStatus);

  const server = http.createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "OPTIONS") {
      corsOptions(response);
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const startedAtMs = performance.now();
    const record: MockApiRequestRecord = {
      id: nextId,
      method: request.method ?? "GET",
      path: requestUrl.pathname,
      search: requestUrl.search,
      started_at: new Date().toISOString(),
      response_sent_at: "",
      status_code: null,
      duration_ms: null,
      request_body_excerpt: ""
    };
    nextId += 1;
    records.push(record);

    response.on("close", () => {
      record.duration_ms = roundMs(performance.now() - startedAtMs);
    });

    void (async () => {
      if (record.method !== "GET") {
        record.request_body_excerpt = (await readRequestBody(request)).slice(0, 500);
      }

      if (record.method === "POST" && record.path === START_RECONCILE_ENDPOINT) {
        const currentStatus = await reconcileStatusPromise;
        const nextStatus = runningReconcileStatus(currentStatus);
        reconcileStatusPromise = Promise.resolve(nextStatus);
        const result: AdminReadModelReconcilerStartResult = {
          accepted: true,
          status: cloneJson(nextStatus)
        };
        writeJson(response, 200, envelope(result), record);
        return;
      }

      if (record.method === "POST" && record.path === CANCEL_RECONCILE_ENDPOINT) {
        const currentStatus = await reconcileStatusPromise;
        const nextStatus = cancelRequestedReconcileStatus(currentStatus);
        reconcileStatusPromise = Promise.resolve(nextStatus);
        const result: AdminReadModelReconcilerCancelResult = {
          accepted: true,
          status: cloneJson(nextStatus)
        };
        writeJson(response, 200, envelope(result), record);
        return;
      }

      if (record.method !== "GET") {
        writeJson(
          response,
          405,
          errorEnvelope("method_not_allowed", `Mock command route not allowed: ${record.method} ${record.path}`),
          record
        );
        return;
      }

      const data = await responseData(fixture, () => reconcileStatusPromise, requestUrl.pathname);
      if (data === null) {
        writeJson(response, 404, errorEnvelope("not_found", `Mock route not found: ${requestUrl.pathname}`), record);
        return;
      }

      writeJson(response, 200, envelope(data), record);
    })().catch((error) => {
      writeJson(
        response,
        500,
        errorEnvelope("mock_api_error", error instanceof Error ? error.message : String(error)),
        record
      );
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock Admin API did not bind to a local TCP port"));
        return;
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        records
      });
    });
  });
}

async function responseData(
  fixture: ReturnType<typeof createFixtureAdminApiClient>,
  reconcileStatus: () => Promise<AdminReadModelReconcilerStatus>,
  pathname: string
): Promise<unknown | null> {
  switch (pathname) {
    case "/health":
      return { ok: true, service: "mock-admin-api" };
    case "/api/admin/auth/bootstrap":
      return fixture.getAuthBootstrap();
    case "/api/admin/auth/status":
      return fixture.getAuthStatus();
    case "/api/admin/library/status":
      return fixture.getLibraryStatus();
    case "/api/admin/settings/config":
      return fixture.getAdminSettings();
    case "/api/admin/preprocess/supervisor/status":
      return fixture.getPreprocessSupervisorStatus();
    case "/api/admin/data-loading/plan":
      return fixture.getDataLoadingPlan();
    case "/api/admin/dashboard/metrics":
      return fixture.getDashboardMetrics();
    case "/api/admin/preprocess/jobs":
      return fixture.listPreprocessJobs({ limit: 20 });
    case "/api/admin/index/versions":
      return fixture.listIndexVersions();
    case "/api/admin/doctor/report":
      return fixture.getDoctorReport();
    case "/api/admin/settings/runtime":
      return fixture.getRuntimeSettings();
    case "/api/admin/library/path-checks":
      return fixture.getPathChecks();
    case OPERATIONS_OVERVIEW_ENDPOINT:
      return fixture.getOperationsOverview();
    case STATUS_RECONCILE_ENDPOINT:
      return cloneJson(await reconcileStatus());
    default:
      return null;
  }
}

function startAdminWeb(input: {
  webPort: number;
  apiBaseUrl: string;
}): ChildProcess {
  const child = spawn(
    "npm",
    [
      "run",
      "dev",
      "-w",
      "@mixlab/admin-web",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(input.webPort),
      "--strictPort"
    ],
    {
      cwd: REPO_ROOT,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        VITE_MIXLAB_ADMIN_API_BASE_URL: input.apiBaseUrl,
        VITE_MIXLAB_USE_FIXTURE_DATA: "false"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout?.on("data", (chunk) => {
    if (process.env.MIXLAB_DEBUG_ACCEPTANCE === "1") {
      process.stdout.write(chunk);
    }
  });
  child.stderr?.on("data", (chunk) => {
    if (process.env.MIXLAB_DEBUG_ACCEPTANCE === "1") {
      process.stderr.write(chunk);
    }
  });

  return child;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    } else {
      child.kill("SIGTERM");
    }
    setTimeout(resolve, 2_000).unref();
  });
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
    } catch {
      // Keep polling until Vite is ready.
    }
    await wait(100);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export function buildGateChecks(
  report: Omit<AdminProtectionMaintenanceBrowserQaReport, "gates" | "result">
): BrowserQaGate[] {
  const forbiddenPosts = report.mock_api.forbidden_command_posts;

  return [
    gate(
      "isolated-local-mock-api",
      report.api_base_url.startsWith("http://127.0.0.1:") &&
        report.web_base_url.startsWith("http://127.0.0.1:") &&
        report.scenario.isolated_from_real_admin_api &&
        !report.scenario.nas_mutation_allowed,
      `api=${report.api_base_url}, web=${report.web_base_url}, nas_mutation_allowed=${String(report.scenario.nas_mutation_allowed)}`
    ),
    gate(
      "protection-controls-visible",
      report.browser.final_hash === "#/protection" &&
        report.browser.body_text_excerpt.includes("保护中心") &&
        report.browser.body_text_excerpt.includes("后台对账") &&
        report.browser.body_text_excerpt.includes("启动后台对账") &&
        report.browser.body_text_excerpt.includes("请求停止对账"),
      `final_hash=${report.browser.final_hash}`
    ),
    gate(
      "start-command-posted-once",
      report.mock_api.start_post_count === 1,
      `start_post_count=${report.mock_api.start_post_count}`
    ),
    gate(
      "cancel-command-posted-once",
      report.mock_api.cancel_post_count === 1,
      `cancel_post_count=${report.mock_api.cancel_post_count}`
    ),
    gate(
      "no-forbidden-command-posts",
      forbiddenPosts.length === 0,
      forbiddenPosts.length === 0
        ? "only read-model reconcile start/cancel command posts observed"
        : forbiddenPosts.map((record) => `${record.method} ${record.path}`).join("; ")
    ),
    gate(
      "status-and-overview-read-locally",
      report.mock_api.status_get_count >= 2 && report.mock_api.operations_overview_get_count >= 1,
      `status_get_count=${report.mock_api.status_get_count}, operations_overview_get_count=${report.mock_api.operations_overview_get_count}`
    ),
    gate(
      "button-state-contract",
      !report.browser.initial_start_disabled &&
        report.browser.initial_cancel_disabled &&
        report.browser.cancel_enabled_after_start &&
        report.browser.cancel_disabled_after_cancel &&
        report.browser.body_contains_cancel_requested,
      `initial_start_disabled=${String(report.browser.initial_start_disabled)}, initial_cancel_disabled=${String(report.browser.initial_cancel_disabled)}, cancel_enabled_after_start=${String(report.browser.cancel_enabled_after_start)}, cancel_disabled_after_cancel=${String(report.browser.cancel_disabled_after_cancel)}, cancel_requested=${String(report.browser.body_contains_cancel_requested)}`
    ),
    gate(
      "no-console-errors",
      report.browser.console_errors.length === 0,
      `console_errors=${report.browser.console_errors.length}`
    ),
    gate(
      "no-failed-admin-api-requests",
      report.browser.failed_api_requests.length === 0,
      report.browser.failed_api_requests.length === 0
        ? "no failed Admin API requests"
        : report.browser.failed_api_requests.join("; ")
    )
  ];
}

export function renderMarkdown(report: AdminProtectionMaintenanceBrowserQaReport): string {
  return `# Admin Protection Maintenance Browser QA

Generated: ${report.generated_at}
Result: ${report.result.status}
Summary: ${report.result.summary}

## Scope

This R.120 report starts an isolated mock Admin API and a temporary Admin Web dev server. It proves the real Protection Center controls send only \`POST ${START_RECONCILE_ENDPOINT}\` and \`POST ${CANCEL_RECONCILE_ENDPOINT}\` to the mock API. It does not touch NAS data, Docker, Cutter protocols, live reconcile, scan, restore, publish, settings save, or user mutations.

## Environment

- API base URL: \`${report.api_base_url}\`
- Web base URL: \`${report.web_base_url}\`
- Output dir: \`${report.output_dir}\`
- Final hash: \`${report.browser.final_hash}\`
- Screenshot: \`${report.artifacts.screenshot_path}\`

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
${report.gates.map((item) => `| ${item.name} | ${item.passed ? "pass" : "fail"} | ${item.detail.replaceAll("|", "\\|")} |`).join("\n")}

## Command Posts

| Endpoint | Count |
| --- | ---: |
| \`${START_RECONCILE_ENDPOINT}\` | ${report.mock_api.start_post_count} |
| \`${CANCEL_RECONCILE_ENDPOINT}\` | ${report.mock_api.cancel_post_count} |
| forbidden command posts | ${report.mock_api.forbidden_command_posts.length} |

## Browser State

| Field | Value |
| --- | --- |
| Initial start disabled | \`${String(report.browser.initial_start_disabled)}\` |
| Initial cancel disabled | \`${String(report.browser.initial_cancel_disabled)}\` |
| Cancel enabled after start | \`${String(report.browser.cancel_enabled_after_start)}\` |
| Cancel disabled after cancel | \`${String(report.browser.cancel_disabled_after_cancel)}\` |
| Body contains cancel requested | \`${String(report.browser.body_contains_cancel_requested)}\` |

## Mock API Requests

| # | Method | Path | Search | Status | Duration |
| ---: | --- | --- | --- | ---: | ---: |
${report.mock_api.records.map((record) => `| ${record.id} | ${record.method} | \`${record.path}\` | \`${record.search || ""}\` | ${record.status_code ?? "n/a"} | ${record.duration_ms ?? "n/a"} |`).join("\n")}
`;
}

export async function runAdminProtectionMaintenanceBrowserQa(input: {
  outputDir?: string;
  generatedAt?: Date;
} = {}): Promise<AdminProtectionMaintenanceBrowserQaReport> {
  const startedAt = performance.now();
  const generatedDate = input.generatedAt ?? new Date();
  const stamp = timestampForFile(generatedDate);
  const outputDir = input.outputDir ?? process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const artifactPrefix = `admin-protection-maintenance-browser-qa-${stamp}`;
  const jsonPath = path.join(outputDir, `${artifactPrefix}.json`);
  const markdownPath = path.join(outputDir, `${artifactPrefix}.md`);
  const screenshotPath = path.join(outputDir, `${artifactPrefix}-desktop.png`);

  await mkdir(outputDir, { recursive: true });

  const mockApi = await createMockAdminApiServer();
  const webPort = await availablePort();
  const webBaseUrl = `http://127.0.0.1:${webPort}`;
  const webProcess = startAdminWeb({ webPort, apiBaseUrl: mockApi.baseUrl });
  const browser = await chromium.launch();

  let controlsVisibleWaitMs = 0;
  let startCommandObservedWaitMs = 0;
  let cancelCommandObservedWaitMs = 0;

  try {
    await waitForHttpOk(webBaseUrl, SERVER_START_TIMEOUT_MS);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleErrors: string[] = [];
    const failedApiRequests: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      if (request.url().includes("/api/admin")) {
        failedApiRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
      }
    });
    page.on("response", (response) => {
      if (response.url().includes("/api/admin") && response.status() >= 400) {
        failedApiRequests.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`${webBaseUrl}/#/protection`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const controlsStartedAt = performance.now();
    await page.waitForFunction(
      () => document.body.innerText.includes("保护中心") &&
        document.body.innerText.includes("后台对账") &&
        document.body.innerText.includes("启动后台对账") &&
        document.body.innerText.includes("请求停止对账"),
      null,
      { timeout: 15_000 }
    );
    controlsVisibleWaitMs = roundMs(performance.now() - controlsStartedAt);

    const startButton = page.getByRole("button", { name: "启动后台对账" });
    const cancelButton = page.getByRole("button", { name: "请求停止对账" });
    const initialStartDisabled = await startButton.isDisabled();
    const initialCancelDisabled = await cancelButton.isDisabled();

    await startButton.click();
    startCommandObservedWaitMs = await waitForCondition(
      () => startPostRecords(mockApi.records).length === 1,
      10_000,
      "read-model reconcile start command POST"
    );
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("请求停止对账") && !button.hasAttribute("disabled")
      ),
      null,
      { timeout: 10_000 }
    );
    const cancelEnabledAfterStart = !(await cancelButton.isDisabled());

    await cancelButton.click();
    cancelCommandObservedWaitMs = await waitForCondition(
      () => cancelPostRecords(mockApi.records).length === 1,
      10_000,
      "read-model reconcile cancel command POST"
    );
    await page.waitForFunction(
      () => document.body.innerText.includes("已请求") &&
        Array.from(document.querySelectorAll("button")).some((button) =>
          button.textContent?.includes("请求停止对账") && button.hasAttribute("disabled")
        ),
      null,
      { timeout: 10_000 }
    );
    const cancelDisabledAfterCancel = await cancelButton.isDisabled();
    const bodyText = await page.locator("body").innerText();
    const finalHash = await page.evaluate(() => window.location.hash);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.close();

    const commandPosts = commandPostRecords(mockApi.records);
    const forbiddenPosts = forbiddenCommandPostRecords(mockApi.records);
    const reportBase = {
      schema_version: "1.0" as const,
      generated_at: generatedDate.toISOString(),
      command: COMMAND,
      api_base_url: mockApi.baseUrl,
      web_base_url: webBaseUrl,
      output_dir: outputDir,
      scenario: {
        route_under_test: "protection" as const,
        expected_command_posts: ALLOWED_COMMAND_POST_ENDPOINTS,
        isolated_from_real_admin_api: true as const,
        nas_mutation_allowed: false as const
      },
      browser: {
        final_hash: finalHash,
        body_text_excerpt: bodyText.slice(0, 1_200),
        screenshot_path: screenshotPath,
        initial_start_disabled: initialStartDisabled,
        initial_cancel_disabled: initialCancelDisabled,
        cancel_enabled_after_start: cancelEnabledAfterStart,
        cancel_disabled_after_cancel: cancelDisabledAfterCancel,
        body_contains_cancel_requested: bodyText.includes("已请求"),
        console_errors: consoleErrors,
        failed_api_requests: failedApiRequests
      },
      mock_api: {
        request_count: mockApi.records.length,
        records: mockApi.records,
        command_post_count: commandPosts.length,
        start_post_count: startPostRecords(mockApi.records).length,
        cancel_post_count: cancelPostRecords(mockApi.records).length,
        status_get_count: mockApi.records
          .filter((record) => record.method === "GET" && record.path === STATUS_RECONCILE_ENDPOINT)
          .length,
        operations_overview_get_count: mockApi.records
          .filter((record) => record.method === "GET" && record.path === OPERATIONS_OVERVIEW_ENDPOINT)
          .length,
        forbidden_command_posts: forbiddenPosts
      },
      timings: {
        controls_visible_wait_ms: controlsVisibleWaitMs,
        start_command_observed_wait_ms: startCommandObservedWaitMs,
        cancel_command_observed_wait_ms: cancelCommandObservedWaitMs,
        total_ms: roundMs(performance.now() - startedAt)
      },
      artifacts: {
        json_path: jsonPath,
        markdown_path: markdownPath,
        screenshot_path: screenshotPath
      }
    };
    const gates = buildGateChecks(reportBase);
    const passed = gates.every((item) => item.passed);
    const report: AdminProtectionMaintenanceBrowserQaReport = {
      ...reportBase,
      gates,
      result: {
        passed,
        status: passed ? "passed" : "failed",
        summary: passed
          ? "Protection Center maintenance controls posted only isolated read-model reconcile start/cancel commands"
          : "Protection Center maintenance browser QA failed one or more gates"
      }
    };

    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, renderMarkdown(report), "utf8");

    if (!passed) {
      process.exitCode = 1;
    }

    return report;
  } finally {
    await browser.close();
    await stopProcess(webProcess);
    await new Promise<void>((resolve) => mockApi.server.close(() => resolve()));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAdminProtectionMaintenanceBrowserQa()
    .then((report) => {
      console.log(report.result.summary);
      console.log(`json: ${report.artifacts.json_path}`);
      console.log(`markdown: ${report.artifacts.markdown_path}`);
      console.log(`screenshot: ${report.artifacts.screenshot_path}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
