import {
  buildDashScopeSubmitTranscriptionRequest,
  redactDashScopeRequest
} from "../../packages/asr-core/src/index.ts";
import { loadProjectEnv } from "../shared/load-project-env.ts";

await loadProjectEnv();

const apiKey = process.env.DASHSCOPE_API_KEY ?? "sk-local-placeholder";
const fileUrl =
  process.env.MIXLAB_ASR_AUDIO_URL ??
  "https://example.com/audio/replace-with-public-or-oss-url.wav";
const model = process.env.MIXLAB_ASR_MODEL ?? "paraformer-v2";

const request = buildDashScopeSubmitTranscriptionRequest({
  api_key: apiKey,
  file_urls: [fileUrl],
  model,
  parameters: {
    channel_id: [0],
    language_hints: ["zh", "en"],
    diarization_enabled: false
  }
});

console.log(JSON.stringify(redactDashScopeRequest(request), null, 2));
console.log("\nDry run only. Set DASHSCOPE_API_KEY and MIXLAB_ASR_AUDIO_URL to submit in a later integration step.");
