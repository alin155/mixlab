import {
  GroupedForm,
  InspectorPanel,
  SourceTable,
  StatusRow
} from "@mixlab/ui-foundation";
import type { ReactNode } from "react";
import type {
  AdminDashboardData,
  AdminIndexVersion,
  AdminPreprocessJob,
  AdminSourceVideo
} from "../api.ts";
import {
  adminStatusTone,
  formatAdminDuration,
  formatAdminFileSize
} from "../app/view-model.ts";

export function AdminPageHeader({
  title,
  eyebrow,
  action
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function CountStrip({ data }: { data: AdminDashboardData }) {
  const counts = [
    ["原视频总数", data.status.video_count, "全部原视频"],
    ["Ready", data.status.ready_video_count, "对剪辑师可见"],
    ["Processing", data.status.processing_video_count, "处理中"],
    ["Queued", data.status.queued_video_count, "队列中"],
    ["Unprocessed", data.status.unprocessed_video_count, "未处理"],
    ["Failed", data.status.failed_video_count, "失败可重试"],
    ["Index Required", data.status.index_required_video_count, "待发布索引"]
  ];

  return (
    <section className="admin-count-strip" aria-label="素材库状态计数">
      {counts.map(([label, value, caption]) => (
        <article className="admin-count-tile" key={String(label)}>
          <strong>{value}</strong>
          <span>{label}</span>
          <p>{caption}</p>
        </article>
      ))}
    </section>
  );
}

export function SourceVideoTable({ videos }: { videos: AdminSourceVideo[] }) {
  return (
    <SourceTable
      columns={["ID", "封面", "文件名", "状态", "对剪辑师可见", "更新时间"]}
      rows={videos.map((video) => [
        video.source_video_id,
        <img className="admin-table-cover" src={video.cover_url} alt="" key={`${video.source_video_id}-cover`} />,
        video.file_name,
        video.preprocess_status,
        video.visible_to_cutters ? "是" : "否",
        video.updated_at
      ])}
    />
  );
}

export function SourceMetadataInspector({ video }: { video: AdminSourceVideo }) {
  return (
    <InspectorPanel title={video.source_video_id}>
      <img className="admin-inspector-cover" src={video.cover_url} alt="" />
      <GroupedForm
        groups={[
          {
            title: "公共元数据",
            rows: [
              { label: "封面", value: "已配置" },
              { label: "标题", value: video.title },
              { label: "标签", value: video.tags.join(" / ") },
              { label: "说明", value: video.description },
              { label: "讲师", value: video.lecturer },
              { label: "课程", value: video.course },
              { label: "分类", value: video.category },
              { label: "对剪辑师可见", value: video.visible_to_cutters ? "是" : "否" }
            ]
          }
        ]}
      />
      <button className="admin-primary-button" type="button">保存公开说明</button>
    </InspectorPanel>
  );
}

export function JobRows({ jobs }: { jobs: AdminPreprocessJob[] }) {
  return (
    <section className="admin-list-panel">
      {jobs.map((job) => (
        <StatusRow
          tone={adminStatusTone(job.status)}
          label={job.job_id}
          detail={`${job.title} · ${job.stage} · ${job.log_path}${job.error_message ? ` · ${job.error_message}` : ""}`}
          value={job.status === "failed" && job.retryable ? "重试" : `${job.progress}%`}
          key={job.job_id}
        />
      ))}
    </section>
  );
}

export function IndexTable({ versions }: { versions: AdminIndexVersion[] }) {
  return (
    <SourceTable
      columns={["版本", "创建时间", "Ready 数量", "schema", "校验", "current"]}
      rows={versions.map((version) => [
        version.index_version,
        version.created_at,
        version.ready_video_count,
        version.schema_version,
        version.validation_status === "pass" ? "通过" : version.validation_status,
        version.is_current ? "current.json 指向" : "历史版本"
      ])}
    />
  );
}

export function DiskUsage({ data }: { data: AdminDashboardData }) {
  const used = data.status.disk_total_bytes - data.status.disk_available_bytes;
  const percent = Math.round((used / data.status.disk_total_bytes) * 100);

  return (
    <section className="admin-disk">
      <div>
        <strong>磁盘空间</strong>
        <span>{formatAdminFileSize(data.status.disk_available_bytes)} 可用 / {formatAdminFileSize(data.status.disk_total_bytes)}</span>
      </div>
      <meter min={0} max={100} value={percent}>{percent}%</meter>
    </section>
  );
}

export function JobSummaryForm({ data }: { data: AdminDashboardData }) {
  const active = data.jobs.jobs.find((job) => job.status === "running");

  return (
    <GroupedForm
      groups={[
        {
          title: "当前任务",
          rows: [
            { label: "任务", value: active?.title ?? "无" },
            { label: "阶段", value: active?.stage ?? "-" },
            { label: "耗时", value: active ? formatAdminDuration(active.elapsed_ms) : "-" },
            { label: "当前索引", value: data.indexes.current_version }
          ]
        }
      ]}
    />
  );
}
