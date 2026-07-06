import {
  InspectorPanel,
  Table,
  type TableColumn
} from "@mixlab/ui-foundation";
import type {
  AdminDashboardData,
  AdminPreprocessJob,
  AdminPreprocessJobLog,
  AdminPreprocessProcessHistoryEvent,
  AdminPreprocessProcessHistoryFilters,
  AdminPreprocessProcessHistoryItem,
  AdminPreprocessProcessHistoryResponse,
  AdminSourceFolder,
  AdminSourceVideo
} from "../../api.ts";
import {
  chineseDiagnosticText,
  indexValidationMessageLabel,
  jobStageLabel,
  strictChineseDiagnosticText
} from "../../app/chinese.ts";
import { formatAdminDuration } from "../../app/view-model.ts";
import {
  AdminControlButton,
  AdminInfoGroups,
  AdminPageHeader,
  EmptyState,
  MetricBand
} from "../shared.tsx";

function productionStatus(data: AdminDashboardData): { title: string; detail: string; tone: "healthy" | "attention" | "blocked" } {
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";
  const abnormalCount = data.jobs.jobs.filter((job) => job.status === "failed" && !job.retryable).length;
  const longAsrCount = data.jobs.jobs.filter((job) =>
    job.long_task_recommended &&
    (job.status === "failed" || job.status === "queued")
  ).length;

  if (data.jobs.active_count > 0 && !supervisorRunning) {
    return {
      title: `${data.jobs.active_count} 个处理中任务需要恢复`,
      detail: "预处理服务未运行，但仍有视频停留在处理中。建议先恢复到队列，再启动预处理。",
      tone: "blocked"
    };
  }

  if (data.jobs.queued_count > 0 && data.jobs.active_count === 0 && !supervisorRunning) {
    return {
      title: `${data.jobs.queued_count} 个视频已排队，但预处理服务未运行`,
      detail: "建议启动预处理。启动后系统会继续提取音频、识别文案、生成封面，并在安全时上线。",
      tone: "attention"
    };
  }

  if (data.jobs.active_count > 0 && supervisorRunning) {
    return {
      title: `${data.jobs.active_count} 个视频正在处理`,
      detail: "系统正在按队列生产预处理产物，可在当前任务中查看阶段、耗时和失败信息。",
      tone: "healthy"
    };
  }

  if (data.status.unprocessed_video_count > 0 && data.jobs.queued_count === 0) {
    return {
      title: `${data.status.unprocessed_video_count} 个视频尚未加入队列`,
      detail: "建议启动预处理，系统会先发现素材，再自动入队和持续处理。",
      tone: "attention"
    };
  }

  if (data.jobs.failed_count > 0) {
    if (abnormalCount > 0 && longAsrCount === 0) {
      return {
        title: `${abnormalCount} 个异常素材需检查`,
        detail: "这些素材不是普通失败重试，需要确认源文件是否缺失、损坏或没有可识别内容。",
        tone: "blocked"
      };
    }

    if (longAsrCount > 0) {
      return {
        title: `${longAsrCount} 个超长素材需长任务语音识别`,
        detail: abnormalCount > 0
          ? `另有 ${abnormalCount} 个异常素材需检查源文件。`
          : "这些素材不是坏文件，需要用更长等待时间继续语音识别。",
        tone: "attention"
      };
    }

    return {
      title: `${data.jobs.failed_count} 个视频处理失败`,
      detail: "失败视频可单独重试，不影响后续队列继续处理。",
      tone: "blocked"
    };
  }

  return {
    title: "预处理当前空闲",
    detail: "系统没有发现正在处理或等待处理的视频。",
    tone: "healthy"
  };
}

function percentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

function boundedPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function timeLabel(value: string): string {
  if (!value) {
    return "暂无估算";
  }

  return value.replace("T", " ").slice(0, 16);
}

function preprocessThroughputLabel(data: AdminDashboardData, supervisorRunning: boolean): string {
  const label = data.jobs.observability.throughput_label;

  if (data.jobs.queued_count > 0 && label.includes("没有等待处理")) {
    return `${data.jobs.queued_count} 个视频正在等待处理`;
  }

  if (data.jobs.active_count > 0 && label.includes("没有等待处理")) {
    return supervisorRunning
      ? `${data.jobs.active_count} 个视频正在处理中`
      : `${data.jobs.active_count} 个视频停留在处理中，需恢复到队列`;
  }

  return label;
}

function safePreprocessErrorText(message: string): string {
  const readable = chineseDiagnosticText(message)
    .replace(
      /阿里云百炼语音识别 task [0-9a-f-]+ failed: /gi,
      "阿里云百炼语音识别失败："
    )
    .replaceAll("SUCCESS_WITH_NO_VALID_FRAGMENT", "未识别到有效语音片段")
    .replaceAll("failed:", "失败：");

  return strictChineseDiagnosticText(readable);
}

function safeJobStageLabel(job: AdminPreprocessJob): string {
  const fallback = jobStageLabel(job.stage);
  const label = job.stage_label?.trim();

  if (!label) {
    return fallback;
  }

  if (/failed:|task [0-9a-f-]{8,}|SUCCESS_|[A-Za-z]{4,}/i.test(label)) {
    return fallback;
  }

  return label;
}

function preprocessFailureReason(job: AdminPreprocessJob): string {
  if (job.failure_label?.trim()) {
    return strictChineseDiagnosticText(job.failure_label.trim());
  }

  if (job.error_message?.trim()) {
    return safePreprocessErrorText(job.error_message);
  }

  return safeJobStageLabel(job);
}

function processHistoryEventLabel(event: AdminPreprocessProcessHistoryItem["last_event_type"]): string {
  const labels: Record<AdminPreprocessProcessHistoryItem["last_event_type"], string> = {
    failed: "失败",
    indexed: "已上线",
    completed: "已完成",
    claimed: "已领取",
    status: "状态更新"
  };

  return labels[event];
}

function processHistoryStatusLabel(status: AdminPreprocessProcessHistoryItem["preprocess_status"]): string {
  const labels: Record<AdminPreprocessProcessHistoryItem["preprocess_status"], string> = {
    ready: "可用",
    processing: "处理中",
    queued: "队列中",
    unprocessed: "未处理",
    failed: "失败",
    "index-required": "待上线"
  };

  return labels[status];
}

function processHistoryAvailabilityLabel(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  if (!history) {
    return "等待读取";
  }

  if (!history.history_available) {
    return "暂不可用";
  }

  return history.cache_status === "hit" ? "已同步" : "同步中";
}

