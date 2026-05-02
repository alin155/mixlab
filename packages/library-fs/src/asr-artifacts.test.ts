import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeAsrTextArtifacts } from "./index.ts";

async function makeLibraryRoot(): Promise<string> {
  const root = await mkdir(path.join(os.tmpdir(), `mixlab-asr-artifacts-${Date.now()}-`), {
    recursive: true
  });

  if (!root) {
    throw new Error("failed to create test library root");
  }

  return root;
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
});
