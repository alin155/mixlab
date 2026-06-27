import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  runAdminCutterUsersBrowserQa,
  type AdminCutterUsersBrowserQaReport
} from "./admin-cutter-users-browser-qa.ts";
import {
  runAdminDoctorBrowserQa,
  type AdminDoctorBrowserQaReport
} from "./admin-doctor-browser-qa.ts";
import {
  runAdminIndexPublishBrowserQa,
  type AdminIndexPublishBrowserQaReport
} from "./admin-index-publish-browser-qa.ts";
import {
  runAdminSettingsBrowserQa,
  type AdminSettingsBrowserQaReport
} from "./admin-settings-browser-qa.ts";
import {
  runAdminSourceVideosBrowserQa,
  type AdminSourceVideosBrowserQaReport
} from "./admin-source-videos-browser-qa.ts";

type MigratedRoute = "index-publish" | "source-videos" | "cutter-users" | "doctor" | "settings";
type MigratedRouteBrowserReport =
  | AdminIndexPublishBrowserQaReport
  | AdminSourceVideosBrowserQaReport
  | AdminCutterUsersBrowserQaReport
  | AdminDoctorBrowserQaReport
  | AdminSettingsBrowserQaReport;

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  error_code?: unknown;
  message?: unknown;
}

interface ApiProbe {
  name: string;
  path: string;
  duration_ms: number;
  http_status: number | null;
  ok: boolean;
  api_ok: boolean | null;
  response_bytes: number;
  data: unknown;
  error_code?: string;
  message?: string;
}

interface MigratedRouteEvidence {
  route: MigratedRoute;
  label: string;
  web_url: string;
  expected_route_endpoints: string[];
  route_plan_found: boolean;
  route_plan_endpoints: string[];
  route_plan_load_phase: string;
  route_plan_prefetch: boolean | null;
  endpoint_contracts: {
    endpoint: string;
    found: boolean;
    method: string;
    scan_mode: string;
    data_source: string;
    phase: string;
    refresh: string;
    full_reconcile: boolean;
  }[];
  browser_report: MigratedRouteBrowserReport;
}

