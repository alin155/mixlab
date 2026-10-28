import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AdminUserRecord } from "../../library-fs/src/index.ts";
import {
  adminCommandActorFromAdminUser,
  isPublicAdminMediaRoute,
  jsonBytes,
  readAdminRequestJson,
  requireAdminSession,
  writeAdminJson,
  writeAdminNoContent
} from "./admin-http-session.ts";
import { adminAuthRequestRemoteAddress } from "./admin-auth-routes.ts";

function requestFromChunks(chunks: Array<string | Buffer>, headers: IncomingMessage["headers"] = {}): IncomingMessage {
  const request = Readable.from(chunks) as IncomingMessage;
  request.headers = headers;
  return request;
}

function responseRecorder(): {
  response: ServerResponse;
  writes: Array<{ statusCode: number; headers: Record<string, string> }>;
  bodies: string[];
} {
  const writes: Array<{ statusCode: number; headers: Record<string, string> }> = [];
  const bodies: string[] = [];
  const response = {
    writeHead(statusCode: number, headers: Record<string, string>) {
      writes.push({ statusCode, headers });
      return this;
    },
    end(body?: string) {
      bodies.push(body ?? "");
      return this;
    }
  } as unknown as ServerResponse;

  return { response, writes, bodies };
}

function adminUser(overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner",
    status: "active",
    password_hash: "hash",
    created_at: "2026-06-27T00:00:00.000Z",
    last_login_at: "2026-06-27T00:01:00.000Z",
    disabled_at: "",
    ...overrides
  };
}

test("admin HTTP helpers parse JSON bodies and preserve empty body defaults", async () => {
  assert.deepEqual(await readAdminRequestJson(requestFromChunks([])), {});
  assert.deepEqual(await readAdminRequestJson(requestFromChunks(["  "])), {});
  assert.deepEqual(await readAdminRequestJson(requestFromChunks(["{\"ok\":", Buffer.from("true}")])) as Record<string, unknown>, {
    ok: true
  });
  assert.equal(jsonBytes({ ok: true }), "{\n  \"ok\": true\n}\n");
});

test("admin JSON reader carries the socket peer address to auth route guards", async () => {
  const request = requestFromChunks([JSON.stringify({ username: "owner" })]);
  (request as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: "127.0.0.1" };
  const body = await readAdminRequestJson(request);
  assert.equal(adminAuthRequestRemoteAddress(body), "127.0.0.1");

  const empty = requestFromChunks([]);
  (empty as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: "192.168.1.9" };
  const value = await readAdminRequestJson(empty);
  assert.equal(adminAuthRequestRemoteAddress(value), "192.168.1.9");
  assert.notEqual(adminAuthRequestRemoteAddress({}), "192.168.1.9");
});

