import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

function adminSettingsPath(root: string): string {
  return path.join(root, ".mixlab-library", "admin-settings.json");
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

test("rejects duplicate source folder ids", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  await assert.rejects(
    () => writeAdminSettings(root, {
      ...current,
      source_folders: [
        current.source_folders[0]!,
        {
          id: "src_default",
          name: "重复素材来源",
          path: "/Volumes/DuplicateVideos",
          enabled: true
        }
      ]
    }),
    /素材来源 ID 不能重复/
  );
});

test("throws a Chinese error for malformed persisted JSON", async () => {
  const root = await makeRoot();
  await mkdir(path.join(root, ".mixlab-library"), { recursive: true });
  await writeFile(adminSettingsPath(root), "{ bad json", "utf8");

  await assert.rejects(
    () => readAdminSettings(root),
    /管理员设置文件读取失败/
  );
});

test("throws a Chinese error for invalid persisted settings shape", async () => {
  const root = await makeRoot();
  await mkdir(path.join(root, ".mixlab-library"), { recursive: true });
  await writeFile(
    adminSettingsPath(root),
    JSON.stringify({
      schema_version: "2.0",
      library_name: "",
      source_folders: "bad"
    }),
    "utf8"
  );

  await assert.rejects(
    () => readAdminSettings(root),
    /管理员设置文件格式无效/
  );
});

test("throws a Chinese error for invalid persisted updated_at", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);
  await mkdir(path.join(root, ".mixlab-library"), { recursive: true });
  await writeFile(
    adminSettingsPath(root),
    JSON.stringify({ ...current, updated_at: 123 }),
    "utf8"
  );

  await assert.rejects(
    () => readAdminSettings(root),
    /管理员设置文件格式无效/
  );
});

test("throws a Chinese error for invalid optional persisted source folder fields", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);
  await mkdir(path.join(root, ".mixlab-library"), { recursive: true });
  await writeFile(
    adminSettingsPath(root),
    JSON.stringify({
      ...current,
      source_folders: [{
        ...current.source_folders[0],
        last_scanned_at: 123,
        discovered_video_count: -1,
        new_unprocessed_count: 1.5
      }]
    }),
    "utf8"
  );

  await assert.rejects(
    () => readAdminSettings(root),
    /管理员设置文件格式无效/
  );
});

test("rejects blank artifact library paths", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  await assert.rejects(
    () => writeAdminSettings(root, {
      ...current,
      artifact_library: { ...current.artifact_library, path: " " }
    }),
    /预处理产物库路径不能为空/
  );
});

test("allocates source folder ids from the max numeric suffix", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);
  await writeAdminSettings(root, {
    ...current,
    source_folders: [
      current.source_folders[0]!,
      {
        id: "src_1000",
        name: "历史素材",
        path: "/Volumes/OldVideos",
        enabled: true
      }
    ]
  });

  const next = await addAdminSourceFolder(root, {
    name: "课程素材",
    path: "/Volumes/CourseVideos",
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  assert.equal(next.source_folders.at(-1)?.id, "src_1001");
});

test("allocates source folder ids without number precision collisions", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);
  await writeAdminSettings(root, {
    ...current,
    source_folders: [
      current.source_folders[0]!,
      {
        id: "src_9007199254740992",
        name: "超大编号素材",
        path: "/Volumes/HugeIds",
        enabled: true
      }
    ]
  });

  const next = await addAdminSourceFolder(root, {
    name: "课程素材",
    path: "/Volumes/CourseVideos",
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  assert.equal(next.source_folders.at(-1)?.id, "src_9007199254740993");
});
