import assert from "node:assert/strict";
import test from "node:test";
import {
  createDashScopeTemporaryFileAudioUploader,
  createFetchDashScopeHttpClient,
  DASHSCOPE_TASK_URL_PREFIX,
  DASHSCOPE_TRANSCRIPTION_URL,
  uploadDashScopeTemporaryFile,
  runDashScopeRecordedAudioAsr,
  type DashScopeRequest
} from "./index.ts";

const transcriptionResult = {
  properties: {
    original_duration_in_milliseconds: 3_000
  },
  transcripts: [
    {
      text: "现金流，是企业的血液。",
      sentences: [
        {
          begin_time: 0,
          end_time: 3_000,
          text: "现金流，是企业的血液。"
        }
      ]
    }
  ]
};

test("uploads local audio through DashScope temporary storage and returns an oss URL", async () => {
  const requests: DashScopeRequest[] = [];
  const uploads: unknown[] = [];

  const uploaded = await uploadDashScopeTemporaryFile({
    api_key: "sk-test-secret",
    model: "paraformer-v2",
    local_file_path: "/tmp/audio.mp3",
    file_name: "audio.mp3",
    http: {
      async requestJson(request) {
        requests.push(request);
        return {
          data: {
            upload_dir: "dashscope-instant/2026-05-02/abc",
            upload_host: "https://dashscope-instant.oss-cn-beijing.aliyuncs.com",
            oss_access_key_id: "sts-ak",
            policy: "encoded-policy",
            signature: "signed-policy",
            x_oss_object_acl: "private",
            x_oss_forbid_overwrite: "true"
          }
        };
      },
      async getJson() {
        throw new Error("temporary upload should not download JSON");
      },
      async uploadFile(uploadRequest) {
        uploads.push(uploadRequest);
      }
    }
  });

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=paraformer-v2"
    ]
  );
  assert.deepEqual(uploads, [
    {
      url: "https://dashscope-instant.oss-cn-beijing.aliyuncs.com",
      file_path: "/tmp/audio.mp3",
      file_name: "audio.mp3",
      fields: {
        key: "dashscope-instant/2026-05-02/abc/audio.mp3",
        OSSAccessKeyId: "sts-ak",
        policy: "encoded-policy",
        Signature: "signed-policy",
        "x-oss-object-acl": "private",
        "x-oss-forbid-overwrite": "true",
        success_action_status: "200"
      }
    }
  ]);
  assert.deepEqual(uploaded, {
    object_key: "dashscope-instant/2026-05-02/abc/audio.mp3",
    file_url: "oss://dashscope-instant/2026-05-02/abc/audio.mp3",
    url_mode: "dashscope-temporary-oss"
  });
});

test("creates a preprocess-compatible DashScope temporary audio uploader", async () => {
  const uploaded = await createDashScopeTemporaryFileAudioUploader({
    api_key: "sk-test-secret",
    model: "paraformer-v2",
    http: {
      async requestJson() {
        return {
          data: {
            upload_dir: "dashscope-instant/dir",
            upload_host: "https://dashscope-instant.oss-cn-beijing.aliyuncs.com",
            oss_access_key_id: "sts-ak",
            policy: "encoded-policy",
            signature: "signed-policy"
          }
        };
      },
      async getJson() {
        throw new Error("temporary upload should not download JSON");
      },
      async uploadFile() {}
    }
  }).uploadAsrAudio({
    local_file_path: "/tmp/extracted-audio.mp3"
  });

  assert.deepEqual(uploaded, {
    object_key: "dashscope-instant/dir/extracted-audio.mp3",
    file_url: "oss://dashscope-instant/dir/extracted-audio.mp3",
    url_mode: "dashscope-temporary-oss"
  });
});

