import type { CutJob } from "../api.ts";
import type { CutQueueJob } from "./cut-queue.ts";

export type CutPipelineStatus = "idle" | "running" | "completed" | "failed";

export interface CutPipelineState {
  status: CutPipelineStatus;
  processed_count: number;
  done_count: number;
  failed_count: number;
  message: string;
  last_updated_label: string;
}

export interface RunCutPipelineInput {
  runNextCutJob: () => Promise<CutJob | null>;
  refreshQueueJobs: () => Promise<void>;
  refreshLocalClips: () => Promise<void>;
  onState?: (state: CutPipelineState) => void;
  maxIterations?: number;
  activeRefreshIntervalMs?: number;
}

export interface ObserveServiceCutQueueInput {
  refreshQueueJobs: () => Promise<readonly CutQueueJob[]>;
  refreshLocalClips: () => Promise<void>;
  getJobs: () => readonly CutQueueJob[];
  onState?: (state: CutPipelineState) => void;
  baselineTerminalJobIds?: ReadonlySet<string>;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  idleStablePolls?: number;
}

export const idleCutPipelineState: CutPipelineState = {
  status: "idle",
  processed_count: 0,
  done_count: 0,
  failed_count: 0,
  message: "本机剪切空闲",
  last_updated_label: "等待任务"
};

export function cutPipelineStatusLabel(state: CutPipelineState): string {
  switch (state.status) {
    case "idle":
      return "本机剪切空闲";
    case "running":
      return "本机剪切运行中";
    case "completed":
      return "本机剪切已完成";
    case "failed":
      return "本机剪切失败";
  }
}

export function cutPipelineDetailLabel(state: CutPipelineState): string {
  if (state.status === "idle") {
    return "没有正在执行的本机剪切任务。";
  }

  if (state.status === "running") {
    return `已处理 ${state.processed_count} 个任务，正在缓存或剪切当前任务。`;
  }

  if (state.status === "failed") {
    return state.message || "本机剪切执行失败，请查看任务错误。";
  }

  return `已处理 ${state.processed_count} 个任务，完成 ${state.done_count} 个，失败 ${state.failed_count} 个。`;
}

function isActiveQueueJob(job: CutQueueJob): boolean {
  return job.status === "pending" || job.status === "running";
}

function isTerminalQueueJob(job: CutQueueJob): boolean {
  return job.status === "done" || job.status === "failed";
}

function queueJobId(job: CutQueueJob): string {
  return job.queue_job_id;
}

