import type { AdminApiEnvelope, AdminApiResponseMeta } from "./api.ts";

export interface AdminHttpAuth {
  session_token: string;
}

export interface AdminListQueryOptions {
  limit?: number;
  offset?: number;
  query?: string;
  status?: string;
  manifest_fallback?: string;
}

export class AdminHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly serverMessage: string;

  constructor(code: string, message: string, status = 0, details?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = "AdminHttpError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.serverMessage = message;
  }
}

export function isAdminHttpError(error: unknown): error is AdminHttpError {
  return error instanceof AdminHttpError;
}

export function isAdminAuthExpiredError(error: unknown): boolean {
  if (!isAdminHttpError(error)) {
    return false;
  }

  const normalizedCode = error.code.toUpperCase();

  return error.status === 401 ||
    error.code === "login_required" ||
    normalizedCode === "AUTH_REQUIRED";
}

function isAdminApiEnvelope(value: unknown): value is AdminApiEnvelope<unknown> {
  return typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok?: unknown }).ok === "boolean";
}

async function readAdminEnvelope<T>(response: Response): Promise<AdminApiEnvelope<T>> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new AdminHttpError(
      "invalid_response",
      `管理端响应不是有效 JSON（HTTP ${response.status}）`,
      response.status
    );
  }

  if (!isAdminApiEnvelope(payload)) {
    throw new AdminHttpError(
      "invalid_response",
      `管理端响应格式无效（HTTP ${response.status}）`,
      response.status
    );
  }

  return payload as AdminApiEnvelope<T>;
}

export function unwrapAdminResponse<T>(envelope: AdminApiEnvelope<T>, status = 0): T {
  if (envelope.ok) {
    return envelope.data;
  }

  throw new AdminHttpError(envelope.error_code, envelope.message, status, envelope.details);
}

export function unwrapAdminResponseWithMeta<T>(
  envelope: AdminApiEnvelope<T>,
  status = 0
): { data: T; meta?: AdminApiResponseMeta } {
  if (envelope.ok) {
    return {
      data: envelope.data,
      ...(envelope.meta ? { meta: envelope.meta } : {})
    };
  }

  throw new AdminHttpError(envelope.error_code, envelope.message, status, envelope.details);
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function listQuery(options?: AdminListQueryOptions): string {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  if (options?.offset) {
    params.set("offset", String(options.offset));
  }

  if (options?.query?.trim()) {
    params.set("query", options.query.trim());
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  if (options?.manifest_fallback === "forbid") {
    params.set("manifest_fallback", "forbid");
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  headers?: HeadersInit
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    ...(headers ? { headers } : {})
  });
  const envelope = await readAdminEnvelope<T>(response);
  return unwrapAdminResponse(envelope, response.status);
}

export async function getJsonWithMeta<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  headers?: HeadersInit
): Promise<{ data: T; meta?: AdminApiResponseMeta }> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    ...(headers ? { headers } : {})
  });
  const envelope = await readAdminEnvelope<T>(response);
  return unwrapAdminResponseWithMeta(envelope, response.status);
}

export async function sendJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  method: "POST" | "PATCH",
  body?: unknown,
  headers?: HeadersInit
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const envelope = await readAdminEnvelope<T>(response);
  return unwrapAdminResponse(envelope, response.status);
}

export async function deleteJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  headers?: HeadersInit
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    method: "DELETE",
    ...(headers ? { headers } : {})
  });
  const envelope = await readAdminEnvelope<T>(response);
  return unwrapAdminResponse(envelope, response.status);
}

export function adminAuthHeaders(auth?: AdminHttpAuth): HeadersInit | undefined {
  return auth?.session_token
    ? {
        "X-MixLab-Admin-Session-Token": auth.session_token
      }
    : undefined;
}