export interface BrowserQaGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AdminMigratedPagesLiveBrowserQaReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  api_base_url: string;
  web_base_url: string;
  expected_library_root: string;
  output_dir: string;
  environment: {
    auth_mode: string;
    authenticated: boolean | null;
    library_root: string;
    current_index_version: string;
    video_count: number | null;
    ready_video_count: number | null;
    admin_read_model: {
      freshness: string;
      safe_for_page_request: boolean | null;
      reconciliation_action: string;
      reconciliation_scan_mode: string;
    };
  };
  api_probes: ApiProbe[];
  route_evidence: MigratedRouteEvidence[];
  gates: BrowserQaGate[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3893";
const DEFAULT_WEB_BASE_URL = "http://127.0.0.1:5187";
const DEFAULT_EXPECTED_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";

function routeWebUrl(baseUrl: string, route: MigratedRoute): string {
  return `${baseUrl.replace(/\/+$/, "")}/#/${route}`;
}

const migratedRoutes = [
  {
    route: "index-publish" as const,
    label: "发布与索引",
    endpoints: ["/api/admin/source-videos", "/api/admin/index/versions"],
    run: runAdminIndexPublishBrowserQa
  },
  {
    route: "source-videos" as const,
    label: "素材库",
    endpoints: ["/api/admin/source-videos"],
    run: runAdminSourceVideosBrowserQa
  },
  {
    route: "cutter-users" as const,
    label: "剪辑师",
    endpoints: ["/api/admin/cutter-users"],
    run: runAdminCutterUsersBrowserQa
  },
  {
    route: "doctor" as const,
    label: "系统检查",
    endpoints: ["/api/admin/doctor/report"],
    run: runAdminDoctorBrowserQa
  },
  {
    route: "settings" as const,
    label: "设置",
    endpoints: ["/api/admin/settings/runtime", "/api/admin/library/path-checks"],
    run: runAdminSettingsBrowserQa
  }
] as const;

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function gate(name: string, passed: boolean, detail: string): BrowserQaGate {
  return { name, passed, detail };
}

function apiProbeData(report: Omit<AdminMigratedPagesLiveBrowserQaReport, "gates" | "result">, name: string): unknown {
  return report.api_probes.find((probe) => probe.name === name)?.data;
}

function endpointKey(pathname: string): string {
  return pathname.split("?")[0] ?? pathname;
}

function routePlanFor(dataLoadingPlan: unknown, route: MigratedRoute): Record<string, unknown> {
  return asRecord(asArray(asRecord(dataLoadingPlan).routes).find((item) => asRecord(item).route === route));
}

function endpointPlanFor(dataLoadingPlan: unknown, endpoint: string): Record<string, unknown> {
  return asRecord(asArray(asRecord(dataLoadingPlan).endpoints).find((item) => asRecord(item).endpoint === endpoint));
}

async function fetchApi(input: {
  apiBaseUrl: string;
  name: string;
  path: string;
  timeoutMs?: number;
}): Promise<ApiProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);
  const startedAt = performance.now();

  try {
    const response = await fetch(`${input.apiBaseUrl}${input.path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
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
      name: input.name,
      path: input.path,
      duration_ms: roundMs(performance.now() - startedAt),
      http_status: response.status,
      ok: response.ok && apiOk !== false,
      api_ok: apiOk,
      response_bytes: Buffer.byteLength(text, "utf8"),
      data: envelope.data,
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined
    };
  } catch (error) {
    return {
      name: input.name,
      path: input.path,
      duration_ms: roundMs(performance.now() - startedAt),
      http_status: null,
      ok: false,
      api_ok: null,
      response_bytes: 0,
      data: null,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeEnvironment(input: {
  authStatus: unknown;
  libraryStatus: unknown;
  readModelStatus: unknown;
}): AdminMigratedPagesLiveBrowserQaReport["environment"] {
  const auth = asRecord(input.authStatus);
  const library = asRecord(input.libraryStatus);
  const adminReadModel = asRecord(asRecord(input.readModelStatus).admin_read_model);
  const reconciliation = asRecord(adminReadModel.reconciliation);

  return {
    auth_mode: asString(auth.auth_mode),
    authenticated: asBoolean(auth.authenticated),
    library_root: asString(library.root_path),
    current_index_version: asString(library.current_index_version),
    video_count: asNumber(library.video_count),
    ready_video_count: asNumber(library.ready_video_count),
    admin_read_model: {
      freshness: asString(adminReadModel.freshness),
      safe_for_page_request: asBoolean(reconciliation.safe_for_page_request),
      reconciliation_action: asString(reconciliation.action),
      reconciliation_scan_mode: asString(reconciliation.scan_mode)
    }
  };
}

function buildRouteEvidence(input: {
  webBaseUrl: string;
  dataLoadingPlan: unknown;
  browserReports: Record<MigratedRoute, MigratedRouteBrowserReport>;
}): MigratedRouteEvidence[] {
  return migratedRoutes.map((definition) => {
    const routePlan = routePlanFor(input.dataLoadingPlan, definition.route);
    const routeEndpoints = asArray(routePlan.endpoints).map(asString).filter(Boolean);
    const endpointContracts = definition.endpoints.map((endpoint) => {
      const endpointPlan = endpointPlanFor(input.dataLoadingPlan, endpoint);
      const scanMode = asString(endpointPlan.scan_mode);
      return {
        endpoint,
        found: Object.keys(endpointPlan).length > 0,
        method: asString(endpointPlan.method),
        scan_mode: scanMode,
        data_source: asString(endpointPlan.data_source),
        phase: asString(endpointPlan.phase),
        refresh: asString(endpointPlan.refresh),
        full_reconcile: scanMode === "full-reconcile"
      };
    });

    return {
      route: definition.route,
      label: definition.label,
      web_url: routeWebUrl(input.webBaseUrl, definition.route),
      expected_route_endpoints: [...definition.endpoints],
      route_plan_found: Object.keys(routePlan).length > 0,
      route_plan_endpoints: routeEndpoints,
      route_plan_load_phase: asString(routePlan.load_phase),
      route_plan_prefetch: asBoolean(routePlan.prefetch),
      endpoint_contracts: endpointContracts,
      browser_report: input.browserReports[definition.route]
    };
  });
}

function failedBrowserDetails(route: MigratedRouteEvidence): string[] {
  const routeErrors: string[] = [];
  if (!route.browser_report.result.passed) {
    routeErrors.push(`${route.route}:result=${route.browser_report.result.status}`);
  }
  for (const viewport of route.browser_report.viewports) {
    if (viewport.console_errors.length > 0) {
      routeErrors.push(`${route.route}:${viewport.name}:console=${viewport.console_errors.length}`);
    }
    if (viewport.failed_api_requests.length > 0) {
      routeErrors.push(`${route.route}:${viewport.name}:api=${viewport.failed_api_requests.length}`);
    }
    if (viewport.body_horizontal_overflow_px > 0) {
      routeErrors.push(`${route.route}:${viewport.name}:overflow=${viewport.body_horizontal_overflow_px}px`);
    }
  }

  return routeErrors;
}

export function buildGateChecks(report: Omit<AdminMigratedPagesLiveBrowserQaReport, "gates" | "result">): BrowserQaGate[] {
  const failedApiProbes = report.api_probes.filter((probe) => !probe.ok).map((probe) => `${probe.name}:${probe.http_status ?? "error"}`);
  const dataLoadingPlan = apiProbeData(report, "data_loading_plan");
  const hiddenFullScanAllowed = asBoolean(asRecord(dataLoadingPlan).hidden_full_scan_allowed);
  const routeContractFailures = report.route_evidence.flatMap((route) => {
    const failures: string[] = [];
    if (!route.route_plan_found) {
      failures.push(`${route.route}:missing-route-plan`);
    }
    for (const expected of route.expected_route_endpoints) {
      if (!route.route_plan_endpoints.includes(expected)) {
        failures.push(`${route.route}:missing-route-endpoint:${expected}`);
      }
    }
    for (const endpoint of route.endpoint_contracts) {
      if (!endpoint.found) {
        failures.push(`${route.route}:missing-endpoint-plan:${endpoint.endpoint}`);
      }
      if (endpoint.full_reconcile) {
        failures.push(`${route.route}:full-reconcile:${endpoint.endpoint}`);
      }
    }
    return failures;
  });
  const browserFailures = report.route_evidence.flatMap(failedBrowserDetails);

  return [
    gate(
      "direct-api-probes-pass",
      failedApiProbes.length === 0,
      failedApiProbes.length === 0 ? "all direct live API probes passed" : failedApiProbes.join(", ")
    ),
    gate(
      "isolated-auth-disabled",
      report.environment.auth_mode === "disabled" && report.environment.authenticated === true,
      `auth_mode=${report.environment.auth_mode || "unknown"}, authenticated=${String(report.environment.authenticated)}`
    ),
    gate(
      "live-library-root",
      report.environment.library_root === report.expected_library_root,
      `actual=${report.environment.library_root || "unknown"}, expected=${report.expected_library_root}`
    ),
    gate(
      "live-library-counts",
      (report.environment.video_count ?? 0) >= 10_000 &&
        (report.environment.ready_video_count ?? 0) >= 10_000 &&
        Boolean(report.environment.current_index_version),
      `total=${String(report.environment.video_count)}, ready=${String(report.environment.ready_video_count)}, current_index=${report.environment.current_index_version || "unknown"}`
    ),
    gate(
      "admin-read-model-page-safe",
      report.environment.admin_read_model.freshness === "fresh" &&
        report.environment.admin_read_model.safe_for_page_request === true &&
        report.environment.admin_read_model.reconciliation_scan_mode === "no-scan",
      `freshness=${report.environment.admin_read_model.freshness || "unknown"}, safe=${String(report.environment.admin_read_model.safe_for_page_request)}, scan=${report.environment.admin_read_model.reconciliation_scan_mode || "unknown"}`
    ),
    gate(
      "data-loading-plan-no-hidden-full-scan",
      hiddenFullScanAllowed === false,
      `hidden_full_scan_allowed=${String(hiddenFullScanAllowed)}`
    ),
    gate(
      "migrated-route-contracts",
      routeContractFailures.length === 0,
      routeContractFailures.length === 0 ? "all migrated routes have registered non-full-reconcile route endpoints" : routeContractFailures.join(", ")
    ),
    gate(
      "migrated-browser-reports-pass",
      browserFailures.length === 0,
      browserFailures.length === 0 ? "all migrated page browser reports passed" : browserFailures.join(", ")
    )
  ];
}

function renderRouteMarkdown(route: MigratedRouteEvidence): string {
  const screenshots = route.browser_report.viewports
    .map((viewport) => `${viewport.name}: \`${viewport.screenshot_path}\``)
    .join("<br>");
  const endpoints = route.endpoint_contracts
    .map((endpoint) => `${endpoint.endpoint} (${endpoint.scan_mode || "unknown"} / ${endpoint.data_source || "unknown"})`)
    .join("<br>");

  return `| ${route.label} | \`${route.route}\` | ${route.browser_report.result.status} | ${route.route_plan_load_phase || "unknown"} | ${endpoints} | ${screenshots} |`;
}

