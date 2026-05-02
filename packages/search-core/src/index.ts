import {
  normalizeTranscriptText,
  type TranscriptSegment
} from "../../protocol/src/index.ts";

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
}

export function buildTranscriptSearchIndex(
  videos: TranscriptSearchVideo[]
): TranscriptSearchIndex {
  return {
    videos
  };
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

  const groups: TranscriptSearchGroup[] = [];

  for (const video of index.videos) {
    const hitSegments: TranscriptSearchHitSegment[] = [];

    for (const segment of video.segments) {
      const normalizedText =
        segment.normalized_text || normalizeTranscriptText(segment.text);
      const matchStart = normalizedText.indexOf(normalizedQuery);

      if (matchStart === -1) {
        continue;
      }

      hitSegments.push({
        segment_id: segment.segment_id,
        begin_ms: segment.begin_ms,
        end_ms: segment.end_ms,
        text: segment.text,
        match_ranges: [[matchStart, matchStart + normalizedQuery.length - 1]]
      });
    }

    if (hitSegments.length > 0) {
      groups.push({
        source_video_id: video.source_video_id,
        title: video.title,
        duration_ms: video.duration_ms,
        hit_count: hitSegments.length,
        best_excerpt: hitSegments[0]?.text ?? "",
        hit_segments: hitSegments
      });
    }

    if (groups.length >= request.limit) {
      break;
    }
  }

  return {
    query: request.query,
    normalized_query: normalizedQuery,
    groups
  };
}
