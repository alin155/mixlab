/**
 * Cutter 账号服务客户端适配层（Round5）：收敛到共享包 packages/service-clients。
 * 旧 users.json 实现保持不变；配置 URL 后代理到 /accounts/v1，失败不回退共享文件写入。
 */
import * as users from "./cutter-users.ts";
import type { CutterUserRecord } from "./cutter-users.ts";
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

const localCutterAccountOperations = {
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
  validateCutterSession: users.validateCutterSession,
  async listCutterUsersWithTiers(libraryRoot: string) {
    const { users: listed } = await users.listCutterUsers(libraryRoot);
    return {
      users: listed.map((user) => ({ ...user, tier: "ordinary" as const }))
    };
  },
  async getCutterAccountEntitlements(_libraryRoot?: string): Promise<CutterAccountEntitlements> {
    return { schema_version: "1.0", accounts: {} };
  },
  async refreshCutterSession(
    libraryRoot: string,
    input: { device_id: string; session_token: string; now: string }
  ): Promise<
    | { ok: true; user: CutterUserRecord; refreshed_at: string }
    | { ok: false; reason: string }
  > {
    const validation = await users.validateCutterSession(libraryRoot, {
      device_id: input.device_id,
      session_token: input.session_token,
      now: input.now,
      touch: true
    });
    return validation.ok
      ? { ok: true, user: validation.user, refreshed_at: input.now }
      : validation;
  }
};
export interface CutterAccountEntitlements {
  schema_version: "1.0";
  accounts: Record<string, "ordinary" | "pro">;
}
export type CutterAccounts = typeof localCutterAccountOperations & { mode: "local" | "service" };
export const localCutterAccounts: CutterAccounts = {
  ...localCutterAccountOperations,
  mode: "local"
};
export type AccountOperation = keyof typeof localCutterAccountOperations;
export type CutterAccountConnection = AccountServiceConnection;
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
  validateCutterSession: "validate",
  listCutterUsersWithTiers: "list_with_tiers",
  getCutterAccountEntitlements: "get_entitlements",
  refreshCutterSession: "refresh"
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
  const proxied = createCutterAccountsClient({
    ...(connection ? { connection } : {}),
    local: localCutterAccountOperations,
    operation_names: SERVICE_OPERATION_BY_LOCAL
  });
  return { ...proxied, mode: connection ? "service" : "local" } as CutterAccounts;
}

function mapLegacyAccountError(info: { status?: number; service_code?: string; message?: string }): Error {
  const status = info.status ?? 0;
  const code = status === 0 || status === 401 || status === 403 || status >= 500
    ? "account_service_unavailable"
    : "account_service_error";
  return Object.assign(new Error(info.message ?? "账号服务请求失败"), {
    code,
    status: status || 503,
    service_area: "accounts"
  });
}

/** 管理端兼容客户端：保留旧 account_service_* 错误码（cutter 侧继续用契约码）。 */
export function createCutterAccountsLegacy(connection?: AccountServiceConnection): CutterAccounts {
  if (!connection) return localCutterAccounts;
  const proxied = createCutterAccountsClient({
    connection,
    local: localCutterAccountOperations,
    operation_names: SERVICE_OPERATION_BY_LOCAL,
    map_error: mapLegacyAccountError
  });
  return { ...proxied, mode: "service" } as CutterAccounts;
}

/** 兼容管理端既有调用：feature flag 未设置 → 旧 users.json；设置 → 账号服务。 */
export function createCutterAccountsFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): CutterAccounts {
  return createCutterAccountsLegacy(cutterAccountsServiceFromEnv(env));
}

/** 兼容管理端既有命名：解析并校验账号服务连接（默认 client 角色）。 */
export function cutterAccountsServiceFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): AccountServiceConnection | undefined {
  const connection = accountServiceFromEnv(env, "client");
  if (!connection) return undefined;
  accountServiceUrl(connection, {
    missing_token: "MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN 未配置（账号服务需要令牌）"
  });
  return connection;
}
