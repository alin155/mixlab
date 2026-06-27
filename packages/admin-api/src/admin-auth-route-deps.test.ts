import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAdminAuthRouteDeps,
  createAdminAuthRouteServerDeps
} from "./admin-auth-route-deps.ts";
import {
  handleAdminAuthRoutes
} from "./admin-auth-routes.ts";

const requestNow = "2026-06-27T02:10:00.000Z";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-auth-route-deps-"));
}

test("auth route deps factory wires bootstrap register status login and logout without exposing hashes", async () => {
  const libraryRoot = await makeLibraryRoot();
  const healthReads: Array<{ library_root: string; deep: boolean }> = [];
  const routeDeps = createAdminAuthRouteServerDeps({
    now: requestNow,
    read_request_json: async () => ({
      username: "owner",
      password: "Owner12345",
      display_name: "Owner"
    }),
    async read_health(input, options) {
      healthReads.push({
        library_root: input.library_root,
        deep: options.deep
      });
      return {
        ok: true,
        library_root: input.library_root,
        deep: options.deep
      };
    }
  });

  const health = await handleAdminAuthRoutes({
    method: "GET",
    pathname: "/health",
    search_params: new URLSearchParams("deep=1"),
    now: requestNow,
    api_input: {
      library_root: libraryRoot,
      auth_mode: "password"
    },
    session_token: "",
    deps: routeDeps
  });
  const bootstrapBefore = await handleAdminAuthRoutes({
    method: "GET",
    pathname: "/api/admin/auth/bootstrap",
    search_params: new URLSearchParams(),
    now: requestNow,
    api_input: {
      library_root: libraryRoot,
      auth_mode: "password"
    },
    session_token: "",
    deps: routeDeps
  });
  const register = await handleAdminAuthRoutes({
    method: "POST",
    pathname: "/api/admin/auth/register",
    search_params: new URLSearchParams(),
    now: requestNow,
    api_input: {
      library_root: libraryRoot,
      auth_mode: "password"
    },
    session_token: "",
    deps: routeDeps
  });

  assert.equal(health.handled, true);
  assert.deepEqual(healthReads, [{ library_root: libraryRoot, deep: true }]);
  assert.equal(bootstrapBefore.handled, true);
  if (bootstrapBefore.handled && bootstrapBefore.body.ok) {
    assert.deepEqual(bootstrapBefore.body.data, {
      has_admin: false,
      registration_open: true
    });
  }
  assert.equal(register.handled, true);
  assert.equal(register.handled && register.status_code, 201);
  assert.equal(register.handled && register.body.ok, true);
  if (!(register.handled && register.body.ok)) {
    throw new Error("registration should succeed");
  }

  const registeredData = register.body.data as {
    user: { username: string; password_hash?: string };
    session: { session_token: string };
  };
  assert.equal(registeredData.user.username, "owner");
  assert.equal("password_hash" in registeredData.user, false);
  assert.equal(typeof registeredData.session.session_token, "string");

  const status = await handleAdminAuthRoutes({
    method: "GET",
    pathname: "/api/admin/auth/status",
    search_params: new URLSearchParams(),
    now: requestNow,
    api_input: {
      library_root: libraryRoot,
      auth_mode: "password"
    },
    session_token: registeredData.session.session_token,
    deps: routeDeps
  });
  assert.equal(status.handled, true);
  if (status.handled && status.body.ok) {
    const statusData = status.body.data as {
      authenticated: boolean;
      user: { username: string; password_hash?: string };
    };
    assert.equal(statusData.authenticated, true);
    assert.equal(statusData.user.username, "owner");
    assert.equal("password_hash" in statusData.user, false);
  }

  const loginDeps = createAdminAuthRouteServerDeps({
    now: requestNow,
    read_request_json: async () => ({
      username: "owner",
      password: "Owner12345"
    }),
    async read_health(input, options) {
      return {
        ok: true,
        library_root: input.library_root,
        deep: options.deep
      };
    }
  });
  const login = await handleAdminAuthRoutes({
    method: "POST",
    pathname: "/api/admin/auth/login",
    search_params: new URLSearchParams(),
    now: requestNow,
    api_input: {
      library_root: libraryRoot,
      auth_mode: "password"
    },
    session_token: "",
    deps: loginDeps
  });

  assert.equal(login.handled, true);
  assert.equal(login.handled && login.status_code, 200);
  if (!(login.handled && login.body.ok)) {
    throw new Error("login should succeed");
  }
  const loginData = login.body.data as {
    user: { username: string; password_hash?: string };
    session: { session_token: string };
  };
  assert.equal(loginData.user.username, "owner");
  assert.equal("password_hash" in loginData.user, false);

  const logout = await handleAdminAuthRoutes({
    method: "POST",
    pathname: "/api/admin/auth/logout",
    search_params: new URLSearchParams(),
    now: requestNow,
    api_input: {
      library_root: libraryRoot,
      auth_mode: "password"
    },
    session_token: loginData.session.session_token,
    deps: loginDeps
  });

  assert.equal(logout.handled, true);
  assert.equal(logout.handled && logout.body.ok, true);
  if (logout.handled && logout.body.ok) {
    assert.deepEqual(logout.body.data, { removed: true });
  }
});

