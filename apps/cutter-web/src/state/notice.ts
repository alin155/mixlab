import { CutterApiError } from "../api.ts";

export const MATERIAL_SEARCH_TIMEOUT_NOTICE = "搜索响应较慢（索引预热时首次搜索可能较慢），请稍后重试或缩短关键词。";

/** 401 / login_required on any protected request must clear the stored session. */
export function shouldClearCutterSessionForApiError(error: unknown): boolean {
  return error instanceof CutterApiError &&
    (error.status === 401 || error.code === "login_required");
}

/**
 * Build a user-facing message for a failed user action.
 * Never shows an empty message and keeps the action context (fallback) first
 * so the user knows what failed even when the underlying error is technical.
 */
export function userFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof CutterApiError && (error.status === 401 || error.code === "login_required")) {
    return "登录已失效，请重新登录后再试。";
  }

  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) {
    return fallback;
  }

  if (message === fallback || message.startsWith(fallback + "：")) {
    return message;
  }

  return fallback + "：" + message;
}
