import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

type EndpointPhase = "shell" | "route" | "background" | "diagnostic";

interface EndpointProbe {
  name: string;
  method: "GET";
  path: string;
  phase: EndpointPhase;
  expected_max_p95_ms: number;
  timeout_ms: number;
  notes: string;
  warm_samples?: number;
}

interface ProbeSample {
  label: "cold" | "warm";
  sample_index: number;
  duration_ms: number;
  http_status: number | null;
  ok: boolean;
  api_ok: boolean | null;
  response_bytes: number;
  error_code?: string;
  message?: string;
  runtime?: RuntimeSampleMeta;
}

interface RuntimeSampleMeta {
  actual_data_source: string;
  cache_status: string;
  fallback_reason: string;
  repair_reason: string;
  scan_mode: string;
  slow: boolean | null;
  slow_reason: string;
  components: RuntimeComponentMeta[];
}

interface RuntimeComponentMeta {
  name: string;
  duration_ms: number;
  data_source: string;
  scan_mode: string;
  scan_reason: string;
  cache_status: string;
  detail: string;
}

interface RuntimeComponentSummary {
  sample_count: number;
  total_ms: number;
  max_ms: number;
  data_sources: Record<string, number>;
  scan_modes: Record<string, number>;
  scan_reasons: Record<string, number>;
  cache_statuses: Record<string, number>;
  details: Record<string, number>;
}

interface RuntimeSummary {
  sample_count: number;
  missing_runtime_count: number;
  actual_data_sources: Record<string, number>;
  scan_modes?: Record<string, number>;
  cache_statuses: Record<string, number>;
  fallback_reasons: Record<string, number>;
  repair_reasons: Record<string, number>;
  slow_runtime_count: number;
  slow_reasons: Record<string, number>;
  components: Record<string, RuntimeComponentSummary>;
}

interface EndpointResult {
  name: string;
  method: "GET";
  path: string;
  phase: EndpointPhase;
  expected_max_p95_ms: number;
  timeout_ms: number;
  notes: string;
  samples: ProbeSample[];
  summary: {
    sample_count: number;
    success_count: number;
    min_ms: number | null;
    p50_ms: number | null;
    p95_ms: number | null;
    max_ms: number | null;
    response_bytes_max: number;
    passed_target: boolean | null;
    runtime: RuntimeSummary;
  };
}

interface ApiEnvelope {
  ok?: unknown;
  data?: unknown;
  meta?: unknown;
  error_code?: unknown;
  message?: unknown;
}

interface RuntimeComponentContract {
  endpoint_name: string;
  expected_components: string[];
}

