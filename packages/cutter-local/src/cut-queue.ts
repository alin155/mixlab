import { createReadStream } from "node:fs";
import { copyFile, link, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  validateSourceVideoManifest,
  type CutMode,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import {
  decideCopyCutMode,
  resolveFfmpegTimeoutMs
} from "../../ffmpeg-core/src/index.ts";
import {
  allocateNextExportClipId,
  buildCanonicalClipTitle,
  buildExportClipArtifactPaths,
  buildProjectClipOutputFile,
  sourceTitleForCanonicalClipName,
  writeExportClipManifest
} from "./export-manifest.ts";
import type { ClipListManifest, ClipListItem } from "./cut-list.ts";

export type CutJobStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type CutJobPhaseId =
  | "queue_wait"
  | "resolve_source"
  | "preflight_source"
  | "cut_media"
  | "write_project_output"
  | "preprocess_local_asset"
  | "generate_cover"
  | "write_manifest";
export type CutJobPhaseStatus = "pending" | "running" | "done" | "failed";

export interface CutJobPhaseTiming {
  phase_id: CutJobPhaseId;
  label: string;
  status: CutJobPhaseStatus;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
}

export type CutJobErrorCode =
  | "CUT_OUTPUT_MISMATCH"
  | "CUT_RANGE_OUT_OF_SOURCE"
  | "CUT_SOURCE_UNPROBEABLE"
  | "CUT_TIMEOUT"
  | "CUT_PROCESS_INTERRUPTED"
  | "CUT_CANCELLED";

export interface CutOutputVerificationCheck {
  check: string;
  passed: boolean;
  detail: string;
}

/** done 前对成片做的输出验收记录（写入任务 JSON，可选字段，旧客户端可忽略）。 */
export interface CutOutputVerification {
  passed: boolean;
  expected_duration_ms: number;
  actual_duration_ms?: number;
  tolerance_ms: number;
  checks: CutOutputVerificationCheck[];
}

export interface CutOutputProbeResult {
  exists: boolean;
  size_bytes: number;
  duration_ms?: number;
  has_video_stream: boolean;
  has_audio_stream: boolean;
  /** 源视频是否有音轨；用于区分"本来无音轨"与"音轨丢失"。 */
  source_has_audio_stream?: boolean;
  first_video_pts_ms?: number;
  video_duration_ms?: number;
  audio_duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
}

export type CutOutputProbe = (input: {
  output_path: string;
  source_path: string;
  cut_mode: CutMode;
}) => Promise<CutOutputProbeResult> | CutOutputProbeResult;

export type CutSourceDurationProbe = (input: {
  source_video_path: string;
}) => Promise<{ duration_ms?: number } | undefined> | { duration_ms?: number } | undefined;

export type CutKeyframeProbe = (input: {
  source_video_path: string;
  begin_ms: number;
}) => Promise<{ keyframe_times_ms?: number[] } | undefined> | { keyframe_times_ms?: number[] } | undefined;

export interface CutJobManifest {
  schema_version: "1.0";
  cut_job_id: string;
  clip_list_id: string;
  clip_list_item_id: string;
  library_id: string;
  project_id?: string;
  title?: string;
  project_title?: string;
  project_clip_order?: number;
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  status: CutJobStatus;
  current_phase?: CutJobPhaseId;
  phase_timings?: CutJobPhaseTiming[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  error_code?: CutJobErrorCode;
  /** 提交幂等键：client:<id> 或 clip_list:<clip_list_id>。 */
  submission_key?: string;
  /** 实际执行的剪切模式（copy 可能被自动降级为 precise）。 */
  cut_mode_used?: CutMode;
  degrade_reason?: string;
  verification?: CutOutputVerification;
  export_clip_id?: string;
  output_file?: string;
}

export interface SubmitClipListToQueueInput {
  workspace_root: string;
  clip_list: ClipListManifest;
  now: string;
  /** 客户端幂等键；未提供时以 clip_list_id 作为幂等键。 */
  client_request_id?: string;
  /** 跨进程提交锁等待上限（毫秒，测试用）；默认 2000。 */
  submission_lock_wait_ms?: number;
  /** 测试注入：每个任务提交后回调，用于验证批量失败回滚。 */
  on_job_written?: (job: CutJobManifest, index: number) => void | Promise<void>;
}

export interface CutJobSubmission {
  submitted_count: number;
  jobs: CutJobManifest[];
  /** 幂等重放：true 表示未创建新任务，返回的是该幂等键已有的任务。 */
  replayed: boolean;
  submission_key: string;
}

export interface ListCutJobsInput {
  workspace_root: string;
  limit?: number;
  offset?: number;
}

export interface CutJobCatalog {
  job_count: number;
  jobs: CutJobManifest[];
}

export interface GetCutJobInput {
  workspace_root: string;
  cut_job_id: string;
}

export interface RetryCutJobInput {
  workspace_root: string;
  cut_job_id: string;
  now: string;
}

export interface CancelCutJobInput {
  workspace_root: string;
  cut_job_id: string;
  now: string;
}

export interface CutJobSourceDetail {
  source_video_id: string;
  title: string;
  relative_path: string;
  source_video_file_path: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  file_size?: number;
  transcript_segments?: TranscriptSegment[];
}

export interface CutRunnerInput {
  source_video_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
  /** 队列超时/取消时中止；生产 runner 收到后应终止 FFmpeg 进程树。 */
  signal?: AbortSignal;
}

export type CutRunner = (input: CutRunnerInput) => Promise<void> | void;

export interface CoverRunnerInput {
  source_video_path: string;
  output_path: string;
  at_ms: number;
  width: number;
}

export type CoverRunner = (input: CoverRunnerInput) => Promise<void> | void;

export interface RunNextCutJobInput {
  workspace_root: string;
  library_root: string;
  now: () => string;
  resolve_source: (job: CutJobManifest) => Promise<CutJobSourceDetail | null> | CutJobSourceDetail | null;
  cut_runner: CutRunner;
  cover_runner?: CoverRunner;
  persist_phase_progress?: boolean;
  cut_temp_max_bytes?: number;
  /** 成片验收探针；未提供时跳过输出校验（仅供测试/兼容旧调用方）。 */
  output_probe?: CutOutputProbe;
  /** 源视频实测时长探针；E 源（重剪）必须提供。 */
  source_duration_probe?: CutSourceDurationProbe;
  /** copy 模式关键帧探针；提供时按关键帧距离决定是否降级 precise。 */
  keyframe_probe?: CutKeyframeProbe;
  /** 直接覆盖任务超时（毫秒，测试/特殊场景用）。 */
  cut_timeout_ms?: number;
  /** 任务超时上限（毫秒）；未提供时按区间估算并受默认上限约束。 */
  cut_timeout_ms_max?: number;
}

export interface RunCutJobInput extends RunNextCutJobInput {
  cut_job_id: string;
}

const CUT_JOB_PHASES: Array<{ phase_id: CutJobPhaseId; label: string }> = [
  { phase_id: "queue_wait", label: "排队等待" },
  { phase_id: "resolve_source", label: "准备源素材" },
  { phase_id: "preflight_source", label: "剪切前检查" },
  { phase_id: "cut_media", label: "剪切/重编码" },
  { phase_id: "write_project_output", label: "写入交付目录" },
  { phase_id: "preprocess_local_asset", label: "本地素材预处理" },
  { phase_id: "generate_cover", label: "生成封面" },
  { phase_id: "write_manifest", label: "写入清单" }
];

const CUT_JOB_ID_PATTERN = /^CJ\d{8}-\d{4}$/;
const CUT_JOB_CANCELLED_MESSAGE = "cut job cancelled";
const DEFAULT_CUT_TEMP_MAX_BYTES = 4 * 1024 * 1024 * 1024;

// 输出验收容差：precise 固定 ±200ms；copy 按关键帧误差放大后仍要求成片时长吻合。
export const PRECISE_OUTPUT_TOLERANCE_MS = 200;
export const COPY_OUTPUT_TOLERANCE_BASE_MS = 500;
export const COPY_OUTPUT_TOLERANCE_PADDING_MS = 250;
export const FIRST_FRAME_PTS_TOLERANCE_MS = 250;
export const AV_DURATION_DELTA_TOLERANCE_MS = 500;

const workspaceRunNextLocks = new Map<string, Promise<void>>();
const workspaceQueueMutationLocks = new Map<string, Promise<void>>();
const activeCutJobAbortControllers = new Map<string, Map<string, AbortController>>();
const cachePathPinCounts = new Map<string, number>();

function cachePinKey(filePath: string): string {
  return path.resolve(filePath);
}

/** 缓存淘汰保护：pin 正在 cut/stream 使用的文件路径，返回释放函数（引用计数）。 */
export function pinCachePath(filePath: string): () => void {
  const key = cachePinKey(filePath);
  cachePathPinCounts.set(key, (cachePathPinCounts.get(key) ?? 0) + 1);
  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    const nextCount = (cachePathPinCounts.get(key) ?? 1) - 1;

    if (nextCount <= 0) {
      cachePathPinCounts.delete(key);
    } else {
      cachePathPinCounts.set(key, nextCount);
    }
  };
}

export function isCachePathPinned(filePath: string): boolean {
  return (cachePathPinCounts.get(cachePinKey(filePath)) ?? 0) > 0;
}
const workspaceCutJobSnapshotCaches = new Map<string, {
  loaded: boolean;
  jobs: Map<string, CutJobManifest>;
}>();

class CutJobFailure extends Error {
  readonly code: CutJobErrorCode;

  constructor(code: CutJobErrorCode, message: string) {
    super(message);
    this.name = "CutJobFailure";
    this.code = code;
  }
}

function cutJobFailureCode(error: unknown): CutJobErrorCode | undefined {
  return error instanceof CutJobFailure ? error.code : undefined;
}

export const CUT_JOB_NOT_RETRYABLE_CODE = "cut_job_not_retryable";

/** 稳定错误码：任务状态不允许复剪（cutter-api 映射为 409 cut_job_not_retryable）。 */
export class CutJobNotRetryableError extends Error {
  readonly code = CUT_JOB_NOT_RETRYABLE_CODE;

  constructor(message: string) {
    super(message);
    this.name = "CutJobNotRetryableError";
  }
}

function abortControllerKey(workspaceRoot: string): string {
  return path.resolve(workspaceRoot);
}

function registerActiveCutJobAbort(
  workspaceRoot: string,
  cutJobId: string,
  controller: AbortController
): void {
  const key = abortControllerKey(workspaceRoot);
  let controllers = activeCutJobAbortControllers.get(key);

  if (!controllers) {
    controllers = new Map();
    activeCutJobAbortControllers.set(key, controllers);
  }

  controllers.set(cutJobId, controller);
}

function unregisterActiveCutJobAbort(workspaceRoot: string, cutJobId: string): void {
  const key = abortControllerKey(workspaceRoot);
  const controllers = activeCutJobAbortControllers.get(key);

  if (!controllers) {
    return;
  }

  controllers.delete(cutJobId);
  if (controllers.size === 0) {
    activeCutJobAbortControllers.delete(key);
  }
}

function abortActiveCutJob(workspaceRoot: string, cutJobId: string): boolean {
  const controller = activeCutJobAbortControllers.get(abortControllerKey(workspaceRoot))?.get(cutJobId);

  if (!controller) {
    return false;
  }

  controller.abort();
  return true;
}


// --- workspace 独占租约（Round2 CUTL-02 追加风险） --------------------------
// 多进程共用同一 workspace 时，只有持租约的进程可以执行启动恢复与队列 drain；
// 其他进程只读/排队，并通过 workspace_lease_unavailable 提示用户。

export const WORKSPACE_LEASE_FILE_NAME = ".mixlab-workspace-lock.json";
export const WORKSPACE_LEASE_UNAVAILABLE_CODE = "workspace_lease_unavailable";
export const DEFAULT_WORKSPACE_LEASE_STALE_MS = 60_000;
const DEFAULT_WORKSPACE_LEASE_HEARTBEAT_MS = 10_000;
const WORKSPACE_LEASE_SCHEMA_VERSION = "1.0";

export interface WorkspaceLeaseRecord {
  schema_version: "1.0";
  instance_id: string;
  pid: number;
  hostname: string;
  workspace_root: string;
  acquired_at: string;
  heartbeat_at: string;
}

export class WorkspaceLeaseUnavailableError extends Error {
  readonly code = WORKSPACE_LEASE_UNAVAILABLE_CODE;
  readonly holder?: WorkspaceLeaseRecord;

  constructor(message: string, holder?: WorkspaceLeaseRecord) {
    super(message);
    this.name = "WorkspaceLeaseUnavailableError";
    this.holder = holder;
  }
}

export interface AcquireWorkspaceLeaseInput {
  workspace_root: string;
  now?: () => string;
  instance_id?: string;
  pid?: number;
  hostname?: string;
  /** 心跳超过该时长未更新即视为陈旧锁，可被回收。 */
  stale_after_ms?: number;
  /** 心跳间隔；0 表示关闭自动心跳（测试或短生命周期进程）。 */
  heartbeat_interval_ms?: number;
  /** 同主机 PID 存活判断；测试可注入。 */
  pid_alive?: (pid: number) => boolean;
}

export interface WorkspaceLease {
  workspace_root: string;
  instance_id: string;
  pid: number;
  acquired_at: string;
  heartbeat_at: () => string;
  is_held: () => boolean;
  refresh: () => Promise<boolean>;
  release: () => Promise<void>;
}

export function workspaceLeasePath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), WORKSPACE_LEASE_FILE_NAME);
}

function defaultPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function normalizeLeaseRecord(value: unknown): WorkspaceLeaseRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.instance_id !== "string" ||
    record.instance_id.trim() === "" ||
    typeof record.pid !== "number" ||
    !Number.isInteger(record.pid) ||
    typeof record.heartbeat_at !== "string" ||
    record.heartbeat_at.trim() === ""
  ) {
    return null;
  }

  return {
    schema_version: "1.0",
    instance_id: record.instance_id,
    pid: record.pid,
    hostname: typeof record.hostname === "string" ? record.hostname : "",
    workspace_root: typeof record.workspace_root === "string" ? record.workspace_root : "",
    acquired_at: typeof record.acquired_at === "string" ? record.acquired_at : record.heartbeat_at,
    heartbeat_at: record.heartbeat_at
  };
}

export async function readWorkspaceLease(workspaceRoot: string): Promise<WorkspaceLeaseRecord | null> {
  try {
    return normalizeLeaseRecord(
      JSON.parse(await readFile(workspaceLeasePath(workspaceRoot), "utf8")) as unknown
    );
  } catch {
    return null;
  }
}

function leaseIsStale(input: {
  record: WorkspaceLeaseRecord;
  now_ms: number;
  stale_after_ms: number;
  hostname: string;
  pid_alive: (pid: number) => boolean;
}): boolean {
  if (input.record.hostname && input.record.hostname === input.hostname) {
    if (!input.pid_alive(input.record.pid)) {
      return true;
    }
  }

  const heartbeatMs = Date.parse(input.record.heartbeat_at);

  if (!Number.isFinite(heartbeatMs)) {
    return true;
  }

  return input.now_ms - heartbeatMs > input.stale_after_ms;
}

/**
 * 原子创建（wx）workspace 租约；陈旧锁（心跳超时或同主机 PID 已退出）可被回收。
 * 拿不到租约时抛 WorkspaceLeaseUnavailableError（code=workspace_lease_unavailable）。
 */
export async function acquireWorkspaceLease(
  input: AcquireWorkspaceLeaseInput
): Promise<WorkspaceLease> {
  const workspaceRoot = path.resolve(input.workspace_root);
  const nowFn = input.now ?? (() => new Date().toISOString());
  const instanceId = input.instance_id?.trim() || randomUUID();
  const pid = input.pid ?? process.pid;
  const hostname = input.hostname?.trim() || os.hostname();
  const staleAfterMs = Number.isFinite(input.stale_after_ms) && (input.stale_after_ms ?? 0) > 0
    ? Math.floor(input.stale_after_ms!)
    : DEFAULT_WORKSPACE_LEASE_STALE_MS;
  const heartbeatIntervalMs =
    input.heartbeat_interval_ms !== undefined
      ? Math.max(0, Math.floor(input.heartbeat_interval_ms))
      : Math.min(DEFAULT_WORKSPACE_LEASE_HEARTBEAT_MS, Math.max(250, Math.floor(staleAfterMs / 3)));
  const pidAlive = input.pid_alive ?? defaultPidAlive;
  const leasePath = workspaceLeasePath(workspaceRoot);
  const acquiredAt = nowFn();
  let heartbeatAt = acquiredAt;

  await mkdir(workspaceRoot, { recursive: true });

  const buildRecord = (): WorkspaceLeaseRecord => ({
    schema_version: "1.0",
    instance_id: instanceId,
    pid,
    hostname,
    workspace_root: workspaceRoot,
    acquired_at: acquiredAt,
    heartbeat_at: heartbeatAt
  });

  let acquired = false;

  for (let attempt = 0; attempt < 4 && !acquired; attempt += 1) {
    try {
      await writeFile(leasePath, `${JSON.stringify(buildRecord(), null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx"
      });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    const holder = await readWorkspaceLease(workspaceRoot);
    const nowMs = Date.parse(nowFn());
    const stale =
      !holder ||
      leaseIsStale({
        record: holder,
        now_ms: Number.isFinite(nowMs) ? nowMs : Date.now(),
        stale_after_ms: staleAfterMs,
        hostname,
        pid_alive: pidAlive
      });

    if (!stale) {
      throw new WorkspaceLeaseUnavailableError(
        "本机工作区正被另一个剪辑实例使用（workspace 租约被占用），当前实例将以只读/排队方式运行。",
        holder ?? undefined
      );
    }

    // 先原子 rename 走陈旧锁，只有一个进程能成功 rename，然后重试创建。
    const stalePath = `${leasePath}.stale-${pid}-${randomUUID()}`;

    try {
      await rename(leasePath, stalePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }

      throw error;
    }

    await rm(stalePath, { force: true });
  }

  if (!acquired) {
    throw new WorkspaceLeaseUnavailableError(
      "无法获取本机工作区租约（锁文件竞争未结束），请稍后重试。"
    );
  }

  let held = true;
  let heartbeatTimer: NodeJS.Timeout | undefined;

  const lease: WorkspaceLease = {
    workspace_root: workspaceRoot,
    instance_id: instanceId,
    pid,
    acquired_at: acquiredAt,
    heartbeat_at: () => heartbeatAt,
    is_held: () => held,
    refresh: async () => {
      if (!held) {
        return false;
      }

      const current = await readWorkspaceLease(workspaceRoot);

      if (!current || current.instance_id !== instanceId) {
        held = false;
        return false;
      }

      const nextHeartbeatAt = nowFn();

      try {
        await writeFile(
          leasePath,
          `${JSON.stringify({ ...buildRecord(), heartbeat_at: nextHeartbeatAt }, null, 2)}\n`,
          { encoding: "utf8" }
        );
      } catch {
        held = false;
        return false;
      }

      heartbeatAt = nextHeartbeatAt;
      return true;
    },
    release: async () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
      }

      if (!held) {
        return;
      }

      held = false;
      const current = await readWorkspaceLease(workspaceRoot);

      if (current?.instance_id === instanceId) {
        await rm(leasePath, { force: true });
      }
    }
  };

  if (heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      void lease.refresh();
    }, heartbeatIntervalMs);
    heartbeatTimer.unref?.();
  }

  return lease;
}

/** 只有租约仍被本实例持有时才执行启动恢复，避免把其他实例的 running 任务误标 failed。 */
export async function recoverInterruptedCutJobsIfLeased(input: {
  workspace_root: string;
  now: string | (() => string);
  lease: WorkspaceLease;
}): Promise<{ recovered: CutJobManifest[]; skipped: boolean; reason?: string }> {
  if (!input.lease.is_held()) {
    return { recovered: [], skipped: true, reason: "workspace_lease_not_held" };
  }

  if (path.resolve(input.lease.workspace_root) !== path.resolve(input.workspace_root)) {
    return { recovered: [], skipped: true, reason: "workspace_lease_workspace_mismatch" };
  }

  const current = await readWorkspaceLease(input.workspace_root);

  if (!current || current.instance_id !== input.lease.instance_id) {
    return { recovered: [], skipped: true, reason: "workspace_lease_lost" };
  }

  const recovered = await recoverInterruptedCutJobs({
    workspace_root: input.workspace_root,
    now: typeof input.now === "function" ? input.now() : input.now
  });

  return { recovered, skipped: false };
}

async function withWorkspaceRunNextLock<T>(
  workspaceRoot: string,
  task: () => Promise<T>
): Promise<T> {
  const key = path.resolve(workspaceRoot);
  const previous = workspaceRunNextLocks.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);

  workspaceRunNextLocks.set(key, chained);
  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();

    if (workspaceRunNextLocks.get(key) === chained) {
      workspaceRunNextLocks.delete(key);
    }
  }
}

async function withWorkspaceQueueMutationLock<T>(
  workspaceRoot: string,
  task: () => Promise<T>
): Promise<T> {
  const key = path.resolve(workspaceRoot);
  const previous = workspaceQueueMutationLocks.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);

  workspaceQueueMutationLocks.set(key, chained);
  await previous.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrent();

    if (workspaceQueueMutationLocks.get(key) === chained) {
      workspaceQueueMutationLocks.delete(key);
    }
  }
}

function workspaceCacheKey(workspaceRoot: string): string {
  return path.resolve(workspaceRoot);
}

function cloneCutJob(job: CutJobManifest): CutJobManifest {
  return {
    ...job,
    ...(job.phase_timings ? { phase_timings: job.phase_timings.map((phase) => ({ ...phase })) } : {})
  };
}

function cachedCutJobs(workspaceRoot: string): CutJobManifest[] | null {
  const cache = workspaceCutJobSnapshotCaches.get(workspaceCacheKey(workspaceRoot));
  if (!cache?.loaded) {
    return null;
  }

  return Array.from(cache.jobs.values(), cloneCutJob);
}

function replaceCutJobCache(workspaceRoot: string, jobs: CutJobManifest[]): void {
  workspaceCutJobSnapshotCaches.set(workspaceCacheKey(workspaceRoot), {
    loaded: true,
    jobs: new Map(jobs.map((job) => [job.cut_job_id, cloneCutJob(job)]))
  });
}

function upsertCutJobCache(workspaceRoot: string, job: CutJobManifest): void {
  const cache = workspaceCutJobSnapshotCaches.get(workspaceCacheKey(workspaceRoot));
  if (!cache?.loaded) {
    return;
  }

  cache.jobs.set(job.cut_job_id, cloneCutJob(job));
}

export function invalidateCutJobCache(workspaceRoot: string): void {
  workspaceCutJobSnapshotCaches.delete(workspaceCacheKey(workspaceRoot));
}

function cutJobsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "clip-jobs");
}

function cutJobPath(workspaceRoot: string, cutJobId: string): string {
  assertCutJobId(cutJobId);
  return path.join(cutJobsRoot(workspaceRoot), `${cutJobId}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeReadCutJob(value: unknown, fallbackCutJobId: string): CutJobManifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const cutJobId = nonEmptyString(value.cut_job_id) ?? fallbackCutJobId;
  if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
    return null;
  }

  const createdAt = nonEmptyString(value.created_at) ?? new Date(0).toISOString();
  const updatedAt = nonEmptyString(value.updated_at) ?? createdAt;
  const status = nonEmptyString(value.status);
  if (
    status !== "pending" &&
    status !== "running" &&
    status !== "done" &&
    status !== "failed" &&
    status !== "cancelled"
  ) {
    return null;
  }

  return {
    schema_version: "1.0",
    cut_job_id: cutJobId,
    clip_list_id: nonEmptyString(value.clip_list_id) ?? "",
    clip_list_item_id: nonEmptyString(value.clip_list_item_id) ?? "",
    library_id: nonEmptyString(value.library_id) ?? "",
    ...(nonEmptyString(value.project_id) ? { project_id: nonEmptyString(value.project_id) } : {}),
    ...(nonEmptyString(value.title) ? { title: nonEmptyString(value.title) } : {}),
    ...(nonEmptyString(value.project_title) ? { project_title: nonEmptyString(value.project_title) } : {}),
    ...(typeof value.project_clip_order === "number" && Number.isFinite(value.project_clip_order)
      ? { project_clip_order: value.project_clip_order }
      : {}),
    source_video_id: nonEmptyString(value.source_video_id) ?? "",
    source_title: nonEmptyString(value.source_title) ?? "",
    source_relative_path: nonEmptyString(value.source_relative_path) ?? "",
    start_segment_id: nonEmptyString(value.start_segment_id) ?? "",
    end_segment_id: nonEmptyString(value.end_segment_id) ?? "",
    begin_ms: numberOrZero(value.begin_ms),
    end_ms: numberOrZero(value.end_ms),
    selected_text: nonEmptyString(value.selected_text) ?? "",
    cut_mode: value.cut_mode === "copy" ? "copy" : "smart",
    status,
    ...(nonEmptyString(value.current_phase) ? { current_phase: value.current_phase as CutJobPhaseId } : {}),
    ...(Array.isArray(value.phase_timings) ? { phase_timings: value.phase_timings as CutJobPhaseTiming[] } : {}),
    created_at: createdAt,
    updated_at: updatedAt,
    ...(nonEmptyString(value.started_at) ? { started_at: nonEmptyString(value.started_at) } : {}),
    ...(nonEmptyString(value.finished_at) ? { finished_at: nonEmptyString(value.finished_at) } : {}),
    ...(nonEmptyString(value.error_message) ? { error_message: nonEmptyString(value.error_message) } : {}),
    ...(nonEmptyString(value.error_code) ? { error_code: value.error_code as CutJobErrorCode } : {}),
    ...(nonEmptyString(value.submission_key) ? { submission_key: nonEmptyString(value.submission_key) } : {}),
    ...(validCutMode(value.cut_mode_used) ? { cut_mode_used: value.cut_mode_used } : {}),
    ...(nonEmptyString(value.degrade_reason) ? { degrade_reason: nonEmptyString(value.degrade_reason) } : {}),
    ...(isRecord(value.verification) ? { verification: value.verification as unknown as CutOutputVerification } : {}),
    ...(nonEmptyString(value.export_clip_id) ? { export_clip_id: nonEmptyString(value.export_clip_id) } : {}),
    ...(nonEmptyString(value.output_file) ? { output_file: nonEmptyString(value.output_file) } : {})
  };
}

async function readCutJobForListing(workspaceRoot: string, cutJobId: string): Promise<CutJobManifest | null> {
  try {
    const job = normalizeReadCutJob(
      JSON.parse(await readFile(cutJobPath(workspaceRoot, cutJobId), "utf8")) as unknown,
      cutJobId
    );
    return job
      ? {
          ...job,
          phase_timings: ensurePhaseTimings(job)
        }
      : null;
  } catch {
    return null;
  }
}

function workspaceCacheRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "cache");
}

