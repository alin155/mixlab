import {
  GroupedForm,
  InspectorPanel,
  SourceTable,
  StatusRow
} from "@mixlab/ui-foundation";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type {
  AdminDashboardData,
  AdminIndexVersion,
  AdminPreprocessJob,
  AdminSourceVideo,
  AdminSourceVideoMetadataUpdate
} from "../api.ts";
import {
  adminStatusTone,
  formatAdminDuration,
  formatAdminFileSize
} from "../app/view-model.ts";
import {
  booleanLabel,
  chineseDiagnosticText,
  jobStageLabel,
  preprocessStatusLabel,
  validationStatusLabel
} from "../app/chinese.ts";
import type { AdminControlState } from "./admin-ui-contract.ts";

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

export function AdminControlButton({
  label,
  state,
  reason,
  variant = "secondary",
  onClick
}: {
  label: string;
  state: AdminControlState;
  reason: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
}) {
  const disabled = state === "native-boundary" || state === "read-only" || !onClick;

  return (
    <button
      className={variant === "primary" ? "admin-primary-button" : "admin-secondary-button"}
      type="button"
      data-control-state={state}
      disabled={disabled}
      title={reason}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  );
}

export function MetricBand({
  items
}: {
  items: Array<{ label: string; value: string | number; caption: string }>;
}) {
  return (
    <section className="admin-metric-band" aria-label="核心指标">
      {items.map((item) => (
        <article className="admin-metric-tile" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
          <p>{item.caption}</p>
        </article>
      ))}
    </section>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="admin-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  );
}

export function CountStrip({ data }: { data: AdminDashboardData }) {
  return (
    <MetricBand
      items={[
        { label: "原视频总数", value: data.status.video_count, caption: "全部原视频" },
        { label: "已可用", value: data.status.ready_video_count, caption: "对剪辑师可见" },
        { label: "处理中", value: data.status.processing_video_count, caption: "正在生成产物" },
        { label: "队列中", value: data.status.queued_video_count, caption: "等待预处理" },
        { label: "未处理", value: data.status.unprocessed_video_count, caption: "等待入队" },
        { label: "处理失败", value: data.status.failed_video_count, caption: "失败可重试" },
        { label: "待发布索引", value: data.status.index_required_video_count, caption: "待发布索引" }
      ]}
    />
  );
}

export function SourceVideoTable({
  videos,
  selectedSourceVideoId,
  onSelect,
  onOpenSourceDetail,
  onQueueSourceVideo,
  onRetrySourceVideo,
  onPublishSourceVideo
}: {
  videos: AdminSourceVideo[];
  selectedSourceVideoId?: string;
  onSelect?: (sourceVideoId: string) => void;
  onOpenSourceDetail?: (sourceVideoId: string) => void;
  onQueueSourceVideo?: (sourceVideoId: string) => void;
  onRetrySourceVideo?: (sourceVideoId: string) => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
}) {
  const hasActions = Boolean(
    onOpenSourceDetail ||
    onQueueSourceVideo ||
    onRetrySourceVideo ||
    onPublishSourceVideo
  );
  const columns = hasActions
    ? ["ID", "封面", "文件名", "状态", "对剪辑师可见", "标签", "更新时间", "操作"]
    : ["ID", "封面", "文件名", "状态", "对剪辑师可见", "标签", "更新时间"];

  return (
    <SourceTable
      columns={columns}
      rows={videos.map((video) => {
        const cells: Array<string | ReactElement> = [
          <button
            className={`admin-link-button${video.source_video_id === selectedSourceVideoId ? " is-selected" : ""}`}
            type="button"
            onClick={() => onSelect?.(video.source_video_id)}
            key={`${video.source_video_id}-select`}
          >
            {video.source_video_id}
          </button>,
          <img className="admin-table-cover" src={video.cover_url} alt="" key={`${video.source_video_id}-cover`} />,
          video.file_name,
          preprocessStatusLabel(video.preprocess_status),
          booleanLabel(video.visible_to_cutters),
          video.tags.join(" / "),
          video.updated_at
        ];

        if (hasActions) {
          const actions: ReactElement[] = [];

          if (video.preprocess_status === "unprocessed") {
            actions.push(
              <AdminControlButton
                label="处理此视频"
                state="m9b-api"
                reason="只将这一条未处理原视频加入预处理队列。"
                onClick={() => onQueueSourceVideo?.(video.source_video_id)}
                key={`${video.source_video_id}-queue`}
              />
            );
          }

          if (video.preprocess_status === "failed") {
            actions.push(
              <AdminControlButton
                label="重试此视频"
                state="m9b-api"
                reason="只将这一条失败原视频重新加入预处理队列。"
                onClick={() => onRetrySourceVideo?.(video.source_video_id)}
                key={`${video.source_video_id}-retry`}
              />
            );
          }

          if (video.preprocess_status === "index-required") {
            actions.push(
              <AdminControlButton
                label="发布此视频"
                state="m9b-api"
                reason="只发布这一条待索引视频，发布前会补齐封面和关键帧。"
                onClick={() => onPublishSourceVideo?.(video.source_video_id)}
                key={`${video.source_video_id}-publish`}
              />
            );
          }

          if (onOpenSourceDetail) {
            actions.push(
              <button
                className="admin-link-button"
                type="button"
                onClick={() => onOpenSourceDetail(video.source_video_id)}
                key={`${video.source_video_id}-detail`}
              >
                查看详情
              </button>
            );
          }

          cells.push(
            actions.length === 1
              ? actions[0]
              : (
                  <span className="admin-row-actions" key={`${video.source_video_id}-actions`}>
                    {actions}
                  </span>
                )
          );
        }

        return cells;
      })}
    />
  );
}

export function SourceMetadataInspector({
  video,
  onSave
}: {
  video: AdminSourceVideo;
  onSave?: (metadata: AdminSourceVideoMetadataUpdate) => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [tags, setTags] = useState(video.tags.join(", "));
  const [description, setDescription] = useState(video.description);
  const [lecturer, setLecturer] = useState(video.lecturer);
  const [course, setCourse] = useState(video.course);
  const [category, setCategory] = useState(video.category);

  useEffect(() => {
    setTitle(video.title);
    setTags(video.tags.join(", "));
    setDescription(video.description);
    setLecturer(video.lecturer);
    setCourse(video.course);
    setCategory(video.category);
  }, [video]);

  return (
    <InspectorPanel title={video.source_video_id}>
      <img className="admin-inspector-cover" src={video.cover_url} alt="" />
      <div className="admin-edit-form" aria-label="公开元数据预览">
        <label>
          <span>标题</span>
          <input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
        </label>
        <label>
          <span>标签</span>
          <input value={tags} onChange={(event) => setTags(event.currentTarget.value)} />
        </label>
        <label>
          <span>说明</span>
          <textarea value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
        </label>
        <label>
          <span>讲师</span>
          <input value={lecturer} onChange={(event) => setLecturer(event.currentTarget.value)} />
        </label>
        <label>
          <span>课程</span>
          <input value={course} onChange={(event) => setCourse(event.currentTarget.value)} />
        </label>
        <label>
          <span>分类</span>
          <input value={category} onChange={(event) => setCategory(event.currentTarget.value)} />
        </label>
      </div>
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
              { label: "对剪辑师可见", value: booleanLabel(video.visible_to_cutters) }
            ]
          }
        ]}
      />
      {video.error_message ? (
        <p className="admin-note">失败原因：{jobStageLabel(video.error_stage ?? "unknown")} · {chineseDiagnosticText(video.error_message)}</p>
      ) : null}
      <AdminControlButton
        label="保存公开说明"
        state="m9b-api"
        reason="M9B 接入公开说明保存接口。"
        variant="primary"
        onClick={() =>
          onSave?.({
            title,
            tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
            description,
            lecturer,
            course,
            category
          })
        }
      />
    </InspectorPanel>
  );
}

