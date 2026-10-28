import assert from "node:assert/strict";
import test from "node:test";
import type { CutQueueJob } from "./cut-queue.ts";
import {
  CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY,
  addHiddenCutJobIds,
  batchPauseCutJobIds,
  batchRetryCutJobIds,
  countHiddenCutJobs,
  cutQueueBatchSummaryMessage,
  executeCutQueueBatchDelete,
  executeCutQueueBatchPause,
  executeCutQueueBatchRetry,
  filterHiddenCutJobs,
  hiddenCutJobIdSet,
  planBatchDeleteCutJobs,
  pruneCutQueueSelection,
  readHiddenCutJobIds,
  removeCutQueueJobsFromSelection,
  setCutQueueJobsSelected,
  toggleCutQueueJobSelection,
  writeHiddenCutJobIds
} from "./cut-queue-batch.ts";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    }
  } satisfies Storage;
}

function job(overrides: Partial<CutQueueJob> & { queue_job_id: string }): CutQueueJob {
  const { queue_job_id, ...rest } = overrides;

  return {
    queue_job_id,
    cut_list_item_id: `cut-${queue_job_id}`,
    source_video_id: "V000001",
    source_title: "现金流",
    title: "1-现金流项目-现金流",
    begin_ms: 0,
    end_ms: 1_000,
    duration_ms: 1_000,
    selected_text: "现金流片段",
    cut_mode: "copy",
    status: "pending",
    progress: 0,
    created_at: "2026-10-29T00:00:00.000Z",
    ...rest
  };
}