function cutTempRoot(workspaceRoot: string): string {
  return path.join(workspaceCacheRoot(workspaceRoot), "cut-temp");
}

function normalizeCacheMaxBytes(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? 0) <= 0) {
    return fallback;
  }

  return Math.max(128 * 1024 * 1024, Math.floor(value!));
}

function cutTempMaxBytes(value: number | undefined): number {
  return normalizeCacheMaxBytes(value, DEFAULT_CUT_TEMP_MAX_BYTES);
}

function cutTempOutputPath(input: {
  workspace_root: string;
  cut_job_id: string;
  export_clip_id: string;
}): string {
  assertCutJobId(input.cut_job_id);
  return path.join(
    cutTempRoot(input.workspace_root),
    `${input.cut_job_id}-${input.export_clip_id}-${randomUUID()}.mp4`
  );
}

async function readDirectFileEntries(root: string): Promise<Array<{
  file_path: string;
  size: number;
  mtime_ms: number;
}>> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(root, entry.name);
        try {
          const fileStat = await stat(filePath);
          return {
            file_path: filePath,
            size: fileStat.size,
            mtime_ms: fileStat.mtimeMs
          };
        } catch {
          return null;
        }
      })
  );

  return files.filter((file): file is {
    file_path: string;
    size: number;
    mtime_ms: number;
  } => Boolean(file));
}

async function pruneDirectFileCache(input: {
  root: string;
  max_bytes: number;
  keep_paths?: string[];
}): Promise<string[]> {
  const keep = new Set((input.keep_paths ?? []).map((filePath) => path.resolve(filePath)));
  const entries = await readDirectFileEntries(input.root);
  let totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
  const pruned: string[] = [];

  for (const entry of entries
    .filter(
      (item) => !keep.has(path.resolve(item.file_path)) && !isCachePathPinned(item.file_path)
    )
    .sort((left, right) => left.mtime_ms - right.mtime_ms)) {
    if (totalBytes <= input.max_bytes) {
      break;
    }

    try {
      await rm(entry.file_path, { force: true });
      totalBytes -= entry.size;
      pruned.push(entry.file_path);
    } catch {
      // A concurrent process may still be writing or moving this temp file.
    }
  }

  return pruned;
}

async function directFileCacheSize(root: string): Promise<number> {
  return (await readDirectFileEntries(root)).reduce((total, entry) => total + entry.size, 0);
}

async function moveOrCopyFile(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await rename(sourcePath, targetPath);
  } catch {
    await copyFile(sourcePath, targetPath);
    await rm(sourcePath, { force: true });
  }
}

export interface CutTempCacheStatus {
  cache_root_path: string;
  max_bytes: number;
  size_bytes: number;
  file_count: number;
}

export async function pruneCutTempCache(input: {
  workspace_root: string;
  max_bytes?: number;
}): Promise<string[]> {
  return pruneDirectFileCache({
    root: cutTempRoot(input.workspace_root),
    max_bytes: cutTempMaxBytes(input.max_bytes)
  });
}

