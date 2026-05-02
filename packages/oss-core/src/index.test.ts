import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAsrAudioObjectKey,
  buildAliyunOssClientConfig,
  buildLiveOssUploadReadinessReport,
  createAliyunOssClient,
  createAliyunOssUploader,
  createAliyunOssUploaderFromRuntimeConfig,
  isLiveOssUploadEnabled,
  loadAliyunOssRuntimeConfigFromEnv,
  redactAliyunOssRuntimeConfig,
  redactUrlQueryForLogging,
  validateOssObjectKey
} from "./index.ts";

test("builds deterministic ASR audio object keys", () => {
  assert.equal(
    buildAsrAudioObjectKey({
      prefix: "mixlab",
      library_id: "lib_main_001",
      source_video_id: "V000001",
      extension: "mp3"
    }),
    "mixlab/lib_main_001/asr-audio/V000001/audio.mp3"
  );

  assert.equal(
    buildAsrAudioObjectKey({
      prefix: "/mixlab/",
      library_id: "lib_main_001",
      source_video_id: "V000001",
      extension: ".wav"
    }),
    "mixlab/lib_main_001/asr-audio/V000001/audio.wav"
  );
});

test("validates OSS object keys against traversal and absolute paths", () => {
  assert.deepEqual(validateOssObjectKey("mixlab/lib/asr-audio/V000001/audio.mp3"), {
    ok: true,
    errors: []
  });
  assert.deepEqual(validateOssObjectKey("/mixlab/audio.mp3"), {
    ok: false,
    errors: ["object key must be relative"]
  });
  assert.deepEqual(validateOssObjectKey("mixlab/../secret.mp3"), {
    ok: false,
    errors: ["object key must not contain traversal segments"]
  });
  assert.deepEqual(validateOssObjectKey("mixlab\\audio.mp3"), {
    ok: false,
    errors: ["object key must use forward slashes"]
  });
});

test("uploads ASR audio through an Aliyun OSS compatible client and returns a signed URL", async () => {
  const calls: Array<{
    objectKey: string;
    localFilePath: string;
    options?: unknown;
  }> = [];
  const uploader = createAliyunOssUploader({
    bucket: "mixlab-private",
    endpoint: "oss-cn-beijing.aliyuncs.com",
    access_key_id: "ak-test",
    access_key_secret: "secret-test",
    signed_url_expires_seconds: 900,
    client: {
      async put(objectKey, localFilePath, options) {
        calls.push({ objectKey, localFilePath, options });
        return { name: objectKey };
      },
      signatureUrl(objectKey, options) {
        return `https://mixlab-private.oss-cn-beijing.aliyuncs.com/${objectKey}?Expires=${options?.expires}`;
      }
    }
  });

  const result = await uploader.uploadAsrAudio({
    local_file_path: "/tmp/audio.mp3",
    object_key: "mixlab/lib_main_001/asr-audio/V000001/audio.mp3",
    content_type: "audio/mpeg"
  });

  assert.deepEqual(calls, [
    {
      objectKey: "mixlab/lib_main_001/asr-audio/V000001/audio.mp3",
      localFilePath: "/tmp/audio.mp3",
      options: {
        headers: {
          "Content-Type": "audio/mpeg"
        }
      }
    }
  ]);
  assert.deepEqual(result, {
    object_key: "mixlab/lib_main_001/asr-audio/V000001/audio.mp3",
    file_url: "https://mixlab-private.oss-cn-beijing.aliyuncs.com/mixlab/lib_main_001/asr-audio/V000001/audio.mp3?Expires=900",
    url_mode: "signed-url"
  });
});

test("can return public HTTPS URLs without signing", async () => {
  const uploader = createAliyunOssUploader({
    bucket: "mixlab-public",
    endpoint: "oss-cn-beijing.aliyuncs.com",
    public_base_url: "https://cdn.example.com/materials",
    url_mode: "public-url",
    client: {
      async put(objectKey) {
        return { name: objectKey };
      },
      signatureUrl() {
        throw new Error("public uploads should not sign URLs");
      }
    }
  });

  const result = await uploader.uploadAsrAudio({
    local_file_path: "/tmp/audio.wav",
    object_key: "mixlab/lib_main_001/asr-audio/V000001/audio.wav"
  });

  assert.deepEqual(result, {
    object_key: "mixlab/lib_main_001/asr-audio/V000001/audio.wav",
    file_url: "https://cdn.example.com/materials/mixlab/lib_main_001/asr-audio/V000001/audio.wav",
    url_mode: "public-url"
  });
});

test("redacts Aliyun OSS runtime config before logging", () => {
  assert.deepEqual(
    redactAliyunOssRuntimeConfig({
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      access_key_id: "ak-test",
      access_key_secret: "secret-test",
      signed_url_expires_seconds: 900
    }),
    {
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      access_key_id: "***",
      access_key_secret: "***",
      signed_url_expires_seconds: 900
    }
  );
});

test("loads Aliyun OSS runtime config from environment variables", () => {
  assert.deepEqual(
    loadAliyunOssRuntimeConfigFromEnv({
      ALIYUN_OSS_BUCKET: "mixlab-private",
      ALIYUN_OSS_ENDPOINT: "oss-cn-beijing.aliyuncs.com",
      ALIYUN_OSS_REGION: "oss-cn-beijing",
      ALIYUN_OSS_ACCESS_KEY_ID: "ak-test",
      ALIYUN_OSS_ACCESS_KEY_SECRET: "secret-test",
      MIXLAB_OSS_URL_MODE: "public-url",
      MIXLAB_OSS_PUBLIC_BASE_URL: "https://cdn.example.com/materials",
      MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS: "1200",
      MIXLAB_OSS_OBJECT_PREFIX: "mixlab-stage"
    }),
    {
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      region: "oss-cn-beijing",
      access_key_id: "ak-test",
      access_key_secret: "secret-test",
      url_mode: "public-url",
      public_base_url: "https://cdn.example.com/materials",
      signed_url_expires_seconds: 1200,
      object_key_prefix: "mixlab-stage"
    }
  );
});

