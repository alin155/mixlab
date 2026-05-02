import { stat } from "node:fs/promises";
import path from "node:path";
import {
  createFetchDashScopeHttpClient,
  uploadDashScopeTemporaryFile
} from "../../packages/asr-core/src/index.ts";
import { loadProjectEnv } from "../shared/load-project-env.ts";

await loadProjectEnv();

const enableFlag = "MIXLAB_ENABLE_LIVE_DASHSCOPE_TEMP_UPLOAD";
const enabled = process.env[enableFlag]?.trim() === "1";
const filePath = process.env.MIXLAB_TEMP_UPLOAD_FILE?.trim();
const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
const model = process.env.MIXLAB_ASR_MODEL?.trim() || "paraformer-v2";
const missingEnvKeys = [
  ...(apiKey ? [] : ["DASHSCOPE_API_KEY"]),
  ...(filePath ? [] : ["MIXLAB_TEMP_UPLOAD_FILE"])
];

if (!enabled) {
  console.log("Live DashScope temporary upload skipped.");
  console.log(
    JSON.stringify(
      {
        reason: `${enableFlag}=1 is required before any real temporary upload`,
        required_env_keys: ["DASHSCOPE_API_KEY", "MIXLAB_TEMP_UPLOAD_FILE"],
        missing_env_keys: missingEnvKeys
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (missingEnvKeys.length > 0) {
  console.error("Live DashScope temporary upload is enabled, but env vars are missing.");
  console.error(JSON.stringify({ missing_env_keys: missingEnvKeys }, null, 2));
  process.exit(1);
}

await stat(filePath ?? "");

const uploaded = await uploadDashScopeTemporaryFile({
  api_key: apiKey ?? "",
  model,
  local_file_path: filePath ?? "",
  file_name: path.basename(filePath ?? ""),
  http: createFetchDashScopeHttpClient()
});

console.log("Live DashScope temporary upload completed.");
console.log(
  JSON.stringify(
    {
      model,
      source_file: filePath,
      uploaded
    },
    null,
    2
  )
);
