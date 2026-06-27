import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import type {
  AdminRuntimeCacheStatus,
  AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import {
  dominantAdminDashboardMetricsDataSource,
  getAdminDashboardMetrics,
  type AdminDashboardMetrics,
  type AdminDashboardMetricsInput
} from "./admin-dashboard-metrics-query.ts";

export const ADMIN_DASHBOARD_METRICS_CACHE_TTL_MS = 10_000;

export interface AdminDashboardMetricsRuntimeResult<RuntimeLoadMetrics = unknown> {
  data: AdminDashboardMetrics<RuntimeLoadMetrics>;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  component_timings?: AdminRuntimeComponentTiming[];
}

interface AdminDashboardMetricsCacheEntry<RuntimeLoadMetrics> {
  data: AdminDashboardMetrics<RuntimeLoadMetrics>;
  actual_data_source: AdminScanDataSource;
  component_timings?: AdminRuntimeComponentTiming[];
  expires_at_ms: number;
}

export interface AdminDashboardMetricsLoaded<RuntimeLoadMetrics = unknown> {
  data: AdminDashboardMetrics<RuntimeLoadMetrics>;
  actual_data_source: AdminScanDataSource;
  component_timings?: AdminRuntimeComponentTiming[];
}

export interface AdminDashboardMetricsReader<RuntimeLoadMetrics = unknown> {
  read(
    input: AdminDashboardMetricsInput<RuntimeLoadMetrics>
  ): Promise<AdminDashboardMetricsRuntimeResult<RuntimeLoadMetrics>>;
  clear(libraryRoot?: string): void;
}

export function createAdminDashboardMetricsReader<RuntimeLoadMetrics = unknown>(options: {
  ttl_ms?: number;
  now_ms?: () => number;
  load_metrics?: (
    input: AdminDashboardMetricsInput<RuntimeLoadMetrics>
  ) => Promise<AdminDashboardMetricsLoaded<RuntimeLoadMetrics>>;
} = {}): AdminDashboardMetricsReader<RuntimeLoadMetrics> {
  const ttlMs = Math.max(0, Math.floor(options.ttl_ms ?? ADMIN_DASHBOARD_METRICS_CACHE_TTL_MS));
  const cache = new Map<string, AdminDashboardMetricsCacheEntry<RuntimeLoadMetrics>>();
  const pending = new Map<string, Promise<AdminDashboardMetricsLoaded<RuntimeLoadMetrics>>>();
  const nowMs = options.now_ms ?? (() => Date.now());
  const loadMetrics = options.load_metrics ?? (async (input: AdminDashboardMetricsInput<RuntimeLoadMetrics>) => {
    const data = await getAdminDashboardMetrics(input);
    return {
      data,
      actual_data_source: dominantAdminDashboardMetricsDataSource(data)
    };
  });
  let generation = 0;

  function cacheHitComponent(
    actualDataSource: AdminScanDataSource,
    cacheStatus: AdminRuntimeCacheStatus
  ): AdminRuntimeComponentTiming[] {
    return [{
      name: "dashboard_metrics_cache",
      duration_ms: 0,
      data_source: actualDataSource,
      scan_mode: "no-scan",
      scan_reason: "background-metrics",
      cache_status: cacheStatus
    }];
  }

  return {
    async read(input) {
      const key = input.library_root;
      const cached = cache.get(key);
      if (ttlMs > 0 && cached && cached.expires_at_ms > nowMs()) {
        return {
          data: cached.data,
          actual_data_source: cached.actual_data_source,
          cache_status: "hit",
          component_timings: cacheHitComponent(cached.actual_data_source, "hit")
        };
      }

      const pendingRead = pending.get(key);
      if (pendingRead) {
        const loaded = await pendingRead;
        return {
          ...loaded,
          cache_status: "pending",
          component_timings: loaded.component_timings ?? cacheHitComponent(loaded.actual_data_source, "pending")
        };
      }

      const load = (async (): Promise<AdminDashboardMetricsLoaded<RuntimeLoadMetrics>> => {
        const loadGeneration = generation;
        const loaded = await loadMetrics(input);
        if (ttlMs > 0 && loadGeneration === generation) {
          cache.set(key, {
            ...loaded,
            expires_at_ms: nowMs() + ttlMs
          });
        }
        return loaded;
      })();

      pending.set(key, load);
      try {
        const loaded = await load;
        return {
          ...loaded,
          cache_status: "miss"
        };
      } finally {
        pending.delete(key);
      }
    },
    clear(libraryRoot) {
      generation += 1;
      if (libraryRoot) {
        cache.delete(libraryRoot);
        pending.delete(libraryRoot);
        return;
      }
      cache.clear();
      pending.clear();
    }
  };
}
