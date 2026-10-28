import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  readAdminSettings,
  writeAdminSettings
} from "./admin-settings.ts";
import { previewSourceVideoScan, scanNewSourceVideos, scanSourceVideos } from "./index.ts";
import {
  assertLibraryPathInside,
  isLibraryPathInside,
  isValidSourceVideoId
} from "./scanner.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-scan-${Date.now()}-`), {
    recursive: true
  });

  if (!root) {
    throw new Error("failed to create test library root");
  }

  return root;
}

async function writeDummyFile(filePath: string, content: string | Buffer = "dummy-video-bytes"): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function dummyMtsBytes(): Buffer {
  return Buffer.alloc(1024 * 1024 + 1);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("scan preview is read-only for uninitialized libraries", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "课程", "预览素材.mp4"));

  const preview = await previewSourceVideoScan({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  assert.equal(preview.blocked, false);
  assert.equal(preview.total_video_count, 1);
  assert.equal(preview.new_video_count, 1);
  assert.deepEqual(preview.source_video_ids, ["V000001"]);
  assert.equal(await pathExists(path.join(libraryRoot, ".mixlab-library")), false);
});

test("scans source-videos recursively and writes unprocessed source-video manifests", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "课程", "老板现金流.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "访谈.mov"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "00017.MTS"), dummyMtsBytes());
  await writeDummyFile(path.join(libraryRoot, "source-videos", "00018.m2ts"), dummyMtsBytes());
  await writeDummyFile(path.join(libraryRoot, "source-videos", "无效片段.MTS"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "说明.txt"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-01T00:00:00Z"
  });

  assert.deepEqual(result, {
    total_video_count: 4,
    new_video_count: 4,
    existing_video_count: 0,
    source_video_ids: ["V000001", "V000002", "V000003", "V000004"]
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

test("prunes manifests that no longer belong to the current enabled source folders", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "旧素材.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const settings = await readAdminSettings(libraryRoot);
  await writeAdminSettings(libraryRoot, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: externalSource }
        : folder
    )
  });
  await writeDummyFile(path.join(externalSource, "新素材.mp4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(result.total_video_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000002"]);
  await assert.rejects(
    () => readFile(
      path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json"),
      "utf8"
    ),
    /ENOENT/
  );

  const manifest = await readJson<{ relative_path: string; source_folder_id?: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  assert.equal(manifest.relative_path, "src_default/新素材.mp4");
  assert.equal(manifest.source_folder_id, "src_default");
});

test("previews scan changes without mutating manifest directories", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "旧素材.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const settings = await readAdminSettings(libraryRoot);
  await writeAdminSettings(libraryRoot, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: externalSource }
        : folder
    )
  });
  await writeDummyFile(path.join(externalSource, "新素材.mp4"));

  const preview = await previewSourceVideoScan({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(preview.blocked, false);
  assert.equal(preview.total_video_count, 1);
  assert.equal(preview.new_video_count, 1);
  assert.equal(preview.existing_video_count, 0);
  assert.equal(preview.inactive_manifest_count, 1);
  assert.equal(preview.inactive_ready_count, 0);
  assert.deepEqual(preview.inactive_source_video_ids, ["V000001"]);

  const original = await readJson<{ relative_path: string }>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "source-video.json")
  );
  assert.equal(original.relative_path, "旧素材.mp4");
  await assert.rejects(
    () => readFile(
      path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json"),
      "utf8"
    ),
    /ENOENT/
  );
});

