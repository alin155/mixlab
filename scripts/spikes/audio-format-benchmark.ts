import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  createFetchDashScopeHttpClient,
  runDashScopeRecordedAudioAsr,
  uploadDashScopeTemporaryFile
} from "../../packages/asr-core/src/index.ts";
import {
  buildFfmpegAudioExtractionPlan,
  resolveFfmpegRuntime
} from "../../packages/ffmpeg-core/src/index.ts";
import { writeAsrTextArtifacts } from "../../packages/library-fs/src/index.ts";
import { redactUrlQueryForLogging } from "../../packages/oss-core/src/index.ts";
import {
  AUDIO_BENCHMARK_BASELINE_VARIANT_ID,
  audioBenchmarkOutputFileName,
  buildAudioBenchmarkComparisons,
  selectAudioBenchmarkVariants,
  type AudioBenchmarkRun,
  type AudioBenchmarkVariant
} from "../../packages/preprocess-core/src/audio-benchmark.ts";

const LIVE_AUDIO_BENCHMARK_ENABLE_FLAG = "MIXLAB_ENABLE_LIVE_AUDIO_FORMAT_BENCHMARK";

await loadProjectEnv();

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEnabled(key: string): boolean {
  return optionalTrimmed(process.env[key]) === "1";
}

function parsePositiveIntegerEnv(key: string, fallback: number): number {
  const raw = optionalTrimmed(process.env[key]);

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return parsed;
}

