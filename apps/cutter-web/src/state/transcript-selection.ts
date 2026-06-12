import type { SearchHitSegment, TranscriptSegment } from "../api.ts";

export interface TranscriptSelectionRange {
  startSegmentId?: string;
  endSegmentId?: string;
  startCharOffset?: number;
  endCharOffset?: number;
}

export interface TranscriptSelectionOptions extends TranscriptSelectionRange {
  fallbackSegmentIds?: readonly string[];
}

export interface ContinuousTranscriptSelection {
  segments: TranscriptSegment[];
  startCharOffset?: number;
  endCharOffset?: number;
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

export function transcriptSelectionRangeFromText(
  startSegmentId: string,
  startCharOffset: number,
  endSegmentId: string,
  endCharOffset: number
): TranscriptSelectionRange {
  return {
    startSegmentId,
    endSegmentId,
    startCharOffset,
    endCharOffset
  };
}

export function transcriptSelectionRangeFromHitSegments(
  hitSegments: readonly SearchHitSegment[]
): TranscriptSelectionRange {
  const segments = hitSegments.filter((segment) => segment.segment_id);
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) {
    return {};
  }

  return {
    startSegmentId: first.segment_id,
    endSegmentId: last.segment_id
  };
}

export function shouldSuppressTranscriptClickAfterMouseUp(
  startSegmentId: string,
  endSegmentId: string | undefined
): boolean {
  return Boolean(endSegmentId && startSegmentId !== endSegmentId);
}

function normalizedCharOffsets(input: {
  startIndex: number;
  endIndex: number;
  startCharOffset?: number;
  endCharOffset?: number;
}): Pick<ContinuousTranscriptSelection, "startCharOffset" | "endCharOffset"> {
  if (
    typeof input.startCharOffset !== "number" ||
    typeof input.endCharOffset !== "number"
  ) {
    return {};
  }

  if (input.startIndex < input.endIndex) {
    return {
      startCharOffset: input.startCharOffset,
      endCharOffset: input.endCharOffset
    };
  }

  if (input.startIndex > input.endIndex) {
    return {
      startCharOffset: input.endCharOffset,
      endCharOffset: input.startCharOffset
    };
  }

  return {
    startCharOffset: Math.min(input.startCharOffset, input.endCharOffset),
    endCharOffset: Math.max(input.startCharOffset, input.endCharOffset)
  };
}

export function continuousTranscriptSelection(
  segments: readonly TranscriptSegment[],
  options: TranscriptSelectionOptions = {}
): ContinuousTranscriptSelection {
  const explicitIds =
    options.startSegmentId && options.endSegmentId
      ? [options.startSegmentId, options.endSegmentId]
      : undefined;
  const ids = explicitIds ?? options.fallbackSegmentIds;
  const explicitStartIndex = options.startSegmentId
    ? segments.findIndex((segment) => segment.segment_id === options.startSegmentId)
    : -1;
  const explicitEndIndex = options.endSegmentId
    ? segments.findIndex((segment) => segment.segment_id === options.endSegmentId)
    : -1;
  const firstIndex = explicitIds ? explicitStartIndex : firstExistingIndex(segments, ids);
  const lastIndex = explicitIds ? explicitEndIndex : lastExistingIndex(segments, ids);

  if (firstIndex >= 0 && lastIndex >= 0) {
    const sliceStart = Math.min(firstIndex, lastIndex);
    const sliceEnd = Math.max(firstIndex, lastIndex);
    const offsets = explicitIds
      ? normalizedCharOffsets({
          startIndex: firstIndex,
          endIndex: lastIndex,
          startCharOffset: options.startCharOffset,
          endCharOffset: options.endCharOffset
        })
      : {};

    return {
      segments: segments.slice(sliceStart, sliceEnd + 1),
      ...offsets
    };
  }

  return { segments: [] };
}

export function continuousTranscriptSegments(
  segments: readonly TranscriptSegment[],
  options: TranscriptSelectionOptions = {}
): TranscriptSegment[] {
  return continuousTranscriptSelection(segments, options).segments;
}
