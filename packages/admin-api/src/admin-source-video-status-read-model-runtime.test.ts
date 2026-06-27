import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { LibraryCounts, PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import { buildAdminSourceVideoStatusReadModel } from "./admin-source-video-read-model.ts";
import {
  createAdminSourceVideoStatusReadModelRuntime,
  sourceVideoStatusReadModelPath,
  type AdminSourceVideoStatusReadModelRuntimeInput
} from "./admin-source-video-status-read-model-runtime.ts";

type TestLibrary = LibraryCounts & {
  updated_at: string;
};

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-status-read-model-runtime-"));
}

function manifest(input: {
  id: string;
  status: PreprocessStatus;
  title?: string;
}): SourceVideoManifest {
  return {
    source_video_id: input.id,
    title: input.title ?? input.id,
    relative_path: `课程/${input.id}.mp4`,
    logical_uri: `library://source-video/${input.id}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${input.id}`,
    preprocess_status: input.status,
    visible_to_cutters: input.status === "ready",
    transcript_path: input.status === "ready" ? `artifacts/${input.id}/transcript.json` : "",
    srt_path: input.status === "ready" ? `artifacts/${input.id}/transcript.srt` : "",
    keyframes_path: input.status === "ready" ? `artifacts/${input.id}/keyframes.json` : "",
    cover_path: input.status === "ready" ? `artifacts/${input.id}/cover.jpg` : ""
  };
}

function libraryFromManifests(manifests: SourceVideoManifest[], updatedAt = "2026-06-26T00:00:00.000Z"): TestLibrary {
  const count = (status: PreprocessStatus) =>
    manifests.filter((item) => item.preprocess_status === status).length;

  return {
    video_count: manifests.length,
    ready_video_count: count("ready"),
    processing_video_count: count("processing"),
    queued_video_count: count("queued"),
    unprocessed_video_count: count("unprocessed"),
    failed_video_count: count("failed"),
    index_required_video_count: count("index-required"),
    updated_at: updatedAt
  };
}

function createRuntime(input: {
  library_root: string;
  library: TestLibrary | null;
  all_manifests?: SourceVideoManifest[];
  sorted_source_video_ids?: string[];
  indexed_ready_ids?: Set<string> | null;
  indexed_manifest_map?: Map<string, SourceVideoManifest> | null;
  on_read_all_manifests?: () => Promise<void>;
}) {
  const calls = {
    read_all_manifests: 0,
    read_manifests_by_ids: 0,
    read_sorted_source_video_ids: 0,
    read_indexed_ready_id_set: 0,
    write_store: 0,
    cache_manifests: 0,
    cache_all_manifests: 0,
    clear_default_page_cache: 0
  };
  const allManifests = input.all_manifests ?? [];
  const sortedSourceVideoIds = input.sorted_source_video_ids ?? allManifests.map((item) => item.source_video_id);
  const indexedManifestMap = input.indexed_manifest_map ?? new Map(
    allManifests
      .filter((item) => item.preprocess_status === "ready")
      .map((item) => [item.source_video_id, item])
  );

  const runtimeInput: AdminSourceVideoStatusReadModelRuntimeInput = {
    cache_ttl_ms: 60_000,
    default_page_limit: 2,
    page_scan_ahead: 4,
    manifest_read_concurrency: 2,
    read_library_manifest: async () => input.library,
    read_indexed_ready_id_set: async () => {
      calls.read_indexed_ready_id_set += 1;
      return input.indexed_ready_ids ?? null;
    },
    read_indexed_manifest_map_by_ids: async ({ source_video_ids }) => {
      if (!indexedManifestMap) {
        return null;
      }
      return new Map(source_video_ids
        .filter((sourceVideoId) => indexedManifestMap.has(sourceVideoId))
        .map((sourceVideoId) => [sourceVideoId, indexedManifestMap.get(sourceVideoId)!]));
    },
    read_sorted_source_video_ids: async () => {
      calls.read_sorted_source_video_ids += 1;
      return sortedSourceVideoIds;
    },
    read_manifests_by_ids: async ({ source_video_ids }) => {
      calls.read_manifests_by_ids += 1;
      const manifestById = new Map(allManifests.map((item) => [item.source_video_id, item]));
      return source_video_ids
        .map((sourceVideoId) => manifestById.get(sourceVideoId))
        .filter((item): item is SourceVideoManifest => Boolean(item));
    },
    read_all_manifests: async () => {
      calls.read_all_manifests += 1;
      await input.on_read_all_manifests?.();
      return allManifests;
    },
    read_manifest_page: async ({ offset, limit }) => allManifests.slice(offset, offset + limit),
    cache_manifests: () => {
      calls.cache_manifests += 1;
    },
    cache_all_manifests: () => {
      calls.cache_all_manifests += 1;
    },
    clear_default_page_cache: () => {
      calls.clear_default_page_cache += 1;
    },
    write_status_read_model_store: async () => {
      calls.write_store += 1;
    }
  };

  return {
    calls,
    runtime: createAdminSourceVideoStatusReadModelRuntime(runtimeInput)
  };
}

