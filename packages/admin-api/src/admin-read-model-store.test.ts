import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";
import {
  adminReadModelStorePath,
  markAdminReadModelStoreStale,
  planAdminReadModelStoreReconciliation,
  readAdminDashboardMaterialSummaryFromStore,
  readAdminDashboardProductionSummaryFromStore,
  readAdminPreprocessJobManifestPageFromStore,
  readAdminPreprocessProcessHistoryReadinessFromStore,
  readAdminPreprocessProcessHistoryFromStore,
  readAdminReadModelStoreStatus,
  readAdminSourceVideoStatusPageFromStore,
  readAdminSourceVideoStatusPageFromStoreWithReadiness,
  readAdminSourceVideoStatusesPageFromStore,
  readAdminSourceVideoStatusesPageFromStoreWithReadiness,
  reconcileAdminReadModelStoreFromManifestSnapshot,
  writeAdminSourceVideoManifestsToReadModelStore,
  writeAdminSourceVideoManifestToReadModelStore,
  writeAdminSourceVideoStatusReadModelStore
} from "./admin-read-model-store.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-read-model-store-"));
}

function sourceVideoManifest(input: {
  source_video_id: string;
  preprocess_status: SourceVideoManifest["preprocess_status"];
  title?: string;
  source_folder_name?: string;
  visible_to_cutters?: boolean;
  duration_ms?: number;
  file_size?: number;
}): SourceVideoManifest {
  const sourceFolderName = input.source_folder_name ?? "课程";
  return {
    source_video_id: input.source_video_id,
    title: input.title ?? input.source_video_id,
    relative_path: `${sourceFolderName}/${input.source_video_id}.mp4`,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: input.duration_ms ?? 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: input.file_size ?? 1024,
    content_hash: `hash-${input.source_video_id}`,
    preprocess_status: input.preprocess_status,
    visible_to_cutters: input.visible_to_cutters ?? input.preprocess_status === "ready",
    transcript_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.json` : "",
    srt_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/transcript.srt` : "",
    keyframes_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/keyframes.json` : "",
    cover_path: input.preprocess_status === "ready" ? `artifacts/${input.source_video_id}/cover.jpg` : "",
    description: "测试素材描述",
    tags: ["测试"],
    lecturer: "测试讲师",
    course: "测试课程",
    category: "测试分类"
  };
}

function preprocessJobSnapshot(input: {
  source_video_id: string;
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  failed_at?: string;
}) {
  return {
    source_video_id: input.source_video_id,
    claimed_at: input.claimed_at ?? "",
    completed_at: input.completed_at ?? "",
    indexed_at: input.indexed_at ?? "",
    failed_at: input.failed_at ?? ""
  };
}

test("admin read model store reports missing without scanning manifests", async () => {
  const libraryRoot = await makeLibraryRoot();
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: null
  });

  assert.equal(status.storage, "sqlite");
  assert.equal(status.exists, false);
  assert.equal(status.freshness, "missing");
  assert.equal(status.path, adminReadModelStorePath(libraryRoot));
});

test("admin read model store persists source video status counts to sqlite", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 1,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready",
        title: "已就绪素材"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued",
        title: "排队素材",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "index-required",
        title: "待发布素材",
        visible_to_cutters: false
      })
    ]
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model
  });

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });

  assert.equal(status.exists, true);
  assert.equal(status.freshness, "fresh");
  assert.equal(status.storage, "sqlite");
  assert.equal(status.generated_at, "2026-06-25T12:01:00.000Z");
  assert.equal(status.library_updated_at, "2026-06-25T12:00:00.000Z");
  assert.equal(status.counts_by_status.ready, 1);
  assert.equal(status.counts_by_status.queued, 1);
  assert.equal(status.counts_by_status["index-required"], 1);
});

test("admin read model store creates process-history covering index", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [
        sourceVideoManifest({
          source_video_id: "V000001",
          preprocess_status: "queued",
          visible_to_cutters: false
        })
      ]
    })
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_admin_source_video_status_history_cover'
  `).get() as { name: string } | undefined;
  db.close();

  assert.equal(row?.name, "idx_admin_source_video_status_history_cover");
});

test("admin read model store exposes dashboard material summary only from complete snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 1,
    failed_video_count: 0,
    index_required_video_count: 1,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready",
      duration_ms: 120_000,
      file_size: 4000
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "unprocessed",
      visible_to_cutters: false,
      duration_ms: 60_000,
      file_size: 2000
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "index-required",
      visible_to_cutters: false,
      duration_ms: 30_000,
      file_size: 1000
    })
  ];

  const rebuilt = await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests,
    default_page_limit: 20,
    generated_at: "2026-06-25T12:01:00.000Z"
  });
  const summary = await readAdminDashboardMaterialSummaryFromStore({
    library_root: libraryRoot,
    library
  });

  assert.equal(rebuilt.applied, true);
  assert.deepEqual(summary, {
    video_count: 3,
    ready_video_count: 1,
    total_duration_ms: 210_000,
    ready_duration_ms: 120_000,
    unprocessed_duration_ms: 60_000,
    total_size_bytes: 7000
  });

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  assert.equal(status.projections?.material_summary.status, "ready");
  assert.equal(status.projections?.material_summary.requires_background_reconcile, false);
});

