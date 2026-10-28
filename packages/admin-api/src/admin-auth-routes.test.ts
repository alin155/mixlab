import assert from "node:assert/strict";
import test from "node:test";
import type { AdminReadyReport } from "./admin-health-query.ts";
import {
  adminLoginRateLimitKey,
  adminSessionTokenFromHeaders,
  createAdminLoginRateLimiter,
  handleAdminAuthRoutes,
  isLoopbackAdminRemoteAddress,
  isPublicAdminAuthRoute,
  matchAdminAuthBootstrapPath,
  matchAdminAuthLoginPath,
  matchAdminAuthLogoutPath,
  matchAdminAuthRegisterPath,
  matchAdminAuthStatusPath,
  matchAdminHealthPath,
  matchAdminReadyPath,
  readAdminRegistrationGuard,
  type AdminAuthRouteApiInput,
  type AdminAuthRouteDeps,
  type AdminLoginRateLimiter,
  type AdminRegistrationGuardConfig
} from "./admin-auth-routes.ts";

interface TestApiInput extends AdminAuthRouteApiInput {
  library_id: string;
}

interface TestUser {
  admin_id: string;
  username: string;
  password_hash: string;
}

interface TestSession {
  session_token: string;
}

type TestDeps = AdminAuthRouteDeps<
  TestApiInput,
  { service: string; root: string; deep: boolean },
  { has_admin: boolean; registration_open: boolean },
  TestUser,
  Omit<TestUser, "password_hash">,
  TestSession,
  { removed: boolean }
>;

function publicUser(user: TestUser): Omit<TestUser, "password_hash"> {
  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function makeDeps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    read_health: async (input, options) => ({
      service: "admin-api",
      root: `${input.library_id}:${input.library_root}`,
      deep: options.deep
    }),
    read_bootstrap: async () => ({
      has_admin: false,
      registration_open: true
    }),
    validate_session: async (_input, session) => session.session_token === "valid-session"
      ? {
          ok: true,
          user: {
            admin_id: "AU000001",
            username: "owner",
            password_hash: "secret"
          }
        }
      : {
          ok: false,
          reason: "登录凭证无效"
        },
    register_first_admin: async (_input, registration) => ({
      user: {
        admin_id: "AU000001",
        username: registration.username,
        password_hash: "secret"
      },
      session: {
        session_token: `registered:${registration.now}:${registration.display_name ?? ""}`
      }
    }),
    login_admin: async (_input, login) => login.password === "Owner12345"
      ? {
          ok: true,
          user: {
            admin_id: "AU000001",
            username: login.username,
            password_hash: "secret"
          },
          session: {
            session_token: "login-session"
          }
        }
      : {
          ok: false,
          reason: "用户名或密码错误"
        },
    logout_admin_session: async (_input, logout) => ({
      removed: logout.session_token === "valid-session"
    }),
    project_admin_user: publicUser,
    read_request_json: async () => ({}),
    ...overrides
  };
}

function callRoute(input: {
  method?: string;
  pathname: string;
  search?: string;
  auth_mode?: "password" | "disabled";
  session_token?: string;
  deps?: TestDeps;
  now?: string;
  remote_address?: string;
  rate_limiter?: AdminLoginRateLimiter;
  register_guard?: AdminRegistrationGuardConfig;
}) {
  return handleAdminAuthRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.search ?? ""),
    now: input.now ?? "2026-06-26T00:00:00.000Z",
    api_input: {
      library_root: "/tmp/PublicLibrary",
      library_id: "lib_test",
      auth_mode: input.auth_mode ?? "password"
    },
    session_token: input.session_token ?? "",
    remote_address: input.remote_address ?? "127.0.0.1",
    register_guard: input.register_guard ?? { token: null },
    ...(input.rate_limiter ? { rate_limiter: input.rate_limiter } : {}),
    deps: input.deps ?? makeDeps()
  });
}

