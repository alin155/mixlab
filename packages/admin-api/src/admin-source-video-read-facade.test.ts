import test from "node:test";
import assert from "node:assert/strict";
import type { SourceVideoManifest, PreprocessStatus, LibraryCounts } from "../../protocol/src/index.ts";
import type { AdminSourceVideoManifestReader } from "./admin-source-video-manifest-cache.ts";
import {
  createAdminSourceVideoReadFacade
} from "./admin-source-video-read-facade.ts";
import {
  emptySourceVideoStatusIdsByStatus,
  type AdminSourceVideoStatusReadModel
} from "./admin-source-video-read-model.ts";

function manifest(input: {
  id: string;
  status: PreprocessStatus;
  title?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.id,
    title: input.title ?? input.id,
    relative_path: `${input.id}.mp4`,
    logical_uri: `mixlab://source-video/${input.id}`,
    duration_ms: 1_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `${input.id}-hash`,
    preprocess_status: input.status,
    visible_to_cutters: input.status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  };
}

function libraryCounts(overrides: Partial<LibraryCounts> = {}): LibraryCounts {
  return {
    video_count: 0,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    ...overrides
  };
}

function statusModel(overrides: Partial<AdminSourceVideoStatusReadModel> = {}): AdminSourceVideoStatusReadModel {
  return {
    schema_version: "1.0",
    generated_at: "2026-06-27T00:00:00.000Z",
    library_updated_at: "2026-06-27T00:00:00.000Z",
    video_count: 0,
    ids_by_status: emptySourceVideoStatusIdsByStatus(),
    ...overrides
  };
}

function createManifestReader(manifests: SourceVideoManifest[]): AdminSourceVideoManifestReader {
  const byId = new Map(manifests.map((item) => [item.source_video_id, item]));
  return {
    clear_library() {},
    cache_manifest() {},
    cache_manifests() {},
    cache_all_manifests() {},
    read_fresh_cached_manifests() {
      return null;
    },
    async read_cached_manifests() {
      return manifests;
    },
    async read_sorted_source_video_ids() {
      return manifests.map((item) => item.source_video_id);
    },
    async read_manifests_by_ids(input) {
      return input.source_video_ids
        .map((sourceVideoId) => byId.get(sourceVideoId))
        .filter((item): item is SourceVideoManifest => Boolean(item));
    },
    async read_all_manifests() {
      return manifests;
    },
    async read_manifest_page(input) {
      return manifests.slice(input.offset, input.offset + input.limit);
    }
  };
}

function createFacade(input: {
  manifests: SourceVideoManifest[];
  model?: AdminSourceVideoStatusReadModel;
  library?: LibraryCounts | null;
  storeStatusPage?: SourceVideoManifest[] | null;
  storeStatusReadResult?: {
    page: { manifests: SourceVideoManifest[] } | null;
    miss_reason?: string;
    missing_source_video_ids?: string[];
  };
  storeStatusReadResults?: Array<{
    page: { manifests: SourceVideoManifest[] } | null;
    miss_reason?: string;
    missing_source_video_ids?: string[];
  }>;
  storePreprocessPage?: {
    manifests: SourceVideoManifest[];
    preprocess_jobs: [];
  } | null;
  writeStoreManifests?: (writerInput: {
    library_root: string;
    library: LibraryCounts | null;
    manifests: SourceVideoManifest[];
  }) => Promise<{
    applied: boolean;
    reason: "updated" | "missing";
  }>;
}) {
  let clearCount = 0;
  let refreshCount = 0;
  let storeStatusReadCount = 0;
  const model = input.model ?? statusModel();
  return {
    facade: createAdminSourceVideoReadFacade({
      manifest_read_concurrency: 8,
      manifest_cache_ttl_ms: 30_000,
      filtered_scan_batch_size: 16,
      filtered_query_scan_batch_limit: 2,
      source_video_page_scan_ahead: 20,
      source_video_route_default_limit: 20,
      manifest_reader: createManifestReader(input.manifests),
      status_read_model_runtime: {
        async read() {
          return model;
        },
        refresh_in_background() {
          refreshCount += 1;
        },
        async clear() {
          clearCount += 1;
        }
      },
      async read_library_manifest() {
        return input.library ?? libraryCounts({ video_count: input.manifests.length });
      },
      async read_current_index_version() {
        return "";
      },
      source_transcript_index_root(libraryRoot) {
        return `${libraryRoot}/.mixlab-library/index/source-transcripts`;
      },
      async read_status_page_from_store() {
        if (input.storeStatusReadResults) {
          const index = Math.min(storeStatusReadCount, input.storeStatusReadResults.length - 1);
          storeStatusReadCount += 1;
          return input.storeStatusReadResults[index] ?? null;
        }
        if (input.storeStatusReadResult) {
          return input.storeStatusReadResult;
        }
        return input.storeStatusPage
          ? { manifests: input.storeStatusPage }
          : null;
      },
      async read_statuses_page_from_store() {
        return null;
      },
      async read_preprocess_job_manifest_page_from_store() {
        return input.storePreprocessPage ?? null;
      },
      ...(input.writeStoreManifests
        ? {
            write_source_video_manifests_to_store: input.writeStoreManifests
          }
        : {})
    }),
    counts: {
      get clear() {
        return clearCount;
      },
      get refresh() {
        return refreshCount;
      },
      get storeStatusReads() {
        return storeStatusReadCount;
      }
    }
  };
}

