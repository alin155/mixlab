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
