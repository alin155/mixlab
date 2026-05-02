import { normalizeTranscriptText } from "../../protocol/src/index.ts";
import type { AudioExtractionFormat } from "../../ffmpeg-core/src/index.ts";

export interface AudioBenchmarkVariant {
  id: string;
  label: string;
  audio_format: AudioExtractionFormat;
  extension: AudioExtractionFormat;
  sample_rate_hz: number;
  channels: number;
  audio_bitrate?: string;
}

export interface AudioBenchmarkSuccessfulRun {
  status: "succeeded";
  variant_id: string;
  audio_size_bytes: number;
  total_elapsed_ms: number;
  full_text: string;
}

export interface AudioBenchmarkFailedRun {
  status: "failed";
  variant_id: string;
  error_message: string;
}

export type AudioBenchmarkRun = AudioBenchmarkSuccessfulRun | AudioBenchmarkFailedRun;

export interface BuildAudioBenchmarkComparisonsInput {
  baseline_variant_id: string;
  runs: AudioBenchmarkRun[];
}

export interface AudioBenchmarkSucceededComparison {
  variant_id: string;
  status: "succeeded";
  text_similarity_to_baseline: number;
  audio_size_ratio_to_baseline: number;
  total_elapsed_ratio_to_baseline: number;
}

export interface AudioBenchmarkFailedComparison {
  variant_id: string;
  status: "failed";
  error_message: string;
}

export type AudioBenchmarkComparison =
  | AudioBenchmarkSucceededComparison
  | AudioBenchmarkFailedComparison;

export const AUDIO_BENCHMARK_BASELINE_VARIANT_ID = "wav_16k_mono_pcm_s16le";

export const AUDIO_BENCHMARK_VARIANTS: AudioBenchmarkVariant[] = [
  {
    id: "mp3_16k_mono_64k",
    label: "MP3 16 kHz mono 64 kbps",
    audio_format: "mp3",
    extension: "mp3",
    sample_rate_hz: 16_000,
    channels: 1,
    audio_bitrate: "64k"
  },
  {
    id: "mp3_16k_mono_32k",
    label: "MP3 16 kHz mono 32 kbps",
    audio_format: "mp3",
    extension: "mp3",
    sample_rate_hz: 16_000,
    channels: 1,
    audio_bitrate: "32k"
  },
  {
    id: "m4a_aac_16k_mono_48k",
    label: "M4A/AAC 16 kHz mono 48 kbps",
    audio_format: "m4a",
    extension: "m4a",
    sample_rate_hz: 16_000,
    channels: 1,
    audio_bitrate: "48k"
  },
  {
    id: AUDIO_BENCHMARK_BASELINE_VARIANT_ID,
    label: "WAV 16 kHz mono PCM s16le",
    audio_format: "wav",
    extension: "wav",
    sample_rate_hz: 16_000,
    channels: 1
  }
];

const VARIANTS_BY_ID = new Map(
  AUDIO_BENCHMARK_VARIANTS.map((variant) => [variant.id, variant])
);

function roundRatio(value: number): number {
  return Number(value.toFixed(6));
}

export function selectAudioBenchmarkVariants(variantIds?: string[]): AudioBenchmarkVariant[] {
  if (!variantIds || variantIds.length === 0) {
    return AUDIO_BENCHMARK_VARIANTS;
  }

  const unknownVariantIds = variantIds.filter((variantId) => !VARIANTS_BY_ID.has(variantId));

  if (unknownVariantIds.length > 0) {
    throw new Error(`unknown audio benchmark variant ids: ${unknownVariantIds.join(", ")}`);
  }

  return variantIds.map((variantId) => VARIANTS_BY_ID.get(variantId) as AudioBenchmarkVariant);
}

export function audioBenchmarkContentType(variant: AudioBenchmarkVariant): string {
  if (variant.audio_format === "mp3") {
    return "audio/mpeg";
  }

  if (variant.audio_format === "m4a") {
    return "audio/mp4";
  }

  return "audio/wav";
}

export function audioBenchmarkOutputFileName(variant: AudioBenchmarkVariant): string {
  return `audio.${variant.extension}`;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_value, index) => index);
  const currentRow = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    currentRow[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        previousRow[rightIndex] + 1,
        currentRow[rightIndex - 1] + 1,
        previousRow[rightIndex - 1] + substitutionCost
      );
    }

    for (let rightIndex = 0; rightIndex < previousRow.length; rightIndex += 1) {
      previousRow[rightIndex] = currentRow[rightIndex];
    }
  }

  return previousRow[right.length] ?? 0;
}

export function calculateTextSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeTranscriptText(left);
  const normalizedRight = normalizeTranscriptText(right);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);

  if (maxLength === 0) {
    return 1;
  }

  return roundRatio(
    1 - levenshteinDistance(normalizedLeft, normalizedRight) / maxLength
  );
}

function ratio(value: number, baseline: number): number {
  if (baseline <= 0) {
    return 0;
  }

  return roundRatio(value / baseline);
}

function findSuccessfulBaselineRun(
  input: BuildAudioBenchmarkComparisonsInput
): AudioBenchmarkSuccessfulRun {
  const baselineRun = input.runs.find(
    (run) => run.variant_id === input.baseline_variant_id && run.status === "succeeded"
  );

  if (!baselineRun || baselineRun.status !== "succeeded") {
    throw new Error(`successful baseline run not found: ${input.baseline_variant_id}`);
  }

  return baselineRun;
}

export function buildAudioBenchmarkComparisons(
  input: BuildAudioBenchmarkComparisonsInput
): AudioBenchmarkComparison[] {
  const baselineRun = findSuccessfulBaselineRun(input);

  return input.runs.map((run) => {
    if (run.status === "failed") {
      return {
        variant_id: run.variant_id,
        status: "failed",
        error_message: run.error_message
      };
    }

    return {
      variant_id: run.variant_id,
      status: "succeeded",
      text_similarity_to_baseline: calculateTextSimilarity(
        baselineRun.full_text,
        run.full_text
      ),
      audio_size_ratio_to_baseline: ratio(
        run.audio_size_bytes,
        baselineRun.audio_size_bytes
      ),
      total_elapsed_ratio_to_baseline: ratio(
        run.total_elapsed_ms,
        baselineRun.total_elapsed_ms
      )
    };
  });
}
