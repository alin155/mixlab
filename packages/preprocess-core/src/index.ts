import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  runDashScopeRecordedAudioAsr,
  type DashScopeAsrModel,
  type DashScopeJsonHttpClient,
  type DashScopeSleep,
  type DashScopeSubmitParameters
} from "../../asr-core/src/index.ts";
import {
  buildFfmpegAudioExtractionPlan,
  type AudioExtractionFormat
} from "../../ffmpeg-core/src/index.ts";
import { writeAsrTextArtifacts } from "../../library-fs/src/index.ts";
import { buildAsrAudioObjectKey } from "../../oss-core/src/index.ts";
import {
  resolvePreprocessAudioMode,
  type PreprocessAudioModeId
} from "./audio-mode.ts";

export interface CommandRunner {
  run(executable: string, args: string[]): Promise<void>;
}

export interface UploadAsrAudioInput {
  local_file_path: string;
  object_key?: string;
  content_type?: string;
}

export interface UploadedAsrAudio {
  object_key: string;
  file_url: string;
  url_mode: string;
}

export interface AsrAudioUploader {
  uploadAsrAudio(input: UploadAsrAudioInput): Promise<UploadedAsrAudio>;
}

export interface RunSourceVideoTextPreprocessInput {
  library_root: string;
  library_id: string;
  source_video_id: string;
  source_video_path: string;
  ffmpeg_path: string;
  audio_mode?: PreprocessAudioModeId;
  audio_format?: AudioExtractionFormat;
  audio_bitrate?: string;
  oss_object_key_prefix?: string;
  now: string;
  on_stage?(stage: string): Promise<void> | void;
  command_runner: CommandRunner;
  uploader: AsrAudioUploader;
  asr_http: DashScopeJsonHttpClient;
  asr: {
    api_key: string;
    model: DashScopeAsrModel;
    parameters?: DashScopeSubmitParameters;
    max_poll_attempts?: number;
    poll_interval_ms?: number;
    sleep?: DashScopeSleep;
  };
}

interface ResolvedPreprocessAudioSettings {
  audio_format: AudioExtractionFormat;
  extension: AudioExtractionFormat;
  sample_rate_hz?: number;
  channels?: number;
  audio_bitrate?: string;
  content_type: string;
}

export interface SourceVideoTextPreprocessResult {
  source_video_id: string;
  audio_path: string;
  audio_object_key: string;
  audio_file_url: string;
  asr_task_id: string;
  transcription_url: string;
  transcript_path: string;
  srt_path: string;
  duration_ms: number;
  segment_count: number;
}

function audioRelativePath(sourceVideoId: string, format: AudioExtractionFormat): string {
  return `.mixlab-library/videos/${sourceVideoId}/asr-audio/audio.${format}`;
}

function contentType(format: AudioExtractionFormat): string {
  if (format === "mp3") {
    return "audio/mpeg";
  }

  if (format === "m4a") {
    return "audio/mp4";
  }

  return "audio/wav";
}

function resolveLegacyAudioSettings(
  audioFormat: AudioExtractionFormat,
  audioBitrate: string | undefined
): ResolvedPreprocessAudioSettings {
  return {
    audio_format: audioFormat,
    extension: audioFormat,
    ...(audioBitrate ? { audio_bitrate: audioBitrate } : {}),
    content_type: contentType(audioFormat)
  };
}

function resolvePreprocessAudioSettings(
  input: RunSourceVideoTextPreprocessInput
): ResolvedPreprocessAudioSettings {
  if (input.audio_mode) {
    const mode = resolvePreprocessAudioMode(input.audio_mode);

    return {
      audio_format: mode.audio_format,
      extension: mode.extension,
      sample_rate_hz: mode.sample_rate_hz,
      channels: mode.channels,
      ...(mode.audio_bitrate ? { audio_bitrate: mode.audio_bitrate } : {}),
      content_type: mode.content_type
    };
  }

  if (input.audio_format) {
    return resolveLegacyAudioSettings(input.audio_format, input.audio_bitrate);
  }

  const defaultMode = resolvePreprocessAudioMode();

  return {
    audio_format: defaultMode.audio_format,
    extension: defaultMode.extension,
    sample_rate_hz: defaultMode.sample_rate_hz,
    channels: defaultMode.channels,
    ...(defaultMode.audio_bitrate ? { audio_bitrate: defaultMode.audio_bitrate } : {}),
    content_type: defaultMode.content_type
  };
}

export async function runSourceVideoTextPreprocess(
  input: RunSourceVideoTextPreprocessInput
): Promise<SourceVideoTextPreprocessResult> {
  const audioSettings = resolvePreprocessAudioSettings(input);
  const audioPath = audioRelativePath(input.source_video_id, audioSettings.extension);
  const absoluteAudioPath = path.join(input.library_root, audioPath);

  await mkdir(path.dirname(absoluteAudioPath), { recursive: true });

  const extractionPlan = buildFfmpegAudioExtractionPlan({
    source_path: input.source_video_path,
    output_path: absoluteAudioPath,
    output_format: audioSettings.audio_format,
    sample_rate_hz: audioSettings.sample_rate_hz,
    channels: audioSettings.channels,
    audio_bitrate: audioSettings.audio_bitrate
  });

  await input.on_stage?.("extract-audio");
  await input.command_runner.run(input.ffmpeg_path, extractionPlan.args);

  await input.on_stage?.("upload-audio");
  const objectKey = input.oss_object_key_prefix
    ? buildAsrAudioObjectKey({
        prefix: input.oss_object_key_prefix,
        library_id: input.library_id,
        source_video_id: input.source_video_id,
        extension: audioSettings.extension
      })
    : undefined;
  const uploaded = await input.uploader.uploadAsrAudio({
    local_file_path: absoluteAudioPath,
    ...(objectKey ? { object_key: objectKey } : {}),
    content_type: audioSettings.content_type
  });
  await input.on_stage?.("asr");
  const asr = await runDashScopeRecordedAudioAsr({
    api_key: input.asr.api_key,
    model: input.asr.model,
    parameters: input.asr.parameters,
    source_video_id: input.source_video_id,
    file_url: uploaded.file_url,
    generated_at: input.now,
    max_poll_attempts: input.asr.max_poll_attempts,
    poll_interval_ms: input.asr.poll_interval_ms,
    sleep: input.asr.sleep,
    http: input.asr_http
  });
  await input.on_stage?.("write-transcript");
  const textArtifactPaths = await writeAsrTextArtifacts({
    library_root: input.library_root,
    source_video_id: input.source_video_id,
    transcript_artifact: asr.transcript,
    srt: asr.srt
  });

  return {
    source_video_id: input.source_video_id,
    audio_path: audioPath,
    audio_object_key: uploaded.object_key,
    audio_file_url: uploaded.file_url,
    asr_task_id: asr.task_id,
    transcription_url: asr.transcription_url,
    transcript_path: textArtifactPaths.transcript_path,
    srt_path: textArtifactPaths.srt_path,
    duration_ms: asr.transcript.duration_ms,
    segment_count: asr.transcript.segments.length
  };
}

export { runLibraryTextPreprocessWorker } from "./library-worker.ts";
export type {
  LibraryTextPreprocessInput,
  LibraryTextPreprocessWorkerFailure,
  LibraryTextPreprocessWorkerItem,
  LibraryTextPreprocessWorkerSuccess,
  ProbeSourceVideoInput,
  RunLibraryTextPreprocessWorkerInput,
  RunLibraryTextPreprocessWorkerResult
} from "./library-worker.ts";
