import { Button, InspectorPanel, SearchBox } from "@mixlab/ui-foundation";
import { useState } from "react";
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
import {
  MATERIAL_SCOPE_FOLDER_VALUE,
  type MaterialSearchMode
} from "../../state/material-locator.ts";
import { LibraryGallery } from "../library-gallery.tsx";
import { TopbarActions } from "../app-shell/TopbarActions.tsx";

const orientationFilterOptions: Array<{ value: VideoOrientationFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "landscape", label: "横版" },
  { value: "portrait", label: "竖版" }
];

function galleryMeta(video: SourceVideoCard): string {
  const resolution = video.width && video.height ? `${video.width}x${video.height}` : "";
  return [formatDuration(video.duration_ms), resolution, video.codec?.toUpperCase(), formatFileSize(video.file_size)]
    .filter((value) => Boolean(value) && value !== "-")
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
  searchMode = "content",
  sourceFolderFilter = "",
  filenameQuery = "",
  sourceFolders = [],
  runtimeStatus,
  isLoadingMore = false,
  isSearchingFilename = false,
  hasMore = false,
  onSetOrientationFilter,
  onSetMaterialScope,
  onSearchFilename,
  onSelectSourceVideo,
  onLoadMore,
  onFetchTeacherLibrary
}: {
  library: SourceLibraryResponse;
  selectedSourceVideoId?: string;
  orientationFilter?: VideoOrientationFilter;
  searchMode?: MaterialSearchMode;
  sourceFolderFilter?: string;
  filenameQuery?: string;
  sourceFolders?: readonly SourceFolderOption[];
  runtimeStatus?: CutterRuntimeStatus;
  isLoadingMore?: boolean;
  isSearchingFilename?: boolean;
  hasMore?: boolean;
  onSetOrientationFilter?: (filter: VideoOrientationFilter) => void;
  onSetMaterialScope?: (scope: string) => void;
  onSearchFilename?: (query: string) => void;
  onSelectSourceVideo?: (sourceVideoId: string) => void;
  onLoadMore?: () => void;
  onFetchTeacherLibrary?: (teacher: string, offset: number, limit: number) => Promise<SourceLibraryResponse>;
}) {
  const sourceFolderOptions = sourceFolders.filter((folder) => folder.name.trim().length > 0);
  const teacherAliases: Record<string, string> = { "陶矜2": "陶矜" };
  const teacherForFolderName = (folderName?: string): string => {
    const first = (folderName ?? "").replace(/\\/g, "/").split("/").filter(Boolean)[0]?.trim() ?? "";
    return first ? (teacherAliases[first] ?? first) : "未标注老师";
  };
  const teacherOptions: Array<{ name: string; count: number }> = [];
  for (const folder of sourceFolderOptions) {
    const teacher = teacherForFolderName(folder.name);
    const existing = teacherOptions.find((item) => item.name === teacher);
    if (existing) existing.count += folder.count;
    else teacherOptions.push({ name: teacher, count: folder.count });
  }
  const [teacherFilter, setTeacherFilter] = useState("");
  const [teacherLibrary, setTeacherLibrary] = useState<SourceLibraryResponse | undefined>();
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const materialScopeValue = searchMode === "folder" ? MATERIAL_SCOPE_FOLDER_VALUE : sourceFolderFilter;
  const activeLibrary = teacherFilter ? teacherLibrary ?? library : library;
  const teacherServerFiltered = Boolean(teacherFilter && teacherLibrary);
  const filtered = activeLibrary.videos.filter((video) =>
    matchesOrientationFilter(video, orientationFilter) &&
    (teacherServerFiltered || !teacherFilter || (video.teacher ?? teacherForFolderName(video.source_folder_name)) === teacherFilter)
  );
  const selected =
    filtered.find((video) => video.source_video_id === selectedSourceVideoId) ?? filtered[0];
  const remainingCount = Math.max(0, activeLibrary.available_video_count - activeLibrary.videos.length);
  const activeHasMore = teacherFilter && teacherLibrary
    ? teacherLibrary.videos.length < teacherLibrary.available_video_count
    : hasMore;
  const loadMoreLabel = isLoadingMore || teacherLoading
    ? "正在读取"
    : `继续加载 ${Math.min(20, remainingCount)} 条`;
  const handleTeacherChange = (teacher: string) => {
    setTeacherFilter(teacher);
    if (!teacher) {
      setTeacherLibrary(undefined);
      return;
    }
    if (!onFetchTeacherLibrary) return;
    setTeacherLoading(true);
    void onFetchTeacherLibrary(teacher, 0, 20)
      .then((page) => setTeacherLibrary(page))
      .catch(() => setTeacherLibrary(undefined))
      .finally(() => setTeacherLoading(false));
  };
  const handleLoadMore = () => {
    if (teacherFilter && teacherLibrary && onFetchTeacherLibrary) {
      setTeacherLoading(true);
      void onFetchTeacherLibrary(teacherFilter, teacherLibrary.videos.length, 20)
        .then((page) => setTeacherLibrary({
          ...page,
          videos: [...teacherLibrary.videos, ...page.videos]
        }))
        .catch(() => undefined)
        .finally(() => setTeacherLoading(false));
      return;
    }
    onLoadMore?.();
  };

  return (
    <section className="cutter-page cutter-public-library ml-workbench-page ml-workbench-page--library" data-page="public-library">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--library" style={{ gridTemplateRows: "auto auto minmax(0, 1fr) auto" }}>
        <TopbarActions>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={refreshing}
            onClick={() => setRefreshConfirmOpen(true)}
          >
            {refreshing ? "刷新中" : "刷新素材"}
          </Button>
        </TopbarActions>
        <header className="cutter-page-header ml-workbench-header">
          <div>
            <h1 className="ml-page-title">公共素材库</h1>
            <p className="ml-page-description">按文案或标题浏览原素材，加入项目后开始剪切。</p>
          </div>
          <div className="ml-control-cluster">
            <span className="ml-section-meta">共 {activeLibrary.available_video_count.toLocaleString()} 个原素材</span>
          </div>
        </header>

        <div className="cutter-public-library-toolbar ml-control-cluster">
          <SearchBox
            aria-label={searchMode === "folder" ? "搜索文件夹名称" : "按文件名搜索公共素材"}
            buttonLabel={isSearchingFilename ? "搜索中" : "搜索"}
            className="cutter-public-library-filename-search"
            defaultValue={filenameQuery}
            disabled={isSearchingFilename}
            key={searchMode}
            name="public-library-filename"
            onSubmit={(value) => onSearchFilename?.(value)}
            placeholder={searchMode === "folder" ? "搜索课程文件夹名称" : "搜索素材文件名"}
          />
          <div className="cutter-public-library-filter-selects">
            <select
              aria-label="老师筛选"
              className="ml-field-select cutter-teacher-select"
              value={teacherFilter}
              onChange={(event) => handleTeacherChange(event.currentTarget.value)}
            >
              <option value="">全部老师</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.name} value={teacher.name}>
                  {teacher.name} {teacher.count}
                </option>
              ))}
            </select>
            <select
              aria-label="公共素材方向"
              className="ml-field-select cutter-public-orientation-select"
              value={orientationFilter}
              onChange={(event) => onSetOrientationFilter?.(event.currentTarget.value as VideoOrientationFilter)}
            >
              {orientationFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>


        <div className="cutter-public-library-scroll ml-scroll-region">
          {filtered.length > 0 ? (
            <LibraryGallery
              items={filtered.map((video) => ({
                id: video.source_video_id,
                title: video.title,
                image: video.cover_url,
                meta: [video.teacher ?? teacherForFolderName(video.source_folder_name), galleryMeta(video)].filter(Boolean).join(" · "),
                tags: [videoOrientationLabel(video)],
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

        {activeHasMore ? (
          <div className="cutter-library-pagination cutter-public-library-pagination ml-pagination-bar">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isLoadingMore || teacherLoading}
              onClick={handleLoadMore}
            >
              {loadMoreLabel}
            </Button>
            <span>
              已显示 {library.videos.length} / {library.available_video_count}
            </span>
          </div>
        ) : null}
      </div>

      <InspectorPanel title="素材详情" className="ml-inspector--workbench ml-inspector--compact ml-workbench-inspector cutter-library-inspector">
        <div className="ml-detail-stack cutter-inspector-panel is-active">
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
      {refreshConfirmOpen ? (
        <div className="cutter-confirm-backdrop" role="presentation">
          <div
            aria-labelledby="public-refresh-title"
            aria-modal="true"
            className="cutter-confirm-dialog"
            role="dialog"
          >
            <h2 id="public-refresh-title">刷新素材</h2>
            <p>刷新会重新进行剪切预热，并加载服务器新预处理的视频。此过程可能需要一些时间，确认刷新？</p>
            <div className="cutter-confirm-actions">
              <Button type="button" variant="secondary" onClick={() => setRefreshConfirmOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setRefreshing(true);
                  setRefreshConfirmOpen(false);
                  window.location.reload();
                }}
              >
                确认刷新
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
