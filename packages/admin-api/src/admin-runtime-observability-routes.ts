import {
  apiOk,
  parseAdminRouteLimit,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminRuntimeObservabilityRouteApiInput {
  library_root: string;
}

export interface AdminRuntimeObservabilityRouteDeps<TRuntimeDiagnosticsHistory> {
  read_runtime_diagnostics_history(input: {
    library_root: string;
    generated_at: string;
    limit?: number;
  }): Promise<TRuntimeDiagnosticsHistory>;
}

export type AdminRuntimeObservabilityRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminRuntimeObservabilityRoutesInput<TRuntimeDiagnosticsHistory> {
  method: string;
  pathname: string;
  search_params: URLSearchParams;
  request_now: string;
  api_input: AdminRuntimeObservabilityRouteApiInput;
  deps: AdminRuntimeObservabilityRouteDeps<TRuntimeDiagnosticsHistory>;
}

export async function handleAdminRuntimeObservabilityRoutes<TRuntimeDiagnosticsHistory>(
  input: HandleAdminRuntimeObservabilityRoutesInput<TRuntimeDiagnosticsHistory>
): Promise<AdminRuntimeObservabilityRouteResult> {
  if (input.method === "GET" && input.pathname === "/api/admin/runtime/diagnostics/history") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_runtime_diagnostics_history({
        library_root: input.api_input.library_root,
        generated_at: input.request_now,
        limit: parseAdminRouteLimit(input.search_params, { max_limit: 200 })
      }))
    };
  }

  return { handled: false };
}
