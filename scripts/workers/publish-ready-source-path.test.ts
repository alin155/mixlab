import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addAdminSourceFolder,
  scanSourceVideos,
  readSourceVideoManifest
} from "../../packages/library-fs/src/index.ts";
import { resolveReadyPublishSourceVideoPath } from "./publish-ready-source-path.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-ready-publish-path-"));
}

test("resolves ready publish source path from configured source folder metadata", async () => {
  const libraryRoot = await makeLibraryRoot();
  const sourceRoot = path.join(libraryRoot, "course-source");
  const sourceVideoPath = path.join(sourceRoot, "课程", "现金流.mp4");

  await mkdir(path.dirname(sourceVideoPath), { recursive: true });
  await writeFile(sourceVideoPath, "dummy-video-bytes");
  await addAdminSourceFolder(libraryRoot, {
    name: "课程素材",
    path: sourceRoot,
    enabled: true,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  });
  await scanSourceVideos({
    library_root: libraryRoot,
    library_id: "lib_main_001",
    library_name: "主素材库",
    now: "2026-05-02T00:00:00Z"
  });

  const manifest = await readSourceVideoManifest(libraryRoot, "V000001");

  assert.equal(
    await resolveReadyPublishSourceVideoPath({
      library_root: libraryRoot,
      manifest
    }),
    sourceVideoPath
  );
});
