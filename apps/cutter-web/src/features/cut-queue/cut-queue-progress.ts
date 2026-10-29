import { formatDuration } from "../../api.ts";
import type { CutQueueJob } from "../../state/cut-queue.ts";

export interface CutQueueProgress {
  position: number;
  ahead_count: number;
  estimated_wait_ms?: number;
  label: string;
}

function timestampMs(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function median(values: number[]): number | undefined {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (usable.length === 0) {
    return undefined;
  }
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 === 0
    ? Math.round((usable[middle - 1] + usable[middle]) / 2)
    : usable[middle];
}

function medianCutDurationMs(jobs: readonly CutQueueJob[], cutMode?: string): number | undefined {
  const durations = jobs
    .filter((job) => job.status === "done")
    .filter((job) => !cutMode || (job.cut_mode_used ?? job.cut_mode) === cutMode)
    .map((job) => {
      const started = timestampMs(job.started_at);
      const finished = timestampMs(job.finished_at);
      return started !== undefined && finished !== undefined ? finished - started : undefined;
    })
    .filter((value): value is number => value !== undefined);
  return median(durations);
}

/**
 * 客户端队列位次/等待估算：只用于展示，不改变服务端调度。
 * 排序依据 created_at（与串行执行实际顺序一致），当前项目过滤只影响展示。
 */
export function estimateCutQueueProgress(
  jobs: readonly CutQueueJob[],
  job: CutQueueJob,
  nowMs: number
): CutQueueProgress | undefined {
  if (job.status !== "pending" && job.status !== "running") {
    return undefined;
  }

  const active = jobs
    .filter((item) => item.status === "pending" || item.status === "running")
    .sort((left, right) => (timestampMs(left.created_at) ?? 0) - (timestampMs(right.created_at) ?? 0));
  const index = active.findIndex((item) => item.queue_job_id === job.queue_job_id);
  if (index < 0) {
    return undefined;
  }

  const position = index + 1;
  if (job.status === "running") {
    const elapsed = Math.max(0, nowMs - (timestampMs(job.started_at) ?? nowMs));
    return {
      position,
      ahead_count: 0,
      label: `正在剪切 · 已 ${formatCutQueueElapsed(elapsed)}`
    };
  }

  const baseline = medianCutDurationMs(jobs, job.cut_mode_used ?? job.cut_mode)
    ?? medianCutDurationMs(jobs)
    ?? (job.duration_ms > 0 ? job.duration_ms * 2 : undefined);
  const running = active.find((item) => item.status === "running");
  const runningStarted = timestampMs(running?.started_at);
  const runningElapsed = runningStarted !== undefined ? Math.max(0, nowMs - runningStarted) : 0;
  const runningRemaining = baseline !== undefined ? Math.max(0, baseline - runningElapsed) : undefined;
  const pendingAhead = running ? Math.max(0, index - 1) : index;
  const estimated = runningRemaining !== undefined && baseline !== undefined
    ? runningRemaining + pendingAhead * baseline
    : undefined;

  return {
    position,
    ahead_count: Math.max(0, index),
    ...(estimated !== undefined ? { estimated_wait_ms: estimated } : {}),
    label: estimated !== undefined
      ? `第 ${position} 位 · 前面 ${Math.max(0, index)} 个 · 约 ${formatCutQueueElapsed(estimated)}`
      : `第 ${position} 位 · 前面 ${Math.max(0, index)} 个`
  };
}

export function formatCutQueueElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
}

export function formatCutQueueWait(milliseconds: number): string {
  return formatDuration(milliseconds);
}
