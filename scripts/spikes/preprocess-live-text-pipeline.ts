import { spawnSync } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
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
  runSourceVideoTextPreprocess
} from "../../packages/preprocess-core/src/index.ts";

const LIVE_PREPROCESS_ENABLE_FLAG = "MIXLAB_ENABLE_LIVE_PREPROCESS";

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

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return parsed;
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

function run(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

const missingRuntimeEnvKeys = [
  "DASHSCOPE_API_KEY",
  "MIXLAB_PREPROCESS_SOURCE_VIDEO_PATH"
].filter((key) => !optionalTrimmed(process.env[key]));
const missingEnableFlags = [
  LIVE_PREPROCESS_ENABLE_FLAG
].filter((key) => !isEnabled(key));

if (!isEnabled(LIVE_PREPROCESS_ENABLE_FLAG)) {
  console.log("Live text preprocessing skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${LIVE_PREPROCESS_ENABLE_FLAG}=1 is required before any real preprocessing run`,
        required_enable_flags: [
          LIVE_PREPROCESS_ENABLE_FLAG
        ],
        missing_enable_flags: missingEnableFlags,
        required_env_keys: [
          "DASHSCOPE_API_KEY",
          "MIXLAB_PREPROCESS_SOURCE_VIDEO_PATH"
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
  console.error("Live text preprocessing is enabled, but readiness checks failed.");
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

const sourceVideoPath = optionalTrimmed(process.env.MIXLAB_PREPROCESS_SOURCE_VIDEO_PATH) ?? "";
await stat(sourceVideoPath);

const runtime = resolveFfmpegRuntime();
const dashscopeHttp = createFetchDashScopeHttpClient();
const libraryRoot =
  optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ROOT) ??
  (await mkdtemp(path.join(os.tmpdir(), "mixlab-live-preprocess-")));
const sourceVideoId = optionalTrimmed(process.env.MIXLAB_PREPROCESS_SOURCE_VIDEO_ID) ?? "V_LIVE_CHECK";
const libraryId = optionalTrimmed(process.env.MIXLAB_PREPROCESS_LIBRARY_ID) ?? "lib_main_001";
const audioMode = parsePreprocessAudioMode();
const maxPollAttempts = parsePositiveIntegerEnv("MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
const pollIntervalMs = parsePositiveIntegerEnv("MIXLAB_ASR_POLL_INTERVAL_MS", 3000);
const result = await runSourceVideoTextPreprocess({
  library_root: libraryRoot,
  library_id: libraryId,
  source_video_id: sourceVideoId,
  source_video_path: sourceVideoPath,
  ffmpeg_path: runtime.ffmpeg_path,
  audio_mode: audioMode.id,
  now: new Date().toISOString(),
  command_runner: {
    async run(executable, args) {
      run(executable, args);
    }
  },
  uploader: createDashScopeTemporaryFileAudioUploader({
    api_key: process.env.DASHSCOPE_API_KEY ?? "",
    model: process.env.MIXLAB_ASR_MODEL ?? "paraformer-v2",
    http: dashscopeHttp
  }),
  asr_http: dashscopeHttp,
  asr: {
    api_key: process.env.DASHSCOPE_API_KEY ?? "",
    model: process.env.MIXLAB_ASR_MODEL ?? "paraformer-v2",
    max_poll_attempts: maxPollAttempts,
    poll_interval_ms: pollIntervalMs,
    parameters: {
      channel_id: [0],
      language_hints: ["zh", "en"],
      diarization_enabled: false
    }
  }
});

console.log("Live text preprocessing completed.");
console.log(
  JSON.stringify(
    {
      library_root: libraryRoot,
      result: {
        ...result,
        transcription_url: redactUrlQueryForLogging(result.transcription_url)
      }
    },
    null,
    2
  )
);
