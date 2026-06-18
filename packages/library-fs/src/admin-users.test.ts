import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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

  const raw = await readFile(
    path.join(root, ".mixlab-library", "admin-users", "users.json"),
    "utf8"
  );
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
