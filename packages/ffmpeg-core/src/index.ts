import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type CutMode = "copy" | "smart" | "precise";
export type AudioExtractionFormat = "mp3" | "wav" | "m4a";

export interface FfmpegCutPlanInput {
  source_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
}

export interface FfmpegAudioExtractionPlanInput {
  source_path: string;
  output_path: string;
  output_format: AudioExtractionFormat;
  sample_rate_hz?: number;
  channels?: number;
  audio_bitrate?: string;
}

export interface FfmpegCoverImagePlanInput {
  source_path: string;
  output_path: string;
  at_ms?: number;
  width?: number;
  quality?: number;
}

export interface FfmpegCommandPlan {
  executable: "ffmpeg" | "ffprobe";
  args: string[];
}

export interface FfmpegRuntime {
  ffmpeg_path: string;
  ffprobe_path: string;
  source: "env" | "bundled-static";
}

export interface FfprobeSourceMetadataPlanInput {
  source_path: string;
}

export interface SourceVideoMediaMetadata {
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

export function resolveFfmpegRuntime(env: NodeJS.ProcessEnv = process.env): FfmpegRuntime {
  if (env.MIXLAB_FFMPEG_PATH && env.MIXLAB_FFPROBE_PATH) {
    return {
      ffmpeg_path: env.MIXLAB_FFMPEG_PATH,
      ffprobe_path: env.MIXLAB_FFPROBE_PATH,
      source: "env"
    };
  }

  const ffmpegPath = require("ffmpeg-static") as string | null;
  const ffprobeStatic = require("ffprobe-static") as { path: string };

  if (!ffmpegPath || !ffprobeStatic.path) {
    throw new Error("bundled ffmpeg runtime is unavailable");
  }

  return {
    ffmpeg_path: ffmpegPath,
    ffprobe_path: ffprobeStatic.path,
    source: "bundled-static"
  };
}

export function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

export function buildFfmpegCutPlan(input: FfmpegCutPlanInput): FfmpegCommandPlan {
  if (input.end_ms <= input.begin_ms) {
    throw new Error("end_ms must be greater than begin_ms");
  }

  const startSeconds = formatSeconds(input.begin_ms);
  const durationSeconds = formatSeconds(input.end_ms - input.begin_ms);

  if (input.cut_mode === "copy") {
    return {
      executable: "ffmpeg",
      args: [
        "-hide_banner",
        "-y",
        "-ss",
        startSeconds,
        "-i",
        input.source_path,
        "-t",
        durationSeconds,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        input.output_path
      ]
    };
  }

  return {
    executable: "ffmpeg",
    args: [
      "-hide_banner",
      "-y",
      "-i",
      input.source_path,
      "-ss",
      startSeconds,
      "-t",
      durationSeconds,
      "-c:v",
      "libx264",
      "-preset",
      input.cut_mode === "smart" ? "veryfast" : "veryfast",
      "-crf",
      input.cut_mode === "smart" ? "20" : "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      input.output_path
    ]
  };
}

export function buildFfmpegAudioExtractionPlan(
  input: FfmpegAudioExtractionPlanInput
): FfmpegCommandPlan {
  const sampleRateHz = input.sample_rate_hz ?? 16_000;
  const channels = input.channels ?? 1;
  const audioBitrate = input.audio_bitrate;

  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    throw new Error("sample_rate_hz must be greater than 0");
  }

  if (!Number.isFinite(channels) || channels <= 0) {
    throw new Error("channels must be greater than 0");
  }

  if (audioBitrate && !/^\d+(?:\.\d+)?[kKmM]$/.test(audioBitrate)) {
    throw new Error("audio_bitrate must look like an ffmpeg bitrate, such as 64k");
  }

  const codecArgs = (() => {
    if (input.output_format === "mp3") {
      return ["-codec:a", "libmp3lame", "-b:a", audioBitrate ?? "64k"];
    }

    if (input.output_format === "m4a") {
      return ["-codec:a", "aac", "-b:a", audioBitrate ?? "48k"];
    }

    return ["-codec:a", "pcm_s16le"];
  })();

