import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword, verifyPassword } from "./password-auth.ts";

export type AdminUserRole = "owner" | "admin";
export type AdminUserStatus = "active" | "disabled";

export interface AdminUserRecord {
  admin_id: string;
  username: string;
  display_name: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  password_hash: string;
  created_at: string;
  last_login_at: string;
  disabled_at: string;
}

export interface AdminSessionRecord {
  admin_id: string;
  session_token: string;
  created_at: string;
  last_seen_at: string;
}

interface AdminUserStore {
  schema_version: "1.0";
  users: AdminUserRecord[];
  sessions: AdminSessionRecord[];
}

const ADMIN_ID_PATTERN = /^AU(\d+)$/;
const ADMIN_ROLES = new Set<AdminUserRole>(["owner", "admin"]);
const ADMIN_STATUSES = new Set<AdminUserStatus>(["active", "disabled"]);
const mutationQueues = new Map<string, Promise<void>>();
const STORE_WRITE_RETRY_DELAYS_MS = [50, 150, 500, 1000, 2000];
const STORE_READ_RETRY_DELAYS_MS = [20, 80, 200, 500];

function adminUsersPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "admin-users", "users.json");
}

function hasErrnoCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`管理员用户存储数据无效：${field} 必须是字符串`);
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  assertString(value, field);
  if (value.trim() === "") {
    throw new Error(`管理员用户存储数据无效：${field} 不能为空`);
  }
}

function validateUser(value: unknown, field: string): AdminUserRecord {
  if (!isRecord(value)) {
    throw new Error(`管理员用户存储数据无效：${field} 必须是对象`);
  }

  assertNonEmptyString(value.admin_id, `${field}.admin_id`);
  if (!ADMIN_ID_PATTERN.test(value.admin_id)) {
    throw new Error(`管理员用户存储数据无效：${field}.admin_id 不合法`);
  }
  assertNonEmptyString(value.username, `${field}.username`);
  assertString(value.display_name, `${field}.display_name`);
  assertString(value.role, `${field}.role`);
  if (!ADMIN_ROLES.has(value.role as AdminUserRole)) {
    throw new Error(`管理员用户存储数据无效：${field}.role 不合法`);
  }
  assertString(value.status, `${field}.status`);
  if (!ADMIN_STATUSES.has(value.status as AdminUserStatus)) {
    throw new Error(`管理员用户存储数据无效：${field}.status 不合法`);
  }
  assertNonEmptyString(value.password_hash, `${field}.password_hash`);
  assertString(value.created_at, `${field}.created_at`);
  assertString(value.last_login_at, `${field}.last_login_at`);
  assertString(value.disabled_at, `${field}.disabled_at`);

  return value as unknown as AdminUserRecord;
}

function validateSession(value: unknown, field: string): AdminSessionRecord {
  if (!isRecord(value)) {
    throw new Error(`管理员用户存储数据无效：${field} 必须是对象`);
  }

  assertNonEmptyString(value.admin_id, `${field}.admin_id`);
  assertNonEmptyString(value.session_token, `${field}.session_token`);
  assertNonEmptyString(value.created_at, `${field}.created_at`);
  assertNonEmptyString(value.last_seen_at, `${field}.last_seen_at`);

  return value as unknown as AdminSessionRecord;
}

function validateStore(value: unknown): AdminUserStore {
  if (!isRecord(value)) {
    throw new Error("管理员用户存储数据无效：根节点必须是对象");
  }
  if (value.schema_version !== "1.0") {
    throw new Error("管理员用户存储数据无效：schema_version 必须是 1.0");
  }
  if (!Array.isArray(value.users)) {
    throw new Error("管理员用户存储数据无效：users 必须是数组");
  }
  if (!Array.isArray(value.sessions)) {
    throw new Error("管理员用户存储数据无效：sessions 必须是数组");
  }

  const users = value.users.map((user, index) => validateUser(user, `users[${index}]`));
  const sessions = value.sessions.map((session, index) =>
    validateSession(session, `sessions[${index}]`)
  );
  const userIds = new Set<string>();
  const usernames = new Set<string>();
  const userById = new Map<string, AdminUserRecord>();
  for (const user of users) {
    if (userIds.has(user.admin_id)) {
      throw new Error("管理员用户存储数据无效：管理员 ID 重复");
    }
    const usernameKey = normalizeUsername(user.username);
    if (usernames.has(usernameKey)) {
      throw new Error("管理员用户存储数据无效：用户名重复");
    }
    userIds.add(user.admin_id);
    usernames.add(usernameKey);
    userById.set(user.admin_id, user);
  }

  const sessionTokens = new Set<string>();
  for (const session of sessions) {
    if (sessionTokens.has(session.session_token)) {
      throw new Error("管理员用户存储数据无效：登录凭证重复");
    }
    sessionTokens.add(session.session_token);
    if (!userById.has(session.admin_id)) {
      throw new Error("管理员用户存储数据无效：登录凭证关联的管理员不存在");
    }
  }

  return { schema_version: "1.0", users, sessions };
}

