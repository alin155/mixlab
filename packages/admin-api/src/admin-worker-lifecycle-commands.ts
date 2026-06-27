import path from "node:path";
import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  failPreprocessJob,
  preprocessJobLogPath,
  readAllSourceVideoManifests,
  readSourceVideoManifest,
  refreshLibraryCounts,
  updatePreprocessJobStage,
  type ClaimNextPreprocessJobInput,
  type CompletePreprocessArtifactsInput,
  type FailPreprocessJobInput,
  type PreprocessJobSummary,
  type UpdatePreprocessJobStageInput
} from "../../library-fs/src/index.ts";
import type { LibraryTextPreprocessWorkerLifecycle } from "../../preprocess-core/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import { adminCommandContract } from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandSnapshotFileInput } from "./admin-command-snapshot.ts";
import { readAdminLibraryManifest } from "./admin-library-commands.ts";
import {
  adminLibraryManifestPath as libraryManifestPath,
  adminPreprocessJobPath as preprocessJobPath,
  adminSourceVideoManifestPath as sourceVideoManifestPath
} from "./admin-library-paths.ts";
import { writeAdminSourceVideoManifestsToReadModelStore } from "./admin-read-model-store.ts";
import { assertAdminWorkerTextArtifactCommitReady } from "./admin-worker-artifact-guard.ts";

export interface AdminWorkerLifecycleCommandOptions {
  actor?: AdminCommandActor;
}

function preprocessJobLogFilePath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(libraryRoot, preprocessJobLogPath(sourceVideoId));
}

function workerLifecycleSnapshotFiles(
  libraryRoot: string,
  sourceVideoId: string
): AdminCommandSnapshotFileInput[] {
  return [
    {
      label: "library-manifest",
      file_path: libraryManifestPath(libraryRoot)
    },
    {
      label: `source-video-${sourceVideoId}-manifest`,
      file_path: sourceVideoManifestPath(libraryRoot, sourceVideoId)
    },
    {
      label: `source-video-${sourceVideoId}-preprocess-job`,
      file_path: preprocessJobPath(libraryRoot, sourceVideoId)
    },
    {
      label: `source-video-${sourceVideoId}-preprocess-log`,
      file_path: preprocessJobLogFilePath(libraryRoot, sourceVideoId)
    }
  ];
}

function sourceVideoArtifactSnapshotFile(input: {
  library_root: string;
  source_video_id: string;
  artifact_kind: "transcript" | "srt";
  artifact_path: string;
}): AdminCommandSnapshotFileInput[] {
  if (!input.artifact_path.trim()) {
    return [];
  }

  return [{
    label: `source-video-${input.source_video_id}-${input.artifact_kind}-artifact`,
    file_path: path.join(input.library_root, input.artifact_path)
  }];
}

function workerCompleteSnapshotFiles(
  input: CompletePreprocessArtifactsInput
): AdminCommandSnapshotFileInput[] {
  return [
    ...workerLifecycleSnapshotFiles(input.library_root, input.source_video_id),
    ...sourceVideoArtifactSnapshotFile({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      artifact_kind: "transcript",
      artifact_path: input.artifacts.transcript_path
    }),
    ...sourceVideoArtifactSnapshotFile({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      artifact_kind: "srt",
      artifact_path: input.artifacts.srt_path
    })
  ];
}

async function claimCandidateSourceVideoId(
  input: ClaimNextPreprocessJobInput
): Promise<string | null> {
  const claimStatuses = input.claim_statuses ?? ["queued", "unprocessed"];
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const manifest = claimStatuses
    .map((status) => manifests.find((candidate) => candidate.preprocess_status === status))
    .find((candidate): candidate is SourceVideoManifest => Boolean(candidate));

  return manifest?.source_video_id ?? null;
}

async function writeThroughAllSourceVideosAfterCountRefresh(input: {
  library_root: string;
  generated_at: string;
}): Promise<void> {
  try {
    await writeAdminSourceVideoManifestsToReadModelStore({
      library_root: input.library_root,
      library: await readAdminLibraryManifest(input.library_root),
      manifests: await readAllSourceVideoManifests(input.library_root),
      generated_at: input.generated_at
    });
  } catch {
    // Store write-through is an optimization; page queries can fall back to rebuild paths.
  }
}

