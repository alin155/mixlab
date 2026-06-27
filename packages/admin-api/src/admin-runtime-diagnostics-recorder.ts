import type {
  AdminRuntimeDiagnosticsHistoryEntry,
  AdminRuntimeEndpointMeta
} from "./admin-runtime-observability.ts";
import {
  appendAdminRuntimeDiagnosticsHistory
} from "./admin-runtime-observability.ts";

export interface AdminRuntimeDiagnosticsRecorderDeps {
  append_runtime_diagnostics_history(input: {
    library_root: string;
    recorded_at: string;
    runtime: AdminRuntimeEndpointMeta;
  }): Promise<AdminRuntimeDiagnosticsHistoryEntry>;
}

export type AdminRuntimeDiagnosticsRecorder = (
  libraryRoot: string,
  runtime: AdminRuntimeEndpointMeta
) => Promise<void>;

export function createAdminRuntimeDiagnosticsRecorder(input: {
  recorded_at: string;
  deps: AdminRuntimeDiagnosticsRecorderDeps;
}): AdminRuntimeDiagnosticsRecorder {
  return async (libraryRoot, runtime) => {
    await input.deps.append_runtime_diagnostics_history({
      library_root: libraryRoot,
      recorded_at: input.recorded_at,
      runtime
    });
  };
}

export function createDefaultAdminRuntimeDiagnosticsRecorder(input: {
  recorded_at: string;
}): AdminRuntimeDiagnosticsRecorder {
  return createAdminRuntimeDiagnosticsRecorder({
    recorded_at: input.recorded_at,
    deps: {
      append_runtime_diagnostics_history: appendAdminRuntimeDiagnosticsHistory
    }
  });
}
