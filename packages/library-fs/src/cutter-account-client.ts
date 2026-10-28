import * as users from "./cutter-users.ts";
import type {
  CutterSessionRecord,
  CutterUserRecord
} from "./cutter-users.ts";

/**
 * Cutter account client. Default (feature flag off) is the legacy shared users.json
 * implementation; when MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL is set the same operations
 * go to the loopback account service instead. There is no silent fallback when the
 * service is configured but unreachable: callers get account_service_unavailable.
 */
export type CutterAccountClientMode = "local" | "service";

export interface CutterAccountConnection {
  base_url: string;
  /** Client (cutter device) token: register/login/validate/refresh/logout/... */
  token: string;
  /**
   * Optional Admin token for read/management operations (list/approve/disable/...).
   * When omitted the client token is used (legacy single-token deployment).
   */
  admin_token?: string;
}

export const CUTTER_ACCOUNTS_SERVICE_URL_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL";
export const CUTTER_ACCOUNTS_SERVICE_TOKEN_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN";
export const CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN";
export const CUTTER_ACCOUNTS_SERVICE_TOKEN_ALIAS_ENV = "MIXLAB_ACCOUNT_SERVICE_TOKEN";
export const CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN_ALIAS_ENV = "MIXLAB_ACCOUNT_SERVICE_ADMIN_TOKEN";

export interface CutterAccountEntitlements {
  schema_version: "1.0";
  accounts: Record<string, "ordinary" | "pro">;
}

export interface CutterAccounts {
  mode: CutterAccountClientMode;
  registerCutterAccount: typeof users.registerCutterAccount;
  loginCutterAccount: typeof users.loginCutterAccount;
  logoutCutterSession: typeof users.logoutCutterSession;
  changeCutterAccountPassword: typeof users.changeCutterAccountPassword;
  createCutterLoginApplication: typeof users.createCutterLoginApplication;
  ensureCutterSessionForDevice: typeof users.ensureCutterSessionForDevice;
  validateCutterSession: typeof users.validateCutterSession;
  approveCutterUser: typeof users.approveCutterUser;
  disableCutterUser: typeof users.disableCutterUser;
  resetCutterUserPassword: typeof users.resetCutterUserPassword;
  listCutterUsers: typeof users.listCutterUsers;
  /** Admin read path: users plus tier projection (service) / ordinary default (local). */
  listCutterUsersWithTiers(libraryRoot: string): Promise<{
    users: Array<CutterUserRecord & { tier: "ordinary" | "pro" }>;
  }>;
  /** Admin read path: entitlement store (service) / empty legacy store (local). */
  getCutterAccountEntitlements(libraryRoot: string): Promise<CutterAccountEntitlements>;
  /** Sliding session refresh; a thin validate(touch=true) locally, explicit op remotely. */
  refreshCutterSession(
    libraryRoot: string,
    input: { device_id: string; session_token: string; now: string }
  ): Promise<
    | { ok: true; user: CutterUserRecord; refreshed_at: string }
    | { ok: false; reason: string }
  >;
}

export const localCutterAccounts: CutterAccounts = {
  mode: "local",
  registerCutterAccount: users.registerCutterAccount,
  loginCutterAccount: users.loginCutterAccount,
  logoutCutterSession: users.logoutCutterSession,
  changeCutterAccountPassword: users.changeCutterAccountPassword,
  createCutterLoginApplication: users.createCutterLoginApplication,
  ensureCutterSessionForDevice: users.ensureCutterSessionForDevice,
  validateCutterSession: users.validateCutterSession,
  approveCutterUser: users.approveCutterUser,
  disableCutterUser: users.disableCutterUser,
  resetCutterUserPassword: users.resetCutterUserPassword,
  listCutterUsers: users.listCutterUsers,
  async listCutterUsersWithTiers(libraryRoot) {
    const [{ users: listed }, entitlements] = await Promise.all([
      users.listCutterUsers(libraryRoot),
      Promise.resolve({ schema_version: "1.0", accounts: {} } as CutterAccountEntitlements)
    ]);
    return {
      users: listed.map((user) => ({
        ...user,
        tier: entitlements.accounts[user.user_id] ?? ("ordinary" as const)
      }))
    };
  },
  async getCutterAccountEntitlements() {
    return { schema_version: "1.0", accounts: {} };
  },
  async refreshCutterSession(libraryRoot, input) {
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

function loopbackServiceUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("账号服务只接受带凭据的本机 HTTP 根地址（127.0.0.1/localhost/[::1]）");
  }
  return url;
}

