import type { SegmentSpanSelection, TranscriptSegment } from "./types.ts";

export function createSegmentSpanSelection(input: {
  source_video_id: string;
  segments: TranscriptSegment[];
  start_segment_id: string;
  end_segment_id: string;
  pre_roll_ms?: number;
  post_roll_ms?: number;
}): SegmentSpanSelection {
  const startIndex = input.segments.findIndex(
    (segment) => segment.segment_id === input.start_segment_id
  );
  const endIndex = input.segments.findIndex(
    (segment) => segment.segment_id === input.end_segment_id
  );

  if (startIndex === -1 || endIndex === -1) {
    throw new Error("segment not found");
  }

  if (startIndex > endIndex) {
    throw new Error("start segment must be before end segment");
  }

  const selectedSegments = input.segments.slice(startIndex, endIndex + 1);
  const first = selectedSegments[0];
  const last = selectedSegments[selectedSegments.length - 1];

  if (!first || !last) {
    throw new Error("segment not found");
  }

  return {
    source_video_id: input.source_video_id,
    start_segment_id: first.segment_id,
    end_segment_id: last.segment_id,
    begin_ms: Math.max(0, first.begin_ms - (input.pre_roll_ms ?? 0)),
    end_ms: last.end_ms + (input.post_roll_ms ?? 0),
    pre_roll_ms: input.pre_roll_ms ?? 0,
    post_roll_ms: input.post_roll_ms ?? 0,
    selected_text: selectedSegments.map((segment) => segment.text).join("")
  };
}
