import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  createDashScopeTemporaryFileAudioUploader,
  createFetchDashScopeHttpClient
} from "../../packages/asr-core/src/index.ts";
import { resolveFfmpegRuntime } from "../../packages/ffmpeg-core/src/index.ts";
import { redactUrlQueryForLogging } from "../../packages/oss-core/src/index.ts";
import {
  resolvePreprocessAudioMode,
  type PreprocessAudioMode
} from "../../packages/preprocess-core/src/audio-mode.ts";
import {
  buildPreprocessBatchPlan,
  runSourceVideoTextPreprocessBatch
} from "../../packages/preprocess-core/src/batch.ts";
import {
  runSourceVideoTextPreprocess,
  type SourceVideoTextPreprocessResult
} from "../../packages/preprocess-core/src/index.ts";

const LIVE_PREPROCESS_BATCH_ENABLE_FLAG = "MIXLAB_ENABLE_LIVE_PREPROCESS_BATCH";

await loadProjectEnv();

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEnabled(key: string): boolean {
  return optionalTrimmed(process.env[key]) === "1";
}

function parsePositiveIntegerEnv(key: string): number | undefined {
  const raw = optionalTrimmed(process.env[key]);

  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return parsed;
}

function parsePositiveIntegerEnvWithDefault(key: string, fallback: number): number {
  return parsePositiveIntegerEnv(key) ?? fallback;
}

function legacyAudioFormatModeId(format: string): string | undefined {
  if (format === "mp3") {
    return "mp3_16k_mono_64k";
  }

  if (format === "wav") {
    return "wav_16k_mono_pcm_s16le";
  }

  return undefined;
}

