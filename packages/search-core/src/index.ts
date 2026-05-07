import { normalizeTranscriptText } from "../../protocol/src/text.ts";
import type { TranscriptSegment } from "../../protocol/src/types.ts";

export interface TranscriptSearchVideo {
  source_video_id: string;
  title: string;
  duration_ms: number;
  segments: TranscriptSegment[];
}

export interface TranscriptSearchIndex {
  videos: TranscriptSearchVideo[];
}

export interface TranscriptSearchRequest {
  query: string;
  limit: number;
}

export interface TranscriptSearchResult {
  query: string;
  normalized_query: string;
  groups: TranscriptSearchGroup[];
}

export interface TranscriptSearchGroup {
  source_video_id: string;
  title: string;
  duration_ms: number;
  hit_count: number;
  best_excerpt: string;
  hit_segments: TranscriptSearchHitSegment[];
}

export interface TranscriptSearchHitSegment {
  segment_id: string;
  begin_ms: number;
  end_ms: number;
  text: string;
  match_ranges: Array<[number, number]>;
  match_id?: string;
  match_type?: "exact" | "tolerant";
}

export function buildTranscriptSearchIndex(
  videos: TranscriptSearchVideo[]
): TranscriptSearchIndex {
  return {
    videos
  };
}

export function normalizeTranscriptSearchQuery(text: string): string {
  return normalizeTranscriptText(text);
}

interface NormalizedSegmentSpan {
  segment: TranscriptSegment;
  normalized_text: string;
  start: number;
  end: number;
}

interface TranscriptMatch {
  start: number;
  end: number;
  score: number;
  type: "exact" | "tolerant";
  editDistance: number;
}

interface RankedSearchGroup {
  group: TranscriptSearchGroup;
  score: number;
  sourceOrder: number;
}

const LONG_QUERY_ANCHOR_THRESHOLD = 80;
const LONG_QUERY_MIN_ANCHOR_LENGTH = 14;
const LONG_QUERY_MAX_ANCHOR_LENGTH = 32;
const LONG_QUERY_MAX_ANCHORS = 8;
const LONG_QUERY_MIN_GROUPED_ANCHORS = 2;

function normalizedSegmentSpans(video: TranscriptSearchVideo): {
  text: string;
  spans: NormalizedSegmentSpan[];
} {
  let cursor = 0;
  const spans = video.segments.map((segment) => {
    const normalized_text = segment.normalized_text || normalizeTranscriptText(segment.text);
    const start = cursor;
    cursor += normalized_text.length;
    return {
      segment,
      normalized_text,
      start,
      end: cursor
    };
  });

  return {
    text: spans.map((span) => span.normalized_text).join(""),
    spans
  };
}

function maxErrorsForQueryLength(length: number): number {
  if (length <= 4) {
    return 0;
  }

  if (length <= 8) {
    return 1;
  }

  if (length <= 15) {
    return Math.max(1, Math.floor(length * 0.15));
  }

  if (length <= 40) {
    return Math.max(2, Math.floor(length * 0.18));
  }

  return Math.max(3, Math.floor(length * 0.16));
}

function anchorLengthForQueryLength(length: number): number {
  if (length <= 8) {
    return 3;
  }

  if (length <= 15) {
    return 4;
  }

  return 5;
}

function allExactMatches(normalizedText: string, normalizedQuery: string): TranscriptMatch[] {
  const matches: TranscriptMatch[] = [];
  let cursor = 0;

  while (cursor <= normalizedText.length - normalizedQuery.length) {
    const start = normalizedText.indexOf(normalizedQuery, cursor);
    if (start === -1) {
      break;
    }

    matches.push({
      start,
      end: start + normalizedQuery.length,
      score: 1_000_000 - start,
      type: "exact",
      editDistance: 0
    });
    cursor = start + Math.max(1, normalizedQuery.length);
  }

  return matches;
}

function uniqueAnchors(normalizedQuery: string, anchorLength: number): Array<{
  text: string;
  offset: number;
}> {
  const anchors = new Map<string, number>();
  for (let index = 0; index <= normalizedQuery.length - anchorLength; index += 1) {
    const text = normalizedQuery.slice(index, index + anchorLength);
    if (!anchors.has(`${text}:${index}`)) {
      anchors.set(`${text}:${index}`, index);
    }
  }

  return [...anchors.entries()].map(([key, offset]) => ({
    text: key.split(":")[0] ?? "",
    offset
  }));
}

