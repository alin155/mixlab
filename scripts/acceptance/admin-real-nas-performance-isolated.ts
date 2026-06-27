import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface ChildJsonResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  parsed_json: Record<string, unknown>;
}

interface HighRiskRuntimeComponentEvidence {
  name: string;
  sample_count: number;
  avg_ms: number | null;
  max_ms: number | null;
  data_sources: Record<string, number>;
  scan_modes: Record<string, number>;
  scan_reasons: Record<string, number>;
  cache_statuses: Record<string, number>;
  details: Record<string, number>;
}

interface HighRiskRouteRuntimeEvidence {
  endpoint_name: string;
  path: string;
  phase: string;
  expected_max_p95_ms: number | null;
  p95_ms: number | null;
  passed_target: boolean | null;
  sample_count: number;
  success_count: number;
  runtime_sample_count: number;
  actual_data_sources: Record<string, number>;
  scan_modes: Record<string, number>;
  cache_statuses: Record<string, number>;
  fallback_reasons: Record<string, number>;
  repair_reasons: Record<string, number>;
  slow_runtime_count: number;
  slow_reasons: Record<string, number>;
  components: HighRiskRuntimeComponentEvidence[];
  evidence_complete: boolean;
  missing_evidence: string[];
}

export interface IsolatedPerformanceReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "isolated-auth-disabled-no-repair-performance";
  api_base_url: string;
  expected_library_root: string;
  isolated_server: {
    host: "127.0.0.1";
    port: number;
    auth_mode: "disabled";
    health_wait_ms: number | null;
  };
  performance_artifacts: {
    json_path: string;
    markdown_path: string;
  };
  performance_summary: {
    generated_at: string;
    auth_mode: string;
    authenticated: boolean | null;
    library_root: string;
    endpoint_count: number;
    failed_endpoint_count: number;
    slow_endpoint_count: number;
    runtime_repair_endpoint_count: number;
    runtime_component_contract_failed_count: number;
    high_risk_route_count: number;
    high_risk_route_evidence_failed_count: number;
    background_aggregation_count: number;
    background_aggregation_evidence_failed_count: number;
    read_only_probe: boolean | null;
    disable_page_time_store_repair: boolean | null;
  };
  high_risk_route_runtime_evidence: HighRiskRouteRuntimeEvidence[];
  background_aggregation_runtime_evidence: HighRiskRouteRuntimeEvidence[];
  gates: GateCheck[];
  notes: string[];
  result: {
    passed: boolean;
    status: "passed" | "failed";
    summary: string;
  };
}

const DEFAULT_LIBRARY_ROOT = "/Volumes/MixLab/PublicLibrary";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_SERVER_TIMEOUT_MS = 30_000;
const REPO_ROOT = process.cwd();
const HIGH_RISK_ROUTE_NAMES = [
  "source_videos_processing",
  "source_videos_index_required",
  "preprocess_jobs",
  "index_versions"
] as const;
const BACKGROUND_AGGREGATION_ENDPOINT_NAMES = [
  "dashboard_metrics"
] as const;
const BACKGROUND_AGGREGATION_REQUIRED_COMPONENTS = {
  dashboard_metrics: ["usage_metrics"]
} satisfies Record<(typeof BACKGROUND_AGGREGATION_ENDPOINT_NAMES)[number], string[]>;

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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

function asCounter(value: unknown): Record<string, number> {
  const record = asRecord(value);
  const counter: Record<string, number> = {};
  for (const [key, count] of Object.entries(record)) {
    const numericCount = asNumber(count);
    if (numericCount !== null) {
      counter[key] = numericCount;
    }
  }
  return counter;
}

function mergeCounters(counters: Array<Record<string, number>>): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const counter of counters) {
    for (const [key, count] of Object.entries(counter)) {
      merged[key] = (merged[key] ?? 0) + count;
    }
  }
  return merged;
}