export async function readCutTempCacheStatus(input: {
  workspace_root: string;
  max_bytes?: number;
}): Promise<CutTempCacheStatus> {
  const root = cutTempRoot(input.workspace_root);
  const entries = await readDirectFileEntries(root);

  return {
    cache_root_path: root,
    max_bytes: cutTempMaxBytes(input.max_bytes),
    size_bytes: entries.reduce((total, entry) => total + entry.size, 0),
    file_count: entries.length
  };
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function durationMs(startedAt: string | undefined, finishedAt: string): number | undefined {
  if (!startedAt) {
    return undefined;
  }

  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}

function pendingPhaseTimings(): CutJobPhaseTiming[] {
  return CUT_JOB_PHASES.map((phase) => ({
    ...phase,
    status: "pending"
  }));
}

function activeQueueWaitPhaseTimings(createdAt: string): CutJobPhaseTiming[] {
  return CUT_JOB_PHASES.map((phase, index) => ({
    ...phase,
    status: index === 0 ? "running" : "pending",
    ...(index === 0 ? { started_at: createdAt } : {})
  }));
}

function ensurePhaseTimings(job: CutJobManifest): CutJobPhaseTiming[] {
  if (job.status === "pending") {
    return pendingPhaseTimings();
  }

  if (job.phase_timings?.length === CUT_JOB_PHASES.length) {
    return job.phase_timings.map((phase) => ({ ...phase }));
  }

  return activeQueueWaitPhaseTimings(job.started_at ?? job.created_at);
}

function updatePhase(
  phases: CutJobPhaseTiming[],
  phaseId: CutJobPhaseId,
  update: Partial<CutJobPhaseTiming>
): CutJobPhaseTiming[] {
  return phases.map((phase) =>
    phase.phase_id === phaseId
      ? {
          ...phase,
          ...update
        }
      : phase
  );
}

function startPhase(job: CutJobManifest, phaseId: CutJobPhaseId, now: string): CutJobManifest {
  let phases = ensurePhaseTimings(job);
  const currentPhaseId = job.current_phase;

  if (currentPhaseId && currentPhaseId !== phaseId) {
    const currentPhase = phases.find((phase) => phase.phase_id === currentPhaseId);
    if (currentPhase?.status === "running") {
      phases = updatePhase(phases, currentPhaseId, {
        status: "done",
        finished_at: now,
        duration_ms: durationMs(currentPhase.started_at, now)
      });
    }
  }

  phases = updatePhase(phases, phaseId, {
    status: "running",
    started_at: phases.find((phase) => phase.phase_id === phaseId)?.started_at ?? now,
    finished_at: undefined,
    duration_ms: undefined
  });

  return {
    ...job,
    current_phase: phaseId,
    phase_timings: phases,
    updated_at: now
  };
}

function finishPhase(job: CutJobManifest, phaseId: CutJobPhaseId, now: string): CutJobManifest {
  const phases = ensurePhaseTimings(job);
  const phase = phases.find((item) => item.phase_id === phaseId);

  return {
    ...job,
    phase_timings: updatePhase(phases, phaseId, {
      status: "done",
      finished_at: now,
      duration_ms: durationMs(phase?.started_at, now)
    }),
    updated_at: now
  };
}

function failPhase(job: CutJobManifest, phaseId: CutJobPhaseId, now: string): CutJobManifest {
  const phases = ensurePhaseTimings(job);
  const phase = phases.find((item) => item.phase_id === phaseId);

  return {
    ...job,
    current_phase: phaseId,
    phase_timings: updatePhase(phases, phaseId, {
      status: "failed",
      finished_at: now,
      duration_ms: durationMs(phase?.started_at, now)
    }),
    updated_at: now
  };
}

function validCutMode(value: unknown): value is CutMode {
  return value === "copy" || value === "smart" || value === "precise";
}

async function resolveSourceDurationForPreflight(input: {
  job: CutJobManifest;
  source: CutJobSourceDetail;
  source_duration_probe?: CutSourceDurationProbe;
}): Promise<number> {
  const isLocalClipSource = /^E\d{6}$/.test(input.job.source_video_id);
  const manifestDurationMs = input.source.duration_ms;

  // 普通公共素材的时长来自已发布索引（预处理阶段 ffprobe 实测）；缺失时才回退探测。
  if (
    !isLocalClipSource &&
    typeof manifestDurationMs === "number" &&
    Number.isFinite(manifestDurationMs) &&
    manifestDurationMs > 0
  ) {
    return Math.floor(manifestDurationMs);
  }

  // E 源（本地作品重剪）的清单 duration_ms 是"请求时长"，必须重新探测真实媒体时长。
  if (!input.source_duration_probe) {
    throw new CutJobFailure(
      "CUT_SOURCE_UNPROBEABLE",
      "无法获取源视频实测时长：当前环境未配置视频探测能力，已拒绝剪切以免越界。"
    );
  }

  let probedDurationMs: number | undefined;
  try {
    const probeResult = await input.source_duration_probe({
      source_video_path: input.source.source_video_file_path
    });
    probedDurationMs = probeResult?.duration_ms;
  } catch (error) {
    throw new CutJobFailure(
      "CUT_SOURCE_UNPROBEABLE",
      `无法获取源视频实测时长：${errorMessage(error)}`
    );
  }

  if (
    typeof probedDurationMs !== "number" ||
    !Number.isFinite(probedDurationMs) ||
    probedDurationMs <= 0
  ) {
    throw new CutJobFailure(
      "CUT_SOURCE_UNPROBEABLE",
      "无法获取源视频实测时长：媒体时长探测结果无效，已拒绝剪切以免越界。"
    );
  }

  return Math.floor(probedDurationMs);
}

async function assertCutJobPreflight(input: {
  job: CutJobManifest;
  source: CutJobSourceDetail;
  source_duration_probe?: CutSourceDurationProbe;
}): Promise<{ source_duration_ms: number }> {
  if (!input.source.source_video_file_path.trim()) {
    throw new Error("源视频不可读：源视频路径为空");
  }

  const sourceStat = await stat(input.source.source_video_file_path).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`源视频不可读：找不到源视频文件 ${input.source.source_video_file_path}`);
    }

    throw error;
  });

  if (!sourceStat.isFile()) {
    throw new Error(`源视频不可读：源路径不是视频文件 ${input.source.source_video_file_path}`);
  }

  if (!Number.isFinite(input.job.begin_ms) || !Number.isFinite(input.job.end_ms)) {
    throw new Error("剪切时间段非法：开始和结束时间必须是有效数字");
  }

  if (input.job.begin_ms < 0) {
    throw new Error("剪切时间段非法：开始时间不能小于 0");
  }

  if (input.job.end_ms <= input.job.begin_ms) {
    throw new Error("剪切时间段非法：结束时间必须大于开始时间");
  }

  const sourceDurationMs = await resolveSourceDurationForPreflight(input);

  // 契约：请求区间必须完全落在实测源时长内（0 容差），不做尾部截断放行。
  if (input.job.begin_ms >= sourceDurationMs || input.job.end_ms > sourceDurationMs) {
    throw new CutJobFailure(
      "CUT_RANGE_OUT_OF_SOURCE",
      `剪切区间超出源视频时长：请求 ${input.job.begin_ms}-${input.job.end_ms}ms，源视频实测时长 ${sourceDurationMs}ms。请缩短选区后重试。`
    );
  }

  return { source_duration_ms: sourceDurationMs };
}

function assertCutJobId(cutJobId: string): void {
  if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
    throw new Error("cut_job_id must use CJYYYYMMDD-0001 format");
  }
}

function dateStampFromIso(now: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(now);

  if (!match) {
    throw new Error("now must be an ISO timestamp");
  }

  return `${match[1]}${match[2]}${match[3]}`;
}

function numericCutJobSequence(cutJobId: string): number {
  const match = /^CJ\d{8}-(\d{4})$/.exec(cutJobId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function formatCutJobId(dateStamp: string, sequence: number): string {
  return `CJ${dateStamp}-${String(sequence).padStart(4, "0")}`;
}

function normalizedListWindow(input: { limit?: number; offset?: number }): {
  limit?: number;
  offset: number;
} {
  const offset = Number.isFinite(input.offset) && input.offset && input.offset > 0
    ? Math.floor(input.offset)
    : 0;
  const limit = Number.isFinite(input.limit) && input.limit && input.limit > 0
    ? Math.floor(input.limit)
    : undefined;

  return { limit, offset };
}

async function allocateNextCutJobIds(input: {
  workspace_root: string;
  now: string;
  count: number;
}): Promise<string[]> {
  const dateStamp = dateStampFromIso(input.now);
  let entries;

  try {
    entries = await readdir(cutJobsRoot(input.workspace_root), { withFileTypes: true });
  } catch {
    return Array.from({ length: input.count }, (_, index) =>
      formatCutJobId(dateStamp, index + 1)
    );
  }

  let maxSequence = 0;

  for (const entry of entries) {
    const basename = entry.name.replace(/\.json$/, "");

    if (
      entry.isFile() &&
      basename.startsWith(`CJ${dateStamp}-`) &&
      CUT_JOB_ID_PATTERN.test(basename)
    ) {
      maxSequence = Math.max(maxSequence, numericCutJobSequence(basename));
    }
  }

  return Array.from({ length: input.count }, (_, index) =>
    formatCutJobId(dateStamp, maxSequence + index + 1)
  );
}

function jobFromClipListItem(input: {
  cut_job_id: string;
  clip_list: ClipListManifest;
  item: ClipListItem;
  project_clip_order: number;
  now: string;
  submission_key?: string;
}): CutJobManifest {
  const sourceTitle = sourceTitleForCanonicalClipName(input.item.source_title, input.clip_list.title);
  const beginMs = Math.max(0, input.item.begin_ms - input.item.pre_roll_ms);
  const endMs = input.item.end_ms + input.item.post_roll_ms;
  const title = buildCanonicalClipTitle({
    project_clip_order: input.project_clip_order,
    project_title: input.clip_list.title,
    source_title: sourceTitle
  });

  return {
    schema_version: "1.0",
    cut_job_id: input.cut_job_id,
    clip_list_id: input.clip_list.clip_list_id,
    clip_list_item_id: input.item.item_id,
    library_id: input.clip_list.library_id,
    ...(input.clip_list.project_id ? { project_id: input.clip_list.project_id } : {}),
    source_video_id: input.item.source_video_id,
    title,
    project_title: input.clip_list.title,
    project_clip_order: input.project_clip_order,
    source_title: sourceTitle,
    source_relative_path: input.item.source_relative_path,
    start_segment_id: input.item.start_segment_id,
    end_segment_id: input.item.end_segment_id,
    begin_ms: beginMs,
    end_ms: endMs,
    selected_text: input.item.selected_text,
    cut_mode: input.item.cut_mode,
    status: "pending",
    current_phase: "queue_wait",
    phase_timings: pendingPhaseTimings(),
    ...(input.submission_key ? { submission_key: input.submission_key } : {}),
    created_at: input.now,
    updated_at: input.now
  };
}

async function writeCutJob(workspaceRoot: string, job: CutJobManifest): Promise<void> {
  const filePath = cutJobPath(workspaceRoot, job.cut_job_id);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, jsonBytes(job), "utf8");
  await rename(tempPath, filePath);
  upsertCutJobCache(workspaceRoot, job);
}

async function readAllCutJobs(workspaceRoot: string): Promise<CutJobManifest[]> {
  const cached = cachedCutJobs(workspaceRoot);
  if (cached) {
    return cached;
  }

  let entries;

  try {
    entries = await readdir(cutJobsRoot(workspaceRoot), { withFileTypes: true });
  } catch {
    return [];
  }

  const jobs: CutJobManifest[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const cutJobId = entry.name.replace(/\.json$/, "");

    if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
      continue;
    }

    const job = await readCutJobForListing(workspaceRoot, cutJobId);
    if (job) {
      jobs.push(job);
    }
  }

  replaceCutJobCache(workspaceRoot, jobs);
  return jobs;
}

async function readCutJobsPage(input: ListCutJobsInput): Promise<{
  total: number;
  jobs: CutJobManifest[];
}> {
  const cached = cachedCutJobs(input.workspace_root);
  const { limit, offset } = normalizedListWindow(input);

  if (cached) {
    const sorted = cached.sort(compareCutJobsForListing);
    return {
      total: sorted.length,
      jobs: limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset)
    };
  }

  let entries;

  try {
    entries = await readdir(cutJobsRoot(input.workspace_root), { withFileTypes: true });
  } catch {
    return {
      total: 0,
      jobs: []
    };
  }

  const jobEntries = entries
    .filter((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        return false;
      }

      return CUT_JOB_ID_PATTERN.test(entry.name.replace(/\.json$/, ""));
    })
    .sort((left, right) => right.name.localeCompare(left.name));
  const readableJobs: CutJobManifest[] = [];
  const readAllForExactTotal = !limit || jobEntries.length <= 500;
  const entriesToRead = readAllForExactTotal
    ? jobEntries
    : jobEntries.slice(offset, offset + limit);

  for (const entry of entriesToRead) {
    const cutJobId = entry.name.replace(/\.json$/, "");
    const job = await readCutJobForListing(input.workspace_root, cutJobId);
    if (job) {
      readableJobs.push(job);
    }
  }

  if (readAllForExactTotal) {
    replaceCutJobCache(input.workspace_root, readableJobs);
  }

  const sorted = readableJobs.sort(compareCutJobsForListing);
  const jobs = readAllForExactTotal && limit
    ? sorted.slice(offset, offset + limit)
    : sorted;

  return {
    total: readAllForExactTotal ? readableJobs.length : jobEntries.length,
    jobs
  };
}

