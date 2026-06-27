import type {
  LibraryCounts,
  SourceVideoManifest
} from "../../protocol/src/index.ts";
import {
  reconcileAdminReadModelStoreFromManifestSnapshot,
  type AdminReadModelStorePreprocessJobSnapshot,
  type AdminReadModelStoreReconciliationResult
} from "./admin-read-model-store.ts";

export type AdminReadModelReconcilerRunStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "skipped"
  | "cancelled"
  | "failed";

export type AdminReadModelReconcilerPhase =
  | "idle"
  | "starting"
  | "scanning"
  | "writing"
  | "completed"
  | "cancelled"
  | "failed";

export type AdminReadModelReconcilerProgressStep =
  | "idle"
  | "starting"
  | "library-manifest"
  | "source-video-manifests"
  | "preprocess-job-snapshots"
  | "writing"
  | "completed"
  | "cancelled"
  | "failed";

export type AdminReadModelReconcilerEventType =
  | "started"
  | "progress"
  | "cancel-requested"
  | "cancelled"
  | "succeeded"
  | "skipped"
  | "failed";

export interface AdminReadModelReconcilerProgress {
  scanned_source_video_count: number;
  total_source_video_count: number;
  preprocess_job_snapshot_count: number;
  total_preprocess_job_snapshot_count: number;
  current_step: AdminReadModelReconcilerProgressStep;
  step_completed_count: number;
  step_total_count: number;
  step_percent: number;
  percent: number;
  message: string;
}

export interface AdminReadModelReconcilerEvent {
  at: string;
  event_type: AdminReadModelReconcilerEventType;
  phase: AdminReadModelReconcilerPhase;
  message: string;
  scanned_source_video_count: number;
  total_source_video_count: number;
  preprocess_job_snapshot_count: number;
  total_preprocess_job_snapshot_count: number;
  current_step: AdminReadModelReconcilerProgressStep;
  step_completed_count: number;
  step_total_count: number;
  step_percent: number;
}

export interface AdminReadModelReconcilerStatus {
  schema_version: "1.0";
  command: "read-model-reconcile";
  status: AdminReadModelReconcilerRunStatus;
  phase: AdminReadModelReconcilerPhase;
  scan_mode: "full-reconcile";
  cancel_requested: boolean;
  started_at: string;
  finished_at: string;
  snapshot_video_count: number;
  progress: AdminReadModelReconcilerProgress;
  events: AdminReadModelReconcilerEvent[];
  message: string;
  result: AdminReadModelStoreReconciliationResult | null;
  error_code: string;
  error_message: string;
}

export interface AdminReadModelReconcilerStartResult {
  accepted: boolean;
  status: AdminReadModelReconcilerStatus;
}

export interface AdminReadModelReconcilerCancelResult {
  accepted: boolean;
  status: AdminReadModelReconcilerStatus;
}

export interface AdminReadModelReconcileSnapshot {
  library: LibraryCounts & { updated_at?: string } | null;
  manifests: SourceVideoManifest[];
  preprocess_jobs?: AdminReadModelStorePreprocessJobSnapshot[];
}

export interface AdminReadModelReconcileControl {
  signal: AbortSignal;
  update_progress: (input: Partial<AdminReadModelReconcilerProgress> & {
    phase?: AdminReadModelReconcilerPhase;
    step?: AdminReadModelReconcilerProgressStep;
  }) => void;
  assert_not_cancelled: () => void;
}

export interface AdminReadModelReconcilerInput {
  library_root: string;
  default_page_limit: number;
  now: () => string;
  read_snapshot: (
    control: AdminReadModelReconcileControl
  ) => Promise<AdminReadModelReconcileSnapshot>;
  run_command: (
    operation: () => Promise<AdminReadModelStoreReconciliationResult>
  ) => Promise<AdminReadModelStoreReconciliationResult>;
  record_event?: (event: AdminReadModelReconcilerEvent) => void | Promise<void>;
}

class AdminReadModelReconcileCancelledError extends Error {
  constructor() {
    super("读模型后台对账已取消。");
    this.name = "AdminReadModelReconcileCancelledError";
  }
}

function emptyProgress(message: string): AdminReadModelReconcilerProgress {
  return {
    scanned_source_video_count: 0,
    total_source_video_count: 0,
    preprocess_job_snapshot_count: 0,
    total_preprocess_job_snapshot_count: 0,
    current_step: "idle",
    step_completed_count: 0,
    step_total_count: 0,
    step_percent: 0,
    percent: 0,
    message
  };
}

function progressPercent(scanned: number, total: number): number {
  if (total <= 0) {
    return scanned > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((scanned / total) * 100)));
}

function appendEvent(
  events: AdminReadModelReconcilerEvent[],
  event: AdminReadModelReconcilerEvent
): AdminReadModelReconcilerEvent[] {
  return [...events, event].slice(-8);
}

