import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

type BrowserViewportName = "desktop" | "mobile";

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

interface TimedApiResult {
  path: string;
  duration_ms: number;
  http_status: number;
  ok: boolean;
  data: unknown;
  response_bytes: number;
}

interface ProcessHistoryFilters {
  source_folder_name: string;
  preprocess_status: string;
  event_type: string;
}

interface ProcessHistoryFilterProof {
  selected_filters: ProcessHistoryFilters;
  api_path: string;
  history_available: boolean | null;
  actual_data_source: string;
  cache_status: string;
  scan_mode: string;
  returned_count: number | null;
  item_count: number;
  echoed_filters: ProcessHistoryFilters;
  rows_match_filters: boolean;
  row_match_failures: string[];
  filter_options_include_selected: boolean;
}

interface BrowserFilterInteraction {
  selected_filters: ProcessHistoryFilters;
  filter_controls_visible: Record<"source_folder" | "status" | "event", boolean>;
  filtered_request_observed: boolean;
  filtered_row_count: number;
  selected_values: ProcessHistoryFilters;
  error: string;
}

interface ViewportResult {
  name: BrowserViewportName;
  width: number;
  height: number;
  url: string;
  load_ms: number;
  screenshot_path: string;
  body_horizontal_overflow_px: number;
  process_history_row_count: number;
  process_history_panel_text: string;
  visible_checks: Record<string, boolean>;
  observed_process_history_requests: string[];
  filter_interaction: BrowserFilterInteraction;
  console_errors: string[];
  failed_api_requests: string[];
}

