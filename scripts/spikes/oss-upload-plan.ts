import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type AliyunOssClientConfig,
  buildAsrAudioObjectKey,
  createAliyunOssUploaderFromRuntimeConfig,
  loadAliyunOssRuntimeConfigFromEnv,
  redactAliyunOssRuntimeConfig
} from "../../packages/oss-core/src/index.ts";

const workdir = await mkdtemp(path.join(os.tmpdir(), "mixlab-oss-upload-plan-"));
const localAudioPath = path.join(workdir, "audio.mp3");
await writeFile(localAudioPath, "fake-audio-bytes");

const config = loadAliyunOssRuntimeConfigFromEnv({
  ...process.env,
  ALIYUN_OSS_BUCKET: process.env.ALIYUN_OSS_BUCKET || "mixlab-private",
  ALIYUN_OSS_ENDPOINT: process.env.ALIYUN_OSS_ENDPOINT || "oss-cn-beijing.aliyuncs.com",
  ALIYUN_OSS_REGION: process.env.ALIYUN_OSS_REGION || "oss-cn-beijing",
  ALIYUN_OSS_ACCESS_KEY_ID: process.env.ALIYUN_OSS_ACCESS_KEY_ID || "ak-local-placeholder",
  ALIYUN_OSS_ACCESS_KEY_SECRET:
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || "secret-local-placeholder",
  MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS:
    process.env.MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS || "900",
  MIXLAB_OSS_OBJECT_PREFIX: process.env.MIXLAB_OSS_OBJECT_PREFIX || "mixlab"
});

const objectKey = buildAsrAudioObjectKey({
  prefix: config.object_key_prefix ?? "mixlab",
  library_id: "lib_main_001",
  source_video_id: "V000001",
  extension: "mp3"
});

class FakeAliyunOssClient {
  private readonly clientConfig: AliyunOssClientConfig;

  constructor(clientConfig: AliyunOssClientConfig) {
    this.clientConfig = clientConfig;
  }

  async put(uploadObjectKey: string, filePath: string, options?: unknown): Promise<unknown> {
    console.log("Fake ali-oss put:");
    console.log(
      JSON.stringify(
        {
          object_key: uploadObjectKey,
          local_file_path: filePath,
          options
        },
        null,
        2
      )
    );

    return { name: uploadObjectKey };
  }

  signatureUrl(uploadObjectKey: string, options?: { expires?: number }): string {
    return `https://${this.clientConfig.bucket}.${this.clientConfig.endpoint}/${uploadObjectKey}?Expires=${options?.expires}`;
  }
}

const uploader = await createAliyunOssUploaderFromRuntimeConfig(config, {
  client_constructor: FakeAliyunOssClient
});

const uploaded = await uploader.uploadAsrAudio({
  local_file_path: localAudioPath,
  object_key: objectKey,
  content_type: "audio/mpeg"
});

console.log("\nRedacted OSS config:");
console.log(JSON.stringify(redactAliyunOssRuntimeConfig(config), null, 2));
console.log("\nUploaded ASR audio reference:");
console.log(JSON.stringify(uploaded, null, 2));
console.log("\nNote: This spike uses the runtime config loader and uploader factory with a fake ali-oss constructor.");
