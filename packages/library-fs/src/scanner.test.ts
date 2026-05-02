import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  readAdminSettings,
  writeAdminSettings
} from "./admin-settings.ts";
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

test("scans every enabled admin source folder into one artifact library", async () => {
  const libraryRoot = await makeLibraryRoot();
  const courseSource = path.join(libraryRoot, "course-source");
  const disabledSource = path.join(libraryRoot, "disabled-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "默认素材.mp4"));
  await writeDummyFile(path.join(courseSource, "课程", "现金流.mp4"));
  await writeDummyFile(path.join(disabledSource, "隐藏素材.mp4"));

  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: courseSource,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });
  const withDisabled = await addAdminSourceFolder(libraryRoot, {
    name: "停用来源",
    path: disabledSource,
    enabled: false,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  assert.equal(withDisabled.source_folders.length, 3);

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 2,
    new_video_count: 2,
    existing_video_count: 0,
    source_video_ids: ["V000001", "V000002"]
  });

  const first = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const second = await readJson<{
    relative_path: string;
    source_folder_id?: string;
    source_folder_relative_path?: string;
  }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  const settings = await readAdminSettings(libraryRoot);

  assert.equal(first.relative_path, "默认素材.mp4");
  assert.equal(second.relative_path, "src_002/课程/现金流.mp4");
  assert.equal(second.source_folder_id, "src_002");
  assert.equal(second.source_folder_relative_path, "课程/现金流.mp4");
  assert.equal(settings.artifact_library.path, path.join(libraryRoot, ".mixlab-library"));
  assert.equal(settings.source_folders[0]?.discovered_video_count, 1);
  assert.equal(settings.source_folders[1]?.discovered_video_count, 1);
  assert.equal(settings.source_folders[1]?.new_unprocessed_count, 1);
  assert.equal(settings.source_folders[2]?.discovered_video_count, 0);
});

test("throws a Chinese error for duplicate computed relative paths in one scan", async () => {
  const libraryRoot = await makeLibraryRoot();
  const courseSource = path.join(libraryRoot, "course-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "src_002", "foo.mp4"));
  await writeDummyFile(path.join(courseSource, "foo.mp4"));

  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: courseSource,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  await assert.rejects(
    () => scanSourceVideos({
      library_root: libraryRoot,
      library_id: "lib_main_001",
      library_name: "主素材库",
      now: "2026-05-02T00:00:00Z"
    }),
    /素材来源相对路径重复：src_002\/foo\.mp4/
  );

  await assert.rejects(
    () => readFile(
      path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
      "utf8"
    ),
    /ENOENT/
  );
});

test("preserves missing enabled source folder scan stats", async () => {
  const libraryRoot = await makeLibraryRoot();
  const missingSource = path.join(libraryRoot, "missing-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "默认素材.mp4"));
  await addAdminSourceFolder(libraryRoot, {
    name: "缺失素材",
    path: missingSource,
    enabled: true,
    last_scanned_at: "2026-05-01T00:00:00Z",
    discovered_video_count: 7,
    new_unprocessed_count: 3
  });

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const settings = await readAdminSettings(libraryRoot);
  assert.equal(settings.source_folders[1]?.last_scanned_at, "2026-05-01T00:00:00Z");
  assert.equal(settings.source_folders[1]?.discovered_video_count, 7);
  assert.equal(settings.source_folders[1]?.new_unprocessed_count, 3);
});

test("preserves existing manifests from skipped missing source folders", async () => {
  const libraryRoot = await makeLibraryRoot();
  const courseSource = path.join(libraryRoot, "course-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "默认素材.mp4"));
  await writeDummyFile(path.join(courseSource, "课程.mp4"));
  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: courseSource,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  await rm(courseSource, { recursive: true, force: true });

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  const settings = await readAdminSettings(libraryRoot);

  assert.deepEqual(result, {
    total_video_count: 2,
    new_video_count: 0,
    existing_video_count: 2,
    source_video_ids: ["V000001", "V000002"]
  });
  assert.equal(library.video_count, 2);
  assert.equal(library.unprocessed_video_count, 2);
  assert.equal(settings.source_folders[1]?.last_scanned_at, "2026-05-02T00:00:00Z");
  assert.equal(settings.source_folders[1]?.discovered_video_count, 1);
  assert.equal(settings.source_folders[1]?.new_unprocessed_count, 1);
});

test("preserves legacy default source manifests when source-videos is missing", async () => {
  const libraryRoot = await makeLibraryRoot();
  const manifestDir = path.join(libraryRoot, ".mixlab-library", "videos", "V000001");

  await mkdir(manifestDir, { recursive: true });
  await writeFile(
    path.join(manifestDir, "source-video.json"),
    `${JSON.stringify(
      {
        source_video_id: "V000001",
        title: "legacy",
        relative_path: "legacy.mp4",
        logical_uri: "library://source-video/V000001",
        duration_ms: 0,
        width: 0,
        height: 0,
        fps: 0,
        codec: "",
        file_size: 12,
        content_hash: "pending:size:12",
        preprocess_status: "unprocessed",
        visible_to_cutters: false,
        transcript_path: "",
        srt_path: "",
        keyframes_path: "",
        cover_path: ""
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });
  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  const settings = await readAdminSettings(libraryRoot);

  assert.deepEqual(result, {
    total_video_count: 1,
    new_video_count: 0,
    existing_video_count: 1,
    source_video_ids: ["V000001"]
  });
  assert.equal(library.video_count, 1);
  assert.equal(library.unprocessed_video_count, 1);
  assert.equal(settings.source_folders[0]?.last_scanned_at, "");
  assert.equal(settings.source_folders[0]?.discovered_video_count, 0);
});

test("treats default source with trailing separator as unprefixed", async () => {
  const libraryRoot = await makeLibraryRoot();
  const settings = await readAdminSettings(libraryRoot);

  await writeAdminSettings(libraryRoot, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: `${folder.path}${path.sep}` }
        : folder
    )
  });
  await writeDummyFile(path.join(libraryRoot, "source-videos", "默认素材.mp4"));

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const manifest = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );

  assert.equal(manifest.relative_path, "默认素材.mp4");
});

test("rescans multiple configured folders without changing existing source video ids", async () => {
  const libraryRoot = await makeLibraryRoot();
  const courseSource = path.join(libraryRoot, "course-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "默认素材.mp4"));
  await writeDummyFile(path.join(courseSource, "课程A.mp4"));
  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: courseSource,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  await writeDummyFile(path.join(courseSource, "课程B.mp4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 3,
    new_video_count: 1,
    existing_video_count: 2,
    source_video_ids: ["V000001", "V000002", "V000003"]
  });

  const first = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  const second = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  const third = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000003", "source-video.json")
  );

  assert.equal(first.relative_path, "默认素材.mp4");
  assert.equal(second.relative_path, "src_002/课程A.mp4");
  assert.equal(third.relative_path, "src_002/课程B.mp4");
});
