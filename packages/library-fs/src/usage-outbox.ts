import { randomUUID } from "node:crypto";
import { mkdir, lstat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  requestUsageService,
  usageServiceUrl,
  type UsageServiceConnection
} from "./usage-service-client.ts";
import {
  CONTRACT_VERSION,
  type EventEnvelopeV1
} from "../../contracts/src/index.ts";
import type {
  MixlabUsageEvent,
  MixlabUsageEventType,
  MixlabUsageResultStatus,
  MixlabUsageSearchMode,
  MixlabUsageSearchPageType
} from "./usage-events.ts";

/**
 * 本机事件 outbox（Round4）：
 * - 事件先持久化到本机 SQLite（seq + event_id 唯一 + payload），断网不阻塞剪辑；
 * - 后台批量（默认 100）POST /usage/v1/events，指数退避重试；ACK 后删除；
 * - 容量上限（默认 10000 条）按最旧优先丢弃并记录 dropped_count，避免无限占盘；
 * - 事件按服务端 store_id 归属（destination 表），服务身份变化时保留待确认事件。
 */
export interface UsageOutboxOptions {
  max_events?: number;
  batch_size?: number;
  flush_interval_ms?: number;
  max_retry_delay_ms?: number;
}

export interface UsageOutboxStatus {
  mode: "isolated-service";
  root: string;
  total: number;
  pending: number;
  dropped: number;
  last_error: string;
}

export const DEFAULT_USAGE_OUTBOX_MAX_EVENTS = 10_000;
export const DEFAULT_USAGE_OUTBOX_BATCH_SIZE = 100;
export const DEFAULT_USAGE_OUTBOX_FLUSH_INTERVAL_MS = 2_000;
export const DEFAULT_USAGE_OUTBOX_MAX_RETRY_DELAY_MS = 30_000;
const USAGE_EVENT_MAX_PAYLOAD_BYTES = 8_192;

const EVENT_TYPES = new Set<MixlabUsageEventType>([
  "search",
  "view_source_video",
  "view_transcript",
  "select_transcript_span",
  "add_to_cut_list",
  "submit_cut_job",
  "cut_success",
  "cut_failure",
  "create_local_clip",
  "reuse_local_clip"
]);
const RESULT_STATUSES = new Set<MixlabUsageResultStatus>(["success", "empty", "failure"]);
const SEARCH_MODES = new Set<MixlabUsageSearchMode>([
  "searchd",
  "sqlite-index",
  "transcript-artifact-fallback"
]);
const SEARCH_PAGE_TYPES = new Set<MixlabUsageSearchPageType>(["first", "cursor"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`使用事件数据无效：${field} 必须是非空字符串`);
  }

  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`使用事件数据无效：${field} 必须是字符串`);
  }

  return value.trim() || undefined;
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`使用事件数据无效：${field} 必须是非负整数`);
  }

  return value;
}