function serviceQueueState(input: {
  jobs: readonly CutQueueJob[];
  baselineTerminalJobIds: ReadonlySet<string>;
  status: CutPipelineStatus;
  message?: string;
}): CutPipelineState {
  const terminalJobs = input.jobs.filter(
    (job) => isTerminalQueueJob(job) && !input.baselineTerminalJobIds.has(queueJobId(job))
  );
  const doneCount = terminalJobs.filter((job) => job.status === "done").length;
  const failedCount = terminalJobs.filter((job) => job.status === "failed").length;

  return {
    status: input.status,
    processed_count: terminalJobs.length,
    done_count: doneCount,
    failed_count: failedCount,
    message:
      input.message ??
      (input.status === "running"
        ? "本机剪切队列运行中"
        : input.status === "completed"
          ? "本机剪切已完成"
          : "本机剪切空闲"),
    last_updated_label: "刚刚更新"
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runningState(input: {
  processed_count: number;
  done_count: number;
  failed_count: number;
}): CutPipelineState {
  return {
    status: "running",
    processed_count: input.processed_count,
    done_count: input.done_count,
    failed_count: input.failed_count,
    message: "本机剪切运行中",
    last_updated_label: "刚刚更新"
  };
}

export async function runCutPipeline(
  input: RunCutPipelineInput
): Promise<CutPipelineState> {
  const maxIterations = input.maxIterations ?? Number.POSITIVE_INFINITY;
  const activeRefreshIntervalMs = input.activeRefreshIntervalMs ?? 0;
  let processedCount = 0;
  let doneCount = 0;
  let failedCount = 0;

  input.onState?.(runningState({
    processed_count: processedCount,
    done_count: doneCount,
    failed_count: failedCount
  }));

  try {
    for (let index = 0; index < maxIterations; index += 1) {
      let refreshInFlight = false;
      const activeRefreshTimer = activeRefreshIntervalMs > 0
        ? setInterval(() => {
            if (refreshInFlight) {
              return;
            }

            refreshInFlight = true;
            void input.refreshQueueJobs()
              .then(() => {
                input.onState?.(runningState({
                  processed_count: processedCount,
                  done_count: doneCount,
                  failed_count: failedCount
                }));
              })
              .catch(() => undefined)
              .finally(() => {
                refreshInFlight = false;
              });
          }, activeRefreshIntervalMs)
        : undefined;

      let job: CutJob | null;
      try {
        job = await input.runNextCutJob();
      } finally {
        if (activeRefreshTimer) {
          clearInterval(activeRefreshTimer);
        }
      }

      if (!job) {
        break;
      }

      processedCount += 1;

      if (job.status === "done") {
        doneCount += 1;
      }

      if (job.status === "failed") {
        failedCount += 1;
      }

      await input.refreshQueueJobs();

      if (job.status === "done") {
        await input.refreshLocalClips();
      }

      input.onState?.(runningState({
        processed_count: processedCount,
        done_count: doneCount,
        failed_count: failedCount
      }));
    }

    const finalState: CutPipelineState = processedCount > 0
      ? {
          status: "completed",
          processed_count: processedCount,
          done_count: doneCount,
          failed_count: failedCount,
          message: "本机剪切已完成",
          last_updated_label: "刚刚更新"
        }
      : idleCutPipelineState;
    input.onState?.(finalState);
    return finalState;
  } catch (error) {
    const failedState: CutPipelineState = {
      status: "failed",
      processed_count: processedCount,
      done_count: doneCount,
      failed_count: failedCount,
      message: error instanceof Error ? error.message : "本机剪切执行失败",
      last_updated_label: "刚刚更新"
    };
    input.onState?.(failedState);
    throw error;
  }
}

export async function observeServiceCutQueue(
  input: ObserveServiceCutQueueInput
): Promise<CutPipelineState> {
  const pollIntervalMs = input.pollIntervalMs ?? 1000;
  const maxWaitMs = input.maxWaitMs ?? 120_000;
  const idleStablePolls = input.idleStablePolls ?? 2;
  const baselineTerminalJobIds = input.baselineTerminalJobIds ?? new Set<string>();
  const startedAt = Date.now();
  const refreshedLocalClipJobIds = new Set<string>();
  let stableIdleCount = 0;
  let latestJobs = input.getJobs();

  input.onState?.(serviceQueueState({
    jobs: latestJobs,
    baselineTerminalJobIds,
    status: latestJobs.some(isActiveQueueJob) ? "running" : "idle"
  }));

  for (;;) {
    latestJobs = await input.refreshQueueJobs();
    const newlyDoneJobs = latestJobs.filter(
      (job) =>
        job.status === "done" &&
        !baselineTerminalJobIds.has(queueJobId(job)) &&
        !refreshedLocalClipJobIds.has(queueJobId(job))
    );

    if (newlyDoneJobs.length > 0) {
      for (const job of newlyDoneJobs) {
        refreshedLocalClipJobIds.add(queueJobId(job));
      }
      await input.refreshLocalClips();
    }

    const hasActiveJobs = latestJobs.some(isActiveQueueJob);
    input.onState?.(serviceQueueState({
      jobs: latestJobs,
      baselineTerminalJobIds,
      status: hasActiveJobs ? "running" : "completed"
    }));

    if (!hasActiveJobs) {
      stableIdleCount += 1;
      if (stableIdleCount >= idleStablePolls) {
        const finalState = serviceQueueState({
          jobs: latestJobs,
          baselineTerminalJobIds,
          status: "completed"
        });
        input.onState?.(finalState);
        return finalState;
      }
    } else {
      stableIdleCount = 0;
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      const timeoutState = serviceQueueState({
        jobs: latestJobs,
        baselineTerminalJobIds,
        status: hasActiveJobs ? "running" : "completed",
        message: hasActiveJobs ? "本机剪切仍在后台排队或执行，可继续操作页面。" : undefined
      });
      input.onState?.(timeoutState);
      return timeoutState;
    }

    await wait(pollIntervalMs);
  }
}