test("auth route matchers and public route guard preserve exact endpoint contracts", () => {
  assert.equal(matchAdminHealthPath("/health"), true);
  assert.equal(matchAdminAuthBootstrapPath("/api/admin/auth/bootstrap"), true);
  assert.equal(matchAdminAuthStatusPath("/api/admin/auth/status"), true);
  assert.equal(matchAdminAuthRegisterPath("/api/admin/auth/register"), true);
  assert.equal(matchAdminAuthLoginPath("/api/admin/auth/login"), true);
  assert.equal(matchAdminAuthLogoutPath("/api/admin/auth/logout"), true);

  assert.equal(matchAdminReadyPath("/ready"), true);
  assert.equal(matchAdminReadyPath("/api/admin/ready"), false);
  assert.equal(matchAdminHealthPath("/api/admin/health"), false);
  assert.equal(matchAdminAuthStatusPath("/api/admin/auth/status/extra"), false);
  assert.equal(isPublicAdminAuthRoute("GET", "/health"), true);
  assert.equal(isPublicAdminAuthRoute("HEAD", "/health"), true);
  assert.equal(isPublicAdminAuthRoute("POST", "/health"), false);
  assert.equal(isPublicAdminAuthRoute("GET", "/ready"), true);
  assert.equal(isPublicAdminAuthRoute("HEAD", "/ready"), true);
  assert.equal(isPublicAdminAuthRoute("POST", "/ready"), false);
  assert.equal(isPublicAdminAuthRoute("GET", "/api/admin/auth/status"), true);
  assert.equal(isPublicAdminAuthRoute("POST", "/api/admin/auth/status"), false);
  assert.equal(isPublicAdminAuthRoute("POST", "/api/admin/auth/login"), true);
  assert.equal(isPublicAdminAuthRoute("GET", "/api/admin/cutter-users"), false);
});

test("session token parser prefers direct admin header and supports bearer fallback", () => {
  assert.equal(adminSessionTokenFromHeaders({
    "x-mixlab-admin-session-token": " direct-session ",
    authorization: "Bearer bearer-session"
  }), "direct-session");
  assert.equal(adminSessionTokenFromHeaders({
    authorization: "Bearer bearer-session "
  }), "bearer-session");
  assert.equal(adminSessionTokenFromHeaders({
    authorization: "Basic abc"
  }), "");
});

test("health route dispatches deep option and API input", async () => {
  const result = await callRoute({
    pathname: "/health",
    search: "deep=1"
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        service: "admin-api",
        root: "lib_test:/tmp/PublicLibrary",
        deep: true
      },
      contract_version: "1.0.0"
    });
  }
});

test("auth status preserves disabled, anonymous, valid, and invalid session branches", async () => {
  const disabled = await callRoute({
    pathname: "/api/admin/auth/status",
    auth_mode: "disabled"
  });
  assert.equal(disabled.handled, true);
  if (disabled.handled) {
    assert.deepEqual(disabled.body, {
      ok: true,
      data: {
        authenticated: true,
        auth_mode: "disabled",
        user: null,
        bootstrap: {
          has_admin: false,
          registration_open: true,
          registration_requires_token: false
        }
      }
    });
  }

  const anonymous = await callRoute({
    pathname: "/api/admin/auth/status"
  });
  assert.equal(anonymous.handled, true);
  if (anonymous.handled) {
    assert.deepEqual(anonymous.body, {
      ok: true,
      data: {
        authenticated: false,
        auth_mode: "password",
        user: null,
        bootstrap: {
          has_admin: false,
          registration_open: true,
          registration_requires_token: false
        }
      }
    });
  }

  const valid = await callRoute({
    pathname: "/api/admin/auth/status",
    session_token: "valid-session"
  });
  assert.equal(valid.handled, true);
  if (valid.handled) {
    assert.deepEqual(valid.body, {
      ok: true,
      data: {
        authenticated: true,
        auth_mode: "password",
        user: {
          admin_id: "AU000001",
          username: "owner"
        },
        bootstrap: {
          has_admin: false,
          registration_open: true,
          registration_requires_token: false
        },
        message: ""
      }
    });
  }

  const invalid = await callRoute({
    pathname: "/api/admin/auth/status",
    session_token: "bad-session"
  });
  assert.equal(invalid.handled, true);
  if (invalid.handled) {
    assert.deepEqual(invalid.body, {
      ok: true,
      data: {
        authenticated: false,
        auth_mode: "password",
        user: null,
        bootstrap: {
          has_admin: false,
          registration_open: true,
          registration_requires_token: false
        },
        message: "登录凭证无效"
      }
    });
  }
});