/** 与 usage-events.appendUsageEvent 一致的规范化（此处自包含，避免 outbox 依赖 bulk 读取路径）。 */
export function canonicalUsageOutboxEvent(value: unknown): MixlabUsageEvent {
  if (!isRecord(value)) {
    throw new Error("使用事件数据无效：事件必须是对象");
  }

  const eventId = optionalString(value.event_id, "event_id") ?? randomUUID();
  const userId = requiredString(value.user_id, "user_id");
  const username = requiredString(value.username, "username");
  const deviceId = requiredString(value.device_id, "device_id");
  const eventType = requiredString(value.event_type, "event_type");

  if (!EVENT_TYPES.has(eventType as MixlabUsageEventType)) {
    throw new Error("使用事件数据无效：event_type 不合法");
  }

  const occurredAt = requiredString(value.occurred_at, "occurred_at");
  const sourceVideoId = optionalString(value.source_video_id, "source_video_id");
  const cutJobId = optionalString(value.cut_job_id, "cut_job_id");
  const query = optionalString(value.query, "query");
  const searchMode = optionalString(value.search_mode, "search_mode");
  const searchPageType = optionalString(value.search_page_type, "search_page_type");
  const resultStatus = optionalString(value.result_status, "result_status");

  if (searchMode !== undefined && !SEARCH_MODES.has(searchMode as MixlabUsageSearchMode)) {
    throw new Error("使用事件数据无效：search_mode 不合法");
  }
  if (searchPageType !== undefined && !SEARCH_PAGE_TYPES.has(searchPageType as MixlabUsageSearchPageType)) {
    throw new Error("使用事件数据无效：search_page_type 不合法");
  }
  if (resultStatus !== undefined && !RESULT_STATUSES.has(resultStatus as MixlabUsageResultStatus)) {
    throw new Error("使用事件数据无效：result_status 不合法");
  }

  const searchElapsedMs = optionalNonNegativeInteger(value.search_elapsed_ms, "search_elapsed_ms");
  const selectedDurationMs = optionalNonNegativeInteger(value.selected_duration_ms, "selected_duration_ms");
  const event: MixlabUsageEvent = {
    event_id: eventId,
    user_id: userId,
    username,
    device_id: deviceId,
    event_type: eventType as MixlabUsageEventType,
    occurred_at: occurredAt
  };

  if (sourceVideoId !== undefined) event.source_video_id = sourceVideoId;
  if (cutJobId !== undefined) event.cut_job_id = cutJobId;
  if (query !== undefined) event.query = query;
  if (searchMode !== undefined) event.search_mode = searchMode as MixlabUsageSearchMode;
  if (searchPageType !== undefined) event.search_page_type = searchPageType as MixlabUsageSearchPageType;
  if (searchElapsedMs !== undefined) event.search_elapsed_ms = searchElapsedMs;
  if (selectedDurationMs !== undefined) event.selected_duration_ms = selectedDurationMs;
  if (resultStatus !== undefined) event.result_status = resultStatus as MixlabUsageResultStatus;

  if (Buffer.byteLength(JSON.stringify(event)) > USAGE_EVENT_MAX_PAYLOAD_BYTES) {
    throw new Error("使用事件超过 8192 字节，已拒绝写入 outbox");
  }

  return event;
}

