import {
  claimNextPreprocessJob,
  completePreprocessArtifacts,
  failPreprocessJob,
  getFileIdentity,
  readSourceVideoManifest,
  resolveSourceVideoFilePath,
  scanSourceVideos,
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
}

export interface RunLibraryTextPreprocessWorkerInput {
  library_root: string;
  library_id: string;
  library_name: string;
  worker_id: string;
  limit?: number;
  audio_mode?: PreprocessAudioModeId;
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function defaultNow(): string {
  return new Date().toISOString();
}

export async function runLibraryTextPreprocessWorker(
  input: RunLibraryTextPreprocessWorkerInput
): Promise<RunLibraryTextPreprocessWorkerResult> {
  assertValidLimit(input.limit);

  const now = input.now ?? defaultNow;
  const getContentHash =
    input.get_content_hash ?? ((filePath: string) => getFileIdentity(filePath));
  const scanResult = await scanSourceVideos({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: now()
  });
  const maxClaimCount = input.limit ?? Number.POSITIVE_INFINITY;
  const items: LibraryTextPreprocessWorkerItem[] = [];

  while (items.length < maxClaimCount) {
    const job = await claimNextPreprocessJob({
      library_root: input.library_root,
      worker_id: input.worker_id,
      now: now()
    });

    if (!job) {
      break;
    }

    const manifest = await readSourceVideoManifest(input.library_root, job.source_video_id);
    const sourceVideoPath = await resolveSourceVideoFilePath(input.library_root, manifest);

    try {
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
        now: now()
      });

      await completePreprocessArtifacts({
        library_root: input.library_root,
        source_video_id: job.source_video_id,
        now: now(),
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
    } catch (error) {
      const message = errorMessage(error);

      await failPreprocessJob({
        library_root: input.library_root,
        source_video_id: job.source_video_id,
        now: now(),
        error_stage: "text-preprocess",
        error_message: message
      });
      items.push({
        status: "failed",
        source_video_id: job.source_video_id,
        source_video_path: sourceVideoPath,
        error_message: message
      });
    }
  }

  const succeededCount = items.filter((item) => item.status === "succeeded").length;

  return {
    scan_result: scanResult,
    total_claimed_count: items.length,
    succeeded_count: succeededCount,
    failed_count: items.length - succeededCount,
    items
  };
}
