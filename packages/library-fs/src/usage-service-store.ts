import { randomUUID } from "node:crypto";
import { lstat, mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  validateEventEnvelopeV1,
  type EventEnvelopeV1
} from "../../contracts/src/index.ts";
import {
  buildUsageMetricsProjection,
  validateUsageEvent,
  type MixlabUsageEvent,
  type UsageEventStoreMetrics,
  type UsageMetrics
} from "./usage-events.ts";

export const USAGE_SERVICE_STORE_SCHEMA_VERSION = "1";
export const USAGE_SERVICE_MAX_BATCH_EVENTS = 100;
export const USAGE_SERVICE_MAX_EVENT_PAYLOAD_BYTES = 8_192;
export const USAGE_SERVICE_MAX_QUERY_EVENTS = 200_000;
export const DEFAULT_USAGE_SERVICE_RETENTION_DAYS = 180;
export const DEFAULT_USAGE_SERVICE_MAX_EVENTS = 500_000;
export const USAGE_SERVICE_AUTO_PRUNE_EVERY_APPENDS = 500;
export const USAGE_SERVICE_LAST_MAINTENANCE_KEY = "last_maintenance";
export const USAGE_SERVICE_RETENTION_DAYS_ENV_VAR = "MIXLAB_USAGE_SERVICE_RETENTION_DAYS";
export const USAGE_SERVICE_MAX_EVENTS_ENV_VAR = "MIXLAB_USAGE_SERVICE_MAX_EVENTS";

export type UsageServiceErrorCode =
  | "VALIDATION_FAILED"
  | "BATCH_TOO_LARGE"
  | "QUERY_TOO_LARGE"
  | "EVENT_ID_CONFLICT"
  | "SOURCE_CHANGED"
  | "STORE_VERSION_UNSUPPORTED"
  | "STORE_UNAVAILABLE";

export interface UsageServiceCapacityConfig {
  retention_days: number;
  max_events: number;
}

export interface UsageServiceStoreOptions {
  retention_days?: number;
  max_events?: number;
  /** Test/maintenance only override; production uses USAGE_SERVICE_MAX_QUERY_EVENTS. */
  max_query_events?: number;
  /** Defaults to true for the long-lived service; maintenance CLIs disable it. */
  auto_prune?: boolean;
  /** Read-only readers (status/verify CLI) can inspect a live service's WAL database. */
  read_only?: boolean;
  now?: string;
}

export interface UsageServicePruneOptions {
  mode?: "dry-run" | "apply";
  retention_days?: number;
  max_events?: number;
  now?: string;
  compact?: boolean;
}

export interface UsageServicePruneResult {
  mode: "dry-run" | "apply";
  store_id: string;
  retention_days: number;
  max_events: number;
  now: string;
  cutoff: string;
  total_before: number;
  /** For dry-run this is the projected count; for apply it is the real count after pruning. */
  total_after: number;
  deleted_by_retention: number;
  deleted_by_capacity: number;
  deleted_total: number;
  compacted: boolean;
  completed_at: string;
}

export interface UsageServiceMaintenanceStatus {
  store_id: string;
  total_events: number;
  retention_days: number;
  max_events: number;
  last_maintenance: UsageServicePruneResult | null;
}

function normalizeNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new UsageServiceError("VALIDATION_FAILED", label + " 必须是非负整数");
  }

  return value;
}

function parseEnvNonNegativeInteger(value: string | undefined, label: string): number | undefined {
  const raw = value?.trim();

  if (!raw) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    throw new UsageServiceError("VALIDATION_FAILED", label + " 必须是非负整数");
  }

  return Number.parseInt(raw, 10);
}

