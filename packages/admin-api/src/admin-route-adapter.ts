import type { AdminApiResponseMeta } from "./admin-runtime-observability.ts";
import { isAdminDockerMvpCommandBlockedError } from "./admin-command-guard.ts";

export interface AdminApiOkEnvelope<T> {
  ok: true;
  data: T;
  meta?: AdminApiResponseMeta;
}

export interface AdminApiErrorEnvelope {
  ok: false;
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AdminApiEnvelope<T> = AdminApiOkEnvelope<T> | AdminApiErrorEnvelope;

export function apiOk<T>(data: T, meta?: AdminApiResponseMeta): AdminApiOkEnvelope<T> {
  return {
    ok: true,
    data,
    ...(meta ? { meta } : {})
  };
}

export function apiError(
  errorCode: string,
  message: string,
  details?: Record<string, unknown>
): AdminApiErrorEnvelope {
  return details
    ? { ok: false, error_code: errorCode, message, details }
    : { ok: false, error_code: errorCode, message };
}

export function adminDockerMvpCommandBlockedRouteError(error: unknown): {
  status_code: 409;
  body: AdminApiErrorEnvelope;
} | null {
  return isAdminDockerMvpCommandBlockedError(error)
    ? {
        status_code: 409,
        body: apiError(error.code, error.message, error.details)
      }
    : null;
}

function positiveIntegerParam(searchParams: URLSearchParams, key: string): number | undefined {
  const parsed = Number.parseInt(searchParams.get(key) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseAdminRouteOffset(searchParams: URLSearchParams): number {
  return positiveIntegerParam(searchParams, "offset") ?? 0;
}

export function parseAdminRouteLimit(
  searchParams: URLSearchParams,
  options: { max_limit: number; default_limit?: number }
): number | undefined {
  const parsed = positiveIntegerParam(searchParams, "limit");

  if (typeof parsed !== "number") {
    return options.default_limit;
  }

  return Math.min(parsed, options.max_limit);
}
