import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveCutterUser,
  createCutterLoginApplication,
  disableCutterUser,
  listCutterUsers,
  validateCutterSession
} from "./cutter-users.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-cutter-users-"));
}

test("creates pending login application and approves it into a reusable session", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小王",
    device_id: "device-1",
    device_name: "Allen Mac",
    now: "2026-05-02T10:00:00.000Z"
  });

  assert.equal(application.status, "pending");
  assert.equal((await listCutterUsers(root)).users.length, 1);

  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.session.user_id, application.user_id);

  const session = await validateCutterSession(root, {
    device_id: "device-1",
    session_token: approved.session.session_token,
    now: "2026-05-02T10:02:00.000Z"
  });

  assert.equal(session.ok, true);
  assert.equal(session.user?.username, "小王");
});

test("disabled users cannot keep using existing sessions", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小李",
    device_id: "device-2",
    device_name: "Windows Workstation",
    now: "2026-05-02T10:00:00.000Z"
  });
  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  await disableCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:03:00.000Z"
  });

  const session = await validateCutterSession(root, {
    device_id: "device-2",
    session_token: approved.session.session_token,
    now: "2026-05-02T10:04:00.000Z"
  });

  assert.equal(session.ok, false);
  assert.equal(session.reason, "用户已停用");
});
