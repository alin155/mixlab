import {
  Badge,
  InspectorPanel,
  Table,
  type TableColumn
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { indexValidationMessageLabel, validationStatusLabel } from "../../app/chinese.ts";
import {
  adminRuntimeCacheStatusLabel,
  adminRuntimeComponentSummary,
  adminRuntimeDataSourceLabel,
  adminRuntimeScanModeLabel,
  adminRuntimeScanReasonLabel,
  adminRuntimeSlowReasonLabel
} from "../../app/runtime-observability-labels.ts";
import { AdminControlButton, AdminInfoGroups, AdminPageHeader, EmptyState, IndexTable, MetricBand } from "../shared.tsx";

export function IndexPublishPage({
  data,
  isLoadingIndexRequiredVideos = false,
  indexRequiredError = "",
  onRepairIndex,
  onPublishSourceVideo,
  onRunDoctor
}: {
  data: AdminDashboardData;
  isLoadingIndexRequiredVideos?: boolean;
  indexRequiredError?: string;
  onRepairIndex?: () => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
  onRunDoctor?: () => void;
}) {
  const current = data.indexes.versions.find((version) => version.is_current);
  const currentValidationMessage = indexValidationMessageLabel(data.indexes.current_validation_message);
  const validationTone = data.indexes.current_validation_status === "pass"
    ? "success"
    : data.indexes.current_validation_status === "warn"
      ? "warning"
      : "danger";
  const indexRequiredVideos = data.source_videos.filter(
    (video) => video.preprocess_status === "index-required"
  );
  const indexRequiredLabel = indexRequiredVideos.length > 0
    ? `${indexRequiredVideos.length} 条待发布`
    : data.status.index_required_video_count > 0
      ? `摘要 ${data.status.index_required_video_count} 条`
      : "无待发布";
  const returnedVersionCount = data.indexes.returned_count ?? data.indexes.versions.length;
  const totalVersionCount = data.indexes.total_count ?? returnedVersionCount;
  const indexRuntime = data.indexes.runtime;
  const indexRuntimeSourceLabel = indexRuntime
    ? `${adminRuntimeDataSourceLabel(indexRuntime.actual_data_source)} · ${adminRuntimeScanModeLabel(indexRuntime.scan_mode)} · ${adminRuntimeCacheStatusLabel(indexRuntime.cache_status)}`
    : "等待路由数据";
  const indexRequiredColumns: Array<TableColumn<(typeof indexRequiredVideos)[number]>> = [
    { id: "id", header: "ID", accessor: "source_video_id" },
    { id: "file", header: "文件名", accessor: "file_name" },
    { id: "status", header: "状态", render: () => "待发布索引" },
    {
      id: "visibility",
      header: "可见性",
      render: (video) => video.visible_to_cutters ? "已可见" : "未可见"
    },
    {
      id: "actions",
      header: "操作",
      render: (video) => (
        <AdminControlButton
          label="发布到剪辑端"
          state="m9b-api"
          reason="发布当前待索引视频，发布前会补齐封面和关键帧。"
          onClick={() => onPublishSourceVideo?.(video.source_video_id)}
        />
      )
    }
  ];

  return (
    <>
      <div className="admin-main-column admin-index-publish-console">
        <AdminPageHeader
          title="发布与索引"
          eyebrow="保证已可用视频可搜索"
          description="发布队列和索引版本按路由加载，页面打开不触发全库扫描。"
          action={(
            <div className="admin-page-header-actions">
              <AdminControlButton label="发布到剪辑端" state="m9b-api" reason="发布完成预处理但尚未进入搜索索引的视频。" variant="primary" onClick={onRepairIndex} />
              <AdminControlButton label="校验索引" state="m9b-api" reason="运行系统检查并校验当前索引。" onClick={onRunDoctor} />
            </div>
          )}
        />
        <MetricBand
          items={[
            { label: "当前索引", value: data.indexes.current_version, caption: "当前搜索索引指针" },
            { label: "已可用数量", value: current?.ready_video_count ?? 0, caption: "当前索引中可搜索视频" },
            { label: "待发布索引", value: data.status.index_required_video_count, caption: "发布后可见" },
            { label: "索引版本", value: `${returnedVersionCount}/${totalVersionCount}`, caption: "当前页 / 全部版本" }
          ]}
        />
        <section className="admin-index-route-contract" aria-label="发布与索引数据来源">
          <div>
            <span>发布队列</span>
            <strong>读模型</strong>
            <p>路由加载 · 不扫描</p>
          </div>
          <div>
            <span>索引版本</span>
            <strong>索引版本包</strong>
            <p>分页读取 · 不扫描素材目录</p>
          </div>
          <div>
            <span>当前校验</span>
            <strong>{validationStatusLabel(data.indexes.current_validation_status)}</strong>
            <p>{currentValidationMessage}</p>
          </div>
        </section>
        <section className="admin-index-route-contract" aria-label="索引版本扫描证据">
          <div>
            <span>版本读取</span>
            <strong>{indexRuntime ? adminRuntimeScanModeLabel(indexRuntime.scan_mode) : "等待路由数据"}</strong>
            <p>{indexRuntime ? `${adminRuntimeScanReasonLabel(indexRuntime.scan_reason)} · ${indexRuntime.duration_ms}ms` : "路由数据返回后显示扫描证据"}</p>
          </div>
          <div>
            <span>版本来源</span>
            <strong>{indexRuntime ? adminRuntimeDataSourceLabel(indexRuntime.actual_data_source) : "索引版本包"}</strong>
            <p>{indexRuntimeSourceLabel}</p>
          </div>
          <div>
            <span>版本窗口</span>
            <strong>{indexRuntime?.result_count ?? returnedVersionCount}</strong>
            <p>偏移 {indexRuntime?.offset ?? data.indexes.offset ?? 0} · 上限 {indexRuntime?.limit ?? data.indexes.limit ?? returnedVersionCount}</p>
          </div>
          <div>
            <span>版本慢请求</span>
            <strong>{indexRuntime?.slow ? "需处理" : "正常"}</strong>
            <p>{indexRuntime ? adminRuntimeSlowReasonLabel(indexRuntime) : "未收到慢请求标记"}</p>
          </div>
          <div>
            <span>版本组件耗时</span>
            <strong>{indexRuntime?.components?.length ?? 0} 个组件</strong>
            <p>{indexRuntime ? adminRuntimeComponentSummary(indexRuntime) : "暂无组件耗时"}</p>
          </div>
        </section>
        <section className="admin-list-section admin-publication-queue" aria-label="发布队列">
          <header className="admin-section-header">
            <div>
              <h2>发布队列</h2>
              <p>待发布索引的视频来自路由状态查询；发布成功后剪辑端才可搜索和进入详情。</p>
            </div>
            <Badge tone={data.status.index_required_video_count > 0 ? "warning" : "success"}>
              {indexRequiredLabel}
            </Badge>
          </header>
          {isLoadingIndexRequiredVideos ? (
            <EmptyState title="正在读取待发布视频" detail="页面框架已可用，待发布首屏会通过状态查询补上。" />
          ) : indexRequiredError ? (
            <EmptyState title="发布队列加载失败" detail={indexRequiredError} />
          ) : indexRequiredVideos.length ? (
            <Table
              columns={indexRequiredColumns}
              rows={indexRequiredVideos}
              getRowKey={(video) => video.source_video_id}
              stickyHeader
            />
          ) : data.status.index_required_video_count > 0 ? (
            <p className="admin-note">当前摘要显示仍有待发布视频，待发布首屏尚未返回明细，可刷新本页或检查读模型状态。</p>
          ) : (
            <p className="admin-note">没有待发布索引的视频。</p>
          )}
        </section>
        <section className="admin-list-section admin-index-version-surface" aria-label="索引版本">
          <header className="admin-section-header">
            <div>
              <h2>索引版本</h2>
              <p>剪辑端搜索读取当前索引指针；历史版本只作为发布与回溯依据。</p>
            </div>
            <Badge tone={validationTone}>{validationStatusLabel(data.indexes.current_validation_status)}</Badge>
          </header>
          <IndexTable versions={data.indexes.versions} />
        </section>
      </div>
      <InspectorPanel title="版本详情" subtitle="发布与索引">
        <AdminInfoGroups
          groups={[
            {
              title: current?.index_version ?? "current",
              rows: [
                { label: "当前索引", value: data.indexes.current_version },
                { label: "当前索引状态", value: currentValidationMessage },
                { label: "已可用数量", value: current?.ready_video_count ?? 0 },
                { label: "协议版本", value: current?.schema_version ?? "-" },
                { label: "校验", value: current ? validationStatusLabel(current.validation_status) : "需处理" },
                { label: "校验说明", value: current ? indexValidationMessageLabel(current.validation_message) : currentValidationMessage },
                { label: "发布人", value: current?.published_by ?? "-" }
              ]
            },
            {
              title: "页面契约",
              rows: [
                { label: "主工作区", value: "发布队列" },
                { label: "辅助区", value: "索引版本" },
                { label: "发布队列来源", value: "读模型" },
                { label: "版本来源", value: "索引版本包" },
                { label: "扫描模式", value: "不扫描" },
                { label: "错误边界", value: "本页面局部处理" }
              ]
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
