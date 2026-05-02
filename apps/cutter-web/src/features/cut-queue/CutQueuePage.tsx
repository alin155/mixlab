import { InspectorPanel, StatusRow } from "@mixlab/ui-foundation";
import { formatDuration } from "../../api.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";

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

export function CutQueuePage({
  jobs,
  onRefresh,
  onRunNext
}: {
  jobs: readonly CutQueueJob[];
  onRefresh?: () => void;
  onRunNext?: () => void;
}) {
  return (
    <section className="cutter-page cutter-cut-queue" data-page="cut-queue">
      <div className="cutter-page-main">
        <header className="cutter-page-header">
          <div>
            <p className="cutter-eyebrow">本地执行</p>
            <h1>剪切队列</h1>
            <p>队列状态在独立页面查看；剪切运行时不阻塞搜索和继续找素材。</p>
          </div>
          {onRefresh || onRunNext ? (
            <div className="cutter-button-group">
              {onRefresh ? (
                <button className="cutter-secondary-button" type="button" onClick={onRefresh}>
                  刷新队列
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

        <div className="cutter-queue-list">
          {jobs.map((job) => (
            <StatusRow
              key={job.queue_job_id}
              tone={toneForStatus(job.status)}
              label={job.status}
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

      <InspectorPanel title="队列说明">
        <div className="cutter-inspector-stack">
          <span>pending 等待本机 FFmpeg 执行。</span>
          <span>running 展示本地任务进度。</span>
          <span>done 自动进入本地素材库。</span>
          <span>failed 可重试并保留错误原因。</span>
        </div>
      </InspectorPanel>
    </section>
  );
}
