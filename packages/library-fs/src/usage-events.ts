import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
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
  selected_duration_ms?: number;
  result_status?: MixlabUsageResultStatus;
}

export interface UserUsageMetrics {
  user_id: string;
  username: string;
  search_request_count: number;
  add_to_cut_list_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  local_clip_count: number;
  reuse_local_clip_count: number;
  last_used_at: string;
}

export interface UsageMetrics {
  search_request_count: number;
  search_hit_count: number;
  search_empty_count: number;
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
const RESULT_STATUSES = new Set<MixlabUsageResultStatus>([
  "success",
  "empty",
  "failure"
]);
const eventMutationQueues = new Map<string, Promise<void>>();

function usageEventsPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "usage-events", "events.ndjson");
}

function emptyMetrics(): UsageMetrics {
  return {
    search_request_count: 0,
    search_hit_count: 0,
    search_empty_count: 0,
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
    users: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (selectedDurationMs !== undefined) {
    event.selected_duration_ms = selectedDurationMs;
  }
  if (resultStatus !== undefined) {
    event.result_status = resultStatus as MixlabUsageResultStatus;
  }
  return event;
}

async function readUsageEvents(libraryRoot: string): Promise<MixlabUsageEvent[]> {
  let raw: string;
  try {
    raw = await readFile(usageEventsPath(libraryRoot), "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw new Error("无法读取使用事件存储文件", { cause: error });
  }

  const events: MixlabUsageEvent[] = [];
  const lines = raw.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`使用事件存储文件格式错误：第 ${index + 1} 行不是有效 JSON`, {
        cause: error
      });
    }

    try {
      events.push(validateUsageEvent(parsed, { require_event_id: true }));
    } catch (error) {
      throw new Error(`使用事件存储文件格式错误：第 ${index + 1} 行事件数据无效`, {
        cause: error
      });
    }
  }
  return events;
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

function aggregateUsageEvents(events: MixlabUsageEvent[]): UsageMetrics {
  const metrics = emptyMetrics();
  const users = new Map<string, UserUsageMetrics>();
  const keywordByKey = new Map<string, { keyword: string; occurred_at: string }>();
  const sourceVideoCounts = new Map<string, number>();

  for (const event of events) {
    const user = getOrCreateUserMetrics(users, event);
    if (event.occurred_at > user.last_used_at) {
      user.last_used_at = event.occurred_at;
    }
    incrementSourceVideoCount(sourceVideoCounts, event.source_video_id);

    switch (event.event_type) {
      case "search":
        metrics.search_request_count += 1;
        user.search_request_count += 1;
        if (event.result_status === "success") {
          metrics.search_hit_count += 1;
        } else if (event.result_status === "empty") {
          metrics.search_empty_count += 1;
        }
        if (event.query) {
          const key = event.query.toLocaleLowerCase();
          const existing = keywordByKey.get(key);
          if (!existing || event.occurred_at > existing.occurred_at) {
            keywordByKey.set(key, {
              keyword: event.query,
              occurred_at: event.occurred_at
            });
          }
        }
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
  metrics.recent_keywords = [...keywordByKey.values()]
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .slice(0, 8)
    .map((entry) => entry.keyword);
  metrics.most_used_source_video_ids = [...sourceVideoCounts.entries()]
    .sort((left, right) => {
      const countOrder = right[1] - left[1];
      return countOrder === 0 ? left[0].localeCompare(right[0]) : countOrder;
    })
    .slice(0, 8)
    .map(([sourceVideoId]) => sourceVideoId);
  metrics.users = [...users.values()].sort((left, right) => {
    const usedOrder = right.last_used_at.localeCompare(left.last_used_at);
    return usedOrder === 0 ? left.user_id.localeCompare(right.user_id) : usedOrder;
  });

  return metrics;
}

export async function appendUsageEvent(
  libraryRoot: string,
  event: MixlabUsageEvent
): Promise<MixlabUsageEvent> {
  return withEventMutation(libraryRoot, async () => {
    const normalizedEvent = validateUsageEvent(event, { require_event_id: false });
    await readUsageEvents(libraryRoot);

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
    return normalizedEvent;
  });
}

export async function readUsageMetrics(libraryRoot: string): Promise<UsageMetrics> {
  return aggregateUsageEvents(await readUsageEvents(libraryRoot));
}
