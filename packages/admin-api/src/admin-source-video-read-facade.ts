import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import type {
  AdminReadModelStorePreprocessJobSnapshot,
  AdminReadModelStoreWriteThroughResult
} from "./admin-read-model-store.ts";
import type {
  AdminRuntimeCacheStatus,
  AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import type { AdminScanDataSource } from "./admin-scan-modes.ts";
import type { AdminSourceVideoManifestReader } from "./admin-source-video-manifest-cache.ts";
import {
  listAdminSourceVideoDefaultPage
} from "./admin-source-video-default-page-query.ts";
import {
  listAdminSourceVideoFilteredPage
} from "./admin-source-video-filtered-page-query.ts";
import {
  readIndexedAdminSourceVideoIdSet,
  readIndexedAdminSourceVideoManifestMapByIds,
  readIndexedAdminSourceVideoManifests
} from "./admin-source-video-index-query.ts";
import {
  listAdminSourceVideoManifests
} from "./admin-source-video-list-query.ts";
import type {
  AdminSourceVideoStatusReadModel
} from "./admin-source-video-read-model.ts";
import {
  preprocessJobSourceVideoIdsFromStatusReadModel
} from "./admin-source-video-read-model.ts";
import {
  listAdminSourceVideoStatusesPageWithRuntimeMeta,
  listAdminSourceVideoStatusPageWithRuntimeMeta,
  type AdminSourceVideoManifestFallbackPolicy,
  type AdminSourceVideoStatusPageResult,
  type AdminSourceVideoStorePageRead
} from "./admin-source-video-status-page-query.ts";

export interface AdminSourceVideoReadFacadeInput {
  manifest_read_concurrency: number;
  manifest_cache_ttl_ms: number;
  filtered_scan_batch_size: number;
  filtered_query_scan_batch_limit: number;
  source_video_page_scan_ahead: number;
  source_video_route_default_limit: number;
  manifest_reader: AdminSourceVideoManifestReader;
  status_read_model_runtime: {
    read(libraryRoot: string): Promise<AdminSourceVideoStatusReadModel>;
    refresh_in_background(libraryRoot: string): void;
    clear(libraryRoot: string): Promise<void>;
  };
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  source_transcript_index_root(libraryRoot: string): string;
  read_status_page_from_store(input: {
    library_root: string;
    library: LibraryCounts | null;
    status: PreprocessStatus;
    offset: number;
    limit: number;
    query?: string;
  }): Promise<AdminSourceVideoStorePageRead>;
  read_statuses_page_from_store(input: {
    library_root: string;
    library: LibraryCounts | null;
    statuses: PreprocessStatus[];
    offset: number;
    limit: number;
    query?: string;
  }): Promise<AdminSourceVideoStorePageRead>;
  read_preprocess_job_manifest_page_from_store(input: {
    library_root: string;
    library: LibraryCounts | null;
    offset: number;
    limit: number;
  }): Promise<{
    manifests: SourceVideoManifest[];
    preprocess_jobs: AdminReadModelStorePreprocessJobSnapshot[];
  } | null>;
  write_source_video_manifests_to_store?(input: {
    library_root: string;
    library: LibraryCounts | null;
    manifests: SourceVideoManifest[];
  }): Promise<AdminReadModelStoreWriteThroughResult>;
}

export interface AdminSourceVideoReadFacade {
  clear_source_video_page_cache(libraryRoot: string): void;
  read_fresh_cached_source_video_manifests(libraryRoot: string): SourceVideoManifest[] | null;
  read_cached_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_sorted_source_video_ids(libraryRoot: string): Promise<string[]>;
  read_manifests_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]>;
  read_all_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<SourceVideoManifest[]>;
  read_status_read_model(libraryRoot: string): Promise<AdminSourceVideoStatusReadModel>;
  refresh_status_read_model_in_background(libraryRoot: string): void;
  read_status_manifest_page(input: {
    library_root: string;
    status: PreprocessStatus;
    offset: number;
    limit: number;
    query?: string;
  }): Promise<SourceVideoManifest[]>;
  read_statuses_manifest_page(input: {
    library_root: string;
    statuses: PreprocessStatus[];
    offset: number;
    limit: number;
    query?: string;
  }): Promise<SourceVideoManifest[]>;
  read_preprocess_job_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<SourceVideoManifest[]>;
  read_preprocess_job_manifest_page_with_runtime_meta(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<{
    manifests: SourceVideoManifest[];
    preprocess_jobs: AdminReadModelStorePreprocessJobSnapshot[];
    actual_data_source: AdminScanDataSource;
    cache_status: AdminRuntimeCacheStatus;
  }>;
  read_filtered_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
    query?: string;
    status?: PreprocessStatus;
    exclude_indexed_ready?: boolean;
    max_scan_batches?: number;
  }): Promise<SourceVideoManifest[]>;
  read_source_video_list(input: {
    library_root: string;
    offset: number;
    limit: number;
    query?: string;
    status?: PreprocessStatus;
    disable_store_repair?: boolean;
    manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  }): Promise<SourceVideoManifest[]>;
  read_source_video_list_with_runtime_meta(input: {
    library_root: string;
    offset: number;
    limit: number;
    query?: string;
    status?: PreprocessStatus;
    disable_store_repair?: boolean;
    manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  }): Promise<{
    manifests: SourceVideoManifest[];
    actual_data_source: AdminScanDataSource;
    cache_status: AdminRuntimeCacheStatus;
    fallback_reason: string;
    component_timings?: AdminRuntimeComponentTiming[];
    repair_reason?: string;
  }>;
}