function findJsonEnd(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
}

function parseStoreJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const jsonEnd = findJsonEnd(raw);
    if (jsonEnd > 0 && /^[\s\0]*$/.test(raw.slice(jsonEnd))) {
      return JSON.parse(raw.slice(0, jsonEnd));
    }
    throw error;
  }
}

async function readStore(libraryRoot: string): Promise<AdminUserStore> {
  let lastFormatError: unknown;
  let lastValidationError: unknown;

  for (let attempt = 0; attempt <= STORE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    let raw: string;
    try {
      raw = await readFile(adminUsersPath(libraryRoot), "utf8");
    } catch (error) {
      if (hasErrnoCode(error, "ENOENT")) {
        return { schema_version: "1.0", users: [], sessions: [] };
      }
      throw new Error("无法读取管理员用户存储文件", { cause: error });
    }

    let parsed: unknown;
    try {
      parsed = parseStoreJson(raw);
    } catch (error) {
      lastFormatError = error;
      const delayMs = STORE_READ_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) {
        throw new Error("管理员用户存储文件格式错误", { cause: lastFormatError });
      }
      await delay(delayMs);
      continue;
    }

    try {
      return validateStore(parsed);
    } catch (error) {
      lastValidationError = error;
      const delayMs = STORE_READ_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) {
        throw lastValidationError;
      }
      await delay(delayMs);
    }
  }

  if (lastFormatError) {
    throw new Error("管理员用户存储文件格式错误", { cause: lastFormatError });
  }
  throw lastValidationError instanceof Error
    ? lastValidationError
    : new Error("管理员用户存储数据无效");
}

