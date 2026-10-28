import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  parseJsonText,
  readAllSourceVideoManifests,
  previewSourceVideoScan,
  scanNewSourceVideos,
  scanSourceVideos,
  type ScanNewSourceVideosResult,
  type ScanSourceVideosResult,
  writeJsonFileAtomically
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
  readAdminLibraryScanNewStatus,
  scanProgressToStatus,
  writeAdminLibraryScanNewStatus,
  type AdminLibraryScanNewStatus
} from "./admin-library-scan-new-status.ts";
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

export interface AdminLibraryScanNewCommandResult extends ScanNewSourceVideosResult {
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

async function readJsonFile<T>(filePath: string): Promise<T> {
  return parseJsonText<T>(await readFile(filePath, "utf8"));
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
  await writeJsonFileAtomically(libraryManifestPath(input.library_root), manifest);
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


interface AdminLibraryScanNewOwnerRecord {
  schema_version: "1.0";
  owner_id: string;
  pid: number;
  started_at: string;
  heartbeat_at: string;
  command: "library-scan-new";
}

/** Heartbeat cadence for a running scan-new owner; the owner file is the liveness source. */
const SCAN_NEW_HEARTBEAT_INTERVAL_MS = 15_000;
/** An owner whose heartbeat is older than this is considered dead and may be taken over. */
const SCAN_NEW_HEARTBEAT_STALE_MS = 60_000;
/** Legacy fallback for running status files written before owner/heartbeat existed. */
const SCAN_NEW_LEGACY_STATUS_STALE_MS = 5 * 60 * 1000;

function scanNewOwnerPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "admin", "library-scan-new-owner.json");
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readScanNewOwnerRecord(
  libraryRoot: string
): Promise<AdminLibraryScanNewOwnerRecord | null> {
  try {
    const record = await readJsonFile<Partial<AdminLibraryScanNewOwnerRecord>>(
      scanNewOwnerPath(libraryRoot)
    );

    if (
      record.schema_version !== "1.0" ||
      typeof record.owner_id !== "string" ||
      record.owner_id.trim() === "" ||
      typeof record.heartbeat_at !== "string"
    ) {
      return null;
    }

    return {
      schema_version: "1.0",
      owner_id: record.owner_id,
      pid: typeof record.pid === "number" ? record.pid : 0,
      started_at: typeof record.started_at === "string" ? record.started_at : "",
      heartbeat_at: record.heartbeat_at,
      command: "library-scan-new"
    };
  } catch {
    return null;
  }
}

async function writeScanNewOwnerRecord(input: {
  library_root: string;
  owner_id: string;
  started_at: string;
  heartbeat_at: string;
}): Promise<void> {
  const filePath = scanNewOwnerPath(input.library_root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonFileAtomically(filePath, {
    schema_version: "1.0",
    owner_id: input.owner_id,
    pid: process.pid,
    started_at: input.started_at,
    heartbeat_at: input.heartbeat_at,
    command: "library-scan-new"
  } satisfies AdminLibraryScanNewOwnerRecord);
}

async function removeScanNewOwnerRecordIfOwner(
  libraryRoot: string,
  ownerId: string
): Promise<void> {
  const owner = await readScanNewOwnerRecord(libraryRoot);

  if (owner?.owner_id !== ownerId) {
    return;
  }

  await rm(scanNewOwnerPath(libraryRoot), { force: true }).catch(() => {
    // Best effort cleanup; a stale owner record is reclaimed by heartbeat staleness.
  });
}

function isScanNewOwnerHeartbeatFresh(
  owner: AdminLibraryScanNewOwnerRecord | null,
  nowMs: number
): boolean {
  if (!owner) {
    return false;
  }

  const heartbeatMs = timestampMs(owner.heartbeat_at);
  return heartbeatMs > 0 && nowMs - heartbeatMs < SCAN_NEW_HEARTBEAT_STALE_MS;
}

/**
 * Reject a concurrent scan-new start before any write happens. A running status without a
 * fresh owner heartbeat is treated as crashed (stale) and can be reclaimed; the writer lease
 * acquired by runAdminCommand remains the true mutual-exclusion gate.
 */
async function assertAdminLibraryScanNewNotRunning(input: {
  library_root: string;
  now: string;
}): Promise<void> {
  const previousStatus = await readAdminLibraryScanNewStatus(input.library_root);

  if (previousStatus.state !== "running") {
    return;
  }

  const nowMs = timestampMs(input.now) || Date.now();
  const owner = await readScanNewOwnerRecord(input.library_root);

  if (isScanNewOwnerHeartbeatFresh(owner, nowMs)) {
    throw new Error("library_scan_new_busy: 新增素材扫描正在运行，请等待完成后再启动。");
  }

  if (!owner) {
    const statusMs = timestampMs(previousStatus.updated_at);
    if (statusMs > 0 && nowMs - statusMs < SCAN_NEW_LEGACY_STATUS_STALE_MS) {
      throw new Error("library_scan_new_busy: 新增素材扫描正在运行，请等待完成后再启动。");
    }
  }
}

/** Compare-and-set finalization: only the current owner may move a running scan to a final state. */
async function finalizeScanNewStatusIfOwner(input: {
  library_root: string;
  owner_id: string;
  status: Partial<AdminLibraryScanNewStatus>;
}): Promise<boolean> {
  const currentStatus = await readAdminLibraryScanNewStatus(input.library_root);
  const owner = await readScanNewOwnerRecord(input.library_root);

  if (owner?.owner_id !== input.owner_id) {
    return false;
  }

  if (currentStatus.state !== "running") {
    return false;
  }

  await writeAdminLibraryScanNewStatus(input.library_root, input.status);
  return true;
}

export async function runAdminLibraryScanNewCommand(
  input: AdminLibraryCommandContext
): Promise<AdminLibraryScanNewCommandResult> {
  const commandName = "library-scan-new";
  const command = adminCommandContract(commandName);
  const startedAt = currentTime(input);
  const ownerId = `library-scan-new:${process.pid}:${startedAt}:${
    Math.random().toString(36).slice(2, 10)
  }`;

  // Step 1: only inspect status; never write "running" before the writer lease is acquired.
  await assertAdminLibraryScanNewNotRunning({
    library_root: input.library_root,
    now: startedAt
  });

  let heartbeatTimer: NodeJS.Timeout | null = null;

  try {
    return await runAdminCommand({
      library_root: input.library_root,
      command: command.command,
      now: input.command_now,
      actor: input.actor,
      snapshot_files_provider: async () => librarySnapshotFiles(input.library_root)
    }, async () => {
      // Step 2: the writer lease is held now, so claiming the owner record cannot race a
      // competing scan-new request. Write owner first, then expose "running" to the UI.
      await writeScanNewOwnerRecord({
        library_root: input.library_root,
        owner_id: ownerId,
        started_at: startedAt,
        heartbeat_at: currentTime(input)
      });

      heartbeatTimer = setInterval(() => {
        void writeScanNewOwnerRecord({
          library_root: input.library_root,
          owner_id: ownerId,
          started_at: startedAt,
          heartbeat_at: currentTime(input)
        }).catch(() => {
          // Heartbeat failures are recovered by staleness reclamation on the next request.
        });
      }, SCAN_NEW_HEARTBEAT_INTERVAL_MS);
      heartbeatTimer.unref?.();

      await writeAdminLibraryScanNewStatus(input.library_root, {
        state: "running",
        started_at: startedAt,
        updated_at: currentTime(input),
        stage: "listing"
      });

      try {
        await initializeAdminLibrary({
          library_root: input.library_root,
          library_id: input.library_id,
          library_name: input.library_name,
          now: currentTime(input)
        });
        const result = await scanNewSourceVideos({
          library_root: input.library_root,
          library_id: input.library_id,
          library_name: input.library_name,
          now: currentTime(input),
          on_progress: async (progress) => {
            await writeAdminLibraryScanNewStatus(
              input.library_root,
              scanProgressToStatus({ started_at: startedAt, progress })
            );
          }
        });
        const readModel = await markAdminReadModelStoreStaleForCommand({
          library_root: input.library_root,
          command: commandName,
          invalidated_at: currentTime(input),
          read_library_manifest: () => readAdminLibraryManifest(input.library_root)
        });
        await finalizeScanNewStatusIfOwner({
          library_root: input.library_root,
          owner_id: ownerId,
          status: {
            state: "completed",
            started_at: startedAt,
            updated_at: currentTime(input),
            completed_at: currentTime(input),
            stage: "completed",
            new_video_count: result.new_video_count,
            existing_video_count: result.existing_video_count,
            total_video_count: result.total_video_count,
            inactive_manifest_count: result.inactive_manifest_count,
            inactive_ready_count: result.inactive_ready_count,
            discovered_video_count: result.total_video_count,
            indexed_file_count: result.total_video_count,
            written_video_count: result.new_video_count
          }
        });
        return {
          ...result,
          read_model: readModel
        };
      } catch (error) {
        // Step 3: CAS-style failure update; a request that lost the lease never owns the
        // record and therefore never overwrites another runner's status.
        await finalizeScanNewStatusIfOwner({
          library_root: input.library_root,
          owner_id: ownerId,
          status: {
            state: "failed",
            started_at: startedAt,
            updated_at: currentTime(input),
            completed_at: currentTime(input),
            error_message: error instanceof Error ? error.message : String(error)
          }
        });
        throw error;
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        await removeScanNewOwnerRecordIfOwner(input.library_root, ownerId);
      }
    });
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }
}
