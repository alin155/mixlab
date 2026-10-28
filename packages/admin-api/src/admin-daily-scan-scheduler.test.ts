import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdminRuntimePolicy
} from "../../library-fs/src/index.ts";
import {
  nextAdminDailyScanRunAt,
  resolveAdminDailyScanHour,
  resolveAdminDailyScanSchedulerEnabled,
  runAdminDailyScanOnce,
  scheduledPreprocessRuntimePolicy
} from "./admin-daily-scan-scheduler.ts";
import type {
  AdminLibraryScanNewCommandResult
} from "./admin-library-commands.ts";
import type {
  PreprocessSupervisorRunInput,
  PreprocessSupervisorStatus
} from "./preprocess-supervisor.ts";

const runtimePolicy: AdminRuntimePolicy = {
  audio_mode: "mp3_16k_mono_64k",
  concurrent_jobs: 1,
  auto_scan_enabled: true,
  auto_queue_enabled: false,
  auto_publish_index_enabled: true
};

function supervisorStatus(state: PreprocessSupervisorStatus["state"]): PreprocessSupervisorStatus {
  return {
    state,
    state_label: state,
    worker_id: "worker-test",
    started_at: "",
    stopped_at: "",
    last_error: "",
    stop_requested: false,
    current_source_video_id: "",
    current_stage: "",
    current_updated_at: "",
    last_result: null
  };
}

function scanResult(newVideoCount: number): AdminLibraryScanNewCommandResult {
  return {
    scan_mode: "additive-source-folder-scan",
    total_video_count: newVideoCount,
    new_video_count: newVideoCount,
    existing_video_count: 0,
    source_video_ids: [],
    inactive_manifest_count: 0,
    inactive_ready_count: 0,
    protected_inactive_source_video_ids: [],
    read_model: null
  };
}

test("nextAdminDailyScanRunAt schedules the next local midnight", () => {
  assert.equal(
    nextAdminDailyScanRunAt(new Date(2026, 7, 14, 10, 30)).getTime(),
    new Date(2026, 7, 15, 0, 0, 0, 0).getTime()
  );
  assert.equal(
    nextAdminDailyScanRunAt(new Date(2026, 7, 14, 0, 0, 0, 0)).getTime(),
    new Date(2026, 7, 15, 0, 0, 0, 0).getTime()
  );
});