function idleStatus(): AdminReadModelReconcilerStatus {
  const message = "读模型后台对账尚未运行。";

  return {
    schema_version: "1.0",
    command: "read-model-reconcile",
    status: "idle",
    phase: "idle",
    scan_mode: "full-reconcile",
    cancel_requested: false,
    started_at: "",
    finished_at: "",
    snapshot_video_count: 0,
    progress: emptyProgress(message),
    events: [],
    message,
    result: null,
    error_code: "",
    error_message: ""
  };
}

function runningStatus(startedAt: string): AdminReadModelReconcilerStatus {
  const message = "正在后台对账 admin.sqlite 读模型。";

  return {
    schema_version: "1.0",
    command: "read-model-reconcile",
    status: "running",
    phase: "starting",
    scan_mode: "full-reconcile",
    cancel_requested: false,
    started_at: startedAt,
    finished_at: "",
    snapshot_video_count: 0,
    progress: {
      ...emptyProgress(message),
      current_step: "starting"
    },
    events: [{
      at: startedAt,
      event_type: "started",
      phase: "starting",
      message,
      scanned_source_video_count: 0,
      total_source_video_count: 0,
      preprocess_job_snapshot_count: 0,
      total_preprocess_job_snapshot_count: 0,
      current_step: "starting",
      step_completed_count: 0,
      step_total_count: 0,
      step_percent: 0
    }],
    message,
    result: null,
    error_code: "",
    error_message: ""
  };
}

function resultMessage(result: AdminReadModelStoreReconciliationResult): string {
  if (result.applied) {
    return `已从 ${result.snapshot_video_count} 条 manifest 快照重建 admin.sqlite。`;
  }

  return `读模型对账未写入：${result.reason}。`;
}

