import assert from "node:assert/strict";
import test from "node:test";
import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import type {
  AdminSourceVideoStatusReadModel
} from "./admin-source-video-read-model.ts";
import {
  listAdminSourceVideoStatusPage,
  listAdminSourceVideoStatusPageWithRuntimeMeta,
  listAdminSourceVideoStatusesPage,
  listAdminSourceVideoStatusesPageWithRuntimeMeta
} from "./admin-source-video-status-page-query.ts";

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: PreprocessStatus;
  title?: string;
  relative_path?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: input.relative_path ?? `课程/${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.preprocess_status === "ready",
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: "",
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
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

function statusReadModel(input: Partial<AdminSourceVideoStatusReadModel> = {}): AdminSourceVideoStatusReadModel {
  return {
    schema_version: "1.0",
    generated_at: "2026-05-02T10:00:00.000Z",
    library_updated_at: "2026-05-02T10:00:00.000Z",
    video_count: 0,
    ids_by_status: {
      unprocessed: [],
      queued: [],
      processing: [],
      ready: [],
      failed: [],
      "index-required": []
    },
    ...input
  };
}

function makeReaders(input: {
  library?: (LibraryCounts & { updated_at?: string }) | null;
  model?: AdminSourceVideoStatusReadModel;
  store_status?: SourceVideoManifest[] | null;
  store_statuses?: SourceVideoManifest[] | null;
  manifests_by_id?: Map<string, SourceVideoManifest>;
} = {}) {
  const calls = {
    library: 0,
    status_store: 0,
    statuses_store: 0,
    model: 0,
    ids: [] as string[][]
  };
  const manifestsById = input.manifests_by_id ?? new Map<string, SourceVideoManifest>();

  return {
    calls,
    readers: {
      library_root: "/tmp/library",
      offset: 0,
      limit: 10,
      filtered_scan_batch_size: 2,
      async read_library_manifest() {
        calls.library += 1;
        return input.library ?? null;
      },
      async read_status_page_from_store() {
        calls.status_store += 1;
        return input.store_status ? { manifests: input.store_status } : null;
      },
      async read_statuses_page_from_store() {
        calls.statuses_store += 1;
        return input.store_statuses ? { manifests: input.store_statuses } : null;
      },
      async read_status_read_model() {
        calls.model += 1;
        return input.model ?? statusReadModel();
      },
      async read_manifests_by_ids(readerInput: { source_video_ids: string[] }) {
        calls.ids.push(readerInput.source_video_ids);
        return readerInput.source_video_ids
          .map((sourceVideoId) => manifestsById.get(sourceVideoId))
          .filter((manifest): manifest is SourceVideoManifest => Boolean(manifest));
      }
    }
  };
}

test("source-video status page query uses admin sqlite store before read-model fallback", async () => {
  const queued = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued"
  });
  const { calls, readers } = makeReaders({
    library: libraryCounts({ video_count: 1, queued_video_count: 1 }),
    store_status: [queued],
    model: statusReadModel({
      manifests_by_status: {
        queued: [sourceVideoManifest({
          source_video_id: "V999999",
          preprocess_status: "queued"
        })]
      }
    })
  });

  const result = await listAdminSourceVideoStatusPage({
    ...readers,
    status: "queued"
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(calls.status_store, 1);
  assert.equal(calls.model, 0);
  assert.deepEqual(calls.ids, []);
});

test("source-video status page query reports store pages as read-model hits", async () => {
  const queued = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued"
  });
  const { calls, readers } = makeReaders({
    library: libraryCounts({ video_count: 1, queued_video_count: 1 }),
    store_status: [queued]
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    status: "queued"
  });

  assert.deepEqual(result.manifests.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.deepEqual(
    result.component_timings?.map((component) => component.name),
    ["library_counts", "status_store_page"]
  );
  assert.equal(result.component_timings?.[1]?.cache_status, "hit");
  assert.equal(calls.model, 0);
  assert.deepEqual(calls.ids, []);
});

test("source-video status page query preserves store repair reason on read-model hits", async () => {
  const queued = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued"
  });
  const { readers } = makeReaders({
    library: libraryCounts({ video_count: 1, queued_video_count: 1 })
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    read_status_page_from_store: async () => ({
      page: {
        manifests: [queued]
      },
      repair_reason: "status-store:repaired-incomplete-manifest-rows"
    }),
    status: "queued"
  });

  assert.deepEqual(result.manifests.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.equal(result.repair_reason, "status-store:repaired-incomplete-manifest-rows");
});

test("source-video statuses page query uses multi-status store page first", async () => {
  const queued = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued"
  });
  const failed = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "failed"
  });
  const { calls, readers } = makeReaders({
    store_statuses: [queued, failed]
  });

  const result = await listAdminSourceVideoStatusesPage({
    ...readers,
    statuses: ["queued", "failed"]
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.equal(calls.statuses_store, 1);
  assert.equal(calls.model, 0);
});

test("source-video status page query reports read-model id fallback components", async () => {
  const queued = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued"
  });
  const { readers } = makeReaders({
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: ["V000001"],
        processing: [],
        ready: [],
        failed: [],
        "index-required": []
      }
    }),
    manifests_by_id: new Map([["V000001", queued]])
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    status: "queued"
  });

  assert.deepEqual(result.manifests.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "miss");
  assert.deepEqual(
    result.component_timings?.map((component) => component.name),
    ["library_counts", "status_store_page", "status_read_model", "manifest_id_page"]
  );
  assert.equal(result.component_timings?.[1]?.cache_status, "miss");
  assert.equal(result.component_timings?.[3]?.data_source, "source-video-manifest");
});

test("source-video status page query filters and paginates JSON read-model manifest rows", async () => {
  const { calls, readers } = makeReaders({
    model: statusReadModel({
      manifests_by_status: {
        queued: [
          sourceVideoManifest({
            source_video_id: "V000001",
            preprocess_status: "queued",
            title: "现金流素材 A"
          }),
          sourceVideoManifest({
            source_video_id: "V000002",
            preprocess_status: "queued",
            title: "现金流素材 B"
          }),
          sourceVideoManifest({
            source_video_id: "V000003",
            preprocess_status: "queued",
            title: "其他素材"
          })
        ]
      }
    })
  });

  const result = await listAdminSourceVideoStatusPage({
    ...readers,
    status: "queued",
    query: "现金流",
    offset: 1,
    limit: 1
  });

  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.equal(calls.model, 1);
  assert.deepEqual(calls.ids, []);
});

test("source-video status page query reports JSON read-model manifest rows as hits", async () => {
  const { calls, readers } = makeReaders({
    model: statusReadModel({
      manifests_by_status: {
        queued: [
          sourceVideoManifest({
            source_video_id: "V000001",
            preprocess_status: "queued"
          })
        ]
      }
    })
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    status: "queued"
  });

  assert.deepEqual(result.manifests.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "hit");
  assert.equal(calls.model, 1);
  assert.deepEqual(calls.ids, []);
});

test("source-video status page query falls back to paged ID manifest reads without query", async () => {
  const manifestsById = new Map([
    ["V000002", sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued"
    })],
    ["V000003", sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "queued"
    })]
  ]);
  const { calls, readers } = makeReaders({
    manifests_by_id: manifestsById,
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: ["V000001", "V000002", "V000003", "V000004"],
        processing: [],
        ready: [],
        failed: [],
        "index-required": []
      }
    })
  });

  const result = await listAdminSourceVideoStatusPage({
    ...readers,
    status: "queued",
    offset: 1,
    limit: 2
  });

  assert.deepEqual(calls.ids, [["V000002", "V000003"]]);
  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000002", "V000003"]);
});

test("source-video status page query reports ID fallback as source manifest misses", async () => {
  const manifestsById = new Map([
    ["V000002", sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued"
    })]
  ]);
  const { calls, readers } = makeReaders({
    manifests_by_id: manifestsById,
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: ["V000001", "V000002"],
        processing: [],
        ready: [],
        failed: [],
        "index-required": []
      }
    })
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    status: "queued",
    offset: 1,
    limit: 1
  });

  assert.deepEqual(result.manifests.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "miss");
  assert.deepEqual(calls.ids, [["V000002"]]);
});

test("source-video status page query blocks manifest ID fallback when policy forbids it", async () => {
  const manifestsById = new Map([
    ["V000002", sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "processing"
    })]
  ]);
  const { calls, readers } = makeReaders({
    manifests_by_id: manifestsById,
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: [],
        processing: ["V000002"],
        ready: [],
        failed: [],
        "index-required": []
      }
    })
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    read_status_page_from_store: async () => ({
      page: null,
      miss_reason: "store-not-fresh"
    }),
    status: "processing",
    offset: 0,
    limit: 1,
    manifest_fallback_policy: "forbid"
  });

  assert.deepEqual(result.manifests, []);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.fallback_reason, "manifest-fallback:forbidden");
  assert.deepEqual(calls.ids, []);
  assert.deepEqual(
    result.component_timings?.map((component) => component.name),
    ["library_counts", "status_store_page", "status_read_model", "manifest_fallback_policy"]
  );
  assert.equal(result.component_timings?.at(-1)?.scan_mode, "no-scan");
  assert.equal(
    result.component_timings?.at(-1)?.detail?.includes("store_miss=status-store:store-not-fresh"),
    true
  );
});

test("source-video status page query carries store miss reason into manifest fallback metadata", async () => {
  const manifestsById = new Map([
    ["V000002", sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued"
    })]
  ]);
  const { calls, readers } = makeReaders({
    manifests_by_id: manifestsById,
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: ["V000001", "V000002"],
        processing: [],
        ready: [],
        failed: [],
        "index-required": []
      }
    })
  });

  const result = await listAdminSourceVideoStatusPageWithRuntimeMeta({
    ...readers,
    read_status_page_from_store: async () => ({
      page: null,
      miss_reason: "store-not-fresh"
    }),
    status: "queued",
    offset: 1,
    limit: 1
  });

  assert.deepEqual(result.manifests.map((manifest) => manifest.source_video_id), ["V000002"]);
  assert.equal(result.actual_data_source, "source-video-manifest");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.fallback_reason, "status-store:store-not-fresh");
  assert.deepEqual(calls.ids, [["V000002"]]);
});

test("source-video statuses page query blocks multi-status manifest fallback when policy forbids it", async () => {
  const manifestsById = new Map([
    ["V000002", sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued"
    })],
    ["V000003", sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "failed"
    })]
  ]);
  const { calls, readers } = makeReaders({
    manifests_by_id: manifestsById,
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: ["V000002"],
        processing: [],
        ready: [],
        failed: ["V000003"],
        "index-required": []
      }
    })
  });

  const result = await listAdminSourceVideoStatusesPageWithRuntimeMeta({
    ...readers,
    read_statuses_page_from_store: async () => ({
      page: null,
      miss_reason: "incomplete-manifest-rows"
    }),
    statuses: ["queued", "failed"],
    offset: 0,
    limit: 2,
    manifest_fallback_policy: "forbid"
  });

  assert.deepEqual(result.manifests, []);
  assert.equal(result.actual_data_source, "admin-read-model");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.fallback_reason, "manifest-fallback:forbidden");
  assert.deepEqual(calls.ids, []);
  assert.equal(
    result.component_timings?.at(-1)?.detail?.includes("status=queued,failed"),
    true
  );
});

test("source-video status page query scans ID batches until query page is filled", async () => {
  const manifestsById = new Map([
    ["V000001", sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued",
      title: "普通素材"
    })],
    ["V000002", sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued",
      title: "其他素材"
    })],
    ["V000003", sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "queued",
      title: "现金流 C0326"
    })]
  ]);
  const { calls, readers } = makeReaders({
    manifests_by_id: manifestsById,
    model: statusReadModel({
      ids_by_status: {
        unprocessed: [],
        queued: ["V000001", "V000002", "V000003"],
        processing: [],
        ready: [],
        failed: [],
        "index-required": []
      }
    })
  });

  const result = await listAdminSourceVideoStatusPage({
    ...readers,
    status: "queued",
    query: "C0326",
    offset: 0,
    limit: 1
  });

  assert.deepEqual(calls.ids, [["V000001", "V000002"], ["V000003"]]);
  assert.deepEqual(result.map((manifest) => manifest.source_video_id), ["V000003"]);
});
