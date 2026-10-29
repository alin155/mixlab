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
  cutJobCompletionLabel,
  cutJobEffectiveMode,
  cutJobNeedsRecut,
  cutJobVerificationDetail,
  cutJobVerificationState,
  cutQueueCurrentPhaseLabel,
  cutQueueJobElapsedMs,
  formatCutQueueElapsed,
  type CutQueueJob
} from "../../state/cut-queue.ts";
import {
  batchPauseCutJobIds,
  batchRetryCutJobIds,
  cutQueueBatchActionLabel,
  planBatchDeleteCutJobs,
  pruneCutQueueSelection,
  removeCutQueueJobsFromSelection,
  setCutQueueJobsSelected,
  toggleCutQueueJobSelection,
  type CutQueueBatchAction,
  type CutQueueBatchResult
} from "../../state/cut-queue-batch.ts";
import {
  cutPipelineDetailLabel,
  cutPipelineStatusLabel,
  idleCutPipelineState,
  type CutPipelineState
} from "../../state/cut-pipeline.ts";
import { cutQueueSummary } from "../../state/cut-task-refresh.ts";
import { estimateCutQueueProgress } from "./cut-queue-progress.ts";
import { projectDisplayTitle, type CutterProject } from "../../state/cutter-projects.ts";

type CutTaskFilter = "all" | CutQueueJob["status"];

type UiVerificationState = ReturnType<typeof cutJobVerificationState> | "legacy";

function doneLabelForVerification(verification: UiVerificationState): string {
  return verification === "legacy" ? "剪切成功" : cutJobCompletionLabel(verification);
}

