import { GalleryGrid, InspectorPanel, SegmentedControl } from "@mixlab/ui-foundation";
import { formatDuration, formatFileSize, type LocalClipCatalog } from "../../api.ts";
import {
  matchesOrientationFilter,
  videoOrientationLabel,
  type VideoDimensions,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";

type LocalClipVisualMetadata = LocalClipCatalog["clips"][number] & VideoDimensions;
type LocalClip = LocalClipCatalog["clips"][number];

const LOCAL_CLIP_FALLBACK_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%232a2f36'/%3E%3Cpath d='M124 55l78 35-78 35z' fill='%23ffffff' opacity='.9'/%3E%3C/svg%3E";

function galleryMeta(clip: LocalClip): string {
  const resolution = clip.width && clip.height ? `${clip.width}x${clip.height}` : "";
  return [
    formatDuration(clip.duration_ms ?? 0),
    resolution,
    clip.codec?.toUpperCase(),
    formatFileSize(clip.file_size)
  ]
    .filter(Boolean)
    .join(" · ");
}

export function LocalLibraryPage({
  catalog,
  query = "",
  orientationFilter = "all",
  selectedLocalClipId,
  onSelectLocalClip
}: {
  catalog: LocalClipCatalog;
  query?: string;
  orientationFilter?: VideoOrientationFilter;
  selectedLocalClipId?: string;
  onSelectLocalClip?: (localClipId: string) => void;
}) {
  const filtered = query
    ? catalog.clips.filter((clip) => `${clip.title} ${clip.source_title} ${clip.selected_text}`.includes(query))
    : catalog.clips;
  const visible = filtered.filter((clip) =>
    matchesOrientationFilter(clip as LocalClipVisualMetadata, orientationFilter)
  );
  const selected =
    visible.find((clip) => clip.local_clip_id === selectedLocalClipId) ??
    filtered.find((clip) => clip.local_clip_id === selectedLocalClipId) ??
    visible[0] ??
    filtered[0] ??
    catalog.clips[0];

  return (
    <section className="cutter-page cutter-local-library" data-page="local-library">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">本地素材库</p>
            <h1>本地可复剪素材</h1>
            <p>{catalog.local_clip_count} 个本地可复剪素材，来自本机剪切输出。</p>
          </div>
          <SegmentedControl options={["全部", "横版", "竖版"]} active="全部" />
        </header>

        <GalleryGrid
          items={visible.map((clip) => ({
            id: clip.local_clip_id,
            title: clip.title,
            image: clip.cover_url ?? LOCAL_CLIP_FALLBACK_COVER,
            meta: galleryMeta(clip),
            tags: [videoOrientationLabel(clip as LocalClipVisualMetadata), "本地可复剪素材"],
            description: clip.selected_text,
            selected: clip.local_clip_id === selected?.local_clip_id,
            ...(onSelectLocalClip
              ? {
                  onSelect: () => onSelectLocalClip(clip.local_clip_id),
                  select_label: `查看素材 ${clip.title}`
                }
              : {})
          }))}
        />
      </div>

      <InspectorPanel title="素材详情">
        <div className="cutter-inspector-stack">
          {selected ? (
            <video
              key={selected.local_clip_id}
              className="cutter-local-detail-player"
              src={selected.media_url}
              {...(selected.cover_url ? { poster: selected.cover_url } : {})}
              controls
              preload="metadata"
            />
          ) : null}
          <strong>{selected?.title ?? "未选择本地素材"}</strong>
          <span>{catalog.local_clip_count} 条全部可用资源</span>
          <span>{selected?.source_title ? `来源 ${selected.source_title}` : ""}</span>
          <span>{selected ? galleryMeta(selected) : ""}</span>
          <p>{selected?.selected_text}</p>
        </div>
      </InspectorPanel>
    </section>
  );
}
