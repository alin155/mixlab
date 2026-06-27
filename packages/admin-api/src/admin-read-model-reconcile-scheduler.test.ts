import assert from "node:assert/strict";
import test from "node:test";
import type { AdminReadModelInvalidationHandoff } from "./admin-read-model-invalidation.ts";
import type { AdminReadModelReconcilerStatus } from "./admin-read-model-reconciler.ts";
import { scheduleAdminReadModelReconcileAfterScan } from "./admin-read-model-reconcile-scheduler.ts";

function status(): AdminReadModelReconcilerStatus {
  return {
    schema_version: "1.0",
    command: "read-model-reconcile",
    status: "running",
    phase: "starting",
    scan_mode: "full-reconcile",
    cancel_requested: false,
    started_at: "2026-06-25T00:00:00.000Z",
    finished_at: "",
    snapshot_video_count: 0,
    progress: {
      scanned_source_video_count: 0,
      total_source_video_count: 0,
      preprocess_job_snapshot_count: 0,
      total_preprocess_job_snapshot_count: 0,
      current_step: "starting",
      step_completed_count: 0,
      step_total_count: 0,
      step_percent: 0,
      percent: 0,
      message: "正在后台对账 admin.sqlite 读模型。"
    },
    events: [],
    message: "正在后台对账 admin.sqlite 读模型。",
    result: null,
    error_code: "",
    error_message: ""
  };
}

function handoff(
  input: Partial<NonNullable<AdminReadModelInvalidationHandoff["reconciliation"]>> = {}
): AdminReadModelInvalidationHandoff {
  return {
    command: "library-scan",
    invalidation_reason: "library-scan-or-init",
    stale_mark: {
      applied: true,
      reason: "invalidated",
      invalidated_at: "2026-06-25T00:00:00.000Z",
      invalidation_reason: "library-scan-or-init"
    },
    reconciliation: {
      store_path: "/tmp/mixlab/admin-read-model/admin.sqlite",
      action: "rebuild",
      reason: "stale_store",
      scan_mode: "full-reconcile",
      requires_background_reconcile: true,
      safe_for_page_request: false,
      ...input
    }
  };
}

test("schedules background reconcile after safe library scan handoff", () => {
  let starts = 0;
  const result = scheduleAdminReadModelReconcileAfterScan({
    handoff: handoff(),
    start_reconcile: () => {
      starts += 1;
      return {
        accepted: true,
        status: status()
      };
    }
  });

  assert.equal(starts, 1);
  assert.equal(result.policy, "post-scan-reconcile-v1");
  assert.equal(result.requested, true);
  assert.equal(result.accepted, true);
  assert.equal(result.reason, "started");
  assert.equal(result.command, "library-scan");
  assert.equal(result.action, "rebuild");
  assert.equal(result.scan_mode, "full-reconcile");
  assert.equal(result.safe_for_page_request, false);
  assert.equal(result.status?.status, "running");
});

test("reports already-running when the reconciler rejects a duplicate start", () => {
  const result = scheduleAdminReadModelReconcileAfterScan({
    handoff: handoff(),
    start_reconcile: () => ({
      accepted: false,
      status: status()
    })
  });

  assert.equal(result.requested, true);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "already-running");
  assert.equal(result.status?.status, "running");
});

test("skips non library scan handoffs", () => {
  let starts = 0;
  const result = scheduleAdminReadModelReconcileAfterScan({
    handoff: {
      ...handoff(),
      command: "settings-config",
      invalidation_reason: "source-folder-scope-change"
    },
    start_reconcile: () => {
      starts += 1;
      return {
        accepted: true,
        status: status()
      };
    }
  });

  assert.equal(starts, 0);
  assert.equal(result.requested, false);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "not-library-scan");
  assert.equal(result.command, "settings-config");
});

test("skips missing handoff or missing reconciliation plan", () => {
  let starts = 0;
  const start = () => {
    starts += 1;
    return {
      accepted: true,
      status: status()
    };
  };

  const missingHandoff = scheduleAdminReadModelReconcileAfterScan({
    handoff: null,
    start_reconcile: start
  });
  const missingPlan = scheduleAdminReadModelReconcileAfterScan({
    handoff: {
      ...handoff(),
      reconciliation: null
    },
    start_reconcile: start
  });

  assert.equal(starts, 0);
  assert.equal(missingHandoff.reason, "missing-handoff");
  assert.equal(missingPlan.reason, "missing-reconciliation-plan");
  assert.equal(missingPlan.command, "library-scan");
});

test("skips plans that do not require background reconcile", () => {
  let starts = 0;
  const result = scheduleAdminReadModelReconcileAfterScan({
    handoff: handoff({
      action: "none",
      reason: "fresh",
      scan_mode: "no-scan",
      requires_background_reconcile: false,
      safe_for_page_request: true
    }),
    start_reconcile: () => {
      starts += 1;
      return {
        accepted: true,
        status: status()
      };
    }
  });

  assert.equal(starts, 0);
  assert.equal(result.reason, "not-required");
  assert.equal(result.action, "none");
  assert.equal(result.scan_mode, "no-scan");
  assert.equal(result.safe_for_page_request, true);
});

test("skips scan handoffs when the stale marker was not applied", () => {
  let starts = 0;
  const result = scheduleAdminReadModelReconcileAfterScan({
    handoff: {
      ...handoff(),
      stale_mark: {
        applied: false,
        reason: "missing",
        invalidated_at: "2026-06-25T00:00:00.000Z",
        invalidation_reason: "library-scan-or-init"
      }
    },
    start_reconcile: () => {
      starts += 1;
      return {
        accepted: true,
        status: status()
      };
    }
  });

  assert.equal(starts, 0);
  assert.equal(result.reason, "stale-mark-not-applied");
  assert.equal(result.command, "library-scan");
});

test("skips required reconcile plans that are unsafe for post-scan scheduling", () => {
  let starts = 0;
  const result = scheduleAdminReadModelReconcileAfterScan({
    handoff: handoff({
      scan_mode: "full-reconcile",
      requires_background_reconcile: true,
      safe_for_page_request: true
    }),
    start_reconcile: () => {
      starts += 1;
      return {
        accepted: true,
        status: status()
      };
    }
  });

  assert.equal(starts, 0);
  assert.equal(result.reason, "unsafe-plan");
  assert.equal(result.scan_mode, "full-reconcile");
  assert.equal(result.safe_for_page_request, true);
});
