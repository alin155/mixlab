import type { TranscriptSegment } from "../api.ts";

export interface TranscriptSelectionRange {
  startSegmentId?: string;
  endSegmentId?: string;
}

export interface TranscriptSelectionOptions extends TranscriptSelectionRange {
  fallbackSegmentIds?: readonly string[];
}

function firstExistingIndex(
  segments: readonly TranscriptSegment[],
  segmentIds: readonly string[] | undefined
): number {
  if (!segmentIds || segmentIds.length === 0) {
    return -1;
  }

  return segments.findIndex((segment) => segmentIds.includes(segment.segment_id));
}

function lastExistingIndex(
  segments: readonly TranscriptSegment[],
  segmentIds: readonly string[] | undefined
): number {
  if (!segmentIds || segmentIds.length === 0) {
    return -1;
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segmentIds.includes(segments[index]!.segment_id)) {
      return index;
    }
  }

  return -1;
}

export function nextTranscriptSelectionRange(
  current: TranscriptSelectionRange,
  clickedSegmentId: string
): TranscriptSelectionRange {
  if (!current.startSegmentId || current.endSegmentId) {
    return {
      startSegmentId: clickedSegmentId,
      endSegmentId: clickedSegmentId
    };
  }

  return {
    startSegmentId: current.startSegmentId,
    endSegmentId: clickedSegmentId
  };
}

export function transcriptSelectionRangeFromDrag(
  startSegmentId: string,
  endSegmentId: string
): TranscriptSelectionRange {
  return {
    startSegmentId,
    endSegmentId
  };
}

export function shouldSuppressTranscriptClickAfterMouseUp(
  startSegmentId: string,
  endSegmentId: string | undefined
): boolean {
  return Boolean(endSegmentId && startSegmentId !== endSegmentId);
}

export function continuousTranscriptSegments(
  segments: readonly TranscriptSegment[],
  options: TranscriptSelectionOptions = {}
): TranscriptSegment[] {
  const explicitIds =
    options.startSegmentId && options.endSegmentId
      ? [options.startSegmentId, options.endSegmentId]
      : undefined;
  const ids = explicitIds ?? options.fallbackSegmentIds;
  const firstIndex = firstExistingIndex(segments, ids);
  const lastIndex = lastExistingIndex(segments, ids);

  if (firstIndex >= 0 && lastIndex >= 0) {
    return segments.slice(firstIndex, lastIndex + 1);
  }

  return segments.slice(0, Math.min(1, segments.length));
}