export function renderMarkdown(report: AdminMigratedPagesLiveBrowserQaReport): string {
  return `# Admin Migrated Pages Live Browser QA ${report.generated_at}

## Scope

This R.113 report validates migrated Admin production-console pages against a live local Admin API pointed at the real NAS-mounted public library. It is GET-only API probing plus browser rendering. It does not run scan, scan-apply, reconcile, restore, publish, settings save, ASR test, user mutation, workers, Docker, or Cutter package validation.

## Environment

- API base URL: \`${report.api_base_url}\`
- Web base URL: \`${report.web_base_url}\`
- Expected library root: \`${report.expected_library_root}\`
- Actual library root: \`${report.environment.library_root || "unknown"}\`
- Auth mode: \`${report.environment.auth_mode || "unknown"}\`
- Authenticated: \`${String(report.environment.authenticated)}\`
- Current index: \`${report.environment.current_index_version || "unknown"}\`
- Counts: total \`${String(report.environment.video_count)}\`, ready \`${String(report.environment.ready_video_count)}\`
- Admin read model: freshness \`${report.environment.admin_read_model.freshness || "unknown"}\`, safe \`${String(report.environment.admin_read_model.safe_for_page_request)}\`, scan \`${report.environment.admin_read_model.reconciliation_scan_mode || "unknown"}\`

## Routes

| Page | Route | Browser | Load Phase | Endpoint Contracts | Screenshots |
| --- | --- | --- | --- | --- | --- |
${report.route_evidence.map(renderRouteMarkdown).join("\n")}

## Direct API Probes

| Name | Path | Status | Result | Duration | Bytes |
| --- | --- | ---: | --- | ---: | ---: |
${report.api_probes.map((probe) => `| ${probe.name} | \`${probe.path}\` | ${probe.http_status ?? "n/a"} | ${probe.ok ? "ok" : "failed"} | ${probe.duration_ms.toFixed(1)}ms | ${probe.response_bytes} |`).join("\n")}

