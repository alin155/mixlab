import {
  InspectorPanel,
  Table,
  type TableColumn
} from "@mixlab/ui-foundation";
import type { AdminDashboardData } from "../../api.ts";
import { indexValidationMessageLabel, validationStatusLabel } from "../../app/chinese.ts";
import { AdminControlButton, AdminInfoGroups, AdminPageHeader, IndexTable, MetricBand } from "../shared.tsx";

export function IndexPublishPage({
  data,
  onRepairIndex,
  onPublishSourceVideo,
  onRunDoctor
}: {
  data: AdminDashboardData;
  onRepairIndex?: () => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
  onRunDoctor?: () => void;
}) {
  const current = data.indexes.versions.find((version) => version.is_current);
  const currentValidationMessage = indexValidationMessageLabel(data.indexes.current_validation_message);
  const indexRequiredVideos = data.source_videos.filter(
    (video) => video.preprocess_status === "index-required"
  );
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
      <div className="admin-main-column">
        <AdminPageHeader
          title="索引与发布"
          eyebrow="保证已可用视频可搜索"
        />
        <MetricBand
          items={[
            { label: "当前索引", value: data.indexes.current_version, caption: "当前搜索索引指针" },
            { label: "已可用数量", value: current?.ready_video_count ?? 0, caption: "当前索引中可搜索视频" },
            { label: "待发布索引", value: data.status.index_required_video_count, caption: "发布后可见" }
          ]}
        />
        <section className="admin-action-row">
          <AdminControlButton label="发布到剪辑端" state="m9b-api" reason="发布完成预处理但尚未进入搜索索引的视频。" variant="primary" onClick={onRepairIndex} />
          <AdminControlButton label="校验索引" state="m9b-api" reason="运行系统检查并校验当前索引。" onClick={onRunDoctor} />
        </section>
        <section className="admin-list-section">
          <header className="admin-section-header">
            <h2>待发布视频清单</h2>
            <p>发布前会自动生成封面和关键帧；发布成功后剪辑端才可搜索和进入详情。</p>
          </header>
          {indexRequiredVideos.length ? (
            <Table
              columns={indexRequiredColumns}
              rows={indexRequiredVideos}
              getRowKey={(video) => video.source_video_id}
              stickyHeader
            />
          ) : (
            <p className="admin-note">没有待发布索引的视频。</p>
          )}
        </section>
        <IndexTable versions={data.indexes.versions} />
      </div>
      <InspectorPanel title="版本详情">
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
            }
          ]}
        />
      </InspectorPanel>
    </>
  );
}
