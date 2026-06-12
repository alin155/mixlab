import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  failPreprocessJob,
  getFileIdentity,
  readAllSourceVideoManifests,
  readSourceVideoManifest,
  refreshLibraryCounts,
  resolveSourceVideoFilePath,
  scanSourceVideos,
  updatePreprocessJobStage,
  type ScanSourceVideosResult
} from "../../library-fs/src/index.ts";
import type { SourceVideoMediaMetadata } from "../../ffmpeg-core/src/index.ts";
import type { PreprocessAudioModeId } from "./audio-mode.ts";
import type { SourceVideoTextPreprocessResult } from "./index.ts";

export interface ProbeSourceVideoInput {
  source_video_id: string;
  source_video_path: string;
}

export interface LibraryTextPreprocessInput {
  library_root: string;
  library_id: string;
  source_video_id: string;
  source_video_path: string;
  audio_mode?: PreprocessAudioModeId;
  now: string;
  on_stage?(stage: string): Promise<void> | void;
}

export interface RunLibraryTextPreprocessWorkerInput {
  library_root: string;
  library_id: string;
  library_name: string;
  worker_id: string;
  limit?: number;
  audio_mode?: PreprocessAudioModeId;
  scan_before_claim?: boolean;
  claim_statuses?: Array<"queued" | "unprocessed">;
  count_refresh_interval?: number;
  now?: () => string;
  probe_source_video(input: ProbeSourceVideoInput): Promise<SourceVideoMediaMetadata>;
  get_content_hash?(source_video_path: string): Promise<string>;
  preprocess_source_video(
    input: LibraryTextPreprocessInput
  ): Promise<SourceVideoTextPreprocessResult>;
}

export interface LibraryTextPreprocessWorkerSuccess {
  status: "succeeded";
  source_video_id: string;
  source_video_path: string;
  result: SourceVideoTextPreprocessResult;
}

export interface LibraryTextPreprocessWorkerFailure {
  status: "failed";
  source_video_id: string;
  source_video_path: string;
  error_message: string;
}

export type LibraryTextPreprocessWorkerItem =
  | LibraryTextPreprocessWorkerSuccess
  | LibraryTextPreprocessWorkerFailure;

export interface RunLibraryTextPreprocessWorkerResult {
  scan_result: ScanSourceVideosResult;
  total_claimed_count: number;
  succeeded_count: number;
  failed_count: number;
  items: LibraryTextPreprocessWorkerItem[];
}

function assertValidLimit(limit: number | undefined): void {
  if (limit === undefined) {
    return;
  }

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be greater than 0");
  }
}

function assertValidCountRefreshInterval(interval: number | undefined): void {
  if (interval === undefined) {
    return;
  }

  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error("count_refresh_interval must be greater than 0");
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function defaultNow(): string {
  return new Date().toISOString();
}

async function existingScanResult(libraryRoot: string): Promise<ScanSourceVideosResult> {
  const manifests = await readAllSourceVideoManifests(libraryRoot);

  return {
    total_video_count: manifests.length,
    new_video_count: 0,
    existing_video_count: manifests.length,
    source_video_ids: manifests.map((manifest) => manifest.source_video_id)
  };
}

export async function runLibraryTextPreprocessWorker(
  input: RunLibraryTextPreprocessWorkerInput
): Promise<RunLibraryTextPreprocessWorkerResult> {
  assertValidLimit(input.limit);
  assertValidCountRefreshInterval(input.count_refresh_interval);

  const now = input.now ?? defaultNow;
  const getContentHash =
    input.get_content_hash ?? ((filePath: string) => getFileIdentity(filePath));
  const countRefreshInterval = input.count_refresh_interval ?? 25;
  const scanResult = input.scan_before_claim === false
    ? await existingScanResult(input.library_root)
    : await scanSourceVideos({
        library_root: input.library_root,
        library_id: input.library_id,
        library_name: input.library_name,
        now: now()
      });
  const maxClaimCount = input.limit ?? Number.POSITIVE_INFINITY;
  const items: LibraryTextPreprocessWorkerItem[] = [];
  let claimedSinceCountRefresh = 0;
  let pendingCountRefresh = false;

  async function refreshCountsIfNeeded(force = false): Promise<void> {
    if (!pendingCountRefresh) {
      return;
    }
    if (!force && claimedSinceCountRefresh < countRefreshInterval) {
      return;
    }

    await refreshLibraryCounts(input.library_root, now());
    claimedSinceCountRefresh = 0;
    pendingCountRefresh = false;
  }

  while (items.length < maxClaimCount) {
    const job = await claimNextPreprocessJob({
      library_root: input.library_root,
      worker_id: input.worker_id,
      now: now(),
      claim_statuses: input.claim_statuses,
      refresh_library_counts: false
    });

    if (!job) {
      break;
    }

    claimedSinceCountRefresh += 1;
    pendingCountRefresh = true;
    let sourceVideoPath = "";

    try {
      const manifest = await readSourceVideoManifest(input.library_root, job.source_video_id);
      sourceVideoPath = await resolveSourceVideoFilePath(input.library_root, manifest);
      await updatePreprocessJobStage({
        library_root: input.library_root,
        source_video_id: job.source_video_id,
        stage: "probe-media",
        now: now()
      });
      const mediaMetadata = await input.probe_source_video({
        source_video_id: job.source_video_id,
        source_video_path: sourceVideoPath
      });
      const contentHash = await getContentHash(sourceVideoPath);
      const textPreprocess = await input.preprocess_source_video({
        library_root: input.library_root,
        library_id: input.library_id,
        source_video_id: job.source_video_id,
        source_video_path: sourceVideoPath,
        audio_mode: input.audio_mode,
        now: now(),
        on_stage(stage) {
          return updatePreprocessJobStage({
            library_root: input.library_root,
            source_video_id: job.source_video_id,
            stage,
            now: now()
          });
        }
      });

      await completePreprocessArtifacts({
        library_root: input.library_root,
        source_video_id: job.source_video_id,
        now: now(),
        refresh_library_counts: false,
        media: {
          ...mediaMetadata,
          content_hash: contentHash
        },
        artifacts: {
          transcript_path: textPreprocess.transcript_path,
          srt_path: textPreprocess.srt_path,
          keyframes_path: "",
          cover_path: ""
        }
      });

      items.push({
        status: "succeeded",
        source_video_id: job.source_video_id,
        source_video_path: sourceVideoPath,
        result: textPreprocess
      });
      await refreshCountsIfNeeded();
    } catch (error) {
      const message = errorMessage(error);

      await failPreprocessJob({
        library_root: input.library_root,
        source_video_id: job.source_video_id,
        now: now(),
        error_stage: "text-preprocess",
        error_message: message
      });
      claimedSinceCountRefresh = 0;
      pendingCountRefresh = false;
      items.push({
        status: "failed",
        source_video_id: job.source_video_id,
        source_video_path: sourceVideoPath,
        error_message: message
      });
    }
  }
  await refreshCountsIfNeeded(true);

  const succeededCount = items.filter((item) => item.status === "succeeded").length;

  return {
    scan_result: scanResult,
    total_claimed_count: items.length,
    succeeded_count: succeededCount,
    failed_count: items.length - succeededCount,
    items
  };
}
