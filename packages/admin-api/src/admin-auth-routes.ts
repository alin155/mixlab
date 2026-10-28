import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { AdminReadyReport } from "./admin-health-query.ts";
import {
  apiContractError,
  apiOk,
  apiOkContract,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

const ADMIN_LOGIN_DEFAULT_MAX_FAILURES = 5;
const ADMIN_LOGIN_DEFAULT_LOCK_MINUTES = 5;

function positiveIntegerSetting(value: string | undefined, fallback: number, minimum = 1): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export interface AdminLoginRateLimitConfig {
  max_failures: number;
  lock_ms: number;
}

export function readAdminLoginRateLimitConfig(env: NodeJS.ProcessEnv = process.env): AdminLoginRateLimitConfig {
  return {
    max_failures: positiveIntegerSetting(env.MIXLAB_ADMIN_LOGIN_MAX_FAILURES, ADMIN_LOGIN_DEFAULT_MAX_FAILURES),
    lock_ms:
      positiveIntegerSetting(env.MIXLAB_ADMIN_LOGIN_LOCK_MINUTES, ADMIN_LOGIN_DEFAULT_LOCK_MINUTES) * 60_000
  };
}

export type AdminLoginRateCheck = { limited: false } | { limited: true; retry_after_seconds: number };

/** Injectable login throttle so route unit tests never need real time or sockets. */
export interface AdminLoginRateLimiter {
  check(key: string, now_ms: number): AdminLoginRateCheck;
  record_failure(key: string, now_ms: number): void;
  record_success(key: string): void;
}

interface AdminLoginFailureBucket {
  failures: number;
  locked_until_ms: number;
}

export function adminLoginRateLimitKey(remoteAddress: string, username: string): string {
  return `${remoteAddress.trim() || "unknown-ip"}\u0000${username.trim().toLowerCase()}`;
}

export function createAdminLoginRateLimiter(
  overrides: Partial<AdminLoginRateLimitConfig> = {}
): AdminLoginRateLimiter {
  const defaults = readAdminLoginRateLimitConfig();
  const maxFailures =
    typeof overrides.max_failures === "number" &&
    Number.isFinite(overrides.max_failures) &&
    overrides.max_failures >= 1
      ? Math.floor(overrides.max_failures)
      : defaults.max_failures;
  const lockMs =
    typeof overrides.lock_ms === "number" && Number.isFinite(overrides.lock_ms) && overrides.lock_ms >= 1
      ? Math.floor(overrides.lock_ms)
      : defaults.lock_ms;
  const buckets = new Map<string, AdminLoginFailureBucket>();

  const sweep = (nowMs: number): void => {
    if (buckets.size < 512) {
      return;
    }
    for (const [key, bucket] of buckets) {
      if (bucket.locked_until_ms !== 0 && bucket.locked_until_ms <= nowMs) {
        buckets.delete(key);
      }
    }
  };

  return {
    check(key, nowMs) {
      const bucket = buckets.get(key);
      if (!bucket) {
        return { limited: false };
      }
      if (bucket.locked_until_ms > nowMs) {
        return {
          limited: true,
          retry_after_seconds: Math.max(1, Math.ceil((bucket.locked_until_ms - nowMs) / 1000))
        };
      }
      if (bucket.locked_until_ms !== 0) {
        buckets.delete(key);
      }
      return { limited: false };
    },
    record_failure(key, nowMs) {
      sweep(nowMs);
      const bucket = buckets.get(key);
      const active = bucket && bucket.locked_until_ms > nowMs;
      if (active) {
        return;
      }
      const previousFailures = bucket && bucket.locked_until_ms === 0 ? bucket.failures : 0;
      const failures = previousFailures + 1;
      buckets.set(key, {
        failures,
        locked_until_ms: failures >= maxFailures ? nowMs + lockMs : 0
      });
    },
    record_success(key) {
      buckets.delete(key);
    }
  };
}

let defaultAdminLoginRateLimiter: AdminLoginRateLimiter | null = null;

export function getDefaultAdminLoginRateLimiter(): AdminLoginRateLimiter {
  defaultAdminLoginRateLimiter ??= createAdminLoginRateLimiter();
  return defaultAdminLoginRateLimiter;
}

export interface AdminRegistrationGuardConfig {
  token: string | null;
}

export function readAdminRegistrationGuard(env: NodeJS.ProcessEnv = process.env): AdminRegistrationGuardConfig {
  const token = (env.MIXLAB_ADMIN_REGISTRATION_TOKEN ?? "").trim();
  return { token: token ? token : null };
}

/** Additive bootstrap/status flag so admin-web can render the registration token field. */
export function adminRegistrationRequiresToken(guard?: AdminRegistrationGuardConfig): boolean {
  return (guard ?? readAdminRegistrationGuard()).token !== null;
}

export function isLoopbackAdminRemoteAddress(value: string): boolean {
  const address = value.trim().toLowerCase();
  if (!address) {
    return false;
  }
  if (address === "::1") {
    return true;
  }
  if (address.startsWith("::ffff:")) {
    return /^::ffff:127\./.test(address);
  }
  return /^127\./.test(address);
}

function constantTimeTokenEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function registrationGuardRejection(
  guard: AdminRegistrationGuardConfig,
  remoteAddress: string,
  registrationToken: unknown
): string | null {
  if (guard.token) {
    return typeof registrationToken === "string" &&
      constantTimeTokenEqual(registrationToken.trim(), guard.token)
      ? null
      : "首次管理员注册需要匹配的注册令牌（请求体 registration_token），请向管理员索取注册令牌";
  }

  return isLoopbackAdminRemoteAddress(remoteAddress)
    ? null
    : "未配置注册令牌时仅允许从本机回环地址完成首次管理员注册";
}

const adminAuthRequestMetadata = new WeakMap<object, { remote_address: string }>();

/**
 * Transport metadata bridge for the public auth routes. admin-api's dispatcher only
 * passes request bodies to this layer, so readAdminRequestJson records the socket
 * address on the parsed body object (WeakMap keyed by identity, so it is race free
 * and garbage collected with the request).
 */
export function rememberAdminAuthRequestRemoteAddress(body: unknown, remoteAddress: string): void {
  if (typeof body === "object" && body !== null) {
    adminAuthRequestMetadata.set(body, { remote_address: remoteAddress.trim() });
  }
}

export function adminAuthRequestRemoteAddress(body: unknown): string {
  return typeof body === "object" && body !== null
    ? (adminAuthRequestMetadata.get(body)?.remote_address ?? "")
    : "";
}

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
  /** Optional so existing route-deps builders stay compatible; /ready returns 501 until wired. */
  read_ready?(input: TApiInput, options: { deep: boolean }): Promise<AdminReadyReport>;
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
  /** Socket peer address; omitted in unit tests, filled from readAdminRequestJson in production. */
  remote_address?: string;
  rate_limiter?: AdminLoginRateLimiter;
  register_guard?: AdminRegistrationGuardConfig;
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
  if (pathname === "/health" || pathname === "/ready") {
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

export function matchAdminReadyPath(pathname: string): boolean {
  return pathname === "/ready";
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
  const bootstrap = {
    ...((await input.deps.read_bootstrap(input.api_input)) as unknown as Record<string, unknown>),
    registration_requires_token: adminRegistrationRequiresToken(input.register_guard)
  };

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
      body: apiOkContract(await input.deps.read_health(input.api_input, {
        deep: input.search_params.get("deep") === "1"
      }))
    };
  }

  if (input.method === "GET" && matchAdminReadyPath(input.pathname)) {
    if (!input.deps.read_ready) {
      return {
        handled: true,
        status_code: 501,
        body: apiContractError("not_implemented", "就绪检查尚未启用")
      };
    }

    const ready = await input.deps.read_ready(input.api_input, {
      deep: input.search_params.get("deep") === "1"
    });

    if (!ready.ready) {
      return {
        handled: true,
        status_code: 503,
        body: apiContractError("not_ready", "管理端服务依赖未就绪", {
          reasons: ready.reasons,
          checks: ready.checks,
          safety: ready.safety,
          checked_at: ready.checked_at
        })
      };
    }

    return {
      handled: true,
      status_code: 200,
      body: apiOkContract(ready)
    };
  }

  if (input.method === "GET" && matchAdminAuthBootstrapPath(input.pathname)) {
    const bootstrap = await input.deps.read_bootstrap(input.api_input);
    return {
      handled: true,
      status_code: 200,
      body: apiOk({
        ...(bootstrap as unknown as Record<string, unknown>),
        registration_requires_token: adminRegistrationRequiresToken(input.register_guard)
      })
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
      const registration = {
        username: requiredBodyString(body, "username", "用户名不能为空"),
        password: requiredBodyString(body, "password", "密码不能为空"),
        display_name: optionalBodyString(body, "display_name"),
        now: input.now
      };
      // SEC-05: first-admin registration is never silently open. A configured
      // installation token must match the body; otherwise only loopback peers may
      // register (an unknown peer address fails closed). This runs before the
      // store/bootstrap is consulted, so a missing or empty account store cannot
      // turn into an open takeover window.
      const guard = input.register_guard ?? readAdminRegistrationGuard();
      const remoteAddress = input.remote_address ?? adminAuthRequestRemoteAddress(body);
      const rejection = registrationGuardRejection(guard, remoteAddress, body.registration_token);
      if (rejection) {
        return {
          handled: true,
          status_code: 403,
          body: apiContractError("registration_forbidden", rejection)
        };
      }

      const registered = await input.deps.register_first_admin(input.api_input, registration);

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
        body: apiContractError("invalid_request", invalidAuthRequestMessage(error))
      };
    }
  }

  if (input.method === "POST" && matchAdminAuthLoginPath(input.pathname)) {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      const username = requiredBodyString(body, "username", "用户名不能为空");
      const password = requiredBodyString(body, "password", "密码不能为空");
      // SEC-02: IP+username consecutive-failure throttle. The IP comes from the
      // socket peer (never x-forwarded-for); tests inject it directly.
      const limiter = input.rate_limiter ?? getDefaultAdminLoginRateLimiter();
      const nowMs = Date.parse(input.now);
      const remoteAddress = input.remote_address ?? adminAuthRequestRemoteAddress(body);
      const rateLimitKey = adminLoginRateLimitKey(remoteAddress, username);
      if (Number.isFinite(nowMs)) {
        const gate = limiter.check(rateLimitKey, nowMs);
        if (gate.limited) {
          return {
            handled: true,
            status_code: 429,
            body: apiContractError("login_rate_limited", "登录失败次数过多，请稍后再试", {
              retry_after_seconds: gate.retry_after_seconds
            })
          };
        }
      }

      const login = await input.deps.login_admin(input.api_input, {
        username,
        password,
        now: input.now
      });

      if (!login.ok) {
        if (Number.isFinite(nowMs)) {
          limiter.record_failure(rateLimitKey, nowMs);
        }
        return {
          handled: true,
          status_code: 401,
          body: apiContractError("login_failed", login.reason)
        };
      }

      if (Number.isFinite(nowMs)) {
        limiter.record_success(rateLimitKey);
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
        body: apiContractError("invalid_request", invalidAuthRequestMessage(error))
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
