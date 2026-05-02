import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveIndexPackageFilePath,
  validateIndexPackageManifest,
  type IndexPackageManifest
} from "./index.ts";

test("validates versioned read-only index package manifests", () => {
  const manifest: IndexPackageManifest = {
    index_version: "v000027",
    library_id: "lib_main_001",
    created_at: "2026-05-01T00:00:00Z",
    ready_video_count: 3,
    source_video_ids: ["V000001", "V000002", "V000003"],
    schema_version: "1.0"
  };

  assert.deepEqual(validateIndexPackageManifest(manifest), {
    ok: true,
    errors: []
  });
});

test("rejects malformed index package manifests before publish", () => {
  const manifest: IndexPackageManifest = {
    index_version: "27",
    library_id: "lib_main_001",
    created_at: "2026-05-01T00:00:00Z",
    ready_video_count: 4,
    source_video_ids: ["V000001", "V000002", "V000003"],
    schema_version: ""
  };

  assert.deepEqual(validateIndexPackageManifest(manifest), {
    ok: false,
    errors: [
      "index_version must use v000001 format",
      "ready_video_count must equal source_video_ids length",
      "schema_version is required"
    ]
  });
});

test("resolves macOS index package files under the immutable version directory", () => {
  assert.equal(
    resolveIndexPackageFilePath({
      mount_root: "/Volumes/MixLab-NAS-Simulated",
      index_version: "v000027",
      file_name: "index.sqlite"
    }),
    "/Volumes/MixLab-NAS-Simulated/.mixlab-library/indexes/source-transcript-index/v000027/index.sqlite"
  );
});

test("resolves Windows index package files under the immutable version directory", () => {
  assert.equal(
    resolveIndexPackageFilePath({
      mount_root: "Z:\\",
      index_version: "v000027",
      file_name: "index-manifest.json"
    }),
    "Z:\\.mixlab-library\\indexes\\source-transcript-index\\v000027\\index-manifest.json"
  );
});

test("rejects unsafe index version names and file names", () => {
  assert.throws(
    () =>
      resolveIndexPackageFilePath({
        mount_root: "/Volumes/MixLab-NAS-Simulated",
        index_version: "../v000027",
        file_name: "index.sqlite"
      }),
    /index_version must use v000001 format/
  );

  assert.throws(
    () =>
      resolveIndexPackageFilePath({
        mount_root: "/Volumes/MixLab-NAS-Simulated",
        index_version: "v000027",
        file_name: "../index.sqlite"
      }),
    /file_name must be a simple file name/
  );
});
