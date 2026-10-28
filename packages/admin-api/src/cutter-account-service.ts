import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdir, lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  accountEntitlementsPath,
  accountUsersPath,
  acquireCutterAccountLock,
  withCutterAccountServiceOwner,
  type CutterAccountLockHandle
} from "../../library-fs/src/cutter-account-lock.ts";
import * as localAccounts from "../../library-fs/src/cutter-users.ts";

export const CUTTER_ACCOUNT_SERVICE_DEFAULT_PORT = 3891;
export const CUTTER_ACCOUNT_SERVICE_STATE_ROOT_ENV = "MIXLAB_ACCOUNT_SERVICE_STATE_ROOT";
export const CUTTER_ACCOUNT_SERVICE_PORT_ENV = "MIXLAB_ACCOUNT_SERVICE_PORT";
export const CUTTER_ACCOUNT_SERVICE_TOKEN_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_TOKEN";
export const CUTTER_ACCOUNT_SERVICE_LEGACY_TOKEN_ENV = "MIXLAB_ACCOUNT_SERVICE_TOKEN";
export const CUTTER_ACCOUNT_SERVICE_ADMIN_TOKEN_ENV = "MIXLAB_CUTTER_ACCOUNTS_SERVICE_ADMIN_TOKEN";
export const CUTTER_ACCOUNT_SERVICE_LEGACY_ADMIN_TOKEN_ENV = "MIXLAB_ACCOUNT_SERVICE_ADMIN_TOKEN";
export const CUTTER_ACCOUNT_SERVICE_CONTRACT_PATH = "/accounts/v1";
export const CUTTER_ACCOUNT_SERVICE_MAX_BODY_BYTES = 64 * 1024;

export type CutterAccountTier = "ordinary" | "pro";

const ADMIN_OPERATIONS = new Set([
  "list",
  "approve",
  "disable",
  "reset_password",
  "list_with_tiers",
  "get_entitlements",
  "set_entitlements"
]);

const CLIENT_OPERATIONS = new Set([
  "register",
  "login",
  "logout",
  "change_password",
  "create_login_application",
  "ensure_session_for_device",
  "validate",
  "refresh"
]);

export interface CutterAccountServiceConfig {
  state_root: string;
  port: number;
  client_token: string;
  admin_token: string;
  /**
   * True when only one token was configured: it acts as the admin+client superset.
   * Supported for backward compatibility, logged as deprecated.
   */
  legacy_single_token: boolean;
}

export const CUTTER_ACCOUNT_SERVICE_LEGACY_TOKEN_DEPRECATION =
  "账号服务使用单 token 兼容模式（client=admin superset）；生产建议配置 " +
  CUTTER_ACCOUNT_SERVICE_ADMIN_TOKEN_ENV +
  " 与 client token 分离";

export function defaultCutterAccountServiceStateRoot(home = os.homedir()): string {
  return path.join(home, ".mixlab-service", "accounts");
}

export function resolveCutterAccountServiceConfigFromEnv(
  env: Partial<NodeJS.ProcessEnv> = process.env
): CutterAccountServiceConfig {
  const stateRoot =
    (env[CUTTER_ACCOUNT_SERVICE_STATE_ROOT_ENV] ?? "").trim() ||
    defaultCutterAccountServiceStateRoot();
  if (!path.isAbsolute(stateRoot) || /^\\\\|^\/\//.test(stateRoot)) {
    throw new Error("账号服务状态目录必须是本机绝对路径");
  }
  const portText = (env[CUTTER_ACCOUNT_SERVICE_PORT_ENV] ?? "").trim();
  const port = portText ? Number.parseInt(portText, 10) : CUTTER_ACCOUNT_SERVICE_DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("账号服务端口无效");
  }
  const clientToken =
    (env[CUTTER_ACCOUNT_SERVICE_TOKEN_ENV] ?? "").trim() ||
    (env[CUTTER_ACCOUNT_SERVICE_LEGACY_TOKEN_ENV] ?? "").trim();
  if (!clientToken) {
    throw new Error(
      "账号服务必须配置 " + CUTTER_ACCOUNT_SERVICE_TOKEN_ENV + " 才能启动"
    );
  }
  const adminToken =
    (env[CUTTER_ACCOUNT_SERVICE_ADMIN_TOKEN_ENV] ?? "").trim() ||
    (env[CUTTER_ACCOUNT_SERVICE_LEGACY_ADMIN_TOKEN_ENV] ?? "").trim();
  if (adminToken && adminToken === clientToken) {
    throw new Error(
      "账号服务 admin token 必须与 client token 不同（如需单 token 兼容模式请仅配置一个 token）"
    );
  }
  return {
    state_root: stateRoot,
    port,
    client_token: clientToken,
    admin_token: adminToken || clientToken,
    legacy_single_token: !adminToken
  };
}

export interface CutterAccountEntitlementsStore {
  schema_version: "1.0";
  accounts: Record<string, CutterAccountTier>;
}

