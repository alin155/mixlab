import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceVideoPath } from "./index.ts";

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
