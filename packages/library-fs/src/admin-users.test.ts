import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  getAdminAuthBootstrapStatus,
  isAdminSessionExpired,
  limitAdminSessionsPerUser,
  loginAdmin,
  logoutAdminSession,
  pruneExpiredAdminSessions,
  readAdminSessionPolicy,
  registerFirstAdmin,
  validateAdminSession,
  type AdminSessionRecord
} from "./admin-users.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-users-"));
}

function storePath(root: string): string {
  return path.join(root, ".mixlab-library", "admin-users", "users.json");
}

async function writeRawStore(root: string, json: string): Promise<void> {
  await mkdir(path.dirname(storePath(root)), { recursive: true });
  await writeFile(storePath(root), json, "utf8");
}

test("first admin registration creates an owner session and stores a password hash", async () => {
  const root = await makeRoot();

  assert.deepEqual(await getAdminAuthBootstrapStatus(root), {
    has_admin: false,
    registration_open: true
  });

  const registered = await registerFirstAdmin(root, {
    username: "Admin",
    password: "Admin12345",
    display_name: "管理员",
    now: "2026-06-18T10:00:00.000Z"
  });

  assert.equal(registered.user.admin_id, "AU000001");
  assert.equal(registered.user.username, "Admin");
  assert.equal(registered.user.display_name, "管理员");
  assert.equal(registered.user.role, "owner");
  assert.equal(registered.session.admin_id, "AU000001");
  assert.notEqual(registered.user.password_hash, "Admin12345");

  const raw = await readFile(storePath(root), "utf8");
  assert.equal(raw.includes("Admin12345"), false);

  assert.deepEqual(await getAdminAuthBootstrapStatus(root), {
    has_admin: true,
    registration_open: false
  });
});

test("admin login validates password and session logout revokes access", async () => {
  const root = await makeRoot();
  await registerFirstAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:00:00.000Z"
  });

  const failed = await loginAdmin(root, {
    username: "admin",
    password: "wrong-password",
    now: "2026-06-18T10:01:00.000Z"
  });
  assert.deepEqual(failed, {
    ok: false,
    reason: "用户名或密码错误"
  });

  const login = await loginAdmin(root, {
    username: "ADMIN",
    password: "Admin12345",
    now: "2026-06-18T10:02:00.000Z"
  });
  assert.equal(login.ok, true);
  assert.equal(login.ok ? login.user.username : "", "admin");

  const token = login.ok ? login.session.session_token : "";
  const valid = await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:03:00.000Z"
  });
  assert.equal(valid.ok, true);
  const storeAfterReadOnlyValidation = JSON.parse(await readFile(storePath(root), "utf8")) as {
    users: Array<{ username: string; last_login_at: string }>;
    sessions: Array<{ session_token: string; last_seen_at: string }>;
  };
  assert.equal(
    storeAfterReadOnlyValidation.sessions.find((item) => item.session_token === token)?.last_seen_at,
    "2026-06-18T10:02:00.000Z"
  );
  assert.equal(
    storeAfterReadOnlyValidation.users.find((item) => item.username === "admin")?.last_login_at,
    "2026-06-18T10:02:00.000Z"
  );

  const touched = await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:05:00.000Z",
    touch: true
  });
  assert.equal(touched.ok, true);
  const storeAfterTouchedValidation = JSON.parse(await readFile(storePath(root), "utf8")) as {
    users: Array<{ username: string; last_login_at: string }>;
    sessions: Array<{ session_token: string; last_seen_at: string }>;
  };
  assert.equal(
    storeAfterTouchedValidation.sessions.find((item) => item.session_token === token)?.last_seen_at,
    "2026-06-18T10:05:00.000Z"
  );
  assert.equal(
    storeAfterTouchedValidation.users.find((item) => item.username === "admin")?.last_login_at,
    "2026-06-18T10:05:00.000Z"
  );

  assert.deepEqual(await logoutAdminSession(root, { session_token: token }), {
    removed: true
  });
  assert.deepEqual(await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:04:00.000Z"
  }), {
    ok: false,
    reason: "登录凭证无效"
  });
});

