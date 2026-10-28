import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import {
  CONTRACT_VERSION,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  validateReleaseManifestV2,
  type ReleaseFileEntryV2,
  type ReleaseFileRole,
  type ReleaseManifestV2
} from "../../contracts/src/index.ts";
import {
  assertSafePathSegment as assertSafeReleasePathSegment,
  isCompleteReleaseManifestV1,
  isSafeLibraryRelativePath,
  parseCurrentReleasePointer,
  parseIndexCurrentPointer,
  parseIndexPackageManifest,
  parseJsonText,
  parseReleaseManifestV1
} from "../../library-format/src/index.ts";
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
  CutterSourceFolderOption,
  CutterSourceLibraryView,
  CutterSourceVideoCard,
  CutterSourceVideoDetail,
  CutterTranscriptArtifact
} from "./cutter-source-library.ts";
import { hashFileSha256 } from "./file-hash.ts";
import { readSourceVideoManifest } from "./preprocess-lifecycle.ts";
import { assertLibraryPathInside } from "./scanner.ts";
import { resolveSourceVideoFilePath } from "./source-paths.ts";
import { normalizeSourceFolderName, sourceFolderNameFromRelativePath } from "./source-folders.ts";

export interface PublishCutterReleaseInput {
  library_root: string;
  library_id?: string;
  release_version?: string;
  now: string;
  /** Release-manifest v2 minimum supported client version; defaults to env/constant. */
  min_client_version?: string;
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
  source_folder_name: string;
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
  source_folder_name: string;
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

function artifactFilePath(libraryRoot: string, libraryRelativePath: string): string {
  if (!isSafeLibraryRelativePath(libraryRelativePath)) {
    throw new Error("artifact path must be a library-relative path");
  }

  return path.join(libraryRoot, ...libraryRelativePath.replace(/\\/g, "/").split("/").filter(Boolean));
}

const RELEASE_SEARCH_INDEX_PATH = "search-index/source-transcript-index";
const RELEASE_THUMBNAILS_PATH = "thumbnails";
const RELEASE_TRANSCRIPT_PACK_PATH = "transcript-pack";
const SAFE_RELEASE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Sealed bundle permissions: regular files 0640, directories 0750. */
const RELEASE_FILE_MODE = 0o640;
const RELEASE_DIRECTORY_MODE = 0o750;

async function applyReleaseFileMode(filePath: string): Promise<void> {
  await chmod(filePath, RELEASE_FILE_MODE).catch(() => {
    // Best effort for SMB/NAS filesystems that may not support chmod.
  });
}

async function applyReleaseDirectoryMode(directoryPath: string): Promise<void> {
  await chmod(directoryPath, RELEASE_DIRECTORY_MODE).catch(() => {
    // Best effort for SMB/NAS filesystems that may not support chmod.
  });
}

function cutterReleaseAuditLog(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    component: "library-fs.cutter-release",
    event,
    ...details
  }));
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

async function nonEmptyFileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function readCompleteReleaseManifestInDirectory(input: {
  release_dir: string;
  release_version: string;
}): Promise<CutterReleaseManifest | null> {
  const manifestPath = path.join(input.release_dir, "release.json");
  const catalogPath = path.join(input.release_dir, "catalog.sqlite");
  const sourcePathMapPath = path.join(input.release_dir, "source-path-map.json");

  if (
    !(await nonEmptyFileExists(manifestPath)) ||
    !(await nonEmptyFileExists(catalogPath)) ||
    !(await nonEmptyFileExists(sourcePathMapPath))
  ) {
    return null;
  }

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }

  if (!isCompleteReleaseManifestV1(manifestValue, input.release_version)) {
    return null;
  }

  const manifest = parseReleaseManifestV1(manifestValue, {
    expected_release_version: input.release_version
  });

  const searchIndexRoot = path.join(input.release_dir, RELEASE_SEARCH_INDEX_PATH);
  const searchIndexCurrentPath = path.join(searchIndexRoot, "current.json");
  const searchIndexSqlitePath = path.join(
    searchIndexRoot,
    manifestValue.source_index_version,
    "index.sqlite"
  );

  if (
    !(await nonEmptyFileExists(searchIndexCurrentPath)) ||
    !(await nonEmptyFileExists(searchIndexSqlitePath))
  ) {
    return null;
  }

  return manifest;
}