function parsePreprocessAudioMode(): PreprocessAudioMode {
  const modeId = optionalTrimmed(process.env.MIXLAB_PREPROCESS_AUDIO_MODE);

  if (modeId) {
    return resolvePreprocessAudioMode(modeId);
  }

  const legacyFormat = optionalTrimmed(process.env.MIXLAB_PREPROCESS_AUDIO_FORMAT);

  if (legacyFormat) {
    const legacyModeId = legacyAudioFormatModeId(legacyFormat);

    if (!legacyModeId) {
      throw new Error("MIXLAB_PREPROCESS_AUDIO_FORMAT must be mp3 or wav");
    }

    return resolvePreprocessAudioMode(legacyModeId);
  }

  return resolvePreprocessAudioMode();
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

async function listFilesRecursively(root: string): Promise<string[]> {
  const entries = await readdir(root, {
    withFileTypes: true
  });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function redactPreprocessResult(
  result: SourceVideoTextPreprocessResult
): SourceVideoTextPreprocessResult {
  return {
    ...result,
    audio_file_url: redactUrlQueryForLogging(result.audio_file_url),
    transcription_url: redactUrlQueryForLogging(result.transcription_url)
  };
}

function safeTimestampForFileName(timestamp: string): string {
  return timestamp.replace(/[.:]/g, "-");
}

const missingRuntimeEnvKeys = [
  "DASHSCOPE_API_KEY",
  "MIXLAB_PREPROCESS_SOURCE_DIR"
].filter((key) => !optionalTrimmed(process.env[key]));
const missingEnableFlags = [
  LIVE_PREPROCESS_BATCH_ENABLE_FLAG
].filter((key) => !isEnabled(key));

if (!isEnabled(LIVE_PREPROCESS_BATCH_ENABLE_FLAG)) {
  console.log("Live batch text preprocessing skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${LIVE_PREPROCESS_BATCH_ENABLE_FLAG}=1 is required before any real batch preprocessing run`,
        required_enable_flags: [
          LIVE_PREPROCESS_BATCH_ENABLE_FLAG
        ],
        missing_enable_flags: missingEnableFlags,
        required_env_keys: [
          "DASHSCOPE_API_KEY",
          "MIXLAB_PREPROCESS_SOURCE_DIR"
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
  console.error("Live batch text preprocessing is enabled, but readiness checks failed.");
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
const sourceDir = optionalTrimmed(process.env.MIXLAB_PREPROCESS_SOURCE_DIR) ?? "";
const sourceDirStat = await stat(sourceDir);

if (!sourceDirStat.isDirectory()) {
  throw new Error("MIXLAB_PREPROCESS_SOURCE_DIR must point to a directory");
}

const sourceFilePaths = await listFilesRecursively(sourceDir);
const plan = buildPreprocessBatchPlan({
  source_file_paths: sourceFilePaths,
  source_video_id_prefix:
    optionalTrimmed(process.env.MIXLAB_PREPROCESS_BATCH_ID_PREFIX) ?? "V_LIVE_BATCH",
  file_names: parseCommaSeparatedEnv("MIXLAB_PREPROCESS_BATCH_FILE_NAMES"),
  limit: parsePositiveIntegerEnv("MIXLAB_PREPROCESS_BATCH_LIMIT")
});
const runtime = resolveFfmpegRuntime();
const dashscopeHttp = createFetchDashScopeHttpClient();
const libraryRoot =
  optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ROOT) ??
  (await mkdtemp(path.join(os.tmpdir(), "mixlab-live-preprocess-batch-")));
const libraryId = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ID) ?? "lib_main_001";
const audioMode = parsePreprocessAudioMode();
const maxPollAttempts = parsePositiveIntegerEnvWithDefault("MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
const pollIntervalMs = parsePositiveIntegerEnvWithDefault("MIXLAB_ASR_POLL_INTERVAL_MS", 3000);
const asrModel = process.env.MIXLAB_ASR_MODEL ?? "paraformer-v2";
const uploader = createDashScopeTemporaryFileAudioUploader({
  api_key: process.env.DASHSCOPE_API_KEY ?? "",
  model: asrModel,
  http: dashscopeHttp
});

console.log("Live batch text preprocessing started.");
console.log(
  JSON.stringify(
    {
      source_dir: sourceDir,
      library_root: libraryRoot,
      discovered_file_count: sourceFilePaths.length,
      planned_count: plan.length,
      audio_mode: audioMode.id,
      asr_model: asrModel,
      max_poll_attempts: maxPollAttempts,
      poll_interval_ms: pollIntervalMs,
      plan
    },
    null,
    2
  )
);

let processedCount = 0;
const batchResult = await runSourceVideoTextPreprocessBatch({
  plan,
  async process_item(item) {
    processedCount += 1;
    console.log(
      `[${processedCount}/${plan.length}] preprocessing ${item.file_name} as ${item.source_video_id}`
    );

    return runSourceVideoTextPreprocess({
      library_root: libraryRoot,
      library_id: libraryId,
      source_video_id: item.source_video_id,
      source_video_path: item.source_video_path,
      ffmpeg_path: runtime.ffmpeg_path,
      audio_mode: audioMode.id,
      now: new Date().toISOString(),
      command_runner: {
        async run(executable, args) {
          run(executable, args);
        }
      },
      uploader,
      asr_http: dashscopeHttp,
      asr: {
        api_key: process.env.DASHSCOPE_API_KEY ?? "",
        model: asrModel,
        max_poll_attempts: maxPollAttempts,
        poll_interval_ms: pollIntervalMs,
        parameters: {
          channel_id: [0],
          language_hints: ["zh", "en"],
          diarization_enabled: false
        }
      }
    });
  }
});
const finishedAt = new Date().toISOString();
const redactedBatchResult = {
  ...batchResult,
  items: batchResult.items.map((item) =>
    item.status === "succeeded"
      ? {
          ...item,
          result: redactPreprocessResult(item.result)
        }
      : item
  )
};
const summary = {
  started_at: startedAt,
  finished_at: finishedAt,
  source_dir: sourceDir,
  library_root: libraryRoot,
  result: redactedBatchResult
};
const summaryPath = path.join(
  libraryRoot,
  ".mixlab-library",
  "preprocess-runs",
  `${safeTimestampForFileName(startedAt)}.json`
);

await mkdir(path.dirname(summaryPath), {
  recursive: true
});
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log("Live batch text preprocessing completed.");
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

if (batchResult.failed_count > 0) {
  process.exitCode = 1;
}
