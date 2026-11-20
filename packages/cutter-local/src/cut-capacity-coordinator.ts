import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 0.19 跨客户端全局剪切容量协调（NAS 共享目录上的原子 slot 锁）。
 *
 * 目录布局（放在公共库所在 NAS，所有剪辑师可见）：
 *   <root>/slots/slot-00.lock ... slot-NN.lock   原子创建（wx）；mtime 作为心跳；超时（lease_ttl_ms）可被其他客户端回收。
 *   <root>/queue/<created_at_ms>-<ticket>.json   等待票据；按文件名时间戳排序得到全局队列位置/预计等待。
 *
 * 失败/降级：共享目录不可读写时抛 GlobalCapacityUnavailableError；调用方必须降级为本地保守 1 slot，
 * 不允许 50 台机器各按本地并发全放开。
 */

export const GLOBAL_CAPACITY_UNAVAILABLE_CODE = "global_capacity_unavailable";
export const GLOBAL_CAPACITY_ABORTED_CODE = "global_capacity_aborted";
export const GLOBAL_CAPACITY_LEASE_LOST_CODE = "global_capacity_lease_lost";

export interface GlobalCutCapacityConfig {
  root: string;
  /** 全局（所有剪辑师合计）最大并发剪切 slot。 */
  max_slots: number;
  /** slot 租约超时（无心跳即回收，覆盖客户端崩溃）。 */
  lease_ttl_ms: number;
  /** slot 心跳间隔（刷新 slot 文件 mtime）。 */
  heartbeat_interval_ms: number;
  /** 等待队列轮询间隔。 */
  poll_interval_ms: number;
  /** 等待票据超时清理（客户端崩溃遗留）。 */
  queue_ticket_stale_ms: number;
  /** 轮询 jitter（避免 50 客户端同时抢锁抖动）。 */
  poll_jitter_ms: number;
  /** 估算队列 ETA 的平均任务时长。 */
  average_job_ms: number;
}

export interface GlobalCutSlotLease {
  lease_id: string;
  slot_index: number;
  slot_path: string;
  client_id: string;
  job_id?: string;
  acquired_at_ms: number;
}

export interface GlobalCutCapacityLeaseSnapshot {
  slot_index: number;
  client_id: string;
  job_id?: string;
  age_ms: number;
}

export interface GlobalCutCapacitySnapshot {
  available: boolean;
  degraded: boolean;
  degraded_reason?: string;
  root: string;
  max_slots: number;
  active_count: number;
  active_leases: GlobalCutCapacityLeaseSnapshot[];
  waiting_count: number;
  average_job_ms: number;
  captured_at: string;
}

export interface GlobalQueueTicketPosition {
  ticket_id: string;
  position: number;
  estimated_wait_ms: number;
}

export interface AcquireGlobalCutSlotInput {
  client_id: string;
  job_id?: string;
  signal?: AbortSignal;
  /** 每次重新计算排队位置时回调（供 API/UI 展示当前任务全局等待位次）。 */
  on_queued?: (position: GlobalQueueTicketPosition) => void;
}

export class GlobalCapacityUnavailableError extends Error {
  readonly code = GLOBAL_CAPACITY_UNAVAILABLE_CODE;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GlobalCapacityUnavailableError";
  }
}

export class GlobalCapacityAbortedError extends Error {
  readonly code = GLOBAL_CAPACITY_ABORTED_CODE;