test("daily scan scheduler is opt-in only", () => {
  assert.equal(resolveAdminDailyScanSchedulerEnabled({ MIXLAB_ADMIN_DAILY_SCAN_ENABLED: "0" } as NodeJS.ProcessEnv), false);
  assert.equal(resolveAdminDailyScanSchedulerEnabled({ MIXLAB_ADMIN_DAILY_SCAN_ENABLED: "false" } as NodeJS.ProcessEnv), false);
  assert.equal(resolveAdminDailyScanSchedulerEnabled({} as NodeJS.ProcessEnv), false);
  assert.equal(resolveAdminDailyScanSchedulerEnabled({ MIXLAB_ADMIN_DAILY_SCAN_ENABLED: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(resolveAdminDailyScanSchedulerEnabled({ MIXLAB_ADMIN_DAILY_SCAN_ENABLED: "true" } as NodeJS.ProcessEnv), true);
});

test("daily scan hour is configurable and validated", () => {
  assert.equal(resolveAdminDailyScanHour({} as NodeJS.ProcessEnv), 0);
  assert.equal(resolveAdminDailyScanHour({ MIXLAB_ADMIN_DAILY_SCAN_HOUR: "3" } as NodeJS.ProcessEnv), 3);
  assert.equal(resolveAdminDailyScanHour({ MIXLAB_ADMIN_DAILY_SCAN_HOUR: "23" } as NodeJS.ProcessEnv), 23);
  assert.equal(resolveAdminDailyScanHour({ MIXLAB_ADMIN_DAILY_SCAN_HOUR: "24" } as NodeJS.ProcessEnv), 0);
  assert.equal(resolveAdminDailyScanHour({ MIXLAB_ADMIN_DAILY_SCAN_HOUR: "bad" } as NodeJS.ProcessEnv), 0);
  assert.equal(
    nextAdminDailyScanRunAt(new Date(2026, 7, 14, 10, 30), 3).getTime(),
    new Date(2026, 7, 15, 3, 0, 0, 0).getTime()
  );
});

test("scheduledPreprocessRuntimePolicy disables duplicate scan and keeps queue preference", () => {
  assert.deepEqual(scheduledPreprocessRuntimePolicy(runtimePolicy), {
    ...runtimePolicy,
    auto_scan_enabled: false
  });
});

test("runAdminDailyScanOnce starts preprocessing when new materials exist and supervisor is idle", async () => {
  const calls: string[] = [];
  const startInputs: PreprocessSupervisorRunInput[] = [];

  const result = await runAdminDailyScanOnce({
    library_root: "/tmp/library",
    library_id: "lib",
    library_name: "主素材库",
    command_now: "2026-08-14T07:00:00.000Z",
    now: () => "2026-08-14T07:00:00.000Z",
    env: {} as NodeJS.ProcessEnv,
    preprocess_runner_available: true,
    async run_library_scan_new(input) {
      calls.push(`scan:${input.actor?.label ?? ""}`);
      return scanResult(2);
    },
    schedule_read_model_reconcile_after_scan() {
      calls.push("reconcile");
    },
    clear_source_video_page_cache() {
      calls.push("clear-cache");
    },
    async read_admin_settings() {
      calls.push("settings");
      return { runtime_policy: runtimePolicy };
    },
    async refresh_runtime_secrets() {
      calls.push("secrets");
    },
    assert_real_preprocess_start_ready() {
      calls.push("real-ready");
    },
    async read_preprocess_safety() {
      calls.push("safety");
      return { ok: true };
    },
    assert_preprocess_safe_to_start() {
      calls.push("safe");
    },
    read_preprocess_supervisor_status() {
      calls.push("status");
      return supervisorStatus("idle");
    },
    start_preprocess_supervisor(input) {
      calls.push("start");
      startInputs.push(input);
      return supervisorStatus("running");
    }
  });

  assert.deepEqual(calls, [
    "settings",
    "status",
    "scan:每日自动扫描新增素材",
    "reconcile",
    "clear-cache",
    "secrets",
    "safety",
    "safe",
    "start"
  ]);
  assert.equal(result.auto_preprocess.started, true);
  assert.equal(result.auto_preprocess.reason, "started");
  assert.equal(startInputs.length, 1);
  assert.deepEqual(startInputs[0]?.runtime_policy, {
    ...runtimePolicy,
    auto_scan_enabled: false
  });
});

test("runAdminDailyScanOnce does not start preprocessing when no new materials exist", async () => {
  const calls: string[] = [];

  const result = await runAdminDailyScanOnce({
    library_root: "/tmp/library",
    library_id: "lib",
    library_name: "主素材库",
    command_now: "2026-08-14T07:00:00.000Z",
    env: {} as NodeJS.ProcessEnv,
    preprocess_runner_available: true,
    async run_library_scan_new() {
      calls.push("scan");
      return scanResult(0);
    },
    schedule_read_model_reconcile_after_scan() {
      calls.push("reconcile");
    },
    clear_source_video_page_cache() {
      calls.push("clear-cache");
    },
    async read_admin_settings() {
      calls.push("settings");
      return { runtime_policy: runtimePolicy };
    },
    async refresh_runtime_secrets() {
      calls.push("secrets");
    },
    assert_real_preprocess_start_ready() {
      calls.push("real-ready");
    },
    async read_preprocess_safety() {
      calls.push("safety");
      return { ok: true };
    },
    assert_preprocess_safe_to_start() {
      calls.push("safe");
    },
    read_preprocess_supervisor_status() {
      calls.push("status");
      return supervisorStatus("idle");
    },
    start_preprocess_supervisor() {
      calls.push("start");
      return supervisorStatus("running");
    }
  });

  assert.deepEqual(calls, ["settings", "status", "scan", "reconcile", "clear-cache"]);
  assert.equal(result.auto_preprocess.started, false);
  assert.equal(result.auto_preprocess.reason, "no-new-materials");
});

test("runAdminDailyScanOnce does not start preprocessing when supervisor is busy", async () => {
  const calls: string[] = [];

  const result = await runAdminDailyScanOnce({
    library_root: "/tmp/library",
    library_id: "lib",
    library_name: "主素材库",
    command_now: "2026-08-14T07:00:00.000Z",
    env: {} as NodeJS.ProcessEnv,
    preprocess_runner_available: true,
    async run_library_scan_new() {
      calls.push("scan");
      return scanResult(3);
    },
    schedule_read_model_reconcile_after_scan() {
      calls.push("reconcile");
    },
    clear_source_video_page_cache() {
      calls.push("clear-cache");
    },
    async read_admin_settings() {
      calls.push("settings");
      return { runtime_policy: runtimePolicy };
    },
    async refresh_runtime_secrets() {
      calls.push("secrets");
    },
    assert_real_preprocess_start_ready() {
      calls.push("real-ready");
    },
    async read_preprocess_safety() {
      calls.push("safety");
      return { ok: true };
    },
    assert_preprocess_safe_to_start() {
      calls.push("safe");
    },
    read_preprocess_supervisor_status() {
      calls.push("status");
      return supervisorStatus("running");
    },
    start_preprocess_supervisor() {
      calls.push("start");
      return supervisorStatus("running");
    }
  });

  assert.deepEqual(calls, ["settings", "status", "scan", "reconcile", "clear-cache"]);
  assert.equal(result.auto_preprocess.started, false);
  assert.equal(result.auto_preprocess.reason, "preprocess-not-idle");
});


test("runAdminDailyScanOnce skips scanning when the admin disabled auto scan", async () => {
  const calls: string[] = [];
  const result = await runAdminDailyScanOnce({
    library_root: "/tmp/library",
    library_id: "lib",
    library_name: "主素材库",
    command_now: "2026-08-14T07:00:00.000Z",
    env: {} as NodeJS.ProcessEnv,
    preprocess_runner_available: true,
    async run_library_scan_new() {
      calls.push("scan");
      return scanResult(5);
    },
    schedule_read_model_reconcile_after_scan() {
      calls.push("reconcile");
    },
    clear_source_video_page_cache() {
      calls.push("clear-cache");
    },
    async read_admin_settings() {
      calls.push("settings");
      return {
        runtime_policy: {
          ...runtimePolicy,
          auto_scan_enabled: false
        }
      };
    },
    async refresh_runtime_secrets() {
      calls.push("secrets");
    },
    assert_real_preprocess_start_ready() {
      calls.push("ready");
    },
    async read_preprocess_safety() {
      calls.push("safety");
      return { ok: true };
    },
    assert_preprocess_safe_to_start() {
      calls.push("safe");
    },
    read_preprocess_supervisor_status() {
      calls.push("status");
      return supervisorStatus("idle");
    },
    start_preprocess_supervisor() {
      calls.push("start");
      return supervisorStatus("running");
    }
  });
  assert.deepEqual(calls, ["settings", "status"]);
  assert.equal(result.auto_preprocess.started, false);
  assert.equal(result.auto_preprocess.reason, "auto-scan-disabled");
  assert.equal(result.scan_new_video_count, 0);
});