test("admin read model store does not expose dashboard material summary for placeholder-only rows", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 2,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready",
      duration_ms: 120_000,
      file_size: 4000
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "ready",
      duration_ms: 60_000,
      file_size: 2000
    })
  ];

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 1,
      manifests
    })
  });

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const summary = await readAdminDashboardMaterialSummaryFromStore({
    library_root: libraryRoot,
    library
  });

  assert.equal(status.freshness, "fresh");
  assert.equal(status.projections?.material_summary.status, "missing");
  assert.equal(status.projections?.material_summary.reason, "missing_metadata");
  assert.equal(status.projections?.material_summary.scan_mode, "full-reconcile");
  assert.equal(status.projections?.material_summary.requires_background_reconcile, true);
  assert.equal(status.projections?.material_summary.safe_for_page_request, true);
  assert.equal(summary, null);
});

test("admin read model store exposes dashboard production summary from complete job snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 1,
    index_required_video_count: 1,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "index-required",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "failed",
      visible_to_cutters: false
    })
  ];

  const rebuilt = await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests,
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        claimed_at: "2026-06-26T10:00:00.000Z",
        completed_at: "2026-06-26T10:05:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        claimed_at: "2026-06-26T09:00:00.000Z",
        indexed_at: "2026-06-26T09:02:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000003",
        claimed_at: "2026-06-26T08:00:00.000Z",
        failed_at: "2026-06-26T08:03:00.000Z"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-26T12:01:00.000Z"
  });
  const summary = await readAdminDashboardProductionSummaryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-26T12:30:00.000Z"
  });

  assert.equal(rebuilt.applied, true);
  assert.deepEqual(summary, {
    completed_today_count: 2,
    failed_today_count: 1,
    average_video_process_ms: 210_000
  });
});

test("admin read model store reads dashboard production average from metadata", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 2,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-26T12:00:00.000Z"
  };
  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "ready"
      })
    ],
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        claimed_at: "2026-06-26T10:00:00.000Z",
        completed_at: "2026-06-26T10:05:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        claimed_at: "2026-06-26T09:00:00.000Z",
        indexed_at: "2026-06-26T09:01:00.000Z"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-26T12:01:00.000Z"
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  try {
    db.prepare(`
      UPDATE preprocess_job_status
      SET completed_at = '2026-06-26T12:00:00.000Z'
      WHERE source_video_id = 'V000001'
    `).run();
  } finally {
    db.close();
  }

  const summary = await readAdminDashboardProductionSummaryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-26T12:30:00.000Z"
  });

  assert.deepEqual(summary, {
    completed_today_count: 2,
    failed_today_count: 0,
    average_video_process_ms: 180_000
  });
});

test("admin read model store counts dashboard production day ranges without double counting", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 4,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 1,
    index_required_video_count: 1,
    updated_at: "2026-06-26T12:00:00.000Z"
  };

  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "index-required",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "failed",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000004",
        preprocess_status: "queued",
        visible_to_cutters: false
      })
    ],
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        claimed_at: "2026-06-25T23:59:00.000Z",
        completed_at: "2026-06-26T00:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        claimed_at: "2026-06-26T10:00:00.000Z",
        completed_at: "2026-06-26T10:02:00.000Z",
        indexed_at: "2026-06-26T10:05:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000003",
        claimed_at: "2026-06-26T11:00:00.000Z",
        failed_at: "2026-06-26T12:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000004",
        claimed_at: "2026-06-26T23:59:00.000Z",
        completed_at: "2026-06-27T00:00:00.000Z"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-26T12:01:00.000Z"
  });

  const summary = await readAdminDashboardProductionSummaryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-26T12:30:00.000Z"
  });

  assert.deepEqual(summary, {
    completed_today_count: 2,
    failed_today_count: 1,
    average_video_process_ms: 140_000
  });
});

test("admin read model store does not expose dashboard production summary from incomplete job snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const ready = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready"
  });
  const queued = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    visible_to_cutters: false
  });

  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests: [ready, queued],
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        claimed_at: "2026-06-26T10:00:00.000Z",
        completed_at: "2026-06-26T10:05:00.000Z"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-26T12:01:00.000Z"
  });

  const summary = await readAdminDashboardProductionSummaryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-26T12:30:00.000Z"
  });

  assert.equal(summary, null);
});

test("admin read model store does not expose dashboard production summary when snapshot metadata count mismatches", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 2,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-26T12:00:00.000Z"
  };
  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "ready"
      })
    ],
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        completed_at: "2026-06-26T10:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        completed_at: "2026-06-26T11:00:00.000Z"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-26T12:01:00.000Z"
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  try {
    db.prepare(`
      UPDATE metadata
      SET value = '1'
      WHERE key = 'preprocess_job_snapshot_row_count'
    `).run();
  } finally {
    db.close();
  }

  const summary = await readAdminDashboardProductionSummaryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-26T12:30:00.000Z"
  });

  assert.equal(summary, null);
});

test("admin read model store write-through without job snapshot invalidates dashboard production summary", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const ready = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready"
  });
  const queued = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests: [ready, queued],
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        claimed_at: "2026-06-26T10:00:00.000Z",
        completed_at: "2026-06-26T10:05:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-26T12:01:00.000Z"
  });

  const nextLibrary = {
    ...library,
    ready_video_count: 2,
    queued_video_count: 0,
    updated_at: "2026-06-26T12:05:00.000Z"
  };
  const updated = await writeAdminSourceVideoManifestToReadModelStore({
    library_root: libraryRoot,
    library: nextLibrary,
    manifest: sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "ready",
      visible_to_cutters: true
    }),
    generated_at: "2026-06-26T12:05:01.000Z"
  });
  const summary = await readAdminDashboardProductionSummaryFromStore({
    library_root: libraryRoot,
    library: nextLibrary,
    now: "2026-06-26T12:30:00.000Z"
  });

  assert.equal(updated.applied, true);
  assert.equal(summary, null);
});

