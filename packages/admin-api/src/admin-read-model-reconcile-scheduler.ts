import type { AdminCommandName } from "./admin-command-guard.ts";
import type { AdminReadModelInvalidationHandoff } from "./admin-read-model-invalidation.ts";
import type {
  AdminReadModelReconcilerStartResult,
  AdminReadModelReconcilerStatus
} from "./admin-read-model-reconciler.ts";

export type AdminReadModelReconcileScheduleReason =
  | "started"
  | "already-running"
  | "missing-handoff"
  | "missing-reconciliation-plan"
  | "not-library-scan"
  | "not-required"
  | "stale-mark-not-applied"
  | "unsafe-plan";

export interface AdminReadModelReconcileScheduleResult {
  policy: "post-scan-reconcile-v1";
  requested: boolean;
  accepted: boolean;
  reason: AdminReadModelReconcileScheduleReason;
  command: AdminCommandName | "";
  action: string;
  scan_mode: string;
  safe_for_page_request: boolean;
  status: AdminReadModelReconcilerStatus | null;
}

function skipped(input: {
  reason: AdminReadModelReconcileScheduleReason;
  command?: AdminCommandName;
  action?: string;
  scan_mode?: string;
  safe_for_page_request?: boolean;
  status?: AdminReadModelReconcilerStatus | null;
}): AdminReadModelReconcileScheduleResult {
  return {
    policy: "post-scan-reconcile-v1",
    requested: false,
    accepted: false,
    reason: input.reason,
    command: input.command ?? "",
    action: input.action ?? "",
    scan_mode: input.scan_mode ?? "",
    safe_for_page_request: input.safe_for_page_request ?? false,
    status: input.status ?? null
  };
}

export function scheduleAdminReadModelReconcileAfterScan(input: {
  handoff: AdminReadModelInvalidationHandoff | null;
  start_reconcile: () => AdminReadModelReconcilerStartResult;
}): AdminReadModelReconcileScheduleResult {
  if (!input.handoff) {
    return skipped({ reason: "missing-handoff" });
  }

  if (input.handoff.command !== "library-scan") {
    return skipped({
      reason: "not-library-scan",
      command: input.handoff.command
    });
  }

  if (!input.handoff.reconciliation) {
    return skipped({
      reason: "missing-reconciliation-plan",
      command: input.handoff.command
    });
  }

  if (!input.handoff.stale_mark.applied) {
    return skipped({
      reason: "stale-mark-not-applied",
      command: input.handoff.command
    });
  }

  const plan = input.handoff.reconciliation;
  const planSummary = {
    command: input.handoff.command,
    action: plan.action,
    scan_mode: plan.scan_mode,
    safe_for_page_request: plan.safe_for_page_request
  };

  if (!plan.requires_background_reconcile) {
    return skipped({
      ...planSummary,
      reason: "not-required"
    });
  }

  if (plan.scan_mode !== "full-reconcile" || plan.safe_for_page_request) {
    return skipped({
      ...planSummary,
      reason: "unsafe-plan"
    });
  }

  const started = input.start_reconcile();

  return {
    policy: "post-scan-reconcile-v1",
    requested: true,
    accepted: started.accepted,
    reason: started.accepted ? "started" : "already-running",
    ...planSummary,
    status: started.status
  };
}
