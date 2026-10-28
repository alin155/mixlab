import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  accountDirectory,
  acquireCutterAccountLock,
  checkCutterAccountLockOwnerDead,
  createCutterAccountLockRuntime,
  inspectCutterAccountLock,
  readLocalCutterAccountBootIdentity,
  recoverCutterAccountLock,
  type CutterAccountLockRuntime
} from "./cutter-account-lock.ts";

async function fixture(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mixlab-cutter-account-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  const pid = child.pid ?? 0;
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  assert.ok(pid > 0);
  return pid;
}

function windowsRuntime(overrides: Partial<CutterAccountLockRuntime> = {}): CutterAccountLockRuntime {
  return createCutterAccountLockRuntime({
    platform: "win32",
    hostname: "WIN-FINGERPRINT-TEST",
    nowMs: () => 1_700_000_000_000,
    osUptimeMs: () => 500_000,
    execFile: async (command) => {
      if (command === "reg") {
        return {
          stdout:
            "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    11111111-2222-3333-4444-555555555555\n"
        };
      }
      if (command === "powershell") {
        return { stdout: "133400000000000000\n" };
      }
      throw new Error("unexpected command " + command);
    },
    ...overrides
  });
}

async function writeManualLock(root: string, owner: Record<string, unknown>): Promise<void> {
  const dir = path.join(accountDirectory(root), ".users-write.lock");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "owner.json"), JSON.stringify(owner), "utf8");
}

test("windows boot identity uses MachineGuid + boot time and stays stable per boot", async () => {
  const first = await readLocalCutterAccountBootIdentity(windowsRuntime());
  const second = await readLocalCutterAccountBootIdentity(windowsRuntime());
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.boot_identity_source, "windows_machine_guid_boot_time");
  assert.equal(first.boot_id, second.boot_id);
  assert.match(first.boot_id, /^[a-f0-9]{64}$/);

  const otherMachine = await readLocalCutterAccountBootIdentity(windowsRuntime({
    execFile: async (command) => command === "reg"
      ? { stdout: "MachineGuid    REG_SZ    aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }
      : { stdout: "133400000000000000" }
  }));
  assert.ok(otherMachine);
  assert.notEqual(otherMachine.boot_id, first.boot_id);
});

test("windows boot identity falls back to a stable uptime bucket and fails closed without MachineGuid", async () => {
  const runtime = windowsRuntime({
    execFile: async (command) => {
      if (command === "reg") {
        return { stdout: "MachineGuid    REG_SZ    11111111-2222-3333-4444-555555555555" };
      }
      throw new Error("powershell unavailable");
    }
  });
  const first = await readLocalCutterAccountBootIdentity(runtime);
  assert.ok(first);
  assert.equal(first.boot_identity_source, "windows_machine_guid_uptime");

  const laterSlightly = await readLocalCutterAccountBootIdentity(
    windowsRuntime({
      nowMs: () => 1_700_000_100_000,
      osUptimeMs: () => 600_000,
      execFile: async (command) => {
        if (command === "reg") {
          return { stdout: "MachineGuid    REG_SZ    11111111-2222-3333-4444-555555555555" };
        }
        throw new Error("powershell unavailable");
      }
    })
  );
  assert.ok(laterSlightly);
  assert.equal(laterSlightly.boot_id, first.boot_id);

  const unsupported = await readLocalCutterAccountBootIdentity(
    windowsRuntime({
      execFile: async () => {
        throw new Error("reg missing");
      }
    })
  );
  assert.equal(unsupported, null);
});

test("dead windows owner is recovered only with matching host + boot fingerprint", async (t) => {
  const root = await fixture(t);
  const runtime = windowsRuntime();
  const identity = await readLocalCutterAccountBootIdentity(runtime);
  assert.ok(identity);
  const pid = await deadPid();
  await writeManualLock(root, {
    version: 2,
    host: "WIN-FINGERPRINT-TEST",
    boot_id: identity.boot_id,
    boot_identity_source: identity.boot_identity_source,
    pid,
    token: "fixture-token"
  });

  const inspected = await inspectCutterAccountLock(root, "users", runtime);
  assert.ok(inspected.exists);
  const recovered = await recoverCutterAccountLock(
    root,
    { fingerprint: inspected.fingerprint },
    "users",
    runtime
  );
  assert.equal(recovered.recovered, true);
  assert.ok(recovered.quarantine.includes(".users-write.lock.recovered-"));
  assert.equal((await stat(recovered.quarantine)).isDirectory(), true);
  assert.equal((await inspectCutterAccountLock(root, "users", runtime)).exists, false);
});

