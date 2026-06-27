import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import { sourceVideoIdFromOrdinal } from "./admin-source-video-query.ts";

interface AdminSourceVideoDefaultPageReadModel {
  default_source_video_page?: {
    offset: number;
    limit: number;
    manifests: SourceVideoManifest[];
  };
}

type AdminSourceVideoDefaultPageLibrary = Pick<LibraryCounts, "video_count">;

interface AdminSourceVideoDefaultPageCacheEntry {
  expires_at: number;
  manifests: SourceVideoManifest[];
  pending?: Promise<SourceVideoManifest[]>;
}

const sourceVideoDefaultPageCache = new Map<string, AdminSourceVideoDefaultPageCacheEntry>();

export interface AdminSourceVideoDefaultPageQueryInput {
  library_root: string;
  offset: number;
  limit: number;
  bypass_cache?: boolean;
  route_default_limit: number;
  page_scan_ahead: number;
  manifest_read_concurrency: number;
  cache_ttl_ms: number;
  now_ms?: () => number;
  read_status_read_model(libraryRoot: string): Promise<AdminSourceVideoDefaultPageReadModel | null>;
  read_library_manifest(libraryRoot: string): Promise<AdminSourceVideoDefaultPageLibrary | null>;
  read_indexed_manifest_map_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<Map<string, SourceVideoManifest> | null>;
  read_manifests_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]>;
  read_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<SourceVideoManifest[]>;
}

function cacheKey(input: Pick<AdminSourceVideoDefaultPageQueryInput, "library_root" | "offset" | "limit">): string {
  return `${input.library_root}\0${input.offset}\0${input.limit}`;
}

function nowMs(input: AdminSourceVideoDefaultPageQueryInput): number {
  return input.now_ms?.() ?? Date.now();
}

export function clearAdminSourceVideoDefaultPageCache(libraryRoot: string): void {
  for (const key of sourceVideoDefaultPageCache.keys()) {
    if (key.startsWith(`${libraryRoot}\0`)) {
      sourceVideoDefaultPageCache.delete(key);
    }
  }
}

async function readReadModelDefaultPage(
  input: AdminSourceVideoDefaultPageQueryInput
): Promise<SourceVideoManifest[] | null> {
  if (input.offset !== 0 || input.limit > input.route_default_limit) {
    return null;
  }

  const model = await input.read_status_read_model(input.library_root).catch(() => null);
  const defaultPage = model?.default_source_video_page;
  if (
    defaultPage &&
    defaultPage.offset === 0 &&
    defaultPage.limit >= input.limit &&
    defaultPage.manifests.length >= input.limit
  ) {
    return defaultPage.manifests.slice(0, input.limit);
  }

  return null;
}

async function readManifestPageFromLibraryCount(
  input: AdminSourceVideoDefaultPageQueryInput
): Promise<SourceVideoManifest[] | null> {
  const library = await input.read_library_manifest(input.library_root);
  const videoCount = Math.max(0, Math.floor(library?.video_count ?? 0));
  if (input.limit <= 0 || videoCount <= 0 || input.offset >= videoCount) {
    return null;
  }

  const manifests: SourceVideoManifest[] = [];
  let ordinal = input.offset + 1;
  const maxOrdinal = Math.min(videoCount, input.offset + input.limit + input.page_scan_ahead);

  while (ordinal <= maxOrdinal && manifests.length < input.limit) {
    const batchEnd = Math.min(maxOrdinal, ordinal + input.manifest_read_concurrency - 1);
    const ids = Array.from(
      { length: batchEnd - ordinal + 1 },
      (_, index) => sourceVideoIdFromOrdinal(ordinal + index)
    );
    manifests.push(...await input.read_manifests_by_ids({
      library_root: input.library_root,
      source_video_ids: ids
    }));
    ordinal = batchEnd + 1;
  }

  return manifests.slice(0, input.limit);
}

async function readIndexedOrManifestPageFromLibraryCount(
  input: AdminSourceVideoDefaultPageQueryInput
): Promise<SourceVideoManifest[] | null> {
  const library = await input.read_library_manifest(input.library_root);
  const videoCount = Math.max(0, Math.floor(library?.video_count ?? 0));
  if (input.limit <= 0 || videoCount <= 0 || input.offset >= videoCount) {
    return null;
  }

  const maxOrdinal = Math.min(videoCount, input.offset + input.limit + input.page_scan_ahead);
  const candidateIds = Array.from(
    { length: maxOrdinal - input.offset },
    (_, index) => sourceVideoIdFromOrdinal(input.offset + index + 1)
  );
  const indexedManifests = await input.read_indexed_manifest_map_by_ids({
    library_root: input.library_root,
    source_video_ids: candidateIds
  });
  if (!indexedManifests) {
    return null;
  }

  const missingIds = candidateIds.filter((sourceVideoId) => !indexedManifests.has(sourceVideoId));
  const diskManifests = await input.read_manifests_by_ids({
    library_root: input.library_root,
    source_video_ids: missingIds
  });
  const diskManifestMap = new Map(diskManifests.map((manifest) => [manifest.source_video_id, manifest]));
  const manifests: SourceVideoManifest[] = [];

  for (const sourceVideoId of candidateIds) {
    const manifest = indexedManifests.get(sourceVideoId) ?? diskManifestMap.get(sourceVideoId);
    if (manifest) {
      manifests.push(manifest);
    }
    if (manifests.length >= input.limit) {
      break;
    }
  }

  return manifests;
}

async function readUncachedDefaultPage(
  input: AdminSourceVideoDefaultPageQueryInput
): Promise<SourceVideoManifest[]> {
  const readModelPage = await readReadModelDefaultPage(input);
  if (readModelPage) {
    return readModelPage;
  }

  const countedManifestPage = await readIndexedOrManifestPageFromLibraryCount(input) ??
    await readManifestPageFromLibraryCount(input);

  return countedManifestPage && countedManifestPage.length > 0
    ? countedManifestPage
    : input.read_manifest_page({
        library_root: input.library_root,
        offset: input.offset,
        limit: input.limit
      });
}

export async function listAdminSourceVideoDefaultPage(
  input: AdminSourceVideoDefaultPageQueryInput
): Promise<SourceVideoManifest[]> {
  if (input.bypass_cache) {
    return readUncachedDefaultPage(input);
  }

  const key = cacheKey(input);
  const cached = sourceVideoDefaultPageCache.get(key);
  const currentTimeMs = nowMs(input);

  if (cached?.pending) {
    return cached.pending;
  }

  if (cached && cached.expires_at > currentTimeMs) {
    return cached.manifests;
  }

  const pending = readUncachedDefaultPage(input)
    .then((manifests) => {
      sourceVideoDefaultPageCache.set(key, {
        expires_at: nowMs(input) + input.cache_ttl_ms,
        manifests
      });
      return manifests;
    })
    .catch((error) => {
      sourceVideoDefaultPageCache.delete(key);
      throw error;
    });

  sourceVideoDefaultPageCache.set(key, {
    expires_at: 0,
    manifests: cached?.manifests ?? [],
    pending
  });

  return pending;
}
