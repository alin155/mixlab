import { useEffect, useMemo, useState } from "react";
import type {
  AdminDashboardData,
  AdminPreprocessStatus,
  AdminSourceVideoMetadataUpdate
} from "../../api.ts";
import { preprocessStatusLabel } from "../../app/chinese.ts";
import { formatAdminDuration } from "../../app/view-model.ts";
import {
  AdminPageHeader,
  EmptyState,
  SourceMetadataInspector,
  SourceVideoTable
} from "../shared.tsx";

const statusOptions: Array<{ label: string; value: AdminPreprocessStatus | "all" }> = [
  { label: "全部状态", value: "all" },
  { label: preprocessStatusLabel("ready"), value: "ready" },
  { label: preprocessStatusLabel("processing"), value: "processing" },
  { label: preprocessStatusLabel("queued"), value: "queued" },
  { label: preprocessStatusLabel("unprocessed"), value: "unprocessed" },
  { label: preprocessStatusLabel("failed"), value: "failed" },
  { label: preprocessStatusLabel("index-required"), value: "index-required" }
];

const SOURCE_VIDEO_PAGE_SIZE = 20;

function statusCountFromDashboard(
  data: AdminDashboardData,
  status: AdminPreprocessStatus | "all"
): number {
  switch (status) {
    case "all":
      return data.status.video_count;
    case "ready":
      return data.status.ready_video_count;
    case "processing":
      return data.status.processing_video_count;
    case "queued":
      return data.status.queued_video_count;
    case "unprocessed":
      return data.status.unprocessed_video_count;
    case "failed":
      return data.status.failed_video_count;
    case "index-required":
      return data.status.index_required_video_count;
  }
}

function statusFilterLabel(
  option: { label: string; value: AdminPreprocessStatus | "all" },
  processingIsStale: boolean
): string {
  return option.value === "processing" && processingIsStale
    ? "待恢复"
    : option.label;
}

