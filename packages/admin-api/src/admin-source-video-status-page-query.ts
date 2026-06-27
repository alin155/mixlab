import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import { adminSourceVideoMatchesListFilter } from "./admin-source-video-query.ts";
import type {
  AdminSourceVideoStatusReadModel
} from "./admin-source-video-read-model.ts";
import {
  adminRuntimeNowMs,
  type AdminRuntimeCacheStatus,
  type AdminRuntimeComponentTiming
} from "./admin-runtime-observability.ts";
import type { AdminScanDataSource } from "./admin-scan-modes.ts";

export type AdminSourceVideoStatusPageLibrary = LibraryCounts & {
  updated_at?: string;
};

export interface AdminSourceVideoStorePage {
  manifests: SourceVideoManifest[];
}

export interface AdminSourceVideoStorePageReadResult {
  page: AdminSourceVideoStorePage | null;
  miss_reason?: string;
  missing_source_video_ids?: string[];
  repair_reason?: string;
}

export type AdminSourceVideoStorePageRead =
  | AdminSourceVideoStorePage
  | AdminSourceVideoStorePageReadResult
  | null;

export interface AdminSourceVideoStatusPageRuntimeMeta {
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  fallback_reason: string;
  repair_reason?: string;
  component_timings?: AdminRuntimeComponentTiming[];
}

export type AdminSourceVideoManifestFallbackPolicy = "allow" | "forbid";

export interface AdminSourceVideoStatusPageResult extends AdminSourceVideoStatusPageRuntimeMeta {
  manifests: SourceVideoManifest[];
}

export interface AdminSourceVideoStatusPageQueryInput {
  library_root: string;
  status: PreprocessStatus;
  offset: number;
  limit: number;
  query?: string;
  manifest_fallback_policy?: AdminSourceVideoManifestFallbackPolicy;
  filtered_scan_batch_size: number;
  read_library_manifest(libraryRoot: string): Promise<AdminSourceVideoStatusPageLibrary | null>;
  read_status_page_from_store(input: {
    library_root: string;
    library: AdminSourceVideoStatusPageLibrary | null;
    status: PreprocessStatus;
    offset: number;
    limit: number;
    query?: string;
  }): Promise<AdminSourceVideoStorePageRead>;
  read_statuses_page_from_store(input: {
    library_root: string;
    library: AdminSourceVideoStatusPageLibrary | null;
    statuses: PreprocessStatus[];
    offset: number;
    limit: number;
    query?: string;
  }): Promise<AdminSourceVideoStorePageRead>;
  read_status_read_model(libraryRoot: string): Promise<AdminSourceVideoStatusReadModel>;
  read_manifests_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]>;
}

export interface AdminSourceVideoStatusesPageQueryInput extends Omit<
  AdminSourceVideoStatusPageQueryInput,
  "status" | "read_status_page_from_store"
> {
  statuses: PreprocessStatus[];
}

function normalizeStorePageReadResult(
  result: AdminSourceVideoStorePageRead
): {
  page: AdminSourceVideoStorePage | null;
  miss_reason: string;
  repair_reason: string;
} {
  if (!result) {
    return {
      page: null,
      miss_reason: "status-store:miss",
      repair_reason: ""
    };
  }

  if ("page" in result) {
    return {
      page: result.page,
      miss_reason: result.page ? "" : `status-store:${result.miss_reason || "miss"}`,
      repair_reason: result.repair_reason ?? ""
    };
  }

  return {
    page: result,
    miss_reason: "",
    repair_reason: ""
  };
}

function componentDurationMs(startedAtMs: number): number {
  return Math.max(0, adminRuntimeNowMs() - startedAtMs);
}

function componentDetail(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(";");
}

function shouldForbidManifestFallback(policy: AdminSourceVideoManifestFallbackPolicy | undefined): boolean {
  return policy === "forbid";
}

function manifestFallbackBlockedResult(input: {
  component_timings: AdminRuntimeComponentTiming[];
  store_miss_reason: string;
  status_detail: string;
}): AdminSourceVideoStatusPageResult {
  input.component_timings.push({
    name: "manifest_fallback_policy",
    duration_ms: 0,
    data_source: "admin-read-model",
    scan_mode: "no-scan",
    scan_reason: "route-owned-page",
    cache_status: "miss",
    detail: componentDetail({
      policy: "forbid",
      store_miss: input.store_miss_reason,
      status: input.status_detail
    })
  });

  return {
    manifests: [],
    actual_data_source: "admin-read-model",
    cache_status: "miss",
    fallback_reason: "manifest-fallback:forbidden",
    component_timings: input.component_timings
  };
}

