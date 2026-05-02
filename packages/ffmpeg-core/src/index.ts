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
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
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