  return {
    executable: "ffmpeg",
    args: [
      "-hide_banner",
      "-y",
      "-i",
      input.source_path,
      "-vn",
      "-ac",
      channels.toString(),
      "-ar",
      Math.trunc(sampleRateHz).toString(),
      ...codecArgs,
      input.output_path
    ]
  };
}

export function buildFfmpegCoverImagePlan(input: FfmpegCoverImagePlanInput): FfmpegCommandPlan {
  const atMs = input.at_ms ?? 1_000;
  const width = input.width ?? 640;
  const quality = input.quality ?? 3;

  if (!Number.isFinite(atMs) || atMs < 0) {
    throw new Error("at_ms must be greater than or equal to 0");
  }

  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("width must be greater than 0");
  }

  if (!Number.isInteger(quality) || quality < 2 || quality > 31) {
    throw new Error("quality must be between 2 and 31");
  }

  return {
    executable: "ffmpeg",
    args: [
      "-hide_banner",
      "-y",
      "-ss",
      formatSeconds(atMs),
      "-i",
      input.source_path,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-2`,
      "-q:v",
      quality.toString(),
      input.output_path
    ]
  };
}

export function buildFfprobeSourceMetadataPlan(
  input: FfprobeSourceMetadataPlanInput
): FfmpegCommandPlan {
  return {
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      input.source_path
    ]
  };
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseFps(value: unknown): number {
  if (typeof value !== "string" || value.trim() === "" || value === "0/0") {
    return 0;
  }

  const [numeratorRaw, denominatorRaw] = value.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(3));
}

export function parseFfprobeSourceMetadata(stdout: string): SourceVideoMediaMetadata {
  const output = JSON.parse(stdout) as {
    format?: {
      duration?: unknown;
    };
    streams?: Array<{
      codec_type?: unknown;
      codec_name?: unknown;
      width?: unknown;
      height?: unknown;
      avg_frame_rate?: unknown;
      r_frame_rate?: unknown;
      duration?: unknown;
    }>;
  };
  const videoStream = output.streams?.find((stream) => stream.codec_type === "video");

  if (!videoStream) {
    throw new Error("ffprobe output did not include a video stream");
  }

  const durationSeconds =
    parseNumber(output.format?.duration) ?? parseNumber(videoStream.duration) ?? 0;
  const width = parseNumber(videoStream.width) ?? 0;
  const height = parseNumber(videoStream.height) ?? 0;

  return {
    duration_ms: Math.round(durationSeconds * 1000),
    width: Math.trunc(width),
    height: Math.trunc(height),
    fps: parseFps(videoStream.avg_frame_rate) || parseFps(videoStream.r_frame_rate),
    codec: typeof videoStream.codec_name === "string" ? videoStream.codec_name : ""
  };
}


// --- 剪辑产物质检 / 关键帧 / 超时（P0 契约，2026-10-27） ---------------------

export interface FfprobeOutputVerificationPlanInput {
  output_path: string;
}

export interface OutputMediaProbe {
  duration_ms?: number;
  has_video_stream: boolean;
  has_audio_stream: boolean;
  video_duration_ms?: number;
  audio_duration_ms?: number;
  video_start_ms?: number;
}

export function buildFfprobeOutputVerificationPlan(
  input: FfprobeOutputVerificationPlanInput
): FfmpegCommandPlan {
  return {
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration,start_time:stream=codec_type,duration,start_time",
      input.output_path
    ]
  };
}

function millisecondsFromSeconds(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.round(value * 1000);
}

export function parseFfprobeOutputProbe(stdout: string): OutputMediaProbe {
  const output = JSON.parse(stdout) as {
    format?: {
      duration?: unknown;
    };
    streams?: Array<{
      codec_type?: unknown;
      duration?: unknown;
      start_time?: unknown;
    }>;
  };
  const streams = Array.isArray(output.streams) ? output.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const durationSeconds =
    parseNumber(output.format?.duration) ??
    parseNumber(videoStream?.duration) ??
    parseNumber(audioStream?.duration);

  return {
    ...(millisecondsFromSeconds(durationSeconds) !== undefined
      ? { duration_ms: millisecondsFromSeconds(durationSeconds) }
      : {}),
    has_video_stream: Boolean(videoStream),
    has_audio_stream: Boolean(audioStream),
    ...(millisecondsFromSeconds(parseNumber(videoStream?.duration)) !== undefined
      ? { video_duration_ms: millisecondsFromSeconds(parseNumber(videoStream?.duration)) }
      : {}),
    ...(millisecondsFromSeconds(parseNumber(audioStream?.duration)) !== undefined
      ? { audio_duration_ms: millisecondsFromSeconds(parseNumber(audioStream?.duration)) }
      : {}),
    ...(millisecondsFromSeconds(parseNumber(videoStream?.start_time)) !== undefined
      ? { video_start_ms: millisecondsFromSeconds(parseNumber(videoStream?.start_time)) }
      : {})
  };
}

export interface FfprobeFirstFramePtsPlanInput {
  output_path: string;
}

export function buildFfprobeFirstFramePtsPlan(
  input: FfprobeFirstFramePtsPlanInput
): FfmpegCommandPlan {
  return {
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "packet=pts_time",
      "-read_intervals",
      "%+#1",
      "-print_format",
      "json",
      input.output_path
    ]
  };
}

/** 返回输出文件首个视频帧的 PTS（毫秒）；无视频包时返回 undefined。 */
export function parseFfprobeFirstFramePts(stdout: string): number | undefined {
  const output = JSON.parse(stdout) as {
    packets?: Array<{ pts_time?: unknown }>;
  };
  const firstPacket = Array.isArray(output.packets) ? output.packets[0] : undefined;
  return millisecondsFromSeconds(parseNumber(firstPacket?.pts_time));
}

export interface FfprobeKeyframePlanInput {
  source_path: string;
  begin_ms: number;
  search_window_ms?: number;
}

export const DEFAULT_KEYFRAME_SEARCH_WINDOW_MS = 10_000;

export function buildFfprobeKeyframePlan(
  input: FfprobeKeyframePlanInput
): FfmpegCommandPlan {
  const safeBeginMs = Number.isFinite(input.begin_ms) ? Math.max(0, input.begin_ms) : 0;
  const windowMs = Number.isFinite(input.search_window_ms)
    ? Math.max(1_000, Math.floor(input.search_window_ms!))
    : DEFAULT_KEYFRAME_SEARCH_WINDOW_MS;
  const windowStartMs = Math.max(0, safeBeginMs - windowMs);
  const windowEndMs = safeBeginMs + 1_000;

  return {
    executable: "ffprobe",
    args: [
      "-v",
      "error",
      "-print_format",
      "json",
      "-select_streams",
      "v:0",
      "-skip_frame",
      "nokey",
      "-show_entries",
      "frame=pts_time",
      "-read_intervals",
      `${formatSeconds(windowStartMs)}%${formatSeconds(windowEndMs)}`,
      input.source_path
    ]
  };
}

/** 解析 -skip_frame nokey 探测出的关键帧时间点（毫秒，升序去重）。 */
export function parseFfprobeKeyframeTimes(stdout: string): number[] {
  const output = JSON.parse(stdout) as {
    frames?: Array<{ pts_time?: unknown }>;
  };
  const frames = Array.isArray(output.frames) ? output.frames : [];
  const times = new Set<number>();

  for (const frame of frames) {
    const milliseconds = millisecondsFromSeconds(parseNumber(frame?.pts_time));

    if (milliseconds !== undefined && milliseconds >= 0) {
      times.add(milliseconds);
    }
  }

  return [...times].sort((left, right) => left - right);
}

export const MAX_COPY_KEYFRAME_DISTANCE_MS = 500;
export const MAX_COPY_START_KEYFRAME_DISTANCE_MS = 1_000;

export interface CopyKeyframeDecisionInput {
  cut_mode: CutMode;
  begin_ms: number;
  keyframe_times_ms: number[];
  end_ms?: number;
  max_keyframe_distance_ms?: number;
}

export interface CopyKeyframeDecision {
  cut_mode_used: CutMode;
  keyframe_distance_ms?: number;
  degrade_reason?: string;
}

/**
 * copy 模式只能从关键帧起切；起点距最近关键帧超过阈值时自动降级为 precise，
 * 并返回可写入任务清单的降级原因。
 */
export function decideCopyCutMode(input: CopyKeyframeDecisionInput): CopyKeyframeDecision {
  if (input.cut_mode !== "copy") {
    return { cut_mode_used: input.cut_mode };
  }

  const threshold = Number.isFinite(input.max_keyframe_distance_ms) && (input.max_keyframe_distance_ms ?? 0) > 0
    ? Math.floor(input.max_keyframe_distance_ms!)
    : MAX_COPY_KEYFRAME_DISTANCE_MS;
  const beginMs = Number.isFinite(input.begin_ms) ? Math.max(0, input.begin_ms) : 0;
  const keyframeTimes = (Array.isArray(input.keyframe_times_ms) ? input.keyframe_times_ms : [])
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  let previousKeyframe: number | undefined;

  for (const keyframeTime of keyframeTimes) {
    if (keyframeTime <= beginMs + 1) {
      previousKeyframe = keyframeTime;
    }
  }

  if (previousKeyframe === undefined) {
    // The cut starts before the first keyframe (typically begin=0). Stream-copy
    // can still start at that first keyframe if it is close enough; otherwise
    // the beginning would be silently dropped and copy should degrade.
    const firstKeyframe = keyframeTimes.find((keyframeTime) => keyframeTime >= beginMs);
    if (firstKeyframe !== undefined) {
      const firstKeyframeDistance = Math.max(0, Math.round(firstKeyframe - beginMs));
      const endsBeforeFirstKeyframe = typeof input.end_ms === "number" && input.end_ms <= firstKeyframe;
      if (!endsBeforeFirstKeyframe && firstKeyframeDistance <= MAX_COPY_START_KEYFRAME_DISTANCE_MS) {
        return {
          cut_mode_used: "copy",
          keyframe_distance_ms: firstKeyframeDistance
        };
      }
      return {
        cut_mode_used: "precise",
        keyframe_distance_ms: firstKeyframeDistance,
        degrade_reason: endsBeforeFirstKeyframe
          ? "首个关键帧晚于剪切终点，已自动降级为精准剪切"
          : "起点前无关键帧，首个关键帧距起点 " + firstKeyframeDistance + "ms，超过 " + MAX_COPY_START_KEYFRAME_DISTANCE_MS + "ms 起始关键帧阈值，已自动降级为精准剪切"
      };
    }
    return {
      cut_mode_used: "precise",
      degrade_reason: "无法定位源视频关键帧，已自动降级为精准剪切"
    };
  }

  const keyframeDistance = Math.max(0, Math.round(beginMs - previousKeyframe));

  if (keyframeDistance > threshold) {
    return {
      cut_mode_used: "precise",
      keyframe_distance_ms: keyframeDistance,
      degrade_reason: `起点距最近关键帧 ${keyframeDistance}ms，超过 ${threshold}ms 关键帧阈值，已自动降级为精准剪切`
    };
  }

  return {
    cut_mode_used: "copy",
    keyframe_distance_ms: keyframeDistance
  };
}

export const DEFAULT_FFMPEG_TIMEOUT_BASE_MS = 120_000;
export const DEFAULT_FFMPEG_TIMEOUT_FACTOR = 2;
export const DEFAULT_FFMPEG_TIMEOUT_MAX_MS = 2 * 60 * 60 * 1000;
export const MIN_FFMPEG_TIMEOUT_MS = 30_000;

export interface FfmpegTimeoutEstimateInput {
  range_ms: number;
  max_ms?: number;
}

/** 按剪切区间估算超时：基础 120s + 区间 x2，受可配置上限约束。 */
export function resolveFfmpegTimeoutMs(input: FfmpegTimeoutEstimateInput): number {
  const rangeMs = Number.isFinite(input.range_ms) ? Math.max(0, input.range_ms) : 0;
  const estimate = DEFAULT_FFMPEG_TIMEOUT_BASE_MS + Math.round(rangeMs * DEFAULT_FFMPEG_TIMEOUT_FACTOR);
  const configuredMax =
    Number.isFinite(input.max_ms) && (input.max_ms ?? 0) > 0
      ? Math.floor(input.max_ms!)
      : DEFAULT_FFMPEG_TIMEOUT_MAX_MS;

  return Math.max(MIN_FFMPEG_TIMEOUT_MS, Math.min(estimate, configuredMax));
}