test("admin read model store serves fresh non-ready source-video status pages", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 0,
    processing_video_count: 1,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 1,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "processing",
        title: "正在处理"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued",
        title: "等待处理",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "index-required",
        title: "待发布素材",
        visible_to_cutters: false
      })
    ]
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model
  });

  const page = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "index-required",
    offset: 0,
    limit: 10
  });
  const combined = await readAdminSourceVideoStatusesPageFromStore({
    library_root: libraryRoot,
    library,
    statuses: ["queued", "processing"],
    offset: 0,
    limit: 10
  });
  const queried = await readAdminSourceVideoStatusesPageFromStore({
    library_root: libraryRoot,
    library,
    statuses: ["queued", "processing", "index-required"],
    offset: 0,
    limit: 10,
    query: "待发布"
  });

  assert.equal(page?.source, "admin-read-model-store");
  assert.deepEqual(page?.manifests.map((manifest) => manifest.source_video_id), ["V000003"]);
  assert.deepEqual(
    combined?.manifests.map((manifest) => manifest.source_video_id),
    ["V000002", "V000001"]
  );
  assert.deepEqual(queried?.manifests.map((manifest) => manifest.source_video_id), ["V000003"]);
});

test("admin read model store explains status page store miss reasons", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const ready = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready"
  });
  const queued = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    visible_to_cutters: false
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [ready, queued]
    })
  });

  const readyRead = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    status: "ready",
    offset: 0,
    limit: 10
  });
  const staleRead = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library: {
      ...library,
      video_count: 3,
      queued_video_count: 2,
      updated_at: "2026-06-25T12:05:00.000Z"
    },
    status: "queued",
    offset: 0,
    limit: 10
  });
  const hitRead = await readAdminSourceVideoStatusesPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    statuses: ["queued"],
    offset: 0,
    limit: 10
  });

  assert.equal(readyRead.page, null);
  assert.equal(readyRead.miss_reason, "unsupported-status");
  assert.equal(readyRead.freshness, "not-applicable");
  assert.equal(staleRead.page, null);
  assert.equal(staleRead.miss_reason, "store-not-fresh");
  assert.equal(staleRead.freshness, "stale");
  assert.equal(hitRead.miss_reason, "");
  assert.equal(hitRead.freshness, "fresh");
  assert.deepEqual(hitRead.page?.manifests.map((manifest) => manifest.source_video_id), ["V000002"]);
});

test("admin read model store retries transient locked status page reads", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const queued = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued",
    visible_to_cutters: false
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [queued]
    }),
    manifests: [queued]
  });

  const lockDb = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  lockDb.exec("BEGIN EXCLUSIVE");
  const releaseLock = new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        lockDb.exec("ROLLBACK");
      } finally {
        lockDb.close();
        resolve();
      }
    }, 120);
  });

  const read = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 10
  });
  await releaseLock;

  assert.equal(read.miss_reason, "");
  assert.equal(read.freshness, "fresh");
  assert.deepEqual(read.page?.manifests.map((manifest) => manifest.source_video_id), ["V000001"]);
});

test("admin read model store pushes status query candidate filtering before manifest parsing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 2,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const matched = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    title: "命中素材",
    visible_to_cutters: false
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: {
      schema_version: "1.0",
      generated_at: "2026-06-25T12:01:00.000Z",
      library_updated_at: "2026-06-25T12:00:00.000Z",
      video_count: 2,
      ids_by_status: {
        unprocessed: [],
        queued: ["V000001", "V000002"],
        processing: [],
        ready: [],
        failed: [],
        "index-required": []
      },
      manifests_by_status: {
        queued: [matched]
      },
      default_source_video_page: {
        offset: 0,
        limit: 20,
        manifests: [matched]
      }
    }
  });

  const defaultPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 10
  });
  const queriedPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 10,
    query: "命中"
  });

  assert.equal(defaultPage, null);
  assert.equal(queriedPage?.source, "admin-read-model-store");
  assert.deepEqual(queriedPage?.manifests.map((manifest) => manifest.source_video_id), ["V000002"]);

  const defaultRead = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 10
  });

  assert.equal(defaultRead.page, null);
  assert.equal(defaultRead.miss_reason, "incomplete-manifest-rows");
  assert.equal(defaultRead.freshness, "fresh");
  assert.deepEqual(defaultRead.missing_source_video_ids, ["V000001"]);
});

test("admin read model store stops query candidate parsing when the requested page is filled", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 2,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "queued",
    title: "宽泛查询 命中第一页",
    visible_to_cutters: false
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    title: "宽泛查询 损坏候选",
    visible_to_cutters: false
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [first, second]
    })
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  try {
    db.prepare(`
      UPDATE source_video_status
      SET manifest_json = ''
      WHERE source_video_id = ?
    `).run("V000002");
  } finally {
    db.close();
  }

  const firstPage = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 1,
    query: "宽泛查询"
  });
  const secondPage = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 1,
    limit: 1,
    query: "宽泛查询"
  });

  assert.equal(firstPage.page?.source, "admin-read-model-store");
  assert.deepEqual(firstPage.page?.manifests.map((manifest) => manifest.source_video_id), ["V000001"]);
  assert.equal(firstPage.miss_reason, "");
  assert.equal(secondPage.page, null);
  assert.equal(secondPage.miss_reason, "incomplete-manifest-rows");
  assert.deepEqual(secondPage.missing_source_video_ids, ["V000002"]);
});

