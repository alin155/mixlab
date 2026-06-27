import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  validateAdminSession
} from "../../library-fs/src/index.ts";
import {
  adminCommandSnapshotRoot
} from "./admin-command-snapshot.ts";
import {
  readAdminOperationLog
} from "./admin-operation-log.ts";
import {
  runAdminAuthLoginCommand,
  runAdminAuthLogoutCommand,
  runAdminAuthRegisterCommand
} from "./admin-auth-commands.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-auth-commands-"));
}

async function latestSnapshotManifest(libraryRoot: string): Promise<Record<string, unknown>> {
  const directories = await readdir(adminCommandSnapshotRoot(libraryRoot));
  assert.ok(directories.length > 0);
  return JSON.parse(await readFile(path.join(
    adminCommandSnapshotRoot(libraryRoot),
    directories.sort().at(-1)!,
    "snapshot.json"
  ), "utf8")) as Record<string, unknown>;
}

async function readAdminUserStore(libraryRoot: string): Promise<{
  users: Array<{ password_hash: string }>;
  sessions: Array<{ session_token: string }>;
}> {
  return JSON.parse(await readFile(path.join(
    libraryRoot,
    ".mixlab-library",
    "admin-users",
    "users.json"
  ), "utf8")) as {
    users: Array<{ password_hash: string }>;
    sessions: Array<{ session_token: string }>;
  };
}

test("admin auth register command uses metadata-only audit without credential leakage", async () => {
  const libraryRoot = await makeLibraryRoot();
  const password = "Owner12345";

  const result = await runAdminAuthRegisterCommand({
    library_root: libraryRoot,
    username: "owner",
    password,
    display_name: "Owner",
    now: "2026-06-26T10:00:00.000Z"
  });

  assert.equal(result.user.username, "owner");
  assert.equal(result.session.admin_id, result.user.admin_id);

  const store = await readAdminUserStore(libraryRoot);
  const passwordHash = store.users[0]?.password_hash ?? "";
  const sessionToken = result.session.session_token;
  assert.notEqual(passwordHash, "");
  assert.notEqual(sessionToken, "");

  const snapshot = await latestSnapshotManifest(libraryRoot);
  assert.equal(snapshot.command, "admin-auth-register");
  assert.equal(snapshot.snapshot_kind, "metadata-only");
  assert.deepEqual(snapshot.file_summary, {
    requested_file_count: 0,
    captured_file_count: 0,
    missing_file_count: 0,
    skipped_file_count: 0,
    failed_file_count: 0
  });

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:00:01.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["succeeded", "started"]);
  assert.equal(log.events[0]?.area, "system");
  assert.equal(log.events[0]?.action, "admin-auth-register");
  assert.deepEqual(log.events[0]?.details.actor, {
    kind: "system",
    source: "system-task",
    label: "管理端认证"
  });

  const combinedAuditText = JSON.stringify({ snapshot, events: log.events });
  assert.equal(combinedAuditText.includes(password), false);
  assert.equal(combinedAuditText.includes(passwordHash), false);
  assert.equal(combinedAuditText.includes(sessionToken), false);
  assert.equal(combinedAuditText.includes("password_hash"), false);
  assert.equal(combinedAuditText.includes("session_token"), false);
});

test("admin auth login and logout commands preserve auth behavior without token leakage", async () => {
  const libraryRoot = await makeLibraryRoot();
  const registered = await runAdminAuthRegisterCommand({
    library_root: libraryRoot,
    username: "owner",
    password: "Owner12345",
    display_name: "Owner",
    now: "2026-06-26T10:00:00.000Z"
  });

  const failedLogin = await runAdminAuthLoginCommand({
    library_root: libraryRoot,
    username: "owner",
    password: "wrong-password",
    now: "2026-06-26T10:01:00.000Z"
  });
  assert.deepEqual(failedLogin, {
    ok: false,
    reason: "用户名或密码错误"
  });

  const login = await runAdminAuthLoginCommand({
    library_root: libraryRoot,
    username: "OWNER",
    password: "Owner12345",
    now: "2026-06-26T10:02:00.000Z"
  });
  assert.equal(login.ok, true);
  assert.equal(login.ok ? login.user.admin_id : "", registered.user.admin_id);
  const loginToken = login.ok ? login.session.session_token : "";
  assert.notEqual(loginToken, registered.session.session_token);

  assert.deepEqual(await runAdminAuthLogoutCommand({
    library_root: libraryRoot,
    session_token: loginToken,
    now: "2026-06-26T10:03:00.000Z"
  }), { removed: true });
  assert.deepEqual(await validateAdminSession(libraryRoot, {
    session_token: loginToken,
    now: "2026-06-26T10:03:01.000Z"
  }), { ok: false, reason: "登录凭证无效" });

  const store = await readAdminUserStore(libraryRoot);
  const passwordHash = store.users[0]?.password_hash ?? "";
  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-06-26T10:03:02.000Z",
    limit: 20
  });
  const succeededActions = log.events
    .filter((event) => event.event_type === "succeeded")
    .map((event) => event.action);

  assert.deepEqual(succeededActions.slice(0, 4), [
    "admin-auth-logout",
    "admin-auth-login",
    "admin-auth-login",
    "admin-auth-register"
  ]);

  const operationLogText = JSON.stringify(log.events);
  assert.equal(operationLogText.includes("Owner12345"), false);
  assert.equal(operationLogText.includes(passwordHash), false);
  assert.equal(operationLogText.includes(registered.session.session_token), false);
  assert.equal(operationLogText.includes(loginToken), false);
  assert.equal(operationLogText.includes("password_hash"), false);
  assert.equal(operationLogText.includes("session_token"), false);
});
