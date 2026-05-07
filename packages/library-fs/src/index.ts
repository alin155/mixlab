import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createSourceTranscriptSqliteIndexBytes,
  type SourceTranscriptSqliteVideo
} from "../../search-sqlite/src/index.ts";
import {
  validateIndexPackageManifest,
  type IndexCurrentPointer,
  type IndexPackageManifest
} from "../../protocol/src/index.ts";
import {
  publishReadySourceVideo,
  readAllSourceVideoManifests
} from "./preprocess-lifecycle.ts";
export { scanSourceVideos } from "./scanner.ts";
export type { ScanSourceVideosInput, ScanSourceVideosResult } from "./scanner.ts";
export {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  completeReadyVisualArtifacts,
  failPreprocessJob,
  publishReadySourceVideo,
  readAllSourceVideoManifests,
  readSourceVideoManifest,
  updatePreprocessJobStage
} from "./preprocess-lifecycle.ts";
export { listCutterVisibleSourceVideos } from "./cutter-catalog.ts";
export {
  getCutterSourceVideoDetail,
  listCutterSourceLibrary,
  searchCutterSourceLibrary
} from "./cutter-source-library.ts";
export {
  allocateNextLocalClipId,
  buildLocalClipArtifactPaths,
  getLocalClipDetail,
  listLocalClips,
  writeLocalClipManifest
} from "./local-clips.ts";
export { writeAsrTextArtifacts } from "./asr-artifacts.ts";
export { getFileIdentity, hashFileSha256 } from "./file-hash.ts";
export * from "./admin-settings.ts";
export * from "./cutter-users.ts";
export * from "./usage-events.ts";
export { resolveSourceVideoFilePath } from "./source-paths.ts";
export type { FileIdentityMode } from "./file-hash.ts";
export type {
  ClaimNextPreprocessJobInput,
  CompletePreprocessArtifactsInput,
  CompleteReadyVisualArtifactsInput,
  FailPreprocessJobInput,
  PreprocessJobSummary,
  PublishReadySourceVideoInput,
  UpdatePreprocessJobStageInput
} from "./preprocess-lifecycle.ts";
export type {
  CutterVisibleSourceVideoCatalog,
  ListCutterVisibleSourceVideosInput
} from "./cutter-catalog.ts";
export type {
  CutterKeyframesArtifact,
  CutterSourceLibrarySearchGroup,
  CutterSourceLibrarySearchResult,
  CutterSourceLibraryView,
  CutterSourceVideoCard,
  CutterSourceVideoDetail,
  CutterTranscriptArtifact,
  GetCutterSourceVideoDetailInput,
  ListCutterSourceLibraryInput,
  SearchCutterSourceLibraryInput
} from "./cutter-source-library.ts";
export type {
  BuildLocalClipArtifactPathsInput,
  GetLocalClipDetailInput,
  ListLocalClipsInput,
  LocalClipArtifactPaths,
  LocalClipCatalog,
  LocalClipManifest,
  LocalClipManifestInput,
  LocalClipView
} from "./local-clips.ts";
export type {
  AsrTextArtifactPaths,
  WriteAsrTextArtifactsInput
} from "./asr-artifacts.ts";

export interface PublishIndexPackageInput {
  library_root: string;
  manifest: IndexPackageManifest;
  index_sqlite_bytes: Buffer;
}

export interface PublishIndexRequiredSourceVideosInput {
  library_root: string;
  library_id: string;
  now: string;
  source_video_ids?: string[];
}

export interface PublishIndexRequiredSourceVideosResult {
  index_version: string;
  published_source_video_ids: string[];
  ready_video_count: number;
  skipped_source_video_ids: string[];
}

function indexRoot(libraryRoot: string): string {
  return path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index"
  );
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function sortSourceVideoIds(sourceVideoIds: string[]): string[] {
  return [...sourceVideoIds].sort(
    (left, right) => numericSourceVideoId(left) - numericSourceVideoId(right)
  );
}

function nextIndexVersion(currentVersion: string | undefined): string {
  const match = /^v(\d{6})$/.exec(currentVersion ?? "");
  const next = match ? Number.parseInt(match[1] ?? "0", 10) + 1 : 1;

  return `v${String(next).padStart(6, "0")}`;
}

function isSafeLibraryRelativePath(relativePath: string): boolean {
  return (
    relativePath.trim() !== "" &&
    !path.isAbsolute(relativePath) &&
    !relativePath.split(/[\\/]+/).includes("..")
  );
}

async function artifactExists(libraryRoot: string, relativePath: string): Promise<boolean> {
  if (!isSafeLibraryRelativePath(relativePath)) {
    return false;
  }

  try {
    return (await stat(path.join(libraryRoot, relativePath))).isFile();
  } catch {
    return false;
  }
}

async function isReadyPublishComplete(input: {
  library_root: string;
  transcript_path: string;
  srt_path: string;
  keyframes_path: string;
  cover_path: string;
}): Promise<boolean> {
  return (
    (await artifactExists(input.library_root, input.transcript_path)) &&
    (await artifactExists(input.library_root, input.srt_path)) &&
    (await artifactExists(input.library_root, input.keyframes_path)) &&
    (await artifactExists(input.library_root, input.cover_path))
  );
}