test("auth route generic deps accept injected auth services without binding storage", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const deps = createAdminAuthRouteDeps<
    { library_root: string; auth_mode: "password" },
    { ok: true; deep: boolean },
    { has_admin: boolean; registration_open: boolean },
    { id: string; username: string; password_hash: string },
    { id: string; username: string },
    { session_token: string },
    { removed: boolean }
  >({
    async read_request_json() {
      calls.push({ name: "json", input: null });
      return {
        username: "owner",
        password: "Owner12345"
      };
    },
    async read_health(input, options) {
      calls.push({ name: "health", input: { input, options } });
      return {
        ok: true,
        deep: options.deep
      };
    },
    async read_bootstrap(input) {
      calls.push({ name: "bootstrap", input });
      return {
        has_admin: true,
        registration_open: false
      };
    },
    async validate_session(input, session) {
      calls.push({ name: "validate", input: { input, session } });
      return {
        ok: true,
        user: {
          id: "admin-1",
          username: "owner",
          password_hash: "redacted-by-projection"
        }
      };
    },
    async register_first_admin(input, registration) {
      calls.push({ name: "register", input: { input, registration } });
      return {
        user: {
          id: "admin-1",
          username: registration.username,
          password_hash: "hash"
        },
        session: {
          session_token: "registered-session"
        }
      };
    },
    async login_admin(input, login) {
      calls.push({ name: "login", input: { input, login } });
      return {
        ok: true,
        user: {
          id: "admin-1",
          username: login.username,
          password_hash: "hash"
        },
        session: {
          session_token: "login-session"
        }
      };
    },
    async logout_admin_session(input, logout) {
      calls.push({ name: "logout", input: { input, logout } });
      return {
        removed: logout.session_token === "login-session"
      };
    },
    project_admin_user(user) {
      calls.push({ name: "project", input: user });
      return {
        id: user.id,
        username: user.username
      };
    }
  });

  const apiInput = {
    library_root: "/tmp/PublicLibrary",
    auth_mode: "password" as const
  };

  const health = await deps.read_health(apiInput, { deep: true });
  const bootstrap = await deps.read_bootstrap(apiInput);
  const validation = await deps.validate_session(apiInput, {
    session_token: "existing-session",
    now: requestNow
  });
  const login = await deps.login_admin(apiInput, {
    username: "owner",
    password: "Owner12345",
    now: requestNow
  });
  const logout = await deps.logout_admin_session(apiInput, {
    session_token: "login-session"
  });

  assert.deepEqual(health, {
    ok: true,
    deep: true
  });
  assert.deepEqual(bootstrap, {
    has_admin: true,
    registration_open: false
  });
  assert.equal(validation.ok, true);
  assert.equal(login.ok, true);
  assert.deepEqual(logout, {
    removed: true
  });
  if (validation.ok) {
    assert.deepEqual(deps.project_admin_user(validation.user), {
      id: "admin-1",
      username: "owner"
    });
  }
  assert.deepEqual(calls.map((call) => call.name), [
    "health",
    "bootstrap",
    "validate",
    "login",
    "logout",
    "project"
  ]);
});
