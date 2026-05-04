import { InspectorPanel, StatusRow } from "@mixlab/ui-foundation";
import { formatDuration } from "../../api.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";
import { cutQueueSummary } from "../../state/cut-task-refresh.ts";

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
  autoRefreshEnabled = false,
  lastUpdatedLabel = "",
  onRefresh,
  onRunNext
}: {
  jobs: readonly CutQueueJob[];
  autoRefreshEnabled?: boolean;
  lastUpdatedLabel?: string;
  onRefresh?: () => void;
  onRunNext?: () => void;
}) {
  const summary = cutQueueSummary(jobs);

  return (
    <section className="cutter-page cutter-cut-queue" data-page="cut-tasks">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">本地执行</p>
            <h1>剪切任务</h1>
            <p>后台任务在这里查看；剪切运行时不阻塞搜索和继续找素材。</p>
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
                  执行下一个
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

        <div className="cutter-queue-list">
          {jobs.map((job) => (
            <StatusRow
              key={job.queue_job_id}
              tone={toneForStatus(job.status)}
              label={labelForStatus(job.status)}
              detail={`${job.title} · ${formatDuration(job.begin_ms)} - ${formatDuration(job.end_ms)}`}
              value={
                <span className="cutter-row-actions">
                  {job.progress}%
                  {job.status === "failed" ? <button type="button">重试</button> : null}
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
