import type {
  LocalClip,
  LocalClipCatalog,
  SearchGroup,
  SearchHitSegment,
  SearchResponse,
  SourceLibraryResponse,
  SourceVideoCard,
  SourceVideoDetail,
  TranscriptSegment
} from "../api.ts";
import {
  normalizeTranscriptSearchQuery,
  transcriptTextMatchesQuery
} from "@mixlab/search-core";
import {
  videoOrientation,
  videoOrientationLabel,
  type VideoDimensions,
  type VideoOrientation,
  type VideoOrientationFilter
} from "./video-orientation.ts";

export type MaterialSearchSourceFilter = "all" | "local" | "public";

export type MaterialSource = "local" | "public";

type LocalClipVisualMetadata = LocalClip & VideoDimensions & {
  cover_url?: string;
};

export interface MaterialLocatorResult {
  id: string;
  source: MaterialSource;
  title: string;
  source_title: string;
  duration_ms: number;
  hit_count: number;
  transcript_character_count: number;
  excerpt: string;
  media_url: string;
  cover_url: string;
  detail_url: string;
  orientation: VideoOrientation;
  orientation_label: string;
  segments: SearchHitSegment[];
  source_video?: SourceVideoCard;
  local_clip?: LocalClip;
}

export interface MaterialLocatorSection {
  key: MaterialSource;
  label: string;
  items: MaterialLocatorResult[];
}

export interface BuildMaterialLocatorSectionsInput {
  query: string;
  sourceFilter: MaterialSearchSourceFilter;
  orientationFilter: VideoOrientationFilter;
  localClips: LocalClipCatalog;
  library: SourceLibraryResponse;
  search: SearchResponse;
}

function textIncludesQuery(text: string | undefined, query: string): boolean {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return true;
  }

  return transcriptTextMatchesQuery(text ?? "", normalizedQuery);
}

function localClipSearchText(clip: LocalClip): string {
  return [
    clip.title,
    clip.source_title,
    clip.selected_text,
    ...(clip.transcript_segments?.map((segment) => segment.text) ?? [])
  ].filter(Boolean).join(" ");
}

export function normalizedMaterialSearchQuery(query: string): string {
  return normalizeTranscriptSearchQuery(query);
}

function hasUsableLocalTranscript(clip: LocalClip): boolean {
  const segments = localClipSegments(clip);

  return segments.length > 0 && segments.some((segment) => segment.text.trim().length > 0);
}

function fallbackLocalClipSegment(clip: LocalClip): TranscriptSegment {
  return {
    segment_id: `${clip.local_clip_id}-S000001`,
    begin_ms: clip.begin_ms ?? 0,
    end_ms: clip.end_ms ?? clip.duration_ms ?? clip.begin_ms ?? 0,
    text: clip.selected_text?.trim() ?? ""
  };
}

function localClipSegments(clip: LocalClip): TranscriptSegment[] {
  const segments = clip.transcript_segments?.filter((segment) => segment.text.trim()) ?? [];
  return segments.length > 0 ? segments : [fallbackLocalClipSegment(clip)].filter((segment) => segment.text.trim());
}

function matchedLocalClipSegments(clip: LocalClip, query: string): SearchHitSegment[] {
  const normalizedQuery = query.trim();
  const segments = localClipSegments(clip);

  if (!normalizedQuery) {
    return segments;
  }

  return segments.filter((segment) => transcriptTextMatchesQuery(segment.text, normalizedQuery));
}