const statusFilters: Array<{ key: CutTaskFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pending", label: "等待中" },
  { key: "running", label: "剪切中" },
  { key: "failed", label: "失败" },
  { key: "cancelled", label: "已取消" },
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

function cutModeLabel(mode: CutQueueJob["cut_mode"] | undefined): string {
  switch (mode) {
    case "copy":
      return "极速剪切";
    case "precise":
      return "精准剪切";
    case "smart":
      return "智能剪切";
    default:
      return "未标注";
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

function problemForJob(
  job: CutQueueJob,
  nowMs: number,
  verification: UiVerificationState
): string {
  if (job.status === "failed") {
    return job.error_message ?? "剪切失败";
  }

  if (job.status === "done") {
    return doneLabelForVerification(verification);
  }

  if (job.status === "running") {
    return `${cutQueueCurrentPhaseLabel(job)} · 已耗时 ${formatCutQueueElapsed(cutQueueJobElapsedMs(job, nowMs))}`;
  }

  if (job.status === "cancelled") {
    return "已取消，可重新剪切";
  }

  return "等待中";
}

function actionTextForJob(job: CutQueueJob, verification: UiVerificationState): string {
  switch (job.status) {
    case "pending":
      return "等待剪切";
    case "running":
      return "剪切中";
    case "failed":
      return "重新剪切";
    case "cancelled":
      return "重新剪切";
    case "done":
      return doneLabelForVerification(verification);
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
  onCancelJob,
  onOpenCutOutputDirectory,
  onOpenCutJobDirectory,
  onLoadMore,
  verificationEnabled = true,
  hiddenJobCount = 0,
  onRestoreHiddenJobs,
  onBatchRetry,
  onBatchPause,
  onBatchDelete
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
  onCancelJob?: (cutJobId: string) => void;
  onOpenCutOutputDirectory?: () => void;
  onOpenCutJobDirectory?: (job: CutQueueJob) => void;
  onLoadMore?: () => void;
  /**
   * Capability negotiation result for output verification. Default true keeps
   * the legacy field-based behaviour (no capability endpoint / fixture).
   */
  verificationEnabled?: boolean;
  /** Number of queue rows hidden by the local batch delete action. */
  hiddenJobCount?: number;
  onRestoreHiddenJobs?: () => void;
  onBatchRetry?: (cutJobIds: readonly string[]) => Promise<CutQueueBatchResult>;
  onBatchPause?: (cutJobIds: readonly string[]) => Promise<CutQueueBatchResult>;
  onBatchDelete?: (cutJobIds: readonly string[]) => Promise<CutQueueBatchResult>;
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
  const batchEnabled = Boolean(onBatchRetry || onBatchPause || onBatchDelete);
  const [selectedJobIds, setSelectedJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const [batchPending, setBatchPending] = useState<CutQueueBatchAction | null>(null);
  const [batchResult, setBatchResult] = useState<CutQueueBatchResult | null>(null);
  const selectedJob = jobs.find((job) => job.queue_job_id === selectedJobId) ?? preferredTaskJob(jobs);
  const visibleJobs = statusFilter === "all" ? jobs : jobs.filter((job) => job.status === statusFilter);
  const visibleSelectableJobIds = visibleJobs.map((job) => job.queue_job_id);
  const allVisibleJobsSelected =
    visibleSelectableJobIds.length > 0 &&
    visibleSelectableJobIds.every((queueJobId) => selectedJobIds.has(queueJobId));
  const retryTargetCount = batchRetryCutJobIds(jobs, selectedJobIds).length;
  const pauseTargetCount = batchPauseCutJobIds(jobs, selectedJobIds).length;
  const deleteTargetCount = planBatchDeleteCutJobs(jobs, selectedJobIds).total;
  const batchButtonsDisabled = selectedJobIds.size === 0 || batchPending !== null;

  async function runBatchAction(action: CutQueueBatchAction) {
    const handler = action === "retry" ? onBatchRetry : action === "pause" ? onBatchPause : onBatchDelete;

    if (!handler || batchPending !== null || selectedJobIds.size === 0) {
      return;
    }

    const requestedJobIds = [...selectedJobIds];
    setBatchPending(action);

    try {
      const result = await handler(requestedJobIds);
      setBatchResult(result);
      setSelectedJobIds((current) => removeCutQueueJobsFromSelection(current, result.processed_job_ids));
    } catch {
      setBatchResult({
        action,
        requested: requestedJobIds.length,
        processed: 0,
        skipped: 0,
        failed: requestedJobIds.length,
        cancelled: 0,
        processed_job_ids: [],
        message: `${cutQueueBatchActionLabel(action)}失败：本机服务未响应，请稍后重试`
      });
    } finally {
      setBatchPending(null);
    }
  }

  const selectionColumn: TableColumn<CutQueueJob> = {
    id: "select",
    header: (
      <input
        aria-label="全选当前任务"
        checked={allVisibleJobsSelected}
        className="cutter-queue-select-input"
        onChange={() =>
          setSelectedJobIds((current) =>
            setCutQueueJobsSelected(current, visibleSelectableJobIds, !allVisibleJobsSelected)
          )
        }
        type="checkbox"
      />
    ),
    width: 44,
    align: "center",
    render: (job) => (
      <input
        aria-label={`选择任务 ${job.queue_job_id}`}
        checked={selectedJobIds.has(job.queue_job_id)}
        className="cutter-queue-select-input"
        onChange={() => setSelectedJobIds((current) => toggleCutQueueJobSelection(current, job.queue_job_id))}
        onClick={(event) => event.stopPropagation()}
        type="checkbox"
      />
    )
  };

  function jobVerification(job: CutQueueJob): UiVerificationState {
    // Field presence always enables verification; when the server explicitly
    // says the capability is unsupported we fall back to the legacy label.
    return verificationEnabled || Boolean(job.verification)
      ? cutJobVerificationState(job)
      : "legacy";
  }

  function jobNeedsRecut(job: CutQueueJob): boolean {
    if (!verificationEnabled && !job.verification && job.status === "done") {
      return false;
    }

    return cutJobNeedsRecut(job);
  }
  const taskColumns: Array<TableColumn<CutQueueJob>> = [
    ...(batchEnabled ? [selectionColumn] : []),
    {
      id: "status",
      header: "状态",
      width: "86px",
      align: "center",
      render: (job) => <Badge tone={statusTone(job.status)}>{labelForStatus(job.status)}</Badge>
    },
    {
      id: "queue",
      header: "队列",
      width: "150px",
      align: "center",
      render: (job) => {
        const progress = estimateCutQueueProgress(jobs, job, nowMs);
        return progress ? (
          <span className="cutter-queue-eta ml-table-muted-text" title={progress.label}>
            {progress.label}
          </span>
        ) : null;
      }
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
          {problemForJob(job, nowMs, jobVerification(job))}
        </span>
      )
    },
    {
      id: "action",
      header: "操作",
      width: "92px",
      align: "center",
      render: (job) => {
        const verification = jobVerification(job);
        const canRecut = jobNeedsRecut(job) && onRetryFailed;

        return (
          <span className="cutter-queue-actions ml-table-action-cell">
            {canRecut ? (
              <Button
                size="sm"
                variant={job.status === "failed" ? "danger" : "secondary"}
                onClick={(event) => {
                  event.stopPropagation();
                  onRetryFailed(job.queue_job_id);
                }}
              >
                {job.status === "done" ? "复剪" : "重新剪切"}
              </Button>
            ) : (job.status === "pending" || job.status === "running") && onCancelJob ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelJob(job.queue_job_id);
                }}
              >
                取消剪辑
              </Button>
            ) : job.status === "done" && verification === "verified" ? (
              <span className="ml-status-icon ml-status-icon--ready" role="img" aria-label="剪切成功" title="剪切成功">
                <CheckIcon />
              </span>
            ) : (
              <span className={`ml-status-text ml-status-text--${job.status}`}>
                {actionTextForJob(job, verification)}
              </span>
            )}
          </span>
        );
      }
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

  // A refresh (or a batch delete) can remove selected rows: drop orphan ids so
  // batch actions never target jobs that are no longer on screen.
  useEffect(() => {
    setSelectedJobIds((current) => {
      const next = pruneCutQueueSelection(current, jobs);
      return next.size === current.size ? current : next;
    });
  }, [jobs]);

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
              {projectTitle ? ` · 当前项目 ${projectTitle}` : " · 全部项目"}
              {totalCount > 0 ? ` · 全部 ${totalCount} 个任务` : ""}
            </p>
            {jobs.length === 0 && totalCount > 0 ? (
              <p className="cutter-queue-batch-notice" role="status">
                当前项目暂无剪切任务；可切换项目查看。全部项目共 {totalCount} 个任务。
              </p>
            ) : null}
            {batchResult ? (
              <p className="cutter-queue-batch-notice" role="status">
                {batchResult.message}
              </p>
            ) : null}
          </div>
          {batchEnabled ? (
            <div className="cutter-queue-batch ml-control-cluster" role="group" aria-label="批量操作">
              <span className="cutter-queue-batch-count">{selectedJobIds.size} 个已选</span>
              <Button
                className="cutter-queue-batch-button"
                disabled={batchButtonsDisabled || !onBatchRetry}
                onClick={() => void runBatchAction("retry")}
                size="sm"
                variant="secondary"
              >
                {batchPending === "retry" ? "重试中" : `批量重试（${retryTargetCount}）`}
              </Button>
              <Button
                className="cutter-queue-batch-button"
                disabled={batchButtonsDisabled || !onBatchPause}
                onClick={() => void runBatchAction("pause")}
                size="sm"
                variant="secondary"
              >
                {batchPending === "pause" ? "取消中" : `批量取消（可重试）（${pauseTargetCount}）`}
              </Button>
              <Button
                className="cutter-queue-batch-button"
                disabled={batchButtonsDisabled || !onBatchDelete}
                onClick={() => void runBatchAction("delete")}
                size="sm"
                variant="danger"
              >
                {batchPending === "delete" ? "隐藏中" : `隐藏（可恢复）（${deleteTargetCount}）`}
              </Button>
              {hiddenJobCount > 0 && onRestoreHiddenJobs ? (
                <Button
                  className="cutter-queue-batch-restore"
                  onClick={onRestoreHiddenJobs}
                  size="sm"
                  variant="ghost"
                >
                  {`恢复已隐藏（${hiddenJobCount}）`}
                </Button>
              ) : null}
            </div>
          ) : null}
          {batchEnabled ? (
            <p className="cutter-queue-batch-hint">
              批量取消可在稍后重新重试；隐藏只影响本机视图，可恢复，不会删除任务文件。
            </p>
          ) : null}
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
                <dd>{cutModeLabel(cutJobEffectiveMode(selectedJob))}</dd>
              </div>
              {selectedJob.status === "done" && jobVerification(selectedJob) !== "legacy" ? (
                <div className="ml-data-row ml-data-row--detail-pair cutter-queue-detail-row">
                  <dt>输出校验</dt>
                  <dd>{cutJobVerificationDetail(selectedJob)}</dd>
                </div>
              ) : null}
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
            {jobNeedsRecut(selectedJob) && onRetryFailed ? (
              <Button onClick={() => onRetryFailed(selectedJob.queue_job_id)} variant="primary">
                {selectedJob.status === "done" ? "复剪" : "重新剪切"}
              </Button>
            ) : null}
            {(selectedJob.status === "pending" || selectedJob.status === "running") && onCancelJob ? (
              <Button onClick={() => onCancelJob(selectedJob.queue_job_id)} variant="secondary">
                取消剪辑
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
            {onOpenCutJobDirectory ? (
              <Button
                className="cutter-queue-detail-directory cutter-queue-detail-job-directory"
                leadingIcon={<FolderIcon />}
                onClick={() => onOpenCutJobDirectory(selectedJob)}
                variant="secondary"
              >
                打开任务目录
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
