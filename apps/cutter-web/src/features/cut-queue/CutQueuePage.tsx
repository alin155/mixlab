import { useEffect, useState } from "react";
import { InspectorPanel, StatusRow } from "@mixlab/ui-foundation";
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

function toneForStatus(status: CutQueueJob["status"]) {
  if (status === "done") {
    return "ready" as const;
  }

  if (status === "running") {
    return "processing" as const;
  }

  if (status === "failed") {
    return "failed" as const;
  }

  return "queued" as const;
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

  useEffect(() => {
    if (!jobs.some((job) => job.status === "pending" || job.status === "running")) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  return (
    <section className="cutter-page cutter-cut-queue" data-page="cut-tasks">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <h1>剪切任务</h1>
            <p>
              {projectTitle
                ? "这里只显示当前项目的剪切交付；切换项目后任务列表会同步切换。"
                : "先选择项目或完成首次剪切，任务会自动归入对应项目。"}
            </p>
          </div>
          {onRefresh || onRunNext || autoRefreshEnabled ? (
            <div className="cutter-button-group">
              {autoRefreshEnabled ? <span className="cutter-note">自动刷新 · {lastUpdatedLabel || "等待更新"}</span> : null}
              {onRefresh ? (
                <button className="cutter-secondary-button" type="button" onClick={onRefresh}>
                  刷新任务
                </button>
              ) : null}
              {onRunNext ? (
                <button className="cutter-primary-button" type="button" onClick={onRunNext}>
                  继续剪切
                </button>
              ) : null}
            </div>
          ) : (
            <span className="cutter-note">不阻塞搜索</span>
          )}
        </header>

        <section className="cutter-queue-summary" aria-label="剪切任务概览">
          <div>
            <strong>{summary.pending}</strong>
            <span>等待中</span>
          </div>
          <div>
            <strong>{summary.running}</strong>
            <span>剪切中</span>
          </div>
          <div>
            <strong>{summary.done}</strong>
            <span>已完成</span>
          </div>
          <div>
            <strong>{summary.failed}</strong>
            <span>失败</span>
          </div>
        </section>

        <section className={`cutter-pipeline-card is-${pipelineState.status}`} aria-label="本机剪切流水线">
          <div>
            <span>本机剪切流水线</span>
            <strong>{pipelineStatus}</strong>
          </div>
          <p>{pipelineDetail}</p>
        </section>

        <div className="cutter-queue-list">
          {jobs.map((job) => (
            <StatusRow
              key={job.queue_job_id}
              tone={toneForStatus(job.status)}
              label={labelForStatus(job.status)}
              detail={[
                job.title,
                `当前流程：${cutQueueCurrentPhaseLabel(job)}`,
                `已耗时：${formatCutQueueElapsed(cutQueueJobElapsedMs(job, nowMs))}`,
                job.selected_text ? `选中文案：${job.selected_text}` : "",
                job.status === "failed" && job.error_message ? `失败原因：${job.error_message}` : ""
              ]
                .filter(Boolean)
                .join(" · ")}
              value={
                <span className="cutter-row-actions">
                  {job.progress}%
                  {job.status === "failed" && onRetryFailed ? (
                    <button type="button" onClick={() => onRetryFailed(job.queue_job_id)}>
                      重试
                    </button>
                  ) : null}
                </span>
              }
            />
          ))}
        </div>
      </div>

      <InspectorPanel title="任务说明">
        <div className="cutter-inspector-stack">
          <span>等待中：任务已经创建，等待本机剪切服务执行。</span>
          <span>剪切中：正在生成本地片段，并展示当前进度。</span>
          <span>已完成：片段会进入本地素材库，后续可再次搜索和剪切。</span>
          <span>失败：可以重试，并保留错误原因方便诊断。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