async function readSourceVideoIdsFilteredManifestPage(input: {
  library_root: string;
  source_video_ids: string[];
  offset: number;
  limit: number;
  query?: string;
  filtered_scan_batch_size: number;
  read_manifests_by_ids(readerInput: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]>;
}): Promise<SourceVideoManifest[]> {
  const normalizedQuery = input.query?.trim() ?? "";

  if (!normalizedQuery) {
    const pageIds = input.limit > 0
      ? input.source_video_ids.slice(input.offset, input.offset + input.limit)
      : input.source_video_ids;

    return input.read_manifests_by_ids({
      library_root: input.library_root,
      source_video_ids: pageIds
    });
  }

  const requestedEnd = input.limit > 0 ? input.offset + input.limit : Number.POSITIVE_INFINITY;
  const matched: SourceVideoManifest[] = [];
  const batchSize = Math.max(1, input.filtered_scan_batch_size);

  for (
    let start = 0;
    start < input.source_video_ids.length && matched.length < requestedEnd;
    start += batchSize
  ) {
    const manifests = await input.read_manifests_by_ids({
      library_root: input.library_root,
      source_video_ids: input.source_video_ids.slice(start, start + batchSize)
    });

    for (const manifest of manifests) {
      if (adminSourceVideoMatchesListFilter(manifest, {
        query: normalizedQuery
      })) {
        matched.push(manifest);
      }
    }
  }

  return input.limit > 0
    ? matched.slice(input.offset, requestedEnd)
    : matched;
}

export async function listAdminSourceVideoStatusPage(
  input: AdminSourceVideoStatusPageQueryInput
): Promise<SourceVideoManifest[]> {
  return (await listAdminSourceVideoStatusPageWithRuntimeMeta(input)).manifests;
}

export async function listAdminSourceVideoStatusPageWithRuntimeMeta(
  input: AdminSourceVideoStatusPageQueryInput
): Promise<AdminSourceVideoStatusPageResult> {
  const componentTimings: AdminRuntimeComponentTiming[] = [];
  const libraryStartedAtMs = adminRuntimeNowMs();
  const library = await input.read_library_manifest(input.library_root);
  componentTimings.push({
    name: "library_counts",
    duration_ms: componentDurationMs(libraryStartedAtMs),
    data_source: "library-manifest",
    scan_mode: "no-scan",
    scan_reason: "shell-summary",
    cache_status: "not-applicable",
    detail: componentDetail({
      video_count: library?.video_count,
      status: input.status,
      offset: input.offset,
      limit: input.limit
    })
  });

  const storeStartedAtMs = adminRuntimeNowMs();
  const storeRead = normalizeStorePageReadResult(await input.read_status_page_from_store({
    library_root: input.library_root,
    library,
    status: input.status,
    offset: input.offset,
    limit: input.limit,
    query: input.query
  }));
  componentTimings.push({
    name: "status_store_page",
    duration_ms: componentDurationMs(storeStartedAtMs),
    data_source: "admin-read-model",
    scan_mode: "paged-list",
    scan_reason: "route-owned-page",
    cache_status: storeRead.page ? "hit" : "miss",
    detail: componentDetail({
      status: input.status,
      offset: input.offset,
      limit: input.limit,
      manifests: storeRead.page?.manifests.length ?? 0,
      miss: storeRead.miss_reason
    })
  });
  if (storeRead.page) {
    return {
      manifests: storeRead.page.manifests,
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      fallback_reason: "",
      ...(storeRead.repair_reason ? { repair_reason: storeRead.repair_reason } : {}),
      component_timings: componentTimings
    };
  }

  const modelStartedAtMs = adminRuntimeNowMs();
  const model = await input.read_status_read_model(input.library_root);
  componentTimings.push({
    name: "status_read_model",
    duration_ms: componentDurationMs(modelStartedAtMs),
    data_source: "admin-read-model",
    scan_mode: "status-scan",
    scan_reason: "route-owned-page",
    cache_status: "unknown",
    detail: componentDetail({
      status: input.status,
      ids: model.ids_by_status[input.status]?.length ?? 0,
      fallback: storeRead.miss_reason
    })
  });
  const manifests = model.manifests_by_status?.[input.status];

  if (manifests) {
    const filtered = input.query?.trim()
      ? manifests.filter((manifest) => adminSourceVideoMatchesListFilter(manifest, {
          query: input.query,
          status: input.status
        }))
      : manifests;

    return {
      manifests: input.limit > 0
        ? filtered.slice(input.offset, input.offset + input.limit)
        : filtered.slice(input.offset),
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      fallback_reason: storeRead.miss_reason,
      component_timings: componentTimings
    };
  }

  if (shouldForbidManifestFallback(input.manifest_fallback_policy)) {
    return manifestFallbackBlockedResult({
      component_timings: componentTimings,
      store_miss_reason: storeRead.miss_reason,
      status_detail: input.status
    });
  }

  const idsStartedAtMs = adminRuntimeNowMs();
  const idManifests = await readSourceVideoIdsFilteredManifestPage({
    library_root: input.library_root,
    source_video_ids: model.ids_by_status[input.status],
    offset: input.offset,
    limit: input.limit,
    query: input.query,
    filtered_scan_batch_size: input.filtered_scan_batch_size,
    read_manifests_by_ids: input.read_manifests_by_ids
  });
  componentTimings.push({
    name: "manifest_id_page",
    duration_ms: componentDurationMs(idsStartedAtMs),
    data_source: "source-video-manifest",
    scan_mode: "status-scan",
    scan_reason: "route-owned-page",
    cache_status: "miss",
    detail: componentDetail({
      status: input.status,
      requested_ids: model.ids_by_status[input.status]?.length ?? 0,
      manifests: idManifests.length
    })
  });

  return {
    manifests: idManifests,
    actual_data_source: "source-video-manifest",
    cache_status: "miss",
    fallback_reason: storeRead.miss_reason || "status-read-model:id-fallback",
    component_timings: componentTimings
  };
}

