import { GalleryGrid, InspectorPanel } from "@mixlab/ui-foundation";
import {
  formatDuration,
  formatFileSize,
  type CutterRuntimeStatus,
  type SourceLibraryResponse,
  type SourceVideoCard
} from "../../api.ts";
import { sourceDetailHash } from "../../app/navigation.ts";
import {
  matchesOrientationFilter,
  videoOrientationLabel,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";

const orientationFilterOptions: Array<{ value: VideoOrientationFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" }
];

function galleryMeta(video: SourceVideoCard): string {
  const resolution = video.width && video.height ? `${video.width}x${video.height}` : "";
  return [formatDuration(video.duration_ms), resolution, video.codec?.toUpperCase(), formatFileSize(video.file_size)]
    .filter(Boolean)
    .join(" · ");
}

export function publicLibraryIndexSummary(input: {
  libraryCount: number;
  runtimeStatus?: CutterRuntimeStatus;
}): string {
  const backend = input.runtimeStatus?.search_backend;
  if (!backend?.index_version.trim()) {
    return "公共素材正在准备，暂不可搜索";
  }

  const indexedCount = Math.max(0, Math.round(backend.source_video_count));
  const libraryCount = Math.max(0, Math.round(input.libraryCount));
  const syncLabel = backend.degraded
    ? "部分素材可搜索"
    : indexedCount !== libraryCount
      ? "正在更新可搜索素材"
      : "全部可搜索";

  return `可搜索素材 ${indexedCount} 条 · ${syncLabel}`;
}

export function PublicLibraryPage({
  library,
  selectedSourceVideoId,
  orientationFilter = "all",
  runtimeStatus,
  isLoadingMore = false,
  hasMore = false,
  onSetOrientationFilter,
  onSelectSourceVideo,
  onLoadMore
}: {
  library: SourceLibraryResponse;
  selectedSourceVideoId?: string;
  orientationFilter?: VideoOrientationFilter;
  runtimeStatus?: CutterRuntimeStatus;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onSetOrientationFilter?: (filter: VideoOrientationFilter) => void;
  onSelectSourceVideo?: (sourceVideoId: string) => void;
  onLoadMore?: () => void;
}) {
  const filtered = library.videos.filter((video) => matchesOrientationFilter(video, orientationFilter));
  const selected =
    filtered.find((video) => video.source_video_id === selectedSourceVideoId) ?? filtered[0];
  const remainingCount = Math.max(0, library.available_video_count - library.videos.length);
  const loadMoreLabel = isLoadingMore
    ? "正在读取"
    : `继续加载 ${Math.min(20, remainingCount)} 条`;

  return (
    <section className="cutter-page cutter-public-library" data-page="public-library">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">公共素材库</p>
            <h1>可用原素材</h1>
            <p>浏览管理端已经发布到剪辑端的原视频。</p>
          </div>
          <div className="cutter-local-view-toggle" role="group" aria-label="公共素材视频类型">
            {orientationFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={orientationFilter === option.value ? "is-active" : ""}
                aria-pressed={orientationFilter === option.value}
                onClick={() => onSetOrientationFilter?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="cutter-public-library-scroll">
          {filtered.length > 0 ? (
            <GalleryGrid
              items={filtered.map((video) => ({
                id: video.source_video_id,
                title: video.title,
                image: video.cover_url,
                meta: galleryMeta(video),
                tags: [videoOrientationLabel(video), ...(video.tags ?? [])],
                description: video.description,
                selected: video.source_video_id === selected?.source_video_id,
                ...(onSelectSourceVideo
                  ? {
                      onSelect: () => onSelectSourceVideo(video.source_video_id),
                      select_label: `查看原素材 ${video.title}`
                    }
                  : {
                      href: sourceDetailHash(video.source_video_id),
                      action_label: "查看详情"
                    })
              }))}
            />
          ) : (
            <div className="cutter-local-empty-state">
              <strong>当前筛选没有可用原素材</strong>
              <span>切回全部或横版查看已经发布的公共素材。</span>
            </div>
          )}
        </div>

        {hasMore ? (
          <div className="cutter-public-library-pagination">
            <button
              type="button"
              className="cutter-public-library-load-more"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {loadMoreLabel}
            </button>
            <span>
              已显示 {library.videos.length} / {library.available_video_count}
            </span>
          </div>
        ) : null}
      </div>

      <InspectorPanel title="原素材详情">
        <div className="cutter-inspector-stack">
          {selected ? (
            <video
              key={selected.source_video_id}
              className="cutter-local-detail-player"
              src={selected.media_url}
              poster={selected.cover_url}
              controls
              preload="metadata"
            />
          ) : null}
          <strong>{selected?.title ?? "未选择原素材"}</strong>
          <span>{filtered.length} 条当前视图素材</span>
          <span>{publicLibraryIndexSummary({ libraryCount: library.available_video_count, runtimeStatus })}</span>
          <span>{selected ? galleryMeta(selected) : ""}</span>
          <span>{selected?.lecturer ? `讲师 ${selected.lecturer}` : ""}</span>
          <span>{selected?.course ? `课程 ${selected.course}` : ""}</span>
          <span>{selected?.relative_path ? `路径 ${selected.relative_path}` : ""}</span>
          <p>{selected?.description}</p>
          {selected ? (
            <a className="cutter-inline-action" href={sourceDetailHash(selected.source_video_id)}>
              查看完整文案
            </a>
          ) : null}
        </div>
      </InspectorPanel>
    </section>
  );
}
