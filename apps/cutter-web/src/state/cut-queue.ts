import type { CutJob, CutJobCatalog } from "../api.ts";
import type { CutListItem, CutMode } from "./cut-list.ts";

export type CutQueueStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface CutQueueJob {
  queue_job_id: string;
  clip_list_id?: string;
  cut_list_item_id: string;
  project_id?: string;
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
  projectId?: string;
}

export interface CutJobProjectIndex {
  jobs: Record<string, string>;
  clipLists: Record<string, string>;
}

export const CUT_JOB_PROJECT_INDEX_STORAGE_KEY = "mixlab.cutter.cutJobProjectIndex";

export function emptyCutJobProjectIndex(): CutJobProjectIndex {
  return {
    jobs: {},
    clipLists: {}
  };
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0
    )
  );
}

export function readCutJobProjectIndex(): CutJobProjectIndex {
  if (!hasBrowserStorage()) {
    return emptyCutJobProjectIndex();
  }

  try {
    const raw = window.localStorage.getItem(CUT_JOB_PROJECT_INDEX_STORAGE_KEY);
    if (!raw) {
      return emptyCutJobProjectIndex();
    }

    const parsed = JSON.parse(raw) as Partial<CutJobProjectIndex>;
    return {
      jobs: stringRecord(parsed.jobs),
      clipLists: stringRecord(parsed.clipLists)
    };
  } catch {
    return emptyCutJobProjectIndex();
  }
}

export function writeCutJobProjectIndex(index: CutJobProjectIndex): void {
  if (!hasBrowserStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(CUT_JOB_PROJECT_INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch {
    // Storage is best-effort; queue rendering can still continue without persistence.
  }
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
      ...(input.projectId ? { project_id: input.projectId } : {}),
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

export function rememberCutJobsForProject(
  index: CutJobProjectIndex,
  jobs: readonly CutQueueJob[],
  projectId: string
): CutJobProjectIndex {
  const next: CutJobProjectIndex = {
    jobs: { ...index.jobs },
    clipLists: { ...index.clipLists }
  };

  for (const job of jobs) {
    next.jobs[job.queue_job_id] = projectId;
    if (job.clip_list_id) {
      next.clipLists[job.clip_list_id] = projectId;
    }
  }

  return next;
}

export function filterCutQueueJobsByProject(
  jobs: readonly CutQueueJob[],
  projectId?: string
): CutQueueJob[] {
  if (!projectId) {
    return [];
  }

  return jobs.filter((job) => job.project_id === projectId);
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

function progressForApiStatus(status: CutJob["status"]): number {
  if (status === "done") {
    return 100;
  }

  if (status === "running") {
    return 50;
  }

  return 0;
}

export interface MapApiCutJobsInput {
  projectIndex?: CutJobProjectIndex;
}

function projectIdForApiCutJob(job: CutJob, projectIndex?: CutJobProjectIndex): string | undefined {
  if (!projectIndex) {
    return undefined;
  }

  return projectIndex.jobs[job.cut_job_id] ?? projectIndex.clipLists[job.clip_list_id];
}

export function mapApiCutJobsToQueueJobs(
  catalog: CutJobCatalog,
  input: MapApiCutJobsInput = {}
): CutQueueJob[] {
  return [...catalog.jobs]
    .sort((left, right) => {
      const updatedCompare = (right.updated_at ?? "").localeCompare(left.updated_at ?? "");
      return updatedCompare || right.cut_job_id.localeCompare(left.cut_job_id);
    })
    .map((job) => {
      const beginMs = job.begin_ms ?? 0;
      const endMs = job.end_ms ?? beginMs;
      const sourceTitle = job.source_title ?? "本地剪切任务";
      const projectId = projectIdForApiCutJob(job, input.projectIndex);

      return {
        queue_job_id: job.cut_job_id,
        clip_list_id: job.clip_list_id,
        cut_list_item_id: job.clip_list_item_id ?? job.cut_job_id,
        ...(projectId ? { project_id: projectId } : {}),
        source_video_id: job.source_video_id ?? "",
        source_title: sourceTitle,
        title: job.export_clip_id
          ? `${sourceTitle} · ${job.export_clip_id}`
          : `${sourceTitle} · ${job.cut_job_id}`,
        begin_ms: beginMs,
        end_ms: endMs,
        duration_ms: Math.max(0, endMs - beginMs),
        selected_text: job.selected_text ?? "",
        cut_mode: job.cut_mode ?? "smart",
        status: job.status,
        progress: progressForApiStatus(job.status),
        created_at: job.created_at ?? "",
        ...(job.error_message ? { error_message: job.error_message } : {})
      };
    });
}
