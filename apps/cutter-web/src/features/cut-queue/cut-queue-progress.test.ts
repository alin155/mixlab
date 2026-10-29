import assert from "node:assert/strict";
import test from "node:test";
import type { CutQueueJob } from "../../state/cut-queue.ts";
import { estimateCutQueueProgress } from "./cut-queue-progress.ts";

function job(input: Partial<CutQueueJob> & Pick<CutQueueJob, "queue_job_id" | "status" | "created_at">): CutQueueJob {
  return {
    cut_list_item_id: "CLI000001",
    source_video_id: "V000001",
    source_title: "source",
    title: "title",
    begin_ms: 0,
    end_ms: 60_000,
    duration_ms: 60_000,
    selected_text: "",
    cut_mode: "copy",
    progress: 0,
    ...input
  } as CutQueueJob;
}

test("reports pending position and estimated wait from done-job median", () => {
  const running = job({
    queue_job_id: "job-running",
    status: "running",
    created_at: "2026-10-29T10:00:00.000Z",
    started_at: "2026-10-29T10:00:10.000Z"
  });
  const pending = job({
    queue_job_id: "job-pending",
    status: "pending",
    created_at: "2026-10-29T10:00:01.000Z"
  });
  const done = job({
    queue_job_id: "job-done",
    status: "done",
    created_at: "2026-10-29T09:00:00.000Z",
    started_at: "2026-10-29T09:00:00.000Z",
    finished_at: "2026-10-29T09:01:00.000Z"
  });
  const now = Date.parse("2026-10-29T10:00:30.000Z");
  const progress = estimateCutQueueProgress([running, pending, done], pending, now);

  assert.ok(progress);
  assert.equal(progress.position, 2);
  assert.equal(progress.ahead_count, 1);
  assert.ok((progress.estimated_wait_ms ?? 0) > 30_000);
  assert.match(progress.label, /第 2 位/);
});

test("reports running elapsed instead of ETA", () => {
  const running = job({
    queue_job_id: "job-running",
    status: "running",
    created_at: "2026-10-29T10:00:00.000Z",
    started_at: "2026-10-29T10:00:10.000Z"
  });
  const progress = estimateCutQueueProgress([running], running, Date.parse("2026-10-29T10:00:30.000Z"));

  assert.ok(progress);
  assert.equal(progress.position, 1);
  assert.match(progress.label, /正在剪切/);
});

test("returns undefined for completed jobs", () => {
  const done = job({
    queue_job_id: "job-done",
    status: "done",
    created_at: "2026-10-29T09:00:00.000Z",
    started_at: "2026-10-29T09:00:00.000Z",
    finished_at: "2026-10-29T09:01:00.000Z"
  });
  assert.equal(estimateCutQueueProgress([done], done, Date.now()), undefined);
});
