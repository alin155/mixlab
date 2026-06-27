import type {
  AdminRuntimeObservabilityRouteDeps
} from "./admin-runtime-observability-routes.ts";
import type {
  AdminRuntimeDiagnosticsHistoryReadResult,
  ReadAdminRuntimeDiagnosticsHistoryInput
} from "./admin-runtime-observability.ts";

export interface AdminRuntimeDiagnosticsHistoryInput {
  library_root: string;
  generated_at: string;
  limit?: number;
}

export interface CreateAdminRuntimeObservabilityRouteDepsInput<TRuntimeDiagnosticsHistory> {
  read_runtime_diagnostics_history(
    input: AdminRuntimeDiagnosticsHistoryInput
  ): Promise<TRuntimeDiagnosticsHistory>;
}

export type ReadAdminRuntimeDiagnosticsHistoryService = (
  input: ReadAdminRuntimeDiagnosticsHistoryInput
) => Promise<AdminRuntimeDiagnosticsHistoryReadResult>;

export interface CreateAdminRuntimeObservabilityRouteServerDepsInput {
  read_runtime_diagnostics_history_service: ReadAdminRuntimeDiagnosticsHistoryService;
}

export function createAdminRuntimeObservabilityRouteDeps<TRuntimeDiagnosticsHistory>(
  input: CreateAdminRuntimeObservabilityRouteDepsInput<TRuntimeDiagnosticsHistory>
): AdminRuntimeObservabilityRouteDeps<TRuntimeDiagnosticsHistory> {
  return {
    read_runtime_diagnostics_history: input.read_runtime_diagnostics_history
  };
}

export function createAdminRuntimeObservabilityRouteServerDeps(
  input: CreateAdminRuntimeObservabilityRouteServerDepsInput
): AdminRuntimeObservabilityRouteDeps<AdminRuntimeDiagnosticsHistoryReadResult> {
  return createAdminRuntimeObservabilityRouteDeps({
    read_runtime_diagnostics_history: input.read_runtime_diagnostics_history_service
  });
}
