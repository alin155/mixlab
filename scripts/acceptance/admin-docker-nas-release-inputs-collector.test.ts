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
  assert.equal(script.includes("env | sort"), false);
  assert.equal(script.includes("{{json .Config.Env}}"), false);
  assert.equal(script.includes("DASHSCOPE_API_KEY"), false);
});
