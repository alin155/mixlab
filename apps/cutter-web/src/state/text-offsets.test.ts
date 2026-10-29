import assert from "node:assert/strict";
import test from "node:test";
import type { SourceVideoCard, TranscriptSegment } from "../api.ts";
import { createCutListItemFromSegments } from "./cut-list.ts";
import {
  codePointLength,
  codePointSlice,
  domRangePrefixCodePointOffset,
  normalizeCodePointOffset,
  timeAtCodePointOffset
} from "./text-offsets.ts";
import {
  continuousTranscriptSegments,
  isSingleSegmentClick,
  nextTranscriptSelectionRange
} from "./transcript-selection.ts";

const sourceVideo: SourceVideoCard = {
  source_video_id: "V000001",
  title: "现金流",
  duration_ms: 60_000,
  media_url: "/media.mp4",
  cover_url: "",
  detail_url: "",
  subtitles_url: "",
  relative_path: "经营课/现金流.mp4"
};

function emojiSegment(): TranscriptSegment {
  return { segment_id: "s-emoji", begin_ms: 0, end_ms: 1000, text: "开场😀剪这段" };
}

function extendedCjkSegment(): TranscriptSegment {
  return { segment_id: "s-ext", begin_ms: 0, end_ms: 1000, text: "𠮷字" };
}

test("code point helpers count surrogate pairs as one character", () => {
  assert.equal(codePointLength("开场😀剪这段"), 6);
  assert.equal("开场😀剪这段".length, 7); // UTF-16 code units
  assert.equal(codePointLength("𠮷字"), 2);
  assert.equal(codePointSlice("开场😀剪这段", 3, 6), "剪这段");
  assert.equal(codePointSlice("𠮷字", 1, 2), "字");
  assert.equal(normalizeCodePointOffset(99, "abc", 0), 3);
  assert.equal(normalizeCodePointOffset(-2, "abc", 0), 0);
  assert.equal(normalizeCodePointOffset(undefined, "abc", 1), 1);
});

test("DOM UTF-16 prefix offsets are converted to code points", () => {
  const prefix = "开场😀";
  assert.equal(prefix.length, 4); // DOM Range.toString().length would give 4
  assert.equal(domRangePrefixCodePointOffset(prefix), 3);
  assert.equal(domRangePrefixCodePointOffset("𠮷"), 1);
  assert.equal(domRangePrefixCodePointOffset(""), 0);
});

test("timeAtCodePointOffset estimates inside the sentence by code point ratio", () => {
  const segment = emojiSegment();
  assert.equal(timeAtCodePointOffset(segment, 0), 0);
  assert.equal(timeAtCodePointOffset(segment, 3), 500);
  assert.equal(timeAtCodePointOffset(segment, 6), 1000);
  assert.equal(timeAtCodePointOffset(segment, 99), 1000);
});

test("emoji selection keeps selected_text and begin/end_ms aligned (CW-02)", () => {
  const selected = createCutListItemFromSegments({
    sourceVideo,
    segments: [emojiSegment()],
    startCharOffset: 3,
    endCharOffset: 6,
    cutMode: "precise"
  });

  assert.equal(selected.selected_text, "剪这段");
  assert.equal(selected.begin_ms, 500);
  assert.equal(selected.end_ms, 1000);
  assert.equal(selected.duration_ms, 500);
});

test("CJK extension character selection keeps text and time aligned", () => {
  const selected = createCutListItemFromSegments({
    sourceVideo,
    segments: [extendedCjkSegment()],
    startCharOffset: 1,
    endCharOffset: 2
  });

  assert.equal(selected.selected_text, "字");
  assert.equal(selected.begin_ms, 500);
  assert.equal(selected.end_ms, 1000);
});

test("single sentence click yields the whole-sentence range (CW-16)", () => {
  assert.equal(isSingleSegmentClick("s-1", "s-1"), true);
  assert.equal(isSingleSegmentClick("s-1", "s-2"), false);
  assert.equal(isSingleSegmentClick(undefined, undefined), false);

  const segments: TranscriptSegment[] = [
    { segment_id: "s-1", begin_ms: 0, end_ms: 1000, text: "第一句。" },
    { segment_id: "s-2", begin_ms: 1000, end_ms: 2000, text: "第二句。" }
  ];
  const firstClick = nextTranscriptSelectionRange({}, "s-2");
  assert.deepEqual(firstClick, { startSegmentId: "s-2", endSegmentId: "s-2" });
  assert.deepEqual(
    continuousTranscriptSegments(segments, firstClick).map((segment) => segment.segment_id),
    ["s-2"]
  );

  // Whole-sentence mode is single-select: clicking another sentence moves the
  // selection to that sentence instead of extending a pending drag range.
  const secondClick = nextTranscriptSelectionRange(firstClick, "s-1");
  assert.deepEqual(secondClick, { startSegmentId: "s-1", endSegmentId: "s-1" });
  assert.deepEqual(
    continuousTranscriptSegments(segments, secondClick).map((segment) => segment.segment_id),
    ["s-1"]
  );
});