export interface BrowserQaGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AdminProcessHistoryLiveBrowserQaReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  web_url: string;
  api_base_url: string;
  expected_library_root: string;
  output_dir: string;
  environment: {
    library_root: string;
    current_index_version: string;
    video_count: number | null;
    ready_video_count: number | null;
  };
  process_history: {
    history_available: boolean | null;
    actual_data_source: string;
    cache_status: string;
    scan_mode: string;
    returned_count: number | null;
    item_count: number;
    readiness_ready: boolean | null;
    readiness_reason: string;
  };
  process_history_filter: ProcessHistoryFilterProof;
  api_requests: TimedApiResult[];
  viewports: ViewportResult[];
  gates: BrowserQaGate[];
  notes: string[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_WEB_URL = "http://127.0.0.1:5186/#/preprocess-jobs";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3892";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const PROCESS_HISTORY_PATH = "/api/admin/preprocess/process-history?limit=20&window_days=30";
const PROCESS_HISTORY_READINESS_PATH = "/api/admin/preprocess/process-history/readiness";
const LIBRARY_STATUS_PATH = "/api/admin/library/status";

const REQUIRED_PANEL_TEXT = [
  "处理历史",
  "读模型命中",
  "admin-read-model",
  "no-scan",
  "hit"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatCount(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function gate(name: string, passed: boolean, detail: string): BrowserQaGate {
  return { name, passed, detail };
}

function emptyFilters(): ProcessHistoryFilters {
  return {
    source_folder_name: "",
    preprocess_status: "",
    event_type: ""
  };
}

function selectProcessHistoryFilters(data: unknown): ProcessHistoryFilters {
  const history = asRecord(data);
  const items = asArray(history.items);
  const selected = items
    .map((item) => asRecord(item))
    .find((item) =>
      asString(item.source_folder_name) &&
      asString(item.preprocess_status) &&
      asString(item.last_event_type)
    );

  if (!selected) {
    return emptyFilters();
  }

  return {
    source_folder_name: asString(selected.source_folder_name),
    preprocess_status: asString(selected.preprocess_status),
    event_type: asString(selected.last_event_type)
  };
}

function processHistoryPathForFilters(filters: ProcessHistoryFilters): string {
  const params = new URLSearchParams({
    limit: "20",
    window_days: "30"
  });

  if (filters.source_folder_name) {
    params.set("source_folder_name", filters.source_folder_name);
  }
  if (filters.preprocess_status) {
    params.set("preprocess_status", filters.preprocess_status);
  }
  if (filters.event_type) {
    params.set("event_type", filters.event_type);
  }

  return `/api/admin/preprocess/process-history?${params.toString()}`;
}

function searchParamMatches(params: URLSearchParams, name: string, expected: string): boolean {
  return (params.get(name) ?? "") === expected;
}

function urlMatchesProcessHistoryFilters(url: string, filters: ProcessHistoryFilters): boolean {
  const parsed = new URL(url);
  if (parsed.pathname !== "/api/admin/preprocess/process-history") {
    return false;
  }

  return searchParamMatches(parsed.searchParams, "source_folder_name", filters.source_folder_name) &&
    searchParamMatches(parsed.searchParams, "preprocess_status", filters.preprocess_status) &&
    searchParamMatches(parsed.searchParams, "event_type", filters.event_type);
}

async function fetchApi(input: {
  api_base_url: string;
  path: string;
  session_token?: string;
}): Promise<TimedApiResult> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (input.session_token) {
    headers["X-MixLab-Admin-Session-Token"] = input.session_token;
  }

  const started = performance.now();
  const response = await fetch(`${input.api_base_url}${input.path}`, { headers });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const envelope = asRecord(parsed) as ApiEnvelope;
  const apiOk = typeof envelope.ok === "boolean" ? envelope.ok : null;

  return {
    path: input.path,
    duration_ms: roundMs(performance.now() - started),
    http_status: response.status,
    ok: response.ok && apiOk !== false,
    data: envelope.data,
    response_bytes: Buffer.byteLength(text, "utf8")
  };
}

function summarizeProcessHistory(data: unknown): AdminProcessHistoryLiveBrowserQaReport["process_history"] {
  const history = asRecord(data);
  const summary = asRecord(history.summary);
  const items = Array.isArray(history.items) ? history.items : [];
  return {
    history_available: asBoolean(history.history_available),
    actual_data_source: asString(history.actual_data_source),
    cache_status: asString(history.cache_status),
    scan_mode: asString(history.scan_mode),
    returned_count: asNumber(summary.returned_count),
    item_count: items.length,
    readiness_ready: null,
    readiness_reason: ""
  };
}

function summarizeFilteredProcessHistory(input: {
  data: unknown;
  selected_filters: ProcessHistoryFilters;
  api_path: string;
}): ProcessHistoryFilterProof {
  const history = asRecord(input.data);
  const summary = asRecord(history.summary);
  const filters = asRecord(history.filters);
  const filterOptions = asRecord(history.filter_options);
  const items = asArray(history.items).map((item) => asRecord(item));
  const rowMatchFailures = items.flatMap((item, index) => {
    const failures: string[] = [];
    if (asString(item.source_folder_name) !== input.selected_filters.source_folder_name) {
      failures.push(`row ${index} source_folder_name=${asString(item.source_folder_name) || "unknown"}`);
    }
    if (asString(item.preprocess_status) !== input.selected_filters.preprocess_status) {
      failures.push(`row ${index} preprocess_status=${asString(item.preprocess_status) || "unknown"}`);
    }
    if (asString(item.last_event_type) !== input.selected_filters.event_type) {
      failures.push(`row ${index} last_event_type=${asString(item.last_event_type) || "unknown"}`);
    }
    return failures;
  });

  const sourceFolderOptions = asArray(filterOptions.source_folder_names).map(asString);
  const statusOptions = asArray(filterOptions.preprocess_statuses).map(asString);
  const eventOptions = asArray(filterOptions.event_types).map(asString);

  return {
    selected_filters: input.selected_filters,
    api_path: input.api_path,
    history_available: asBoolean(history.history_available),
    actual_data_source: asString(history.actual_data_source),
    cache_status: asString(history.cache_status),
    scan_mode: asString(history.scan_mode),
    returned_count: asNumber(summary.returned_count),
    item_count: items.length,
    echoed_filters: {
      source_folder_name: asString(filters.source_folder_name),
      preprocess_status: asString(filters.preprocess_status),
      event_type: asString(filters.event_type)
    },
    rows_match_filters: rowMatchFailures.length === 0 && items.length > 0,
    row_match_failures: rowMatchFailures,
    filter_options_include_selected: sourceFolderOptions.includes(input.selected_filters.source_folder_name) &&
      statusOptions.includes(input.selected_filters.preprocess_status) &&
      eventOptions.includes(input.selected_filters.event_type)
  };
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

async function waitForVisibleText(page: Page, text: string): Promise<boolean> {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessHistoryControlsEnabled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".admin-process-history-panel select"))
      .every((select) => !(select as HTMLSelectElement).disabled),
  null, { timeout: 30_000 });
}