export function resolveUsageServiceCapacityConfig(
  env: Partial<NodeJS.ProcessEnv> = process.env
): UsageServiceCapacityConfig {
  return {
    retention_days: parseEnvNonNegativeInteger(
      env[USAGE_SERVICE_RETENTION_DAYS_ENV_VAR],
      USAGE_SERVICE_RETENTION_DAYS_ENV_VAR
    ) ?? DEFAULT_USAGE_SERVICE_RETENTION_DAYS,
    max_events: parseEnvNonNegativeInteger(
      env[USAGE_SERVICE_MAX_EVENTS_ENV_VAR],
      USAGE_SERVICE_MAX_EVENTS_ENV_VAR
    ) ?? DEFAULT_USAGE_SERVICE_MAX_EVENTS
  };
}

export class UsageServiceError extends Error {
  readonly code: UsageServiceErrorCode;
  readonly status: number;

  constructor(code: UsageServiceErrorCode, message: string, status = 400) {
    super(message);
    this.name = "UsageServiceError";
    this.code = code;
    this.status = status;
  }
}

export interface UsageServiceCanonicalEvent {
  envelope: EventEnvelopeV1;
  event: MixlabUsageEvent;
  payload: string;
}

export interface UsageServiceIngestSource {
  root: string;
  digest: string;
  imported_at: string;
}

export interface UsageServiceIngestResult {
  store_id: string;
  acknowledged: string[];
  inserted: number;
  duplicate_count: number;
  /** Present when ingest-time retention/capacity pruning deleted events. */
  maintenance?: {
    deleted_by_retention: number;
    deleted_by_capacity: number;
  };
}

export interface UsageServiceMetricsQuery {
  from?: string;
  to?: string;
  user_id?: string;
  /** Additive convenience filter: last N days (cannot be combined with from/to). */
  last_days?: number;
}

export interface UsageServiceMetricsBucket {
  date: string;
  event_count: number;
  active_user_count: number;
  search_request_count: number;
}

export interface UsageServiceMetricsResult {
  store_id: string;
  schema_version: string;
  contract_version: string;
  generated_at: string;
  query: UsageServiceMetricsQuery;
  event_count: number;
  truncated: boolean;
  metrics: UsageMetrics;
  by_day: UsageServiceMetricsBucket[];
}

const CONTRACT_VERSION = "1.0.0";

function optionalPayloadString(
  payload: Record<string, unknown>,
  key: string
): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function optionalPayloadInteger(
  payload: Record<string, unknown>,
  key: string
): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * Translate the shared EventEnvelopeV1 into the legacy projection event shape the existing
 * metrics code understands. Validation happens on both layers: the envelope contract first,
 * then the legacy event schema so the projection can never ingest unknown shapes.
 */
export function usageEventFromEnvelopeV1(envelope: EventEnvelopeV1): MixlabUsageEvent {
  const payload = envelope.payload;
  const candidate: Record<string, unknown> = {
    event_id: envelope.event_id,
    user_id: envelope.user_id,
    username: optionalPayloadString(payload, "username")?.trim() || envelope.user_id,
    device_id: envelope.device_id,
    event_type: envelope.event_type,
    occurred_at: envelope.occurred_at
  };

  for (const key of [
    "source_video_id",
    "cut_job_id",
    "query",
    "search_mode",
    "search_page_type",
    "result_status"
  ] as const) {
    const value = optionalPayloadString(payload, key);
    if (value !== undefined) {
      candidate[key] = value;
    }
  }

  for (const key of ["search_elapsed_ms", "selected_duration_ms"] as const) {
    const value = optionalPayloadInteger(payload, key);
    if (value !== undefined) {
      candidate[key] = value;
    }
  }

  return validateUsageEvent(candidate, { require_event_id: true });
}

export function canonicalUsageEvent(value: unknown): UsageServiceCanonicalEvent {
  let envelope: EventEnvelopeV1;

  try {
    envelope = validateEventEnvelopeV1(value);
  } catch (error) {
    throw new UsageServiceError(
      "VALIDATION_FAILED",
      error instanceof Error ? "事件信封无效：" + error.message : "事件信封无效"
    );
  }

  let event: MixlabUsageEvent;
  try {
    event = usageEventFromEnvelopeV1(envelope);
  } catch (error) {
    throw new UsageServiceError(
      "VALIDATION_FAILED",
      error instanceof Error ? error.message : "使用事件数据无效"
    );
  }

  const payload = JSON.stringify(event);

  if (Buffer.byteLength(payload, "utf8") > USAGE_SERVICE_MAX_EVENT_PAYLOAD_BYTES) {
    throw new UsageServiceError(
      "VALIDATION_FAILED",
      "使用事件超过 " + USAGE_SERVICE_MAX_EVENT_PAYLOAD_BYTES + " 字节"
    );
  }

  return { envelope, event, payload };
}

