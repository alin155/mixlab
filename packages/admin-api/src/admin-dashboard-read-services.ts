import type { UsageMetrics } from "../../library-fs/src/index.ts";
import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import type { AdminDashboardMetricsRuntimeResult } from "./admin-dashboard-metrics-cache.ts";
import {
  createAdminDashboardReadFacade,
  type AdminDashboardReadApiInput,
  type AdminDashboardRuntimeLoadMetrics
} from "./admin-dashboard-read-facade.ts";
import type {
  AdminDashboardIndexMetadata,
  AdminDashboardMaterialSummary,
  AdminDashboardPreprocessJob,
  AdminDashboardProductionSummary
} from "./admin-dashboard-metrics-query.ts";
import {
  getAdminLibraryStatus,
  type AdminLibraryStatusManifest
} from "./admin-library-status-query.ts";
import type { AdminTranscriptSummary } from "./admin-transcript-metrics-query.ts";
import type { AdminUsageMetricsRuntimeResult } from "./admin-usage-metrics-query.ts";

export interface AdminDashboardReadServicesApiInput extends AdminDashboardReadApiInput {
  library_id?: string;
  library_name?: string;
}

export interface AdminDashboardReadModelStatus {
  freshness: string;
  video_count: number;
  counts_by_status: Record<PreprocessStatus, number>;
}

export interface CreateAdminDashboardReadServicesInput<
  RuntimeLoadMetrics = AdminDashboardRuntimeLoadMetrics
> {
  full_transcript_metrics_max_manifests: number;
  full_dashboard_metrics_max_manifests: number;
  read_library_manifest(libraryRoot: string): Promise<AdminLibraryStatusManifest | null>;
  read_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
  mixlab_library_path(libraryRoot: string): string;
  read_status_read_model_store(input: {
    library_root: string;
    library: LibraryCounts;
  }): Promise<AdminDashboardReadModelStatus>;
  refresh_status_read_model_in_background(libraryRoot: string): void;
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
  read_runtime_load_metrics?(input: AdminDashboardReadApiInput): Promise<RuntimeLoadMetrics>;
  disk_usage?(libraryRoot: string): Promise<{ total: number; available: number }>;
}

export interface AdminDashboardReadServices<
  TApiInput extends AdminDashboardReadServicesApiInput,
  RuntimeLoadMetrics = AdminDashboardRuntimeLoadMetrics
> {
  read_library_status(input: TApiInput): ReturnType<typeof getAdminLibraryStatus>;
  read_runtime_load_metrics(input: TApiInput): Promise<RuntimeLoadMetrics>;
  read_dashboard_metrics(input: TApiInput): Promise<AdminDashboardMetricsRuntimeResult<RuntimeLoadMetrics>>;
  clear_dashboard_metrics_cache(libraryRoot?: string): void;
}

export function createAdminDashboardReadServices<
  TApiInput extends AdminDashboardReadServicesApiInput,
  RuntimeLoadMetrics = AdminDashboardRuntimeLoadMetrics
>(
  input: CreateAdminDashboardReadServicesInput<RuntimeLoadMetrics>
): AdminDashboardReadServices<TApiInput, RuntimeLoadMetrics> {
  const dashboardReadFacade = createAdminDashboardReadFacade<RuntimeLoadMetrics>({
    full_transcript_metrics_max_manifests: input.full_transcript_metrics_max_manifests,
    full_dashboard_metrics_max_manifests: input.full_dashboard_metrics_max_manifests,
    read_library_manifest: input.read_library_manifest,
    async read_status_summary(libraryRoot, library) {
      const status = await input.read_status_read_model_store({
        library_root: libraryRoot,
        library
      });
      if (status.freshness !== "fresh") {
        return null;
      }
      return {
        video_count: status.video_count,
        ready_video_count: status.counts_by_status.ready,
        processing_video_count: status.counts_by_status.processing,
        queued_video_count: status.counts_by_status.queued,
        unprocessed_video_count: status.counts_by_status.unprocessed,
        failed_video_count: status.counts_by_status.failed,
        index_required_video_count: status.counts_by_status["index-required"]
      };
    },
    read_material_summary: input.read_material_summary,
    read_production_summary: input.read_production_summary,
    read_manifests: input.read_manifests,
    read_current_index_version: input.read_current_index_version,
    read_current_index_metadata: input.read_current_index_metadata,
    read_transcript_summary: input.read_transcript_summary,
    read_preprocess_job: input.read_preprocess_job,
    read_usage_metrics: input.read_usage_metrics,
    read_usage_metrics_with_runtime: input.read_usage_metrics_with_runtime,
    read_runtime_load_metrics: input.read_runtime_load_metrics
  });

  return {
    read_library_status(apiInput) {
      return getAdminLibraryStatus({
        library_root: apiInput.library_root,
        library_id: apiInput.library_id,
        library_name: apiInput.library_name,
        now: apiInput.now,
        deps: {
          read_library_manifest: input.read_library_manifest,
          read_source_video_manifests: input.read_source_video_manifests,
          read_current_index_version: input.read_current_index_version,
          read_primary_source_videos_path: input.read_primary_source_videos_path,
          mixlab_library_path: input.mixlab_library_path,
          disk_usage: input.disk_usage,
          on_non_ready_counts_from_manifest(libraryRoot) {
            input.refresh_status_read_model_in_background(libraryRoot);
          }
        }
      });
    },
    read_runtime_load_metrics(apiInput) {
      return dashboardReadFacade.read_runtime_load_metrics({
        library_root: apiInput.library_root,
        env: apiInput.env ?? process.env,
        now: apiInput.now
      });
    },
    read_dashboard_metrics(apiInput) {
      return dashboardReadFacade.read_dashboard_metrics({
        library_root: apiInput.library_root,
        env: apiInput.env ?? process.env,
        now: apiInput.now
      });
    },
    clear_dashboard_metrics_cache: dashboardReadFacade.clear_dashboard_metrics_cache
  };
}
