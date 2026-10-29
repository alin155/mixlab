import type { TranscriptSegment } from "../api.ts";

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function codePointSlice(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

export function normalizeCodePointOffset(
  offset: number | undefined,
  text: string,
  fallback: number
): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) {
    return fallback;
  }

  return Math.max(0, Math.min(Math.round(offset), codePointLength(text)));
}

/**
 * Estimate a time inside a sentence by character ratio.
 * Offsets are code point based (the single unit used across the cutter UI).
 */
export function timeAtCodePointOffset(segment: TranscriptSegment, offset: number): number {
  const length = codePointLength(segment.text);
  if (length <= 0) {
    return segment.begin_ms;
  }

  const ratio = Math.max(0, Math.min(offset, length)) / length;
  return Math.round(segment.begin_ms + (segment.end_ms - segment.begin_ms) * ratio);
}

/**
 * DOM Range offsets are UTF-16 code units while all cutter selection math uses
 * code points. Convert at the DOM boundary so emoji / CJK extension characters
 * cannot shift the selection or the estimated cut time.
 */
export function domRangePrefixCodePointOffset(prefixText: string): number {
  return codePointLength(prefixText);
}