test("admin read model store reports all missing derived manifests on the requested status page", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 3,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "queued",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "queued",
      visible_to_cutters: false
    })
  ];

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests
    })
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  try {
    db.prepare(`
      UPDATE source_video_status
      SET manifest_json = ''
      WHERE source_video_id IN (?, ?)
    `).run("V000001", "V000003");
  } finally {
    db.close();
  }

  const read = await readAdminSourceVideoStatusPageFromStoreWithReadiness({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 3
  });

  assert.equal(read.page, null);
  assert.equal(read.miss_reason, "incomplete-manifest-rows");
  assert.deepEqual(read.missing_source_video_ids, ["V000001", "V000003"]);
});

test("admin read model store refuses ready or stale status pages", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued",
        visible_to_cutters: false
      })
    ]
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model
  });

  const readyPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "ready",
    offset: 0,
    limit: 10
  });
  const stalePage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library: {
      ...library,
      video_count: 3,
      queued_video_count: 2,
      updated_at: "2026-06-25T12:05:00.000Z"
    },
    status: "queued",
    offset: 0,
    limit: 10
  });

  assert.equal(readyPage, null);
  assert.equal(stalePage, null);
});

test("admin read model store serves bounded preprocess job pages including ready history", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 7,
    ready_video_count: 1,
    processing_video_count: 1,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 2,
    index_required_video_count: 2,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "processing",
      title: "正在处理"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued",
      title: "排队处理",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "failed",
      title: "较早失败",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000004",
      preprocess_status: "failed",
      title: "较新失败",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000005",
      preprocess_status: "index-required",
      title: "较早待发布",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000006",
      preprocess_status: "index-required",
      title: "较新待发布",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000007",
      preprocess_status: "ready",
      title: "完成历史"
    })
  ];
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model,
    manifests,
    preprocess_jobs: manifests.map((manifest) => preprocessJobSnapshot({
      source_video_id: manifest.source_video_id,
      claimed_at: "2026-06-25T11:00:00.000Z",
      completed_at: manifest.preprocess_status === "ready" ? "2026-06-25T11:10:00.000Z" : "",
      indexed_at: manifest.preprocess_status === "index-required" ? "2026-06-25T11:08:00.000Z" : "",
      failed_at: manifest.preprocess_status === "failed" ? "2026-06-25T11:06:00.000Z" : ""
    }))
  });

  const firstPage = await readAdminPreprocessJobManifestPageFromStore({
    library_root: libraryRoot,
    library,
    offset: 0,
    limit: 4
  });
  const laterNonReadyPage = await readAdminPreprocessJobManifestPageFromStore({
    library_root: libraryRoot,
    library,
    offset: 4,
    limit: 2
  });
  const readyExtendingPage = await readAdminPreprocessJobManifestPageFromStore({
    library_root: libraryRoot,
    library,
    offset: 5,
    limit: 2
  });
  const failedOnlyPage = await readAdminPreprocessJobManifestPageFromStore({
    library_root: libraryRoot,
    library,
    offset: 0,
    limit: 10,
    status: "failed"
  });

  assert.deepEqual(
    firstPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000001", "V000002", "V000004", "V000003"]
  );
  assert.deepEqual(
    laterNonReadyPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000006", "V000005"]
  );
  assert.deepEqual(
    readyExtendingPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000005", "V000007"]
  );
  assert.deepEqual(firstPage?.preprocess_jobs, []);
  assert.deepEqual(
    laterNonReadyPage?.preprocess_jobs.map((job) => job.source_video_id),
    []
  );
  assert.deepEqual(
    readyExtendingPage?.preprocess_jobs.map((job) => job.source_video_id),
    ["V000007"]
  );
  assert.deepEqual(
    failedOnlyPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000004", "V000003"]
  );
});

test("preprocess job page avoids global snapshot row-count checks on the page hot path", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 2,
    processing_video_count: 1,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "processing",
      title: "正在处理"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "ready",
      title: "当前页完成"
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "ready",
      title: "缺失快照"
    })
  ];
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model,
    manifests,
    preprocess_jobs: manifests.map((manifest) => preprocessJobSnapshot({
      source_video_id: manifest.source_video_id,
      claimed_at: "2026-06-25T11:00:00.000Z",
      completed_at: manifest.preprocess_status === "ready" ? "2026-06-25T11:10:00.000Z" : ""
    }))
  });

  const db = new DatabaseSync(adminReadModelStorePath(libraryRoot));
  try {
    db.prepare("DELETE FROM preprocess_job_status WHERE source_video_id = ?").run("V000003");
  } finally {
    db.close();
  }

  const currentPage = await readAdminPreprocessJobManifestPageFromStore({
    library_root: libraryRoot,
    library,
    offset: 0,
    limit: 2
  });
  const pageWithMissingReadySnapshot = await readAdminPreprocessJobManifestPageFromStore({
    library_root: libraryRoot,
    library,
    offset: 2,
    limit: 1
  });
  const readiness = await readAdminPreprocessProcessHistoryReadinessFromStore({
    library_root: libraryRoot,
    library
  });

  assert.deepEqual(
    currentPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000001", "V000002"]
  );
  assert.deepEqual(
    currentPage?.preprocess_jobs.map((job) => job.source_video_id),
    ["V000002"]
  );
  assert.deepEqual(
    pageWithMissingReadySnapshot?.manifests.map((manifest) => manifest.source_video_id),
    ["V000003"]
  );
  assert.deepEqual(pageWithMissingReadySnapshot?.preprocess_jobs, []);
  assert.equal(readiness.ready_for_process_history, false);
  assert.equal(readiness.reason, "table_row_count_mismatch");
});