test("blocks scans that would remove ready source videos", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "已发布素材.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "source-video.json"
  );
  const manifest = await readJson<Record<string, unknown>>(manifestPath);
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      ...manifest,
      preprocess_status: "ready",
      visible_to_cutters: true,
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt",
      keyframes_path: ".mixlab-library/videos/V000001/keyframes.json",
      cover_path: ".mixlab-library/videos/V000001/cover.jpg"
    }, null, 2)}\n`
  );

  const settings = await readAdminSettings(libraryRoot);
  await writeAdminSettings(libraryRoot, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: externalSource }
        : folder
    )
  });
  await writeDummyFile(path.join(externalSource, "新素材.mp4"));

  const preview = await previewSourceVideoScan({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(preview.blocked, true);
  assert.equal(preview.inactive_ready_count, 1);
  assert.deepEqual(preview.inactive_ready_source_video_ids, ["V000001"]);
  assert.equal(preview.blockers[0]?.code, "ready-manifest-removal");

  await assert.rejects(
    () => scanSourceVideos({
      library_root: libraryRoot,
      library_id: "lib_main_001",
      library_name: "主素材库",
      now: "2026-05-02T00:05:00Z"
    }),
    /已发布 ready 视频/
  );

  const protectedManifest = await readJson<Record<string, unknown>>(manifestPath);
  assert.equal(protectedManifest.preprocess_status, "ready");
  assert.equal(protectedManifest.visible_to_cutters, true);
});

test("additive scans register new files without removing inactive ready manifests", async () => {
  const libraryRoot = await makeLibraryRoot();

  await writeDummyFile(path.join(libraryRoot, "source-videos", "已发布素材.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const readyManifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    "V000001",
    "source-video.json"
  );
  const readyManifest = await readJson<Record<string, unknown>>(readyManifestPath);
  await writeFile(
    readyManifestPath,
    `${JSON.stringify({
      ...readyManifest,
      preprocess_status: "ready",
      visible_to_cutters: true
    }, null, 2)}\n`
  );

  await rm(path.join(libraryRoot, "source-videos", "已发布素材.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "新增素材.mp4"));

  const result = await scanNewSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(result.scan_mode, "additive-source-folder-scan");
  assert.equal(result.new_video_count, 1);
  assert.equal(result.inactive_ready_count, 1);
  assert.deepEqual(result.protected_inactive_source_video_ids, ["V000001"]);
  assert.deepEqual(result.source_video_ids, ["V000001", "V000002"]);
  assert.equal(await pathExists(readyManifestPath), true);

  const newManifest = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "source-video.json")
  );
  assert.equal(newManifest.relative_path, "新增素材.mp4");
  assert.equal(newManifest.preprocess_status, "unprocessed");

  const library = await readJson<Record<string, unknown>>(
    path.join(libraryRoot, ".mixlab-library", "library.json")
  );
  assert.equal(library.video_count, 2);
  assert.equal(library.ready_video_count, 1);
  assert.equal(library.unprocessed_video_count, 1);
});

function minimalManifest(input: {
  source_video_id: unknown;
  relative_path: unknown;
  preprocess_status?: unknown;
}): Record<string, unknown> {
  return {
    source_video_id: input.source_video_id,
    title: "恶意素材",
    relative_path: input.relative_path,
    source_folder_id: "src_default",
    source_folder_relative_path: input.relative_path,
    logical_uri: `library://source-video/${String(input.source_video_id)}`,
    duration_ms: 0,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: 1,
    content_hash: "pending:size:1",
    preprocess_status: input.preprocess_status ?? "unprocessed",
    visible_to_cutters: false,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: ""
  };
}

async function listQuarantineDirectories(libraryRoot: string): Promise<string[]> {
  const videosRoot = path.join(libraryRoot, ".mixlab-library", "videos");
  const entries = await readdir(videosRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(".quarantine-"))
    .map((entry) => path.join(videosRoot, entry.name));
}

test("quarantines unsafe existing manifests instead of pruning paths they point at", async () => {
  const libraryRoot = await makeLibraryRoot();
  const outsideDirectory = await mkdtemp(path.join(
    path.dirname(libraryRoot),
    "mixlab-scan-outside-"
  ));
  const outsideMarker = path.join(outsideDirectory, "keep-me.txt");
  await writeFile(outsideMarker, "outside data must survive", "utf8");

  const videosRoot = path.join(libraryRoot, ".mixlab-library", "videos");
  const outsideRelativeId = path
    .relative(videosRoot, outsideDirectory)
    .split(path.sep)
    .join("/");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "正常素材.mp4"));

  const unsafeManifests: Array<{ directory_name: string; manifest: Record<string, unknown> }> = [
    {
      directory_name: "V900001",
      manifest: minimalManifest({ source_video_id: outsideRelativeId, relative_path: "x.mp4" })
    },
    {
      directory_name: "V900002",
      manifest: minimalManifest({ source_video_id: "V000901", relative_path: "/etc/passwd" })
    },
    {
      directory_name: "V900003",
      manifest: minimalManifest({ source_video_id: "V000902", relative_path: "C:\\Windows\\evil.mp4" })
    },
    {
      directory_name: "V900004",
      manifest: minimalManifest({ source_video_id: "V000903", relative_path: "nested/../escape.mp4" })
    },
    {
      directory_name: "V900005",
      manifest: minimalManifest({ source_video_id: "V000904", relative_path: "bad\u0000name.mp4" })
    },
    {
      directory_name: "V900006",
      manifest: minimalManifest({ source_video_id: "V1", relative_path: "short-id.mp4" })
    },
    {
      directory_name: "V900007",
      manifest: minimalManifest({ source_video_id: "v000001", relative_path: "lowercase.mp4" })
    },
    {
      directory_name: "V900008",
      manifest: minimalManifest({
        source_video_id: "V000905",
        relative_path: "status.mp4",
        preprocess_status: "unknown-status"
      })
    }
  ];

  for (const entry of unsafeManifests) {
    await mkdir(path.join(videosRoot, entry.directory_name), { recursive: true });
    await writeFile(
      path.join(videosRoot, entry.directory_name, "source-video.json"),
      JSON.stringify(entry.manifest),
      "utf8"
    );
  }

  const preview = await previewSourceVideoScan({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });
  assert.equal(preview.inactive_manifest_count, 0);
  assert.equal(await pathExists(path.join(videosRoot, "V900001")), true);
  assert.equal(await pathExists(outsideMarker), true);

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(result.new_video_count, 1);
  assert.deepEqual(result.source_video_ids, ["V000001"]);
  assert.equal(await pathExists(outsideMarker), true);

  for (const entry of unsafeManifests) {
    assert.equal(
      await pathExists(path.join(videosRoot, entry.directory_name)),
      false,
      `不安全 manifest 目录应被隔离：${entry.directory_name}`
    );
  }

  const quarantineDirectories = await listQuarantineDirectories(libraryRoot);
  assert.equal(quarantineDirectories.length, 1);
  const quarantineRoot = quarantineDirectories[0] ?? "";
  const quarantineEntries = await readdir(quarantineRoot);
  for (const entry of unsafeManifests) {
    assert.equal(quarantineEntries.includes(entry.directory_name), true);
  }

  const quarantineSummary = await readJson<{ entries: Array<{ reason: string }> }>(
    path.join(quarantineRoot, "quarantine.json")
  );
  assert.equal(quarantineSummary.entries.length, unsafeManifests.length);
});