async function restoreQuarantinedReleaseDirectory(
  targetDir: string,
  quarantinedDir: string | null
): Promise<void> {
  if (!quarantinedDir || await directoryExists(targetDir)) {
    return;
  }

  try {
    await rename(quarantinedDir, targetDir);
  } catch {
    // Keep the quarantined directory in place; it is never deleted on a failed restore.
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  // Round5: 统一走 library-format 的 JSON 解析（错误语义：非法 JSON 抛 LibraryFormatError/FORMAT_INVALID）。
  return parseJsonText(await readFile(filePath, "utf8"), "库内 JSON 文件") as T;
}

async function readCurrentReleasePointer(
  libraryRoot: string
): Promise<CutterReleaseCurrentPointer> {
  // Round5: 指针解析切换到 library-format（版本段安全/字段结构校验），返回结构保持不变。
  const pointer = parseCurrentReleasePointer(
    await readJsonFile<unknown>(currentReleasePointerPath(libraryRoot))
  );

  return {
    schema_version: "1.0",
    library_id: pointer.library_id,
    current_version: pointer.current_version,
    updated_at: pointer.updated_at ?? "",
    manifest_path: pointer.manifest_path ?? releaseManifestRelativePath(pointer.current_version)
  };
}

async function readReleaseManifestForVersion(
  libraryRoot: string,
  releaseVersion: string
): Promise<CutterReleaseManifest> {
  assertSafeReleasePathSegment(releaseVersion, "发布版本号");
  // Round5: release.json 解析/完整性校验切换到 library-format，保持返回结构。
  return parseReleaseManifestV1(
    await readJsonFile<unknown>(releaseManifestPath(libraryRoot, releaseVersion)),
    { expected_release_version: releaseVersion }
  );
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
  const pointer = parseIndexCurrentPointer(await readJsonFile<unknown>(currentPath));

  return readIndexPackageManifest(libraryRoot, pointer.current_version);
}

async function readIndexPackageManifest(
  libraryRoot: string,
  indexVersion: string
): Promise<IndexPackageManifest> {
  assertSafeReleasePathSegment(indexVersion, "索引版本号");
  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    indexVersion,
    "index-manifest.json"
  );

  return parseIndexPackageManifest(await readJsonFile<unknown>(manifestPath));
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
        CASE WHEN instr(v.relative_path, '/') > 0 THEN substr(v.relative_path, 1, instr(v.relative_path, '/') - 1) ELSE '' END AS source_folder_name,
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
      source_folder_name TEXT NOT NULL DEFAULT '',
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
    CREATE INDEX idx_release_source_videos_source_folder ON source_videos(source_folder_name, position);
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
          source_folder_name,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        sourceFolderNameFromRelativePath(video.manifest.relative_path),
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
  assertSafeReleasePathSegment(input.release_version, "发布版本号");

  return readCompleteReleaseManifestInDirectory({
    release_dir: releaseRoot(input.library_root, input.release_version),
    release_version: input.release_version
  });
}

/**
 * P2-1: 共享 index 文件进入发布 bundle 时必须复制为独立文件（copyFile），禁止硬链接。
 * 硬链接会让共享索引的后续原地改写穿透修改已发布版本，破坏封存 manifest 的 hash 承诺。
 * 副本权限收敛为 0640；SMB/NAS 不支持 chmod 时保持 best-effort。
 */