export async function publishIndexPackage(input: PublishIndexPackageInput): Promise<void> {
  const validation = validateIndexPackageManifest(input.manifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const root = indexRoot(input.library_root);
  const versionDir = path.join(root, input.manifest.index_version);
  const tempDir = path.join(
    root,
    `${input.manifest.index_version}.tmp-${process.pid}-${Date.now()}`
  );
  const tempCurrentPath = path.join(
    root,
    `current.tmp-${process.pid}-${Date.now()}.json`
  );

  await mkdir(root, { recursive: true });

  try {
    await mkdir(tempDir, { recursive: false });
    await writeFile(path.join(tempDir, "index.sqlite"), input.index_sqlite_bytes);
    await writeFile(
      path.join(tempDir, "index-manifest.json"),
      jsonBytes(input.manifest),
      "utf8"
    );

    await rename(tempDir, versionDir);

    const pointer: IndexCurrentPointer = {
      library_id: input.manifest.library_id,
      current_version: input.manifest.index_version,
      updated_at: input.manifest.created_at
    };

    await writeFile(tempCurrentPath, jsonBytes(pointer), "utf8");
    await rename(tempCurrentPath, path.join(root, "current.json"));
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    await rm(tempCurrentPath, { force: true });
    throw error;
  }
}

export async function readCurrentIndexPointer(
  libraryRoot: string
): Promise<IndexCurrentPointer> {
  const currentPath = path.join(indexRoot(libraryRoot), "current.json");
  return JSON.parse(await readFile(currentPath, "utf8")) as IndexCurrentPointer;
}

export async function resolveCurrentSourceTranscriptIndexFilePath(
  libraryRoot: string
): Promise<string> {
  const pointer = await readCurrentIndexPointer(libraryRoot);
  return path.join(indexRoot(libraryRoot), pointer.current_version, "index.sqlite");
}

async function readJsonArtifact<T>(libraryRoot: string, relativePath: string): Promise<T> {
  if (!isSafeLibraryRelativePath(relativePath)) {
    throw new Error("artifact path must be a safe library-relative path");
  }

  return JSON.parse(await readFile(path.join(libraryRoot, relativePath), "utf8")) as T;
}

async function buildSearchSqliteVideos(input: {
  library_root: string;
  source_video_ids: string[];
}): Promise<SourceTranscriptSqliteVideo[]> {
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const manifestsById = new Map(manifests.map((manifest) => [manifest.source_video_id, manifest]));
  const videos: SourceTranscriptSqliteVideo[] = [];

  for (const sourceVideoId of input.source_video_ids) {
    const manifest = manifestsById.get(sourceVideoId);

    if (!manifest) {
      throw new Error(`source video manifest not found for ${sourceVideoId}`);
    }

    const transcript = await readJsonArtifact<{
      segments: SourceTranscriptSqliteVideo["segments"];
    }>(input.library_root, manifest.transcript_path);

    videos.push({
      source_video_id: manifest.source_video_id,
      title: manifest.title,
      duration_ms: manifest.duration_ms,
      relative_path: manifest.relative_path,
      cover_path: manifest.cover_path,
      segments: transcript.segments
    });
  }

  return videos;
}

export async function publishIndexRequiredSourceVideos(
  input: PublishIndexRequiredSourceVideosInput
): Promise<PublishIndexRequiredSourceVideosResult> {
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const requestedIds = input.source_video_ids
    ? new Set(input.source_video_ids)
    : null;
  const indexRequired = manifests.filter(
    (manifest) =>
      manifest.preprocess_status === "index-required" &&
      (!requestedIds || requestedIds.has(manifest.source_video_id))
  );
  const completeCandidates = [];
  const skippedSourceVideoIds = [];

  for (const manifest of indexRequired) {
    if (
      await isReadyPublishComplete({
        library_root: input.library_root,
        transcript_path: manifest.transcript_path,
        srt_path: manifest.srt_path,
        keyframes_path: manifest.keyframes_path,
        cover_path: manifest.cover_path
      })
    ) {
      completeCandidates.push(manifest);
    } else {
      skippedSourceVideoIds.push(manifest.source_video_id);
    }
  }

  const alreadyReadyIds = manifests
    .filter((manifest) => manifest.preprocess_status === "ready")
    .map((manifest) => manifest.source_video_id);
  const publishedSourceVideoIds = sortSourceVideoIds(
    completeCandidates.map((manifest) => manifest.source_video_id)
  );
  const nextReadyIds = sortSourceVideoIds([...alreadyReadyIds, ...publishedSourceVideoIds]);

  if (publishedSourceVideoIds.length === 0) {
    return {
      index_version: "",
      published_source_video_ids: [],
      ready_video_count: alreadyReadyIds.length,
      skipped_source_video_ids: sortSourceVideoIds(skippedSourceVideoIds)
    };
  }

  let currentVersion: string | undefined;

  try {
    currentVersion = (await readCurrentIndexPointer(input.library_root)).current_version;
  } catch {
    currentVersion = undefined;
  }

  const indexVersion = nextIndexVersion(currentVersion);

  const indexSqliteBytes = await createSourceTranscriptSqliteIndexBytes({
    library_id: input.library_id,
    index_version: indexVersion,
    created_at: input.now,
    videos: await buildSearchSqliteVideos({
      library_root: input.library_root,
      source_video_ids: nextReadyIds
    })
  });

  await publishIndexPackage({
    library_root: input.library_root,
    manifest: {
      index_version: indexVersion,
      library_id: input.library_id,
      created_at: input.now,
      ready_video_count: nextReadyIds.length,
      source_video_ids: nextReadyIds,
      schema_version: "1.0"
    },
    index_sqlite_bytes: indexSqliteBytes
  });

  for (const sourceVideoId of publishedSourceVideoIds) {
    await publishReadySourceVideo({
      library_root: input.library_root,
      source_video_id: sourceVideoId,
      index_version: indexVersion,
      now: input.now
    });
  }

  return {
    index_version: indexVersion,
    published_source_video_ids: publishedSourceVideoIds,
    ready_video_count: nextReadyIds.length,
    skipped_source_video_ids: sortSourceVideoIds(skippedSourceVideoIds)
  };
}