test("admin read model store exposes bounded preprocess process history from complete snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 5,
    ready_video_count: 2,
    processing_video_count: 1,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 1,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready",
      title: "最近完成"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "failed",
      title: "最近失败",
      source_folder_name: "故障素材",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000003",
      preprocess_status: "processing",
      title: "正在处理",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000004",
      preprocess_status: "queued",
      title: "等待处理",
      visible_to_cutters: false
    }),
    sourceVideoManifest({
      source_video_id: "V000005",
      preprocess_status: "ready",
      title: "很早完成"
    })
  ];

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests
    }),
    manifests,
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        claimed_at: "2026-06-24T09:50:00.000Z",
        completed_at: "2026-06-24T10:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        claimed_at: "2026-06-23T10:00:00.000Z",
        failed_at: "2026-06-23T10:05:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000003",
        claimed_at: "2026-06-25T11:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000004"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000005",
        claimed_at: "2026-05-01T08:00:00.000Z",
        completed_at: "2026-05-01T08:20:00.000Z"
      })
    ]
  });

  const history = await readAdminPreprocessProcessHistoryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-25T12:00:00.000Z",
    window_days: 7,
    limit: 3
  });

  assert.equal(history?.source, "admin-read-model-store");
  assert.equal(history?.generated_at, "2026-06-25T12:01:00.000Z");
  assert.deepEqual(history?.filters, {
    source_folder_name: "",
    preprocess_status: "",
    event_type: ""
  });
  assert.deepEqual(history?.filter_options, {
    source_folder_names: ["课程", "故障素材"],
    preprocess_statuses: ["queued", "processing", "ready", "failed"],
    event_types: ["failed", "completed", "claimed", "status"]
  });
  assert.deepEqual(
    history?.items.map((item) => [
      item.source_video_id,
      item.title,
      item.preprocess_status,
      item.last_event_type,
      item.last_event_at,
      item.elapsed_ms
    ]),
    [
      ["V000003", "正在处理", "processing", "claimed", "2026-06-25T11:00:00.000Z", 0],
      ["V000001", "最近完成", "ready", "completed", "2026-06-24T10:00:00.000Z", 600_000],
      ["V000002", "最近失败", "failed", "failed", "2026-06-23T10:05:00.000Z", 300_000]
    ]
  );
  assert.deepEqual(history?.summary, {
    returned_count: 3,
    completed_count: 1,
    failed_count: 1,
    active_count: 1,
    average_process_ms: 450_000,
    tracked_count: 4,
    tracked_completed_count: 1,
    tracked_failed_count: 1,
    tracked_active_count: 2,
    tracked_average_process_ms: 450_000,
    window_start_at: "2026-06-18T12:00:00.000Z",
    newest_event_at: "2026-06-25T11:00:00.000Z",
    oldest_event_at: "2026-06-23T10:05:00.000Z",
    status_counts: {
      unprocessed: 0,
      queued: 1,
      processing: 1,
      ready: 1,
      failed: 1,
      "index-required": 0
    },
    event_counts: {
      failed: 1,
      indexed: 0,
      completed: 1,
      claimed: 1,
      status: 1
    },
    source_folder_summaries: [
      {
        source_folder_name: "课程",
        tracked_count: 3,
        completed_count: 1,
        failed_count: 0,
        active_count: 2,
        average_process_ms: 600_000,
        newest_event_at: "2026-06-25T11:00:00.000Z"
      },
      {
        source_folder_name: "故障素材",
        tracked_count: 1,
        completed_count: 0,
        failed_count: 1,
        active_count: 0,
        average_process_ms: 300_000,
        newest_event_at: "2026-06-23T10:05:00.000Z"
      }
    ],
    daily_trend: [
      {
        date: "2026-06-25",
        tracked_count: 1,
        completed_count: 0,
        failed_count: 0,
        active_count: 1,
        average_process_ms: 0
      },
      {
        date: "2026-06-24",
        tracked_count: 1,
        completed_count: 1,
        failed_count: 0,
        active_count: 0,
        average_process_ms: 600_000
      },
      {
        date: "2026-06-23",
        tracked_count: 1,
        completed_count: 0,
        failed_count: 1,
        active_count: 0,
        average_process_ms: 300_000
      }
    ]
  });

  const filteredHistory = await readAdminPreprocessProcessHistoryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-25T12:00:00.000Z",
    window_days: 7,
    limit: 10,
    filters: {
      source_folder_name: "故障素材",
      preprocess_status: "failed",
      event_type: "failed"
    }
  });

  assert.deepEqual(filteredHistory?.filters, {
    source_folder_name: "故障素材",
    preprocess_status: "failed",
    event_type: "failed"
  });
  assert.deepEqual(
    filteredHistory?.items.map((item) => [item.source_video_id, item.source_folder_name, item.preprocess_status, item.last_event_type]),
    [["V000002", "故障素材", "failed", "failed"]]
  );
  assert.deepEqual(filteredHistory?.summary.source_folder_summaries, [
    {
      source_folder_name: "故障素材",
      tracked_count: 1,
      completed_count: 0,
      failed_count: 1,
      active_count: 0,
      average_process_ms: 300_000,
      newest_event_at: "2026-06-23T10:05:00.000Z"
    }
  ]);
});

test("admin read model store refuses preprocess process history from incomplete snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready"
    })
  ];

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests
    }),
    manifests
  });

  assert.equal(await readAdminPreprocessProcessHistoryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-25T12:00:00.000Z",
    window_days: 7,
    limit: 20
  }), null);
});

