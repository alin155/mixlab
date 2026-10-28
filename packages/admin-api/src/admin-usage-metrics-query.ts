import {
  readUsageEventsFileSignature,
  readUsageMetrics,
  readUsageMetricsProjection,
  readUsageMetricsSummaryProjection,
  USAGE_METRICS_SUMMARY_PROJECTION_FILE_NAME,
  USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION,
  type UsageMetrics,
  type UsageMetricsProjection,
  usageEventsFileSignaturesEqual,
  usageMetricsSummaryProjectionPath,
  writeUsageMetricsSummaryProjection
} from "../../library-fs/src/index.ts";
import {
  readUsageServiceMetrics,
  usageServiceFromEnv,
  type UsageServiceConnection,
  type UsageServiceMetricsResponse
} from "../../service-clients/src/usage-service-client.ts";
import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import type { AdminRuntimeCacheStatus } from "./admin-runtime-observability.ts";

export const ADMIN_USAGE_METRICS_STORE_SCHEMA_VERSION = USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION;
export const ADMIN_USAGE_METRICS_STORE_FILE_NAME = USAGE_METRICS_SUMMARY_PROJECTION_FILE_NAME;

export type AdminUsageMetricsProjectionStatus =
  | "summary-hit"
  | "summary-stored"
  | "summary-write-failed"
  | "usage-events-changed-during-read"
  | "usage-service";

export type AdminUsageMetricsSource = "legacy-events" | "usage-service";

export interface AdminUsageMetricsRuntimeResult {
  metrics: UsageMetrics;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  projection_status: AdminUsageMetricsProjectionStatus;
  projection_path: string;
  /** Round4 feature flag: which source produced the report (legacy default). */
  metrics_source?: AdminUsageMetricsSource;
  /** Only present in usage-service mode. */
  usage_service?: {
    store_id: string;
    event_count: number;
    by_day: UsageServiceMetricsResponse["by_day"];
  };
}

export function adminUsageMetricsStorePath(libraryRoot: string): string {
  return usageMetricsSummaryProjectionPath(libraryRoot);
}

export async function readAdminUsageMetricsWithRuntime(input: {
  library_root: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
  /** Injectable override: undefined resolves from env; null forces the legacy path. */
  usage_service_connection?: UsageServiceConnection | null;
  read_usage_service_metrics?: (connection: UsageServiceConnection) => Promise<UsageServiceMetricsResponse<UsageMetrics>>;
  read_usage_metrics?: (libraryRoot: string) => Promise<UsageMetrics>;
  read_usage_metrics_projection?: (libraryRoot: string) => Promise<UsageMetricsProjection>;
  write_usage_metrics_summary_projection?: typeof writeUsageMetricsSummaryProjection;
}): Promise<AdminUsageMetricsRuntimeResult> {
  // Round4 feature flag: MIXLAB_USAGE_SERVICE_URL unset keeps the legacy NDJSON/read-model path.
  const connection = input.usage_service_connection === undefined
    ? usageServiceFromEnv(input.env ?? process.env, "admin")
    : input.usage_service_connection;

  if (connection) {
    const response = await (input.read_usage_service_metrics ??
      ((serviceConnection: UsageServiceConnection) => readUsageServiceMetrics<UsageMetrics>(serviceConnection)))(connection);

    return {
      metrics: response.metrics,
      actual_data_source: "usage-events",
      cache_status: "miss",
      projection_status: "usage-service",
      projection_path: "",
      metrics_source: "usage-service",
      usage_service: {
        store_id: response.store_id,
        event_count: response.event_count,
        by_day: response.by_day
      }
    };
  }

  const signatureBeforeRead = await readUsageEventsFileSignature(input.library_root);
  const projectionPath = adminUsageMetricsStorePath(input.library_root);
  const stored = readUsageMetricsSummaryProjection({
    library_root: input.library_root,
    signature: signatureBeforeRead
  });
  if (stored) {
    return {
      metrics: stored.metrics,
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      projection_status: "summary-hit",
      projection_path: projectionPath,
      metrics_source: "legacy-events"
    };
  }

  let projection: UsageMetricsProjection | null = null;
  let metrics: UsageMetrics;
  if (input.read_usage_metrics_projection) {
    projection = await input.read_usage_metrics_projection(input.library_root);
    metrics = projection.metrics;
  } else if (input.read_usage_metrics) {
    metrics = await input.read_usage_metrics(input.library_root);
  } else {
    projection = await readUsageMetricsProjection(input.library_root);
    metrics = projection.metrics;
  }

  const signatureAfterRead = await readUsageEventsFileSignature(input.library_root);
  let projectionStatus: AdminUsageMetricsProjectionStatus = "usage-events-changed-during-read";
  if (usageEventsFileSignaturesEqual(signatureBeforeRead, signatureAfterRead)) {
    const writeSummary = input.write_usage_metrics_summary_projection ?? writeUsageMetricsSummaryProjection;
    projectionStatus = "summary-stored";
    await writeSummary({
      library_root: input.library_root,
      signature: signatureAfterRead,
      metrics,
      projection_state: projection?.projection_state,
      generated_at: input.now?.() ?? new Date().toISOString()
    }).catch(() => {
      projectionStatus = "summary-write-failed";
    });
  }

  return {
    metrics,
    actual_data_source: "usage-events",
    cache_status: "miss",
    projection_status: projectionStatus,
    projection_path: projectionPath,
    metrics_source: "legacy-events"
  };
}
