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
  AdminPreprocessStatus,
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
  indexValidationMessageLabel,
  jobStageLabel,
  preprocessStatusLabel,
  validationStatusLabel
} from "../app/chinese.ts";
import type { AdminControlState } from "./admin-ui-contract.ts";

export function AdminPageHeader({
  title,
  eyebrow,
  description,
  action
}: {
  title: string;
  eyebrow: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <span>{description}</span> : null}
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
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";
  const processingIsStale = data.status.processing_video_count > 0 && !supervisorRunning;

  return (
    <MetricBand
      items={[
        { label: "原视频总数", value: data.status.video_count, caption: "全部原视频" },
        { label: "已可用", value: data.status.ready_video_count, caption: "对剪辑师可见" },
        {
          label: processingIsStale ? "待恢复" : "处理中",
          value: data.status.processing_video_count,
          caption: processingIsStale ? "服务未运行" : "正在生成产物"
        },
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
  currentIndexVersion,
  processingIsStale = false,
  onSelect,
  onOpenSourceDetail
}: {
  videos: AdminSourceVideo[];
  selectedSourceVideoId?: string;
  currentIndexVersion?: string;
  processingIsStale?: boolean;
  onSelect?: (sourceVideoId: string) => void;
  onOpenSourceDetail?: (sourceVideoId: string) => void;
}) {
  const hasActions = Boolean(onOpenSourceDetail);
  const columns = hasActions
    ? ["封面", "标题", "时长", "相对路径", "字幕状态", "预处理状态", "搜索可见", "发布版本", "操作"]
    : ["封面", "标题", "时长", "相对路径", "字幕状态", "预处理状态", "搜索可见", "发布版本"];

  const subtitleStatus = (status: AdminPreprocessStatus) => {
    if (status === "ready" || status === "index-required") {
      return "已生成";
    }

    if (status === "processing") {
      return processingIsStale ? "待恢复" : "生成中";
    }

    if (status === "failed") {
      return "失败";
    }

    return "等待";
  };

  const publishVersion = (video: AdminSourceVideo) => {
    if (video.preprocess_status === "ready") {
      return currentIndexVersion || "当前索引";
    }

    if (video.preprocess_status === "index-required") {
      return "待发布";
    }

    return "-";
  };
  const preprocessDisplayLabel = (status: AdminPreprocessStatus) =>
    status === "processing" && processingIsStale
      ? "待恢复"
      : preprocessStatusLabel(status);

  return (
    <SourceTable
      columns={columns}
      rows={videos.map((video) => {
        const cells: Array<string | ReactElement> = [
          <img className="admin-table-cover" src={video.cover_url} alt="" key={`${video.source_video_id}-cover`} />,
          <button
            className={`admin-source-title-button${video.source_video_id === selectedSourceVideoId ? " is-selected" : ""}`}
            type="button"
            onClick={() => onSelect?.(video.source_video_id)}
            key={`${video.source_video_id}-select`}
          >
            <strong>{video.title || video.file_name}</strong>
            <span>{video.source_video_id} · {video.file_name}</span>
          </button>,
          formatAdminDuration(video.duration_ms),
          video.relative_path,
          subtitleStatus(video.preprocess_status),
          <span className={`admin-status-badge is-${adminStatusTone(video.preprocess_status)}`} key={`${video.source_video_id}-status`}>
            {preprocessDisplayLabel(video.preprocess_status)}
          </span>,
          booleanLabel(video.visible_to_cutters),
          publishVersion(video)
        ];

        if (hasActions) {
          cells.push(
            <button
              className="admin-link-button"
              type="button"
              onClick={() => onOpenSourceDetail?.(video.source_video_id)}
              key={`${video.source_video_id}-detail`}
            >
              查看详情
            </button>
          );
        }

        return cells;
      })}
    />
  );
}

export function SourceMetadataInspector({
  video,
  writeActionState = "m9b-api",
  processingIsStale = false,
  onSave,
  onCoverSave,
  onQueueSourceVideo,
  onRetrySourceVideo,
  onRecoverProcessingSourceVideo,
  onPublishSourceVideo
}: {
  video: AdminSourceVideo;
  writeActionState?: AdminControlState;
  processingIsStale?: boolean;
  onSave?: (metadata: AdminSourceVideoMetadataUpdate) => void;
  onCoverSave?: (coverFile: File) => void;
  onQueueSourceVideo?: () => void;
  onRetrySourceVideo?: () => void;
  onRecoverProcessingSourceVideo?: () => void;
  onPublishSourceVideo?: () => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [tags, setTags] = useState(video.tags.join(", "));
  const [description, setDescription] = useState(video.description);
  const [lecturer, setLecturer] = useState(video.lecturer);
  const [course, setCourse] = useState(video.course);
  const [category, setCategory] = useState(video.category);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");

  useEffect(() => {
    setTitle(video.title);
    setTags(video.tags.join(", "));
    setDescription(video.description);
    setLecturer(video.lecturer);
    setCourse(video.course);
    setCategory(video.category);
    setCoverFile(null);
  }, [video]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [coverFile]);
  const writeActionReason = (reason: string) =>
    writeActionState === "read-only"
      ? `${reason} 当前写入接口不可用。`
      : reason;
  const preprocessDisplayLabel = video.preprocess_status === "processing" && processingIsStale
    ? "待恢复"
    : preprocessStatusLabel(video.preprocess_status);

  const processingAction = (() => {
    if (video.preprocess_status === "unprocessed") {
      return {
        label: "加入预处理",
        reason: "将当前原视频加入预处理队列。",
        onClick: onQueueSourceVideo
      };
    }

    if (video.preprocess_status === "failed") {
      return {
        label: "重新处理",
        reason: "将当前失败原视频重新加入预处理队列。",
        onClick: onRetrySourceVideo
      };
    }

    if (video.preprocess_status === "processing") {
      return {
        label: "恢复到队列",
        reason: "当前任务卡住时，将它恢复到预处理队列。",
        onClick: onRecoverProcessingSourceVideo
      };
    }

    if (video.preprocess_status === "index-required") {
      return {
        label: "发布到剪辑端",
        reason: "将当前视频发布到剪辑端搜索索引。",
        onClick: onPublishSourceVideo
      };
    }

    return null;
  })();

  return (
    <InspectorPanel title="素材详情">
      <img className="admin-inspector-cover" src={coverPreviewUrl || video.cover_url} alt="" />
      <section className="admin-inspector-summary" aria-label="当前素材">
        <strong>{video.title || video.file_name}</strong>
        <span>{video.source_video_id} · {preprocessDisplayLabel}</span>
        <span>剪辑师可见：{booleanLabel(video.visible_to_cutters)}</span>
      </section>
      {processingAction ? (
        <section className="admin-inspector-action-panel" aria-label="当前素材处理">
          <div>
            <span>当前状态</span>
            <strong>{preprocessDisplayLabel}</strong>
          </div>
          <AdminControlButton
            label={processingAction.label}
            state={writeActionState}
            reason={writeActionReason(processingAction.reason)}
            variant="primary"
            onClick={writeActionState === "m9b-api" ? processingAction.onClick : undefined}
          />
        </section>
      ) : null}
      <div className="admin-cover-editor">
        <label>
          <span>封面图片</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setCoverFile(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        {coverFile ? (
          <AdminControlButton
            label="保存封面"
            state={writeActionState}
            reason={writeActionReason("更新当前素材的封面图片。")}
            onClick={writeActionState === "m9b-api" && onCoverSave ? () => onCoverSave(coverFile) : undefined}
          />
        ) : null}
      </div>
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
      {video.error_message ? (
        <p className="admin-note">失败原因：{jobStageLabel(video.error_stage ?? "unknown")} · {chineseDiagnosticText(video.error_message)}</p>
      ) : null}
      <AdminControlButton
        label="保存素材信息"
        state={writeActionState}
        reason={writeActionReason("保存标题、标签、说明和分类。")}
        variant="primary"
        onClick={
          writeActionState === "m9b-api" && onSave
            ? () =>
                onSave({
                  title,
                  tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
                  description,
                  lecturer,
                  course,
                  category
                })
            : undefined
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
                    reason="将失败视频重新加入预处理队列。"
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
      columns={["版本", "创建时间", "已可用数量", "协议版本", "校验", "校验说明", "当前状态"]}
      rows={versions.map((version) => [
        version.index_version,
        version.created_at,
        version.ready_video_count,
        version.schema_version,
        validationStatusLabel(version.validation_status),
        indexValidationMessageLabel(version.validation_message),
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