test("admin read model store explains process history readiness for complete snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 1,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "processing",
      visible_to_cutters: false
    })
  ];

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests
    }),
    manifests,
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        completed_at: "2026-06-25T11:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        claimed_at: "2026-06-25T11:55:00.000Z"
      })
    ]
  });

  const readiness = await readAdminPreprocessProcessHistoryReadinessFromStore({
    library_root: libraryRoot,
    library
  });

  assert.equal(readiness.ready_for_process_history, true);
  assert.equal(readiness.reason, "ready");
  assert.equal(readiness.scan_mode, "no-scan");
  assert.equal(readiness.snapshot_complete, true);
  assert.equal(readiness.expected_job_snapshot_rows, 2);
  assert.equal(readiness.snapshot_metadata_row_count, 2);
  assert.equal(readiness.snapshot_table_row_count, 2);
  assert.equal(readiness.metadata_row_count_matches, true);
  assert.equal(readiness.table_row_count_matches, true);
});

test("admin read model store preserves complete process history snapshot during status refresh", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 1,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "processing",
      visible_to_cutters: false
    })
  ];
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model,
    manifests,
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        completed_at: "2026-06-25T11:00:00.000Z"
      }),
      preprocessJobSnapshot({
        source_video_id: "V000002",
        claimed_at: "2026-06-25T11:55:00.000Z"
      })
    ]
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: {
      ...model,
      generated_at: "2026-06-25T12:02:00.000Z"
    },
    manifests
  });

  const readiness = await readAdminPreprocessProcessHistoryReadinessFromStore({
    library_root: libraryRoot,
    library
  });
  const history = await readAdminPreprocessProcessHistoryFromStore({
    library_root: libraryRoot,
    library,
    now: "2026-06-25T12:05:00.000Z",
    window_days: 7,
    limit: 20
  });

  assert.equal(readiness.ready_for_process_history, true);
  assert.equal(readiness.reason, "ready");
  assert.equal(readiness.snapshot_metadata_row_count, 2);
  assert.equal(readiness.snapshot_table_row_count, 2);
  assert.equal(history?.items.length, 2);
});

test("admin read model store preserves complete material projection during status refresh", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 1,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready",
      duration_ms: 120_000,
      file_size: 4000
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "processing",
      visible_to_cutters: false,
      duration_ms: 60_000,
      file_size: 2000
    })
  ];
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model,
    manifests
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: {
      ...model,
      generated_at: "2026-06-25T12:02:00.000Z"
    }
  });

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const summary = await readAdminDashboardMaterialSummaryFromStore({
    library_root: libraryRoot,
    library
  });
  const processingPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "processing",
    offset: 0,
    limit: 20
  });

  assert.equal(status.projections?.material_summary.status, "ready");
  assert.equal(status.projections?.material_summary.requires_background_reconcile, false);
  assert.equal(summary?.video_count, 2);
  assert.equal(summary?.total_duration_ms, 180_000);
  assert.equal(summary?.total_size_bytes, 6000);
  assert.deepEqual(processingPage?.manifests.map((manifest) => manifest.source_video_id), ["V000002"]);
});

test("admin read model store explains process history miss for incomplete snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready"
    })
  ];

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests
    }),
    manifests
  });

  const readiness = await readAdminPreprocessProcessHistoryReadinessFromStore({
    library_root: libraryRoot,
    library
  });

  assert.equal(readiness.ready_for_process_history, false);
  assert.equal(readiness.reason, "snapshot_incomplete");
  assert.equal(readiness.snapshot_complete, false);
  assert.equal(readiness.expected_job_snapshot_rows, 1);
  assert.equal(readiness.snapshot_metadata_row_count, 0);
  assert.equal(readiness.snapshot_table_row_count, 0);
});

test("admin read model store explains process history miss for rejected partial job snapshots", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifests = [
    sourceVideoManifest({
      source_video_id: "V000001",
      preprocess_status: "ready"
    }),
    sourceVideoManifest({
      source_video_id: "V000002",
      preprocess_status: "queued",
      visible_to_cutters: false
    })
  ];

  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests,
    preprocess_jobs: [
      preprocessJobSnapshot({
        source_video_id: "V000001",
        completed_at: "2026-06-25T11:00:00.000Z"
      })
    ],
    default_page_limit: 20,
    generated_at: "2026-06-25T12:01:00.000Z"
  });

  const readiness = await readAdminPreprocessProcessHistoryReadinessFromStore({
    library_root: libraryRoot,
    library
  });

  assert.equal(readiness.ready_for_process_history, false);
  assert.equal(readiness.reason, "snapshot_incomplete");
  assert.equal(readiness.snapshot_complete, false);
  assert.equal(readiness.expected_job_snapshot_rows, 2);
  assert.equal(readiness.snapshot_metadata_row_count, 0);
  assert.equal(readiness.snapshot_table_row_count, 0);
  assert.equal(readiness.metadata_row_count_matches, false);
  assert.equal(readiness.table_row_count_matches, false);
});

test("admin read model store write-through updates one source video row and stays fresh", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 1,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const unprocessed = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed",
    title: "未处理素材",
    visible_to_cutters: false
  });
  const queued = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "queued",
    title: "排队素材",
    visible_to_cutters: false
  });
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [unprocessed, queued]
    })
  });

  const nextLibrary = {
    ...library,
    queued_video_count: 2,
    unprocessed_video_count: 0,
    updated_at: "2026-06-25T12:05:00.000Z"
  };
  const result = await writeAdminSourceVideoManifestToReadModelStore({
    library_root: libraryRoot,
    library: nextLibrary,
    manifest: {
      ...unprocessed,
      preprocess_status: "queued"
    },
    generated_at: "2026-06-25T12:05:01.000Z"
  });
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: nextLibrary
  });
  const page = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library: nextLibrary,
    status: "queued",
    offset: 0,
    limit: 10
  });

  assert.equal(result.applied, true);
  assert.equal(result.reason, "updated");
  assert.equal(status.freshness, "fresh");
  assert.equal(status.generated_at, "2026-06-25T12:05:01.000Z");
  assert.equal(status.counts_by_status.queued, 2);
  assert.deepEqual(page?.manifests.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
});

