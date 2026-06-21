import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  InspectorPanel,
  Table,
  type BadgeTone,
  type TableColumn
} from "@mixlab/ui-foundation";
import { formatDuration } from "../../api.ts";
import {
  cutQueueCurrentPhaseLabel,
  cutQueueJobElapsedMs,
  formatCutQueueElapsed,
  type CutQueueJob
} from "../../state/cut-queue.ts";
import {
  cutPipelineDetailLabel,
  cutPipelineStatusLabel,
  idleCutPipelineState,
  type CutPipelineState
} from "../../state/cut-pipeline.ts";
import { cutQueueSummary } from "../../state/cut-task-refresh.ts";
import { projectDisplayTitle, type CutterProject } from "../../state/cutter-projects.ts";

type CutTaskFilter = "all" | CutQueueJob["status"];

const statusFilters: Array<{ key: CutTaskFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pending", label: "等待中" },
  { key: "running", label: "剪切中" },
  { key: "failed", label: "失败" },
  { key: "done", label: "已完成" }
];

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3.75 7.75A2.75 2.75 0 0 1 6.5 5h3.75l2 2.25h5.25A2.75 2.75 0 0 1 20.25 10v6.5A2.75 2.75 0 0 1 17.5 19.25h-11a2.75 2.75 0 0 1-2.75-2.75Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="m4.25 10.4 3.35 3.35 8.15-8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function statusTone(status: CutQueueJob["status"]): BadgeTone {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
      return "running";
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

function labelForStatus(status: CutQueueJob["status"]): string {
  switch (status) {
    case "pending":
      return "等待中";
    case "running":
      return "剪切中";
    case "done":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
  }
}

function cutModeLabel(mode: CutQueueJob["cut_mode"]): string {
  switch (mode) {
    case "copy":
      return "极速剪切";
    case "precise":
      return "精准剪切";
    case "smart":
      return "智能剪切";
  }
}

function preferredTaskJob(jobs: readonly CutQueueJob[]): CutQueueJob | undefined {
  return (
    jobs.find((job) => job.status === "failed") ??
    jobs.find((job) => job.status === "running") ??
    jobs.find((job) => job.status === "pending") ??
    jobs.find((job) => job.status === "done") ??
    jobs[0]
  );
}

function problemForJob(job: CutQueueJob, nowMs: number): string {
  if (job.status === "failed") {
    return job.error_message ?? "剪切失败";
  }

  if (job.status === "done") {
    return "剪切成功";
  }

  if (job.status === "running") {
    return `${cutQueueCurrentPhaseLabel(job)} · 已耗时 ${formatCutQueueElapsed(cutQueueJobElapsedMs(job, nowMs))}`;
  }

  if (job.status === "cancelled") {
    return "已取消";
  }

  return "等待中";
}

function actionTextForJob(status: CutQueueJob["status"]): string {
  switch (status) {
    case "pending":
      return "等待剪切";
    case "running":
      return "剪切中";
    case "failed":
      return "重新剪切";
    case "cancelled":
      return "已取消";
    case "done":
      return "剪切成功";
  }
}

function shortSelectedText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= 80) {
    return normalized;
  }

  return `${normalized.slice(0, 80)}...`;
}

function taskCountForFilter(summary: ReturnType<typeof cutQueueSummary>, filter: CutTaskFilter): number {
  return filter === "all" ? summary.total : summary[filter];
}

