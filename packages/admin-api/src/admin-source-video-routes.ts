import type { PreprocessStatus } from "../../protocol/src/index.ts";
import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import type {
  AdminSourceVideoManifestFallbackPolicy
} from "./admin-source-video-status-page-query.ts";
import {
  adminRuntimeNowMs,
  buildAdminRuntimeEndpointMeta,
  type AdminRuntimeEndpointMeta,
  type AdminRuntimeCacheStatus,
  type AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import {
  apiError,
  apiOk,
  parseAdminRouteLimit,
  parseAdminRouteOffset,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminSourceVideoRouteApiInput {
  library_root: string;
}

export interface AdminSourceVideoRouteListInput {
  library_root: string;
  offset: number;
  limit: number;
  query?: string;
  status?: PreprocessStatus;
  disable_store_repair?: boolean;
  manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
}

export interface AdminSourceVideoRouteListResult<TManifest> {
  manifests: TManifest[];
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  fallback_reason?: string;
  repair_reason?: string;
  component_timings?: AdminRuntimeComponentTiming[];
}

export interface AdminSourceVideoRouteDeps<TManifest, TPublic, TDetail> {
  runtime_now_ms?(): number;
  is_source_video_status(value: string): value is PreprocessStatus;
  read_source_video_list(
    input: AdminSourceVideoRouteListInput
  ): Promise<AdminSourceVideoRouteListResult<TManifest>>;
  to_public_source_video(manifest: TManifest): TPublic;
  read_source_video_detail(libraryRoot: string, sourceVideoId: string): Promise<TDetail | null>;
  record_runtime_diagnostic?(libraryRoot: string, runtime: AdminRuntimeEndpointMeta): void | Promise<void>;
}

export type AdminSourceVideoRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminSourceVideoRoutesInput<TManifest, TPublic, TDetail> {
  method: string;
  pathname: string;
  search_params: URLSearchParams;
  disable_store_repair?: boolean;
  api_input: AdminSourceVideoRouteApiInput;
  deps: AdminSourceVideoRouteDeps<TManifest, TPublic, TDetail>;
}

export async function handleAdminSourceVideoRoutes<TManifest, TPublic, TDetail>(
  input: HandleAdminSourceVideoRoutesInput<TManifest, TPublic, TDetail>
): Promise<AdminSourceVideoRouteResult> {
  if (input.method === "GET" && input.pathname === "/api/admin/source-videos") {
    const runtimeNowMs = input.deps.runtime_now_ms ?? adminRuntimeNowMs;
    const startedAtMs = runtimeNowMs();
    const rawQuery = input.search_params.get("query") ?? "";
    const rawStatus = input.search_params.get("status") ?? "";
    const manifestFallbackPolicy = input.search_params.get("manifest_fallback") === "forbid"
      ? "forbid"
      : undefined;
    const limit = parseAdminRouteLimit(input.search_params, {
      max_limit: 500,
      default_limit: 0
    }) ?? 0;
    const offset = parseAdminRouteOffset(input.search_params);
    const status = input.deps.is_source_video_status(rawStatus) ? rawStatus : undefined;
    const result = await input.deps.read_source_video_list({
      library_root: input.api_input.library_root,
      offset,
      limit,
      query: rawQuery,
      status,
      ...(input.disable_store_repair ? { disable_store_repair: true } : {}),
      ...(manifestFallbackPolicy ? { manifest_fallback_policy: manifestFallbackPolicy } : {})
    });
    const data = result.manifests.map((manifest) => input.deps.to_public_source_video(manifest));
    const runtime = buildAdminRuntimeEndpointMeta({
      endpoint: "/api/admin/source-videos",
      method: "GET",
      started_at_ms: startedAtMs,
      finished_at_ms: runtimeNowMs(),
      scan_mode: "paged-list",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      actual_data_source: result.actual_data_source,
      cache_status: result.cache_status,
      fallback_reason: result.fallback_reason,
      repair_reason: result.repair_reason,
      components: result.component_timings,
      result_count: data.length,
      offset,
      limit,
      slow_threshold_ms: status ? 2_000 : 1_000,
      slow_reason: status ? "source-video-status-page-above-target" : "source-video-page-above-target"
    });

    if (input.deps.record_runtime_diagnostic) {
      try {
        await input.deps.record_runtime_diagnostic(input.api_input.library_root, runtime);
      } catch {
        // Runtime diagnostics are derived evidence only and must never break page data.
      }
    }

    return {
      handled: true,
      status_code: 200,
      body: apiOk(data, { runtime })
    };
  }

  const sourceVideoDetailMatch = /^\/api\/admin\/source-videos\/(V\d{6})$/.exec(input.pathname);
  if (input.method === "GET" && sourceVideoDetailMatch) {
    const detail = await input.deps.read_source_video_detail(
      input.api_input.library_root,
      sourceVideoDetailMatch[1] ?? ""
    );

    if (!detail) {
      return {
        handled: true,
        status_code: 404,
        body: apiError("not_found", "原视频不存在")
      };
    }

    return {
      handled: true,
      status_code: 200,
      body: apiOk(detail)
    };
  }

  return { handled: false };
}
