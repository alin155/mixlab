import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import {
  postUsageServiceEvents,
  readUsageServiceHealth,
  usageServiceUrl,
  type UsageServiceConnection
} from "./usage-service-client.ts";
import { canonicalUsageEvent } from "./usage-service-store.ts";

const OUTBOX_FLUSH_INTERVAL_MS = 2_000;
const OUTBOX_BATCH_SIZE = 100;
const OUTBOX_SCHEMA_SQL = [
  "PRAGMA busy_timeout=5000;",
  "PRAGMA journal_mode=WAL;",
  "PRAGMA synchronous=FULL;",
  "CREATE TABLE IF NOT EXISTS events (",
  "  sequence INTEGER PRIMARY KEY,",
  "  event_id TEXT NOT NULL UNIQUE,",
  "  payload TEXT NOT NULL,",
  "  acknowledged INTEGER NOT NULL DEFAULT 0",
  ");",
  "CREATE INDEX IF NOT EXISTS pending_events ON events(sequence) WHERE acknowledged = 0;",
  "CREATE TABLE IF NOT EXISTS destination (id INTEGER PRIMARY KEY CHECK (id = 1), store_id TEXT NOT NULL);"
].join("\n");

export interface UsageOutboxStatus {
  total: number;
  pending: number;
  store_id: string;
  last_error: string;
}

function isAbsoluteLocalPath(root: string): boolean {
  return path.isAbsolute(root) && !/^\\\\|^\/\//.test(root);
}

/**
 * Client-side outbox: events are written to a local SQLite before delivery, then acknowledged
 * event-by-event by the usage service. Safe to retry; duplicate event_ids are deduplicated by
 * the service and acknowledged again.
 */
export class UsageOutbox {
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval>;
  private controller = new AbortController();
  private closed = false;
  private writes = new Set<Promise<unknown>>();
  last_error = "";

  constructor(readonly root: string, readonly connection: UsageServiceConnection) {
    usageServiceUrl(connection);

    if (!isAbsoluteLocalPath(root)) {
      throw new Error("统计 outbox 必须使用本机绝对路径");
    }

    this.timer = setInterval(() => {
      void this.flush();
    }, OUTBOX_FLUSH_INTERVAL_MS);
    this.timer.unref();
    void this.flush();
  }

  private async open(): Promise<DatabaseSync> {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(path.join(this.root, "outbox.sqlite"));

    try {
      db.exec(OUTBOX_SCHEMA_SQL);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  enqueue(value: unknown): Promise<string> {
    if (this.closed) {
      return Promise.reject(new Error("统计 outbox 已关闭"));
    }

    const write = this.persist(value);
    this.writes.add(write);
    void write.finally(() => {
      this.writes.delete(write);
    }).catch(() => undefined);
    return write;
  }

  private async persist(value: unknown): Promise<string> {
    const { envelope } = canonicalUsageEvent(value);
    // The outbox stores the shared contract envelope (what the service ingests), not the
    // internal projection event shape.
    const payload = JSON.stringify(envelope);
    const db = await this.open();

    try {
      db.exec("BEGIN IMMEDIATE");
      const existing = db.prepare(
        "SELECT payload FROM events WHERE event_id = ?"
      ).get(envelope.event_id) as { payload: string } | undefined;

      if (existing && existing.payload !== payload) {
        throw new Error("本机 event_id 内容冲突");
      }

      db.prepare("INSERT OR IGNORE INTO events(event_id, payload) VALUES (?, ?)").run(
        envelope.event_id,
        payload
      );
      db.exec("COMMIT");
      return envelope.event_id;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // ignore
      }
      this.last_error = "outbox_write_failed";
      throw error;
    } finally {
      db.close();
    }
  }

  async status(): Promise<UsageOutboxStatus> {
    const db = await this.open();

    try {
      const counts = db.prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(acknowledged = 0), 0) AS pending FROM events"
      ).get() as { total: number; pending: number };
      const destination = db.prepare(
        "SELECT store_id FROM destination WHERE id = 1"
      ).get() as { store_id: string } | undefined;

      return {
        total: Number(counts.total),
        pending: Number(counts.pending),
        store_id: destination?.store_id ?? "",
        last_error: this.last_error
      };
    } finally {
      db.close();
    }
  }

  flush(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }

    const previous = this.pending ?? Promise.resolve();
    let run: Promise<void>;
    run = previous
      .catch(() => undefined)
      .then(async () => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const delivered = await this.deliver();

          if (delivered === 0) {
            return;
          }
        }
      })
      .catch((error: unknown) => {
        this.last_error = (error as { code?: string }).code ?? "usage_delivery_failed";
      })
      .finally(() => {
        if (this.pending === run) {
          this.pending = null;
        }
      });
    this.pending = run;
    return run;
  }

  private async deliver(): Promise<number> {
    const db = await this.open();

    try {
      const rows = db.prepare(
        "SELECT event_id, payload FROM events WHERE acknowledged = 0 ORDER BY sequence LIMIT ?"
      ).all(OUTBOX_BATCH_SIZE) as Array<{ event_id: string; payload: string }>;

      if (rows.length === 0 || this.closed) {
        return 0;
      }

      const health = await readUsageServiceHealth(this.connection, {
        signal: this.controller.signal
      });

      if (!health.store_id) {
        throw new Error("统计服务身份无效");
      }

      db.prepare("INSERT OR IGNORE INTO destination(id, store_id) VALUES (1, ?)").run(
        health.store_id
      );
      const pinned = db.prepare(
        "SELECT store_id FROM destination WHERE id = 1"
      ).get() as { store_id: string };

      if (pinned.store_id !== health.store_id) {
        throw Object.assign(new Error("统计服务身份改变，outbox 保持待确认"), {
          code: "usage_destination_changed"
        });
      }

      const ack = await postUsageServiceEvents(
        this.connection,
        rows.map((row) => JSON.parse(row.payload) as unknown),
        { store_id: health.store_id, signal: this.controller.signal }
      );

      if (
        ack.store_id !== health.store_id ||
        !Array.isArray(ack.acknowledged) ||
        ack.acknowledged.length !== rows.length ||
        new Set(ack.acknowledged).size !== rows.length ||
        rows.some((row) => !ack.acknowledged.includes(row.event_id))
      ) {
        throw new Error("统计确认不完整，保留原事件重试");
      }

      db.exec("BEGIN IMMEDIATE");

      try {
        const mark = db.prepare(
          "UPDATE events SET acknowledged = 1 WHERE event_id = ? AND payload = ?"
        );
        for (const row of rows) {
          mark.run(row.event_id, row.payload);
        }
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // ignore
        }
        throw error;
      }

      this.last_error = "";
      return rows.length;
    } finally {
      db.close();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    this.controller.abort();
    await Promise.allSettled([...this.writes]);
    await this.pending;
  }
}