function limitedEditDistance(a: string, b: string, maxDistance: number): number {
  const aChars = Array.from(a);
  const bChars = Array.from(b);

  if (Math.abs(aChars.length - bChars.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: bChars.length + 1 }, (_, index) => index);

  for (let row = 1; row <= aChars.length; row += 1) {
    const current = [row];
    let rowMin = current[0] ?? row;

    for (let column = 1; column <= bChars.length; column += 1) {
      const substitutionCost = aChars[row - 1] === bChars[column - 1] ? 0 : 1;
      const value = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + substitutionCost
      );
      current[column] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[bChars.length] ?? maxDistance + 1;
}

function tolerantMatches(normalizedText: string, normalizedQuery: string): TranscriptMatch[] {
  const queryLength = normalizedQuery.length;
  const maxErrors = maxErrorsForQueryLength(queryLength);

  if (maxErrors === 0 || normalizedText.length === 0) {
    return [];
  }

  const anchorLength = anchorLengthForQueryLength(queryLength);
  const anchors = uniqueAnchors(normalizedQuery, anchorLength);
  const candidates = new Map<string, TranscriptMatch>();

  for (const anchor of anchors) {
    if (!anchor.text) {
      continue;
    }

    let cursor = 0;
    while (cursor <= normalizedText.length - anchor.text.length) {
      const anchorStart = normalizedText.indexOf(anchor.text, cursor);
      if (anchorStart === -1) {
        break;
      }

      const baseStart = anchorStart - anchor.offset;
      for (let start = baseStart - maxErrors; start <= baseStart + maxErrors; start += 1) {
        if (start < 0 || start >= normalizedText.length) {
          continue;
        }

        for (let length = queryLength - maxErrors; length <= queryLength + maxErrors; length += 1) {
          if (length <= 0 || start + length > normalizedText.length) {
            continue;
          }

          const candidateText = normalizedText.slice(start, start + length);
          if (candidateText === normalizedQuery) {
            continue;
          }

          const distance = limitedEditDistance(normalizedQuery, candidateText, maxErrors);
          if (distance > maxErrors) {
            continue;
          }

          const key = `${start}:${start + length}`;
          const score = 800_000 + (1 - distance / queryLength) * 10_000 - start;
          const previous = candidates.get(key);
          if (!previous || score > previous.score) {
            candidates.set(key, {
              start,
              end: start + length,
              score,
              type: "tolerant",
              editDistance: distance
            });
          }
        }
      }

      cursor = anchorStart + 1;
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

function longQueryAnchors(normalizedQuery: string): Array<{
  text: string;
  offset: number;
}> {
  if (normalizedQuery.length < LONG_QUERY_ANCHOR_THRESHOLD) {
    return [];
  }

  const anchorLength = Math.min(
    LONG_QUERY_MAX_ANCHOR_LENGTH,
    Math.max(LONG_QUERY_MIN_ANCHOR_LENGTH, Math.floor(normalizedQuery.length / 6))
  );
  const maxStart = Math.max(0, normalizedQuery.length - anchorLength);
  const stride = Math.max(1, Math.ceil(maxStart / Math.max(1, LONG_QUERY_MAX_ANCHORS - 1)));
  const starts = new Set<number>();

  for (let start = 0; start <= maxStart; start += stride) {
    starts.add(start);
  }
  starts.add(maxStart);

  const seen = new Set<string>();
  return [...starts]
    .sort((left, right) => left - right)
    .map((offset) => ({
      text: normalizedQuery.slice(offset, offset + anchorLength),
      offset
    }))
    .filter((anchor) => {
      if (anchor.text.length < LONG_QUERY_MIN_ANCHOR_LENGTH || seen.has(anchor.text)) {
        return false;
      }

      seen.add(anchor.text);
      return true;
    });
}

function longQueryAnchorMatches(
  normalizedText: string,
  normalizedQuery: string
): TranscriptMatch[] {
  const anchors = longQueryAnchors(normalizedQuery);
  const occurrences: Array<{
    start: number;
    end: number;
    offset: number;
    text: string;
  }> = [];

  for (const anchor of anchors) {
    let cursor = 0;
    while (cursor <= normalizedText.length - anchor.text.length) {
      const start = normalizedText.indexOf(anchor.text, cursor);
      if (start === -1) {
        break;
      }

      occurrences.push({
        start,
        end: start + anchor.text.length,
        offset: anchor.offset,
        text: anchor.text
      });
      cursor = start + 1;
    }
  }

  if (occurrences.length === 0) {
    return [];
  }

  const orderedOccurrences = occurrences.sort((left, right) =>
    left.offset - right.offset || left.start - right.start
  );
  const matches = new Map<string, TranscriptMatch>();

  for (const first of orderedOccurrences) {
    const group = [first];

    for (const next of orderedOccurrences) {
      const last = group[group.length - 1]!;
      if (next.offset <= last.offset || next.start <= last.start) {
        continue;
      }

      const queryDelta = next.offset - first.offset;
      const textDelta = next.start - first.start;
      const maxDrift = Math.max(10, Math.floor(queryDelta * 0.22));
      if (Math.abs(queryDelta - textDelta) <= maxDrift) {
        group.push(next);
      }
    }

    if (group.length < LONG_QUERY_MIN_GROUPED_ANCHORS) {
      continue;
    }

    const start = group[0]!.start;
    const end = group[group.length - 1]!.end;
    const key = `${start}:${end}`;
    const matchedChars = group.reduce((count, anchor) => count + anchor.text.length, 0);
    const score = 760_000 + group.length * 5_000 + matchedChars * 100 - start;
    const previous = matches.get(key);

    if (!previous || score > previous.score) {
      matches.set(key, {
        start,
        end,
        score,
        type: "tolerant",
        editDistance: Math.max(0, normalizedQuery.length - (end - start))
      });
    }
  }

  if (matches.size === 0) {
    for (const occurrence of orderedOccurrences) {
      if (occurrence.text.length < LONG_QUERY_MAX_ANCHOR_LENGTH) {
        continue;
      }

      const key = `${occurrence.start}:${occurrence.end}`;
      matches.set(key, {
        start: occurrence.start,
        end: occurrence.end,
        score: 700_000 + occurrence.text.length * 100 - occurrence.start,
        type: "tolerant",
        editDistance: normalizedQuery.length - occurrence.text.length
      });
    }
  }

  return [...matches.values()].sort((left, right) => right.score - left.score);
}

function spansForMatch(
  spans: readonly NormalizedSegmentSpan[],
  match: TranscriptMatch,
  matchIndex: number
): TranscriptSearchHitSegment[] {
  const matchId = `M${String(matchIndex + 1).padStart(6, "0")}`;

  return spans.flatMap((span) => {
    if (span.end <= match.start || span.start >= match.end) {
      return [];
    }

    const rangeStart = Math.max(0, match.start - span.start);
    const rangeEndExclusive = Math.min(span.normalized_text.length, match.end - span.start);
    const match_ranges =
      rangeEndExclusive > rangeStart
        ? [[rangeStart, rangeEndExclusive - 1] as [number, number]]
        : [];

    return [{
      segment_id: span.segment.segment_id,
      begin_ms: span.segment.begin_ms,
      end_ms: span.segment.end_ms,
      text: span.segment.text,
      match_ranges,
      match_id: matchId,
      match_type: match.type
    }];
  });
}

function mergeOverlappingMatches(matches: readonly TranscriptMatch[]): TranscriptMatch[] {
  const sorted = [...matches].sort((left, right) =>
    right.score - left.score || left.start - right.start
  );
  const accepted: TranscriptMatch[] = [];

  for (const match of sorted) {
    const overlaps = accepted.some((existing) =>
      Math.max(existing.start, match.start) < Math.min(existing.end, match.end)
    );
    if (!overlaps) {
      accepted.push(match);
    }
  }

  return accepted.sort((left, right) => left.start - right.start);
}

function findVideoMatches(normalizedText: string, normalizedQuery: string): TranscriptMatch[] {
  const exactMatches = allExactMatches(normalizedText, normalizedQuery);
  if (normalizedQuery.length >= LONG_QUERY_ANCHOR_THRESHOLD) {
    return mergeOverlappingMatches([
      ...exactMatches,
      ...longQueryAnchorMatches(normalizedText, normalizedQuery)
    ]);
  }

  const fuzzyMatches = tolerantMatches(normalizedText, normalizedQuery);
  return mergeOverlappingMatches([...exactMatches, ...fuzzyMatches]);
}

export function transcriptTextMatchesQuery(text: string, query: string): boolean {
  const normalizedQuery = normalizeTranscriptText(query);
  if (!normalizedQuery) {
    return false;
  }

  return findVideoMatches(normalizeTranscriptText(text), normalizedQuery).length > 0;
}

export function searchTranscripts(
  index: TranscriptSearchIndex,
  request: TranscriptSearchRequest
): TranscriptSearchResult {
  const normalizedQuery = normalizeTranscriptText(request.query);

  if (normalizedQuery === "") {
    return {
      query: request.query,
      normalized_query: normalizedQuery,
      groups: []
    };
  }

  const rankedGroups: RankedSearchGroup[] = [];

  for (const [sourceOrder, video] of index.videos.entries()) {
    const normalized = normalizedSegmentSpans(video);
    const matches = findVideoMatches(normalized.text, normalizedQuery);

    if (matches.length > 0) {
      const hitSegments = matches.flatMap((match, matchIndex) =>
        spansForMatch(normalized.spans, match, matchIndex)
      );
      const firstMatchSegments = spansForMatch(normalized.spans, matches[0]!, 0);
      rankedGroups.push({
        score: matches.reduce((score, match) => score + match.score, 0) / matches.length,
        sourceOrder,
        group: {
        source_video_id: video.source_video_id,
        title: video.title,
        duration_ms: video.duration_ms,
        hit_count: matches.length,
        best_excerpt: firstMatchSegments.map((segment) => segment.text).join(""),
        hit_segments: hitSegments
        }
      });
    }
  }

  return {
    query: request.query,
    normalized_query: normalizedQuery,
    groups: rankedGroups
      .sort((left, right) => right.score - left.score || left.sourceOrder - right.sourceOrder)
      .slice(0, request.limit)
      .map((ranked) => ranked.group)
  };
}