async function applyProcessHistoryFilters(input: {
  page: Page;
  filters: ProcessHistoryFilters;
}): Promise<BrowserFilterInteraction> {
  const selectedValues = emptyFilters();
  const filterControlsVisible = {
    source_folder: false,
    status: false,
    event: false
  };

  try {
    filterControlsVisible.source_folder = await input.page.getByLabel("素材来源筛选").isVisible();
    filterControlsVisible.status = await input.page.getByLabel("处理状态筛选").isVisible();
    filterControlsVisible.event = await input.page.getByLabel("最近事件筛选").isVisible();

    await waitForProcessHistoryControlsEnabled(input.page);

    const sourceWait = input.page.waitForResponse((response) =>
      urlMatchesProcessHistoryFilters(response.url(), {
        ...emptyFilters(),
        source_folder_name: input.filters.source_folder_name
      }),
    { timeout: 30_000 }).catch(() => null);
    await input.page.getByLabel("素材来源筛选").selectOption(input.filters.source_folder_name);
    selectedValues.source_folder_name = input.filters.source_folder_name;
    await sourceWait;
    await waitForProcessHistoryControlsEnabled(input.page);

    const statusWait = input.page.waitForResponse((response) =>
      urlMatchesProcessHistoryFilters(response.url(), {
        ...emptyFilters(),
        source_folder_name: input.filters.source_folder_name,
        preprocess_status: input.filters.preprocess_status
      }),
    { timeout: 30_000 }).catch(() => null);
    await input.page.getByLabel("处理状态筛选").selectOption(input.filters.preprocess_status);
    selectedValues.preprocess_status = input.filters.preprocess_status;
    await statusWait;
    await waitForProcessHistoryControlsEnabled(input.page);

    const eventWait = input.page.waitForResponse((response) =>
      urlMatchesProcessHistoryFilters(response.url(), input.filters),
    { timeout: 30_000 }).catch(() => null);
    await input.page.getByLabel("最近事件筛选").selectOption(input.filters.event_type);
    selectedValues.event_type = input.filters.event_type;
    const filteredResponse = await eventWait;
    await waitForProcessHistoryControlsEnabled(input.page);
    await input.page.waitForTimeout(250);

    const filteredRows = await input.page.locator(".admin-process-history-panel .ml-table tbody tr").count();
    const emptyRows = await input.page.locator(".admin-process-history-panel .ml-table-empty").count();

    return {
      selected_filters: input.filters,
      filter_controls_visible: filterControlsVisible,
      filtered_request_observed: Boolean(filteredResponse),
      filtered_row_count: emptyRows > 0 ? 0 : filteredRows,
      selected_values: selectedValues,
      error: ""
    };
  } catch (error) {
    return {
      selected_filters: input.filters,
      filter_controls_visible: filterControlsVisible,
      filtered_request_observed: false,
      filtered_row_count: 0,
      selected_values: selectedValues,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function captureViewport(input: {
  context: BrowserContext;
  web_url: string;
  output_dir: string;
  stamp: string;
  name: BrowserViewportName;
  width: number;
  height: number;
  filters: ProcessHistoryFilters;
}): Promise<ViewportResult> {
  const page = await input.context.newPage();
  const consoleErrors: string[] = [];
  const failedApiRequests: string[] = [];
  const observedProcessHistoryRequests: string[] = [];
  const screenshotPath = path.join(
    input.output_dir,
    `admin-process-history-live-browser-qa-${input.stamp}-${input.name}.png`
  );

  page.setDefaultTimeout(30_000);
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/admin/")) {
      failedApiRequests.push(`${request.method()} ${request.url()} failed: ${request.failure()?.errorText ?? "unknown"}`);
    }
  });
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().includes("/api/admin/preprocess/process-history?")) {
      observedProcessHistoryRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/admin/") && response.status() >= 400) {
      failedApiRequests.push(`GET ${response.url()} returned ${response.status()}`);
    }
  });

  await page.setViewportSize({ width: input.width, height: input.height });
  const started = performance.now();
  await page.goto(input.web_url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: 45_000 });
  await page.locator(".admin-process-history-panel").waitFor({ timeout: 45_000 });
  await page.locator(".admin-process-history-panel .ml-table tbody tr").first().waitFor({ timeout: 45_000 });
  const loadMs = roundMs(performance.now() - started);

  const visibleChecks: Record<string, boolean> = {};
  for (const text of REQUIRED_PANEL_TEXT) {
    visibleChecks[text] = await waitForVisibleText(page, text);
  }

  const filterInteraction = await applyProcessHistoryFilters({
    page,
    filters: input.filters
  });

  const panelText = (await page.locator(".admin-process-history-panel").innerText()).trim();
  const rowCount = await page.locator(".admin-process-history-panel .ml-table tbody tr").count();
  const emptyRowCount = await page.locator(".admin-process-history-panel .ml-table-empty").count();
  const horizontalOverflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );

  await page.locator(".admin-process-history-panel").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.close();

  return {
    name: input.name,
    width: input.width,
    height: input.height,
    url: input.web_url,
    load_ms: loadMs,
    screenshot_path: screenshotPath,
    body_horizontal_overflow_px: horizontalOverflow,
    process_history_row_count: emptyRowCount > 0 ? 0 : rowCount,
    process_history_panel_text: panelText,
    visible_checks: visibleChecks,
    observed_process_history_requests: observedProcessHistoryRequests,
    filter_interaction: filterInteraction,
    console_errors: consoleErrors,
    failed_api_requests: failedApiRequests
  };
}

