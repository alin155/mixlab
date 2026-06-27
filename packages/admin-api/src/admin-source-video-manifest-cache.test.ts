import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import { createAdminSourceVideoManifestReader } from "./admin-source-video-manifest-cache.ts";

function sourceVideoManifest(sourceVideoId: string): SourceVideoManifest {
  return {
    source_video_id: sourceVideoId,
    title: sourceVideoId,
    relative_path: `course/${sourceVideoId}.mp4`,
    logical_uri: `library://source-video/${sourceVideoId}`,
    duration_ms: 60_000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1024,
    content_hash: `hash-${sourceVideoId}`,
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: `artifacts/${sourceVideoId}/transcript.json`,
    srt_path: `artifacts/${sourceVideoId}/transcript.srt`,
    keyframes_path: `artifacts/${sourceVideoId}/keyframes.json`,
    cover_path: `artifacts/${sourceVideoId}/cover.jpg`,
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}

async function makeLibraryRoot(): Promise<string> {
  const libraryRoot = await mkdtemp(path.join(tmpdir(), "mixlab-admin-manifest-cache-"));
  await mkdir(path.join(libraryRoot, "source-videos"), { recursive: true });
  return libraryRoot;
}

async function mkdirSourceVideos(libraryRoot: string, sourceVideoIds: string[]): Promise<void> {
  await Promise.all(
    sourceVideoIds.map((sourceVideoId) =>
      mkdir(path.join(libraryRoot, "source-videos", sourceVideoId), { recursive: true })
    )
  );
}

function makeReader(input: {
  catalog?: SourceVideoManifest[];
  now_ms?: () => number;
  cache_ttl_ms?: number;
  manifest_read_concurrency?: number;
  on_read_source_video_manifest?: (sourceVideoId: string) => void;
} = {}) {
  const catalog = new Map((input.catalog ?? []).map((manifest) => [
    manifest.source_video_id,
    manifest
  ]));
  const calls = {
    read_manifest_ids: [] as string[]
  };

  const reader = createAdminSourceVideoManifestReader({
    cache_ttl_ms: input.cache_ttl_ms ?? 30_000,
    manifest_read_concurrency: input.manifest_read_concurrency ?? 4,
    source_videos_root: (libraryRoot) => path.join(libraryRoot, "source-videos"),
    now_ms: input.now_ms,
    async read_source_video_manifest(_libraryRoot, sourceVideoId) {
      calls.read_manifest_ids.push(sourceVideoId);
      input.on_read_source_video_manifest?.(sourceVideoId);
      const manifest = catalog.get(sourceVideoId);
      if (!manifest) {
        throw new Error(`missing manifest: ${sourceVideoId}`);
      }
      return manifest;
    }
  });

  return {
    calls,
    reader
  };
}

test("manifest reader caches numerically sorted source-video ids and clears by library", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdirSourceVideos(libraryRoot, ["V000010", "V000002", "not-a-video"]);
  const { reader } = makeReader();

  const first = await reader.read_sorted_source_video_ids(libraryRoot);
  await mkdirSourceVideos(libraryRoot, ["V000001"]);
  const cached = await reader.read_sorted_source_video_ids(libraryRoot);
  reader.clear_library(libraryRoot);
  const refreshed = await reader.read_sorted_source_video_ids(libraryRoot);

  assert.deepEqual(first, ["V000002", "V000010"]);
  assert.deepEqual(cached, ["V000002", "V000010"]);
  assert.deepEqual(refreshed, ["V000001", "V000002", "V000010"]);
});

test("manifest reader reads manifests by id with numeric ordering and per-id cache", async () => {
  const libraryRoot = await makeLibraryRoot();
  const { calls, reader } = makeReader({
    manifest_read_concurrency: 1,
    catalog: [
      sourceVideoManifest("V000003"),
      sourceVideoManifest("V000001")
    ]
  });

  const first = await reader.read_manifests_by_ids({
    library_root: libraryRoot,
    source_video_ids: ["V000003", "V000002", "V000001"]
  });
  const second = await reader.read_manifests_by_ids({
    library_root: libraryRoot,
    source_video_ids: ["V000003", "V000001"]
  });

  assert.deepEqual(first.map((manifest) => manifest.source_video_id), ["V000001", "V000003"]);
  assert.deepEqual(second.map((manifest) => manifest.source_video_id), ["V000001", "V000003"]);
  assert.deepEqual(calls.read_manifest_ids, ["V000003", "V000002", "V000001"]);
});

test("manifest reader caches all manifests and exposes fresh all-manifest cache", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdirSourceVideos(libraryRoot, ["V000002", "V000001"]);
  const { calls, reader } = makeReader({
    catalog: [
      sourceVideoManifest("V000001"),
      sourceVideoManifest("V000002")
    ]
  });

  assert.equal(reader.read_fresh_cached_manifests(libraryRoot), null);
  const first = await reader.read_cached_manifests(libraryRoot);
  const fresh = reader.read_fresh_cached_manifests(libraryRoot);
  const second = await reader.read_cached_manifests(libraryRoot);

  assert.deepEqual(first.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.deepEqual(fresh?.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.deepEqual(second.map((manifest) => manifest.source_video_id), ["V000001", "V000002"]);
  assert.deepEqual(calls.read_manifest_ids, ["V000001", "V000002"]);
});

test("manifest reader cache_all_manifests seeds per-id manifest reads", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifest = sourceVideoManifest("V000005");
  const { calls, reader } = makeReader();

  reader.cache_all_manifests(libraryRoot, [manifest]);
  const byId = await reader.read_manifests_by_ids({
    library_root: libraryRoot,
    source_video_ids: ["V000005"]
  });

  assert.deepEqual(
    reader.read_fresh_cached_manifests(libraryRoot)?.map((cached) => cached.source_video_id),
    ["V000005"]
  );
  assert.deepEqual(byId.map((cached) => cached.source_video_id), ["V000005"]);
  assert.deepEqual(calls.read_manifest_ids, []);
});

test("manifest reader reads manifest pages from sorted source-video ids", async () => {
  const libraryRoot = await makeLibraryRoot();
  await mkdirSourceVideos(libraryRoot, ["V000004", "V000001", "V000003", "V000002"]);
  const { calls, reader } = makeReader({
    catalog: [
      sourceVideoManifest("V000001"),
      sourceVideoManifest("V000002"),
      sourceVideoManifest("V000003"),
      sourceVideoManifest("V000004")
    ]
  });

  const page = await reader.read_manifest_page({
    library_root: libraryRoot,
    offset: 1,
    limit: 2
  });

  assert.deepEqual(page.map((manifest) => manifest.source_video_id), ["V000002", "V000003"]);
  assert.deepEqual(calls.read_manifest_ids.sort(), ["V000002", "V000003"]);
});