test("register route trims body fields, redacts user, and maps invalid requests", async () => {
  const registered = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/register",
    deps: makeDeps({
      read_request_json: async () => ({
        username: " owner ",
        password: " Owner12345 ",
        display_name: " Owner "
      })
    })
  });
  assert.equal(registered.handled, true);
  if (registered.handled) {
    assert.equal(registered.status_code, 201);
    assert.deepEqual(registered.body, {
      ok: true,
      data: {
        user: {
          admin_id: "AU000001",
          username: "owner"
        },
        session: {
          session_token: "registered:2026-06-26T00:00:00.000Z:Owner"
        }
      }
    });
  }

  const invalidJson = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/register",
    deps: makeDeps({
      read_request_json: async () => {
        throw new SyntaxError("bad json");
      }
    })
  });
  assert.equal(invalidJson.handled, true);
  if (invalidJson.handled) {
    assert.equal(invalidJson.status_code, 400);
    assert.deepEqual(invalidJson.body, {
      ok: false,
      error_code: "invalid_request",
      message: "请求 JSON 格式无效",
      code: "VALIDATION_FAILED",
      remediation: "检查输入后重试",
      retryable: "after-fix",
      contract_version: "1.0.0"
    });
  }
});

test("login route maps failed credentials and success envelopes", async () => {
  const failed = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/login",
    deps: makeDeps({
      read_request_json: async () => ({
        username: "owner",
        password: "wrong"
      })
    })
  });
  assert.equal(failed.handled, true);
  if (failed.handled) {
    assert.equal(failed.status_code, 401);
    assert.deepEqual(failed.body, {
      ok: false,
      error_code: "login_failed",
      message: "用户名或密码错误",
      code: "AUTH_REQUIRED",
      remediation: "重新登录后重试",
      retryable: "after-fix",
      contract_version: "1.0.0"
    });
  }

  const loggedIn = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/login",
    deps: makeDeps({
      read_request_json: async () => ({
        username: " owner ",
        password: " Owner12345 "
      })
    })
  });
  assert.equal(loggedIn.handled, true);
  if (loggedIn.handled) {
    assert.equal(loggedIn.status_code, 200);
    assert.deepEqual(loggedIn.body, {
      ok: true,
      data: {
        user: {
          admin_id: "AU000001",
          username: "owner"
        },
        session: {
          session_token: "login-session"
        }
      }
    });
  }
});

test("logout route preserves no-token response and injected session removal", async () => {
  const noToken = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/logout"
  });
  assert.equal(noToken.handled, true);
  if (noToken.handled) {
    assert.deepEqual(noToken.body, {
      ok: true,
      data: {
        removed: false
      }
    });
  }

  const removed = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/logout",
    session_token: "valid-session"
  });
  assert.equal(removed.handled, true);
  if (removed.handled) {
    assert.deepEqual(removed.body, {
      ok: true,
      data: {
        removed: true
      }
    });
  }
});

test("auth routes ignore unrelated routes and wrong methods", async () => {
  assert.deepEqual(await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/status"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "HEAD",
    pathname: "/health"
  }), {
    handled: false
  });
  assert.deepEqual(await callRoute({
    method: "GET",
    pathname: "/api/admin/cutter-users"
  }), {
    handled: false
  });
});

function statusOf(result: Awaited<ReturnType<typeof callRoute>>): number {
  return result.handled ? result.status_code : -1;
}

