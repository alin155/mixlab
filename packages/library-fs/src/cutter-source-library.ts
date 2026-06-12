import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isVideoVisibleToCutters,
  validateSourceVideoManifest,
  type IndexPackageManifest,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import {
  searchTranscripts,
  type TranscriptSearchGroup
} from "../../search-core/src/index.ts";
import {
  searchSourceTranscriptSqliteIndex,
  type SourceTranscriptSqliteSearchGroup,
  type SourceTranscriptSqliteSearchResult
} from "../../search-sqlite/src/index.ts";
import {
  readAllSourceVideoManifests,
  readSourceVideoManifest
} from "./preprocess-lifecycle.ts";
import { resolveSourceVideoFilePath } from "./source-paths.ts";

export interface ListCutterSourceLibraryInput {
  library_root: string;
  limit?: number;
  offset?: number;
}

export interface GetCutterSourceVideoDetailInput {
  library_root: string;
  source_video_id: string;
}

export interface SearchCutterSourceLibraryInput {
  library_root: string;
  query: string;
  limit: number;
  cursor?: string;
}

export interface CutterSourceVideoCard {
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
  source_video_file_path: string;
  cover_path: string;
  cover_file_path: string;
  description?: string;
  tags?: string[];
  lecturer?: string;
  course?: string;
  category?: string;
}

export interface CutterSourceLibraryView {
  available_video_count: number;
  videos: CutterSourceVideoCard[];
}

export interface CutterTranscriptArtifact {
  schema_version: string;
  source_video_id: string;
  provider: string;
  model: string;
  generated_at: string;
  duration_ms: number;
  full_text: string;
  segments: TranscriptSegment[];
}

export interface CutterKeyframesArtifact {
  schema_version: string;
  keyframes_ms: number[];
}

export interface CutterSourceVideoDetail extends CutterSourceVideoCard {
  transcript_path: string;
  transcript_file_path: string;
  srt_path: string;
  srt_file_path: string;
  keyframes_path: string;
  keyframes_file_path: string;
  transcript: CutterTranscriptArtifact;
  srt: string;
  keyframes: CutterKeyframesArtifact;
}

export interface CutterSourceLibrarySearchGroup extends TranscriptSearchGroup {
  relative_path: string;
  source_video_file_path: string;
  cover_path: string;
  cover_file_path: string;
  transcript_character_count: number;
}

export interface CutterSourceLibrarySearchResult {
  query: string;
  normalized_query: string;
  groups: CutterSourceLibrarySearchGroup[];
  cursor: string;
  next_cursor: string;
  has_more: boolean;
  returned_count: number;
  limit: number;
  index_version: string;
  search_ms: number;
  search_mode: "sqlite-index" | "transcript-artifact-fallback" | "searchd";
}

function artifactFilePath(libraryRoot: string, libraryRelativePath: string): string {
  const normalized = libraryRelativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("artifact path must be a library-relative path");
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.includes("..")) {
    throw new Error("artifact path cannot escape library root");
  }

  return path.join(libraryRoot, ...parts);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
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
  const pointer = JSON.parse(await readFile(currentPath, "utf8")) as {
    current_version: string;
  };
  const manifestPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    pointer.current_version,
    "index-manifest.json"
  );

  return JSON.parse(await readFile(manifestPath, "utf8")) as IndexPackageManifest;
}

async function toCutterSourceVideoCard(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<CutterSourceVideoCard> {
  return {
    source_video_id: manifest.source_video_id,
    title: manifest.title,
    duration_ms: manifest.duration_ms,
    width: manifest.width,
    height: manifest.height,
    fps: manifest.fps,
    codec: manifest.codec,
    file_size: manifest.file_size,
    relative_path: manifest.relative_path,
    logical_uri: manifest.logical_uri,
    source_video_file_path: await resolveSourceVideoFilePath(libraryRoot, manifest),
    cover_path: manifest.cover_path,
    cover_file_path: artifactFilePath(libraryRoot, manifest.cover_path),
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.tags ? { tags: manifest.tags } : {}),
    ...(manifest.lecturer ? { lecturer: manifest.lecturer } : {}),
    ...(manifest.course ? { course: manifest.course } : {}),
    ...(manifest.category ? { category: manifest.category } : {})
  };
}

