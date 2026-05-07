import type { TranscriptSegment } from "../api.ts";

export const TRANSCRIPT_PREVIEW_PREROLL_MS = 500;

export interface SelectionPlaybackWindow {
  startSeconds: number;
  endSeconds: number;
}

export function previewStartSeconds(
  beginMs: number,
  preRollMs = TRANSCRIPT_PREVIEW_PREROLL_MS
): number {
  return Math.max(0, beginMs - preRollMs) / 1000;
}

export function selectionPlaybackWindow(
  segments: readonly TranscriptSegment[],
  preRollMs = TRANSCRIPT_PREVIEW_PREROLL_MS
): SelectionPlaybackWindow | null {
  const first = segments[0];
  const last = segments[segments.length - 1];

  if (!first || !last) {
    return null;
  }

  return {
    startSeconds: previewStartSeconds(first.begin_ms, preRollMs),
    endSeconds: last.end_ms / 1000
  };
}

export function shouldPauseSelectionPreview(
  currentTimeSeconds: number,
  endMs: number
): boolean {
  return currentTimeSeconds >= endMs / 1000;
}