export function SourceVideosPage({
  data,
  isLoadingInitial = false,
  isLoadingMore = false,
  hasMoreSourceVideos,
  sourceQuery,
  sourceStatusFilter,
  onQueueSourceVideo,
  onRetrySourceVideo,
  onRecoverProcessingSourceVideo,
  onPublishSourceVideo,
  onUpdateSourceVideoMetadata,
  onUpdateSourceVideoCover,
  onOpenSourceDetail,
  onSourceVideoFiltersChange,
  onLoadMoreSourceVideos
}: {
  data: AdminDashboardData;
  isLoadingInitial?: boolean;
  isLoadingMore?: boolean;
  hasMoreSourceVideos?: boolean;
  sourceQuery?: string;
  sourceStatusFilter?: AdminPreprocessStatus | "all";
  onQueueSourceVideo?: (sourceVideoId: string) => void;
  onRetrySourceVideo?: (sourceVideoId: string) => void;
  onRecoverProcessingSourceVideo?: (sourceVideoId: string) => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
  onUpdateSourceVideoMetadata?: (
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ) => void;
  onUpdateSourceVideoCover?: (
    sourceVideoId: string,
    coverFile: File
  ) => void;
  onOpenSourceDetail?: (sourceVideoId: string) => void;
  onSourceVideoFiltersChange?: (filters: {
    query: string;
    status: AdminPreprocessStatus | "all";
  }) => void;
  onLoadMoreSourceVideos?: () => void;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [localStatusFilter, setLocalStatusFilter] = useState<AdminPreprocessStatus | "all">("all");
  const [pageIndex, setPageIndex] = useState(0);
  const serverFiltered = Boolean(onSourceVideoFiltersChange);
  const query = sourceQuery ?? localQuery;
  const statusFilter = sourceStatusFilter ?? localStatusFilter;
  const nasWriteState = "m9b-api" as const;
  const [selectedSourceVideoId, setSelectedSourceVideoId] = useState(
    data.source_videos[0]?.source_video_id ??
    ""
  );

  const filteredVideos = useMemo(() => {
    if (serverFiltered) {
      return data.source_videos;
    }

    const normalizedQuery = query.trim().toLowerCase();

    return data.source_videos.filter((video) => {
      const matchesStatus = statusFilter === "all" || video.preprocess_status === statusFilter;
      const searchableText = [
        video.source_video_id,
        video.title,
        video.file_name,
        video.relative_path,
        video.description,
        video.lecturer,
        video.course,
        video.category,
        ...video.tags
      ].join(" ").toLowerCase();

      return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [data.source_videos, query, serverFiltered, statusFilter]);

  useEffect(() => {
    setPageIndex(0);
  }, [query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredVideos.length / SOURCE_VIDEO_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * SOURCE_VIDEO_PAGE_SIZE;
  const pageVideos = filteredVideos.slice(pageStart, pageStart + SOURCE_VIDEO_PAGE_SIZE);
  const pageEnd = pageVideos.length ? pageStart + pageVideos.length : 0;
  const loadedSourceVideoCount = data.source_videos.length;
  const totalSourceVideoCount = Math.max(data.status.video_count, loadedSourceVideoCount);
  const canLoadMoreSourceVideos = hasMoreSourceVideos ?? loadedSourceVideoCount < totalSourceVideoCount;
  const hasLocalFilter = query.trim().length > 0 || statusFilter !== "all";
  const resultCountLabel = serverFiltered ? "已返回" : "当前筛选";
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";
  const processingIsStale = data.status.processing_video_count > 0 && !supervisorRunning;

  const selected =
    data.source_videos.find((video) => video.source_video_id === selectedSourceVideoId) ??
    filteredVideos[0] ??
    data.source_videos[0];

  function updateQuery(nextQuery: string): void {
    if (sourceQuery === undefined) {
      setLocalQuery(nextQuery);
    }
    onSourceVideoFiltersChange?.({ query: nextQuery, status: statusFilter });
  }

  function updateStatusFilter(nextStatusFilter: AdminPreprocessStatus | "all"): void {
    if (sourceStatusFilter === undefined) {
      setLocalStatusFilter(nextStatusFilter);
    }
    onSourceVideoFiltersChange?.({ query, status: nextStatusFilter });
  }

  return (
    <>
      <div className="admin-main-column">
        <section className="admin-console-hero">
          <AdminPageHeader
            title="原视频管理"
            eyebrow="公共素材资产清单"
            action={
              <span className="ml-search admin-source-search">
                ⌕
                <input
                  value={query}
                  placeholder="搜索文件名 / 标签 / 相对路径"
                  onChange={(event) => updateQuery(event.currentTarget.value)}
                />
              </span>
            }
          />
          <div className="admin-console-statusbar" aria-label="原视频库状态">
            <span>
              <strong>素材来源</strong>
              {data.status.source_videos_path}
            </span>
            <span>
              <strong>全部原视频</strong>
              {data.status.video_count}
            </span>
            <span>
              <strong>可搜索</strong>
              {data.status.ready_video_count}
            </span>
            <span>
              <strong>预处理状态</strong>
              {data.status.ready_video_count} 可用 / {data.status.queued_video_count} 队列 / {data.status.failed_video_count} 失败
            </span>
            <span>
              <strong>搜索可见</strong>
              {data.status.ready_video_count} 个对剪辑师可见
            </span>
            <span>
              <strong>总时长</strong>
              {formatAdminDuration(data.metrics.material.total_duration_ms)}
            </span>
            <span>
              <strong>已载入</strong>
              {loadedSourceVideoCount} / {totalSourceVideoCount}
            </span>
          </div>
        </section>
        <section className="admin-source-filter-bar" aria-label="筛选预处理状态">
          {statusOptions.map((option) => (
            <button
              className={`admin-filter-chip${statusFilter === option.value ? " is-active" : ""}`}
              type="button"
              aria-pressed={statusFilter === option.value ? "true" : "false"}
              onClick={() => updateStatusFilter(option.value)}
              key={option.value}
            >
              <span>{statusFilterLabel(option, processingIsStale)}</span>
              <strong>{statusCountFromDashboard(data, option.value)}</strong>
            </button>
          ))}
          <select
            className="admin-select admin-filter-select"
            value={statusFilter}
            aria-label="筛选预处理状态"
            onChange={(event) => updateStatusFilter(event.currentTarget.value as AdminPreprocessStatus | "all")}
          >
            {statusOptions.map((option) => (
              <option value={option.value} key={option.value}>{statusFilterLabel(option, processingIsStale)}</option>
            ))}
          </select>
        </section>
        {isLoadingInitial ? (
          <EmptyState title="正在读取首批原视频" detail="页面已载入，首批 20 条素材正在加载。" />
        ) : filteredVideos.length ? (
          <>
            <SourceVideoTable
              videos={pageVideos}
              selectedSourceVideoId={selected?.source_video_id}
              currentIndexVersion={data.indexes.current_version}
              processingIsStale={processingIsStale}
              onSelect={setSelectedSourceVideoId}
              onOpenSourceDetail={onOpenSourceDetail}
            />
            <footer className="admin-pagination-row">
              <span>
                {`显示 ${pageStart + 1}-${pageEnd} / ${resultCountLabel} ${filteredVideos.length}`}
                {canLoadMoreSourceVideos ? ` · 已载入 ${loadedSourceVideoCount} / 全部 ${totalSourceVideoCount}` : ""}
              </span>
              <span className="admin-row-actions">
                <button
                  className="ml-button"
                  type="button"
                  disabled={safePageIndex === 0}
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                >
                  上一页
                </button>
                <button
                  className="ml-button"
                  type="button"
                  disabled={safePageIndex >= pageCount - 1}
                  onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                >
                  下一页
                </button>
                {canLoadMoreSourceVideos ? (
                  <button
                    className="ml-button"
                    type="button"
                    disabled={isLoadingMore || !onLoadMoreSourceVideos}
                    onClick={onLoadMoreSourceVideos}
                  >
                    {isLoadingMore ? "正在加载..." : `继续加载 ${Math.min(SOURCE_VIDEO_PAGE_SIZE, totalSourceVideoCount - loadedSourceVideoCount)} 条`}
                  </button>
                ) : null}
              </span>
            </footer>
            {canLoadMoreSourceVideos && hasLocalFilter && !serverFiltered ? (
              <p className="admin-pagination-note">
                当前搜索和状态筛选只覆盖已载入的 {loadedSourceVideoCount} 条；继续加载后会扩大筛选范围。
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState title="没有匹配的原视频" detail="请调整搜索词或状态筛选。" />
        )}
      </div>
      {selected ? (
        <SourceMetadataInspector
          video={selected}
          writeActionState={nasWriteState}
          processingIsStale={processingIsStale}
          onSave={
            onUpdateSourceVideoMetadata
              ? (metadata) => onUpdateSourceVideoMetadata(selected.source_video_id, metadata)
              : undefined
          }
          onCoverSave={
            onUpdateSourceVideoCover
              ? (coverFile) => onUpdateSourceVideoCover(selected.source_video_id, coverFile)
              : undefined
          }
          onQueueSourceVideo={onQueueSourceVideo ? () => onQueueSourceVideo(selected.source_video_id) : undefined}
          onRetrySourceVideo={onRetrySourceVideo ? () => onRetrySourceVideo(selected.source_video_id) : undefined}
          onRecoverProcessingSourceVideo={
            onRecoverProcessingSourceVideo
              ? () => onRecoverProcessingSourceVideo(selected.source_video_id)
              : undefined
          }
          onPublishSourceVideo={onPublishSourceVideo ? () => onPublishSourceVideo(selected.source_video_id) : undefined}
        />
      ) : null}
    </>
  );
}