function hasCounterEntries(counter: Record<string, number>): boolean {
  return Object.keys(counter).length > 0;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${roundMs(value).toFixed(1)}ms`;
}

function formatCounter(counter: Record<string, number>): string {
  const entries = Object.entries(counter)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries.length === 0
    ? "none"
    : entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

function escapeMarkdownCell(value: unknown): string {
  return String(value).replaceAll("|", "\\|");
}

export async function availableLocalPort(): Promise<number> {
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

export function buildIsolatedAdminApiEnv(input: {
  base_env: NodeJS.ProcessEnv;
  library_root: string;
  port: number;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...input.base_env,
    MIXLAB_ADMIN_LIBRARY_ROOT: input.library_root,
    MIXLAB_ADMIN_API_HOST: "127.0.0.1",
    MIXLAB_ADMIN_API_PORT: String(input.port),
    MIXLAB_ADMIN_AUTH_MODE: "disabled"
  };
  delete env.MIXLAB_ADMIN_SESSION_TOKEN;
  return env;
}

export function parseChildJsonStdout(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Child process did not write JSON to stdout");
  }
  const parsed = JSON.parse(trimmed);
  if (!isRecord(parsed)) {
    throw new Error("Child process stdout was not a JSON object");
  }
  return parsed;
}

function startIsolatedAdminApi(input: {
  library_root: string;
  port: number;
}): ChildProcess {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/servers/admin-api-server.ts"],
    {
      cwd: REPO_ROOT,
      detached: process.platform !== "win32",
      env: buildIsolatedAdminApiEnv({
        base_env: process.env,
        library_root: input.library_root,
        port: input.port
      }),
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

async function waitForHttpOk(url: string, timeoutMs: number): Promise<number> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.arrayBuffer();
        return roundMs(performance.now() - startedAt);
      }
    } catch {
      // Keep polling until the temporary server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function runJsonChild(input: {
  env: NodeJS.ProcessEnv;
  args: string[];
}): Promise<ChildJsonResult> {
  const child = spawn(process.execPath, input.args, {
    cwd: REPO_ROOT,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
    if (process.env.MIXLAB_DEBUG_ACCEPTANCE === "1") {
      process.stderr.write(chunk);
    }
  });

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (exit.code !== 0) {
    throw new Error(`Child process failed with exit_code=${exit.code} signal=${exit.signal ?? ""}\n${stderr}`);
  }

  return {
    stdout,
    stderr,
    exit_code: exit.code,
    signal: exit.signal,
    parsed_json: parseChildJsonStdout(stdout)
  };
}

function endpointArray(performanceReport: Record<string, unknown>): Array<Record<string, unknown>> {
  const endpoints = performanceReport.endpoints;
  return Array.isArray(endpoints)
    ? endpoints.filter(isRecord)
    : [];
}

function endpointSummary(endpoint: Record<string, unknown>): Record<string, unknown> {
  return asRecord(endpoint.summary);
}

function runtimeSummary(endpoint: Record<string, unknown>): Record<string, unknown> {
  return asRecord(endpointSummary(endpoint).runtime);
}

function countRuntimeRepairEndpoints(endpoints: Array<Record<string, unknown>>): number {
  return endpoints.filter((endpoint) => Object.keys(asRecord(runtimeSummary(endpoint).repair_reasons)).length > 0).length;
}

function failedEndpoints(endpoints: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return endpoints.filter((endpoint) => {
    const summary = endpointSummary(endpoint);
    const sampleCount = asNumber(summary.sample_count) ?? 0;
    const successCount = asNumber(summary.success_count) ?? 0;
    return sampleCount > successCount;
  });
}

function slowEndpoints(endpoints: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return endpoints.filter((endpoint) => endpointSummary(endpoint).passed_target === false);
}

function runtimeComponentContracts(performanceReport: Record<string, unknown>): Array<Record<string, unknown>> {
  const contracts = performanceReport.runtime_component_contracts;
  return Array.isArray(contracts)
    ? contracts.filter(isRecord)
    : [];
}

function failedRuntimeComponentContracts(performanceReport: Record<string, unknown>): Array<Record<string, unknown>> {
  return runtimeComponentContracts(performanceReport)
    .filter((contract) => contract.passed !== true);
}

function performanceArtifactPath(value: unknown): string {
  return asString(value);
}

function highRiskRuntimeComponents(runtime: Record<string, unknown>): HighRiskRuntimeComponentEvidence[] {
  return Object.entries(asRecord(runtime.components))
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([name, component]) => {
      const sampleCount = asNumber(component.sample_count) ?? 0;
      const totalMs = asNumber(component.total_ms) ?? null;
      const maxMs = asNumber(component.max_ms);
      return {
        name,
        sample_count: sampleCount,
        avg_ms: totalMs !== null && sampleCount > 0 ? roundMs(totalMs / sampleCount) : null,
        max_ms: maxMs,
        data_sources: asCounter(component.data_sources),
        scan_modes: asCounter(component.scan_modes),
        scan_reasons: asCounter(component.scan_reasons),
        cache_statuses: asCounter(component.cache_statuses),
        details: asCounter(component.details)
      };
    })
    .sort((left, right) => (right.max_ms ?? -1) - (left.max_ms ?? -1) || left.name.localeCompare(right.name));
}

function buildHighRiskRouteRuntimeEvidence(
  endpoints: Array<Record<string, unknown>>,
  endpointNames: readonly string[] = HIGH_RISK_ROUTE_NAMES
): HighRiskRouteRuntimeEvidence[] {
  const endpointMap = new Map(endpoints.map((endpoint) => [asString(endpoint.name), endpoint]));

  return endpointNames.map((endpointName) => {
    const endpoint = endpointMap.get(endpointName);
    if (!endpoint) {
      return {
        endpoint_name: endpointName,
        path: "",
        phase: "",
        expected_max_p95_ms: null,
        p95_ms: null,
        passed_target: null,
        sample_count: 0,
        success_count: 0,
        runtime_sample_count: 0,
        actual_data_sources: {},
        scan_modes: {},
        cache_statuses: {},
        fallback_reasons: {},
        repair_reasons: {},
        slow_runtime_count: 0,
        slow_reasons: {},
        components: [],
        evidence_complete: false,
        missing_evidence: ["endpoint"]
      };
    }

    const summary = endpointSummary(endpoint);
    const runtime = runtimeSummary(endpoint);
    const components = highRiskRuntimeComponents(runtime);
    const componentDataSources = mergeCounters(components.map((component) => component.data_sources));
    const componentScanModes = mergeCounters(components.map((component) => component.scan_modes));
    const componentCacheStatuses = mergeCounters(components.map((component) => component.cache_statuses));
    const actualDataSources = asCounter(runtime.actual_data_sources);
    const scanModes = asCounter(runtime.scan_modes);
    const cacheStatuses = asCounter(runtime.cache_statuses);
    const resolvedActualDataSources = hasCounterEntries(actualDataSources) ? actualDataSources : componentDataSources;
    const resolvedScanModes = hasCounterEntries(scanModes) ? scanModes : componentScanModes;
    const resolvedCacheStatuses = hasCounterEntries(cacheStatuses) ? cacheStatuses : componentCacheStatuses;
    const sampleCount = asNumber(summary.sample_count) ?? 0;
    const runtimeSampleCount = asNumber(runtime.sample_count) ?? 0;
    const missingEvidence = [
      sampleCount <= 0 ? "samples" : "",
      runtimeSampleCount <= 0 ? "runtime" : "",
      hasCounterEntries(resolvedActualDataSources) ? "" : "actual_data_source",
      hasCounterEntries(resolvedScanModes) ? "" : "scan_mode",
      components.length > 0 ? "" : "components"
    ].filter((item) => item !== "");

    return {
      endpoint_name: endpointName,
      path: asString(endpoint.path),
      phase: asString(endpoint.phase),
      expected_max_p95_ms: asNumber(endpoint.expected_max_p95_ms),
      p95_ms: asNumber(summary.p95_ms),
      passed_target: asBoolean(summary.passed_target),
      sample_count: sampleCount,
      success_count: asNumber(summary.success_count) ?? 0,
      runtime_sample_count: runtimeSampleCount,
      actual_data_sources: resolvedActualDataSources,
      scan_modes: resolvedScanModes,
      cache_statuses: resolvedCacheStatuses,
      fallback_reasons: asCounter(runtime.fallback_reasons),
      repair_reasons: asCounter(runtime.repair_reasons),
      slow_runtime_count: asNumber(runtime.slow_runtime_count) ?? 0,
      slow_reasons: asCounter(runtime.slow_reasons),
      components,
      evidence_complete: missingEvidence.length === 0,
      missing_evidence: missingEvidence
    };
  });
}

function failedBackgroundAggregationEvidence(
  evidence: HighRiskRouteRuntimeEvidence[]
): HighRiskRouteRuntimeEvidence[] {
  return evidence
    .map((route) => {
      const requiredComponents = BACKGROUND_AGGREGATION_REQUIRED_COMPONENTS[
        route.endpoint_name as keyof typeof BACKGROUND_AGGREGATION_REQUIRED_COMPONENTS
      ] ?? [];
      const observedComponents = new Set(route.components.map((component) => component.name));
      const missingRequiredComponents = requiredComponents
        .filter((component) => !observedComponents.has(component))
        .map((component) => `component:${component}`);
      const missingEvidence = [
        ...route.missing_evidence,
        route.phase === "background" ? "" : "background_phase",
        ...missingRequiredComponents
      ].filter((item) => item !== "");

      return {
        ...route,
        evidence_complete: missingEvidence.length === 0,
        missing_evidence: missingEvidence
      };
    })
    .filter((route) => !route.evidence_complete);
}

export function buildIsolatedPerformanceReport(input: {
  generated_at: string;
  command: string;
  api_base_url: string;
  expected_library_root: string;
  port: number;
  health_wait_ms: number | null;
  performance_report: Record<string, unknown>;
  performance_stdout: Record<string, unknown>;
}): IsolatedPerformanceReport {
  const environment = asRecord(input.performance_report.environment);
  const library = asRecord(environment.library);
  const samplePolicy = asRecord(input.performance_report.sample_policy);
  const endpoints = endpointArray(input.performance_report);
  const failed = failedEndpoints(endpoints);
  const slow = slowEndpoints(endpoints);
  const runtimeRepairEndpointCount = countRuntimeRepairEndpoints(endpoints);
  const failedComponentContracts = failedRuntimeComponentContracts(input.performance_report);
  const highRiskRouteRuntimeEvidence = buildHighRiskRouteRuntimeEvidence(endpoints);
  const failedHighRiskRouteEvidence = highRiskRouteRuntimeEvidence
    .filter((route) => !route.evidence_complete);
  const backgroundAggregationRuntimeEvidence = buildHighRiskRouteRuntimeEvidence(
    endpoints,
    BACKGROUND_AGGREGATION_ENDPOINT_NAMES
  );
  const failedBackgroundEvidence = failedBackgroundAggregationEvidence(backgroundAggregationRuntimeEvidence);
  const summary = {
    generated_at: asString(input.performance_report.generated_at),
    auth_mode: asString(environment.auth_mode),
    authenticated: asBoolean(environment.authenticated),
    library_root: asString(library.root_path),
    endpoint_count: endpoints.length,
    failed_endpoint_count: failed.length,
    slow_endpoint_count: slow.length,
    runtime_repair_endpoint_count: runtimeRepairEndpointCount,
    runtime_component_contract_failed_count: failedComponentContracts.length,
    high_risk_route_count: highRiskRouteRuntimeEvidence.length,
    high_risk_route_evidence_failed_count: failedHighRiskRouteEvidence.length,
    background_aggregation_count: backgroundAggregationRuntimeEvidence.length,
    background_aggregation_evidence_failed_count: failedBackgroundEvidence.length,
    read_only_probe: asBoolean(samplePolicy.read_only_probe),
    disable_page_time_store_repair: asBoolean(samplePolicy.disable_page_time_store_repair)
  };

  const gates: GateCheck[] = [
    {
      name: "isolated-auth-disabled",
      passed: summary.auth_mode === "disabled" && summary.authenticated === true,
      detail: `auth_mode=${summary.auth_mode || "unknown"}, authenticated=${String(summary.authenticated)}`
    },
    {
      name: "library-root-match",
      passed: summary.library_root === input.expected_library_root,
      detail: `observed=${summary.library_root || "unknown"}, expected=${input.expected_library_root}`
    },
    {
      name: "no-repair-sample-policy",
      passed: summary.read_only_probe === true && summary.disable_page_time_store_repair === true,
      detail: `read_only_probe=${String(summary.read_only_probe)}, disable_page_time_store_repair=${String(summary.disable_page_time_store_repair)}`
    },
    {
      name: "no-runtime-repair-samples",
      passed: runtimeRepairEndpointCount === 0,
      detail: `runtime_repair_endpoint_count=${runtimeRepairEndpointCount}`
    },
    {
      name: "required-runtime-components-present",
      passed: failedComponentContracts.length === 0 && runtimeComponentContracts(input.performance_report).length > 0,
      detail: failedComponentContracts.length === 0
        ? `contract_count=${runtimeComponentContracts(input.performance_report).length}`
        : failedComponentContracts
            .map((contract) => `${asString(contract.endpoint_name)} missing=${Array.isArray(contract.missing_components) ? contract.missing_components.join(",") : "unknown"}`)
            .join("; ")
    },
    {
      name: "high-risk-route-runtime-evidence-complete",
      passed: failedHighRiskRouteEvidence.length === 0 && highRiskRouteRuntimeEvidence.length === HIGH_RISK_ROUTE_NAMES.length,
      detail: failedHighRiskRouteEvidence.length === 0
        ? `routes=${highRiskRouteRuntimeEvidence.map((route) => route.endpoint_name).join(",")}`
        : failedHighRiskRouteEvidence
            .map((route) => `${route.endpoint_name} missing=${route.missing_evidence.join(",")}`)
            .join("; ")
    },
    {
      name: "background-aggregation-runtime-evidence-complete",
      passed: failedBackgroundEvidence.length === 0 && backgroundAggregationRuntimeEvidence.length === BACKGROUND_AGGREGATION_ENDPOINT_NAMES.length,
      detail: failedBackgroundEvidence.length === 0
        ? `routes=${backgroundAggregationRuntimeEvidence.map((route) => route.endpoint_name).join(",")}`
        : failedBackgroundEvidence
            .map((route) => `${route.endpoint_name} missing=${route.missing_evidence.join(",")}`)
            .join("; ")
    },
    {
      name: "all-endpoint-samples-succeeded",
      passed: failed.length === 0 && endpoints.length > 0,
      detail: failed.length === 0
        ? `endpoint_count=${endpoints.length}`
        : failed.map((endpoint) => `${asString(endpoint.name)} ${asNumber(endpointSummary(endpoint).success_count) ?? 0}/${asNumber(endpointSummary(endpoint).sample_count) ?? 0}`).join(", ")
    },
    {
      name: "performance-targets-met",
      passed: slow.length === 0 && endpoints.length > 0,
      detail: slow.length === 0
        ? "no slow endpoint gates"
        : slow.map((endpoint) => `${asString(endpoint.name)} p95=${asNumber(endpointSummary(endpoint).p95_ms) ?? "n/a"} target=${asNumber(endpoint.expected_max_p95_ms) ?? "n/a"}`).join(", ")
    }
  ];
  const passed = gates.every((gate) => gate.passed);

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "isolated-auth-disabled-no-repair-performance",
    api_base_url: input.api_base_url,
    expected_library_root: input.expected_library_root,
    isolated_server: {
      host: "127.0.0.1",
      port: input.port,
      auth_mode: "disabled",
      health_wait_ms: input.health_wait_ms
    },
    performance_artifacts: {
      json_path: performanceArtifactPath(input.performance_stdout.json_path),
      markdown_path: performanceArtifactPath(input.performance_stdout.markdown_path)
    },
    performance_summary: summary,
    high_risk_route_runtime_evidence: highRiskRouteRuntimeEvidence,
    background_aggregation_runtime_evidence: backgroundAggregationRuntimeEvidence,
    gates,
    notes: [
      "This runner starts a temporary local Admin API with MIXLAB_ADMIN_AUTH_MODE=disabled and shuts it down after the probe.",
      "The child performance probe sends X-MixLab-Admin-Read-Only-Probe: true on GET requests.",
      "High-risk route runtime evidence must expose data source, scan mode, cache status and component timing for processing, index-required, preprocess/jobs and index/versions.",
      "Background aggregation runtime evidence must keep dashboard_metrics in the background phase and expose usage_metrics provenance.",
      "This runner does not start workers, run scan/apply/publish/repair commands, deploy Docker, or kill the user's existing 3889/5176 services.",
      "Passing this runner proves the sampled route set met the current performance gates for the observed library root; it does not complete Admin Architecture v1."
    ],
    result: {
      passed,
      status: passed ? "passed" : "failed",
      summary: passed
        ? "Isolated auth-disabled no-repair performance probe passed."
        : "Isolated auth-disabled no-repair performance probe failed one or more gates."
    }
  };
}

export function renderIsolatedMarkdown(report: IsolatedPerformanceReport): string {
  const highRiskRows = report.high_risk_route_runtime_evidence.map((route) => [
    route.endpoint_name,
    `${route.success_count}/${route.sample_count}`,
    `${route.runtime_sample_count}/${route.sample_count}`,
    formatMs(route.p95_ms),
    formatMs(route.expected_max_p95_ms),
    formatCounter(route.actual_data_sources),
    formatCounter(route.scan_modes),
    formatCounter(route.cache_statuses),
    formatCounter(route.fallback_reasons),
    formatCounter(route.repair_reasons),
    route.components.map((component) => `${component.name} max ${formatMs(component.max_ms)}`).join(", ") || "none",
    route.evidence_complete ? "complete" : `missing ${route.missing_evidence.join(", ")}`
  ]);
  const backgroundRows = report.background_aggregation_runtime_evidence.map((route) => [
    route.endpoint_name,
    route.phase || "missing",
    `${route.success_count}/${route.sample_count}`,
    `${route.runtime_sample_count}/${route.sample_count}`,
    formatMs(route.p95_ms),
    formatMs(route.expected_max_p95_ms),
    formatCounter(route.actual_data_sources),
    formatCounter(route.scan_modes),
    formatCounter(route.cache_statuses),
    formatCounter(route.fallback_reasons),
    formatCounter(route.repair_reasons),
    route.components.map((component) => `${component.name} max ${formatMs(component.max_ms)}`).join(", ") || "none",
    route.evidence_complete ? "complete" : `missing ${route.missing_evidence.join(", ")}`
  ]);

  return `# Admin Isolated No-Repair Performance Probe ${report.generated_at}

## Scope

This report starts a temporary local Admin API, runs the no-repair performance probe, and shuts the temporary API down. It is local acceptance evidence, not a NAS Docker deployment.

## Environment

- API: \`${report.api_base_url}\`
- Library root: \`${report.performance_summary.library_root || "unknown"}\`
- Expected library root: \`${report.expected_library_root}\`
- Auth: \`${report.performance_summary.auth_mode || "unknown"}\`, authenticated \`${String(report.performance_summary.authenticated)}\`
- Temporary server: \`${report.isolated_server.host}:${report.isolated_server.port}\`, health wait \`${report.isolated_server.health_wait_ms ?? "n/a"}ms\`
- Performance artifacts: \`${report.performance_artifacts.json_path}\`, \`${report.performance_artifacts.markdown_path}\`

## Summary

- Endpoints: \`${report.performance_summary.endpoint_count}\`
- Failed endpoint samples: \`${report.performance_summary.failed_endpoint_count}\`
- Slow endpoint gates: \`${report.performance_summary.slow_endpoint_count}\`
- Runtime repair endpoint count: \`${report.performance_summary.runtime_repair_endpoint_count}\`
- Runtime component contract failures: \`${report.performance_summary.runtime_component_contract_failed_count}\`
- High-risk route evidence failures: \`${report.performance_summary.high_risk_route_evidence_failed_count}\` / \`${report.performance_summary.high_risk_route_count}\`
- Background aggregation evidence failures: \`${report.performance_summary.background_aggregation_evidence_failed_count}\` / \`${report.performance_summary.background_aggregation_count}\`
- Read-only probe: \`${String(report.performance_summary.read_only_probe)}\`
- Disable page-time store repair: \`${String(report.performance_summary.disable_page_time_store_repair)}\`

## High-Risk Route Runtime Evidence

| route | success | runtime | p95 | target | data source | scan mode | cache | fallback | repair | components | evidence |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
${highRiskRows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`).join("\n")}

