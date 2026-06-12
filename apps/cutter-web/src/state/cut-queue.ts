import type { CutJob, CutJobCatalog, CutJobPhaseId, CutJobPhaseTiming } from "../api.ts";
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
  current_phase?: CutJobPhaseId;
  phase_timings?: CutJobPhaseTiming[];
  progress: number;
  created_at: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  output_file?: string;
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
export const CUT_QUEUE_PHASES: Array<{ phase_id: CutJobPhaseId; label: string }> = [
  { phase_id: "queue_wait", label: "排队等待" },
  { phase_id: "resolve_source", label: "读取源素材" },
  { phase_id: "cut_media", label: "剪切/重编码" },
  { phase_id: "write_project_output", label: "写入交付目录" },
  { phase_id: "preprocess_local_asset", label: "本地素材预处理" },
  { phase_id: "generate_cover", label: "生成封面" },
  { phase_id: "write_manifest", label: "写入清单" }
];

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

function safeTimestampMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function initialCutQueuePhaseTimings(createdAt: string): CutJobPhaseTiming[] {
  return CUT_QUEUE_PHASES.map((phase, index) => ({
    ...phase,
    status: index === 0 ? "running" : "pending",
    ...(index === 0 ? { started_at: createdAt } : {})
  }));
}

export function cutQueuePhaseTimeline(job: CutQueueJob): CutJobPhaseTiming[] {
  if (job.phase_timings?.length) {
    return job.phase_timings;
  }

  if (job.status === "done") {
    return CUT_QUEUE_PHASES.map((phase) => ({
      ...phase,
      status: "done"
    }));
  }

  if (job.status === "failed") {
    return CUT_QUEUE_PHASES.map((phase, index) => ({
      ...phase,
      status: index === 0 ? "failed" : "pending"
    }));
  }

  if (job.status === "running") {
    return CUT_QUEUE_PHASES.map((phase) => ({
      ...phase,
      status: phase.phase_id === "cut_media" ? "running" : phase.phase_id === "queue_wait" ? "done" : "pending",
      ...(phase.phase_id === "cut_media" ? { started_at: job.started_at ?? job.updated_at ?? job.created_at } : {})
    }));
  }

  return initialCutQueuePhaseTimings(job.created_at);
}

export function cutQueuePhaseStatusLabel(status: CutJobPhaseTiming["status"]): string {
  switch (status) {
    case "running":
      return "进行中";
    case "done":
      return "完成";
    case "failed":
      return "失败";
    case "pending":
      return "等待";
  }
}

export function cutQueueCurrentPhaseLabel(job: CutQueueJob): string {
  if (job.status === "done") {
    return "已完成";
  }

  if (job.status === "pending") {
    return "排队等待";
  }

  const currentPhaseId = job.current_phase;
  const currentPhase = cutQueuePhaseTimeline(job).find((phase) => phase.phase_id === currentPhaseId);
  return currentPhase?.label ?? (job.status === "failed" ? "失败" : "剪切中");
}

export function cutQueuePhaseElapsedMs(phase: CutJobPhaseTiming, nowMs: number): number {
  const startedAt = safeTimestampMs(phase.started_at);
  if (startedAt === undefined) {
    return 0;
  }

  const finishedAt = safeTimestampMs(phase.finished_at) ?? nowMs;
  return Math.max(0, finishedAt - startedAt);
}

export function cutQueueJobElapsedMs(job: CutQueueJob, nowMs: number): number {
  const startedAt = safeTimestampMs(job.started_at) ?? safeTimestampMs(job.created_at);
  if (startedAt === undefined) {
    return 0;
  }

  const finishedAt = safeTimestampMs(job.finished_at) ?? nowMs;
  return Math.max(0, finishedAt - startedAt);
}

export function formatCutQueueElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
      const beginMs = Math.max(0, item.begin_ms - (item.pre_roll_ms ?? 0));
      const endMs = item.end_ms + (item.post_roll_ms ?? 0);

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
        begin_ms: beginMs,
        end_ms: endMs,
        duration_ms: endMs - beginMs,
        selected_text: item.selected_text,
        cut_mode: item.cut_mode,
        status: "pending" as const,
        current_phase: "queue_wait" as const,
        phase_timings: initialCutQueuePhaseTimings(createdAt),
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

function progressForApiJob(job: CutJob): number {
  if (job.status === "done") {
    return 100;
  }

  if (job.phase_timings?.length) {
    const done = job.phase_timings.filter((phase) => phase.status === "done").length;
    const running = job.phase_timings.some((phase) => phase.status === "running") ? 0.5 : 0;
    return Math.round(((done + running) / CUT_QUEUE_PHASES.length) * 100);
  }

  if (job.status === "running") {
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
  if (job.project_id) {
    return job.project_id;
  }

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
        cut_mode: job.cut_mode ?? "copy",
        status: job.status,
        current_phase: job.current_phase,
        phase_timings: job.phase_timings,
        progress: progressForApiJob(job),
        created_at: job.created_at ?? "",
        updated_at: job.updated_at,
        started_at: job.started_at,
        finished_at: job.finished_at,
        ...(job.error_message ? { error_message: job.error_message } : {}),
        ...(job.output_file ? { output_file: job.output_file } : {})
      };
    });
}
