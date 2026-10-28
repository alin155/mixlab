import { contractErrorDefinition } from "../../contracts/src/errors.ts";

/** 共享统计/账号服务客户端（Round5）：cutter/admin/smart 三仓同 sha256。 */
export interface UsageServiceConnection {
  base_url: string;
  token: string;
  admin_token?: string;
}
export type UsageServiceMode = "isolated-service" | "legacy-ndjson";
export const USAGE_SERVICE_URL_ENV = "MIXLAB_USAGE_SERVICE_URL";
export const USAGE_SERVICE_TOKEN_ENV = "MIXLAB_USAGE_SERVICE_TOKEN";
export const USAGE_SERVICE_ADMIN_TOKEN_ENV = "MIXLAB_USAGE_SERVICE_ADMIN_TOKEN";

export interface UsageServiceHealth { status: "ok"; service: string; store_id: string; schema_version: string; contract_version: string }
export interface UsageServiceIngestResponse { store_id: string; acknowledged: string[]; inserted?: number; duplicate_count?: number }
export interface UsageServiceMetricsQuery { from?: string; to?: string; user_id?: string }
export interface UsageServiceMetricsResponse<M = unknown> {
  store_id: string; schema_version: string; contract_version: string; generated_at: string;
  query: UsageServiceMetricsQuery; event_count: number; truncated: boolean; metrics: M;
  by_day: Array<{ date: string; event_count: number; active_user_count: number; search_request_count: number }>;
}

export class UsageServiceClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly service_code?: string;
  constructor(code: string, message: string, status = 0, service_code?: string) {
    super(message);
    this.name = "UsageServiceClientError";
    this.code = code;
    this.status = status;
    if (service_code) this.service_code = service_code;
  }
}

export function usageServiceMode(connection?: UsageServiceConnection): UsageServiceMode {
  return connection ? "isolated-service" : "legacy-ndjson";
}

export function usageServiceFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env, role: "client" | "admin" = "client"): UsageServiceConnection | undefined {
  const baseUrl = (env[USAGE_SERVICE_URL_ENV] ?? "").trim();
  if (!baseUrl) return undefined;
  const clientToken = (env[USAGE_SERVICE_TOKEN_ENV] ?? "").trim();
  const adminToken = (env[USAGE_SERVICE_ADMIN_TOKEN_ENV] ?? "").trim();
  const token = role === "admin" ? adminToken || clientToken : clientToken;
  return { base_url: baseUrl, token, ...(adminToken ? { admin_token: adminToken } : {}) };
}

