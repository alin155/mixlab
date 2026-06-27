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
import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import type { AdminRuntimeCacheStatus } from "./admin-runtime-observability.ts";

export const ADMIN_USAGE_METRICS_STORE_SCHEMA_VERSION = USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION;
export const ADMIN_USAGE_METRICS_STORE_FILE_NAME = USAGE_METRICS_SUMMARY_PROJECTION_FILE_NAME;

export type AdminUsageMetricsProjectionStatus =
  | "summary-hit"
  | "summary-stored"
  | "summary-write-failed"
  | "usage-events-changed-during-read";

export interface AdminUsageMetricsRuntimeResult {
  metrics: UsageMetrics;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  projection_status: AdminUsageMetricsProjectionStatus;
  projection_path: string;
}

export function adminUsageMetricsStorePath(libraryRoot: string): string {
  return usageMetricsSummaryProjectionPath(libraryRoot);
}

export async function readAdminUsageMetricsWithRuntime(input: {
  library_root: string;
  now?: () => string;
  read_usage_metrics?: (libraryRoot: string) => Promise<UsageMetrics>;
  read_usage_metrics_projection?: (libraryRoot: string) => Promise<UsageMetricsProjection>;
  write_usage_metrics_summary_projection?: typeof writeUsageMetricsSummaryProjection;
}): Promise<AdminUsageMetricsRuntimeResult> {
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
      projection_path: projectionPath
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
    projection_path: projectionPath
  };
}