export function createAdminSourceVideoReadFacade(
  input: AdminSourceVideoReadFacadeInput
): AdminSourceVideoReadFacade {
  const statusStoreRepairMaxIds = 100;
  const repairedMissingManifestRowsReason = "status-store:repaired-incomplete-manifest-rows";

  function clear_source_video_page_cache(libraryRoot: string): void {
    input.manifest_reader.clear_library(libraryRoot);
    void input.status_read_model_runtime.clear(libraryRoot).catch(() => {
      // Generated read-model cleanup is best-effort; freshness checks protect stale files.
    });
  }

  function read_fresh_cached_source_video_manifests(libraryRoot: string): SourceVideoManifest[] | null {
    return input.manifest_reader.read_fresh_cached_manifests(libraryRoot);
  }

  async function read_cached_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
    return input.manifest_reader.read_cached_manifests(libraryRoot);
  }

  async function read_sorted_source_video_ids(libraryRoot: string): Promise<string[]> {
    return input.manifest_reader.read_sorted_source_video_ids(libraryRoot);
  }

  async function read_manifests_by_ids(readerInput: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]> {
    return input.manifest_reader.read_manifests_by_ids(readerInput);
  }

  async function read_all_manifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
    return input.manifest_reader.read_all_manifests(libraryRoot);
  }

  async function read_manifest_page(readerInput: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<SourceVideoManifest[]> {
    return input.manifest_reader.read_manifest_page(readerInput);
  }

  async function read_status_read_model(libraryRoot: string): Promise<AdminSourceVideoStatusReadModel> {
    return input.status_read_model_runtime.read(libraryRoot);
  }

  function refresh_status_read_model_in_background(libraryRoot: string): void {
    input.status_read_model_runtime.refresh_in_background(libraryRoot);
  }

  function missingStoreManifestIds(result: AdminSourceVideoStorePageRead): string[] {
    if (!result || !("page" in result) || result.page || result.miss_reason !== "incomplete-manifest-rows") {
      return [];
    }
    const ids = Array.isArray(result.missing_source_video_ids)
      ? result.missing_source_video_ids
      : [];
    return Array.from(new Set(ids.filter((id) => typeof id === "string" && id.trim())))
      .slice(0, statusStoreRepairMaxIds);
  }

  async function repairMissingStoreManifests(inputForRepair: {
    library_root: string;
    library: LibraryCounts | null;
    missing_source_video_ids: string[];
  }): Promise<boolean> {
    if (!input.write_source_video_manifests_to_store || inputForRepair.missing_source_video_ids.length === 0) {
      return false;
    }
    const manifests = await read_manifests_by_ids({
      library_root: inputForRepair.library_root,
      source_video_ids: inputForRepair.missing_source_video_ids
    });
    if (manifests.length === 0) {
      return false;
    }
    const result = await input.write_source_video_manifests_to_store({
      library_root: inputForRepair.library_root,
      library: inputForRepair.library,
      manifests
    });
    return result.applied;
  }

  async function read_repairable_status_page_from_store(storeInput: {
    library_root: string;
    library: LibraryCounts | null;
    status: PreprocessStatus;
    offset: number;
    limit: number;
    query?: string;
  }): Promise<AdminSourceVideoStorePageRead> {
    const firstRead = await input.read_status_page_from_store(storeInput);
    const missingIds = missingStoreManifestIds(firstRead);
    if (!(await repairMissingStoreManifests({
      library_root: storeInput.library_root,
      library: storeInput.library,
      missing_source_video_ids: missingIds
    }))) {
      return firstRead;
    }
    const secondRead = await input.read_status_page_from_store(storeInput);
    if (secondRead && "page" in secondRead && secondRead.page) {
      return {
        ...secondRead,
        repair_reason: repairedMissingManifestRowsReason
      };
    }
    return secondRead;
  }

  async function read_repairable_statuses_page_from_store(storeInput: {
    library_root: string;
    library: LibraryCounts | null;
    statuses: PreprocessStatus[];
    offset: number;
    limit: number;
    query?: string;
  }): Promise<AdminSourceVideoStorePageRead> {
    const firstRead = await input.read_statuses_page_from_store(storeInput);
    const missingIds = missingStoreManifestIds(firstRead);
    if (!(await repairMissingStoreManifests({
      library_root: storeInput.library_root,
      library: storeInput.library,
      missing_source_video_ids: missingIds
    }))) {
      return firstRead;
    }
    const secondRead = await input.read_statuses_page_from_store(storeInput);
    if (secondRead && "page" in secondRead && secondRead.page) {
      return {
        ...secondRead,
        repair_reason: repairedMissingManifestRowsReason
      };
    }
    return secondRead;
  }

  async function read_status_manifest_page(readerInput: {
    library_root: string;
    status: PreprocessStatus;
    offset: number;
    limit: number;
    query?: string;
  }): Promise<SourceVideoManifest[]> {
    return (await read_status_manifest_page_with_runtime_meta(readerInput)).manifests;
  }

  async function read_status_manifest_page_with_runtime_meta(readerInput: {
    library_root: string;
    status: PreprocessStatus;
    offset: number;
    limit: number;
    query?: string;
    disable_store_repair?: boolean;
    manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  }): Promise<AdminSourceVideoStatusPageResult> {
    return listAdminSourceVideoStatusPageWithRuntimeMeta({
      ...readerInput,
      filtered_scan_batch_size: input.filtered_scan_batch_size,
      read_library_manifest: input.read_library_manifest,
      read_status_read_model,
      read_manifests_by_ids,
      read_status_page_from_store: readerInput.disable_store_repair
        ? input.read_status_page_from_store
        : read_repairable_status_page_from_store,
      read_statuses_page_from_store: readerInput.disable_store_repair
        ? input.read_statuses_page_from_store
        : read_repairable_statuses_page_from_store
    });
  }

  async function read_statuses_manifest_page(readerInput: {
    library_root: string;
    statuses: PreprocessStatus[];
    offset: number;
    limit: number;
    query?: string;
  }): Promise<SourceVideoManifest[]> {
    return (await read_statuses_manifest_page_with_runtime_meta(readerInput)).manifests;
  }

  async function read_statuses_manifest_page_with_runtime_meta(readerInput: {
    library_root: string;
    statuses: PreprocessStatus[];
    offset: number;
    limit: number;
    query?: string;
    disable_store_repair?: boolean;
    manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  }): Promise<AdminSourceVideoStatusPageResult> {
    return listAdminSourceVideoStatusesPageWithRuntimeMeta({
      ...readerInput,
      filtered_scan_batch_size: input.filtered_scan_batch_size,
      read_library_manifest: input.read_library_manifest,
      read_status_read_model,
      read_manifests_by_ids,
      read_statuses_page_from_store: readerInput.disable_store_repair
        ? input.read_statuses_page_from_store
        : read_repairable_statuses_page_from_store
    });
  }

  async function read_preprocess_job_manifest_page(readerInput: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<SourceVideoManifest[]> {
    return (await read_preprocess_job_manifest_page_with_runtime_meta(readerInput)).manifests;
  }

  async function read_preprocess_job_manifest_page_with_runtime_meta(readerInput: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<{
    manifests: SourceVideoManifest[];
    preprocess_jobs: AdminReadModelStorePreprocessJobSnapshot[];
    actual_data_source: AdminScanDataSource;
    cache_status: AdminRuntimeCacheStatus;
  }> {
    const library = await input.read_library_manifest(readerInput.library_root);
    const storePage = await input.read_preprocess_job_manifest_page_from_store({
      library_root: readerInput.library_root,
      library,
      offset: readerInput.offset,
      limit: readerInput.limit
    });
    if (storePage) {
      return {
        manifests: storePage.manifests,
        preprocess_jobs: storePage.preprocess_jobs,
        actual_data_source: "admin-read-model",
        cache_status: "hit"
      };
    }

    const model = await read_status_read_model(readerInput.library_root);
    const sourceVideoIds = preprocessJobSourceVideoIdsFromStatusReadModel(model)
      .slice(readerInput.offset, readerInput.offset + readerInput.limit);

    return {
      manifests: await read_manifests_by_ids({
        library_root: readerInput.library_root,
        source_video_ids: sourceVideoIds
      }),
      preprocess_jobs: [],
      actual_data_source: "admin-read-model",
      cache_status: "miss"
    };
  }

  async function read_filtered_manifest_page(readerInput: {
    library_root: string;
    offset: number;
    limit: number;
    query?: string;
    status?: PreprocessStatus;
    exclude_indexed_ready?: boolean;
    max_scan_batches?: number;
  }): Promise<SourceVideoManifest[]> {
    return listAdminSourceVideoFilteredPage({
      ...readerInput,
      filtered_scan_batch_size: input.filtered_scan_batch_size,
      read_all_manifests: read_cached_source_video_manifests,
      read_library_manifest: input.read_library_manifest,
      read_sorted_source_video_ids,
      read_indexed_ready_id_set(libraryRoot) {
        return readIndexedAdminSourceVideoIdSet({
          library_root: libraryRoot,
          read_current_index_version: input.read_current_index_version,
          index_root_from_library_root: input.source_transcript_index_root
        });
      },
      read_manifests_by_ids
    });
  }

  async function read_source_video_list(readerInput: {
    library_root: string;
    offset: number;
    limit: number;
    query?: string;
    status?: PreprocessStatus;
    disable_store_repair?: boolean;
    manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  }): Promise<SourceVideoManifest[]> {
    return (await read_source_video_list_with_runtime_meta(readerInput)).manifests;
  }

  async function read_source_video_list_with_runtime_meta(readerInput: {
    library_root: string;
    offset: number;
    limit: number;
    query?: string;
    status?: PreprocessStatus;
    disable_store_repair?: boolean;
    manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  }): Promise<{
    manifests: SourceVideoManifest[];
    actual_data_source: AdminScanDataSource;
    cache_status: AdminRuntimeCacheStatus;
    fallback_reason: string;
    component_timings?: AdminRuntimeComponentTiming[];
  }> {
    let actualDataSource: AdminScanDataSource = "admin-read-model";
    let cacheStatus: AdminRuntimeCacheStatus = "unknown";
    let fallbackReason = "";
    let repairReason = "";
    let componentTimings: AdminRuntimeComponentTiming[] | undefined;
    const markRuntimeSource = (
      source: AdminScanDataSource,
      cache: AdminRuntimeCacheStatus,
      reason = "",
      repair = ""
    ): void => {
      actualDataSource = source;
      cacheStatus = cache;
      fallbackReason = reason;
      repairReason = repair;
    };

    const manifests = await listAdminSourceVideoManifests({
      offset: readerInput.offset,
      limit: readerInput.limit,
      query: readerInput.query,
      status: readerInput.status,
      filtered_query_scan_batch_limit: input.filtered_query_scan_batch_limit,
      read_default_page(defaultPageInput) {
        markRuntimeSource("admin-read-model", "unknown");
        return listAdminSourceVideoDefaultPage({
          library_root: readerInput.library_root,
          ...defaultPageInput,
          route_default_limit: input.source_video_route_default_limit,
          page_scan_ahead: input.source_video_page_scan_ahead,
          manifest_read_concurrency: input.manifest_read_concurrency,
          cache_ttl_ms: input.manifest_cache_ttl_ms,
          read_status_read_model,
          read_library_manifest: input.read_library_manifest,
          read_indexed_manifest_map_by_ids(indexInput) {
            return readIndexedAdminSourceVideoManifestMapByIds({
              ...indexInput,
              read_current_index_version: input.read_current_index_version,
              index_root_from_library_root: input.source_transcript_index_root
            });
          },
          read_manifests_by_ids,
          read_manifest_page
        });
      },
      read_all_manifests() {
        markRuntimeSource("source-video-manifest", "miss");
        return read_cached_source_video_manifests(readerInput.library_root);
      },
      read_fresh_cached_manifests() {
        const cached = read_fresh_cached_source_video_manifests(readerInput.library_root);
        if (cached) {
          markRuntimeSource("source-video-manifest", "hit");
        }
        return cached;
      },
      read_indexed_ready_page(indexInput) {
        markRuntimeSource("current-index", "not-applicable");
        return readIndexedAdminSourceVideoManifests({
          library_root: readerInput.library_root,
          ...indexInput,
          read_current_index_version: input.read_current_index_version,
          index_root_from_library_root: input.source_transcript_index_root
        });
      },
      read_status_page(statusInput) {
        return read_status_manifest_page_with_runtime_meta({
          library_root: readerInput.library_root,
          disable_store_repair: readerInput.disable_store_repair,
          manifest_fallback_policy: readerInput.manifest_fallback_policy,
          ...statusInput
        }).then((result) => {
          markRuntimeSource(
            result.actual_data_source,
            result.cache_status,
            result.fallback_reason,
            result.repair_reason
          );
          componentTimings = result.component_timings;
          return result.manifests;
        });
      },
      read_statuses_page(statusInput) {
        return read_statuses_manifest_page_with_runtime_meta({
          library_root: readerInput.library_root,
          disable_store_repair: readerInput.disable_store_repair,
          manifest_fallback_policy: readerInput.manifest_fallback_policy,
          ...statusInput
        }).then((result) => {
          markRuntimeSource(
            result.actual_data_source,
            result.cache_status,
            result.fallback_reason,
            result.repair_reason
          );
          componentTimings = result.component_timings;
          return result.manifests;
        });
      },
      read_filtered_page(filteredInput) {
        markRuntimeSource("source-video-manifest", "miss");
        return read_filtered_manifest_page({
          library_root: readerInput.library_root,
          ...filteredInput
        });
      }
    });

    return {
      manifests,
      actual_data_source: actualDataSource,
      cache_status: cacheStatus,
      fallback_reason: fallbackReason,
      ...(componentTimings ? { component_timings: componentTimings } : {}),
      ...(repairReason ? { repair_reason: repairReason } : {})
    };
  }

  return {
    clear_source_video_page_cache,
    read_fresh_cached_source_video_manifests,
    read_cached_source_video_manifests,
    read_sorted_source_video_ids,
    read_manifests_by_ids,
    read_all_manifests,
    read_manifest_page,
    read_status_read_model,
    refresh_status_read_model_in_background,
    read_status_manifest_page,
    read_statuses_manifest_page,
    read_preprocess_job_manifest_page,
    read_preprocess_job_manifest_page_with_runtime_meta,
    read_filtered_manifest_page,
    read_source_video_list,
    read_source_video_list_with_runtime_meta
  };
}
