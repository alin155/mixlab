import assert from "node:assert/strict";
import test from "node:test";
import { createAdminAuthClientMethods } from "./admin-auth-client.ts";

test("admin auth client methods preserve endpoints, methods, headers, and bodies", async () => {
  const requests: Array<{ pathname: string; method: string; token: string | null; body?: unknown }> = [];
  const authClient = createAdminAuthClientMethods({
    baseUrl: "http://127.0.0.1:3889/",
    protectedHeaders: {
      "X-MixLab-Admin-Session-Token": "admin-session-001"
    },
    fetchImpl: async (url, init) => {
      const pathname = new URL(String(url)).pathname;
      requests.push({
        pathname,
        method: init?.method ?? "GET",
        token: new Headers(init?.headers).get("x-mixlab-admin-session-token"),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });

      const data = pathname === "/api/admin/auth/bootstrap"
        ? {
            registration_open: true,
            has_admin_user: false
          }
        : pathname === "/api/admin/auth/status"
          ? {
              authenticated: true,
              auth_mode: "password",
              user: {
                user_id: "AU000001",
                username: "owner",
                display_name: "Owner",
                role: "owner",
                status: "active",
                created_at: "2026-06-18T00:00:00.000Z",
                last_login_at: "2026-06-18T00:01:00.000Z",
                disabled_at: ""
              },
              bootstrap: {
                registration_open: false,
                has_admin_user: true
              }
            }
          : pathname === "/api/admin/auth/logout"
            ? { removed: true }
            : {
                user: {
                  user_id: "AU000001",
                  username: "owner",
                  display_name: "Owner",
                  role: "owner",
                  status: "active",
                  created_at: "2026-06-18T00:00:00.000Z",
                  last_login_at: "2026-06-18T00:01:00.000Z",
                  disabled_at: ""
                },
                session: {
                  user_id: "AU000001",
                  session_token: "admin-session-001",
                  created_at: "2026-06-18T00:00:00.000Z",
                  last_seen_at: "2026-06-18T00:00:00.000Z"
                }
              };

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  await authClient.getAuthBootstrap();
  await authClient.getAuthStatus();
  await authClient.registerAdmin({
    username: "owner",
    display_name: "Owner",
    password: "Owner12345"
  });
  await authClient.loginAdmin({
    username: "owner",
    password: "Owner12345"
  });
  await authClient.logoutAdmin();

  assert.deepEqual(requests.map((request) => [request.pathname, request.method]), [
    ["/api/admin/auth/bootstrap", "GET"],
    ["/api/admin/auth/status", "GET"],
    ["/api/admin/auth/register", "POST"],
    ["/api/admin/auth/login", "POST"],
    ["/api/admin/auth/logout", "POST"]
  ]);
  assert.equal(requests[0]?.token, null);
  assert.equal(requests[1]?.token, "admin-session-001");
  assert.equal(requests[2]?.token, null);
  assert.equal(requests[3]?.token, null);
  assert.equal(requests[4]?.token, "admin-session-001");
  assert.deepEqual(requests[2]?.body, {
    username: "owner",
    display_name: "Owner",
    password: "Owner12345"
  });
  assert.deepEqual(requests[3]?.body, {
    username: "owner",
    password: "Owner12345"
  });
  assert.deepEqual(requests[4]?.body, {});
});
