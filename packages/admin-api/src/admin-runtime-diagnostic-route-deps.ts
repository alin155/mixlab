import type {
  AdminRuntimeDiagnosticRouteApiInput,
  AdminRuntimeDiagnosticRouteDeps
} from "./admin-runtime-diagnostic-routes.ts";

type MaybePromise<T> = T | Promise<T>;

interface RuntimeDiagnosticContext<TEnv> {
  library_root: string;
  now: string;
  env: TEnv;
}

export interface AdminRuntimeDiagnosticAsrTestResult {
  passed: boolean;
  message: string;
}

export interface CreateAdminRuntimeDiagnosticRouteDepsInput<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TEnv,
  TDoctorReport,
  TDoctorExport,
  TAsrTestResult
> {
  env: TEnv;
  diagnostic_now(): string;
  refresh_runtime_secrets(): MaybePromise<void>;
  run_doctor_command(input: RuntimeDiagnosticContext<TEnv>): Promise<TDoctorReport>;
  export_doctor_command(input: RuntimeDiagnosticContext<TEnv>): Promise<TDoctorExport>;
  test_asr_config(input: {
    api_input: TApiInput;
    env: TEnv;
  }): MaybePromise<TAsrTestResult>;
}

export interface CreateAdminRuntimeDiagnosticRouteServerDepsInput<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TEnv,
  TDoctorReport,
  TDoctorExport
> extends Omit<
  CreateAdminRuntimeDiagnosticRouteDepsInput<
    TApiInput,
    TEnv,
    TDoctorReport,
    TDoctorExport,
    AdminRuntimeDiagnosticAsrTestResult
  >,
  "run_doctor_command" | "export_doctor_command" | "test_asr_config"
> {
  run_doctor_report(input: RuntimeDiagnosticContext<TEnv>): Promise<TDoctorReport>;
  export_doctor_report(input: RuntimeDiagnosticContext<TEnv>): Promise<TDoctorExport>;
  read_dashscope_api_key(env: TEnv): string | undefined;
}

export function createAdminRuntimeDiagnosticRouteDeps<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TEnv,
  TDoctorReport,
  TDoctorExport,
  TAsrTestResult
>(
  input: CreateAdminRuntimeDiagnosticRouteDepsInput<
    TApiInput,
    TEnv,
    TDoctorReport,
    TDoctorExport,
    TAsrTestResult
  >
): AdminRuntimeDiagnosticRouteDeps<TApiInput, TDoctorReport, TDoctorExport, TAsrTestResult> {
  function diagnosticContext(apiInput: TApiInput): RuntimeDiagnosticContext<TEnv> {
    return {
      library_root: apiInput.library_root,
      now: input.diagnostic_now(),
      env: input.env
    };
  }

  return {
    refresh_runtime_secrets: input.refresh_runtime_secrets,
    run_doctor(apiInput) {
      return input.run_doctor_command(diagnosticContext(apiInput));
    },
    export_doctor(apiInput) {
      return input.export_doctor_command(diagnosticContext(apiInput));
    },
    test_asr(apiInput) {
      return input.test_asr_config({
        api_input: apiInput,
        env: input.env
      });
    }
  };
}

export function createAdminRuntimeDiagnosticRouteServerDeps<
  TApiInput extends AdminRuntimeDiagnosticRouteApiInput,
  TEnv,
  TDoctorReport,
  TDoctorExport
>(
  input: CreateAdminRuntimeDiagnosticRouteServerDepsInput<
    TApiInput,
    TEnv,
    TDoctorReport,
    TDoctorExport
  >
): AdminRuntimeDiagnosticRouteDeps<
  TApiInput,
  TDoctorReport,
  TDoctorExport,
  AdminRuntimeDiagnosticAsrTestResult
> {
  const {
    run_doctor_report,
    export_doctor_report,
    read_dashscope_api_key,
    ...routeDepsInput
  } = input;

  return createAdminRuntimeDiagnosticRouteDeps({
    ...routeDepsInput,
    run_doctor_command: run_doctor_report,
    export_doctor_command: export_doctor_report,
    test_asr_config({ env }) {
      const hasDashScopeKey = Boolean(read_dashscope_api_key(env)?.trim());
      return {
        passed: hasDashScopeKey,
        message: hasDashScopeKey
          ? "DashScope API Key 已配置，未执行真实音频提交。"
          : "DashScope API Key 未配置。"
      };
    }
  });
}
