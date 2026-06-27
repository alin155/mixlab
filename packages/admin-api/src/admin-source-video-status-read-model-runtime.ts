import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import {
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";
import {
  ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT
} from "./admin-data-loading-plan.ts";
import {
  listAdminSourceVideoDefaultPage
} from "./admin-source-video-default-page-query.ts";
import {
  buildAdminSourceVideoStatusReadModel,
  buildAdminSourceVideoStatusReadModelFromIndexedReadyIds,
  emptySourceVideoStatusIdsByStatus,
  isAdminSourceVideoStatusReadModelFresh,
  parseAdminSourceVideoStatusReadModel,
  sourceVideoStatusReadModelCounts,
  sourceVideoStatusReadModelCountsMatchLibrary,
  type AdminSourceVideoStatusReadModel
} from "./admin-source-video-read-model.ts";

export type AdminSourceVideoStatusReadModelRuntimeLibrary = LibraryCounts & {
  updated_at?: string;
};

export interface AdminSourceVideoStatusReadModelRuntimeStatus {
  name: "source-video-status-read-model-v1";
  storage: "persistent-json";
  path: string;
  freshness: "fresh" | "building" | "stale" | "missing";
  memory_cache: "fresh" | "building" | "stale" | "missing";
  persisted: "fresh" | "stale" | "missing";
  generated_at: string;
  library_updated_at: string;
  current_library_updated_at: string;
  video_count: number;
  current_video_count: number;
  counts_by_status: Record<PreprocessStatus, number>;
  cache_ttl_ms: number;
}

export interface AdminSourceVideoStatusReadModelRuntimeInput {
  cache_ttl_ms: number;
  default_page_limit?: number;
  page_scan_ahead: number;
  manifest_read_concurrency: number;
  now_ms?: () => number;
  read_library_manifest(libraryRoot: string): Promise<AdminSourceVideoStatusReadModelRuntimeLibrary | null>;
  read_indexed_ready_id_set(libraryRoot: string): Promise<Set<string> | null>;
  read_indexed_manifest_map_by_ids(input: {
    library_root: string;
    source_video_ids: string[];
  }): Promise<Map<string, SourceVideoManifest> | null>;
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
  cache_manifests(libraryRoot: string, manifests: SourceVideoManifest[]): void;
  cache_all_manifests(libraryRoot: string, manifests: SourceVideoManifest[]): void;
  clear_default_page_cache(libraryRoot: string): void;
  write_status_read_model_store?: (input: {
    library_root: string;
    model: AdminSourceVideoStatusReadModel;
  }) => Promise<void>;
}

interface AdminSourceVideoStatusReadModelCacheEntry {
  expires_at: number;
  model?: AdminSourceVideoStatusReadModel;
  pending?: Promise<AdminSourceVideoStatusReadModel>;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function defaultEmptyCounts(): Record<PreprocessStatus, number> {
  return sourceVideoStatusReadModelCounts({
    schema_version: "1.0",
    generated_at: "",
    library_updated_at: "",
    video_count: 0,
    ids_by_status: emptySourceVideoStatusIdsByStatus()
  });
}

export function adminReadModelsRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "admin", "read-models");
}

export function sourceVideoStatusReadModelPath(libraryRoot: string): string {
  return path.join(adminReadModelsRoot(libraryRoot), "source-video-status-read-model-v1.json");
}

