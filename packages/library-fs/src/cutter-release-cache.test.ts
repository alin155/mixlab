import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readFastLocalCutterReleaseCacheStatus,
  readLocalCutterReleaseCacheStatus,
  syncCutterReleaseCache
} from "./cutter-release-cache.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function releaseRoot(root: string, version: string): string {
  return path.join(root, ".mixlab-library", "releases", version);
}

async function fileOrDirExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function writePointer(root: string, version: string): Promise<void> {
  await mkdir(path.join(root, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(root, ".mixlab-library", "current-release.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      library_id: "lib_main_001",
      current_version: version,
      updated_at: "2026-06-14T00:00:00.000Z",
      manifest_path: `.mixlab-library/releases/${version}/release.json`
    }, null, 2)}\n`
  );
}

async function writeRelease(input: {
  root: string;
  version: string;
  search_index_version?: string;
  payload?: string;
}): Promise<void> {
  const searchIndexVersion = input.search_index_version ?? input.version;
  const root = releaseRoot(input.root, input.version);
  const indexDir = path.join(
    root,
    "search-index",
    "source-transcript-index",
    searchIndexVersion
  );

  await mkdir(indexDir, { recursive: true });
  await writeFile(path.join(indexDir, "index.sqlite"), input.payload ?? input.version);
  await writeFile(path.join(root, "catalog.sqlite"), input.payload ?? input.version);
  await writeFile(
    path.join(root, "source-path-map.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      release_version: input.version,
      library_id: "lib_main_001",
      source_videos: {}
    }, null, 2)}\n`
  );
  await writeFile(
    path.join(root, "release.json"),
    `${JSON.stringify({
      schema_version: "1.0",
      release_version: input.version,
      library_id: "lib_main_001",
      generated_at: "2026-06-14T00:00:00.000Z",
      ready_video_count: 1,
      source_index_version: searchIndexVersion,
      catalog_path: "catalog.sqlite",
      source_path_map_path: "source-path-map.json",
      search_index_path: "search-index/source-transcript-index",
      thumbnails_path: "thumbnails",
      transcript_pack_path: "transcript-pack"
    }, null, 2)}\n`
  );
}

test("sync cutter release cache prunes old releases while keeping current and newest previous", async () => {
  const sourceRoot = await makeRoot("mixlab-release-source-");
  const cacheRoot = await makeRoot("mixlab-release-cache-");

  await writeRelease({
    root: sourceRoot,
    version: "v000003",
    search_index_version: "idx-v000003",
    payload: "current-release"
  });
  await writePointer(sourceRoot, "v000003");

  await writeRelease({
    root: cacheRoot,
    version: "v000001",
    search_index_version: "idx-v000001",
    payload: "old-release"
  });
  await writeRelease({
    root: cacheRoot,
    version: "v000002",
    search_index_version: "idx-v000002",
    payload: "newer-previous-release"
  });
  await writePointer(cacheRoot, "v000002");
  await utimes(releaseRoot(cacheRoot, "v000001"), new Date("2026-06-01"), new Date("2026-06-01"));
  await utimes(releaseRoot(cacheRoot, "v000002"), new Date("2026-06-02"), new Date("2026-06-02"));

  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2
  });

  assert.equal(result.active_release_version, "v000003");
  assert.equal(result.search_index_version, "idx-v000003");
  assert.equal(result.max_cached_releases, 2);
  assert.deepEqual(result.cached_release_versions, ["v000002", "v000003"]);
  assert.deepEqual(result.pruned_release_versions, ["v000001"]);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000001")), false);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000002")), true);
  assert.equal(await fileOrDirExists(releaseRoot(cacheRoot, "v000003")), true);
  assert.ok(result.cache_size_bytes > 0);
});

test("local release cache status stays diagnostic when pointer is missing", async () => {
  const cacheRoot = await makeRoot("mixlab-release-cache-status-");

  await writeRelease({
    root: cacheRoot,
    version: "v000001",
    payload: "cached-but-not-current"
  });

  const status = await readLocalCutterReleaseCacheStatus({
    cache_root: cacheRoot,
    max_cached_releases: 3
  });

  assert.equal(status.cache_ready, false);
  assert.equal(status.active_release_version, "");
  assert.equal(status.search_index_version, "");
  assert.deepEqual(status.cached_release_versions, ["v000001"]);
  assert.equal(status.cached_release_count, 1);
  assert.equal(status.max_cached_releases, 3);
  assert.ok(status.cache_size_bytes > 0);
});

test("fast local release cache status confirms the active release without a full cache scan", async () => {
  const cacheRoot = await makeRoot("mixlab-release-cache-fast-status-");

  await writeRelease({
    root: cacheRoot,
    version: "v000002",
    search_index_version: "idx-v000002",
    payload: "cached-current"
  });
  await writeRelease({
    root: cacheRoot,
    version: "v000001",
    payload: "cached-previous"
  });
  await writePointer(cacheRoot, "v000002");

  const status = await readFastLocalCutterReleaseCacheStatus({
    cache_root: cacheRoot,
    max_cached_releases: 2
  });

  assert.equal(status.cache_ready, true);
  assert.equal(status.active_release_version, "v000002");
  assert.equal(status.search_index_version, "idx-v000002");
  assert.deepEqual(status.cached_release_versions, ["v000002"]);
  assert.equal(status.cached_release_count, 1);
  assert.equal(status.cache_size_bytes, 0);
});
