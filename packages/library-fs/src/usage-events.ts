import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

export type MixlabUsageEventType =
  | "search"
  | "view_source_video"
  | "view_transcript"
  | "select_transcript_span"
  | "add_to_cut_list"
  | "submit_cut_job"
  | "cut_success"
  | "cut_failure"
  | "create_local_clip"
  | "reuse_local_clip";

export type MixlabUsageResultStatus = "success" | "empty" | "failure";
export type MixlabUsageSearchMode = "searchd" | "sqlite-index" | "transcript-artifact-fallback";
export type MixlabUsageSearchPageType = "first" | "cursor";

export interface MixlabUsageEvent {
  event_id?: string;
  user_id: string;
  username: string;
  device_id: string;
  event_type: MixlabUsageEventType;
  occurred_at: string;
  source_video_id?: string;
  cut_job_id?: string;
  query?: string;
  search_mode?: MixlabUsageSearchMode;
  search_page_type?: MixlabUsageSearchPageType;
  search_elapsed_ms?: number;
  selected_duration_ms?: number;
  result_status?: MixlabUsageResultStatus;
}

export interface UserUsageMetrics {
  user_id: string;
  username: string;
  search_request_count: number;
  search_failure_count: number;
  add_to_cut_list_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  local_clip_count: number;
  reuse_local_clip_count: number;
  last_used_at: string;
}

export interface UsageEventStoreMetrics {
  line_count: number;
  valid_line_count: number;
  malformed_line_count: number;
  malformed_lines: number[];
  warning: string;
}

export interface UsageMetrics {
  search_request_count: number;
  search_hit_count: number;
  search_empty_count: number;
  search_failure_count: number;
  search_latency_p50_ms: number;
  search_latency_p95_ms: number;
  search_latency_max_ms: number;
  searchd_search_count: number;
  sqlite_index_search_count: number;
  fallback_search_count: number;
  search_backend_unknown_count: number;
  core_search_request_count: number;
  core_search_failure_count: number;
  core_search_latency_p50_ms: number;
  core_search_latency_p95_ms: number;
  core_search_latency_max_ms: number;
  core_searchd_search_count: number;
  core_sqlite_index_search_count: number;
  core_fallback_search_count: number;
  core_search_backend_unknown_count: number;
  source_detail_view_count: number;
  transcript_selection_count: number;
  add_to_cut_list_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  cut_failure_count: number;
  local_clip_count: number;
  reuse_local_clip_count: number;
  active_user_count: number;
  recent_keywords: string[];
  most_used_source_video_ids: string[];
  users: UserUsageMetrics[];
  event_store: UsageEventStoreMetrics;
}

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
const CORE_SEARCH_SAMPLE_LIMIT = 20;
export const USAGE_METRICS_SUMMARY_PROJECTION_FILE_NAME = "usage-metrics.sqlite";
export const USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION = "admin-usage-metrics-summary-v2";
const RESULT_STATUSES = new Set<MixlabUsageResultStatus>([
  "success",
  "empty",
  "failure"
]);
const SEARCH_MODES = new Set<MixlabUsageSearchMode>([
  "searchd",
  "sqlite-index",
  "transcript-artifact-fallback"
]);
const SEARCH_PAGE_TYPES = new Set<MixlabUsageSearchPageType>([
  "first",
  "cursor"
]);
const eventMutationQueues = new Map<string, Promise<void>>();

export interface UsageEventsFileSignature {
  exists: boolean;
  size_bytes: number;
  mtime_ms: number;
}

interface UsageKeywordProjectionEntry {
  key: string;
  keyword: string;
  occurred_at: string;
  sequence: number;
}

interface UsageCoreSearchProjectionEvent {
  occurred_at: string;
  sequence: number;
  result_status?: MixlabUsageResultStatus;
  search_elapsed_ms?: number;
  search_mode?: MixlabUsageSearchMode;
}

export interface UsageMetricsProjectionState {
  schema_version: typeof USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION;
  next_sequence: number;
  search_latency_ms: number[];
  source_video_counts: Array<[string, number]>;
  keyword_entries: UsageKeywordProjectionEntry[];
  core_search_events: UsageCoreSearchProjectionEvent[];
}

export interface UsageMetricsProjection {
  metrics: UsageMetrics;
  projection_state: UsageMetricsProjectionState;
}

export interface StoredUsageMetricsSummaryProjection {
  metrics: UsageMetrics;
  projection_state?: UsageMetricsProjectionState;
  generated_at: string;
}

function emptyEventStoreMetrics(): UsageEventStoreMetrics {
  return {
    line_count: 0,
    valid_line_count: 0,
    malformed_line_count: 0,
    malformed_lines: [],
    warning: ""
  };
}

function usageEventsPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson");
}

export function usageMetricsSummaryProjectionPath(libraryRoot: string): string {
  return path.join(
    libraryRoot,
    ".mixlab-library",
    "admin-read-model",
    USAGE_METRICS_SUMMARY_PROJECTION_FILE_NAME
  );
}