## Background Aggregation Runtime Evidence

| route | phase | success | runtime | p95 | target | data source | scan mode | cache | fallback | repair | components | evidence |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
${backgroundRows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`).join("\n")}

## Gates

| gate | status | detail |
| --- | --- | --- |
${report.gates.map((gate) => `| ${gate.name} | ${gate.passed ? "pass" : "blocked"} | ${gate.detail.replaceAll("|", "\\|")} |`).join("\n")}

## Result

- Status: \`${report.result.status}\`
- Summary: ${report.result.summary}

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const libraryRoot = process.env.MIXLAB_ADMIN_PERF_ISOLATED_LIBRARY_ROOT
    ?? process.env.MIXLAB_ADMIN_PERF_LIBRARY_ROOT
    ?? process.env.MIXLAB_ADMIN_LIBRARY_ROOT
    ?? DEFAULT_LIBRARY_ROOT;
  const outputDir = process.env.MIXLAB_ADMIN_PERF_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const configuredPort = parsePositiveInt(process.env.MIXLAB_ADMIN_PERF_ISOLATED_PORT, 0);
  const port = configuredPort > 0 ? configuredPort : await availableLocalPort();
  const apiBaseUrl = `http://127.0.0.1:${port}`;
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));
  const serverTimeoutMs = parsePositiveInt(process.env.MIXLAB_ADMIN_PERF_ISOLATED_TIMEOUT_MS, DEFAULT_SERVER_TIMEOUT_MS);
  const command = "tsx scripts/acceptance/admin-real-nas-performance-isolated.ts";
  const server = startIsolatedAdminApi({
    library_root: libraryRoot,
    port
  });
  let healthWaitMs: number | null = null;

  try {
    healthWaitMs = await waitForHttpOk(`${apiBaseUrl}/health`, serverTimeoutMs);
    const probeEnv: NodeJS.ProcessEnv = {
      ...process.env,
      MIXLAB_ADMIN_API_BASE_URL: apiBaseUrl,
      MIXLAB_ADMIN_PERF_OUTPUT_DIR: outputDir
    };
    delete probeEnv.MIXLAB_ADMIN_SESSION_TOKEN;
    const probe = await runJsonChild({
      env: probeEnv,
      args: ["--import", "tsx", "scripts/acceptance/admin-real-nas-performance.ts"]
    });
    const performanceJsonPath = path.resolve(
      REPO_ROOT,
      performanceArtifactPath(probe.parsed_json.json_path)
    );
    const performanceReport = JSON.parse(await readFile(performanceJsonPath, "utf8"));
    const report = buildIsolatedPerformanceReport({
      generated_at: generatedAt,
      command,
      api_base_url: apiBaseUrl,
      expected_library_root: libraryRoot,
      port,
      health_wait_ms: healthWaitMs,
      performance_report: isRecord(performanceReport) ? performanceReport : {},
      performance_stdout: probe.parsed_json
    });
    const jsonPath = path.join(outputDir, `admin-real-nas-performance-isolated-${stamp}.json`);
    const markdownPath = path.join(outputDir, `admin-real-nas-performance-isolated-${stamp}.md`);
    await mkdir(outputDir, { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, renderIsolatedMarkdown(report), "utf8");
    console.log(JSON.stringify({
      ok: report.result.passed,
      status: report.result.status,
      json_path: jsonPath,
      markdown_path: markdownPath,
      performance_json_path: report.performance_artifacts.json_path,
      performance_markdown_path: report.performance_artifacts.markdown_path,
      api_base_url: apiBaseUrl,
      generated_at: generatedAt
    }, null, 2));
    if (!report.result.passed) {
      process.exitCode = 1;
    }
  } finally {
    await stopProcess(server);
  }
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main().catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
