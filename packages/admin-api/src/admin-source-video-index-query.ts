import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  escapeSqliteLike,
  sourceVideoManifestFromIndexedRow
} from "./admin-source-video-query.ts";

interface AdminSourceVideoCurrentIndexQueryContext {
  library_root: string;
  read_current_index_version(libraryRoot: string): Promise<string>;
  index_root_from_library_root(libraryRoot: string): string;
}

interface AdminSourceVideoIndexedRow {
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path: string;
  cover_path: string;
}

export interface AdminSourceVideoIndexedPageQueryInput extends AdminSourceVideoCurrentIndexQueryContext {
  offset: number;
  limit: number;
  query?: string;
}

export interface AdminSourceVideoIndexedManifestMapQueryInput extends AdminSourceVideoCurrentIndexQueryContext {
  source_video_ids: string[];
}

async function currentIndexSqlitePath(
  input: AdminSourceVideoCurrentIndexQueryContext
): Promise<string | null> {
  const currentVersion = await input.read_current_index_version(input.library_root);
  if (!currentVersion) {
    return null;
  }

  return path.join(
    input.index_root_from_library_root(input.library_root),
    currentVersion,
    "index.sqlite"
  );
}

export async function readIndexedAdminSourceVideoManifestMapByIds(
  input: AdminSourceVideoIndexedManifestMapQueryInput
): Promise<Map<string, SourceVideoManifest> | null> {
  if (input.source_video_ids.length === 0) {
    return null;
  }

  const indexPath = await currentIndexSqlitePath(input);
  if (!indexPath) {
    return null;
  }

  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(`file:${indexPath}?mode=ro&immutable=1`);
    const placeholders = input.source_video_ids.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT source_video_id, title, duration_ms, relative_path, cover_path
      FROM source_videos
      WHERE source_video_id IN (${placeholders})
      ORDER BY position
    `).all(...input.source_video_ids) as unknown as AdminSourceVideoIndexedRow[];

    return new Map(rows.map((row) => [row.source_video_id, sourceVideoManifestFromIndexedRow(row)]));
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function readIndexedAdminSourceVideoManifests(
  input: AdminSourceVideoIndexedPageQueryInput
): Promise<SourceVideoManifest[] | null> {
  const indexPath = await currentIndexSqlitePath(input);
  if (!indexPath) {
    return null;
  }

  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(`file:${indexPath}?mode=ro&immutable=1`);
    const normalizedQuery = input.query?.trim() ?? "";
    const rows = normalizedQuery
      ? db.prepare(`
        SELECT source_video_id, title, duration_ms, relative_path, cover_path
        FROM source_videos
        WHERE lower(source_video_id) LIKE lower(?) ESCAPE '\\'
          OR lower(title) LIKE lower(?) ESCAPE '\\'
          OR lower(relative_path) LIKE lower(?) ESCAPE '\\'
        ORDER BY position
        LIMIT ? OFFSET ?
      `).all(
        `%${escapeSqliteLike(normalizedQuery)}%`,
        `%${escapeSqliteLike(normalizedQuery)}%`,
        `%${escapeSqliteLike(normalizedQuery)}%`,
        input.limit > 0 ? input.limit : -1,
        input.offset
      )
      : db.prepare(`
        SELECT source_video_id, title, duration_ms, relative_path, cover_path
        FROM source_videos
        ORDER BY position
        LIMIT ? OFFSET ?
      `).all(
        input.limit > 0 ? input.limit : -1,
        input.offset
      );

    return (rows as unknown as AdminSourceVideoIndexedRow[]).map(sourceVideoManifestFromIndexedRow);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function readIndexedAdminSourceVideoIdSet(
  input: AdminSourceVideoCurrentIndexQueryContext
): Promise<Set<string> | null> {
  const indexPath = await currentIndexSqlitePath(input);
  if (!indexPath) {
    return null;
  }

  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(`file:${indexPath}?mode=ro&immutable=1`);
    const rows = db.prepare("SELECT source_video_id FROM source_videos").all() as Array<{
      source_video_id: string;
    }>;

    return new Set(rows.map((row) => row.source_video_id));
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
