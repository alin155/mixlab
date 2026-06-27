import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminFileExists,
  adminImageContentType,
  adminVideoArtifactsRoot,
  resolveAdminVideoArtifactPath,
  safeAdminRelativeArtifactPath
} from "./admin-source-video-artifact-path.ts";

test("safe artifact paths reject absolute, parent, drive, and empty paths", () => {
  assert.equal(safeAdminRelativeArtifactPath("artifacts/V000001/cover.jpg"), path.join("artifacts", "V000001", "cover.jpg"));
  assert.equal(safeAdminRelativeArtifactPath("artifacts\\V000001\\cover.jpg"), path.join("artifacts", "V000001", "cover.jpg"));
  assert.equal(safeAdminRelativeArtifactPath(""), null);
  assert.equal(safeAdminRelativeArtifactPath("   "), null);
  assert.equal(safeAdminRelativeArtifactPath("/tmp/cover.jpg"), null);
  assert.equal(safeAdminRelativeArtifactPath("../cover.jpg"), null);
  assert.equal(safeAdminRelativeArtifactPath("artifacts/../cover.jpg"), null);
  assert.equal(safeAdminRelativeArtifactPath("C:/bad/cover.jpg"), null);
});

test("video artifact resolver preserves existing relative and library URI behavior", () => {
  const libraryRoot = "/library";

  assert.equal(
    adminVideoArtifactsRoot({
      library_root: libraryRoot,
      source_video_id: "V000001"
    }),
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001")
  );
  assert.equal(
    resolveAdminVideoArtifactPath({
      library_root: libraryRoot,
      source_video_id: "V000001",
      artifact_path: ".mixlab-library/videos/V000001/cover.jpg"
    }),
    path.join(libraryRoot, ".mixlab-library", "videos", "V000001", "cover.jpg")
  );
  assert.equal(
    resolveAdminVideoArtifactPath({
      library_root: libraryRoot,
      source_video_id: "V000002",
      artifact_path: "library://video/V000002/covers/cover.jpg"
    }),
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "covers", "cover.jpg")
  );
  assert.equal(
    resolveAdminVideoArtifactPath({
      library_root: libraryRoot,
      source_video_id: "V000002",
      artifact_path: "library://video/V000002",
      fallback_file_name: "cover.jpg"
    }),
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "cover.jpg")
  );
  assert.equal(
    resolveAdminVideoArtifactPath({
      library_root: libraryRoot,
      source_video_id: "V000002",
      artifact_path: "library://video/V000003/cover.jpg",
      fallback_file_name: "cover.jpg"
    }),
    null
  );
  assert.equal(
    resolveAdminVideoArtifactPath({
      library_root: libraryRoot,
      source_video_id: "V000002",
      artifact_path: "/tmp/cover.jpg",
      fallback_file_name: "cover.jpg"
    }),
    path.join(libraryRoot, ".mixlab-library", "videos", "V000002", "cover.jpg")
  );
});

test("image content type follows known extensions and defaults to jpeg", () => {
  assert.equal(adminImageContentType("/library/cover.PNG"), "image/png");
  assert.equal(adminImageContentType("/library/cover.webp"), "image/webp");
  assert.equal(adminImageContentType("/library/cover.svg"), "image/svg+xml");
  assert.equal(adminImageContentType("/library/cover.jpg"), "image/jpeg");
  assert.equal(adminImageContentType("/library/cover.bin"), "image/jpeg");
});

test("admin file exists only returns true for files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mixlab-admin-artifact-path-"));
  const folder = path.join(root, "folder");
  const filePath = path.join(root, "cover.jpg");
  await mkdir(folder);
  await writeFile(filePath, "cover");

  assert.equal(await adminFileExists(filePath), true);
  assert.equal(await adminFileExists(folder), false);
  assert.equal(await adminFileExists(path.join(root, "missing.jpg")), false);
});