## Gates

| Gate | Result | Detail |
| --- | --- | --- |
${report.gates.map((item) => `| ${item.name} | ${item.passed ? "pass" : "fail"} | ${item.detail.replaceAll("|", "\\|")} |`).join("\n")}

## Result

- Status: \`${report.result.status}\`
- Summary: ${report.result.summary}
`;
}

async function collectApiProbes(apiBaseUrl: string): Promise<ApiProbe[]> {
  return Promise.all([
    fetchApi({ apiBaseUrl, name: "health", path: "/health", timeoutMs: 5_000 }),
    fetchApi({ apiBaseUrl, name: "auth_status", path: "/api/admin/auth/status", timeoutMs: 5_000 }),
    fetchApi({ apiBaseUrl, name: "library_status", path: "/api/admin/library/status", timeoutMs: 8_000 }),
    fetchApi({ apiBaseUrl, name: "data_loading_plan", path: "/api/admin/data-loading/plan", timeoutMs: 5_000 }),
    fetchApi({ apiBaseUrl, name: "read_model_status", path: "/api/admin/read-model/status", timeoutMs: 5_000 }),
    fetchApi({ apiBaseUrl, name: "source_videos_first_page", path: "/api/admin/source-videos?limit=20", timeoutMs: 15_000 }),
    fetchApi({ apiBaseUrl, name: "source_videos_index_required", path: "/api/admin/source-videos?status=index-required&limit=20", timeoutMs: 15_000 }),
    fetchApi({ apiBaseUrl, name: "index_versions", path: "/api/admin/index/versions?limit=8", timeoutMs: 15_000 }),
    fetchApi({ apiBaseUrl, name: "cutter_users", path: "/api/admin/cutter-users", timeoutMs: 15_000 }),
    fetchApi({ apiBaseUrl, name: "doctor_report", path: "/api/admin/doctor/report", timeoutMs: 15_000 }),
    fetchApi({ apiBaseUrl, name: "settings_config", path: "/api/admin/settings/config", timeoutMs: 8_000 }),
    fetchApi({ apiBaseUrl, name: "settings_runtime", path: "/api/admin/settings/runtime", timeoutMs: 8_000 }),
    fetchApi({ apiBaseUrl, name: "path_checks", path: "/api/admin/library/path-checks", timeoutMs: 8_000 })
  ]);
}

