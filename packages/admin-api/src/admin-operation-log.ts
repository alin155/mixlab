import { randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import {
  adminMixlabRoot
} from "./admin-library-paths.ts";

export type AdminOperationLogArea =
  | "read-model"
  | "protection"
  | "preprocess"
  | "release"
  | "settings"
  | "users"
  | "system";

export type AdminOperationLogEventType =
  | "started"
  | "progress"
  | "cancel-requested"
  | "cancelled"
  | "succeeded"
  | "skipped"
  | "failed";

export interface AdminOperationLogEvent {
  schema_version: "1.0";
  event_id: string;
  occurred_at: string;
  area: AdminOperationLogArea;
  action: string;
  event_type: AdminOperationLogEventType;
  message: string;
  details: Record<string, unknown>;
}

export interface AdminOperationLogAppendInput {
  library_root: string;
  occurred_at: string;
  area: AdminOperationLogArea;
  action: string;
  event_type: AdminOperationLogEventType;
  message: string;
  details?: Record<string, unknown>;
  event_id?: string;
}

export interface AdminOperationLogReadResult {
  schema_version: "1.0";
  generated_at: string;
  path: string;
  events: AdminOperationLogEvent[];
  limit: number;
  total_line_count: number;
  malformed_line_count: number;
  truncated: boolean;
  read_mode?: "full-file" | "warming" | "stale-cache";
  cache_status?: "miss" | "hit" | "warming" | "stale";
  complete?: boolean;
  refresh_in_progress?: boolean;
}

type ReadOperationLogText = (targetPath: string) => Promise<string>;

interface OperationLogCacheEntry {
  result: AdminOperationLogReadResult;
  expires_at_ms: number;
}

const operationLogCache = new Map<string, OperationLogCacheEntry>();
const operationLogRefreshes = new Map<string, Promise<AdminOperationLogReadResult>>();

export function adminOperationLogPath(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "admin", "operation-log", "events.ndjson");
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined) {
    return 50;
  }

  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function isAdminOperationLogEvent(value: unknown): value is AdminOperationLogEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as AdminOperationLogEvent;
  return event.schema_version === "1.0" &&
    typeof event.event_id === "string" &&
    event.event_id.trim() !== "" &&
    typeof event.occurred_at === "string" &&
    event.occurred_at.trim() !== "" &&
    typeof event.area === "string" &&
    event.area.trim() !== "" &&
    typeof event.action === "string" &&
    event.action.trim() !== "" &&
    typeof event.event_type === "string" &&
    event.event_type.trim() !== "" &&
    typeof event.message === "string" &&
    event.message.trim() !== "" &&
    Boolean(event.details) &&
    typeof event.details === "object" &&
    !Array.isArray(event.details);
}

export async function appendAdminOperationLogEvent(
  input: AdminOperationLogAppendInput
): Promise<AdminOperationLogEvent> {
  const event: AdminOperationLogEvent = {
    schema_version: "1.0",
    event_id: input.event_id ?? randomUUID(),
    occurred_at: input.occurred_at,
    area: input.area,
    action: input.action,
    event_type: input.event_type,
    message: input.message,
    details: input.details ?? {}
  };
  const targetPath = adminOperationLogPath(input.library_root);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await appendFile(targetPath, `${JSON.stringify(event)}\n`, "utf8");
  clearOperationLogCache(targetPath);

  return event;
}

function clearOperationLogCache(targetPath: string): void {
  for (const key of operationLogCache.keys()) {
    if (key.startsWith(`${targetPath}::`)) {
      operationLogCache.delete(key);
    }
  }
}

function cacheKey(input: {
  target_path: string;
  limit: number;
}): string {
  return `${input.target_path}::${input.limit}`;
}

function timeout<T>(ms: number): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    setTimeout(() => resolve("timeout"), ms);
  });
}

