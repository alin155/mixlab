import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AdminWorkerArtifactCommitError,
  assertAdminWorkerTextArtifactCommitReady,
  inspectAdminWorkerTextArtifactCommit
} from "./admin-worker-artifact-guard.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-artifact-guard-"));
}

async function writeTextArtifacts(libraryRoot: string, sourceVideoId: string): Promise<void> {
  const videoDir = path.join(libraryRoot, ".mixlab-library", "videos", sourceVideoId);
  await mkdir(videoDir, { recursive: true });
  await writeFile(path.join(videoDir, "transcript.json"), "{\"segments\":[]}\n", "utf8");
  await writeFile(path.join(videoDir, "subtitles.srt"), "", "utf8");
}

test("allows text artifact commits when transcript and srt files exist under the matching video folder", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeTextArtifacts(libraryRoot, "V000001");

  const plan = await assertAdminWorkerTextArtifactCommitReady({
    library_root: libraryRoot,
    source_video_id: "V000001",
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt"
  });

  assert.equal(plan.safe_to_commit, true);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(
    plan.checks.map((check) => ({
      kind: check.kind,
      safe_path: check.safe_path,
      scoped_to_source_video: check.scoped_to_source_video,
      exists: check.exists,
      blocker: check.blocker
    })),
    [
      {
        kind: "transcript",
        safe_path: true,
        scoped_to_source_video: true,
        exists: true,
        blocker: ""
      },
      {
        kind: "srt",
        safe_path: true,
        scoped_to_source_video: true,
        exists: true,
        blocker: ""
      }
    ]
  );
});

test("blocks text artifact commits when required files are missing", async () => {
  const libraryRoot = await makeLibraryRoot();

  const plan = await inspectAdminWorkerTextArtifactCommit({
    library_root: libraryRoot,
    source_video_id: "V000001",
    transcript_path: ".mixlab-library/videos/V000001/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt"
  });

  assert.equal(plan.safe_to_commit, false);
  assert.deepEqual(plan.blockers, [
    "transcript: transcript_path file is missing",
    "srt: srt_path file is missing"
  ]);
  await assert.rejects(
    () => assertAdminWorkerTextArtifactCommitReady({
      library_root: libraryRoot,
      source_video_id: "V000001",
      transcript_path: ".mixlab-library/videos/V000001/transcript.json",
      srt_path: ".mixlab-library/videos/V000001/subtitles.srt"
    }),
    (error) => {
      assert.equal(error instanceof AdminWorkerArtifactCommitError, true);
      assert.equal((error as AdminWorkerArtifactCommitError).code, "artifact_commit_blocked");
      assert.match((error as Error).message, /transcript_path file is missing/);
      return true;
    }
  );
});

test("blocks unsafe or cross-video text artifact paths before commit", async () => {
  const libraryRoot = await makeLibraryRoot();
  await writeTextArtifacts(libraryRoot, "V000002");

  const plan = await inspectAdminWorkerTextArtifactCommit({
    library_root: libraryRoot,
    source_video_id: "V000001",
    transcript_path: "/tmp/transcript.json",
    srt_path: ".mixlab-library/videos/V000002/subtitles.srt"
  });

  assert.equal(plan.safe_to_commit, false);
  assert.deepEqual(plan.blockers, [
    "transcript: transcript_path is not a safe library-relative path",
    "srt: srt_path must be under .mixlab-library/videos/V000001/"
  ]);

  const traversal = await inspectAdminWorkerTextArtifactCommit({
    library_root: libraryRoot,
    source_video_id: "V000001",
    transcript_path: ".mixlab-library/videos/V000001/../V000002/transcript.json",
    srt_path: ".mixlab-library/videos/V000001/subtitles.srt"
  });

  assert.deepEqual(traversal.blockers, [
    "transcript: transcript_path is not a safe library-relative path",
    "srt: srt_path file is missing"
  ]);
});