test("admin HTTP helpers write consistent CORS JSON and no-content responses", () => {
  const json = responseRecorder();
  writeAdminJson(json.response, 202, { ok: true });
  assert.equal(json.writes[0]?.statusCode, 202);
  assert.equal(json.writes[0]?.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(json.writes[0]?.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(json.bodies[0], "{\"ok\":true}");

  const noContent = responseRecorder();
  writeAdminNoContent(noContent.response);
  assert.equal(noContent.writes[0]?.statusCode, 204);
  assert.equal(noContent.writes[0]?.headers["Access-Control-Allow-Methods"], "GET,POST,PATCH,DELETE,OPTIONS");
  assert.equal(noContent.bodies[0], "");
});

test("admin HTTP session helpers classify public media routes only for cover GETs", () => {
  assert.equal(isPublicAdminMediaRoute("GET", "/api/admin/source-videos/V000123/cover"), true);
  assert.equal(isPublicAdminMediaRoute("POST", "/api/admin/source-videos/V000123/cover"), false);
  assert.equal(isPublicAdminMediaRoute("GET", "/api/admin/source-videos/V123/cover"), false);
  assert.equal(isPublicAdminMediaRoute("GET", "/api/admin/source-videos/V000123/cover/extra"), false);
});

test("admin HTTP session helper maps disabled auth to system actor", async () => {
  const output = responseRecorder();
  const actor = await requireAdminSession({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      auth_mode: "disabled"
    },
    request: requestFromChunks([]),
    response: output.response,
    now: "2026-06-27T00:00:00.000Z",
    deps: {
      async validate_admin_session() {
        throw new Error("disabled auth should not validate sessions");
      },
      write_json: writeAdminJson
    }
  });

  assert.deepEqual(actor, {
    kind: "system",
    source: "auth-disabled",
    label: "管理端登录已关闭"
  });
  assert.deepEqual(output.writes, []);
});

test("admin HTTP session helper rejects missing and invalid password-auth sessions", async () => {
  const missing = responseRecorder();
  const missingActor = await requireAdminSession({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      auth_mode: "password"
    },
    request: requestFromChunks([]),
    response: missing.response,
    now: "2026-06-27T00:00:00.000Z",
    deps: {
      async validate_admin_session() {
        throw new Error("missing session should not validate");
      },
      write_json: writeAdminJson
    }
  });

  assert.equal(missingActor, null);
  assert.equal(missing.writes[0]?.statusCode, 401);
  const missingBody = JSON.parse(missing.bodies[0] ?? "{}") as Record<string, unknown>;
  assert.equal(missingBody.ok, false);
  assert.equal(missingBody.error_code, "login_required");
  assert.equal(missingBody.message, "请先登录管理端");
  // P2-2: session errors now carry the shared contract fields (legacy fields kept).
  assert.equal(missingBody.code, "AUTH_REQUIRED");
  assert.equal(missingBody.contract_version, "1.0.0");
  assert.equal(missingBody.retryable, "after-fix");

  const invalid = responseRecorder();
  const invalidActor = await requireAdminSession({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      auth_mode: "password"
    },
    request: requestFromChunks([], { "x-mixlab-admin-session-token": "bad-session" }),
    response: invalid.response,
    now: "2026-06-27T00:00:00.000Z",
    deps: {
      async validate_admin_session(libraryRoot, session) {
        assert.equal(libraryRoot, "/tmp/PublicLibrary");
        assert.deepEqual(session, {
          session_token: "bad-session",
          now: "2026-06-27T00:00:00.000Z",
          touch: true
        });
        return { ok: false, reason: "登录凭证无效" };
      },
      write_json: writeAdminJson
    }
  });

  assert.equal(invalidActor, null);
  assert.equal(invalid.writes[0]?.statusCode, 401);
  const invalidBody = JSON.parse(invalid.bodies[0] ?? "{}") as Record<string, unknown>;
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.error_code, "login_required");
  assert.equal(invalidBody.message, "登录凭证无效");
  assert.equal(invalidBody.code, "AUTH_REQUIRED");
  assert.equal(invalidBody.contract_version, "1.0.0");
});

test("admin HTTP session helper projects validated admin users to command actors", async () => {
  const user = adminUser();
  assert.deepEqual(adminCommandActorFromAdminUser(user), {
    kind: "admin-user",
    source: "admin-session",
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner"
  });

  const output = responseRecorder();
  const actor = await requireAdminSession({
    api_input: {
      library_root: "/tmp/PublicLibrary",
      auth_mode: "password"
    },
    request: requestFromChunks([], { authorization: "Bearer good-session" }),
    response: output.response,
    now: "2026-06-27T00:00:00.000Z",
    deps: {
      async validate_admin_session(_libraryRoot, session) {
        assert.equal(session.session_token, "good-session");
        return { ok: true, user };
      },
      write_json: writeAdminJson
    }
  });

  assert.deepEqual(actor, {
    kind: "admin-user",
    source: "admin-session",
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner"
  });
  assert.deepEqual(output.writes, []);
});