function positiveInteger(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正整数`);
  }

  return value;
}

/**
 * Convert the local outbox projection event into the shared EventEnvelopeV1 that the
 * isolated usage service validates. Keeping this at the delivery boundary means the local
 * outbox schema stays stable while the cross-process contract follows contracts v1.
 */
export function usageEventEnvelope(event: MixlabUsageEvent): EventEnvelopeV1 {
  const {
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    user_id: userId,
    device_id: deviceId,
    username,
    ...rest
  } = event;

  const version = process.env.MIXLAB_CUTTER_APP_VERSION?.trim() || "unknown";

  return {
    schema_version: "1.0",
    event_id: eventId ?? "",
    event_type: eventType as EventEnvelopeV1["event_type"],
    occurred_at: occurredAt,
    device_id: deviceId,
    user_id: userId,
    payload: {
      username,
      ...rest
    },
    client: {
      product: "cutter",
      version,
      contract_version: CONTRACT_VERSION
    }
  };
}

export class UsageOutbox {
  readonly root: string;
  readonly connection: UsageServiceConnection;
  last_error = "";
  private readonly maxEvents: number;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetryDelayMs: number;
  private pending: Promise<void> | null = null;
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private attempts = 0;
  private readonly writes = new Set<Promise<MixlabUsageEvent>>();

  constructor(
    root: string,
    connection: UsageServiceConnection,
    options: UsageOutboxOptions = {}
  ) {
    usageServiceUrl(connection);

    if (!root || !path.isAbsolute(root) || /^\\\\|^\/\//.test(root)) {
      throw new Error("统计 outbox 必须使用本机绝对路径（不支持 UNC/网络盘）");
    }

    this.root = root;
    this.connection = connection;
    this.maxEvents = positiveInteger(options.max_events, DEFAULT_USAGE_OUTBOX_MAX_EVENTS, "max_events");
    this.batchSize = positiveInteger(options.batch_size, DEFAULT_USAGE_OUTBOX_BATCH_SIZE, "batch_size");
    this.flushIntervalMs = positiveInteger(
      options.flush_interval_ms,
      DEFAULT_USAGE_OUTBOX_FLUSH_INTERVAL_MS,
      "flush_interval_ms"
    );
    this.maxRetryDelayMs = positiveInteger(
      options.max_retry_delay_ms,
      DEFAULT_USAGE_OUTBOX_MAX_RETRY_DELAY_MS,
      "max_retry_delay_ms"
    );
    this.scheduleNext(0);
  }

  /** 事件写入本机 outbox；不等待网络，断网时仍然立即成功（除非本地盘写入失败）。 */
  enqueue(value: MixlabUsageEvent): Promise<MixlabUsageEvent> {
    if (this.closed) {
      return Promise.reject(new Error("统计 outbox 已关闭"));
    }

    const write = this.persist(value);
    this.writes.add(write);
    void write.finally(() => this.writes.delete(write)).catch(() => undefined);
    // 尽快尝试上报（后台，不阻塞调用方）。断网时会按退避策略重试。
    this.scheduleNext(0);
    return write;
  }

  async status(): Promise<UsageOutboxStatus> {
    const db = await this.openDatabase();

    try {
      const counts = db
        .prepare("SELECT COUNT(*) AS total FROM events")
        .get() as { total: number };
      const droppedRow = db
        .prepare("SELECT value FROM meta WHERE key='dropped_count'")
        .get() as { value: string } | undefined;

      return {
        mode: "isolated-service",
        root: this.root,
        total: counts.total,
        pending: counts.total,
        dropped: droppedRow ? Number.parseInt(droppedRow.value, 10) || 0 : 0,
        last_error: this.last_error
      };
    } finally {
      db.close();
    }
  }

  /** 尝试投递一个批次；用于测试与关闭前收尾。失败只记录 last_error，不抛出。 */
  flush(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }

    if (!this.pending) {
      this.pending = this.flushOnce().finally(() => {
        this.pending = null;
      });
    }

    return this.pending;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    await Promise.allSettled([...this.writes]);

    if (this.pending) {
      await this.pending.catch(() => undefined);
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.closed) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, Math.max(0, delayMs));
    this.timer.unref?.();
  }

  private async flushOnce(): Promise<void> {
    try {
      const delivered = await this.deliverBatch();
      this.attempts = 0;
      this.last_error = "";

      if (delivered > 0) {
        this.scheduleNext(0);
        return;
      }

      this.scheduleNext(this.flushIntervalMs);
    } catch (error) {
      this.last_error = (error as { code?: string }).code ?? "usage_delivery_failed";
      const baseDelay = Math.min(
        this.maxRetryDelayMs,
        this.flushIntervalMs * Math.pow(2, Math.min(this.attempts, 8))
      );
      this.attempts += 1;
      // 加 ±20% 抖动，避免多台客户端同时重试打爆服务。
      const jitter = Math.floor(baseDelay * (Math.random() * 0.4 - 0.2));
      this.scheduleNext(Math.max(this.flushIntervalMs, baseDelay + jitter));
    }
  }

  private async deliverBatch(): Promise<number> {
    const db = await this.openDatabase();

    try {
      const rows = db
        .prepare("SELECT event_id, payload FROM events ORDER BY sequence LIMIT ?")
        .all(this.batchSize) as Array<{ event_id: string; payload: string }>;

      if (rows.length === 0 || this.closed) {
        return 0;
      }

      const identity = await requestUsageService<{ store_id?: string }>(
        this.connection,
        "/usage/v1/identity"
      );
      const storeId = identity.store_id;

      if (typeof storeId !== "string" || !storeId) {
        throw Object.assign(new Error("统计服务身份无效"), { code: "usage_service_invalid_identity" });
      }

      const destination = db
        .prepare("SELECT store_id FROM destination WHERE id=1")
        .get() as { store_id: string } | undefined;

      if (!destination) {
        db.prepare("INSERT INTO destination (id, store_id) VALUES (1, ?)").run(storeId);
      } else if (destination.store_id !== storeId) {
        // 服务端换了状态库：保留事件，等待人工处理，避免把旧事件写到新身份上。
        throw Object.assign(new Error("统计服务身份改变，outbox 保持待确认"), {
          code: "usage_destination_changed"
        });
      }

      const ack = await requestUsageService<{ store_id?: string; acknowledged?: string[] }>(
        this.connection,
        "/usage/v1/events",
        {
          store_id: storeId,
          body: {
            schema_version: "1.0",
            events: rows.map((row) => usageEventEnvelope(JSON.parse(row.payload) as MixlabUsageEvent))
          }
        }
      );
      const acknowledged = ack.acknowledged;

      if (
        ack.store_id !== storeId ||
        !Array.isArray(acknowledged) ||
        acknowledged.length !== rows.length ||
        new Set(acknowledged).size !== rows.length ||
        rows.some((row) => !acknowledged.includes(row.event_id))
      ) {
        throw Object.assign(new Error("统计确认不完整，保留原事件重试"), {
          code: "usage_ack_incomplete"
        });
      }

      const deleteStatement = db.prepare("DELETE FROM events WHERE event_id = ?");
      db.exec("BEGIN IMMEDIATE");

      try {
        for (const row of rows) {
          deleteStatement.run(row.event_id);
        }

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return rows.length;
    } finally {
      db.close();
    }
  }

  private async persist(value: MixlabUsageEvent): Promise<MixlabUsageEvent> {
    const event = canonicalUsageOutboxEvent(value);
    const payload = JSON.stringify(event);
    const db = await this.openDatabase();

    try {
      db.exec("BEGIN IMMEDIATE");

      try {
        const existing = db
          .prepare("SELECT payload FROM events WHERE event_id = ?")
          .get(event.event_id!) as { payload: string } | undefined;

        if (existing) {
          if (existing.payload !== payload) {
            throw new Error("本机 event_id 对应内容冲突");
          }

          db.exec("COMMIT");
          return event;
        }

        db.prepare("INSERT INTO events (event_id, payload) VALUES (?, ?)").run(
          event.event_id!,
          payload
        );
        // 容量上限：最旧优先丢弃，记录 dropped_count（持久化在 meta），避免无限占盘。
        const counts = db.prepare("SELECT COUNT(*) AS total FROM events").get() as { total: number };
        const overflow = counts.total - this.maxEvents;

        if (overflow > 0) {
          const expired = db
            .prepare("SELECT event_id FROM events ORDER BY sequence LIMIT ?")
            .all(overflow) as Array<{ event_id: string }>;
          const deleteExpired = db.prepare("DELETE FROM events WHERE event_id = ?");

          for (const row of expired) {
            deleteExpired.run(row.event_id);
          }

          db.prepare(
            "INSERT INTO meta (key, value) VALUES ('dropped_count', ?) " +
              "ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + ? AS TEXT)"
          ).run(String(overflow), overflow);
        }

        db.exec("COMMIT");
        return event;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  }

  private async prepareRoot(): Promise<void> {
    const libraryMarker = path.join(this.root, ".mixlab-library", "library.json");

    try {
      await lstat(libraryMarker);
      throw new Error("统计 outbox 不能放在公共素材库根目录");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }

  private async openDatabase(): Promise<DatabaseSync> {
    await this.prepareRoot();
    const db = new DatabaseSync(path.join(this.root, "outbox.sqlite"));

    try {
      db.exec(
        "PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; " +
          "CREATE TABLE IF NOT EXISTS events (" +
          "sequence INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); " +
          "CREATE TABLE IF NOT EXISTS destination (" +
          "id INTEGER PRIMARY KEY CHECK (id = 1), store_id TEXT NOT NULL); " +
          "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);"
      );
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
}
