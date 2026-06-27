import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  adminRuntimeNowMs,
  type AdminRuntimeCacheStatus,
  type AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import {
  listAdminPreprocessJobs,
  type AdminPreprocessJobRecord,
  type AdminPreprocessJobsResponse,
  type AdminPreprocessJobsRuntimeLoad
} from "./admin-preprocess-jobs-query.ts";

export interface AdminPreprocessJobsReadApiInput {
  library_root: string;
  now?: () => string;
}

export interface AdminPreprocessJobsReadOptions {
  limit?: number;
  offset?: number;
}

export interface AdminPreprocessJobSnapshot {
  source_video_id: string;
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  failed_at?: string;
}

export interface AdminPreprocessJobManifestPage {
  manifests: SourceVideoManifest[];
  preprocess_jobs: AdminPreprocessJobSnapshot[];
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
}

export interface AdminPreprocessJobsReadDeps {
  read_concurrent_job_count(libraryRoot: string): Promise<number>;
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_preprocess_job_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<AdminPreprocessJobManifestPage>;
  read_all_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_preprocess_job(libraryRoot: string, sourceVideoId: string): Promise<AdminPreprocessJobRecord | null>;
  read_runtime_load(input: AdminPreprocessJobsReadApiInput): Promise<AdminPreprocessJobsRuntimeLoad>;
}

function componentDurationMs(startedAtMs: number, finishedAtMs = adminRuntimeNowMs()): number {
  return Math.max(0, finishedAtMs - startedAtMs);
}

function componentDetail(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
}