export function cutterAccountsServiceFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): CutterAccountConnection | undefined {
  const baseUrl = (env[CUTTER_ACCOUNTS_SERVICE_URL_ENV] ?? "").trim();
  if (!baseUrl) {
    return undefined;
  }
  const token = (
    env[CUTTER_ACCOUNTS_SERVICE_TOKEN_ENV] ??
    env[CUTTER_ACCOUNTS_SERVICE_TOKEN_ALIAS_ENV] ??
    ""
  ).trim();
  if (!token) {
    throw new Error(
      `${CUTTER_ACCOUNTS_SERVICE_URL_ENV} is set but ${CUTTER_ACCOUNTS_SERVICE_TOKEN_ENV} is empty`
    );
  }
  const adminToken = (
    env[CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN_ENV] ??
    env[CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN_ALIAS_ENV] ??
    ""
  ).trim();
  if (adminToken && adminToken === token) {
    throw new Error("账号服务 admin token 必须与 client token 不同");
  }
  return {
    base_url: baseUrl,
    token,
    ...(adminToken ? { admin_token: adminToken } : {})
  };
}

export function isCutterAccountsServiceEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return Boolean((env[CUTTER_ACCOUNTS_SERVICE_URL_ENV] ?? "").trim());
}

export interface CutterAccountServiceResult<T> {
  result: T;
}

async function callService<T>(
  connection: CutterAccountConnection,
  operation: string,
  args: unknown[],
  role: "client" | "admin" = "client"
): Promise<T> {
  const token = role === "admin" ? (connection.admin_token ?? connection.token) : connection.token;
  const url = loopbackServiceUrl(connection.base_url);
  let response: Response;
  try {
    response = await fetch(new URL("/accounts/v1", url), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ operation, args })
    });
  } catch {
    throw Object.assign(
      new Error("账号服务暂时不可用，未回退共享文件写入"),
      { code: "account_service_unavailable", status: 503 }
    );
  }

  let value: { result?: unknown; error?: { code?: string; message?: string } };
  try {
    value = (await response.json()) as typeof value;
  } catch {
    throw Object.assign(new Error("账号服务响应无法解析"), {
      code: "account_service_unavailable",
      status: 502
    });
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(value.error?.message ?? "账号服务请求失败"),
      { code: value.error?.code ?? "account_service_error", status: response.status }
    );
  }
  return value.result as T;
}

export function createCutterAccounts(connection?: CutterAccountConnection): CutterAccounts {
  if (!connection) {
    return localCutterAccounts;
  }
  loopbackServiceUrl(connection.base_url);
  if (!connection.token.trim()) {
    throw new Error("账号服务客户端凭据不能为空");
  }

  const remote = <T>(operation: string, role: "client" | "admin" = "client") =>
    async (_libraryRoot: string, ...args: unknown[]): Promise<T> =>
      callService<T>(connection, operation, args, role);

  return {
    mode: "service",
    registerCutterAccount: remote("register"),
    loginCutterAccount: remote("login"),
    logoutCutterSession: remote("logout"),
    changeCutterAccountPassword: remote("change_password"),
    createCutterLoginApplication: remote("create_login_application"),
    ensureCutterSessionForDevice: remote("ensure_session_for_device"),
    validateCutterSession: remote("validate"),
    approveCutterUser: remote("approve", "admin"),
    disableCutterUser: remote("disable", "admin"),
    resetCutterUserPassword: remote("reset_password", "admin"),
    listCutterUsers: remote("list", "admin"),
    listCutterUsersWithTiers: remote("list_with_tiers", "admin"),
    getCutterAccountEntitlements: remote("get_entitlements", "admin"),
    async refreshCutterSession(_libraryRoot, input) {
      return callService(connection, "refresh", [input]);
    }
  } as CutterAccounts;
}

/** Feature-flag aware account client used by Admin cutter-user commands. */
export function createCutterAccountsFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): CutterAccounts {
  return createCutterAccounts(cutterAccountsServiceFromEnv(env));
}

export type { CutterSessionRecord, CutterUserRecord };
