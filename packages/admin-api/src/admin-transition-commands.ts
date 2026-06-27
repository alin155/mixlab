import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendPreprocessJobLog,
  readAllSourceVideoManifests,
  readSourceVideoManifest
} from "../../library-fs/src/index.ts";
import {
  validateSourceVideoManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import {
  adminTransitionCommandSpec,
  assertAdminTransitionAllowed
} from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import type { AdminCommandSnapshotFileInput } from "./admin-command-snapshot.ts";
import {
  readAdminLibraryManifest,
  writeAdminLibraryManifest,
  type AdminLibraryManifest
} from "./admin-library-commands.ts";
import {
  adminLibraryManifestPath as libraryManifestPath,
  adminPreprocessJobPath as preprocessJobPath,
  adminSourceVideoManifestPath as sourceVideoManifestPath
} from "./admin-library-paths.ts";
import {
  writeAdminSourceVideoManifestsToReadModelStore,
  writeAdminSourceVideoManifestToReadModelStore
} from "./admin-read-model-store.ts";
import { numericSourceVideoId } from "./admin-source-video-query.ts";
import { libraryCountFieldForPreprocessStatus } from "./admin-source-video-read-model.ts";

export type AdminBulkTransitionCommandName =
  | "preprocess-queue-unprocessed"
  | "preprocess-queue-unprocessed-pipeline"
  | "preprocess-retry-failed"
  | "preprocess-recover-processing";

export type AdminSourceVideoTransitionCommandName =
  | "source-video-queue"
  | "source-video-retry"
  | "source-video-recover-processing";

type AdminTransitionCommandName =
  | AdminBulkTransitionCommandName
  | AdminSourceVideoTransitionCommandName;

export interface AdminTransitionCommandResult {
  affected_count: number;
  source_video_ids: string[];
  library_counts?: LibraryCounts;
}

interface AdminTransitionCommandContext {
  library_root: string;
  library_id: string;
  library_name: string;
  command_now: string;
  now?: () => string;
  actor?: AdminCommandActor;
}

interface PreprocessJobRecord {
  source_video_id: string;
  worker_id?: string;
  status: "processing" | "queued" | "index-required" | "ready" | "failed";
  attempt: number;
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  index_version?: string;
  failed_at?: string;
  current_stage?: string;
  stage_updated_at?: string;
  error_stage?: string;
  error_message?: string;
}

function uniqueSourceVideoIds(sourceVideoIds: string[]): string[] {
  return [...new Set(sourceVideoIds)].sort(
    (left, right) => numericSourceVideoId(left) - numericSourceVideoId(right)
  );
}

function sourceVideoTransitionSnapshotFiles(
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

async function transitionSnapshotFiles(input: {
  library_root: string;
  from: PreprocessStatus[];
  source_video_ids?: string[];
}): Promise<AdminCommandSnapshotFileInput[]> {
  const requestedIds = input.source_video_ids ? uniqueSourceVideoIds(input.source_video_ids) : null;
  const manifests = requestedIds
    ? await readTransitionSourceVideoManifestsByIds(input.library_root, requestedIds)
    : await readAllSourceVideoManifests(input.library_root);
  const snapshotIds = requestedIds ?? manifests
    .filter((manifest) => input.from.includes(manifest.preprocess_status))
    .map((manifest) => manifest.source_video_id);

  return [
    {
      label: "library-manifest",
      file_path: libraryManifestPath(input.library_root)
    },
    ...uniqueSourceVideoIds(snapshotIds).flatMap((sourceVideoId) =>
      sourceVideoTransitionSnapshotFiles(input.library_root, sourceVideoId)
    )
  ];
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function currentTime(input: AdminTransitionCommandContext): string {
  return input.now ? input.now() : input.command_now;
}

function cloneLibraryCounts(library: AdminLibraryManifest): LibraryCounts {
  return {
    video_count: library.video_count,
    ready_video_count: library.ready_video_count,
    processing_video_count: library.processing_video_count,
    queued_video_count: library.queued_video_count,
    unprocessed_video_count: library.unprocessed_video_count,
    failed_video_count: library.failed_video_count,
    index_required_video_count: library.index_required_video_count
  };
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

async function writeSourceVideoManifest(libraryRoot: string, manifest: SourceVideoManifest): Promise<void> {
  const validation = validateSourceVideoManifest(manifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  await mkdir(path.dirname(sourceVideoManifestPath(libraryRoot, manifest.source_video_id)), {
    recursive: true
  });
  await writeFile(sourceVideoManifestPath(libraryRoot, manifest.source_video_id), jsonBytes(manifest), "utf8");
}

async function readPreprocessJob(libraryRoot: string, sourceVideoId: string): Promise<PreprocessJobRecord | null> {
  try {
    return await readJsonFile<PreprocessJobRecord>(preprocessJobPath(libraryRoot, sourceVideoId));
  } catch {
    return null;
  }
}

async function writePreprocessJob(libraryRoot: string, job: PreprocessJobRecord): Promise<void> {
  await mkdir(path.dirname(preprocessJobPath(libraryRoot, job.source_video_id)), { recursive: true });
  await writeFile(preprocessJobPath(libraryRoot, job.source_video_id), jsonBytes(job), "utf8");
}

async function readTransitionSourceVideoManifestsByIds(
  libraryRoot: string,
  sourceVideoIds: string[]
): Promise<SourceVideoManifest[]> {
  const manifests: SourceVideoManifest[] = [];
  const seen = new Set<string>();

  for (const sourceVideoId of sourceVideoIds) {
    if (seen.has(sourceVideoId)) {
      continue;
    }
    seen.add(sourceVideoId);
    try {
      manifests.push(await readSourceVideoManifest(libraryRoot, sourceVideoId));
    } catch {
      // Missing targeted manifests retain the existing route contract: no affected transition.
    }
  }

  return manifests.sort(
    (left, right) => numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
  );
}

async function transitionLibraryCounts(input: {
  library_root: string;
  manifests: SourceVideoManifest[];
  affected: SourceVideoManifest[];
  to: PreprocessStatus;
  targeted: boolean;
}): Promise<LibraryCounts | undefined> {
  if (!input.targeted) {
    const affectedIds = new Set(input.affected.map((manifest) => manifest.source_video_id));
    return countByStatus(input.manifests.map((manifest) =>
      affectedIds.has(manifest.source_video_id)
        ? { ...manifest, preprocess_status: input.to }
        : manifest
    ));
  }

  const library = await readAdminLibraryManifest(input.library_root);
  if (!library) {
    return undefined;
  }

  const counts = cloneLibraryCounts(library);
  for (const manifest of input.affected) {
    if (manifest.preprocess_status === input.to) {
      continue;
    }

    const fromField = libraryCountFieldForPreprocessStatus(manifest.preprocess_status);
    const toField = libraryCountFieldForPreprocessStatus(input.to);
    if (counts[fromField] <= 0) {
      return undefined;
    }
    counts[fromField] -= 1;
    counts[toField] += 1;
  }
  return counts;
}

async function transitionManifests(input: {
  library_root: string;
  from: PreprocessStatus[];
  to: PreprocessStatus;
  now: string;
  reason: string;
  source_video_ids?: string[];
}): Promise<AdminTransitionCommandResult> {
  const requestedIds = input.source_video_ids ? new Set(input.source_video_ids) : null;
  const manifests = requestedIds
    ? await readTransitionSourceVideoManifestsByIds(input.library_root, input.source_video_ids ?? [])
    : await readAllSourceVideoManifests(input.library_root);
  assertAdminTransitionAllowed({
    manifests,
    from: input.from,
    to: input.to,
    requested_source_video_ids: requestedIds
  });

  const affected = manifests.filter((manifest) =>
    input.from.includes(manifest.preprocess_status) &&
    (!requestedIds || requestedIds.has(manifest.source_video_id))
  );

  for (const manifest of affected) {
    await writeSourceVideoManifest(input.library_root, {
      ...manifest,
      preprocess_status: input.to,
      visible_to_cutters: false
    });
    await writePreprocessJob(input.library_root, {
      source_video_id: manifest.source_video_id,
      status: input.to === "queued" ? "queued" : "processing",
      attempt: ((await readPreprocessJob(input.library_root, manifest.source_video_id))?.attempt ?? 0) + 1,
      claimed_at: input.now,
      worker_id: "admin"
    });
    await appendPreprocessJobLog({
      library_root: input.library_root,
      source_video_id: manifest.source_video_id,
      now: input.now,
      stage: input.reason,
      message: `${manifest.preprocess_status} -> ${input.to}`
    });
  }

  return {
    affected_count: affected.length,
    source_video_ids: affected.map((manifest) => manifest.source_video_id),
    library_counts: await transitionLibraryCounts({
      library_root: input.library_root,
      manifests,
      affected,
      to: input.to,
      targeted: Boolean(requestedIds)
    })
  };
}

async function writeThroughAdminSourceVideoReadModelStore(input: {
  library_root: string;
  library: AdminLibraryManifest | null;
  source_video_id: string;
  generated_at: string;
}): Promise<void> {
  if (!input.library) {
    return;
  }

  try {
    const manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);
    await writeAdminSourceVideoManifestToReadModelStore({
      library_root: input.library_root,
      library: input.library,
      manifest,
      generated_at: input.generated_at
    });
  } catch {
    // Store write-through is an optimization; stale/missing stores fall back to rebuild paths.
  }
}

async function writeThroughAdminSourceVideoIdsReadModelStore(input: {
  library_root: string;
  library: AdminLibraryManifest | null;
  source_video_ids: string[];
  generated_at: string;
}): Promise<void> {
  if (!input.library || input.source_video_ids.length === 0) {
    return;
  }

  try {
    const seen = new Set<string>();
    const manifests: SourceVideoManifest[] = [];
    for (const sourceVideoId of input.source_video_ids) {
      if (seen.has(sourceVideoId)) {
        continue;
      }
      seen.add(sourceVideoId);
      manifests.push(await readSourceVideoManifest(input.library_root, sourceVideoId));
    }
    await writeAdminSourceVideoManifestsToReadModelStore({
      library_root: input.library_root,
      library: input.library,
      manifests,
      generated_at: input.generated_at
    });
  } catch {
    // Store write-through is an optimization; stale/missing stores fall back to rebuild paths.
  }
}

async function runTransitionCommand(input: AdminTransitionCommandContext & {
  command: AdminTransitionCommandName;
  source_video_ids?: string[];
}): Promise<AdminTransitionCommandResult> {
  const transition = adminTransitionCommandSpec(input.command);
  return runAdminCommand({
    library_root: input.library_root,
    command: transition.command,
    now: input.command_now,
    actor: input.actor,
    snapshot_files_provider: () => transitionSnapshotFiles({
      library_root: input.library_root,
      from: transition.from,
      source_video_ids: input.source_video_ids
    })
  }, async () => {
    const transitioned = await transitionManifests({
      library_root: input.library_root,
      from: transition.from,
      to: transition.to,
      now: currentTime(input),
      reason: transition.reason,
      source_video_ids: input.source_video_ids
    });
    const library = await writeAdminLibraryManifest({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      now: currentTime(input),
      counts: transitioned.library_counts
    });
    if (transitioned.affected_count > 0) {
      if (input.source_video_ids?.length === 1) {
        await writeThroughAdminSourceVideoReadModelStore({
          library_root: input.library_root,
          library,
          source_video_id: input.source_video_ids[0] ?? "",
          generated_at: currentTime(input)
        });
      } else {
        await writeThroughAdminSourceVideoIdsReadModelStore({
          library_root: input.library_root,
          library,
          source_video_ids: transitioned.source_video_ids,
          generated_at: currentTime(input)
        });
      }
    }
    return transitioned;
  });
}

export async function runAdminBulkTransitionCommand(input: AdminTransitionCommandContext & {
  command: AdminBulkTransitionCommandName;
}): Promise<AdminTransitionCommandResult> {
  return runTransitionCommand(input);
}

export async function runAdminPipelineQueueCommand(
  input: AdminTransitionCommandContext
): Promise<AdminTransitionCommandResult> {
  return runTransitionCommand({
    ...input,
    command: "preprocess-queue-unprocessed-pipeline"
  });
}

export async function runAdminSourceVideoTransitionCommand(input: AdminTransitionCommandContext & {
  command: AdminSourceVideoTransitionCommandName;
  source_video_id: string;
}): Promise<AdminTransitionCommandResult> {
  return runTransitionCommand({
    ...input,
    source_video_ids: [input.source_video_id]
  });
}
