import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanSourceVideos } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-scan-${Date.now()}-`), {
    recursive: true
  });

  if (!root) {
    throw new Error("failed to create test library root");
  }

  return root;
}

async function writeDummyFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "dummy-video-bytes");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

test("scans source-videos recursively and writes unprocessed source-video manifests", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "访谈.mov"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "说明.txt"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 2,
    new_video_count: 2,
    existing_video_count: 0,
    source_video_ids: ["V000001", "V000002"]
  });

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );

  assert.equal(manifest.source_video_id, "V000001");
  assert.equal(manifest.relative_path, "课程/老板现金流.mp4");
  assert.equal(manifest.preprocess_status, "unprocessed");
  assert.equal(manifest.visible_to_cutters, false);
  assert.equal(manifest.transcript_path, "");
});

test("ignores macOS resource fork video-looking files during scan", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "C0017.MP4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "._C0017.MP4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 1,
    new_video_count: 1,
    existing_video_count: 0,
    source_video_ids: ["V000001"]
  });

  const manifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );

  assert.equal(manifest.relative_path, "C0017.MP4");
});

test("rescans without changing existing source video ids", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "b.mp4"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  await writeDummyFile(path.join(libraryRoot, "source-videos", "c.mp4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:05:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 3,
    new_video_count: 1,
    existing_video_count: 2,
    source_video_ids: ["V000001", "V000002", "V000003"]
  });

  const first = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const third = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "source-video.json")
  );

  assert.equal(first.relative_path, "a.mp4");
  assert.equal(third.relative_path, "c.mp4");
});

test("returns source video ids in assigned id order after out-of-order additions", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "z.mp4"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  await writeDummyFile(path.join(libraryRoot, "source-videos", "a.mp4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:05:00Z"
  });

  assert.deepEqual(result.source_video_ids, ["V000001", "V000002"]);
});

test("updates library.json counts after scan", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "a.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "b.mp4"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );

  assert.equal(library.library_id, "lib_main_001");
  assert.equal(library.video_count, 2);
  assert.equal(library.ready_video_count, 0);
  assert.equal(library.unprocessed_video_count, 2);
  assert.equal(library.index_required_video_count, 0);
});
