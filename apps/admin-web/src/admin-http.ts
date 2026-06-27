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

export function unwrapAdminResponse<T>(envelope: AdminApiEnvelope<T>): T {
  if (envelope.ok) {
    return envelope.data;
  }

  throw new Error(`${envelope.error_code}: ${envelope.message}`);
}

export function unwrapAdminResponseWithMeta<T>(
  envelope: AdminApiEnvelope<T>
): { data: T; meta?: AdminApiResponseMeta } {
  if (envelope.ok) {
    return {
      data: envelope.data,
      ...(envelope.meta ? { meta: envelope.meta } : {})
    };
  }

  throw new Error(`${envelope.error_code}: ${envelope.message}`);
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
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
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
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponseWithMeta(envelope);
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
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
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
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
}

export function adminAuthHeaders(auth?: AdminHttpAuth): HeadersInit | undefined {
  return auth?.session_token
    ? {
        "X-MixLab-Admin-Session-Token": auth.session_token
      }
    : undefined;
}