function processHistoryTrackedRangeLabel(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  if (!history || !history.summary.tracked_count) {
    return "暂无分析范围";
  }

  if (!history.summary.oldest_event_at || !history.summary.newest_event_at) {
    return "暂无事件时间";
  }

  const oldest = timeLabel(history.summary.oldest_event_at);
  const newest = timeLabel(history.summary.newest_event_at);

  return `${oldest} 至 ${newest}`;
}

function processHistoryStatusDistributionLabel(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  if (!history || !history.summary.tracked_count) {
    return "-";
  }

  const counts = history.summary.status_counts;
  const active = counts.processing + counts.queued;

  return `处理中 ${active} · 待上线 ${counts["index-required"]} · 失败 ${counts.failed}`;
}

function processHistoryEventDistributionLabel(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  if (!history || !history.summary.tracked_count) {
    return "-";
  }

  const counts = history.summary.event_counts;

  return `上线 ${counts.indexed} · 完成 ${counts.completed} · 失败 ${counts.failed} · 领取 ${counts.claimed}`;
}

function processHistorySourceFolderName(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  return history?.summary.source_folder_summaries[0]?.source_folder_name || "-";
}

function processHistorySourceFolderDistributionLabel(
  history: AdminPreprocessProcessHistoryResponse | null | undefined
): string {
  const topFolder = history?.summary.source_folder_summaries[0];
  if (!topFolder) {
    return "-";
  }

  return `${topFolder.tracked_count} 条 · 活跃 ${topFolder.active_count} · 失败 ${topFolder.failed_count}`;
}

function processHistoryLatestTrendDate(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  return history?.summary.daily_trend[0]?.date || "-";
}

function processHistoryLatestTrendLabel(history: AdminPreprocessProcessHistoryResponse | null | undefined): string {
  const latest = history?.summary.daily_trend[0];
  if (!latest) {
    return "-";
  }

  return `${latest.tracked_count} 条 · 完成 ${latest.completed_count} · 失败 ${latest.failed_count}`;
}

function activeProcessHistoryFilters(input: {
  history: AdminPreprocessProcessHistoryResponse | null | undefined;
  filters: AdminPreprocessProcessHistoryFilters | undefined;
}): AdminPreprocessProcessHistoryFilters {
  return input.filters ?? input.history?.filters ?? {
    source_folder_name: "",
    preprocess_status: "",
    event_type: ""
  };
}

function withCurrentProcessHistoryOption<T extends string>(options: T[], current: T | ""): T[] {
  if (!current || options.includes(current)) {
    return options;
  }

  return [...options, current];
}

function normalizeFolderPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/u, "");
}

function dirnameFromRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/u, "");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();

  return parts.join("/");
}

function joinPortablePath(root: string, relativePath: string): string {
  const normalizedRoot = normalizeFolderPath(root);
  const normalizedRelative = relativePath.replace(/\\/g, "/").replace(/^\/+/u, "");

  return normalizedRelative ? `${normalizedRoot}/${normalizedRelative}` : normalizedRoot;
}

function sourceFolderRootForJob(data: AdminDashboardData, job: AdminPreprocessJob): string {
  const sourceFolder = data.settings.source_folders.find((folder: AdminSourceFolder) =>
    folder.id === job.source_folder_id
  );

  if (sourceFolder?.path) {
    return sourceFolder.path;
  }

  return data.status.source_videos_path || joinPortablePath(data.status.root_path, "source-videos");
}

function sourceFolderPathForJob(data: AdminDashboardData, job: AdminPreprocessJob): string {
  const relativePath = job.source_folder_relative_path || job.source_relative_path || "";
  const relativeFolder = dirnameFromRelativePath(relativePath);

  return joinPortablePath(sourceFolderRootForJob(data, job), relativeFolder);
}

function encodePathForUrl(pathValue: string): string {
  return pathValue.split("/").map((part, index) => (
    index === 0 && part === "" ? "" : encodeURIComponent(part)
  )).join("/");
}

function sourceFolderOpenUrl(folderPath: string): string {
  const normalized = normalizeFolderPath(folderPath);

  if (normalized.startsWith("/data/PublicLibrary")) {
    const host = typeof window !== "undefined" &&
      window.location.hostname &&
      window.location.hostname !== "127.0.0.1" &&
      window.location.hostname !== "localhost"
      ? window.location.hostname
      : "192.168.1.27";
    const relative = normalized.slice("/data/PublicLibrary".length).replace(/^\/+/u, "");

    return `smb://${host}/MixLab/PublicLibrary${relative ? `/${encodePathForUrl(relative)}` : ""}`;
  }

  return `file://${encodePathForUrl(normalized)}`;
}