interface RuntimeComponentContractResult extends RuntimeComponentContract {
  observed_components: string[];
  missing_components: string[];
  passed: boolean;
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3889";
const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const DEFAULT_WARM_SAMPLES = 1;
export const ADMIN_READ_ONLY_PROBE_HEADER = "X-MixLab-Admin-Read-Only-Probe";

export const requiredRuntimeComponentContracts: RuntimeComponentContract[] = [
  {
    endpoint_name: "source_videos_processing",
    expected_components: [
      "library_counts",
      "status_store_page"
    ]
  },
  {
    endpoint_name: "source_videos_index_required",
    expected_components: [
      "library_counts",
      "status_store_page"
    ]
  },
  {
    endpoint_name: "source_videos_queued",
    expected_components: [
      "library_counts",
      "status_store_page"
    ]
  },
  {
    endpoint_name: "preprocess_jobs",
    expected_components: [
      "concurrency_policy",
      "library_counts",
      "preprocess_job_page",
      "runtime_load"
    ]
  },
  {
    endpoint_name: "index_versions",
    expected_components: [
      "cache_lookup"
    ]
  }
];

export const endpointProbes: EndpointProbe[] = [
  {
    name: "health",
    method: "GET",
    path: "/health",
    phase: "shell",
    expected_max_p95_ms: 1_000,
    timeout_ms: 5_000,
    notes: "Runtime liveness check."
  },
  {
    name: "auth_status",
    method: "GET",
    path: "/api/admin/auth/status",
    phase: "shell",
    expected_max_p95_ms: 1_000,
    timeout_ms: 5_000,
    notes: "Authentication mode and bootstrap status."
  },
  {
    name: "library_status",
    method: "GET",
    path: "/api/admin/library/status",
    phase: "shell",
    expected_max_p95_ms: 1_000,
    timeout_ms: 8_000,
    notes: "Summary manifest, disk and current index status; should not enumerate all videos when library.json exists."
  },
  {
    name: "data_loading_plan",
    method: "GET",
    path: "/api/admin/data-loading/plan",
    phase: "shell",
    expected_max_p95_ms: 1_000,
    timeout_ms: 5_000,
    notes: "Machine-readable Admin loading contract."
  },
  {
    name: "read_model_status",
    method: "GET",
    path: "/api/admin/read-model/status",
    phase: "diagnostic",
    expected_max_p95_ms: 1_000,
    timeout_ms: 5_000,
    notes: "No-scan freshness report for source-video-status-read-model-v1."
  },
  {
    name: "read_model_reconcile_status",
    method: "GET",
    path: "/api/admin/read-model/reconcile/status",
    phase: "diagnostic",
    expected_max_p95_ms: 1_000,
    timeout_ms: 5_000,
    notes: "Read-only background reconciler status; does not start or cancel reconcile."
  },
  {
    name: "protection_status",
    method: "GET",
    path: "/api/admin/protection/status",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 8_000,
    notes: "Preprocess protection state used by Admin safety surfaces."
  },
  {
    name: "release_gates",
    method: "GET",
    path: "/api/admin/release-gates",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 8_000,
    notes: "Docker/release readiness gate summary."
  },
  {
    name: "preprocess_safety",
    method: "GET",
    path: "/api/admin/preprocess/safety",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 8_000,
    notes: "Disk/path/recovery safety state."
  },
  {
    name: "operations_overview",
    method: "GET",
    path: "/api/admin/operations/overview",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 8_000,
    notes: "Protection Center aggregate; should compose no-scan and bounded route data."
  },
  {
    name: "operation_log",
    method: "GET",
    path: "/api/admin/operation-log?limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 5_000,
    notes: "Bounded operation-log tail; should not enumerate source-video manifests."
  },
  {
    name: "source_videos_first_page",
    method: "GET",
    path: "/api/admin/source-videos?limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 12_000,
    notes: "Bounded first page; confirms no accidental unbounded source-videos load."
  },
  {
    name: "source_videos_processing",
    method: "GET",
    path: "/api/admin/source-videos?status=processing&limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 15_000,
    notes: "Non-ready status filter backed by source-video-status-read-model-v1."
  },
  {
    name: "source_videos_index_required",
    method: "GET",
    path: "/api/admin/source-videos?status=index-required&limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 15_000,
    notes: "Index-required list; previously a slow path on large libraries."
  },
  {
    name: "source_videos_queued",
    method: "GET",
    path: "/api/admin/source-videos?status=queued&limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 15_000,
    notes: "Queued list; validates candidate paging instead of full manifest sweep."
  },
  {
    name: "source_videos_failed",
    method: "GET",
    path: "/api/admin/source-videos?status=failed&limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 15_000,
    notes: "Failed list; validates status read model coverage."
  },
  {
    name: "preprocess_jobs",
    method: "GET",
    path: "/api/admin/preprocess/jobs?limit=20",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 15_000,
    notes: "Preprocess job list; should use read-model candidate pages."
  },
  {
    name: "index_versions",
    method: "GET",
    path: "/api/admin/index/versions?limit=8",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 15_000,
    notes: "Bounded and cached index version list."
  },
  {
    name: "cutter_users",
    method: "GET",
    path: "/api/admin/cutter-users",
    phase: "route",
    expected_max_p95_ms: 1_000,
    timeout_ms: 8_000,
    notes: "Cutter user management list."
  },
  {
    name: "dashboard_metrics",
    method: "GET",
    path: "/api/admin/dashboard/metrics",
    phase: "background",
    expected_max_p95_ms: 8_000,
    timeout_ms: 20_000,
    warm_samples: 2,
    notes: "Expensive dashboard metrics. It must not be part of Admin shell blocking load."
  }
];

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentile(sorted: number[], percentileValue: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return roundMs(sorted[index] ?? sorted[sorted.length - 1] ?? 0);
}

function summarize(samples: ProbeSample[], expectedMaxP95Ms: number): EndpointResult["summary"] {
  const successfulDurations = samples
    .filter((sample) => sample.ok)
    .map((sample) => sample.duration_ms)
    .sort((left, right) => left - right);
  const p95 = percentile(successfulDurations, 95);

  return {
    sample_count: samples.length,
    success_count: successfulDurations.length,
    min_ms: successfulDurations.length > 0 ? roundMs(successfulDurations[0] ?? 0) : null,
    p50_ms: percentile(successfulDurations, 50),
    p95_ms: p95,
    max_ms: successfulDurations.length > 0
      ? roundMs(successfulDurations[successfulDurations.length - 1] ?? 0)
      : null,
    response_bytes_max: Math.max(0, ...samples.map((sample) => sample.response_bytes)),
    passed_target: p95 === null ? null : p95 <= expectedMaxP95Ms,
    runtime: summarizeRuntime(samples)
  };
}

function formatMs(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}ms`;
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatCounter(counter: Record<string, number>): string {
  const entries = Object.entries(counter)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function extractRuntimeComponents(runtime: Record<string, unknown>): RuntimeComponentMeta[] {
  if (!Array.isArray(runtime.components)) {
    return [];
  }

  return runtime.components
    .filter(isRecord)
    .map((component) => ({
      name: asString(component.name),
      duration_ms: asNumber(component.duration_ms) ?? 0,
      data_source: asString(component.data_source),
      scan_mode: asString(component.scan_mode),
      scan_reason: asString(component.scan_reason),
      cache_status: asString(component.cache_status),
      detail: asString(component.detail)
    }))
    .filter((component) => component.name.trim() !== "");
}

function envelopeFromJson(value: unknown): ApiEnvelope {
  return isRecord(value) ? value : {};
}

export function adminReadOnlyProbeHeaders(sessionToken: string | undefined): Record<string, string> {
  return {
    accept: "application/json",
    [ADMIN_READ_ONLY_PROBE_HEADER]: "true",
    ...(sessionToken ? { "X-MixLab-Admin-Session-Token": sessionToken } : {})
  };
}

function incrementCounter(counter: Record<string, number>, value: string): void {
  const key = value.trim() || "(empty)";
  counter[key] = (counter[key] ?? 0) + 1;
}

function extractRuntimeSampleMeta(envelope: ApiEnvelope): RuntimeSampleMeta | undefined {
  const meta = isRecord(envelope.meta) ? envelope.meta : {};
  const runtime = isRecord(meta.runtime) ? meta.runtime : null;
  if (!runtime) {
    return undefined;
  }

  return {
    actual_data_source: asString(runtime.actual_data_source),
    cache_status: asString(runtime.cache_status),
    fallback_reason: asString(runtime.fallback_reason),
    repair_reason: asString(runtime.repair_reason),
    scan_mode: asString(runtime.scan_mode),
    slow: asBoolean(runtime.slow),
    slow_reason: asString(runtime.slow_reason),
    components: extractRuntimeComponents(runtime)
  };
}

function summarizeRuntime(samples: ProbeSample[]): RuntimeSummary {
  const runtimeSamples = samples.filter((sample) => sample.runtime);
  const summary: RuntimeSummary = {
    sample_count: runtimeSamples.length,
    missing_runtime_count: samples.length - runtimeSamples.length,
    actual_data_sources: {},
    scan_modes: {},
    cache_statuses: {},
    fallback_reasons: {},
    repair_reasons: {},
    slow_runtime_count: 0,
    slow_reasons: {},
    components: {}
  };

  for (const sample of runtimeSamples) {
    const runtime = sample.runtime;
    if (!runtime) {
      continue;
    }

    incrementCounter(summary.actual_data_sources, runtime.actual_data_source);
    incrementCounter(summary.scan_modes, runtime.scan_mode);
    incrementCounter(summary.cache_statuses, runtime.cache_status);
    if (runtime.fallback_reason) {
      incrementCounter(summary.fallback_reasons, runtime.fallback_reason);
    }
    if (runtime.repair_reason) {
      incrementCounter(summary.repair_reasons, runtime.repair_reason);
    }
    if (runtime.slow) {
      summary.slow_runtime_count += 1;
      incrementCounter(summary.slow_reasons, runtime.slow_reason);
    }

    for (const component of runtime.components) {
      const existing = summary.components[component.name] ?? {
        sample_count: 0,
        total_ms: 0,
        max_ms: 0,
        data_sources: {},
        scan_modes: {},
        scan_reasons: {},
        cache_statuses: {},
        details: {}
      };
      existing.sample_count += 1;
      existing.total_ms += component.duration_ms;
      existing.max_ms = Math.max(existing.max_ms, component.duration_ms);
      if (component.data_source) {
        incrementCounter(existing.data_sources, component.data_source);
      }
      if (component.scan_mode) {
        incrementCounter(existing.scan_modes, component.scan_mode);
      }
      if (component.scan_reason) {
        incrementCounter(existing.scan_reasons, component.scan_reason);
      }
      if (component.cache_status) {
        incrementCounter(existing.cache_statuses, component.cache_status);
      }
      if (component.detail) {
        incrementCounter(existing.details, component.detail);
      }
      summary.components[component.name] = existing;
    }
  }

  return summary;
}

async function requestJson(
  apiBaseUrl: string,
  endpointPath: string,
  timeoutMs: number,
  sessionToken: string | undefined
): Promise<ProbeSample & { parsed_json: unknown }> {
  const url = `${apiBaseUrl}${endpointPath}`;
  const headers = adminReadOnlyProbeHeaders(sessionToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    const durationMs = roundMs(performance.now() - started);
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    const envelope = envelopeFromJson(parsed);
    const apiOk = typeof envelope.ok === "boolean" ? envelope.ok : null;
    const ok = response.ok && apiOk !== false;
    const runtime = extractRuntimeSampleMeta(envelope);

    return {
      label: "warm",
      sample_index: 0,
      duration_ms: durationMs,
      http_status: response.status,
      ok,
      api_ok: apiOk,
      response_bytes: Buffer.byteLength(text, "utf8"),
      error_code: typeof envelope.error_code === "string" ? envelope.error_code : undefined,
      message: typeof envelope.message === "string" ? envelope.message : undefined,
      ...(runtime ? { runtime } : {}),
      parsed_json: parsed
    };
  } catch (error) {
    return {
      label: "warm",
      sample_index: 0,
      duration_ms: roundMs(performance.now() - started),
      http_status: null,
      ok: false,
      api_ok: null,
      response_bytes: 0,
      error_code: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
      message: error instanceof Error ? error.message : "request failed",
      parsed_json: null
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runEndpointProbe(
  apiBaseUrl: string,
  endpoint: EndpointProbe,
  defaultWarmSamples: number,
  sessionToken: string | undefined,
  logProgress: boolean
): Promise<EndpointResult> {
  const warmSamples = endpoint.warm_samples ?? defaultWarmSamples;
  const samples: ProbeSample[] = [];

  for (let index = 0; index < warmSamples + 1; index += 1) {
    if (logProgress) {
      console.error(`[admin-perf] start ${endpoint.name} sample=${index === 0 ? "cold" : `warm-${index}`}`);
    }
    const sample = await requestJson(apiBaseUrl, endpoint.path, endpoint.timeout_ms, sessionToken);
    samples.push({
      label: index === 0 ? "cold" : "warm",
      sample_index: index,
      duration_ms: sample.duration_ms,
      http_status: sample.http_status,
      ok: sample.ok,
      api_ok: sample.api_ok,
      response_bytes: sample.response_bytes,
      error_code: sample.error_code,
      message: sample.message,
      ...(sample.runtime ? { runtime: sample.runtime } : {})
    });
    if (logProgress) {
      console.error(
        `[admin-perf] done ${endpoint.name} sample=${index === 0 ? "cold" : `warm-${index}`} ` +
          `status=${sample.http_status ?? "n/a"} ok=${sample.ok} duration_ms=${sample.duration_ms}`
      );
    }

    if (!sample.ok) {
      break;
    }
  }

  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    phase: endpoint.phase,
    expected_max_p95_ms: endpoint.expected_max_p95_ms,
    timeout_ms: endpoint.timeout_ms,
    notes: endpoint.notes,
    samples,
    summary: summarize(samples, endpoint.expected_max_p95_ms)
  };
}

export function buildRuntimeComponentContracts(
  endpoints: EndpointResult[],
  contracts: RuntimeComponentContract[] = requiredRuntimeComponentContracts
): RuntimeComponentContractResult[] {
  const endpointMap = new Map(endpoints.map((endpoint) => [endpoint.name, endpoint]));

  return contracts.map((contract) => {
    const endpoint = endpointMap.get(contract.endpoint_name);
    const observedComponents = endpoint
      ? Object.keys(endpoint.summary.runtime.components).sort((left, right) => left.localeCompare(right))
      : [];
    const observedSet = new Set(observedComponents);
    const missingComponents = contract.expected_components
      .filter((component) => !observedSet.has(component));

    return {
      endpoint_name: contract.endpoint_name,
      expected_components: contract.expected_components,
      observed_components: observedComponents,
      missing_components: missingComponents,
      passed: missingComponents.length === 0
    };
  });
}

async function fetchEnvelopeData(
  apiBaseUrl: string,
  endpointPath: string,
  timeoutMs: number,
  sessionToken: string | undefined
): Promise<unknown> {
  const response = await requestJson(apiBaseUrl, endpointPath, timeoutMs, sessionToken);
  const envelope = envelopeFromJson(response.parsed_json);
  return envelope.data;
}

function extractEnvironment(input: {
  apiBaseUrl: string;
  authStatus: unknown;
  libraryStatus: unknown;
  readModelBefore: unknown;
  readModelAfter: unknown;
}) {
  const auth = isRecord(input.authStatus) ? input.authStatus : {};
  const library = isRecord(input.libraryStatus) ? input.libraryStatus : {};
  const diskTotal = asNumber(library.disk_total_bytes);
  const diskAvailable = asNumber(library.disk_available_bytes);
  const diskUsedPercent = diskTotal && diskAvailable !== null
    ? Math.round(((diskTotal - diskAvailable) / diskTotal) * 1000) / 10
    : null;

  return {
    api_base_url: input.apiBaseUrl,
    auth_mode: asString(auth.auth_mode),
    authenticated: typeof auth.authenticated === "boolean" ? auth.authenticated : null,
    library: {
      root_path: asString(library.root_path),
      source_videos_path: asString(library.source_videos_path),
      current_index_version: asString(library.current_index_version),
      updated_at: asString(library.updated_at),
      video_count: asNumber(library.video_count),
      ready_video_count: asNumber(library.ready_video_count),
      processing_video_count: asNumber(library.processing_video_count),
      queued_video_count: asNumber(library.queued_video_count),
      failed_video_count: asNumber(library.failed_video_count),
      index_required_video_count: asNumber(library.index_required_video_count),
      disk_total_bytes: diskTotal,
      disk_available_bytes: diskAvailable,
      disk_used_percent: diskUsedPercent
    },
    read_model_before: input.readModelBefore,
    read_model_after: input.readModelAfter
  };
}

export function renderMarkdown(report: {
  generated_at: string;
  command: string;
  environment: ReturnType<typeof extractEnvironment>;
  endpoints: EndpointResult[];
  runtime_component_contracts?: RuntimeComponentContractResult[];
  notes: string[];
}) {
  const library = report.environment.library;
  const readModelAfter = isRecord(report.environment.read_model_after)
    ? report.environment.read_model_after
    : {};
  const adminReadModel = isRecord(readModelAfter.admin_read_model)
    ? readModelAfter.admin_read_model
    : {};
  const sourceVideoStatus = isRecord(readModelAfter.source_video_status)
    ? readModelAfter.source_video_status
    : {};
  const reconciliation = isRecord(adminReadModel.reconciliation)
    ? adminReadModel.reconciliation
    : {};
  const projections = isRecord(adminReadModel.projections)
    ? adminReadModel.projections
    : {};
  const projectionRows = ["material_summary", "production_summary", "process_history"]
    .map((name) => {
      const projection = isRecord(projections[name]) ? projections[name] : {};
      return [
        name,
        asString(projection.status) || "unknown",
        asString(projection.reason) || "unknown",
        asString(projection.scan_mode) || "unknown",
        String(asBoolean(projection.requires_background_reconcile) ?? "unknown"),
        String(asBoolean(projection.safe_for_page_request) ?? "unknown"),
        asNumber(projection.video_count) ?? "n/a",
        asNumber(projection.current_video_count) ?? "n/a"
      ];
    });
  const failures = report.endpoints.filter((endpoint) => endpoint.summary.passed_target === false);
  const errors = report.endpoints.filter((endpoint) => endpoint.summary.success_count < endpoint.summary.sample_count);
  const rows = report.endpoints.map((endpoint) => {
    const status = endpoint.summary.passed_target === null
      ? "n/a"
      : endpoint.summary.passed_target
        ? "pass"
        : "slow";
    return [
      endpoint.name,
      endpoint.phase,
      endpoint.samples[0]?.http_status ?? "n/a",
      `${endpoint.summary.success_count}/${endpoint.summary.sample_count}`,
      formatMs(endpoint.samples[0]?.duration_ms ?? null),
      formatMs(endpoint.summary.p50_ms),
      formatMs(endpoint.summary.p95_ms),
      formatMs(endpoint.summary.max_ms),
      status
    ];
  });
  const runtimeRows = report.endpoints.map((endpoint) => [
    endpoint.name,
    `${endpoint.summary.runtime.sample_count}/${endpoint.summary.sample_count}`,
    formatCounter(endpoint.summary.runtime.actual_data_sources),
    formatCounter(endpoint.summary.runtime.scan_modes ?? {}),
    formatCounter(endpoint.summary.runtime.cache_statuses),
    formatCounter(endpoint.summary.runtime.fallback_reasons),
    formatCounter(endpoint.summary.runtime.repair_reasons),
    endpoint.summary.runtime.slow_runtime_count
  ]);
  const componentRows = report.endpoints.flatMap((endpoint) =>
    Object.entries(endpoint.summary.runtime.components)
      .sort((left, right) => right[1].max_ms - left[1].max_ms || left[0].localeCompare(right[0]))
      .map(([componentName, component]) => [
        endpoint.name,
        componentName,
        component.sample_count,
        formatMs(component.total_ms / component.sample_count),
        formatMs(component.max_ms),
        formatCounter(component.data_sources),
        formatCounter(component.scan_modes),
        formatCounter(component.cache_statuses),
        formatCounter(component.details)
      ])
  );
  const componentContractRows = (report.runtime_component_contracts ?? [])
    .map((contract) => [
      contract.endpoint_name,
      contract.passed ? "pass" : "missing",
      contract.expected_components.join(", "),
      contract.observed_components.join(", ") || "none",
      contract.missing_components.join(", ") || "none"
    ]);
  const repairedEndpoints = report.endpoints.filter((endpoint) =>
    Object.keys(endpoint.summary.runtime.repair_reasons).length > 0
  );
  const fallbackEndpoints = report.endpoints.filter((endpoint) =>
    Object.keys(endpoint.summary.runtime.fallback_reasons).length > 0
  );

  return `# Admin Real NAS Performance Probe ${report.generated_at}

## Scope

This report measures read-only Admin API performance against a real public-library root. It separates shell, route, diagnostic and background endpoints so route-blocking work does not get mixed with expensive background scans.

## Environment

- API: \`${report.environment.api_base_url}\`
- Auth mode: \`${report.environment.auth_mode || "unknown"}\`
- Authenticated: \`${String(report.environment.authenticated)}\`
- Library root: \`${library.root_path || "unknown"}\`
- Source videos path: \`${library.source_videos_path || "unknown"}\`
- Current index: \`${library.current_index_version || "unknown"}\`
- Updated at: \`${library.updated_at || "unknown"}\`
- Counts: total \`${library.video_count ?? "n/a"}\`, ready \`${library.ready_video_count ?? "n/a"}\`, processing \`${library.processing_video_count ?? "n/a"}\`, queued \`${library.queued_video_count ?? "n/a"}\`, failed \`${library.failed_video_count ?? "n/a"}\`, index-required \`${library.index_required_video_count ?? "n/a"}\`
- Disk: ${formatBytes(library.disk_available_bytes)} available / ${formatBytes(library.disk_total_bytes)} total (${library.disk_used_percent ?? "n/a"}% used)

## Read Model Control Surface

- Admin read model storage: \`${asString(adminReadModel.storage) || "unknown"}\`
- Admin read model freshness: \`${asString(adminReadModel.freshness) || "unknown"}\`
- Admin read model exists: \`${String(asBoolean(adminReadModel.exists) ?? "unknown")}\`
- Admin read model video count: \`${asNumber(adminReadModel.video_count) ?? "n/a"}\`
- Admin read model reconciliation: action \`${asString(reconciliation.action) || "unknown"}\`, reason \`${asString(reconciliation.reason) || "unknown"}\`, scan mode \`${asString(reconciliation.scan_mode) || "unknown"}\`, requires background reconcile \`${String(asBoolean(reconciliation.requires_background_reconcile) ?? "unknown")}\`, safe for page request \`${String(asBoolean(reconciliation.safe_for_page_request) ?? "unknown")}\`
- Source-video status read model freshness: \`${asString(sourceVideoStatus.freshness) || "unknown"}\`
- Source-video status read model persisted: \`${asString(sourceVideoStatus.persisted) || "unknown"}\`

## Read Model Projection Readiness

| projection | status | reason | scan mode | requires background reconcile | safe for page request | video count | current video count |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
${projectionRows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}

## Endpoint Results

| endpoint | phase | first status | success | cold | p50 | p95 | max | gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}

## Runtime Source Summary

| endpoint | runtime samples | actual data source | scan mode | cache status | fallback reasons | repair reasons | runtime slow |
| --- | ---: | --- | --- | --- | --- | --- | ---: |
${runtimeRows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}

${componentRows.length > 0 ? `## Runtime Component Timing Summary

| endpoint | component | samples | avg | max | data source | scan mode | cache status | detail |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
${componentRows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}
` : ""}
${componentContractRows.length > 0 ? `## Runtime Component Contract Gates

| endpoint | gate | expected components | observed components | missing components |
| --- | --- | --- | --- | --- |
${componentContractRows.map((row) => `| ${row.map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}
` : ""}

## Findings

- Slow gates: ${failures.length > 0 ? failures.map((endpoint) => `\`${endpoint.name}\` p95 ${formatMs(endpoint.summary.p95_ms)}`).join(", ") : "none"}
- Error/timeout samples: ${errors.length > 0 ? errors.map((endpoint) => `\`${endpoint.name}\` ${endpoint.summary.success_count}/${endpoint.summary.sample_count}`).join(", ") : "none"}
- Runtime fallbacks: ${fallbackEndpoints.length > 0 ? fallbackEndpoints.map((endpoint) => `\`${endpoint.name}\` ${formatCounter(endpoint.summary.runtime.fallback_reasons)}`).join(", ") : "none"}
- Runtime repairs: ${repairedEndpoints.length > 0 ? repairedEndpoints.map((endpoint) => `\`${endpoint.name}\` ${formatCounter(endpoint.summary.runtime.repair_reasons)}`).join(", ") : "none"}
- Shell endpoints are expected to stay under 1s p95; route endpoints are expected to stay under 1s p95 after runtime/read-model warm-up; \`dashboard_metrics\` is background-only and has an 8s p95 budget.

## Notes

${report.notes.map((note) => `- ${note}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const apiBaseUrl = trimTrailingSlash(process.env.MIXLAB_ADMIN_API_BASE_URL ?? DEFAULT_API_BASE_URL);
  const outputDir = process.env.MIXLAB_ADMIN_PERF_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const warmSamples = parsePositiveInt(process.env.MIXLAB_ADMIN_PERF_WARM_SAMPLES, DEFAULT_WARM_SAMPLES);
  const stopAfterTimeout = process.env.MIXLAB_ADMIN_PERF_STOP_AFTER_TIMEOUT !== "false";
  const logProgress = process.env.MIXLAB_ADMIN_PERF_PROGRESS !== "false";
  const sessionToken = process.env.MIXLAB_ADMIN_SESSION_TOKEN?.trim() || undefined;
  const generatedAt = new Date().toISOString();
  const stamp = timestampForFile(new Date(generatedAt));

  if (logProgress) {
    console.error(`[admin-perf] api=${apiBaseUrl} warm_samples=${warmSamples}`);
  }

  const authStatus = await fetchEnvelopeData(apiBaseUrl, "/api/admin/auth/status", 5_000, sessionToken).catch((error) => ({
    error: error instanceof Error ? error.message : String(error)
  }));
  const readModelBefore = await fetchEnvelopeData(apiBaseUrl, "/api/admin/read-model/status", 5_000, sessionToken).catch((error) => ({
    error: error instanceof Error ? error.message : String(error)
  }));

  const endpoints: EndpointResult[] = [];
  for (const endpoint of endpointProbes) {
    const result = await runEndpointProbe(apiBaseUrl, endpoint, warmSamples, sessionToken, logProgress);
    endpoints.push(result);

    if (stopAfterTimeout && result.samples.some((sample) => sample.error_code === "timeout")) {
      if (logProgress) {
        console.error(`[admin-perf] stop after timeout at ${endpoint.name}`);
      }
      break;
    }
  }

  const libraryStatus = await fetchEnvelopeData(apiBaseUrl, "/api/admin/library/status", 8_000, sessionToken).catch((error) => ({
    error: error instanceof Error ? error.message : String(error)
  }));
  const readModelAfter = await fetchEnvelopeData(apiBaseUrl, "/api/admin/read-model/status", 5_000, sessionToken).catch((error) => ({
    error: error instanceof Error ? error.message : String(error)
  }));

  const report = {
    schema_version: "1.0",
    generated_at: generatedAt,
    command: "tsx scripts/acceptance/admin-real-nas-performance.ts",
    environment: extractEnvironment({
      apiBaseUrl,
      authStatus,
      libraryStatus,
      readModelBefore,
      readModelAfter
    }),
    sample_policy: {
      cold_samples_per_endpoint: 1,
      default_warm_samples_per_endpoint: warmSamples,
      read_only_probe: true,
      disable_page_time_store_repair: true
    },
    notes: [
      `All endpoint probes use GET requests only and send ${ADMIN_READ_ONLY_PROBE_HEADER}: true to disable page-time derived-store repair.`,
      "The probe checks read-model reconcile status but never starts, cancels, applies, repairs, publishes, or runs any command.",
      "Runtime Source Summary is derived from response meta.runtime fields and does not perform any additional scans.",
      "When MIXLAB_ADMIN_AUTH_MODE=disabled is used for an isolated local probe, timings represent business I/O after authentication rather than password/session overhead.",
      "The source-video-status-read-model-v1 persistent JSON file is generated cache under .mixlab-library/admin/read-models and does not rewrite source-video manifests.",
      "The admin.sqlite read model is an optimization and must remain rebuildable from source-video manifests; it is not the asset source of truth."
    ],
    endpoints,
    runtime_component_contracts: buildRuntimeComponentContracts(endpoints)
  };

  const jsonPath = path.join(outputDir, `admin-real-nas-performance-${stamp}.json`);
  const markdownPath = path.join(outputDir, `admin-real-nas-performance-${stamp}.md`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(JSON.stringify({
    ok: true,
    json_path: jsonPath,
    markdown_path: markdownPath,
    generated_at: generatedAt,
    api_base_url: apiBaseUrl,
    slow_endpoints: endpoints
      .filter((endpoint) => endpoint.summary.passed_target === false)
      .map((endpoint) => ({
        name: endpoint.name,
        phase: endpoint.phase,
        p95_ms: endpoint.summary.p95_ms,
        target_ms: endpoint.expected_max_p95_ms
      }))
  }, null, 2));
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
