import { GalleryGrid, InspectorPanel, SegmentedControl } from "@mixlab/ui-foundation";
import { formatDuration, formatFileSize, type SourceLibraryResponse, type SourceVideoCard } from "../../api.ts";
import { sourceDetailHash } from "../../app/navigation.ts";
import {
  matchesOrientationFilter,
  videoOrientationLabel,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";

function galleryMeta(video: SourceVideoCard): string {
  const resolution = video.width && video.height ? `${video.width}x${video.height}` : "";
  return [formatDuration(video.duration_ms), resolution, video.codec?.toUpperCase(), formatFileSize(video.file_size)]
    .filter(Boolean)
    .join(" · ");
}

export function PublicLibraryPage({
  library,
  selectedSourceVideoId,
  orientationFilter = "all"
}: {
  library: SourceLibraryResponse;
  selectedSourceVideoId?: string;
  orientationFilter?: VideoOrientationFilter;
}) {
  const filtered = library.videos.filter((video) => matchesOrientationFilter(video, orientationFilter));
  const selected =
    filtered.find((video) => video.source_video_id === selectedSourceVideoId) ?? filtered[0] ?? library.videos[0];

  return (
    <section className="cutter-page cutter-public-library" data-page="public-library">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">公共素材库</p>
            <h1>可用原素材</h1>
            <p>剪辑端只读浏览管理端已经发布为 ready 的原视频。</p>
          </div>
          <SegmentedControl options={["全部", "横版", "竖版"]} active="全部" />
        </header>

        <GalleryGrid
          items={filtered.map((video) => ({
            id: video.source_video_id,
            title: video.title,
            image: video.cover_url,
            meta: galleryMeta(video),
            tags: [videoOrientationLabel(video), ...(video.tags ?? [])],
            description: video.description,
            href: sourceDetailHash(video.source_video_id),
            action_label: "查看详情"
          }))}
        />
      </div>

      <InspectorPanel title="资源信息">
        <div className="cutter-inspector-stack">
          <strong>{selected?.title ?? "未选择原素材"}</strong>
          <span>{library.available_video_count} 条全部可用资源</span>
          <span>{selected?.description}</span>
          <span>{selected?.lecturer ? `讲师 ${selected.lecturer}` : ""}</span>
          <span>{selected?.course ? `课程 ${selected.course}` : ""}</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
