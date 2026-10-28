import assert from "node:assert/strict";
import test from "node:test";
import { resolveIndexCurrentPointerPath, resolveIndexPackageFilePath, resolveSourceVideoPath } from "./index.ts";

test("resolves macOS source video paths from mount root and relative path", () => {
  assert.equal(
    resolveSourceVideoPath({
      mount_root: "/Volumes/MixLab-NAS-Simulated",
      relative_path: "课程/老板现金流课程.mp4"
    }),
    "/Volumes/MixLab-NAS-Simulated/source-videos/课程/老板现金流课程.mp4"
  );
});

test("resolves Windows drive source video paths from mount root and relative path", () => {
  assert.equal(
    resolveSourceVideoPath({
      mount_root: "Z:\\",
      relative_path: "课程/老板现金流课程.mp4"
    }),
    "Z:\\source-videos\\课程\\老板现金流课程.mp4"
  );
});

test("resolves Windows UNC source video paths from mount root and relative path", () => {
  assert.equal(
    resolveSourceVideoPath({
      mount_root: "\\\\NAS01\\MixLab",
      relative_path: "课程/老板现金流课程.mp4"
    }),
    "\\\\NAS01\\MixLab\\source-videos\\课程\\老板现金流课程.mp4"
  );
});

test("rejects absolute and traversal relative paths", () => {
  assert.throws(
    () =>
      resolveSourceVideoPath({
        mount_root: "/Volumes/MixLab-NAS-Simulated",
        relative_path: "/课程/老板现金流课程.mp4"
      }),
    /relative_path must be a library-relative path/
  );

  assert.throws(
    () =>
      resolveSourceVideoPath({
        mount_root: "/Volumes/MixLab-NAS-Simulated",
        relative_path: "../secret.mp4"
      }),
    /relative_path cannot escape source-videos/
  );
});


test("resolves Windows source video paths when the mount root is a drive plus subdirectory", () => {
  assert.equal(
    resolveSourceVideoPath({
      mount_root: "C:\\PublicLibrary",
      relative_path: "课程/老板现金流课程.mp4"
    }),
    "C:\\PublicLibrary\\source-videos\\课程\\老板现金流课程.mp4"
  );

  assert.equal(
    resolveSourceVideoPath({
      mount_root: "D:/MixLab",
      relative_path: "a/b.mp4"
    }),
    "D:\\MixLab\\source-videos\\a\\b.mp4"
  );
});

test("resolves Windows index paths when the mount root is a drive plus subdirectory", () => {
  assert.equal(
    resolveIndexCurrentPointerPath({ mount_root: "C:\\PublicLibrary" }),
    "C:\\PublicLibrary\\.mixlab-library\\indexes\\source-transcript-index\\current.json"
  );

  assert.equal(
    resolveIndexPackageFilePath({
      mount_root: "D:/MixLab",
      index_version: "v000123",
      file_name: "index.sqlite"
    }),
    "D:\\MixLab\\.mixlab-library\\indexes\\source-transcript-index\\v000123\\index.sqlite"
  );
});

test("keeps POSIX mount roots unchanged", () => {
  assert.equal(
    resolveIndexCurrentPointerPath({ mount_root: "/Volumes/MixLab-NAS-Simulated" }),
    "/Volumes/MixLab-NAS-Simulated/.mixlab-library/indexes/source-transcript-index/current.json"
  );
});