export function createAdminSourceVideoStatusReadModelRuntime(
  input: AdminSourceVideoStatusReadModelRuntimeInput
) {
  const defaultPageLimit = input.default_page_limit ?? ADMIN_SOURCE_VIDEO_ROUTE_DEFAULT_LIMIT;
  const sourceVideoStatusReadModelCache = new Map<string, AdminSourceVideoStatusReadModelCacheEntry>();
  const writeStatusReadModelStore = input.write_status_read_model_store
    ?? writeAdminSourceVideoStatusReadModelStore;

  function nowMs(): number {
    return input.now_ms?.() ?? Date.now();
  }

  async function clear(libraryRoot: string): Promise<void> {
    input.clear_default_page_cache(libraryRoot);
    sourceVideoStatusReadModelCache.delete(libraryRoot);
    await rm(sourceVideoStatusReadModelPath(libraryRoot), { force: true });
  }

  async function readPersisted(
    libraryRoot: string
  ): Promise<AdminSourceVideoStatusReadModel | null> {
    try {
      return parseAdminSourceVideoStatusReadModel(
        JSON.parse(await readFile(sourceVideoStatusReadModelPath(libraryRoot), "utf8"))
      );
    } catch {
      return null;
    }
  }

  async function writePersisted(
    libraryRoot: string,
    model: AdminSourceVideoStatusReadModel
  ): Promise<void> {
    await mkdir(adminReadModelsRoot(libraryRoot), { recursive: true });
    await writeFile(sourceVideoStatusReadModelPath(libraryRoot), jsonBytes(model), "utf8");
    await writeStatusReadModelStore({
      library_root: libraryRoot,
      model
    });
  }

  function cacheStatusReadModelManifests(
    libraryRoot: string,
    model: AdminSourceVideoStatusReadModel
  ): void {
    for (const manifests of Object.values(model.manifests_by_status ?? {})) {
      input.cache_manifests(libraryRoot, manifests ?? []);
    }
  }

  async function readIndexed(
    libraryRoot: string,
    library: AdminSourceVideoStatusReadModelRuntimeLibrary | null
  ): Promise<AdminSourceVideoStatusReadModel | null> {
    if (!library || library.ready_video_count <= 0) {
      return null;
    }

    const indexedReadyIds = await input.read_indexed_ready_id_set(libraryRoot);
    if (!indexedReadyIds || indexedReadyIds.size !== library.ready_video_count) {
      return null;
    }

    const sourceVideoIds = await input.read_sorted_source_video_ids(libraryRoot);
    if (sourceVideoIds.length < library.video_count) {
      return null;
    }

    const nonReadySourceVideoIds = sourceVideoIds.filter((sourceVideoId) => !indexedReadyIds.has(sourceVideoId));
    const nonReadyManifests = await input.read_manifests_by_ids({
      library_root: libraryRoot,
      source_video_ids: nonReadySourceVideoIds
    });
    const model = buildAdminSourceVideoStatusReadModelFromIndexedReadyIds({
      library,
      ready_source_video_ids: [...indexedReadyIds],
      non_ready_manifests: nonReadyManifests
    });
    const defaultPage = await listAdminSourceVideoDefaultPage({
      library_root: libraryRoot,
      offset: 0,
      limit: defaultPageLimit,
      bypass_cache: true,
      route_default_limit: defaultPageLimit,
      page_scan_ahead: input.page_scan_ahead,
      manifest_read_concurrency: input.manifest_read_concurrency,
      cache_ttl_ms: input.cache_ttl_ms,
      read_status_read_model: async () => null,
      read_library_manifest: input.read_library_manifest,
      read_indexed_manifest_map_by_ids: input.read_indexed_manifest_map_by_ids,
      read_manifests_by_ids: input.read_manifests_by_ids,
      read_manifest_page: input.read_manifest_page
    });
    if (defaultPage.length > 0) {
      model.default_source_video_page = {
        offset: 0,
        limit: defaultPageLimit,
        manifests: defaultPage
      };
    }

    return sourceVideoStatusReadModelCountsMatchLibrary(model, library) ? model : null;
  }

  async function read(libraryRoot: string): Promise<AdminSourceVideoStatusReadModel> {
    const cached = sourceVideoStatusReadModelCache.get(libraryRoot);

    if (cached?.pending) {
      return cached.pending;
    }

    if (cached?.model && cached.expires_at > nowMs()) {
      const library = await input.read_library_manifest(libraryRoot);
      if (isAdminSourceVideoStatusReadModelFresh(cached.model, library, {
        default_page_limit: defaultPageLimit
      })) {
        return cached.model;
      }
    }

    const pending = (async () => {
      const library = await input.read_library_manifest(libraryRoot);
      const currentCached = sourceVideoStatusReadModelCache.get(libraryRoot);
      if (
        currentCached?.model &&
        currentCached.expires_at > nowMs() &&
        isAdminSourceVideoStatusReadModelFresh(currentCached.model, library, {
          default_page_limit: defaultPageLimit
        })
      ) {
        sourceVideoStatusReadModelCache.set(libraryRoot, {
          expires_at: currentCached.expires_at,
          model: currentCached.model
        });
        return currentCached.model;
      }

      const persisted = await readPersisted(libraryRoot);
      if (persisted && isAdminSourceVideoStatusReadModelFresh(persisted, library, {
        default_page_limit: defaultPageLimit
      })) {
        cacheStatusReadModelManifests(libraryRoot, persisted);
        sourceVideoStatusReadModelCache.set(libraryRoot, {
          expires_at: nowMs() + input.cache_ttl_ms,
          model: persisted
        });
        return persisted;
      }

      const indexedModel = await readIndexed(libraryRoot, library);
      if (indexedModel) {
        cacheStatusReadModelManifests(libraryRoot, indexedModel);
        sourceVideoStatusReadModelCache.set(libraryRoot, {
          expires_at: nowMs() + input.cache_ttl_ms,
          model: indexedModel
        });
        await writePersisted(libraryRoot, indexedModel).catch(() => {
          // Persisted read models are an optimization. Runtime lists still work from manifests.
        });
        return indexedModel;
      }

      const manifests = await input.read_all_manifests(libraryRoot);
      const model = buildAdminSourceVideoStatusReadModel({
        library,
        manifests,
        default_page_limit: defaultPageLimit
      });
      input.cache_all_manifests(libraryRoot, manifests);
      cacheStatusReadModelManifests(libraryRoot, model);
      sourceVideoStatusReadModelCache.set(libraryRoot, {
        expires_at: nowMs() + input.cache_ttl_ms,
        model
      });
      await writePersisted(libraryRoot, model).catch(() => {
        // Persisted read models are an optimization. Runtime lists still work from manifests.
      });
      return model;
    })()
      .catch((error) => {
        sourceVideoStatusReadModelCache.delete(libraryRoot);
        throw error;
      });

    sourceVideoStatusReadModelCache.set(libraryRoot, {
      expires_at: 0,
      model: cached?.model,
      pending
    });

    return pending;
  }

  function refreshInBackground(libraryRoot: string): void {
    const cached = sourceVideoStatusReadModelCache.get(libraryRoot);
    if (cached?.pending) {
      return;
    }

    void read(libraryRoot).catch(() => {
      // Status read model warming is best-effort; route loaders still use manifests as source of truth.
    });
  }

  async function status(inputStatus: {
    library_root: string;
    now: string;
  }): Promise<AdminSourceVideoStatusReadModelRuntimeStatus> {
    const library = await input.read_library_manifest(inputStatus.library_root);
    const cached = sourceVideoStatusReadModelCache.get(inputStatus.library_root);
    const memoryFresh = cached?.model
      ? isAdminSourceVideoStatusReadModelFresh(cached.model, library, {
          default_page_limit: defaultPageLimit
        })
      : false;
    const persisted = await readPersisted(inputStatus.library_root);
    const persistedFresh = persisted
      ? isAdminSourceVideoStatusReadModelFresh(persisted, library, {
          default_page_limit: defaultPageLimit
        })
      : false;
    const model = memoryFresh ? cached!.model! : persistedFresh ? persisted! : null;
    const freshness = model
      ? "fresh"
      : cached?.pending
        ? "building"
        : persisted
          ? "stale"
          : "missing";

    return {
      name: "source-video-status-read-model-v1",
      storage: "persistent-json",
      path: sourceVideoStatusReadModelPath(inputStatus.library_root),
      freshness,
      memory_cache: cached?.pending
        ? "building"
        : memoryFresh
          ? "fresh"
          : cached?.model
            ? "stale"
            : "missing",
      persisted: persisted
        ? persistedFresh
          ? "fresh"
          : "stale"
        : "missing",
      generated_at: model?.generated_at ?? persisted?.generated_at ?? "",
      library_updated_at: model?.library_updated_at ?? persisted?.library_updated_at ?? "",
      current_library_updated_at: library?.updated_at ?? "",
      video_count: model?.video_count ?? persisted?.video_count ?? 0,
      current_video_count: library?.video_count ?? 0,
      counts_by_status: model ? sourceVideoStatusReadModelCounts(model) : defaultEmptyCounts(),
      cache_ttl_ms: input.cache_ttl_ms
    };
  }

  return {
    clear,
    read,
    read_persisted: readPersisted,
    refresh_in_background: refreshInBackground,
    status
  };
}
