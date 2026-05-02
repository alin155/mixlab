import {
  buildLiveDashScopeAsrReadinessReport,
  createFetchDashScopeHttpClient,
  runDashScopeRecordedAudioAsr
} from "../../packages/asr-core/src/index.ts";
import { redactUrlQueryForLogging } from "../../packages/oss-core/src/index.ts";
import { loadProjectEnv } from "../shared/load-project-env.ts";

await loadProjectEnv();

function parsePositiveIntegerEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return parsed;
}

const readiness = buildLiveDashScopeAsrReadinessReport(process.env);

if (!readiness.enabled) {
  console.log("Live DashScope ASR skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${readiness.enable_flag}=1 is required before any real ASR task`,
        required_env_keys: readiness.required_env_keys,
        missing_env_keys: readiness.missing_env_keys,
        audio_url_errors: readiness.audio_url_errors
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (readiness.missing_env_keys.length > 0 || readiness.audio_url_errors.length > 0) {
  console.error("Live DashScope ASR is enabled, but runtime readiness checks failed.");
  console.error(JSON.stringify(readiness, null, 2));
  process.exit(1);
}

const apiKey = process.env.DASHSCOPE_API_KEY ?? "";
const fileUrl = process.env.MIXLAB_ASR_AUDIO_URL ?? "";
const model = process.env.MIXLAB_ASR_MODEL ?? "paraformer-v2";
const sourceVideoId = process.env.MIXLAB_ASR_SOURCE_VIDEO_ID ?? "V_LIVE_CHECK";
const maxPollAttempts = parsePositiveIntegerEnv("MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
const pollIntervalMs = parsePositiveIntegerEnv("MIXLAB_ASR_POLL_INTERVAL_MS", 3000);
const result = await runDashScopeRecordedAudioAsr({
  api_key: apiKey,
  model,
  source_video_id: sourceVideoId,
  file_url: fileUrl,
  generated_at: new Date().toISOString(),
  max_poll_attempts: maxPollAttempts,
  poll_interval_ms: pollIntervalMs,
  parameters: {
    channel_id: [0],
    language_hints: ["zh", "en"],
    diarization_enabled: false
  },
  http: createFetchDashScopeHttpClient()
});

console.log("Live DashScope ASR completed.");
console.log(
  JSON.stringify(
    {
      input: {
        model,
        source_video_id: sourceVideoId,
        file_url: redactUrlQueryForLogging(fileUrl),
        max_poll_attempts: maxPollAttempts,
        poll_interval_ms: pollIntervalMs
      },
      result: {
        task_id: result.task_id,
        transcription_url: redactUrlQueryForLogging(result.transcription_url),
        duration_ms: result.transcript.duration_ms,
        segment_count: result.transcript.segments.length,
        text_preview: result.transcript.full_text.slice(0, 120)
      }
    },
    null,
    2
  )
);