test("windows owner recovery refuses foreign boot, live pid and unsupported identity", async (t) => {
  const root = await fixture(t);
  const runtime = windowsRuntime();
  const identity = await readLocalCutterAccountBootIdentity(runtime);
  assert.ok(identity);

  await writeManualLock(root, {
    version: 2,
    host: "WIN-FINGERPRINT-TEST",
    boot_id: "f".repeat(64),
    boot_identity_source: "windows_machine_guid_boot_time",
    pid: await deadPid(),
    token: "fixture-token"
  });
  const foreign = await inspectCutterAccountLock(root, "users", runtime);
  assert.ok(foreign.exists);
  if (foreign.exists) {
    await assert.rejects(
      () => recoverCutterAccountLock(root, { fingerprint: foreign.fingerprint }, "users", runtime),
      /无法证明/
    );
  }
  await rm(accountDirectory(root), { recursive: true, force: true });

  await writeManualLock(root, {
    version: 2,
    host: "WIN-FINGERPRINT-TEST",
    boot_id: identity.boot_id,
    boot_identity_source: identity.boot_identity_source,
    pid: process.pid,
    token: "fixture-token"
  });
  const live = await inspectCutterAccountLock(root, "users", runtime);
  assert.ok(live.exists);
  if (live.exists) {
    await assert.rejects(
      () => recoverCutterAccountLock(root, { fingerprint: live.fingerprint }, "users", runtime),
      /无法证明/
    );
  }
  await rm(accountDirectory(root), { recursive: true, force: true });

  const unsupportedRuntime = windowsRuntime({
    execFile: async () => {
      throw new Error("reg missing");
    }
  });
  await writeManualLock(root, {
    version: 2,
    host: "WIN-FINGERPRINT-TEST",
    boot_id: identity.boot_id,
    boot_identity_source: identity.boot_identity_source,
    pid: await deadPid(),
    token: "fixture-token"
  });
  const unsupported = await inspectCutterAccountLock(root, "users", unsupportedRuntime);
  assert.ok(unsupported.exists);
  if (unsupported.exists) {
    assert.equal(unsupported.boot_identity_supported, false);
    await assert.rejects(
      () => recoverCutterAccountLock(root, { fingerprint: unsupported.fingerprint }, "users", unsupportedRuntime),
      /启动身份/
    );
  }
});

test("legacy ownerless locks and v1 owners require explicit offline confirmation", async (t) => {
  const root = await fixture(t);
  const runtime = windowsRuntime();
  const dir = path.join(accountDirectory(root), ".users-write.lock");
  await mkdir(dir, { recursive: true });
  const legacy = await inspectCutterAccountLock(root, "users", runtime);
  assert.ok(legacy.exists);
  if (legacy.exists) {
    assert.equal(legacy.kind, "legacy");
    await assert.rejects(
      () => recoverCutterAccountLock(root, { fingerprint: legacy.fingerprint }, "users", runtime),
      /旧写入者/
    );
    const recovered = await recoverCutterAccountLock(
      root,
      { fingerprint: legacy.fingerprint, legacy_writers_stopped: true },
      "users",
      runtime
    );
    assert.equal(recovered.recovered, true);
  }
});

test("acquire/release and contention use the shared lock directory", async (t) => {
  const root = await fixture(t);
  const runtime = windowsRuntime();
  const handle = await acquireCutterAccountLock(root, {
    runtime,
    holder: "fixture",
    reason: "unit-test",
    now: "2026-10-27T00:00:00.000Z"
  });
  assert.equal(handle.owner.host, "WIN-FINGERPRINT-TEST");
  assert.match(handle.owner.boot_id, /^[a-f0-9]{64}$/);
  assert.equal(handle.owner.boot_identity_source, "windows_machine_guid_boot_time");

  const inspection = await inspectCutterAccountLock(root, "users", runtime);
  assert.ok(inspection.exists);
  if (inspection.exists) {
    const check = await checkCutterAccountLockOwnerDead(inspection.owner!, runtime);
    assert.equal(check.dead, false);
    assert.equal(check.reason, "alive");
  }
  await assert.rejects(
    () => acquireCutterAccountLock(root, { runtime, deadline_ms: 50 }),
    /占用/
  );
  await handle.release();
  assert.equal((await inspectCutterAccountLock(root, "users", runtime)).exists, false);
});

test("darwin and linux boot identities remain supported", async () => {
  const mac = createCutterAccountLockRuntime({
    platform: "darwin",
    hostname: "mac-test",
    execFile: async () => ({ stdout: "BOOT-SESSION-UUID\n" }),
    readFile: async () => ""
  });
  const macIdentity = await readLocalCutterAccountBootIdentity(mac);
  assert.equal(macIdentity?.boot_identity_source, "darwin_sysctl");

  const linux = createCutterAccountLockRuntime({
    platform: "linux",
    hostname: "linux-test",
    execFile: async () => ({ stdout: "" }),
    readFile: async () => "linux-boot-id\n"
  });
  const linuxIdentity = await readLocalCutterAccountBootIdentity(linux);
  assert.equal(linuxIdentity?.boot_identity_source, "linux_boot_id");
  assert.notEqual(linuxIdentity?.boot_id, macIdentity?.boot_id);
});
