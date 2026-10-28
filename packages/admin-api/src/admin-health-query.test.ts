import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getAdminHealth,
  getAdminPreprocessSafety,
  getAdminReady
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
  assert.equal(health.runtime.path_profile, "local");
  assert.equal(JSON.stringify(health).includes(libraryRoot), false);
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

test("ready query reports ready for a readable empty library without absolute paths", async () => {
  const libraryRoot = await makeLibraryRoot();

  const report = await getAdminReady({
    api_input: {
      library_root: libraryRoot,
      now: () => "2026-06-27T00:10:00.000Z",
      env: {
        MIXLAB_BUILD_SHA: "ready-sha",
        MIXLAB_BUILD_VERSION: "r2-ready",
        // Keep the assertion independent of the CI host disk usage (attention threshold is 5%).
        MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT: "100"
      } as NodeJS.ProcessEnv
    },
    deep: false,
    deps: {
      async read_processing_source_video_ids(root) {
        assert.equal(root, libraryRoot);
        return [];
      }
    }
  });

  assert.equal(report.ready, true);
  assert.equal(report.status, "ready");
  assert.equal(report.service, "admin-api");
  assert.equal(report.build.sha, "ready-sha");
  assert.equal(report.build.version, "r2-ready");
  assert.equal(report.checks.length, 4);
  assert.equal(report.reasons.length, 0);
  assert.equal(report.safety.status, "healthy");
  assert.equal(JSON.stringify(report).includes(libraryRoot), false);
});

test("ready query is not ready when the library root is unavailable or safety is blocked", async () => {
  const parent = await makeLibraryRoot();
  const missingLibraryRoot = path.join(parent, "missing-library");

  const report = await getAdminReady({
    api_input: {
      library_root: missingLibraryRoot,
      now: () => "2026-06-27T00:11:00.000Z",
      env: {} as NodeJS.ProcessEnv
    },
    deep: false,
    deps: {
      async read_processing_source_video_ids() {
        return [];
      }
    }
  });

  assert.equal(report.ready, false);
  assert.equal(report.status, "not_ready");
  assert.equal(report.checks.some((check) => check.id === "library_readable" && !check.ok), true);
  assert.equal(report.checks.some((check) => check.id === "preprocess_safety" && !check.ok), true);
  assert.equal(report.safety.status, "blocked");
  assert.equal(report.safety.blocker_codes.includes("library-root-unavailable"), true);
  assert.equal(report.reasons.length >= 2, true);
  assert.equal(JSON.stringify(report).includes(missingLibraryRoot), false);
});

test("ready query is not ready when the read model is unreadable", async () => {
  const libraryRoot = await makeLibraryRoot();

  const report = await getAdminReady({
    api_input: {
      library_root: libraryRoot,
      now: () => "2026-06-27T00:12:00.000Z",
      env: {} as NodeJS.ProcessEnv
    },
    deep: false,
    deps: {
      async read_processing_source_video_ids() {
        throw new Error("read model SQLite is locked");
      }
    }
  });

  assert.equal(report.ready, false);
  assert.equal(report.checks.some((check) => check.id === "read_model_readable" && !check.ok), true);
  assert.equal(JSON.stringify(report).includes("read model SQLite is locked"), false);
});

test("ready query reports an invalid release pointer as not ready", async () => {
  const libraryRoot = await makeLibraryRoot();
  const mixlabRoot = path.join(libraryRoot, ".mixlab-library");
  await mkdir(mixlabRoot, { recursive: true });
  await writeFile(path.join(mixlabRoot, "current-release.json"), "{ broken", "utf8");

  const report = await getAdminReady({
    api_input: {
      library_root: libraryRoot,
      now: () => "2026-06-27T00:13:00.000Z",
      env: {} as NodeJS.ProcessEnv
    },
    deep: false,
    deps: {
      async read_processing_source_video_ids() {
        return [];
      }
    }
  });

  assert.equal(report.ready, false);
  assert.equal(report.checks.some((check) => check.id === "release_pointer_valid" && !check.ok), true);
});