test("SEC-02 consecutive credential failures lock one IP+username pair with 429 login_rate_limited", async () => {
  const limiter = createAdminLoginRateLimiter({ max_failures: 5, lock_ms: 300_000 });
  const now = "2026-06-26T00:00:00.000Z";
  const attempt = (options: { now?: string; remote?: string; username?: string; password?: string; rate?: AdminLoginRateLimiter } = {}) => callRoute({
    method: "POST",
    pathname: "/api/admin/auth/login",
    now: options.now ?? now,
    remote_address: options.remote ?? "10.0.0.7",
    rate_limiter: options.rate ?? limiter,
    deps: makeDeps({
      read_request_json: async () => ({
        username: options.username ?? "owner",
        password: options.password ?? "Wrong12345"
      })
    })
  });

  for (let index = 0; index < 5; index += 1) {
    assert.equal(statusOf(await attempt()), 401);
  }

  const limited = await attempt({ now: "2026-06-26T00:00:01.000Z" });
  assert.equal(limited.handled, true);
  if (limited.handled) {
    assert.equal(limited.status_code, 429);
    assert.deepEqual(limited.body, {
      ok: false,
      error_code: "login_rate_limited",
      message: "登录失败次数过多，请稍后再试",
      code: "LOGIN_RATE_LIMITED",
      remediation: "等待锁定时间结束后重试",
      retryable: "retryable",
      details: { retry_after_seconds: 299 },
      contract_version: "1.0.0"
    });
  }

  // The lock is scoped to IP + username and does not leak to other pairs.
  assert.equal(statusOf(await attempt({ now: "2026-06-26T00:00:02.000Z", remote: "10.0.0.8" })), 401);
  assert.equal(statusOf(await attempt({ now: "2026-06-26T00:00:02.000Z", username: "someone-else" })), 401);

  // Lock expiry allows the next attempt; a correct password then clears the bucket.
  const afterLock = await callRoute({
    method: "POST",
    pathname: "/api/admin/auth/login",
    now: "2026-06-26T00:05:01.000Z",
    remote_address: "10.0.0.7",
    rate_limiter: limiter,
    deps: makeDeps({
      read_request_json: async () => ({ username: "owner", password: "Owner12345" })
    })
  });
  assert.equal(statusOf(afterLock), 200);
  assert.equal(statusOf(await attempt({ now: "2026-06-26T00:05:02.000Z" })), 401);
});

test("SEC-02 a successful login resets the consecutive failure counter", async () => {
  const limiter = createAdminLoginRateLimiter({ max_failures: 5, lock_ms: 300_000 });
  const attempt = (password: string, index: number) => callRoute({
    method: "POST",
    pathname: "/api/admin/auth/login",
    now: `2026-06-26T00:00:0${index}.000Z`,
    remote_address: "10.0.0.9",
    rate_limiter: limiter,
    deps: makeDeps({
      read_request_json: async () => ({ username: "owner", password })
    })
  });

  for (let index = 0; index < 4; index += 1) {
    assert.equal(statusOf(await attempt("Wrong12345", index)), 401);
  }
  assert.equal(statusOf(await attempt("Owner12345", 4)), 200);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(statusOf(await attempt("Wrong12345", index)), 401);
  }
  // Only four failures since the reset: still not locked.
  assert.equal(statusOf(await attempt("Wrong12345", 4)), 401);
  assert.equal(statusOf(await attempt("Wrong12345", 5)), 429);
});

test("SEC-02 rate limit key normalizes username and isolates by socket peer", () => {
  assert.equal(
    adminLoginRateLimitKey("10.0.0.7", "  Owner "),
    adminLoginRateLimitKey("10.0.0.7", "owner")
  );
  assert.notEqual(
    adminLoginRateLimitKey("10.0.0.7", "owner"),
    adminLoginRateLimitKey("10.0.0.8", "owner")
  );
});