export async function readCutterAccountEntitlements(stateRoot: string): Promise<CutterAccountEntitlementsStore> {
  try {
    const raw = await readFile(accountEntitlementsPath(stateRoot), "utf8");
    const value = JSON.parse(raw) as CutterAccountEntitlementsStore;
    if (
      value.schema_version !== "1.0" ||
      !value.accounts ||
      Array.isArray(value.accounts) ||
      typeof value.accounts !== "object" ||
      Object.entries(value.accounts).some(
        ([userId, tier]) => !/^CU\d+$/.test(userId) || !["ordinary", "pro"].includes(tier)
      )
    ) {
      throw new Error("账号权限记录不可读取");
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schema_version: "1.0", accounts: {} };
    }
    throw error;
  }
}

async function writeCutterAccountEntitlements(
  stateRoot: string,
  store: CutterAccountEntitlementsStore
): Promise<void> {
  await mkdir(path.dirname(accountEntitlementsPath(stateRoot)), { recursive: true, mode: 0o700 });
  const target = accountEntitlementsPath(stateRoot);
  const temporary = target + ".tmp-" + randomUUID();
  await writeFile(temporary, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  const { rename, rm } = await import("node:fs/promises");
  try {
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function ensureStateRootIsPrivate(stateRoot: string): Promise<void> {
  const library = await lstat(path.join(stateRoot, ".mixlab-library", "library.json")).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (library) {
    throw new Error("账号服务状态目录不能是公共素材库根目录");
  }
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
}

async function readImportedState(stateRoot: string): Promise<{ source_digest: string } | null> {
  const raw = await readFile(path.join(stateRoot, "account-import.json"), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (raw === null) {
    return null;
  }
  const value = JSON.parse(raw) as { version?: number; ready?: boolean; source_digest?: string };
  if (value.version !== 1 || value.ready !== true || typeof value.source_digest !== "string") {
    throw new Error("账号导入未完成，禁止启动账号服务");
  }
  if (!(await readFile(accountUsersPath(stateRoot), "utf8").catch(() => null))) {
    throw new Error("账号导入记录存在但账号存储缺失，禁止启动账号服务");
  }
  return { source_digest: value.source_digest };
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function stripSecrets(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, item) => (key === "password_hash" ? undefined : item))
  );
}

async function executeOperation(stateRoot: string, operation: string, args: unknown[]): Promise<unknown> {
  const now = new Date().toISOString();
  const argsWithServerTime = args.map((arg) =>
    arg && typeof arg === "object" && !Array.isArray(arg)
      ? { ...(arg as Record<string, unknown>), now }
      : arg
  );

  switch (operation) {
    case "register":
      return localAccounts.registerCutterAccount(stateRoot, argsWithServerTime[0] as never);
    case "login":
      return localAccounts.loginCutterAccount(stateRoot, argsWithServerTime[0] as never);
    case "logout":
      return localAccounts.logoutCutterSession(stateRoot, argsWithServerTime[0] as never);
    case "change_password":
      return localAccounts.changeCutterAccountPassword(stateRoot, argsWithServerTime[0] as never);
    case "create_login_application":
      return localAccounts.createCutterLoginApplication(stateRoot, argsWithServerTime[0] as never);
    case "ensure_session_for_device":
      return localAccounts.ensureCutterSessionForDevice(stateRoot, argsWithServerTime[0] as never);
    case "validate":
      return localAccounts.validateCutterSession(stateRoot, argsWithServerTime[0] as never);
    case "refresh": {
      const input = argsWithServerTime[0] as {
        device_id: string;
        session_token: string;
        now: string;
      };
      const validation = await localAccounts.validateCutterSession(stateRoot, {
        device_id: input.device_id,
        session_token: input.session_token,
        now: input.now,
        touch: true
      });
      return validation.ok
        ? { ok: true, user: validation.user, refreshed_at: input.now }
        : validation;
    }
    case "list":
      return localAccounts.listCutterUsers(stateRoot);
    case "approve":
      return localAccounts.approveCutterUser(stateRoot, argsWithServerTime[0] as never);
    case "disable":
      return localAccounts.disableCutterUser(stateRoot, argsWithServerTime[0] as never);
    case "reset_password":
      return localAccounts.resetCutterUserPassword(stateRoot, argsWithServerTime[0] as never);
    case "list_with_tiers": {
      const [{ users }, entitlements] = await Promise.all([
        localAccounts.listCutterUsers(stateRoot),
        readCutterAccountEntitlements(stateRoot)
      ]);
      return {
        users: users.map((user) => ({
          ...user,
          tier: entitlements.accounts[user.user_id] ?? "ordinary"
        }))
      };
    }
    case "get_entitlements":
      return readCutterAccountEntitlements(stateRoot);
    case "set_entitlements": {
      const input = args[0] as { user_id?: unknown; tier?: unknown };
      const userId = typeof input?.user_id === "string" ? input.user_id.trim() : "";
      const tier = input?.tier;
      if (!/^CU\d+$/.test(userId)) {
        throw new Error("账号 ID 无效");
      }
      if (tier !== "ordinary" && tier !== "pro") {
        throw new Error("账号级别必须是 ordinary 或 pro");
      }
      const { users } = await localAccounts.listCutterUsers(stateRoot);
      if (!users.some((user) => user.user_id === userId && user.status === "approved")) {
        throw new Error("只能调整已审核账号的级别");
      }
      const store = await readCutterAccountEntitlements(stateRoot);
      store.accounts[userId] = tier;
      await writeCutterAccountEntitlements(stateRoot, store);
      return store;
    }
    default:
      throw new Error("账号操作无效");
  }
}

export interface CutterAccountService {
  server: Server;
  state_root: string;
  legacy_single_token: boolean;
  close(): Promise<void>;
}

export async function createCutterAccountService(input: {
  state_root: string;
  client_token?: string;
  admin_token?: string;
  /** @deprecated Round4 single-token alias; maps to client_token (and admin fallback). */
  token?: string;
  now?: () => string;
  warn?: (message: string) => void;
}): Promise<CutterAccountService> {
  const stateRoot = path.resolve(input.state_root);
  if (!path.isAbsolute(input.state_root) || /^\\\\|^\/\//.test(input.state_root)) {
    throw new Error("账号服务状态目录必须是本机绝对路径");
  }
  const clientToken = (input.client_token ?? input.token ?? "").trim();
  const explicitAdminToken = (input.admin_token ?? "").trim();
  if (!clientToken) {
    throw new Error("账号服务 client token 不能为空");
  }
  if (explicitAdminToken && explicitAdminToken === clientToken) {
    throw new Error("账号服务 admin token 必须与 client token 不同");
  }
  const adminToken = explicitAdminToken || clientToken;
  const legacySingleToken = !explicitAdminToken;
  if (legacySingleToken) {
    (input.warn ?? ((message: string) => console.warn(message)))(
      CUTTER_ACCOUNT_SERVICE_LEGACY_TOKEN_DEPRECATION
    );
  }
  await ensureStateRootIsPrivate(stateRoot);
  const imported = await readImportedState(stateRoot);

  const serviceLock: CutterAccountLockHandle = await acquireCutterAccountLock(stateRoot, {
    name: "service",
    holder: "cutter-account-service:" + process.pid,
    reason: "account-service",
    now: (input.now ?? (() => new Date().toISOString()))()
  }).catch((error: Error) => {
    throw new Error("账号服务已在运行或被其他维护操作占用：" + error.message);
  });
  try {
    await writeFile(
      path.join(stateRoot, ".mixlab-library", "cutter-users", "service-owned.json"),
      JSON.stringify({ version: 1, owner: "account-service", imported: imported !== null }, null, 2) + "\n",
      { mode: 0o600 }
    );
  } catch (error) {
    await serviceLock.release();
    throw error;
  }

  let queue: Promise<unknown> = Promise.resolve();
  const server = createServer(async (request, response) => {
    const send = (status: number, value: unknown): void => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify(stripSecrets(value)));
    };
    try {
      const remote = request.socket.remoteAddress ?? "";
      const host = request.headers.host ?? "";
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) ||
        !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) ||
        request.headers.origin
      ) {
        send(403, { error: { code: "local_only", message: "账号服务仅供本机受信任进程访问" } });
        return;
      }
      if (request.method !== "POST" || request.url !== CUTTER_ACCOUNT_SERVICE_CONTRACT_PATH) {
        send(404, { error: { code: "route_missing", message: "接口不存在" } });
        return;
      }
      const token = String(request.headers.authorization ?? "").replace(/^Bearer /, "");
      const admin = safeEqual(token, adminToken);
      const client = admin || safeEqual(token, clientToken);
      if (!client) {
        send(401, { error: { code: "service_auth", message: "账号服务凭据无效" } });
        return;
      }
      let bytes = 0;
      const buffers: Buffer[] = [];
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > CUTTER_ACCOUNT_SERVICE_MAX_BODY_BYTES) {
          throw new Error("账号请求过大");
        }
        buffers.push(buffer);
      }
      const body = JSON.parse(Buffer.concat(buffers).toString("utf8")) as {
        operation?: unknown;
        args?: unknown;
      };
      const operation = typeof body.operation === "string" ? body.operation : "";
      if (!ADMIN_OPERATIONS.has(operation) && !CLIENT_OPERATIONS.has(operation)) {
        throw new Error("账号操作无效");
      }
      if (ADMIN_OPERATIONS.has(operation) && !admin) {
        send(403, {
          error: {
            code: "admin_required",
            message: "该账号操作需要管理凭据（admin token）"
          }
        });
        return;
      }
      if (!Array.isArray(body.args) || body.args.length > 2) {
        throw new Error("账号操作参数无效");
      }
      const result = queue.then(() =>
        withCutterAccountServiceOwner(stateRoot, () =>
          executeOperation(stateRoot, operation, body.args as unknown[])
        )
      );
      queue = result.catch(() => undefined);
      send(200, { result: await result });
    } catch (error) {
      send(400, {
        error: {
          code: (error as { code?: string }).code ?? "account_operation",
          message: error instanceof Error ? error.message : "账号操作失败"
        }
      });
    }
  });

  let closed = false;
  return {
    server,
    state_root: stateRoot,
    legacy_single_token: legacySingleToken,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
      await queue;
      await serviceLock.release();
    }
  };
}
