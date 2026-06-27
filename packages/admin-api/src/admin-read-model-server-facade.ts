import type {
  AdminOperationLogAppendInput,
  AdminOperationLogEvent,
  AdminOperationLogReadResult
} from "./admin-operation-log.ts";
import type { AdminProtectionStatus } from "./admin-protection.ts";
import type {
  AdminReadModelInvalidationHandoff
} from "./admin-read-model-invalidation.ts";
import {
  scheduleAdminReadModelReconcileAfterScan,
  type AdminReadModelReconcileScheduleResult
} from "./admin-read-model-reconcile-scheduler.ts";
import {
  createAdminReadModelReconcilerRuntime,
  type AdminReadModelReconcilerRuntime,
  type AdminReadModelReconcilerRuntimeDeps
} from "./admin-read-model-reconciler-runtime.ts";
import type {
  AdminReadModelRouteApiInput,
  AdminReadModelRouteDeps
} from "./admin-read-model-routes.ts";
import type {
  AdminReadModelStoreReconciliationPlan,
  AdminReadModelStoreStatus
} from "./admin-read-model-store.ts";
import type { AdminReleaseGatesStatus } from "./admin-release-gates.ts";
import type {
  AdminSourceVideoStatusReadModelRuntimeStatus
} from "./admin-source-video-status-read-model-runtime.ts";

export interface AdminReadModelServerFacadeInput {
  library_root: string;
  default_page_limit: number;
  manifest_cache_ttl_ms: number;
  now: () => string;
  deps: AdminReadModelReconcilerRuntimeDeps & {
    read_admin_read_model_store_status(input: {
      library_root: string;
      library: Awaited<ReturnType<AdminReadModelReconcilerRuntimeDeps["read_library_manifest"]>>;
    }): Promise<AdminReadModelStoreStatus>;
    plan_admin_read_model_store_reconciliation(input: {
      status: AdminReadModelStoreStatus;
      library_available: boolean;
    }): AdminReadModelStoreReconciliationPlan;
    read_source_video_status_read_model_status(input: {
      library_root: string;
      now: string;
    }): Promise<AdminSourceVideoStatusReadModelRuntimeStatus>;
    get_protection_status(input: AdminReadModelRouteApiInput): Promise<AdminProtectionStatus>;
    get_release_gates(input: AdminReadModelRouteApiInput): Promise<AdminReleaseGatesStatus>;
    read_operation_log(input: {
      library_root: string;
      generated_at: string;
      limit?: number;
      max_wait_ms?: number;
      cache_ttl_ms?: number;
    }): Promise<AdminOperationLogReadResult>;
    append_operation_log_event(input: AdminOperationLogAppendInput): Promise<AdminOperationLogEvent>;
  };
}

export interface AdminReadModelServerFacade {
  read_model_reconciler: AdminReadModelReconcilerRuntime;
  read_model_route_deps: AdminReadModelRouteDeps;
  schedule_read_model_reconcile_after_scan(input: {
    handoff: AdminReadModelInvalidationHandoff | null;
  }): AdminReadModelReconcileScheduleResult;
}

export function createAdminReadModelServerFacade(
  input: AdminReadModelServerFacadeInput
): AdminReadModelServerFacade {
  const readModelReconciler = createAdminReadModelReconcilerRuntime({
    library_root: input.library_root,
    default_page_limit: input.default_page_limit,
    now: input.now,
    deps: input.deps
  });

  return {
    read_model_reconciler: readModelReconciler,
    read_model_route_deps: {
      manifest_cache_ttl_ms: input.manifest_cache_ttl_ms,
      read_model_reconciler: readModelReconciler,
      read_library_manifest: input.deps.read_library_manifest,
      read_admin_read_model_store_status: input.deps.read_admin_read_model_store_status,
      plan_admin_read_model_store_reconciliation:
        input.deps.plan_admin_read_model_store_reconciliation,
      read_source_video_status_read_model_status:
        input.deps.read_source_video_status_read_model_status,
      get_protection_status: input.deps.get_protection_status,
      get_release_gates: input.deps.get_release_gates,
      read_operation_log: input.deps.read_operation_log
    },
    schedule_read_model_reconcile_after_scan({ handoff }) {
      return scheduleAdminReadModelReconcileAfterScan({
        handoff,
        start_reconcile: () => readModelReconciler.start()
      });
    }
  };
}