export function CutQueuePage({
  jobs,
  project,
  autoRefreshEnabled = false,
  lastUpdatedLabel = "",
  pipelineState = idleCutPipelineState,
  totalJobCount,
  isLoadingMore = false,
  onRefresh,
  onRunNext,
  onRetryFailed,
  onOpenCutOutputDirectory,
  onLoadMore
}: {
  jobs: readonly CutQueueJob[];
  project?: CutterProject;
  autoRefreshEnabled?: boolean;
  lastUpdatedLabel?: string;
  pipelineState?: CutPipelineState;
  totalJobCount?: number;
  isLoadingMore?: boolean;
  onRefresh?: () => void;
  onRunNext?: () => void;
  onRetryFailed?: (cutJobId: string) => void;
  onOpenCutOutputDirectory?: () => void;
  onLoadMore?: () => void;
}) {
  const summary = cutQueueSummary(jobs);
  const pipelineStatus = cutPipelineStatusLabel(pipelineState);
  const pipelineDetail = cutPipelineDetailLabel(pipelineState);
  const projectTitle = project ? projectDisplayTitle(project) : "";
  const totalCount = Math.max(totalJobCount ?? jobs.length, jobs.length);
  const canLoadMore = totalCount > jobs.length && Boolean(onLoadMore);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [statusFilter, setStatusFilter] = useState<CutTaskFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(() => preferredTaskJob(jobs)?.queue_job_id);
  const selectedJob = jobs.find((job) => job.queue_job_id === selectedJobId) ?? preferredTaskJob(jobs);
  const visibleJobs = statusFilter === "all" ? jobs : jobs.filter((job) => job.status === statusFilter);
  const taskColumns: Array<TableColumn<CutQueueJob>> = [
    {
      id: "status",
      header: "状态",
      width: "86px",
      align: "center",
      render: (job) => <Badge tone={statusTone(job.status)}>{labelForStatus(job.status)}</Badge>
    },
    {
      id: "source",
      header: "来源",
      width: "17%",
      render: (job) => (
        <button
          className="cutter-queue-source-button ml-table-text-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedJobId(job.queue_job_id);
          }}
        >
          {job.source_title || job.source_video_id || "未知来源"}
        </button>
      )
    },
    {
      id: "time",
      header: "时间段",
      width: "15%",
      align: "center",
      render: (job) => (
        <span className="cutter-queue-time-range ml-truncate-line ml-table-muted-text">
          {formatDuration(job.begin_ms)} - {formatDuration(job.end_ms)}
        </span>
      )
    },
    {
      id: "text",
      header: "选中文案",
      render: (job) => (
        <span className="cutter-queue-selected-text ml-truncate-line ml-table-primary-text">
          {shortSelectedText(job.selected_text)}
        </span>
      )
    },
    {
      id: "problem",
      header: "问题",
      width: "17%",
      align: "center",
      render: (job) => (
        <span className={`cutter-queue-problem ml-status-text ml-status-text--${job.status} ml-truncate-line`}>
          {problemForJob(job, nowMs)}
        </span>
      )
    },
    {
      id: "action",
      header: "操作",
      width: "92px",
      align: "center",
      render: (job) => (
        <span className="cutter-queue-actions ml-table-action-cell">
          {job.status === "failed" && onRetryFailed ? (
            <Button
              size="sm"
              variant="danger"
              onClick={(event) => {
                event.stopPropagation();
                onRetryFailed(job.queue_job_id);
              }}
            >
              重新剪切
            </Button>
          ) : job.status === "done" ? (
            <span className="ml-status-icon ml-status-icon--ready" role="img" aria-label="剪切成功" title="剪切成功">
              <CheckIcon />
            </span>
          ) : (
            <span className={`ml-status-text ml-status-text--${job.status}`}>{actionTextForJob(job.status)}</span>
          )}
        </span>
      )
    }
  ];

  useEffect(() => {
    if (!jobs.some((job) => job.status === "pending" || job.status === "running")) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  useEffect(() => {
    if (selectedJobId && jobs.some((job) => job.queue_job_id === selectedJobId)) {
      return;
    }

    setSelectedJobId(preferredTaskJob(jobs)?.queue_job_id);
  }, [jobs, selectedJobId]);

  return (
    <section className="cutter-page cutter-cut-queue ml-workbench-page ml-workbench-page--fluid" data-page="cut-tasks">
      <div className="cutter-page-main ml-workbench-main ml-workbench-main--task-flow">
        <header className="cutter-page-header ml-workbench-header">
          <div>
            <h1 className="ml-page-title">剪切任务</h1>
            <p className="ml-page-description">
              {summary.total} 个任务
              {summary.running > 0 ? ` · ${summary.running} 个剪切中` : ""}
              {summary.failed > 0 ? ` · ${summary.failed} 个需要处理` : ""}
              {projectTitle ? ` · ${projectTitle}` : ""}
            </p>
          </div>
        </header>

        <Card className="cutter-queue-filter-card is-workbench" bodyClassName="cutter-queue-filter-card-body ml-toolbar-card-body">
          <div className="cutter-queue-filter-list ml-toolbar-list">
            {statusFilters.map((filter) => (
              <Button
                key={filter.key}
                className={`cutter-queue-filter-button${statusFilter === filter.key ? " is-active" : ""}`}
                aria-pressed={statusFilter === filter.key}
                onClick={() => setStatusFilter(filter.key)}
                size="sm"
                variant={statusFilter === filter.key ? "secondary" : "ghost"}
              >
                <span>{filter.label}</span>
                <strong className="ml-button-count">{taskCountForFilter(summary, filter.key)}</strong>
              </Button>
            ))}
          </div>
          {onOpenCutOutputDirectory ? (
            <Button
              className="cutter-queue-directory-action ml-toolbar-action"
              leadingIcon={<FolderIcon />}
              onClick={onOpenCutOutputDirectory}
              variant="secondary"
            >
              打开文件目录
            </Button>
          ) : null}
        </Card>

        <Card
          className={`cutter-queue-pipeline-card is-${pipelineState.status} is-workbench`}
          bodyClassName="cutter-queue-pipeline-card-body ml-summary-card-body"
        >
          <div className="ml-inline-summary">
            <span>本机剪切流水线</span>
            <strong>{pipelineStatus}</strong>
          </div>
          <p className="ml-supporting-text">{pipelineDetail}</p>
        </Card>

        <Table<CutQueueJob>
          className="cutter-queue-table is-workbench"
          columns={taskColumns}
          density="compact"
          empty={<span className="cutter-queue-empty ml-empty-inline">当前筛选没有剪切任务。</span>}
          getRowKey={(job) => job.queue_job_id}
          onRowClick={(job) => setSelectedJobId(job.queue_job_id)}
          rows={visibleJobs}
          selectedRowKey={selectedJob?.queue_job_id}
          stickyHeader
        />
        {canLoadMore ? (
          <Button
            type="button"
            className="cutter-queue-load-more"
            variant="secondary"
            size="sm"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "加载中" : `加载更多（已显示 ${jobs.length} / ${totalCount}）`}
          </Button>
        ) : null}
      </div>

      <InspectorPanel
        title="任务详情"
        className="ml-inspector--workbench cutter-queue-inspector"
        bodyClassName="cutter-queue-inspector-body"
      >
        {selectedJob ? (
          <div className="cutter-queue-detail ml-detail-panel-stack">
            <Badge className="cutter-queue-detail-status ml-detail-status" tone={statusTone(selectedJob.status)}>
              {labelForStatus(selectedJob.status)}
            </Badge>
            <dl className="ml-data-list ml-data-list--grid cutter-queue-detail-list">
              <div className="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row">
                <dt>来源素材</dt>
                <dd>{selectedJob.source_title || selectedJob.source_video_id || "未知来源"}</dd>
              </div>
              <div className="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row">
                <dt>时间范围</dt>
                <dd>
                  {formatDuration(selectedJob.begin_ms)} - {formatDuration(selectedJob.end_ms)}
                </dd>
              </div>
              <div className="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row">
                <dt>剪切模式</dt>
                <dd>{cutModeLabel(selectedJob.cut_mode)}</dd>
              </div>
              <div className="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row">
                <dt>输出路径</dt>
                <dd>{selectedJob.output_file ?? "尚未生成"}</dd>
              </div>
              {selectedJob.error_message ? (
                <div className="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row">
                  <dt>错误摘要</dt>
                  <dd>{selectedJob.error_message}</dd>
                </div>
              ) : null}
            </dl>
            {selectedJob.status === "failed" && onRetryFailed ? (
              <Button onClick={() => onRetryFailed(selectedJob.queue_job_id)} variant="primary">
                重新剪切
              </Button>
            ) : null}
            {onOpenCutOutputDirectory ? (
              <Button
                className="cutter-queue-detail-directory"
                leadingIcon={<FolderIcon />}
                onClick={onOpenCutOutputDirectory}
                variant="secondary"
              >
                打开文件目录
              </Button>
            ) : null}
          </div>
        ) : (
          <span>暂无剪切任务</span>
        )}
      </InspectorPanel>
    </section>
  );
}