test("submits, polls, downloads and converts a DashScope ASR job", async () => {
  const requests: DashScopeRequest[] = [];
  const downloadedUrls: string[] = [];
  let queryCount = 0;

  const result = await runDashScopeRecordedAudioAsr({
    api_key: "sk-test-secret",
    model: "paraformer-v2",
    source_video_id: "V000001",
    file_url: "https://example.com/audio.mp3",
    generated_at: "2026-05-02T00:00:00Z",
    max_poll_attempts: 3,
    http: {
      async requestJson(request) {
        requests.push(request);

        if (request.url === DASHSCOPE_TRANSCRIPTION_URL) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        queryCount += 1;

        if (queryCount === 1) {
          return {
            output: {
              task_status: "RUNNING"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                file_url: "https://example.com/audio.mp3",
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson(url) {
        downloadedUrls.push(url);
        return transcriptionResult;
      }
    }
  });

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      DASHSCOPE_TRANSCRIPTION_URL,
      `${DASHSCOPE_TASK_URL_PREFIX}/task-123`,
      `${DASHSCOPE_TASK_URL_PREFIX}/task-123`
    ]
  );
  assert.deepEqual(downloadedUrls, ["https://example.com/transcription.json"]);
  assert.equal(result.task_id, "task-123");
  assert.equal(result.transcription_url, "https://example.com/transcription.json");
  assert.equal(result.transcript.source_video_id, "V000001");
  assert.equal(result.transcript.segments[0]?.text, "现金流，是企业的血液。");
  assert.match(result.srt, /00:00:00,000 --> 00:00:03,000/);
});

test("waits between pending poll attempts when a poll interval is configured", async () => {
  const sleeps: number[] = [];
  let queryCount = 0;

  const result = await runDashScopeRecordedAudioAsr({
    api_key: "sk-test-secret",
    model: "paraformer-v2",
    source_video_id: "V000001",
    file_url: "https://example.com/audio.mp3",
    generated_at: "2026-05-02T00:00:00Z",
    max_poll_attempts: 3,
    poll_interval_ms: 1500,
    async sleep(milliseconds) {
      sleeps.push(milliseconds);
    },
    http: {
      async requestJson(request) {
        if (request.url === DASHSCOPE_TRANSCRIPTION_URL) {
          return {
            output: {
              task_id: "task-123"
            }
          };
        }

        queryCount += 1;

        if (queryCount === 1) {
          return {
            output: {
              task_status: "RUNNING"
            }
          };
        }

        return {
          output: {
            task_status: "SUCCEEDED",
            results: [
              {
                transcription_url: "https://example.com/transcription.json"
              }
            ]
          }
        };
      },
      async getJson() {
        return transcriptionResult;
      }
    }
  });

  assert.deepEqual(sleeps, [1500]);
  assert.equal(result.task_id, "task-123");
});

test("rejects invalid poll intervals", async () => {
  await assert.rejects(
    () =>
      runDashScopeRecordedAudioAsr({
        api_key: "sk-test-secret",
        model: "paraformer-v2",
        source_video_id: "V000001",
        file_url: "https://example.com/audio.mp3",
        generated_at: "2026-05-02T00:00:00Z",
        poll_interval_ms: -1,
        http: {
          async requestJson() {
            return {};
          },
          async getJson() {
            return {};
          }
        }
      }),
    /poll_interval_ms must be greater than or equal to 0/
  );
});

test("fails fast when DashScope returns a failed task status", async () => {
  await assert.rejects(
    () =>
      runDashScopeRecordedAudioAsr({
        api_key: "sk-test-secret",
        model: "paraformer-v2",
        source_video_id: "V000001",
        file_url: "https://example.com/audio.mp3",
        generated_at: "2026-05-02T00:00:00Z",
        http: {
          async requestJson(request) {
            if (request.url === DASHSCOPE_TRANSCRIPTION_URL) {
              return {
                output: {
                  task_id: "task-123"
                }
              };
            }

            return {
              output: {
                task_status: "FAILED",
                message: "audio url is invalid"
              }
            };
          },
          async getJson() {
            throw new Error("should not download failed task result");
          }
        }
      }),
    /DashScope ASR task task-123 failed: audio url is invalid/
  );
});

test("rejects completed tasks without a transcription URL", async () => {
  await assert.rejects(
    () =>
      runDashScopeRecordedAudioAsr({
        api_key: "sk-test-secret",
        model: "paraformer-v2",
        source_video_id: "V000001",
        file_url: "https://example.com/audio.mp3",
        generated_at: "2026-05-02T00:00:00Z",
        http: {
          async requestJson(request) {
            if (request.url === DASHSCOPE_TRANSCRIPTION_URL) {
              return {
                output: {
                  task_id: "task-123"
                }
              };
            }

            return {
              output: {
                task_status: "SUCCEEDED",
                results: [{}]
              }
            };
          },
          async getJson() {
            throw new Error("should not download without a transcription URL");
          }
        }
      }),
    /DashScope ASR task task-123 completed without transcription_url/
  );
});

test("creates a fetch-backed DashScope HTTP client", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createFetchDashScopeHttpClient(async (url, init) => {
    calls.push({ url: url.toString(), init });

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { ok: true };
      }
    } as Response;
  });

  assert.deepEqual(
    await client.requestJson({
      url: "https://dashscope.aliyuncs.com/task",
      method: "POST",
      headers: {
        Authorization: "Bearer sk-test-secret"
      },
      body: {
        hello: "world"
      }
    }),
    { ok: true }
  );
  assert.deepEqual(await client.getJson("https://example.com/result.json"), { ok: true });
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.body, JSON.stringify({ hello: "world" }));
  assert.equal(calls[1]?.init?.method, "GET");
});

test("fetch-backed DashScope HTTP client rejects non-2xx responses", async () => {
  const client = createFetchDashScopeHttpClient(async () =>
    ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      async text() {
        return "server exploded";
      }
    }) as Response
  );

  await assert.rejects(
    () =>
      client.requestJson({
        url: "https://dashscope.aliyuncs.com/task",
        method: "POST",
        headers: {}
      }),
    /HTTP 500 Internal Server Error: server exploded/
  );
});