function isAbsoluteLocalPath(root: string): boolean {
  return path.isAbsolute(root) && !/^\\\\|^\/\//.test(root);
}

/** Private state must live outside the public library share (never on the NAS public root). */
export async function prepareUsagePrivateRoot(root: string): Promise<void> {
  if (!isAbsoluteLocalPath(root)) {
    throw new UsageServiceError("STORE_UNAVAILABLE", "统计服务状态必须使用独立本机绝对路径");
  }

  const libraryManifest = await lstat(path.join(root, ".mixlab-library", "library.json"))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

  if (libraryManifest) {
    throw new UsageServiceError("STORE_UNAVAILABLE", "统计服务私有状态不能放在公共素材库根目录");
  }

  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
  } catch {
    throw new UsageServiceError("STORE_UNAVAILABLE", "统计服务状态目录不可创建");
  }
}

/**
 * OS-owned SQLite lock: the exclusive lock is released when the process dies, so we never
 * steal locks by age. Only one usage service (or migration maintenance) can own a state root.
 */
export async function acquireUsageServiceOwner(root: string): Promise<() => void> {
  await prepareUsagePrivateRoot(root);
  const db = new DatabaseSync(path.join(root, "owner.sqlite"));

  try {
    db.exec("PRAGMA busy_timeout=100; CREATE TABLE IF NOT EXISTS owner (id INTEGER); BEGIN EXCLUSIVE");
  } catch {
    db.close();
    throw new UsageServiceError("STORE_UNAVAILABLE", "统计服务仍在运行或被其他维护操作占用", 409);
  }

  return () => {
    try {
      db.exec("ROLLBACK");
    } finally {
      db.close();
    }
  };
}

function normalizeMetricsQuery(
  query: UsageServiceMetricsQuery | undefined,
  nowIso: string
): UsageServiceMetricsQuery {
  const normalized: UsageServiceMetricsQuery = {};

  for (const key of ["from", "to"] as const) {
    const value = query?.[key]?.trim();
    if (!value) {
      continue;
    }
    if (Number.isNaN(Date.parse(value))) {
      throw new UsageServiceError("VALIDATION_FAILED", key + " 必须是 ISO 时间");
    }
    normalized[key] = value;
  }

  const lastDays = query?.last_days;
  if (lastDays !== undefined) {
    if (!Number.isSafeInteger(lastDays) || lastDays < 1 || lastDays > 3_650) {
      throw new UsageServiceError("VALIDATION_FAILED", "last_days 必须是 1-3650 的整数");
    }
    if (normalized.from !== undefined || normalized.to !== undefined) {
      throw new UsageServiceError("VALIDATION_FAILED", "last_days 不能与 from/to 同时使用");
    }
    const nowMs = Date.parse(nowIso);
    if (Number.isNaN(nowMs)) {
      throw new UsageServiceError("VALIDATION_FAILED", "now 必须是 ISO 时间");
    }
    normalized.last_days = lastDays;
    normalized.from = new Date(nowMs - lastDays * 24 * 60 * 60 * 1000).toISOString();
    normalized.to = nowIso;
  }

  if (
    normalized.from !== undefined &&
    normalized.to !== undefined &&
    Date.parse(normalized.from) > Date.parse(normalized.to)
  ) {
    throw new UsageServiceError("VALIDATION_FAILED", "from 不能晚于 to");
  }

  const userId = query?.user_id?.trim();
  if (userId) {
    normalized.user_id = userId;
  }

  return normalized;
}

