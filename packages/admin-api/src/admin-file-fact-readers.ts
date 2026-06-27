import { readFile } from "node:fs/promises";
import type { LibraryCounts } from "../../protocol/src/index.ts";
import {
  adminLibraryManifestPath,
  adminPreprocessJobPath
} from "./admin-library-paths.ts";
import type { AdminPreprocessJobRecord } from "./admin-preprocess-jobs-query.ts";

export interface AdminLibraryManifest extends LibraryCounts {
  library_id?: string;
  name?: string;
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function readAdminJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function readAdminLibraryManifest(libraryRoot: string): Promise<AdminLibraryManifest | null> {
  try {
    return await readAdminJsonFile<AdminLibraryManifest>(adminLibraryManifestPath(libraryRoot));
  } catch {
    return null;
  }
}

export async function readAdminPreprocessJob(
  libraryRoot: string,
  sourceVideoId: string
): Promise<AdminPreprocessJobRecord | null> {
  try {
    return await readAdminJsonFile<AdminPreprocessJobRecord>(adminPreprocessJobPath(libraryRoot, sourceVideoId));
  } catch {
    return null;
  }
}
