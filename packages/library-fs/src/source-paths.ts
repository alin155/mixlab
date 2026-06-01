import path from "node:path";
import {
  resolveSourceVideoPath,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import { readAdminSettings } from "./admin-settings.ts";

function safeRelativeParts(relativePath: string): string[] {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("素材来源相对路径必须是安全的相对路径");
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.includes("..")) {
    throw new Error("素材来源相对路径不能跳出素材来源目录");
  }

  return parts;
}

export async function resolveSourceVideoFilePath(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<string> {
  if (!manifest.source_folder_id && !manifest.source_folder_relative_path) {
    return resolveSourceVideoPath({
      mount_root: libraryRoot,
      relative_path: manifest.relative_path
    });
  }

  if (!manifest.source_folder_id || !manifest.source_folder_relative_path) {
    throw new Error("素材来源定位信息不完整");
  }

  if (manifest.source_folder_id === "src_default") {
    return resolveSourceVideoPath({
      mount_root: libraryRoot,
      relative_path: manifest.source_folder_relative_path
    });
  }

  const settings = await readAdminSettings(libraryRoot);
  const sourceFolder = settings.source_folders.find(
    (folder) => folder.id === manifest.source_folder_id
  );

  if (!sourceFolder) {
    throw new Error(`素材来源不存在：${manifest.source_folder_id}`);
  }

  return path.join(sourceFolder.path, ...safeRelativeParts(manifest.source_folder_relative_path));
}
