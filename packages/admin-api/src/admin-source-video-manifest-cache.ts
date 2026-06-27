import { readdir } from "node:fs/promises";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { numericSourceVideoId } from "./admin-source-video-query.ts";

interface ManifestListCacheEntry {
  expires_at: number;
  manifests: SourceVideoManifest[];
  pending?: Promise<SourceVideoManifest[]>;
}

interface SourceVideoIdsCacheEntry {
  expires_at: number;
  source_video_ids: string[];
  pending?: Promise<string[]>;
}

interface ManifestByIdCacheEntry {
  expires_at: number;
  manifest: SourceVideoManifest;
}

export interface AdminSourceVideoManifestReaderOptions {
  cache_ttl_ms: number;
  manifest_read_concurrency: number;
  source_videos_root(libraryRoot: string): string;
  read_source_video_manifest(libraryRoot: string, sourceVideoId: string): Promise<SourceVideoManifest>;
  now_ms?: () => number;
}

export interface AdminSourceVideoManifestReader {
  clear_library(libraryRoot: string): void;
  cache_manifest(libraryRoot: string, manifest: SourceVideoManifest): void;
  cache_manifests(libraryRoot: string, manifests: SourceVideoManifest[]): void;
  cache_all_manifests(libraryRoot: string, manifests: SourceVideoManifest[]): void;
  read_fresh_cached_manifests(libraryRoot: string): SourceVideoManifest[] | null;
  read_cached_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
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
}

function cacheKey(libraryRoot: string, sourceVideoId: string): string {
  return `${libraryRoot}\0${sourceVideoId}`;
}

export function createAdminSourceVideoManifestReader(
  options: AdminSourceVideoManifestReaderOptions
): AdminSourceVideoManifestReader {
  const manifestCache = new Map<string, ManifestListCacheEntry>();
  const sourceVideoIdsCache = new Map<string, SourceVideoIdsCacheEntry>();
  const sourceVideoManifestByIdCache = new Map<string, ManifestByIdCacheEntry>();
  const nowMs = () => options.now_ms?.() ?? Date.now();

  function cache_manifest(libraryRoot: string, manifest: SourceVideoManifest): void {
    sourceVideoManifestByIdCache.set(cacheKey(libraryRoot, manifest.source_video_id), {
      expires_at: nowMs() + options.cache_ttl_ms,
      manifest
    });
  }

  function cache_manifests(libraryRoot: string, manifests: SourceVideoManifest[]): void {
    for (const manifest of manifests) {
      cache_manifest(libraryRoot, manifest);
    }
  }

  function cache_all_manifests(libraryRoot: string, manifests: SourceVideoManifest[]): void {
    cache_manifests(libraryRoot, manifests);
    manifestCache.set(libraryRoot, {
      expires_at: nowMs() + options.cache_ttl_ms,
      manifests
    });
  }

  function readFreshCachedManifest(libraryRoot: string, sourceVideoId: string): SourceVideoManifest | null {
    const cached = sourceVideoManifestByIdCache.get(cacheKey(libraryRoot, sourceVideoId));
    return cached && cached.expires_at > nowMs() ? cached.manifest : null;
  }

  function clear_library(libraryRoot: string): void {
    manifestCache.delete(libraryRoot);
    sourceVideoIdsCache.delete(libraryRoot);
    for (const key of sourceVideoManifestByIdCache.keys()) {
      if (key.startsWith(`${libraryRoot}\0`)) {
        sourceVideoManifestByIdCache.delete(key);
      }
    }
  }

  function read_fresh_cached_manifests(libraryRoot: string): SourceVideoManifest[] | null {
    const cached = manifestCache.get(libraryRoot);
    return cached && !cached.pending && cached.expires_at > nowMs()
      ? cached.manifests
      : null;
  }

  async function readSortedSourceVideoIdsFromDisk(libraryRoot: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(options.source_videos_root(libraryRoot), { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((sourceVideoId) => /^V\d{6}$/.test(sourceVideoId))
      .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right));
  }

  async function read_sorted_source_video_ids(libraryRoot: string): Promise<string[]> {
    const currentTimeMs = nowMs();
    const cached = sourceVideoIdsCache.get(libraryRoot);

    if (cached?.pending) {
      return cached.pending;
    }

    if (cached && cached.expires_at > currentTimeMs) {
      return cached.source_video_ids;
    }

    const pending = readSortedSourceVideoIdsFromDisk(libraryRoot)
      .then((sourceVideoIds) => {
        sourceVideoIdsCache.set(libraryRoot, {
          expires_at: nowMs() + options.cache_ttl_ms,
          source_video_ids: sourceVideoIds
        });
        return sourceVideoIds;
      })
      .catch((error) => {
        sourceVideoIdsCache.delete(libraryRoot);
        throw error;
      });

    sourceVideoIdsCache.set(libraryRoot, {
      expires_at: 0,
      source_video_ids: cached?.source_video_ids ?? [],
      pending
    });

    return pending;
  }

  async function read_manifests_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<SourceVideoManifest[]> {
    const manifests: SourceVideoManifest[] = [];
    let nextIndex = 0;

    async function worker(): Promise<void> {
      while (nextIndex < input.source_video_ids.length) {
        const sourceVideoId = input.source_video_ids[nextIndex];
        nextIndex += 1;

        if (!sourceVideoId) {
          continue;
        }

        const cached = readFreshCachedManifest(input.library_root, sourceVideoId);
        if (cached) {
          manifests.push(cached);
          continue;
        }

        try {
          const manifest = await options.read_source_video_manifest(input.library_root, sourceVideoId);
          cache_manifest(input.library_root, manifest);
          manifests.push(manifest);
        } catch {
          // Malformed manifests are reported by Doctor; list views skip them.
        }
      }
    }

    await Promise.all(
      Array.from({
        length: Math.min(options.manifest_read_concurrency, input.source_video_ids.length)
      }, () => worker())
    );

    return manifests.sort(
      (left, right) =>
        numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
    );
  }

  async function read_all_manifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
    const sourceVideoIds = await read_sorted_source_video_ids(libraryRoot);
    return read_manifests_by_ids({
      library_root: libraryRoot,
      source_video_ids: sourceVideoIds
    });
  }

  async function read_cached_manifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
    const currentTimeMs = nowMs();
    const cached = manifestCache.get(libraryRoot);

    if (cached?.pending) {
      return cached.pending;
    }

    if (cached && cached.expires_at > currentTimeMs) {
      return cached.manifests;
    }

    const pending = read_all_manifests(libraryRoot)
      .then((manifests) => {
        cache_all_manifests(libraryRoot, manifests);
        return manifests;
      })
      .catch((error) => {
        manifestCache.delete(libraryRoot);
        throw error;
      });

    manifestCache.set(libraryRoot, {
      expires_at: 0,
      manifests: cached?.manifests ?? [],
      pending
    });

    return pending;
  }

  async function read_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<SourceVideoManifest[]> {
    const sourceVideoIds = (await read_sorted_source_video_ids(input.library_root))
      .slice(input.offset, input.offset + input.limit);

    return read_manifests_by_ids({
      library_root: input.library_root,
      source_video_ids: sourceVideoIds
    });
  }

  return {
    clear_library,
    cache_manifest,
    cache_manifests,
    cache_all_manifests,
    read_fresh_cached_manifests,
    read_cached_manifests,
    read_sorted_source_video_ids,
    read_manifests_by_ids,
    read_all_manifests,
    read_manifest_page
  };
}
