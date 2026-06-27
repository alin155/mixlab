import {
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

type MaybePromise<T> = T | Promise<T>;

export interface AdminSystemReadRouteApiInput {
  library_root: string;
}

export interface AdminSystemReadRouteDeps<
  TApiInput extends AdminSystemReadRouteApiInput,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
> {
  read_library_status(input: TApiInput): Promise<TLibraryStatus>;
  read_settings_config(libraryRoot: string): Promise<TSettingsConfig>;
  refresh_runtime_secrets(): MaybePromise<void>;
  read_runtime_settings(libraryRoot: string): Promise<TRuntimeSettings>;
  read_doctor_report(input: TApiInput): Promise<TDoctorReport>;
  list_cutter_users(libraryRoot: string): Promise<{ users: TCutterUser[] }>;
  to_public_cutter_user(user: TCutterUser): TPublicCutterUser;
}

export type AdminSystemReadRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminSystemReadRoutesInput<
  TApiInput extends AdminSystemReadRouteApiInput,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminSystemReadRouteDeps<
    TApiInput,
    TLibraryStatus,
    TSettingsConfig,
    TRuntimeSettings,
    TDoctorReport,
    TCutterUser,
    TPublicCutterUser
  >;
}

export async function handleAdminSystemReadRoutes<
  TApiInput extends AdminSystemReadRouteApiInput,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
>(
  input: HandleAdminSystemReadRoutesInput<
    TApiInput,
    TLibraryStatus,
    TSettingsConfig,
    TRuntimeSettings,
    TDoctorReport,
    TCutterUser,
    TPublicCutterUser
  >
): Promise<AdminSystemReadRouteResult> {
  if (input.method === "GET" && input.pathname === "/api/admin/library/status") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_library_status(input.api_input))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/settings/config") {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_settings_config(input.api_input.library_root))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/settings/runtime") {
    await input.deps.refresh_runtime_secrets();
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_runtime_settings(input.api_input.library_root))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/doctor/report") {
    await input.deps.refresh_runtime_secrets();
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.read_doctor_report(input.api_input))
    };
  }

  if (input.method === "GET" && input.pathname === "/api/admin/cutter-users") {
    const users = await input.deps.list_cutter_users(input.api_input.library_root);
    return {
      handled: true,
      status_code: 200,
      body: apiOk({
        users: users.users.map(input.deps.to_public_cutter_user)
      })
    };
  }

  return { handled: false };
}
