import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeAsrTextArtifacts } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mixlab-asr-artifacts-"));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

test("writes transcript JSON and SRT artifacts under the source video folder", async () => {
  const libraryRoot = await makeLibraryRoot();

  const result = await writeAsrTextArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    transcript_artifact: {
      schema_version: "1.0",
      source_video_id: "V000001",
      full_text: "现金流，是企业的血液。",
      segments: []
    },
    srt: "1\n00:00:00,000 --> 00:00:03,000\n现金流，是企业的血液。\n"
  });

  assert.deepEqual(result, {
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt"
  });

  assert.equal(
    await readFile(path.join(libraryRoot, result.srt_path), "utf8"),
    "1\n00:00:00,000 --> 00:00:03,000\n现金流，是企业的血液。\n"
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(libraryRoot, result.transcript_path), "utf8")),
    {
      schema_version: "1.0",
      source_video_id: "V000001",
      full_text: "现金流，是企业的血液。",
      segments: []
    }
  );

  const videoDirEntries = await readdir(path.join(libraryRoot, ".mixlab-library", "videos", "V000001"));
  assert.equal(videoDirEntries.some((entry) => entry.includes(".tmp-")), false);
});

test("cleans same-directory temp files when text artifact rename is blocked", async () => {
  const libraryRoot = await makeLibraryRoot();
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", "V000001");

  await mkdir(path.join(videoDir, "transcript.json"), { recursive: true });

  await assert.rejects(() => writeAsrTextArtifacts({
    library_root: libraryRoot,
    source_video_id: "V000001",
    transcript_artifact: {
      schema_version: "1.0",
      source_video_id: "V000001",
      full_text: "partial write should not become visible",
      segments: []
    },
    srt: "1\n00:00:00,000 --> 00:00:01,000\npartial write should not become visible\n"
  }));

  const videoDirEntries = await readdir(videoDir);
  assert.equal(videoDirEntries.some((entry) => entry.includes(".tmp-")), false);
  assert.equal(await pathExists(path.join(videoDir, "subtitles.srt")), false);
  assert.equal((await stat(path.join(videoDir, "transcript.json"))).isDirectory(), true);
});