  constructor() {
    super("global cut capacity acquire aborted");
    this.name = "GlobalCapacityAbortedError";
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function resolveGlobalCutCapacityConfig(input: {
  root: string;
  max_slots?: number;
  lease_ttl_ms?: number;
  heartbeat_interval_ms?: number;
  average_job_ms?: number;
  env?: NodeJS.ProcessEnv;
}): GlobalCutCapacityConfig {
  const env = input.env ?? process.env;
  const intEnv = (name: string, fallback: number, min: number, max: number): number => {
    const parsed = Number.parseInt(env[name]?.trim() ?? "", 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
  };
  const maxSlots = input.max_slots ?? intEnv("MIXLAB_CUTTER_GLOBAL_MAX_SLOTS", 4, 1, 64);

  return {
    root: path.resolve(input.root),
    max_slots: Number.isFinite(maxSlots) ? Math.min(64, Math.max(1, Math.floor(maxSlots))) : 4,
    lease_ttl_ms:
      input.lease_ttl_ms ??
      intEnv("MIXLAB_CUTTER_GLOBAL_LEASE_TTL_MS", 60_000, 3_000, 1_800_000),
    heartbeat_interval_ms:
      input.heartbeat_interval_ms ??
      intEnv("MIXLAB_CUTTER_GLOBAL_HEARTBEAT_MS", 10_000, 500, 600_000),
    poll_interval_ms: intEnv("MIXLAB_CUTTER_GLOBAL_POLL_MS", 200, 20, 10_000),
    queue_ticket_stale_ms: intEnv("MIXLAB_CUTTER_GLOBAL_QUEUE_STALE_MS", 180_000, 5_000, 3_600_000),
    poll_jitter_ms: intEnv("MIXLAB_CUTTER_GLOBAL_POLL_JITTER_MS", 120, 0, 10_000),
    average_job_ms:
      input.average_job_ms ??
      intEnv("MIXLAB_CUTTER_GLOBAL_AVG_JOB_MS", 20_000, 500, 3_600_000)
  };
}

export function defaultGlobalCutCapacityRoot(publicLibraryRoot: string): string {
  return path.join(publicLibraryRoot, ".mixlab-library", "capacity", "cut-slots");
}

interface QueueTicketRecord {
  ticket_id: string;
  client_id: string;
  job_id?: string;
  created_at_ms: number;
}

export class GlobalCutCapacityCoordinator {
  readonly config: GlobalCutCapacityConfig;
  private readonly slotsRoot: string;
  private readonly queueRoot: string;
  private lastSnapshot: GlobalCutCapacitySnapshot | undefined;
  private lastSnapshotAtMs = 0;

  constructor(config: GlobalCutCapacityConfig) {
    this.config = config;
    this.slotsRoot = path.join(config.root, "slots");
    this.queueRoot = path.join(config.root, "queue");
  }

  async ensureAvailable(): Promise<void> {
    try {
      await mkdir(this.slotsRoot, { recursive: true });
      await mkdir(this.queueRoot, { recursive: true });
    } catch (error) {
      throw new GlobalCapacityUnavailableError(
        "全局剪切容量协调目录不可用（NAS 不可访问/无写权限）：" + errorMessageOf(error),
        { cause: error }
      );
    }
  }

  async acquire(input: AcquireGlobalCutSlotInput): Promise<GlobalCutSlotLease> {
    await this.ensureAvailable();
    const ticketId = randomUUID();
    const createdAtMs = Date.now();
    const ticket: QueueTicketRecord = {
      ticket_id: ticketId,
      client_id: input.client_id,
      ...(input.job_id ? { job_id: input.job_id } : {}),
      created_at_ms: createdAtMs
    };
    const ticketPath = path.join(
      this.queueRoot,
      `${String(createdAtMs).padStart(13, "0")}-${ticketId}.json`
    );

    try {
      await writeFile(ticketPath, `${JSON.stringify(ticket)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      throw new GlobalCapacityUnavailableError(
        "无法写入全局剪切队列票据（NAS 不可写）：" + errorMessageOf(error),
        { cause: error }
      );
    }

    const cleanupTicket = async (): Promise<void> => {
      await rm(ticketPath, { force: true }).catch(() => undefined);
    };

    try {
      for (;;) {
        if (input.signal?.aborted) {
          throw new GlobalCapacityAbortedError();
        }

        await utimes(ticketPath, new Date(), new Date()).catch(() => undefined);
        await this.releaseStaleSlotsBestEffort();

        for (let slotIndex = 0; slotIndex < this.config.max_slots; slotIndex += 1) {
          const slotPath = path.join(this.slotsRoot, `slot-${String(slotIndex).padStart(2, "0")}.lock`);
          const lease: GlobalCutSlotLease = {
            lease_id: randomUUID(),
            slot_index: slotIndex,
            slot_path: slotPath,
            client_id: input.client_id,
            ...(input.job_id ? { job_id: input.job_id } : {}),
            acquired_at_ms: Date.now()
          };

          try {
            await writeFile(
              slotPath,
              `${JSON.stringify({
                schema_version: "1.0",
                lease_id: lease.lease_id,
                slot_index: slotIndex,
                client_id: lease.client_id,
                ...(lease.job_id ? { job_id: lease.job_id } : {}),
                acquired_at_ms: lease.acquired_at_ms,
                heartbeat_at: new Date(lease.acquired_at_ms).toISOString()
              })}\n`,
              { encoding: "utf8", flag: "wx" }
            );
            await cleanupTicket();
            return lease;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              continue;
            }

            throw new GlobalCapacityUnavailableError(
              "无法创建全局剪切 slot 锁（NAS 不可写）：" + errorMessageOf(error),
              { cause: error }
            );
          }
        }

        const position = await this.waitingPosition(ticketPath);
        input.on_queued?.({
          ticket_id: ticketId,
          position: position.position,
          estimated_wait_ms: position.estimated_wait_ms
        });
        await this.sleepWithAbort(input.signal);
      }
    } catch (error) {
      await cleanupTicket();
      throw error;
    }
  }

  async heartbeat(lease: GlobalCutSlotLease): Promise<boolean> {
    try {
      const parsed = JSON.parse(await readFile(lease.slot_path, "utf8")) as { lease_id?: string };
      if (parsed.lease_id !== lease.lease_id) {
        return false;
      }
      await utimes(lease.slot_path, new Date(), new Date());
      return true;
    } catch {
      return false;
    }
  }

  async release(lease: GlobalCutSlotLease): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(lease.slot_path, "utf8")) as { lease_id?: string };
      if (parsed.lease_id === lease.lease_id) {
        await rm(lease.slot_path, { force: true });
      }
    } catch {
      // 已释放/已被回收：幂等。
    }
  }

  async snapshot(options: { cache_ms?: number } = {}): Promise<GlobalCutCapacitySnapshot> {
    const cacheMs = options.cache_ms ?? 0;
    const now = Date.now();
    if (cacheMs > 0 && this.lastSnapshot && now - this.lastSnapshotAtMs < cacheMs) {
      return this.lastSnapshot;
    }

    try {
      await this.ensureAvailable();
      await this.releaseStaleSlotsBestEffort();
      const leases = await this.readActiveLeases();
      const tickets = await this.readQueueTickets();
      const snapshot: GlobalCutCapacitySnapshot = {
        available: true,
        degraded: false,
        root: this.config.root,
        max_slots: this.config.max_slots,
        active_count: leases.length,
        active_leases: leases,
        waiting_count: tickets.length,
        average_job_ms: this.config.average_job_ms,
        captured_at: new Date().toISOString()
      };
      this.lastSnapshot = snapshot;
      this.lastSnapshotAtMs = now;
      return snapshot;
    } catch (error) {
      const unavailable: GlobalCutCapacitySnapshot = {
        available: false,
        degraded: true,
        degraded_reason: errorMessageOf(error),
        root: this.config.root,
        max_slots: this.config.max_slots,
        active_count: 0,
        active_leases: [],
        waiting_count: 0,
        average_job_ms: this.config.average_job_ms,
        captured_at: new Date().toISOString()
      };
      this.lastSnapshot = unavailable;
      this.lastSnapshotAtMs = now;
      return unavailable;
    }
  }

  private async readActiveLeases(): Promise<GlobalCutCapacityLeaseSnapshot[]> {
    const entries = await readdir(this.slotsRoot, { withFileTypes: true }).catch(() => []);
    const leases: GlobalCutCapacityLeaseSnapshot[] = [];
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".lock")) {
        continue;
      }
      const slotPath = path.join(this.slotsRoot, entry.name);

      try {
        const parsed = JSON.parse(await readFile(slotPath, "utf8")) as {
          slot_index?: number;
          client_id?: string;
          job_id?: string;
          acquired_at_ms?: number;
        };
        leases.push({
          slot_index: Number(parsed.slot_index ?? 0),
          client_id: parsed.client_id ?? "unknown",
          ...(parsed.job_id ? { job_id: parsed.job_id } : {}),
          age_ms: Math.max(0, now - Number(parsed.acquired_at_ms ?? now))
        });
      } catch {
        // 损坏文件按当前 mtime 判断是否回收。
        const fileStat = await stat(slotPath).catch(() => null);
        if (fileStat) {
          leases.push({
            slot_index: 0,
            client_id: "unknown",
            age_ms: Math.max(0, now - fileStat.mtimeMs)
          });
        }
      }
    }

    return leases;
  }

  private async readQueueTickets(): Promise<QueueTicketRecord[]> {
    const entries = await readdir(this.queueRoot, { withFileTypes: true }).catch(() => []);
    const tickets: QueueTicketRecord[] = [];
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const ticketPath = path.join(this.queueRoot, entry.name);

      try {
        const fileStat = await stat(ticketPath);

        if (now - fileStat.mtimeMs > this.config.queue_ticket_stale_ms) {
          await rm(ticketPath, { force: true }).catch(() => undefined);
          continue;
        }

        const parsed = JSON.parse(await readFile(ticketPath, "utf8")) as Partial<QueueTicketRecord>;
        tickets.push({
          ticket_id: String(parsed.ticket_id ?? entry.name),
          client_id: String(parsed.client_id ?? "unknown"),
          ...(parsed.job_id ? { job_id: String(parsed.job_id) } : {}),
          created_at_ms: Number(parsed.created_at_ms ?? fileStat.mtimeMs)
        });
      } catch {
        await rm(ticketPath, { force: true }).catch(() => undefined);
      }
    }

    return tickets.sort((left, right) => left.created_at_ms - right.created_at_ms);
  }

  private async waitingPosition(ticketPath: string): Promise<{ position: number; estimated_wait_ms: number }> {
    const entries = await readdir(this.queueRoot).catch(() => []);
    const myName = path.basename(ticketPath);
    const ahead = entries.filter((name) => name.endsWith(".json") && name < myName).length;
    const position = ahead + 1;
    const estimatedWaitMs = Math.ceil(position / Math.max(1, this.config.max_slots)) * this.config.average_job_ms;
    return { position, estimated_wait_ms: estimatedWaitMs };
  }

  /** 回收超时 slot（客户端崩溃/断网）：原子 rename 后再删除，避免误删刚续约的他人锁。 */
  async releaseStaleSlotsBestEffort(): Promise<number> {
    const entries = await readdir(this.slotsRoot, { withFileTypes: true }).catch(() => []);
    const now = Date.now();
    let reclaimed = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".lock")) {
        continue;
      }
      const slotPath = path.join(this.slotsRoot, entry.name);
      const fileStat = await stat(slotPath).catch(() => null);

      if (!fileStat || now - fileStat.mtimeMs <= this.config.lease_ttl_ms) {
        continue;
      }

      const reclaimedPath = `${slotPath}.reclaim-${randomUUID()}`;

      try {
        await rename(slotPath, reclaimedPath);
        await rm(reclaimedPath, { force: true });
        reclaimed += 1;
      } catch {
        // 另一个客户端已回收/续约，忽略。
      }
    }

    return reclaimed;
  }

  private async sleepWithAbort(signal?: AbortSignal): Promise<void> {
    const delay =
      this.config.poll_interval_ms +
      Math.floor(Math.random() * Math.max(1, this.config.poll_jitter_ms));

    if (!signal) {
      await sleep(delay);
      return;
    }

    if (signal.aborted) {
      throw new GlobalCapacityAbortedError();
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(new GlobalCapacityAbortedError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

export function estimateGlobalQueueEtaMs(input: {
  position: number;
  max_slots: number;
  average_job_ms: number;
}): number {
  return Math.ceil(Math.max(1, input.position) / Math.max(1, input.max_slots)) * input.average_job_ms;
}