test("malformed admin user JSON throws Chinese error and does not reset store", async () => {
  const root = await makeRoot();
  const malformed = "{ 这不是 json";
  await writeRawStore(root, malformed);

  await assert.rejects(
    () => getAdminAuthBootstrapStatus(root),
    /管理员用户存储文件格式错误/
  );
  await assert.rejects(
    () => registerFirstAdmin(root, {
      username: "admin",
      password: "Admin12345",
      now: "2026-06-18T10:00:00.000Z"
    }),
    /管理员用户存储文件格式错误/
  );
  assert.equal(await readFile(storePath(root), "utf8"), malformed);
});

test("transient malformed admin user store reads recover without resetting data", async () => {
  const root = await makeRoot();
  const validStore = `${JSON.stringify({
    schema_version: "1.0",
    users: [
      {
        admin_id: "AU000001",
        username: "admin",
        display_name: "管理员",
        role: "owner",
        status: "active",
        password_hash: "test-hash",
        created_at: "2026-06-18T10:00:00.000Z",
        last_login_at: "",
        disabled_at: ""
      }
    ],
    sessions: []
  })}\n`;

  await writeRawStore(root, "{ 这不是 json");
  const rewrite = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      writeRawStore(root, validStore).then(resolve, reject);
    }, 30);
  });

  const bootstrap = await getAdminAuthBootstrapStatus(root);
  await rewrite;

  assert.deepEqual(bootstrap, {
    has_admin: true,
    registration_open: false
  });
  assert.equal(await readFile(storePath(root), "utf8"), validStore);
});

