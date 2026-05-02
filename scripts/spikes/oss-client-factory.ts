import {
  createAliyunOssClient,
  importAliyunOssConstructor,
  loadAliyunOssRuntimeConfigFromEnv,
  redactAliyunOssRuntimeConfig
} from "../../packages/oss-core/src/index.ts";
import { loadProjectEnv } from "../shared/load-project-env.ts";

await loadProjectEnv();

const config = loadAliyunOssRuntimeConfigFromEnv({
  ...process.env,
  ALIYUN_OSS_BUCKET: process.env.ALIYUN_OSS_BUCKET || "mixlab-private",
  ALIYUN_OSS_ENDPOINT: process.env.ALIYUN_OSS_ENDPOINT || "oss-cn-beijing.aliyuncs.com",
  ALIYUN_OSS_REGION: process.env.ALIYUN_OSS_REGION || "oss-cn-beijing",
  ALIYUN_OSS_ACCESS_KEY_ID: process.env.ALIYUN_OSS_ACCESS_KEY_ID || "ak-local-placeholder",
  ALIYUN_OSS_ACCESS_KEY_SECRET:
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || "secret-local-placeholder"
});
const AliyunOssConstructor = await importAliyunOssConstructor();
const client = createAliyunOssClient(config, AliyunOssConstructor);

console.log("Redacted OSS config:");
console.log(JSON.stringify(redactAliyunOssRuntimeConfig(config), null, 2));
console.log("\nali-oss client shape:");
console.log(
  JSON.stringify(
    {
      put: typeof client.put,
      signatureUrl: typeof client.signatureUrl
    },
    null,
    2
  )
);
console.log("\nNote: This spike imports and constructs the real ali-oss client, but does not upload.");