test("source-video read facade reads default pages through the status read model", async () => {
  const ready = manifest({ id: "V000001", status: "ready", title: "默认素材" });
  const { facade } = createFacade({
    manifests: [ready],
    library: libraryCounts({ video_count: 1, ready_video_count: 1 }),
    model: statusModel({
      video_count: 1,
      default_source_video_page: {
        offset: 0,
        limit: 20,
        manifests: [ready]
      }
    })
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 1
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000001"]);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "unknown");
});

test("source-video read facade reports store-backed status pages as admin read-model hits", async () => {
  const processing = manifest({ id: "V000002", status: "processing" });
  const { facade } = createFacade({
    manifests: [processing],
    library: libraryCounts({ video_count: 1, processing_video_count: 1 }),
    storeStatusPage: [processing]
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 20,
    status: "processing"
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000002"]);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
});

test("source-video read facade reports status ID fallback as source manifest miss", async () => {
  const processing = manifest({ id: "V000005", status: "processing" });
  const { facade } = createFacade({
    manifests: [processing],
    library: libraryCounts({ video_count: 1, processing_video_count: 1 }),
    model: statusModel({
      ids_by_status: {
        ...emptySourceVideoStatusIdsByStatus(),
        processing: ["V000005"]
      }
    })
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 20,
    status: "processing"
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000005"]);
  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "miss");
});

test("source-video read facade preserves status store miss reason in runtime metadata", async () => {
  const processing = manifest({ id: "V000006", status: "processing" });
  const { facade } = createFacade({
    manifests: [processing],
    library: libraryCounts({ video_count: 1, processing_video_count: 1 }),
    storeStatusReadResult: {
      page: null,
      miss_reason: "incomplete-manifest-rows"
    },
    model: statusModel({
      ids_by_status: {
        ...emptySourceVideoStatusIdsByStatus(),
        processing: ["V000006"]
      }
    })
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 20,
    status: "processing"
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000006"]);
  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.fallback_reason, "status-store:incomplete-manifest-rows");
});

test("source-video read facade can forbid manifest fallback for status pages", async () => {
  const processing = manifest({ id: "V000006", status: "processing" });
  const { facade } = createFacade({
    manifests: [processing],
    library: libraryCounts({ video_count: 1, processing_video_count: 1 }),
    storeStatusReadResult: {
      page: null,
      miss_reason: "store-not-fresh"
    },
    model: statusModel({
      ids_by_status: {
        ...emptySourceVideoStatusIdsByStatus(),
        processing: ["V000006"]
      }
    })
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 20,
    status: "processing",
    manifest_fallback_policy: "forbid"
  });

  assert.deepEqual(result.manifests, []);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.fallback_reason, "manifest-fallback:forbidden");
  assert.deepEqual(
    result.component_timings?.map((component) => component.name),
    ["library_counts", "status_store_page", "status_read_model", "manifest_fallback_policy"]
  );
});

test("source-video read facade repairs current status store manifest gaps and retries the store page", async () => {
  const processing = manifest({ id: "V000007", status: "processing" });
  const writes: Array<{
    library_root: string;
    manifests: SourceVideoManifest[];
  }> = [];
  const { facade, counts } = createFacade({
    manifests: [processing],
    library: libraryCounts({ video_count: 1, processing_video_count: 1 }),
    storeStatusReadResults: [
      {
        page: null,
        miss_reason: "incomplete-manifest-rows",
        missing_source_video_ids: ["V000007"]
      },
      {
        page: {
          manifests: [processing]
        }
      }
    ],
    async writeStoreManifests(writerInput) {
      writes.push({
        library_root: writerInput.library_root,
        manifests: writerInput.manifests
      });
      return {
        applied: true,
        reason: "updated"
      };
    }
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 20,
    status: "processing"
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000007"]);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.equal(result.fallback_reason, "");
  assert.equal(result.repair_reason, "status-store:repaired-incomplete-manifest-rows");
  assert.equal(counts.storeStatusReads, 2);
  assert.deepEqual(writes.map((write) => write.manifests.map((item) => item.source_video_id)), [["V000007"]]);
});

test("source-video read facade disables status store repair for read-only probes", async () => {
  const processing = manifest({ id: "V000008", status: "processing" });
  const writes: Array<{
    library_root: string;
    manifests: SourceVideoManifest[];
  }> = [];
  const { facade, counts } = createFacade({
    manifests: [processing],
    library: libraryCounts({ video_count: 1, processing_video_count: 1 }),
    model: statusModel({
      ids_by_status: {
        ...emptySourceVideoStatusIdsByStatus(),
        processing: ["V000008"]
      }
    }),
    storeStatusReadResults: [
      {
        page: null,
        miss_reason: "incomplete-manifest-rows",
        missing_source_video_ids: ["V000008"]
      },
      {
        page: {
          manifests: [processing]
        }
      }
    ],
    async writeStoreManifests(writerInput) {
      writes.push({
        library_root: writerInput.library_root,
        manifests: writerInput.manifests
      });
      return {
        applied: true,
        reason: "updated"
      };
    }
  });

  const result = await facade.read_source_video_list_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 20,
    status: "processing",
    disable_store_repair: true
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000008"]);
  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.fallback_reason, "status-store:incomplete-manifest-rows");
  assert.equal(result.repair_reason, undefined);
  assert.equal(counts.storeStatusReads, 1);
  assert.deepEqual(writes, []);
});

test("source-video read facade falls back from preprocess store page to status read model ids", async () => {
  const queued = manifest({ id: "V000003", status: "queued" });
  const processing = manifest({ id: "V000004", status: "processing" });
  const { facade } = createFacade({
    manifests: [queued, processing],
    model: statusModel({
      ids_by_status: {
        ...emptySourceVideoStatusIdsByStatus(),
        queued: ["V000003"],
        processing: ["V000004"]
      }
    })
  });

  const result = await facade.read_preprocess_job_manifest_page_with_runtime_meta({
    library_root: "/tmp/library",
    offset: 0,
    limit: 10
  });

  assert.deepEqual(result.manifests.map((item) => item.source_video_id), ["V000004", "V000003"]);
  assert.deepEqual(result.preprocess_jobs, []);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "miss");
});

test("source-video read facade clears and refreshes both manifest and status read caches", async () => {
  const { facade, counts } = createFacade({ manifests: [] });

  facade.refresh_status_read_model_in_background("/tmp/library");
  facade.clear_source_video_page_cache("/tmp/library");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(counts.refresh, 1);
  assert.equal(counts.clear, 1);
});
