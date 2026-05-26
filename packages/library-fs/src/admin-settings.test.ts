import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  applyAdminRuntimeSecretsToEnv,
  readAdminSettings,
  readAdminRuntimeSecrets,
  removeAdminSourceFolder,
  updateAdminRuntimeSecrets,
  updateAdminRuntimePolicy,
  updateAdminSettings,
  updateAdminSourceFolder,
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
  assert.equal(next.source_folders[1]?.id, "src_002");
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
      source_folders: [{ id: "src_002", name: "", path: "", enabled: true }]
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

test("rejects unsafe source folder ids", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  for (const id of ["", ".", "..", "src/002", "src\\002", "src_abc"]) {
    await assert.rejects(
      () => writeAdminSettings(root, {
        ...current,
        source_folders: [
          current.source_folders[0]!,
          {
            id,
            name: "不安全素材来源",
            path: "/Volumes/UnsafeVideos",
            enabled: true
          }
        ]
      }),
      /素材来源 ID 格式无效/
    );
  }
});

test("accepts generated source folder ids", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  await writeAdminSettings(root, {
    ...current,
    source_folders: [
      current.source_folders[0]!,
      {
        id: "src_002",
        name: "课程素材",
        path: "/Volumes/CourseVideos",
        enabled: true
      }
    ]
  });
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

test("updates admin settings with source folders and runtime policy", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);
  const updated = await updateAdminSettings(root, {
    library_name: "课程公共素材库",
    source_folders: [
      {
        ...current.source_folders[0]!,
        name: "默认课程素材",
        enabled: false
      },
      {
        id: "src_002",
        name: "新增课程素材",
        path: "/Volumes/CourseVideos",
        enabled: true
      }
    ],
    runtime_policy: {
      audio_mode: "wav_16k_mono_pcm_s16le",
      concurrent_jobs: 3,
      auto_scan_enabled: true,
      auto_queue_enabled: true,
      auto_publish_index_enabled: false
    }
  });

  assert.equal(updated.library_name, "课程公共素材库");
  assert.equal(updated.source_folders.length, 2);
  assert.equal(updated.source_folders[0]?.name, "默认课程素材");
  assert.equal(updated.source_folders[0]?.enabled, false);
  assert.equal(updated.source_folders[1]?.id, "src_002");
  assert.equal(updated.runtime_policy.audio_mode, "wav_16k_mono_pcm_s16le");
  assert.equal(updated.runtime_policy.concurrent_jobs, 3);
  assert.equal(updated.runtime_policy.auto_queue_enabled, true);

  const persisted = await readAdminSettings(root);
  assert.equal(persisted.library_name, "课程公共素材库");
  assert.equal(persisted.runtime_policy.concurrent_jobs, 3);
});

test("persists admin runtime secrets separately from public settings", async () => {
  const root = await makeRoot();
  await updateAdminRuntimeSecrets(root, {
    dashscope_api_key: "  sk-live-secret  "
  });

  const secrets = await readAdminRuntimeSecrets(root);
  assert.equal(secrets.dashscope_api_key, "sk-live-secret");
  const settingsRaw = await readFile(adminSettingsPath(root), "utf8").catch(() => "");
  assert.equal(settingsRaw.includes("sk-live-secret"), false);

  const env: NodeJS.ProcessEnv = {};
  await applyAdminRuntimeSecretsToEnv(root, env);
  assert.equal(env.DASHSCOPE_API_KEY, "sk-live-secret");

  await updateAdminRuntimeSecrets(root, {
    dashscope_api_key: ""
  });
  assert.equal((await readAdminRuntimeSecrets(root)).dashscope_api_key, "");
});

test("clears source folder scan stats when path changes", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);
  await writeAdminSettings(root, {
    ...current,
    source_folders: [{
      ...current.source_folders[0]!,
      last_scanned_at: "2026-05-03T10:00:00.000Z",
      discovered_video_count: 10,
      new_unprocessed_count: 4
    }]
  });

  const updated = await updateAdminSourceFolder(root, "src_default", {
    path: path.join(root, "new-source-videos")
  });

  assert.equal(updated.source_folders[0]?.path, path.join(root, "new-source-videos"));
  assert.equal(updated.source_folders[0]?.last_scanned_at, "");
  assert.equal(updated.source_folders[0]?.discovered_video_count, 0);
  assert.equal(updated.source_folders[0]?.new_unprocessed_count, 0);
});

test("updates runtime policy without changing source folders", async () => {
  const root = await makeRoot();
  await addAdminSourceFolder(root, {
    name: "课程素材",
    path: "/Volumes/CourseVideos",
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  const updated = await updateAdminRuntimePolicy(root, {
    concurrent_jobs: 4,
    auto_scan_enabled: true,
    auto_queue_enabled: true
  });

  assert.equal(updated.runtime_policy.concurrent_jobs, 4);
  assert.equal(updated.runtime_policy.auto_scan_enabled, true);
  assert.equal(updated.runtime_policy.auto_queue_enabled, true);
  assert.equal(updated.source_folders.length, 2);
});

test("rejects removing the default source folder", async () => {
  const root = await makeRoot();

  await assert.rejects(
    () => removeAdminSourceFolder(root, "src_default"),
    /默认素材来源不能移除/
  );
});

test("removes non-default source folders", async () => {
  const root = await makeRoot();
  await addAdminSourceFolder(root, {
    name: "课程素材",
    path: "/Volumes/CourseVideos",
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });

  const updated = await removeAdminSourceFolder(root, "src_002");

  assert.equal(updated.source_folders.length, 1);
  assert.equal(updated.source_folders[0]?.id, "src_default");
});

test("rejects relative source folder paths when saving settings", async () => {
  const root = await makeRoot();
  const current = await readAdminSettings(root);

  await assert.rejects(
    () => updateAdminSettings(root, {
      source_folders: [{
        ...current.source_folders[0]!,
        path: "relative/source-videos"
      }]
    }),
    /素材来源路径必须是绝对路径/
  );
});
