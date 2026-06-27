import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import type {
  AdminDataLoadingPlan,
  AdminDashboardMetrics,
  AdminLibraryStatus,
  AdminPreprocessJobsResponse,
  AdminPreprocessSupervisorStatus,
  AdminSettingsConfig,
  AdminSourceVideo
} from "../../apps/admin-web/src/api.ts";

interface MockApiRequestRecord {
  id: number;
  method: string;
  path: string;
  search: string;
  started_at: string;
  closed_at: string;
  response_sent_at: string;
  status_code: number | null;
  duration_ms: number | null;
  aborted_before_response: boolean;
}

export interface BrowserQaGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AdminRequestCancellationBrowserQaReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  api_base_url: string;
  web_base_url: string;
  output_dir: string;
  scenario: {
    route_under_test: "source-videos";
    delayed_endpoint: "/api/admin/source-videos";
    delayed_response_ms: number;
    navigate_away_route: "dashboard";
  };
  browser: {
    final_hash: string;
    body_text_excerpt: string;
    console_errors: string[];
    unexpected_request_failures: string[];
  };
  mock_api: {
    request_count: number;
    records: MockApiRequestRecord[];
    delayed_request: MockApiRequestRecord | null;
  };
  timings: {
    source_route_request_start_wait_ms: number;
    cancellation_observed_wait_ms: number;
    total_ms: number;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  };
  gates: BrowserQaGate[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_DELAYED_RESPONSE_MS = 5_000;
const SERVER_START_TIMEOUT_MS = 30_000;
const CANCELLATION_TIMEOUT_MS = 4_000;
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const COMMAND = "tsx scripts/acceptance/admin-request-cancellation-browser-qa.ts";

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

function envelope(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

function notFound(pathname: string): string {
  return JSON.stringify({
    ok: false,
    error_code: "not_found",
    message: `Mock route not found: ${pathname}`
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

const generatedAt = "2026-06-26T00:00:00.000Z";

const libraryStatus: AdminLibraryStatus = {
  library_id: "mock-public-library",
  name: "Mock Public Library",
  root_path: "/mock/PublicLibrary",
  source_videos_path: "/mock/PublicLibrary/source-videos",
  mixlab_library_path: "/mock/PublicLibrary/.mixlab-library",
  protocol_version: "1.0",
  video_count: 1,
  ready_video_count: 1,
  processing_video_count: 0,
  queued_video_count: 0,
  unprocessed_video_count: 0,
  failed_video_count: 0,
  index_required_video_count: 0,
  disk_total_bytes: 1_000_000_000,
  disk_available_bytes: 800_000_000,
  index_status: "ready",
  current_index_version: "v000001",
  active_task_label: "idle",
  updated_at: generatedAt
};

const settingsConfig: AdminSettingsConfig = {
  schema_version: "1.0",
  library_name: "Mock Public Library",
  source_folders: [
    {
      id: "src_001",
      name: "Mock Source Folder",
      path: "/mock/PublicLibrary/source-videos",
      enabled: true,
      last_scanned_at: generatedAt,
      discovered_video_count: 1,
      new_unprocessed_count: 0
    }
  ],
  artifact_library: {
    mode: "default",
    path: "/mock/PublicLibrary/.mixlab-library",
    migration_required: false
  },
  runtime_policy: {
    audio_mode: "mp3_16k_mono_64k",
    concurrent_jobs: 1,
    auto_scan_enabled: false,
    auto_queue_enabled: false,
    auto_publish_index_enabled: false
  },
  updated_at: generatedAt
};

const supervisorStatus: AdminPreprocessSupervisorStatus = {
  state: "idle",
  state_label: "Idle",
  worker_id: "",
  started_at: "",
  stopped_at: "",
  last_error: "",
  stop_requested: false,
  last_result: null
};

const sourceVideos: AdminSourceVideo[] = [
  {
    source_video_id: "VQA001",
    title: "Mock ready source",
    file_name: "mock-ready-source.mp4",
    relative_path: "source-videos/mock-ready-source.mp4",
    cover_url: "",
    duration_ms: 60_000,
    file_size: 10_000_000,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: ["qa"],
    description: "A mock source video used only for request cancellation QA.",
    lecturer: "QA",
    course: "Admin Architecture v1",
    category: "acceptance",
    updated_at: generatedAt
  }
];

const preprocessJobs: AdminPreprocessJobsResponse = {
  active_count: 0,
  queued_count: 0,
  completed_count: 1,
  failed_count: 0,
  supervisor: supervisorStatus,
  observability: {
    running_job_id: "",
    running_source_video_id: "",
    pipeline_progress_percent: 0,
    estimated_all_done_at: "",
    estimated_queue_duration_ms: 0,
    throughput_label: "Idle",
    load_advice: "No queued jobs in mock QA"
  },
  jobs: []
};

const dataLoadingPlan: AdminDataLoadingPlan = {
  schema_version: "1.0",
  generated_at: generatedAt,
  strategy: "shell-first-route-owned-v1",
  shell_interactive_target_ms: 1_000,
  route_timeout_ms: 8_000,
  background_prefetch_default: false,
  hidden_full_scan_allowed: false,
  endpoints: [
    {
      endpoint: "/api/admin/library/status",
      method: "GET",
      phase: "shell",
      cost: "cheap",
      scan_mode: "no-scan",
      data_source: "library-manifest",
      scan_reason: "shell-summary",
      critical: true,
      timeout_ms: 1_000,
      refresh: "manual",
      notes: "Mock shell status"
    },
    {
      endpoint: "/api/admin/source-videos",
      method: "GET",
      phase: "route",
      cost: "bounded",
      scan_mode: "paged-list",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      critical: false,
      default_limit: 20,
      read_model: "admin-read-model-v1",
      timeout_ms: 8_000,
      refresh: "route-entry",
      notes: "Delayed mock route endpoint for request cancellation QA"
    }
  ],
  routes: [
    {
      route: "dashboard",
      load_phase: "shell",
      prefetch: false,
      endpoints: [
        "/api/admin/library/status",
        "/api/admin/settings/config",
        "/api/admin/preprocess/supervisor/status",
        "/api/admin/data-loading/plan"
      ],
      fallback: "Mock shell loading only"
    },
    {
      route: "source-videos",
      load_phase: "route-entry",
      prefetch: false,
      endpoints: ["/api/admin/source-videos"],
      fallback: "Mock route-local loading"
    }
  ]
};

const dashboardMetrics: AdminDashboardMetrics = {
  material: {
    video_count: 1,
    ready_video_count: 1,
    total_duration_ms: 60_000,
    ready_duration_ms: 60_000,
    unprocessed_duration_ms: 0,
    total_size_bytes: 10_000_000
  },
  transcript: {
    transcript_video_count: 1,
    character_count: 100,
    segment_count: 3,
    current_index_version: libraryStatus.current_index_version
  },
  production: {
    completed_today_count: 0,
    failed_today_count: 0,
    average_video_process_ms: 0,
    estimated_queue_done_at: ""
  },
  usage: {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
    search_failure_count: 0,
    search_latency_p50_ms: 0,
    search_latency_p95_ms: 0,
    search_latency_max_ms: 0,
    searchd_search_count: 0,
    sqlite_index_search_count: 0,
    fallback_search_count: 0,
    search_backend_unknown_count: 0,
    core_search_request_count: 0,
    core_search_failure_count: 0,
    core_search_latency_p50_ms: 0,
    core_search_latency_p95_ms: 0,
    core_search_latency_max_ms: 0,
    core_searchd_search_count: 0,
    core_sqlite_index_search_count: 0,
    core_fallback_search_count: 0,
    core_search_backend_unknown_count: 0,
    source_detail_view_count: 0,
    transcript_selection_count: 0,
    add_to_cut_list_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    cut_failure_count: 0,
    local_clip_count: 0,
    reuse_local_clip_count: 0,
    active_user_count: 0,
    recent_keywords: [],
    most_used_source_video_ids: [],
    users: [],
    event_store: {
      line_count: 0,
      valid_line_count: 0,
      malformed_line_count: 0,
      malformed_lines: [],
      warning: ""
    }
  },
  risk: {
    failed_video_count: 0,
    index_required_video_count: 0
  },
  runtime_load: {
    overall_status: "healthy",
    cpu: { usage_percent: 0, load_average_1m: 0, status: "healthy", label: "Mock CPU" },
    memory: {
      total_bytes: 1_000_000_000,
      used_bytes: 200_000_000,
      available_bytes: 800_000_000,
      usage_percent: 20,
      status: "healthy",
      label: "Mock memory"
    },
    disk: {
      total_bytes: libraryStatus.disk_total_bytes,
      available_bytes: libraryStatus.disk_available_bytes,
      usage_percent: 20,
      status: "healthy",
      label: "Mock disk"
    },
    network: {
      active_interface_count: 1,
      status: "healthy",
      label: "Mock network"
    },
    service: {
      uptime_seconds: 1,
      heartbeat_at: generatedAt,
      status: "healthy",
      label: "Mock service"
    }
  },
  sources: {
    material: { data_source: "admin-read-model", scan_mode: "no-scan", scan_reason: "background-metrics" },
    transcript: { data_source: "current-index", scan_mode: "no-scan", scan_reason: "background-metrics" },
    production: { data_source: "admin-read-model", scan_mode: "no-scan", scan_reason: "background-metrics" },
    usage: { data_source: "admin-read-model", scan_mode: "no-scan", scan_reason: "background-metrics" },
    risk: { data_source: "admin-read-model", scan_mode: "no-scan", scan_reason: "background-metrics" },
    runtime_load: { data_source: "runtime-telemetry", scan_mode: "no-scan", scan_reason: "background-metrics" }
  }
};

function responseData(pathname: string): unknown {
  switch (pathname) {
    case "/health":
      return { ok: true, service: "mock-admin-api" };
    case "/api/admin/auth/status":
      return {
        authenticated: true,
        auth_mode: "disabled",
        user: null,
        bootstrap: { has_admin: true, registration_open: false }
      };
    case "/api/admin/library/status":
      return libraryStatus;
    case "/api/admin/settings/config":
      return settingsConfig;
    case "/api/admin/preprocess/supervisor/status":
      return supervisorStatus;
    case "/api/admin/data-loading/plan":
      return dataLoadingPlan;
    case "/api/admin/dashboard/metrics":
      return dashboardMetrics;
    case "/api/admin/preprocess/jobs":
      return preprocessJobs;
    case "/api/admin/source-videos":
      return sourceVideos;
    default:
      return null;
  }
}

function createMockAdminApiServer(input: {
  delayedResponseMs: number;
}): Promise<{
  server: http.Server;
  baseUrl: string;
  records: MockApiRequestRecord[];
}> {
  const records: MockApiRequestRecord[] = [];
  let nextId = 1;

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
      closed_at: "",
      response_sent_at: "",
      status_code: null,
      duration_ms: null,
      aborted_before_response: false
    };
    nextId += 1;
    records.push(record);

    let timer: NodeJS.Timeout | null = null;
    response.on("close", () => {
      record.closed_at = new Date().toISOString();
      record.duration_ms = roundMs(performance.now() - startedAtMs);
      if (!record.response_sent_at) {
        record.aborted_before_response = true;
        if (timer) {
          clearTimeout(timer);
        }
      }
    });

    const data = responseData(requestUrl.pathname);
    if (data === null) {
      writeJson(response, 404, notFound(requestUrl.pathname), record);
      return;
    }

    if (requestUrl.pathname === "/api/admin/source-videos") {
      timer = setTimeout(() => {
        writeJson(response, 200, envelope(data), record);
      }, input.delayedResponseMs);
      return;
    }

    writeJson(response, 200, envelope(data), record);
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

function startAdminWeb(input: {
  webPort: number;
  apiBaseUrl: string;
}): ChildProcess {
  const child = spawn(
    "npm",
    ["run", "dev", "-w", "@mixlab/admin-web", "--", "--port", String(input.webPort), "--strictPort"],
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

function findDelayedRequest(records: readonly MockApiRequestRecord[]): MockApiRequestRecord | null {
  return records.find((record) => record.method === "GET" && record.path === "/api/admin/source-videos") ?? null;
}

export function buildGateChecks(
  report: Omit<AdminRequestCancellationBrowserQaReport, "gates" | "result">
): BrowserQaGate[] {
  const delayedRequest = report.mock_api.delayed_request;
  const unexpectedFailures = report.browser.unexpected_request_failures;

  return [
    gate(
      "isolated-local-mock-api",
      report.api_base_url.startsWith("http://127.0.0.1:") &&
        report.web_base_url.startsWith("http://127.0.0.1:"),
      `api=${report.api_base_url}, web=${report.web_base_url}`
    ),
    gate(
      "delayed-source-videos-request-started",
      Boolean(delayedRequest),
      delayedRequest
        ? `${delayedRequest.method} ${delayedRequest.path}${delayedRequest.search}`
        : "missing delayed source-videos request"
    ),
    gate(
      "route-change-returned-to-dashboard",
      report.browser.final_hash === "#/dashboard" && report.browser.body_text_excerpt.includes("总览"),
      `final_hash=${report.browser.final_hash}, has_overview=${report.browser.body_text_excerpt.includes("总览")}`
    ),
    gate(
      "delayed-request-aborted-before-response",
      Boolean(delayedRequest?.aborted_before_response) && !delayedRequest?.response_sent_at,
      delayedRequest
        ? `aborted=${String(delayedRequest.aborted_before_response)}, response_sent_at=${delayedRequest.response_sent_at || "none"}, duration_ms=${String(delayedRequest.duration_ms)}`
        : "missing delayed request"
    ),
    gate(
      "no-console-errors",
      report.browser.console_errors.length === 0,
      `console_errors=${report.browser.console_errors.length}`
    ),
    gate(
      "no-unexpected-request-failures",
      unexpectedFailures.length === 0,
      unexpectedFailures.length === 0 ? "no unexpected browser request failures" : unexpectedFailures.join("; ")
    )
  ];
}

export function renderMarkdown(report: AdminRequestCancellationBrowserQaReport): string {
  return `# Admin Request Cancellation Browser QA

Generated: ${report.generated_at}
Result: ${report.result.status}
Summary: ${report.result.summary}

## Scope

This R.117 report starts an isolated mock Admin API and a temporary Admin Web dev server. It proves the real Admin Web route-owned \`GET ${report.scenario.delayed_endpoint}\` request is cancelled when the browser navigates away from \`#/${report.scenario.route_under_test}\`. It does not touch NAS data, Docker, Cutter protocols, scan, scan-apply, reconcile, restore, publish, settings save, or user mutations.

## Environment

- API base URL: \`${report.api_base_url}\`
- Web base URL: \`${report.web_base_url}\`
- Output dir: \`${report.output_dir}\`
- Delayed response: \`${report.scenario.delayed_response_ms}ms\`
- Final hash: \`${report.browser.final_hash}\`

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
${report.gates.map((item) => `| ${item.name} | ${item.passed ? "pass" : "fail"} | ${item.detail.replaceAll("|", "\\|")} |`).join("\n")}

## Delayed Request

| Field | Value |
| --- | --- |
| Started | \`${report.mock_api.delayed_request?.started_at ?? "missing"}\` |
| Closed | \`${report.mock_api.delayed_request?.closed_at ?? "missing"}\` |
| Response Sent | \`${report.mock_api.delayed_request?.response_sent_at || "none"}\` |
| Aborted Before Response | \`${String(report.mock_api.delayed_request?.aborted_before_response ?? false)}\` |
| Duration ms | \`${String(report.mock_api.delayed_request?.duration_ms ?? "missing")}\` |

## Mock API Requests

| # | Method | Path | Search | Aborted Before Response | Status | Duration |
| ---: | --- | --- | --- | --- | ---: | ---: |
${report.mock_api.records.map((record) => `| ${record.id} | ${record.method} | \`${record.path}\` | \`${record.search || ""}\` | ${record.aborted_before_response ? "yes" : "no"} | ${record.status_code ?? "n/a"} | ${record.duration_ms ?? "n/a"} |`).join("\n")}
`;
}

export async function runAdminRequestCancellationBrowserQa(input: {
  outputDir?: string;
  generatedAt?: Date;
  delayedResponseMs?: number;
} = {}): Promise<AdminRequestCancellationBrowserQaReport> {
  const startedAt = performance.now();
  const generatedDate = input.generatedAt ?? new Date();
  const stamp = timestampForFile(generatedDate);
  const outputDir = input.outputDir ?? process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const delayedResponseMs = input.delayedResponseMs ?? DEFAULT_DELAYED_RESPONSE_MS;
  const artifactPrefix = `admin-request-cancellation-browser-qa-${stamp}`;
  const jsonPath = path.join(outputDir, `${artifactPrefix}.json`);
  const markdownPath = path.join(outputDir, `${artifactPrefix}.md`);

  await mkdir(outputDir, { recursive: true });

  const mockApi = await createMockAdminApiServer({ delayedResponseMs });
  const webPort = await availablePort();
  const webBaseUrl = `http://127.0.0.1:${webPort}`;
  const webProcess = startAdminWeb({ webPort, apiBaseUrl: mockApi.baseUrl });
  const browser = await chromium.launch();

  let sourceRouteRequestStartWaitMs = 0;
  let cancellationObservedWaitMs = 0;

  try {
    await waitForHttpOk(webBaseUrl, SERVER_START_TIMEOUT_MS);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const consoleErrors: string[] = [];
    const unexpectedRequestFailures: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("requestfailed", (request) => {
      const url = request.url();
      const failureText = request.failure()?.errorText ?? "";
      const isExpectedAbort = url.includes("/api/admin/source-videos") &&
        /abort|cancel/i.test(failureText);
      if (url.includes("/api/admin") && !isExpectedAbort) {
        unexpectedRequestFailures.push(`${request.method()} ${url} ${failureText}`.trim());
      }
    });

    await page.goto(`${webBaseUrl}/#/dashboard`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForCondition(
      () => mockApi.records.some((record) => record.path === "/api/admin/data-loading/plan" && Boolean(record.response_sent_at)),
      10_000,
      "initial dashboard shell data"
    );

    const sourceRouteStartedAt = performance.now();
    await page.evaluate(() => {
      window.location.hash = "#/source-videos";
    });
    sourceRouteRequestStartWaitMs = await waitForCondition(
      () => Boolean(findDelayedRequest(mockApi.records)),
      10_000,
      "source-videos route request start"
    );

    await page.evaluate(() => {
      window.location.hash = "#/dashboard";
    });

    const delayedRequest = findDelayedRequest(mockApi.records);
    cancellationObservedWaitMs = await waitForCondition(
      () => Boolean(delayedRequest?.aborted_before_response),
      CANCELLATION_TIMEOUT_MS,
      "source-videos route request cancellation"
    );

    await page.waitForFunction(() => window.location.hash === "#/dashboard", null, { timeout: 5_000 });
    await page.waitForFunction(() => document.body.innerText.includes("总览"), null, { timeout: 10_000 });
    const finalHash = await page.evaluate(() => window.location.hash);
    const bodyText = await page.locator("body").innerText();
    await page.close();

    const reportBase = {
      schema_version: "1.0" as const,
      generated_at: generatedDate.toISOString(),
      command: COMMAND,
      api_base_url: mockApi.baseUrl,
      web_base_url: webBaseUrl,
      output_dir: outputDir,
      scenario: {
        route_under_test: "source-videos" as const,
        delayed_endpoint: "/api/admin/source-videos" as const,
        delayed_response_ms: delayedResponseMs,
        navigate_away_route: "dashboard" as const
      },
      browser: {
        final_hash: finalHash,
        body_text_excerpt: bodyText.slice(0, 1_000),
        console_errors: consoleErrors,
        unexpected_request_failures: unexpectedRequestFailures
      },
      mock_api: {
        request_count: mockApi.records.length,
        records: mockApi.records,
        delayed_request: delayedRequest ?? null
      },
      timings: {
        source_route_request_start_wait_ms: sourceRouteRequestStartWaitMs,
        cancellation_observed_wait_ms: cancellationObservedWaitMs,
        total_ms: roundMs(performance.now() - startedAt)
      },
      artifacts: {
        json_path: jsonPath,
        markdown_path: markdownPath
      }
    };
    const gates = buildGateChecks(reportBase);
    const passed = gates.every((item) => item.passed);
    const report: AdminRequestCancellationBrowserQaReport = {
      ...reportBase,
      gates,
      result: {
        passed,
        status: passed ? "passed" : "failed",
        summary: passed
          ? "Admin Web route-owned request cancellation was observed before the delayed mock API response"
          : "Admin Web route-owned request cancellation QA failed one or more gates"
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
  runAdminRequestCancellationBrowserQa()
    .then((report) => {
      console.log(report.result.summary);
      console.log(`json: ${report.artifacts.json_path}`);
      console.log(`markdown: ${report.artifacts.markdown_path}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