export function buildGateChecks(report: Omit<AdminProcessHistoryLiveBrowserQaReport, "gates" | "result">): BrowserQaGate[] {
  const failedApiRequests = report.api_requests
    .filter((request) => !request.ok)
    .map((request) => `${request.path}:${request.http_status}`);
  const failedVisibleChecks = report.viewports.flatMap((viewport) =>
    Object.entries(viewport.visible_checks)
      .filter(([, passed]) => !passed)
      .map(([text]) => `${viewport.name}:${text}`)
  );
  const consoleErrors = report.viewports.flatMap((viewport) =>
    viewport.console_errors.map((message) => `${viewport.name}:${message}`)
  );
  const failedBrowserRequests = report.viewports.flatMap((viewport) =>
    viewport.failed_api_requests.map((message) => `${viewport.name}:${message}`)
  );
  const overflowViewports = report.viewports
    .filter((viewport) => viewport.body_horizontal_overflow_px > 0)
    .map((viewport) => `${viewport.name}:${viewport.body_horizontal_overflow_px}px`);
  const rowCounts = report.viewports.map((viewport) => `${viewport.name}:${viewport.process_history_row_count}`);
  const filter = report.process_history_filter;
  const selectedFiltersPresent = Boolean(
    filter.selected_filters.source_folder_name &&
    filter.selected_filters.preprocess_status &&
    filter.selected_filters.event_type
  );
  const echoedFiltersMatch =
    filter.echoed_filters.source_folder_name === filter.selected_filters.source_folder_name &&
    filter.echoed_filters.preprocess_status === filter.selected_filters.preprocess_status &&
    filter.echoed_filters.event_type === filter.selected_filters.event_type;
  const failedBrowserFilterInteractions = report.viewports
    .filter((viewport) =>
      !Object.values(viewport.filter_interaction.filter_controls_visible).every(Boolean) ||
      !viewport.filter_interaction.filtered_request_observed ||
      viewport.filter_interaction.filtered_row_count <= 0 ||
      viewport.filter_interaction.error
    )
    .map((viewport) => `${viewport.name}:${viewport.filter_interaction.error || `controls=${JSON.stringify(viewport.filter_interaction.filter_controls_visible)}, rows=${viewport.filter_interaction.filtered_row_count}, observed=${String(viewport.filter_interaction.filtered_request_observed)}`}`);
  const filterRequestViewports = report.viewports
    .filter((viewport) =>
      viewport.observed_process_history_requests.some((url) =>
        urlMatchesProcessHistoryFilters(url, filter.selected_filters)
      )
    )
    .map((viewport) => viewport.name);

  return [
    gate(
      "api-request-success",
      failedApiRequests.length === 0,
      failedApiRequests.length === 0 ? "all direct API probes passed" : failedApiRequests.join(", ")
    ),
    gate(
      "library-root",
      report.environment.library_root === report.expected_library_root,
      `actual=${report.environment.library_root || "unknown"}, expected=${report.expected_library_root}`
    ),
    gate(
      "process-history-api-hit",
      report.process_history.history_available === true &&
        report.process_history.actual_data_source === "admin-read-model" &&
        report.process_history.cache_status === "hit" &&
        report.process_history.scan_mode === "no-scan" &&
        report.process_history.item_count > 0,
      `available=${String(report.process_history.history_available)}, source=${report.process_history.actual_data_source || "unknown"}, cache=${report.process_history.cache_status || "unknown"}, scan=${report.process_history.scan_mode || "unknown"}, item_count=${report.process_history.item_count}`
    ),
    gate(
      "process-history-readiness-ready",
      report.process_history.readiness_ready === true && report.process_history.readiness_reason === "ready",
      `ready=${String(report.process_history.readiness_ready)}, reason=${report.process_history.readiness_reason || "unknown"}`
    ),
    gate(
      "process-history-filter-selected",
      selectedFiltersPresent,
      `source=${filter.selected_filters.source_folder_name || "missing"}, status=${filter.selected_filters.preprocess_status || "missing"}, event=${filter.selected_filters.event_type || "missing"}`
    ),
    gate(
      "process-history-filtered-api-hit",
      filter.history_available === true &&
        filter.actual_data_source === "admin-read-model" &&
        filter.cache_status === "hit" &&
        filter.scan_mode === "no-scan" &&
        filter.item_count > 0 &&
        filter.rows_match_filters &&
        echoedFiltersMatch &&
        filter.filter_options_include_selected,
      `available=${String(filter.history_available)}, source=${filter.actual_data_source || "unknown"}, cache=${filter.cache_status || "unknown"}, scan=${filter.scan_mode || "unknown"}, item_count=${filter.item_count}, echoed=${String(echoedFiltersMatch)}, rows_match=${String(filter.rows_match_filters)}, options=${String(filter.filter_options_include_selected)}, failures=${filter.row_match_failures.slice(0, 3).join("; ") || "none"}`
    ),
    gate(
      "browser-visible-read-model-hit",
      failedVisibleChecks.length === 0,
      failedVisibleChecks.length === 0 ? "all required process-history labels visible" : failedVisibleChecks.join(", ")
    ),
    gate(
      "browser-renders-history-rows",
      report.viewports.every((viewport) => viewport.process_history_row_count > 0),
      `rows=${rowCounts.join(", ")}`
    ),
    gate(
      "browser-filter-interaction",
      failedBrowserFilterInteractions.length === 0,
      failedBrowserFilterInteractions.length === 0 ? "all viewports applied filters and rendered filtered rows" : failedBrowserFilterInteractions.join(" | ")
    ),
    gate(
      "browser-observed-filtered-request",
      filterRequestViewports.length === report.viewports.length,
      `observed=${filterRequestViewports.join(", ") || "none"}`
    ),
    gate(
      "browser-no-console-errors",
      consoleErrors.length === 0,
      consoleErrors.length === 0 ? "no browser console errors" : consoleErrors.slice(0, 5).join(" | ")
    ),
    gate(
      "browser-no-failed-api-requests",
      failedBrowserRequests.length === 0,
      failedBrowserRequests.length === 0 ? "no failed Admin API requests observed by browser" : failedBrowserRequests.slice(0, 5).join(" | ")
    ),
    gate(
      "browser-no-mobile-horizontal-overflow",
      overflowViewports.length === 0,
      overflowViewports.length === 0 ? "desktop and mobile document widths fit viewport" : overflowViewports.join(", ")
    )
  ];
}

