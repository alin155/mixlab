import { preprocessJobLogPath } from "../../library-fs/src/index.ts";
import type {
  LibraryCounts,
  PreprocessStatus,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import { numericSourceVideoId } from "./admin-source-video-query.ts";
import {
  adminPreprocessFailureSkipReason,
  classifyAdminPreprocessFailure,
  isAdminPreprocessFailureRetryable
} from "./admin-preprocess-failure-classification.ts";

export interface AdminPreprocessJobRecord {
  source_video_id: string;
  worker_id?: string;
  status: "processing" | "queued" | "index-required" | "ready" | "failed";
  attempt: number;
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  index_version?: string;
  failed_at?: string;
  current_stage?: string;
  stage_updated_at?: string;
  error_stage?: string;
  error_message?: string;
}

export type AdminPreprocessJobPublicStatus = "running" | "queued" | "done" | "failed";

export type AdminPreprocessJobsRuntimeLoadStatus = "healthy" | "attention" | "blocked";

export interface AdminPreprocessJobsRuntimeLoad {
  overall_status: AdminPreprocessJobsRuntimeLoadStatus;
  disk: { status: AdminPreprocessJobsRuntimeLoadStatus };
  network: { status: AdminPreprocessJobsRuntimeLoadStatus };
  cpu: { status: AdminPreprocessJobsRuntimeLoadStatus };
  memory: { status: AdminPreprocessJobsRuntimeLoadStatus };
}

export interface AdminPreprocessJobsResponse {
  active_count: number;
  queued_count: number;
  completed_count: number;
  failed_count: number;
  jobs: Array<{
    job_id: string;
    source_video_id: string;
    title: string;
    status: AdminPreprocessJobPublicStatus;
    status_label: string;
    stage: string;
    stage_label: string;
    progress: number;
    started_at?: string;
    completed_at?: string;
    failed_at?: string;
    elapsed_ms: number;
    estimated_remaining_ms: number;
    estimated_start_at: string;
    estimated_done_at: string;
    queue_position: number;
    log_path: string;
    log_url: string;
    retryable: boolean;
    failure_kind: string;
    failure_label: string;
    recommended_action: string;
    duration_ms: number;
    long_task_recommended: boolean;
    error_message?: string;
  }>;
  observability: {
    running_job_id: string;
    running_source_video_id: string;
    pipeline_progress_percent: number;
    estimated_all_done_at: string;
    estimated_queue_duration_ms: number;
    throughput_label: string;
    load_advice: string;
  };
}

export interface ListAdminPreprocessJobsInput {
  now: string;
  concurrency: number;
  manifests: SourceVideoManifest[];
  library_counts?: LibraryCounts | null;
  read_preprocess_job(source_video_id: string): Promise<AdminPreprocessJobRecord | null>;
  read_runtime_load(): Promise<AdminPreprocessJobsRuntimeLoad>;
}

const STATUS_ORDER: PreprocessStatus[] = [
  "processing",
  "queued",
  "failed",
  "index-required",
  "ready",
  "unprocessed"
];

function mergeSourceVideoManifestsById(manifests: SourceVideoManifest[]): SourceVideoManifest[] {
  const byId = new Map<string, SourceVideoManifest>();

  for (const manifest of manifests) {
    byId.set(manifest.source_video_id, manifest);
  }

  return Array.from(byId.values());
}

function jobStatusFromManifest(status: PreprocessStatus): AdminPreprocessJobPublicStatus {
  if (status === "processing") {
    return "running";
  }
  if (status === "queued" || status === "unprocessed") {
    return "queued";
  }
  if (status === "failed") {
    return "failed";
  }

  return "done";
}

function preprocessJobStatusLabel(status: AdminPreprocessJobPublicStatus): string {
  const labels = {
    running: "正在处理",
    queued: "等待处理",
    done: "已完成",
    failed: "可重新处理"
  } satisfies Record<AdminPreprocessJobPublicStatus, string>;

  return labels[status];
}

function failedPreprocessJobStatusLabel(job: AdminPreprocessJobRecord | null): string {
  if (classifyAdminPreprocessFailure(job?.error_message) === "asr-timeout") {
    return "长任务语音识别待处理";
  }

  return isAdminPreprocessFailureRetryable(job?.error_message)
    ? "可重新处理"
    : "异常素材";
}

function preprocessFailureLabel(job: AdminPreprocessJobRecord | null): string {
  const kind = classifyAdminPreprocessFailure(job?.error_message);
  const labels: Record<string, string> = {
    "asr-timeout": "语音识别等待超时",
    "missing-source": "源文件缺失",
    "invalid-media": "源文件损坏或格式不可读",
    "no-video-stream": "没有可处理的视频流",
    "no-speech": "语音识别无有效文案",
    unknown: "失败原因待确认"
  };

  return labels[kind] ?? labels.unknown;
}

const LONG_ASR_DURATION_THRESHOLD_MS = 3 * 60 * 60 * 1000;

function isLongTaskRecommended(input: {
  manifest: SourceVideoManifest;
  status: AdminPreprocessJobPublicStatus;
  failureKind: string;
  job: AdminPreprocessJobRecord | null;
}): boolean {
  if (input.failureKind === "asr-timeout") {
    return true;
  }

  if (
    input.status === "queued" &&
    input.manifest.duration_ms <= 0 &&
    (input.job?.attempt ?? 0) >= 3
  ) {
    return true;
  }

  return input.status === "queued" && input.manifest.duration_ms >= LONG_ASR_DURATION_THRESHOLD_MS;
}

function recommendedAction(input: {
  status: AdminPreprocessJobPublicStatus;
  retryable: boolean;
  longTaskRecommended: boolean;
}): string {
  if (input.longTaskRecommended) {
    return "long-asr";
  }

  if (input.status === "failed" && !input.retryable) {
    return "inspect-source";
  }

  if (input.status === "failed" && input.retryable) {
    return "retry";
  }

  return "none";
}

function preprocessStageLabel(stage: string, status?: AdminPreprocessJobPublicStatus): string {
  if (status === "queued") {
    return "等待处理";
  }

  const labels: Record<string, string> = {
    unprocessed: "未处理",
    queued: "等待处理",
    "queued-by-admin": "等待处理",
    "queued-by-pipeline": "等待处理",
    "probe-media": "媒体探测",
    processing: "正在处理",
    "extract-audio": "提取音频",
    "upload-audio": "上传音频",
    asr: "语音识别",
    "write-transcript": "写入文案",
    "text-preprocess": "文案预处理",
    "build-keyframes": "生成关键帧",
    "build-index": "自动发布索引",
    "publish-ready": "发布可用产物",
    ready: "已完成",
    failed: "处理失败"
  };

  return labels[stage] ?? "正在处理";
}

function stageProgress(stage: string, status: AdminPreprocessJobPublicStatus): number {
  if (status === "done") {
    return 100;
  }
  if (status === "failed" || status === "queued") {
    return 0;
  }

  const progressByStage: Record<string, number> = {
    processing: 15,
    "probe-media": 18,
    "extract-audio": 20,
    "upload-audio": 35,
    asr: 50,
    "write-transcript": 70,
    "text-preprocess": 65,
    "build-keyframes": 80,
    "build-index": 90,
    "publish-ready": 95
  };

  return progressByStage[stage] ?? 25;
}

function timestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoAt(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toISOString();
}

function durationBetweenMs(start: string | undefined, end: string | undefined): number {
  const startMs = timestampMs(start);
  const endMs = timestampMs(end);

  if (startMs === null || endMs === null || endMs < startMs) {
    return 0;
  }

  return endMs - startMs;
}

function averageCompletedProcessMs(jobs: Array<AdminPreprocessJobRecord | null>, fallbackMs: number): number {
  const durations = jobs
    .map((job) => durationBetweenMs(job?.claimed_at, job?.completed_at ?? job?.indexed_at))
    .filter((duration) => duration > 0);

  if (durations.length === 0) {
    return fallbackMs;
  }

  return Math.round(durations.reduce((total, value) => total + value, 0) / durations.length);
}

function formatBackendDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function loadAdvice(load: AdminPreprocessJobsRuntimeLoad): string {
  if (load.disk.status === "blocked") {
    return "磁盘空间不足，建议暂停流水线并清理空间。";
  }
  if (load.network.status === "blocked") {
    return "网络不可用，建议暂停流水线并检查语音识别网络。";
  }
  if (load.cpu.status === "blocked" || load.memory.status === "blocked") {
    return "运行负荷过高，建议暂停流水线或降低并发任务数。";
  }
  if (load.overall_status === "attention") {
    return "运行负荷偏高，建议继续观察，必要时降低并发任务数。";
  }

  return "运行负荷正常，可以继续处理";
}

export function adminPreprocessJobStageFromManifest(
  manifest: SourceVideoManifest,
  job: AdminPreprocessJobRecord | null
): string {
  if (manifest.preprocess_status === "processing" && job?.current_stage) {
    return job.current_stage;
  }

  if (job?.error_stage) {
    return job.error_stage;
  }

  if (manifest.preprocess_status === "index-required") {
    return "build-index";
  }

  if (manifest.preprocess_status === "ready") {
    return "publish-ready";
  }

  if (manifest.preprocess_status === "queued") {
    return "extract-audio";
  }

  return manifest.preprocess_status;
}

export function shouldReadAdminPreprocessJobRecordForList(manifest: SourceVideoManifest): boolean {
  return manifest.preprocess_status === "processing" ||
    (manifest.preprocess_status === "queued" && manifest.duration_ms <= 0) ||
    manifest.preprocess_status === "failed" ||
    manifest.preprocess_status === "ready";
}

export async function listAdminPreprocessJobs(
  input: ListAdminPreprocessJobsInput
): Promise<AdminPreprocessJobsResponse> {
  const nowMs = Date.parse(input.now);
  const concurrency = Math.max(1, input.concurrency);
  const manifests = mergeSourceVideoManifestsById(input.manifests);
  const jobRecords = await Promise.all(
    manifests.map((manifest) => shouldReadAdminPreprocessJobRecordForList(manifest)
      ? input.read_preprocess_job(manifest.source_video_id)
      : Promise.resolve(null))
  );
  const averageProcessMs = averageCompletedProcessMs(
    jobRecords,
    manifests.length > 0
      ? Math.max(60_000, Math.round(
        manifests.reduce((total, manifest) => total + manifest.duration_ms, 0) / manifests.length
      ))
      : 0
  );
  const jobs: AdminPreprocessJobsResponse["jobs"] = [];

  for (const [index, manifest] of manifests.entries()) {
    if (manifest.preprocess_status === "unprocessed") {
      continue;
    }

    const job = jobRecords[index] ?? null;
    const status = jobStatusFromManifest(manifest.preprocess_status);
    const stage = adminPreprocessJobStageFromManifest(manifest, job);
    const failureKind = status === "failed" ? classifyAdminPreprocessFailure(job?.error_message) : "";
    const retryable = status === "failed" && isAdminPreprocessFailureRetryable(job?.error_message);
    const longTaskRecommended = isLongTaskRecommended({
      manifest,
      status,
      failureKind,
      job
    });
    const completedAt = job?.completed_at ?? job?.indexed_at;
    const failedAt = job?.failed_at;
    const elapsedMs = status === "running"
      ? Math.max(0, nowMs - (timestampMs(job?.claimed_at) ?? nowMs))
      : status === "done"
        ? durationBetweenMs(job?.claimed_at, completedAt)
        : status === "failed"
          ? durationBetweenMs(job?.claimed_at, failedAt)
          : 0;
    const elapsedProgress = averageProcessMs > 0
      ? Math.min(95, Math.max(5, Math.round((elapsedMs / averageProcessMs) * 100)))
      : 0;

    jobs.push({
      job_id: `J${manifest.source_video_id.slice(1)}`,
      source_video_id: manifest.source_video_id,
      title: manifest.title,
      status,
      status_label: longTaskRecommended ? "长任务语音识别待处理" : status === "failed"
        ? failedPreprocessJobStatusLabel(job)
        : preprocessJobStatusLabel(status),
      stage,
      stage_label: preprocessStageLabel(stage, status),
      progress: status === "running"
        ? Math.max(stageProgress(stage, status), elapsedProgress)
        : stageProgress(stage, status),
      started_at: job?.claimed_at,
      completed_at: completedAt,
      failed_at: failedAt,
      elapsed_ms: elapsedMs,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "",
      queue_position: 0,
      log_path: preprocessJobLogPath(manifest.source_video_id),
      log_url: `/api/admin/preprocess/jobs/J${manifest.source_video_id.slice(1)}/log`,
      retryable,
      failure_kind: failureKind,
      failure_label: status === "failed" ? preprocessFailureLabel(job) : "",
      recommended_action: recommendedAction({
        status,
        retryable,
        longTaskRecommended
      }),
      duration_ms: manifest.duration_ms,
      long_task_recommended: longTaskRecommended,
      error_message: job?.error_message ?? (status === "failed" && !retryable
        ? adminPreprocessFailureSkipReason(job?.error_message)
        : undefined)
    });
  }

  const ordered = jobs.sort((left, right) => {
    const statusToPreprocess = (status: AdminPreprocessJobPublicStatus): PreprocessStatus =>
      status === "running" ? "processing" : status === "done" ? "ready" : status;
    const leftStatus = STATUS_ORDER.indexOf(statusToPreprocess(left.status));
    const rightStatus = STATUS_ORDER.indexOf(statusToPreprocess(right.status));

    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }

    if (left.status === "queued" && right.status === "queued") {
      return numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id);
    }

    return numericSourceVideoId(right.source_video_id) - numericSourceVideoId(left.source_video_id);
  });
  const runningJobs = ordered.filter((job) => job.status === "running");
  const queuedJobs = ordered.filter((job) => job.status === "queued");
  const firstRunningRemaining = runningJobs.length > 0 && averageProcessMs > 0
    ? Math.max(0, averageProcessMs - runningJobs[0]!.elapsed_ms)
    : 0;
  const queueCursorMs = nowMs + firstRunningRemaining;

  for (const [index, job] of queuedJobs.entries()) {
    const batchIndex = Math.floor(index / concurrency);
    const startMs = queueCursorMs + batchIndex * averageProcessMs;
    const doneMs = startMs + averageProcessMs;
    job.queue_position = index + 1;
    job.estimated_start_at = isoAt(startMs);
    job.estimated_done_at = isoAt(doneMs);
    job.estimated_remaining_ms = Math.max(0, doneMs - nowMs);
    job.stage_label = "等待处理";
  }

  for (const job of runningJobs) {
    job.estimated_remaining_ms = averageProcessMs > 0
      ? Math.max(0, averageProcessMs - job.elapsed_ms)
      : 0;
    job.estimated_start_at = job.started_at ?? "";
    job.estimated_done_at = job.estimated_remaining_ms > 0
      ? isoAt(nowMs + job.estimated_remaining_ms)
      : "";
  }

  const doneCount = ordered.filter((job) => job.status === "done").length;
  const failedCount = ordered.filter((job) => job.status === "failed").length;
  const totalObservableCount = Math.max(1, ordered.length);
  const runningProgress = runningJobs.reduce((total, job) => total + job.progress / 100, 0);
  const pipelineProgressPercent = Math.round(((doneCount + runningProgress) / totalObservableCount) * 100);
  const estimatedQueueDurationMs = firstRunningRemaining + Math.ceil(queuedJobs.length / concurrency) * averageProcessMs;
  const estimatedAllDoneAt = estimatedQueueDurationMs > 0 ? isoAt(nowMs + estimatedQueueDurationMs) : "";
  const runtimeLoad = await input.read_runtime_load();
  const queuedCount = input.library_counts?.queued_video_count ?? queuedJobs.length;
  const activeCount = input.library_counts?.processing_video_count ?? runningJobs.length;
  const failedTotalCount = input.library_counts?.failed_video_count ?? failedCount;
  const throughputLabel = estimatedQueueDurationMs > 0
    ? `预计 ${formatBackendDuration(estimatedQueueDurationMs)} 完成当前队列`
    : queuedCount > 0
      ? `${queuedCount} 个视频正在等待处理`
      : activeCount > 0
        ? `${activeCount} 个视频正在处理中`
        : "当前没有等待处理的队列";

  return {
    active_count: activeCount,
    queued_count: queuedCount,
    completed_count: doneCount,
    failed_count: failedTotalCount,
    jobs: ordered,
    observability: {
      running_job_id: runningJobs[0]?.job_id ?? "",
      running_source_video_id: runningJobs[0]?.source_video_id ?? "",
      pipeline_progress_percent: pipelineProgressPercent,
      estimated_all_done_at: estimatedAllDoneAt,
      estimated_queue_duration_ms: estimatedQueueDurationMs,
      throughput_label: throughputLabel,
      load_advice: loadAdvice(runtimeLoad)
    }
  };
}
