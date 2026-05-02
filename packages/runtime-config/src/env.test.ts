import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadEnvFile, parseEnvFileContent } from "./env.ts";

test("parses dotenv content with comments, export prefixes, and quoted values", () => {
  assert.deepEqual(
    parseEnvFileContent(`
# local secrets
export DASHSCOPE_API_KEY="sk-local-placeholder"
ALIYUN_OSS_BUCKET=mixlab-private
MIXLAB_PREPROCESS_SOURCE_VIDEO_PATH='/Users/allen/Desktop/test/C0018.MP4'
MIXLAB_COMMENT_VALUE=value # trailing comment
`),
    {
      DASHSCOPE_API_KEY: "sk-local-placeholder",
      ALIYUN_OSS_BUCKET: "mixlab-private",
      MIXLAB_PREPROCESS_SOURCE_VIDEO_PATH: "/Users/allen/Desktop/test/C0018.MP4",
      MIXLAB_COMMENT_VALUE: "value"
    }
  );
});

test("loads env files without overriding existing environment values by default", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-env-loader-"));
  const envPath = path.join(tempDir, ".env.local");
  const targetEnv: NodeJS.ProcessEnv = {
    DASHSCOPE_API_KEY: "already-set"
  };

  await writeFile(
    envPath,
    [
      "DASHSCOPE_API_KEY=from-file",
      "ALIYUN_OSS_BUCKET=mixlab-private"
    ].join("\n")
  );

  const result = await loadEnvFile({
    file_path: envPath,
    env: targetEnv
  });

  assert.deepEqual(result, {
    loaded: true,
    file_path: envPath,
    loaded_keys: ["ALIYUN_OSS_BUCKET"],
    skipped_existing_keys: ["DASHSCOPE_API_KEY"]
  });
  assert.equal(targetEnv.DASHSCOPE_API_KEY, "already-set");
  assert.equal(targetEnv.ALIYUN_OSS_BUCKET, "mixlab-private");
});

test("allows env files to override existing values when explicitly requested", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-env-loader-"));
  const envPath = path.join(tempDir, ".env.local");
  const targetEnv: NodeJS.ProcessEnv = {
    MIXLAB_ASR_MODEL: "old-model"
  };

  await writeFile(envPath, "MIXLAB_ASR_MODEL=paraformer-v2");

  const result = await loadEnvFile({
    file_path: envPath,
    env: targetEnv,
    override: true
  });

  assert.deepEqual(result.loaded_keys, ["MIXLAB_ASR_MODEL"]);
  assert.deepEqual(result.skipped_existing_keys, []);
  assert.equal(targetEnv.MIXLAB_ASR_MODEL, "paraformer-v2");
});

test("returns a skipped result for missing optional env files", async () => {
  const missingPath = path.join(os.tmpdir(), "mixlab-missing-env-file");

  assert.deepEqual(
    await loadEnvFile({
      file_path: missingPath,
      env: {},
      optional: true
    }),
    {
      loaded: false,
      file_path: missingPath,
      loaded_keys: [],
      skipped_existing_keys: []
    }
  );
});
