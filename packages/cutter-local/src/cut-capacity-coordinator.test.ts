import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GlobalCapacityUnavailableError,
  GlobalCutCapacityCoordinator,
  resolveGlobalCutCapacityConfig
} from "./cut-capacity-coordinator.ts";

async function makeRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeCoordinator(root: string, overrides: { max_slots?: number; lease_ttl_ms?: number } = {}): GlobalCutCapacityCoordinator {
  return new GlobalCutCapacityCoordinator(
    resolveGlobalCutCapacityConfig({ root, max_slots: overrides.max_slots ?? 2, env: {} })
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("global coordinator enforces global max slots and releases atomically", async () => {
  const root = await makeRoot("mixlab-global-capacity-");
  const coordinator = makeCoordinator(root, { max_slots: 2 });
  await coordinator.ensureAvailable();

  const first = await coordinator.acquire({ client_id: "cutter-a", job_id: "job-a" });
  const second = await coordinator.acquire({ client_id: "cutter-b", job_id: "job-b" });
  assert.equal((await coordinator.snapshot()).active_count, 2);

  let third: Awaited<ReturnType<typeof coordinator.acquire>> | undefined;
  let thirdPosition: number | undefined;
  const thirdPromise = coordinator
    .acquire({
      client_id: "cutter-c",
      job_id: "job-c",
      on_queued: (position) => {
        thirdPosition = position.position;
      }
    })
    .then((lease) => {
      third = lease;
      return lease;
    });

  await delay(300);
  assert.equal(third, undefined);
  assert.ok((thirdPosition ?? 0) >= 1, "排队任务应拿到全局队列位置");
  assert.ok((await coordinator.snapshot()).waiting_count >= 1);

  await coordinator.release(first);
  const thirdLease = await thirdPromise;
  assert.equal(thirdLease.slot_index, first.slot_index);
  await coordinator.release(second);
  await coordinator.release(thirdLease);
  assert.equal((await coordinator.snapshot()).active_count, 0);
  assert.equal((await coordinator.snapshot()).waiting_count, 0);
});

test("global coordinator heartbeats lease and reclaims dead client slots after ttl", async () => {
  const root = await makeRoot("mixlab-global-heartbeat-");
  const coordinator = new GlobalCutCapacityCoordinator(
    resolveGlobalCutCapacityConfig({ root, max_slots: 1, env: {} })
  );
  const lease = await coordinator.acquire({ client_id: "alive" });
  assert.equal(await coordinator.heartbeat(lease), true);
  assert.equal(await coordinator.heartbeat({ ...lease, slot_path: path.join(root, "missing") }), false);

  // 模拟客户端崩溃：把 slot 文件 mtime 改到 TTL 之前。
  const staleAt = new Date(Date.now() - 120_000);
  await utimes(lease.slot_path, staleAt, staleAt);
  const reclaimed = await coordinator.releaseStaleSlotsBestEffort();
  assert.equal(reclaimed, 1);
  assert.equal((await coordinator.snapshot()).active_count, 0);

  const reacquired = await coordinator.acquire({ client_id: "survivor" });
  assert.equal(reacquired.slot_index, 0);
  await coordinator.release(reacquired);
});

test("global coordinator unavailable fails safe instead of opening local slots", async () => {
  const fileRoot = await makeRoot("mixlab-global-unavailable-");
  const blockedRoot = path.join(fileRoot, "not-a-directory");
  await writeFile(blockedRoot, "file");

  const coordinator = new GlobalCutCapacityCoordinator(
    resolveGlobalCutCapacityConfig({ root: blockedRoot, max_slots: 4, env: {} })
  );

  await assert.rejects(
    () => coordinator.acquire({ client_id: "cutter-a" }),
    (error: unknown) => error instanceof GlobalCapacityUnavailableError
  );
  const snapshot = await coordinator.snapshot();
  assert.equal(snapshot.available, false);
  assert.equal(snapshot.degraded, true);
});

test("50 cross-process clients share one global slot pool and leave no leases behind", { timeout: 90_000 }, async () => {
  const root = await makeRoot("mixlab-global-50-");
  const maxSlots = 3;
  const workerPath = fileURLToPath(
    new URL("../../../scripts/load/global-capacity-worker.ts", import.meta.url)
  );
  const coordinator = new GlobalCutCapacityCoordinator(
    resolveGlobalCutCapacityConfig({ root, max_slots: maxSlots, env: {} })
  );
  await coordinator.ensureAvailable();
  const children = Array.from({ length: 50 }, (_, index) =>
    spawn(process.execPath, ["--import", "tsx", workerPath], {
      env: {
        ...process.env,
        MIXLAB_LOAD_GLOBAL_ROOT: root,
        MIXLAB_LOAD_GLOBAL_SLOTS: String(maxSlots),
        MIXLAB_LOAD_HOLD_MS: "250",
        MIXLAB_LOAD_CLIENT_ID: "cutter-" + (index + 1)
      },
      stdio: ["ignore", "pipe", "pipe"]
    })
  );

  let peakActive = 0;
  let peakQueued = 0;
  let polling = true;
  const polls = (async () => {
    while (polling) {
      const snapshot = await coordinator.snapshot();
      peakActive = Math.max(peakActive, snapshot.active_count);
      peakQueued = Math.max(peakQueued, snapshot.waiting_count);
      await delay(40);
    }
  })();

  const results = await Promise.all(
    children.map(
      (child) =>
        new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
          child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
          child.on("close", (code) => resolve({ code, stdout, stderr }));
        })
    )
  );
  polling = false;
  await polls;

  assert.equal(results.filter((result) => result.code === 0).length, 50, results.map((r) => r.stderr).join("\n"));
  assert.ok(peakActive <= maxSlots, "全局并发峰值 " + peakActive + " 不得超过 slot 上限 " + maxSlots);
  assert.ok(peakActive >= 1);
  assert.ok(peakQueued >= 1, "50 客户端应出现排队");
  const finalSnapshot = await coordinator.snapshot();
  assert.equal(finalSnapshot.active_count, 0);
  assert.equal(finalSnapshot.waiting_count, 0);
  const slotsDir = path.join(root, "slots");
  const queueDir = path.join(root, "queue");
  assert.deepEqual((await readdir(slotsDir)).filter((name) => name.endsWith(".lock")), []);
  assert.deepEqual((await readdir(queueDir)).filter((name) => name.endsWith(".json")), []);
  // 保留峰值供 gate 报告使用。
  assert.ok((await stat(slotsDir)).isDirectory());
});
