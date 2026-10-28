import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { accountDirectory } from "./cutter-account-lock.ts";
import {
  applyCutterAccountMigration,
  inspectCutterAccountMigration,
  rollbackCutterAccountMigration
} from "./cutter-account-migration.ts";
import {
  approveCutterUser,
  registerCutterAccount
} from "./cutter-users.ts";

async function fixture(t: TestContext): Promise<{ root: string; legacy: string; state: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-account-migration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, legacy: path.join(root, "legacy"), state: path.join(root, "state") };
}

async function seedLegacy(legacy: string): Promise<{ userId: string }> {
  const timestamp = new Date().toISOString();
  const user = await registerCutterAccount(legacy, {
    username: "legacy-user",
    password: "Fixture12345",
    device_id: "legacy-device",
    device_name: "旧设备",
    now: timestamp
  });
  await approveCutterUser(legacy, { user_id: user.user_id, now: timestamp });
  return { userId: user.user_id };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test("dry-run reports the legacy store without writing or acquiring the service state", async (t) => {
  const { legacy, state } = await fixture(t);
  const { userId } = await seedLegacy(legacy);
  const plan = await inspectCutterAccountMigration({ legacy_root: legacy, state_root: state });
  assert.equal(plan.users_count, 1);
  assert.equal(plan.sessions_count, 1);
  assert.equal(plan.entitlements_count, 0);
  assert.match(plan.source_digest, /^[a-f0-9]{64}$/);
  assert.equal(plan.state_ready, false);
  assert.equal(plan.already_applied, false);
  assert.deepEqual(plan.blockers, []);
  assert.equal(await exists(state), false);
  assert.ok(userId);
});

test("apply is idempotent and refuses without writer-stop confirmation", async (t) => {
  const { legacy, state } = await fixture(t);
  await seedLegacy(legacy);
  const legacyUsersRaw = await readFile(path.join(accountDirectory(legacy), "users.json"), "utf8");

  await assert.rejects(
    () => applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: false }),
    /写入者已停止/
  );
  assert.equal(await exists(state), false);

  const applied = await applyCutterAccountMigration({
    legacy_root: legacy,
    state_root: state,
    legacy_writers_stopped: true
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.users_count, 1);
  assert.equal(
    await readFile(path.join(accountDirectory(state), "users.json"), "utf8"),
    legacyUsersRaw
  );
  const backupUsers = await readFile(path.join(applied.backup_dir, "users.json"), "utf8");
  assert.equal(backupUsers, legacyUsersRaw);

  const second = await applyCutterAccountMigration({
    legacy_root: legacy,
    state_root: state,
    legacy_writers_stopped: true
  });
  assert.equal(second.applied, false);
  assert.equal(second.reason, "already_applied");

  const plan = await inspectCutterAccountMigration({ legacy_root: legacy, state_root: state });
  assert.equal(plan.already_applied, true);
  assert.deepEqual(plan.blockers, []);
});

test("apply refuses changed legacy data after an earlier import", async (t) => {
  const { legacy, state } = await fixture(t);
  await seedLegacy(legacy);
  await applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true });

  await registerCutterAccount(legacy, {
    username: "late-writer",
    password: "Fixture12345",
    device_id: "late-device",
    device_name: "迟到设备",
    now: new Date().toISOString()
  });
  await assert.rejects(
    () => applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true }),
    /另一版本账号数据/
  );
  const plan = await inspectCutterAccountMigration({ legacy_root: legacy, state_root: state });
  assert.equal(plan.already_applied, false);
  assert.equal(plan.imported_source_digest !== plan.source_digest, true);
});

test("apply rejects nested state roots and unrelated target data", async (t) => {
  const { legacy, state } = await fixture(t);
  await seedLegacy(legacy);
  await assert.rejects(
    () => applyCutterAccountMigration({
      legacy_root: legacy,
      state_root: path.join(legacy, "nested-state"),
      legacy_writers_stopped: true
    }),
    /互相独立|互相包含/
  );

  await mkdir(accountDirectory(state), { recursive: true });
  await writeFile(path.join(accountDirectory(state), "users.json"), JSON.stringify({
    schema_version: "1.0",
    users: [],
    sessions: []
  }), "utf8");
  await assert.rejects(
    () => applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true }),
    /目标账号目录已有不同数据|已有不同账号数据/
  );
});

test("rollback restores the backed-up legacy store and is idempotent", async (t) => {
  const { legacy, state } = await fixture(t);
  await seedLegacy(legacy);
  const originalRaw = await readFile(path.join(accountDirectory(legacy), "users.json"), "utf8");
  await applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true });

  await assert.rejects(
    () => rollbackCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: false }),
    /写入者已停止/
  );

  const rollback = await rollbackCutterAccountMigration({
    legacy_root: legacy,
    state_root: state,
    legacy_writers_stopped: true
  });
  assert.equal(rollback.rolled_back, true);
  assert.equal(rollback.reason, "restored");
  assert.deepEqual(rollback.restored_files, ["users.json"]);
  assert.equal(await readFile(path.join(accountDirectory(legacy), "users.json"), "utf8"), originalRaw);

  const again = await rollbackCutterAccountMigration({
    legacy_root: legacy,
    state_root: state,
    legacy_writers_stopped: true
  });
  assert.equal(again.rolled_back, false);
  assert.equal(again.reason, "already_rolled_back");
});

test("rollback refuses legacy divergence and a running account service", async (t) => {
  const { legacy, state } = await fixture(t);
  await seedLegacy(legacy);
  await applyCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true });

  const { acquireCutterAccountLock } = await import("./cutter-account-lock.ts");
  const serviceLock = await acquireCutterAccountLock(state, { name: "service" });
  try {
    await assert.rejects(
      () => rollbackCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true }),
      /仍在运行|禁止回滚/
    );
  } finally {
    await serviceLock.release();
  }

  await registerCutterAccount(legacy, {
    username: "post-import-writer",
    password: "Fixture12345",
    device_id: "late-device",
    device_name: "迟到设备",
    now: new Date().toISOString()
  });
  await assert.rejects(
    () => rollbackCutterAccountMigration({ legacy_root: legacy, state_root: state, legacy_writers_stopped: true }),
    /发生了变化|回滚冲突/
  );
});