test("SEC-05 first-admin registration is fail-closed without loopback or an installation token", async () => {
  const guardOff = { token: null } as AdminRegistrationGuardConfig;
  const body = { username: "owner", password: "Owner12345", display_name: "Owner" };
  const successDeps = makeDeps({ read_request_json: async () => ({ ...body }) });
  const register = (remoteAddress: string, guard: AdminRegistrationGuardConfig = guardOff, deps = successDeps) => callRoute({
    method: "POST",
    pathname: "/api/admin/auth/register",
    remote_address: remoteAddress,
    register_guard: guard,
    deps
  });

  assert.equal(statusOf(await register("127.0.0.1")), 201);
  assert.equal(statusOf(await register("::1")), 201);
  assert.equal(statusOf(await register("::ffff:127.0.0.1")), 201);

  for (const remoteAddress of ["192.168.1.50", "10.1.2.3", ""]) {
    const rejected = await register(remoteAddress, guardOff, makeDeps({
      read_request_json: async () => ({ ...body }),
      register_first_admin: async () => {
        throw new Error("register_first_admin must not run for rejected peers");
      }
    }));
    assert.equal(rejected.handled, true);
    if (rejected.handled) {
      assert.equal(rejected.status_code, 403);
      assert.deepEqual(rejected.body, {
        ok: false,
        error_code: "registration_forbidden",
        message: "未配置注册令牌时仅允许从本机回环地址完成首次管理员注册",
        code: "REGISTRATION_FORBIDDEN",
        remediation: "配置/获取注册令牌，或从本机回环地址注册",
        retryable: "after-fix",
        contract_version: "1.0.0"
      });
    }
  }
});

test("SEC-05 configured registration token must match the request body", async () => {
  const guard = { token: "install-token-123" } as AdminRegistrationGuardConfig;
  const register = (remoteAddress: string, registrationToken?: string) => callRoute({
    method: "POST",
    pathname: "/api/admin/auth/register",
    remote_address: remoteAddress,
    register_guard: guard,
    deps: makeDeps({
      read_request_json: async () => ({
        username: "owner",
        password: "Owner12345",
        ...(registrationToken === undefined ? {} : { registration_token: registrationToken })
      })
    })
  });

  for (const candidate of [undefined, "", "wrong-token"]) {
    const rejected = await register("127.0.0.1", candidate);
    assert.equal(rejected.handled, true);
    if (rejected.handled) {
      assert.equal(rejected.status_code, 403);
      assert.deepEqual(rejected.body, {
        ok: false,
        error_code: "registration_forbidden",
        message: "首次管理员注册需要匹配的注册令牌（请求体 registration_token），请向管理员索取注册令牌",
        code: "REGISTRATION_FORBIDDEN",
        remediation: "配置/获取注册令牌，或从本机回环地址注册",
        retryable: "after-fix",
        contract_version: "1.0.0"
      });
    }
  }

  // With a token configured, LAN peers may register when the token matches.
  assert.equal(statusOf(await register("192.168.1.50", "install-token-123")), 201);
  assert.equal(statusOf(await register("127.0.0.1", "install-token-123")), 201);
});

test("SEC-05 registration guard configuration and loopback classifier are env-driven", () => {
  assert.deepEqual(readAdminRegistrationGuard({} as NodeJS.ProcessEnv), { token: null });
  assert.deepEqual(readAdminRegistrationGuard({ MIXLAB_ADMIN_REGISTRATION_TOKEN: "  secret  " } as NodeJS.ProcessEnv), {
    token: "secret"
  });
  assert.equal(readAdminRegistrationGuard({ MIXLAB_ADMIN_REGISTRATION_TOKEN: "   " } as NodeJS.ProcessEnv).token, null);

  for (const loopback of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(isLoopbackAdminRemoteAddress(loopback), true, loopback);
  }
  for (const remote of ["", "192.168.1.2", "10.0.0.1", "::ffff:192.168.1.2", "localhost", "::2"]) {
    assert.equal(isLoopbackAdminRemoteAddress(remote), false, remote);
  }
});