test("admin read model store write-through refreshes dashboard material summary", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 2,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 1,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const ready = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "ready",
    duration_ms: 120_000,
    file_size: 4000
  });
  const unprocessed = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "unprocessed",
    visible_to_cutters: false,
    duration_ms: 60_000,
    file_size: 2000
  });

  await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    manifests: [ready, unprocessed],
    default_page_limit: 20,
    generated_at: "2026-06-25T12:01:00.000Z"
  });

  const nextLibrary = {
    ...library,
    ready_video_count: 2,
    unprocessed_video_count: 0,
    updated_at: "2026-06-25T12:05:00.000Z"
  };
  const updated = await writeAdminSourceVideoManifestToReadModelStore({
    library_root: libraryRoot,
    library: nextLibrary,
    manifest: sourceVideoManifest({
      source_video_id: unprocessed.source_video_id,
      preprocess_status: "ready",
      visible_to_cutters: true,
      duration_ms: 90_000,
      file_size: 3000
    }),
    generated_at: "2026-06-25T12:05:01.000Z"
  });
  const summary = await readAdminDashboardMaterialSummaryFromStore({
    library_root: libraryRoot,
    library: nextLibrary
  });

  assert.equal(updated.applied, true);
  assert.deepEqual(summary, {
    video_count: 2,
    ready_video_count: 2,
    total_duration_ms: 210_000,
    ready_duration_ms: 210_000,
    unprocessed_duration_ms: 0,
    total_size_bytes: 7000
  });
});

test("admin read model store write-through skips mismatched counts without corrupting the store", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 0,
    unprocessed_video_count: 1,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const manifest = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [manifest]
    })
  });

  const skipped = await writeAdminSourceVideoManifestToReadModelStore({
    library_root: libraryRoot,
    library,
    manifest: {
      ...manifest,
      preprocess_status: "queued"
    },
    generated_at: "2026-06-25T12:05:01.000Z"
  });
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const unprocessedPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "unprocessed",
    offset: 0,
    limit: 10
  });

  assert.equal(skipped.applied, false);
  assert.equal(skipped.reason, "counts_mismatch");
  assert.equal(status.freshness, "fresh");
  assert.equal(status.counts_by_status.unprocessed, 1);
  assert.equal(status.counts_by_status.queued, 0);
  assert.deepEqual(unprocessedPage?.manifests.map((row) => row.source_video_id), ["V000001"]);
});

test("admin read model store stale marker blocks page fast paths until reconcile", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [
        sourceVideoManifest({
          source_video_id: "V000001",
          preprocess_status: "queued",
          visible_to_cutters: false
        })
      ]
    })
  });

  const invalidated = await markAdminReadModelStoreStale({
    library_root: libraryRoot,
    reason: "source-folder-scope-change",
    invalidated_at: "2026-06-25T12:02:00.000Z"
  });
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const plan = planAdminReadModelStoreReconciliation({
    status,
    library_available: true
  });
  const page = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library,
    status: "queued",
    offset: 0,
    limit: 10
  });

  assert.equal(invalidated.applied, true);
  assert.equal(invalidated.reason, "invalidated");
  assert.equal(status.freshness, "stale");
  assert.equal(status.invalidated_at, "2026-06-25T12:02:00.000Z");
  assert.equal(status.invalidation_reason, "source-folder-scope-change");
  assert.equal(plan.action, "rebuild");
  assert.equal(plan.reason, "stale_store");
  assert.equal(plan.scan_mode, "full-reconcile");
  assert.equal(plan.safe_for_page_request, false);
  assert.equal(page, null);
});

test("admin read model store batch write-through updates multiple rows atomically", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 2,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const first = sourceVideoManifest({
    source_video_id: "V000001",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const second = sourceVideoManifest({
    source_video_id: "V000002",
    preprocess_status: "unprocessed",
    visible_to_cutters: false
  });
  const third = sourceVideoManifest({
    source_video_id: "V000003",
    preprocess_status: "queued",
    visible_to_cutters: false
  });
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [first, second, third]
    })
  });

  const nextLibrary = {
    ...library,
    queued_video_count: 3,
    unprocessed_video_count: 0,
    updated_at: "2026-06-25T12:05:00.000Z"
  };
  const result = await writeAdminSourceVideoManifestsToReadModelStore({
    library_root: libraryRoot,
    library: nextLibrary,
    manifests: [
      { ...first, preprocess_status: "queued" },
      { ...second, preprocess_status: "queued" }
    ],
    generated_at: "2026-06-25T12:05:01.000Z"
  });
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: nextLibrary
  });
  const queuedPage = await readAdminSourceVideoStatusPageFromStore({
    library_root: libraryRoot,
    library: nextLibrary,
    status: "queued",
    offset: 0,
    limit: 10
  });

  assert.equal(result.applied, true);
  assert.equal(result.reason, "updated");
  assert.equal(status.freshness, "fresh");
  assert.equal(status.counts_by_status.queued, 3);
  assert.deepEqual(
    queuedPage?.manifests.map((manifest) => manifest.source_video_id),
    ["V000001", "V000002", "V000003"]
  );
});

