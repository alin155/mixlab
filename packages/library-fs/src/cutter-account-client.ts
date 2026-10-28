/**
 * Cutter 账号服务客户端适配层（Round5）：收敛到共享包 packages/service-clients。
 * 旧 users.json 实现保持不变；配置 URL 后代理到 /accounts/v1，失败不回退共享文件写入。
 */
import * as users from "./cutter-users.ts";
import {
  accountsServiceConnectionFromEnv as sharedAccountsServiceConnectionFromEnv,
  accountsServiceMode,
  accountServiceUrl,
  createCutterAccountsClient,
  type AccountServiceConnection
} from "../../service-clients/src/cutter-account-client.ts";

export type { AccountServiceConnection, BaseAccountServiceError } from "../../service-clients/src/cutter-account-client.ts";
export type AccountsServiceMode = "isolated-service" | "local-users-file";

export const ACCOUNTS_SERVICE_URL_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL";
export const ACCOUNTS_SERVICE_TOKEN_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN";
const LEGACY_ACCOUNTS_SERVICE_URL_ENV = "MIXLAB_ACCOUNT_SERVICE_URL";
const LEGACY_ACCOUNTS_SERVICE_TOKEN_ENV = "MIXLAB_ACCOUNT_SERVICE_TOKEN";

export const localCutterAccounts = {
  createCutterLoginApplication: users.createCutterLoginApplication,
  registerCutterAccount: users.registerCutterAccount,
  loginCutterAccount: users.loginCutterAccount,
  logoutCutterSession: users.logoutCutterSession,
  changeCutterAccountPassword: users.changeCutterAccountPassword,
  resetCutterUserPassword: users.resetCutterUserPassword,
  approveCutterUser: users.approveCutterUser,
  ensureCutterSessionForDevice: users.ensureCutterSessionForDevice,
  disableCutterUser: users.disableCutterUser,
  listCutterUsers: users.listCutterUsers,
  validateCutterSession: users.validateCutterSession
};
export type CutterAccounts = typeof localCutterAccounts;
export type AccountOperation = keyof CutterAccounts;
export type AccountServiceClientError = Error & { code: string; status?: number; service_area: "accounts" };

const SERVICE_OPERATION_BY_LOCAL: Record<AccountOperation, string> = {
  createCutterLoginApplication: "create_login_application",
  registerCutterAccount: "register",
  loginCutterAccount: "login",
  logoutCutterSession: "logout",
  changeCutterAccountPassword: "change_password",
  resetCutterUserPassword: "reset_password",
  approveCutterUser: "approve",
  ensureCutterSessionForDevice: "ensure_session_for_device",
  disableCutterUser: "disable",
  listCutterUsers: "list",
  validateCutterSession: "validate"
};

export { accountsServiceMode, accountServiceUrl };

export function accountServiceFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env,
  role: "client" | "admin" = "client"
): AccountServiceConnection | undefined {
  const connection = sharedAccountsServiceConnectionFromEnv(env, {
    url_env_names: [ACCOUNTS_SERVICE_URL_ENV, LEGACY_ACCOUNTS_SERVICE_URL_ENV],
    token_env_names: [ACCOUNTS_SERVICE_TOKEN_ENV, LEGACY_ACCOUNTS_SERVICE_TOKEN_ENV],
    admin_token_env_names: ["MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN", "MIXLAB_ACCOUNT_SERVICE_ADMIN_TOKEN"]
  });
  if (!connection) return undefined;
  // Admin call sites keep using the admin token as their primary token; the factory picks the
  // admin token per operation when both tokens are available, so client traffic stays client-scoped.
  if (role === "admin") {
    return { ...connection, token: connection.admin_token ?? connection.token };
  }
  return connection;
}

export function createCutterAccounts(connection?: AccountServiceConnection): CutterAccounts {
  return createCutterAccountsClient({
    ...(connection ? { connection } : {}),
    local: localCutterAccounts,
    operation_names: SERVICE_OPERATION_BY_LOCAL
  });
}
