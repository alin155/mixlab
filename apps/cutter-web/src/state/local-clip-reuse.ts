import type { LocalClip, LocalClipCatalog } from "../api.ts";
import type { CutListItem } from "./cut-list.ts";
import { sourceMaterialTitleFromStableName } from "./material-naming.ts";

export function localClipFromCutListItem(item: CutListItem, localClipId: string): LocalClip {
  const beginMs = Math.max(0, item.begin_ms - (item.pre_roll_ms ?? 0));
  const endMs = item.end_ms + (item.post_roll_ms ?? 0);
  const selectionBeginMs = Math.max(0, item.begin_ms - beginMs);
  const selectionEndMs = Math.min(endMs - beginMs, Math.max(selectionBeginMs, item.end_ms - beginMs));

  return {
    local_clip_id: localClipId,
    title: item.title ?? `${item.source_title} 片段`,
    source_video_id: item.source_video_id,
    source_title: sourceMaterialTitleFromStableName(item.source_title),
    begin_ms: beginMs,
    end_ms: endMs,
    duration_ms: endMs - beginMs,
    selected_text: item.selected_text,
    transcript_segments: item.selected_text.trim()
      ? [
          {
            segment_id: `${localClipId}-S000001`,
            begin_ms: selectionBeginMs,
            end_ms: selectionEndMs,
            text: item.selected_text
          }
        ]
      : [],
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
