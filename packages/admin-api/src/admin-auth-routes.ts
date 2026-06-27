import type { IncomingHttpHeaders } from "node:http";
import {
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export type AdminAuthMode = "password" | "disabled";

export interface AdminAuthRouteApiInput {
  library_root: string;
  auth_mode?: AdminAuthMode;
}

export type AdminAuthSessionValidation<TUser> =
  | { ok: true; user: TUser }
  | { ok: false; reason: string };

export type AdminAuthLoginResult<TUser, TSession> =
  | { ok: true; user: TUser; session: TSession }
  | { ok: false; reason: string };

export interface AdminAuthRouteDeps<
  TApiInput extends AdminAuthRouteApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
> {
  read_health(input: TApiInput, options: { deep: boolean }): Promise<THealth>;
  read_bootstrap(input: TApiInput): Promise<TBootstrap>;
  validate_session(
    input: TApiInput,
    session: { session_token: string; now: string }
  ): Promise<AdminAuthSessionValidation<TUser>>;
  register_first_admin(
    input: TApiInput,
    registration: { username: string; password: string; display_name?: string; now: string }
  ): Promise<{ user: TUser; session: TSession }>;
  login_admin(
    input: TApiInput,
    login: { username: string; password: string; now: string }
  ): Promise<AdminAuthLoginResult<TUser, TSession>>;
  logout_admin_session(input: TApiInput, logout: { session_token: string }): Promise<TLogout>;
  project_admin_user(user: TUser): TPublicUser;
  read_request_json(): Promise<unknown>;
}

export type AdminAuthRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminAuthRoutesInput<
  TApiInput extends AdminAuthRouteApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
> {
  method: string;
  pathname: string;
  search_params: URLSearchParams;
  now: string;
  api_input: TApiInput;
  session_token: string;
  deps: AdminAuthRouteDeps<TApiInput, THealth, TBootstrap, TUser, TPublicUser, TSession, TLogout>;
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

export function adminSessionTokenFromHeaders(headers: IncomingHttpHeaders): string {
  const directToken = firstHeaderValue(headers["x-mixlab-admin-session-token"]);
  if (directToken) {
    return directToken;
  }

  const authorization = firstHeaderValue(headers.authorization);
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  return bearerMatch?.[1]?.trim() ?? "";
}

export function adminSessionTokenFromRequest(input: { headers: IncomingHttpHeaders }): string {
  return adminSessionTokenFromHeaders(input.headers);
}

export function isPublicAdminAuthRoute(method: string | undefined, pathname: string): boolean {
  if (pathname === "/health") {
    return method === "GET" || method === "HEAD";
  }

  if (pathname === "/api/admin/auth/bootstrap" || pathname === "/api/admin/auth/status") {
    return method === "GET";
  }

  if (
    pathname === "/api/admin/auth/register" ||
    pathname === "/api/admin/auth/login" ||
    pathname === "/api/admin/auth/logout"
  ) {
    return method === "POST";
  }

  return false;
}

export function matchAdminHealthPath(pathname: string): boolean {
  return pathname === "/health";
}

export function matchAdminAuthBootstrapPath(pathname: string): boolean {
  return pathname === "/api/admin/auth/bootstrap";
}

export function matchAdminAuthStatusPath(pathname: string): boolean {
  return pathname === "/api/admin/auth/status";
}

export function matchAdminAuthRegisterPath(pathname: string): boolean {
  return pathname === "/api/admin/auth/register";
}

export function matchAdminAuthLoginPath(pathname: string): boolean {
  return pathname === "/api/admin/auth/login";
}

export function matchAdminAuthLogoutPath(pathname: string): boolean {
  return pathname === "/api/admin/auth/logout";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRequestRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error("请求内容必须是对象");
  }

  return body;
}

function requiredBodyString(body: Record<string, unknown>, key: string, message: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function optionalBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} 必须是字符串`);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function invalidAuthRequestMessage(error: unknown): string {
  return error instanceof SyntaxError ? "请求 JSON 格式无效" : (error as Error).message;
}

async function authStatusBody<
  TApiInput extends AdminAuthRouteApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
>(
  input: HandleAdminAuthRoutesInput<TApiInput, THealth, TBootstrap, TUser, TPublicUser, TSession, TLogout>
): Promise<Record<string, unknown>> {
  const authMode = input.api_input.auth_mode ?? "disabled";
  const bootstrap = await input.deps.read_bootstrap(input.api_input);

  if (authMode === "disabled") {
    return {
      authenticated: true,
      auth_mode: authMode,
      user: null,
      bootstrap
    };
  }

  if (!input.session_token) {
    return {
      authenticated: false,
      auth_mode: authMode,
      user: null,
      bootstrap
    };
  }

  const validation = await input.deps.validate_session(input.api_input, {
    session_token: input.session_token,
    now: input.now
  });

  return {
    authenticated: validation.ok,
    auth_mode: authMode,
    user: validation.ok ? input.deps.project_admin_user(validation.user) : null,
    bootstrap,
    message: validation.ok ? "" : validation.reason
  };
}

export async function handleAdminAuthRoutes<
  TApiInput extends AdminAuthRouteApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
>(
  input: HandleAdminAuthRoutesInput<TApiInput, THealth, TBootstrap, TUser, TPublicUser, TSession, TLogout>
): Promise<AdminAuthRouteResult> {
  if (input.method === "GET" && matchAdminHealthPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_health(input.api_input, {
        deep: input.search_params.get("deep") === "1"
      }))
    };
  }

  if (input.method === "GET" && matchAdminAuthBootstrapPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_bootstrap(input.api_input))
    };
  }

  if (input.method === "GET" && matchAdminAuthStatusPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await authStatusBody(input))
    };
  }

  if (input.method === "POST" && matchAdminAuthRegisterPath(input.pathname)) {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      const registered = await input.deps.register_first_admin(input.api_input, {
        username: requiredBodyString(body, "username", "用户名不能为空"),
        password: requiredBodyString(body, "password", "密码不能为空"),
        display_name: optionalBodyString(body, "display_name"),
        now: input.now
      });

      return {
        handled: true,
        status_code: 201,
        body: apiOk({
          user: input.deps.project_admin_user(registered.user),
          session: registered.session
        })
      };
    } catch (error) {
      return {
        handled: true,
        status_code: 400,
        body: apiError("invalid_request", invalidAuthRequestMessage(error))
      };
    }
  }

  if (input.method === "POST" && matchAdminAuthLoginPath(input.pathname)) {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      const login = await input.deps.login_admin(input.api_input, {
        username: requiredBodyString(body, "username", "用户名不能为空"),
        password: requiredBodyString(body, "password", "密码不能为空"),
        now: input.now
      });

      if (!login.ok) {
        return {
          handled: true,
          status_code: 401,
          body: apiError("login_failed", login.reason)
        };
      }

      return {
        handled: true,
        status_code: 200,
        body: apiOk({
          user: input.deps.project_admin_user(login.user),
          session: login.session
        })
      };
    } catch (error) {
      return {
        handled: true,
        status_code: 400,
        body: apiError("invalid_request", invalidAuthRequestMessage(error))
      };
    }
  }

  if (input.method === "POST" && matchAdminAuthLogoutPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(input.session_token
        ? await input.deps.logout_admin_session(input.api_input, {
            session_token: input.session_token
          })
        : { removed: false })
    };
  }

  return { handled: false };
}
