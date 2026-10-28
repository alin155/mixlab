import type {
  AdminRuntimePolicy
} from "../../library-fs/src/index.ts";
import type {
  AdminLibraryScanNewCommandResult
} from "./admin-library-commands.ts";
import {
  adminCommandSystemActor,
  type AdminCommandActor
} from "./admin-command-audit.ts";
import type {
  PreprocessSupervisorRunInput,
  PreprocessSupervisorStatus
} from "./preprocess-supervisor.ts";

export type AdminDailyScanAutoPreprocessReason =
  | "started"
  | "no-new-materials"
  | "preprocess-not-idle"
  | "auto-scan-disabled";

export interface AdminDailyScanOnceResult {
  scan_new_video_count: number;
  auto_preprocess: {
    started: boolean;
    reason: AdminDailyScanAutoPreprocessReason;
    supervisor_state_before: PreprocessSupervisorStatus["state"];
    supervisor_state_after: PreprocessSupervisorStatus["state"];
  };
}

export interface AdminDailyScanSchedulerStatus {
  enabled: boolean;
  hour: number;
  running: boolean;
  next_run_at: string;
  last_started_at: string;
  last_completed_at: string;
  last_error: string;
  last_result: AdminDailyScanOnceResult | null;
}

export interface AdminDailyScanOnceInput<TSafety> {
  library_root: string;
  library_id: string;
  library_name: string;
  command_now: string;
  now?: () => string;
  env: NodeJS.ProcessEnv;
  preprocess_runner_available: boolean;
  run_library_scan_new(input: {
    library_root: string;
    library_id: string;
    library_name: string;
    command_now: string;
    now?: () => string;
    actor?: AdminCommandActor;
  }): Promise<AdminLibraryScanNewCommandResult>;
  schedule_read_model_reconcile_after_scan(input: {
    handoff: AdminLibraryScanNewCommandResult["read_model"];
  }): unknown;
  clear_source_video_page_cache(libraryRoot: string): void;
  read_admin_settings(libraryRoot: string): Promise<{ runtime_policy: AdminRuntimePolicy }>;
  refresh_runtime_secrets(): Promise<void>;
  assert_real_preprocess_start_ready(env: NodeJS.ProcessEnv): void;
  read_preprocess_safety(): Promise<TSafety>;
  assert_preprocess_safe_to_start(safety: TSafety): void;
  read_preprocess_supervisor_status(): PreprocessSupervisorStatus;
  start_preprocess_supervisor(input: PreprocessSupervisorRunInput): PreprocessSupervisorStatus;
}

