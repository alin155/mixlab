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

function validate(settings: AdminSettings): void {
  for (const folder of settings.source_folders) {
    if (!folder.name.trim() || !folder.path.trim()) {
      throw new Error("素材来源名称和路径不能为空");
    }
  }

  if (!settings.artifact_library.path.trim()) {
    throw new Error("预处理产物库路径不能为空");
  }
}

export async function readAdminSettings(libraryRoot: string): Promise<AdminSettings> {
  try {
    return JSON.parse(await readFile(settingsPath(libraryRoot), "utf8")) as AdminSettings;
  } catch {
    return defaultSettings(libraryRoot);
  }
}

export async function writeAdminSettings(
  libraryRoot: string,
  settings: AdminSettings
): Promise<AdminSettings> {
  validate(settings);
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
  const nextId = `src_${String(current.source_folders.length + 1).padStart(3, "0")}`;
  return writeAdminSettings(libraryRoot, {
    ...current,
    source_folders: [...current.source_folders, { ...folder, id: nextId }]
  });
}
