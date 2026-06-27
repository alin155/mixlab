import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createCutterLoginApplication
} from "../../library-fs/src/index.ts";
import {
  adminCommandSnapshotRoot
} from "./admin-command-snapshot.ts";
import {
  readAdminOperationLog
} from "./admin-operation-log.ts";
import {
  runAdminApproveCutterUserCommand,
  runAdminDisableCutterUserCommand,
  runAdminResetCutterUserPasswordCommand
} from "./admin-cutter-user-commands.ts";

async function makeLibraryRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-cutter-user-commands-"));
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

test("approve cutter user command runs under command runtime with actor and store snapshot", async () => {
  const libraryRoot = await makeLibraryRoot();
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "zhangsan",
    device_id: "device-a",
    device_name: "剪辑工作站",
    now: "2026-05-01T10:00:00.000Z"
  });

  const result = await runAdminApproveCutterUserCommand({
    library_root: libraryRoot,
    user_id: application.user_id,
    now: "2026-05-02T12:00:00.000Z",
    actor: {
      kind: "admin-user",
      source: "admin-session",
      admin_id: "AU000001",
      username: "owner",
      display_name: "Owner",
      role: "owner"
    }
  });

  assert.equal(result.user.status, "approved");
  assert.equal(result.session.user_id, application.user_id);

  const snapshot = await latestSnapshotManifest(libraryRoot);
  assert.equal(snapshot.command, "cutter-user-approve");
  assert.equal(snapshot.snapshot_kind, "file-capture");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-05-02T12:00:01.000Z",
    limit: 10
  });
  assert.deepEqual(log.events.map((event) => event.event_type), ["succeeded", "started"]);
  assert.equal(log.events[0]?.area, "users");
  assert.equal(log.events[0]?.action, "cutter-user-approve");
  assert.deepEqual(log.events[0]?.details.actor, {
    kind: "admin-user",
    source: "admin-session",
    admin_id: "AU000001",
    username: "owner",
    display_name: "Owner",
    role: "owner"
  });
  assert.equal((log.events[0]?.details.command_snapshot as { created?: boolean })?.created, true);
  assert.equal(JSON.stringify(log.events[0]?.details).includes(result.session.session_token), false);
});

test("disable and password reset cutter user commands audit the cutter user store", async () => {
  const libraryRoot = await makeLibraryRoot();
  const application = await createCutterLoginApplication(libraryRoot, {
    username: "lisi",
    device_id: "device-a",
    device_name: "剪辑工作站",
    now: "2026-05-01T10:00:00.000Z"
  });
  await runAdminApproveCutterUserCommand({
    library_root: libraryRoot,
    user_id: application.user_id,
    now: "2026-05-02T12:00:00.000Z"
  });

  const reset = await runAdminResetCutterUserPasswordCommand({
    library_root: libraryRoot,
    user_id: application.user_id,
    new_password: "Cutter67890",
    now: "2026-05-02T12:05:00.000Z"
  });
  assert.equal(reset.user_id, application.user_id);

  const disabled = await runAdminDisableCutterUserCommand({
    library_root: libraryRoot,
    user_id: application.user_id,
    now: "2026-05-02T12:10:00.000Z"
  });
  assert.equal(disabled.status, "disabled");

  const log = await readAdminOperationLog({
    library_root: libraryRoot,
    generated_at: "2026-05-02T12:11:00.000Z",
    limit: 20
  });
  const succeededActions = log.events
    .filter((event) => event.event_type === "succeeded")
    .map((event) => event.action);

  assert.deepEqual(succeededActions.slice(0, 3), [
    "cutter-user-disable",
    "cutter-user-password-reset",
    "cutter-user-approve"
  ]);
  assert.equal(log.events.every((event) => event.area === "users"), true);
  assert.equal(log.events.every((event) => event.details.holder && event.details.actor), true);
});
