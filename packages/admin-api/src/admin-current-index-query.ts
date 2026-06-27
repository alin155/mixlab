import { readFile } from "node:fs/promises";
import {
  readSourceTranscriptSqliteIndexMetadata,
  type SourceTranscriptSqliteIndexMetadata
} from "../../search-sqlite/src/index.ts";
import {
  adminSourceTranscriptCurrentPath,
  adminSourceTranscriptIndexSqlitePath
} from "./admin-library-paths.ts";

export interface AdminCurrentIndexMetadata {
  source_video_count: number;
  segment_count: number;
}

export interface AdminCurrentIndexQueryDeps {
  read_json_file?<T>(filePath: string): Promise<T>;
  read_current_index_version?(libraryRoot: string): Promise<string>;
  read_source_transcript_sqlite_index_metadata?(
    indexFilePath: string
  ): SourceTranscriptSqliteIndexMetadata;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function readAdminCurrentIndexVersion(
  libraryRoot: string,
  deps: AdminCurrentIndexQueryDeps = {}
): Promise<string> {
  try {
    const pointer = await (deps.read_json_file ?? readJsonFile)<{ current_version: string }>(
      adminSourceTranscriptCurrentPath(libraryRoot)
    );
    return pointer.current_version;
  } catch {
    return "";
  }
}

export async function readAdminCurrentIndexMetadata(
  libraryRoot: string,
  deps: AdminCurrentIndexQueryDeps = {}
): Promise<AdminCurrentIndexMetadata | null> {
  const currentVersion = await (deps.read_current_index_version ?? readAdminCurrentIndexVersion)(
    libraryRoot
  );

  if (!currentVersion) {
    return null;
  }

  try {
    const metadata = (deps.read_source_transcript_sqlite_index_metadata
      ?? readSourceTranscriptSqliteIndexMetadata)(
        adminSourceTranscriptIndexSqlitePath(libraryRoot, currentVersion)
      );

    return {
      source_video_count: metadata.source_video_count,
      segment_count: metadata.segment_count
    };
  } catch {
    return null;
  }
}
