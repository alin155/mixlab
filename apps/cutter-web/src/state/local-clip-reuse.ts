import type { LocalClip, LocalClipCatalog } from "../api.ts";
import type { CutListItem } from "./cut-list.ts";

export function localClipFromCutListItem(item: CutListItem, localClipId: string): LocalClip {
  return {
    local_clip_id: localClipId,
    title: item.title ?? `${item.source_title} 片段`,
    source_video_id: item.source_video_id,
    source_title: item.source_title,
    begin_ms: item.begin_ms,
    end_ms: item.end_ms,
    duration_ms: item.duration_ms,
    selected_text: item.selected_text,
    media_url: `/local-clips/${localClipId}.mp4`,
    detail_url: `/cutter/local-clips/${localClipId}`
  };
}

export function appendCompletedLocalClip(
  catalog: LocalClipCatalog,
  clip: LocalClip
): LocalClipCatalog {
  if (catalog.clips.some((current) => current.local_clip_id === clip.local_clip_id)) {
    return catalog;
  }

  const clips = [clip, ...catalog.clips];

  return {
    ...catalog,
    local_clip_count: clips.length,
    clips
  };
}
