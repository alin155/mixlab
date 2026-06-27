import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  readAllSourceVideoManifests,
  previewSourceVideoScan,
  scanSourceVideos,
  type ScanSourceVideosResult
} from "../../library-fs/src/index.ts";
import type { LibraryCounts, PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import { adminCommandContract } from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import type { AdminCommandSnapshotFileInput } from "./admin-command-snapshot.ts";
import {
  markAdminReadModelStoreStaleForCommand,
  type AdminReadModelInvalidationHandoff
} from "./admin-read-model-invalidation.ts";
import {
  adminLibraryManifestPath as libraryManifestPath,
  adminMixlabRoot as mixlabRoot,
  adminPreprocessJobPath as preprocessJobPath,
  adminSettingsPath,
  adminSourceTranscriptIndexRoot as sourceTranscriptIndexRoot,
  adminSourceVideoManifestPath as sourceVideoManifestPath,
  adminSourceVideosRoot as sourceVideosRoot,
  adminVideosRoot as videosRoot
} from "./admin-library-paths.ts";

export interface AdminLibraryManifest extends LibraryCounts {
  library_id?: string;
  name?: string;
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AdminLibraryScanCommandResult extends ScanSourceVideosResult {
  read_model: AdminReadModelInvalidationHandoff | null;
}

interface AdminLibraryCommandContext {
  library_root: string;
  library_id: string;
  library_name: string;
  command_now: string;
  now?: () => string;
  actor?: AdminCommandActor;
}

function librarySnapshotFiles(libraryRoot: string): AdminCommandSnapshotFileInput[] {
  return [
    {
      label: "library-manifest",
      file_path: libraryManifestPath(libraryRoot)
    },
    {
      label: "admin-settings",
      file_path: adminSettingsPath(libraryRoot)
    }
  ];
}

function uniqueSourceVideoIds(sourceVideoIds: string[]): string[] {
  return [...new Set(sourceVideoIds)].sort((left, right) => {
    const leftNumber = Number.parseInt(left.replace(/^V/u, ""), 10);
    const rightNumber = Number.parseInt(right.replace(/^V/u, ""), 10);
    return leftNumber - rightNumber;
  });
}

function sourceVideoSnapshotFiles(
  libraryRoot: string,
  sourceVideoId: string
): AdminCommandSnapshotFileInput[] {
  return [
    {
      label: `source-video-${sourceVideoId}-manifest`,
      file_path: sourceVideoManifestPath(libraryRoot, sourceVideoId)
    },
    {
      label: `source-video-${sourceVideoId}-preprocess-job`,
      file_path: preprocessJobPath(libraryRoot, sourceVideoId)
    }
  ];
}

async function libraryScanSnapshotFiles(
  input: AdminLibraryCommandContext
): Promise<AdminCommandSnapshotFileInput[]> {
  const preview = await previewSourceVideoScan({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: currentTime(input)
  });
  const sourceVideoIds = uniqueSourceVideoIds([
    ...preview.source_video_ids,
    ...preview.inactive_source_video_ids
  ]);

  return [
    ...librarySnapshotFiles(input.library_root),
    ...sourceVideoIds.flatMap((sourceVideoId) =>
      sourceVideoSnapshotFiles(input.library_root, sourceVideoId)
    )
  ];
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function readAdminLibraryManifest(libraryRoot: string): Promise<AdminLibraryManifest | null> {
  try {
    return await readJsonFile<AdminLibraryManifest>(libraryManifestPath(libraryRoot));
  } catch {
    return null;
  }
}

function countByStatus(manifests: SourceVideoManifest[]): LibraryCounts {
  const counts: Record<PreprocessStatus, number> = {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };

  for (const manifest of manifests) {
    counts[manifest.preprocess_status] += 1;
  }

  return {
    video_count: manifests.length,
    ready_video_count: counts.ready,
    processing_video_count: counts.processing,
    queued_video_count: counts.queued,
    unprocessed_video_count: counts.unprocessed,
    failed_video_count: counts.failed,
    index_required_video_count: counts["index-required"]
  };
}

export async function writeAdminLibraryManifest(input: {
  library_root: string;
  library_id: string;
  library_name: string;
  now: string;
  counts?: LibraryCounts;
}): Promise<AdminLibraryManifest> {
  const previous = await readAdminLibraryManifest(input.library_root);
  const counts = input.counts ?? countByStatus(await readAllSourceVideoManifests(input.library_root));
  const manifest: AdminLibraryManifest = {
    library_id: previous?.library_id ?? input.library_id,
    name: previous?.name ?? input.library_name,
    version: previous?.version ?? "1.0",
    created_at: previous?.created_at ?? input.now,
    updated_at: input.now,
    ...counts
  };

  await mkdir(mixlabRoot(input.library_root), { recursive: true });
  await writeFile(libraryManifestPath(input.library_root), jsonBytes(manifest), "utf8");
  return manifest;
}

function currentTime(input: AdminLibraryCommandContext): string {
  return input.now ? input.now() : input.command_now;
}

export async function initializeAdminLibrary(input: {
  library_root: string;
  library_id: string;
  library_name: string;
  now: string;
}): Promise<AdminLibraryManifest> {
  await mkdir(input.library_root, { recursive: true });
  await mkdir(sourceVideosRoot(input.library_root), { recursive: true });
  await mkdir(videosRoot(input.library_root), { recursive: true });
  await mkdir(sourceTranscriptIndexRoot(input.library_root), { recursive: true });
  return writeAdminLibraryManifest(input);
}

export async function runAdminLibraryInitCommand(
  input: AdminLibraryCommandContext
): Promise<AdminLibraryManifest> {
  const commandName = "library-init";
  const command = adminCommandContract(commandName);
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files: librarySnapshotFiles(input.library_root)
  }, async () => {
    const result = await initializeAdminLibrary({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      now: currentTime(input)
    });
    await markAdminReadModelStoreStaleForCommand({
      library_root: input.library_root,
      command: commandName,
      invalidated_at: currentTime(input),
      read_library_manifest: () => readAdminLibraryManifest(input.library_root)
    });
    return result;
  });
}

export async function runAdminLibraryScanCommand(
  input: AdminLibraryCommandContext
): Promise<AdminLibraryScanCommandResult> {
  const commandName = "library-scan";
  const command = adminCommandContract(commandName);
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files_provider: () => libraryScanSnapshotFiles(input)
  }, async () => {
    await initializeAdminLibrary({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      now: currentTime(input)
    });
    const result = await scanSourceVideos({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      now: currentTime(input)
    });
    const readModel = await markAdminReadModelStoreStaleForCommand({
      library_root: input.library_root,
      command: commandName,
      invalidated_at: currentTime(input),
      read_library_manifest: () => readAdminLibraryManifest(input.library_root)
    });
    return {
      ...result,
      read_model: readModel
    };
  });
}