function emptyEventStoreMetrics(lineCount: number): UsageEventStoreMetrics {
  return {
    line_count: lineCount,
    valid_line_count: lineCount,
    malformed_line_count: 0,
    malformed_lines: [],
    warning: ""
  };
}

const EVENTS_SCHEMA_SQL = [
  "PRAGMA busy_timeout=5000;",
  "PRAGMA journal_mode=WAL;",
  "PRAGMA synchronous=NORMAL;",
  "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
  "CREATE TABLE IF NOT EXISTS events (",
  "  sequence INTEGER PRIMARY KEY,",
  "  event_id TEXT NOT NULL UNIQUE,",
  "  occurred_at TEXT NOT NULL,",
  "  user_id TEXT NOT NULL,",
  "  payload TEXT NOT NULL,",
  "  envelope TEXT NOT NULL",
  ");",
  "CREATE INDEX IF NOT EXISTS events_occurred_at ON events(occurred_at);",
  "CREATE INDEX IF NOT EXISTS events_user_id ON events(user_id);",
  "CREATE TABLE IF NOT EXISTS imports (",
  "  source_root TEXT PRIMARY KEY,",
  "  digest TEXT NOT NULL,",
  "  imported_at TEXT NOT NULL",
  ");"
].join("\n");

export class UsageServiceStore {
  readonly db: DatabaseSync;
  readonly id: string;
  readonly retentionDays: number;
  readonly maxEvents: number;
  private readonly maxQueryEvents: number;
  private readonly autoPruneEnabled: boolean;
  private appendsSincePrune = 0;

  constructor(root: string, options: UsageServiceStoreOptions = {}) {
    const databasePath = path.join(root, "events.sqlite");
    this.db = options.read_only
      ? new DatabaseSync(databasePath, { readOnly: true })
      : new DatabaseSync(databasePath);

    try {
      if (!options.read_only) {
        this.db.exec(EVENTS_SCHEMA_SQL);
      }
      const existingId = this.metadataValue("store_id");

      if (!existingId) {
        this.setMetadata("store_id", randomUUID());
        this.setMetadata("schema_version", USAGE_SERVICE_STORE_SCHEMA_VERSION);
      }

      const schemaVersion = this.metadataValue("schema_version");

      if (schemaVersion !== USAGE_SERVICE_STORE_SCHEMA_VERSION) {
        throw new UsageServiceError("STORE_VERSION_UNSUPPORTED", "统计服务存储版本不兼容", 500);
      }

      const storeId = this.metadataValue("store_id");

      if (!storeId) {
        throw new UsageServiceError("STORE_UNAVAILABLE", "统计服务存储缺少 store_id", 500);
      }

      this.id = storeId;
      this.retentionDays = normalizeNonNegativeInteger(
        options.retention_days ?? DEFAULT_USAGE_SERVICE_RETENTION_DAYS,
        "保留天数"
      );
      this.maxEvents = normalizeNonNegativeInteger(
        options.max_events ?? DEFAULT_USAGE_SERVICE_MAX_EVENTS,
        "事件容量上限"
      );
      const maxQueryEvents = options.max_query_events ?? USAGE_SERVICE_MAX_QUERY_EVENTS;

      if (!Number.isSafeInteger(maxQueryEvents) || maxQueryEvents < 1) {
        throw new UsageServiceError(
          "VALIDATION_FAILED",
          "指标查询事件上限必须是正整数"
        );
      }

      this.maxQueryEvents = maxQueryEvents;
      this.autoPruneEnabled = (options.auto_prune ?? true) && !options.read_only;

      if (!options.read_only) {
        this.setMetadata("retention_days", String(this.retentionDays));
        this.setMetadata("max_events", String(this.maxEvents));
      }
    } catch (error) {
      this.db.close();
      throw error;
    }

    if (this.autoPruneEnabled) {
      try {
        // Startup cleanup: apply retention/capacity before the first request is served.
        this.prune({
          mode: "apply",
          ...(options.now ? { now: options.now } : {})
        });
      } catch (error) {
        this.db.close();
        throw error;
      }
    }
  }

