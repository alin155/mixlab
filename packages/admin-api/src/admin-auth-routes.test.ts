import assert from "node:assert/strict";
import test from "node:test";
import {
  adminSessionTokenFromHeaders,
  handleAdminAuthRoutes,
  isPublicAdminAuthRoute,
  matchAdminAuthBootstrapPath,
  matchAdminAuthLoginPath,
  matchAdminAuthLogoutPath,
  matchAdminAuthRegisterPath,
  matchAdminAuthStatusPath,
  matchAdminHealthPath,
  type AdminAuthRouteApiInput,
  type AdminAuthRouteDeps
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
}) {
  return handleAdminAuthRoutes({
    method: input.method ?? "GET",
    pathname: input.pathname,
    search_params: new URLSearchParams(input.search ?? ""),
    now: "2026-06-26T00:00:00.000Z",
    api_input: {
      library_root: "/tmp/PublicLibrary",
      library_id: "lib_test",
      auth_mode: input.auth_mode ?? "password"
    },
    session_token: input.session_token ?? "",
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

  assert.equal(matchAdminHealthPath("/api/admin/health"), false);
  assert.equal(matchAdminAuthStatusPath("/api/admin/auth/status/extra"), false);
  assert.equal(isPublicAdminAuthRoute("GET", "/health"), true);
  assert.equal(isPublicAdminAuthRoute("HEAD", "/health"), true);
  assert.equal(isPublicAdminAuthRoute("POST", "/health"), false);
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
      }
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
          registration_open: true
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
          registration_open: true
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
          registration_open: true
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
          registration_open: true
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
      message: "请求 JSON 格式无效"
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
      message: "用户名或密码错误"
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
