import {
  contractErrorDefinition,
  toContractErrorBody,
  type ErrorRetryability
} from "../../../../packages/contracts/src/index.ts";
import { isAdminHttpError } from "../admin-http.ts";

export interface AdminErrorCodeInfo {
  title: string;
  action: string;
  /** contracts v1 registry 的 retryable 语义；本地 fallback 码没有该字段。 */
  retryable?: ErrorRetryability;
  http_status?: number;
  /** 命中的共享契约错误码（如 login_required → AUTH_REQUIRED）。 */
  contract_code?: string;
}

/**
 * Round2 本地中文映射：仅作为 contracts v1 registry 不可用/未覆盖时的 fallback 保留。
 * 新代码应优先使用 packages/contracts 的错误注册表。
 */
export const ADMIN_ERROR_CODE_INFO: Record<string, AdminErrorCodeInfo> = {
  login_required: {
    title: "登录已过期",
    action: "请重新登录管理端后重试。"
  },
  preprocess_start_blocked: {
    title: "预处理启动被阻断",
    action: "请检查磁盘空间、发布门禁和系统状态后再启动。"
  },
  admin_mvp_command_blocked: {
    title: "当前部署模式不允许该写操作",
    action: "请在完整管理端模式下操作，或联系部署管理员。"
  },
  invalid_request: {
    title: "请求参数无效",
    action: "请刷新页面后重试；如仍失败请携带操作记录反馈。"
  },
  registration_forbidden: {
    title: "首次注册被拒绝",
    action: "请确认注册令牌配置，或联系部署管理员。"
  },
  login_rate_limited: {
    title: "登录尝试过于频繁",
    action: "请稍后重试。"
  },
  not_found: {
    title: "目标不存在",
    action: "请刷新页面确认目标是否仍存在。"
  },
  forbidden: {
    title: "没有操作权限",
    action: "请联系部署管理员确认权限。"
  },
  validation_failed: {
    title: "数据校验未通过",
    action: "请检查输入内容后重试。"
  },
  invalid_response: {
    title: "管理端响应格式异常",
    action: "请确认管理端 API 与前端版本一致，并刷新页面。"
  },
  internal_error: {
    title: "管理端服务内部错误",
    action: "请稍后重试；若持续失败请导出系统检查报告。"
  }
};

/**
 * 旧版小写 error_code 与 contracts v1 稳定错误码的兼容映射。
 * 与 admin-api 的 contractErrorCodeForAdminError 对齐（加法兼容，不改变旧语义）。
 */
export const ADMIN_LEGACY_TO_CONTRACT_CODE: Record<string, string> = {
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
  route_not_found: "NOT_FOUND",
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
  admin_mvp_command_blocked: "CAPABILITY_UNAVAILABLE",
  internal_error: "INTERNAL_ERROR",
  admin_writer_busy: "WORKSPACE_LEASE_UNAVAILABLE",
  workspace_lease_unavailable: "WORKSPACE_LEASE_UNAVAILABLE",
  agent_unavailable: "AGENT_UNAVAILABLE"
};

/**
 * 大小写不敏感 + 与后端一致的家庭启发式映射；未命中时返回原码（未知码保持可见）。
 */
export function resolveAdminContractErrorCode(code: string): string {
  const trimmed = code.trim();
  const normalized = trimmed.toLowerCase();
  const direct = ADMIN_LEGACY_TO_CONTRACT_CODE[normalized];

  if (direct) {
    return direct;
  }

  if (contractErrorDefinition(trimmed)) {
    return trimmed;
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

  return trimmed;
}

export function adminErrorCodeInfo(code: string): AdminErrorCodeInfo | null {
  const contractCode = resolveAdminContractErrorCode(code);
  const definition = contractErrorDefinition(contractCode);

  if (definition) {
    return {
      title: definition.user_message,
      action: definition.remediation,
      retryable: definition.retryable,
      http_status: definition.http_status,
      contract_code: definition.code
    };
  }

  const fallback = ADMIN_ERROR_CODE_INFO[code];
  return fallback ? { ...fallback } : null;
}

export function adminErrorIsRetryable(code: string): boolean | undefined {
  const info = adminErrorCodeInfo(code);

  if (!info) {
    return undefined;
  }

  return info.retryable === "retryable";
}

export function adminErrorContractBody(
  code: string,
  options: {
    message?: string;
    httpStatus?: number;
    details?: Record<string, unknown>;
    contractVersion?: string;
  } = {}
) {
  return toContractErrorBody({
    code: resolveAdminContractErrorCode(code),
    ...(options.message ? { message: options.message } : {}),
    ...(options.httpStatus ? { httpStatus: options.httpStatus } : {}),
    ...(options.details ? { details: options.details } : {}),
    ...(options.contractVersion ? { contractVersion: options.contractVersion } : {})
  });
}

export function adminErrorTechnicalDetail(error: unknown): string {
  if (isAdminHttpError(error)) {
    const info = adminErrorCodeInfo(error.code);
    const contractCode = resolveAdminContractErrorCode(error.code);
    const contractBody = adminErrorContractBody(error.code, {
      ...(error.serverMessage ? { message: error.serverMessage } : {}),
      ...(error.status ? { httpStatus: error.status } : {}),
      ...(error.details ? { details: error.details } : {})
    });
    const details = error.details && Object.keys(error.details).length > 0
      ? JSON.stringify(error.details)
      : "";

    return [
      `错误码: ${error.code}`,
      `契约错误码: ${contractCode}`,
      `HTTP 状态: ${error.status || contractBody.http_status || "未知"}`,
      `retryable: ${info?.retryable ?? contractBody.retryable ?? "未知"}`,
      `服务端消息: ${error.serverMessage || "无"}`,
      `错误注册表: ${contractBody.message}`,
      ...(details ? [`附加信息: ${details}`] : [])
    ].join("\n");
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