export function JobRows({
  jobs,
  onRetryFailed,
  averageProcessMs = 0
}: {
  jobs: AdminPreprocessJob[];
  onRetryFailed?: () => void;
  averageProcessMs?: number;
}) {
  return (
    <section className="admin-list-panel">
      {jobs.map((job, index) => {
        const estimatedDuration = averageProcessMs > 0
          ? formatAdminDuration(averageProcessMs)
          : "等待估算";
        const estimatedStart = job.estimated_start_at
          ? ` · 预计开始 ${job.estimated_start_at.replace("T", " ").slice(0, 16)}`
          : "";
        const estimatedDone = job.estimated_done_at
          ? ` · 预计完成 ${job.estimated_done_at.replace("T", " ").slice(0, 16)}`
          : "";
        const detail = job.status === "queued"
          ? `${job.title} · ${job.status_label || "等待处理"} · 排队第 ${job.queue_position || index + 1} 位${estimatedStart} · 预计耗时 ${estimatedDuration}${estimatedDone}`
          : job.status === "running"
            ? `${job.title} · ${job.stage_label || jobStageLabel(job.stage)} · 已用时 ${formatAdminDuration(job.elapsed_ms)} · 预计剩余 ${formatAdminDuration(job.estimated_remaining_ms)}`
            : job.status === "failed"
              ? `${job.title} · ${job.stage_label || jobStageLabel(job.stage)}${job.error_message ? ` · ${chineseDiagnosticText(job.error_message)}` : ""}`
              : `${job.title} · ${job.stage_label || jobStageLabel(job.stage)} · 已完成`;

        return (
          <StatusRow
            tone={adminStatusTone(job.status)}
            label={job.job_id}
            detail={detail}
            value={
              job.status === "failed" && job.retryable
                ? (
                  <AdminControlButton
                    label="重试失败"
                    state="m9b-api"
                    reason="M9B 接入失败重试接口。"
                    onClick={onRetryFailed}
                  />
                )
                : job.status === "queued"
                  ? "等待处理"
                  : `${job.progress}%`
            }
            key={job.job_id}
          />
        );
      })}
    </section>
  );
}

export function IndexTable({ versions }: { versions: AdminIndexVersion[] }) {
  return (
    <SourceTable
      columns={["版本", "创建时间", "已可用数量", "协议版本", "校验", "当前状态"]}
      rows={versions.map((version) => [
        version.index_version,
        version.created_at,
        version.ready_video_count,
        version.schema_version,
        validationStatusLabel(version.validation_status),
        version.is_current ? "当前索引指向" : "历史版本"
      ])}
    />
  );
}

export function DiskUsage({ data }: { data: AdminDashboardData }) {
  const used = data.status.disk_total_bytes - data.status.disk_available_bytes;
  const percent = data.status.disk_total_bytes > 0
    ? Math.round((used / data.status.disk_total_bytes) * 100)
    : 0;

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
            { label: "阶段", value: active ? jobStageLabel(active.stage) : "-" },
            { label: "耗时", value: active ? formatAdminDuration(active.elapsed_ms) : "-" },
            { label: "当前索引", value: data.indexes.current_version }
          ]
        }
      ]}
    />
  );
}
