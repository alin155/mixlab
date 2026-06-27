import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  readPreprocessJobSnapshotsForAdminReadModelReconcile
} from "./admin-read-model-reconcile-snapshot-reader.ts";

function sourceVideoManifest(input: Partial<SourceVideoManifest> & {
  source_video_id: string;
}): SourceVideoManifest {
  const sourceVideoId = input.source_video_id;
  const { source_video_id: _sourceVideoId, ...rest } = input;

  return {
    source_video_id: sourceVideoId,
    relative_path: `source/${sourceVideoId}.mp4`,
    logical_uri: `mixlab://source/${sourceVideoId}.mp4`,
    title: sourceVideoId,
    duration_ms: 1000,
    width: 1920,
    height: 1080,
    fps: 25,
    codec: "h264",
    file_size: 1234,
    content_hash: "sha256:test",
    preprocess_status: "queued",
    visible_to_cutters: false,
    transcript_path: `.mixlab-library/videos/${sourceVideoId}/transcript.json`,
    srt_path: `.mixlab-library/videos/${sourceVideoId}/subtitles.srt`,
    keyframes_path: `.mixlab-library/videos/${sourceVideoId}/keyframes.json`,
    cover_path: `.mixlab-library/videos/${sourceVideoId}/cover.jpg`,
    ...rest
  };
}

test("read-model reconcile preprocess job snapshot reader reports batch progress", async () => {
  const progressUpdates: Array<Record<string, unknown>> = [];
  let cancellationCheckCount = 0;
  const manifests = ["V000001", "V000002", "V000003"].map((sourceVideoId) =>
    sourceVideoManifest({ source_video_id: sourceVideoId })
  );

  const snapshots = await readPreprocessJobSnapshotsForAdminReadModelReconcile({
    library_root: "/unused",
    manifests,
    total_source_video_count: 3,
    batch_size: 2,
    control: {
      update_progress(update) {
        progressUpdates.push(update);
      },
      assert_not_cancelled() {
        cancellationCheckCount += 1;
      }
    },
    read_preprocess_job: async (sourceVideoId) => ({
      claimed_at: sourceVideoId === "V000001" ? "2026-06-25T12:00:00.000Z" : "",
      completed_at: sourceVideoId === "V000003" ? "2026-06-25T12:02:00.000Z" : ""
    })
  });

  assert.deepEqual(
    progressUpdates.map((update) => update.step),
    [
      "preprocess-job-snapshots",
      "preprocess-job-snapshots",
      "preprocess-job-snapshots"
    ]
  );
  assert.deepEqual(
    progressUpdates.map((update) => update.preprocess_job_snapshot_count),
    [0, 2, 3]
  );
  assert.deepEqual(
    progressUpdates.map((update) => update.total_preprocess_job_snapshot_count),
    [3, 3, 3]
  );
  assert.deepEqual(
    progressUpdates.map((update) => update.step_percent),
    [0, 67, 100]
  );
  assert.deepEqual(
    snapshots.map((snapshot) => [
      snapshot.source_video_id,
      snapshot.claimed_at,
      snapshot.completed_at
    ]),
    [
      ["V000001", "2026-06-25T12:00:00.000Z", ""],
      ["V000002", "", ""],
      ["V000003", "", "2026-06-25T12:02:00.000Z"]
    ]
  );
  assert.equal(progressUpdates.at(-1)?.percent, 90);
  assert.equal(cancellationCheckCount, 3);
});

test("read-model reconcile preprocess job snapshot reader handles empty manifest snapshots", async () => {
  const progressUpdates: Array<Record<string, unknown>> = [];
  let readCount = 0;

  const snapshots = await readPreprocessJobSnapshotsForAdminReadModelReconcile({
    library_root: "/unused",
    manifests: [],
    total_source_video_count: 0,
    control: {
      update_progress(update) {
        progressUpdates.push(update);
      },
      assert_not_cancelled() {}
    },
    read_preprocess_job: async () => {
      readCount += 1;
      return null;
    }
  });

  assert.deepEqual(snapshots, []);
  assert.equal(readCount, 0);
  assert.equal(progressUpdates.length, 1);
  assert.equal(progressUpdates[0]?.percent, 90);
  assert.equal(progressUpdates[0]?.message, "没有 preprocess job 快照需要读取。");
});
