import type { CutQueueJob } from "./cut-queue.ts";

export type CutQueueBatchAction = "retry" | "pause" | "delete";

/**
 * Outcome of one batch action. `processed_job_ids` is what the page removes
 * from the current selection; `skipped` counts selected jobs whose status does
 * not allow the action (e.g. done jobs for batch retry).
 */
export interface CutQueueBatchResult {
  action: CutQueueBatchAction;
  requested: number;
  processed: number;
  skipped: number;
  failed: number;
  /** Delete only: active jobs that were cancelled before being hidden. */
  cancelled: number;
  processed_job_ids: string[];
  message: string;
}

export const CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY = "mixlab.cutter.hiddenCutJobs";

const MAX_HIDDEN_CUT_JOB_IDS = 500;
const RETRYABLE_STATUSES: ReadonlySet<CutQueueJob["status"]> = new Set(["failed", "cancelled"]);
const PAUSABLE_STATUSES: ReadonlySet<CutQueueJob["status"]> = new Set(["pending", "running"]);
const TERMINAL_STATUSES: ReadonlySet<CutQueueJob["status"]> = new Set([
  "done",
  "failed",
  "cancelled"
]);

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function normalizedJobIds(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of ids) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function normalizedHiddenJobIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizedJobIds(value.filter((entry): entry is string => typeof entry === "string"))
    .slice(-MAX_HIDDEN_CUT_JOB_IDS);
}

