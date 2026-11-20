import { randomUUID } from "node:crypto";

/**
 * 0.19 容量治理：全局剪切 slot / 租约 / 排队 / 每用户公平 / 搜索优先 / 服务端协调降级。
 * 纯进程内调度（一台剪辑师机器一个 cutter-api 进程），文件锁语义由 workspace 租约保证单写者。
 */

export interface CutCapacityConfig {
  /** 全局最大并发剪切 slot（按 NAS 实测吞吐配置；默认 2，范围 1..8）。 */
  max_concurrent_jobs: number;
  /** 单个剪辑师最多占用 slot 数（默认 1，保证 50 人并发时公平）。 */
  max_jobs_per_user: number;
  /** slot 租约心跳间隔（默认 5s）。 */
  heartbeat_ms: number;
  /** slot 租约超时（默认 120s；超时视为泄漏并回收）。 */
  lease_timeout_ms: number;
  /** 搜索慢请求阈值（p95，默认 150ms）。 */
  search_priority_p95_ms: number;
  /** 触发搜索优先降速后的暂停窗口（默认 500ms）。 */
  search_priority_pause_ms: number;
  /** 服务端容量协调接口（可选；不可用时本地保守限流）。 */
  coordinator_url?: string;
  coordinator_timeout_ms: number;
  /** 协调接口不可用时的保守 slot 上限（默认 1）。 */
  degraded_max_concurrent_jobs: number;
}

export interface CutSlotLease {
  lease_id: string;
  user_id: string;
  job_id?: string;
  acquired_at_ms: number;
  heartbeat_at_ms: number;
}

export interface CutCapacitySnapshot {
  enabled: boolean;
  max_concurrent_jobs: number;
  effective_max_concurrent_jobs: number;
  max_jobs_per_user: number;
  active_slots: number;
  active_jobs: Array<{ lease_id: string; user_id: string; job_id?: string; age_ms: number }>;
  queued_waiters: number;
  queued_by_user: Record<string, number>;
  degraded: boolean;
  degraded_reason?: string;
  search_priority_paused: boolean;
  recent_search_p95_ms?: number;
  recent_job_avg_ms?: number;
}

export interface CutQueuePosition {
  cut_job_id: string;
  position: number;
  submitted_by_user_id?: string;
  estimated_wait_ms: number;
}

export interface CutQueueStatus {
  capacity: CutCapacitySnapshot;
  queued_jobs: number;
  queue: CutQueuePosition[];
}

const DEFAULT_CAPACITY: CutCapacityConfig = {
  max_concurrent_jobs: 2,
  max_jobs_per_user: 1,
  heartbeat_ms: 5_000,
  lease_timeout_ms: 120_000,
  search_priority_p95_ms: 150,
  search_priority_pause_ms: 500,
  coordinator_timeout_ms: 300,
  degraded_max_concurrent_jobs: 1
};

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

export function resolveCutCapacityConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<CutCapacityConfig> = {}
): CutCapacityConfig {
  const coordinatorUrl = env.MIXLAB_CUTTER_CAPACITY_COORDINATOR_URL?.trim() || undefined;

  return {
    max_concurrent_jobs:
      overrides.max_concurrent_jobs ??
      boundedInteger(env.MIXLAB_CUTTER_CUT_MAX_SLOTS, DEFAULT_CAPACITY.max_concurrent_jobs, 1, 8),
    max_jobs_per_user:
      overrides.max_jobs_per_user ??
      boundedInteger(env.MIXLAB_CUTTER_CUT_MAX_SLOTS_PER_USER, DEFAULT_CAPACITY.max_jobs_per_user, 1, 4),
    heartbeat_ms:
      overrides.heartbeat_ms ??
      boundedInteger(env.MIXLAB_CUTTER_CUT_SLOT_HEARTBEAT_MS, DEFAULT_CAPACITY.heartbeat_ms, 250, 60_000),
    lease_timeout_ms:
      overrides.lease_timeout_ms ??
      boundedInteger(env.MIXLAB_CUTTER_CUT_SLOT_LEASE_TIMEOUT_MS, DEFAULT_CAPACITY.lease_timeout_ms, 1_000, 1_800_000),
    search_priority_p95_ms:
      overrides.search_priority_p95_ms ??
      boundedInteger(env.MIXLAB_CUTTER_SEARCH_PRIORITY_P95_MS, DEFAULT_CAPACITY.search_priority_p95_ms, 20, 5_000),
    search_priority_pause_ms:
      overrides.search_priority_pause_ms ??
      boundedInteger(env.MIXLAB_CUTTER_SEARCH_PRIORITY_PAUSE_MS, DEFAULT_CAPACITY.search_priority_pause_ms, 50, 10_000),
    ...(coordinatorUrl ? { coordinator_url: coordinatorUrl } : {}),
    coordinator_timeout_ms:
      overrides.coordinator_timeout_ms ??
      boundedInteger(env.MIXLAB_CUTTER_CAPACITY_COORDINATOR_TIMEOUT_MS, DEFAULT_CAPACITY.coordinator_timeout_ms, 50, 5_000),
    degraded_max_concurrent_jobs:
      overrides.degraded_max_concurrent_jobs ??
      boundedInteger(env.MIXLAB_CUTTER_CUT_DEGRADED_MAX_SLOTS, DEFAULT_CAPACITY.degraded_max_concurrent_jobs, 1, 8)
  };
}

