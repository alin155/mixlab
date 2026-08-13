import assert from "node:assert/strict";
import test from "node:test";
import type { PreprocessSupervisorStatus } from "./preprocess-supervisor.ts";
import {
  toPublicPreprocessSupervisorStatus
} from "./admin-preprocess-supervisor-status.ts";

function supervisorStatus(input: Partial<PreprocessSupervisorStatus> = {}): PreprocessSupervisorStatus {
  return {
    state: "running",
    state_label: "运行中",
    worker_id: "admin-worker-test",
    started_at: "2026-06-27T00:00:00.000Z",
    stopped_at: "",
    last_error: "",
    stop_requested: false,
    current_source_video_id: "",
    current_stage: "",
    current_updated_at: "",
    last_result: null,
    ...input
  };
}

test("preprocess supervisor status projection exposes public runtime fields", () => {
  assert.deepEqual(toPublicPreprocessSupervisorStatus(supervisorStatus({
    state: "stopping",
    state_label: "停止中",
    stop_requested: true
  })), {
    state: "stopping",
    state_label: "停止中",
    worker_id: "admin-worker-test",
    started_at: "2026-06-27T00:00:00.000Z",
    stopped_at: "",
    last_error: "",
    stop_requested: true,
    current_source_video_id: "",
    current_stage: "",
    current_updated_at: "",
    last_result: null
  });
});

test("preprocess supervisor status projection redacts full worker result details", () => {
  const status = supervisorStatus({
    state: "idle",
    state_label: "未运行",
    stopped_at: "2026-06-27T00:05:00.000Z",
    last_result: {
      total_claimed_count: 9,
      succeeded_count: 7,
      failed_count: 2,
      temporary_asr_results: [{ text: "should not leak" }],
      source_video_results: [{ source_video_id: "V000001" }]
    } as unknown as PreprocessSupervisorStatus["last_result"]
  });

  assert.deepEqual(toPublicPreprocessSupervisorStatus(status), {
    state: "idle",
    state_label: "未运行",
    worker_id: "admin-worker-test",
    started_at: "2026-06-27T00:00:00.000Z",
    stopped_at: "2026-06-27T00:05:00.000Z",
    last_error: "",
    stop_requested: false,
    current_source_video_id: "",
    current_stage: "",
    current_updated_at: "",
    last_result: {
      total_claimed_count: 9,
      succeeded_count: 7,
      failed_count: 2
    }
  });
});
