import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertPersistentRuntimePath,
  isTemporaryRuntimePath
} from "./persistence.ts";

test("detects public library roots under system temporary directories", () => {
  assert.equal(isTemporaryRuntimePath("/tmp/mixlab-live-worker-library.KdzZK0"), true);
  assert.equal(isTemporaryRuntimePath("/private/tmp/mixlab-live-worker-library.KdzZK0"), true);
  assert.equal(isTemporaryRuntimePath(path.join(os.tmpdir(), "mixlab-runtime")), true);
  assert.equal(isTemporaryRuntimePath("/Volumes/Allen移动硬盘/MixLab_V3_PublicLibrary"), false);
  assert.equal(isTemporaryRuntimePath(path.join(os.homedir(), "Movies", "MixLabLocal")), false);
});

test("rejects temporary runtime paths unless explicitly allowed for tests", () => {
  assert.throws(
    () =>
      assertPersistentRuntimePath({
        path_value: "/tmp/mixlab-live-worker-library.KdzZK0",
        path_label: "公共素材库根目录",
        env: {}
      }),
    /正式运行禁止使用临时目录/
  );

  assert.doesNotThrow(() =>
    assertPersistentRuntimePath({
      path_value: "/tmp/mixlab-live-worker-library.KdzZK0",
      path_label: "公共素材库根目录",
      env: { MIXLAB_ALLOW_TEMP_RUNTIME_PATHS: "1" }
    })
  );
});