function selected(...ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

test("selection helpers track checked jobs and drop stale rows", () => {
  let current: ReadonlySet<string> = new Set();

  current = toggleCutQueueJobSelection(current, "job-a");
  current = toggleCutQueueJobSelection(current, "job-b");
  assert.deepEqual([...current].sort(), ["job-a", "job-b"]);

  current = toggleCutQueueJobSelection(current, "job-a");
  assert.deepEqual([...current], ["job-b"]);

  current = setCutQueueJobsSelected(current, ["job-b", "job-c"], false);
  assert.deepEqual([...current], []);

  current = setCutQueueJobsSelected(current, ["job-a", "job-c"], true);
  assert.deepEqual([...current].sort(), ["job-a", "job-c"]);

  const pruned = pruneCutQueueSelection(current, [job({ queue_job_id: "job-a" })]);
  assert.deepEqual([...pruned], ["job-a"]);

  const removed = removeCutQueueJobsFromSelection(current, ["job-a"]);
  assert.deepEqual([...removed], ["job-c"]);
});

test("batch retry only targets failed or paused jobs, never done jobs", () => {
  const jobs = [
    job({ queue_job_id: "job-failed", status: "failed" }),
    job({ queue_job_id: "job-cancelled", status: "cancelled" }),
    job({ queue_job_id: "job-done", status: "done" }),
    job({ queue_job_id: "job-pending", status: "pending" }),
    job({ queue_job_id: "job-running", status: "running" }),
    job({ queue_job_id: "job-unselected", status: "failed" })
  ];

  assert.deepEqual(
    batchRetryCutJobIds(jobs, selected("job-failed", "job-cancelled", "job-done", "job-pending", "job-running")),
    ["job-failed", "job-cancelled"]
  );
  assert.deepEqual(batchRetryCutJobIds(jobs, selected("job-unselected")), ["job-unselected"]);
  assert.deepEqual(batchRetryCutJobIds(jobs, selected("job-done")), []);
  assert.deepEqual(batchRetryCutJobIds(jobs, new Set()), []);
});

test("batch pause only targets pending or running jobs", () => {
  const jobs = [
    job({ queue_job_id: "job-pending", status: "pending" }),
    job({ queue_job_id: "job-running", status: "running" }),
    job({ queue_job_id: "job-failed", status: "failed" }),
    job({ queue_job_id: "job-done", status: "done" }),
    job({ queue_job_id: "job-unselected", status: "running" })
  ];

  assert.deepEqual(
    batchPauseCutJobIds(jobs, selected("job-pending", "job-running", "job-failed", "job-done")),
    ["job-pending", "job-running"]
  );
  assert.deepEqual(batchPauseCutJobIds(jobs, selected("job-failed")), []);
});

test("batch delete plan splits terminal jobs from active jobs", () => {
  const jobs = [
    job({ queue_job_id: "job-pending", status: "pending" }),
    job({ queue_job_id: "job-running", status: "running" }),
    job({ queue_job_id: "job-done", status: "done" }),
    job({ queue_job_id: "job-failed", status: "failed" }),
    job({ queue_job_id: "job-cancelled", status: "cancelled" }),
    job({ queue_job_id: "job-unselected", status: "done" })
  ];
  const plan = planBatchDeleteCutJobs(
    jobs,
    selected("job-pending", "job-running", "job-done", "job-failed", "job-cancelled")
  );

  assert.deepEqual(plan.terminal_job_ids, ["job-done", "job-failed", "job-cancelled"]);
  assert.deepEqual(plan.active_job_ids, ["job-pending", "job-running"]);
  assert.equal(plan.total, 5);
});

test("batch retry executor only retries failed jobs and reports the summary", async () => {
  const jobs = [
    job({ queue_job_id: "job-failed", status: "failed" }),
    job({ queue_job_id: "job-cancelled", status: "cancelled" }),
    job({ queue_job_id: "job-done", status: "done" }),
    job({ queue_job_id: "job-pending", status: "pending" })
  ];
  const retried: string[] = [];

  const result = await executeCutQueueBatchRetry({
    jobs,
    selected_job_ids: ["job-failed", "job-cancelled", "job-done", "job-pending"],
    retryJob: async (cutJobId) => {
      retried.push(cutJobId);
      if (cutJobId === "job-cancelled") {
        throw new Error("engine offline");
      }
    }
  });

  assert.deepEqual(retried, ["job-failed", "job-cancelled"]);
  assert.deepEqual(result.processed_job_ids, ["job-failed"]);
  assert.equal(result.requested, 4);
  assert.equal(result.processed, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.failed, 1);
  assert.match(result.message, /批量重试完成：已重新加入 1 个任务/);
  assert.match(result.message, /跳过 2 个非失败任务/);
  assert.match(result.message, /1 个处理失败/);
});

test("batch pause executor only cancels active jobs", async () => {
  const jobs = [
    job({ queue_job_id: "job-pending", status: "pending" }),
    job({ queue_job_id: "job-running", status: "running" }),
    job({ queue_job_id: "job-failed", status: "failed" })
  ];
  const paused: string[] = [];

  const result = await executeCutQueueBatchPause({
    jobs,
    selected_job_ids: ["job-pending", "job-running", "job-failed"],
    pauseJob: async (cutJobId) => {
      paused.push(cutJobId);
    }
  });

  assert.deepEqual(paused, ["job-pending", "job-running"]);
  assert.equal(result.processed, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.match(result.message, /批量暂停完成：已停止 2 个任务的执行/);
  assert.match(result.message, /可在队列中重新剪切/);
});

test("batch delete cancels active jobs before hiding and hides finished jobs directly", async () => {
  const events: string[] = [];
  const jobs = [
    job({ queue_job_id: "job-pending", status: "pending" }),
    job({ queue_job_id: "job-running", status: "running" }),
    job({ queue_job_id: "job-done", status: "done" }),
    job({ queue_job_id: "job-failed", status: "failed" }),
    job({ queue_job_id: "job-cancelled", status: "cancelled" })
  ];

  const result = await executeCutQueueBatchDelete({
    jobs,
    selected_job_ids: ["job-pending", "job-running", "job-done", "job-failed", "job-cancelled", "job-missing"],
    cancelJob: async (cutJobId) => {
      events.push(`cancel:${cutJobId}`);
      if (cutJobId === "job-running") {
        throw new Error("cancel rejected");
      }
    },
    hideJob: (cutJobId) => {
      events.push(`hide:${cutJobId}`);
    }
  });

  assert.deepEqual(events, [
    "hide:job-done",
    "hide:job-failed",
    "hide:job-cancelled",
    "cancel:job-pending",
    "hide:job-pending",
    "cancel:job-running"
  ]);
  assert.ok(events.indexOf("cancel:job-pending") < events.indexOf("hide:job-pending"));
  assert.equal(events.includes("hide:job-running"), false);
  assert.deepEqual(result.processed_job_ids, ["job-done", "job-failed", "job-cancelled", "job-pending"]);
  assert.equal(result.processed, 4);
  assert.equal(result.cancelled, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 1);
  assert.match(result.message, /批量删除完成：已从列表移除 4 个任务/);
  assert.match(result.message, /1 个进行中任务已取消/);
  assert.match(result.message, /1 个处理失败/);
});

test("batch executors report an empty selection as a no-op", async () => {
  const jobs = [job({ queue_job_id: "job-failed", status: "failed" })];

  const retry = await executeCutQueueBatchRetry({
    jobs,
    selected_job_ids: [],
    retryJob: async () => undefined
  });
  assert.equal(retry.processed, 0);
  assert.equal(retry.skipped, 0);
  assert.equal(retry.failed, 0);
  assert.match(retry.message, /批量重试未执行：没有符合条件的任务/);

  const pause = await executeCutQueueBatchPause({
    jobs,
    selected_job_ids: [],
    pauseJob: async () => undefined
  });
  assert.match(pause.message, /批量暂停未执行：没有符合条件的任务/);

  const deleted = await executeCutQueueBatchDelete({
    jobs,
    selected_job_ids: [],
    cancelJob: async () => undefined,
    hideJob: () => undefined
  });
  assert.match(deleted.message, /批量删除未执行：没有符合条件的任务/);
});

test("batch summary distinguishes completed, skipped and failed counts", () => {
  assert.equal(
    cutQueueBatchSummaryMessage("retry", { processed: 2, skipped: 0, failed: 0, cancelled: 0 }),
    "批量重试完成：已重新加入 2 个任务"
  );
  assert.equal(
    cutQueueBatchSummaryMessage("pause", { processed: 1, skipped: 1, failed: 0, cancelled: 0 }),
    "批量暂停完成：已停止 1 个任务的执行，可在队列中重新剪切（跳过 1 个任务）"
  );
  assert.equal(
    cutQueueBatchSummaryMessage("delete", { processed: 2, skipped: 0, failed: 0, cancelled: 1 }),
    "批量删除完成：已从列表移除 2 个任务（1 个进行中任务已取消）"
  );
  assert.equal(
    cutQueueBatchSummaryMessage("delete", { processed: 0, skipped: 0, failed: 1, cancelled: 0 }),
    "批量删除失败（1 个处理失败）"
  );
});

test("hidden queue jobs persist locally and never resurrect on refresh", () => {
  const storage = memoryStorage();
  assert.deepEqual(readHiddenCutJobIds(storage), []);

  const written = writeHiddenCutJobIds(["job-1", " job-2 ", "job-1", ""], storage);
  assert.deepEqual(written, ["job-1", "job-2"]);
  assert.deepEqual(readHiddenCutJobIds(storage), ["job-1", "job-2"]);
  assert.equal(
    storage.getItem(CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY),
    JSON.stringify(["job-1", "job-2"])
  );

  assert.deepEqual(addHiddenCutJobIds(["job-1"], ["job-3", "job-1"]), ["job-1", "job-3"]);

  const hidden = hiddenCutJobIdSet(["job-1"]);
  const jobs = [job({ queue_job_id: "job-1" }), job({ queue_job_id: "job-2" })];
  assert.deepEqual(filterHiddenCutJobs(jobs, hidden).map((entry) => entry.queue_job_id), ["job-2"]);
  assert.equal(countHiddenCutJobs(jobs, hidden), 1);

  const corrupt = memoryStorage({ [CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY]: "{not-json" });
  assert.deepEqual(readHiddenCutJobIds(corrupt), []);
  const objectPayload = memoryStorage({
    [CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY]: JSON.stringify({ jobs: ["job-1"] })
  });
  assert.deepEqual(readHiddenCutJobIds(objectPayload), []);
  assert.deepEqual(readHiddenCutJobIds(null), []);
});