test("SEC-05 production dispatcher bridge applies the guards from the real socket address", async () => {
  const { Readable } = await import("node:stream");
  const { readAdminRequestJson } = await import("./admin-http-session.ts");
  const { adminAuthRequestRemoteAddress } = await import("./admin-auth-routes.ts");

  const makeBody = async (remoteAddress: string) => {
    const request = Readable.from([
      JSON.stringify({ username: "owner", password: "Owner12345" })
    ]) as unknown as import("node:http").IncomingMessage;
    (request as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress };
    const body = await readAdminRequestJson(request);
    assert.equal(adminAuthRequestRemoteAddress(body), remoteAddress);
    return body;
  };

  const lanBody = await makeBody("192.168.1.23");
  const lanRejected = await handleAdminAuthRoutes({
    method: "POST",
    pathname: "/api/admin/auth/register",
    search_params: new URLSearchParams(),
    now: "2026-06-26T00:00:00.000Z",
    api_input: { library_root: "/tmp/PublicLibrary", library_id: "lib_test", auth_mode: "password" },
    session_token: "",
    register_guard: { token: null },
    // No explicit remote_address: the dispatcher bridge must supply it.
    deps: makeDeps({ read_request_json: async () => lanBody })
  });
  assert.equal(statusOf(lanRejected), 403);

  const loopbackBody = await makeBody("127.0.0.1");
  const loopbackAllowed = await handleAdminAuthRoutes({
    method: "POST",
    pathname: "/api/admin/auth/register",
    search_params: new URLSearchParams(),
    now: "2026-06-26T00:00:00.000Z",
    api_input: { library_root: "/tmp/PublicLibrary", library_id: "lib_test", auth_mode: "password" },
    session_token: "",
    register_guard: { token: null },
    deps: makeDeps({ read_request_json: async () => loopbackBody })
  });
  assert.equal(statusOf(loopbackAllowed), 201);
});

test("SEC-05 bootstrap and status expose registration_requires_token for admin-web", async () => {
  const bootstrapWithoutToken = await callRoute({ pathname: "/api/admin/auth/bootstrap" });
  assert.equal(bootstrapWithoutToken.handled, true);
  if (bootstrapWithoutToken.handled) {
    assert.deepEqual(bootstrapWithoutToken.body, {
      ok: true,
      data: {
        has_admin: false,
        registration_open: true,
        registration_requires_token: false
      }
    });
  }

  const bootstrapWithToken = await callRoute({
    pathname: "/api/admin/auth/bootstrap",
    register_guard: { token: "install-token-123" }
  });
  assert.equal(bootstrapWithToken.handled, true);
  if (bootstrapWithToken.handled) {
    assert.deepEqual(bootstrapWithToken.body, {
      ok: true,
      data: {
        has_admin: false,
        registration_open: true,
        registration_requires_token: true
      }
    });
  }

  const statusWithToken = await callRoute({
    pathname: "/api/admin/auth/status",
    register_guard: { token: "install-token-123" }
  });
  assert.equal(statusWithToken.handled, true);
  if (statusWithToken.handled && statusWithToken.body.ok) {
    const data = statusWithToken.body.data as { bootstrap: Record<string, unknown> };
    assert.equal(data.bootstrap.registration_requires_token, true);
    assert.equal(data.bootstrap.registration_open, true);
  }

  const statusWithoutToken = await callRoute({ pathname: "/api/admin/auth/status" });
  assert.equal(statusWithoutToken.handled, true);
  if (statusWithoutToken.handled && statusWithoutToken.body.ok) {
    const data = statusWithoutToken.body.data as { bootstrap: Record<string, unknown> };
    assert.equal(data.bootstrap.registration_requires_token, false);
  }
});