async function defaultReadOperationLogText(targetPath: string): Promise<string> {
  try {
    return await readFile(targetPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return "";
}

async function readAdminOperationLogFromFile(input: {
  library_root: string;
  generated_at: string;
  limit?: number;
  read_text?: ReadOperationLogText;
}): Promise<AdminOperationLogReadResult> {
  const targetPath = adminOperationLogPath(input.library_root);
  const limit = normalizeLimit(input.limit);
  const text = await (input.read_text ?? defaultReadOperationLogText)(targetPath);

  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== "");
  const events: AdminOperationLogEvent[] = [];
  let malformedLineCount = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isAdminOperationLogEvent(parsed)) {
        events.push(parsed);
      } else {
        malformedLineCount += 1;
      }
    } catch {
      malformedLineCount += 1;
    }
  }

  const limited = events.slice(-limit).reverse();

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    path: targetPath,
    events: limited,
    limit,
    total_line_count: lines.length,
    malformed_line_count: malformedLineCount,
    truncated: events.length > limited.length,
    read_mode: "full-file",
    cache_status: "miss",
    complete: true,
    refresh_in_progress: false
  };
}

function withGeneratedAt(
  result: AdminOperationLogReadResult,
  generatedAt: string,
  cacheStatus: AdminOperationLogReadResult["cache_status"]
): AdminOperationLogReadResult {
  return {
    ...result,
    generated_at: generatedAt,
    cache_status: cacheStatus,
    read_mode: cacheStatus === "stale" ? "stale-cache" : result.read_mode,
    refresh_in_progress: cacheStatus === "stale"
  };
}

function warmingOperationLogResult(input: {
  target_path: string;
  generated_at: string;
  limit: number;
}): AdminOperationLogReadResult {
  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    path: input.target_path,
    events: [],
    limit: input.limit,
    total_line_count: 0,
    malformed_line_count: 0,
    truncated: false,
    read_mode: "warming",
    cache_status: "warming",
    complete: false,
    refresh_in_progress: true
  };
}

function startOperationLogRefresh(input: {
  library_root: string;
  generated_at: string;
  limit: number;
  cache_key: string;
  cache_ttl_ms: number;
  read_text?: ReadOperationLogText;
}): Promise<AdminOperationLogReadResult> {
  const activeRefresh = operationLogRefreshes.get(input.cache_key);
  if (activeRefresh) {
    return activeRefresh;
  }

  const refresh = readAdminOperationLogFromFile({
    library_root: input.library_root,
    generated_at: input.generated_at,
    limit: input.limit,
    read_text: input.read_text
  }).then((result) => {
    operationLogCache.set(input.cache_key, {
      result,
      expires_at_ms: Date.now() + input.cache_ttl_ms
    });
    return result;
  }).finally(() => {
    operationLogRefreshes.delete(input.cache_key);
  });

  operationLogRefreshes.set(input.cache_key, refresh);
  return refresh;
}

export async function readAdminOperationLog(input: {
  library_root: string;
  generated_at: string;
  limit?: number;
  max_wait_ms?: number;
  cache_ttl_ms?: number;
  read_text?: ReadOperationLogText;
}): Promise<AdminOperationLogReadResult> {
  if (!Number.isFinite(input.max_wait_ms) || input.max_wait_ms === undefined) {
    return readAdminOperationLogFromFile(input);
  }

  const targetPath = adminOperationLogPath(input.library_root);
  const limit = normalizeLimit(input.limit);
  const key = cacheKey({ target_path: targetPath, limit });
  const nowMs = Date.now();
  const cacheTtlMs = Math.max(250, Math.min(10_000, Math.floor(input.cache_ttl_ms ?? 2_000)));
  const cached = operationLogCache.get(key);

  if (cached && cached.expires_at_ms > nowMs) {
    return withGeneratedAt(cached.result, input.generated_at, "hit");
  }

  const refresh = startOperationLogRefresh({
    library_root: input.library_root,
    generated_at: input.generated_at,
    limit,
    cache_key: key,
    cache_ttl_ms: cacheTtlMs,
    read_text: input.read_text
  });
  const readBudgetMs = Math.max(1, Math.min(5_000, Math.floor(input.max_wait_ms)));
  const result = await Promise.race([
    refresh,
    timeout<AdminOperationLogReadResult>(readBudgetMs)
  ]);

  if (result !== "timeout") {
    return result;
  }

  if (cached) {
    return withGeneratedAt(cached.result, input.generated_at, "stale");
  }

  return warmingOperationLogResult({
    target_path: targetPath,
    generated_at: input.generated_at,
    limit
  });
}
