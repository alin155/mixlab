import type {
  AdminSystemReadRouteApiInput,
  AdminSystemReadRouteDeps
} from "./admin-system-read-routes.ts";

type MaybePromise<T> = T | Promise<T>;

interface SystemReadRuntimeContext<TEnv> {
  library_root: string;
  env: TEnv;
}

interface SystemReadDoctorContext<TEnv> extends SystemReadRuntimeContext<TEnv> {
  now: string;
}

export interface CreateAdminSystemReadRouteDepsInput<
  TApiInput extends AdminSystemReadRouteApiInput,
  TEnv,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
> {
  env: TEnv;
  diagnostic_now(): string;
  read_library_status(input: TApiInput): Promise<TLibraryStatus>;
  read_settings_config(libraryRoot: string): Promise<TSettingsConfig>;
  refresh_runtime_secrets(): MaybePromise<void>;
  read_runtime_settings(input: SystemReadRuntimeContext<TEnv>): Promise<TRuntimeSettings>;
  read_doctor_report(input: SystemReadDoctorContext<TEnv>): Promise<TDoctorReport>;
  list_cutter_users(libraryRoot: string): Promise<{ users: TCutterUser[] }>;
  to_public_cutter_user(user: TCutterUser): TPublicCutterUser;
}

export type ReadAdminSystemLibraryStatusService<TApiInput, TLibraryStatus> = (
  input: TApiInput
) => Promise<TLibraryStatus>;

export type ReadAdminSystemSettingsConfigService<TSettingsConfig> = (
  libraryRoot: string
) => Promise<TSettingsConfig>;

export type RefreshAdminSystemRuntimeSecretsService = () => MaybePromise<void>;

export type ReadAdminSystemRuntimeSettingsService<TEnv, TRuntimeSettings> = (
  input: SystemReadRuntimeContext<TEnv>
) => Promise<TRuntimeSettings>;

export type ReadAdminSystemDoctorReportService<TEnv, TDoctorReport> = (
  input: SystemReadDoctorContext<TEnv>
) => Promise<TDoctorReport>;

export type ListAdminSystemCutterUsersService<TCutterUser> = (
  libraryRoot: string
) => Promise<{ users: TCutterUser[] }>;

export type ProjectAdminSystemPublicCutterUser<TCutterUser, TPublicCutterUser> = (
  user: TCutterUser
) => TPublicCutterUser;

export function createAdminSystemReadRouteDeps<
  TApiInput extends AdminSystemReadRouteApiInput,
  TEnv,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
>(
  input: CreateAdminSystemReadRouteDepsInput<
    TApiInput,
    TEnv,
    TLibraryStatus,
    TSettingsConfig,
    TRuntimeSettings,
    TDoctorReport,
    TCutterUser,
    TPublicCutterUser
  >
): AdminSystemReadRouteDeps<
  TApiInput,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
> {
  return {
    read_library_status: input.read_library_status,
    read_settings_config: input.read_settings_config,
    refresh_runtime_secrets: input.refresh_runtime_secrets,
    read_runtime_settings(libraryRoot) {
      return input.read_runtime_settings({
        library_root: libraryRoot,
        env: input.env
      });
    },
    read_doctor_report(apiInput) {
      return input.read_doctor_report({
        library_root: apiInput.library_root,
        now: input.diagnostic_now(),
        env: input.env
      });
    },
    list_cutter_users: input.list_cutter_users,
    to_public_cutter_user: input.to_public_cutter_user
  };
}

export interface CreateAdminSystemReadRouteServerDepsInput<
  TApiInput extends AdminSystemReadRouteApiInput,
  TEnv,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
> {
  env: TEnv;
  diagnostic_now(): string;
  read_library_status_service: ReadAdminSystemLibraryStatusService<TApiInput, TLibraryStatus>;
  read_settings_config_service: ReadAdminSystemSettingsConfigService<TSettingsConfig>;
  refresh_runtime_secrets_service: RefreshAdminSystemRuntimeSecretsService;
  read_runtime_settings_service: ReadAdminSystemRuntimeSettingsService<TEnv, TRuntimeSettings>;
  read_doctor_report_service: ReadAdminSystemDoctorReportService<TEnv, TDoctorReport>;
  list_cutter_users_service: ListAdminSystemCutterUsersService<TCutterUser>;
  project_public_cutter_user: ProjectAdminSystemPublicCutterUser<TCutterUser, TPublicCutterUser>;
}

export function createAdminSystemReadRouteServerDeps<
  TApiInput extends AdminSystemReadRouteApiInput,
  TEnv,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
>(
  input: CreateAdminSystemReadRouteServerDepsInput<
    TApiInput,
    TEnv,
    TLibraryStatus,
    TSettingsConfig,
    TRuntimeSettings,
    TDoctorReport,
    TCutterUser,
    TPublicCutterUser
  >
): AdminSystemReadRouteDeps<
  TApiInput,
  TLibraryStatus,
  TSettingsConfig,
  TRuntimeSettings,
  TDoctorReport,
  TCutterUser,
  TPublicCutterUser
> {
  return createAdminSystemReadRouteDeps({
    env: input.env,
    diagnostic_now: input.diagnostic_now,
    read_library_status: input.read_library_status_service,
    read_settings_config: input.read_settings_config_service,
    refresh_runtime_secrets: input.refresh_runtime_secrets_service,
    read_runtime_settings: input.read_runtime_settings_service,
    read_doctor_report: input.read_doctor_report_service,
    list_cutter_users: input.list_cutter_users_service,
    to_public_cutter_user: input.project_public_cutter_user
  });
}
