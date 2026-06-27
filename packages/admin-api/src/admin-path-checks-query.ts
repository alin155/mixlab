import { constants } from "node:fs";
import {
  access,
  stat
} from "node:fs/promises";

export type AdminPathAccessStatus = "ok" | "missing" | "denied";
export type AdminPathCheckStatus = "pass" | "warn" | "fail";

export interface AdminPathCheck {
  label: string;
  path: string;
  status: AdminPathCheckStatus;
  message: string;
}

export interface AdminPathChecksSourceFolder {
  name: string;
  path: string;
  enabled: boolean;
}

export interface GetAdminPathChecksInput {
  library_root: string;
  source_folders: AdminPathChecksSourceFolder[];
  mixlab_library_path(libraryRoot: string): string;
  library_manifest_path(libraryRoot: string): string;
  directory_access_status?: (filePath: string, mode: number) => Promise<AdminPathAccessStatus>;
  file_access_status?: (filePath: string, mode: number) => Promise<AdminPathAccessStatus>;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT";
}

export async function directoryAdminPathAccessStatus(
  filePath: string,
  mode: number
): Promise<AdminPathAccessStatus> {
  try {
    if (!(await stat(filePath)).isDirectory()) {
      return "missing";
    }

    await access(filePath, mode);
    return "ok";
  } catch (error) {
    return isNotFoundError(error) ? "missing" : "denied";
  }
}

export async function fileAdminPathAccessStatus(
  filePath: string,
  mode: number
): Promise<AdminPathAccessStatus> {
  try {
    if (!(await stat(filePath)).isFile()) {
      return "missing";
    }

    await access(filePath, mode);
    return "ok";
  } catch (error) {
    return isNotFoundError(error) ? "missing" : "denied";
  }
}

function enabledSourceFolderMessage(accessStatus: AdminPathAccessStatus): string {
  if (accessStatus === "ok") {
    return "素材来源可读";
  }

  if (accessStatus === "missing") {
    return "素材来源不存在";
  }

  return "素材来源权限不足";
}

function libraryRootMessage(accessStatus: AdminPathAccessStatus): string {
  if (accessStatus === "ok") {
    return "根路径可读写";
  }

  if (accessStatus === "missing") {
    return "根路径不存在";
  }

  return "根路径权限不足";
}

function mixlabLibraryMessage(accessStatus: AdminPathAccessStatus): string {
  if (accessStatus === "ok") {
    return "协议目录可读写";
  }

  if (accessStatus === "missing") {
    return "尚未初始化协议目录";
  }

  return "协议目录权限不足";
}

function libraryManifestMessage(accessStatus: AdminPathAccessStatus): string {
  if (accessStatus === "ok") {
    return "library.json 可读写";
  }

  if (accessStatus === "missing") {
    return "library.json 尚未创建";
  }

  return "library.json 权限不足";
}

export async function getAdminPathChecks(input: GetAdminPathChecksInput): Promise<AdminPathCheck[]> {
  const directoryAccessStatus = input.directory_access_status ?? directoryAdminPathAccessStatus;
  const fileAccessStatus = input.file_access_status ?? fileAdminPathAccessStatus;
  const sourceFolderChecks: AdminPathCheck[] = await Promise.all(input.source_folders.map(async (folder) => {
    const accessStatus = await directoryAccessStatus(folder.path, constants.R_OK);

    return {
      label: `素材来源：${folder.name}`,
      path: folder.path,
      status: folder.enabled ? (accessStatus === "ok" ? "pass" : "fail") : "warn",
      message: folder.enabled
        ? enabledSourceFolderMessage(accessStatus)
        : "素材来源已停用"
    } satisfies AdminPathCheck;
  }));
  const libraryAccess = await directoryAccessStatus(input.library_root, constants.R_OK | constants.W_OK);
  const mixlabPath = input.mixlab_library_path(input.library_root);
  const mixlabAccess = await directoryAccessStatus(mixlabPath, constants.R_OK | constants.W_OK);
  const manifestPath = input.library_manifest_path(input.library_root);
  const manifestAccess = await fileAccessStatus(manifestPath, constants.R_OK | constants.W_OK);

  return [
    {
      label: "公共素材库",
      path: input.library_root,
      status: libraryAccess === "ok" ? "pass" : "fail",
      message: libraryRootMessage(libraryAccess)
    } satisfies AdminPathCheck,
    ...sourceFolderChecks,
    {
      label: ".mixlab-library",
      path: mixlabPath,
      status: mixlabAccess === "ok" ? "pass" : mixlabAccess === "missing" ? "warn" : "fail",
      message: mixlabLibraryMessage(mixlabAccess)
    } satisfies AdminPathCheck,
    {
      label: "library.json",
      path: manifestPath,
      status: manifestAccess === "ok" ? "pass" : manifestAccess === "missing" ? "warn" : "fail",
      message: libraryManifestMessage(manifestAccess)
    } satisfies AdminPathCheck
  ];
}