export function usageServiceUrl(connection: UsageServiceConnection): URL {
  let url: URL;
  try { url = new URL(connection.base_url); } catch { throw new UsageServiceClientError("usage_service_invalid_url", "统计服务地址无效"); }
  const hostname = url.hostname.toLowerCase();
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
  if (url.protocol !== "http:" || !loopback.has(hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !connection.token) {
    throw new UsageServiceClientError("usage_service_invalid_url", "统计服务需要带凭据的本机 HTTP 根地址（禁止公网/明文凭据 URL）");
  }
  return url;
}

export function usageServiceMaskedUrl(connection: UsageServiceConnection): string { return usageServiceUrl(connection).origin; }

export async function requestUsageService<T>(connection: UsageServiceConnection, route: string, options: {
  body?: unknown; query?: UsageServiceMetricsQuery; store_id?: string; signal?: AbortSignal; timeout_ms?: number; token?: string;
} = {}): Promise<T> {
  const baseUrl = usageServiceUrl(connection);
  const target = new URL(route, baseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (typeof value === "string" && value.trim() !== "") target.searchParams.set(key, value.trim());
  }
  const timeoutSignal = AbortSignal.timeout(options.timeout_ms ?? 2_000);
  let response: Response;
  try {
    response = await fetch(target, {
      method: options.body === undefined ? "GET" : "POST", redirect: "error",
      signal: options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal,
      headers: {
        Authorization: "Bearer " + (options.token ?? connection.token),
        "Content-Type": "application/json",
        ...(options.store_id ? { "X-Mixlab-Usage-Store": options.store_id } : {})
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
  } catch { throw new UsageServiceClientError("usage_service_unavailable", "统计服务暂时不可用，事件保留在本机 outbox", 503); }
  let parsed: unknown = null;
  try { parsed = await response.json(); } catch { parsed = null; }
  if (!response.ok) {
    const errorRecord = (parsed as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof errorRecord?.code === "string" ? errorRecord.code : "usage_service_request_failed";
    const message = typeof errorRecord?.message === "string" ? errorRecord.message : "统计服务请求失败";
    throw new UsageServiceClientError(code, message, response.status);
  }
  return parsed as T;
}

export function readUsageServiceHealth(connection: UsageServiceConnection, options: { signal?: AbortSignal } = {}): Promise<UsageServiceHealth> {
  return requestUsageService<UsageServiceHealth>(connection, "/health", { signal: options.signal });
}
export function postUsageServiceEvents(connection: UsageServiceConnection, events: unknown[], options: { store_id?: string; signal?: AbortSignal } = {}): Promise<UsageServiceIngestResponse> {
  return requestUsageService<UsageServiceIngestResponse>(connection, "/v1/events", {
    body: { schema_version: "1.0", events },
    ...(options.store_id ? { store_id: options.store_id } : {}),
    signal: options.signal, timeout_ms: 5_000
  });
}
export function readUsageServiceMetrics<M = unknown>(connection: UsageServiceConnection, query: UsageServiceMetricsQuery = {}): Promise<UsageServiceMetricsResponse<M>> {
  return requestUsageService<UsageServiceMetricsResponse<M>>(connection, "/v1/metrics", { query, timeout_ms: 10_000 });
}

/** Contract profile（cutter 事件 outbox 使用）：错误码映射 contracts，路径保持 /usage/v1。 */
export function createContractUsageServiceClient() {
  function fromEnv(env: Partial<NodeJS.ProcessEnv> = process.env, role: "client" | "admin" = "client"): UsageServiceConnection | undefined {
    const baseUrl = (env[USAGE_SERVICE_URL_ENV] ?? "").trim();
    if (!baseUrl) return undefined;
    const clientToken = (env[USAGE_SERVICE_TOKEN_ENV] ?? "").trim();
    const adminToken = (env[USAGE_SERVICE_ADMIN_TOKEN_ENV] ?? "").trim();
    return { base_url: baseUrl, token: role === "admin" ? adminToken || clientToken : clientToken, ...(adminToken ? { admin_token: adminToken } : {}) };
  }
  function url(connection: UsageServiceConnection): URL {
    let parsed: URL;
    try { parsed = new URL(connection.base_url); } catch { throw new Error("隔离统计服务需要本机 HTTP 根地址"); }
    if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("隔离统计服务需要本机 HTTP 根地址（http://127.0.0.1:端口/）");
    }
    if (!connection.token) throw new Error("隔离统计服务缺少客户端令牌（MIXLAB_USAGE_SERVICE_TOKEN）");
    return parsed;
  }
  function clientError(input: { code: string; message: string; status?: number; service_code?: string }): UsageServiceClientError {
    const definition = contractErrorDefinition(input.code);
    const error = new UsageServiceClientError(input.code, input.message || definition?.user_message || "统计服务请求失败", input.status ?? 0, input.service_code);
    if (definition?.remediation) (error as UsageServiceClientError & { remediation?: string }).remediation = definition.remediation;
    return error;
  }
  async function request<T>(connection: UsageServiceConnection, route: string, options: { body?: unknown; store_id?: string; signal?: AbortSignal } = {}): Promise<T> {
    const urlValue = url(connection);
    const timeoutSignal = AbortSignal.timeout(2_000);
    let response: Response;
    try {
      response = await fetch(new URL(route, urlValue), {
        method: options.body === undefined ? "GET" : "POST", redirect: "error",
        signal: options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal,
        headers: { Authorization: "Bearer " + connection.token, "Content-Type": "application/json", ...(options.store_id ? { "X-MixLab-Usage-Store": options.store_id } : {}) },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
      });
    } catch (error) {
      throw clientError({ code: "AGENT_UNAVAILABLE", message: "统计服务暂时不可用，事件保留在本机 outbox", service_code: (error as { name?: string }).name === "TimeoutError" ? "usage_service_timeout" : "usage_service_unavailable" });
    }
    let value: unknown;
    try { value = await response.json(); } catch { throw clientError({ code: "AGENT_UNAVAILABLE", status: response.status, message: "统计服务返回内容无法解析", service_code: "usage_service_invalid_response" }); }
    if (!response.ok) {
      const body = value as { error?: { code?: string; message?: string } };
      const contractCode = response.status === 401 || response.status === 403 || response.status >= 500 ? "AGENT_UNAVAILABLE" : "VALIDATION_FAILED";
      throw clientError({ code: contractCode, status: response.status, message: body.error?.message ?? "统计服务请求失败", service_code: body.error?.code });
    }
    return value as T;
  }
  function readMetrics(connection: UsageServiceConnection): Promise<unknown> {
    return request<unknown>(connection, "/usage/v1/metrics");
  }
  return { usageServiceMode, usageServiceFromEnv: fromEnv, usageServiceUrl: url, requestUsageService: request, readUsageServiceMetrics: readMetrics };
}