export async function readUsageEventsFileSignature(libraryRoot: string): Promise<UsageEventsFileSignature> {
  try {
    const fileStat = await stat(usageEventsPath(libraryRoot));
    if (!fileStat.isFile()) {
      return {
        exists: false,
        size_bytes: 0,
        mtime_ms: 0
      };
    }

    return {
      exists: true,
      size_bytes: Number(fileStat.size),
      mtime_ms: Math.floor(fileStat.mtimeMs)
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {
        exists: false,
        size_bytes: 0,
        mtime_ms: 0
      };
    }
    throw error;
  }
}

export function usageEventsFileSignaturesEqual(
  left: UsageEventsFileSignature,
  right: UsageEventsFileSignature
): boolean {
  return left.exists === right.exists &&
    left.size_bytes === right.size_bytes &&
    left.mtime_ms === right.mtime_ms;
}

export async function invalidateUsageMetricsSummaryProjection(libraryRoot: string): Promise<{
  path: string;
  invalidated: boolean;
}> {
  const summaryPath = usageMetricsSummaryProjectionPath(libraryRoot);
  try {
    await unlink(summaryPath);
    return {
      path: summaryPath,
      invalidated: true
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {
        path: summaryPath,
        invalidated: false
      };
    }
    throw error;
  }
}

function emptyMetrics(): UsageMetrics {
  return {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
    search_failure_count: 0,
    search_latency_p50_ms: 0,
    search_latency_p95_ms: 0,
    search_latency_max_ms: 0,
    searchd_search_count: 0,
    sqlite_index_search_count: 0,
    fallback_search_count: 0,
    search_backend_unknown_count: 0,
    core_search_request_count: 0,
    core_search_failure_count: 0,
    core_search_latency_p50_ms: 0,
    core_search_latency_p95_ms: 0,
    core_search_latency_max_ms: 0,
    core_searchd_search_count: 0,
    core_sqlite_index_search_count: 0,
    core_fallback_search_count: 0,
    core_search_backend_unknown_count: 0,
    source_detail_view_count: 0,
    transcript_selection_count: 0,
    add_to_cut_list_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    cut_failure_count: 0,
    local_clip_count: 0,
    reuse_local_clip_count: 0,
    active_user_count: 0,
    recent_keywords: [],
    most_used_source_video_ids: [],
    users: [],
    event_store: emptyEventStoreMetrics()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isUsageEventStoreMetrics(value: unknown): value is UsageEventStoreMetrics {
  return isRecord(value) &&
    isNumber(value.line_count) &&
    isNumber(value.valid_line_count) &&
    isNumber(value.malformed_line_count) &&
    Array.isArray(value.malformed_lines) &&
    value.malformed_lines.every((item) => isNumber(item)) &&
    typeof value.warning === "string";
}

function isUserUsageMetrics(value: unknown): value is UserUsageMetrics {
  return isRecord(value) &&
    typeof value.user_id === "string" &&
    typeof value.username === "string" &&
    isNumber(value.search_request_count) &&
    isNumber(value.search_failure_count) &&
    isNumber(value.add_to_cut_list_count) &&
    isNumber(value.transcript_selection_count) &&
    isNumber(value.cut_submission_count) &&
    isNumber(value.cut_success_count) &&
    isNumber(value.local_clip_count) &&
    isNumber(value.reuse_local_clip_count) &&
    typeof value.last_used_at === "string";
}

function isUsageMetrics(value: unknown): value is UsageMetrics {
  if (!isRecord(value)) {
    return false;
  }

  const numberFields: Array<keyof UsageMetrics> = [
    "search_request_count",
    "search_hit_count",
    "search_empty_count",
    "search_failure_count",
    "search_latency_p50_ms",
    "search_latency_p95_ms",
    "search_latency_max_ms",
    "searchd_search_count",
    "sqlite_index_search_count",
    "fallback_search_count",
    "search_backend_unknown_count",
    "core_search_request_count",
    "core_search_failure_count",
    "core_search_latency_p50_ms",
    "core_search_latency_p95_ms",
    "core_search_latency_max_ms",
    "core_searchd_search_count",
    "core_sqlite_index_search_count",
    "core_fallback_search_count",
    "core_search_backend_unknown_count",
    "source_detail_view_count",
    "transcript_selection_count",
    "add_to_cut_list_count",
    "cut_submission_count",
    "cut_success_count",
    "cut_failure_count",
    "local_clip_count",
    "reuse_local_clip_count",
    "active_user_count"
  ];

  return numberFields.every((field) => isNumber(value[field])) &&
    isStringArray(value.recent_keywords) &&
    isStringArray(value.most_used_source_video_ids) &&
    Array.isArray(value.users) &&
    value.users.every(isUserUsageMetrics) &&
    isUsageEventStoreMetrics(value.event_store);
}

function isSearchMode(value: unknown): value is MixlabUsageSearchMode {
  return typeof value === "string" && SEARCH_MODES.has(value as MixlabUsageSearchMode);
}

function isResultStatus(value: unknown): value is MixlabUsageResultStatus {
  return typeof value === "string" && RESULT_STATUSES.has(value as MixlabUsageResultStatus);
}

function isKeywordProjectionEntry(value: unknown): value is UsageKeywordProjectionEntry {
  return isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.keyword === "string" &&
    typeof value.occurred_at === "string" &&
    isNumber(value.sequence);
}

function isCoreSearchProjectionEvent(value: unknown): value is UsageCoreSearchProjectionEvent {
  return isRecord(value) &&
    typeof value.occurred_at === "string" &&
    isNumber(value.sequence) &&
    (value.result_status === undefined || isResultStatus(value.result_status)) &&
    (value.search_elapsed_ms === undefined || isNumber(value.search_elapsed_ms)) &&
    (value.search_mode === undefined || isSearchMode(value.search_mode));
}

function isSourceVideoCountEntry(value: unknown): value is [string, number] {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    isNumber(value[1]);
}

function isUsageMetricsProjectionState(value: unknown): value is UsageMetricsProjectionState {
  return isRecord(value) &&
    value.schema_version === USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION &&
    isNumber(value.next_sequence) &&
    Array.isArray(value.search_latency_ms) &&
    value.search_latency_ms.every(isNumber) &&
    Array.isArray(value.source_video_counts) &&
    value.source_video_counts.every(isSourceVideoCountEntry) &&
    Array.isArray(value.keyword_entries) &&
    value.keyword_entries.every(isKeywordProjectionEntry) &&
    Array.isArray(value.core_search_events) &&
    value.core_search_events.every(isCoreSearchProjectionEvent);
}

function trimRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`使用事件数据无效：${field} 必须是字符串`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`使用事件数据无效：${field} 不能为空`);
  }
  return trimmed;
}

function trimOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`使用事件数据无效：${field} 必须是字符串`);
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function validateUsageEvent(
  value: unknown,
  options: { require_event_id: boolean }
): MixlabUsageEvent {
  if (!isRecord(value)) {
    throw new Error("使用事件数据无效：事件必须是对象");
  }

  const eventId = options.require_event_id
    ? trimRequiredString(value.event_id, "event_id")
    : trimOptionalString(value.event_id, "event_id") ?? randomUUID();
  const userId = trimRequiredString(value.user_id, "user_id");
  const username = trimRequiredString(value.username, "username");
  const deviceId = trimRequiredString(value.device_id, "device_id");
  const eventType = trimRequiredString(value.event_type, "event_type");
  if (!EVENT_TYPES.has(eventType as MixlabUsageEventType)) {
    throw new Error("使用事件数据无效：event_type 不合法");
  }

  const occurredAt = trimRequiredString(value.occurred_at, "occurred_at");
  const sourceVideoId = trimOptionalString(value.source_video_id, "source_video_id");
  const cutJobId = trimOptionalString(value.cut_job_id, "cut_job_id");
  const query = trimOptionalString(value.query, "query");
  const searchMode = trimOptionalString(value.search_mode, "search_mode");
  if (
    searchMode !== undefined &&
    !SEARCH_MODES.has(searchMode as MixlabUsageSearchMode)
  ) {
    throw new Error("使用事件数据无效：search_mode 不合法");
  }
  const searchPageType = trimOptionalString(value.search_page_type, "search_page_type");
  if (
    searchPageType !== undefined &&
    !SEARCH_PAGE_TYPES.has(searchPageType as MixlabUsageSearchPageType)
  ) {
    throw new Error("使用事件数据无效：search_page_type 不合法");
  }
  const resultStatus = trimOptionalString(value.result_status, "result_status");
  if (
    resultStatus !== undefined &&
    !RESULT_STATUSES.has(resultStatus as MixlabUsageResultStatus)
  ) {
    throw new Error("使用事件数据无效：result_status 不合法");
  }

  const selectedDurationMs = value.selected_duration_ms;
  if (selectedDurationMs !== undefined) {
    if (
      typeof selectedDurationMs !== "number" ||
      !Number.isInteger(selectedDurationMs) ||
      selectedDurationMs < 0
    ) {
      throw new Error("使用事件数据无效：selected_duration_ms 必须是非负整数");
    }
  }

  const searchElapsedMs = value.search_elapsed_ms;
  if (searchElapsedMs !== undefined) {
    if (
      typeof searchElapsedMs !== "number" ||
      !Number.isInteger(searchElapsedMs) ||
      searchElapsedMs < 0
    ) {
      throw new Error("使用事件数据无效：search_elapsed_ms 必须是非负整数");
    }
  }

  const event: MixlabUsageEvent = {
    event_id: eventId,
    user_id: userId,
    username,
    device_id: deviceId,
    event_type: eventType as MixlabUsageEventType,
    occurred_at: occurredAt
  };
  if (sourceVideoId !== undefined) {
    event.source_video_id = sourceVideoId;
  }
  if (cutJobId !== undefined) {
    event.cut_job_id = cutJobId;
  }
  if (query !== undefined) {
    event.query = query;
  }
  if (searchMode !== undefined) {
    event.search_mode = searchMode as MixlabUsageSearchMode;
  }
  if (searchPageType !== undefined) {
    event.search_page_type = searchPageType as MixlabUsageSearchPageType;
  }
  if (searchElapsedMs !== undefined) {
    event.search_elapsed_ms = searchElapsedMs;
  }
  if (selectedDurationMs !== undefined) {
    event.selected_duration_ms = selectedDurationMs;
  }
  if (resultStatus !== undefined) {
    event.result_status = resultStatus as MixlabUsageResultStatus;
  }
  return event;
}