async function writeThroughSourceVideoAfterFreshCounts(input: {
  library_root: string;
  source_video_id: string;
  generated_at: string;
}): Promise<void> {
  try {
    await writeAdminSourceVideoManifestsToReadModelStore({
      library_root: input.library_root,
      library: await readAdminLibraryManifest(input.library_root),
      manifests: [await readSourceVideoManifest(input.library_root, input.source_video_id)],
      generated_at: input.generated_at
    });
  } catch {
    // Store write-through is an optimization; stale/missing stores fall back to rebuild paths.
  }
}

export async function runAdminWorkerClaimCommand(
  input: ClaimNextPreprocessJobInput,
  options: AdminWorkerLifecycleCommandOptions = {}
): Promise<PreprocessJobSummary | null> {
  const sourceVideoId = await claimCandidateSourceVideoId(input);

  if (!sourceVideoId) {
    return null;
  }

  const command = adminCommandContract("preprocess-worker-claim");
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: options.actor,
    snapshot_files_provider: async () => {
      const candidateId = await claimCandidateSourceVideoId(input);
      return candidateId
        ? workerLifecycleSnapshotFiles(input.library_root, candidateId)
        : [{
            label: "library-manifest",
            file_path: libraryManifestPath(input.library_root)
          }];
    }
  }, () => claimNextPreprocessJob(input));
}

export async function runAdminWorkerStageCommand(
  input: UpdatePreprocessJobStageInput,
  options: AdminWorkerLifecycleCommandOptions = {}
): Promise<void> {
  const command = adminCommandContract("preprocess-worker-stage");
  await runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: options.actor,
    snapshot_files: workerLifecycleSnapshotFiles(input.library_root, input.source_video_id)
  }, () => updatePreprocessJobStage(input));
}

export async function runAdminWorkerCompleteCommand(
  input: CompletePreprocessArtifactsInput,
  options: AdminWorkerLifecycleCommandOptions = {}
): Promise<void> {
  const command = adminCommandContract("preprocess-worker-complete");
  await runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: options.actor,
    snapshot_files: workerCompleteSnapshotFiles(input)
  }, async () => {
    await assertAdminWorkerTextArtifactCommitReady({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      transcript_path: input.artifacts.transcript_path,
      srt_path: input.artifacts.srt_path
    });
    await completePreprocessArtifacts(input);
    if (input.refresh_library_counts !== false) {
      await writeThroughSourceVideoAfterFreshCounts({
        library_root: input.library_root,
        source_video_id: input.source_video_id,
        generated_at: input.now
      });
    }
  });
}

export async function runAdminWorkerFailCommand(
  input: FailPreprocessJobInput,
  options: AdminWorkerLifecycleCommandOptions = {}
): Promise<void> {
  const command = adminCommandContract("preprocess-worker-fail");
  await runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: options.actor,
    snapshot_files: workerLifecycleSnapshotFiles(input.library_root, input.source_video_id)
  }, async () => {
    await failPreprocessJob(input);
    await writeThroughSourceVideoAfterFreshCounts({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      generated_at: input.now
    });
  });
}

export async function runAdminWorkerRefreshCountsCommand(input: {
  library_root: string;
  now: string;
}, options: AdminWorkerLifecycleCommandOptions = {}): Promise<void> {
  const command = adminCommandContract("preprocess-worker-refresh-counts");
  await runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: options.actor,
    snapshot_files: [{
      label: "library-manifest",
      file_path: libraryManifestPath(input.library_root)
    }]
  }, async () => {
    await refreshLibraryCounts(input.library_root, input.now);
    await writeThroughAllSourceVideosAfterCountRefresh({
      library_root: input.library_root,
      generated_at: input.now
    });
  });
}

export function createAdminWorkerLifecycleCommands(
  options: AdminWorkerLifecycleCommandOptions = {}
): LibraryTextPreprocessWorkerLifecycle {
  return {
    claim_next_preprocess_job(input) {
      return runAdminWorkerClaimCommand(input, options);
    },
    update_preprocess_job_stage(input) {
      return runAdminWorkerStageCommand(input, options);
    },
    complete_preprocess_artifacts(input) {
      return runAdminWorkerCompleteCommand(input, options);
    },
    fail_preprocess_job(input) {
      return runAdminWorkerFailCommand(input, options);
    },
    refresh_library_counts(libraryRoot, now) {
      return runAdminWorkerRefreshCountsCommand({
        library_root: libraryRoot,
        now
      }, options);
    }
  };
}