/** Hidden queue jobs are device-local UI state: refresh/restart must not resurrect them. */
export function readHiddenCutJobIds(
  storage: Storage | null = browserStorage()
): string[] {
  if (!storage) {
    return [];
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!raw) {
    return [];
  }

  try {
    return normalizedHiddenJobIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Persist and return the normalized list so React state and storage stay identical. */
export function writeHiddenCutJobIds(
  ids: Iterable<string>,
  storage: Storage | null = browserStorage()
): string[] {
  const normalized = normalizedHiddenJobIds(Array.from(ids));

  if (storage) {
    try {
      storage.setItem(CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage is best-effort; the in-memory list still hides the jobs.
    }
  }

  return normalized;
}

export function addHiddenCutJobIds(
  current: readonly string[],
  added: Iterable<string>
): string[] {
  return normalizedHiddenJobIds([...current, ...Array.from(added)]);
}

export function hiddenCutJobIdSet(ids: Iterable<string>): ReadonlySet<string> {
  return new Set(normalizedJobIds(ids));
}

export function filterHiddenCutJobs<T extends { queue_job_id: string }>(
  jobs: readonly T[],
  hidden: ReadonlySet<string>
): T[] {
  if (hidden.size === 0) {
    return [...jobs];
  }

  return jobs.filter((job) => !hidden.has(job.queue_job_id));
}

export function countHiddenCutJobs(
  jobs: readonly Pick<CutQueueJob, "queue_job_id">[],
  hidden: ReadonlySet<string>
): number {
  return jobs.filter((job) => hidden.has(job.queue_job_id)).length;
}

export function toggleCutQueueJobSelection(
  selected: ReadonlySet<string>,
  queueJobId: string
): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(queueJobId)) {
    next.delete(queueJobId);
  } else {
    next.add(queueJobId);
  }

  return next;
}

export function setCutQueueJobsSelected(
  selected: ReadonlySet<string>,
  queueJobIds: Iterable<string>,
  isSelected: boolean
): ReadonlySet<string> {
  const next = new Set(selected);
  for (const queueJobId of queueJobIds) {
    if (isSelected) {
      next.add(queueJobId);
    } else {
      next.delete(queueJobId);
    }
  }

  return next;
}

/** Drop selected ids that no longer exist after a refresh, filter or batch action. */
export function pruneCutQueueSelection(
  selected: ReadonlySet<string>,
  jobs: readonly Pick<CutQueueJob, "queue_job_id">[]
): ReadonlySet<string> {
  const existing = new Set(jobs.map((job) => job.queue_job_id));
  const next = new Set<string>();
  for (const queueJobId of selected) {
    if (existing.has(queueJobId)) {
      next.add(queueJobId);
    }
  }

  return next;
}

export function removeCutQueueJobsFromSelection(
  selected: ReadonlySet<string>,
  queueJobIds: Iterable<string>
): ReadonlySet<string> {
  const next = new Set(selected);
  for (const queueJobId of queueJobIds) {
    next.delete(queueJobId);
  }

  return next;
}

/** Batch retry must only touch failed (or paused/cancelled) jobs, never done jobs. */
export function batchRetryCutJobIds(
  jobs: readonly CutQueueJob[],
  selected: ReadonlySet<string>
): string[] {
  return jobs
    .filter((job) => selected.has(job.queue_job_id) && RETRYABLE_STATUSES.has(job.status))
    .map((job) => job.queue_job_id);
}

/** Batch pause only stops jobs that are still queued or running. */
export function batchPauseCutJobIds(
  jobs: readonly CutQueueJob[],
  selected: ReadonlySet<string>
): string[] {
  return jobs
    .filter((job) => selected.has(job.queue_job_id) && PAUSABLE_STATUSES.has(job.status))
    .map((job) => job.queue_job_id);
}

export interface CutQueueDeletePlan {
  /** Jobs already finished: hide them immediately. */
  terminal_job_ids: string[];
  /** Jobs still pending/running: cancel them, then hide them. */
  active_job_ids: string[];
  total: number;
}

/** Batch delete never touches unselected jobs and cancels active ones first. */
export function planBatchDeleteCutJobs(
  jobs: readonly CutQueueJob[],
  selected: ReadonlySet<string>
): CutQueueDeletePlan {
  const terminalJobIds: string[] = [];
  const activeJobIds: string[] = [];

  for (const job of jobs) {
    if (!selected.has(job.queue_job_id)) {
      continue;
    }

    if (TERMINAL_STATUSES.has(job.status)) {
      terminalJobIds.push(job.queue_job_id);
    } else {
      activeJobIds.push(job.queue_job_id);
    }
  }

  return {
    terminal_job_ids: terminalJobIds,
    active_job_ids: activeJobIds,
    total: terminalJobIds.length + activeJobIds.length
  };
}

export function cutQueueBatchActionLabel(action: CutQueueBatchAction): string {
  switch (action) {
    case "retry":
      return "批量重试";
    case "pause":
      return "批量暂停";
    case "delete":
      return "批量删除";
  }
}

export function cutQueueBatchSummaryMessage(
  action: CutQueueBatchAction,
  result: Pick<CutQueueBatchResult, "processed" | "skipped" | "failed" | "cancelled">
): string {
  const details: string[] = [];

  if (result.skipped > 0) {
    details.push(action === "retry"
      ? `跳过 ${result.skipped} 个非失败任务`
      : `跳过 ${result.skipped} 个任务`);
  }
  if (result.cancelled > 0) {
    details.push(`${result.cancelled} 个进行中任务已取消`);
  }
  if (result.failed > 0) {
    details.push(`${result.failed} 个处理失败`);
  }
  const suffix = details.length > 0 ? `（${details.join("，")}）` : "";

  if (result.processed === 0) {
    if (result.failed > 0) {
      return `${cutQueueBatchActionLabel(action)}失败${suffix}`;
    }

    return `${cutQueueBatchActionLabel(action)}未执行：没有符合条件的任务${suffix}`;
  }

  switch (action) {
    case "retry":
      return `${cutQueueBatchActionLabel(action)}完成：已重新加入 ${result.processed} 个任务${suffix}`;
    case "pause":
      return `${cutQueueBatchActionLabel(action)}完成：已停止 ${result.processed} 个任务的执行，可在队列中重新剪切${suffix}`;
    case "delete":
      return `${cutQueueBatchActionLabel(action)}完成：已从列表移除 ${result.processed} 个任务${suffix}`;
  }
}

export interface RunCutQueueBatchInput {
  jobs: readonly CutQueueJob[];
  selected_job_ids: Iterable<string>;
}

function emptyBatchResult(action: CutQueueBatchAction, requested: number): CutQueueBatchResult {
  return {
    action,
    requested,
    processed: 0,
    skipped: Math.max(0, requested),
    failed: 0,
    cancelled: 0,
    processed_job_ids: [],
    message: ""
  };
}

function withSummary(result: CutQueueBatchResult): CutQueueBatchResult {
  return {
    ...result,
    message: cutQueueBatchSummaryMessage(result.action, result)
  };
}

/** Retry every selected failed/paused job and report processed/skipped/failed counts. */
export async function executeCutQueueBatchRetry(
  input: RunCutQueueBatchInput & { retryJob: (cutJobId: string) => Promise<unknown> }
): Promise<CutQueueBatchResult> {
  const selected = new Set(normalizedJobIds(input.selected_job_ids));
  const targets = batchRetryCutJobIds(input.jobs, selected);
  const result = emptyBatchResult("retry", selected.size);
  result.skipped = Math.max(0, selected.size - targets.length);

  for (const cutJobId of targets) {
    try {
      await input.retryJob(cutJobId);
      result.processed_job_ids.push(cutJobId);
    } catch {
      result.failed += 1;
    }
  }

  result.processed = result.processed_job_ids.length;
  return withSummary(result);
}

/** Pause every selected pending/running job through the existing cancel contract. */
export async function executeCutQueueBatchPause(
  input: RunCutQueueBatchInput & { pauseJob: (cutJobId: string) => Promise<unknown> }
): Promise<CutQueueBatchResult> {
  const selected = new Set(normalizedJobIds(input.selected_job_ids));
  const targets = batchPauseCutJobIds(input.jobs, selected);
  const result = emptyBatchResult("pause", selected.size);
  result.skipped = Math.max(0, selected.size - targets.length);

  for (const cutJobId of targets) {
    try {
      await input.pauseJob(cutJobId);
      result.processed_job_ids.push(cutJobId);
    } catch {
      result.failed += 1;
    }
  }

  result.processed = result.processed_job_ids.length;
  return withSummary(result);
}

/**
 * Delete selected jobs from the queue view. Finished jobs are hidden right
 * away; pending/running jobs are cancelled first so the engine stops working
 * on a row the user can no longer see.
 */
export async function executeCutQueueBatchDelete(
  input: RunCutQueueBatchInput & {
    cancelJob: (cutJobId: string) => Promise<unknown>;
    hideJob: (cutJobId: string) => void;
  }
): Promise<CutQueueBatchResult> {
  const selected = new Set(normalizedJobIds(input.selected_job_ids));
  const plan = planBatchDeleteCutJobs(input.jobs, selected);
  const result = emptyBatchResult("delete", selected.size);
  result.skipped = Math.max(0, selected.size - plan.total);

  for (const cutJobId of plan.terminal_job_ids) {
    input.hideJob(cutJobId);
    result.processed_job_ids.push(cutJobId);
  }

  for (const cutJobId of plan.active_job_ids) {
    try {
      await input.cancelJob(cutJobId);
      input.hideJob(cutJobId);
      result.processed_job_ids.push(cutJobId);
      result.cancelled += 1;
    } catch {
      result.failed += 1;
    }
  }

  result.processed = result.processed_job_ids.length;
  return withSummary(result);
}
