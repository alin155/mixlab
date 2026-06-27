import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AdminScanDataSource,
  AdminScanMode,
  AdminScanReason
} from "./admin-scan-modes.ts";
import {
  adminMixlabRoot
} from "./admin-library-paths.ts";

export type AdminRuntimeCacheStatus =
  | "hit"
  | "miss"
  | "pending"
  | "not-applicable"
  | "unknown";

export interface AdminRuntimeEndpointMeta {
  schema_version: "1.0";
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  duration_ms: number;
  scan_mode: AdminScanMode;
  data_source: AdminScanDataSource;
  scan_reason: AdminScanReason;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  result_count: number;
  offset: number;
  limit: number;
  slow: boolean;
  slow_reason: string;
  fallback_reason?: string;
  repair_reason?: string;
  components?: AdminRuntimeComponentTiming[];
}

export interface AdminRuntimeComponentTiming {
  name: string;
  duration_ms: number;
  data_source?: AdminScanDataSource;
  scan_mode?: AdminScanMode;
  scan_reason?: AdminScanReason;
  cache_status?: AdminRuntimeCacheStatus;
  detail?: string;
}

export interface AdminApiResponseMeta {
  runtime: AdminRuntimeEndpointMeta;
}

export interface AdminRuntimeDiagnosticsHistoryEntry {
  schema_version: "1.0";
  recorded_at: string;
  runtime: AdminRuntimeEndpointMeta;
}

export interface AdminRuntimeDiagnosticsHistoryReadResult {
  schema_version: "1.0";
  generated_at: string;
  path: string;
  entries: AdminRuntimeDiagnosticsHistoryEntry[];
  limit: number;
  total_line_count: number;
  malformed_line_count: number;
  truncated: boolean;
}

export interface AppendAdminRuntimeDiagnosticsHistoryInput {
  library_root: string;
  recorded_at: string;
  runtime: AdminRuntimeEndpointMeta;
  max_entries?: number;
}

export interface ReadAdminRuntimeDiagnosticsHistoryInput {
  library_root: string;
  generated_at: string;
  limit?: number;
}

const DEFAULT_RUNTIME_DIAGNOSTICS_HISTORY_LIMIT = 50;
const MAX_RUNTIME_DIAGNOSTICS_HISTORY_LIMIT = 200;
const DEFAULT_RUNTIME_DIAGNOSTICS_HISTORY_MAX_ENTRIES = 500;
const MAX_RUNTIME_DIAGNOSTICS_HISTORY_MAX_ENTRIES = 2_000;

export function adminRuntimeDiagnosticsHistoryPath(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "admin-read-model", "runtime-diagnostics.ndjson");
}

function normalizeRuntimeDiagnosticsHistoryLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_RUNTIME_DIAGNOSTICS_HISTORY_LIMIT;
  }

  return Math.max(1, Math.min(MAX_RUNTIME_DIAGNOSTICS_HISTORY_LIMIT, Math.floor(limit)));
}

function normalizeRuntimeDiagnosticsHistoryMaxEntries(maxEntries: number | undefined): number {
  if (typeof maxEntries !== "number" || !Number.isFinite(maxEntries)) {
    return DEFAULT_RUNTIME_DIAGNOSTICS_HISTORY_MAX_ENTRIES;
  }

  return Math.max(1, Math.min(MAX_RUNTIME_DIAGNOSTICS_HISTORY_MAX_ENTRIES, Math.floor(maxEntries)));
}

function isAdminRuntimeEndpointMeta(value: unknown): value is AdminRuntimeEndpointMeta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const meta = value as AdminRuntimeEndpointMeta;

  return meta.schema_version === "1.0" &&
    typeof meta.endpoint === "string" &&
    meta.endpoint.trim() !== "" &&
    ["GET", "POST", "PATCH", "DELETE"].includes(meta.method) &&
    typeof meta.duration_ms === "number" &&
    Number.isFinite(meta.duration_ms) &&
    typeof meta.scan_mode === "string" &&
    meta.scan_mode.trim() !== "" &&
    typeof meta.data_source === "string" &&
    meta.data_source.trim() !== "" &&
    typeof meta.scan_reason === "string" &&
    meta.scan_reason.trim() !== "" &&
    typeof meta.actual_data_source === "string" &&
    meta.actual_data_source.trim() !== "" &&
    typeof meta.cache_status === "string" &&
    meta.cache_status.trim() !== "" &&
    typeof meta.result_count === "number" &&
    Number.isFinite(meta.result_count) &&
    typeof meta.offset === "number" &&
    Number.isFinite(meta.offset) &&
    typeof meta.limit === "number" &&
    Number.isFinite(meta.limit) &&
    typeof meta.slow === "boolean" &&
    typeof meta.slow_reason === "string" &&
    (
      meta.fallback_reason === undefined ||
      typeof meta.fallback_reason === "string"
    ) &&
    (
      meta.repair_reason === undefined ||
      typeof meta.repair_reason === "string"
    ) &&
    (
      meta.components === undefined ||
      (
        Array.isArray(meta.components) &&
        meta.components.every(isAdminRuntimeComponentTiming)
      )
    );
}

function isAdminRuntimeComponentTiming(value: unknown): value is AdminRuntimeComponentTiming {
  if (!value || typeof value !== "object") {
    return false;
  }

  const component = value as AdminRuntimeComponentTiming;

  return typeof component.name === "string" &&
    component.name.trim() !== "" &&
    typeof component.duration_ms === "number" &&
    Number.isFinite(component.duration_ms) &&
    (
      component.data_source === undefined ||
      typeof component.data_source === "string"
    ) &&
    (
      component.scan_mode === undefined ||
      typeof component.scan_mode === "string"
    ) &&
    (
      component.scan_reason === undefined ||
      typeof component.scan_reason === "string"
    ) &&
    (
      component.cache_status === undefined ||
      typeof component.cache_status === "string"
    ) &&
    (
      component.detail === undefined ||
      typeof component.detail === "string"
    );
}

