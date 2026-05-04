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
  excerpt: string;
  media_url: string;
  cover_url: string;
  detail_url: string;
  orientation: VideoOrientation;
  orientation_label: string;
  segments: TranscriptSegment[];
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
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (text ?? "").toLowerCase().includes(normalizedQuery);
}

function localClipSearchText(clip: LocalClip): string {
  return [clip.title, clip.source_title, clip.selected_text].filter(Boolean).join(" ");
}

function hasUsableLocalTranscript(clip: LocalClip): boolean {
  return Boolean(
    clip.selected_text?.trim() &&
      typeof clip.begin_ms === "number" &&
      typeof clip.end_ms === "number" &&
      clip.end_ms > clip.begin_ms
  );
}

function localClipSegment(clip: LocalClip): TranscriptSegment {
  return {
    segment_id: `${clip.local_clip_id}-S000001`,
    begin_ms: clip.begin_ms ?? 0,
    end_ms: clip.end_ms ?? clip.duration_ms ?? clip.begin_ms ?? 0,
    text: clip.selected_text?.trim() ?? ""
  };
}

export function localClipToSourceVideoDetail(clip: LocalClip): SourceVideoDetail {
  const segment = localClipSegment(clip);
  const visual = clip as LocalClipVisualMetadata;

  return {
    source_video_id: clip.local_clip_id,
    title: clip.title,
    duration_ms: clip.duration_ms ?? Math.max(0, segment.end_ms - segment.begin_ms),
    width: visual.width,
    height: visual.height,
    media_url: clip.media_url,
    cover_url: visual.cover_url ?? "",
    detail_url: clip.detail_url,
    subtitles_url: "",
    description: clip.source_title ? `来自 ${clip.source_title}` : "本地可复剪素材",
    tags: ["本地素材"],
    transcript: {
      full_text: segment.text,
      segments: [segment]
    },
    keyframes: {
      keyframes_ms: [segment.begin_ms]
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

function localResultFromClip(clip: LocalClip): MaterialLocatorResult {
  const visual = clip as LocalClipVisualMetadata;

  return {
    id: clip.local_clip_id,
    source: "local",
    title: clip.title,
    source_title: clip.source_title ?? "本地素材",
    duration_ms: clip.duration_ms ?? Math.max(0, (clip.end_ms ?? 0) - (clip.begin_ms ?? 0)),
    hit_count: 1,
    excerpt: clip.selected_text?.trim() ?? "",
    media_url: clip.media_url,
    cover_url: visual.cover_url ?? "",
    detail_url: clip.detail_url,
    orientation: videoOrientation(visual),
    orientation_label: videoOrientationLabel(visual),
    segments: [localClipSegment(clip)],
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
  const sourceVideosById = new Map(
    input.library.videos.map((video) => [video.source_video_id, video])
  );
  const sections: MaterialLocatorSection[] = [];

  if (input.sourceFilter === "all" || input.sourceFilter === "local") {
    const localItems = input.localClips.clips
      .filter(hasUsableLocalTranscript)
      .filter((clip) => textIncludesQuery(localClipSearchText(clip), input.query))
      .map(localResultFromClip)
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
    const publicItems = input.search.groups
      .map((group) => publicResultFromGroup(group, sourceVideosById.get(group.source_video_id)))
      .filter((item) => resultMatchesOrientationFilter(item, input.orientationFilter));

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