async function collectBrowserReports(input: {
  webBaseUrl: string;
  outputDir: string;
  generatedAt: Date;
}): Promise<Record<MigratedRoute, MigratedRouteBrowserReport>> {
  const entries: [MigratedRoute, MigratedRouteBrowserReport][] = [];

  for (const definition of migratedRoutes) {
    const report = await definition.run({
      webUrl: routeWebUrl(input.webBaseUrl, definition.route),
      outputDir: input.outputDir,
      generatedAt: input.generatedAt
    });
    entries.push([definition.route, report]);
  }

  return Object.fromEntries(entries) as Record<MigratedRoute, MigratedRouteBrowserReport>;
}

export async function runAdminMigratedPagesLiveBrowserQa(input: {
  apiBaseUrl?: string;
  webBaseUrl?: string;
  expectedLibraryRoot?: string;
  outputDir?: string;
  generatedAt?: Date;
} = {}): Promise<AdminMigratedPagesLiveBrowserQaReport> {
  const generatedAt = input.generatedAt ?? new Date();
  const stamp = timestampForFile(generatedAt);
  const apiBaseUrl = (input.apiBaseUrl ?? process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const webBaseUrl = (input.webBaseUrl ?? process.env.MIXLAB_ADMIN_WEB_BASE_URL ?? DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
  const expectedLibraryRoot = input.expectedLibraryRoot ?? process.env.MIXLAB_ADMIN_EXPECTED_LIBRARY_ROOT ?? DEFAULT_EXPECTED_LIBRARY_ROOT;
  const outputDir = input.outputDir ?? process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;

  await mkdir(outputDir, { recursive: true });

  const apiProbes = await collectApiProbes(apiBaseUrl);
  const browserReports = await collectBrowserReports({ webBaseUrl, outputDir, generatedAt });
  const reportBase = {
    schema_version: "1.0" as const,
    generated_at: generatedAt.toISOString(),
    command: "tsx scripts/acceptance/admin-migrated-pages-live-browser-qa.ts",
    api_base_url: apiBaseUrl,
    web_base_url: webBaseUrl,
    expected_library_root: expectedLibraryRoot,
    output_dir: outputDir,
    environment: summarizeEnvironment({
      authStatus: apiProbes.find((probe) => probe.name === "auth_status")?.data,
      libraryStatus: apiProbes.find((probe) => probe.name === "library_status")?.data,
      readModelStatus: apiProbes.find((probe) => probe.name === "read_model_status")?.data
    }),
    api_probes: apiProbes,
    route_evidence: buildRouteEvidence({
      webBaseUrl,
      dataLoadingPlan: apiProbes.find((probe) => probe.name === "data_loading_plan")?.data,
      browserReports
    })
  };
  const gates = buildGateChecks(reportBase);
  const passed = gates.every((item) => item.passed);
  const report: AdminMigratedPagesLiveBrowserQaReport = {
    ...reportBase,
    gates,
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed
        ? "migrated Admin pages live browser QA passed against real local NAS-backed Admin API"
        : "migrated Admin pages live browser QA failed one or more gates"
    }
  };

  const jsonPath = path.join(outputDir, `admin-migrated-pages-live-browser-qa-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-migrated-pages-live-browser-qa-${stamp}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  if (!passed) {
    process.exitCode = 1;
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runAdminMigratedPagesLiveBrowserQa()
    .then((report) => {
      console.log(report.result.summary);
      for (const route of report.route_evidence) {
        console.log(`${route.route}: ${route.browser_report.result.status}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
