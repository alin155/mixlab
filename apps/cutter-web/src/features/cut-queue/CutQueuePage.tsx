import { useEffect, useState } from "react";
import { InspectorPanel } from "@mixlab/ui-foundation";
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

function outputOrIssue(job: CutQueueJob, nowMs: number): string {
  if (job.status === "failed") {
    return `失败原因：${job.error_message ?? "剪切失败"}`;
  }

  if (job.status === "done") {
    return job.output_file ?? "已生成本地素材";
  }

  if (job.status === "running") {
    return `${cutQueueCurrentPhaseLabel(job)} · 已耗时 ${formatCutQueueElapsed(cutQueueJobElapsedMs(job, nowMs))}`;
  }

  if (job.status === "cancelled") {
    return "已取消";
  }

  return "等待中";
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
  onRefresh,
  onRunNext,
  onRetryFailed
}: {
  jobs: readonly CutQueueJob[];
  project?: CutterProject;
  autoRefreshEnabled?: boolean;
  lastUpdatedLabel?: string;
  pipelineState?: CutPipelineState;
  onRefresh?: () => void;
  onRunNext?: () => void;
  onRetryFailed?: (cutJobId: string) => void;
}) {
  const summary = cutQueueSummary(jobs);
  const pipelineStatus = cutPipelineStatusLabel(pipelineState);
  const pipelineDetail = cutPipelineDetailLabel(pipelineState);
  const projectTitle = project ? projectDisplayTitle(project) : "";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [statusFilter, setStatusFilter] = useState<CutTaskFilter>("all");
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(() => preferredTaskJob(jobs)?.queue_job_id);
  const selectedJob = jobs.find((job) => job.queue_job_id === selectedJobId) ?? preferredTaskJob(jobs);
  const visibleJobs = statusFilter === "all" ? jobs : jobs.filter((job) => job.status === statusFilter);

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
    <section className="cutter-page cutter-cut-queue" data-page="cut-tasks">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <h1>剪切任务</h1>
            <p>
              {summary.total} 个任务
              {summary.running > 0 ? ` · ${summary.running} 个剪切中` : ""}
              {summary.failed > 0 ? ` · ${summary.failed} 个需要处理` : ""}
              {projectTitle ? ` · ${projectTitle}` : ""}
            </p>
          </div>
        </header>

        <section className="cutter-task-tabs" aria-label="剪切任务筛选">
          {statusFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={statusFilter === filter.key ? "is-active" : ""}
              aria-pressed={statusFilter === filter.key}
              onClick={() => setStatusFilter(filter.key)}
            >
              <span>{filter.label}</span>
              <strong>{taskCountForFilter(summary, filter.key)}</strong>
            </button>
          ))}
        </section>

        <section className={`cutter-pipeline-card is-${pipelineState.status}`} aria-label="本机剪切流水线">
          <div>
            <span>本机剪切流水线</span>
            <strong>{pipelineStatus}</strong>
          </div>
          <p>{pipelineDetail}</p>
        </section>

        <div className="cutter-task-table-wrap">
          <table className="cutter-task-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>来源</th>
                <th>时间段</th>
                <th>选中文案</th>
                <th>输出 / 问题</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr
                  key={job.queue_job_id}
                  className={`${selectedJob?.queue_job_id === job.queue_job_id ? "is-selected" : ""} is-${job.status}`}
                  onClick={() => setSelectedJobId(job.queue_job_id)}
                >
                  <td>
                    <span className={`cutter-task-status-chip is-${job.status}`}>{labelForStatus(job.status)}</span>
                  </td>
                  <td>
                    <button
                      className="cutter-task-source-button"
                      type="button"
                      onClick={() => setSelectedJobId(job.queue_job_id)}
                    >
                      {job.source_title || job.source_video_id || "未知来源"}
                    </button>
                  </td>
                  <td>
                    <span className="cutter-task-time-range">
                      {formatDuration(job.begin_ms)} - {formatDuration(job.end_ms)}
                    </span>
                  </td>
                  <td>
                    <span className="cutter-task-selected-text">{shortSelectedText(job.selected_text)}</span>
                  </td>
                  <td>
                    <span className={`cutter-task-output is-${job.status}`}>{outputOrIssue(job, nowMs)}</span>
                  </td>
                  <td>
                    <span className="cutter-task-actions">
                      {job.status === "failed" && onRetryFailed ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRetryFailed(job.queue_job_id);
                          }}
                        >
                          重试
                        </button>
                      ) : (
                        <span>{labelForStatus(job.status)}</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleJobs.length === 0 ? <span className="cutter-task-empty">当前筛选没有剪切任务。</span> : null}
        </div>
      </div>

      <InspectorPanel title="任务详情">
        {selectedJob ? (
          <div className="cutter-task-detail">
            <span className={`cutter-task-status-chip is-${selectedJob.status}`}>{labelForStatus(selectedJob.status)}</span>
            <dl>
              <div>
                <dt>来源素材</dt>
                <dd>{selectedJob.source_title || selectedJob.source_video_id || "未知来源"}</dd>
              </div>
              <div>
                <dt>时间范围</dt>
                <dd>
                  {formatDuration(selectedJob.begin_ms)} - {formatDuration(selectedJob.end_ms)}
                </dd>
              </div>
              <div>
                <dt>剪切模式</dt>
                <dd>{cutModeLabel(selectedJob.cut_mode)}</dd>
              </div>
              <div>
                <dt>输出路径</dt>
                <dd>{selectedJob.output_file ?? "尚未生成"}</dd>
              </div>
              {selectedJob.error_message ? (
                <div>
                  <dt>错误摘要</dt>
                  <dd>{selectedJob.error_message}</dd>
                </div>
              ) : null}
            </dl>
            {selectedJob.status === "failed" && onRetryFailed ? (
              <button
                className="cutter-primary-button"
                type="button"
                onClick={() => onRetryFailed(selectedJob.queue_job_id)}
              >
                重试此任务
              </button>
            ) : null}
          </div>
        ) : (
          <span>暂无剪切任务</span>
        )}
      </InspectorPanel>
    </section>
  );
}
