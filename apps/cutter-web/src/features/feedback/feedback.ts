export type FeedbackCategory = "找不到" | "剪错了" | "太慢" | "卡住/报错" | "建议";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "找不到",
  "剪错了",
  "太慢",
  "卡住/报错",
  "建议"
];

export interface FeedbackEvent {
  at: string;
  type: string;
  detail?: string;
}

const EVENT_LIMIT = 120;
const eventLog: FeedbackEvent[] = [];

export function recordFeedbackEvent(type: string, detail?: string): void {
  eventLog.push({
    at: new Date().toISOString(),
    type,
    ...(detail?.trim() ? { detail: detail.trim().slice(0, 500) } : {})
  });
  if (eventLog.length > EVENT_LIMIT) {
    eventLog.splice(0, eventLog.length - EVENT_LIMIT);
  }
}

export function recentFeedbackEvents(minutes = 5): FeedbackEvent[] {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return eventLog.filter((event) => Date.parse(event.at) >= cutoff).slice(-EVENT_LIMIT);
}

const SENSITIVE_KEYS = /password|passwd|token|cookie|authorization|secret|credential/i;

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (SENSITIVE_KEYS.test(key) || depth > 5) {
    return undefined;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value.slice(0, 2000);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item, index) => sanitizeValue(String(index), item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeValue(childKey, childValue, depth + 1);
      if (sanitized !== undefined) {
        output[childKey] = sanitized;
      }
    }
    return output;
  }
  return undefined;
}

export function sanitizeFeedbackContext(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeValue("context", input);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

export interface CutTaskFeedbackInput {
  queue_job_id: string;
  status: string;
  cut_mode?: string;
  cut_mode_used?: string;
  output_file?: string;
  error_code?: string;
  error_message?: string;
  degrade_reason?: string;
  begin_ms?: number;
  end_ms?: number;
  source_video_id?: string;
  source_title?: string;
  verification?: {
    passed?: boolean;
    expected_duration_ms?: number;
    actual_duration_ms?: number;
    tolerance_ms?: number;
    checks?: unknown[];
  };
}

export function cutTaskFeedbackContext(
  jobs: readonly CutTaskFeedbackInput[],
  limit = 3
): Array<Record<string, unknown>> {
  return jobs
    .filter((job) => job.status === "failed")
    .slice(0, Math.max(0, limit))
    .map((job) => ({
      job_id: job.queue_job_id,
      status: job.status,
      error_code: job.error_code ?? "",
      error_message: job.error_message ?? "",
      cut_mode_used: job.cut_mode_used ?? job.cut_mode ?? "",
      degrade_reason: job.degrade_reason ?? "",
      output_path: job.output_file ?? "",
      source_video_id: job.source_video_id ?? "",
      source_title: job.source_title ?? "",
      begin_ms: job.begin_ms ?? null,
      end_ms: job.end_ms ?? null,
      verification: job.verification
        ? {
            passed: job.verification.passed ?? false,
            expected_duration_ms: job.verification.expected_duration_ms ?? null,
            actual_duration_ms: job.verification.actual_duration_ms ?? null,
            tolerance_ms: job.verification.tolerance_ms ?? null,
            checks: job.verification.checks ?? []
          }
        : null
    }));
}
