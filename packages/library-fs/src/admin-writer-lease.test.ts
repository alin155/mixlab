import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  AdminWriterLeaseError,
  readAdminWriterLease,
  withAdminWriterLease,
  withAdminWriterLeaseWait
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

test("admin writer lease reclaims empty lock directories", async () => {
  const root = await makeRoot();
  await mkdir(lockDir(root), { recursive: true });

  const result = await withAdminWriterLease({
    library_root: root,
    holder: "new-process",
    reason: "new-write",
    now: "2026-06-25T00:00:02.000Z"
  }, async () => "reclaimed");

  assert.equal(result, "reclaimed");
  assert.equal(await exists(lockDir(root)), false);
});

test("bounded lease wait enters after the current writer releases", async () => {
  const root = await makeRoot();
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const first = withAdminWriterLease({
    library_root: root,
    holder: "first",
    reason: "slow-write",
    now: "2026-06-25T00:00:00.000Z"
  }, async () => {
    order.push("first-started");
    await firstGate;
    order.push("first-released");
  });

  await waitForFile(leasePath(root));
  const second = withAdminWriterLeaseWait({
    library_root: root,
    holder: "second",
    reason: "waiting-write",
    now: "2026-06-25T00:00:01.000Z",
    wait_ms: 2_000,
    poll_interval_ms: 10
  }, async () => {
    order.push("second-started");
    return "second-done";
  });

  await delay(40);
  assert.equal(await exists(lockDir(root)), true);
  releaseFirst();
  await first;
  assert.equal(await second, "second-done");
  assert.deepEqual(order, ["first-started", "first-released", "second-started"]);
  assert.equal(await exists(lockDir(root)), false);
});

test("bounded lease wait surfaces admin_writer_busy with the current holder after timeout", async () => {
  const root = await makeRoot();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = withAdminWriterLease({
    library_root: root,
    holder: "stuck-writer",
    reason: "long-write",
    now: "2026-06-25T00:00:00.000Z"
  }, async () => {
    await gate;
  });

  await waitForFile(leasePath(root));
  await assert.rejects(
    () => withAdminWriterLeaseWait({
      library_root: root,
      holder: "waiter",
      reason: "waiting-write",
      now: "2026-06-25T00:00:01.000Z",
      wait_ms: 60,
      poll_interval_ms: 10
    }, async () => "never"),
    (error) => {
      assert.equal(error instanceof AdminWriterLeaseError, true);
      assert.equal((error as AdminWriterLeaseError).code, "admin_writer_busy");
      assert.equal((error as AdminWriterLeaseError).details.lease?.holder, "stuck-writer");
      return true;
    }
  );
  release();
  await holder;
  assert.equal(await exists(lockDir(root)), false);
  assert.equal(await readAdminWriterLease(root), null);
});

test("readAdminWriterLease exposes the active holder for worker audit decisions", async () => {
  const root = await makeRoot();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = withAdminWriterLease({
    library_root: root,
    holder: "audit-holder",
    reason: "source-video-publish",
    now: "2026-06-25T00:00:00.000Z"
  }, async () => {
    await gate;
  });

  await waitForFile(leasePath(root));
  const lease = await readAdminWriterLease(root);
  assert.equal(lease?.holder, "audit-holder");
  assert.equal(lease?.reason, "source-video-publish");
  release();
  await holder;
  assert.equal(await readAdminWriterLease(root), null);
});