export async function listAdminPreprocessJobsWithRuntimeMeta(input: {
  api_input: AdminPreprocessJobsReadApiInput;
  options?: AdminPreprocessJobsReadOptions;
  deps: AdminPreprocessJobsReadDeps;
}): Promise<{
  jobs: AdminPreprocessJobsResponse;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  component_timings: AdminRuntimeComponentTiming[];
}> {
  const options = input.options ?? {};
  const libraryRoot = input.api_input.library_root;
  const now = input.api_input.now?.() ?? new Date().toISOString();
  const componentTimings: AdminRuntimeComponentTiming[] = [];

  const concurrencyStartedAtMs = adminRuntimeNowMs();
  const concurrency = Math.max(1, await input.deps.read_concurrent_job_count(libraryRoot));
  componentTimings.push({
    name: "concurrency_policy",
    duration_ms: componentDurationMs(concurrencyStartedAtMs),
    data_source: "admin-settings",
    scan_mode: "no-scan",
    scan_reason: "settings-route",
    cache_status: "not-applicable",
    detail: componentDetail({ concurrency })
  });

  let library: LibraryCounts | null = null;
  if (options.limit) {
    const libraryStartedAtMs = adminRuntimeNowMs();
    library = await input.deps.read_library_manifest(libraryRoot);
    componentTimings.push({
      name: "library_counts",
      duration_ms: componentDurationMs(libraryStartedAtMs),
      data_source: "library-manifest",
      scan_mode: "no-scan",
      scan_reason: "shell-summary",
      cache_status: "not-applicable",
      detail: componentDetail({
        video_count: library?.video_count,
        ready: library?.ready_video_count,
        queued: library?.queued_video_count,
        processing: library?.processing_video_count,
        failed: library?.failed_video_count,
        index_required: library?.index_required_video_count
      })
    });
  }

  let page: AdminPreprocessJobManifestPage;
  if (options.limit) {
    const pageStartedAtMs = adminRuntimeNowMs();
    page = await input.deps.read_preprocess_job_manifest_page({
        library_root: libraryRoot,
        offset: options.offset ?? 0,
        limit: options.limit
      });
    componentTimings.push({
      name: "preprocess_job_page",
      duration_ms: componentDurationMs(pageStartedAtMs),
      data_source: page.actual_data_source,
      scan_mode: "paged-list",
      scan_reason: "route-owned-page",
      cache_status: page.cache_status,
      detail: componentDetail({
        offset: options.offset ?? 0,
        limit: options.limit,
        manifests: page.manifests.length,
        snapshots: page.preprocess_jobs.length
      })
    });
  } else {
    const manifestsStartedAtMs = adminRuntimeNowMs();
    const manifests = await input.deps.read_all_source_video_manifests(libraryRoot);
    page = {
      manifests,
      preprocess_jobs: [],
      actual_data_source: "source-video-manifest",
      cache_status: "unknown"
    };
    componentTimings.push({
      name: "manifest_fallback",
      duration_ms: componentDurationMs(manifestsStartedAtMs),
      data_source: "source-video-manifest",
      scan_mode: "status-scan",
      scan_reason: "route-owned-page",
      cache_status: "unknown",
      detail: componentDetail({ manifests: manifests.length })
    });
  }

  const manifestById = new Map(page.manifests.map((manifest) => [manifest.source_video_id, manifest]));
  const jobSnapshotById = new Map(page.preprocess_jobs.map((job) => [job.source_video_id, job]));
  let jobRecordReadCount = 0;
  let jobRecordStartedAtMs: number | null = null;
  let jobRecordFinishedAtMs: number | null = null;
  let runtimeLoadTiming: AdminRuntimeComponentTiming | null = null;
  const jobs = await listAdminPreprocessJobs({
    now,
    concurrency,
    manifests: page.manifests,
    library_counts: library,
    async read_preprocess_job(sourceVideoId) {
      const manifest = manifestById.get(sourceVideoId);
      const snapshot = jobSnapshotById.get(sourceVideoId);
      if (manifest?.preprocess_status === "ready" && snapshot) {
        return Promise.resolve({
          source_video_id: sourceVideoId,
          status: "ready",
          attempt: 0,
          claimed_at: snapshot.claimed_at,
          completed_at: snapshot.completed_at,
          indexed_at: snapshot.indexed_at,
          failed_at: snapshot.failed_at
        });
      }

      const startedAtMs = adminRuntimeNowMs();
      jobRecordReadCount += 1;
      jobRecordStartedAtMs = jobRecordStartedAtMs === null
        ? startedAtMs
        : Math.min(jobRecordStartedAtMs, startedAtMs);

      try {
        return await input.deps.read_preprocess_job(libraryRoot, sourceVideoId);
      } finally {
        jobRecordFinishedAtMs = Math.max(jobRecordFinishedAtMs ?? startedAtMs, adminRuntimeNowMs());
      }
    },
    async read_runtime_load() {
      const runtimeLoadStartedAtMs = adminRuntimeNowMs();
      const load = await input.deps.read_runtime_load(input.api_input);
      runtimeLoadTiming = {
        name: "runtime_load",
        duration_ms: componentDurationMs(runtimeLoadStartedAtMs),
        data_source: "runtime-telemetry",
        scan_mode: "no-scan",
        scan_reason: "route-owned-page",
        cache_status: "not-applicable",
        detail: componentDetail({ status: load.overall_status })
      };
      return load;
    }
  });

  if (jobRecordReadCount > 0 && jobRecordStartedAtMs !== null && jobRecordFinishedAtMs !== null) {
    componentTimings.push({
      name: "job_record_supplement",
      duration_ms: componentDurationMs(jobRecordStartedAtMs, jobRecordFinishedAtMs),
      data_source: "source-video-manifest",
      scan_mode: "single-id",
      scan_reason: "selected-record",
      cache_status: "not-applicable",
      detail: componentDetail({ reads: jobRecordReadCount })
    });
  }

  if (runtimeLoadTiming) {
    componentTimings.push(runtimeLoadTiming);
  }

  return {
    jobs,
    actual_data_source: page.actual_data_source,
    cache_status: page.cache_status,
    component_timings: componentTimings
  };
}
