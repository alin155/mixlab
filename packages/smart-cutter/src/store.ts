import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SmartError } from "./types.ts";

export type EntityKind = "work" | "job" | "account" | "hot" | "rule" | "monitor" | "snapshot";

/** Only this application's private database is opened for writing. */
export class SmartStore {
  readonly db: DatabaseSync;
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, "smart-state.sqlite"));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS schema_meta(version INTEGER NOT NULL);
      INSERT INTO schema_meta SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_meta);
      CREATE TABLE IF NOT EXISTS entities(
        kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL,
        updated_at TEXT NOT NULL, PRIMARY KEY(kind,id)
      );
      CREATE TABLE IF NOT EXISTS rule_claims(
        rule_id TEXT NOT NULL, hot_id TEXT NOT NULL, work_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, PRIMARY KEY(rule_id,hot_id)
      );
      CREATE TABLE IF NOT EXISTS request_budget(day TEXT PRIMARY KEY,count INTEGER NOT NULL);
    `);
    const schema = this.db.prepare("SELECT version FROM schema_meta").get() as { version: number };
    if (schema.version !== 1) throw new SmartError("state_version", "本机数据版本不兼容，请使用匹配的智能剪辑端版本", 409);
  }
  get<T>(kind: EntityKind, id: string): T | null {
    const row = this.db.prepare("SELECT value FROM entities WHERE kind=? AND id=?").get(kind, id) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : null;
  }
  list<T>(kind: EntityKind, limit = 1000): T[] {
    const rows = this.db.prepare("SELECT value FROM entities WHERE kind=? ORDER BY updated_at DESC,id LIMIT ?").all(kind, limit) as Array<{ value: string }>;
    return rows.map(row => JSON.parse(row.value) as T);
  }
  listStatus<T>(kind: EntityKind, statuses: string[], limit = 1000): T[] {
    if (!statuses.length) return [];
    const rows = this.db.prepare(`SELECT value FROM entities WHERE kind=? AND json_extract(value,'$.status') IN (${statuses.map(() => "?").join(",")}) ORDER BY json_extract(value,'$.created_at'),id LIMIT ?`)
      .all(kind, ...statuses, limit) as Array<{ value: string }>;
    return rows.map(row => JSON.parse(row.value) as T);
  }
  set<T extends { id: string }>(kind: EntityKind, entity: T): T {
    this.db.prepare("INSERT INTO entities(kind,id,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .run(kind, entity.id, JSON.stringify(entity), new Date().toISOString());
    return entity;
  }
  remove(kind: EntityKind, id: string): void {
    this.db.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id);
  }
  transact<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  claimRule(ruleId: string, hotId: string, now: string): boolean {
    return this.db.prepare("INSERT OR IGNORE INTO rule_claims(rule_id,hot_id,created_at) VALUES(?,?,?)").run(ruleId, hotId, now).changes === 1;
  }
  bindRuleWork(ruleId: string, hotId: string, workId: string): void {
    this.db.prepare("UPDATE rule_claims SET work_id=? WHERE rule_id=? AND hot_id=?").run(workId, ruleId, hotId);
  }
  releaseUnfinishedRuleClaim(ruleId: string, hotId: string): void {
    this.db.prepare("DELETE FROM rule_claims WHERE rule_id=? AND hot_id=? AND work_id=''").run(ruleId, hotId);
  }
  reserveRequest(day: string, limit: number): void {
    this.transact(() => {
      const row = this.db.prepare("SELECT count FROM request_budget WHERE day=?").get(day) as { count: number } | undefined;
      if ((row?.count ?? 0) >= limit) throw new SmartError("request_budget", "已达到今日接口请求上限，自动采集已等待", 429);
      this.db.prepare("INSERT INTO request_budget VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1").run(day);
    });
  }
  requestCount(day: string): number {
    return (this.db.prepare("SELECT count FROM request_budget WHERE day=?").get(day) as { count: number } | undefined)?.count ?? 0;
  }
  close(): void { this.db.close(); }
  count(kind: EntityKind): number { return (this.db.prepare("SELECT COUNT(*) AS count FROM entities WHERE kind=?").get(kind) as { count: number }).count; }
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
