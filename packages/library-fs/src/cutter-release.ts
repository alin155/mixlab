import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isVideoVisibleToCutters,
  resolveSourceVideoPath,
  validateSourceVideoManifest,
  type IndexPackageManifest,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import type {
  CutterKeyframesArtifact,
  CutterSourceLibraryView,
  CutterSourceVideoCard,
  CutterSourceVideoDetail,
  CutterTranscriptArtifact
} from "./cutter-source-library.ts";
import { readSourceVideoManifest } from "./preprocess-lifecycle.ts";
import { resolveSourceVideoFilePath } from "./source-paths.ts";

export interface PublishCutterReleaseInput {
  library_root: string;
  library_id?: string;
  release_version?: string;
  now: string;
}

export interface CutterReleaseManifest {
  schema_version: "1.0";
  release_version: string;
  library_id: string;
  generated_at: string;
  ready_video_count: number;
  source_index_version: string;
  catalog_path: "catalog.sqlite";
  source_path_map_path: "source-path-map.json";
  search_index_path?: "search-index/source-transcript-index";
  thumbnails_path?: "thumbnails";
  transcript_pack_path?: "transcript-pack";
}

export interface CutterReleaseCurrentPointer {
  schema_version: "1.0";
  library_id: string;
  current_version: string;
  updated_at: string;
  manifest_path: string;
}

export interface CutterReleaseSourcePathMap {
  schema_version: "1.0";
  release_version: string;
  library_id: string;
  source_videos: Record<
    string,
    {
      relative_path: string;
      source_folder_id: string;
      source_folder_relative_path: string;
      source_video_file_path: string;
    }
  >;
}

interface ReleaseCatalogRow {
  source_video_id: string;
  title: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  file_size: number;
  relative_path: string;
  logical_uri: string;
  source_folder_id: string;
  source_folder_relative_path: string;
  source_video_file_path: string;
  cover_path: string;
  transcript_path: string;
  srt_path: string;
  keyframes_path: string;
  transcript_character_count: number;
  description: string;
  tags_json: string;
  lecturer: string;
  course: string;
  category: string;
}

interface IndexSourceVideoRow {
  position: number;
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path: string;
  cover_path: string;
  transcript_character_count: number;
}

const INDEX_FIRST_RELEASE_SOURCE_VIDEO_COUNT = 1_000;

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function releasesRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "releases");
}

function releaseRoot(libraryRoot: string, releaseVersion: string): string {
  return path.join(releasesRoot(libraryRoot), releaseVersion);
}

function currentReleasePointerPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "current-release.json");
}

function releaseManifestPath(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), "release.json");
}

function releaseCatalogPath(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), "catalog.sqlite");
}

function releaseSourcePathMapPath(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), "source-path-map.json");
}

function releaseVersionRoot(releaseRootBase: string, releaseVersion: string): string {
  return path.join(releaseRootBase, ".mixlab-library", "releases", releaseVersion);
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isSafeLibraryRelativePath(relativePath: string): boolean {
  return (
    relativePath.trim() !== "" &&
    !relativePath.startsWith("/") &&
    !/^[a-zA-Z]:/.test(relativePath) &&
    !relativePath.split(/[\\/]+/).includes("..")
  );
}

function artifactFilePath(libraryRoot: string, libraryRelativePath: string): string {
  if (!isSafeLibraryRelativePath(libraryRelativePath)) {
    throw new Error("artifact path must be a library-relative path");
  }

  return path.join(libraryRoot, ...libraryRelativePath.replace(/\\/g, "/").split("/").filter(Boolean));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readCurrentIndexPackageManifest(
  libraryRoot: string
): Promise<IndexPackageManifest> {
  const currentPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    "current.json"
  );
  const pointer = await readJsonFile<{ current_version: string }>(currentPath);

  return readIndexPackageManifest(libraryRoot, pointer.current_version);
}

async function readIndexPackageManifest(
  libraryRoot: string,
  indexVersion: string
): Promise<IndexPackageManifest> {
  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    indexVersion,
    "index-manifest.json"
  );

  return readJsonFile<IndexPackageManifest>(manifestPath);
}

