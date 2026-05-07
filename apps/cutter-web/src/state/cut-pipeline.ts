import type { CutJob } from "../api.ts";

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
    return `已处理 ${state.processed_count} 个任务，正在继续检查等待任务。`;
  }

  if (state.status === "failed") {
    return state.message || "本机剪切执行失败，请查看任务错误。";
  }

  return `已处理 ${state.processed_count} 个任务，完成 ${state.done_count} 个，失败 ${state.failed_count} 个。`;
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
      const job = await input.runNextCutJob();

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