test("SEC-05 registration_requires_token follows MIXLAB_ADMIN_REGISTRATION_TOKEN in the server env", async () => {
  const previous = process.env.MIXLAB_ADMIN_REGISTRATION_TOKEN;
  const readBootstrap = () => handleAdminAuthRoutes({
    method: "GET",
    pathname: "/api/admin/auth/bootstrap",
    search_params: new URLSearchParams(),
    now: "2026-06-26T00:00:00.000Z",
    api_input: { library_root: "/tmp/PublicLibrary", library_id: "lib_test", auth_mode: "password" },
    session_token: "",
    deps: makeDeps()
  });

  try {
    delete process.env.MIXLAB_ADMIN_REGISTRATION_TOKEN;
    const withoutToken = await readBootstrap();
    if (!(withoutToken.handled && withoutToken.body.ok)) {
      throw new Error("bootstrap should succeed");
    }
    assert.equal((withoutToken.body.data as { registration_requires_token: boolean }).registration_requires_token, false);

    process.env.MIXLAB_ADMIN_REGISTRATION_TOKEN = "  env-install-token  ";
    const withToken = await readBootstrap();
    if (!(withToken.handled && withToken.body.ok)) {
      throw new Error("bootstrap should succeed");
    }
    assert.deepEqual(withToken.body.data, {
      has_admin: false,
      registration_open: true,
      registration_requires_token: true
    });
  } finally {
    if (previous === undefined) {
      delete process.env.MIXLAB_ADMIN_REGISTRATION_TOKEN;
    } else {
      process.env.MIXLAB_ADMIN_REGISTRATION_TOKEN = previous;
    }
  }
});

function readyReport(input: { ready: boolean; reasons?: string[] }): AdminReadyReport {
  const reasons = input.reasons ?? [];
  return {
    service: "admin-api",
    ready: input.ready,
    status: input.ready ? "ready" : "not_ready",
    checked_at: "2026-06-26T00:00:00.000Z",
    build: {
      sha: "sha-ready",
      version: "2026.06.26",
      image_tag: "admin-api:test"
    },
    checks: [{
      id: "library_readable",
      ok: input.ready,
      message: input.ready ? "公共素材库可读" : "公共素材库不可读，请检查 NAS 挂载或共享库权限"
    }],
    reasons,
    safety: {
      status: input.ready ? "healthy" : "blocked",
      safe_to_start: input.ready,
      checked_at: "2026-06-26T00:00:00.000Z",
      blocker_codes: input.ready ? [] : ["library-root-unavailable"]
    }
  };
}

test("ready route returns 501 until a readiness reader is wired", async () => {
  const result = await callRoute({
    pathname: "/ready"
  });

  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 501);
    assert.equal(result.body.ok, false);
    if (result.body.ok === false) {
      assert.equal(result.body.error_code, "not_implemented");
    }
  }
});

test("ready route dispatches ready and not-ready dependency states", async () => {
  const calls: Array<{ deep: boolean }> = [];
  const ready = await callRoute({
    pathname: "/ready",
    search: "deep=1",
    deps: makeDeps({
      read_ready: async (_input, options) => {
        calls.push({ deep: options.deep });
        return readyReport({ ready: true });
      }
    })
  });

  assert.equal(ready.handled, true);
  assert.deepEqual(calls, [{ deep: true }]);
  if (ready.handled) {
    assert.equal(ready.status_code, 200);
    assert.equal(ready.body.ok, true);
    if (ready.body.ok) {
      assert.equal((ready.body.data as AdminReadyReport).ready, true);
    }
  }

  const blocked = await callRoute({
    pathname: "/ready",
    deps: makeDeps({
      read_ready: async () => readyReport({
        ready: false,
        reasons: ["公共素材库不可读，请检查 NAS 挂载或共享库权限"]
      })
    })
  });

  assert.equal(blocked.handled, true);
  if (blocked.handled) {
    assert.equal(blocked.status_code, 503);
    assert.equal(blocked.body.ok, false);
    if (blocked.body.ok === false) {
      assert.equal(blocked.body.error_code, "not_ready");
      assert.deepEqual(blocked.body.details?.reasons, [
        "公共素材库不可读，请检查 NAS 挂载或共享库权限"
      ]);
      assert.equal(JSON.stringify(blocked.body).includes("/tmp/PublicLibrary"), false);
    }
  }
});
