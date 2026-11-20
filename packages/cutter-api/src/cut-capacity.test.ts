import assert from "node:assert/strict";
import test from "node:test";
import {
  CutCapacityGovernor,
  buildCutQueuePositions,
  resolveCutCapacityConfig
} from "./cut-capacity.ts";

function makeGovernor(overrides: Partial<Parameters<typeof resolveCutCapacityConfig>[1]> = {}): CutCapacityGovernor {
  return new CutCapacityGovernor(resolveCutCapacityConfig({}, overrides));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("cut capacity config resolves env bounds and conservative degraded default", () => {
  const config = resolveCutCapacityConfig({
    MIXLAB_CUTTER_CUT_MAX_SLOTS: "99",
    MIXLAB_CUTTER_CUT_MAX_SLOTS_PER_USER: "0",
    MIXLAB_CUTTER_CUT_SLOT_HEARTBEAT_MS: "100",
    MIXLAB_CUTTER_SEARCH_PRIORITY_P95_MS: "80"
  });

  assert.equal(config.max_concurrent_jobs, 8);
  assert.equal(config.max_jobs_per_user, 1);
  assert.equal(config.heartbeat_ms, 250);
  assert.equal(config.search_priority_p95_ms, 80);
  assert.equal(config.max_concurrent_jobs, 8);
  assert.equal(resolveCutCapacityConfig({}, { max_concurrent_jobs: 3 }).max_concurrent_jobs, 3);
});

test("capacity governor caps global slots and admits queued waiter after release", async () => {
  const governor = makeGovernor({ max_concurrent_jobs: 2, max_jobs_per_user: 2 });
  const first = await governor.acquire({ user_id: "cutter-a" });
  const second = await governor.acquire({ user_id: "cutter-b" });
  let thirdGranted = false;
  const third = governor.acquire({ user_id: "cutter-c" }).then((lease) => {
    thirdGranted = true;
    return lease;
  });

  await delay(20);
  assert.equal(thirdGranted, false);
  assert.equal(governor.snapshot().active_slots, 2);
  assert.equal(governor.snapshot().queued_waiters, 1);

  governor.release(first);
  const thirdLease = await third;
  assert.equal(thirdGranted, true);
  assert.equal(governor.snapshot().active_slots, 2);

  governor.release(second);
  governor.release(thirdLease);
  assert.equal(governor.snapshot().active_slots, 0);
});

test("per-user fairness: one cutter cannot occupy all slots", async () => {
  const governor = makeGovernor({ max_concurrent_jobs: 2, max_jobs_per_user: 1 });
  const userALease = await governor.acquire({ user_id: "cutter-a" });
  let userASecondGranted = false;
  const userASecond = governor.acquire({ user_id: "cutter-a" }).then((lease) => {
    userASecondGranted = true;
    return lease;
  });
  const userBLease = await governor.acquire({ user_id: "cutter-b" });

  await delay(20);
  assert.equal(userASecondGranted, false, "A 的第二 slot 必须等待，不能占满全局 slot");
  assert.equal(governor.snapshot().active_slots, 2);
  assert.equal(governor.snapshot().queued_by_user["cutter-a"], 1);

  governor.release(userALease);
  const userASecondLease = await userASecond;
  assert.equal(userASecondGranted, true);
  governor.release(userASecondLease);
  governor.release(userBLease);
});

test("stale slot leases are reaped without leaking capacity", async () => {
  const reaped: string[] = [];
  const governor = new CutCapacityGovernor(
    resolveCutCapacityConfig({}, { max_concurrent_jobs: 1, lease_timeout_ms: 1_000 }),
    { on_reap: (lease) => reaped.push(lease.lease_id) }
  );
  const lease = await governor.acquire({ user_id: "cutter-a" });
  assert.equal(governor.snapshot().active_slots, 1);
  // 模拟心跳停止 + 超过 timeout：租约被回收，slot 可再次分配。
  const fakeNow = Date.now() + 5_000;
  const originalNow = governor.nowMs.bind(governor);
  governor.nowMs = () => fakeNow;
  try {
    assert.equal(governor.snapshot().active_slots, 0);
    assert.deepEqual(reaped, [lease.lease_id]);
  } finally {
    governor.nowMs = originalNow;
  }
  const reacquired = await governor.acquire({ user_id: "cutter-b" });
  governor.release(reacquired);
});

test("search priority pauses cut dispatch while search requests are active or slow", async () => {
  const governor = makeGovernor({ search_priority_p95_ms: 150, search_priority_pause_ms: 200 });
  assert.equal(governor.dispatchDelayMs(), 0);
  governor.noteSearchStarted();
  assert.ok(governor.dispatchDelayMs() > 0);
  assert.equal(governor.snapshot().search_priority_paused, true);
  governor.noteSearchFinished(80);
  assert.equal(governor.searchPriorityActive(), false);
  governor.noteSearchStarted();
  governor.noteSearchFinished(400);
  assert.equal(governor.searchPriorityActive(), true, "慢搜索应触发降速窗口");
  assert.equal(governor.snapshot().recent_search_p95_ms, 400);
});

test("coordinator unavailable degrades to conservative local slots", async () => {
  const governor = makeGovernor({ max_concurrent_jobs: 4, degraded_max_concurrent_jobs: 1 });
  assert.equal(governor.effectiveMaxSlots(), 4);
  governor.updateRemoteCapacity({ degraded: true, reason: "coordinator unreachable" });
  assert.equal(governor.effectiveMaxSlots(), 1);
  assert.equal(governor.snapshot().degraded, true);
  assert.equal(governor.snapshot().degraded_reason, "coordinator unreachable");
  governor.updateRemoteCapacity({ max_concurrent_jobs: 3, degraded: false });
  assert.equal(governor.effectiveMaxSlots(), 3);
});

test("queue positions expose position and estimated wait for 50 pending cuts", () => {
  const positions = buildCutQueuePositions({
    pending: Array.from({ length: 5 }, (_, index) => ({
      cut_job_id: "CJ20261120-000" + (index + 1),
      submitted_by_user_id: "cutter-" + (index + 1),
      created_at: "2026-11-20T00:00:00Z"
    })),
    capacity: resolveCutCapacityConfig({}, { max_concurrent_jobs: 2 }),
    effectiveMaxSlots: 2,
    activeSlots: 1,
    averageJobDurationMs: 10_000
  });

  assert.deepEqual(positions.map((item) => item.position), [1, 2, 3, 4, 5]);
  assert.equal(positions[0]?.cut_job_id, "CJ20261120-0001");
  assert.equal(positions[0]?.estimated_wait_ms, 10_000);
  assert.ok(positions[4]!.estimated_wait_ms > positions[0]!.estimated_wait_ms);
  assert.equal(positions[3]?.submitted_by_user_id, "cutter-4");
});
