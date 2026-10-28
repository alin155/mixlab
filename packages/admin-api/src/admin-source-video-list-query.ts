import type {
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import { adminSourceVideoMatchesListFilter } from "./admin-source-video-query.ts";

export interface AdminSourceVideoListQueryReaderInput {
  offset: number;
  limit: number;
  query?: string;
}

export interface AdminSourceVideoStatusListQueryReaderInput extends AdminSourceVideoListQueryReaderInput {
  status: PreprocessStatus;
}

export interface AdminSourceVideoStatusesListQueryReaderInput extends AdminSourceVideoListQueryReaderInput {
  statuses: PreprocessStatus[];
}

export interface AdminSourceVideoFilteredListQueryReaderInput extends AdminSourceVideoListQueryReaderInput {
  status?: PreprocessStatus;
  max_scan_batches?: number;
}

export interface ListAdminSourceVideoManifestsInput {
  offset: number;
  limit: number;
  query?: string;
  status?: PreprocessStatus;
  filtered_query_scan_batch_limit: number;
  read_default_page(input: AdminSourceVideoListQueryReaderInput): Promise<SourceVideoManifest[]>;
  read_all_manifests(): Promise<SourceVideoManifest[]>;
  read_fresh_cached_manifests(): SourceVideoManifest[] | null;
  read_indexed_ready_page(input: AdminSourceVideoListQueryReaderInput): Promise<SourceVideoManifest[] | null>;
  read_status_page(input: AdminSourceVideoStatusListQueryReaderInput): Promise<SourceVideoManifest[]>;
  read_statuses_page(input: AdminSourceVideoStatusesListQueryReaderInput): Promise<SourceVideoManifest[]>;
  read_filtered_page(input: AdminSourceVideoFilteredListQueryReaderInput): Promise<SourceVideoManifest[]>;
}

const NON_READY_QUERY_STATUSES: PreprocessStatus[] = [
  "processing",
  "queued",
  "failed",
  "index-required",
  "unprocessed"
];

export const ADMIN_SOURCE_VIDEO_LIST_DEFAULT_LIMIT = 50;
export const ADMIN_SOURCE_VIDEO_LIST_MAX_LIMIT = 500;

/**
 * Service-level page guard: even direct callers that bypass the HTTP route can never read the
 * whole library through a zero/absent limit, and can never exceed the documented maximum.
 */
export function normalizeAdminSourceVideoListLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return ADMIN_SOURCE_VIDEO_LIST_DEFAULT_LIMIT;
  }

  const floored = Math.trunc(limit);

  if (floored <= 0) {
    return ADMIN_SOURCE_VIDEO_LIST_DEFAULT_LIMIT;
  }

  return Math.min(floored, ADMIN_SOURCE_VIDEO_LIST_MAX_LIMIT);
}

async function readAdminSourceVideoQueryList(input: ListAdminSourceVideoManifestsInput & {
  query: string;
}): Promise<SourceVideoManifest[] | null> {
  if (input.limit <= 0) {
    return null;
  }

  const requestedEnd = input.offset + input.limit;
  const indexedReadyMatches = await input.read_indexed_ready_page({
    offset: 0,
    limit: requestedEnd,
    query: input.query
  });

  if (!indexedReadyMatches) {
    return null;
  }

  const readyPage = indexedReadyMatches.slice(input.offset, requestedEnd);
  if (readyPage.length > 0) {
    return readyPage;
  }

  const remaining = input.limit - readyPage.length;
  if (remaining <= 0) {
    return readyPage;
  }

  const nonReadyOffset = Math.max(0, input.offset - indexedReadyMatches.length);
  const nonReadyPage = await input.read_statuses_page({
    statuses: NON_READY_QUERY_STATUSES,
    offset: nonReadyOffset,
    limit: remaining,
    query: input.query
  });

  return [...readyPage, ...nonReadyPage];
}

export async function listAdminSourceVideoManifests(
  input: ListAdminSourceVideoManifestsInput
): Promise<SourceVideoManifest[]> {
  input = { ...input, limit: normalizeAdminSourceVideoListLimit(input.limit) };
  const normalizedQuery = input.query?.trim() ?? "";
  const hasFilter = Boolean(normalizedQuery) || Boolean(input.status);

  if (!hasFilter) {
    if (input.limit > 0) {
      const manifestPage = await input.read_default_page({
        offset: input.offset,
        limit: input.limit
      });

      if (manifestPage.length > 0) {
        return manifestPage;
      }

      const indexedReadyPage = await input.read_indexed_ready_page({
        offset: input.offset,
        limit: input.limit,
        query: ""
      });

      return indexedReadyPage ?? [];
    }

    return input.read_all_manifests();
  }

  const cachedManifests = input.read_fresh_cached_manifests();
  if (cachedManifests) {
    const filtered = cachedManifests.filter((manifest) =>
      adminSourceVideoMatchesListFilter(manifest, {
        query: input.query,
        status: input.status
      })
    );

    return input.limit > 0
      ? filtered.slice(input.offset, input.offset + input.limit)
      : filtered;
  }

  if (normalizedQuery && !input.status) {
    const queryMatches = await readAdminSourceVideoQueryList({
      ...input,
      query: normalizedQuery
    });

    if (queryMatches) {
      return queryMatches;
    }
  }

  if (input.status === "ready") {
    const indexedManifests = await input.read_indexed_ready_page({
      offset: input.offset,
      limit: input.limit,
      query: normalizedQuery
    });

    if (indexedManifests) {
      return indexedManifests.filter((manifest) => manifest.preprocess_status === "ready");
    }
  }

  if (input.status && input.status !== "ready") {
    return input.read_status_page({
      status: input.status,
      offset: input.offset,
      limit: input.limit,
      query: input.query
    });
  }

  return input.read_filtered_page({
    offset: input.offset,
    limit: input.limit,
    query: input.query,
    status: input.status,
    max_scan_batches: normalizedQuery ? input.filtered_query_scan_batch_limit : undefined
  });
}
