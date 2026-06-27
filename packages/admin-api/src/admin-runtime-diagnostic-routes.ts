import {
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

type MaybePromise<T> = T | Promise<T>;

export interface AdminRuntimeDiagnosticRouteApiInput {
  library_root: string;
}

export interface AdminRuntimeDiagnosticRouteDeps<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TDoctorReport,
  TDoctorExport,
  TAsrTestResult
> {
  refresh_runtime_secrets(): MaybePromise<void>;
  run_doctor(input: TApiInput): Promise<TDoctorReport>;
  export_doctor(input: TApiInput): Promise<TDoctorExport>;
  test_asr(input: TApiInput): MaybePromise<TAsrTestResult>;
}

export type AdminRuntimeDiagnosticRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminRuntimeDiagnosticRoutesInput<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TDoctorReport,
  TDoctorExport,
  TAsrTestResult
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminRuntimeDiagnosticRouteDeps<TApiInput, TDoctorReport, TDoctorExport, TAsrTestResult>;
}

export function matchAdminDoctorRunPath(pathname: string): boolean {
  return pathname === "/api/admin/doctor/run";
}

export function matchAdminDoctorExportPath(pathname: string): boolean {
  return pathname === "/api/admin/doctor/export";
}

export function matchAdminSettingsTestAsrPath(pathname: string): boolean {
  return pathname === "/api/admin/settings/test-asr";
}

export async function handleAdminRuntimeDiagnosticRoutes<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TDoctorReport,
  TDoctorExport,
  TAsrTestResult
>(
  input: HandleAdminRuntimeDiagnosticRoutesInput<
    TApiInput,
    TDoctorReport,
    TDoctorExport,
    TAsrTestResult
  >
): Promise<AdminRuntimeDiagnosticRouteResult> {
  if (input.method === "POST" && matchAdminDoctorRunPath(input.pathname)) {
    await input.deps.refresh_runtime_secrets();
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.run_doctor(input.api_input))
    };
  }

  if (input.method === "POST" && matchAdminDoctorExportPath(input.pathname)) {
    await input.deps.refresh_runtime_secrets();
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.export_doctor(input.api_input))
    };
  }

  if (input.method === "POST" && matchAdminSettingsTestAsrPath(input.pathname)) {
    await input.deps.refresh_runtime_secrets();
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.test_asr(input.api_input))
    };
  }

  return { handled: false };
}