async function writeStore(libraryRoot: string, store: AdminUserStore): Promise<void> {
  const targetPath = adminUsersPath(libraryRoot);
  const targetDir = path.dirname(targetPath);
  const serialized = `${JSON.stringify(store, null, 2)}\n`;

  await mkdir(targetDir, { recursive: true });
  for (let attempt = 0; attempt <= STORE_WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
    const tempPath = path.join(
      targetDir,
      `.users.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
    );

    try {
      await writeFile(tempPath, serialized, {
        encoding: "utf8",
        mode: 0o600
      });
      await rename(tempPath, targetPath);
      return;
    } catch (error) {
      await rm(tempPath, { force: true });
      const delayMs = STORE_WRITE_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) {
        if (hasErrnoCode(error, "EBUSY")) {
          // SMB/NAS mounts can keep the target locked for atomic replace while direct writes still work.
          await writeFile(targetPath, serialized, { encoding: "utf8" });
          return;
        }
        throw new Error("无法写入管理员用户存储文件", { cause: error });
      }
      await delay(delayMs);
    }
  }
}

async function withMutation<T>(libraryRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = adminUsersPath(libraryRoot);
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  mutationQueues.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (mutationQueues.get(key) === queued) {
      mutationQueues.delete(key);
    }
  }
}

function createAdminId(sequence: bigint): string {
  const digits = sequence.toString();
  return `AU${digits.length >= 6 ? digits : digits.padStart(6, "0")}`;
}

function nextAdminId(users: AdminUserRecord[]): string {
  let max = 0n;
  for (const user of users) {
    const match = ADMIN_ID_PATTERN.exec(user.admin_id);
    if (!match) {
      continue;
    }
    const value = BigInt(match[1] ?? "0");
    if (value > max) {
      max = value;
    }
  }
  return createAdminId(max + 1n);
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function publicAdminUser(user: AdminUserRecord): Omit<AdminUserRecord, "password_hash"> {
  const { password_hash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function getAdminAuthBootstrapStatus(libraryRoot: string): Promise<{
  has_admin: boolean;
  registration_open: boolean;
}> {
  const store = await readStore(libraryRoot);
  const hasAdmin = store.users.some((user) => user.status === "active");
  return {
    has_admin: hasAdmin,
    registration_open: !hasAdmin
  };
}

export async function registerFirstAdmin(
  libraryRoot: string,
  input: { username: string; password: string; display_name?: string; now: string }
): Promise<{ user: AdminUserRecord; session: AdminSessionRecord }> {
  return withMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    if (store.users.some((user) => user.status === "active")) {
      throw new Error("管理员账号已存在，请直接登录");
    }

    const username = input.username.trim();
    if (!username) {
      throw new Error("用户名不能为空");
    }

    const user: AdminUserRecord = {
      admin_id: nextAdminId(store.users),
      username,
      display_name: input.display_name?.trim() || username,
      role: "owner",
      status: "active",
      password_hash: await hashPassword(input.password),
      created_at: input.now,
      last_login_at: input.now,
      disabled_at: ""
    };
    const session: AdminSessionRecord = {
      admin_id: user.admin_id,
      session_token: randomUUID(),
      created_at: input.now,
      last_seen_at: input.now
    };
    store.users.push(user);
    store.sessions.push(session);
    await writeStore(libraryRoot, store);
    return { user, session };
  });
}

export async function loginAdmin(
  libraryRoot: string,
  input: { username: string; password: string; now: string }
): Promise<{ ok: true; user: AdminUserRecord; session: AdminSessionRecord } | { ok: false; reason: string }> {
  return withMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    const usernameKey = normalizeUsername(input.username);
    const user = store.users.find((candidate) => normalizeUsername(candidate.username) === usernameKey);
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      return { ok: false, reason: "用户名或密码错误" };
    }
    if (user.status !== "active") {
      return { ok: false, reason: "管理员账号已停用" };
    }

    const session: AdminSessionRecord = {
      admin_id: user.admin_id,
      session_token: randomUUID(),
      created_at: input.now,
      last_seen_at: input.now
    };
    user.last_login_at = input.now;
    store.sessions.push(session);
    await writeStore(libraryRoot, store);
    return { ok: true, user, session };
  });
}

export async function validateAdminSession(
  libraryRoot: string,
  input: { session_token: string; now: string; touch?: boolean }
): Promise<{ ok: true; user: AdminUserRecord } | { ok: false; reason: string }> {
  function validateStoreSession(
    store: AdminUserStore
  ): { ok: true; user: AdminUserRecord; store: AdminUserStore } | { ok: false; reason: string } {
    const session = store.sessions.find((candidate) => candidate.session_token === input.session_token);
    if (!session) {
      return { ok: false, reason: "登录凭证无效" };
    }
    const user = store.users.find((candidate) => candidate.admin_id === session.admin_id);
    if (!user) {
      return { ok: false, reason: "管理员账号不存在" };
    }
    if (user.status !== "active") {
      return { ok: false, reason: "管理员账号已停用" };
    }
    if (!input.touch) {
      return { ok: true, user, store };
    }

    session.last_seen_at = input.now;
    user.last_login_at = input.now;

    return { ok: true, user, store };
  }

  if (!input.touch) {
    const validation = validateStoreSession(await readStore(libraryRoot));
    return validation.ok ? { ok: true, user: validation.user } : validation;
  }

  return withMutation(libraryRoot, async () => {
    const validation = validateStoreSession(await readStore(libraryRoot));
    if (!validation.ok) {
      return validation;
    }
    await writeStore(libraryRoot, validation.store);
    return { ok: true, user: validation.user };
  });
}

export async function logoutAdminSession(
  libraryRoot: string,
  input: { session_token: string }
): Promise<{ removed: boolean }> {
  return withMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    const before = store.sessions.length;
    store.sessions = store.sessions.filter((session) => session.session_token !== input.session_token);
    await writeStore(libraryRoot, store);
    return { removed: store.sessions.length !== before };
  });
}
