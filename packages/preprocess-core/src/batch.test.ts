import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreprocessBatchPlan,
  isSupportedSourceVideoFileName,
  runSourceVideoTextPreprocessBatch
} from "./batch.ts";

test("filters source video files and ignores macOS resource fork entries", () => {
  assert.equal(isSupportedSourceVideoFileName("C0017.MP4"), true);
  assert.equal(isSupportedSourceVideoFileName("lesson.mov"), true);
  assert.equal(isSupportedSourceVideoFileName("._C0017.MP4"), false);
  assert.equal(isSupportedSourceVideoFileName(".DS_Store"), false);
  assert.equal(isSupportedSourceVideoFileName("notes.txt"), false);
});

test("builds a stable sorted batch plan with generated source video ids", () => {
  assert.deepEqual(
    buildPreprocessBatchPlan({
      source_file_paths: [
        "/Volumes/test/C0020.MP4",
        "/Volumes/test/._C0017.MP4",
        "/Volumes/test/C0017.MP4",
        "/Volumes/test/C0018.MP4"
      ],
      source_video_id_prefix: "V_BATCH"
    }),
    [
      {
        source_video_id: "V_BATCH_001",
        source_video_path: "/Volumes/test/C0017.MP4",
        file_name: "C0017.MP4"
      },
      {
        source_video_id: "V_BATCH_002",
        source_video_path: "/Volumes/test/C0018.MP4",
        file_name: "C0018.MP4"
      },
      {
        source_video_id: "V_BATCH_003",
        source_video_path: "/Volumes/test/C0020.MP4",
        file_name: "C0020.MP4"
      }
    ]
  );
});

test("can limit and explicitly choose source file names for a live batch", () => {
  assert.deepEqual(
    buildPreprocessBatchPlan({
      source_file_paths: [
        "/Volumes/test/C0017.MP4",
        "/Volumes/test/C0018.MP4",
        "/Volumes/test/C0035.MP4"
      ],
      source_video_id_prefix: "V_LIVE",
      file_names: ["C0035.MP4", "C0017.MP4"],
      limit: 1
    }),
    [
      {
        source_video_id: "V_LIVE_001",
        source_video_path: "/Volumes/test/C0017.MP4",
        file_name: "C0017.MP4"
      }
    ]
  );
});

test("rejects invalid batch limits", () => {
  assert.throws(
    () =>
      buildPreprocessBatchPlan({
        source_file_paths: ["/Volumes/test/C0017.MP4"],
        source_video_id_prefix: "V_BATCH",
        limit: 0
      }),
    /limit must be greater than 0/
  );
});

test("runs batch preprocessing sequentially and continues after item failures", async () => {
  const events: string[] = [];
  let timestamp = 1_000;

  const result = await runSourceVideoTextPreprocessBatch({
    plan: [
      {
        source_video_id: "V_BATCH_001",
        source_video_path: "/Volumes/test/C0017.MP4",
        file_name: "C0017.MP4"
      },
      {
        source_video_id: "V_BATCH_002",
        source_video_path: "/Volumes/test/C0018.MP4",
        file_name: "C0018.MP4"
      },
      {
        source_video_id: "V_BATCH_003",
        source_video_path: "/Volumes/test/C0035.MP4",
        file_name: "C0035.MP4"
      }
    ],
    now_ms() {
      timestamp += 250;
      return timestamp;
    },
    async process_item(item) {
      events.push(`start:${item.file_name}`);

      if (item.file_name === "C0018.MP4") {
        throw new Error("asr timeout");
      }

      events.push(`end:${item.file_name}`);

      return {
        source_video_id: item.source_video_id,
        audio_path: `.mixlab-library/videos/${item.source_video_id}/asr-audio/audio.mp3`,
        audio_object_key: `temporary/${item.source_video_id}/audio.mp3`,
        audio_file_url: `oss://temporary/${item.source_video_id}/audio.mp3`,
        asr_task_id: `task-${item.source_video_id}`,
        transcription_url: `https://example.com/${item.source_video_id}.json?signature=secret`,
        transcript_path: `.mixlab-library/videos/${item.source_video_id}/transcript.json`,
        srt_path: `.mixlab-library/videos/${item.source_video_id}/subtitles.srt`,
        duration_ms: 3_000,
        segment_count: 1
      };
    }
  });

  assert.deepEqual(events, [
    "start:C0017.MP4",
    "end:C0017.MP4",
    "start:C0018.MP4",
    "start:C0035.MP4",
    "end:C0035.MP4"
  ]);
  assert.equal(result.total_count, 3);
  assert.equal(result.succeeded_count, 2);
  assert.equal(result.failed_count, 1);
  assert.deepEqual(
    result.items.map((item) => ({
      file_name: item.file_name,
      status: item.status,
      elapsed_ms: item.elapsed_ms
    })),
    [
      {
        file_name: "C0017.MP4",
        status: "succeeded",
        elapsed_ms: 250
      },
      {
        file_name: "C0018.MP4",
        status: "failed",
        elapsed_ms: 250
      },
      {
        file_name: "C0035.MP4",
        status: "succeeded",
        elapsed_ms: 250
      }
    ]
  );

  const failed = result.items.find((item) => item.status === "failed");
  assert.equal(failed?.error_message, "asr timeout");
});
