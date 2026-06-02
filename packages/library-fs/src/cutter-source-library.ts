import { createHash } from "node:crypto";
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
import { searchSourceTranscriptSqliteIndex } from "../../search-sqlite/src/index.ts";
import {
  readAllSourceVideoManifests,
  readSourceVideoManifest
} from "./preprocess-lifecycle.ts";
import { resolveSourceVideoFilePath } from "./source-paths.ts";

export interface ListCutterSourceLibraryInput {
  library_root: string;
}

export interface GetCutterSourceVideoDetailInput {
  library_root: string;
  source_video_id: string;
}

export interface SearchCutterSourceLibraryInput {
  library_root: string;
  query: string;
  limit: number;
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
    cover_file_path: artifactFilePath(libraryRoot, manifest.cover_path)
  };
}

function isCutterReadyManifestRecord(manifest: SourceVideoManifest): boolean {
  return isVideoVisibleToCutters(manifest) && validateSourceVideoManifest(manifest).ok;
}

async function readIndexedReadySourceVideoManifests(
  libraryRoot: string
): Promise<SourceVideoManifest[]> {
  const indexManifest = await readCurrentIndexPackageManifest(libraryRoot);
  const records = await Promise.all(
    indexManifest.source_video_ids.map(async (sourceVideoId) => {
      try {
        const manifest = await readSourceVideoManifest(libraryRoot, sourceVideoId);
        return isCutterReadyManifestRecord(manifest) ? manifest : null;
      } catch {
        return null;
      }
    })
  );

  return records.filter((manifest): manifest is SourceVideoManifest => Boolean(manifest));
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
  const cacheDir = path.join(
    os.tmpdir(),
    "mixlab-cutter-index-cache",
    cacheKeyForLibraryRoot(libraryRoot),
    indexVersion
  );
  const cacheFilePath = path.join(cacheDir, "index.sqlite");

  try {
    const cacheStat = await stat(cacheFilePath);

    if (cacheStat.size === sourceStat.size) {
      await pruneSqliteIndexCache(path.dirname(cacheDir), indexVersion);
      return cacheFilePath;
    }
  } catch {
    // Cache miss; copy the immutable index package locally.
  }

  await mkdir(cacheDir, { recursive: true });
  const tempFilePath = path.join(
    cacheDir,
    `index.sqlite.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await copyFile(sourceIndexFilePath, tempFilePath);
    await rename(tempFilePath, cacheFilePath);
  } catch (error) {
    await rm(tempFilePath, { force: true });
    throw error;
  }

  await pruneSqliteIndexCache(path.dirname(cacheDir), indexVersion);
  return cacheFilePath;
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

  try {
    readyManifests = await readIndexedReadySourceVideoManifests(input.library_root);
  } catch {
    readyManifests = await readVisibleSourceVideoManifests(input.library_root);
  }

  const videos = await Promise.all(
    readyManifests.map((manifest) =>
      toCutterSourceVideoCard(input.library_root, manifest)
    )
  );

  return {
    available_video_count: videos.length,
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
  let result: {
    query: string;
    normalized_query: string;
    groups: TranscriptSearchGroup[];
  };

  try {
    result = searchSourceTranscriptSqliteIndex({
      index_file_path: await resolveCurrentSourceTranscriptIndexFilePath(input.library_root),
      query: input.query,
      limit: Math.min(100, Math.max(input.limit * 3, input.limit))
    });
  } catch (error) {
    if (!shouldFallbackToTranscriptArtifactSearch(error)) {
      throw error;
    }

    const visibleManifests = await readVisibleSourceVideoManifests(input.library_root);
    const searchableVideos = [];

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

    result = searchTranscripts({ videos: searchableVideos }, {
      query: input.query,
      limit: input.limit
    });
  }

  return {
    query: result.query,
    normalized_query: result.normalized_query,
    groups: (await Promise.all(
      result.groups.map(async (group) => {
        try {
          const manifest = await readSourceVideoManifest(input.library_root, group.source_video_id);

          if (!(await isCutterReadableReadyManifest(input.library_root, manifest))) {
            return null;
          }

          const card = await toCutterSourceVideoCard(input.library_root, manifest);

          return {
            ...group,
            relative_path: card.relative_path,
            source_video_file_path: card.source_video_file_path,
            cover_path: card.cover_path,
            cover_file_path: card.cover_file_path,
            transcript_character_count: await readTranscriptCharacterCount(input.library_root, manifest)
          };
        } catch {
          return null;
        }
      })
    )).filter((group): group is CutterSourceLibrarySearchGroup => Boolean(group)).slice(0, input.limit)
  };
}