test("rejects incomplete Aliyun OSS runtime config", () => {
  assert.throws(
    () =>
      loadAliyunOssRuntimeConfigFromEnv({
        ALIYUN_OSS_BUCKET: "mixlab-private"
      }),
    /missing Aliyun OSS env vars: ALIYUN_OSS_ENDPOINT, ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET/
  );
});

test("rejects invalid OSS URL mode and signed URL expiry", () => {
  assert.throws(
    () =>
      loadAliyunOssRuntimeConfigFromEnv({
        ALIYUN_OSS_BUCKET: "mixlab-private",
        ALIYUN_OSS_ENDPOINT: "oss-cn-beijing.aliyuncs.com",
        ALIYUN_OSS_ACCESS_KEY_ID: "ak-test",
        ALIYUN_OSS_ACCESS_KEY_SECRET: "secret-test",
        MIXLAB_OSS_URL_MODE: "temporary"
      }),
    /MIXLAB_OSS_URL_MODE must be signed-url or public-url/
  );

  assert.throws(
    () =>
      loadAliyunOssRuntimeConfigFromEnv({
        ALIYUN_OSS_BUCKET: "mixlab-private",
        ALIYUN_OSS_ENDPOINT: "oss-cn-beijing.aliyuncs.com",
        ALIYUN_OSS_ACCESS_KEY_ID: "ak-test",
        ALIYUN_OSS_ACCESS_KEY_SECRET: "secret-test",
        MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS: "0"
      }),
    /MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS must be greater than 0/
  );
});

test("keeps live OSS upload disabled unless explicitly enabled with 1", () => {
  assert.equal(isLiveOssUploadEnabled({}), false);
  assert.equal(
    isLiveOssUploadEnabled({
      MIXLAB_ENABLE_LIVE_OSS_UPLOAD: "true"
    }),
    false
  );
  assert.equal(
    isLiveOssUploadEnabled({
      MIXLAB_ENABLE_LIVE_OSS_UPLOAD: " 1 "
    }),
    true
  );
});

test("reports live OSS upload readiness without loading secrets", () => {
  assert.deepEqual(
    buildLiveOssUploadReadinessReport({
      MIXLAB_ENABLE_LIVE_OSS_UPLOAD: "1",
      ALIYUN_OSS_BUCKET: "mixlab-private"
    }),
    {
      enabled: true,
      enable_flag: "MIXLAB_ENABLE_LIVE_OSS_UPLOAD",
      required_env_keys: [
        "ALIYUN_OSS_BUCKET",
        "ALIYUN_OSS_ENDPOINT",
        "ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_SECRET"
      ],
      missing_env_keys: [
        "ALIYUN_OSS_ENDPOINT",
        "ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_SECRET"
      ]
    }
  );
});

test("redacts signed URL query strings before logging", () => {
  assert.equal(
    redactUrlQueryForLogging(
      "https://mixlab-private.oss-cn-beijing.aliyuncs.com/mixlab/audio.mp3?Expires=900&OSSAccessKeyId=secret&Signature=secret"
    ),
    "https://mixlab-private.oss-cn-beijing.aliyuncs.com/mixlab/audio.mp3?[redacted-query]"
  );
  assert.equal(
    redactUrlQueryForLogging("https://cdn.example.com/mixlab/audio.mp3"),
    "https://cdn.example.com/mixlab/audio.mp3"
  );
});

test("maps runtime config into ali-oss client constructor options", () => {
  assert.deepEqual(
    buildAliyunOssClientConfig({
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      region: "oss-cn-beijing",
      access_key_id: "ak-test",
      access_key_secret: "secret-test"
    }),
    {
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      region: "oss-cn-beijing",
      accessKeyId: "ak-test",
      accessKeySecret: "secret-test",
      secure: true
    }
  );
});

test("creates ali-oss compatible clients through an injectable constructor", () => {
  const constructorCalls: unknown[] = [];

  class FakeOssClient {
    constructor(config: unknown) {
      constructorCalls.push(config);
    }

    async put() {
      return {};
    }

    signatureUrl() {
      return "https://example.com/signed";
    }
  }

  const client = createAliyunOssClient(
    {
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      region: "oss-cn-beijing",
      access_key_id: "ak-test",
      access_key_secret: "secret-test"
    },
    FakeOssClient
  );

  assert.equal(typeof client.put, "function");
  assert.deepEqual(constructorCalls, [
    {
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      region: "oss-cn-beijing",
      accessKeyId: "ak-test",
      accessKeySecret: "secret-test",
      secure: true
    }
  ]);
});

test("creates an uploader from runtime config and injectable ali-oss constructor", async () => {
  class FakeOssClient {
    async put() {
      return {};
    }

    signatureUrl(objectKey: string) {
      return `https://example.com/${objectKey}?signed`;
    }
  }

  const uploader = await createAliyunOssUploaderFromRuntimeConfig(
    {
      bucket: "mixlab-private",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      access_key_id: "ak-test",
      access_key_secret: "secret-test"
    },
    {
      client_constructor: FakeOssClient
    }
  );

  const uploaded = await uploader.uploadAsrAudio({
    local_file_path: "/tmp/audio.mp3",
    object_key: "mixlab/lib_main_001/asr-audio/V000001/audio.mp3"
  });

  assert.equal(uploaded.file_url, "https://example.com/mixlab/lib_main_001/asr-audio/V000001/audio.mp3?signed");
});
