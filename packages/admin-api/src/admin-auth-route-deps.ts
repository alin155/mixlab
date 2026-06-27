import {
  getAdminAuthBootstrapStatus,
  publicAdminUser,
  validateAdminSession,
  type AdminSessionRecord,
  type AdminUserRecord
} from "../../library-fs/src/index.ts";
import {
  runAdminAuthLoginCommand,
  runAdminAuthLogoutCommand,
  runAdminAuthRegisterCommand
} from "./admin-auth-commands.ts";
import type {
  AdminAuthRouteApiInput,
  AdminAuthRouteDeps
} from "./admin-auth-routes.ts";

export interface CreateAdminAuthRouteDepsInput<
  TApiInput extends AdminAuthRouteApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
> {
  read_request_json(): Promise<unknown>;
  read_health(input: TApiInput, options: { deep: boolean }): Promise<THealth>;
  read_bootstrap(input: TApiInput): Promise<TBootstrap>;
  validate_session(
    input: TApiInput,
    session: { session_token: string; now: string }
  ): Promise<{ ok: true; user: TUser } | { ok: false; reason: string }>;
  register_first_admin(
    input: TApiInput,
    registration: { username: string; password: string; display_name?: string; now: string }
  ): Promise<{ user: TUser; session: TSession }>;
  login_admin(
    input: TApiInput,
    login: { username: string; password: string; now: string }
  ): Promise<{ ok: true; user: TUser; session: TSession } | { ok: false; reason: string }>;
  logout_admin_session(input: TApiInput, logout: { session_token: string }): Promise<TLogout>;
  project_admin_user(user: TUser): TPublicUser;
}

export function createAdminAuthRouteDeps<
  TApiInput extends AdminAuthRouteApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
>(
  input: CreateAdminAuthRouteDepsInput<
    TApiInput,
    THealth,
    TBootstrap,
    TUser,
    TPublicUser,
    TSession,
    TLogout
  >
): AdminAuthRouteDeps<
  TApiInput,
  THealth,
  TBootstrap,
  TUser,
  TPublicUser,
  TSession,
  TLogout
> {
  return {
    read_health: input.read_health,
    read_bootstrap: input.read_bootstrap,
    validate_session: input.validate_session,
    register_first_admin: input.register_first_admin,
    login_admin: input.login_admin,
    logout_admin_session: input.logout_admin_session,
    project_admin_user: input.project_admin_user,
    read_request_json: input.read_request_json
  };
}

export interface CreateAdminAuthRouteServerDepsInput<
  TApiInput extends AdminAuthRouteApiInput,
  THealth
> {
  now: string;
  read_request_json(): Promise<unknown>;
  read_health(input: TApiInput, options: { deep: boolean }): Promise<THealth>;
}

export function createAdminAuthRouteServerDeps<
  TApiInput extends AdminAuthRouteApiInput,
  THealth
>(
  input: CreateAdminAuthRouteServerDepsInput<TApiInput, THealth>
): AdminAuthRouteDeps<
  TApiInput,
  THealth,
  Awaited<ReturnType<typeof getAdminAuthBootstrapStatus>>,
  AdminUserRecord,
  Omit<AdminUserRecord, "password_hash">,
  AdminSessionRecord,
  Awaited<ReturnType<typeof runAdminAuthLogoutCommand>>
> {
  return createAdminAuthRouteDeps({
    read_health: input.read_health,
    read_bootstrap(routeInput) {
      return getAdminAuthBootstrapStatus(routeInput.library_root);
    },
    validate_session(routeInput, session) {
      return validateAdminSession(routeInput.library_root, session);
    },
    register_first_admin(routeInput, registration) {
      return runAdminAuthRegisterCommand({
        library_root: routeInput.library_root,
        username: registration.username,
        password: registration.password,
        display_name: registration.display_name,
        now: registration.now
      });
    },
    login_admin(routeInput, login) {
      return runAdminAuthLoginCommand({
        library_root: routeInput.library_root,
        username: login.username,
        password: login.password,
        now: login.now
      });
    },
    logout_admin_session(routeInput, logout) {
      return runAdminAuthLogoutCommand({
        library_root: routeInput.library_root,
        session_token: logout.session_token,
        now: input.now
      });
    },
    project_admin_user: publicAdminUser,
    read_request_json: input.read_request_json
  });
}