interface UsageEventsReadResult {
  events: MixlabUsageEvent[];
  event_store: UsageEventStoreMetrics;
}

async function readUsageEvents(libraryRoot: string): Promise<UsageEventsReadResult> {
  let raw: string;
  try {
    raw = await readFile(usageEventsPath(libraryRoot), "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {
        events: [],
        event_store: emptyEventStoreMetrics()
      };
    }
    throw new Error("无法读取使用事件存储文件", { cause: error });
  }

  const events: MixlabUsageEvent[] = [];
  const eventStore = emptyEventStoreMetrics();
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }

    eventStore.line_count += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      void error;
      eventStore.malformed_line_count += 1;
      eventStore.malformed_lines.push(index + 1);
      continue;
    }

    try {
      events.push(validateUsageEvent(parsed, { require_event_id: true }));
    } catch (error) {
      void error;
      eventStore.malformed_line_count += 1;
      eventStore.malformed_lines.push(index + 1);
    }
  }
  eventStore.valid_line_count = events.length;
  if (eventStore.malformed_line_count > 0) {
    const lineLabel = eventStore.malformed_lines.slice(0, 8).join(", ");
    const suffix = eventStore.malformed_lines.length > 8 ? " 等" : "";
    eventStore.warning = `使用事件存储有 ${eventStore.malformed_line_count} 行无法读取，已跳过第 ${lineLabel}${suffix} 行。`;
  }
  return {
    events,
    event_store: eventStore
  };
}

async function withEventMutation<T>(
  libraryRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = usageEventsPath(libraryRoot);
  const previous = eventMutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  eventMutationQueues.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (eventMutationQueues.get(key) === queued) {
      eventMutationQueues.delete(key);
    }
  }
}

function getOrCreateUserMetrics(
  users: Map<string, UserUsageMetrics>,
  event: MixlabUsageEvent
): UserUsageMetrics {
  const existing = users.get(event.user_id);
  if (existing) {
    if (event.username) {
      existing.username = event.username;
    }
    return existing;
  }

  const created: UserUsageMetrics = {
    user_id: event.user_id,
    username: event.username,
    search_request_count: 0,
    search_failure_count: 0,
    add_to_cut_list_count: 0,
    transcript_selection_count: 0,
    cut_submission_count: 0,
    cut_success_count: 0,
    local_clip_count: 0,
    reuse_local_clip_count: 0,
    last_used_at: event.occurred_at
  };
  users.set(event.user_id, created);
  return created;
}

function incrementSourceVideoCount(
  sourceVideoCounts: Map<string, number>,
  sourceVideoId: string | undefined
): void {
  if (sourceVideoId === undefined) {
    return;
  }
  sourceVideoCounts.set(sourceVideoId, (sourceVideoCounts.get(sourceVideoId) ?? 0) + 1);
}