export function createAdminReadModelReconciler(
  input: AdminReadModelReconcilerInput
) {
  let state: AdminReadModelReconcilerStatus = idleStatus();
  let pending: Promise<void> | null = null;
  let abortController: AbortController | null = null;

  function status(): AdminReadModelReconcilerStatus {
    return state;
  }

  function recordEvent(
    eventType: AdminReadModelReconcilerEventType,
    message: string,
    phase: AdminReadModelReconcilerPhase = state.phase
  ): void {
    const event = {
      at: input.now(),
      event_type: eventType,
      phase,
      message,
      scanned_source_video_count: state.progress.scanned_source_video_count,
      total_source_video_count: state.progress.total_source_video_count,
      preprocess_job_snapshot_count: state.progress.preprocess_job_snapshot_count,
      total_preprocess_job_snapshot_count: state.progress.total_preprocess_job_snapshot_count,
      current_step: state.progress.current_step,
      step_completed_count: state.progress.step_completed_count,
      step_total_count: state.progress.step_total_count,
      step_percent: state.progress.step_percent
    } satisfies AdminReadModelReconcilerEvent;

    state = {
      ...state,
      events: appendEvent(state.events, event)
    };

    void Promise.resolve(input.record_event?.(event)).catch(() => undefined);
  }

  function updateProgress(
    update: Partial<AdminReadModelReconcilerProgress> & {
      phase?: AdminReadModelReconcilerPhase;
      step?: AdminReadModelReconcilerProgressStep;
    }
  ): void {
    const scanned = update.scanned_source_video_count
      ?? state.progress.scanned_source_video_count;
    const total = update.total_source_video_count
      ?? state.progress.total_source_video_count;
    const preprocessJobSnapshotCount = update.preprocess_job_snapshot_count
      ?? state.progress.preprocess_job_snapshot_count;
    const totalPreprocessJobSnapshotCount = update.total_preprocess_job_snapshot_count
      ?? state.progress.total_preprocess_job_snapshot_count;
    const step = update.step ?? update.current_step ?? state.progress.current_step;
    const stepCompleted = update.step_completed_count
      ?? (step === "source-video-manifests"
        ? scanned
        : step === "preprocess-job-snapshots"
          ? preprocessJobSnapshotCount
          : state.progress.step_completed_count);
    const stepTotal = update.step_total_count
      ?? (step === "source-video-manifests"
        ? total
        : step === "preprocess-job-snapshots"
          ? totalPreprocessJobSnapshotCount
          : state.progress.step_total_count);
    const progress = {
      scanned_source_video_count: scanned,
      total_source_video_count: total,
      preprocess_job_snapshot_count: preprocessJobSnapshotCount,
      total_preprocess_job_snapshot_count: totalPreprocessJobSnapshotCount,
      current_step: step,
      step_completed_count: stepCompleted,
      step_total_count: stepTotal,
      step_percent: update.step_percent ?? progressPercent(stepCompleted, stepTotal),
      percent: update.percent ?? progressPercent(scanned, total),
      message: update.message ?? state.progress.message
    };
    const phase = update.phase ?? state.phase;

    state = {
      ...state,
      phase,
      progress,
      message: progress.message
    };
    recordEvent("progress", progress.message, phase);
  }

  function assertNotCancelled(): void {
    if (abortController?.signal.aborted || state.cancel_requested) {
      throw new AdminReadModelReconcileCancelledError();
    }
  }

  function cancel(): AdminReadModelReconcilerCancelResult {
    if (!pending || !abortController || state.status !== "running") {
      return {
        accepted: false,
        status: state
      };
    }

    if (state.phase === "writing") {
      const message = "读模型对账已进入写入阶段，不能安全取消。";
      state = {
        ...state,
        message,
        progress: {
          ...state.progress,
          message
        }
      };

      return {
        accepted: false,
        status: state
      };
    }

    const message = "已请求取消读模型后台对账；将在下一个安全检查点停止。";
    abortController.abort();
    state = {
      ...state,
      cancel_requested: true,
      message,
      progress: {
        ...state.progress,
        message
      }
    };
    recordEvent("cancel-requested", message, state.phase);

    return {
      accepted: true,
      status: state
    };
  }

  function start(): AdminReadModelReconcilerStartResult {
    if (pending) {
      return {
        accepted: false,
        status: state
      };
    }

    const startedAt = input.now();
    abortController = new AbortController();
    state = runningStatus(startedAt);
    const startedEvent = state.events[0];
    if (startedEvent) {
      void Promise.resolve(input.record_event?.(startedEvent)).catch(() => undefined);
    }
    const control: AdminReadModelReconcileControl = {
      signal: abortController.signal,
      update_progress: updateProgress,
      assert_not_cancelled: assertNotCancelled
    };

    pending = input.run_command(async () => {
      control.assert_not_cancelled();
      control.update_progress({
        phase: "scanning",
        step: "source-video-manifests",
        message: "正在读取 source-video manifest 快照。"
      });
      const snapshot = await input.read_snapshot(control);
      const snapshotTotal = snapshot.library?.video_count ?? snapshot.manifests.length;
      control.update_progress({
        phase: "scanning",
        step: "source-video-manifests",
        scanned_source_video_count: snapshot.manifests.length,
        total_source_video_count: snapshotTotal,
        step_completed_count: snapshot.manifests.length,
        step_total_count: snapshotTotal,
        message: `已读取 ${snapshot.manifests.length} 条 source-video manifest 快照。`
      });
      control.assert_not_cancelled();
      control.update_progress({
        phase: "writing",
        step: "writing",
        scanned_source_video_count: snapshot.manifests.length,
        total_source_video_count: snapshotTotal,
        step_completed_count: 0,
        step_total_count: 1,
        step_percent: 0,
        percent: 95,
        message: "正在写入 admin.sqlite 读模型。"
      });
      return reconcileAdminReadModelStoreFromManifestSnapshot({
        library_root: input.library_root,
        library: snapshot.library,
        manifests: snapshot.manifests,
        preprocess_jobs: snapshot.preprocess_jobs,
        default_page_limit: input.default_page_limit,
        generated_at: input.now()
      });
    })
      .then((result) => {
        const eventType = result.applied ? "succeeded" : "skipped";
        const message = resultMessage(result);
        state = {
          ...state,
          status: result.applied ? "succeeded" : "skipped",
          phase: "completed",
          cancel_requested: false,
          finished_at: input.now(),
          snapshot_video_count: result.snapshot_video_count,
          progress: {
            scanned_source_video_count: result.snapshot_video_count,
            total_source_video_count: result.snapshot_video_count,
            preprocess_job_snapshot_count: state.progress.preprocess_job_snapshot_count,
            total_preprocess_job_snapshot_count: state.progress.total_preprocess_job_snapshot_count,
            current_step: "completed",
            step_completed_count: result.snapshot_video_count,
            step_total_count: result.snapshot_video_count,
            step_percent: 100,
            percent: 100,
            message
          },
          message,
          result,
          error_code: "",
          error_message: ""
        };
        recordEvent(eventType, message, "completed");
      })
      .catch((error) => {
        if (error instanceof AdminReadModelReconcileCancelledError) {
          const message = "读模型后台对账已取消，未写入 admin.sqlite。";
          state = {
            ...state,
            status: "cancelled",
            phase: "cancelled",
            cancel_requested: true,
            finished_at: input.now(),
            message,
            progress: {
              ...state.progress,
              current_step: "cancelled",
              message
            },
            error_code: "",
            error_message: ""
          };
          recordEvent("cancelled", message, "cancelled");
          return;
        }

        const message = "读模型后台对账失败。";
        state = {
          ...state,
          status: "failed",
          phase: "failed",
          finished_at: input.now(),
          message,
          progress: {
            ...state.progress,
            current_step: "failed",
            message
          },
          error_code: error instanceof Error ? error.name : "Error",
          error_message: error instanceof Error ? error.message : String(error)
        };
        recordEvent("failed", message, "failed");
      })
      .finally(() => {
        pending = null;
        abortController = null;
      });

    void pending;

    return {
      accepted: true,
      status: state
    };
  }

  return {
    cancel,
    status,
    start
  };
}
