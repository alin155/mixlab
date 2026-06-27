import type {
  LibraryCounts,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import type { UsageMetrics } from "../../library-fs/src/index.ts";
import {
  createAdminDashboardMetricsReader,
  type AdminDashboardMetricsRuntimeResult
} from "./admin-dashboard-metrics-cache.ts";
import {
  dominantAdminDashboardMetricsDataSource,
  getAdminDashboardMetrics,
  type AdminDashboardIndexMetadata,
  type AdminDashboardMaterialSummary,
  type AdminDashboardPreprocessJob,
  type AdminDashboardProductionSummary,
  type AdminDashboardTranscriptMetrics,
  type AdminDashboardUsageMetricsResult
} from "./admin-dashboard-metrics-query.ts";
import {
  getAdminRuntimeLoadMetrics
} from "./admin-runtime-load-query.ts";
import type {
  AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import {
  getAdminTranscriptMetrics,
  type AdminTranscriptSummary
} from "./admin-transcript-metrics-query.ts";
import {
  readAdminUsageMetricsWithRuntime,
  type AdminUsageMetricsRuntimeResult
} from "./admin-usage-metrics-query.ts";

export type AdminDashboardRuntimeLoadMetrics = Awaited<ReturnType<typeof getAdminRuntimeLoadMetrics>>;

export const ADMIN_RUNTIME_LOAD_CACHE_TTL_MS = 2_000;

export interface AdminDashboardReadFacadeInput<RuntimeLoadMetrics = AdminDashboardRuntimeLoadMetrics> {
  full_transcript_metrics_max_manifests: number;
  full_dashboard_metrics_max_manifests: number;
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_status_summary(
    libraryRoot: string,
    library: LibraryCounts
  ): Promise<LibraryCounts | null>;
  read_material_summary(
    libraryRoot: string,
    library: LibraryCounts
  ): Promise<AdminDashboardMaterialSummary | null>;
  read_production_summary(
    libraryRoot: string,
    library: LibraryCounts,
    now: string
  ): Promise<AdminDashboardProductionSummary | null>;
  read_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  read_current_index_metadata(libraryRoot: string): Promise<AdminDashboardIndexMetadata | null>;
  read_transcript_summary(
    libraryRoot: string,
    manifest: SourceVideoManifest
  ): Promise<AdminTranscriptSummary>;
  read_preprocess_job(libraryRoot: string, sourceVideoId: string): Promise<AdminDashboardPreprocessJob | null>;
  read_usage_metrics(libraryRoot: string): Promise<UsageMetrics>;
  read_usage_metrics_with_runtime?(input: {
    library_root: string;
    now: () => string;
    read_usage_metrics: (libraryRoot: string) => Promise<UsageMetrics>;
  }): Promise<AdminUsageMetricsRuntimeResult>;
  read_runtime_load_metrics?(input: {
    library_root: string;
    env?: NodeJS.ProcessEnv;
    now?: () => string;
  }): Promise<RuntimeLoadMetrics>;
  runtime_load_cache_ttl_ms?: number;
  runtime_load_cache_now_ms?: () => number;
}

export interface AdminDashboardReadApiInput {
  library_root: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
}

export interface AdminDashboardReadFacade<RuntimeLoadMetrics = AdminDashboardRuntimeLoadMetrics> {
  read_transcript_metrics(input: {
    library_root: string;
    manifests: SourceVideoManifest[];
  }): Promise<AdminDashboardTranscriptMetrics>;
  read_runtime_load_metrics(input: AdminDashboardReadApiInput): Promise<RuntimeLoadMetrics>;
  read_dashboard_metrics(
    input: AdminDashboardReadApiInput
  ): Promise<AdminDashboardMetricsRuntimeResult<RuntimeLoadMetrics>>;
  clear_dashboard_metrics_cache(libraryRoot?: string): void;
}

export function createAdminDashboardReadFacade<RuntimeLoadMetrics = AdminDashboardRuntimeLoadMetrics>(
  input: AdminDashboardReadFacadeInput<RuntimeLoadMetrics>
): AdminDashboardReadFacade<RuntimeLoadMetrics> {
  const readUsageMetricsWithRuntime = input.read_usage_metrics_with_runtime ?? readAdminUsageMetricsWithRuntime;
  const readRuntimeLoadMetrics = input.read_runtime_load_metrics ?? ((apiInput) =>
    getAdminRuntimeLoadMetrics(apiInput) as Promise<RuntimeLoadMetrics>);
  const runtimeLoadCacheTtlMs = Math.max(
    0,
    Math.floor(input.runtime_load_cache_ttl_ms ?? ADMIN_RUNTIME_LOAD_CACHE_TTL_MS)
  );
  const runtimeLoadCacheNowMs = input.runtime_load_cache_now_ms ?? (() => Date.now());
  const runtimeLoadCache = new Map<string, {
    data: RuntimeLoadMetrics;
    expires_at_ms: number;
  }>();
  const runtimeLoadPending = new Map<string, Promise<RuntimeLoadMetrics>>();
  let runtimeLoadGeneration = 0;

  async function readRuntimeLoadMetricsCached(apiInput: AdminDashboardReadApiInput): Promise<RuntimeLoadMetrics> {
    const key = apiInput.library_root;
    const cached = runtimeLoadCache.get(key);
    if (
      runtimeLoadCacheTtlMs > 0 &&
      cached &&
      cached.expires_at_ms > runtimeLoadCacheNowMs()
    ) {
      return cached.data;
    }

    const pending = runtimeLoadPending.get(key);
    if (pending) {
      return pending;
    }

    const readGeneration = runtimeLoadGeneration;
    const load = (async () => {
      const data = await readRuntimeLoadMetrics(apiInput);
      if (runtimeLoadCacheTtlMs > 0 && readGeneration === runtimeLoadGeneration) {
        runtimeLoadCache.set(key, {
          data,
          expires_at_ms: runtimeLoadCacheNowMs() + runtimeLoadCacheTtlMs
        });
      }
      return data;
    })();

    runtimeLoadPending.set(key, load);
    try {
      return await load;
    } finally {
      runtimeLoadPending.delete(key);
    }
  }

  async function readTranscriptMetrics(metricsInput: {
    library_root: string;
    manifests: SourceVideoManifest[];
  }): Promise<AdminDashboardTranscriptMetrics> {
    return getAdminTranscriptMetrics({
      ...metricsInput,
      full_transcript_metrics_max_manifests: input.full_transcript_metrics_max_manifests,
      read_current_index_metadata: input.read_current_index_metadata,
      read_transcript_summary: input.read_transcript_summary
    });
  }

  const dashboardMetricsReader = createAdminDashboardMetricsReader<RuntimeLoadMetrics>({
    async load_metrics(metricsInput) {
      const componentTimings: AdminRuntimeComponentTiming[] = [];
      const data = await getAdminDashboardMetrics({
        ...metricsInput,
        record_component_timing(component) {
          componentTimings.push(component);
        },
        async read_usage_metrics(libraryRoot): Promise<AdminDashboardUsageMetricsResult> {
          const result = await readUsageMetricsWithRuntime({
            library_root: libraryRoot,
            now: () => metricsInput.now,
            read_usage_metrics: input.read_usage_metrics
          });
          return {
            metrics: result.metrics,
            actual_data_source: result.actual_data_source,
            cache_status: result.cache_status,
            projection_status: result.projection_status,
            projection_path: result.projection_path
          };
        }
      });

      return {
        data,
        actual_data_source: dominantAdminDashboardMetricsDataSource(data),
        component_timings: componentTimings
      };
    }
  });

  return {
    read_transcript_metrics: readTranscriptMetrics,
    read_runtime_load_metrics(apiInput) {
      return readRuntimeLoadMetricsCached(apiInput);
    },
    read_dashboard_metrics(apiInput) {
      const now = apiInput.now?.() ?? new Date().toISOString();
      return dashboardMetricsReader.read({
        library_root: apiInput.library_root,
        now,
        full_dashboard_metrics_max_manifests: input.full_dashboard_metrics_max_manifests,
        read_library_manifest: input.read_library_manifest,
        read_status_summary: input.read_status_summary,
        read_material_summary: input.read_material_summary,
        read_production_summary: input.read_production_summary,
        read_manifests: input.read_manifests,
        read_current_index_version: input.read_current_index_version,
        read_current_index_metadata: input.read_current_index_metadata,
        read_transcript_metrics: readTranscriptMetrics,
        read_preprocess_job: input.read_preprocess_job,
        read_usage_metrics: input.read_usage_metrics,
        read_runtime_load_metrics() {
          return readRuntimeLoadMetricsCached(apiInput);
        }
      });
    },
    clear_dashboard_metrics_cache(libraryRoot) {
      runtimeLoadGeneration += 1;
      if (libraryRoot) {
        runtimeLoadCache.delete(libraryRoot);
        runtimeLoadPending.delete(libraryRoot);
      } else {
        runtimeLoadCache.clear();
        runtimeLoadPending.clear();
      }
      dashboardMetricsReader.clear(libraryRoot);
    }
  };
}
