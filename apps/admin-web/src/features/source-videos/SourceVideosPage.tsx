import { Badge } from "@mixlab/ui-foundation";
import { useEffect, useMemo, useState } from "react";
import type {
  AdminDashboardData,
  AdminPreprocessStatus,
  AdminReadModelReconcilerStatus,
  AdminRuntimeEndpointMeta,
  AdminSourceVideoMetadataUpdate
} from "../../api.ts";
import { preprocessStatusLabel } from "../../app/chinese.ts";
import {
  adminRuntimeCacheStatusLabel,
  adminRuntimeComponentSummary,
  adminRuntimeDataSourceLabel,
  adminRuntimeFallbackReasonLabel,
  adminRuntimeScanModeLabel,
  adminRuntimeScanReasonLabel,
  adminRuntimeSlowReasonLabel
} from "../../app/runtime-observability-labels.ts";
import { formatAdminDuration } from "../../app/view-model.ts";
import {
  AdminPageHeader,
  EmptyState,
  MetricBand,
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

function runtimeSourceLabel(runtime?: AdminRuntimeEndpointMeta | null): string {
  if (!runtime) {
    return "读模型";
  }

  if (runtime.actual_data_source === "admin-read-model") {
    return "读模型命中";
  }

  if (
    runtime.data_source === "admin-read-model" &&
    runtime.actual_data_source === "source-video-manifest"
  ) {
    return "读模型回退";
  }

  if (runtime.actual_data_source === "source-video-manifest") {
    return "清单回退";
  }

  return "运行时诊断";
}

function runtimeDetailLabel(runtime?: AdminRuntimeEndpointMeta | null): string {
  if (!runtime) {
    return "分页读取 · 不扫描";
  }

  const fallbackReason = adminRuntimeFallbackReasonLabel(runtime.fallback_reason);
  const scanLabel = runtime.scan_mode === "no-scan" || runtime.scan_mode === "paged-list"
    ? "不扫描"
    : "受控扫描";
  const timing = `${runtime.duration_ms}ms`;

  if (fallbackReason) {
    return `原因：${fallbackReason} · ${timing}`;
  }

  return `分页读取 · ${scanLabel} · ${timing}`;
}

function runtimeNeedsReadModelMaintenance(runtime?: AdminRuntimeEndpointMeta | null): boolean {
  return runtime?.fallback_reason === "manifest-fallback:forbidden";
}

function reconcileStatusLabel(status: AdminReadModelReconcilerStatus["status"]): string {
  const labels: Record<AdminReadModelReconcilerStatus["status"], string> = {
    idle: "未运行",
    running: "运行中",
    succeeded: "已完成",
    skipped: "已跳过",
    cancelled: "已取消",
    failed: "失败"
  };

  return labels[status];
}

function reconcilePhaseLabel(phase: AdminReadModelReconcilerStatus["phase"]): string {
  const labels: Record<AdminReadModelReconcilerStatus["phase"], string> = {
    idle: "空闲",
    starting: "启动中",
    scanning: "读取快照",
    writing: "写入读模型",
    completed: "完成",
    cancelled: "取消",
    failed: "失败"
  };

  return labels[phase];
}

function reconcileStepLabel(step: AdminReadModelReconcilerStatus["progress"]["current_step"]): string {
  const labels: Record<AdminReadModelReconcilerStatus["progress"]["current_step"], string> = {
    idle: "空闲",
    starting: "启动中",
    "library-manifest": "读取 library.json",
    "source-video-manifests": "读取素材清单",
    "preprocess-job-snapshots": "读取任务快照",
    writing: "写入读模型",
    completed: "完成",
    cancelled: "取消",
    failed: "失败"
  };

  return labels[step];
}

function reconcileProgressSummary(status?: AdminReadModelReconcilerStatus | null): string {
  if (!status) {
    return "状态可在保护中心查看。";
  }

  const progress = status.progress;
  const percent = `${Math.max(0, Math.min(100, Math.round(progress.percent)))}%`;
  const cancelLabel = status.cancel_requested ? " · 已请求停止" : "";

  return [
    reconcilePhaseLabel(status.phase),
    reconcileStepLabel(progress.current_step),
    percent
  ].join(" · ") + cancelLabel;
}

export function SourceVideosPage({
  data,
  sourceVideoRuntime,
  isLoadingInitial = false,
  isLoadingMore = false,
  hasMoreSourceVideos,
  sourceQuery,
  sourceStatusFilter,
  sourceVideoError = "",
  onQueueSourceVideo,
  onRetrySourceVideo,
  onRecoverProcessingSourceVideo,
  onPublishSourceVideo,
  onUpdateSourceVideoMetadata,
  onUpdateSourceVideoCover,
  onOpenSourceDetail,
  onSourceVideoFiltersChange,
  onLoadMoreSourceVideos,
  readModelMaintenanceHref,
  onStartReadModelReconcile,
  readModelMaintenanceBusy = false,
  readModelReconcileStatus,
  readModelReconcileError = ""
}: {
  data: AdminDashboardData;
  sourceVideoRuntime?: AdminRuntimeEndpointMeta | null;
  isLoadingInitial?: boolean;
  isLoadingMore?: boolean;
  hasMoreSourceVideos?: boolean;
  sourceQuery?: string;
  sourceStatusFilter?: AdminPreprocessStatus | "all";
  sourceVideoError?: string;
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
  readModelMaintenanceHref?: string;
  onStartReadModelReconcile?: () => void | Promise<void>;
  readModelMaintenanceBusy?: boolean;
  readModelReconcileStatus?: AdminReadModelReconcilerStatus | null;
  readModelReconcileError?: string;
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
  const activeStatusTotal = statusCountFromDashboard(data, statusFilter);
  const productionBacklogCount =
    data.status.queued_video_count +
    data.status.processing_video_count +
    data.status.failed_video_count +
    data.status.index_required_video_count;
  const loadedCountLabel = canLoadMoreSourceVideos
    ? `${loadedSourceVideoCount}/${totalSourceVideoCount}`
    : `${loadedSourceVideoCount}`;
  const filterModeLabel = serverFiltered ? "路由刷新" : "本地筛选";
  const runtimeSource = runtimeSourceLabel(sourceVideoRuntime);
  const runtimeDetail = runtimeDetailLabel(sourceVideoRuntime);
  const needsReadModelMaintenance = runtimeNeedsReadModelMaintenance(sourceVideoRuntime);
  const runtimeFallbackReason = adminRuntimeFallbackReasonLabel(sourceVideoRuntime?.fallback_reason);
  const reconcileStateLabel = readModelReconcileStatus
    ? reconcileStatusLabel(readModelReconcileStatus.status)
    : "未读取";
  const reconcileStateDetail = readModelReconcileError || reconcileProgressSummary(readModelReconcileStatus);

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
      <div className="admin-main-column admin-source-videos-console">
        <section className="admin-console-hero">
          <AdminPageHeader
            title="素材库"
            eyebrow="公共素材资产清单"
            description="素材表格按路由加载，页面打开不触发全库扫描。"
          />
          <MetricBand
            items={[
              { label: "全部原视频", value: totalSourceVideoCount, caption: "读模型统计" },
              { label: "可搜索", value: data.status.ready_video_count, caption: "对剪辑师可见" },
              { label: "生产待处理", value: productionBacklogCount, caption: "待处理项" },
              { label: "已载入", value: loadedCountLabel, caption: "当前路由分页" }
            ]}
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
        <section className="admin-source-route-contract" aria-label="素材库数据来源">
          <div>
            <span>素材表格</span>
            <strong>{runtimeSource}</strong>
            <p>{runtimeDetail}</p>
          </div>
          <div>
            <span>状态与搜索</span>
            <strong>页面控制</strong>
            <p>{filterModeLabel} · 不写协议文件</p>
          </div>
          <div>
            <span>素材详情</span>
            <strong>Inspector</strong>
            <p>选中素材局部处理</p>
          </div>
        </section>
        {sourceVideoRuntime ? (
          <section className="admin-source-route-contract" aria-label="素材库扫描证据">
            <div>
              <span>扫描模式</span>
              <strong>{adminRuntimeScanModeLabel(sourceVideoRuntime.scan_mode)}</strong>
              <p>{adminRuntimeScanReasonLabel(sourceVideoRuntime.scan_reason)} · {sourceVideoRuntime.duration_ms}ms</p>
            </div>
            <div>
              <span>数据来源</span>
              <strong>{adminRuntimeDataSourceLabel(sourceVideoRuntime.actual_data_source)}</strong>
              <p>计划来源 {adminRuntimeDataSourceLabel(sourceVideoRuntime.data_source)} · {adminRuntimeCacheStatusLabel(sourceVideoRuntime.cache_status)}</p>
            </div>
            <div>
              <span>返回窗口</span>
              <strong>{sourceVideoRuntime.result_count}</strong>
              <p>偏移 {sourceVideoRuntime.offset} · 上限 {sourceVideoRuntime.limit}</p>
            </div>
            <div>
              <span>慢请求</span>
              <strong>{sourceVideoRuntime.slow ? "需处理" : "正常"}</strong>
              <p>{adminRuntimeSlowReasonLabel(sourceVideoRuntime)}</p>
            </div>
            <div>
              <span>回退原因</span>
              <strong>{runtimeFallbackReason || "无"}</strong>
              <p>{sourceVideoRuntime.repair_reason ? "已带修复提示" : "未触发自动修复"}</p>
            </div>
            <div>
              <span>组件耗时</span>
              <strong>{sourceVideoRuntime.components?.length ?? 0} 个组件</strong>
              <p>{adminRuntimeComponentSummary(sourceVideoRuntime)}</p>
            </div>
          </section>
        ) : null}
        {needsReadModelMaintenance ? (
          <section className="admin-source-route-contract" aria-label="读模型维护入口">
            <div>
              <span>读模型维护</span>
              <strong>需要对账</strong>
              <p>当前筛选已阻断清单回退，避免页面扫描 NAS 大目录。</p>
            </div>
            <div>
              <span>处理入口</span>
              <strong>保护中心</strong>
              <p>检查读模型状态、对账计划和保护门禁。</p>
            </div>
            <div>
              <span>对账状态</span>
              <strong>{reconcileStateLabel}</strong>
              <p>{reconcileStateDetail}</p>
            </div>
            <div>
              <span>维护动作</span>
              <strong>显式命令</strong>
              <p>先查看保护中心；确认后可启动后台对账。</p>
              <span className="admin-row-actions">
                {readModelMaintenanceHref ? (
                  <a className="ml-button" href={readModelMaintenanceHref}>
                    打开保护中心
                  </a>
                ) : null}
                {onStartReadModelReconcile ? (
                  <button
                    className="ml-button"
                    type="button"
                    disabled={readModelMaintenanceBusy}
                    onClick={() => {
                      void onStartReadModelReconcile();
                    }}
                  >
                    {readModelMaintenanceBusy ? "对账启动中..." : "启动后台对账"}
                  </button>
                ) : null}
              </span>
            </div>
          </section>
        ) : null}
        <section className="admin-source-filter-bar admin-source-filter-card" aria-label="筛选预处理状态">
          <div className="admin-source-select-wrap">
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
          </div>
          <span className="ml-search admin-source-search">
            ⌕
            <input
              value={query}
              placeholder="搜索文件名 / 标签 / 相对路径"
              onChange={(event) => updateQuery(event.currentTarget.value)}
            />
          </span>
          <span className="admin-source-filter-count">
            共 {totalSourceVideoCount} 个视频 · 当前状态 {activeStatusTotal} · 已载入 {loadedSourceVideoCount}
          </span>
        </section>
        <section className="admin-list-section admin-source-table-surface" aria-label="素材表格">
          <header className="admin-section-header">
            <div>
              <h2>素材表格</h2>
              <p>首屏和继续加载都走素材库路由；状态筛选不会让页面直接扫描 NAS 大目录。</p>
            </div>
            <Badge tone={canLoadMoreSourceVideos ? "warning" : "success"}>
              已载入 {loadedCountLabel}
            </Badge>
          </header>
          {sourceVideoError && filteredVideos.length ? (
            <p className="admin-note admin-route-error">{sourceVideoError}</p>
          ) : null}
          {isLoadingInitial ? (
            <EmptyState title="正在读取首批原视频" detail="页面已载入，首批 20 条素材正在加载，数据来自读模型分页。" />
          ) : sourceVideoError && !filteredVideos.length ? (
            <EmptyState title="素材表格加载失败" detail={sourceVideoError} />
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
        </section>
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