function percentile(values: number[], rank: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function resetCoreSearchMetrics(metrics: UsageMetrics): void {
  metrics.core_search_request_count = 0;
  metrics.core_search_failure_count = 0;
  metrics.core_search_latency_p50_ms = 0;
  metrics.core_search_latency_p95_ms = 0;
  metrics.core_search_latency_max_ms = 0;
  metrics.core_searchd_search_count = 0;
  metrics.core_sqlite_index_search_count = 0;
  metrics.core_fallback_search_count = 0;
  metrics.core_search_backend_unknown_count = 0;
}

function sortedCoreSearchProjectionEvents(
  events: UsageCoreSearchProjectionEvent[]
): UsageCoreSearchProjectionEvent[] {
  return [...events]
    .sort((left, right) => {
      const occurredOrder = left.occurred_at.localeCompare(right.occurred_at);
      return occurredOrder === 0 ? left.sequence - right.sequence : occurredOrder;
    })
    .slice(-CORE_SEARCH_SAMPLE_LIMIT);
}

function applyCoreSearchProjection(
  metrics: UsageMetrics,
  coreSearchEvents: UsageCoreSearchProjectionEvent[]
): void {
  resetCoreSearchMetrics(metrics);
  const latencyMs: number[] = [];

  for (const event of coreSearchEvents) {
    if (event.result_status === "failure") {
      metrics.core_search_failure_count += 1;
    }

    metrics.core_search_request_count += 1;
    if (typeof event.search_elapsed_ms === "number") {
      latencyMs.push(event.search_elapsed_ms);
    }
    if (event.search_mode === "searchd") {
      metrics.core_searchd_search_count += 1;
    } else if (event.search_mode === "sqlite-index") {
      metrics.core_sqlite_index_search_count += 1;
    } else if (event.search_mode === "transcript-artifact-fallback") {
      metrics.core_fallback_search_count += 1;
    } else {
      metrics.core_search_backend_unknown_count += 1;
    }
  }

  metrics.core_search_latency_p50_ms = percentile(latencyMs, 50);
  metrics.core_search_latency_p95_ms = percentile(latencyMs, 95);
  metrics.core_search_latency_max_ms = latencyMs.length > 0 ? Math.max(...latencyMs) : 0;
}

function applySearchLatencyProjection(metrics: UsageMetrics, searchLatencyMs: number[]): void {
  metrics.search_latency_p50_ms = percentile(searchLatencyMs, 50);
  metrics.search_latency_p95_ms = percentile(searchLatencyMs, 95);
  metrics.search_latency_max_ms = searchLatencyMs.length > 0 ? Math.max(...searchLatencyMs) : 0;
}

function applyKeywordProjection(metrics: UsageMetrics, keywordEntries: UsageKeywordProjectionEntry[]): void {
  metrics.recent_keywords = [...keywordEntries]
    .sort((left, right) => {
      const occurredOrder = right.occurred_at.localeCompare(left.occurred_at);
      return occurredOrder === 0 ? right.sequence - left.sequence : occurredOrder;
    })
    .slice(0, 8)
    .map((entry) => entry.keyword);
}

function applySourceVideoProjection(metrics: UsageMetrics, sourceVideoCounts: Array<[string, number]>): void {
  metrics.most_used_source_video_ids = [...sourceVideoCounts]
    .sort((left, right) => {
      const countOrder = right[1] - left[1];
      return countOrder === 0 ? left[0].localeCompare(right[0]) : countOrder;
    })
    .slice(0, 8)
    .map(([sourceVideoId]) => sourceVideoId);
}

function sortUsageUsers(users: Iterable<UserUsageMetrics>): UserUsageMetrics[] {
  return [...users].sort((left, right) => {
    const usedOrder = right.last_used_at.localeCompare(left.last_used_at);
    return usedOrder === 0 ? left.user_id.localeCompare(right.user_id) : usedOrder;
  });
}

function buildUsageMetricsProjection(
  events: MixlabUsageEvent[],
  eventStore: UsageEventStoreMetrics
): UsageMetricsProjection {
  const metrics = emptyMetrics();
  metrics.event_store = eventStore;
  const users = new Map<string, UserUsageMetrics>();
  const keywordByKey = new Map<string, { keyword: string; occurred_at: string; sequence: number }>();
  const sourceVideoCounts = new Map<string, number>();
  const searchLatencyMs: number[] = [];
  const coreSearchEvents: UsageCoreSearchProjectionEvent[] = [];

  for (const [sequence, event] of events.entries()) {
    const user = getOrCreateUserMetrics(users, event);
    if (event.occurred_at > user.last_used_at) {
      user.last_used_at = event.occurred_at;
    }
    incrementSourceVideoCount(sourceVideoCounts, event.source_video_id);

    switch (event.event_type) {
      case "search":
        if (event.result_status === "failure") {
          metrics.search_failure_count += 1;
          user.search_failure_count += 1;
        }
        if (event.search_page_type === "cursor") {
          break;
        }

        metrics.search_request_count += 1;
        user.search_request_count += 1;
        if (typeof event.search_elapsed_ms === "number") {
          searchLatencyMs.push(event.search_elapsed_ms);
        }
        if (event.search_mode === "searchd") {
          metrics.searchd_search_count += 1;
        } else if (event.search_mode === "sqlite-index") {
          metrics.sqlite_index_search_count += 1;
        } else if (event.search_mode === "transcript-artifact-fallback") {
          metrics.fallback_search_count += 1;
        } else {
          metrics.search_backend_unknown_count += 1;
        }
        if (event.result_status === "success") {
          metrics.search_hit_count += 1;
        } else if (event.result_status === "empty") {
          metrics.search_empty_count += 1;
        }
        if (event.query) {
          const key = event.query.toLocaleLowerCase();
          const existing = keywordByKey.get(key);
          if (
            !existing ||
            event.occurred_at > existing.occurred_at ||
            (event.occurred_at === existing.occurred_at && sequence > existing.sequence)
          ) {
            keywordByKey.set(key, {
              keyword: event.query,
              occurred_at: event.occurred_at,
              sequence
            });
          }
        }
        coreSearchEvents.push({
          occurred_at: event.occurred_at,
          sequence,
          result_status: event.result_status,
          search_elapsed_ms: event.search_elapsed_ms,
          search_mode: event.search_mode
        });
        break;
      case "view_source_video":
        metrics.source_detail_view_count += 1;
        break;
      case "select_transcript_span":
        metrics.transcript_selection_count += 1;
        user.transcript_selection_count += 1;
        break;
      case "add_to_cut_list":
        metrics.add_to_cut_list_count += 1;
        user.add_to_cut_list_count += 1;
        break;
      case "submit_cut_job":
        metrics.cut_submission_count += 1;
        user.cut_submission_count += 1;
        break;
      case "cut_success":
        metrics.cut_success_count += 1;
        user.cut_success_count += 1;
        break;
      case "cut_failure":
        metrics.cut_failure_count += 1;
        break;
      case "create_local_clip":
        metrics.local_clip_count += 1;
        user.local_clip_count += 1;
        break;
      case "reuse_local_clip":
        metrics.reuse_local_clip_count += 1;
        user.reuse_local_clip_count += 1;
        break;
      case "view_transcript":
        break;
    }
  }

  metrics.active_user_count = users.size;
  const state: UsageMetricsProjectionState = {
    schema_version: USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION,
    next_sequence: events.length,
    search_latency_ms: searchLatencyMs,
    source_video_counts: [...sourceVideoCounts.entries()],
    keyword_entries: [...keywordByKey.entries()].map(([key, entry]) => ({
      key,
      ...entry
    })),
    core_search_events: sortedCoreSearchProjectionEvents(coreSearchEvents)
  };

  applySearchLatencyProjection(metrics, state.search_latency_ms);
  applyCoreSearchProjection(metrics, state.core_search_events);
  applyKeywordProjection(metrics, state.keyword_entries);
  applySourceVideoProjection(metrics, state.source_video_counts);
  metrics.users = sortUsageUsers(users.values());

  return {
    metrics,
    projection_state: state
  };
}

function aggregateUsageEvents(
  events: MixlabUsageEvent[],
  eventStore: UsageEventStoreMetrics
): UsageMetrics {
  return buildUsageMetricsProjection(events, eventStore).metrics;
}

function cloneMetrics(metrics: UsageMetrics): UsageMetrics {
  return JSON.parse(JSON.stringify(metrics)) as UsageMetrics;
}

function cloneProjectionState(state: UsageMetricsProjectionState): UsageMetricsProjectionState {
  return JSON.parse(JSON.stringify(state)) as UsageMetricsProjectionState;
}

function applyUsageEventToProjection(
  projection: UsageMetricsProjection,
  event: MixlabUsageEvent
): UsageMetricsProjection {
  const metrics = cloneMetrics(projection.metrics);
  const state = cloneProjectionState(projection.projection_state);
  const sequence = state.next_sequence;
  state.next_sequence += 1;

  metrics.event_store.line_count += 1;
  metrics.event_store.valid_line_count += 1;

  const users = new Map<string, UserUsageMetrics>(
    metrics.users.map((user) => [user.user_id, { ...user }])
  );
  const user = getOrCreateUserMetrics(users, event);
  if (event.occurred_at > user.last_used_at) {
    user.last_used_at = event.occurred_at;
  }

  const sourceVideoCounts = new Map<string, number>(state.source_video_counts);
  incrementSourceVideoCount(sourceVideoCounts, event.source_video_id);
  state.source_video_counts = [...sourceVideoCounts.entries()];

  switch (event.event_type) {
    case "search":
      if (event.result_status === "failure") {
        metrics.search_failure_count += 1;
        user.search_failure_count += 1;
      }
      if (event.search_page_type === "cursor") {
        break;
      }

      metrics.search_request_count += 1;
      user.search_request_count += 1;
      if (typeof event.search_elapsed_ms === "number") {
        state.search_latency_ms.push(event.search_elapsed_ms);
      }
      if (event.search_mode === "searchd") {
        metrics.searchd_search_count += 1;
      } else if (event.search_mode === "sqlite-index") {
        metrics.sqlite_index_search_count += 1;
      } else if (event.search_mode === "transcript-artifact-fallback") {
        metrics.fallback_search_count += 1;
      } else {
        metrics.search_backend_unknown_count += 1;
      }
      if (event.result_status === "success") {
        metrics.search_hit_count += 1;
      } else if (event.result_status === "empty") {
        metrics.search_empty_count += 1;
      }
      if (event.query) {
        const key = event.query.toLocaleLowerCase();
        const keywordEntries = new Map(
          state.keyword_entries.map((entry) => [entry.key, entry])
        );
        const existing = keywordEntries.get(key);
        if (
          !existing ||
          event.occurred_at > existing.occurred_at ||
          (event.occurred_at === existing.occurred_at && sequence > existing.sequence)
        ) {
          keywordEntries.set(key, {
            key,
            keyword: event.query,
            occurred_at: event.occurred_at,
            sequence
          });
        }
        state.keyword_entries = [...keywordEntries.values()];
      }
      state.core_search_events = sortedCoreSearchProjectionEvents([
        ...state.core_search_events,
        {
          occurred_at: event.occurred_at,
          sequence,
          result_status: event.result_status,
          search_elapsed_ms: event.search_elapsed_ms,
          search_mode: event.search_mode
        }
      ]);
      break;
    case "view_source_video":
      metrics.source_detail_view_count += 1;
      break;
    case "select_transcript_span":
      metrics.transcript_selection_count += 1;
      user.transcript_selection_count += 1;
      break;
    case "add_to_cut_list":
      metrics.add_to_cut_list_count += 1;
      user.add_to_cut_list_count += 1;
      break;
    case "submit_cut_job":
      metrics.cut_submission_count += 1;
      user.cut_submission_count += 1;
      break;
    case "cut_success":
      metrics.cut_success_count += 1;
      user.cut_success_count += 1;
      break;
    case "cut_failure":
      metrics.cut_failure_count += 1;
      break;
    case "create_local_clip":
      metrics.local_clip_count += 1;
      user.local_clip_count += 1;
      break;
    case "reuse_local_clip":
      metrics.reuse_local_clip_count += 1;
      user.reuse_local_clip_count += 1;
      break;
    case "view_transcript":
      break;
  }

  metrics.active_user_count = users.size;
  applySearchLatencyProjection(metrics, state.search_latency_ms);
  applyCoreSearchProjection(metrics, state.core_search_events);
  applyKeywordProjection(metrics, state.keyword_entries);
  applySourceVideoProjection(metrics, state.source_video_counts);
  metrics.users = sortUsageUsers(users.values());

  return {
    metrics,
    projection_state: state
  };
}

function createUsageMetricsSummaryProjectionSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = DELETE;

    CREATE TABLE IF NOT EXISTS usage_metrics_summary (
      id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      usage_events_exists INTEGER NOT NULL,
      usage_events_size_bytes INTEGER NOT NULL,
      usage_events_mtime_ms INTEGER NOT NULL,
      metrics_json TEXT NOT NULL,
      projection_state_json TEXT
    );
  `);

  const columns = db.prepare("PRAGMA table_info(usage_metrics_summary)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === "projection_state_json")) {
    db.exec("ALTER TABLE usage_metrics_summary ADD COLUMN projection_state_json TEXT");
  }
}

function readUsageMetricsSummaryProjectionRow(db: DatabaseSync): {
  schema_version: string;
  generated_at: string;
  usage_events_exists: number;
  usage_events_size_bytes: number;
  usage_events_mtime_ms: number;
  metrics_json: string;
  projection_state_json: string | null;
} | undefined {
  return db.prepare(`
    SELECT
      schema_version,
      generated_at,
      usage_events_exists,
      usage_events_size_bytes,
      usage_events_mtime_ms,
      metrics_json,
      projection_state_json
    FROM usage_metrics_summary
    WHERE id = 'current'
  `).get() as {
    schema_version: string;
    generated_at: string;
    usage_events_exists: number;
    usage_events_size_bytes: number;
    usage_events_mtime_ms: number;
    metrics_json: string;
    projection_state_json: string | null;
  } | undefined;
}

function rowMatchesUsageEventsSignature(input: {
  row: {
    usage_events_exists: number;
    usage_events_size_bytes: number;
    usage_events_mtime_ms: number;
  };
  signature: UsageEventsFileSignature;
}): boolean {
  return Boolean(input.row.usage_events_exists) === input.signature.exists &&
    Number(input.row.usage_events_size_bytes) === input.signature.size_bytes &&
    Number(input.row.usage_events_mtime_ms) === input.signature.mtime_ms;
}

function parseUsageMetricsSummaryProjectionRow(row: {
  schema_version: string;
  generated_at: string;
  metrics_json: string;
  projection_state_json: string | null;
}): StoredUsageMetricsSummaryProjection | null {
  if (row.schema_version !== USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION) {
    return null;
  }

  const parsedMetrics = JSON.parse(row.metrics_json);
  if (!isUsageMetrics(parsedMetrics)) {
    return null;
  }

  let projectionState: UsageMetricsProjectionState | undefined;
  if (row.projection_state_json) {
    const parsedState = JSON.parse(row.projection_state_json);
    if (!isUsageMetricsProjectionState(parsedState)) {
      return null;
    }
    projectionState = parsedState;
  }

  return {
    metrics: parsedMetrics,
    projection_state: projectionState,
    generated_at: row.generated_at
  };
}

export function readUsageMetricsSummaryProjection(input: {
  library_root: string;
  signature: UsageEventsFileSignature;
}): StoredUsageMetricsSummaryProjection | null {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`file:${usageMetricsSummaryProjectionPath(input.library_root)}?mode=ro`);
    const row = readUsageMetricsSummaryProjectionRow(db);
    if (!row || !rowMatchesUsageEventsSignature({ row, signature: input.signature })) {
      return null;
    }
    return parseUsageMetricsSummaryProjectionRow(row);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function writeUsageMetricsSummaryProjection(input: {
  library_root: string;
  signature: UsageEventsFileSignature;
  metrics: UsageMetrics;
  projection_state?: UsageMetricsProjectionState;
  generated_at: string;
}): Promise<void> {
  await mkdir(path.dirname(usageMetricsSummaryProjectionPath(input.library_root)), { recursive: true });
  const db = new DatabaseSync(usageMetricsSummaryProjectionPath(input.library_root));

  try {
    createUsageMetricsSummaryProjectionSchema(db);
    db.exec("BEGIN");
    db.prepare(`
      INSERT INTO usage_metrics_summary (
        id,
        schema_version,
        generated_at,
        usage_events_exists,
        usage_events_size_bytes,
        usage_events_mtime_ms,
        metrics_json,
        projection_state_json
      )
      VALUES ('current', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        generated_at = excluded.generated_at,
        usage_events_exists = excluded.usage_events_exists,
        usage_events_size_bytes = excluded.usage_events_size_bytes,
        usage_events_mtime_ms = excluded.usage_events_mtime_ms,
        metrics_json = excluded.metrics_json,
        projection_state_json = excluded.projection_state_json
    `).run(
      USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION,
      input.generated_at,
      input.signature.exists ? 1 : 0,
      input.signature.size_bytes,
      input.signature.mtime_ms,
      JSON.stringify(input.metrics),
      input.projection_state ? JSON.stringify(input.projection_state) : null
    );
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }
    throw error;
  } finally {
    db.close();
  }
}

async function writeThroughUsageMetricsSummaryProjection(input: {
  library_root: string;
  previous_signature: UsageEventsFileSignature;
  next_signature: UsageEventsFileSignature;
  event: MixlabUsageEvent;
  generated_at: string;
}): Promise<{
  path: string;
  updated: boolean;
  reason: string;
}> {
  const summaryPath = usageMetricsSummaryProjectionPath(input.library_root);
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(summaryPath);
    createUsageMetricsSummaryProjectionSchema(db);
    const row = readUsageMetricsSummaryProjectionRow(db);
    if (!row) {
      return {
        path: summaryPath,
        updated: false,
        reason: "missing_projection"
      };
    }
    if (!rowMatchesUsageEventsSignature({ row, signature: input.previous_signature })) {
      return {
        path: summaryPath,
        updated: false,
        reason: "stale_projection"
      };
    }

    const stored = parseUsageMetricsSummaryProjectionRow(row);
    if (!stored?.projection_state) {
      return {
        path: summaryPath,
        updated: false,
        reason: "missing_projection_state"
      };
    }

    const updated = applyUsageEventToProjection({
      metrics: stored.metrics,
      projection_state: stored.projection_state
    }, input.event);

    db.exec("BEGIN");
    db.prepare(`
      UPDATE usage_metrics_summary
      SET
        schema_version = ?,
        generated_at = ?,
        usage_events_exists = ?,
        usage_events_size_bytes = ?,
        usage_events_mtime_ms = ?,
        metrics_json = ?,
        projection_state_json = ?
      WHERE id = 'current'
    `).run(
      USAGE_METRICS_SUMMARY_PROJECTION_SCHEMA_VERSION,
      input.generated_at,
      input.next_signature.exists ? 1 : 0,
      input.next_signature.size_bytes,
      input.next_signature.mtime_ms,
      JSON.stringify(updated.metrics),
      JSON.stringify(updated.projection_state)
    );
    db.exec("COMMIT");
    return {
      path: summaryPath,
      updated: true,
      reason: "updated"
    };
  } catch {
    try {
      db?.exec("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }
    return {
      path: summaryPath,
      updated: false,
      reason: "write_failed"
    };
  } finally {
    db?.close();
  }
}

export async function appendUsageEvent(
  libraryRoot: string,
  event: MixlabUsageEvent
): Promise<MixlabUsageEvent> {
  return withEventMutation(libraryRoot, async () => {
    const normalizedEvent = validateUsageEvent(event, { require_event_id: false });
    await readUsageEvents(libraryRoot);
    const previousSignature = await readUsageEventsFileSignature(libraryRoot);

    const targetPath = usageEventsPath(libraryRoot);
    await mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await appendFile(targetPath, `${JSON.stringify(normalizedEvent)}\n`, {
        encoding: "utf8",
        mode: 0o600
      });
    } catch (error) {
      throw new Error("无法写入使用事件存储文件", { cause: error });
    }
    const nextSignature = await readUsageEventsFileSignature(libraryRoot);
    const writeThrough = await writeThroughUsageMetricsSummaryProjection({
      library_root: libraryRoot,
      previous_signature: previousSignature,
      next_signature: nextSignature,
      event: normalizedEvent,
      generated_at: new Date().toISOString()
    });
    if (!writeThrough.updated) {
      await invalidateUsageMetricsSummaryProjection(libraryRoot).catch(() => undefined);
    }
    return normalizedEvent;
  });
}

export async function readUsageMetricsProjection(libraryRoot: string): Promise<UsageMetricsProjection> {
  const result = await readUsageEvents(libraryRoot);
  return buildUsageMetricsProjection(result.events, result.event_store);
}

export async function readUsageMetrics(libraryRoot: string): Promise<UsageMetrics> {
  return (await readUsageMetricsProjection(libraryRoot)).metrics;
}
