import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  LibraryFormatError,
  artifactFilePath,
  assertSafePathSegment,
  assertSafeReleaseVersion,
  assertSourceVideoId,
  compareReleaseVersions,
  currentReleasePointerPath,
  indexCurrentPointerPath,
  indexPackageManifestPath,
  indexPackageSqlitePath,
  isSafeLibraryRelativePath,
  isSafePathSegment,
  isSafeReleaseVersion,
  libraryRelativePathParts,
  mixlabRoot,
  releaseCatalogPath,
  releaseManifestPath,
  releaseManifestRelativePath,
  releaseRoot,
  releaseSearchIndexVersionPath,
  releaseSourcePathMapPath,
  releasesRoot,
  resolveLibraryRelativePath,
  sourceVideoManifestPath,
  sourceVideosRoot
} from "./index.ts";

test("release/index version format is exactly v + six digits", () => {
  for (const version of ["v000001", "v012345", "v999999"]) {
    assert.equal(isSafeReleaseVersion(version), true, version);
    assert.equal(assertSafeReleaseVersion(version), version);
  }
  for (const version of ["v1", "v00001", "v0000001", "V000001", " v000001", "v000001 ", "v-00001", "../v000001", "v000001/../x", "", null, 1]) {
    assert.equal(isSafeReleaseVersion(version), false, String(version));
    assert.throws(() => assertSafeReleaseVersion(version), (error: unknown) =>
      error instanceof LibraryFormatError && error.code === "VERSION_INVALID");
  }
  assert.equal(compareReleaseVersions("v000002", "v000001"), 1);
  assert.equal(compareReleaseVersions("v000001", "v000002"), -1);
  assert.equal(compareReleaseVersions("v000003", "v000003"), 0);
  assert.throws(() => compareReleaseVersions("v1", "v000001"));
});

test("safe path segment rejects traversal/windows reserved names", () => {
  for (const value of ["v000001", "a.b_c-1", "A1"]) assert.equal(isSafePathSegment(value), true, value);
  for (const value of ["", ".", "..", ".hidden", "a/b", "a\\b", "..\\x", "con", "NUL", "COM1", "lpt9.txt", "a b", null, undefined, 1]) {
    assert.equal(isSafePathSegment(value), false, String(value));
    assert.throws(() => assertSafePathSegment(value, "段"), LibraryFormatError);
  }
});

test("source video id format is V + six digits", () => {
  assert.equal(assertSourceVideoId("V000001"), "V000001");
  for (const value of ["v000001", "V1", "V00001", "V0000001", "V000001/../x", ""]) {
    assert.throws(() => assertSourceVideoId(value), LibraryFormatError);
  }
});

test("library path builders resolve canonical read-only layout", () => {
  const root = path.join("/tmp", "library-verify");
  assert.equal(mixlabRoot(root), path.join(root, ".mixlab-library"));
  assert.equal(releasesRoot(root), path.join(root, ".mixlab-library", "releases"));
  assert.equal(releaseRoot(root, "v000002"), path.join(root, ".mixlab-library", "releases", "v000002"));
  assert.equal(releaseManifestPath(root, "v000002"), path.join(root, ".mixlab-library", "releases", "v000002", "release.json"));
  assert.equal(releaseCatalogPath(root, "v000002"), path.join(root, ".mixlab-library", "releases", "v000002", "catalog.sqlite"));
  assert.equal(releaseSourcePathMapPath(root, "v000002"), path.join(root, ".mixlab-library", "releases", "v000002", "source-path-map.json"));
  assert.equal(currentReleasePointerPath(root), path.join(root, ".mixlab-library", "current-release.json"));
  assert.equal(sourceVideosRoot(root), path.join(root, "source-videos"));
  assert.equal(sourceVideoManifestPath(root, "V000001"), path.join(root, ".mixlab-library", "videos", "V000001", "source-video.json"));
  assert.equal(indexCurrentPointerPath(root), path.join(root, ".mixlab-library", "indexes", "source-transcript-index", "current.json"));
  assert.equal(indexPackageManifestPath(root, "v000001"), path.join(root, ".mixlab-library", "indexes", "source-transcript-index", "v000001", "index-manifest.json"));
  assert.equal(indexPackageSqlitePath(root, "v000001"), path.join(root, ".mixlab-library", "indexes", "source-transcript-index", "v000001", "index.sqlite"));
  assert.equal(releaseSearchIndexVersionPath(root, "v000002", "v000001"),
    path.join(root, ".mixlab-library", "releases", "v000002", "search-index", "source-transcript-index", "v000001"));
  assert.equal(releaseManifestRelativePath("v000002"), ".mixlab-library/releases/v000002/release.json");
});

test("path builders reject unsafe versions / ids and bad roots", () => {
  const root = "/tmp/library-verify";
  assert.throws(() => releaseRoot(root, "../etc"), (error: unknown) =>
    error instanceof LibraryFormatError && error.code === "VERSION_INVALID");
  assert.throws(() => indexPackageManifestPath(root, "v1/../../x"), LibraryFormatError);
  assert.throws(() => sourceVideoManifestPath(root, "V000001/../../x"), LibraryFormatError);
  assert.throws(() => mixlabRoot(""), LibraryFormatError);
  assert.throws(() => mixlabRoot("bad\0root"), LibraryFormatError);
});

test("library-relative path validation rejects absolute/UNC/drive/NUL/traversal", () => {
  for (const value of ["source-videos/a.mp4", "a/b/c.json", "srt/文件.srt"]) assert.equal(isSafeLibraryRelativePath(value), true, value);
  for (const value of ["", " ", "/abs/path", "\\\\server\\share\\x", "C:\\x", "c:/x", "a/../b", "../a", "a\0b", null, 1]) {
    assert.equal(isSafeLibraryRelativePath(value), false, String(value));
    assert.throws(() => artifactFilePath("/tmp/library", value as string), LibraryFormatError);
  }
  assert.deepEqual(libraryRelativePathParts("source-videos\\a.mp4"), ["source-videos", "a.mp4"]);
});

test("resolveLibraryRelativePath never escapes the library root", () => {
  const root = path.join("/tmp", "library-verify");
  assert.equal(resolveLibraryRelativePath(root, "source-videos/a.mp4"), path.join(root, "source-videos", "a.mp4"));
  assert.throws(() => resolveLibraryRelativePath(root, "../outside.mp4"), (error: unknown) =>
    error instanceof LibraryFormatError && error.code === "PATH_UNSAFE");
  assert.throws(() => resolveLibraryRelativePath(root, "a/../../outside"), LibraryFormatError);
  assert.throws(() => resolveLibraryRelativePath(root, "a/..\\..\\outside"), LibraryFormatError);
});
