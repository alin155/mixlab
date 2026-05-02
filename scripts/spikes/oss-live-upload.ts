import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  buildAsrAudioObjectKey,
  buildLiveOssUploadReadinessReport,
  createAliyunOssUploaderFromRuntimeConfig,
  loadAliyunOssRuntimeConfigFromEnv,
  redactAliyunOssRuntimeConfig,
  redactUrlQueryForLogging
} from "../../packages/oss-core/src/index.ts";

await loadProjectEnv();

const readiness = buildLiveOssUploadReadinessReport(process.env);

if (!readiness.enabled) {
  console.log("Live OSS upload skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${readiness.enable_flag}=1 is required before any real upload`,
        required_env_keys: readiness.required_env_keys,
        missing_env_keys: readiness.missing_env_keys
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (readiness.missing_env_keys.length > 0) {
  console.error("Live OSS upload is enabled, but required OSS env vars are missing.");
  console.error(JSON.stringify(readiness, null, 2));
  process.exit(1);
}

const config = loadAliyunOssRuntimeConfigFromEnv(process.env);
const workdir = await mkdtemp(path.join(os.tmpdir(), "mixlab-oss-live-upload-"));
const localAudioPath =
  process.env.MIXLAB_OSS_LIVE_UPLOAD_FILE || path.join(workdir, "audio.mp3");

if (!process.env.MIXLAB_OSS_LIVE_UPLOAD_FILE) {
  await writeFile(localAudioPath, "mixlab-live-oss-upload-check");
}

const now = new Date().toISOString().replace(/[:.]/g, "-");
const objectKey = buildAsrAudioObjectKey({
  prefix: `${config.object_key_prefix ?? "mixlab"}/live-check/${now}`,
  library_id: "lib_main_001",
  source_video_id: "LIVE_CHECK",
  extension: path.extname(localAudioPath).replace(/^\./, "") || "mp3"
});
const uploader = await createAliyunOssUploaderFromRuntimeConfig(config);
const uploaded = await uploader.uploadAsrAudio({
  local_file_path: localAudioPath,
  object_key: objectKey,
  content_type: "audio/mpeg"
});

console.log("Live OSS upload completed.");
console.log(
  JSON.stringify(
    {
      config: redactAliyunOssRuntimeConfig(config),
      uploaded: {
        object_key: uploaded.object_key,
        url_mode: uploaded.url_mode,
        file_url: redactUrlQueryForLogging(uploaded.file_url)
      }
    },
    null,
    2
  )
);
