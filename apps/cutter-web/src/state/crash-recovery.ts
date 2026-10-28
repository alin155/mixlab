export interface CutterCrashDiagnostics {
  schema_version: "cutter-crash-v1";
  occurred_at: string;
  route: string;
  user_agent: string;
  app_version: string;
  error_name: string;
  error_message: string;
  error_stack: string;
  component_stack: string;
  storage_keys: string[];
}

export interface BuildCutterCrashDiagnosticsInput {
  error: unknown;
  now?: string;
  route?: string;
  userAgent?: string;
  appVersion?: string;
  componentStack?: string;
  storageKeys?: readonly string[];
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4_000;

function truncated(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength) + "…";
}

/**
 * Build a sanitized crash report. Only storage KEY NAMES are included (never
 * values) so auth tokens, project contents or the cut list cannot leak into a
 * copied/exported diagnostics blob.
 */
export function buildCutterCrashDiagnostics(
  input: BuildCutterCrashDiagnosticsInput
): CutterCrashDiagnostics {
  const error = input.error;
  const errorMessage = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : String(error ?? "");
  const errorName = error instanceof Error && error.name ? error.name : "Error";
  const errorStack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";

  return {
    schema_version: "cutter-crash-v1",
    occurred_at: input.now ?? new Date().toISOString(),
    route: input.route ?? "",
    user_agent: input.userAgent ?? "",
    app_version: input.appVersion ?? "",
    error_name: truncated(errorName, 120),
    error_message: truncated(errorMessage, MAX_MESSAGE_LENGTH),
    error_stack: truncated(errorStack, MAX_STACK_LENGTH),
    component_stack: truncated(input.componentStack ?? "", MAX_STACK_LENGTH),
    storage_keys: [...(input.storageKeys ?? [])].slice(0, 200)
  };
}

export function formatCutterCrashDiagnostics(diagnostics: CutterCrashDiagnostics): string {
  return JSON.stringify(diagnostics, null, 2);
}
