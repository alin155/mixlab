import type { CutJob, CutJobCatalog } from "../api.ts";
import type { CutListItem, CutMode } from "./cut-list.ts";
import {
  normalizedMaterialTitlePart,
  sourceMaterialTitleFromStableName
} from "./material-naming.ts";

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
  projectTitle?: string;
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

function cutSequenceLabel(value: number | undefined, fallback: number): string {
  const numeric = typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
  return String(numeric);
}

function cutSequenceFromIdentifier(value: string | undefined, fallback: number): number {
  const match = /(\d+)(?!.*\d)/.exec(value ?? "");
  if (!match) {
    return fallback;
  }

  const parsed = Number.parseInt(match[1]!, 10);
  return parsed > 0 ? parsed : fallback;
}

export function cutQueueJobTitle(input: {
  sequence?: number;
  projectTitle?: string;
  sourceTitle?: string;
}): string {
  return [
    cutSequenceLabel(input.sequence, 1),
    normalizedMaterialTitlePart(input.projectTitle, "未归属项目"),
    sourceMaterialTitleFromStableName(input.sourceTitle)
  ].join("-");
}

export function createQueueJobsFromCutList(
  items: readonly CutListItem[],
  input: CreateQueueJobsInput = {}
): CutQueueJob[] {
  const createdAt = input.createdAt ?? new Date().toISOString();

  return [...items]
    .sort((left, right) => left.order - right.order)
    .map((item) => {
      const sourceTitle = sourceMaterialTitleFromStableName(item.source_title);

      return {
        queue_job_id: `job-${item.cut_list_item_id}`,
        cut_list_item_id: item.cut_list_item_id,
        ...(input.projectId ? { project_id: input.projectId } : {}),
        source_video_id: item.source_video_id,
        source_title: sourceTitle,
        title: cutQueueJobTitle({
          sequence: item.order,
          projectTitle: input.projectTitle,
          sourceTitle
        }),
        begin_ms: item.begin_ms,
        end_ms: item.end_ms,
        duration_ms: item.duration_ms,
        selected_text: item.selected_text,
        cut_mode: item.cut_mode,
        status: "pending" as const,
        progress: 0,
        created_at: createdAt
      };
    });
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

export function removeCutJobsForProject(
  index: CutJobProjectIndex,
  projectId: string
): CutJobProjectIndex {
  return {
    jobs: Object.fromEntries(
      Object.entries(index.jobs).filter((entry) => entry[1] !== projectId)
    ),
    clipLists: Object.fromEntries(
      Object.entries(index.clipLists).filter((entry) => entry[1] !== projectId)
    )
  };
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

export function replaceQueueJobWithSubmittedJobs(
  jobs: readonly CutQueueJob[],
  optimisticQueueJobId: string,
  submittedJobs: readonly CutQueueJob[]
): CutQueueJob[] {
  const replacementJobs = [...submittedJobs];

  return jobs.flatMap((job) =>
    job.queue_job_id === optimisticQueueJobId ? replacementJobs : [job]
  );
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
  projectId?: string;
  projectIndex?: CutJobProjectIndex;
  projectTitle?: string;
  projectTitlesById?: Record<string, string>;
}

function projectIdForApiCutJob(job: CutJob, input: MapApiCutJobsInput): string | undefined {
  if (input.projectId) {
    return input.projectId;
  }

  if (!input.projectIndex) {
    return undefined;
  }

  return input.projectIndex.jobs[job.cut_job_id] ?? input.projectIndex.clipLists[job.clip_list_id];
}

function projectTitleForApiCutJob(projectId: string | undefined, input: MapApiCutJobsInput): string | undefined {
  if (projectId && input.projectTitlesById?.[projectId]) {
    return input.projectTitlesById[projectId];
  }

  return input.projectTitle;
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
    .map((job, index) => {
      const beginMs = job.begin_ms ?? 0;
      const endMs = job.end_ms ?? beginMs;
      const sourceTitle = sourceMaterialTitleFromStableName(job.source_title);
      const projectId = projectIdForApiCutJob(job, input);

      return {
        queue_job_id: job.cut_job_id,
        clip_list_id: job.clip_list_id,
        cut_list_item_id: job.clip_list_item_id ?? job.cut_job_id,
        ...(projectId ? { project_id: projectId } : {}),
        source_video_id: job.source_video_id ?? "",
        source_title: sourceTitle,
        title: job.title ?? cutQueueJobTitle({
          sequence: job.project_clip_order ?? cutSequenceFromIdentifier(job.clip_list_item_id ?? job.cut_job_id, index + 1),
          projectTitle: job.project_title ?? projectTitleForApiCutJob(projectId, input),
          sourceTitle
        }),
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