export function renderMarkdown(report: AdminProcessHistoryLiveBrowserQaReport): string {
  const failedGates = report.gates.filter((item) => !item.passed);

  return `# Admin Process History Live Browser QA ${report.generated_at}

## Scope

This R.106 report validates the live NAS-backed Admin Web \`#/preprocess-jobs\` page against the corrected process-history read-model hit state and the R.105 filter controls. It is browser QA plus GET-only API probes; it does not run reconcile, scan, apply, publish, Docker upload, or Cutter protocol work.

## Environment

- Web URL: \`${report.web_url}\`
- API base URL: \`${report.api_base_url}\`
- Expected library root: \`${report.expected_library_root}\`
- Actual library root: \`${report.environment.library_root || "unknown"}\`
- Current index: \`${report.environment.current_index_version || "unknown"}\`
- Counts: total \`${formatCount(report.environment.video_count)}\`, ready \`${formatCount(report.environment.ready_video_count)}\`

## Process History

- Available: \`${String(report.process_history.history_available)}\`
- Actual data source: \`${report.process_history.actual_data_source || "unknown"}\`
- Cache status: \`${report.process_history.cache_status || "unknown"}\`
- Scan mode: \`${report.process_history.scan_mode || "unknown"}\`
- Returned count: \`${formatCount(report.process_history.returned_count)}\`
- Item count: \`${report.process_history.item_count}\`
- Readiness: \`${String(report.process_history.readiness_ready)}\`
- Readiness reason: \`${report.process_history.readiness_reason || "unknown"}\`

## Filtered Process History

- API path: \`${report.process_history_filter.api_path}\`
- Selected source folder: \`${report.process_history_filter.selected_filters.source_folder_name || "unknown"}\`
- Selected status: \`${report.process_history_filter.selected_filters.preprocess_status || "unknown"}\`
- Selected event: \`${report.process_history_filter.selected_filters.event_type || "unknown"}\`
- Available: \`${String(report.process_history_filter.history_available)}\`
- Actual data source: \`${report.process_history_filter.actual_data_source || "unknown"}\`
- Cache status: \`${report.process_history_filter.cache_status || "unknown"}\`
- Scan mode: \`${report.process_history_filter.scan_mode || "unknown"}\`
- Returned count: \`${formatCount(report.process_history_filter.returned_count)}\`
- Item count: \`${report.process_history_filter.item_count}\`
- Echoed filters: \`${JSON.stringify(report.process_history_filter.echoed_filters)}\`
- Rows match filters: \`${String(report.process_history_filter.rows_match_filters)}\`
- Filter options include selected values: \`${String(report.process_history_filter.filter_options_include_selected)}\`
- Row match failures: ${report.process_history_filter.row_match_failures.length > 0 ? report.process_history_filter.row_match_failures.map((item) => `\`${item}\``).join(", ") : "none"}

