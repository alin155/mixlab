import assert from "node:assert/strict";
import test from "node:test";
import { buildCutKeyframeProbeArgs, parseCutKeyframeProbeTimes } from "./keyframe-probe.ts";

test("builds a keyframe probe plan the Windows ffprobe field set supports", () => {
  assert.deepEqual(buildCutKeyframeProbeArgs({ source_path: "/source/long-gop.mp4", begin_ms: 12_500 }), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-select_streams",
    "v:0",
    "-skip_frame",
    "nokey",
    "-show_entries",
    "frame=key_frame,best_effort_timestamp_time",
    "-read_intervals",
    "2.500%13.500",
    "/source/long-gop.mp4"
  ]);
});

test("parses best_effort_timestamp_time and legacy time fields", () => {
  const stdout = JSON.stringify({
    frames: [
      { key_frame: 1, best_effort_timestamp_time: "0.250000" },
      { key_frame: 1, best_effort_timestamp_time: "0.750000" },
      { key_frame: 1, pkt_pts_time: "1.250000" },
      { key_frame: 1, pts_time: "1.750000" }
    ]
  });

  assert.deepEqual(parseCutKeyframeProbeTimes(stdout), [250, 750, 1250, 1750]);
});

test("deduplicates and ignores invalid keyframe timestamps", () => {
  const stdout = JSON.stringify({
    frames: [
      { best_effort_timestamp_time: "2.000000" },
      { best_effort_timestamp_time: "2.000000" },
      { best_effort_timestamp_time: "not-a-time" },
      { best_effort_timestamp_time: "-1.000000" }
    ]
  });

  assert.deepEqual(parseCutKeyframeProbeTimes(stdout), [2000]);
});