export const CUT_QUEUE_BUSY_CODE = "cut_queue_busy";
const SUBMISSION_LOCK_FILE_NAME = ".submission.lock";
const SUBMISSION_LOCK_STALE_MS = 10_000;
const STAGING_DIRECTORY_PREFIX = ".staging-";
const STALE_STAGING_CLEANUP_MS = 60_000;

export class CutQueueBusyError extends Error {
  readonly code = CUT_QUEUE_BUSY_CODE;

  constructor(message: string) {
    super(message);
    this.name = "CutQueueBusyError";
  }
}

class CutJobIdConflictError extends Error {
  readonly code = "cut_job_id_conflict";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

function submissionKeyFor(input: SubmitClipListToQueueInput): string {
  const clientRequestId = input.client_request_id?.trim();

  if (!clientRequestId) {
    return `clip_list:${input.clip_list.clip_list_id}`;
  }

  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(clientRequestId)) {
    throw new Error("client_request_id 只能包含字母、数字、点、下划线、冒号、连字符（最长 120）");
  }

  return `client:${clientRequestId}`;
}

function replayableJobsForSubmission(input: {
  jobs: CutJobManifest[];
  submission_key: string;
  clip_list_id: string;
}): CutJobManifest[] {
  const clientKey = input.submission_key.startsWith("client:");

  return input.jobs
    .filter((job) =>
      clientKey
        ? job.submission_key === input.submission_key
        : job.submission_key === input.submission_key ||
          (!job.submission_key && job.clip_list_id === input.clip_list_id)
    )
    .sort((left, right) => left.cut_job_id.localeCompare(right.cut_job_id));
}

/** 跨进程提交锁：wx 原子创建 + 陈旧回收 + 有界等待，避免两个进程同时分配/写入任务 ID。 */
async function withWorkspaceSubmissionFileLock<T>(
  workspaceRoot: string,
  waitMs: number | undefined,
  task: () => Promise<T>
): Promise<T> {
  const lockPath = path.join(cutJobsRoot(workspaceRoot), SUBMISSION_LOCK_FILE_NAME);
  const effectiveWaitMs =
    Number.isFinite(waitMs) && (waitMs ?? 0) >= 0 ? Math.floor(waitMs!) : 2_000;
  const startedAt = Date.now();

  await mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      await writeFile(
        lockPath,
        `${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`,
        { encoding: "utf8", flag: "wx" }
      );
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    const lockStat = await stat(lockPath).catch(() => null);

    if (!lockStat || Date.now() - lockStat.mtimeMs > SUBMISSION_LOCK_STALE_MS) {
      await rm(lockPath, { force: true });
      continue;
    }

    if (Date.now() - startedAt >= effectiveWaitMs) {
      throw new CutQueueBusyError(
        "另一个剪辑实例正在提交剪切任务，请稍后重试（workspace 提交锁被占用）。"
      );
    }

    await sleep(25);
  }

  try {
    return await task();
  } finally {
    await rm(lockPath, { force: true });
  }
}

/** 批量原子提交：先写 staging，再逐条 rename；任一步失败回滚已写入任务，目录随后清理。 */
async function commitStagedCutJobBatch(input: {
  workspace_root: string;
  jobs: CutJobManifest[];
  on_job_written?: (job: CutJobManifest, index: number) => void | Promise<void>;
}): Promise<void> {
  const stagingRoot = path.join(cutJobsRoot(input.workspace_root), `${STAGING_DIRECTORY_PREFIX}${randomUUID()}`);
  const writtenPaths: string[] = [];

  await mkdir(stagingRoot, { recursive: true });

  try {
    for (const job of input.jobs) {
      assertCutJobId(job.cut_job_id);
      await writeFile(
        path.join(stagingRoot, `${job.cut_job_id}.json`),
        jsonBytes(job),
        "utf8"
      );
    }

    for (const [index, job] of input.jobs.entries()) {
      const targetPath = cutJobPath(input.workspace_root, job.cut_job_id);
      const existing = await stat(targetPath).catch(() => null);

      if (existing) {
        throw new CutJobIdConflictError(`剪切任务编号冲突：${job.cut_job_id}`);
      }

      await rename(path.join(stagingRoot, `${job.cut_job_id}.json`), targetPath);
      writtenPaths.push(targetPath);
      upsertCutJobCache(input.workspace_root, job);
      await input.on_job_written?.(job, index);
    }
  } catch (error) {
    for (const targetPath of writtenPaths) {
      await rm(targetPath, { force: true });
    }
    invalidateCutJobCache(input.workspace_root);
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

/** 清理上次进程中断遗留的 staging 目录（超过保护期才删，避免删掉其他进程正在提交的批次）。 */
async function cleanupStaleCutJobStagingDirectories(
  workspaceRoot: string,
  nowMs: number
): Promise<number> {
  let entries;

  try {
    entries = await readdir(cutJobsRoot(workspaceRoot), { withFileTypes: true });
  } catch {
    return 0;
  }

  let removed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(STAGING_DIRECTORY_PREFIX)) {
      continue;
    }

    const stagingPath = path.join(cutJobsRoot(workspaceRoot), entry.name);
    const stagingStat = await stat(stagingPath).catch(() => null);

    if (!stagingStat || nowMs - stagingStat.mtimeMs <= STALE_STAGING_CLEANUP_MS) {
      continue;
    }

    try {
      await rm(stagingPath, { recursive: true, force: true });
      removed += 1;
    } catch {
      // 并发提交可能仍在写该目录；下次启动再清理。
    }
  }

  return removed;
}

export async function submitClipListToQueue(
  input: SubmitClipListToQueueInput
): Promise<CutJobSubmission> {
  const submissionKey = submissionKeyFor(input);

  return withWorkspaceQueueMutationLock(input.workspace_root, async () => {
    return withWorkspaceSubmissionFileLock(
      input.workspace_root,
      input.submission_lock_wait_ms,
      async () => {
        const allJobs = await readAllCutJobs(input.workspace_root);
        const replayJobs = replayableJobsForSubmission({
          jobs: allJobs,
          submission_key: submissionKey,
          clip_list_id: input.clip_list.clip_list_id
        });

        if (replayJobs.length > 0) {
          return {
            submitted_count: replayJobs.length,
            jobs: replayJobs,
            replayed: true,
            submission_key: submissionKey
          };
        }

        const existingProjectOrder = allJobs
          .filter((job) =>
            input.clip_list.project_id
              ? job.project_id === input.clip_list.project_id
              : job.project_title === input.clip_list.title
          )
          .reduce((max, job) => Math.max(max, job.project_clip_order ?? 0), 0);

        let lastError: unknown;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const cutJobIds = await allocateNextCutJobIds({
              workspace_root: input.workspace_root,
              now: input.now,
              count: input.clip_list.items.length
            });
            const jobs = input.clip_list.items.map((item, index) =>
              jobFromClipListItem({
                cut_job_id: cutJobIds[index] ?? formatCutJobId(dateStampFromIso(input.now), index + 1),
                clip_list: input.clip_list,
                item,
                project_clip_order: existingProjectOrder + index + 1,
                now: input.now,
                submission_key: submissionKey
              })
            );

            await commitStagedCutJobBatch({
              workspace_root: input.workspace_root,
              jobs,
              ...(input.on_job_written ? { on_job_written: input.on_job_written } : {})
            });

            return {
              submitted_count: jobs.length,
              jobs,
              replayed: false,
              submission_key: submissionKey
            };
          } catch (error) {
            lastError = error;

            if (error instanceof CutJobIdConflictError && attempt === 0) {
              invalidateCutJobCache(input.workspace_root);
              continue;
            }

            throw error;
          }
        }

        throw lastError instanceof Error ? lastError : new Error("cut job submission failed");
      }
    );
  });
}

