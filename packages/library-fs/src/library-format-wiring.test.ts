import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readCurrentCutterRelease, readCurrentIndexPointer } from "./index.ts";

function mixlabRoot(root: string): string {
  return path.join(root, ".mixlab-library");
}

function releaseRoot(root: string, version: string): string {
  return path.join(mixlabRoot(root), "releases", version);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

const validReleaseJson = (version = "v000001") => ({
  schema_version: "1.0",
  release_version: version,
  library_id: "lib_wiring_001",
  generated_at: "2026-10-27T02:00:00.000Z",
  ready_video_count: 7,
  source_index_version: version,
  catalog_path: "catalog.sqlite",
  source_path_map_path: "source-path-map.json",
  search_index_path: "search-index/source-transcript-index",
  thumbnails_path: "thumbnails",
  transcript_pack_path: "transcript-pack"
});

const validPointer = (version = "v000001") => ({
  schema_version: "1.0",
  library_id: "lib_wiring_001",
  current_version: version,
  updated_at: "2026-10-27T02:00:00.000Z",
  manifest_path: ".mixlab-library/releases/" + version + "/release.json"
});

async function makeReadableLibrary(version = "v000001"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-library-format-wiring-"));
  await writeJson(path.join(mixlabRoot(root), "current-release.json"), validPointer(version));
  await writeJson(path.join(releaseRoot(root, version), "release.json"), validReleaseJson(version));
  return root;
}

test("round5 wiring: readCurrentCutterRelease reads pointer + release.json through library-format", async () => {
  const root = await makeReadableLibrary();
  try {
    const current = await readCurrentCutterRelease(root);
    assert.equal(current.release_version, "v000001");
    assert.equal(current.library_id, "lib_wiring_001");
    assert.equal(current.ready_video_count, 7);
    assert.equal(current.source_index_version, "v000001");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("round5 wiring: corrupt pointer JSON keeps Chinese format error semantics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-library-format-wiring-"));
  try {
    await mkdir(mixlabRoot(root), { recursive: true });
    await writeFile(path.join(mixlabRoot(root), "current-release.json"), "{not-json", "utf8");
    await assert.rejects(() => readCurrentCutterRelease(root), /不是合法的 JSON/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("round5 wiring: malicious pointer version is rejected before any path resolution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-library-format-wiring-"));
  try {
    await writeJson(path.join(mixlabRoot(root), "current-release.json"), validPointer("../escape"));
    await assert.rejects(() => readCurrentCutterRelease(root), /发布版本号格式无效/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("round5 wiring: missing pointer still rejects (ENOENT) as before", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-library-format-wiring-"));
  try {
    await assert.rejects(
      () => readCurrentCutterRelease(root),
      (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("round5 wiring: corrupt release.json and pointer/manifest mismatch reject", async () => {
  const root = await makeReadableLibrary();
  try {
    const manifestPath = path.join(releaseRoot(root, "v000001"), "release.json");
    await writeFile(manifestPath, "{broken", "utf8");
    await assert.rejects(() => readCurrentCutterRelease(root), /不是合法的 JSON/);

    await writeJson(manifestPath, validReleaseJson("v000002"));
    await assert.rejects(() => readCurrentCutterRelease(root), /版本|不一致/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("round5 wiring: index-current pointer parsing uses library-format validation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-library-format-wiring-index-"));
  const currentPath = path.join(mixlabRoot(root), "indexes", "source-transcript-index", "current.json");
  try {
    await writeJson(currentPath, {
      library_id: "lib_wiring_001",
      current_version: "v000001",
      updated_at: "2026-10-27T02:00:00.000Z"
    });
    const pointer = await readCurrentIndexPointer(root);
    assert.equal(pointer.current_version, "v000001");
    assert.equal(pointer.library_id, "lib_wiring_001");

    await writeFile(currentPath, "{broken", "utf8");
    await assert.rejects(() => readCurrentIndexPointer(root), /不是合法的 JSON/);

    await writeJson(currentPath, { current_version: "../escape" });
    await assert.rejects(() => readCurrentIndexPointer(root), /索引版本号格式无效/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