interface CapacityWaiter {
  user_id: string;
  resolve: (lease: CutSlotLease) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class CutCapacityGovernor {
  readonly config: CutCapacityConfig;
  private readonly onReap?: (lease: CutSlotLease) => void;
  private readonly leases = new Map<string, CutSlotLease>();
  private readonly waiters: CapacityWaiter[] = [];
  private effectiveMax: number;
  private degraded = false;
  private degradedReason: string | undefined;
  private activeSearches = 0;
  private searchSamples: number[] = [];
  private searchPauseUntilMs = 0;
  private recentJobDurations: number[] = [];

  constructor(config: CutCapacityConfig, options: { on_reap?: (lease: CutSlotLease) => void } = {}) {
    this.config = config;
    this.effectiveMax = config.max_concurrent_jobs;
    this.onReap = options.on_reap;
  }

  nowMs(): number {
    return Date.now();
  }

  effectiveMaxSlots(): number {
    return this.effectiveMax;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  updateRemoteCapacity(input: { max_concurrent_jobs?: number; degraded: boolean; reason?: string }): void {
    this.degraded = input.degraded;
    this.degradedReason = input.reason;
    const requested = Number.isFinite(input.max_concurrent_jobs)
      ? Math.floor(input.max_concurrent_jobs!)
      : this.config.max_concurrent_jobs;
    this.effectiveMax = input.degraded
      ? Math.min(this.config.degraded_max_concurrent_jobs, Math.max(1, requested))
      : Math.min(this.config.max_concurrent_jobs, Math.max(1, requested));
    this.pump();
  }

  activeCountForUser(userId: string): number {
    let count = 0;
    for (const lease of this.leases.values()) {
      if (lease.user_id === userId) {
        count += 1;
      }
    }
    return count;
  }

  acquire(input: { user_id: string; signal?: AbortSignal }): Promise<CutSlotLease> {
    this.reapStaleLeases();

    return new Promise<CutSlotLease>((resolve, reject) => {
      const waiter: CapacityWaiter = {
        user_id: input.user_id,
        resolve,
        reject,
        ...(input.signal ? { signal: input.signal } : {})
      };

      if (input.signal) {
        const onAbort = (): void => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
          reject(new Error("capacity wait aborted"));
        };
        waiter.onAbort = onAbort;
        if (input.signal.aborted) {
          onAbort();
          return;
        }
        input.signal.addEventListener("abort", onAbort, { once: true });
      }

      this.waiters.push(waiter);
      this.pump();
    });
  }

  release(lease: CutSlotLease): void {
    this.leases.delete(lease.lease_id);
    this.pump();
  }

  heartbeat(lease: CutSlotLease): boolean {
    const current = this.leases.get(lease.lease_id);
    if (!current) {
      return false;
    }
    const now = this.nowMs();
    current.heartbeat_at_ms = now;
    lease.heartbeat_at_ms = now;
    return true;
  }

  attachJob(lease: CutSlotLease, jobId: string): void {
    const current = this.leases.get(lease.lease_id);
    if (current) {
      current.job_id = jobId;
      lease.job_id = jobId;
    }
  }

  recordJobDuration(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }
    this.recentJobDurations.push(Math.floor(durationMs));
    if (this.recentJobDurations.length > 20) {
      this.recentJobDurations.shift();
    }
  }

  averageJobDurationMs(): number | undefined {
    if (this.recentJobDurations.length === 0) {
      return undefined;
    }
    return Math.round(
      this.recentJobDurations.reduce((sum, value) => sum + value, 0) / this.recentJobDurations.length
    );
  }

  noteSearchStarted(): void {
    this.activeSearches += 1;
  }

  noteSearchFinished(durationMs: number): void {
    this.activeSearches = Math.max(0, this.activeSearches - 1);
    this.searchSamples.push(Math.max(0, durationMs));
    if (this.searchSamples.length > 100) {
      this.searchSamples.shift();
    }
    const p95 = this.recentSearchP95Ms();

    if (p95 !== undefined && p95 > this.config.search_priority_p95_ms) {
      this.searchPauseUntilMs = Math.max(
        this.searchPauseUntilMs,
        this.nowMs() + this.config.search_priority_pause_ms
      );
    }
  }

