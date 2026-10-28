import { contractErrorDefinition } from "../../contracts/src/errors.ts";

export interface AccountServiceConnection {
  base_url: string;
  /** Token used for client operations (login/register/validate/...). */
  token: string;
  /** Optional admin token for admin-only operations (list/approve/disable/reset/entitlements). */
  admin_token?: string;
}

/** Admin-only account service operations that require the admin token when split tokens are configured. */
export const ACCOUNT_SERVICE_ADMIN_OPERATIONS = new Set([
  "list",
  "list_with_tiers",
  "approve",
  "disable",
  "reset_password",
  "get_entitlements",
  "set_entitlements"
]);
export type AccountsServiceMode = "isolated-service" | "local-users-file";

export interface BaseAccountServiceError extends Error {
  code: string;
  status?: number;
  service_code?: string;
  service_area: "accounts";
  remediation?: string;
}

export interface AccountsServiceEnvOptions {
  url_env_names: string[];
  token_env_names: string[];
  admin_token_env_names?: string[];
  role?: "client" | "admin";
}

export function accountsServiceMode(connection?: AccountServiceConnection): AccountsServiceMode {
  return connection ? "isolated-service" : "local-users-file";
}

export function accountsServiceFromEnv(env: Partial<NodeJS.ProcessEnv> = process.env, options: AccountsServiceEnvOptions): AccountServiceConnection | undefined {
  const first = (names: string[]): string => names.map((name) => (env[name] ?? "").trim()).find(Boolean) ?? "";
  const baseUrl = first(options.url_env_names);
  if (!baseUrl) return undefined;
  const role = options.role ?? "client";
  const clientToken = first(options.token_env_names);
  const adminToken = first(options.admin_token_env_names ?? []);
  return { base_url: baseUrl, token: role === "admin" ? adminToken || clientToken : clientToken };
}

/** Resolve the env-provided connection for both roles; token is the client token when present. */
export function accountsServiceConnectionFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  options: AccountsServiceEnvOptions
): AccountServiceConnection | undefined {
  const first = (names: string[]): string => names.map((name) => (env[name] ?? "").trim()).find(Boolean) ?? "";
  const baseUrl = first(options.url_env_names);
  if (!baseUrl) return undefined;
  const clientToken = first(options.token_env_names);
  const adminToken = first(options.admin_token_env_names ?? []);
  const token = clientToken || adminToken;
  if (!token) return { base_url: baseUrl, token: "" };
  return {
    base_url: baseUrl,
    token,
    ...(adminToken && adminToken !== token ? { admin_token: adminToken } : {})
  };
}

export function accountServiceUrl(connection: AccountServiceConnection, messages: { invalid?: string; missing_token?: string } = {}): URL {
  const url = new URL(connection.base_url);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(messages.invalid ?? "账号服务只接受本机 HTTP 根地址（http://127.0.0.1:端口/）");
  }
  if (!connection.token) throw new Error(messages.missing_token ?? "账号服务缺少客户端令牌");
  return url;
}

/** 默认映射（cutter 契约）：AGENT_UNAVAILABLE / AUTH_FORBIDDEN / VALIDATION_FAILED。 */
export function mapAccountServiceErrorDefault(input: { status?: number; service_code?: string; message?: string }): BaseAccountServiceError {
  const status = input.status ?? 0;
  const code = input.service_code === "admin_required" ? "AUTH_FORBIDDEN" : status === 0 || status === 401 || status === 403 || status >= 500 ? "AGENT_UNAVAILABLE" : "VALIDATION_FAILED";
  const definition = contractErrorDefinition(code);
  const error = new Error(input.message || definition?.user_message || "账号服务请求失败") as BaseAccountServiceError;
  error.name = "AccountServiceClientError";
  error.code = code;
  error.status = input.status;
  error.service_area = "accounts";
  if (input.service_code) error.service_code = input.service_code;
  if (definition?.remediation) error.remediation = definition.remediation;
  return error;
}

export interface CreateCutterAccountsClientInput<T extends Record<string, unknown>> {
  connection?: AccountServiceConnection;
  local: T;
  /** local 方法名 → 服务端 operation 名（默认同名）。 */
  operation_names?: Record<string, string>;
  map_error?: (info: { status?: number; service_code?: string; message?: string }) => Error;
  request_timeout_ms?: number;
}

/** 账号客户端工厂：未配置连接时原样返回 local（旧 users.json 行为）；配置后代理到 POST /accounts/v1，失败不回退。 */
export function createCutterAccountsClient<T extends Record<string, unknown>>(input: CreateCutterAccountsClientInput<T>): T {
  if (!input.connection) return input.local;
  const serviceUrl = new URL("/accounts/v1", accountServiceUrl(input.connection));
  const mapError = input.map_error ?? mapAccountServiceErrorDefault;
  const timeoutMs = input.request_timeout_ms ?? 10_000;
  const proxied: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input.local)) {
    if (typeof value !== "function") { proxied[key] = value; continue; }
    const operation = input.operation_names?.[key] ?? key;
    proxied[key] = async (_root: string, ...args: unknown[]): Promise<unknown> => {
      const token = ACCOUNT_SERVICE_ADMIN_OPERATIONS.has(operation)
        ? (input.connection!.admin_token || input.connection!.token)
        : input.connection!.token;
      let response: Response;
      try {
        response = await fetch(serviceUrl, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ operation, args })
        });
      } catch (error) {
        throw mapError({ message: "账号服务暂时不可用，未回退共享文件写入", service_code: (error as { name?: string }).name === "TimeoutError" ? "account_service_timeout" : "account_service_unavailable" });
      }
      let value: { result?: unknown; error?: { code?: string; message?: string } };
      try { value = (await response.json()) as typeof value; } catch { throw mapError({ status: 503, message: "账号服务响应无法解析", service_code: "account_service_unavailable" }); }
      if (!response.ok) throw mapError({ status: response.status, message: value.error?.message ?? "账号服务请求失败", service_code: value.error?.code });
      if (!Object.hasOwn(value, "result")) {
        throw mapError({ status: 502, message: "账号服务响应缺少 result", service_code: "account_service_error" });
      }
      return value.result;
    };
  }

  if (Object.hasOwn(input.local, "mode")) proxied.mode = "service";
  return proxied as T;
}
