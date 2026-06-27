import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import type { UsageMetrics } from "../../library-fs/src/index.ts";
import type {
  AdminScanDataSource,
  AdminScanMode,
  AdminScanReason
} from "./admin-scan-modes.ts";
import type {
  AdminRuntimeCacheStatus,
  AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";

export interface AdminDashboardTranscriptMetrics {
  transcript_video_count: number;
  character_count: number;
  segment_count: number;
}

export interface AdminDashboardIndexMetadata {
  source_video_count: number;
  segment_count: number;
}

export interface AdminDashboardMaterialSummary {
  video_count: number;
  ready_video_count: number;
  total_duration_ms: number;
  ready_duration_ms: number;
  unprocessed_duration_ms: number;
  total_size_bytes: number;
}

export interface AdminDashboardPreprocessJob {
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  failed_at?: string;
}

export interface AdminDashboardProductionSummary {
  completed_today_count: number;
  failed_today_count: number;
  average_video_process_ms: number;
}

export interface AdminDashboardMetricSource {
  data_source: AdminScanDataSource;
  scan_mode: AdminScanMode;
  scan_reason: AdminScanReason;
}

export interface AdminDashboardUsageMetricsResult {
  metrics: UsageMetrics;
  actual_data_source: AdminScanDataSource;
  cache_status?: AdminRuntimeCacheStatus;
  projection_status?: string;
  projection_path?: string;
}

export interface AdminDashboardMetricsSources {
  material: AdminDashboardMetricSource;
  transcript: AdminDashboardMetricSource;
  production: AdminDashboardMetricSource;
  usage: AdminDashboardMetricSource;
  risk: AdminDashboardMetricSource;
  runtime_load: AdminDashboardMetricSource;
}

export interface AdminDashboardMetricsInput<RuntimeLoadMetrics = unknown> {
  library_root: string;
  now: string;
  full_dashboard_metrics_max_manifests: number;
  runtime_now_ms?: () => number;
  record_component_timing?(component: AdminRuntimeComponentTiming): void;
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_status_summary?(
    libraryRoot: string,
    library: LibraryCounts
  ): Promise<LibraryCounts | null>;
  read_material_summary?(
    libraryRoot: string,
    library: LibraryCounts
  ): Promise<AdminDashboardMaterialSummary | null>;
  read_production_summary?(
    libraryRoot: string,
    library: LibraryCounts,
    now: string
  ): Promise<AdminDashboardProductionSummary | null>;
  read_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  read_current_index_metadata(libraryRoot: string): Promise<AdminDashboardIndexMetadata | null>;
  read_transcript_metrics(input: {
    library_root: string;
    manifests: SourceVideoManifest[];
  }): Promise<AdminDashboardTranscriptMetrics>;
  read_preprocess_job(libraryRoot: string, sourceVideoId: string): Promise<AdminDashboardPreprocessJob | null>;
  read_usage_metrics(libraryRoot: string): Promise<UsageMetrics | AdminDashboardUsageMetricsResult>;
  read_runtime_load_metrics(): Promise<RuntimeLoadMetrics>;
}

export interface AdminDashboardMetrics<RuntimeLoadMetrics = unknown> {
  material: {
    video_count: number;
    ready_video_count: number;
    total_duration_ms: number;
    ready_duration_ms: number;
    unprocessed_duration_ms: number;
    total_size_bytes: number;
  };
  transcript: AdminDashboardTranscriptMetrics & {
    current_index_version: string;
  };
  production: {
    completed_today_count: number;
    failed_today_count: number;
    average_video_process_ms: number;
    estimated_queue_done_at: string;
  };
  usage: UsageMetrics;
  risk: {
    failed_video_count: number;
    index_required_video_count: number;
  };
  runtime_load: RuntimeLoadMetrics;
  sources: AdminDashboardMetricsSources;
}

function countByStatus(manifests: SourceVideoManifest[]): LibraryCounts {
  const counts: Record<PreprocessStatus, number> = {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };

  for (const manifest of manifests) {
    counts[manifest.preprocess_status] += 1;
  }

  return {
    video_count: manifests.length,
    ready_video_count: counts.ready,
    processing_video_count: counts.processing,
    queued_video_count: counts.queued,
    unprocessed_video_count: counts.unprocessed,
    failed_video_count: counts.failed,
    index_required_video_count: counts["index-required"]
  };
}

function durationByStatus(manifests: SourceVideoManifest[], status: PreprocessStatus): number {
  return manifests
    .filter((manifest) => manifest.preprocess_status === status)
    .reduce((total, manifest) => total + manifest.duration_ms, 0);
}

function dashboardMetricSource(input: {
  data_source: AdminScanDataSource;
  scan_mode: AdminScanMode;
  scan_reason?: AdminScanReason;
}): AdminDashboardMetricSource {
  return {
    data_source: input.data_source,
    scan_mode: input.scan_mode,
    scan_reason: input.scan_reason ?? "background-metrics"
  };
}

function unwrapUsageMetrics(
  result: UsageMetrics | AdminDashboardUsageMetricsResult
): {
  metrics: UsageMetrics;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  projection_status: string;
  projection_path: string;
} {
  if ("metrics" in result && "actual_data_source" in result) {
    return {
      metrics: result.metrics,
      actual_data_source: result.actual_data_source,
      cache_status: result.cache_status ?? (result.actual_data_source === "admin-read-model" ? "hit" : "miss"),
      projection_status: result.projection_status ?? "unknown",
      projection_path: result.projection_path ?? ""
    };
  }

  return {
    metrics: result,
    actual_data_source: "usage-events",
    cache_status: "miss",
    projection_status: "raw-read-uninstrumented",
    projection_path: ""
  };
}

function dashboardMetricsNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

async function readDashboardMetricsComponent<T>(
  input: AdminDashboardMetricsInput<unknown>,
  component: Omit<AdminRuntimeComponentTiming, "duration_ms">,
  read: () => Promise<T>
): Promise<T> {
  const nowMs = input.runtime_now_ms ?? dashboardMetricsNowMs;
  const startedAtMs = nowMs();
  try {
    return await read();
  } finally {
    input.record_component_timing?.({
      ...component,
      duration_ms: Math.max(0, Math.round(nowMs() - startedAtMs))
    });
  }
}

export function dominantAdminDashboardMetricsDataSource(
  metrics: AdminDashboardMetrics<unknown>
): AdminScanDataSource {
  const sources = Object.values(metrics.sources);
  if (sources.some((source) => source.data_source === "admin-read-model")) {
    return "admin-read-model";
  }

  return metrics.sources.usage.data_source;
}

export async function getAdminDashboardMetrics<RuntimeLoadMetrics = unknown>(
  input: AdminDashboardMetricsInput<RuntimeLoadMetrics>
): Promise<AdminDashboardMetrics<RuntimeLoadMetrics>> {
  const today = input.now.slice(0, 10);
  const timingInput = input as AdminDashboardMetricsInput<unknown>;
  const library = await readDashboardMetricsComponent(timingInput, {
    name: "library_manifest",
    data_source: "library-manifest",
    scan_mode: "no-scan",
    scan_reason: "background-metrics"
  }, () => input.read_library_manifest(input.library_root));
  const useSummaryMetrics = (library?.video_count ?? 0) > input.full_dashboard_metrics_max_manifests;
  const summaryCounts = useSummaryMetrics && library && input.read_status_summary
    ? await readDashboardMetricsComponent(timingInput, {
        name: "status_summary",
        data_source: "admin-read-model",
        scan_mode: "no-scan",
        scan_reason: "background-metrics"
      }, () => input.read_status_summary?.(input.library_root, library) ?? Promise.resolve(null))
    : null;
  const summaryMaterial = useSummaryMetrics && library && input.read_material_summary
    ? await readDashboardMetricsComponent(timingInput, {
        name: "material_summary",
        data_source: "admin-read-model",
        scan_mode: "no-scan",
        scan_reason: "background-metrics"
      }, () => input.read_material_summary?.(input.library_root, library) ?? Promise.resolve(null))
    : null;
  const summaryProduction = useSummaryMetrics && library && input.read_production_summary
    ? await readDashboardMetricsComponent(timingInput, {
        name: "production_summary",
        data_source: "admin-read-model",
        scan_mode: "no-scan",
        scan_reason: "background-metrics"
      }, () => input.read_production_summary?.(input.library_root, library, input.now) ?? Promise.resolve(null))
    : null;
  const manifests = useSummaryMetrics
    ? []
    : await readDashboardMetricsComponent(timingInput, {
        name: "manifest_scan",
        data_source: "source-video-manifest",
        scan_mode: "status-scan",
        scan_reason: "background-metrics"
      }, () => input.read_manifests(input.library_root));
  const counts = library && useSummaryMetrics ? (summaryCounts ?? library) : countByStatus(manifests);
  const currentIndexVersion = await readDashboardMetricsComponent(timingInput, {
    name: "current_index_version",
    data_source: "current-index",
    scan_mode: "no-scan",
    scan_reason: "background-metrics"
  }, () => input.read_current_index_version(input.library_root));
  const transcriptMetrics = useSummaryMetrics
    ? await readDashboardMetricsComponent(timingInput, {
        name: "transcript_metrics",
        data_source: "current-index",
        scan_mode: "no-scan",
        scan_reason: "background-metrics"
      }, () => input.read_current_index_metadata(input.library_root).then((metadata) => ({
          transcript_video_count: metadata?.source_video_count ?? counts.ready_video_count,
          character_count: 0,
          segment_count: metadata?.segment_count ?? 0
        })))
    : await readDashboardMetricsComponent(timingInput, {
        name: "transcript_metrics",
        data_source: "transcript-artifacts",
        scan_mode: "status-scan",
        scan_reason: "background-metrics"
      }, () => input.read_transcript_metrics({
          library_root: input.library_root,
          manifests
        }));
  let completedTodayCount = 0;
  let failedTodayCount = 0;
  const processDurations: number[] = [];
  let queuedOrRunningCount = 0;

  await readDashboardMetricsComponent(timingInput, {
    name: "preprocess_jobs",
    data_source: useSummaryMetrics ? "library-manifest" : "source-video-manifest",
    scan_mode: useSummaryMetrics ? "no-scan" : "status-scan",
    scan_reason: "background-metrics",
    detail: useSummaryMetrics ? "summary-mode" : "manifest-job-loop"
  }, async () => {
    for (const manifest of manifests) {
      if (manifest.preprocess_status === "queued" || manifest.preprocess_status === "processing") {
        queuedOrRunningCount += 1;
      }

      const job = await input.read_preprocess_job(input.library_root, manifest.source_video_id);
      const completedAt = job?.completed_at ?? job?.indexed_at ?? "";
      if (completedAt.startsWith(today) || (job?.indexed_at ?? "").startsWith(today)) {
        completedTodayCount += 1;
      }
      if ((job?.failed_at ?? "").startsWith(today)) {
        failedTodayCount += 1;
      }

      const startedMs = Date.parse(job?.claimed_at ?? "");
      const finishedMs = Date.parse(job?.indexed_at ?? job?.completed_at ?? "");
      if (Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs) {
        processDurations.push(finishedMs - startedMs);
      }
    }
  });
  const usageStartedAtMs = (input.runtime_now_ms ?? dashboardMetricsNowMs)();
  const usageResult = unwrapUsageMetrics(await input.read_usage_metrics(input.library_root));
  input.record_component_timing?.({
    name: "usage_metrics",
    duration_ms: Math.max(0, Math.round((input.runtime_now_ms ?? dashboardMetricsNowMs)() - usageStartedAtMs)),
    data_source: usageResult.actual_data_source,
    scan_mode: usageResult.actual_data_source === "admin-read-model" ? "no-scan" : "status-scan",
    scan_reason: "background-metrics",
    cache_status: usageResult.cache_status,
    detail: `usage_projection=${usageResult.projection_status}`
  });

  const averageVideoProcessMs = summaryProduction?.average_video_process_ms ?? (processDurations.length > 0
    ? Math.round(processDurations.reduce((total, value) => total + value, 0) / processDurations.length)
    : 0);
  if (useSummaryMetrics) {
    queuedOrRunningCount = counts.queued_video_count + counts.processing_video_count;
  }
  const estimatedQueueDoneAt = averageVideoProcessMs > 0 && queuedOrRunningCount > 0
    ? new Date(Date.parse(input.now) + queuedOrRunningCount * averageVideoProcessMs).toISOString()
    : "";
  const sources: AdminDashboardMetricsSources = {
    material: summaryMaterial
      ? dashboardMetricSource({ data_source: "admin-read-model", scan_mode: "no-scan" })
      : dashboardMetricSource({
          data_source: useSummaryMetrics ? "library-manifest" : "source-video-manifest",
          scan_mode: useSummaryMetrics ? "no-scan" : "status-scan"
        }),
    transcript: dashboardMetricSource({
      data_source: useSummaryMetrics ? "current-index" : "transcript-artifacts",
      scan_mode: useSummaryMetrics ? "no-scan" : "status-scan"
    }),
    production: summaryProduction
      ? dashboardMetricSource({ data_source: "admin-read-model", scan_mode: "no-scan" })
      : dashboardMetricSource({
          data_source: useSummaryMetrics ? "library-manifest" : "source-video-manifest",
          scan_mode: useSummaryMetrics ? "no-scan" : "status-scan"
        }),
    usage: dashboardMetricSource({
      data_source: usageResult.actual_data_source,
      scan_mode: usageResult.actual_data_source === "admin-read-model" ? "no-scan" : "status-scan"
    }),
    risk: summaryCounts
      ? dashboardMetricSource({ data_source: "admin-read-model", scan_mode: "no-scan" })
      : dashboardMetricSource({
          data_source: useSummaryMetrics ? "library-manifest" : "source-video-manifest",
          scan_mode: useSummaryMetrics ? "no-scan" : "status-scan"
        }),
    runtime_load: dashboardMetricSource({
      data_source: "runtime-telemetry",
      scan_mode: "no-scan"
    })
  };

  return {
    material: {
      video_count: counts.video_count,
      ready_video_count: counts.ready_video_count,
      total_duration_ms: summaryMaterial?.total_duration_ms ?? (useSummaryMetrics
        ? 0
        : manifests.reduce((total, manifest) => total + manifest.duration_ms, 0)),
      ready_duration_ms: summaryMaterial?.ready_duration_ms ??
        (useSummaryMetrics ? 0 : durationByStatus(manifests, "ready")),
      unprocessed_duration_ms: summaryMaterial?.unprocessed_duration_ms ??
        (useSummaryMetrics ? 0 : durationByStatus(manifests, "unprocessed")),
      total_size_bytes: summaryMaterial?.total_size_bytes ?? (useSummaryMetrics
        ? 0
        : manifests.reduce((total, manifest) => total + manifest.file_size, 0))
    },
    transcript: {
      transcript_video_count: transcriptMetrics.transcript_video_count,
      character_count: transcriptMetrics.character_count,
      segment_count: transcriptMetrics.segment_count,
      current_index_version: currentIndexVersion
    },
    production: {
      completed_today_count: summaryProduction?.completed_today_count ?? completedTodayCount,
      failed_today_count: summaryProduction?.failed_today_count ?? failedTodayCount,
      average_video_process_ms: averageVideoProcessMs,
      estimated_queue_done_at: estimatedQueueDoneAt
    },
    usage: usageResult.metrics,
    risk: {
      failed_video_count: counts.failed_video_count,
      index_required_video_count: counts.index_required_video_count
    },
    runtime_load: await readDashboardMetricsComponent(timingInput, {
      name: "runtime_load",
      data_source: "runtime-telemetry",
      scan_mode: "no-scan",
      scan_reason: "background-metrics"
    }, () => input.read_runtime_load_metrics()),
    sources
  };
}