test("keeps inactive manifests with in-flight preprocess statuses during scan", async () => {
  const libraryRoot = await makeLibraryRoot();
  const externalSource = path.join(libraryRoot, "external-source");

  await writeDummyFile(path.join(libraryRoot, "source-videos", "处理中.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "排队中.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "待索引.mp4"));
  await writeDummyFile(path.join(libraryRoot, "source-videos", "未处理.mp4"));
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const videoStatuses: Array<[string, string]> = [
    ["V000001", "processing"],
    ["V000002", "queued"],
    ["V000003", "index-required"]
  ];
  for (const [sourceVideoId, preprocessStatus] of videoStatuses) {
    const manifestPath = path.join(
      libraryRoot,
      ".mixlab-library",
      "videos",
      sourceVideoId,
      "source-video.json"
    );
    const manifest = await readJson<Record<string, unknown>>(manifestPath);
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        preprocess_status: preprocessStatus,
        visible_to_cutters: false
      }),
      "utf8"
    );
  }

  for (const fileName of ["处理中.mp4", "排队中.mp4", "待索引.mp4", "未处理.mp4"]) {
    await rm(path.join(libraryRoot, "source-videos", fileName));
  }

  const settings = await readAdminSettings(libraryRoot);
  await writeAdminSettings(libraryRoot, {
    ...settings,
    source_folders: settings.source_folders.map((folder) =>
      folder.id === "src_default"
        ? { ...folder, path: externalSource }
        : folder
    )
  });
  await writeDummyFile(path.join(externalSource, "新素材.mp4"));

  const result = await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:05:00Z"
  });

  assert.equal(result.total_video_count, 1);
  for (const [sourceVideoId] of videoStatuses) {
    assert.equal(
      await pathExists(path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId)),
      true,
      `进行中的预处理目录不能被清理：${sourceVideoId}`
    );
  }
  assert.equal(
    await pathExists(path.join(libraryRoot, ".mixlab-library", "videos", "V000004")),
    false
  );
});

test("library path assertion rejects symlinks that escape the library root", {
  skip: process.platform === "win32"
}, async () => {
  const libraryRoot = await makeLibraryRoot();
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "mixlab-scan-link-target-"));
  const outsideFile = path.join(outsideRoot, "secret.txt");
  await writeFile(outsideFile, "outside", "utf8");

  const linkPath = path.join(libraryRoot, ".mixlab-library", "videos", "escape-link");
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(outsideRoot, linkPath, "dir");

  assert.equal(isLibraryPathInside(libraryRoot, path.join(linkPath, "secret.txt")), true);
  assert.equal(isLibraryPathInside(libraryRoot, path.join(libraryRoot, "source-videos")), true);
  assert.equal(isLibraryPathInside(libraryRoot, path.join(libraryRoot, "..", "outside.txt")), false);

  await assert.rejects(
    () => assertLibraryPathInside(
      libraryRoot,
      path.join(linkPath, "secret.txt"),
      "测试路径"
    ),
    /素材库外/
  );
  await assertLibraryPathInside(
    libraryRoot,
    path.join(libraryRoot, "source-videos", "normal.mp4"),
    "测试路径"
  );
});

test("recognizes only canonical source video ids", () => {
  for (const validId of ["V000001", "V999999"]) {
    assert.equal(isValidSourceVideoId(validId), true);
  }

  for (const invalidId of ["v000001", "V1", "V0000001", "../V000001", "V000001/..", "V00000a", ""]) {
    assert.equal(isValidSourceVideoId(invalidId), false);
  }
});
