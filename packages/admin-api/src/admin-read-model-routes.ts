import type { LibraryCounts } from "../../protocol/src/index.ts";
import {
  buildAdminDataLoadingPlan
} from "./admin-data-loading-plan.ts";
import type {
  AdminReadModelStoreReconciliationPlan,
  AdminReadModelStoreStatus
} from "./admin-read-model-store.ts";
import {
  buildAdminOperationsOverview
} from "./admin-operations-overview.ts";
import type { AdminOperationLogReadResult } from "./admin-operation-log.ts";
import type { AdminProtectionStatus } from "./admin-protection.ts";
import type { AdminReleaseGatesStatus } from "./admin-release-gates.ts";
import type {
  AdminSourceVideoStatusReadModelRuntimeStatus
} from "./admin-source-video-status-read-model-runtime.ts";
import {
  apiOk,
  parseAdminRouteLimit,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminReadModelRouteApiInput {
  library_root: string;
  now?: () => string;
}

export interface AdminReadModelRouteReconciler {
  status(): unknown;
  start(): { accepted: boolean };
  cancel(): unknown;
}

export interface AdminReadModelRouteDeps {
  manifest_cache_ttl_ms: number;
  read_model_reconciler: AdminReadModelRouteReconciler;
  read_library_manifest(libraryRoot: string): Promise<(LibraryCounts & { updated_at?: string }) | null>;
  read_admin_read_model_store_status(input: {
    library_root: string;
    library: (LibraryCounts & { updated_at?: string }) | null;
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
}

export type AdminReadModelRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminReadModelRoutesInput {
  method: string;
  pathname: string;
  search_params: URLSearchParams;
  request_now: string;
  api_input: AdminReadModelRouteApiInput;
  deps: AdminReadModelRouteDeps;
}

export function buildAdminRouteDataLoadingPlan(input: {
  api_input: AdminReadModelRouteApiInput;
  deps: AdminReadModelRouteDeps;
}) {
  const now = input.api_input.now?.() ?? new Date().toISOString();
  return buildAdminDataLoadingPlan({
    generated_at: now,
    manifest_cache_ttl_ms: input.deps.manifest_cache_ttl_ms
  });
}

export async function buildAdminRouteReadModelStatus(input: {
  api_input: AdminReadModelRouteApiInput;
  deps: AdminReadModelRouteDeps;
}) {
  const now = input.api_input.now?.() ?? new Date().toISOString();
  const library = await input.deps.read_library_manifest(input.api_input.library_root);
  const adminReadModelStore = await input.deps.read_admin_read_model_store_status({
    library_root: input.api_input.library_root,
    library
  });
  const adminReadModelReconciliation = input.deps.plan_admin_read_model_store_reconciliation({
    status: adminReadModelStore,
    library_available: Boolean(library)
  });

  return {
    schema_version: "1.0",
    generated_at: now,
    admin_read_model: {
      ...adminReadModelStore,
      reconciliation: adminReadModelReconciliation
    },
    source_video_status: await input.deps.read_source_video_status_read_model_status({
      library_root: input.api_input.library_root,
      now
    })
  };
}

export async function buildAdminRouteOperationsOverview(input: {
  api_input: AdminReadModelRouteApiInput;
  deps: AdminReadModelRouteDeps;
}) {
  const now = input.api_input.now?.() ?? new Date().toISOString();
  const release = await input.deps.get_release_gates(input.api_input);
  const [protection, readModel, dataLoading] = await Promise.all([
    input.deps.get_protection_status(input.api_input),
    buildAdminRouteReadModelStatus(input),
    Promise.resolve(buildAdminRouteDataLoadingPlan(input))
  ]);

  return buildAdminOperationsOverview({
    generated_at: now,
    protection,
    release,
    read_model: readModel,
    data_loading: dataLoading
  });
}

export async function handleAdminReadModelRoutes(
  input: HandleAdminReadModelRoutesInput
): Promise<AdminReadModelRouteResult> {
  if (input.method === "GET" && input.pathname === "/api/admin/data-loading/plan") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(buildAdminRouteDataLoadingPlan(input))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/read-model/status") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await buildAdminRouteReadModelStatus(input))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/read-model/reconcile/status") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(input.deps.read_model_reconciler.status())
    };
  }

  if (input.method === "POST" && input.pathname === "/api/admin/read-model/reconcile") {
    const result = input.deps.read_model_reconciler.start();
    return {
      handled: true,
      status_code: result.accepted ? 202 : 200,
      body: apiOk(result)
    };
  }

  if (input.method === "POST" && input.pathname === "/api/admin/read-model/reconcile/cancel") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(input.deps.read_model_reconciler.cancel())
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/operations/overview") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await buildAdminRouteOperationsOverview(input))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/operation-log") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_operation_log({
        library_root: input.api_input.library_root,
        generated_at: input.request_now,
        limit: parseAdminRouteLimit(input.search_params, { max_limit: 100 }),
        max_wait_ms: 750,
        cache_ttl_ms: 2_000
      }))
    };
  }

  return { handled: false };
}
