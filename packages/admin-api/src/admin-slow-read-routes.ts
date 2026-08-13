import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import type { AdminScanMode } from "./admin-scan-modes.ts";
import {
  PREPROCESS_STATUSES,
  type PreprocessStatus
} from "../../protocol/src/index.ts";
import {
  adminRuntimeNowMs,
  buildAdminRuntimeEndpointMeta,
  type AdminRuntimeEndpointMeta,
  type AdminRuntimeCacheStatus,
  type AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import {
  apiOk,
  parseAdminRouteLimit,
  parseAdminRouteOffset,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminSlowReadRouteApiInput {
  library_root: string;
}

export interface AdminSlowReadRoutePagedOptions {
  limit?: number;
  offset: number;
  status?: PreprocessStatus;
}

export interface AdminSlowReadRouteRuntimeResult<TData> {
  data: TData;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  component_timings?: AdminRuntimeComponentTiming[];
}

export interface AdminSlowReadRouteIndexRuntime {
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  query_strategy: string;
  component_timings?: AdminRuntimeComponentTiming[];
}

export interface AdminSlowReadRouteDeps<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisor,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
> {
  runtime_now_ms?(): number;
  read_dashboard_metrics(input: AdminSlowReadRouteApiInput): Promise<AdminSlowReadRouteRuntimeResult<TDashboardMetrics>>;
  read_preprocess_jobs(
    input: AdminSlowReadRouteApiInput,
    options: AdminSlowReadRoutePagedOptions
  ): Promise<AdminSlowReadRouteRuntimeResult<TPreprocessJobs>>;
  read_preprocess_supervisor_status(): TPreprocessSupervisor;
  read_index_versions(
    libraryRoot: string,
    options: AdminSlowReadRoutePagedOptions
  ): Promise<{
    response: TIndexVersions;
    runtime: AdminSlowReadRouteIndexRuntime;
  }>;
  record_runtime_diagnostic?(libraryRoot: string, runtime: AdminRuntimeEndpointMeta): void | Promise<void>;
}

export type AdminSlowReadRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminSlowReadRoutesInput<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisor,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
> {
  method: string;
  pathname: string;
  search_params: URLSearchParams;
  api_input: AdminSlowReadRouteApiInput;
  deps: AdminSlowReadRouteDeps<TDashboardMetrics, TPreprocessJobs, TPreprocessSupervisor, TIndexVersions>;
}

function dashboardMetricsRuntimeScanMode(dataSource: AdminScanDataSource): AdminScanMode {
  return dataSource === "usage-events" ||
    dataSource === "source-video-manifest" ||
    dataSource === "transcript-artifacts"
    ? "status-scan"
    : "no-scan";
}

const preprocessJobStatusFilters = new Set<PreprocessStatus>(PREPROCESS_STATUSES);

function parsePreprocessJobStatusFilter(value: string | null): PreprocessStatus | undefined {
  return preprocessJobStatusFilters.has(value as PreprocessStatus) ? value as PreprocessStatus : undefined;
}

export async function handleAdminSlowReadRoutes<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisor,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
>(
  input: HandleAdminSlowReadRoutesInput<TDashboardMetrics, TPreprocessJobs, TPreprocessSupervisor, TIndexVersions>
): Promise<AdminSlowReadRouteResult> {
  const runtimeNowMs = input.deps.runtime_now_ms ?? adminRuntimeNowMs;

  async function recordRuntimeDiagnostic(runtime: AdminRuntimeEndpointMeta): Promise<void> {
    if (!input.deps.record_runtime_diagnostic) {
      return;
    }

    try {
      await input.deps.record_runtime_diagnostic(input.api_input.library_root, runtime);
    } catch {
      // Runtime diagnostics are derived evidence only and must never break page data.
    }
  }

  if (input.method === "GET" && input.pathname === "/api/admin/dashboard/metrics") {
    const startedAtMs = runtimeNowMs();
    const result = await input.deps.read_dashboard_metrics(input.api_input);
    const scanMode = dashboardMetricsRuntimeScanMode(result.actual_data_source);
    const runtime = buildAdminRuntimeEndpointMeta({
      endpoint: "/api/admin/dashboard/metrics",
      method: "GET",
      started_at_ms: startedAtMs,
      finished_at_ms: runtimeNowMs(),
      scan_mode: scanMode,
      data_source: result.actual_data_source,
      scan_reason: "background-metrics",
      actual_data_source: result.actual_data_source,
      cache_status: result.cache_status,
      result_count: 1,
      slow_threshold_ms: 1_500,
      slow_reason: "dashboard-metrics-above-target",
      components: result.component_timings
    });
    await recordRuntimeDiagnostic(runtime);

    return {
      handled: true,
      status_code: 200,
      body: apiOk(result.data, { runtime })
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/preprocess/jobs") {
    const startedAtMs = runtimeNowMs();
    const limit = parseAdminRouteLimit(input.search_params, { max_limit: 500 });
    const offset = parseAdminRouteOffset(input.search_params);
    const status = parsePreprocessJobStatusFilter(input.search_params.get("status"));
    const result = await input.deps.read_preprocess_jobs(input.api_input, {
      limit,
      offset,
      ...(status ? { status } : {})
    });
    const data = {
      ...result.data,
      supervisor: input.deps.read_preprocess_supervisor_status()
    };
    const runtime = buildAdminRuntimeEndpointMeta({
      endpoint: "/api/admin/preprocess/jobs",
      method: "GET",
      started_at_ms: startedAtMs,
      finished_at_ms: runtimeNowMs(),
      scan_mode: "status-scan",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      actual_data_source: result.actual_data_source,
      cache_status: result.cache_status,
      result_count: data.jobs.length,
      offset,
      limit: limit ?? 0,
      slow_threshold_ms: 1_000,
      slow_reason: "preprocess-jobs-page-above-target",
      components: result.component_timings
    });
    await recordRuntimeDiagnostic(runtime);

    return {
      handled: true,
      status_code: 200,
      body: apiOk(data, { runtime })
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/index/versions") {
    const startedAtMs = runtimeNowMs();
    const result = await input.deps.read_index_versions(input.api_input.library_root, {
      limit: parseAdminRouteLimit(input.search_params, { max_limit: Number.MAX_SAFE_INTEGER }),
      offset: parseAdminRouteOffset(input.search_params)
    });
    const runtime = buildAdminRuntimeEndpointMeta({
      endpoint: "/api/admin/index/versions",
      method: "GET",
      started_at_ms: startedAtMs,
      finished_at_ms: runtimeNowMs(),
      scan_mode: "paged-list",
      data_source: "index-version-packages",
      scan_reason: "index-version-page",
      actual_data_source: result.runtime.actual_data_source,
      cache_status: result.runtime.cache_status,
      result_count: result.response.versions.length,
      offset: result.response.offset,
      limit: result.response.limit,
      slow_threshold_ms: 1_000,
      slow_reason: result.runtime.query_strategy,
      components: result.runtime.component_timings
    });
    await recordRuntimeDiagnostic(runtime);

    return {
      handled: true,
      status_code: 200,
      body: apiOk(result.response, { runtime })
    };
  }

  return { handled: false };
}