function compactCharacterCount(text: string): number {
  return text.replace(/\s+/g, "").length;
}

async function readTranscriptCharacterCount(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<number> {
  const transcript = await readJsonFile<CutterTranscriptArtifact>(
    artifactFilePath(libraryRoot, manifest.transcript_path)
  );

  return compactCharacterCount(transcript.full_text);
}

function currentIndexSqlitePath(libraryRoot: string, indexVersion: string): string {
  return path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    indexVersion,
    "index.sqlite"
  );
}

function readTranscriptCharacterCountsFromIndex(input: {
  library_root: string;
  index_version: string;
}): Map<string, number> {
  const indexPath = currentIndexSqlitePath(input.library_root, input.index_version);
  const db = openReadonlyDatabase(indexPath);

  try {
    const rows = db.prepare(`
      SELECT source_video_id, SUM(LENGTH(normalized_text)) AS transcript_character_count
      FROM segments
      GROUP BY source_video_id
    `).all() as Array<{
      source_video_id: string;
      transcript_character_count: number | null;
    }>;

    return new Map(
      rows.map((row) => [
        row.source_video_id,
        Math.max(0, Number(row.transcript_character_count ?? 0))
      ])
    );
  } finally {
    db.close();
  }
}

function readIndexSourceVideoRows(input: {
  library_root: string;
  index_version: string;
}): IndexSourceVideoRow[] {
  const indexPath = currentIndexSqlitePath(input.library_root, input.index_version);
  const db = openReadonlyDatabase(indexPath);

  try {
    return db.prepare(`
      SELECT
        v.position,
        v.source_video_id,
        v.title,
        v.duration_ms,
        v.relative_path,
        v.cover_path,
        0 AS transcript_character_count
      FROM source_videos v
      ORDER BY v.position ASC
    `).all() as unknown as IndexSourceVideoRow[];
  } finally {
    db.close();
  }
}

function manifestFromIndexRow(row: IndexSourceVideoRow): SourceVideoManifest {
  return {
    source_video_id: row.source_video_id,
    title: row.title,
    relative_path: row.relative_path,
    source_folder_id: "src_default",
    source_folder_relative_path: row.relative_path,
    logical_uri: `library://source-video/${row.source_video_id}`,
    duration_ms: row.duration_ms,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: 0,
    content_hash: "",
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: `.mixlab-library/videos/${row.source_video_id}/transcript.json`,
    srt_path: `.mixlab-library/videos/${row.source_video_id}/subtitles.srt`,
    keyframes_path: `.mixlab-library/videos/${row.source_video_id}/keyframes.json`,
    cover_path: row.cover_path
  };
}

function assertCutterReadyManifest(manifest: SourceVideoManifest): void {
  if (!isVideoVisibleToCutters(manifest)) {
    throw new Error(`source video ${manifest.source_video_id} is not visible to cutters`);
  }

  const validation = validateSourceVideoManifest(manifest);
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }
}

function createCatalogSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = DELETE;
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
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      fps REAL NOT NULL,
      codec TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      logical_uri TEXT NOT NULL,
      source_folder_id TEXT NOT NULL,
      source_folder_relative_path TEXT NOT NULL,
      source_video_file_path TEXT NOT NULL,
      cover_path TEXT NOT NULL,
      transcript_path TEXT NOT NULL,
      srt_path TEXT NOT NULL,
      keyframes_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      transcript_character_count INTEGER NOT NULL,
      description TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      lecturer TEXT NOT NULL,
      course TEXT NOT NULL,
      category TEXT NOT NULL
    );

    CREATE INDEX idx_release_source_videos_position ON source_videos(position);
    CREATE INDEX idx_release_source_videos_title ON source_videos(title);
  `);
}

function metadataRows(manifest: CutterReleaseManifest): Array<[string, string]> {
  return [
    ["schema_version", manifest.schema_version],
    ["library_id", manifest.library_id],
    ["release_version", manifest.release_version],
    ["generated_at", manifest.generated_at],
    ["ready_video_count", String(manifest.ready_video_count)],
    ["source_index_version", manifest.source_index_version],
    ["search_index_path", manifest.search_index_path ?? ""],
    ["thumbnails_path", manifest.thumbnails_path ?? ""],
    ["transcript_pack_path", manifest.transcript_pack_path ?? ""]
  ];
}

async function writeCatalogSqlite(input: {
  catalog_path: string;
  manifest: CutterReleaseManifest;
  videos: Array<{
    manifest: SourceVideoManifest;
    source_video_file_path: string;
    transcript_character_count: number;
  }>;
}): Promise<void> {
  await rm(input.catalog_path, { force: true });

  const db = new DatabaseSync(input.catalog_path);

  try {
    createCatalogSchema(db);
    db.exec("BEGIN");

    const insertMetadata = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    for (const [key, value] of metadataRows(input.manifest)) {
      insertMetadata.run(key, value);
    }

    const insertVideo = db.prepare(`
      INSERT INTO source_videos
        (
          position,
          source_video_id,
          title,
          duration_ms,
          width,
          height,
          fps,
          codec,
          file_size,
          relative_path,
          logical_uri,
          source_folder_id,
          source_folder_relative_path,
          source_video_file_path,
          cover_path,
          transcript_path,
          srt_path,
          keyframes_path,
          content_hash,
          transcript_character_count,
          description,
          tags_json,
          lecturer,
          course,
          category
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    input.videos.forEach((video, index) => {
      const sourceFolderId = video.manifest.source_folder_id ?? "";
      const sourceFolderRelativePath = video.manifest.source_folder_relative_path ?? "";

      insertVideo.run(
        index,
        video.manifest.source_video_id,
        video.manifest.title,
        video.manifest.duration_ms,
        video.manifest.width,
        video.manifest.height,
        video.manifest.fps,
        video.manifest.codec,
        video.manifest.file_size,
        video.manifest.relative_path,
        video.manifest.logical_uri,
        sourceFolderId,
        sourceFolderRelativePath,
        video.source_video_file_path,
        video.manifest.cover_path,
        video.manifest.transcript_path,
        video.manifest.srt_path,
        video.manifest.keyframes_path,
        video.manifest.content_hash,
        video.transcript_character_count,
        video.manifest.description ?? "",
        JSON.stringify(video.manifest.tags ?? []),
        video.manifest.lecturer ?? "",
        video.manifest.course ?? "",
        video.manifest.category ?? ""
      );
    });

    db.exec("COMMIT");
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

async function readExistingReleaseManifest(input: {
  library_root: string;
  release_version: string;
}): Promise<CutterReleaseManifest | null> {
  const manifestPath = releaseManifestPath(input.library_root, input.release_version);
  const catalogPath = releaseCatalogPath(input.library_root, input.release_version);
  const mapPath = releaseSourcePathMapPath(input.library_root, input.release_version);

  if (
    (await fileExists(manifestPath)) &&
    (await fileExists(catalogPath)) &&
    (await fileExists(mapPath))
  ) {
    const manifest = await readJsonFile<CutterReleaseManifest>(manifestPath);

    if (
      manifest.search_index_path &&
      manifest.thumbnails_path &&
      manifest.transcript_pack_path &&
      (await fileExists(path.join(
        releaseRoot(input.library_root, input.release_version),
        manifest.search_index_path,
        manifest.source_index_version,
        "index.sqlite"
      )))
    ) {
      return manifest;
    }
  }

  return null;
}

async function copyIfPresent(sourcePath: string, targetPath: string): Promise<boolean> {
  if (!(await fileExists(sourcePath))) {
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return true;
}

async function copyReleaseSearchIndex(input: {
  library_root: string;
  index_version: string;
  release_dir: string;
}): Promise<void> {
  const sourceIndexRoot = path.join(
    input.library_root,
    ".mixlab-library",
    "indexes",
    "source-transcript-index"
  );
  const targetIndexRoot = path.join(input.release_dir, "search-index", "source-transcript-index");
  const targetVersionRoot = path.join(targetIndexRoot, input.index_version);

  await mkdir(targetVersionRoot, { recursive: true });
  const copiedPointer = await copyIfPresent(
    path.join(sourceIndexRoot, "current.json"),
    path.join(targetIndexRoot, "current.json")
  );
  const copiedIndex = await copyIfPresent(
    path.join(sourceIndexRoot, input.index_version, "index.sqlite"),
    path.join(targetVersionRoot, "index.sqlite")
  );
  const copiedManifest = await copyIfPresent(
    path.join(sourceIndexRoot, input.index_version, "index-manifest.json"),
    path.join(targetVersionRoot, "index-manifest.json")
  );

  if (!copiedPointer || !copiedIndex || !copiedManifest) {
    throw new Error("release search index is incomplete");
  }
}

async function copyReleaseArtifacts(input: {
  library_root: string;
  release_dir: string;
  videos: Array<{ manifest: SourceVideoManifest }>;
}): Promise<void> {
  await mkdir(path.join(input.release_dir, "thumbnails"), { recursive: true });
  await mkdir(path.join(input.release_dir, "transcript-pack"), { recursive: true });
}

function releaseManifestRelativePath(releaseVersion: string): string {
  return `.mixlab-library/releases/${releaseVersion}/release.json`;
}

async function writeCurrentReleasePointer(input: {
  library_root: string;
  library_id: string;
  release_version: string;
  now: string;
}): Promise<void> {
  const pointer: CutterReleaseCurrentPointer = {
    schema_version: "1.0",
    library_id: input.library_id,
    current_version: input.release_version,
    updated_at: input.now,
    manifest_path: releaseManifestRelativePath(input.release_version)
  };
  const pointerPath = currentReleasePointerPath(input.library_root);
  const tempPointerPath = `${pointerPath}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(path.dirname(pointerPath), { recursive: true });
  await writeFile(tempPointerPath, jsonBytes(pointer), "utf8");
  await rename(tempPointerPath, pointerPath);
}

export async function publishCutterRelease(
  input: PublishCutterReleaseInput
): Promise<CutterReleaseManifest> {
  const releaseVersion = input.release_version;
  const indexManifest = releaseVersion
    ? await readIndexPackageManifest(input.library_root, releaseVersion)
    : await readCurrentIndexPackageManifest(input.library_root);
  const resolvedReleaseVersion = releaseVersion ?? indexManifest.index_version;
  const existing = await readExistingReleaseManifest({
    library_root: input.library_root,
    release_version: resolvedReleaseVersion
  });

  if (existing) {
    await writeCurrentReleasePointer({
      library_root: input.library_root,
      library_id: existing.library_id,
      release_version: existing.release_version,
      now: input.now
    });
    return existing;
  }

  const tempDir = path.join(
    releasesRoot(input.library_root),
    `${resolvedReleaseVersion}.tmp-${process.pid}-${Date.now()}`
  );
  const targetDir = releaseRoot(input.library_root, resolvedReleaseVersion);
  const videos = [];
  const indexFirstRows = indexManifest.source_video_ids.length > INDEX_FIRST_RELEASE_SOURCE_VIDEO_COUNT
    ? readIndexSourceVideoRows({
      library_root: input.library_root,
      index_version: indexManifest.index_version
    })
    : [];

  if (indexFirstRows.length > 0) {
    for (const row of indexFirstRows) {
      const manifest = manifestFromIndexRow(row);
      videos.push({
        manifest,
        source_video_file_path: resolveSourceVideoPath({
          mount_root: input.library_root,
          relative_path: row.relative_path
        }),
        transcript_character_count: Math.max(0, Number(row.transcript_character_count ?? 0))
      });
    }
  } else {
    const transcriptCharacterCounts = readTranscriptCharacterCountsFromIndex({
      library_root: input.library_root,
      index_version: indexManifest.index_version
    });

    for (const sourceVideoId of indexManifest.source_video_ids) {
      const manifest = await readSourceVideoManifest(input.library_root, sourceVideoId);
      assertCutterReadyManifest(manifest);
      const indexedTranscriptCharacterCount = transcriptCharacterCounts.get(sourceVideoId);
      videos.push({
        manifest,
        source_video_file_path: await resolveSourceVideoFilePath(input.library_root, manifest),
        transcript_character_count: indexedTranscriptCharacterCount ??
          await readTranscriptCharacterCount(input.library_root, manifest)
      });
    }
  }

  const releaseManifest: CutterReleaseManifest = {
    schema_version: "1.0",
    release_version: resolvedReleaseVersion,
    library_id: input.library_id ?? indexManifest.library_id,
    generated_at: input.now,
    ready_video_count: videos.length,
    source_index_version: indexManifest.index_version,
    catalog_path: "catalog.sqlite",
    source_path_map_path: "source-path-map.json",
    search_index_path: "search-index/source-transcript-index",
    thumbnails_path: "thumbnails",
    transcript_pack_path: "transcript-pack"
  };
  const sourcePathMap: CutterReleaseSourcePathMap = {
    schema_version: "1.0",
    release_version: releaseManifest.release_version,
    library_id: releaseManifest.library_id,
    source_videos: Object.fromEntries(
      videos.map((video) => [
        video.manifest.source_video_id,
        {
          relative_path: video.manifest.relative_path,
          source_folder_id: video.manifest.source_folder_id ?? "",
          source_folder_relative_path: video.manifest.source_folder_relative_path ?? "",
          source_video_file_path: video.source_video_file_path
        }
      ])
    )
  };

  await mkdir(releasesRoot(input.library_root), { recursive: true });

  try {
    await mkdir(tempDir, { recursive: false });
    await writeCatalogSqlite({
      catalog_path: path.join(tempDir, "catalog.sqlite"),
      manifest: releaseManifest,
      videos
    });
    await copyReleaseSearchIndex({
      library_root: input.library_root,
      index_version: indexManifest.index_version,
      release_dir: tempDir
    });
    await copyReleaseArtifacts({
      library_root: input.library_root,
      release_dir: tempDir,
      videos
    });
    await writeFile(
      path.join(tempDir, "source-path-map.json"),
      jsonBytes(sourcePathMap),
      "utf8"
    );
    await writeFile(path.join(tempDir, "release.json"), jsonBytes(releaseManifest), "utf8");
    await rm(targetDir, { recursive: true, force: true });
    await rename(tempDir, targetDir);
    await writeCurrentReleasePointer({
      library_root: input.library_root,
      library_id: releaseManifest.library_id,
      release_version: releaseManifest.release_version,
      now: input.now
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  return releaseManifest;
}

export async function readCurrentCutterRelease(
  libraryRoot: string
): Promise<CutterReleaseManifest> {
  const pointer = await readJsonFile<CutterReleaseCurrentPointer>(
    currentReleasePointerPath(libraryRoot)
  );

  return readJsonFile<CutterReleaseManifest>(
    releaseManifestPath(libraryRoot, pointer.current_version)
  );
}

function openReadonlyDatabase(filePath: string): DatabaseSync {
  return new DatabaseSync(`file:${filePath}?mode=ro&immutable=1`);
}

function parseTags(tagsJson: string): string[] | undefined {
  try {
    const tags = JSON.parse(tagsJson) as unknown;
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : undefined;
  } catch {
    return undefined;
  }
}

function resolveReleaseSourceVideoFilePath(
  libraryRoot: string,
  row: ReleaseCatalogRow
): string {
  if (!row.source_folder_id || row.source_folder_id === "src_default") {
    return resolveSourceVideoPath({
      mount_root: libraryRoot,
      relative_path: row.source_folder_relative_path || row.relative_path
    });
  }

  return row.source_video_file_path;
}

function releaseCatalogRowToCard(
  input: {
    library_root: string;
    artifact_root: string;
  },
  row: ReleaseCatalogRow
): CutterSourceVideoCard {
  const tags = parseTags(row.tags_json);
  const thumbnailFilePath = path.join(
    input.artifact_root,
    "thumbnails",
    `${row.source_video_id}${path.extname(row.cover_path) || ".jpg"}`
  );

  return {
    source_video_id: row.source_video_id,
    title: row.title,
    duration_ms: row.duration_ms,
    width: row.width,
    height: row.height,
    fps: row.fps,
    codec: row.codec,
    file_size: row.file_size,
    relative_path: row.relative_path,
    logical_uri: row.logical_uri,
    source_video_file_path: resolveReleaseSourceVideoFilePath(input.library_root, row),
    cover_path: row.cover_path,
    cover_file_path: thumbnailFilePath,
    ...(row.description ? { description: row.description } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(row.lecturer ? { lecturer: row.lecturer } : {}),
    ...(row.course ? { course: row.course } : {}),
    ...(row.category ? { category: row.category } : {})
  };
}

function readReleaseTranscriptFromSearchIndex(input: {
  artifact_root: string;
  release_manifest: CutterReleaseManifest;
  row: ReleaseCatalogRow;
}): CutterTranscriptArtifact {
  const indexPath = path.join(
    input.artifact_root,
    input.release_manifest.search_index_path ?? "search-index/source-transcript-index",
    input.release_manifest.source_index_version,
    "index.sqlite"
  );
  const db = openReadonlyDatabase(indexPath);

  try {
    const rows = db.prepare(`
      SELECT
        segment_id,
        segment_index,
        begin_ms,
        end_ms,
        text,
        normalized_text
      FROM segments
      WHERE source_video_id = ?
      ORDER BY segment_index ASC
    `).all(input.row.source_video_id) as Array<{
      segment_id: string;
      segment_index: number;
      begin_ms: number;
      end_ms: number;
      text: string;
      normalized_text: string;
    }>;
    let textCursor = 0;
    let normalizedCursor = 0;
    const segments: TranscriptSegment[] = rows.map((row) => {
      const text = row.text ?? "";
      const normalizedText = row.normalized_text ?? "";
      const beginChar = textCursor;
      const normalizedBeginChar = normalizedCursor;
      textCursor += text.length;
      normalizedCursor += normalizedText.length;

      return {
        segment_id: row.segment_id,
        index: row.segment_index,
        begin_ms: row.begin_ms,
        end_ms: row.end_ms,
        begin_char: beginChar,
        end_char: textCursor,
        normalized_begin_char: normalizedBeginChar,
        normalized_end_char: normalizedCursor,
        text,
        normalized_text: normalizedText,
        confidence: 1
      };
    });

    return {
      schema_version: "1.0",
      source_video_id: input.row.source_video_id,
      provider: "release-index",
      model: "source-transcript-index",
      generated_at: input.release_manifest.generated_at,
      duration_ms: input.row.duration_ms,
      full_text: segments.map((segment) => segment.text).join(""),
      segments
    };
  } finally {
    db.close();
  }
}

export async function listCutterReleaseCatalog(
  input: {
    library_root: string;
    release_root?: string;
    limit?: number;
    offset?: number;
  }
): Promise<CutterSourceLibraryView> {
  const releaseRootBase = input.release_root ?? input.library_root;
  const pointer = await readJsonFile<CutterReleaseCurrentPointer>(
    currentReleasePointerPath(releaseRootBase)
  );
  const releaseManifest = await readJsonFile<CutterReleaseManifest>(
    releaseManifestPath(releaseRootBase, pointer.current_version)
  );
  const artifactRoot = input.release_root
    ? releaseVersionRoot(input.release_root, pointer.current_version)
    : input.library_root;
  const catalogPath = releaseCatalogPath(releaseRootBase, pointer.current_version);
  const db = openReadonlyDatabase(catalogPath);

  try {
    const offset = Math.max(0, input.offset ?? 0);
    const limit = input.limit && input.limit > 0 ? input.limit : releaseManifest.ready_video_count;
    const rows = db.prepare(`
      SELECT
        source_video_id,
        title,
        duration_ms,
        width,
        height,
        fps,
        codec,
        file_size,
        relative_path,
        logical_uri,
        source_folder_id,
        source_folder_relative_path,
        source_video_file_path,
        cover_path,
        transcript_path,
        srt_path,
        keyframes_path,
        transcript_character_count,
        description,
        tags_json,
        lecturer,
        course,
        category
      FROM source_videos
      ORDER BY position
      LIMIT ? OFFSET ?
    `).all(limit, offset) as unknown as ReleaseCatalogRow[];

    return {
      available_video_count: releaseManifest.ready_video_count,
      videos: rows.map((row) => releaseCatalogRowToCard({
        library_root: input.library_root,
        artifact_root: artifactRoot
      }, row))
    };
  } finally {
    db.close();
  }
}

export async function getCutterReleaseSourceVideoDetail(input: {
  library_root: string;
  release_root: string;
  source_video_id: string;
}): Promise<CutterSourceVideoDetail | null> {
  const pointer = await readJsonFile<CutterReleaseCurrentPointer>(
    currentReleasePointerPath(input.release_root)
  );
  const releaseManifest = await readJsonFile<CutterReleaseManifest>(
    releaseManifestPath(input.release_root, pointer.current_version)
  );
  const catalogPath = releaseCatalogPath(input.release_root, pointer.current_version);
  const artifactRoot = releaseVersionRoot(input.release_root, pointer.current_version);
  const db = openReadonlyDatabase(catalogPath);

  try {
    const row = db.prepare(`
      SELECT
        source_video_id,
        title,
        duration_ms,
        width,
        height,
        fps,
        codec,
        file_size,
        relative_path,
        logical_uri,
        source_folder_id,
        source_folder_relative_path,
        source_video_file_path,
        cover_path,
        transcript_path,
        srt_path,
        keyframes_path,
        transcript_character_count,
        description,
        tags_json,
        lecturer,
        course,
        category
      FROM source_videos
      WHERE source_video_id = ?
      LIMIT 1
    `).get(input.source_video_id) as ReleaseCatalogRow | undefined;

    if (!row) {
      return null;
    }

    const card = releaseCatalogRowToCard({
      library_root: input.library_root,
      artifact_root: artifactRoot
    }, row);
    const transcriptFilePath = path.join(
      artifactRoot,
      releaseManifest.search_index_path ?? "search-index/source-transcript-index",
      releaseManifest.source_index_version,
      "index.sqlite"
    );
    const srtFilePath = path.join(
      artifactRoot,
      "transcript-pack",
      row.source_video_id,
      "subtitles.srt"
    );
    const keyframesFilePath = path.join(
      artifactRoot,
      "transcript-pack",
      row.source_video_id,
      "keyframes.json"
    );
    const srt = await fileExists(srtFilePath) ? await readFile(srtFilePath, "utf8") : "";
    const keyframes = await fileExists(keyframesFilePath)
      ? await readJsonFile<CutterKeyframesArtifact>(keyframesFilePath)
      : { schema_version: "1.0", keyframes_ms: [] };

    return {
      ...card,
      transcript_path: row.transcript_path,
      transcript_file_path: transcriptFilePath,
      srt_path: row.srt_path,
      srt_file_path: srtFilePath,
      keyframes_path: row.keyframes_path,
      keyframes_file_path: keyframesFilePath,
      transcript: readReleaseTranscriptFromSearchIndex({
        artifact_root: artifactRoot,
        release_manifest: releaseManifest,
        row
      }),
      srt,
      keyframes
    };
  } finally {
    db.close();
  }
}

export async function currentCutterReleaseSearchIndexFilePath(input: {
  release_root: string;
}): Promise<string> {
  const pointer = await readJsonFile<CutterReleaseCurrentPointer>(
    currentReleasePointerPath(input.release_root)
  );
  const manifest = await readJsonFile<CutterReleaseManifest>(
    releaseManifestPath(input.release_root, pointer.current_version)
  );
  return path.join(
    releaseVersionRoot(input.release_root, pointer.current_version),
    manifest.search_index_path ?? "search-index/source-transcript-index",
    manifest.source_index_version,
    "index.sqlite"
  );
}
