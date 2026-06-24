import { Button, InspectorPanel } from "@mixlab/ui-foundation";
import {
  formatDuration,
  formatFileSize,
  type CutterRuntimeStatus,
  type SourceFolderOption,
  type SourceLibraryResponse,
  type SourceVideoCard
} from "../../api.ts";
import { sourceDetailHash } from "../../app/navigation.ts";
import {
  matchesOrientationFilter,
  videoOrientationLabel,
  type VideoOrientationFilter
} from "../../state/video-orientation.ts";
import { LibraryGallery } from "../library-gallery.tsx";

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
  sourceFolderFilter = "",
  sourceFolders = [],
  runtimeStatus,
  isLoadingMore = false,
  hasMore = false,
  onSetOrientationFilter,
  onSetSourceFolderFilter,
  onSelectSourceVideo,
  onLoadMore
}: {
  library: SourceLibraryResponse;
  selectedSourceVideoId?: string;
  orientationFilter?: VideoOrientationFilter;
  sourceFolderFilter?: string;
  sourceFolders?: readonly SourceFolderOption[];
  runtimeStatus?: CutterRuntimeStatus;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onSetOrientationFilter?: (filter: VideoOrientationFilter) => void;
  onSetSourceFolderFilter?: (folderName: string) => void;
  onSelectSourceVideo?: (sourceVideoId: string) => void;
  onLoadMore?: () => void;
}) {
  const sourceFolderOptions = sourceFolders.filter((folder) => folder.name.trim().length > 0);
  const filtered = library.videos.filter((video) => matchesOrientationFilter(video, orientationFilter));
  const selected =
    filtered.find((video) => video.source_video_id === selectedSourceVideoId) ?? filtered[0];
  const remainingCount = Math.max(0, library.available_video_count - library.videos.length);
  const loadMoreLabel = isLoadingMore
    ? "正在读取"
    : `继续加载 ${Math.min(20, remainingCount)} 条`;

  return (
    <section className="cutter-page cutter-public-library ml-workbench-page ml-workbench-page--library" data-page="public-library">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--library ml-workbench-main--rows-list-footer">
        <header className="cutter-page-header ml-workbench-header">
          <div>
            <p className="cutter-eyebrow ml-page-kicker">公共素材库</p>
            <h1 className="ml-page-title">可用原素材</h1>
            <p className="ml-page-description">浏览管理端已经发布到剪辑端的原视频。</p>
          </div>
          <div className="cutter-public-library-controls ml-control-cluster">
            {sourceFolderOptions.length > 0 ? (
              <select
                aria-label="按老师筛选"
                className="cutter-source-folder-select ml-field-select"
                value={sourceFolderFilter}
                onChange={(event) => onSetSourceFolderFilter?.(event.currentTarget.value)}
              >
                <option value="">全部老师</option>
                {sourceFolderOptions.map((folder) => (
                  <option key={folder.name} value={folder.name}>
                    {folder.name}（{folder.count}）
                  </option>
                ))}
              </select>
            ) : null}
            <div className="cutter-local-view-toggle ml-segmented-control" role="group" aria-label="公共素材视频类型">
              {orientationFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={orientationFilter === option.value ? "primary" : "ghost"}
                  size="sm"
                  aria-pressed={orientationFilter === option.value}
                  onClick={() => onSetOrientationFilter?.(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </header>

        <div className="cutter-public-library-scroll ml-scroll-region">
          {filtered.length > 0 ? (
            <LibraryGallery
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
                      selectLabel: `查看原素材 ${video.title}`
                    }
                  : {
                      href: sourceDetailHash(video.source_video_id),
                      actionLabel: "查看详情"
                    })
              }))}
            />
          ) : (
            <div className="cutter-library-empty-state ml-empty-panel">
              <strong>当前筛选没有可用原素材</strong>
              <span>切回全部或横版查看已经发布的公共素材。</span>
            </div>
          )}
        </div>

        {hasMore ? (
          <div className="cutter-library-pagination cutter-public-library-pagination ml-pagination-bar">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {loadMoreLabel}
            </Button>
            <span>
              已显示 {library.videos.length} / {library.available_video_count}
            </span>
          </div>
        ) : null}
      </div>

      <InspectorPanel title="原素材详情" className="ml-inspector--workbench ml-inspector--compact ml-workbench-inspector cutter-library-inspector">
        <div className="ml-detail-stack">
          {selected ? (
            <video
              key={selected.source_video_id}
              className="ml-media-frame ml-media-frame--16x9 ml-media-frame--dark ml-media-fill"
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
            <Button href={sourceDetailHash(selected.source_video_id)} size="sm" variant="secondary">
              查看完整文案
            </Button>
          ) : null}
        </div>
      </InspectorPanel>
    </section>
  );
}
