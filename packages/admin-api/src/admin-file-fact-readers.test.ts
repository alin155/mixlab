import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  adminLibraryManifestPath,
  adminPreprocessJobPath
} from "./admin-library-paths.ts";
import {
  isNotFoundError,
  readAdminJsonFile,
  readAdminLibraryManifest,
  readAdminPreprocessJob
} from "./admin-file-fact-readers.ts";

async function withTempLibrary(fn: (libraryRoot: string) => Promise<void>): Promise<void> {
  const libraryRoot = await mkdtemp(path.join(tmpdir(), "mixlab-admin-file-facts-"));
  try {
    await fn(libraryRoot);
  } finally {
    await rm(libraryRoot, { recursive: true, force: true });
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

test("admin file fact readers parse generic JSON files", async () => {
  await withTempLibrary(async (libraryRoot) => {
    const filePath = path.join(libraryRoot, "fact.json");
    await writeJson(filePath, { ok: true, count: 2 });

    assert.deepEqual(await readAdminJsonFile(filePath), { ok: true, count: 2 });
  });
});

test("admin file fact readers return library manifests and hide missing or malformed files", async () => {
  await withTempLibrary(async (libraryRoot) => {
    const manifestPath = adminLibraryManifestPath(libraryRoot);
    await writeJson(manifestPath, {
      library_id: "library-main",
      name: "Public Library",
      video_count: 3,
      ready_video_count: 1,
      processing_video_count: 1,
      queued_video_count: 1,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0,
      updated_at: "2026-06-27T00:00:00.000Z"
    });

    assert.deepEqual(await readAdminLibraryManifest(libraryRoot), {
      library_id: "library-main",
      name: "Public Library",
      video_count: 3,
      ready_video_count: 1,
      processing_video_count: 1,
      queued_video_count: 1,
      unprocessed_video_count: 0,
      failed_video_count: 0,
      index_required_video_count: 0,
      updated_at: "2026-06-27T00:00:00.000Z"
    });

    assert.equal(await readAdminLibraryManifest(path.join(libraryRoot, "missing")), null);
    await writeFile(manifestPath, "{", "utf8");
    assert.equal(await readAdminLibraryManifest(libraryRoot), null);
  });
});

test("admin file fact readers return preprocess jobs and hide missing or malformed files", async () => {
  await withTempLibrary(async (libraryRoot) => {
    const jobPath = adminPreprocessJobPath(libraryRoot, "V000001");
    await writeJson(jobPath, {
      source_video_id: "V000001",
      status: "processing",
      attempt: 2,
      claimed_at: "2026-06-27T00:01:00.000Z",
      current_stage: "transcribe"
    });

    assert.deepEqual(await readAdminPreprocessJob(libraryRoot, "V000001"), {
      source_video_id: "V000001",
      status: "processing",
      attempt: 2,
      claimed_at: "2026-06-27T00:01:00.000Z",
      current_stage: "transcribe"
    });

    assert.equal(await readAdminPreprocessJob(libraryRoot, "V999999"), null);
    await writeFile(jobPath, "{", "utf8");
    assert.equal(await readAdminPreprocessJob(libraryRoot, "V000001"), null);
  });
});

test("admin file fact readers identify ENOENT errors without masking other errors", () => {
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });

  assert.equal(isNotFoundError(missing), true);
  assert.equal(isNotFoundError(denied), false);
  assert.equal(isNotFoundError(new Error("plain")), false);
});
