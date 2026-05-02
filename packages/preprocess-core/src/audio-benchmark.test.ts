import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_BENCHMARK_BASELINE_VARIANT_ID,
  AUDIO_BENCHMARK_VARIANTS,
  buildAudioBenchmarkComparisons,
  selectAudioBenchmarkVariants
} from "./audio-benchmark.ts";

test("defines production audio benchmark variants with wav as the baseline", () => {
  assert.deepEqual(
    AUDIO_BENCHMARK_VARIANTS.map((variant) => ({
      id: variant.id,
      audio_format: variant.audio_format,
      audio_bitrate: variant.audio_bitrate,
      is_baseline: variant.id === AUDIO_BENCHMARK_BASELINE_VARIANT_ID
    })),
    [
      {
        id: "mp3_16k_mono_64k",
        audio_format: "mp3",
        audio_bitrate: "64k",
        is_baseline: false
      },
      {
        id: "mp3_16k_mono_32k",
        audio_format: "mp3",
        audio_bitrate: "32k",
        is_baseline: false
      },
      {
        id: "m4a_aac_16k_mono_48k",
        audio_format: "m4a",
        audio_bitrate: "48k",
        is_baseline: false
      },
      {
        id: "wav_16k_mono_pcm_s16le",
        audio_format: "wav",
        audio_bitrate: undefined,
        is_baseline: true
      }
    ]
  );
});

test("selects explicit benchmark variants and rejects unknown ids", () => {
  assert.deepEqual(
    selectAudioBenchmarkVariants(["wav_16k_mono_pcm_s16le", "mp3_16k_mono_64k"]).map(
      (variant) => variant.id
    ),
    ["wav_16k_mono_pcm_s16le", "mp3_16k_mono_64k"]
  );

  assert.throws(
    () => selectAudioBenchmarkVariants(["mp3_16k_mono_64k", "unknown"]),
    /unknown audio benchmark variant ids: unknown/
  );
});

test("compares successful benchmark runs against the wav transcript baseline", () => {
  const comparisons = buildAudioBenchmarkComparisons({
    baseline_variant_id: "wav_16k_mono_pcm_s16le",
    runs: [
      {
        status: "succeeded",
        variant_id: "wav_16k_mono_pcm_s16le",
        audio_size_bytes: 1_600_000,
        total_elapsed_ms: 20_000,
        full_text: "现金流，是企业的血液。"
      },
      {
        status: "succeeded",
        variant_id: "mp3_16k_mono_64k",
        audio_size_bytes: 400_000,
        total_elapsed_ms: 12_000,
        full_text: "现金流是企业的血液"
      },
      {
        status: "succeeded",
        variant_id: "mp3_16k_mono_32k",
        audio_size_bytes: 200_000,
        total_elapsed_ms: 10_000,
        full_text: "现金流是企业血液"
      },
      {
        status: "failed",
        variant_id: "m4a_aac_16k_mono_48k",
        error_message: "upload failed"
      }
    ]
  });

  assert.deepEqual(comparisons, [
    {
      variant_id: "wav_16k_mono_pcm_s16le",
      status: "succeeded",
      text_similarity_to_baseline: 1,
      audio_size_ratio_to_baseline: 1,
      total_elapsed_ratio_to_baseline: 1
    },
    {
      variant_id: "mp3_16k_mono_64k",
      status: "succeeded",
      text_similarity_to_baseline: 1,
      audio_size_ratio_to_baseline: 0.25,
      total_elapsed_ratio_to_baseline: 0.6
    },
      {
        variant_id: "mp3_16k_mono_32k",
        status: "succeeded",
      text_similarity_to_baseline: 0.888889,
        audio_size_ratio_to_baseline: 0.125,
        total_elapsed_ratio_to_baseline: 0.5
      },
    {
      variant_id: "m4a_aac_16k_mono_48k",
      status: "failed",
      error_message: "upload failed"
    }
  ]);
});