test("status read-model runtime reuses a fresh persisted model and seeds manifest caches", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "ready" }),
    manifest({ id: "V000002", status: "queued" })
  ];
  const library = libraryFromManifests(manifests);
  const persistedModel = buildAdminSourceVideoStatusReadModel({
    library,
    manifests,
    default_page_limit: 2,
    generated_at: "2026-06-26T00:00:01.000Z"
  });
  await mkdir(path.dirname(sourceVideoStatusReadModelPath(libraryRoot)), { recursive: true });
  await writeFile(sourceVideoStatusReadModelPath(libraryRoot), JSON.stringify(persistedModel), "utf8");

  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: null
  });

  const model = await runtime.read(libraryRoot);

  assert.equal(model.generated_at, "2026-06-26T00:00:01.000Z");
  assert.equal(calls.read_all_manifests, 0);
  assert.equal(calls.write_store, 0);
  assert.equal(calls.cache_manifests, 5);
});

test("status read-model runtime uses memory cache without duplicate rebuilds", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "queued" })
  ];
  const library = libraryFromManifests(manifests);
  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: null
  });

  const first = await runtime.read(libraryRoot);
  const second = await runtime.read(libraryRoot);

  assert.equal(first, second);
  assert.equal(calls.read_all_manifests, 1);
  assert.equal(calls.write_store, 1);
});

test("status read-model runtime coalesces concurrent pending builds", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "queued" })
  ];
  const library = libraryFromManifests(manifests);
  let releaseReadAll: (() => void) | undefined;
  const readAllGate = new Promise<void>((resolve) => {
    releaseReadAll = resolve;
  });
  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: null,
    on_read_all_manifests: () => readAllGate
  });

  const first = runtime.read(libraryRoot);
  const second = runtime.read(libraryRoot);
  releaseReadAll?.();
  const [firstModel, secondModel] = await Promise.all([first, second]);

  assert.equal(firstModel, secondModel);
  assert.equal(calls.read_all_manifests, 1);
});

test("status read-model runtime builds from indexed ready ids and writes persisted JSON", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "ready" }),
    manifest({ id: "V000002", status: "queued" })
  ];
  const library = libraryFromManifests(manifests);
  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: new Set(["V000001"]),
    sorted_source_video_ids: ["V000001", "V000002"]
  });

  const model = await runtime.read(libraryRoot);
  const persisted = JSON.parse(await readFile(sourceVideoStatusReadModelPath(libraryRoot), "utf8"));

  assert.deepEqual(model.ids_by_status.ready, ["V000001"]);
  assert.deepEqual(model.ids_by_status.queued, ["V000002"]);
  assert.deepEqual(model.default_source_video_page?.manifests.map((item) => item.source_video_id), [
    "V000001",
    "V000002"
  ]);
  assert.equal(persisted.video_count, 2);
  assert.equal(calls.read_all_manifests, 0);
  assert.equal(calls.read_sorted_source_video_ids, 1);
  assert.equal(calls.read_manifests_by_ids, 2);
  assert.equal(calls.write_store, 1);
});

test("status read-model runtime falls back to all manifests and seeds the all-manifest cache", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "ready" }),
    manifest({ id: "V000002", status: "index-required" }),
    manifest({ id: "V000003", status: "failed" })
  ];
  const library = libraryFromManifests(manifests);
  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: null
  });

  const model = await runtime.read(libraryRoot);

  assert.deepEqual(model.ids_by_status.ready, ["V000001"]);
  assert.deepEqual(model.ids_by_status["index-required"], ["V000002"]);
  assert.deepEqual(model.ids_by_status.failed, ["V000003"]);
  assert.equal(calls.read_all_manifests, 1);
  assert.equal(calls.cache_all_manifests, 1);
  assert.equal(calls.write_store, 1);
});

test("status read-model runtime clears memory and persisted JSON state", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "queued" })
  ];
  const library = libraryFromManifests(manifests);
  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: null
  });

  await runtime.read(libraryRoot);
  await access(sourceVideoStatusReadModelPath(libraryRoot));
  await runtime.clear(libraryRoot);

  await assert.rejects(access(sourceVideoStatusReadModelPath(libraryRoot)));
  assert.equal(calls.clear_default_page_cache, 1);
  const status = await runtime.status({
    library_root: libraryRoot,
    now: "2026-06-26T00:00:02.000Z"
  });
  assert.equal(status.freshness, "missing");
  assert.equal(status.memory_cache, "missing");
  assert.equal(status.persisted, "missing");
});

test("status read-model runtime reports building and avoids duplicate background builds", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifests = [
    manifest({ id: "V000001", status: "queued" })
  ];
  const library = libraryFromManifests(manifests);
  let releaseReadAll: (() => void) | undefined;
  const readAllGate = new Promise<void>((resolve) => {
    releaseReadAll = resolve;
  });
  const { calls, runtime } = createRuntime({
    library_root: libraryRoot,
    library,
    all_manifests: manifests,
    indexed_ready_ids: null,
    on_read_all_manifests: () => readAllGate
  });

  const pending = runtime.read(libraryRoot);
  runtime.refresh_in_background(libraryRoot);
  const buildingStatus = await runtime.status({
    library_root: libraryRoot,
    now: "2026-06-26T00:00:03.000Z"
  });
  releaseReadAll?.();
  await pending;
  const freshStatus = await runtime.status({
    library_root: libraryRoot,
    now: "2026-06-26T00:00:04.000Z"
  });

  assert.equal(calls.read_all_manifests, 1);
  assert.equal(buildingStatus.freshness, "building");
  assert.equal(buildingStatus.memory_cache, "building");
  assert.equal(freshStatus.freshness, "fresh");
  assert.equal(freshStatus.counts_by_status.queued, 1);
});
