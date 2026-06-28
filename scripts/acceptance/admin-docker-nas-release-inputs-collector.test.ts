import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(
  new URL("./admin-docker-nas-release-inputs-collector.sh", import.meta.url),
  "utf8"
);

test("NAS release-input collector exports only sanitized evidence", () => {
  assert.match(script, /grep '\^MIXLAB_IMAGE_TAG='/);
  assert.match(script, /MIXLAB_ADMIN_DOCKER_MVP_MODE/);
  assert.match(script, /MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER/);
  assert.match(script, /MIXLAB_ENABLE_READY_PUBLISH_WORKER/);
  assert.match(script, /MIXLAB_ADMIN_LIBRARY_ROOT/);
  assert.match(script, /MIXLAB_PREPROCESS_LIBRARY_ROOT/);
  assert.match(script, /docker inspect --format/);
  assert.match(script, /admin-docker-disk-proof\.json/);
  assert.match(script, /df -Pk/);
  assert.match(script, /MIXLAB_PREPROCESS_DISK_ATTENTION_USAGE_PERCENT/);
  assert.match(script, /MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT/);
  assert.match(script, /MIXLAB_ADMIN_DOCKER_NAS_DISK_PROOF_JSON/);
  assert.match(script, /validate:admin-docker-nas-disk-proof/);
  assert.match(script, /write_returned_manifest/);
  assert.match(script, /write_returned_readme/);
  assert.match(script, /MANIFEST\.txt/);
  assert.match(script, /README\.md/);
  assert.match(script, /validate-returned-evidence\.sh/);
  assert.match(script, /intake:admin-docker-nas-release-inputs/);
  assert.match(script, /push_execution_allowed=false/);
  assert.match(script, /docker_deploy_allowed=false/);
  assert.match(script, /nas_writes_allowed=false/);
  assert.match(script, /worker_start_allowed=false/);
  assert.match(script, /Do not copy full \.env/);
  assert.match(script, /Do not copy full docker inspect output/);
  assert.match(script, /Do not add API keys, bearer tokens, passwords/);
  assert.equal(script.includes("env | sort"), false);
  assert.equal(script.includes("{{json .Config.Env}}"), false);
  assert.equal(script.includes("DASHSCOPE_API_KEY"), false);
});