test("admin read model store plans background reconciliation from store freshness", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const missingStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const missingPlan = planAdminReadModelStoreReconciliation({
    status: missingStatus,
    library_available: true
  });

  assert.equal(missingPlan.action, "build");
  assert.equal(missingPlan.reason, "missing_store");
  assert.equal(missingPlan.scan_mode, "full-reconcile");
  assert.equal(missingPlan.requires_background_reconcile, true);
  assert.equal(missingPlan.safe_for_page_request, false);

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [
        sourceVideoManifest({
          source_video_id: "V000001",
          preprocess_status: "queued",
          visible_to_cutters: false
        })
      ]
    })
  });

  const freshStatus = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const freshPlan = planAdminReadModelStoreReconciliation({
    status: freshStatus,
    library_available: true
  });
  const stalePlan = planAdminReadModelStoreReconciliation({
    status: await readAdminReadModelStoreStatus({
      library_root: libraryRoot,
      library: {
        ...library,
        video_count: 2,
        queued_video_count: 2,
        updated_at: "2026-06-25T12:05:00.000Z"
      }
    }),
    library_available: true
  });
  const unavailablePlan = planAdminReadModelStoreReconciliation({
    status: freshStatus,
    library_available: false
  });

  assert.equal(freshPlan.action, "none");
  assert.equal(freshPlan.reason, "fresh");
  assert.equal(freshPlan.scan_mode, "no-scan");
  assert.equal(freshPlan.safe_for_page_request, true);
  assert.equal(freshStatus.projections?.material_summary.status, "missing");
  assert.equal(freshStatus.projections?.material_summary.requires_background_reconcile, true);
  assert.equal(freshStatus.projections?.material_summary.safe_for_page_request, true);
  assert.equal(stalePlan.action, "rebuild");
  assert.equal(stalePlan.reason, "stale_store");
  assert.equal(stalePlan.scan_mode, "full-reconcile");
  assert.equal(unavailablePlan.action, "manual-review");
  assert.equal(unavailablePlan.reason, "missing_library");
});

test("admin read model store reconciles from a validated manifest snapshot", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 3,
    ready_video_count: 1,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 1,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const result = await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library,
    default_page_limit: 20,
    generated_at: "2026-06-25T12:02:00.000Z",
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "ready"
      }),
      sourceVideoManifest({
        source_video_id: "V000002",
        preprocess_status: "queued",
        visible_to_cutters: false
      }),
      sourceVideoManifest({
        source_video_id: "V000003",
        preprocess_status: "index-required",
        visible_to_cutters: false
      })
    ]
  });
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });
  const page = await readAdminSourceVideoStatusesPageFromStore({
    library_root: libraryRoot,
    library,
    statuses: ["queued", "index-required"],
    offset: 0,
    limit: 10
  });

  assert.equal(result.applied, true);
  assert.equal(result.reason, "rebuilt");
  assert.equal(result.snapshot_video_count, 3);
  assert.equal(result.counts_by_status.ready, 1);
  assert.equal(status.freshness, "fresh");
  assert.equal(status.generated_at, "2026-06-25T12:02:00.000Z");
  assert.deepEqual(page?.manifests.map((manifest) => manifest.source_video_id), ["V000002", "V000003"]);
});

test("admin read model store reconciliation rejects inconsistent snapshots without corrupting store", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model: buildAdminSourceVideoStatusReadModel({
      library,
      generated_at: "2026-06-25T12:01:00.000Z",
      default_page_limit: 20,
      manifests: [
        sourceVideoManifest({
          source_video_id: "V000001",
          preprocess_status: "queued",
          visible_to_cutters: false
        })
      ]
    })
  });

  const rejected = await reconcileAdminReadModelStoreFromManifestSnapshot({
    library_root: libraryRoot,
    library: {
      ...library,
      ready_video_count: 1,
      queued_video_count: 0,
      updated_at: "2026-06-25T12:05:00.000Z"
    },
    default_page_limit: 20,
    generated_at: "2026-06-25T12:05:01.000Z",
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "queued",
        visible_to_cutters: false
      })
    ]
  });
  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library
  });

  assert.equal(rejected.applied, false);
  assert.equal(rejected.reason, "counts_mismatch");
  assert.equal(rejected.counts_by_status.queued, 1);
  assert.equal(status.freshness, "fresh");
  assert.equal(status.generated_at, "2026-06-25T12:01:00.000Z");
  assert.equal(status.counts_by_status.queued, 1);
});

test("admin read model store reports stale when library counts change", async () => {
  const libraryRoot = await makeLibraryRoot();
  const library = {
    video_count: 1,
    ready_video_count: 0,
    processing_video_count: 0,
    queued_video_count: 1,
    unprocessed_video_count: 0,
    failed_video_count: 0,
    index_required_video_count: 0,
    updated_at: "2026-06-25T12:00:00.000Z"
  };
  const model = buildAdminSourceVideoStatusReadModel({
    library,
    generated_at: "2026-06-25T12:01:00.000Z",
    default_page_limit: 20,
    manifests: [
      sourceVideoManifest({
        source_video_id: "V000001",
        preprocess_status: "queued",
        visible_to_cutters: false
      })
    ]
  });

  await writeAdminSourceVideoStatusReadModelStore({
    library_root: libraryRoot,
    model
  });

  const status = await readAdminReadModelStoreStatus({
    library_root: libraryRoot,
    library: {
      ...library,
      video_count: 2,
      ready_video_count: 1,
      updated_at: "2026-06-25T12:05:00.000Z"
    }
  });

  assert.equal(status.exists, true);
  assert.equal(status.freshness, "stale");
  assert.equal(status.current_video_count, 2);
});
