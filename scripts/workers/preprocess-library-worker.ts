import { spawnSync } from "node:child_process";
import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  createDashScopeTemporaryFileAudioUploader,
  createFetchDashScopeHttpClient
} from "../../packages/asr-core/src/index.ts";
import {
  buildFfprobeSourceMetadataPlan,
  parseFfprobeSourceMetadata,
  resolveFfmpegRuntime
} from "../../packages/ffmpeg-core/src/index.ts";
import { getFileIdentity, type FileIdentityMode } from "../../packages/library-fs/src/index.ts";
import { redactUrlQueryForLogging } from "../../packages/oss-core/src/index.ts";
import {
  resolvePreprocessAudioMode,
  type PreprocessAudioMode
} from "../../packages/preprocess-core/src/audio-mode.ts";
import {
  runLibraryTextPreprocessWorker,
  runSourceVideoTextPreprocess,
  type RunLibraryTextPreprocessWorkerResult
} from "../../packages/preprocess-core/src/index.ts";

const ENABLE_FLAG = "MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER";

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

  const parsed = Number.parseInt(raw, 10);

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

function parseFileIdentityMode(): FileIdentityMode {
  const mode = optionalTrimmed(process.env.MIXLAB_PREPROCESS_FILE_IDENTITY_MODE) ?? "stat";

  if (mode !== "stat" && mode !== "sha256") {
    throw new Error("MIXLAB_PREPROCESS_FILE_IDENTITY_MODE must be stat or sha256");
  }

  return mode;
}

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

function runForStdout(executable: string, args: string[]): string {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }

  return result.stdout;
}

function redactWorkerResult(
  result: RunLibraryTextPreprocessWorkerResult
): RunLibraryTextPreprocessWorkerResult {
  return {
    ...result,
    items: result.items.map((item) => {
      if (item.status === "failed") {
        return item;
      }

      return {
        ...item,
        result: {
          ...item.result,
          audio_file_url: redactUrlQueryForLogging(item.result.audio_file_url),
          transcription_url: redactUrlQueryForLogging(item.result.transcription_url)
        }
      };
    })
  };
}

const missingRuntimeEnvKeys = [
  "DASHSCOPE_API_KEY",
  "MIXLAB_PREPROCESS_LIBRARY_ROOT"
].filter((key) => !optionalTrimmed(process.env[key]));

if (!isEnabled(ENABLE_FLAG)) {
  console.log("Library preprocessing worker skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${ENABLE_FLAG}=1 is required before any real library preprocessing run`,
        required_enable_flags: [ENABLE_FLAG],
        missing_enable_flags: [ENABLE_FLAG].filter((key) => !isEnabled(key)),
        required_env_keys: ["DASHSCOPE_API_KEY", "MIXLAB_PREPROCESS_LIBRARY_ROOT"],
        missing_env_keys: missingRuntimeEnvKeys
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (missingRuntimeEnvKeys.length > 0) {
  console.error("Library preprocessing worker is enabled, but readiness checks failed.");
  console.error(
    JSON.stringify(
      {
        missing_env_keys: missingRuntimeEnvKeys
      },
      null,
      2
    )
  );
  process.exit(1);
}

const startedAt = new Date().toISOString();
const runtime = resolveFfmpegRuntime();
const dashscopeHttp = createFetchDashScopeHttpClient();
const libraryRoot = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ROOT) ?? "";
const libraryId = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ID) ?? "lib_main_001";
const libraryName = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_NAME) ?? "主素材库";
const workerId =
  optionalTrimmed(process.env.MIXLAB_PREPROCESS_WORKER_ID) ?? `worker-${process.pid}`;
const audioMode = parsePreprocessAudioMode();
const fileIdentityMode = parseFileIdentityMode();
const limit = parsePositiveIntegerEnv("MIXLAB_PREPROCESS_WORKER_LIMIT");
const maxPollAttempts = parsePositiveIntegerEnvWithDefault("MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
const pollIntervalMs = parsePositiveIntegerEnvWithDefault("MIXLAB_ASR_POLL_INTERVAL_MS", 3000);
const asrModel = optionalTrimmed(process.env.MIXLAB_ASR_MODEL) ?? "paraformer-v2";
const uploader = createDashScopeTemporaryFileAudioUploader({
  api_key: process.env.DASHSCOPE_API_KEY ?? "",
  model: asrModel,
  http: dashscopeHttp
});

console.log("Library preprocessing worker started.");
console.log(
  JSON.stringify(
    {
      library_root: libraryRoot,
      library_id: libraryId,
      library_name: libraryName,
      worker_id: workerId,
      limit: limit ?? null,
      audio_mode: audioMode.id,
      file_identity_mode: fileIdentityMode,
      asr_model: asrModel,
      max_poll_attempts: maxPollAttempts,
      poll_interval_ms: pollIntervalMs
    },
    null,
    2
  )
);

const result = await runLibraryTextPreprocessWorker({
  library_root: libraryRoot,
  library_id: libraryId,
  library_name: libraryName,
  worker_id: workerId,
  ...(limit ? { limit } : {}),
  audio_mode: audioMode.id,
  async probe_source_video(input) {
    const plan = buildFfprobeSourceMetadataPlan({
      source_path: input.source_video_path
    });

    return parseFfprobeSourceMetadata(runForStdout(runtime.ffprobe_path, plan.args));
  },
  async get_content_hash(sourceVideoPath) {
    return getFileIdentity(sourceVideoPath, fileIdentityMode);
  },
  async preprocess_source_video(input) {
    return runSourceVideoTextPreprocess({
      library_root: input.library_root,
      library_id: input.library_id,
      source_video_id: input.source_video_id,
      source_video_path: input.source_video_path,
      ffmpeg_path: runtime.ffmpeg_path,
      audio_mode: input.audio_mode,
      now: input.now,
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

console.log("Library preprocessing worker completed.");
console.log(
  JSON.stringify(
    {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      result: redactWorkerResult(result)
    },
    null,
    2
  )
);

if (result.failed_count > 0) {
  process.exitCode = 1;
}
