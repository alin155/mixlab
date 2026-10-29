import assert from "node:assert/strict";
import test from "node:test";
import {
  cutPipelineStatusLabel,
  observeServiceCutQueue,
  type CutPipelineState
} from "./cut-pipeline.ts";
import { shouldApplyQueueRefresh } from "./cut-task-refresh.ts";
import type { CutQueueJob } from "./cut-queue.ts";

function job(overrides: Partial<CutQueueJob> = {}): CutQueueJob {
  return {
    queue_job_id: "CJ-1",
    cut_list_item_id: "cut-1",
    source_video_id: "V000001",
    source_title: "现金流",
    title: "1-项目-现金流",
    begin_ms: 0,
    end_ms: 2000,
    duration_ms: 2000,
    selected_text: "现金流",
    cut_mode: "copy",
    status: "done",
    progress: 100,
    created_at: "2026-10-27T00:00:00.000Z",
    ...overrides
  };
}

async function observe(
  input: {
    jobs: readonly CutQueueJob[];
    baseline?: readonly string[];
    signal?: AbortSignal;
    onRefreshLocalClips?: () => void;
  }
): Promise<{ state: CutPipelineState; states: CutPipelineState[] }> {
  const states: CutPipelineState[] = [];
  const state = await observeServiceCutQueue({
    refreshQueueJobs: async () => input.jobs,
    refreshLocalClips: async () => {
      input.onRefreshLocalClips?.();
    },
    getJobs: () => input.jobs,
    onState: (next) => states.push(next),
    baselineTerminalJobIds: new Set(input.baseline ?? []),
    pollIntervalMs: 1,
    idleStablePolls: 1,
    maxWaitMs: 5_000,
    ...(input.signal ? { signal: input.signal } : {})
  });
  return { state, states };
}

test("only the newest queue refresh may apply (CW-12)", () => {
  assert.equal(shouldApplyQueueRefresh(2, 2), true);
  assert.equal(shouldApplyQueueRefresh(1, 2), false);
  assert.equal(shouldApplyQueueRefresh(3, 2), false);
});

test("idle queue is reported as idle, never as completed (CW-13/CW-14)", async () => {
  const done = job();
  const { state } = await observe({ jobs: [done], baseline: [done.queue_job_id] });

  assert.equal(state.status, "idle");
  assert.equal(state.processed_count, 0);
  assert.equal(cutPipelineStatusLabel(state), "本机剪切空闲");
});

test("a newly finished done job reports completed and refreshes local clips", async () => {
  let refreshCount = 0;
  const { state } = await observe({
    jobs: [job({ status: "done" })],
    onRefreshLocalClips: () => {
      refreshCount += 1;
    }
  });

  assert.equal(state.status, "completed");
  assert.equal(state.done_count, 1);
  assert.equal(state.failed_count, 0);
  assert.equal(cutPipelineStatusLabel(state), "本机剪切已完成");
  assert.equal(refreshCount, 1);
});

test("cancelled jobs are terminal but do not count as a completed cut", async () => {
  const { state } = await observe({ jobs: [job({ status: "cancelled" })] });

  assert.equal(state.status, "idle");
  assert.equal(state.done_count, 0);
  assert.equal(state.failed_count, 0);
});

test("aborting the observation stops the poll loop quickly", async () => {
  const controller = new AbortController();
  const running = job({ status: "running", progress: 10 });
  const states: CutPipelineState[] = [];

  const state = await observeServiceCutQueue({
    refreshQueueJobs: async () => {
      controller.abort();
      return [running];
    },
    refreshLocalClips: async () => undefined,
    getJobs: () => [running],
    onState: (next) => states.push(next),
    pollIntervalMs: 1,
    idleStablePolls: 1,
    maxWaitMs: 5_000,
    signal: controller.signal
  });

  assert.equal(state.status, "idle");
  assert.match(state.message, /已停止观察/);
  assert.ok(states.length >= 1);
});