test("admin user store tolerates trailing null padding after a complete JSON object", async () => {
  const root = await makeRoot();
  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [],
      sessions: []
    })}\n\0\0`
  );

  assert.deepEqual(await getAdminAuthBootstrapStatus(root), {
    has_admin: false,
    registration_open: true
  });
});

function storedSessions(raw: string): AdminSessionRecord[] {
  return (JSON.parse(raw) as { sessions: AdminSessionRecord[] }).sessions;
}

test("SEC-01 sessions carry expires_at, expire with an explicit reason, and sliding touch renews", async () => {
  const root = await makeRoot();
  const registered = await registerFirstAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:00:00.000Z",
    session_policy: { ttl_ms: 60_000 }
  });
  assert.equal(registered.session.expires_at, "2026-06-18T10:01:00.000Z");

  assert.equal((await validateAdminSession(root, {
    session_token: registered.session.session_token,
    now: "2026-06-18T10:00:59.999Z",
    session_policy: { ttl_ms: 60_000 }
  })).ok, true);

  assert.deepEqual(await validateAdminSession(root, {
    session_token: registered.session.session_token,
    now: "2026-06-18T10:01:00.000Z",
    session_policy: { ttl_ms: 60_000 }
  }), {
    ok: false,
    reason: "登录已过期，请重新登录"
  });

  const login = await loginAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:02:00.000Z",
    session_policy: { ttl_ms: 600_000 }
  });
  if (!login.ok) {
    throw new Error(login.reason);
  }
  const token = login.session.session_token;
  assert.equal(login.session.expires_at, "2026-06-18T10:12:00.000Z");

  // Read-only validation must not extend the session.
  assert.equal((await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:03:00.000Z",
    session_policy: { ttl_ms: 600_000 }
  })).ok, true);
  const afterReadOnly = storedSessions(await readFile(storePath(root), "utf8")).find(
    (session) => session.session_token === token
  )!;
  assert.equal(afterReadOnly.last_seen_at, "2026-06-18T10:02:00.000Z");
  assert.equal(afterReadOnly.expires_at, "2026-06-18T10:12:00.000Z");

  // Sliding touch renews from the touch time, so the original expiry can pass safely.
  assert.equal((await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:04:30.000Z",
    touch: true,
    session_policy: { ttl_ms: 600_000 }
  })).ok, true);
  const afterTouch = storedSessions(await readFile(storePath(root), "utf8")).find(
    (session) => session.session_token === token
  )!;
  assert.equal(afterTouch.last_seen_at, "2026-06-18T10:04:30.000Z");
  assert.equal(afterTouch.expires_at, "2026-06-18T10:14:30.000Z");
  assert.equal((await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:13:00.000Z",
    session_policy: { ttl_ms: 600_000 }
  })).ok, true);
});

test("SEC-01 sliding touch throttle applies to authenticated requests", async () => {
  const root = await makeRoot();
  const registered = await registerFirstAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:00:00.000Z",
    session_policy: { ttl_ms: 3_600_000, touch_interval_ms: 60_000 }
  });
  const token = registered.session.session_token;
  const before = await readFile(storePath(root), "utf8");

  assert.equal((await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:00:10.000Z",
    touch: true,
    session_policy: { ttl_ms: 3_600_000, touch_interval_ms: 60_000 }
  })).ok, true);
  assert.equal(await readFile(storePath(root), "utf8"), before);

  assert.equal((await validateAdminSession(root, {
    session_token: token,
    now: "2026-06-18T10:01:10.000Z",
    touch: true,
    session_policy: { ttl_ms: 3_600_000, touch_interval_ms: 60_000 }
  })).ok, true);
  const stored = storedSessions(await readFile(storePath(root), "utf8")).find(
    (session) => session.session_token === token
  )!;
  assert.equal(stored.last_seen_at, "2026-06-18T10:01:10.000Z");
  assert.equal(stored.expires_at, "2026-06-18T11:01:10.000Z");
});

test("SEC-01 per-user session cap keeps the newest sessions and drops the oldest", async () => {
  const root = await makeRoot();
  const policy = { ttl_ms: 3_600_000, max_sessions_per_user: 2, touch_interval_ms: 60_000 };
  const registered = await registerFirstAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:00:00.000Z",
    session_policy: policy
  });
  const firstToken = registered.session.session_token;

  const second = await loginAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:01:00.000Z",
    session_policy: policy
  });
  const third = await loginAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:02:00.000Z",
    session_policy: policy
  });
  if (!second.ok || !third.ok) {
    throw new Error("logins should succeed");
  }

  const sessions = storedSessions(await readFile(storePath(root), "utf8"));
  assert.equal(sessions.length, 2);
  assert.equal(sessions.some((session) => session.session_token === firstToken), false);
  assert.equal(sessions.some((session) => session.session_token === second.session.session_token), true);
  assert.equal(sessions.some((session) => session.session_token === third.session.session_token), true);
  assert.equal((await validateAdminSession(root, { session_token: firstToken, now: "2026-06-18T10:03:00.000Z" })).ok, false);
});

test("SEC-01 legacy sessions without expires_at are bounded by created_at and backfilled on touch", async () => {
  const root = await makeRoot();
  const registered = await registerFirstAdmin(root, {
    username: "admin",
    password: "Admin12345",
    now: "2026-06-18T10:00:00.000Z"
  });
  const raw = JSON.parse(await readFile(storePath(root), "utf8")) as {
    users: unknown[];
    sessions: Array<Record<string, unknown>>;
  };
  const policy = { ttl_ms: 12 * 3_600_000 };

  raw.sessions[0] = {
    admin_id: "AU000001",
    session_token: registered.session.session_token,
    created_at: "2026-06-17T21:00:00.000Z",
    last_seen_at: "2026-06-17T21:00:00.000Z"
  };
  await writeRawStore(root, JSON.stringify(raw));
  assert.deepEqual(await validateAdminSession(root, {
    session_token: registered.session.session_token,
    now: "2026-06-18T10:00:00.000Z",
    session_policy: policy
  }), {
    ok: false,
    reason: "登录已过期，请重新登录"
  });

  raw.sessions[0] = {
    admin_id: "AU000001",
    session_token: registered.session.session_token,
    created_at: "2026-06-18T01:00:00.000Z",
    last_seen_at: "2026-06-18T01:00:00.000Z"
  };
  await writeRawStore(root, JSON.stringify(raw));
  assert.equal((await validateAdminSession(root, {
    session_token: registered.session.session_token,
    now: "2026-06-18T10:00:00.000Z",
    session_policy: policy
  })).ok, true);
  assert.equal((await validateAdminSession(root, {
    session_token: registered.session.session_token,
    now: "2026-06-18T10:01:00.000Z",
    touch: true,
    session_policy: policy
  })).ok, true);
  const backfilled = storedSessions(await readFile(storePath(root), "utf8")).find(
    (session) => session.session_token === registered.session.session_token
  )!;
  assert.equal(backfilled.expires_at, "2026-06-18T22:01:00.000Z");

  raw.sessions[0] = {
    admin_id: "AU000001",
    session_token: registered.session.session_token,
    created_at: "not-a-date",
    last_seen_at: "not-a-date"
  };
  await writeRawStore(root, JSON.stringify(raw));
  assert.equal((await validateAdminSession(root, {
    session_token: registered.session.session_token,
    now: "2026-06-18T10:00:00.000Z",
    session_policy: policy
  })).ok, false);
});

test("SEC-01 cleanup, cap and policy helpers are pure and env-configurable", () => {
  const ttl = 60_000;
  const sessions: AdminSessionRecord[] = [
    { admin_id: "AU000001", session_token: "old", created_at: "2026-06-18T09:00:00.000Z", last_seen_at: "2026-06-18T09:00:00.000Z" },
    { admin_id: "AU000001", session_token: "fresh", created_at: "2026-06-18T10:00:00.000Z", last_seen_at: "2026-06-18T10:00:00.000Z", expires_at: "2026-06-18T10:01:00.000Z" },
    { admin_id: "AU000002", session_token: "other", created_at: "2026-06-18T10:00:30.000Z", last_seen_at: "2026-06-18T10:00:30.000Z" }
  ];
  const pruned = pruneExpiredAdminSessions(sessions, Date.parse("2026-06-18T10:00:30.000Z"), ttl);
  assert.deepEqual(pruned.map((session) => session.session_token), ["fresh", "other"]);
  assert.equal(sessions.length, 3);
  assert.equal(isAdminSessionExpired(sessions[0]!, Date.parse("2026-06-18T10:00:30.000Z"), ttl), true);

  const capped = limitAdminSessionsPerUser([
    ...sessions,
    { admin_id: "AU000002", session_token: "other-new", created_at: "2026-06-18T10:01:30.000Z", last_seen_at: "2026-06-18T10:01:30.000Z" }
  ], "AU000002", 1);
  assert.deepEqual(capped.map((session) => session.session_token), ["old", "fresh", "other-new"]);

  assert.deepEqual(readAdminSessionPolicy({} as NodeJS.ProcessEnv), {
    ttl_ms: 720 * 60_000,
    max_sessions_per_user: 10,
    touch_interval_ms: 60_000
  });
  assert.deepEqual(readAdminSessionPolicy({
    MIXLAB_ADMIN_SESSION_TTL_MINUTES: "30",
    MIXLAB_ADMIN_MAX_SESSIONS_PER_USER: "3",
    MIXLAB_ADMIN_SESSION_TOUCH_INTERVAL_SECONDS: "0"
  } as NodeJS.ProcessEnv), {
    ttl_ms: 30 * 60_000,
    max_sessions_per_user: 3,
    touch_interval_ms: 0
  });
  assert.deepEqual(readAdminSessionPolicy({
    MIXLAB_ADMIN_SESSION_TTL_MINUTES: "0",
    MIXLAB_ADMIN_MAX_SESSIONS_PER_USER: "not-a-number"
  } as NodeJS.ProcessEnv), {
    ttl_ms: 720 * 60_000,
    max_sessions_per_user: 10,
    touch_interval_ms: 60_000
  });
});