## Browser Evidence

| viewport | size | load | rows | filtered rows | controls | filtered request | overflow | screenshot |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
${report.viewports.map((viewport) => `| ${viewport.name} | ${viewport.width}x${viewport.height} | ${viewport.load_ms.toFixed(1)}ms | ${viewport.process_history_row_count} | ${viewport.filter_interaction.filtered_row_count} | ${Object.values(viewport.filter_interaction.filter_controls_visible).every(Boolean) ? "visible" : "missing"} | ${viewport.filter_interaction.filtered_request_observed ? "yes" : "no"} | ${viewport.body_horizontal_overflow_px}px | \`${viewport.screenshot_path}\` |`).join("\n")}

## Direct API Probes

| path | status | result | duration | bytes |
| --- | ---: | --- | ---: | ---: |
${report.api_requests.map((request) => `| \`${request.path}\` | ${request.http_status} | ${request.ok ? "ok" : "failed"} | ${request.duration_ms.toFixed(1)}ms | ${request.response_bytes} |`).join("\n")}

## Gates

| gate | result | detail |
| --- | --- | --- |
${report.gates.map((item) => `| ${item.name} | ${item.passed ? "pass" : "fail"} | ${item.detail.replaceAll("|", "\\|")} |`).join("\n")}

## Result