function compactCharacterCount(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function segmentCharacterCount(segments: readonly TranscriptSegment[]): number {
  return compactCharacterCount(segments.map((segment) => segment.text).join(""));
}

export function localClipToSourceVideoDetail(clip: LocalClip): SourceVideoDetail {
  const segments = localClipSegments(clip);
  const visual = clip as LocalClipVisualMetadata;
  const durationMs =
    clip.duration_ms ??
    Math.max(0, ...segments.map((segment) => segment.end_ms), clip.end_ms ?? 0) -
      Math.min(...segments.map((segment) => segment.begin_ms), clip.begin_ms ?? 0);

  return {
    source_video_id: clip.local_clip_id,
    title: clip.title,
    duration_ms: durationMs,
    width: visual.width,
    height: visual.height,
    relative_path: clip.relative_path,
    media_url: clip.media_url,
    cover_url: visual.cover_url ?? "",
    detail_url: clip.detail_url,
    subtitles_url: clip.subtitles_url ?? "",
    description: clip.source_title ? `来自 ${clip.source_title}` : "本地可复剪素材",
    tags: ["本地素材"],
    transcript: {
      full_text: segments.map((segment) => segment.text).join(" "),
      segments
    },
    keyframes: {
      keyframes_ms: segments.map((segment) => segment.begin_ms)
    }
  };
}

function publicResultFromGroup(
  group: SearchGroup,
  sourceVideo: SourceVideoCard | undefined
): MaterialLocatorResult {
  const dimensions: VideoDimensions = sourceVideo
    ? { width: sourceVideo.width, height: sourceVideo.height }
    : {};

  return {
    id: group.source_video_id,
    source: "public",
    title: group.title,
    source_title: group.title,
    duration_ms: group.duration_ms ?? sourceVideo?.duration_ms ?? 0,
    hit_count: group.hit_count,
    transcript_character_count: group.transcript_character_count ?? segmentCharacterCount(group.hit_segments),
    excerpt: group.best_excerpt,
    media_url: group.media_url ?? sourceVideo?.media_url ?? "",
    cover_url: group.cover_url ?? sourceVideo?.cover_url ?? "",
    detail_url: group.detail_url ?? sourceVideo?.detail_url ?? "",
    orientation: videoOrientation(dimensions),
    orientation_label: videoOrientationLabel(dimensions),
    segments: group.hit_segments,
    source_video: sourceVideo
  };
}

function localResultFromClip(clip: LocalClip, query: string): MaterialLocatorResult {
  const visual = clip as LocalClipVisualMetadata;
  const allSegments = localClipSegments(clip);
  const matchedSegments = matchedLocalClipSegments(clip, query);
  const segments = matchedSegments.length > 0 ? matchedSegments : allSegments;
  const excerpt = segments.map((segment) => segment.text).join(" ");
  const durationMs = clip.duration_ms ?? Math.max(0, ...allSegments.map((segment) => segment.end_ms));

  return {
    id: clip.local_clip_id,
    source: "local",
    title: clip.title,
    source_title: clip.source_title ?? "本地素材",
    duration_ms: durationMs,
    hit_count: segments.length,
    transcript_character_count: segmentCharacterCount(allSegments),
    excerpt,
    media_url: clip.media_url,
    cover_url: visual.cover_url ?? "",
    detail_url: clip.detail_url,
    orientation: videoOrientation(visual),
    orientation_label: videoOrientationLabel(visual),
    segments,
    local_clip: clip
  };
}

function resultMatchesOrientationFilter(
  result: MaterialLocatorResult,
  filter: VideoOrientationFilter
): boolean {
  return filter === "all" || result.orientation === filter;
}

export function buildMaterialLocatorSections(
  input: BuildMaterialLocatorSectionsInput
): MaterialLocatorSection[] {
  const normalizedInputQuery = normalizedMaterialSearchQuery(input.query);
  if (!normalizedInputQuery) {
    return [];
  }

  const sourceVideosById = new Map(
    input.library.videos.map((video) => [video.source_video_id, video])
  );
  const sections: MaterialLocatorSection[] = [];

  if (input.sourceFilter === "all" || input.sourceFilter === "local") {
    const localItems = input.localClips.clips
      .filter(hasUsableLocalTranscript)
      .filter((clip) => textIncludesQuery(localClipSearchText(clip), input.query))
      .map((clip) => localResultFromClip(clip, input.query))
      .filter((item) => item.segments.length > 0)
      .filter((item) => resultMatchesOrientationFilter(item, input.orientationFilter));

    if (localItems.length > 0) {
      sections.push({
        key: "local",
        label: "本地素材",
        items: localItems
      });
    }
  }

  if (input.sourceFilter === "all" || input.sourceFilter === "public") {
    const normalizedSearchResponseQuery = normalizedMaterialSearchQuery(
      input.search.normalized_query || input.search.query
    );
    const publicItems = normalizedSearchResponseQuery === normalizedInputQuery
      ? input.search.groups
          .map((group) => publicResultFromGroup(group, sourceVideosById.get(group.source_video_id)))
          .filter((item) => resultMatchesOrientationFilter(item, input.orientationFilter))
      : [];

    if (publicItems.length > 0) {
      sections.push({
        key: "public",
        label: "公共原素材",
        items: publicItems
      });
    }
  }

  return sections;
}