function normalizeRuntimeComponentTimings(
  components: AdminRuntimeComponentTiming[] | undefined
): AdminRuntimeComponentTiming[] | undefined {
  if (!components || components.length === 0) {
    return undefined;
  }

  return components
    .filter((component) => component.name.trim() !== "")
    .map((component) => ({
      name: component.name,
      duration_ms: Math.max(0, Math.round(component.duration_ms)),
      ...(component.data_source ? { data_source: component.data_source } : {}),
      ...(component.scan_mode ? { scan_mode: component.scan_mode } : {}),
      ...(component.scan_reason ? { scan_reason: component.scan_reason } : {}),
      ...(component.cache_status ? { cache_status: component.cache_status } : {}),
      ...(component.detail ? { detail: component.detail } : {})
    }));
}

function isAdminRuntimeDiagnosticsHistoryEntry(value: unknown): value is AdminRuntimeDiagnosticsHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as AdminRuntimeDiagnosticsHistoryEntry;

  return entry.schema_version === "1.0" &&
    typeof entry.recorded_at === "string" &&
    entry.recorded_at.trim() !== "" &&
    isAdminRuntimeEndpointMeta(entry.runtime);
}

async function readRuntimeDiagnosticsHistoryEntries(
  targetPath: string
): Promise<{
  entries: AdminRuntimeDiagnosticsHistoryEntry[];
  total_line_count: number;
  malformed_line_count: number;
}> {
  let text = "";

  try {
    text = await readFile(targetPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== "");
  const entries: AdminRuntimeDiagnosticsHistoryEntry[] = [];
  let malformedLineCount = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isAdminRuntimeDiagnosticsHistoryEntry(parsed)) {
        entries.push(parsed);
      } else {
        malformedLineCount += 1;
      }
    } catch {
      malformedLineCount += 1;
    }
  }

  return {
    entries,
    total_line_count: lines.length,
    malformed_line_count: malformedLineCount
  };
}

export function adminRuntimeNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function buildAdminRuntimeEndpointMeta(input: {
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  started_at_ms: number;
  finished_at_ms?: number;
  scan_mode: AdminScanMode;
  data_source: AdminScanDataSource;
  scan_reason: AdminScanReason;
  actual_data_source?: AdminScanDataSource;
  cache_status?: AdminRuntimeCacheStatus;
  result_count?: number;
  offset?: number;
  limit?: number;
  slow_threshold_ms?: number;
  slow_reason?: string;
  fallback_reason?: string;
  repair_reason?: string;
  components?: AdminRuntimeComponentTiming[];
}): AdminRuntimeEndpointMeta {
  const finishedAtMs = input.finished_at_ms ?? adminRuntimeNowMs();
  const durationMs = Math.max(0, Math.round(finishedAtMs - input.started_at_ms));
  const slowThresholdMs = Math.max(1, input.slow_threshold_ms ?? 1_000);
  const slow = durationMs > slowThresholdMs;
  const components = normalizeRuntimeComponentTimings(input.components);

  return {
    schema_version: "1.0",
    endpoint: input.endpoint,
    method: input.method,
    duration_ms: durationMs,
    scan_mode: input.scan_mode,
    data_source: input.data_source,
    scan_reason: input.scan_reason,
    actual_data_source: input.actual_data_source ?? input.data_source,
    cache_status: input.cache_status ?? "unknown",
    result_count: Math.max(0, Math.floor(input.result_count ?? 0)),
    offset: Math.max(0, Math.floor(input.offset ?? 0)),
    limit: Math.max(0, Math.floor(input.limit ?? 0)),
    slow,
    slow_reason: slow ? input.slow_reason ?? "duration_above_target" : "",
    fallback_reason: input.fallback_reason ?? "",
    ...(input.repair_reason ? { repair_reason: input.repair_reason } : {}),
    ...(components ? { components } : {})
  };
}

export async function appendAdminRuntimeDiagnosticsHistory(
  input: AppendAdminRuntimeDiagnosticsHistoryInput
): Promise<AdminRuntimeDiagnosticsHistoryEntry> {
  const targetPath = adminRuntimeDiagnosticsHistoryPath(input.library_root);
  const maxEntries = normalizeRuntimeDiagnosticsHistoryMaxEntries(input.max_entries);
  const history = await readRuntimeDiagnosticsHistoryEntries(targetPath);
  const entry: AdminRuntimeDiagnosticsHistoryEntry = {
    schema_version: "1.0",
    recorded_at: input.recorded_at,
    runtime: input.runtime
  };
  const boundedEntries = [...history.entries, entry].slice(-maxEntries);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(
    targetPath,
    boundedEntries.map((historyEntry) => JSON.stringify(historyEntry)).join("\n") + "\n",
    "utf8"
  );

  return entry;
}

export async function readAdminRuntimeDiagnosticsHistory(
  input: ReadAdminRuntimeDiagnosticsHistoryInput
): Promise<AdminRuntimeDiagnosticsHistoryReadResult> {
  const targetPath = adminRuntimeDiagnosticsHistoryPath(input.library_root);
  const limit = normalizeRuntimeDiagnosticsHistoryLimit(input.limit);
  const history = await readRuntimeDiagnosticsHistoryEntries(targetPath);
  const limited = history.entries.slice(-limit).reverse();

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    path: targetPath,
    entries: limited,
    limit,
    total_line_count: history.total_line_count,
    malformed_line_count: history.malformed_line_count,
    truncated: history.entries.length > limited.length
  };
}