export async function getCutJob(input: GetCutJobInput): Promise<CutJobManifest | null> {
  try {
    const job = normalizeReadCutJob(
      JSON.parse(await readFile(cutJobPath(input.workspace_root, input.cut_job_id), "utf8")) as unknown,
      input.cut_job_id
    );
    return job
      ? {
          ...job,
          phase_timings: ensurePhaseTimings(job)
        }
      : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function listCutJobs(input: ListCutJobsInput): Promise<CutJobCatalog> {
  const page = input.limit
    ? await readCutJobsPage(input)
    : { total: 0, jobs: await readAllCutJobs(input.workspace_root) };
  const jobs = page.jobs;
  jobs.sort(compareCutJobsForListing);

  return {
    job_count: input.limit ? page.total : jobs.length,
    jobs
  };
}

export async function retryCutJob(input: RetryCutJobInput): Promise<CutJobManifest> {
  const job = await getCutJob({
    workspace_root: input.workspace_root,
    cut_job_id: input.cut_job_id
  });

  if (!job) {
    throw new Error("cut job not found");
  }

  const retryable =
    job.status === "failed" ||
    job.status === "cancelled" ||
    // 复剪契约：done 但输出校验未通过（verification.passed === false）允许重试；
    // done 且校验通过、以及旧版本没有 verification 记录的 done 任务仍拒绝。
    (job.status === "done" && job.verification?.passed === false);

  if (!retryable) {
    if (job.status === "done") {
      throw new CutJobNotRetryableError(
        job.verification?.passed === true
          ? "该任务已完成且输出校验通过，不能复剪；如需再次剪切请重新提交选区。"
          : "该任务已完成但缺少输出校验记录（旧任务），不能复剪；如需再次剪切请重新提交选区。"
      );
    }

    throw new CutJobNotRetryableError("只有失败、已取消或已完成但输出校验未通过的任务可以复剪。");
  }

  const retried: CutJobManifest = {
    ...job,
    status: "pending",
    current_phase: "queue_wait",
    phase_timings: pendingPhaseTimings(),
    updated_at: input.now,
    started_at: undefined,
    finished_at: undefined,
    error_message: undefined,
    error_code: undefined,
    cut_mode_used: undefined,
    degrade_reason: undefined,
    verification: undefined,
    export_clip_id: undefined,
    output_file: undefined
  };
  await writeCutJob(input.workspace_root, retried);
  return retried;
}

export async function cancelCutJob(input: CancelCutJobInput): Promise<CutJobManifest> {
  return withWorkspaceQueueMutationLock(input.workspace_root, async () => {
    const job = await getCutJob({
      workspace_root: input.workspace_root,
      cut_job_id: input.cut_job_id
    });

    if (!job) {
      throw new Error("cut job not found");
    }

    if (job.status !== "pending" && job.status !== "running") {
      return job;
    }

    const cancelled: CutJobManifest = {
      ...job,
      status: "cancelled",
      phase_timings: ensurePhaseTimings(job).map((phase) =>
        phase.status === "running"
          ? {
              ...phase,
              status: "failed",
              finished_at: input.now
            }
          : phase
      ),
      finished_at: input.now,
      updated_at: input.now,
      error_code: "CUT_CANCELLED",
      error_message: "用户取消剪辑任务"
    };
    await writeCutJob(input.workspace_root, cancelled);
    // 立即中止本进程内正在执行的 FFmpeg（跨进程取消仍依赖阶段边界检查）。
    abortActiveCutJob(input.workspace_root, input.cut_job_id);
    return cancelled;
  });
}

function compareCutJobsForListing(left: CutJobManifest, right: CutJobManifest): number {
  const updatedCompare = right.updated_at.localeCompare(left.updated_at);
  return updatedCompare || right.cut_job_id.localeCompare(left.cut_job_id);
}

function oldestPendingJob(jobs: CutJobManifest[]): CutJobManifest | null {
  return [...jobs]
    .filter((job) => job.status === "pending")
    .sort((left, right) => {
      const createdCompare = left.created_at.localeCompare(right.created_at);
      return createdCompare || left.cut_job_id.localeCompare(right.cut_job_id);
    })[0] ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ResolveCutJobTimeoutInput {
  range_ms: number;
  /** 显式覆盖值（毫秒）。测试或特殊场景直接指定，不作下限约束。 */
  override_ms?: number;
  /** 可配置上限（毫秒）。 */
  max_ms?: number;
}

export function resolveCutJobTimeoutMs(input: ResolveCutJobTimeoutInput): number {
  if (Number.isFinite(input.override_ms) && (input.override_ms ?? 0) > 0) {
    return Math.max(1, Math.floor(input.override_ms!));
  }

  return resolveFfmpegTimeoutMs({
    range_ms: input.range_ms,
    ...(Number.isFinite(input.max_ms) && (input.max_ms ?? 0) > 0 ? { max_ms: input.max_ms } : {})
  });
}

function withCutTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => never
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      try {
        onTimeout();
      } catch (error) {
        reject(error);
      }
    }, timeoutMs);

    timer.unref?.();

    promise.then(
      (value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function normalizeProbeMilliseconds(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
}

function expectedOutputDurationMs(input: {
  begin_ms: number;
  end_ms: number;
  source_duration_ms: number;
}): number {
  const endMs = Math.min(input.end_ms, input.source_duration_ms);
  return Math.max(0, Math.round(endMs - input.begin_ms));
}

export function outputToleranceMs(input: {
  cut_mode_used: CutMode;
  keyframe_distance_ms?: number;
}): number {
  if (input.cut_mode_used === "copy") {
    return COPY_OUTPUT_TOLERANCE_BASE_MS +
      COPY_OUTPUT_TOLERANCE_PADDING_MS +
      Math.max(0, Math.round(input.keyframe_distance_ms ?? 0));
  }

  return PRECISE_OUTPUT_TOLERANCE_MS;
}

function buildCutOutputVerification(input: {
  expected_duration_ms: number;
  tolerance_ms: number;
  probe: CutOutputProbeResult;
  cut_mode_used: CutMode;
  keyframe_distance_ms?: number;
}): CutOutputVerification {
  const checks: CutOutputVerificationCheck[] = [];
  const actualDurationMs =
    normalizeProbeMilliseconds(input.probe.duration_ms) ??
    normalizeProbeMilliseconds(input.probe.video_duration_ms) ??
    normalizeProbeMilliseconds(input.probe.audio_duration_ms);
  const firstFramePtsMs = typeof input.probe.first_video_pts_ms === "number" && Number.isFinite(input.probe.first_video_pts_ms)
    ? Math.round(input.probe.first_video_pts_ms)
    : undefined;
  const videoDurationMs = normalizeProbeMilliseconds(input.probe.video_duration_ms);
  const audioDurationMs = normalizeProbeMilliseconds(input.probe.audio_duration_ms);
  const sourceHasAudio = input.probe.source_has_audio_stream;
  const durationDeltaMs =
    actualDurationMs === undefined ? undefined : Math.abs(actualDurationMs - input.expected_duration_ms);

  checks.push({
    check: "file_exists",
    passed: input.probe.exists,
    detail: input.probe.exists ? "输出文件存在" : "输出文件不存在"
  });
  checks.push({
    check: "file_size",
    passed: input.probe.size_bytes > 0,
    detail: input.probe.size_bytes > 0 ? `输出文件大小 ${input.probe.size_bytes} 字节` : "输出文件大小为 0 字节"
  });
  checks.push({
    check: "duration",
    passed:
      actualDurationMs !== undefined &&
      durationDeltaMs !== undefined &&
      durationDeltaMs <= input.tolerance_ms,
    detail: actualDurationMs === undefined
      ? "无法读取输出时长"
      : durationDeltaMs === undefined
        ? "无法计算输出时长误差"
        : `输出时长 ${actualDurationMs}ms，期望 ${input.expected_duration_ms}ms，误差 ${durationDeltaMs}ms，容差 ${input.tolerance_ms}ms`
  });
  checks.push({
    check: "video_stream",
    passed: input.probe.has_video_stream,
    detail: input.probe.has_video_stream ? "输出包含视频流" : "输出缺少视频流"
  });
  checks.push({
    check: "audio_stream",
    passed: sourceHasAudio !== true || input.probe.has_audio_stream,
    detail: sourceHasAudio === true
      ? (input.probe.has_audio_stream ? "输出保留音轨" : "源视频有音轨但输出缺少音轨")
      : "源视频无音轨或音轨信息未知，跳过音轨存在性检查"
  });
  checks.push({
    check: "first_frame_pts",
    passed:
      firstFramePtsMs !== undefined &&
      Math.abs(firstFramePtsMs) <= FIRST_FRAME_PTS_TOLERANCE_MS,
    detail: firstFramePtsMs === undefined
      ? "无法读取输出首帧 PTS"
      : `输出首帧 PTS ${firstFramePtsMs}ms，允许偏差 ${FIRST_FRAME_PTS_TOLERANCE_MS}ms`
  });
  checks.push({
    check: "av_duration_delta",
    passed:
      videoDurationMs === undefined ||
      audioDurationMs === undefined ||
      Math.abs(videoDurationMs - audioDurationMs) <= AV_DURATION_DELTA_TOLERANCE_MS,
    detail:
      videoDurationMs === undefined || audioDurationMs === undefined
        ? "缺少音视频流时长，跳过音画时长差检查"
        : `视频流 ${videoDurationMs}ms、音频流 ${audioDurationMs}ms，时长差 ${Math.abs(videoDurationMs - audioDurationMs)}ms，阈值 ${AV_DURATION_DELTA_TOLERANCE_MS}ms`
  });

  return {
    passed: checks.every((check) => check.passed),
    expected_duration_ms: input.expected_duration_ms,
    ...(actualDurationMs !== undefined ? { actual_duration_ms: actualDurationMs } : {}),
    tolerance_ms: input.tolerance_ms,
    checks
  };
}

function failedVerificationChecks(verification: CutOutputVerification): string {
  const failed = verification.checks.filter((check) => !check.passed);
  return failed.length > 0
    ? failed.map((check) => check.detail).join("；")
    : "输出验收未通过";
}

function workspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("workspace artifact path must be workspace-relative");
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("workspace artifact path must be workspace-relative");
  }

  return path.join(workspaceRoot, ...parts);
}

function formatSrtTime(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const ms = safe % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function transcriptTextMetadata(text: string, beginChar: number): {
  begin_char: number;
  end_char: number;
  normalized_begin_char: number;
  normalized_end_char: number;
  normalized_text: string;
} {
  const normalizedText = text.replace(/\s+/g, "");

  return {
    begin_char: beginChar,
    end_char: beginChar + text.length,
    normalized_begin_char: beginChar,
    normalized_end_char: beginChar + normalizedText.length,
    normalized_text: normalizedText
  };
}

function fallbackTranscriptSegment(input: {
  export_clip_id: string;
  duration_ms: number;
  selected_text: string;
}): TranscriptSegment {
  const text = input.selected_text.trim();

  return {
    segment_id: `${input.export_clip_id}-S000001`,
    index: 1,
    begin_ms: 0,
    end_ms: input.duration_ms,
    ...transcriptTextMetadata(text, 0),
    text,
    confidence: 1,
    // 选区落在单句内：文字是精确选区，但时间范围沿用整句（属估算，不冒充逐字对齐）。
    text_scope: "selected_text_estimated_timing"
  } as TranscriptSegment;
}

function localTranscriptSegments(input: {
  export_clip_id: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  source_segments?: TranscriptSegment[];
}): TranscriptSegment[] {
  const durationMs = Math.max(0, input.end_ms - input.begin_ms);
  const sourceSegments = input.source_segments ?? [];
  const overlapping = sourceSegments.filter(
    (segment) => segment.end_ms > input.begin_ms && segment.begin_ms < input.end_ms
  );

  const first = overlapping[0];
  const last = overlapping[overlapping.length - 1];
  const clipsInsideSourceSegment = Boolean(
    first &&
    last &&
    (input.begin_ms > first.begin_ms || input.end_ms < last.end_ms)
  );

  if (overlapping.length === 0 || clipsInsideSourceSegment) {
    return [fallbackTranscriptSegment({
      export_clip_id: input.export_clip_id,
      duration_ms: durationMs,
      selected_text: input.selected_text
    })];
  }

  let beginChar = 0;

  return overlapping.map((segment, index) => {
    const text = segment.text.trim();
    const metadata = transcriptTextMetadata(text, beginChar);
    beginChar = metadata.end_char + 1;
    const textCoversWholeSegment =
      segment.begin_ms < input.begin_ms || segment.end_ms > input.end_ms;

    return {
      ...segment,
      segment_id: `${input.export_clip_id}-S${String(index + 1).padStart(6, "0")}`,
      index: index + 1,
      begin_ms: Math.max(0, segment.begin_ms - input.begin_ms),
      end_ms: Math.min(durationMs, Math.max(0, segment.end_ms - input.begin_ms)),
      ...metadata,
      text,
      confidence: segment.confidence ?? 1,
      // 字幕只提供句级时间：跨选区边界的整句会"整句带出"，用来源时间与 scope 字段明确表达。
      text_scope: textCoversWholeSegment ? "whole_source_segment" : "exact",
      source_begin_ms: segment.begin_ms,
      source_end_ms: segment.end_ms
    } as TranscriptSegment;
  });
}

function srtFromSegments(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((segment, index) => [
      String(index + 1),
      `${formatSrtTime(segment.begin_ms)} --> ${formatSrtTime(segment.end_ms)}`,
      segment.text
    ].join("\n"))
    .join("\n\n") + "\n";
}

async function linkOrCopyFile(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await link(sourcePath, targetPath);
  } catch {
    await copyFile(sourcePath, targetPath);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

function localVideoArtifactPath(exportClipId: string, fileName: string): string {
  return `.mixlab-library/videos/${exportClipId}/${fileName}`;
}

async function writePlaceholderSvgCover(input: {
  output_path: string;
  title: string;
}): Promise<void> {
  const title = input.title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1f2937"/><text x="32" y="188" fill="#f9fafb" font-family="Arial, sans-serif" font-size="28">${title}</text></svg>\n`;

  await mkdir(path.dirname(input.output_path), { recursive: true });
  await writeFile(input.output_path, svg, "utf8");
}

async function writePreprocessedLocalAsset(input: {
  workspace_root: string;
  export_clip_id: string;
  title: string;
  library_id: string;
  source_video_id: string;
  source_title: string;
  output_media_file_path: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  created_at: string;
  source: CutJobSourceDetail;
  /** 成片实测元数据（ffprobe）；缺失时清单标记 unknown，不再用请求时长/0 冒充。 */
  measured_media?: CutOutputProbeResult;
  cover_runner?: CoverRunner;
  before_cover?: () => Promise<void>;
  after_cover?: () => Promise<void>;
}): Promise<{
  local_asset_relative_path: string;
  source_video_manifest_path: string;
  transcript_path: string;
  srt_path: string;
  keyframes_path: string;
  cover_path: string;
  file_size: number;
  content_hash: string;
  transcript_segments: TranscriptSegment[];
  width: number;
  height: number;
  fps: number;
  codec: string;
}> {
  const durationMs = Math.max(0, input.end_ms - input.begin_ms);
  const measuredDurationMs = normalizeProbeMilliseconds(input.measured_media?.duration_ms);
  const durationUnknown = measuredDurationMs === undefined;
  const fallbackWidth = normalizeProbeMilliseconds(input.measured_media?.width) ?? normalizeProbeMilliseconds(input.source.width);
  const fallbackHeight = normalizeProbeMilliseconds(input.measured_media?.height) ?? normalizeProbeMilliseconds(input.source.height);
  const fallbackFps = typeof input.measured_media?.fps === "number" && Number.isFinite(input.measured_media.fps) && input.measured_media.fps > 0
    ? input.measured_media.fps
    : (typeof input.source.fps === "number" && Number.isFinite(input.source.fps) && input.source.fps > 0 ? input.source.fps : 0);
  const fallbackCodec =
    (typeof input.measured_media?.codec === "string" && input.measured_media.codec.trim()) ||
    (typeof input.source.codec === "string" ? input.source.codec.trim() : "") ||
    "";
  const visualMetadataFromProbe = Boolean(input.measured_media && fallbackWidth && fallbackHeight);
  const localAssetRelativePath = localVideoArtifactPath(input.export_clip_id, "source.mp4");
  const transcriptPath = localVideoArtifactPath(input.export_clip_id, "transcript.json");
  const srtPath = localVideoArtifactPath(input.export_clip_id, "subtitles.srt");
  const keyframesPath = localVideoArtifactPath(input.export_clip_id, "keyframes.json");
  const coverPath = localVideoArtifactPath(input.export_clip_id, input.cover_runner ? "cover.jpg" : "cover.svg");
  const localMediaPath = workspaceRelativePath(input.workspace_root, localAssetRelativePath);
  const coverFilePath = workspaceRelativePath(input.workspace_root, coverPath);
  const transcriptSegments = localTranscriptSegments({
    export_clip_id: input.export_clip_id,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    selected_text: input.selected_text,
    source_segments: input.source.transcript_segments
  });
  const fullText = transcriptSegments.map((segment) => segment.text).join(" ");

  await linkOrCopyFile(input.output_media_file_path, localMediaPath);
  await mkdir(path.dirname(workspaceRelativePath(input.workspace_root, transcriptPath)), {
    recursive: true
  });
  await writeFile(
    workspaceRelativePath(input.workspace_root, transcriptPath),
    jsonBytes({
      schema_version: "1.0",
      source_video_id: input.export_clip_id,
      provider: "mixlab-local-cut",
      model: "source-transcript-span",
      generated_at: input.created_at,
      duration_ms: measuredDurationMs ?? durationMs,
      ...(durationUnknown ? { duration_unknown: true } : {}),
      full_text: fullText,
      segments: transcriptSegments
    }),
    "utf8"
  );
  await writeFile(workspaceRelativePath(input.workspace_root, srtPath), srtFromSegments(transcriptSegments), "utf8");
  await writeFile(
    workspaceRelativePath(input.workspace_root, keyframesPath),
    jsonBytes({
      schema_version: "1.0",
      keyframes_ms: [0, Math.min(measuredDurationMs ?? durationMs, 1000)].filter((value, index, values) => index === 0 || value !== values[0])
    }),
    "utf8"
  );

  await input.before_cover?.();
  if (input.cover_runner) {
    await mkdir(path.dirname(coverFilePath), { recursive: true });
    await input.cover_runner({
      source_video_path: input.output_media_file_path,
      output_path: coverFilePath,
      at_ms: Math.min(1000, Math.floor((measuredDurationMs ?? durationMs) / 2)),
      width: 640
    });
  } else {
    await writePlaceholderSvgCover({
      output_path: coverFilePath,
      title: input.title
    });
  }
  await input.after_cover?.();

  const mediaStat = await stat(input.output_media_file_path);
  const width = fallbackWidth ?? 0;
  const height = fallbackHeight ?? 0;
  const fps = fallbackFps;
  const codec = fallbackCodec;
  const metadataSource = visualMetadataFromProbe
    ? "probe"
    : width > 0 && height > 0
      ? "source_manifest"
      : "unknown";
  const sourceVideoManifest: SourceVideoManifest = {
    source_video_id: input.export_clip_id,
    title: input.title,
    relative_path: localAssetRelativePath,
    logical_uri: `mixlab-local://export-clips/${input.export_clip_id}`,
    duration_ms: measuredDurationMs ?? 0,
    width,
    height,
    fps,
    codec,
    file_size: mediaStat.size,
    content_hash: await sha256File(input.output_media_file_path),
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: transcriptPath,
    srt_path: srtPath,
    keyframes_path: keyframesPath,
    cover_path: coverPath,
    description: `剪切自 ${input.source_title}`,
    tags: ["本地剪切素材"]
  };
  const validation = validateSourceVideoManifest(sourceVideoManifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const sourceVideoManifestPath = localVideoArtifactPath(input.export_clip_id, "source-video.json");
  const hasWholeSegmentText = transcriptSegments.some(
    (segment) => (segment as TranscriptSegment & { text_scope?: string }).text_scope === "whole_source_segment"
  );
  await writeFile(
    workspaceRelativePath(input.workspace_root, sourceVideoManifestPath),
    // 扩展字段（协议不校验这些字段，旧客户端可忽略）：明确标注实测/未知来源。
    jsonBytes({
      ...sourceVideoManifest,
      duration_unknown: durationUnknown,
      duration_source: durationUnknown ? "unknown" : "probe",
      visual_metadata_source: metadataSource,
      transcript_text_scope: hasWholeSegmentText ? "whole_segment" : "exact_or_selected"
    }),
    "utf8"
  );

  return {
    local_asset_relative_path: localAssetRelativePath,
    source_video_manifest_path: sourceVideoManifestPath,
    transcript_path: transcriptPath,
    srt_path: srtPath,
    keyframes_path: keyframesPath,
    cover_path: coverPath,
    file_size: mediaStat.size,
    content_hash: sourceVideoManifest.content_hash,
    transcript_segments: transcriptSegments,
    width,
    height,
    fps,
    codec
  };
}

export async function runNextCutJob(
  input: RunNextCutJobInput
): Promise<CutJobManifest | null> {
  return withWorkspaceRunNextLock(input.workspace_root, () => runNextCutJobUnlocked(input));
}

export async function runCutJob(
  input: RunCutJobInput
): Promise<CutJobManifest | null> {
  assertCutJobId(input.cut_job_id);
  return withWorkspaceRunNextLock(input.workspace_root, () => runCutJobUnlocked(input));
}

async function runNextCutJobUnlocked(
  input: RunNextCutJobInput
): Promise<CutJobManifest | null> {
  const pending = oldestPendingJob(await readAllCutJobs(input.workspace_root));

  if (!pending) {
    return null;
  }

  return runPendingCutJobUnlocked(input, pending);
}

async function runCutJobUnlocked(
  input: RunCutJobInput
): Promise<CutJobManifest | null> {
  const pending = (await readAllCutJobs(input.workspace_root))
    .find((job) => job.cut_job_id === input.cut_job_id && job.status === "pending") ?? null;

  if (!pending) {
    return null;
  }

  return runPendingCutJobUnlocked(input, pending);
}

async function assertCutJobNotCancelled(workspaceRoot: string, cutJobId: string): Promise<void> {
  const latest = await getCutJob({
    workspace_root: workspaceRoot,
    cut_job_id: cutJobId
  });

  if (latest?.status === "cancelled") {
    throw new Error(CUT_JOB_CANCELLED_MESSAGE);
  }
}

async function runPendingCutJobUnlocked(
  input: RunNextCutJobInput,
  pending: CutJobManifest
): Promise<CutJobManifest> {
  const persistPhaseProgress = input.persist_phase_progress ?? true;
  const latestBeforeRun = await getCutJob({
    workspace_root: input.workspace_root,
    cut_job_id: pending.cut_job_id
  });
  if (latestBeforeRun?.status === "cancelled") {
    return latestBeforeRun;
  }

  const startedAt = input.now();
  let running: CutJobManifest = {
    ...pending,
    status: "running",
    started_at: startedAt,
    updated_at: startedAt,
    error_message: undefined,
    current_phase: pending.current_phase ?? "queue_wait",
    phase_timings: pending.phase_timings ?? pendingPhaseTimings()
  };

  running = startPhase(running, "queue_wait", pending.created_at);
  running = finishPhase(running, "queue_wait", startedAt);
  if (persistPhaseProgress) {
    await writeCutJob(input.workspace_root, running);
  }

  try {
    async function runPhase<T>(
      phaseId: CutJobPhaseId,
      task: () => Promise<T> | T
    ): Promise<T> {
      await assertCutJobNotCancelled(input.workspace_root, running.cut_job_id);
      running = startPhase(running, phaseId, input.now());
      if (persistPhaseProgress) {
        await writeCutJob(input.workspace_root, running);
      }
      const result = await task();
      await assertCutJobNotCancelled(input.workspace_root, running.cut_job_id);
      running = finishPhase(running, phaseId, input.now());
      if (persistPhaseProgress) {
        await writeCutJob(input.workspace_root, running);
      }
      return result;
    }

    const source = await runPhase("resolve_source", async () => input.resolve_source(running));

    if (!source) {
      throw new Error("源视频不可读：请确认 Windows 已连接公共素材库的 source-videos 目录，并且公共素材库根目录选择的是 PublicLibrary 根目录");
    }

    const preflight = await runPhase("preflight_source", async () => {
      return assertCutJobPreflight({
        job: running,
        source,
        ...(input.source_duration_probe ? { source_duration_probe: input.source_duration_probe } : {})
      });
    });
    const sourceDurationMs = preflight.source_duration_ms;

    const exportClipId = await allocateNextExportClipId(input.workspace_root);
    const projectOutputFile = buildProjectClipOutputFile({
      project_clip_order: running.project_clip_order,
      project_title: running.project_title,
      source_title: running.source_title
    });
    const exportPaths = buildExportClipArtifactPaths({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      selected_text: running.selected_text,
      project_title: running.project_title,
      project_clip_order: running.project_clip_order,
      source_title: running.source_title
    });
    const title = buildCanonicalClipTitle({
      project_clip_order: running.project_clip_order,
      project_title: running.project_title,
      source_title: running.source_title
    });
    let measuredOutputMedia: CutOutputProbeResult | undefined;

    await runPhase("cut_media", async () => {
      const tempOutputPath = cutTempOutputPath({
        workspace_root: input.workspace_root,
        cut_job_id: running.cut_job_id,
        export_clip_id: exportClipId
      });

      await mkdir(path.dirname(tempOutputPath), { recursive: true });
      const releaseTempCachePin = pinCachePath(tempOutputPath);
      const abortController = new AbortController();
      registerActiveCutJobAbort(input.workspace_root, running.cut_job_id, abortController);

      try {
        let cutModeUsed: CutMode = running.cut_mode;
        let degradeReason: string | undefined;
        let keyframeDistanceMs: number | undefined;

        // copy 只能从关键帧起切；起点远离关键帧时自动降级 precise，避免静默音画偏移。
        if (running.cut_mode === "copy" && input.keyframe_probe) {
          try {
            const keyframes = await input.keyframe_probe({
              source_video_path: source.source_video_file_path,
              begin_ms: running.begin_ms
            });
            const decision = decideCopyCutMode({
              cut_mode: "copy",
              begin_ms: running.begin_ms,
              keyframe_times_ms: keyframes?.keyframe_times_ms ?? []
            });
            cutModeUsed = decision.cut_mode_used;
            degradeReason = decision.degrade_reason;
            keyframeDistanceMs = decision.keyframe_distance_ms;
          } catch (error) {
            cutModeUsed = "precise";
            degradeReason = `关键帧探测失败，已自动降级为精准剪切：${errorMessage(error)}`;
          }
        }

        running = {
          ...running,
          cut_mode_used: cutModeUsed,
          ...(degradeReason ? { degrade_reason: degradeReason } : {})
        };
        if (persistPhaseProgress) {
          await writeCutJob(input.workspace_root, running);
        }

        const timeoutMs = resolveCutJobTimeoutMs({
          range_ms: running.end_ms - running.begin_ms,
          ...(input.cut_timeout_ms !== undefined ? { override_ms: input.cut_timeout_ms } : {}),
          ...(input.cut_timeout_ms_max !== undefined ? { max_ms: input.cut_timeout_ms_max } : {})
        });

        await withCutTimeout(
          Promise.resolve().then(() =>
            input.cut_runner({
              source_video_path: source.source_video_file_path,
              output_path: tempOutputPath,
              begin_ms: running.begin_ms,
              end_ms: running.end_ms,
              cut_mode: cutModeUsed,
              signal: abortController.signal
            })
          ),
          timeoutMs,
          () => {
            abortController.abort();
            throw new CutJobFailure(
              "CUT_TIMEOUT",
              `剪切超时：任务超过 ${Math.round(timeoutMs / 1000)} 秒未完成，已中止。请检查源视频与本机负载后重试。`
            );
          }
        );

        if (input.output_probe) {
          const expectedDurationMs = expectedOutputDurationMs({
            begin_ms: running.begin_ms,
            end_ms: running.end_ms,
            source_duration_ms: sourceDurationMs
          });
          let probeResult: CutOutputProbeResult;

          try {
            probeResult = await input.output_probe({
              output_path: tempOutputPath,
              source_path: source.source_video_file_path,
              cut_mode: cutModeUsed
            });
          } catch (error) {
            throw new CutJobFailure(
              "CUT_OUTPUT_MISMATCH",
              `输出校验未通过：无法读取输出文件信息（${errorMessage(error)}）`
            );
          }

          const toleranceMs = outputToleranceMs({
            cut_mode_used: cutModeUsed,
            ...(keyframeDistanceMs !== undefined ? { keyframe_distance_ms: keyframeDistanceMs } : {})
          });
          const verification = buildCutOutputVerification({
            expected_duration_ms: expectedDurationMs,
            tolerance_ms: toleranceMs,
            probe: probeResult,
            cut_mode_used: cutModeUsed,
            ...(keyframeDistanceMs !== undefined ? { keyframe_distance_ms: keyframeDistanceMs } : {})
          });

          measuredOutputMedia = probeResult;
          running = {
            ...running,
            cut_mode_used: cutModeUsed,
            verification
          };
          if (persistPhaseProgress) {
            await writeCutJob(input.workspace_root, running);
          }

          if (!verification.passed) {
            throw new CutJobFailure(
              "CUT_OUTPUT_MISMATCH",
              `输出校验未通过：${failedVerificationChecks(verification)}`
            );
          }
        }

        await moveOrCopyFile(tempOutputPath, exportPaths.media_file_path);
      } finally {
        unregisterActiveCutJobAbort(input.workspace_root, running.cut_job_id);
        await rm(tempOutputPath, { force: true });
        releaseTempCachePin();
        await pruneDirectFileCache({
          root: cutTempRoot(input.workspace_root),
          max_bytes: cutTempMaxBytes(input.cut_temp_max_bytes)
        });
      }
    });

    await runPhase("write_project_output", async () => {
      await linkOrCopyFile(
        exportPaths.media_file_path,
        workspaceRelativePath(input.workspace_root, projectOutputFile)
      );
    });

    await assertCutJobNotCancelled(input.workspace_root, running.cut_job_id);
    running = startPhase(running, "preprocess_local_asset", input.now());
    await writeCutJob(input.workspace_root, running);
    const localAsset = await writePreprocessedLocalAsset({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      title,
      library_id: running.library_id,
      source_video_id: running.source_video_id,
      source_title: running.source_title,
      output_media_file_path: exportPaths.media_file_path,
      begin_ms: running.begin_ms,
      end_ms: running.end_ms,
      selected_text: running.selected_text,
      created_at: input.now(),
      source,
      ...(measuredOutputMedia ? { measured_media: measuredOutputMedia } : {}),
      cover_runner: input.cover_runner,
      before_cover: async () => {
        running = finishPhase(running, "preprocess_local_asset", input.now());
        if (persistPhaseProgress) {
          await writeCutJob(input.workspace_root, running);
        }
        running = startPhase(running, "generate_cover", input.now());
        if (persistPhaseProgress) {
          await writeCutJob(input.workspace_root, running);
        }
      },
      after_cover: async () => {
        running = finishPhase(running, "generate_cover", input.now());
        if (persistPhaseProgress) {
          await writeCutJob(input.workspace_root, running);
        }
        running = startPhase(running, "write_manifest", input.now());
        if (persistPhaseProgress) {
          await writeCutJob(input.workspace_root, running);
        }
      }
    });

    await assertCutJobNotCancelled(input.workspace_root, running.cut_job_id);
    await writeExportClipManifest({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      library_id: running.library_id,
      source_video_id: running.source_video_id,
      title,
      project_title: running.project_title,
      project_id: running.project_id,
      project_clip_order: running.project_clip_order,
      source_title: running.source_title,
      begin_ms: running.begin_ms,
      end_ms: running.end_ms,
      selected_text: running.selected_text,
      cut_mode: running.cut_mode_used ?? running.cut_mode,
      output_file: exportPaths.output_file,
      project_output_file: projectOutputFile,
      local_asset_relative_path: localAsset.local_asset_relative_path,
      source_video_manifest_path: localAsset.source_video_manifest_path,
      transcript_path: localAsset.transcript_path,
      srt_path: localAsset.srt_path,
      keyframes_path: localAsset.keyframes_path,
      cover_path: localAsset.cover_path,
      width: localAsset.width,
      height: localAsset.height,
      fps: localAsset.fps,
      codec: localAsset.codec,
      file_size: localAsset.file_size,
      content_hash: localAsset.content_hash,
      transcript_segments: localAsset.transcript_segments,
      created_at: input.now()
    });
    running = finishPhase(running, "write_manifest", input.now());

    await assertCutJobNotCancelled(input.workspace_root, running.cut_job_id);
    running = {
      ...running,
      status: "done",
      title,
      export_clip_id: exportClipId,
      output_file: exportPaths.output_file,
      finished_at: input.now(),
      updated_at: input.now()
    };
    await writeCutJob(input.workspace_root, running);
    return running;
  } catch (error) {
    // 取消可能由另一个请求/进程写入；以任务文件的最新状态为准，避免把已取消任务改成 failed。
    const latest = await getCutJob({
      workspace_root: input.workspace_root,
      cut_job_id: running.cut_job_id
    });
    if (latest?.status === "cancelled") {
      return latest;
    }

    const failedAt = input.now();
    const failedPhaseId = running.current_phase ?? "queue_wait";
    running = failPhase(running, failedPhaseId, failedAt);
    const failureCode = cutJobFailureCode(error);
    const failed: CutJobManifest = {
      ...running,
      status: "failed",
      error_message: errorMessage(error),
      ...(failureCode ? { error_code: failureCode } : {}),
      finished_at: failedAt,
      updated_at: failedAt
    };
    await writeCutJob(input.workspace_root, failed);
    return failed;
  }
}

/** 进程启动时把上次异常退出遗留的 running 任务降级为 failed，允许用户重试。 */
export async function recoverInterruptedCutJobs(input: {
  workspace_root: string;
  now: string;
}): Promise<CutJobManifest[]> {
  return withWorkspaceQueueMutationLock(input.workspace_root, async () => {
    const nowMs = Date.parse(input.now);
    await cleanupStaleCutJobStagingDirectories(
      input.workspace_root,
      Number.isFinite(nowMs) ? nowMs : Date.now()
    );
    const jobs = await readAllCutJobs(input.workspace_root);
    const recovered: CutJobManifest[] = [];

    for (const job of jobs) {
      if (job.status !== "running") {
        continue;
      }

      const phaseTimings = ensurePhaseTimings(job).map((phase) =>
        phase.status === "running"
          ? {
              ...phase,
              status: "failed" as const,
              finished_at: input.now,
              duration_ms: durationMs(phase.started_at, input.now)
            }
          : { ...phase }
      );
      const next: CutJobManifest = {
        ...job,
        status: "failed",
        error_code: "CUT_PROCESS_INTERRUPTED",
        error_message: "剪切进程中断：上次任务未正常结束（进程退出或崩溃），请重试。",
        phase_timings: phaseTimings,
        finished_at: input.now,
        updated_at: input.now
      };
      await writeCutJob(input.workspace_root, next);
      recovered.push(next);
    }

    return recovered;
  });
}
