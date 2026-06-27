import {
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";
import type { PreprocessStatus } from "../../protocol/src/index.ts";

export interface AdminPreprocessReadRouteApiInput {
  library_root: string;
}

export interface AdminPreprocessProcessHistoryOptions {
  now: string;
  window_days: number;
  limit: number;
  source_folder_name: string;
  preprocess_status: PreprocessStatus | "";
  event_type: AdminPreprocessProcessHistoryEventType | "";
}

export type AdminPreprocessProcessHistoryEventType =
  | "failed"
  | "indexed"
  | "completed"
  | "claimed"
  | "status";

export interface AdminPreprocessReadRouteDeps<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorStatus,
  TSafety,
  TProcessHistory = unknown,
  TProcessHistoryReadiness = unknown
> {
  read_source_video_detail(libraryRoot: string, sourceVideoId: string): Promise<TSourceVideoDetail | null>;
  read_preprocess_job_log(libraryRoot: string, sourceVideoId: string): Promise<TPreprocessJobLog>;
  read_preprocess_supervisor_status(): TSupervisorStatus;
  read_preprocess_safety(input: TApiInput): Promise<TSafety>;
  read_preprocess_process_history(
    input: TApiInput,
    options: AdminPreprocessProcessHistoryOptions
  ): Promise<TProcessHistory>;
  read_preprocess_process_history_readiness(input: TApiInput): Promise<TProcessHistoryReadiness>;
}

export type AdminPreprocessReadRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminPreprocessReadRoutesInput<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorStatus,
  TSafety,
  TProcessHistory = unknown,
  TProcessHistoryReadiness = unknown
> {
  method: string;
  pathname: string;
  search_params?: URLSearchParams;
  request_now?: string;
  api_input: TApiInput;
  deps: AdminPreprocessReadRouteDeps<
    TApiInput,
    TSourceVideoDetail,
    TPreprocessJobLog,
    TSupervisorStatus,
    TSafety,
    TProcessHistory,
    TProcessHistoryReadiness
  >;
}

function sourceVideoIdFromJobId(jobId: string): string | null {
  const match = /^J(\d{6})$/.exec(jobId);
  return match ? `V${match[1]}` : null;
}

function parseBoundedInteger(input: {
  value: string | null;
  fallback: number;
  min: number;
  max: number;
}): number {
  if (!input.value) {
    return input.fallback;
  }
  const parsed = Number.parseInt(input.value, 10);
  if (!Number.isFinite(parsed)) {
    return input.fallback;
  }
  return Math.max(input.min, Math.min(input.max, parsed));
}

const PREPROCESS_STATUS_FILTERS: PreprocessStatus[] = [
  "unprocessed",
  "queued",
  "processing",
  "ready",
  "failed",
  "index-required"
];

const PREPROCESS_HISTORY_EVENT_FILTERS: AdminPreprocessProcessHistoryEventType[] = [
  "failed",
  "indexed",
  "completed",
  "claimed",
  "status"
];

function parseTrimmedTextFilter(input: {
  value: string | null;
  max_length: number;
}): string {
  return (input.value ?? "").trim().slice(0, input.max_length);
}

function parsePreprocessStatusFilter(value: string | null): PreprocessStatus | "" {
  return PREPROCESS_STATUS_FILTERS.includes(value as PreprocessStatus) ? value as PreprocessStatus : "";
}

function parseProcessHistoryEventFilter(value: string | null): AdminPreprocessProcessHistoryEventType | "" {
  return PREPROCESS_HISTORY_EVENT_FILTERS.includes(value as AdminPreprocessProcessHistoryEventType)
    ? value as AdminPreprocessProcessHistoryEventType
    : "";
}

export async function handleAdminPreprocessReadRoutes<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorStatus,
  TSafety,
  TProcessHistory = unknown,
  TProcessHistoryReadiness = unknown
>(
  input: HandleAdminPreprocessReadRoutesInput<
    TApiInput,
    TSourceVideoDetail,
    TPreprocessJobLog,
    TSupervisorStatus,
    TSafety,
    TProcessHistory,
    TProcessHistoryReadiness
  >
): Promise<AdminPreprocessReadRouteResult> {
  if (input.method === "GET" && input.pathname === "/api/admin/preprocess/process-history/readiness") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_preprocess_process_history_readiness(input.api_input))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/preprocess/process-history") {
    const searchParams = input.search_params ?? new URLSearchParams();
    const limit = parseBoundedInteger({
      value: searchParams.get("limit"),
      fallback: 50,
      min: 1,
      max: 200
    });
    const windowDays = parseBoundedInteger({
      value: searchParams.get("window_days"),
      fallback: 30,
      min: 1,
      max: 365
    });

    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_preprocess_process_history(input.api_input, {
        now: input.request_now ?? new Date().toISOString(),
        window_days: windowDays,
        limit,
        source_folder_name: parseTrimmedTextFilter({
          value: searchParams.get("source_folder_name"),
          max_length: 120
        }),
        preprocess_status: parsePreprocessStatusFilter(searchParams.get("preprocess_status")),
        event_type: parseProcessHistoryEventFilter(searchParams.get("event_type"))
      }))
    };
  }

  const preprocessJobLogMatch = /^\/api\/admin\/preprocess\/jobs\/(J\d{6})\/log$/.exec(input.pathname);
  if (input.method === "GET" && preprocessJobLogMatch) {
    const jobId = preprocessJobLogMatch[1] ?? "";
    const sourceVideoId = sourceVideoIdFromJobId(jobId);

    if (
      !sourceVideoId ||
      !(await input.deps.read_source_video_detail(input.api_input.library_root, sourceVideoId))
    ) {
      return {
        handled: true,
        status_code: 404,
        body: apiError("not_found", "预处理任务不存在")
      };
    }

    return {
      handled: true,
      status_code: 200,
      body: apiOk({
        job_id: jobId,
        ...await input.deps.read_preprocess_job_log(input.api_input.library_root, sourceVideoId)
      })
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/preprocess/supervisor/status") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(input.deps.read_preprocess_supervisor_status())
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/preprocess/safety") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_preprocess_safety(input.api_input))
    };
  }

  return { handled: false };
}
