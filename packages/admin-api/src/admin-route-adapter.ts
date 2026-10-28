import {
  CONTRACT_VERSION,
  contractErrorDefinition,
  type ContractErrorCode,
  type ErrorRetryability
} from "../../contracts/src/index.ts";
import type { AdminApiResponseMeta } from "./admin-runtime-observability.ts";
import { isAdminDockerMvpCommandBlockedError } from "./admin-command-guard.ts";

export interface AdminApiOkEnvelope<T> {
  ok: true;
  data: T;
  meta?: AdminApiResponseMeta;
}

/**
 * Legacy envelope kept byte-compatible for older clients. Contract-aware responses
 * light up the optional additive fields (code/remediation/retryable/contract_version).
 */
export interface AdminApiErrorEnvelope {
  ok: false;
  /** Legacy machine code used by existing admin-web/client branches. */
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
  /** Contract v1 code (CONTRACT_ERRORS registry); additive. */
  code?: string;
  remediation?: string;
  retryable?: ErrorRetryability;
  contract_version?: string;
}

export type AdminApiEnvelope<T> = AdminApiOkEnvelope<T> | AdminApiErrorEnvelope;

export const ADMIN_CONTRACT_VERSION = CONTRACT_VERSION;

const CONTRACT_CODE_BY_ADMIN_ERROR: Record<string, ContractErrorCode> = {
  login_required: "AUTH_REQUIRED",
  auth_required: "AUTH_REQUIRED",
  login_failed: "AUTH_REQUIRED",
  admin_required: "AUTH_FORBIDDEN",
  auth_forbidden: "AUTH_FORBIDDEN",
  forbidden: "AUTH_FORBIDDEN",
  registration_forbidden: "REGISTRATION_FORBIDDEN",
  login_rate_limited: "LOGIN_RATE_LIMITED",
  rate_limited: "LOGIN_RATE_LIMITED",
  too_many_requests: "LOGIN_RATE_LIMITED",
  invalid_request: "VALIDATION_FAILED",
  validation_failed: "VALIDATION_FAILED",
  not_found: "NOT_FOUND",
  route_missing: "NOT_FOUND",
  library_unavailable: "LIBRARY_UNAVAILABLE",
  library_timeout: "LIBRARY_UNAVAILABLE",
  library_not_ready: "LIBRARY_NOT_READY",
  not_ready: "LIBRARY_NOT_READY",
  release_not_found: "RELEASE_NOT_FOUND",
  release_busy: "RELEASE_BUSY",
  publication_busy: "RELEASE_BUSY",
  release_pointer_invalid: "RELEASE_POINTER_INVALID",
  release_bundle_corrupt: "RELEASE_BUNDLE_CORRUPT",
  contract_too_old: "CONTRACT_TOO_OLD",
  client_version_too_old: "CONTRACT_TOO_OLD",
  not_implemented: "CAPABILITY_UNAVAILABLE",
  capability_unavailable: "CAPABILITY_UNAVAILABLE",
  internal_error: "INTERNAL_ERROR",
  admin_writer_busy: "WORKSPACE_LEASE_UNAVAILABLE",
  workspace_lease_unavailable: "WORKSPACE_LEASE_UNAVAILABLE",
  agent_unavailable: "AGENT_UNAVAILABLE"
};

/**
 * Maps an existing Admin API machine code to the shared Contract Error Code v1.
 * Unknown codes stay backward compatible (legacy code only) instead of inventing a
 * misleading contract code; common families still map via narrow heuristics.
 */
export function contractErrorCodeForAdminError(errorCode: string): ContractErrorCode | undefined {
  const normalized = errorCode.trim().toLowerCase();
  const direct = CONTRACT_CODE_BY_ADMIN_ERROR[normalized];
  if (direct) {
    return direct;
  }
  if (normalized.startsWith("invalid_") || normalized.startsWith("validation_")) {
    return "VALIDATION_FAILED";
  }
  if (normalized.endsWith("_not_found")) {
    return "NOT_FOUND";
  }
  if (normalized.includes("library") && (normalized.includes("unavailable") || normalized.includes("timeout"))) {
    return "LIBRARY_UNAVAILABLE";
  }
  if (normalized.includes("rate_limit") || normalized.includes("too_many")) {
    return "LOGIN_RATE_LIMITED";
  }
  if (normalized.includes("writer_busy") || normalized.includes("workspace_lease")) {
    return "WORKSPACE_LEASE_UNAVAILABLE";
  }
  return undefined;
}

/**
 * Contract-aware error envelope used by the key auth/health routes and new /api/v1
 * handlers: keeps the legacy error_code/message for old clients, adds the contract
 * code plus remediation/retryable and contract_version. Unknown codes are safe.
 */
export function apiContractError(
  errorCode: string,
  message: string,
  details?: Record<string, unknown>
): AdminApiErrorEnvelope {
  const contractCode = contractErrorCodeForAdminError(errorCode);
  const definition = contractCode ? contractErrorDefinition(contractCode) : undefined;

  return {
    ok: false,
    error_code: errorCode,
    message: message || definition?.user_message || "操作失败，请稍后重试",
    ...(contractCode ? { code: contractCode } : {}),
    ...(definition?.remediation ? { remediation: definition.remediation } : {}),
    ...(definition?.retryable ? { retryable: definition.retryable } : {}),
    ...(details ? { details } : {}),
    contract_version: CONTRACT_VERSION
  };
}

export interface AdminApiContractOkEnvelope<T> extends AdminApiOkEnvelope<T> {
  contract_version: string;
}

/** Success envelope for the key auth/health routes; purely additive over apiOk(). */
export function apiOkContract<T>(
  data: T,
  meta?: AdminApiResponseMeta
): AdminApiContractOkEnvelope<T> {
  return {
    ok: true,
    data,
    ...(meta ? { meta } : {}),
    contract_version: CONTRACT_VERSION
  };
}

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