export function PreprocessJobsPage({
  data,
  isLoadingJobs = false,
  jobsError = "",
  isLoadingIndexRequiredVideos = false,
  indexRequiredError = "",
  processHistory = null,
  processHistoryFilters,
  isLoadingProcessHistory = false,
  processHistoryError = "",
  selectedJobLog,
  onRetryFailedVideos,
  onStartLongAsrVideos,
  onRecoverProcessingVideos,
  onStartPreprocessSupervisor,
  onStopPreprocessSupervisor,
  onRepairIndex,
  onPublishSourceVideo,
  onProcessHistoryFiltersChange,
  onOpenPreprocessJobLog,
  activeAdminCommandLabel = ""
}: {
  data: AdminDashboardData;
  isLoadingJobs?: boolean;
  jobsError?: string;
  isLoadingIndexRequiredVideos?: boolean;
  indexRequiredError?: string;
  processHistory?: AdminPreprocessProcessHistoryResponse | null;
  processHistoryFilters?: AdminPreprocessProcessHistoryFilters;
  isLoadingProcessHistory?: boolean;
  processHistoryError?: string;
  selectedJobLog?: {
    loading: boolean;
    error: string;
    log: AdminPreprocessJobLog | null;
  };
  onRetryFailedVideos?: () => void;
  onStartLongAsrVideos?: () => void;
  onRecoverProcessingVideos?: () => void;
  onStartPreprocessSupervisor?: () => void;
  onStopPreprocessSupervisor?: () => void;
  onRepairIndex?: () => void;
  onPublishSourceVideo?: (sourceVideoId: string) => void;
  onProcessHistoryFiltersChange?: (filters: AdminPreprocessProcessHistoryFilters) => void;
  onOpenPreprocessJobLog?: (jobId: string) => void;
  activeAdminCommandLabel?: string;
}) {
  const running = data.jobs.jobs.filter((job) => job.status === "running");
  const queued = data.jobs.jobs.filter((job) => job.status === "queued");
  const done = data.jobs.jobs.filter((job) => job.status === "done");
  const failed = data.jobs.jobs.filter((job) => job.status === "failed");
  const abnormalJobs = failed.filter((job) => !job.retryable);
  const retryableFailed = failed.filter((job) => job.retryable);
  const longAsrJobs = data.jobs.jobs.filter((job) =>
    job.long_task_recommended &&
    (job.status === "failed" || job.status === "queued")
  );
  const supervisor = data.jobs.supervisor;
  const supervisorRunning = supervisor.state === "running" || supervisor.state === "stopping";
  const lastResult = supervisor.last_result;
  const status = productionStatus(data);
  const averageProcessMs = data.metrics.production.average_video_process_ms;
  const currentIndex = data.indexes.versions.find((version) => version.is_current);
  const runtimeLoad = data.metrics.runtime_load;
  const observability = data.jobs.observability;
  const currentJob = running[0];
  const autoPublishIndexEnabled = data.settings.runtime_policy.auto_publish_index_enabled;
  const canStartSupervisor = supervisor.state === "idle" || supervisor.state === "failed";
  const canStopSupervisor = supervisor.state === "running" || supervisor.state === "stopping";
  const nasWriteState = "m9b-api" as const;
  const commandBusyReason = activeAdminCommandLabel
    ? `${activeAdminCommandLabel}正在执行，请稍候。`
    : "";
  const gatedNasWriteAction = <T extends (...args: never[]) => void>(handler?: T): T | undefined =>
    activeAdminCommandLabel ? undefined : handler;
  const nasWriteReason = (reason: string) => commandBusyReason || reason;
  const runningStageCaption = supervisorRunning ? "当前阶段" : "停留阶段";
  const pipelineStages = [
    { label: "扫描素材", value: data.status.video_count, caption: "已发现" },
    { label: "提取音频", value: running.filter((job) => job.stage === "extract-audio").length, caption: runningStageCaption },
    { label: "语音识别", value: running.filter((job) => job.stage === "asr").length, caption: runningStageCaption },
    { label: "生成文案", value: data.metrics.transcript.transcript_video_count, caption: "已有文案" },
    { label: "封面关键帧", value: running.filter((job) => job.stage === "build-keyframes").length, caption: runningStageCaption },
    {
      label: "上线剪辑端",
      value: data.status.index_required_video_count,
      caption: data.status.index_required_video_count > 0
        ? "待上线"
        : autoPublishIndexEnabled ? "自动上线" : "无待上线"
    }
  ];
  const overallProgressPercent = boundedPercent(
    data.status.video_count > 0
      ? (data.status.ready_video_count / data.status.video_count) * 100
      : 0
  );
  const currentRunClaimed = supervisorRunning ? lastResult?.total_claimed_count ?? 0 : 0;
  const currentRunTotal = currentRunClaimed + data.jobs.queued_count + data.jobs.active_count;
  const currentRunProgressPercent = boundedPercent(
    currentRunTotal > 0 ? (currentRunClaimed / currentRunTotal) * 100 : 0
  );
  const currentTaskLabel = currentJob
    ? `${currentJob.source_video_id} · ${safeJobStageLabel(currentJob)}`
    : supervisorRunning
      ? "正在领取下一个视频"
      : "空闲";
  const currentTaskProgress = currentJob ? boundedPercent(currentJob.progress) : 0;
  const currentTaskProgressLabel = currentJob
    ? `${currentTaskProgress}%`
    : supervisorRunning ? "等待中" : "空闲";
  const processingServiceValue = supervisorRunning
    ? "运行中"
    : data.status.processing_video_count > 0
      ? data.status.processing_video_count
      : "空闲";
  const processingServiceCaption = supervisorRunning
    ? currentJob
      ? `${currentJob.source_video_id} 正在处理`
      : "正在领取下一个视频"
    : data.status.processing_video_count > 0
      ? "可能需要恢复"
      : "当前没有任务";
  const indexRequiredCaption = data.status.index_required_video_count > 0
    ? "等待上线剪辑端"
    : autoPublishIndexEnabled ? "已自动上线" : "没有待上线素材";
  const failureMetricLabel = abnormalJobs.length > 0
    ? "异常素材"
    : longAsrJobs.length > 0 ? "长任务素材" : "可继续处理";
  const failureMetricValue = abnormalJobs.length > 0
    ? abnormalJobs.length
    : longAsrJobs.length > 0 ? longAsrJobs.length : retryableFailed.length;
  const failureMetricCaption = abnormalJobs.length > 0
    ? "需检查源文件"
    : longAsrJobs.length > 0 ? "需更长识别时间" : retryableFailed.length > 0 ? "可重新处理" : "当前无异常";
  const flowCards = [
    {
      label: "当前任务",
      value: currentTaskLabel,
      caption: currentJob ? currentTaskProgressLabel : supervisorRunning ? "等待任务状态刷新" : "没有正在处理的视频"
    },
    {
      label: "本次运行",
      value: lastResult
        ? `已处理 ${lastResult.total_claimed_count}`
        : supervisorRunning ? "刚启动" : "暂无",
      caption: lastResult
        ? `成功 ${lastResult.succeeded_count} · 失败 ${lastResult.failed_count}`
        : supervisorRunning ? "正在准备第一条视频" : "启动后开始累计"
    },
    {
      label: "剩余队列",
      value: data.jobs.queued_count,
      caption: supervisorRunning ? "会持续处理到队列为空" : "启动后继续处理"
    },
    {
      label: "剪辑端可用",
      value: data.status.ready_video_count,
      caption: `当前索引 ${data.indexes.current_version || "暂无"}`
    }
  ];
  const indexRequiredVideos = data.source_videos.filter(
    (video) => video.preprocess_status === "index-required"
  );
  const compactJobs = [...running, ...queued, ...failed, ...done].slice(0, 12);
  const throughputLabel = preprocessThroughputLabel(data, supervisorRunning);
  const currentValidationMessage = indexValidationMessageLabel(data.indexes.current_validation_message);
  const currentJobStatusText = currentJob
    ? supervisorRunning
      ? `${currentJob.status_label} · ${safeJobStageLabel(currentJob)}`
      : `待恢复 · ${safeJobStageLabel(currentJob)}`
    : "流水线空闲或等待启动";
  const currentJobHeading = currentJob
    ? `${currentJob.source_video_id} · ${currentJob.title}`
    : supervisorRunning
      ? "暂无正在处理的视频"
      : "暂无待恢复的视频";
  const activeMetricLabel = supervisorRunning ? "正在处理" : "待恢复";
  const activeMetricCaption = supervisorRunning ? "预处理服务已领取" : "服务未运行，停留在处理中";
  const currentStageSummary = running[0]
    ? supervisorRunning
      ? safeJobStageLabel(running[0])
      : "待恢复"
    : "暂无待恢复或正在处理";
  const jobStageText = (job: AdminPreprocessJob): string => {
    const stage = safeJobStageLabel(job);

    if (job.status === "failed" && job.error_message) {
      return `${stage} · ${safePreprocessErrorText(job.error_message)}`;
    }

    if (job.status === "running" && !supervisorRunning) {
      return `待恢复 · ${stage}`;
    }

    return stage;
  };
  const jobProgressText = (job: AdminPreprocessJob): string => {
    if (job.status === "queued") {
      return "等待处理";
    }

    if (job.status === "running" && !supervisorRunning) {
      return "待恢复";
    }

    return `${job.progress}%`;
  };
  const jobActions = (job: AdminPreprocessJob) => {
    const actions = [];

    actions.push(
      <AdminControlButton
        label="详情"
        state="m9b-api"
        reason="查看这条任务的处理记录。"
        onClick={onOpenPreprocessJobLog ? () => onOpenPreprocessJobLog(job.job_id) : undefined}
        key={`${job.job_id}-log`}
      />
    );

    return <span className="admin-row-actions">{actions}</span>;
  };
  const openSourceFolder = (job: AdminPreprocessJob) => {
    const folderPath = sourceFolderPathForJob(data, job);
    const folderUrl = sourceFolderOpenUrl(folderPath);

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(folderUrl);
    }

    if (typeof window !== "undefined") {
      window.open(folderUrl, "_blank", "noopener,noreferrer");
    }
  };
  const renderPreprocessIssueList = ({
    badge,
    title,
    detail,
    jobs,
    tone
  }: {
    badge: string;
    title: string;
    detail: string;
    jobs: AdminPreprocessJob[];
    tone: "attention" | "blocked";
  }) => {
    return (
      <section className={`admin-simple-status admin-preprocess-issue-panel is-${tone}`} aria-label={badge}>
        <span className={`admin-status-badge is-${tone === "blocked" ? "failed" : "warning"}`}>{badge}</span>
        <div>
          <h2>{title}</h2>
          <p>{detail}</p>
          <ul className="admin-preprocess-issue-list" aria-label={`${badge}清单`}>
            {jobs.map((job) => {
              const folderPath = sourceFolderPathForJob(data, job);
              const folderUrl = sourceFolderOpenUrl(folderPath);

              return (
                <li key={job.job_id}>
                  <div className="admin-preprocess-issue-copy">
                    <strong>{job.source_video_id}</strong>
                    <span>{job.title || "未命名素材"}</span>
                    <small className="admin-preprocess-issue-path">
                      {job.source_relative_path || job.source_folder_relative_path || "未记录源文件路径"}
                    </small>
                    <small>{preprocessFailureReason(job)}</small>
                  </div>
                  <button
                    className="admin-secondary-button admin-preprocess-folder-button"
                    type="button"
                    title={folderUrl}
                    onClick={() => openSourceFolder(job)}
                  >
                    打开文件夹
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    );
  };
  const jobColumns: Array<TableColumn<AdminPreprocessJob>> = [
    { id: "job", header: "任务", accessor: "job_id" },
    {
      id: "source",
      header: "原视频",
      render: (job) => `${job.source_video_id} · ${job.title}`
    },
    { id: "stage", header: "阶段", render: jobStageText },
    {
      id: "queue",
      header: "排队",
      render: (job, index) =>
        job.status === "queued" ? `排队第 ${job.queue_position || index + 1} 位` : "-"
    },
    {
      id: "progress",
      header: "进度",
      render: (job) => (
        <span className="admin-progress-cell">
          <meter min={0} max={100} value={job.progress}>{job.progress}%</meter>
          <strong>{jobProgressText(job)}</strong>
        </span>
      )
    },
    {
      id: "duration",
      header: "耗时",
      render: (job) => job.elapsed_ms > 0 ? formatAdminDuration(job.elapsed_ms) : "-"
    },
    {
      id: "start",
      header: "预计开始",
      render: (job) => job.estimated_start_at ? timeLabel(job.estimated_start_at) : "-"
    },
    {
      id: "done",
      header: "预计完成",
      render: (job) => job.estimated_done_at ? timeLabel(job.estimated_done_at) : "暂无估算"
    },
    { id: "actions", header: "操作", render: jobActions }
  ];
  const processHistoryRows = processHistory?.items ?? [];
  const processHistoryColumns: Array<TableColumn<AdminPreprocessProcessHistoryItem>> = [
    {
      id: "source",
      header: "原视频",
      render: (item) => `${item.source_video_id} · ${item.title}`
    },
    {
      id: "event",
      header: "最近事件",
      render: (item) => processHistoryEventLabel(item.last_event_type)
    },
    {
      id: "status",
      header: "状态",
      render: (item) => processHistoryStatusLabel(item.preprocess_status)
    },
    {
      id: "folder",
      header: "素材来源",
      render: (item) => item.source_folder_name || "-"
    },
    {
      id: "time",
      header: "时间",
      render: (item) => timeLabel(item.last_event_at)
    },
    {
      id: "elapsed",
      header: "处理耗时",
      render: (item) => item.elapsed_ms > 0 ? formatAdminDuration(item.elapsed_ms) : "-"
    }
  ];
  const indexRequiredColumns: Array<TableColumn<AdminSourceVideo>> = [
    {
      id: "title",
      header: "已处理素材",
      render: (video) => `${video.source_video_id} · ${video.title || video.file_name}`
    },
    {
      id: "file",
      header: "文件",
      render: (video) => video.file_name
    },
    {
      id: "status",
      header: "状态",
      render: () => "已处理待上线"
    },
    {
      id: "actions",
      header: "操作",
      render: (video) => (
        <AdminControlButton
          label="上线到剪辑端"
          state={nasWriteState}
          reason={nasWriteReason("只上线这一条已处理素材，成功后剪辑端可以搜索和使用。")}
          variant="primary"
          onClick={gatedNasWriteAction(
            onPublishSourceVideo ? () => onPublishSourceVideo(video.source_video_id) : undefined
          )}
        />
      )
    }
  ];
  const processHistorySourceLabel = processHistory ? "处理记录已同步" : "处理记录同步中";
  const historyFilters = activeProcessHistoryFilters({
    history: processHistory,
    filters: processHistoryFilters
  });
  const sourceFolderFilterOptions = withCurrentProcessHistoryOption(
    processHistory?.filter_options.source_folder_names ?? [],
    historyFilters.source_folder_name
  );
  const statusFilterOptions = withCurrentProcessHistoryOption(
    processHistory?.filter_options.preprocess_statuses ?? [],
    historyFilters.preprocess_status
  );
  const eventFilterOptions = withCurrentProcessHistoryOption<AdminPreprocessProcessHistoryEvent>(
    processHistory?.filter_options.event_types ?? [],
    historyFilters.event_type
  );
  const processHistoryFiltersDisabled = !onProcessHistoryFiltersChange || isLoadingProcessHistory;
  const showDetailedPreprocess =
    import.meta.env?.VITE_MIXLAB_ADMIN_SHOW_DETAILED_PREPROCESS === "true";

  if (!showDetailedPreprocess) {
    return (
      <>
        <div className="admin-main-column">
          <section className="admin-console-hero admin-simple-preprocess-hero">
            <AdminPageHeader
              title="素材处理"
              eyebrow="自动处理与上线"
              description="启动后系统会自动发现素材、生成文案和封面，并把已处理素材上线到剪辑端。"
              action={
                <section className="admin-action-row" aria-label="素材处理主操作">
                  {canStartSupervisor || canStopSupervisor ? (
                    <AdminControlButton
                      label={canStopSupervisor ? "暂停预处理" : "启动预处理"}
                      state={nasWriteState}
                      reason={nasWriteReason(canStopSupervisor ? "暂停当前预处理流水线。" : "持续处理队列，直到全部完成或手动暂停。")}
                      variant="primary"
                      onClick={gatedNasWriteAction(canStopSupervisor ? onStopPreprocessSupervisor : onStartPreprocessSupervisor)}
                    />
                  ) : null}
                  {longAsrJobs.length > 0 ? (
                    <AdminControlButton
                      label="长任务语音识别"
                      state={nasWriteState}
                      reason={nasWriteReason("只处理超长或语音识别等待超时素材，使用更长等待时间继续识别。")}
                      onClick={gatedNasWriteAction(onStartLongAsrVideos)}
                    />
                  ) : null}
                  {retryableFailed.length > 0 ? (
                    <AdminControlButton
                      label="重试可继续处理的视频"
                      state={nasWriteState}
                      reason={nasWriteReason("只重试临时失败或可继续处理的视频，不处理异常素材。")}
                      onClick={gatedNasWriteAction(onRetryFailedVideos)}
                    />
                  ) : null}
                  {data.jobs.active_count > 0 && supervisor.state !== "running" && supervisor.state !== "stopping" ? (
                    <AdminControlButton
                      label="恢复卡住任务"
                      state={nasWriteState}
                      reason={nasWriteReason("预处理服务未运行时，将停留在处理中的任务恢复到队列。")}
                      onClick={gatedNasWriteAction(onRecoverProcessingVideos)}
                    />
                  ) : null}
                </section>
              }
            />
          </section>
          <section className={`admin-simple-status is-${status.tone}`} aria-label="素材处理状态">
            <span className={`admin-status-badge is-${status.tone === "blocked" ? "failed" : status.tone === "attention" ? "warning" : "ready"}`}>
              {status.tone === "blocked" ? "需要处理" : status.tone === "attention" ? "等待操作" : "正常"}
            </span>
            <div>
              <h2>{status.title}</h2>
              <p>{status.detail}</p>
            </div>
          </section>
          <MetricBand
            items={[
              { label: "剪辑端可用", value: data.status.ready_video_count, caption: "已上线素材" },
              { label: "队列中", value: data.jobs.queued_count, caption: "等待自动处理" },
              {
                label: "处理服务",
                value: processingServiceValue,
                caption: processingServiceCaption
              },
              { label: "待上线", value: data.status.index_required_video_count, caption: indexRequiredCaption },
              { label: "异常素材", value: abnormalJobs.length, caption: "不自动重试" },
              { label: "长任务", value: longAsrJobs.length, caption: "专用识别" },
              { label: "可重试失败", value: retryableFailed.length, caption: "可重新处理" }
            ]}
          />
          {abnormalJobs.length > 0 ? renderPreprocessIssueList({
            badge: "异常素材",
            title: `${abnormalJobs.length} 个素材需检查源文件`,
            detail: "这些素材不会自动重试，也不会被“重试可继续处理的视频”处理。请按编号和原因检查源文件缺失、损坏、无视频流或无有效语音。",
            jobs: abnormalJobs,
            tone: "blocked"
          }) : null}
          {longAsrJobs.length > 0 ? renderPreprocessIssueList({
            badge: "长任务语音识别",
            title: `${longAsrJobs.length} 个超长素材可继续处理`,
            detail: "这些素材不是坏文件，需要点击“长任务语音识别”，用更长等待时间继续处理。",
            jobs: longAsrJobs,
            tone: "attention"
          }) : null}
          {retryableFailed.length > 0 ? renderPreprocessIssueList({
            badge: "可重试失败",
            title: `${retryableFailed.length} 个素材可重新处理`,
            detail: "这些是临时失败或可恢复失败，点击“重试可继续处理的视频”后会重新加入队列。",
            jobs: retryableFailed,
            tone: "attention"
          }) : null}
          {jobsError ? (
            <EmptyState title="预处理队列加载失败" detail={jobsError} />
          ) : null}
          {processHistoryError ? (
            <EmptyState title="处理记录加载失败" detail={processHistoryError} />
          ) : null}
          <section className="admin-preprocess-progress-panel" aria-label="预处理进度">
            <div className="admin-preprocess-progress-row">
              <div>
                <strong>总体进度</strong>
                <p>{data.status.ready_video_count} / {data.status.video_count} 个素材已上线剪辑端</p>
              </div>
              <meter min={0} max={100} value={overallProgressPercent}>{overallProgressPercent}%</meter>
              <span>{overallProgressPercent}%</span>
            </div>
            <div className="admin-preprocess-progress-row">
              <div>
                <strong>本次运行</strong>
                <p>
                  {supervisorRunning
                    ? `已处理 ${currentRunClaimed} 个，剩余 ${data.jobs.queued_count} 个`
                    : "启动后会持续处理，直到队列为空或手动暂停"}
                </p>
              </div>
              <meter min={0} max={100} value={currentRunProgressPercent}>{currentRunProgressPercent}%</meter>
              <span>{supervisorRunning ? `${currentRunProgressPercent}%` : "待启动"}</span>
            </div>
            <div className="admin-preprocess-progress-row">
              <div>
                <strong>当前视频</strong>
                <p>{currentTaskLabel}</p>
              </div>
              <meter min={0} max={100} value={currentTaskProgress}>{currentTaskProgress}%</meter>
              <span>{currentTaskProgressLabel}</span>
            </div>
          </section>
          <section className="admin-simple-flow" aria-label="预处理状态概览">
            {flowCards.map((stage, index) => (
              <article className="admin-simple-flow-step" key={stage.label}>
                <span>{index + 1}</span>
                <strong>{stage.label}</strong>
                <p>{stage.value}</p>
                <small>{stage.caption}</small>
              </article>
            ))}
          </section>
          <section className="admin-list-section admin-index-publish-panel" aria-label="已处理待上线">
            <header className="admin-section-header">
              <h2>已处理待上线</h2>
              <p>这些素材已经处理完成，上线后剪辑师就可以在剪辑端搜索和使用。</p>
            </header>
            <div className="admin-index-summary-grid">
              <article>
                <span>当前索引</span>
                <strong>{data.indexes.current_version || "暂无索引"}</strong>
                <p>{currentIndex?.ready_video_count ?? data.status.ready_video_count} 个可搜索视频</p>
              </article>
              <article>
                <span>待上线素材</span>
                <strong>{data.status.index_required_video_count}</strong>
                <p>{data.status.index_required_video_count > 0 ? "可以上线到剪辑端" : "没有待上线素材"}</p>
              </article>
              <article>
                <span>系统检查</span>
                <strong>{data.doctor.summary.fail > 0 ? "需处理" : data.doctor.summary.warn > 0 ? "需观察" : "通过"}</strong>
                <p>失败 {data.doctor.summary.fail} · 警告 {data.doctor.summary.warn}</p>
              </article>
            </div>
            {indexRequiredError ? (
              <EmptyState title="待上线素材加载失败" detail={indexRequiredError} />
            ) : indexRequiredVideos.length ? (
              <Table
                columns={indexRequiredColumns}
                rows={indexRequiredVideos}
                getRowKey={(video) => video.source_video_id}
                stickyHeader
              />
            ) : isLoadingIndexRequiredVideos && data.status.index_required_video_count > 0 ? (
              <p className="admin-note">正在读取待上线素材明细，请稍候。</p>
            ) : data.status.index_required_video_count > 0 ? (
              <p className="admin-note">待上线素材明细暂未加载，请刷新本页。</p>
            ) : (
              <p className="admin-note">已处理素材都已经上线到剪辑端。</p>
            )}
            {onRepairIndex && data.status.index_required_video_count > 0 ? (
              <section className="admin-action-row">
                <AdminControlButton
                  label="上线全部已处理素材"
                  state={nasWriteState}
                  reason={nasWriteReason("批量上线所有已处理待上线素材，适合确认系统状态正常后使用。")}
                  onClick={gatedNasWriteAction(onRepairIndex)}
                />
              </section>
            ) : null}
          </section>
        </div>
        <InspectorPanel title="处理控制">
          <AdminInfoGroups
            groups={[
              {
                title: "当前状态",
                rows: [
                  { label: "服务", value: supervisor.state_label },
                  { label: "当前阶段", value: currentStageSummary },
                  { label: "当前视频", value: currentTaskLabel },
                  { label: supervisorRunning ? "本次处理" : "上次处理", value: lastResult ? `领取 ${lastResult.total_claimed_count}，成功 ${lastResult.succeeded_count}，失败 ${lastResult.failed_count}` : "暂无记录" }
                ]
              },
              {
                title: "安全保护",
                rows: [
                  { label: "已上线素材", value: "不会重跑或下线" },
                  { label: "自动上线", value: "只发布已处理完成素材" },
                  { label: "剪辑端", value: "读取协议保持不变" }
                ]
              }
            ]}
          />
        </InspectorPanel>
      </>
    );
  }

  return (
    <>
      <div className="admin-main-column">
        <section className="admin-console-hero">
          <AdminPageHeader
            title="素材处理"
            eyebrow="自动处理与上线"
          />
          <div className="admin-console-statusbar" aria-label="预处理状态">
            <span>
              <strong>服务状态</strong>
              {supervisor.state_label}
            </span>
            <span>
              <strong>当前任务</strong>
              {currentJob ? supervisorRunning ? currentJob.source_video_id : `待恢复 ${currentJob.source_video_id}` : "空闲"}
            </span>
            <span>
              <strong>当前索引</strong>
              {data.indexes.current_version || "暂无索引"}
            </span>
            <span>
              <strong>预计完成</strong>
              {timeLabel(observability.estimated_all_done_at)}
            </span>
          </div>
        </section>
        <section className={`admin-production-status-card is-${status.tone}`} aria-label="生产状态">
          <p>生产状态</p>
          <h2>{status.title}</h2>
          <span>{status.detail}</span>
        </section>
        <MetricBand
          items={[
            { label: "未处理原视频", value: data.status.unprocessed_video_count, caption: "等待加入队列" },
            { label: "将加入", value: data.status.unprocessed_video_count, caption: "流水线启动后自动入队" },
            { label: "预计总时长", value: formatAdminDuration(data.metrics.material.unprocessed_duration_ms), caption: "按原视频时长估算" },
            { label: activeMetricLabel, value: data.jobs.active_count, caption: activeMetricCaption },
            { label: "队列中", value: data.jobs.queued_count, caption: "等待预处理" },
            { label: "最近完成", value: data.jobs.completed_count, caption: "已产生可发布产物" },
            { label: failureMetricLabel, value: failureMetricValue, caption: failureMetricCaption }
          ]}
        />
        <section className="admin-pipeline-strip" aria-label="流水线阶段">
          {pipelineStages.map((stage, index) => (
            <article className="admin-pipeline-stage" key={stage.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
              <p>{stage.value} · {stage.caption}</p>
            </article>
          ))}
        </section>
        <section className="admin-observability-grid" aria-label="流水线总览">
          <article className="admin-observability-card">
            <p>流水线总览</p>
            <h2>{percentLabel(observability.pipeline_progress_percent)}</h2>
            <span>整体完成比例</span>
          </article>
          <article className="admin-observability-card">
            <p>预计完成</p>
            <h2>{timeLabel(observability.estimated_all_done_at)}</h2>
            <span>{throughputLabel}</span>
          </article>
          <article className="admin-observability-card">
            <p>今日完成</p>
            <h2>{data.metrics.production.completed_today_count}</h2>
            <span>今日失败 {data.metrics.production.failed_today_count} 个</span>
          </article>
          <article className={`admin-observability-card is-${runtimeLoad.overall_status}`}>
            <p>负荷建议</p>
            <h2>{runtimeLoad.overall_status === "healthy" ? "可继续" : runtimeLoad.overall_status === "attention" ? "需观察" : "需处理"}</h2>
            <span>{observability.load_advice}</span>
          </article>
        </section>
        <section className="admin-current-job-card" aria-label="当前处理视频">
          <div>
            <p>{supervisorRunning ? "当前处理视频" : "待恢复视频"}</p>
            <h2>{currentJobHeading}</h2>
            <span>{currentJobStatusText}</span>
          </div>
          <div className="admin-current-job-meter">
            <strong>阶段进度</strong>
            <meter min={0} max={100} value={currentJob?.progress ?? 0}>{currentJob?.progress ?? 0}%</meter>
            <dl>
              <div>
                <dt>已用时</dt>
                <dd>{currentJob ? formatAdminDuration(currentJob.elapsed_ms) : "-"}</dd>
              </div>
              <div>
                <dt>预计剩余</dt>
                <dd>{currentJob ? formatAdminDuration(currentJob.estimated_remaining_ms) : "-"}</dd>
              </div>
              <div>
                <dt>预计完成</dt>
                <dd>{currentJob ? timeLabel(currentJob.estimated_done_at) : "暂无估算"}</dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="admin-list-section admin-job-table-panel" aria-label="预处理队列清单">
          <header className="admin-section-header">
            <h2>任务队列</h2>
            <p>按待恢复或处理中、排队、失败、完成的顺序展示最近任务，方便快速判断是否卡在某个阶段。</p>
          </header>
          {isLoadingJobs ? (
            <EmptyState title="任务明细后台同步中" detail="队列统计已显示，明细回来后会自动补上。" />
          ) : jobsError ? (
            <EmptyState title="任务队列加载失败" detail={jobsError} />
          ) : compactJobs.length ? (
            <Table
              columns={jobColumns}
              rows={compactJobs}
              getRowKey={(job) => job.job_id}
              stickyHeader
            />
          ) : (
            <EmptyState title="暂无预处理任务" detail="当前没有正在处理、排队或失败的视频。" />
          )}
        </section>
        <section className="admin-list-section admin-process-history-panel" aria-label="预处理历史">
          <header className="admin-section-header">
            <h2>处理历史</h2>
            <p>按最近事件展示完成、失败、上线和处理中记录。</p>
          </header>
          <div className="admin-source-filter-bar admin-source-filter-card" aria-label="筛选处理历史">
            <select
              className="admin-select admin-filter-select"
              value={historyFilters.source_folder_name}
              disabled={processHistoryFiltersDisabled}
              aria-label="素材来源筛选"
              onChange={(event) => onProcessHistoryFiltersChange?.({
                ...historyFilters,
                source_folder_name: event.currentTarget.value
              })}
            >
              <option value="">全部素材来源</option>
              {sourceFolderFilterOptions.map((sourceFolderName) => (
                <option value={sourceFolderName} key={sourceFolderName}>{sourceFolderName}</option>
              ))}
            </select>
            <select
              className="admin-select admin-filter-select"
              value={historyFilters.preprocess_status}
              disabled={processHistoryFiltersDisabled}
              aria-label="处理状态筛选"
              onChange={(event) => onProcessHistoryFiltersChange?.({
                ...historyFilters,
                preprocess_status: event.currentTarget.value as AdminPreprocessProcessHistoryFilters["preprocess_status"]
              })}
            >
              <option value="">全部状态</option>
              {statusFilterOptions.map((status) => (
                <option value={status} key={status}>{processHistoryStatusLabel(status)}</option>
              ))}
            </select>
            <select
              className="admin-select admin-filter-select"
              value={historyFilters.event_type}
              disabled={processHistoryFiltersDisabled}
              aria-label="最近事件筛选"
              onChange={(event) => onProcessHistoryFiltersChange?.({
                ...historyFilters,
                event_type: event.currentTarget.value as AdminPreprocessProcessHistoryFilters["event_type"]
              })}
            >
              <option value="">全部事件</option>
              {eventFilterOptions.map((eventType) => (
                <option value={eventType} key={eventType}>{processHistoryEventLabel(eventType)}</option>
              ))}
            </select>
          </div>
          <div className="admin-index-summary-grid">
            <article>
              <span>数据状态</span>
              <strong>{processHistoryAvailabilityLabel(processHistory)}</strong>
              <p>{processHistorySourceLabel}</p>
            </article>
            <article>
              <span>返回记录</span>
              <strong>{processHistory?.summary.returned_count ?? 0}</strong>
              <p>窗口 {processHistory?.window_days ?? 30} 天 · 上限 {processHistory?.limit ?? 20}</p>
            </article>
            <article>
              <span>已完成/失败</span>
              <strong>{processHistory?.summary.completed_count ?? 0} / {processHistory?.summary.failed_count ?? 0}</strong>
              <p>平均耗时 {processHistory?.summary.average_process_ms ? formatAdminDuration(processHistory.summary.average_process_ms) : "-"}</p>
            </article>
            <article>
              <span>分析范围</span>
              <strong>{processHistory?.summary.tracked_count ?? 0}</strong>
              <p>{processHistoryTrackedRangeLabel(processHistory)}</p>
            </article>
            <article>
              <span>状态分布</span>
              <strong>{processHistory?.summary.tracked_active_count ?? 0} 个活跃</strong>
              <p>{processHistoryStatusDistributionLabel(processHistory)}</p>
            </article>
            <article>
              <span>事件分布</span>
              <strong>{processHistory?.summary.tracked_completed_count ?? 0} 个完成</strong>
              <p>{processHistoryEventDistributionLabel(processHistory)}</p>
            </article>
            <article>
              <span>来源分布</span>
              <strong>{processHistorySourceFolderName(processHistory)}</strong>
              <p>{processHistorySourceFolderDistributionLabel(processHistory)}</p>
            </article>
            <article>
              <span>最近趋势</span>
              <strong>{processHistoryLatestTrendDate(processHistory)}</strong>
              <p>{processHistoryLatestTrendLabel(processHistory)}</p>
            </article>
          </div>
          {processHistoryError ? (
            <EmptyState title="处理历史加载失败" detail={processHistoryError} />
          ) : isLoadingProcessHistory && !processHistory ? (
            <EmptyState title="处理历史后台同步中" detail="队列仍可操作，历史记录回来后会自动补上。" />
          ) : processHistory && !processHistory.history_available ? (
            <EmptyState
              title="处理历史暂不可用"
              detail="系统会继续显示当前队列和生产状态。"
            />
          ) : processHistoryRows.length ? (
            <Table
              columns={processHistoryColumns}
              rows={processHistoryRows}
              getRowKey={(item) => `${item.source_video_id}-${item.last_event_type}-${item.last_event_at}`}
              stickyHeader
            />
          ) : (
            <EmptyState title="暂无处理历史" detail="当前没有返回最近处理事件。" />
          )}
        </section>
        <section className="admin-list-section admin-index-publish-panel" aria-label="已处理待上线">
          <header className="admin-section-header">
            <h2>已处理待上线</h2>
            <p>这些素材已经处理完成，上线后剪辑师就可以在剪辑端搜索和使用。</p>
          </header>
          <div className="admin-index-summary-grid">
            <article>
              <span>当前索引</span>
              <strong>{data.indexes.current_version || "暂无索引"}</strong>
              <p>
                {currentIndex?.ready_video_count ?? data.status.ready_video_count} 个可搜索视频 · {currentValidationMessage}
              </p>
            </article>
            <article>
              <span>待上线素材</span>
              <strong>{data.status.index_required_video_count}</strong>
              <p>{data.settings.runtime_policy.auto_publish_index_enabled ? "系统会自动上线新处理素材" : "需要手动上线"}</p>
            </article>
            <article>
              <span>系统检查</span>
              <strong>{data.doctor.summary.fail > 0 ? "需处理" : data.doctor.summary.warn > 0 ? "需观察" : "通过"}</strong>
              <p>警告 {data.doctor.summary.warn} · 失败 {data.doctor.summary.fail}</p>
            </article>
          </div>
          {indexRequiredVideos.length ? (
            <Table
              columns={indexRequiredColumns}
              rows={indexRequiredVideos}
              getRowKey={(video) => video.source_video_id}
              stickyHeader
            />
          ) : data.status.index_required_video_count > 0 ? (
            <p className="admin-note">还有已处理待上线素材，明细正在后台同步；可稍后刷新本页。</p>
          ) : (
            <p className="admin-note">没有已处理待上线素材。</p>
          )}
          {onRepairIndex && data.status.index_required_video_count > 0 ? (
            <section className="admin-action-row">
              <AdminControlButton
                label="上线全部已处理素材"
                state={nasWriteState}
                reason={nasWriteReason("批量上线所有已处理待上线素材，适合确认系统状态正常后使用。")}
                onClick={gatedNasWriteAction(onRepairIndex)}
              />
            </section>
          ) : null}
          {data.status.index_required_video_count === 0 ? (
            <p className="admin-note">已处理素材都已经上线到剪辑端。</p>
          ) : null}
        </section>
        <AdminInfoGroups
          groups={[{
            title: "素材来源",
            rows: data.settings.source_folders.map((folder) => ({
              label: folder.name,
              value: `${folder.enabled ? "启用" : "停用"} · ${folder.discovered_video_count ?? 0} 个原视频 · ${folder.path}`
            }))
          }, {
            title: "索引状态",
            rows: [
              { label: "当前索引", value: data.indexes.current_version || "暂无索引" },
              { label: "当前索引状态", value: currentValidationMessage },
              { label: "已发布可用视频", value: currentIndex?.ready_video_count ?? data.status.ready_video_count },
              { label: "已处理待上线", value: data.status.index_required_video_count },
              {
                label: "自动上线",
                value: data.status.index_required_video_count > 0
                  ? "流水线会在产物完成后自动上线"
                  : "当前没有待上线素材"
              }
            ]
          }]}
        />
      </div>
      <InspectorPanel title="处理控制">
        <AdminInfoGroups
          groups={[
            {
              title: "状态摘要",
              rows: [
                { label: "服务状态", value: supervisor.state_label },
                { label: "当前阶段", value: currentStageSummary },
                { label: "队列中", value: data.jobs.queued_count },
                { label: failureMetricLabel, value: failureMetricValue },
                { label: "预计完成", value: timeLabel(observability.estimated_all_done_at) }
              ]
            },
            {
              title: "处理结果",
              rows: [
                { label: "最近完成", value: data.jobs.completed_count },
                { label: "已处理待上线", value: data.status.index_required_video_count },
                {
                  label: "上次处理",
                  value: lastResult
                    ? `领取 ${lastResult.total_claimed_count}，成功 ${lastResult.succeeded_count}，失败 ${lastResult.failed_count}`
                  : "暂无记录"
                }
              ]
            }
          ]}
        />
        {selectedJobLog ? (
        <section className="admin-job-log-panel" aria-label="任务处理详情">
          <h2>任务处理详情</h2>
          {selectedJobLog.loading ? (
            <p>正在读取日志</p>
          ) : selectedJobLog.error ? (
            <p>{selectedJobLog.error}</p>
          ) : selectedJobLog.log ? (
            <>
              <p>{selectedJobLog.log.job_id} · {selectedJobLog.log.source_video_id}</p>
              <pre>{selectedJobLog.log.content || "暂无处理记录"}</pre>
            </>
          ) : (
            <p>暂无处理记录。</p>
          )}
        </section>
        ) : null}
        <section className="admin-action-stack">
          {canStartSupervisor || canStopSupervisor ? (
            <AdminControlButton
              label={canStopSupervisor ? "暂停预处理" : "启动预处理"}
              state={nasWriteState}
              reason={nasWriteReason(canStopSupervisor ? "暂停当前预处理流水线。" : "持续处理队列，直到全部完成或手动暂停。")}
              variant="primary"
              onClick={gatedNasWriteAction(canStopSupervisor ? onStopPreprocessSupervisor : onStartPreprocessSupervisor)}
            />
          ) : null}
          {longAsrJobs.length > 0 ? (
            <AdminControlButton
              label="长任务语音识别"
              state={nasWriteState}
              reason={nasWriteReason("只处理超长或语音识别等待超时素材，使用更长等待时间继续识别。")}
              onClick={gatedNasWriteAction(onStartLongAsrVideos)}
            />
          ) : null}
          {retryableFailed.length > 0 ? (
            <AdminControlButton
              label="重试可继续处理的视频"
              state={nasWriteState}
              reason={nasWriteReason("只重试临时失败或可继续处理的视频，不处理异常素材。")}
              onClick={gatedNasWriteAction(onRetryFailedVideos)}
            />
          ) : null}
          {data.jobs.active_count > 0 && supervisor.state !== "running" && supervisor.state !== "stopping" ? (
            <AdminControlButton
              label="恢复卡住任务"
              state={nasWriteState}
              reason={nasWriteReason("预处理服务未运行时，将停留在处理中的任务恢复到队列。")}
              onClick={gatedNasWriteAction(onRecoverProcessingVideos)}
            />
          ) : null}
        </section>
      </InspectorPanel>
    </>
  );
}
