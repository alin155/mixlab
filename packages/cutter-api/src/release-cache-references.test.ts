import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectWorkspaceReleaseReferences,
  workspaceReleaseCacheReferenceOptions
} from "./index.ts";
import { syncCutterReleaseCache } from "../../library-fs/src/cutter-release-cache.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function libraryRoot(root: string): string {
  return path.join(root, ".mixlab-library");
}

function releaseRoot(root: string, version: string): string {
  return path.join(libraryRoot(root), "releases", version);
}

async function writePointer(root: string, version: string): Promise<void> {
  await writeJson(path.join(libraryRoot(root), "current-release.json"), {
    schema_version: "1.0",
    library_id: "lib_main_001",
    current_version: version,
    updated_at: "2026-10-27T00:00:00.000Z"
  });
}

async function writeRelease(root: string, version: string): Promise<void> {
  const rootPath = releaseRoot(root, version);
  const indexDir = path.join(rootPath, "search-index", "source-transcript-index", version);
  await mkdir(indexDir, { recursive: true });
  await writeFile(path.join(indexDir, "index.sqlite"), version);
  await writeFile(path.join(rootPath, "catalog.sqlite"), version);
  await writeJson(path.join(rootPath, "source-path-map.json"), {
    schema_version: "1.0",
    release_version: version,
    library_id: "lib_main_001",
    source_videos: {}
  });
  await writeJson(path.join(rootPath, "release.json"), {
    schema_version: "1.0",
    release_version: version,
    library_id: "lib_main_001",
    generated_at: "2026-10-27T00:00:00.000Z",
    ready_video_count: 1,
    source_index_version: version,
    catalog_path: "catalog.sqlite",
    source_path_map_path: "source-path-map.json",
    search_index_path: "search-index/source-transcript-index",
    thumbnails_path: "thumbnails",
    transcript_pack_path: "transcript-pack"
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("workspace reference scan collects release versions from projects, clip lists, cut jobs and export clips", async () => {
  const root = await makeRoot("mixlab-cutter-refs-");

  await writeJson(path.join(root, "export-clips", "E000001", "export-clip.json"), {
    export_clip_id: "E000001",
    release_version: "v000010",
    source_video_id: "V000001"
  });
  await writeJson(path.join(root, "clip-lists", "CL20261027-0001", "clip-list.json"), {
    clip_list_id: "CL20261027-0001",
    source_release_version: "v000009",
    items: []
  });
  await writeJson(path.join(root, "cut-jobs", "CJ-1.json"), {
    cut_job_id: "CJ-1",
    release_versions: ["v000008", "v000010"]
  });
  await writeJson(path.join(root, "projects", "p1", "project.json"), {
    project_id: "p1",
    snapshot_version: "v000011",
    sources: [{ release_version: "v000012" }, { release_version: "not-a-version" }]
  });
  await mkdir(path.join(root, "projects", "p1"), { recursive: true });
  await writeFile(path.join(root, "projects", "p1", "broken.json"), "{not-json");

  const references = await collectWorkspaceReleaseReferences({ workspace_root: root });

  assert.equal(references.referenced, true);
  assert.deepEqual(references.release_versions, [
    "v000008",
    "v000009",
    "v000010",
    "v000011",
    "v000012"
  ]);
  assert.equal(references.scanned_files, 5);
  assert.equal(references.warnings.length, 1);
  assert.match(references.warnings[0] ?? "", /无法解析/);
  assert.ok(references.source_artifacts.every((item) => !path.isAbsolute(item)));
  await rm(root, { recursive: true, force: true });
});

test("workspace reference scan reports no references for an empty workspace and tolerates missing directories", async () => {
  const root = await makeRoot("mixlab-cutter-refs-empty-");
  const references = await collectWorkspaceReleaseReferences({ workspace_root: root });

  assert.equal(references.referenced, false);
  assert.deepEqual(references.release_versions, []);
  assert.deepEqual(references.warnings, []);
  assert.deepEqual(await workspaceReleaseCacheReferenceOptions(root), {});

  const missing = await collectWorkspaceReleaseReferences({
    workspace_root: path.join(root, "does-not-exist")
  });
  assert.equal(missing.referenced, false);
  await rm(root, { recursive: true, force: true });
});

test("workspace reference options prefer explicit versions and fall back to conservative preservation", async () => {
  const root = await makeRoot("mixlab-cutter-refs-options-");

  await writeJson(path.join(root, "export-clips", "E000001", "export-clip.json"), {
    release_version: "v000001"
  });
  assert.deepEqual(await workspaceReleaseCacheReferenceOptions(root), {
    pinned_release_versions: ["v000001"]
  });

  await rm(path.join(root, "export-clips"), { recursive: true, force: true });
  await writeJson(path.join(root, "export-clips", "E000002", "export-clip.json"), {
    export_clip_id: "E000002"
  });
  assert.deepEqual(await workspaceReleaseCacheReferenceOptions(root), {
    preserve_cached_releases_for_unknown_references: true
  });
  await rm(root, { recursive: true, force: true });
});

test("release cache pruning protects the exact version referenced by workspace artifacts", async () => {
  const sourceRoot = await makeRoot("mixlab-cutter-refs-source-");
  const cacheRoot = await makeRoot("mixlab-cutter-refs-cache-");
  const workspaceRoot = await makeRoot("mixlab-cutter-refs-workspace-");

  await writeRelease(sourceRoot, "v000004");
  await writePointer(sourceRoot, "v000004");
  for (const version of ["v000001", "v000002", "v000003"]) {
    await writeRelease(cacheRoot, version);
    await utimes(releaseRoot(cacheRoot, version), new Date("2026-06-0" + version.slice(-1)), new Date("2026-06-0" + version.slice(-1)));
  }
  await writePointer(cacheRoot, "v000002");
  await writeJson(path.join(workspaceRoot, "export-clips", "E000001", "export-clip.json"), {
    export_clip_id: "E000001",
    release_version: "v000001"
  });

  const referenceOptions = await workspaceReleaseCacheReferenceOptions(workspaceRoot);
  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2,
    ...referenceOptions
  });

  assert.deepEqual(referenceOptions, { pinned_release_versions: ["v000001"] });
  assert.deepEqual(result.kept_release_versions, ["v000001", "v000004"]);
  assert.equal(result.kept_release_reasons?.v000001, "workspace_reference");
  assert.deepEqual(result.pruned_release_versions, ["v000002", "v000003"]);
  assert.equal(await exists(releaseRoot(cacheRoot, "v000001")), true);
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("legacy workspace without release metadata keeps the whole cache instead of guessing", async () => {
  const sourceRoot = await makeRoot("mixlab-cutter-legacy-source-");
  const cacheRoot = await makeRoot("mixlab-cutter-legacy-cache-");
  const workspaceRoot = await makeRoot("mixlab-cutter-legacy-workspace-");

  await writeRelease(sourceRoot, "v000003");
  await writePointer(sourceRoot, "v000003");
  for (const version of ["v000001", "v000002"]) {
    await writeRelease(cacheRoot, version);
  }
  await writePointer(cacheRoot, "v000002");
  await writeJson(path.join(workspaceRoot, "cut-jobs", "CJ-1.json"), {
    cut_job_id: "CJ-1",
    status: "done"
  });

  const referenceOptions = await workspaceReleaseCacheReferenceOptions(workspaceRoot);
  const result = await syncCutterReleaseCache({
    source_library_root: sourceRoot,
    cache_root: cacheRoot,
    max_cached_releases: 2,
    ...referenceOptions
  });

  assert.equal(referenceOptions.preserve_cached_releases_for_unknown_references, true);
  assert.deepEqual(result.pruned_release_versions, []);
  assert.deepEqual(result.kept_release_versions, ["v000001", "v000002", "v000003"]);
  await rm(workspaceRoot, { recursive: true, force: true });
});