- Status: \`${report.result.status}\`
- Summary: ${report.result.summary}
- Failed gates: ${failedGates.length > 0 ? failedGates.map((item) => `\`${item.name}\``).join(", ") : "none"}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const outputDir = process.env.MIXLAB_ADMIN_PROCESS_HISTORY_BROWSER_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const webUrl = process.env.MIXLAB_ADMIN_WEB_URL?.trim() || DEFAULT_WEB_URL;
  const apiBaseUrl = trimTrailingSlash(process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  const expectedLibraryRoot = process.env.MIXLAB_ADMIN_EXPECTED_LIBRARY_ROOT ?? DEFAULT_EXPECTED_LIBRARY_ROOT;
  const sessionToken = process.env.MIXLAB_ADMIN_SESSION_TOKEN?.trim() || undefined;

  await mkdir(outputDir, { recursive: true });

  const libraryStatusRequest = await fetchApi({ api_base_url: apiBaseUrl, path: LIBRARY_STATUS_PATH, session_token: sessionToken });
  const readinessRequest = await fetchApi({ api_base_url: apiBaseUrl, path: PROCESS_HISTORY_READINESS_PATH, session_token: sessionToken });
  const processHistoryRequest = await fetchApi({ api_base_url: apiBaseUrl, path: PROCESS_HISTORY_PATH, session_token: sessionToken });
  const selectedFilters = selectProcessHistoryFilters(processHistoryRequest.data);
  const filteredProcessHistoryPath = processHistoryPathForFilters(selectedFilters);
  const filteredProcessHistoryRequest = await fetchApi({
    api_base_url: apiBaseUrl,
    path: filteredProcessHistoryPath,
    session_token: sessionToken
  });
  const apiRequests = [
    libraryStatusRequest,
    readinessRequest,
    processHistoryRequest,
    filteredProcessHistoryRequest
  ];
  const libraryStatus = asRecord(apiRequests[0]?.data);
  const readiness = asRecord(apiRequests[1]?.data);
  const processHistory = summarizeProcessHistory(apiRequests[2]?.data);
  const processHistoryFilter = summarizeFilteredProcessHistory({
    data: filteredProcessHistoryRequest.data,
    selected_filters: selectedFilters,
    api_path: filteredProcessHistoryPath
  });
  processHistory.readiness_ready = asBoolean(readiness.ready_for_process_history);
  processHistory.readiness_reason = asString(readiness.reason);

  const browser = await launchBrowser();
  const context = await browser.newContext();
  let viewports: ViewportResult[] = [];

  try {
    viewports = [
      await captureViewport({
        context,
        web_url: webUrl,
        output_dir: outputDir,
        stamp,
        name: "desktop",
        width: 1440,
        height: 960,
        filters: selectedFilters
      }),
      await captureViewport({
        context,
        web_url: webUrl,
        output_dir: outputDir,
        stamp,
        name: "mobile",
        width: 390,
        height: 844,
        filters: selectedFilters
      })
    ];
  } finally {
    await context.close();
    await browser.close();
  }

  const reportWithoutGates = {
    schema_version: "1.0" as const,
    generated_at: generatedAt,
    command: "tsx scripts/acceptance/admin-process-history-live-browser-qa.ts",
    web_url: webUrl,
    api_base_url: apiBaseUrl,
    expected_library_root: expectedLibraryRoot,
    output_dir: outputDir,
    environment: {
      library_root: asString(libraryStatus.root_path),
      current_index_version: asString(libraryStatus.current_index_version),
      video_count: asNumber(libraryStatus.video_count),
      ready_video_count: asNumber(libraryStatus.ready_video_count)
    },
    process_history: processHistory,
    process_history_filter: processHistoryFilter,
    api_requests: apiRequests,
    viewports,
    notes: [
      "R.106 extends the R.84 Admin Web route QA with live R.105 process-history filter proof.",
      "The process-history panel must render read-model hit evidence and the selected source/status/event filters must stay admin-read-model/no-scan/hit.",
      "This script performs direct API GET probes and browser rendering checks only. It does not run reconcile, scan, apply, publish, Docker, or Cutter commands.",
      "The admin.sqlite read model is a rebuildable query projection; source-video manifests, preprocess-job files and release/index outputs remain the durable facts."
    ]
  };
  const gates = buildGateChecks(reportWithoutGates);
  const passed = gates.every((item) => item.passed);
  const report: AdminProcessHistoryLiveBrowserQaReport = {
    ...reportWithoutGates,
    gates,
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed
        ? `browser QA passed with ${processHistory.actual_data_source}/${processHistory.scan_mode}/${processHistory.cache_status}, ${processHistory.item_count} baseline rows, and ${processHistoryFilter.item_count} filtered rows`
        : `failed gates: ${gates.filter((item) => !item.passed).map((item) => item.name).join(", ")}`
    }
  };

  const jsonPath = path.join(outputDir, `admin-process-history-live-browser-qa-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-process-history-live-browser-qa-${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(JSON.stringify({
    ok: report.result.passed,
    status: report.result.status,
    summary: report.result.summary,
    json_path: jsonPath,
    markdown_path: markdownPath,
    screenshots: report.viewports.map((viewport) => viewport.screenshot_path),
    failed_gates: report.gates.filter((item) => !item.passed).map((item) => item.name)
  }, null, 2));

  if (!report.result.passed) {
    process.exitCode = 1;
  }
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
