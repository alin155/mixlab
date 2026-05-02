import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  normalizeTranscriptText,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import type {
  TranscriptSearchGroup,
  TranscriptSearchHitSegment,
  TranscriptSearchResult
} from "../../search-core/src/index.ts";

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
  begin_ms: number;
  end_ms: number;
  text: string;
  normalized_text: string;
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

function firstNgram(normalizedText: string): string | null {
  const chars = Array.from(normalizedText);
  return chars.length >= 2 ? `${chars[0]}${chars[1]}` : null;
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

function queryRows(
  db: DatabaseSync,
  normalizedQuery: string
): SegmentSearchRow[] {
  const gram = firstNgram(normalizedQuery);

  if (gram) {
    return db
      .prepare(`
        SELECT DISTINCT
          v.source_video_id,
          v.title,
          v.duration_ms,
          s.segment_id,
          s.begin_ms,
          s.end_ms,
          s.text,
          s.normalized_text
        FROM segment_ngrams g
        JOIN segments s ON s.segment_id = g.segment_id
        JOIN source_videos v ON v.source_video_id = s.source_video_id
        WHERE g.gram = ? AND instr(s.normalized_text, ?) > 0
        ORDER BY v.position ASC, s.segment_index ASC
      `)
      .all(gram, normalizedQuery) as unknown as SegmentSearchRow[];
  }

  return db
    .prepare(`
      SELECT
        v.source_video_id,
        v.title,
        v.duration_ms,
        s.segment_id,
        s.begin_ms,
        s.end_ms,
        s.text,
        s.normalized_text
      FROM segments s
      JOIN source_videos v ON v.source_video_id = s.source_video_id
      WHERE instr(s.normalized_text, ?) > 0
      ORDER BY v.position ASC, s.segment_index ASC
    `)
    .all(normalizedQuery) as unknown as SegmentSearchRow[];
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
    const groups = new Map<string, TranscriptSearchGroup>();

    for (const row of queryRows(db, normalizedQuery)) {
      if (!groups.has(row.source_video_id)) {
        if (groups.size >= input.limit) {
          continue;
        }

        groups.set(row.source_video_id, {
          source_video_id: row.source_video_id,
          title: row.title,
          duration_ms: row.duration_ms,
          hit_count: 0,
          best_excerpt: row.text,
          hit_segments: []
        });
      }

      const group = groups.get(row.source_video_id);

      if (!group) {
        continue;
      }

      const matchStart = row.normalized_text.indexOf(normalizedQuery);
      const hitSegment: TranscriptSearchHitSegment = {
        segment_id: row.segment_id,
        begin_ms: row.begin_ms,
        end_ms: row.end_ms,
        text: row.text,
        match_ranges:
          matchStart === -1
            ? []
            : [[matchStart, matchStart + normalizedQuery.length - 1]]
      };

      group.hit_segments.push(hitSegment);
      group.hit_count = group.hit_segments.length;
    }

    return {
      query: input.query,
      normalized_query: normalizedQuery,
      groups: [...groups.values()]
    };
  } finally {
    db.close();
  }
}