  private countEvents(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events").get() as {
      count: number;
    };
    return Number(row.count);
  }

  /**
   * Retention/capacity maintenance. Runs under the service's single-owner lock when invoked by
   * the service or maintenance CLI; the same transaction also stores the cleanup counters.
   */
  prune(options: UsageServicePruneOptions = {}): UsageServicePruneResult {
    const mode = options.mode ?? "apply";

    if (mode !== "dry-run" && mode !== "apply") {
      throw new UsageServiceError("VALIDATION_FAILED", "维护模式必须是 dry-run 或 apply");
    }

    const retentionDays = normalizeNonNegativeInteger(
      options.retention_days ?? this.retentionDays,
      "保留天数"
    );
    const maxEvents = normalizeNonNegativeInteger(
      options.max_events ?? this.maxEvents,
      "事件容量上限"
    );
    const now = options.now ?? new Date().toISOString();
    const nowMs = Date.parse(now);

    if (Number.isNaN(nowMs)) {
      throw new UsageServiceError("VALIDATION_FAILED", "now 必须是 ISO 时间");
    }

    const cutoff = retentionDays > 0
      ? new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString()
      : "";
    const totalBefore = this.countEvents();
    const deleteByRetention = retentionDays > 0
      ? Number((this.db.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE occurred_at < ?"
      ).get(cutoff) as { count: number }).count)
      : 0;
    const remainingAfterRetention = totalBefore - deleteByRetention;
    const deleteByCapacity = maxEvents > 0 && remainingAfterRetention > maxEvents
      ? remainingAfterRetention - maxEvents
      : 0;
    const deletedTotal = deleteByRetention + deleteByCapacity;
    let totalAfter = totalBefore;

    if (mode === "apply") {
      if (deletedTotal > 0) {
        this.db.exec("BEGIN IMMEDIATE");

        try {
          if (deleteByRetention > 0) {
            this.db.prepare("DELETE FROM events WHERE occurred_at < ?").run(cutoff);
          }

          if (deleteByCapacity > 0) {
            this.db.prepare(
              "DELETE FROM events WHERE sequence IN (SELECT sequence FROM events ORDER BY sequence ASC LIMIT ?)"
            ).run(deleteByCapacity);
          }

          this.db.exec("COMMIT");
        } catch (error) {
          try {
            this.db.exec("ROLLBACK");
          } catch {
            // ignore
          }
          throw error;
        }
      }

      totalAfter = this.countEvents();
    } else {
      totalAfter = Math.max(0, totalBefore - deletedTotal);
    }

    const completedAt = new Date().toISOString();
    const result: UsageServicePruneResult = {
      mode,
      store_id: this.id,
      retention_days: retentionDays,
      max_events: maxEvents,
      now,
      cutoff,
      total_before: totalBefore,
      total_after: totalAfter,
      deleted_by_retention: deleteByRetention,
      deleted_by_capacity: deleteByCapacity,
      deleted_total: deletedTotal,
      compacted: false,
      completed_at: completedAt
    };

    if (mode === "apply") {
      if (options.compact) {
        this.compact();
        result.compacted = true;
      }

      this.setMetadata("retention_days", String(retentionDays));
      this.setMetadata("max_events", String(maxEvents));
      this.setMetadata(USAGE_SERVICE_LAST_MAINTENANCE_KEY, JSON.stringify(result));
    }

    return result;
  }

  /** WAL checkpoint (metrics-compact maintenance); best effort for NAS-less local state. */
  compact(): boolean {
    try {
      this.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").all();
      return true;
    } catch {
      return false;
    }
  }

  maintenanceStatus(): UsageServiceMaintenanceStatus {
    const rawLastMaintenance = this.metadataValue(USAGE_SERVICE_LAST_MAINTENANCE_KEY);
    let lastMaintenance: UsageServicePruneResult | null = null;

    if (rawLastMaintenance) {
      try {
        lastMaintenance = JSON.parse(rawLastMaintenance) as UsageServicePruneResult;
      } catch {
        lastMaintenance = null;
      }
    }

    return {
      store_id: this.id,
      total_events: this.countEvents(),
      retention_days: this.retentionDays,
      max_events: this.maxEvents,
      last_maintenance: lastMaintenance
    };
  }

  private metadataValue(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private setMetadata(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)").run(key, value);
  }

  /** Record a migration source digest without ingesting events (used for all-malformed sources). */
  recordImportSource(source: UsageServiceIngestSource): void {
    this.db.exec("BEGIN IMMEDIATE");

    try {
      const previous = this.db.prepare("SELECT digest FROM imports WHERE source_root = ?").get(
        source.root
      ) as { digest: string } | undefined;

      if (previous && previous.digest !== source.digest) {
        throw new UsageServiceError("SOURCE_CHANGED", "旧事件源在迁移后发生变化，禁止重复接管", 409);
      }

      this.db.prepare(
        "INSERT OR IGNORE INTO imports(source_root, digest, imported_at) VALUES (?, ?, ?)"
      ).run(source.root, source.digest, source.imported_at);
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  }

  ingest(values: unknown[], source?: UsageServiceIngestSource): UsageServiceIngestResult {
    if (values.length === 0) {
      throw new UsageServiceError("VALIDATION_FAILED", "统计批次不能为空");
    }

    if (values.length > USAGE_SERVICE_MAX_BATCH_EVENTS) {
      throw new UsageServiceError(
        "BATCH_TOO_LARGE",
        "单批事件不能超过 " + USAGE_SERVICE_MAX_BATCH_EVENTS + " 条",
        413
      );
    }

    const canonical = values.map((value, index) => {
      try {
        return canonicalUsageEvent(value);
      } catch (error) {
        if (error instanceof UsageServiceError) {
          throw new UsageServiceError(
            error.code,
            "第 " + (index + 1) + " 条事件无效：" + error.message,
            error.status
          );
        }
        throw error;
      }
    });
    const acknowledged: string[] = [];
    let inserted = 0;
    let duplicateCount = 0;

    this.db.exec("BEGIN IMMEDIATE");

    try {
      if (source) {
        const previous = this.db.prepare("SELECT digest FROM imports WHERE source_root = ?").get(
          source.root
        ) as { digest: string } | undefined;

        if (previous && previous.digest !== source.digest) {
          throw new UsageServiceError(
            "SOURCE_CHANGED",
            "旧事件源在迁移后发生变化，禁止重复接管",
            409
          );
        }

        this.db.prepare(
          "INSERT OR IGNORE INTO imports(source_root, digest, imported_at) VALUES (?, ?, ?)"
        ).run(source.root, source.digest, source.imported_at);
      }

      const findExisting = this.db.prepare("SELECT payload FROM events WHERE event_id = ?");
      const insert = this.db.prepare(
        "INSERT INTO events(event_id, occurred_at, user_id, payload, envelope) VALUES (?, ?, ?, ?, ?)"
      );

      for (const item of canonical) {
        const existing = findExisting.get(item.envelope.event_id) as { payload: string } | undefined;

        if (existing) {
          if (existing.payload !== item.payload) {
            throw new UsageServiceError(
              "EVENT_ID_CONFLICT",
              "event_id 内容冲突：" + item.envelope.event_id,
              409
            );
          }
          acknowledged.push(item.envelope.event_id);
          duplicateCount += 1;
          continue;
        }

        insert.run(
          item.envelope.event_id,
          item.envelope.occurred_at,
          item.envelope.user_id,
          item.payload,
          JSON.stringify(item.envelope)
        );
        acknowledged.push(item.envelope.event_id);
        inserted += 1;
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Transaction may already be rolled back.
      }
      throw error;
    }

    const result: UsageServiceIngestResult = {
      store_id: this.id,
      acknowledged,
      inserted,
      duplicate_count: duplicateCount
    };

    // Ingest-time cleanup: keep retention/capacity bounded without scanning on every batch.
    if (this.autoPruneEnabled && (this.retentionDays > 0 || this.maxEvents > 0)) {
      this.appendsSincePrune += inserted;
      const totalEvents = this.countEvents();
      const overCapacity = this.maxEvents > 0 && totalEvents > this.maxEvents;

      if (overCapacity || this.appendsSincePrune >= USAGE_SERVICE_AUTO_PRUNE_EVERY_APPENDS) {
        this.appendsSincePrune = 0;

        try {
          const pruned = this.prune({ mode: "apply" });

          if (pruned.deleted_total > 0) {
            result.maintenance = {
              deleted_by_retention: pruned.deleted_by_retention,
              deleted_by_capacity: pruned.deleted_by_capacity
            };
          }
        } catch {
          // Cleanup is best effort; ingest must not fail because maintenance failed.
        }
      }
    }

    return result;
  }

  metrics(
    query?: UsageServiceMetricsQuery,
    options: { generated_at?: string } = {}
  ): UsageServiceMetricsResult {
    const generatedAt = options.generated_at ?? new Date().toISOString();
    const normalizedQuery = normalizeMetricsQuery(query, generatedAt);
    const whereClauses: string[] = [];
    const parameters: string[] = [];

    if (normalizedQuery.from) {
      whereClauses.push("occurred_at >= ?");
      parameters.push(normalizedQuery.from);
    }
    if (normalizedQuery.to) {
      whereClauses.push("occurred_at <= ?");
      parameters.push(normalizedQuery.to);
    }
    if (normalizedQuery.user_id) {
      whereClauses.push("user_id = ?");
      parameters.push(normalizedQuery.user_id);
    }

    const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    const rows = this.db.prepare(
      "SELECT payload FROM events " + whereSql + " ORDER BY sequence LIMIT ?"
    ).all(...parameters, this.maxQueryEvents + 1) as Array<{ payload: string }>;

    if (rows.length > this.maxQueryEvents) {
      throw new UsageServiceError(
        "QUERY_TOO_LARGE",
        "指标查询超过 " + this.maxQueryEvents + " 条事件，请缩小时间范围或增加 user_id 过滤",
        413
      );
    }

    const boundedRows = rows;
    const events: MixlabUsageEvent[] = [];
    let malformedStoredEvents = 0;

    for (const row of boundedRows) {
      try {
        events.push(JSON.parse(row.payload) as MixlabUsageEvent);
      } catch {
        malformedStoredEvents += 1;
      }
    }

    const eventStore = emptyEventStoreMetrics(events.length);
    eventStore.malformed_line_count = malformedStoredEvents;
    const projection = buildUsageMetricsProjection(events, eventStore);
    const byDay = new Map<string, UsageServiceMetricsBucket>();

    for (const event of events) {
      const date = event.occurred_at.slice(0, 10);
      const bucket = byDay.get(date) ?? {
        date,
        event_count: 0,
        active_user_count: 0,
        search_request_count: 0
      };
      bucket.event_count += 1;

      if (event.event_type === "search" && event.search_page_type !== "cursor") {
        bucket.search_request_count += 1;
      }

      byDay.set(date, bucket);
    }

    const usersByDay = new Map<string, Set<string>>();
    for (const event of events) {
      const date = event.occurred_at.slice(0, 10);
      const users = usersByDay.get(date) ?? new Set<string>();
      users.add(event.user_id);
      usersByDay.set(date, users);
    }
    for (const [date, users] of usersByDay) {
      const bucket = byDay.get(date);
      if (bucket) {
        bucket.active_user_count = users.size;
      }
    }

    return {
      store_id: this.id,
      schema_version: USAGE_SERVICE_STORE_SCHEMA_VERSION,
      contract_version: CONTRACT_VERSION,
      generated_at: generatedAt,
      query: normalizedQuery,
      event_count: events.length,
      truncated: false,
      metrics: projection.metrics,
      by_day: [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date))
    };
  }

  close(): void {
    this.db.close();
  }
}
