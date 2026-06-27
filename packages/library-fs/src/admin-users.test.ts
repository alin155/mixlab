import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  getAdminAuthBootstrapStatus,
  loginAdmin,
  logoutAdminSession,
  registerFirstAdmin,
  validateAdminSession
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
