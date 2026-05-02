import assert from "node:assert/strict";
import test from "node:test";
import { createSegmentSpanSelection, type TranscriptSegment } from "./index.ts";

const segments: TranscriptSegment[] = [
  {
    segment_id: "V000001-S000001",
    index: 0,
    begin_ms: 10_000,
    end_ms: 14_000,
    begin_char: 0,
    end_char: 16,
    normalized_begin_char: 0,
    normalized_end_char: 15,
    text: "现金流是企业的血液。",
    normalized_text: "现金流是企业的血液",
    confidence: 0.96
  },
  {
    segment_id: "V000001-S000002",
    index: 1,
    begin_ms: 14_000,
    end_ms: 18_500,
    begin_char: 16,
    end_char: 33,
    normalized_begin_char: 15,
    normalized_end_char: 31,
    text: "不是账面数字。",
    normalized_text: "不是账面数字",
    confidence: 0.95
  },
  {
    segment_id: "V000001-S000003",
    index: 2,
    begin_ms: 18_500,
    end_ms: 22_000,
    begin_char: 33,
    end_char: 50,
    normalized_begin_char: 31,
    normalized_end_char: 47,
    text: "它决定企业是否安全。",
    normalized_text: "它决定企业是否安全",
    confidence: 0.94
  }
];

test("creates one continuous segment span for multi-sentence selections", () => {
  assert.deepEqual(
    createSegmentSpanSelection({
      source_video_id: "V000001",
      segments,
      start_segment_id: "V000001-S000001",
      end_segment_id: "V000001-S000003"
    }),
    {
      source_video_id: "V000001",
      start_segment_id: "V000001-S000001",
      end_segment_id: "V000001-S000003",
      begin_ms: 10_000,
      end_ms: 22_000,
      pre_roll_ms: 0,
      post_roll_ms: 0,
      selected_text: "现金流是企业的血液。不是账面数字。它决定企业是否安全。"
    }
  );
});

test("rejects non-existent segment ids", () => {
  assert.throws(
    () =>
      createSegmentSpanSelection({
        source_video_id: "V000001",
        segments,
        start_segment_id: "V000001-S000001",
        end_segment_id: "V000001-S999999"
      }),
    /segment not found/
  );
});
