import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getAdminHealth,
  getAdminPreprocessSafety
} from "./admin-health-query.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-health-query-"));
}

test("health query returns shallow preprocess safety without reading processing guard", async () => {
  const libraryRoot = await makeLibraryRoot();
  let processingGuardRead = false;

  const health = await getAdminHealth({
    api_input: {
      library_root: libraryRoot,
      now: () => "2026-06-27T00:00:00.000Z",
      env: {
        MIXLAB_BUILD_SHA: "abc123",
        MIXLAB_BUILD_VERSION: "2026.06.27",
        MIXLAB_IMAGE_TAG: "admin-api:test"
      } as NodeJS.ProcessEnv
    },
    deep: false,
    deps: {
      async read_primary_source_videos_path(root) {
        return path.join(root, "source-videos");
      },
      async read_processing_source_video_ids() {
        processingGuardRead = true;
        return ["V000001"];
      }
    }
  });

  assert.equal(processingGuardRead, false);
  assert.equal(health.ok, true);
  assert.equal(health.service, "admin-api");
  assert.equal(health.build.sha, "abc123");
  assert.equal(health.build.version, "2026.06.27");
  assert.equal(health.build.image_tag, "admin-api:test");
  assert.equal(health.runtime.library_root, libraryRoot);
  assert.equal(health.runtime.source_videos_path, path.join(libraryRoot, "source-videos"));
  assert.equal(health.runtime.path_profile, "local");
  assert.equal(health.preprocess.checked_at, "2026-06-27T00:00:00.000Z");
  assert.equal(health.preprocess.processing.checked, false);
});

test("preprocess safety query uses read-model processing ids when deep guard is enabled", async () => {
  const libraryRoot = await makeLibraryRoot();

  const safety = await getAdminPreprocessSafety({
    api_input: {
      library_root: libraryRoot,
      now: () => "2026-06-27T00:01:00.000Z",
      env: {
        MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT: "99"
      } as NodeJS.ProcessEnv
    },
    include_processing_guard: true,
    deps: {
      async read_processing_source_video_ids(root) {
        assert.equal(root, libraryRoot);
        return ["V000003", "bad-id", "V000001", "V000003"];
      }
    }
  });

  assert.equal(safety.checked_at, "2026-06-27T00:01:00.000Z");
  assert.equal(safety.processing.checked, true);
  assert.equal(safety.processing.processing_count, 2);
  assert.deepEqual(safety.processing.source_video_ids, ["V000001", "V000003"]);
  assert.equal(safety.safe_to_start, false);
  assert.equal(safety.status, "blocked");
  assert.equal(safety.blockers.some((blocker) => blocker.code === "processing-needs-recovery"), true);
});