async function toFastCutterSourceVideoCard(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<CutterSourceVideoCard> {
  return {
    source_video_id: manifest.source_video_id,
    title: manifest.title,
    duration_ms: manifest.duration_ms,
    width: manifest.width,
    height: manifest.height,
    fps: manifest.fps,
    codec: manifest.codec,
    file_size: manifest.file_size,
    relative_path: manifest.relative_path,
    logical_uri: manifest.logical_uri,
    source_video_file_path: manifest.relative_path,
    cover_path: manifest.cover_path,
    cover_file_path: artifactFilePath(libraryRoot, manifest.cover_path),
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.tags ? { tags: manifest.tags } : {}),
    ...(manifest.lecturer ? { lecturer: manifest.lecturer } : {}),
    ...(manifest.course ? { course: manifest.course } : {}),
    ...(manifest.category ? { category: manifest.category } : {})
  };
}

function isCutterReadyManifestRecord(manifest: SourceVideoManifest): boolean {
  return isVideoVisibleToCutters(manifest) && validateSourceVideoManifest(manifest).ok;
}

async function readIndexedReadySourceVideoManifests(
  libraryRoot: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ available_video_count: number; manifests: SourceVideoManifest[] }> {
  const indexManifest = await readCurrentIndexPackageManifest(libraryRoot);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit && options.limit > 0 ? options.limit : indexManifest.source_video_ids.length;
  const sourceVideoIds = indexManifest.source_video_ids.slice(offset, offset + limit);
  const records = await Promise.all(
    sourceVideoIds.map(async (sourceVideoId) => {
      try {
        const manifest = await readSourceVideoManifest(libraryRoot, sourceVideoId);
        return isCutterReadyManifestRecord(manifest) ? manifest : null;
      } catch {
        return null;
      }
    })
  );

  return {
    available_video_count: indexManifest.ready_video_count,
    manifests: records.filter((manifest): manifest is SourceVideoManifest => Boolean(manifest))
  };
}

async function readVisibleSourceVideoManifests(
  libraryRoot: string
): Promise<SourceVideoManifest[]> {
  const manifests = await readAllSourceVideoManifests(libraryRoot);
  const visible: SourceVideoManifest[] = [];

  for (const manifest of manifests) {
    if (await isCutterReadableReadyManifest(libraryRoot, manifest)) {
      visible.push(manifest);
    }
  }

  return visible;
}

async function resolveCurrentSourceTranscriptIndexFilePath(
  libraryRoot: string
): Promise<string> {
  const currentPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    "current.json"
  );
  const pointer = JSON.parse(await readFile(currentPath, "utf8")) as {
    current_version: string;
  };
  const indexFilePath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    pointer.current_version,
    "index.sqlite"
  );

  return cachedSqliteIndexFilePath(libraryRoot, pointer.current_version, indexFilePath);
}

function cacheKeyForLibraryRoot(libraryRoot: string): string {
  return createHash("sha1").update(path.resolve(libraryRoot)).digest("hex");
}

async function cachedSqliteIndexFilePath(
  libraryRoot: string,
  indexVersion: string,
  sourceIndexFilePath: string
): Promise<string> {
  const sourceStat = await stat(sourceIndexFilePath);
  const libraryCacheRoot = path.join(
    os.tmpdir(),
    "mixlab-cutter-index-cache",
    cacheKeyForLibraryRoot(libraryRoot)
  );
  const cacheDir = path.join(
    libraryCacheRoot,
    indexVersion
  );
  const cacheFilePath = path.join(cacheDir, "index.sqlite");

  try {
    const cacheStat = await stat(cacheFilePath);

    if (cacheStat.size === sourceStat.size) {
      await pruneSqliteIndexCache(libraryCacheRoot, indexVersion);
      return cacheFilePath;
    }
  } catch {
    // Cache miss; copy the immutable index package locally.
  }

  const warmCacheFilePath = await newestWarmSqliteIndexCacheFilePath(
    libraryCacheRoot,
    indexVersion
  );
  if (warmCacheFilePath) {
    void ensureSqliteIndexCached({
      library_cache_root: libraryCacheRoot,
      index_version: indexVersion,
      source_index_file_path: sourceIndexFilePath,
      cache_dir: cacheDir,
      cache_file_path: cacheFilePath
    }).catch(() => {
      // The next search can retry the refresh; keep the current request fast.
    });
    return warmCacheFilePath;
  }

  return ensureSqliteIndexCached({
    library_cache_root: libraryCacheRoot,
    index_version: indexVersion,
    source_index_file_path: sourceIndexFilePath,
    cache_dir: cacheDir,
    cache_file_path: cacheFilePath
  });
}

