import { useEffect, useMemo, useState } from "react";
import type {
  AdminDashboardData,
  AdminPreprocessStatus,
  AdminSourceVideoMetadataUpdate
} from "../../api.ts";
import { preprocessStatusLabel } from "../../app/chinese.ts";
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

const SOURCE_VIDEO_PAGE_SIZE = 100;

export function SourceVideosPage({
  data,
  onQueueSourceVideo,
  onRetrySourceVideo,
  onPublishSourceVideo,
  onUpdateSourceVideoMetadata,
  onOpenSourceDetail
}: {
  data: AdminDashboardData;
  onQueueSourceVideo?: (sourceVideoId: string) => void;
  onRetrySourceVideo?: (sourceVideoId: string) => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
  onUpdateSourceVideoMetadata?: (
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ) => void;
  onOpenSourceDetail?: (sourceVideoId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminPreprocessStatus | "all">("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedSourceVideoId, setSelectedSourceVideoId] = useState(
    data.source_videos.find((video) => video.source_video_id === "V000042")?.source_video_id ??
    data.source_videos[0]?.source_video_id ??
    ""
  );

  const filteredVideos = useMemo(() => {
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
  }, [data.source_videos, query, statusFilter]);

  useEffect(() => {
    setPageIndex(0);
  }, [query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredVideos.length / SOURCE_VIDEO_PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * SOURCE_VIDEO_PAGE_SIZE;
  const pageVideos = filteredVideos.slice(pageStart, pageStart + SOURCE_VIDEO_PAGE_SIZE);
  const pageEnd = pageVideos.length ? pageStart + pageVideos.length : 0;

  const selected =
    data.source_videos.find((video) => video.source_video_id === selectedSourceVideoId) ??
    filteredVideos[0] ??
    data.source_videos[0];

  return (
    <>
      <div className="admin-main-column">
        <AdminPageHeader
          title="原视频管理"
          eyebrow="公共元数据"
          action={
            <span className="ml-search">
              ⌕
              <input
                value={query}
                placeholder="搜索文件名 / 标签 / 相对路径"
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </span>
          }
        />
        <section className="admin-action-row">
          <select
            className="admin-select"
            value={statusFilter}
            aria-label="筛选预处理状态"
            onChange={(event) => setStatusFilter(event.currentTarget.value as AdminPreprocessStatus | "all")}
          >
            {statusOptions.map((option) => (
              <option value={option.value} key={option.value}>{option.label}</option>
            ))}
          </select>
        </section>
        {filteredVideos.length ? (
          <>
            <SourceVideoTable
              videos={pageVideos}
              selectedSourceVideoId={selected?.source_video_id}
              onSelect={setSelectedSourceVideoId}
              onOpenSourceDetail={onOpenSourceDetail}
              onQueueSourceVideo={onQueueSourceVideo}
              onRetrySourceVideo={onRetrySourceVideo}
              onPublishSourceVideo={onPublishSourceVideo}
            />
            <footer className="admin-pagination-row">
              <span>{`显示 ${pageStart + 1}-${pageEnd} / ${filteredVideos.length}`}</span>
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
              </span>
            </footer>
          </>
        ) : (
          <EmptyState title="没有匹配的原视频" detail="请调整搜索词或状态筛选。" />
        )}
      </div>
      {selected ? (
        <SourceMetadataInspector
          video={selected}
          onSave={(metadata) => onUpdateSourceVideoMetadata?.(selected.source_video_id, metadata)}
        />
      ) : null}
    </>
  );
}
