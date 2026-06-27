import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminLibraryManifestPath,
  adminMixlabRoot,
  adminPreprocessJobPath,
  adminSettingsPath,
  adminSourceTranscriptCurrentPath,
  adminSourceTranscriptIndexRoot,
  adminSourceTranscriptIndexSqlitePath,
  adminSourceVideoManifestPath,
  adminSourceVideosRoot,
  adminVideosRoot
} from "./admin-library-paths.ts";

test("admin library path helpers preserve the public library layout contract", () => {
  const libraryRoot = "/library";

  assert.equal(adminMixlabRoot(libraryRoot), "/library/.mixlab-library");
  assert.equal(adminSourceVideosRoot(libraryRoot), "/library/source-videos");
  assert.equal(adminVideosRoot(libraryRoot), "/library/.mixlab-library/videos");
  assert.equal(adminLibraryManifestPath(libraryRoot), "/library/.mixlab-library/library.json");
  assert.equal(adminSettingsPath(libraryRoot), "/library/.mixlab-library/admin-settings.json");
  assert.equal(
    adminSourceVideoManifestPath(libraryRoot, "V000001"),
    "/library/.mixlab-library/videos/V000001/source-video.json"
  );
  assert.equal(
    adminPreprocessJobPath(libraryRoot, "V000001"),
    "/library/.mixlab-library/videos/V000001/preprocess-job.json"
  );
  assert.equal(
    adminSourceTranscriptIndexRoot(libraryRoot),
    "/library/.mixlab-library/indexes/source-transcript-index"
  );
  assert.equal(
    adminSourceTranscriptCurrentPath(libraryRoot),
    "/library/.mixlab-library/indexes/source-transcript-index/current.json"
  );
  assert.equal(
    adminSourceTranscriptIndexSqlitePath(libraryRoot, "v010471"),
    "/library/.mixlab-library/indexes/source-transcript-index/v010471/index.sqlite"
  );
});