async function newestWarmSqliteIndexCacheFilePath(
  libraryCacheRoot: string,
  currentIndexVersion: string
): Promise<string | null> {
  let dirents: Dirent<string>[];
  try {
    dirents = await readdir(libraryCacheRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = await Promise.all(
    dirents
      .filter((dirent) => dirent.isDirectory() && dirent.name !== currentIndexVersion)
      .map(async (dirent) => {
        const cacheFilePath = path.join(libraryCacheRoot, dirent.name, "index.sqlite");

        try {
          const cacheStat = await stat(cacheFilePath);
          if (!cacheStat.isFile() || cacheStat.size === 0) {
            return null;
          }

          return {
            cacheFilePath,
            mtimeMs: cacheStat.mtimeMs
          };
        } catch {
          return null;
        }
      })
  );
  const newest = candidates
    .filter((candidate): candidate is { cacheFilePath: string; mtimeMs: number } =>
      Boolean(candidate)
    )
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  return newest?.cacheFilePath ?? null;
}

const pendingSqliteIndexCacheCopies = new Map<string, Promise<string>>();

function ensureSqliteIndexCached(input: {
  library_cache_root: string;
  index_version: string;
  source_index_file_path: string;
  cache_dir: string;
  cache_file_path: string;
}): Promise<string> {
  const pendingKey = `${input.library_cache_root}:${input.index_version}`;
  const pending = pendingSqliteIndexCacheCopies.get(pendingKey);
  if (pending) {
    return pending;
  }

  const copyPromise = copySqliteIndexToCache(input).finally(() => {
    pendingSqliteIndexCacheCopies.delete(pendingKey);
  });

  pendingSqliteIndexCacheCopies.set(pendingKey, copyPromise);
  return copyPromise;
}

async function copySqliteIndexToCache(input: {
  library_cache_root: string;
  index_version: string;
  source_index_file_path: string;
  cache_dir: string;
  cache_file_path: string;
}): Promise<string> {
  await mkdir(input.cache_dir, { recursive: true });
  const tempFilePath = path.join(
    input.cache_dir,
    `index.sqlite.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await copyFile(input.source_index_file_path, tempFilePath);
    await rename(tempFilePath, input.cache_file_path);
  } catch (error) {
    await rm(tempFilePath, { force: true });
    throw error;
  }

  await pruneSqliteIndexCache(input.library_cache_root, input.index_version);
  return input.cache_file_path;
}

function isSourceTranscriptSqliteSearchGroup(
  group: TranscriptSearchGroup
): group is SourceTranscriptSqliteSearchGroup {
  const candidate = group as Partial<SourceTranscriptSqliteSearchGroup>;

  return (
    typeof candidate.relative_path === "string" &&
    typeof candidate.cover_path === "string" &&
    typeof candidate.transcript_character_count === "number"
  );
}

async function pruneSqliteIndexCache(
  libraryCacheRoot: string,
  currentIndexVersion: string
): Promise<void> {
  const maxCachedVersions = 3;

  let entries: Array<{ name: string; mtimeMs: number }> = [];
  try {
    const dirents = await readdir(libraryCacheRoot, { withFileTypes: true });
    entries = await Promise.all(
      dirents
        .filter((dirent) => dirent.isDirectory())
        .map(async (dirent) => {
          const entryPath = path.join(libraryCacheRoot, dirent.name);
          try {
            return {
              name: dirent.name,
              mtimeMs: (await stat(entryPath)).mtimeMs
            };
          } catch {
            return {
              name: dirent.name,
              mtimeMs: 0
            };
          }
        })
    );
  } catch {
    return;
  }

  const removable = entries
    .filter((entry) => entry.name !== currentIndexVersion)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(Math.max(0, maxCachedVersions - 1));

  await Promise.all(
    removable.map(async (entry) => {
      try {
        await rm(path.join(libraryCacheRoot, entry.name), { recursive: true, force: true });
      } catch {
        // A concurrent search may still be reading this cache on some platforms.
      }
    })
  );
}

function shouldFallbackToTranscriptArtifactSearch(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;

  return code === "ENOENT" || code === "ERR_SQLITE_ERROR" || error instanceof SyntaxError;
}

const ARTIFACT_SEARCH_CURSOR_PREFIX = "artifact:";

type LocalSearchCursorBackend = "none" | "sqlite-index" | "transcript-artifact-fallback" | "unknown";

function localSearchCursorBackend(cursor: string | undefined): LocalSearchCursorBackend {
  const normalized = cursor?.trim();
  if (!normalized) {
    return "none";
  }

  if (normalized.startsWith("sqlite:")) {
    return "sqlite-index";
  }

  if (normalized.startsWith("artifact:")) {
    return "transcript-artifact-fallback";
  }

  return "unknown";
}

function encodeArtifactSearchCursor(offset: number): string {
  return offset > 0 ? `${ARTIFACT_SEARCH_CURSOR_PREFIX}${offset}` : "";
}

function decodeArtifactSearchCursor(cursor: string | undefined): number {
  if (!cursor?.trim()) {
    return 0;
  }

  const normalized = cursor.trim();
  const offsetText = normalized.includes(":")
    ? normalized.slice(normalized.lastIndexOf(":") + 1)
    : normalized;
  const offset = Number.parseInt(offsetText, 10);

  if (!Number.isInteger(offset) || offset < 0 || String(offset) !== offsetText) {
    throw new Error("invalid_search_cursor");
  }

  return offset;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isCutterReadableReadyManifest(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<boolean> {
  if (!isVideoVisibleToCutters(manifest)) {
    return false;
  }

  if (!validateSourceVideoManifest(manifest).ok) {
    return false;
  }

  const sourceVideoFilePath = await resolveSourceVideoFilePath(libraryRoot, manifest);

  if (!(await fileExists(sourceVideoFilePath))) {
    return false;
  }

  for (const artifactPath of [
    manifest.transcript_path,
    manifest.srt_path,
    manifest.keyframes_path,
    manifest.cover_path
  ]) {
    if (!(await fileExists(artifactFilePath(libraryRoot, artifactPath)))) {
      return false;
    }
  }

  return true;
}

export async function listCutterSourceLibrary(
  input: ListCutterSourceLibraryInput
): Promise<CutterSourceLibraryView> {
  let readyManifests: SourceVideoManifest[];
  let availableVideoCount = 0;

  try {
    const indexed = await readIndexedReadySourceVideoManifests(input.library_root, {
      limit: input.limit,
      offset: input.offset
    });
    readyManifests = indexed.manifests;
    availableVideoCount = indexed.available_video_count;
  } catch {
    readyManifests = await readVisibleSourceVideoManifests(input.library_root);
    availableVideoCount = readyManifests.length;
  }

  const videos = await Promise.all(
    readyManifests.map((manifest) =>
      toCutterSourceVideoCard(input.library_root, manifest)
    )
  );

  return {
    available_video_count: availableVideoCount,
    videos
  };
}

export async function getCutterSourceVideoDetail(
  input: GetCutterSourceVideoDetailInput
): Promise<CutterSourceVideoDetail | null> {
  const manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);

  if (!(await isCutterReadableReadyManifest(input.library_root, manifest))) {
    return null;
  }

  const card = await toCutterSourceVideoCard(input.library_root, manifest);
  const transcriptFilePath = artifactFilePath(input.library_root, manifest.transcript_path);
  const srtFilePath = artifactFilePath(input.library_root, manifest.srt_path);
  const keyframesFilePath = artifactFilePath(input.library_root, manifest.keyframes_path);

  return {
    ...card,
    transcript_path: manifest.transcript_path,
    transcript_file_path: transcriptFilePath,
    srt_path: manifest.srt_path,
    srt_file_path: srtFilePath,
    keyframes_path: manifest.keyframes_path,
    keyframes_file_path: keyframesFilePath,
    transcript: await readJsonFile<CutterTranscriptArtifact>(transcriptFilePath),
    srt: await readFile(srtFilePath, "utf8"),
    keyframes: await readJsonFile<CutterKeyframesArtifact>(keyframesFilePath)
  };
}

export async function searchCutterSourceLibrary(
  input: SearchCutterSourceLibraryInput
): Promise<CutterSourceLibrarySearchResult> {
  const startedAt = performance.now();
  let result: SourceTranscriptSqliteSearchResult | (ReturnType<typeof searchTranscripts> & {
    cursor: string;
    next_cursor: string;
    has_more: boolean;
    returned_count: number;
    limit: number;
    index_version: string;
    search_ms: number;
  }) | undefined;
  let searchMode: CutterSourceLibrarySearchResult["search_mode"] = "sqlite-index";
  const cursorBackend = localSearchCursorBackend(input.cursor);

  if (cursorBackend !== "transcript-artifact-fallback") {
    try {
      result = searchSourceTranscriptSqliteIndex({
        index_file_path: await resolveCurrentSourceTranscriptIndexFilePath(input.library_root),
        query: input.query,
        limit: input.limit,
        cursor: input.cursor
      });
    } catch (error) {
      if (cursorBackend === "sqlite-index" || !shouldFallbackToTranscriptArtifactSearch(error)) {
        throw error;
      }
    }
  }

  if (!result) {
    if (cursorBackend === "sqlite-index") {
      throw new Error("invalid_search_cursor");
    }

    searchMode = "transcript-artifact-fallback";
    const offset = decodeArtifactSearchCursor(input.cursor);
    const pageLimit = Math.max(1, input.limit);
    const searchLimit = offset + pageLimit + 1;
    const visibleManifests = await readVisibleSourceVideoManifests(input.library_root);
    const searchableVideos = [];
    let indexVersion = "";

    try {
      indexVersion = (await readCurrentIndexPackageManifest(input.library_root)).index_version;
    } catch {
      // Older or damaged libraries may not have a current package while fallback is still usable.
    }

    for (const manifest of visibleManifests) {
      const transcript = await readJsonFile<CutterTranscriptArtifact>(
        artifactFilePath(input.library_root, manifest.transcript_path)
      );

      searchableVideos.push({
        source_video_id: manifest.source_video_id,
        title: manifest.title,
        duration_ms: manifest.duration_ms,
        segments: transcript.segments
      });
    }

    const fallbackResult = searchTranscripts({ videos: searchableVideos }, {
      query: input.query,
      limit: searchLimit
    });
    const pageGroups = fallbackResult.groups.slice(offset, offset + pageLimit);
    const hasMore = fallbackResult.groups.length > offset + pageLimit;

    result = {
      ...fallbackResult,
      groups: pageGroups,
      cursor: encodeArtifactSearchCursor(offset),
      next_cursor: hasMore ? encodeArtifactSearchCursor(offset + pageGroups.length) : "",
      has_more: hasMore,
      returned_count: pageGroups.length,
      limit: pageLimit,
      index_version: indexVersion,
      search_ms: 0
    };
  }

  const groups = (await Promise.all(
    result.groups.map(async (group) => {
      if (searchMode === "sqlite-index" && isSourceTranscriptSqliteSearchGroup(group)) {
        return {
          ...group,
          relative_path: group.relative_path,
          source_video_file_path: group.relative_path,
          cover_path: group.cover_path,
          cover_file_path: group.cover_path
            ? artifactFilePath(input.library_root, group.cover_path)
            : "",
          transcript_character_count: group.transcript_character_count
        };
      }

      try {
        const manifest = await readSourceVideoManifest(input.library_root, group.source_video_id);

        if (!isCutterReadyManifestRecord(manifest)) {
          return null;
        }

        const [card, transcriptCharacterCount] = await Promise.all([
          toFastCutterSourceVideoCard(input.library_root, manifest),
          readTranscriptCharacterCount(input.library_root, manifest)
        ]);

        return {
          ...group,
          relative_path: card.relative_path,
          source_video_file_path: card.source_video_file_path,
          cover_path: card.cover_path,
          cover_file_path: card.cover_file_path,
          transcript_character_count: transcriptCharacterCount
        };
      } catch {
        return null;
      }
    })
  )).filter((group): group is CutterSourceLibrarySearchGroup => Boolean(group));

  return {
    query: result.query,
    normalized_query: result.normalized_query,
    groups,
    cursor: result.cursor,
    next_cursor: groups.length > 0 ? result.next_cursor : "",
    has_more: groups.length > 0 && result.has_more,
    returned_count: groups.length,
    limit: result.limit,
    index_version: result.index_version,
    search_ms: Math.max(0, Math.round(performance.now() - startedAt)),
    search_mode: searchMode
  };
}
