import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  AdminWriterLeaseError,
  withAdminWriterLease
} from "./admin-writer-lease.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-admin-writer-lease-"));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await exists(filePath)) {
      return;
    }
    await delay(5);
  }
  assert.fail(`timed out waiting for ${filePath}`);
}

function lockDir(root: string): string {
  return path.join(root, ".mixlab-library", "locks", "admin-writer.lock");
}

function leasePath(root: string): string {
  return path.join(lockDir(root), "lease.json");
}

test("admin writer lease runs an operation and releases the lock", async () => {
  const root = await makeRoot();
  const result = await withAdminWriterLease({
    library_root: root,
    holder: "test-runner",
    reason: "unit-test",
    now: "2026-06-25T00:00:00.000Z"
  }, async () => {
    assert.equal(await exists(lockDir(root)), true);
    return "done";
  });

  assert.equal(result, "done");
  assert.equal(await exists(lockDir(root)), false);
});

test("admin writer lease rejects concurrent writers", async () => {
  const root = await makeRoot();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withAdminWriterLease({
    library_root: root,
    holder: "first",
    reason: "slow-write",
    now: "2026-06-25T00:00:00.000Z"
  }, async () => {
    await wait;
    return "first-done";
  });

  await waitForFile(leasePath(root));
  await assert.rejects(
    () => withAdminWriterLease({
      library_root: root,
      holder: "second",
      reason: "second-write",
      now: "2026-06-25T00:00:01.000Z"
    }, async () => "second-done"),
    (error) => {
      assert.equal(error instanceof AdminWriterLeaseError, true);
      assert.equal((error as AdminWriterLeaseError).code, "admin_writer_busy");
      assert.equal((error as AdminWriterLeaseError).details.lease?.holder, "first");
      return true;
    }
  );

  release();
  assert.equal(await first, "first-done");
  assert.equal(await exists(lockDir(root)), false);
});

test("admin writer lease reclaims expired locks", async () => {
  const root = await makeRoot();
  await mkdir(lockDir(root), { recursive: true });
  await writeFile(
    leasePath(root),
    `${JSON.stringify({
      holder: "dead-process",
      reason: "stale-write",
      acquired_at: "2026-06-25T00:00:00.000Z",
      expires_at: "2026-06-25T00:00:01.000Z"
    }, null, 2)}\n`,
    "utf8"
  );

  const result = await withAdminWriterLease({
    library_root: root,
    holder: "new-process",
    reason: "new-write",
    now: "2026-06-25T00:00:02.000Z",
    stale_ms: 1_000
  }, async () => "reclaimed");

  assert.equal(result, "reclaimed");
  assert.equal(await exists(lockDir(root)), false);
});
