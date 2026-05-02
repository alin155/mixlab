import type { CutListItem, CutMode } from "./cut-list.ts";

export type CutQueueStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface CutQueueJob {
  queue_job_id: string;
  cut_list_item_id: string;
  source_video_id: string;
  source_title: string;
  title: string;
  begin_ms: number;
  end_ms: number;
  duration_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  status: CutQueueStatus;
  progress: number;
  created_at: string;
  error_message?: string;
}

export interface CreateQueueJobsInput {
  createdAt?: string;
}

export function createQueueJobsFromCutList(
  items: readonly CutListItem[],
  input: CreateQueueJobsInput = {}
): CutQueueJob[] {
  const createdAt = input.createdAt ?? new Date().toISOString();

  return [...items]
    .sort((left, right) => left.order - right.order)
    .map((item) => ({
      queue_job_id: `job-${item.cut_list_item_id}`,
      cut_list_item_id: item.cut_list_item_id,
      source_video_id: item.source_video_id,
      source_title: item.source_title,
      title: item.title ?? `${item.source_title} ${item.order}`,
      begin_ms: item.begin_ms,
      end_ms: item.end_ms,
      duration_ms: item.duration_ms,
      selected_text: item.selected_text,
      cut_mode: item.cut_mode,
      status: "pending",
      progress: 0,
      created_at: createdAt
    }));
}

export function updateQueueJobStatus(
  jobs: readonly CutQueueJob[],
  queueJobId: string,
  update: {
    status: CutQueueStatus;
    progress?: number;
    error_message?: string;
  }
): CutQueueJob[] {
  return jobs.map((job) =>
    job.queue_job_id === queueJobId
      ? {
          ...job,
          status: update.status,
          progress: update.progress ?? job.progress,
          ...(update.error_message ? { error_message: update.error_message } : {})
        }
      : job
  );
}