  recentSearchP95Ms(): number | undefined {
    if (this.searchSamples.length === 0) {
      return undefined;
    }
    const sorted = [...this.searchSamples].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  }

  searchPriorityActive(): boolean {
    return this.activeSearches > 0 || this.nowMs() < this.searchPauseUntilMs;
  }

  /** 搜索优先：返回需要等待的毫秒数（0 表示可以启动剪切）。 */
  dispatchDelayMs(): number {
    if (this.activeSearches > 0) {
      return 50;
    }
    const remaining = this.searchPauseUntilMs - this.nowMs();
    return remaining > 0 ? Math.min(remaining, this.config.search_priority_pause_ms) : 0;
  }

  reapStaleLeases(): number {
    const now = this.nowMs();
    let reaped = 0;
    for (const lease of [...this.leases.values()]) {
      if (now - lease.heartbeat_at_ms > this.config.lease_timeout_ms) {
        this.leases.delete(lease.lease_id);
        reaped += 1;
        this.onReap?.(lease);
      }
    }
    if (reaped > 0) {
      this.pump();
    }
    return reaped;
  }

  snapshot(): CutCapacitySnapshot {
    this.reapStaleLeases();
    const now = this.nowMs();
    const queuedByUser: Record<string, number> = {};
    for (const waiter of this.waiters) {
      queuedByUser[waiter.user_id] = (queuedByUser[waiter.user_id] ?? 0) + 1;
    }
    const recentP95 = this.recentSearchP95Ms();
    return {
      enabled: true,
      max_concurrent_jobs: this.config.max_concurrent_jobs,
      effective_max_concurrent_jobs: this.effectiveMax,
      max_jobs_per_user: this.config.max_jobs_per_user,
      active_slots: this.leases.size,
      active_jobs: [...this.leases.values()].map((lease) => ({
        lease_id: lease.lease_id,
        user_id: lease.user_id,
        ...(lease.job_id ? { job_id: lease.job_id } : {}),
        age_ms: now - lease.acquired_at_ms
      })),
      queued_waiters: this.waiters.length,
      queued_by_user: queuedByUser,
      degraded: this.degraded,
      ...(this.degradedReason ? { degraded_reason: this.degradedReason } : {}),
      search_priority_paused: this.searchPriorityActive(),
      ...(recentP95 !== undefined ? { recent_search_p95_ms: recentP95 } : {}),
      ...(this.averageJobDurationMs() !== undefined ? { recent_job_avg_ms: this.averageJobDurationMs() } : {})
    };
  }

  waitersSnapshot(): Array<{ user_id: string; queued_at_ms: number }> {
    return this.waiters.map((waiter) => ({ user_id: waiter.user_id, queued_at_ms: 0 }));
  }

  private pump(): void {
    this.reapStaleLeases();

    while (this.leases.size < this.effectiveMax && this.waiters.length > 0) {
      const index = this.waiters.findIndex(
        (waiter) => this.activeCountForUser(waiter.user_id) < this.config.max_jobs_per_user
      );

      if (index < 0) {
        break;
      }

      const [waiter] = this.waiters.splice(index, 1);
      if (waiter.signal && waiter.onAbort) {
        waiter.signal.removeEventListener("abort", waiter.onAbort);
      }
      const now = this.nowMs();
      const lease: CutSlotLease = {
        lease_id: randomUUID(),
        user_id: waiter.user_id,
        acquired_at_ms: now,
        heartbeat_at_ms: now
      };
      this.leases.set(lease.lease_id, lease);
      waiter.resolve(lease);
    }
  }
}

export function buildCutQueuePositions(input: {
  pending: Array<{ cut_job_id: string; submitted_by_user_id?: string; created_at?: string }>;
  capacity: CutCapacityConfig;
  effectiveMaxSlots: number;
  activeSlots: number;
  averageJobDurationMs?: number;
}): CutQueuePosition[] {
  const average = Math.max(1_000, input.averageJobDurationMs ?? 15_000);
  const slots = Math.max(1, input.effectiveMaxSlots);

  return input.pending.map((job, index) => {
    const remainingAhead = Math.max(0, index + input.activeSlots);
    return {
      cut_job_id: job.cut_job_id,
      position: index + 1,
      ...(job.submitted_by_user_id ? { submitted_by_user_id: job.submitted_by_user_id } : {}),
      estimated_wait_ms: Math.ceil(Math.max(0, Math.ceil(remainingAhead / slots))) * average
    };
  });
}
