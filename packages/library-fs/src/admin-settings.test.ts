import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  readAdminSettings,
  writeAdminSettings
} from "./admin-settings.ts";

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "mixlab-admin-settings-"));
  await mkdir(path.join(root, "source-videos"), { recursive: true });
  return root;
}

test("creates default admin settings with one default source folder", async () => {
  const root = await makeRoot();
  const settings = await readAdminSettings(root);

  assert.equal(settings.library_name, "主素材库");
  assert.equal(settings.artifact_library.mode, "default");
  assert.equal(settings.source_folders.length, 1);
  assert.equal(settings.source_folders[0]?.name, "默认素材来源");
  assert.equal(settings.source_folders[0]?.path, path.join(root, "source-videos"));
  assert.equal(settings.source_folders[0]?.enabled, true);
});

test("persists multiple source folders without changing the single artifact library", async () => {
  const root = await makeRoot();
  const next = await addAdminSourceFolder(root, {
    name: "课程素材",
    path: "/Volumes/CourseVideos",
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  assert.equal(next.source_folders.length, 2);
  assert.equal(next.artifact_library.path, path.join(root, ".mixlab-library"));

  const raw = await readFile(path.join(root, ".mixlab-library", "admin-settings.json"), "utf8");
  assert.match(raw, /课程素材/);
});

test("rejects empty source folder names and paths", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  await assert.rejects(
    () => writeAdminSettings(root, {
      ...current,
      source_folders: [{ id: "src_bad", name: "", path: "", enabled: true }]
    }),
    /素材来源名称和路径不能为空/
  );
});
