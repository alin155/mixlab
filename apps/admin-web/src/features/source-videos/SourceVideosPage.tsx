import { useMemo, useState } from "react";
import type {
  AdminDashboardData,
  AdminPreprocessStatus,
  AdminSourceVideoMetadataUpdate
} from "../../api.ts";
import { preprocessStatusLabel } from "../../app/chinese.ts";
import {
  AdminControlButton,
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

export function SourceVideosPage({
  data,
  onScanSourceVideos,
  onQueueUnprocessedVideos,
  onRetryFailedVideos,
  onUpdateSourceVideoMetadata
}: {
  data: AdminDashboardData;
  onScanSourceVideos?: () => void;
  onQueueUnprocessedVideos?: () => void;
  onRetryFailedVideos?: () => void;
  onUpdateSourceVideoMetadata?: (
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminPreprocessStatus | "all">("all");
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
          <AdminControlButton label="扫描新增视频" state="m9b-api" reason="M9B 接入扫描接口。" variant="primary" onClick={onScanSourceVideos} />
          <AdminControlButton label="处理未处理" state="m9b-api" reason="M9B 接加入队接口。" onClick={onQueueUnprocessedVideos} />
          <AdminControlButton label="重试失败视频" state="m9b-api" reason="M9B 接入失败重试接口。" onClick={onRetryFailedVideos} />
          <AdminControlButton label="查看发布清单" state="read-only" reason="M9A 只呈现入口，报告查看器另行实现。" />
        </section>
        {filteredVideos.length ? (
          <SourceVideoTable
            videos={filteredVideos}
            selectedSourceVideoId={selected?.source_video_id}
            onSelect={setSelectedSourceVideoId}
          />
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
