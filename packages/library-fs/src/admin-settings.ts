import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AdminSourceFolder {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  last_scanned_at?: string;
  discovered_video_count?: number;
  new_unprocessed_count?: number;
}

export interface AdminArtifactLibrarySettings {
  mode: "default" | "custom";
  path: string;
  migration_required: boolean;
}

export interface AdminRuntimePolicy {
  audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
  concurrent_jobs: number;
  auto_scan_enabled: boolean;
  auto_queue_enabled: boolean;
  auto_publish_index_enabled: boolean;
}

export interface AdminSettings {
  schema_version: "1.0";
  library_name: string;
  source_folders: AdminSourceFolder[];
  artifact_library: AdminArtifactLibrarySettings;
  runtime_policy: AdminRuntimePolicy;
  updated_at: string;
}

export type AdminSettingsPatch = Partial<Pick<AdminSettings, "library_name" | "source_folders" | "runtime_policy">>;
export type AdminSourceFolderPatch = Partial<Pick<AdminSourceFolder, "name" | "path" | "enabled">>;
export type AdminRuntimePolicyPatch = Partial<AdminRuntimePolicy>;

interface NodeError extends Error {
  code?: string;
}

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function settingsPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "admin-settings.json");
}

function defaultSettings(libraryRoot: string): AdminSettings {
  return {
    schema_version: "1.0",
    library_name: "主素材库",
    source_folders: [
      {
        id: "src_default",
        name: "默认素材来源",
        path: path.join(libraryRoot, "source-videos"),
        enabled: true,
        last_scanned_at: "",
        discovered_video_count: 0,
        new_unprocessed_count: 0
      }
    ],
    artifact_library: {
      mode: "default",
      path: mixlabRoot(libraryRoot),
      migration_required: false
    },
    runtime_policy: {
      audio_mode: "mp3_16k_mono_64k",
      concurrent_jobs: 1,
      auto_scan_enabled: false,
      auto_queue_enabled: false,
      auto_publish_index_enabled: true
    },
    updated_at: ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isSafeSourceFolderId(value: unknown): value is string {
  return value === "src_default" || (typeof value === "string" && /^src_\d+$/.test(value));
}

function invalidSettings(message: string): never {
  throw new Error(`管理员设置文件格式无效：${message}`);
}

function assertAbsoluteSourceFolderPaths(sourceFolders: AdminSourceFolder[]): void {
  for (const folder of sourceFolders) {
    if (!path.isAbsolute(folder.path)) {
      throw new Error("素材来源路径必须是绝对路径");
    }
  }
}

function validate(settings: unknown): asserts settings is AdminSettings {
  if (!isRecord(settings)) {
    invalidSettings("根对象必须是对象");
  }

  if (settings.schema_version !== "1.0") {
    invalidSettings("schema_version 必须是 1.0");
  }

  if (!isNonEmptyString(settings.library_name)) {
    invalidSettings("素材库名称不能为空");
  }

  if (typeof settings.updated_at !== "string") {
    invalidSettings("更新时间必须是字符串");
  }

  if (!Array.isArray(settings.source_folders)) {
    invalidSettings("素材来源列表必须是数组");
  }

  const sourceFolderIds = new Set<string>();

  for (const folder of settings.source_folders) {
    if (!isRecord(folder)) {
      invalidSettings("素材来源必须是对象");
    }

    if (!isSafeSourceFolderId(folder.id)) {
      invalidSettings("素材来源 ID 格式无效");
    }

    if (sourceFolderIds.has(folder.id)) {
      throw new Error("素材来源 ID 不能重复");
    }
    sourceFolderIds.add(folder.id);

    if (!isBoolean(folder.enabled)) {
      invalidSettings("素材来源启用状态必须是布尔值");
    }

    if (!isNonEmptyString(folder.name) || !isNonEmptyString(folder.path)) {
      throw new Error("素材来源名称和路径不能为空");
    }

    if (
      folder.last_scanned_at !== undefined &&
      typeof folder.last_scanned_at !== "string"
    ) {
      invalidSettings("素材来源最后扫描时间必须是字符串");
    }

    if (
      folder.discovered_video_count !== undefined &&
      !isNonNegativeInteger(folder.discovered_video_count)
    ) {
      invalidSettings("素材来源发现视频数必须是非负整数");
    }

    if (
      folder.new_unprocessed_count !== undefined &&
      !isNonNegativeInteger(folder.new_unprocessed_count)
    ) {
      invalidSettings("素材来源新增待处理数必须是非负整数");
    }
  }

  if (!isRecord(settings.artifact_library)) {
    invalidSettings("预处理产物库设置必须是对象");
  }

  const artifactLibrary = settings.artifact_library;

  if (
    artifactLibrary.mode !== "default" &&
    artifactLibrary.mode !== "custom"
  ) {
    invalidSettings("预处理产物库模式无效");
  }

  if (!isBoolean(artifactLibrary.migration_required)) {
    invalidSettings("预处理产物库迁移状态必须是布尔值");
  }

  if (!isNonEmptyString(artifactLibrary.path)) {
    throw new Error("预处理产物库路径不能为空");
  }

  if (!isRecord(settings.runtime_policy)) {
    invalidSettings("运行策略必须是对象");
  }

  const runtimePolicy = settings.runtime_policy;

  if (
    runtimePolicy.audio_mode !== "mp3_16k_mono_64k" &&
    runtimePolicy.audio_mode !== "wav_16k_mono_pcm_s16le"
  ) {
    invalidSettings("音频模式无效");
  }

  if (
    typeof runtimePolicy.concurrent_jobs !== "number" ||
    !Number.isInteger(runtimePolicy.concurrent_jobs) ||
    runtimePolicy.concurrent_jobs < 1
  ) {
    invalidSettings("并发任务数必须是正整数");
  }

  for (const key of [
    "auto_scan_enabled",
    "auto_queue_enabled",
    "auto_publish_index_enabled"
  ] as const) {
    if (!isBoolean(runtimePolicy[key])) {
      invalidSettings("自动处理开关必须是布尔值");
    }
  }
}

function normalizeSourceFolderAfterPathChange(
  previous: AdminSourceFolder,
  next: AdminSourceFolder
): AdminSourceFolder {
  return path.resolve(previous.path) === path.resolve(next.path)
    ? next
    : {
        ...next,
        last_scanned_at: "",
        discovered_video_count: 0,
        new_unprocessed_count: 0
      };
}

function nextSourceFolderId(sourceFolders: AdminSourceFolder[]): string {
  let maxSuffix = BigInt(sourceFolders.length);

  for (const folder of sourceFolders) {
    const match = /^src_(\d+)$/.exec(folder.id);
    if (match) {
      const suffix = BigInt(match[1] ?? "0");
      if (suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }
  }

  return `src_${String(maxSuffix + 1n).padStart(3, "0")}`;
}

export async function readAdminSettings(libraryRoot: string): Promise<AdminSettings> {
  let raw: string;

  try {
    raw = await readFile(settingsPath(libraryRoot), "utf8");
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return defaultSettings(libraryRoot);
    }

    throw new Error("管理员设置文件读取失败，请检查文件权限和路径");
  }

  try {
    const settings = JSON.parse(raw) as unknown;
    validate(settings);
    return settings;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("管理员设置文件读取失败：JSON 格式无效");
    }

    throw error;
  }
}

export async function writeAdminSettings(
  libraryRoot: string,
  settings: AdminSettings
): Promise<AdminSettings> {
  validate(settings);
  assertAbsoluteSourceFolderPaths(settings.source_folders);
  const next = { ...settings, updated_at: new Date().toISOString() };
  await mkdir(mixlabRoot(libraryRoot), { recursive: true });
  await writeFile(settingsPath(libraryRoot), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function addAdminSourceFolder(
  libraryRoot: string,
  folder: Omit<AdminSourceFolder, "id">
): Promise<AdminSettings> {
  const current = await readAdminSettings(libraryRoot);
  const nextId = nextSourceFolderId(current.source_folders);
  return writeAdminSettings(libraryRoot, {
    ...current,
    source_folders: [...current.source_folders, { ...folder, id: nextId }]
  });
}

export async function updateAdminSettings(
  libraryRoot: string,
  patch: AdminSettingsPatch
): Promise<AdminSettings> {
  const current = await readAdminSettings(libraryRoot);
  const currentById = new Map(current.source_folders.map((folder) => [folder.id, folder]));
  const sourceFolders = patch.source_folders
    ? patch.source_folders.map((folder) => {
        const previous = currentById.get(folder.id);
        return previous ? normalizeSourceFolderAfterPathChange(previous, folder) : folder;
      })
    : current.source_folders;

  return writeAdminSettings(libraryRoot, {
    ...current,
    library_name: patch.library_name ?? current.library_name,
    source_folders: sourceFolders,
    runtime_policy: patch.runtime_policy
      ? { ...current.runtime_policy, ...patch.runtime_policy }
      : current.runtime_policy
  });
}

export async function updateAdminSourceFolder(
  libraryRoot: string,
  sourceFolderId: string,
  patch: AdminSourceFolderPatch
): Promise<AdminSettings> {
  const current = await readAdminSettings(libraryRoot);
  let found = false;
  const sourceFolders = current.source_folders.map((folder) => {
    if (folder.id !== sourceFolderId) {
      return folder;
    }

    found = true;
    return normalizeSourceFolderAfterPathChange(folder, {
      ...folder,
      ...patch
    });
  });

  if (!found) {
    throw new Error("素材来源不存在");
  }

  return writeAdminSettings(libraryRoot, {
    ...current,
    source_folders: sourceFolders
  });
}

export async function removeAdminSourceFolder(
  libraryRoot: string,
  sourceFolderId: string
): Promise<AdminSettings> {
  if (sourceFolderId === "src_default") {
    throw new Error("默认素材来源不能移除");
  }

  const current = await readAdminSettings(libraryRoot);
  const sourceFolders = current.source_folders.filter((folder) => folder.id !== sourceFolderId);

  if (sourceFolders.length === current.source_folders.length) {
    throw new Error("素材来源不存在");
  }

  return writeAdminSettings(libraryRoot, {
    ...current,
    source_folders: sourceFolders
  });
}

export async function updateAdminRuntimePolicy(
  libraryRoot: string,
  patch: AdminRuntimePolicyPatch
): Promise<AdminSettings> {
  const current = await readAdminSettings(libraryRoot);
  return writeAdminSettings(libraryRoot, {
    ...current,
    runtime_policy: {
      ...current.runtime_policy,
      ...patch
    }
  });
}
