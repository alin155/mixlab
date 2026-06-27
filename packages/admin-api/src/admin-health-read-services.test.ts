import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAdminHealthReadServices } from "./admin-health-read-services.ts";

interface TestApiInput {
  library_root: string;
  now: () => string;
  env?: NodeJS.ProcessEnv;
  request_id: string;
}

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-health-read-services-"));
}

test("health read services assemble shallow health without reading processing guard", async () => {
  const libraryRoot = await makeLibraryRoot();
  const calls: string[] = [];
  const services = createAdminHealthReadServices<TestApiInput>({
    async read_source_video_status_read_model(root) {
      calls.push(`status-read-model:${root}`);
      return {
        ids_by_status: {
          processing: ["V000001"]
        }
      };
    },
    async read_primary_source_videos_path(root) {
      calls.push(`source-path:${root}`);
      return path.join(root, "source-videos");
    }
  });

  const health = await services.read_health({
    library_root: libraryRoot,
    request_id: "req-health",
    now: () => "2026-06-27T04:45:00.000Z",
    env: {
      MIXLAB_BUILD_SHA: "sha-r204",
      MIXLAB_BUILD_VERSION: "r204",
      MIXLAB_IMAGE_TAG: "admin-api:r204"
    } as NodeJS.ProcessEnv
  }, { deep: false });

  assert.deepEqual(calls, [`source-path:${libraryRoot}`]);
  assert.equal(health.ok, true);
  assert.equal(health.service, "admin-api");
  assert.equal(health.build.sha, "sha-r204");
  assert.equal(health.build.version, "r204");
  assert.equal(health.build.image_tag, "admin-api:r204");
  assert.equal(health.runtime.library_root, libraryRoot);
  assert.equal(health.runtime.source_videos_path, path.join(libraryRoot, "source-videos"));
  assert.equal(health.runtime.path_profile, "local");
  assert.equal(health.preprocess.processing.checked, false);
});

test("health read services use read-model processing ids for deep safety checks", async () => {
  const libraryRoot = await makeLibraryRoot();
  const calls: string[] = [];
  const services = createAdminHealthReadServices<TestApiInput>({
    async read_source_video_status_read_model(root) {
      calls.push(`status-read-model:${root}`);
      return {
        ids_by_status: {
          processing: ["V000004", "bad-id", "V000002", "V000004"]
        }
      };
    },
    async read_primary_source_videos_path(root) {
      calls.push(`source-path:${root}`);
      return path.join(root, "source-videos");
    }
  });

  const safety = await services.read_preprocess_safety({
    api_input: {
      library_root: libraryRoot,
      request_id: "req-safety",
      now: () => "2026-06-27T04:46:00.000Z",
      env: {
        MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT: "85"
      } as NodeJS.ProcessEnv
    },
    include_processing_guard: true
  });

  assert.deepEqual(calls, [`status-read-model:${libraryRoot}`]);
  assert.equal(safety.checked_at, "2026-06-27T04:46:00.000Z");
  assert.equal(safety.processing.checked, true);
  assert.equal(safety.processing.processing_count, 2);
  assert.deepEqual(safety.processing.source_video_ids, ["V000002", "V000004"]);
  assert.equal(safety.status, "blocked");
  assert.equal(safety.safe_to_start, false);
});

test("health read services expose processing ids as a local query service", async () => {
  const libraryRoot = await makeLibraryRoot();
  const services = createAdminHealthReadServices<TestApiInput>({
    async read_source_video_status_read_model(root) {
      assert.equal(root, libraryRoot);
      return {
        ids_by_status: {
          processing: ["V000007", "V000009"]
        }
      };
    },
    async read_primary_source_videos_path(root) {
      return path.join(root, "source-videos");
    }
  });

  assert.deepEqual(await services.read_processing_source_video_ids(libraryRoot), [
    "V000007",
    "V000009"
  ]);
});
