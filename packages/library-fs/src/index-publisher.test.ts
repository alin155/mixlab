import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publishIndexPackage, readCurrentIndexPointer } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-index-publish-"));
}

test("publishes an immutable index package and switches current pointer", async () => {
  const libraryRoot = await makeLibraryRoot();

  await publishIndexPackage({
    library_root: libraryRoot,
    manifest: {
      index_version: "v000001",
      library_id: "lib_main_001",
      created_at: "2026-05-01T00:00:00Z",
      ready_video_count: 2,
      source_video_ids: ["V000001", "V000002"],
      schema_version: "1.0"
    },
    index_sqlite_bytes: Buffer.from("sqlite-spike-v1")
  });

  const current = await readCurrentIndexPointer(libraryRoot);

  assert.deepEqual(current, {
    library_id: "lib_main_001",
    current_version: "v000001",
    updated_at: "2026-05-01T00:00:00Z"
  });

  const packageRoot = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    "v000001"
  );

  assert.equal((await stat(path.join(packageRoot, "index.sqlite"))).isFile(), true);
  assert.equal((await stat(path.join(packageRoot, "index-manifest.json"))).isFile(), true);
});

test("publishes a second index package without modifying the old package", async () => {
  const libraryRoot = await makeLibraryRoot();

  await publishIndexPackage({
    library_root: libraryRoot,
    manifest: {
      index_version: "v000001",
      library_id: "lib_main_001",
      created_at: "2026-05-01T00:00:00Z",
      ready_video_count: 1,
      source_video_ids: ["V000001"],
      schema_version: "1.0"
    },
    index_sqlite_bytes: Buffer.from("sqlite-spike-v1")
  });

  await publishIndexPackage({
    library_root: libraryRoot,
    manifest: {
      index_version: "v000002",
      library_id: "lib_main_001",
      created_at: "2026-05-01T00:05:00Z",
      ready_video_count: 2,
      source_video_ids: ["V000001", "V000002"],
      schema_version: "1.0"
    },
    index_sqlite_bytes: Buffer.from("sqlite-spike-v2")
  });

  assert.equal((await readCurrentIndexPointer(libraryRoot)).current_version, "v000002");

  const oldIndex = await readFile(
    path.join(
      libraryRoot,
      ".mixlab-library",
      "indexes",
      "source-transcript-index",
      "v000001",
      "index.sqlite"
    ),
    "utf8"
  );

  assert.equal(oldIndex, "sqlite-spike-v1");
});

test("does not switch current pointer when the new index manifest is invalid", async () => {
  const libraryRoot = await makeLibraryRoot();

  await publishIndexPackage({
    library_root: libraryRoot,
    manifest: {
      index_version: "v000001",
      library_id: "lib_main_001",
      created_at: "2026-05-01T00:00:00Z",
      ready_video_count: 1,
      source_video_ids: ["V000001"],
      schema_version: "1.0"
    },
    index_sqlite_bytes: Buffer.from("sqlite-spike-v1")
  });

  await assert.rejects(
    () =>
      publishIndexPackage({
        library_root: libraryRoot,
        manifest: {
          index_version: "v000002",
          library_id: "lib_main_001",
          created_at: "2026-05-01T00:05:00Z",
          ready_video_count: 3,
          source_video_ids: ["V000001", "V000002"],
          schema_version: "1.0"
        },
        index_sqlite_bytes: Buffer.from("invalid")
      }),
    /ready_video_count must equal source_video_ids length/
  );

  assert.equal((await readCurrentIndexPointer(libraryRoot)).current_version, "v000001");
});
