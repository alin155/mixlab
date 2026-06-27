import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  readAdminCurrentIndexMetadata,
  readAdminCurrentIndexVersion
} from "./admin-current-index-query.ts";
import {
  adminSourceTranscriptCurrentPath,
  adminSourceTranscriptIndexRoot,
  adminSourceTranscriptIndexSqlitePath
} from "./admin-library-paths.ts";

async function tempLibraryRoot(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), "mixlab-current-index-"));
}

test("current index query reads current pointer from the admin transcript index path", async () => {
  const libraryRoot = await tempLibraryRoot();
  await mkdir(adminSourceTranscriptIndexRoot(libraryRoot), { recursive: true });
  await writeFile(
    adminSourceTranscriptCurrentPath(libraryRoot),
    JSON.stringify({ current_version: "v010471" }),
    "utf8"
  );

  assert.equal(await readAdminCurrentIndexVersion(libraryRoot), "v010471");
});

test("current index query returns empty version for missing or malformed current pointer", async () => {
  const missingLibraryRoot = await tempLibraryRoot();
  assert.equal(await readAdminCurrentIndexVersion(missingLibraryRoot), "");

  const malformedLibraryRoot = await tempLibraryRoot();
  await mkdir(adminSourceTranscriptIndexRoot(malformedLibraryRoot), { recursive: true });
  await writeFile(adminSourceTranscriptCurrentPath(malformedLibraryRoot), "{", "utf8");

  assert.equal(await readAdminCurrentIndexVersion(malformedLibraryRoot), "");
});

test("current index metadata resolves sqlite path from the current version", async () => {
  const libraryRoot = "/library";
  const paths: string[] = [];

  const metadata = await readAdminCurrentIndexMetadata(libraryRoot, {
    async read_current_index_version() {
      return "v010471";
    },
    read_source_transcript_sqlite_index_metadata(indexFilePath) {
      paths.push(indexFilePath);
      return {
        library_id: "lib_main_001",
        index_version: "v010471",
        created_at: "2026-06-27T00:00:00.000Z",
        source_video_count: 10_471,
        segment_count: 972_776,
        schema_version: "1.0"
      };
    }
  });

  assert.deepEqual(metadata, {
    source_video_count: 10_471,
    segment_count: 972_776
  });
  assert.deepEqual(paths, [
    adminSourceTranscriptIndexSqlitePath(libraryRoot, "v010471")
  ]);
});

test("current index metadata returns null without a current version or readable sqlite metadata", async () => {
  assert.equal(
    await readAdminCurrentIndexMetadata("/library", {
      async read_current_index_version() {
        return "";
      },
      read_source_transcript_sqlite_index_metadata() {
        throw new Error("should not read sqlite without current version");
      }
    }),
    null
  );

  assert.equal(
    await readAdminCurrentIndexMetadata("/library", {
      async read_current_index_version() {
        return "v010471";
      },
      read_source_transcript_sqlite_index_metadata() {
        throw new Error("sqlite missing");
      }
    }),
    null
  );
});