export interface CreateAdminDailyScanSchedulerInput {
  env?: NodeJS.ProcessEnv;
  hour?: number;
  now?: () => string;
  run_once(): Promise<AdminDailyScanOnceResult>;
  set_timeout?: typeof setTimeout;
  clear_timeout?: typeof clearTimeout;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function schedulerNow(input: { now?: () => string }): string {
  return input.now?.() ?? new Date().toISOString();
}

/**
 * Daily auto scan is opt-in only: missing env (or "0"/"false") keeps it disabled so a
 * deployment never starts scanning/preprocessing on its own after an upgrade.
 */
export function resolveAdminDailyScanSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.MIXLAB_ADMIN_DAILY_SCAN_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function resolveAdminDailyScanHour(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt((env.MIXLAB_ADMIN_DAILY_SCAN_HOUR ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 0;
}

export function nextAdminDailyScanRunAt(from: Date, hour = 0): Date {
  const next = new Date(from);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function scheduledPreprocessRuntimePolicy(runtimePolicy: AdminRuntimePolicy): AdminRuntimePolicy {
  return {
    ...runtimePolicy,
    // The scheduled scan already ran; reuse the admin's auto-queue preference instead of forcing it on.
    auto_scan_enabled: false
  };
}

export async function runAdminDailyScanOnce<TSafety>(
  input: AdminDailyScanOnceInput<TSafety>
): Promise<AdminDailyScanOnceResult> {
  const settings = await input.read_admin_settings(input.library_root);
  const supervisorBefore = input.read_preprocess_supervisor_status();

  if (!settings.runtime_policy.auto_scan_enabled) {
    return {
      scan_new_video_count: 0,
      auto_preprocess: {
        started: false,
        reason: "auto-scan-disabled",
        supervisor_state_before: supervisorBefore.state,
        supervisor_state_after: supervisorBefore.state
      }
    };
  }

  const scanResult = await input.run_library_scan_new({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    command_now: input.command_now,
    now: input.now,
    actor: adminCommandSystemActor("每日自动扫描新增素材", "system-task")
  });
  input.schedule_read_model_reconcile_after_scan({
    handoff: scanResult.read_model
  });
  input.clear_source_video_page_cache(input.library_root);

  const baseResult = {
    scan_new_video_count: scanResult.new_video_count,
    auto_preprocess: {
      started: false,
      reason: "no-new-materials" as AdminDailyScanAutoPreprocessReason,
      supervisor_state_before: supervisorBefore.state,
      supervisor_state_after: supervisorBefore.state
    }
  };

  if (scanResult.new_video_count <= 0) {
    return baseResult;
  }

  if (supervisorBefore.state !== "idle") {
    return {
      ...baseResult,
      auto_preprocess: {
        ...baseResult.auto_preprocess,
        reason: "preprocess-not-idle"
      }
    };
  }

  await input.refresh_runtime_secrets();
  if (!input.preprocess_runner_available) {
    input.assert_real_preprocess_start_ready(input.env);
  }
  const safety = await input.read_preprocess_safety();
  input.assert_preprocess_safe_to_start(safety);
  const supervisorAfter = input.start_preprocess_supervisor({
    runtime_policy: scheduledPreprocessRuntimePolicy(settings.runtime_policy)
  });

  return {
    scan_new_video_count: scanResult.new_video_count,
    auto_preprocess: {
      started: true,
      reason: "started",
      supervisor_state_before: supervisorBefore.state,
      supervisor_state_after: supervisorAfter.state
    }
  };
}

export function createAdminDailyScanScheduler(
  input: CreateAdminDailyScanSchedulerInput
) {
  const enabled = resolveAdminDailyScanSchedulerEnabled(input.env);
  const hour = input.hour ?? resolveAdminDailyScanHour(input.env);
  const setTimer = input.set_timeout ?? setTimeout;
  const clearTimer = input.clear_timeout ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let running = false;
  let nextRunAt = "";
  let lastStartedAt = "";
  let lastCompletedAt = "";
  let lastError = "";
  let lastResult: AdminDailyScanOnceResult | null = null;

  function clearCurrentTimer(): void {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  }

  function scheduleNext(): void {
    clearCurrentTimer();
    if (!enabled || !started) {
      nextRunAt = "";
      return;
    }

    const now = new Date(schedulerNow(input));
    const next = nextAdminDailyScanRunAt(now, hour);
    nextRunAt = next.toISOString();
    const delayMs = Math.max(1, next.getTime() - now.getTime());
    timer = setTimer(() => {
      void runScheduled().finally(scheduleNext);
    }, delayMs);
    timer.unref?.();
  }

  async function runScheduled(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    lastStartedAt = schedulerNow(input);
    try {
      lastResult = await input.run_once();
      lastError = "";
    } catch (error) {
      lastError = errorMessage(error);
    } finally {
      lastCompletedAt = schedulerNow(input);
      running = false;
    }
  }

  return {
    start(): AdminDailyScanSchedulerStatus {
      if (!started) {
        started = true;
        scheduleNext();
      }
      return this.status();
    },
    stop(): AdminDailyScanSchedulerStatus {
      started = false;
      clearCurrentTimer();
      nextRunAt = "";
      return this.status();
    },
    run_now: runScheduled,
    status(): AdminDailyScanSchedulerStatus {
      return {
        enabled,
        hour,
        running,
        next_run_at: nextRunAt,
        last_started_at: lastStartedAt,
        last_completed_at: lastCompletedAt,
        last_error: lastError,
        last_result: lastResult
      };
    }
  };
}