function parseCommaSeparatedEnv(key: string): string[] | undefined {
  const raw = optionalTrimmed(process.env[key]);

  if (!raw) {
    return undefined;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

async function measure<T>(work: () => Promise<T>): Promise<{ elapsed_ms: number; value: T }> {
  const startedAtMs = Date.now();
  const value = await work();

  return {
    elapsed_ms: Date.now() - startedAtMs,
    value
  };
}

function safeTimestampForFileName(timestamp: string): string {
  return timestamp.replace(/[.:]/g, "-");
}

function safeSourceVideoIdSegment(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
}

function benchmarkSourceVideoId(baseSourceVideoId: string, variant: AudioBenchmarkVariant): string {
  return `${baseSourceVideoId}_${safeSourceVideoIdSegment(variant.id)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const missingRuntimeEnvKeys = [
  "DASHSCOPE_API_KEY",
  "MIXLAB_AUDIO_BENCHMARK_SOURCE_VIDEO_PATH"
].filter((key) => !optionalTrimmed(process.env[key]));
const missingEnableFlags = [
  LIVE_AUDIO_BENCHMARK_ENABLE_FLAG
].filter((key) => !isEnabled(key));

if (!isEnabled(LIVE_AUDIO_BENCHMARK_ENABLE_FLAG)) {
  console.log("Live audio format benchmark skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${LIVE_AUDIO_BENCHMARK_ENABLE_FLAG}=1 is required before any real audio format benchmark`,
        required_enable_flags: [
          LIVE_AUDIO_BENCHMARK_ENABLE_FLAG
        ],
        missing_enable_flags: missingEnableFlags,
        required_env_keys: [
          "DASHSCOPE_API_KEY",
          "MIXLAB_AUDIO_BENCHMARK_SOURCE_VIDEO_PATH"
        ],
        missing_env_keys: missingRuntimeEnvKeys
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (missingRuntimeEnvKeys.length > 0) {
  console.error("Live audio format benchmark is enabled, but readiness checks failed.");
  console.error(
    JSON.stringify(
      {
        missing_enable_flags: missingEnableFlags,
        missing_env_keys: missingRuntimeEnvKeys
      },
      null,
      2
    )
  );
  process.exit(1);
}

const startedAt = new Date().toISOString();
const sourceVideoPath = optionalTrimmed(process.env.MIXLAB_AUDIO_BENCHMARK_SOURCE_VIDEO_PATH) ?? "";
const sourceVideoStat = await stat(sourceVideoPath);

if (!sourceVideoStat.isFile()) {
  throw new Error("MIXLAB_AUDIO_BENCHMARK_SOURCE_VIDEO_PATH must point to a file");
}

const variants = selectAudioBenchmarkVariants(parseCommaSeparatedEnv("MIXLAB_AUDIO_BENCHMARK_VARIANTS"));

if (!variants.some((variant) => variant.id === AUDIO_BENCHMARK_BASELINE_VARIANT_ID)) {
  throw new Error(
    `MIXLAB_AUDIO_BENCHMARK_VARIANTS must include ${AUDIO_BENCHMARK_BASELINE_VARIANT_ID}`
  );
}

const runtime = resolveFfmpegRuntime();
const dashscopeHttp = createFetchDashScopeHttpClient();
const libraryRoot =
  optionalTrimmed(process.env.MIXLAB_AUDIO_BENCHMARK_LIBRARY_ROOT) ??
  (await mkdtemp(path.join(os.tmpdir(), "mixlab-audio-format-benchmark-")));
const baseSourceVideoId =
  optionalTrimmed(process.env.MIXLAB_AUDIO_BENCHMARK_SOURCE_VIDEO_ID) ?? "V_AUDIO_BENCH";
const asrModel = process.env.MIXLAB_ASR_MODEL ?? "paraformer-v2";
const maxPollAttempts = parsePositiveIntegerEnv("MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
const pollIntervalMs = parsePositiveIntegerEnv("MIXLAB_ASR_POLL_INTERVAL_MS", 3000);
const runs: unknown[] = [];
const comparisonRuns: AudioBenchmarkRun[] = [];

console.log("Live audio format benchmark started.");
console.log(
  JSON.stringify(
    {
      source_video_path: sourceVideoPath,
      source_video_size_bytes: sourceVideoStat.size,
      library_root: libraryRoot,
      asr_model: asrModel,
      max_poll_attempts: maxPollAttempts,
      poll_interval_ms: pollIntervalMs,
      variants
    },
    null,
    2
  )
);

let processedCount = 0;

for (const variant of variants) {
  processedCount += 1;
  const sourceVideoId = benchmarkSourceVideoId(baseSourceVideoId, variant);
  const audioPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "videos",
    sourceVideoId,
    "asr-audio",
    audioBenchmarkOutputFileName(variant)
  );
  const totalStartedAtMs = Date.now();

  console.log(`[${processedCount}/${variants.length}] benchmarking ${variant.id}`);

  try {
    await mkdir(path.dirname(audioPath), {
      recursive: true
    });

    const extraction = await measure(async () => {
      const extractionPlan = buildFfmpegAudioExtractionPlan({
        source_path: sourceVideoPath,
        output_path: audioPath,
        output_format: variant.audio_format,
        sample_rate_hz: variant.sample_rate_hz,
        channels: variant.channels,
        audio_bitrate: variant.audio_bitrate
      });

      run(runtime.ffmpeg_path, extractionPlan.args);
    });
    const audioStat = await stat(audioPath);
    const upload = await measure(async () =>
      uploadDashScopeTemporaryFile({
        api_key: process.env.DASHSCOPE_API_KEY ?? "",
        model: asrModel,
        local_file_path: audioPath,
        http: dashscopeHttp
      })
    );
    const asr = await measure(async () =>
      runDashScopeRecordedAudioAsr({
        api_key: process.env.DASHSCOPE_API_KEY ?? "",
        model: asrModel,
        source_video_id: sourceVideoId,
        file_url: upload.value.file_url,
        generated_at: new Date().toISOString(),
        max_poll_attempts: maxPollAttempts,
        poll_interval_ms: pollIntervalMs,
        http: dashscopeHttp,
        parameters: {
          channel_id: [0],
          language_hints: ["zh", "en"],
          diarization_enabled: false
        }
      })
    );
    const textArtifactPaths = await writeAsrTextArtifacts({
      library_root: libraryRoot,
      source_video_id: sourceVideoId,
      transcript_artifact: asr.value.transcript,
      srt: asr.value.srt
    });
    const totalElapsedMs = Date.now() - totalStartedAtMs;

    runs.push({
      status: "succeeded",
      variant,
      source_video_id: sourceVideoId,
      audio_path: path.relative(libraryRoot, audioPath),
      audio_size_bytes: audioStat.size,
      extraction_elapsed_ms: extraction.elapsed_ms,
      upload_elapsed_ms: upload.elapsed_ms,
      asr_elapsed_ms: asr.elapsed_ms,
      total_elapsed_ms: totalElapsedMs,
      audio_object_key: upload.value.object_key,
      audio_file_url: redactUrlQueryForLogging(upload.value.file_url),
      asr_task_id: asr.value.task_id,
      transcription_url: redactUrlQueryForLogging(asr.value.transcription_url),
      transcript_path: textArtifactPaths.transcript_path,
      srt_path: textArtifactPaths.srt_path,
      duration_ms: asr.value.transcript.duration_ms,
      segment_count: asr.value.transcript.segments.length,
      full_text_length: asr.value.transcript.full_text.length
    });
    comparisonRuns.push({
      status: "succeeded",
      variant_id: variant.id,
      audio_size_bytes: audioStat.size,
      total_elapsed_ms: totalElapsedMs,
      full_text: asr.value.transcript.full_text
    });
  } catch (error) {
    const message = errorMessage(error);

    runs.push({
      status: "failed",
      variant,
      source_video_id: sourceVideoId,
      total_elapsed_ms: Date.now() - totalStartedAtMs,
      error_message: message
    });
    comparisonRuns.push({
      status: "failed",
      variant_id: variant.id,
      error_message: message
    });
  }
}

const finishedAt = new Date().toISOString();
let comparisons: unknown[] = [];
let comparisonError: string | undefined;

try {
  comparisons = buildAudioBenchmarkComparisons({
    baseline_variant_id: AUDIO_BENCHMARK_BASELINE_VARIANT_ID,
    runs: comparisonRuns
  });
} catch (error) {
  comparisonError = errorMessage(error);
}

const summary = {
  started_at: startedAt,
  finished_at: finishedAt,
  source_video_path: sourceVideoPath,
  source_video_size_bytes: sourceVideoStat.size,
  library_root: libraryRoot,
  baseline_variant_id: AUDIO_BENCHMARK_BASELINE_VARIANT_ID,
  runs,
  comparisons,
  ...(comparisonError ? { comparison_error: comparisonError } : {})
};
const summaryPath = path.join(
  libraryRoot,
  ".mixlab-library",
  "audio-format-benchmarks",
  `${safeTimestampForFileName(startedAt)}.json`
);

await mkdir(path.dirname(summaryPath), {
  recursive: true
});
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log("Live audio format benchmark completed.");
console.log(
  JSON.stringify(
    {
      summary_path: summaryPath,
      ...summary
    },
    null,
    2
  )
);

if (comparisonRuns.some((run) => run.status === "failed")) {
  process.exitCode = 1;
}