export async function listAdminSourceVideoStatusesPage(
  input: AdminSourceVideoStatusesPageQueryInput
): Promise<SourceVideoManifest[]> {
  return (await listAdminSourceVideoStatusesPageWithRuntimeMeta(input)).manifests;
}

export async function listAdminSourceVideoStatusesPageWithRuntimeMeta(
  input: AdminSourceVideoStatusesPageQueryInput
): Promise<AdminSourceVideoStatusPageResult> {
  const componentTimings: AdminRuntimeComponentTiming[] = [];
  const statusesDetail = input.statuses.join(",");
  const libraryStartedAtMs = adminRuntimeNowMs();
  const library = await input.read_library_manifest(input.library_root);
  componentTimings.push({
    name: "library_counts",
    duration_ms: componentDurationMs(libraryStartedAtMs),
    data_source: "library-manifest",
    scan_mode: "no-scan",
    scan_reason: "shell-summary",
    cache_status: "not-applicable",
    detail: componentDetail({
      video_count: library?.video_count,
      statuses: statusesDetail,
      offset: input.offset,
      limit: input.limit
    })
  });

  const storeStartedAtMs = adminRuntimeNowMs();
  const storeRead = normalizeStorePageReadResult(await input.read_statuses_page_from_store({
    library_root: input.library_root,
    library,
    statuses: input.statuses,
    offset: input.offset,
    limit: input.limit,
    query: input.query
  }));
  componentTimings.push({
    name: "status_store_page",
    duration_ms: componentDurationMs(storeStartedAtMs),
    data_source: "admin-read-model",
    scan_mode: "paged-list",
    scan_reason: "route-owned-page",
    cache_status: storeRead.page ? "hit" : "miss",
    detail: componentDetail({
      statuses: statusesDetail,
      offset: input.offset,
      limit: input.limit,
      manifests: storeRead.page?.manifests.length ?? 0,
      miss: storeRead.miss_reason
    })
  });
  if (storeRead.page) {
    return {
      manifests: storeRead.page.manifests,
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      fallback_reason: "",
      ...(storeRead.repair_reason ? { repair_reason: storeRead.repair_reason } : {}),
      component_timings: componentTimings
    };
  }

  const modelStartedAtMs = adminRuntimeNowMs();
  const model = await input.read_status_read_model(input.library_root);
  componentTimings.push({
    name: "status_read_model",
    duration_ms: componentDurationMs(modelStartedAtMs),
    data_source: "admin-read-model",
    scan_mode: "status-scan",
    scan_reason: "route-owned-page",
    cache_status: "unknown",
    detail: componentDetail({
      statuses: statusesDetail,
      ids: input.statuses.reduce((total, status) => total + (model.ids_by_status[status]?.length ?? 0), 0),
      fallback: storeRead.miss_reason
    })
  });
  const manifests = input.statuses.flatMap((status) => model.manifests_by_status?.[status] ?? []);

  if (manifests.length > 0) {
    const filtered = input.query?.trim()
      ? manifests.filter((manifest) => adminSourceVideoMatchesListFilter(manifest, {
          query: input.query
        }))
      : manifests;

    return {
      manifests: input.limit > 0
        ? filtered.slice(input.offset, input.offset + input.limit)
        : filtered.slice(input.offset),
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      fallback_reason: storeRead.miss_reason,
      component_timings: componentTimings
    };
  }

  if (shouldForbidManifestFallback(input.manifest_fallback_policy)) {
    return manifestFallbackBlockedResult({
      component_timings: componentTimings,
      store_miss_reason: storeRead.miss_reason,
      status_detail: statusesDetail
    });
  }

  const idsStartedAtMs = adminRuntimeNowMs();
  const idManifests = await readSourceVideoIdsFilteredManifestPage({
    library_root: input.library_root,
    source_video_ids: input.statuses.flatMap((status) => model.ids_by_status[status]),
    offset: input.offset,
    limit: input.limit,
    query: input.query,
    filtered_scan_batch_size: input.filtered_scan_batch_size,
    read_manifests_by_ids: input.read_manifests_by_ids
  });
  componentTimings.push({
    name: "manifest_id_page",
    duration_ms: componentDurationMs(idsStartedAtMs),
    data_source: "source-video-manifest",
    scan_mode: "status-scan",
    scan_reason: "route-owned-page",
    cache_status: "miss",
    detail: componentDetail({
      statuses: statusesDetail,
      requested_ids: input.statuses.reduce((total, status) => total + (model.ids_by_status[status]?.length ?? 0), 0),
      manifests: idManifests.length
    })
  });

  return {
    manifests: idManifests,
    actual_data_source: "source-video-manifest",
    cache_status: "miss",
    fallback_reason: storeRead.miss_reason || "status-read-model:id-fallback",
    component_timings: componentTimings
  };
}
