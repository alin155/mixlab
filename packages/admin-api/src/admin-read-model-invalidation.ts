import type { LibraryCounts } from "../../protocol/src/index.ts";
import {
  adminCommandReadModelInvalidationPolicy,
  type AdminCommandName
} from "./admin-command-guard.ts";
import { appendAdminOperationLogEvent } from "./admin-operation-log.ts";
import {
  markAdminReadModelStoreStale,
  planAdminReadModelStoreReconciliation,
  readAdminReadModelStoreStatus,
  type AdminReadModelStoreInvalidationReason,
  type AdminReadModelStoreInvalidationResult,
  type AdminReadModelStoreReconciliationPlan
} from "./admin-read-model-store.ts";

export interface AdminReadModelInvalidationHandoff {
  command: AdminCommandName;
  invalidation_reason: AdminReadModelStoreInvalidationReason;
  stale_mark: AdminReadModelStoreInvalidationResult;
  reconciliation: AdminReadModelStoreReconciliationPlan | null;
}

export function adminReadModelStoreInvalidationReason(
  command: AdminCommandName
): AdminReadModelStoreInvalidationReason | null {
  const policy = adminCommandReadModelInvalidationPolicy(command);
  if (!policy.requires_read_model_reconcile) {
    return null;
  }
  if (policy.reason === "source-folder-scope-change" || policy.reason === "library-scan-or-init") {
    return policy.reason;
  }
  return "manual";
}

export async function markAdminReadModelStoreStaleForCommand(input: {
  library_root: string;
  command: AdminCommandName;
  invalidated_at: string;
  read_library_manifest?: () => Promise<(LibraryCounts & { updated_at?: string }) | null>;
}): Promise<AdminReadModelInvalidationHandoff | null> {
  const reason = adminReadModelStoreInvalidationReason(input.command);
  if (!reason) {
    return null;
  }

  const result = await markAdminReadModelStoreStale({
    library_root: input.library_root,
    reason,
    invalidated_at: input.invalidated_at
  });
  await appendAdminOperationLogEvent({
    library_root: input.library_root,
    occurred_at: input.invalidated_at,
    area: "read-model",
    action: "read-model-invalidate",
    event_type: result.applied ? "succeeded" : "skipped",
    message: result.applied
      ? "Admin read model 已标记为需要对账。"
      : "Admin read model 失效标记未写入。",
    details: {
      command: input.command,
      invalidation_reason: reason,
      stale_mark_applied: result.applied,
      stale_mark_result: result.reason,
      invalidated_at: result.invalidated_at
    }
  });

  let reconciliation: AdminReadModelStoreReconciliationPlan | null = null;
  try {
    const library = input.read_library_manifest
      ? await input.read_library_manifest()
      : null;
    const status = await readAdminReadModelStoreStatus({
      library_root: input.library_root,
      library
    });
    reconciliation = planAdminReadModelStoreReconciliation({
      status,
      library_available: Boolean(library)
    });
  } catch {
    // Reconciliation hint is response metadata; failing to compute it should not fail the command.
  }

  return {
    command: input.command,
    invalidation_reason: reason,
    stale_mark: result,
    reconciliation
  };
}
