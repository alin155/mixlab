import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashScopeGetTemporaryUploadPolicyRequest,
  buildLiveDashScopeAsrReadinessReport,
  buildDashScopeQueryTaskRequest,
  buildDashScopeSubmitTranscriptionRequest,
  isLiveDashScopeAsrEnabled,
  redactDashScopeRequest,
  validateDashScopeFileUrls
} from "./index.ts";

test("builds DashScope temporary upload policy request for the selected model", () => {
  assert.deepEqual(
    buildDashScopeGetTemporaryUploadPolicyRequest({
      api_key: "sk-test-secret",
      model: "paraformer-v2"
    }),
    {
      url: "https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=paraformer-v2",
      method: "GET",
      headers: {
        Authorization: "Bearer sk-test-secret",
        "Content-Type": "application/json"
      }
    }
  );
});

test("builds DashScope Paraformer v2 submit request without hardcoding secrets", () => {
  const request = buildDashScopeSubmitTranscriptionRequest({
    api_key: "sk-test-secret",
    file_urls: ["https://example.com/audio/%E7%8E%B0%E9%87%91%E6%B5%81.wav"],
    model: "paraformer-v2",
    parameters: {
      channel_id: [0],
      language_hints: ["zh", "en"],
      diarization_enabled: false
    }
  });

  assert.deepEqual(request, {
    url: "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription",
    method: "POST",
    headers: {
      Authorization: "Bearer sk-test-secret",
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable"
    },
    body: {
      model: "paraformer-v2",
      input: {
        file_urls: ["https://example.com/audio/%E7%8E%B0%E9%87%91%E6%B5%81.wav"]
      },
      parameters: {
        channel_id: [0],
        language_hints: ["zh", "en"],
        diarization_enabled: false
      }
    }
  });
});

test("adds OSS resource resolution header when submitting DashScope temporary oss URLs", () => {
  const request = buildDashScopeSubmitTranscriptionRequest({
    api_key: "sk-test-secret",
    file_urls: ["oss://dashscope-instant/xxx/audio.mp3"],
    model: "paraformer-v2"
  });

  assert.equal(request.headers["X-DashScope-OssResourceResolve"], "enable");
});

test("builds DashScope task polling request", () => {
  assert.deepEqual(
    buildDashScopeQueryTaskRequest({
      api_key: "sk-test-secret",
      task_id: "task-123"
    }),
    {
      url: "https://dashscope.aliyuncs.com/api/v1/tasks/task-123",
      method: "POST",
      headers: {
        Authorization: "Bearer sk-test-secret"
      }
    }
  );
});

test("validates DashScope file URL constraints", () => {
  assert.deepEqual(
    validateDashScopeFileUrls([
      "https://example.com/audio.wav",
      "oss://bucket/path/audio.wav"
    ]),
    {
      ok: true,
      errors: []
    }
  );

  assert.deepEqual(validateDashScopeFileUrls(["/local/audio.wav"]), {
    ok: false,
    errors: ["file_urls[0] must be http(s) or oss:// URL; local files must be uploaded first"]
  });
});

test("rejects more than 100 file URLs", () => {
  const urls = Array.from({ length: 101 }, (_, index) => `https://example.com/${index}.wav`);

  assert.deepEqual(validateDashScopeFileUrls(urls), {
    ok: false,
    errors: ["file_urls supports at most 100 URLs per request"]
  });
});

test("redacts Authorization headers before logging", () => {
  const request = buildDashScopeSubmitTranscriptionRequest({
    api_key: "sk-test-secret",
    file_urls: ["https://example.com/audio.wav"],
    model: "paraformer-v2"
  });

  assert.equal(redactDashScopeRequest(request).headers.Authorization, "Bearer ***");
});

test("keeps live DashScope ASR disabled unless explicitly enabled with 1", () => {
  assert.equal(isLiveDashScopeAsrEnabled({}), false);
  assert.equal(
    isLiveDashScopeAsrEnabled({
      MIXLAB_ENABLE_LIVE_ASR: "true"
    }),
    false
  );
  assert.equal(
    isLiveDashScopeAsrEnabled({
      MIXLAB_ENABLE_LIVE_ASR: " 1 "
    }),
    true
  );
});

test("reports live DashScope ASR readiness without exposing secrets", () => {
  assert.deepEqual(
    buildLiveDashScopeAsrReadinessReport({
      MIXLAB_ENABLE_LIVE_ASR: "1",
      DASHSCOPE_API_KEY: "sk-test-secret",
      MIXLAB_ASR_AUDIO_URL: "/local/audio.mp3"
    }),
    {
      enabled: true,
      enable_flag: "MIXLAB_ENABLE_LIVE_ASR",
      required_env_keys: ["DASHSCOPE_API_KEY", "MIXLAB_ASR_AUDIO_URL"],
      missing_env_keys: [],
      audio_url_errors: [
        "file_urls[0] must be http(s) or oss:// URL; local files must be uploaded first"
      ]
    }
  );
});
