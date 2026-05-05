import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  normalizeTranscriptText,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import type { TranscriptSearchResult } from "../../search-core/src/index.ts";
import { searchTranscripts } from "../../search-core/src/index.ts";

export interface SourceTranscriptSqliteVideo {
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path?: string;
  cover_path?: string;
  segments: TranscriptSegment[];
}

export interface WriteSourceTranscriptSqliteIndexInput {
  index_file_path: string;
  library_id: string;
  index_version: string;
  created_at: string;
  videos: SourceTranscriptSqliteVideo[];
}

export type CreateSourceTranscriptSqliteIndexBytesInput = Omit<
  WriteSourceTranscriptSqliteIndexInput,
  "index_file_path"
>;

export interface SourceTranscriptSqliteIndexMetadata {
  library_id: string;
  index_version: string;
  created_at: string;
  source_video_count: number;
  segment_count: number;
  schema_version: string;
}

export interface SearchSourceTranscriptSqliteIndexInput {
  index_file_path: string;
  query: string;
  limit: number;
}

interface SegmentSearchRow {
  source_video_id: string;
  title: string;
  duration_ms: number;
  segment_id: string;
  segment_index: number;
  begin_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
}

interface SourceVideoSearchRow {
  position: number;
  source_video_id: string;
  title: string;
  duration_ms: number;
}

function openDatabase(filePath: string): DatabaseSync {
  return new DatabaseSync(filePath);
}

function ngrams(normalizedText: string): string[] {
  const chars = Array.from(normalizedText);
  const grams = new Set<string>();

  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.add(`${chars[index]}${chars[index + 1]}`);
  }

  return [...grams];
}

function ngramsFromQuery(normalizedText: string): string[] {
  return ngrams(normalizedText);
}

function metadataRows(input: WriteSourceTranscriptSqliteIndexInput): Array<[string, string]> {
  const segmentCount = input.videos.reduce((count, video) => count + video.segments.length, 0);

  return [
    ["schema_version", "1.0"],
    ["library_id", input.library_id],
    ["index_version", input.index_version],
    ["created_at", input.created_at],
    ["source_video_count", String(input.videos.length)],
    ["segment_count", String(segmentCount)]
  ];
}

function createSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE source_videos (
      position INTEGER NOT NULL,
      source_video_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      cover_path TEXT NOT NULL
    );

    CREATE TABLE segments (
      source_video_id TEXT NOT NULL,
      segment_id TEXT PRIMARY KEY,
      segment_index INTEGER NOT NULL,
      begin_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      FOREIGN KEY (source_video_id) REFERENCES source_videos(source_video_id)
    );

    CREATE TABLE segment_ngrams (
      gram TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      source_video_id TEXT NOT NULL,
      FOREIGN KEY (segment_id) REFERENCES segments(segment_id)
    );

    CREATE INDEX idx_segment_ngrams_gram ON segment_ngrams(gram);
    CREATE INDEX idx_segments_source_position ON segments(source_video_id, segment_index);
  `);
}

export async function writeSourceTranscriptSqliteIndex(
  input: WriteSourceTranscriptSqliteIndexInput
): Promise<void> {
  await mkdir(path.dirname(input.index_file_path), { recursive: true });
  await rm(input.index_file_path, { force: true });
  await rm(`${input.index_file_path}-wal`, { force: true });
  await rm(`${input.index_file_path}-shm`, { force: true });

  const db = openDatabase(input.index_file_path);

  try {
    createSchema(db);
    db.exec("BEGIN");

    const insertMetadata = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    for (const [key, value] of metadataRows(input)) {
      insertMetadata.run(key, value);
    }

    const insertVideo = db.prepare(`
      INSERT INTO source_videos
        (position, source_video_id, title, duration_ms, relative_path, cover_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertSegment = db.prepare(`
      INSERT INTO segments
        (source_video_id, segment_id, segment_index, begin_ms, end_ms, text, normalized_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertGram = db.prepare(`
      INSERT INTO segment_ngrams (gram, segment_id, source_video_id)
      VALUES (?, ?, ?)
    `);

    input.videos.forEach((video, videoIndex) => {
      insertVideo.run(
        videoIndex,
        video.source_video_id,
        video.title,
        video.duration_ms,
        video.relative_path ?? "",
        video.cover_path ?? ""
      );

      for (const segment of video.segments) {
        const normalizedText = segment.normalized_text || normalizeTranscriptText(segment.text);

        insertSegment.run(
          video.source_video_id,
          segment.segment_id,
          segment.index,
          segment.begin_ms,
          segment.end_ms,
          segment.text,
          normalizedText
        );

        for (const gram of ngrams(normalizedText)) {
          insertGram.run(gram, segment.segment_id, video.source_video_id);
        }
      }
    });

    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }
    throw error;
  } finally {
    db.close();
  }
}

export async function createSourceTranscriptSqliteIndexBytes(
  input: CreateSourceTranscriptSqliteIndexBytesInput
): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-search-sqlite-bytes-"));
  const indexFilePath = path.join(tempDir, "index.sqlite");

  try {
    await writeSourceTranscriptSqliteIndex({
      ...input,
      index_file_path: indexFilePath
    });
    return await readFile(indexFilePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function readMetadataMap(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare("SELECT key, value FROM metadata").all() as Array<{
    key: string;
    value: string;
  }>;

  return new Map(rows.map((row) => [row.key, row.value]));
}

export function readSourceTranscriptSqliteIndexMetadata(
  indexFilePath: string
): SourceTranscriptSqliteIndexMetadata {
  const db = openDatabase(indexFilePath);

  try {
    const metadata = readMetadataMap(db);

    return {
      library_id: metadata.get("library_id") ?? "",
      index_version: metadata.get("index_version") ?? "",
      created_at: metadata.get("created_at") ?? "",
      source_video_count: Number.parseInt(metadata.get("source_video_count") ?? "0", 10),
      segment_count: Number.parseInt(metadata.get("segment_count") ?? "0", 10),
      schema_version: metadata.get("schema_version") ?? ""
    };
  } finally {
    db.close();
  }
}

function candidateSourceVideoIds(db: DatabaseSync, normalizedQuery: string, limit: number): string[] {
  const grams = ngramsFromQuery(normalizedQuery);

  if (grams.length === 0) {
    const rows = db
      .prepare(`
        SELECT DISTINCT v.position, v.source_video_id
        FROM segments s
        JOIN source_videos v ON v.source_video_id = s.source_video_id
        WHERE instr(s.normalized_text, ?) > 0
        ORDER BY v.position ASC
        LIMIT ?
      `)
      .all(normalizedQuery, limit) as Array<{ source_video_id: string }>;

    return rows.map((row) => row.source_video_id);
  }

  const placeholders = grams.map(() => "?").join(", ");
  const rows = db
    .prepare(`
      SELECT
        v.position,
        v.source_video_id,
        COUNT(DISTINCT g.gram) AS matched_grams
      FROM segment_ngrams g
      JOIN source_videos v ON v.source_video_id = g.source_video_id
      WHERE g.gram IN (${placeholders})
      GROUP BY v.source_video_id
      ORDER BY matched_grams DESC, v.position ASC
      LIMIT ?
    `)
    .all(...grams, limit) as Array<{ source_video_id: string }>;

  return rows.map((row) => row.source_video_id);
}

function readCandidateVideos(
  db: DatabaseSync,
  sourceVideoIds: readonly string[]
): Array<{
  source_video_id: string;
  title: string;
  duration_ms: number;
  segments: TranscriptSegment[];
}> {
  if (sourceVideoIds.length === 0) {
    return [];
  }

  const placeholders = sourceVideoIds.map(() => "?").join(", ");
  const videoRows = db
    .prepare(`
      SELECT position, source_video_id, title, duration_ms
      FROM source_videos
      WHERE source_video_id IN (${placeholders})
      ORDER BY position ASC
    `)
    .all(...sourceVideoIds) as unknown as SourceVideoSearchRow[];
  const segmentRows = db
    .prepare(`
      SELECT
        source_video_id,
        title,
        duration_ms,
        segment_id,
        segment_index,
        begin_ms,
        end_ms,
        text,
        normalized_text
      FROM (
        SELECT
          v.source_video_id,
          v.title,
          v.duration_ms,
          s.segment_id,
          s.segment_index,
          s.begin_ms,
          s.end_ms,
          s.text,
          s.normalized_text,
          v.position
        FROM segments s
        JOIN source_videos v ON v.source_video_id = s.source_video_id
        WHERE v.source_video_id IN (${placeholders})
      )
      ORDER BY position ASC, segment_index ASC
    `)
    .all(...sourceVideoIds) as unknown as SegmentSearchRow[];
  const segmentsByVideo = new Map<string, TranscriptSegment[]>();

  for (const row of segmentRows) {
    const current = segmentsByVideo.get(row.source_video_id) ?? [];
    current.push({
      segment_id: row.segment_id,
      index: row.segment_index,
      begin_ms: row.begin_ms,
      end_ms: row.end_ms,
      begin_char: 0,
      end_char: row.text.length,
      normalized_begin_char: 0,
      normalized_end_char: row.normalized_text.length,
      text: row.text,
      normalized_text: row.normalized_text,
      confidence: 1
    });
    segmentsByVideo.set(row.source_video_id, current);
  }

  return videoRows.map((video) => ({
    source_video_id: video.source_video_id,
    title: video.title,
    duration_ms: video.duration_ms,
    segments: segmentsByVideo.get(video.source_video_id) ?? []
  }));
}

export function searchSourceTranscriptSqliteIndex(
  input: SearchSourceTranscriptSqliteIndexInput
): TranscriptSearchResult {
  const normalizedQuery = normalizeTranscriptText(input.query);

  if (normalizedQuery === "") {
    return {
      query: input.query,
      normalized_query: normalizedQuery,
      groups: []
    };
  }

  const db = openDatabase(input.index_file_path);

  try {
    const candidateIds = candidateSourceVideoIds(
      db,
      normalizedQuery,
      Math.max(input.limit * 20, input.limit)
    );
    const candidateVideos = readCandidateVideos(db, candidateIds);
    const result = searchTranscripts({ videos: candidateVideos }, {
      query: input.query,
      limit: input.limit
    });

    return {
      query: input.query,
      normalized_query: normalizedQuery,
      groups: result.groups
    };
  } finally {
    db.close();
  }
}