async function copyIfPresent(sourcePath: string, targetPath: string): Promise<boolean> {
  if (!(await fileExists(sourcePath))) {
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  await chmod(targetPath, 0o640).catch(() => {
    // Best effort for SMB/NAS filesystems that may not support chmod.
  });
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

  await mkdir(targetVersionRoot, { recursive: true, mode: RELEASE_DIRECTORY_MODE });
  await applyReleaseDirectoryMode(path.join(input.release_dir, "search-index"));
  await applyReleaseDirectoryMode(targetIndexRoot);
  await applyReleaseDirectoryMode(targetVersionRoot);
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
  const thumbnailsPath = path.join(input.release_dir, RELEASE_THUMBNAILS_PATH);
  const transcriptPackPath = path.join(input.release_dir, RELEASE_TRANSCRIPT_PACK_PATH);
  await mkdir(thumbnailsPath, { recursive: true, mode: RELEASE_DIRECTORY_MODE });
  await mkdir(transcriptPackPath, { recursive: true, mode: RELEASE_DIRECTORY_MODE });
  await applyReleaseDirectoryMode(thumbnailsPath);
  await applyReleaseDirectoryMode(transcriptPackPath);
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
  assertSafeReleasePathSegment(input.release_version, "发布版本号");
  const pointer: CutterReleaseCurrentPointer = {
    schema_version: "1.0",
    library_id: input.library_id,
    current_version: input.release_version,
    updated_at: input.now,
    manifest_path: releaseManifestRelativePath(input.release_version)
  };
  const pointerPath = currentReleasePointerPath(input.library_root);
  const pointerDirectory = path.dirname(pointerPath);
  const tempPointerPath = `${pointerPath}.tmp-${process.pid}-${Date.now()}-${
    Math.random().toString(36).slice(2)
  }`;

  await assertLibraryPathInside(input.library_root, pointerPath, "发布指针路径");
  await mkdir(pointerDirectory, { recursive: true });

  try {
    const pointerHandle = await open(tempPointerPath, "w", 0o600);

    try {
      await pointerHandle.writeFile(jsonBytes(pointer), "utf8");
      await pointerHandle.sync();
    } finally {
      await pointerHandle.close();
    }

    await rename(tempPointerPath, pointerPath);
  } catch (error) {
    await rm(tempPointerPath, { force: true }).catch(() => {});
    throw error;
  }

  try {
    const directoryHandle = await open(pointerDirectory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch {
    // Directory fsync is best effort; some network filesystems do not support it.
  }
}

export async function publishCutterRelease(
  input: PublishCutterReleaseInput
): Promise<CutterReleaseManifest> {
  const releaseVersion = input.release_version;

  if (releaseVersion !== undefined) {
    assertSafeReleasePathSegment(releaseVersion, "发布版本号");
  }

  const indexManifest = releaseVersion
    ? await readIndexPackageManifest(input.library_root, releaseVersion)
    : await readCurrentIndexPackageManifest(input.library_root);
  const resolvedReleaseVersion = releaseVersion ?? indexManifest.index_version;
  assertSafeReleasePathSegment(resolvedReleaseVersion, "发布版本号");
  assertSafeReleasePathSegment(indexManifest.index_version, "索引版本号");
  const existing = await readExistingReleaseManifest({
    library_root: input.library_root,
    release_version: resolvedReleaseVersion
  });

  if (existing) {
    // Manifest v2 validation failure aborts here: the current pointer/old release stay intact.
    await ensureReleaseManifestV2ForExistingBundle({
      library_root: input.library_root,
      release_version: existing.release_version,
      library_id: existing.library_id,
      index_version: existing.source_index_version,
      created_at: existing.generated_at,
      ready_video_count: existing.ready_video_count,
      min_client_version: input.min_client_version ?? resolveCutterReleaseMinClientVersion()
    });
    await writeCurrentReleasePointer({
      library_root: input.library_root,
      library_id: existing.library_id,
      release_version: existing.release_version,
      now: input.now
    });
    return existing;
  }

  const releasesDirectory = releasesRoot(input.library_root);
  const tempDir = path.join(
    releasesDirectory,
    `${resolvedReleaseVersion}.tmp-${process.pid}-${Date.now()}`
  );
  const targetDir = releaseRoot(input.library_root, resolvedReleaseVersion);

  // All release paths are validated before any mkdir/rename/rm is allowed to touch the filesystem.
  await assertLibraryPathInside(input.library_root, targetDir, "发布版本目录");
  await assertLibraryPathInside(input.library_root, tempDir, "发布临时目录");

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

  await mkdir(releasesDirectory, { recursive: true, mode: RELEASE_DIRECTORY_MODE });
  await applyReleaseDirectoryMode(releasesDirectory);

  try {
    await mkdir(tempDir, { recursive: false, mode: RELEASE_DIRECTORY_MODE });
    const catalogPath = path.join(tempDir, "catalog.sqlite");
    await writeCatalogSqlite({
      catalog_path: catalogPath,
      manifest: releaseManifest,
      videos
    });
    await applyReleaseFileMode(catalogPath);
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
    const sourcePathMapPath = path.join(tempDir, "source-path-map.json");
    const releaseJsonPath = path.join(tempDir, "release.json");
    await writeFile(sourcePathMapPath, jsonBytes(sourcePathMap), {
      encoding: "utf8",
      mode: RELEASE_FILE_MODE
    });
    await writeFile(releaseJsonPath, jsonBytes(releaseManifest), {
      encoding: "utf8",
      mode: RELEASE_FILE_MODE
    });
    await applyReleaseFileMode(sourcePathMapPath);
    await applyReleaseFileMode(releaseJsonPath);

    // Seal the immutable manifest v2 before the bundle directory is renamed into place.
    await sealCutterReleaseManifestV2({
      library_root: input.library_root,
      release_dir: tempDir,
      library_id: releaseManifest.library_id,
      index_version: releaseManifest.source_index_version,
      created_at: releaseManifest.generated_at,
      ready_video_count: releaseManifest.ready_video_count,
      min_client_version: input.min_client_version ?? resolveCutterReleaseMinClientVersion()
    });

    if (!(await readCompleteReleaseManifestInDirectory({
      release_dir: tempDir,
      release_version: resolvedReleaseVersion
    }))) {
      throw new Error("发布临时目录内容不完整，已中止发布");
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  // A same-version directory can exist after a crash or an interrupted publish. Never delete it:
  // isolate it first so the only usable release stays recoverable, then publish atomically on top.
  let quarantinedDir: string | null = null;

  if (await directoryExists(targetDir)) {
    // Re-check right before quarantining: another publisher may have completed the version
    // while this process was building its temp directory.
    const completedMeanwhile = await readExistingReleaseManifest({
      library_root: input.library_root,
      release_version: resolvedReleaseVersion
    });

    if (completedMeanwhile) {
      await ensureReleaseManifestV2ForExistingBundle({
        library_root: input.library_root,
        release_version: completedMeanwhile.release_version,
        library_id: completedMeanwhile.library_id,
        index_version: completedMeanwhile.source_index_version,
        created_at: completedMeanwhile.generated_at,
        ready_video_count: completedMeanwhile.ready_video_count,
        min_client_version: input.min_client_version ?? resolveCutterReleaseMinClientVersion()
      }).catch(async (error: unknown) => {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw error;
      });
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await writeCurrentReleasePointer({
        library_root: input.library_root,
        library_id: completedMeanwhile.library_id,
        release_version: completedMeanwhile.release_version,
        now: input.now
      });
      return completedMeanwhile;
    }

    quarantinedDir = path.join(
      releasesDirectory,
      `.trash-${resolvedReleaseVersion}-${Date.now()}-${process.pid}`
    );

    try {
      await assertLibraryPathInside(input.library_root, quarantinedDir, "发布隔离目录");
      await rename(targetDir, quarantinedDir);
      cutterReleaseAuditLog("release_incomplete_quarantined", {
        release_version: resolvedReleaseVersion,
        quarantined_to: path.relative(releasesDirectory, quarantinedDir)
      });
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(
        `已存在的发布目录不完整且无法隔离，已中止发布：${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  try {
    await rename(tempDir, targetDir);
    await applyReleaseDirectoryMode(targetDir);
  } catch (error) {
    const concurrentlyPublished = await readExistingReleaseManifest({
      library_root: input.library_root,
      release_version: resolvedReleaseVersion
    });

    if (concurrentlyPublished) {
      // Another publisher won the same immutable version; reuse its complete output.
      await ensureReleaseManifestV2ForExistingBundle({
        library_root: input.library_root,
        release_version: concurrentlyPublished.release_version,
        library_id: concurrentlyPublished.library_id,
        index_version: concurrentlyPublished.source_index_version,
        created_at: concurrentlyPublished.generated_at,
        ready_video_count: concurrentlyPublished.ready_video_count,
        min_client_version: input.min_client_version ?? resolveCutterReleaseMinClientVersion()
      }).catch(async (error: unknown) => {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw error;
      });
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (quarantinedDir) {
        await rm(quarantinedDir, { recursive: true, force: true }).catch(() => {});
      }
      await writeCurrentReleasePointer({
        library_root: input.library_root,
        library_id: concurrentlyPublished.library_id,
        release_version: concurrentlyPublished.release_version,
        now: input.now
      });
      return concurrentlyPublished;
    }

    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await restoreQuarantinedReleaseDirectory(targetDir, quarantinedDir);
    throw error;
  }

  const publishedManifest = await readCompleteReleaseManifestInDirectory({
    release_dir: targetDir,
    release_version: resolvedReleaseVersion
  });

  if (!publishedManifest) {
    // Keep every byte on disk for manual recovery instead of deleting an ambiguous release.
    throw new Error(
      `发布目录完整性校验失败，隔离目录已保留：${quarantinedDir ?? "无"}`
    );
  }

  try {
    await writeCurrentReleasePointer({
      library_root: input.library_root,
      library_id: publishedManifest.library_id,
      release_version: publishedManifest.release_version,
      now: input.now
    });
  } catch (error) {
    // The old pointer is still valid: never delete the freshly published complete directory.
    if (quarantinedDir) {
      await rm(quarantinedDir, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }

  if (quarantinedDir) {
    await rm(quarantinedDir, { recursive: true, force: true }).catch(() => {});
  }

  cutterReleaseAuditLog("release_manifest_v2_sealed", {
    release_version: publishedManifest.release_version,
    ready_video_count: publishedManifest.ready_video_count
  });

  return publishedManifest;
}

export async function readCurrentCutterRelease(
  libraryRoot: string
): Promise<CutterReleaseManifest> {
  const pointer = await readCurrentReleasePointer(libraryRoot);
  return readReleaseManifestForVersion(libraryRoot, pointer.current_version);
}

function openReadonlyDatabase(filePath: string): DatabaseSync {
  return new DatabaseSync(`file:${filePath}?mode=ro&immutable=1`);
}

function sourceVideoColumnExists(db: DatabaseSync, columnName: string): boolean {
  const rows = db.prepare("PRAGMA table_info(source_videos)").all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function releaseSourceFolderSqlExpression(db: DatabaseSync): string {
  if (sourceVideoColumnExists(db, "source_folder_name")) {
    return "source_folder_name";
  }

  return "CASE WHEN instr(relative_path, '/') > 0 THEN substr(relative_path, 1, instr(relative_path, '/') - 1) ELSE '' END";
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
    source_folder_name: row.source_folder_name || sourceFolderNameFromRelativePath(row.relative_path),
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
    source_folder_name?: string;
  }
): Promise<CutterSourceLibraryView> {
  const releaseRootBase = input.release_root ?? input.library_root;
  const pointer = await readCurrentReleasePointer(releaseRootBase);
  const releaseManifest = await readReleaseManifestForVersion(
    releaseRootBase,
    pointer.current_version
  );
  const artifactRoot = input.release_root
    ? releaseVersionRoot(input.release_root, pointer.current_version)
    : input.library_root;
  const catalogPath = releaseCatalogPath(releaseRootBase, pointer.current_version);
  const db = openReadonlyDatabase(catalogPath);

  try {
    const offset = Math.max(0, input.offset ?? 0);
    const sourceFolderName = normalizeSourceFolderName(input.source_folder_name);
    const sourceFolderExpression = releaseSourceFolderSqlExpression(db);
    const whereClause = sourceFolderName ? `WHERE ${sourceFolderExpression} = ?` : "";
    const whereParams = sourceFolderName ? [sourceFolderName] : [];
    const availableVideoCount = Number(
      (db.prepare(`
        SELECT COUNT(*) AS count
        FROM source_videos
        ${whereClause}
      `).get(...whereParams) as { count?: number } | undefined)?.count ?? 0
    );
    const limit = input.limit && input.limit > 0 ? input.limit : availableVideoCount;
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
        ${sourceFolderExpression} AS source_folder_name,
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
      ${whereClause}
      ORDER BY position
      LIMIT ? OFFSET ?
    `).all(...whereParams, limit, offset) as unknown as ReleaseCatalogRow[];

    return {
      available_video_count: availableVideoCount,
      videos: rows.map((row) => releaseCatalogRowToCard({
        library_root: input.library_root,
        artifact_root: artifactRoot
      }, row))
    };
  } finally {
    db.close();
  }
}

export async function listCutterReleaseSourceFolders(
  input: {
    library_root: string;
    release_root?: string;
  }
): Promise<CutterSourceFolderOption[]> {
  const releaseRootBase = input.release_root ?? input.library_root;
  const pointer = await readCurrentReleasePointer(releaseRootBase);
  const catalogPath = releaseCatalogPath(releaseRootBase, pointer.current_version);
  const db = openReadonlyDatabase(catalogPath);

  try {
    const sourceFolderExpression = releaseSourceFolderSqlExpression(db);
    const rows = db.prepare(`
      SELECT ${sourceFolderExpression} AS name, COUNT(*) AS count
      FROM source_videos
      WHERE ${sourceFolderExpression} <> ''
      GROUP BY ${sourceFolderExpression}
      ORDER BY name COLLATE NOCASE ASC
    `).all() as Array<{ name: string; count: number }>;

    return rows
      .map((row) => ({
        name: row.name,
        count: Number(row.count ?? 0)
      }))
      .filter((row) => row.name.trim() && row.count > 0);
  } finally {
    db.close();
  }
}

export async function getCutterReleaseSourceVideoDetail(input: {
  library_root: string;
  release_root: string;
  source_video_id: string;
}): Promise<CutterSourceVideoDetail | null> {
  const pointer = await readCurrentReleasePointer(input.release_root);
  const releaseManifest = await readReleaseManifestForVersion(
    input.release_root,
    pointer.current_version
  );
  const catalogPath = releaseCatalogPath(input.release_root, pointer.current_version);
  const artifactRoot = releaseVersionRoot(input.release_root, pointer.current_version);
  const db = openReadonlyDatabase(catalogPath);

  try {
    const sourceFolderExpression = releaseSourceFolderSqlExpression(db);
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
        ${sourceFolderExpression} AS source_folder_name,
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
  const pointer = await readCurrentReleasePointer(input.release_root);
  const manifest = await readReleaseManifestForVersion(
    input.release_root,
    pointer.current_version
  );
  return path.join(
    releaseVersionRoot(input.release_root, pointer.current_version),
    manifest.search_index_path ?? "search-index/source-transcript-index",
    manifest.source_index_version,
    "index.sqlite"
  );
}

/** Consumer-preferred file name; consumers also accept the legacy alias (see below). */
export const RELEASE_MANIFEST_V2_FILE_NAME = "release-manifest-v2.json";
/** Compatibility alias accepted by readers; producers only write the preferred file name. */
export const RELEASE_MANIFEST_V2_COMPAT_FILE_NAME = "manifest-v2.json";
export const RELEASE_MIN_CLIENT_VERSION_ENV_VAR = "MIXLAB_ADMIN_RELEASE_MIN_CLIENT_VERSION";
export const DEFAULT_RELEASE_MIN_CLIENT_VERSION = "0.19.0";
const MAX_RELEASE_BUNDLE_FILES = 100_000;
const DEFAULT_VERIFY_MAX_FILES = 5_000;
const MAX_VERIFY_FILES = 20_000;
const DEFAULT_VERIFY_CONCURRENCY = 8;
const MAX_VERIFY_CONCURRENCY = 32;
const MAX_VERIFY_FAILURES = 50;
const MAX_VERIFY_SCAN_DIRECTORIES = 2_000;

export class CutterReleaseBundleCorruptError extends Error {
  readonly code = "RELEASE_BUNDLE_CORRUPT" as const;

  constructor(message: string) {
    super(message);
    this.name = "CutterReleaseBundleCorruptError";
  }
}

export interface CutterReleaseManifestV2Summary {
  schema_version: "2.0";
  manifest_available: boolean;
  legacy_release: boolean;
  release_version: string;
  release_id: string;
  library_id: string;
  index_version: string;
  ready_video_count: number;
  file_count: number;
  total_size_bytes: number;
  created_at: string;
  min_client_version: string;
  contract_version: string;
  pointer_version: string;
  pointer_consistent: boolean;
  manifest_path: string;
}

export type CutterReleaseV2VerifyFailureReason =
  | "missing"
  | "size_mismatch"
  | "sha256_mismatch"
  | "unsafe_path"
  | "manifest_invalid";

export interface CutterReleaseV2VerifyFailure {
  path: string;
  reason: CutterReleaseV2VerifyFailureReason;
  expected_size?: number;
  actual_size?: number;
  expected_sha256?: string;
  actual_sha256?: string;
}

export interface CutterReleaseV2VerifyResult {
  ok: boolean;
  found: boolean;
  manifest_valid: boolean;
  release_id: string;
  release_version: string;
  checked_file_count: number;
  total_file_count: number;
  truncated: boolean;
  failures: CutterReleaseV2VerifyFailure[];
  failures_truncated: boolean;
  duration_ms: number;
}

export function resolveCutterReleaseMinClientVersion(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = (env[RELEASE_MIN_CLIENT_VERSION_ENV_VAR] ?? "").trim();
  return configured || DEFAULT_RELEASE_MIN_CLIENT_VERSION;
}

function releaseManifestV2Path(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), RELEASE_MANIFEST_V2_FILE_NAME);
}

function releaseManifestV2RelativePath(releaseVersion: string): string {
  return `.mixlab-library/releases/${releaseVersion}/${RELEASE_MANIFEST_V2_FILE_NAME}`;
}

function utcTimestampToken(value: string): string {
  const parsed = Date.parse(value);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  const pad = (part: number, length = 2): string => String(part).padStart(length, "0");

  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${
    pad(date.getUTCHours())
  }${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function releaseFileRoleForPath(relativePath: string): ReleaseFileRole {
  if (relativePath === "catalog.sqlite") {
    return "catalog";
  }

  if (relativePath === "source-path-map.json") {
    return "source-map";
  }

  if (relativePath === "release.json") {
    return "other";
  }

  if (relativePath === `${RELEASE_SEARCH_INDEX_PATH}/index-manifest.json` ||
    relativePath.endsWith("/index-manifest.json")) {
    return "index-manifest";
  }

  if (relativePath.startsWith(`${RELEASE_SEARCH_INDEX_PATH}/`)) {
    return "search-index";
  }

  if (relativePath.startsWith(`${RELEASE_THUMBNAILS_PATH}/`)) {
    return "cover";
  }

  if (relativePath.startsWith(`${RELEASE_TRANSCRIPT_PACK_PATH}/`)) {
    if (relativePath.endsWith(".srt")) {
      return "srt";
    }
    if (relativePath.endsWith("keyframes.json")) {
      return "keyframes";
    }
    return "transcript";
  }

  return "other";
}

const RELEASE_MANIFEST_V2_FILE_NAMES: ReadonlySet<string> = new Set([
  RELEASE_MANIFEST_V2_FILE_NAME,
  RELEASE_MANIFEST_V2_COMPAT_FILE_NAME
]);

async function listReleaseBundleFiles(releaseDirectory: string): Promise<Array<{
  absolute_path: string;
  relative_path: string;
}>> {
  const files: Array<{ absolute_path: string; relative_path: string }> = [];

  const visit = async (current: string): Promise<void> => {
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name)
    );

    for (const entry of entries) {
      // The v2 manifest describes the rest of the immutable bundle; never self-reference it.
      if (RELEASE_MANIFEST_V2_FILE_NAMES.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      if (entry.name.includes(".tmp-")) {
        continue;
      }

      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        // Symlinks/sockets are not part of a sealed release bundle; skip instead of following.
        continue;
      }

      files.push({
        absolute_path: absolutePath,
        relative_path: path.relative(releaseDirectory, absolutePath).split(path.sep).join("/")
      });

      if (files.length > MAX_RELEASE_BUNDLE_FILES) {
        throw new CutterReleaseBundleCorruptError(
          `发布目录文件数超过 manifest v2 上限（${MAX_RELEASE_BUNDLE_FILES} 个），已中止发布`
        );
      }
    }
  };

  await visit(releaseDirectory);
  return files;
}

async function buildCutterReleaseManifestV2ForDirectory(input: {
  release_dir: string;
  library_id: string;
  index_version: string;
  created_at: string;
  ready_video_count: number;
  min_client_version: string;
}): Promise<ReleaseManifestV2> {
  const bundleFiles = await listReleaseBundleFiles(input.release_dir);

  if (bundleFiles.length === 0) {
    throw new CutterReleaseBundleCorruptError("发布目录没有可封存的文件，已中止发布");
  }

  const files: ReleaseFileEntryV2[] = [];

  for (const bundleFile of bundleFiles) {
    const fileStat = await stat(bundleFile.absolute_path);
    const sha256 = (await hashFileSha256(bundleFile.absolute_path)).replace(/^sha256:/, "");

    files.push({
      path: bundleFile.relative_path,
      role: releaseFileRoleForPath(bundleFile.relative_path),
      size: fileStat.size,
      sha256
    });
  }

  const contentHash = createHash("sha256")
    .update(files.map((file) => `${file.path}\u0000${file.size}\u0000${file.sha256}`).join("\n"))
    .digest("hex");
  const totalSizeBytes = files.reduce((total, file) => total + file.size, 0);
  const manifest: ReleaseManifestV2 = {
    schema_version: RELEASE_MANIFEST_SCHEMA_VERSION,
    contract_version: CONTRACT_VERSION,
    release_id: `rel_${utcTimestampToken(input.created_at)}_${contentHash.slice(0, 12)}`,
    library_id: input.library_id,
    created_at: input.created_at,
    min_client_version: input.min_client_version,
    index_version: input.index_version,
    ready_video_count: input.ready_video_count,
    files,
    stats: {
      file_count: files.length,
      total_size_bytes: totalSizeBytes,
      ready_video_count: input.ready_video_count
    }
  };

  validateReleaseManifestV2(manifest);
  return manifest;
}

async function writeReleaseManifestV2Atomically(
  libraryRoot: string,
  releaseDirectory: string,
  manifest: ReleaseManifestV2
): Promise<ReleaseManifestV2> {
  const manifestPath = path.join(releaseDirectory, RELEASE_MANIFEST_V2_FILE_NAME);
  const tempPath = path.join(
    releaseDirectory,
    `.${RELEASE_MANIFEST_V2_FILE_NAME}.tmp-${process.pid}-${Date.now()}-${
      Math.random().toString(36).slice(2)
    }`
  );

  await assertLibraryPathInside(libraryRoot, manifestPath, "发布 manifest v2 路径");

  try {
    const fileHandle = await open(tempPath, "w", RELEASE_FILE_MODE);

    try {
      await fileHandle.writeFile(jsonBytes(manifest), "utf8");
      await fileHandle.sync();
    } finally {
      await fileHandle.close();
    }

    await rename(tempPath, manifestPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  try {
    const directoryHandle = await open(releaseDirectory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch {
    // Directory fsync is best effort on SMB/NAS filesystems.
  }

  await applyReleaseFileMode(manifestPath);

  const persisted = validateReleaseManifestV2(
    JSON.parse(await readFile(manifestPath, "utf8"))
  );

  if (persisted.release_id !== manifest.release_id) {
    throw new CutterReleaseBundleCorruptError("manifest v2 写入后校验失败");
  }

  return persisted;
}

/**
 * Build, validate and fsync the immutable manifest v2 for a release directory. Throws before any
 * pointer switch when the bundle cannot be described completely (publish then aborts and keeps
 * the previous release/pointer intact).
 */
export async function sealCutterReleaseManifestV2(input: {
  library_root: string;
  release_dir: string;
  library_id: string;
  index_version: string;
  created_at: string;
  ready_video_count: number;
  min_client_version?: string;
}): Promise<ReleaseManifestV2> {
  await assertLibraryPathInside(input.library_root, input.release_dir, "发布制品目录");

  const manifest = await buildCutterReleaseManifestV2ForDirectory({
    release_dir: input.release_dir,
    library_id: input.library_id,
    index_version: input.index_version,
    created_at: input.created_at,
    ready_video_count: input.ready_video_count,
    min_client_version: input.min_client_version ?? resolveCutterReleaseMinClientVersion()
  });

  return writeReleaseManifestV2Atomically(
    input.library_root,
    input.release_dir,
    manifest
  );
}

export async function readCutterReleaseManifestV2(
  libraryRoot: string,
  releaseVersion: string
): Promise<ReleaseManifestV2 | null> {
  assertSafeReleasePathSegment(releaseVersion, "发布版本号");
  const releaseDirectory = releaseRoot(libraryRoot, releaseVersion);
  const candidatePaths = [
    path.join(releaseDirectory, RELEASE_MANIFEST_V2_FILE_NAME),
    path.join(releaseDirectory, RELEASE_MANIFEST_V2_COMPAT_FILE_NAME)
  ];

  for (const manifestPath of candidatePaths) {
    let raw: string;

    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }

      throw new CutterReleaseBundleCorruptError("发布 manifest v2 无效或已损坏");
    }

    try {
      return validateReleaseManifestV2(JSON.parse(raw));
    } catch {
      throw new CutterReleaseBundleCorruptError("发布 manifest v2 无效或已损坏");
    }
  }

  return null;
}

async function ensureReleaseManifestV2ForExistingBundle(input: {
  library_root: string;
  release_version: string;
  library_id: string;
  index_version: string;
  created_at: string;
  ready_video_count: number;
  min_client_version: string;
}): Promise<ReleaseManifestV2> {
  const existingManifest = await readCutterReleaseManifestV2(
    input.library_root,
    input.release_version
  );

  if (existingManifest) {
    if (
      existingManifest.index_version !== input.index_version ||
      existingManifest.library_id !== input.library_id ||
      existingManifest.ready_video_count !== input.ready_video_count
    ) {
      throw new CutterReleaseBundleCorruptError(
        "已有 manifest v2 与发布清单不一致，已中止发布以保护当前发布"
      );
    }

    return existingManifest;
  }

  // Legacy release published before manifest v2: seal it once (additive file, atomic write).
  const sealed = await sealCutterReleaseManifestV2({
    library_root: input.library_root,
    release_dir: releaseRoot(input.library_root, input.release_version),
    library_id: input.library_id,
    index_version: input.index_version,
    created_at: input.created_at,
    ready_video_count: input.ready_video_count,
    min_client_version: input.min_client_version
  });

  cutterReleaseAuditLog("release_manifest_v2_sealed_legacy_bundle", {
    release_version: input.release_version,
    release_id: sealed.release_id,
    file_count: sealed.files.length
  });
  return sealed;
}

export async function readCurrentCutterReleaseManifestV2Summary(
  libraryRoot: string
): Promise<CutterReleaseManifestV2Summary> {
  const pointer = await readCurrentReleasePointer(libraryRoot);
  const releaseVersion = pointer.current_version;
  let releaseManifestV1: CutterReleaseManifest | null = null;

  try {
    releaseManifestV1 = await readReleaseManifestForVersion(libraryRoot, releaseVersion);
  } catch {
    releaseManifestV1 = null;
  }

  let manifestV2: ReleaseManifestV2 | null = null;
  let manifestError = "";

  try {
    manifestV2 = await readCutterReleaseManifestV2(libraryRoot, releaseVersion);
  } catch (error) {
    manifestError = error instanceof Error ? error.message : "manifest v2 无效";
  }

  const manifestPath = releaseManifestV2RelativePath(releaseVersion);

  if (!manifestV2) {
    return {
      schema_version: RELEASE_MANIFEST_SCHEMA_VERSION,
      manifest_available: false,
      legacy_release: releaseManifestV1 !== null,
      release_version: releaseVersion,
      release_id: "",
      library_id: releaseManifestV1?.library_id ?? "",
      index_version: releaseManifestV1?.source_index_version ?? "",
      ready_video_count: releaseManifestV1?.ready_video_count ?? 0,
      file_count: 0,
      total_size_bytes: 0,
      created_at: releaseManifestV1?.generated_at ?? "",
      min_client_version: "",
      contract_version: CONTRACT_VERSION,
      pointer_version: pointer.current_version,
      pointer_consistent: releaseManifestV1 !== null && manifestError === "",
      manifest_path: manifestPath
    };
  }

  const pointerConsistent = releaseManifestV1 !== null &&
    releaseManifestV1.source_index_version === manifestV2.index_version &&
    releaseManifestV1.ready_video_count === manifestV2.ready_video_count &&
    releaseManifestV1.library_id === manifestV2.library_id;

  return {
    schema_version: RELEASE_MANIFEST_SCHEMA_VERSION,
    manifest_available: true,
    legacy_release: false,
    release_version: releaseVersion,
    release_id: manifestV2.release_id,
    library_id: manifestV2.library_id,
    index_version: manifestV2.index_version,
    ready_video_count: manifestV2.ready_video_count,
    file_count: manifestV2.files.length,
    total_size_bytes: manifestV2.files.reduce((total, file) => total + file.size, 0),
    created_at: manifestV2.created_at,
    min_client_version: manifestV2.min_client_version,
    contract_version: manifestV2.contract_version,
    pointer_version: pointer.current_version,
    pointer_consistent: pointerConsistent,
    manifest_path: manifestPath
  };
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await worker(items[currentIndex] as T, currentIndex);
      }
    }
  );

  await Promise.all(workers);
}

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

async function findReleaseVersionForVerification(
  libraryRoot: string,
  releaseIdOrVersion: string
): Promise<{
  release_version: string;
  manifest: ReleaseManifestV2 | null;
  manifest_error: string;
} | null> {
  const inspectVersion = async (releaseVersion: string): Promise<{
    release_version: string;
    manifest: ReleaseManifestV2 | null;
    manifest_error: string;
  } | null> => {
    if (!SAFE_RELEASE_PATH_SEGMENT_PATTERN.test(releaseVersion)) {
      return null;
    }

    const releaseDirectory = releaseRoot(libraryRoot, releaseVersion);

    if (!(await directoryExists(releaseDirectory))) {
      return null;
    }

    try {
      const manifest = await readCutterReleaseManifestV2(libraryRoot, releaseVersion);
      return {
        release_version: releaseVersion,
        manifest,
        manifest_error: manifest ? "" : "manifest-v2.json 缺失"
      };
    } catch (error) {
      return {
        release_version: releaseVersion,
        manifest: null,
        manifest_error: error instanceof Error ? error.message : "manifest-v2.json 无效"
      };
    }
  };

  try {
    const pointer = await readCurrentReleasePointer(libraryRoot);

    if (pointer.current_version === releaseIdOrVersion) {
      return inspectVersion(pointer.current_version);
    }

    const current = await inspectVersion(pointer.current_version);
    if (current?.manifest?.release_id === releaseIdOrVersion) {
      return current;
    }
  } catch {
    // No readable pointer: fall through to direct version / release-id lookup.
  }

  const direct = await inspectVersion(releaseIdOrVersion);
  if (direct) {
    return direct;
  }

  let releaseEntries;
  try {
    releaseEntries = await readdir(releasesRoot(libraryRoot), { withFileTypes: true });
  } catch {
    return null;
  }

  const candidateVersions = releaseEntries
    .filter((entry) =>
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      !entry.name.includes(".tmp-")
    )
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, MAX_VERIFY_SCAN_DIRECTORIES);

  for (const releaseVersion of candidateVersions) {
    const candidate = await inspectVersion(releaseVersion);

    if (candidate?.manifest?.release_id === releaseIdOrVersion) {
      return candidate;
    }
  }

  return null;
}

/**
 * Re-hash a sealed release bundle and verify every file listed in manifest v2. Verification is
 * bounded (file count + concurrency) because bundles live on NAS and this may be slow.
 */
export async function verifyCutterReleaseBundle(input: {
  library_root: string;
  release_id_or_version: string;
  max_files?: number;
  concurrency?: number;
}): Promise<CutterReleaseV2VerifyResult> {
  const startedAtMs = Date.now();
  const maxFiles = clampInteger(input.max_files, DEFAULT_VERIFY_MAX_FILES, 1, MAX_VERIFY_FILES);
  const concurrency = clampInteger(
    input.concurrency,
    DEFAULT_VERIFY_CONCURRENCY,
    1,
    MAX_VERIFY_CONCURRENCY
  );
  const resolved = await findReleaseVersionForVerification(
    input.library_root,
    input.release_id_or_version
  );

  if (!resolved) {
    return {
      ok: false,
      found: false,
      manifest_valid: false,
      release_id: "",
      release_version: "",
      checked_file_count: 0,
      total_file_count: 0,
      truncated: false,
      failures: [{ path: "", reason: "missing" }],
      failures_truncated: false,
      duration_ms: Date.now() - startedAtMs
    };
  }

  const releaseDirectory = releaseRoot(input.library_root, resolved.release_version);

  if (!resolved.manifest) {
    return {
      ok: false,
      found: true,
      manifest_valid: false,
      release_id: "",
      release_version: resolved.release_version,
      checked_file_count: 0,
      total_file_count: 0,
      truncated: false,
      failures: [{ path: RELEASE_MANIFEST_V2_FILE_NAME, reason: "manifest_invalid" }],
      failures_truncated: false,
      duration_ms: Date.now() - startedAtMs
    };
  }

  const manifest = resolved.manifest;
  const filesToCheck = manifest.files.slice(0, maxFiles);
  const failures: CutterReleaseV2VerifyFailure[] = [];
  let failuresTruncated = false;

  const recordFailure = (failure: CutterReleaseV2VerifyFailure): void => {
    if (failures.length >= MAX_VERIFY_FAILURES) {
      failuresTruncated = true;
      return;
    }

    failures.push(failure);
  };

  await mapWithConcurrency(filesToCheck, concurrency, async (fileEntry) => {
    const absolutePath = path.resolve(releaseDirectory, ...fileEntry.path.split("/"));

    try {
      await assertLibraryPathInside(input.library_root, absolutePath, "发布制品文件");
    } catch {
      recordFailure({ path: fileEntry.path, reason: "unsafe_path" });
      return;
    }

    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      recordFailure({ path: fileEntry.path, reason: "missing" });
      return;
    }

    if (!fileStat.isFile()) {
      recordFailure({ path: fileEntry.path, reason: "missing" });
      return;
    }

    if (fileStat.size !== fileEntry.size) {
      recordFailure({
        path: fileEntry.path,
        reason: "size_mismatch",
        expected_size: fileEntry.size,
        actual_size: fileStat.size
      });
      return;
    }

    const actualSha256 = (await hashFileSha256(absolutePath)).replace(/^sha256:/, "");

    if (actualSha256 !== fileEntry.sha256) {
      recordFailure({
        path: fileEntry.path,
        reason: "sha256_mismatch",
        expected_sha256: fileEntry.sha256,
        actual_sha256: actualSha256
      });
    }
  });

  const truncated = manifest.files.length > filesToCheck.length;

  return {
    ok: !truncated && failures.length === 0,
    found: true,
    manifest_valid: true,
    release_id: manifest.release_id,
    release_version: resolved.release_version,
    checked_file_count: filesToCheck.length,
    total_file_count: manifest.files.length,
    truncated,
    failures,
    failures_truncated: failuresTruncated,
    duration_ms: Date.now() - startedAtMs
  };
}
