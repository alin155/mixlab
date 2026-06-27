import type {
  AdminApiClient,
  AdminDataLoadingPlan,
  AdminGateStatus,
  AdminOperationsOverview,
  AdminReadModelReconcilerStatus,
  AdminReleaseGate
} from "../../api.ts";

export type {
  AdminGateStatus,
  AdminOperationsOverview,
  AdminReadModelReconcilerStatus,
  AdminReleaseGate
};

export const PROTECTION_CENTER_ROUTE = "protection";
export const PROTECTION_CENTER_OVERVIEW_ENDPOINT = "/api/admin/operations/overview";
export const PROTECTION_CENTER_RECONCILE_STATUS_ENDPOINT = "/api/admin/read-model/reconcile/status";
export const PROTECTION_CENTER_RECONCILE_START_ENDPOINT = "/api/admin/read-model/reconcile";
export const PROTECTION_CENTER_RECONCILE_CANCEL_ENDPOINT = "/api/admin/read-model/reconcile/cancel";
export const PROTECTION_CENTER_ENDPOINTS = [
  PROTECTION_CENTER_OVERVIEW_ENDPOINT,
  PROTECTION_CENTER_RECONCILE_STATUS_ENDPOINT
] as const;
export const PROTECTION_CENTER_COMMAND_ENDPOINTS = [
  PROTECTION_CENTER_RECONCILE_START_ENDPOINT,
  PROTECTION_CENTER_RECONCILE_CANCEL_ENDPOINT
] as const;

export interface ProtectionCenterClient extends Pick<
  AdminApiClient,
  "getOperationsOverview" | "getReadModelReconcileStatus"
> {}

export interface ProtectionCenterData {
  route: typeof PROTECTION_CENTER_ROUTE;
  read_only: true;
  endpoints: typeof PROTECTION_CENTER_ENDPOINTS;
  overview: AdminOperationsOverview;
  read_model_reconcile_status: AdminReadModelReconcilerStatus | null;
  read_model_reconcile_error: string;
}

function protectionCenterErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadProtectionCenterData(
  client: ProtectionCenterClient
): Promise<ProtectionCenterData> {
  const [overview, readModelReconcileStatusResult] = await Promise.all([
    client.getOperationsOverview(),
    client.getReadModelReconcileStatus()
      .then((status) => ({
        status,
        error: ""
      }))
      .catch((error) => ({
        status: null,
        error: protectionCenterErrorMessage(error)
      }))
  ]);

  return {
    route: PROTECTION_CENTER_ROUTE,
    read_only: true,
    endpoints: PROTECTION_CENTER_ENDPOINTS,
    overview,
    read_model_reconcile_status: readModelReconcileStatusResult.status,
    read_model_reconcile_error: readModelReconcileStatusResult.error
  };
}

export function protectionCenterPlanEndpoints(
  plan: AdminDataLoadingPlan
): readonly string[] {
  return plan.routes.find((route) => route.route === PROTECTION_CENTER_ROUTE)?.endpoints ?? [];
}

export function protectionCenterPlanMatchesRouteEndpoints(
  plan: AdminDataLoadingPlan
): boolean {
  const endpoints = protectionCenterPlanEndpoints(plan);
  return endpoints.length === PROTECTION_CENTER_ENDPOINTS.length
    && endpoints.every((endpoint, index) => endpoint === PROTECTION_CENTER_ENDPOINTS[index]);
}
