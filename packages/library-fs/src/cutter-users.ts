import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type CutterUserStatus = "pending" | "approved" | "rejected" | "disabled";

export interface CutterDeviceRecord {
  device_id: string;
  device_name: string;
  status: "active" | "disabled";
  first_seen_at: string;
  last_login_at: string;
}

export interface CutterUserRecord {
  user_id: string;
  username: string;
  display_name: string;
  status: CutterUserStatus;
  applied_at: string;
  approved_at: string;
  rejected_at: string;
  disabled_at: string;
  last_login_at: string;
  last_used_at: string;
  note: string;
  devices: CutterDeviceRecord[];
}

export interface CutterSessionRecord {
  user_id: string;
  device_id: string;
  session_token: string;
  created_at: string;
  last_seen_at: string;
}

interface CutterUserStore {
  schema_version: "1.0";
  users: CutterUserRecord[];
  sessions: CutterSessionRecord[];
}

const USER_ID_PATTERN = /^CU(\d+)$/;
const USER_STATUSES = new Set<CutterUserStatus>([
  "pending",
  "approved",
  "rejected",
  "disabled"
]);
const DEVICE_STATUSES = new Set<CutterDeviceRecord["status"]>(["active", "disabled"]);
const storeMutationQueues = new Map<string, Promise<void>>();

function usersPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`剪辑师用户存储数据无效：${field} 必须是字符串`);
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  assertString(value, field);
  if (value.trim() === "") {
    throw new Error(`剪辑师用户存储数据无效：${field} 不能为空`);
  }
}

function validateDevice(value: unknown, field: string): CutterDeviceRecord {
  if (!isRecord(value)) {
    throw new Error(`剪辑师用户存储数据无效：${field} 必须是对象`);
  }

  assertNonEmptyString(value.device_id, `${field}.device_id`);
  assertString(value.device_name, `${field}.device_name`);
  assertString(value.status, `${field}.status`);
  if (!DEVICE_STATUSES.has(value.status as CutterDeviceRecord["status"])) {
    throw new Error(`剪辑师用户存储数据无效：${field}.status 不合法`);
  }
  assertString(value.first_seen_at, `${field}.first_seen_at`);
  assertString(value.last_login_at, `${field}.last_login_at`);

  return value as unknown as CutterDeviceRecord;
}

function validateUser(value: unknown, field: string): CutterUserRecord {
  if (!isRecord(value)) {
    throw new Error(`剪辑师用户存储数据无效：${field} 必须是对象`);
  }

  assertNonEmptyString(value.user_id, `${field}.user_id`);
  if (!USER_ID_PATTERN.test(value.user_id)) {
    throw new Error(`剪辑师用户存储数据无效：${field}.user_id 不合法`);
  }
  assertString(value.username, `${field}.username`);
  assertString(value.display_name, `${field}.display_name`);
  assertString(value.status, `${field}.status`);
  if (!USER_STATUSES.has(value.status as CutterUserStatus)) {
    throw new Error(`剪辑师用户存储数据无效：${field}.status 不合法`);
  }
  assertString(value.applied_at, `${field}.applied_at`);
  assertString(value.approved_at, `${field}.approved_at`);
  assertString(value.rejected_at, `${field}.rejected_at`);
  assertString(value.disabled_at, `${field}.disabled_at`);
  assertString(value.last_login_at, `${field}.last_login_at`);
  assertString(value.last_used_at, `${field}.last_used_at`);
  assertString(value.note, `${field}.note`);
  if (!Array.isArray(value.devices)) {
    throw new Error(`剪辑师用户存储数据无效：${field}.devices 必须是数组`);
  }

  const deviceIds = new Set<string>();
  for (const [index, device] of value.devices.entries()) {
    const validDevice = validateDevice(device, `${field}.devices[${index}]`);
    if (deviceIds.has(validDevice.device_id)) {
      throw new Error(`剪辑师用户存储数据无效：${field}.devices 设备 ID 重复`);
    }
    deviceIds.add(validDevice.device_id);
  }

  return value as unknown as CutterUserRecord;
}

function validateSession(value: unknown, field: string): CutterSessionRecord {
  if (!isRecord(value)) {
    throw new Error(`剪辑师用户存储数据无效：${field} 必须是对象`);
  }

  assertNonEmptyString(value.user_id, `${field}.user_id`);
  assertNonEmptyString(value.device_id, `${field}.device_id`);
  assertNonEmptyString(value.session_token, `${field}.session_token`);
  assertNonEmptyString(value.created_at, `${field}.created_at`);
  assertNonEmptyString(value.last_seen_at, `${field}.last_seen_at`);

  return value as unknown as CutterSessionRecord;
}

function validateStore(value: unknown): CutterUserStore {
  if (!isRecord(value)) {
    throw new Error("剪辑师用户存储数据无效：根节点必须是对象");
  }
  if (value.schema_version !== "1.0") {
    throw new Error("剪辑师用户存储数据无效：schema_version 必须是 1.0");
  }
  if (!Array.isArray(value.users)) {
    throw new Error("剪辑师用户存储数据无效：users 必须是数组");
  }
  if (!Array.isArray(value.sessions)) {
    throw new Error("剪辑师用户存储数据无效：sessions 必须是数组");
  }

  const users = value.users.map((user, index) => validateUser(user, `users[${index}]`));
  const sessions = value.sessions.map((session, index) =>
    validateSession(session, `sessions[${index}]`)
  );
  const userIds = new Set<string>();
  const userById = new Map<string, CutterUserRecord>();
  for (const user of users) {
    if (userIds.has(user.user_id)) {
      throw new Error("剪辑师用户存储数据无效：用户 ID 重复");
    }
    userIds.add(user.user_id);
    userById.set(user.user_id, user);
  }

  const sessionTokens = new Set<string>();
  for (const session of sessions) {
    if (sessionTokens.has(session.session_token)) {
      throw new Error("剪辑师用户存储数据无效：登录凭证重复");
    }
    sessionTokens.add(session.session_token);

    const user = userById.get(session.user_id);
    if (!user) {
      throw new Error("剪辑师用户存储数据无效：登录凭证关联的用户不存在");
    }
    if (!user.devices.some((device) => device.device_id === session.device_id)) {
      throw new Error("剪辑师用户存储数据无效：登录凭证关联的设备不存在");
    }
  }

  return { schema_version: "1.0", users, sessions };
}

async function readStore(libraryRoot: string): Promise<CutterUserStore> {
  let raw: string;
  try {
    raw = await readFile(usersPath(libraryRoot), "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return { schema_version: "1.0", users: [], sessions: [] };
    }
    throw new Error("无法读取剪辑师用户存储文件", { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("剪辑师用户存储文件格式错误", { cause: error });
  }

  return validateStore(parsed);
}

async function writeStore(libraryRoot: string, store: CutterUserStore): Promise<void> {
  const targetPath = usersPath(libraryRoot);
  const targetDir = path.dirname(targetPath);
  const tempPath = path.join(
    targetDir,
    `.users.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  );

  await mkdir(targetDir, { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw new Error("无法写入剪辑师用户存储文件", { cause: error });
  }
}

async function withStoreMutation<T>(
  libraryRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = usersPath(libraryRoot);
  const previous = storeMutationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  storeMutationQueues.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (storeMutationQueues.get(key) === queued) {
      storeMutationQueues.delete(key);
    }
  }
}

function createUserId(sequence: bigint): string {
  const digits = sequence.toString();
  return `CU${digits.length >= 6 ? digits : digits.padStart(6, "0")}`;
}

function nextUserId(users: CutterUserRecord[]): string {
  let max = 0n;
  for (const user of users) {
    const match = USER_ID_PATTERN.exec(user.user_id);
    if (!match) {
      continue;
    }
    const value = BigInt(match[1] ?? "0");
    if (value > max) {
      max = value;
    }
  }
  return createUserId(max + 1n);
}

export async function createCutterLoginApplication(
  libraryRoot: string,
  input: { username: string; device_id: string; device_name: string; now: string }
): Promise<CutterUserRecord> {
  return withStoreMutation(libraryRoot, async () => {
    const username = input.username.trim();
    if (!username) {
      throw new Error("用户名不能为空");
    }
    if (!input.device_id.trim()) {
      throw new Error("设备 ID 不能为空");
    }

    const store = await readStore(libraryRoot);
    const existing = store.users.find(
      (user) =>
        user.username === username &&
        (user.status === "pending" || user.status === "approved") &&
        user.devices.some((device) => device.device_id === input.device_id)
    );

    if (existing) {
      return existing;
    }

    const user: CutterUserRecord = {
      user_id: nextUserId(store.users),
      username,
      display_name: username,
      status: "pending",
      applied_at: input.now,
      approved_at: "",
      rejected_at: "",
      disabled_at: "",
      last_login_at: "",
      last_used_at: "",
      note: "",
      devices: [
        {
          device_id: input.device_id,
          device_name: input.device_name,
          status: "active",
          first_seen_at: input.now,
          last_login_at: ""
        }
      ]
    };
    store.users.push(user);
    await writeStore(libraryRoot, store);
    return user;
  });
}

export async function approveCutterUser(
  libraryRoot: string,
  input: { user_id: string; now: string }
): Promise<{ status: "approved"; user: CutterUserRecord; session: CutterSessionRecord }> {
  return withStoreMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    const user = store.users.find((candidate) => candidate.user_id === input.user_id);
    if (!user) {
      throw new Error("剪辑师用户不存在");
    }
    if (user.status !== "pending") {
      throw new Error("只有待审核剪辑师用户可以通过审核");
    }

    user.status = "approved";
    user.approved_at = input.now;
    user.last_login_at = input.now;
    const firstDevice = user.devices[0];
    if (!firstDevice) {
      throw new Error("剪辑师设备不存在");
    }
    firstDevice.last_login_at = input.now;

    const session: CutterSessionRecord = {
      user_id: user.user_id,
      device_id: firstDevice.device_id,
      session_token: randomUUID(),
      created_at: input.now,
      last_seen_at: input.now
    };
    store.sessions.push(session);
    await writeStore(libraryRoot, store);
    return { status: "approved", user, session };
  });
}

export async function ensureCutterSessionForDevice(
  libraryRoot: string,
  input: { user_id: string; device_id: string; now: string }
): Promise<CutterSessionRecord> {
  return withStoreMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    const user = store.users.find((candidate) => candidate.user_id === input.user_id);
    if (!user) {
      throw new Error("剪辑师用户不存在");
    }
    if (user.status !== "approved") {
      throw new Error("剪辑师用户尚未通过审核");
    }

    const device = user.devices.find((candidate) => candidate.device_id === input.device_id);
    if (!device) {
      throw new Error("剪辑师设备不存在");
    }
    if (device.status !== "active") {
      throw new Error("剪辑师设备已停用");
    }

    let session = store.sessions.find(
      (candidate) =>
        candidate.user_id === user.user_id &&
        candidate.device_id === input.device_id
    );

    if (!session) {
      session = {
        user_id: user.user_id,
        device_id: input.device_id,
        session_token: randomUUID(),
        created_at: input.now,
        last_seen_at: input.now
      };
      store.sessions.push(session);
    } else {
      session.last_seen_at = input.now;
    }

    user.last_login_at = input.now;
    device.last_login_at = input.now;
    await writeStore(libraryRoot, store);
    return session;
  });
}

export async function disableCutterUser(
  libraryRoot: string,
  input: { user_id: string; now: string }
): Promise<CutterUserRecord> {
  return withStoreMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    const user = store.users.find((candidate) => candidate.user_id === input.user_id);
    if (!user) {
      throw new Error("剪辑师用户不存在");
    }
    user.status = "disabled";
    if (!user.disabled_at) {
      user.disabled_at = input.now;
    }
    store.sessions = store.sessions.filter((session) => session.user_id !== user.user_id);
    await writeStore(libraryRoot, store);
    return user;
  });
}

export async function listCutterUsers(libraryRoot: string): Promise<{ users: CutterUserRecord[] }> {
  const store = await readStore(libraryRoot);
  return { users: store.users };
}

export async function validateCutterSession(
  libraryRoot: string,
  input: { device_id: string; session_token: string; now: string }
): Promise<{ ok: true; user: CutterUserRecord } | { ok: false; reason: string }> {
  return withStoreMutation(libraryRoot, async () => {
    const store = await readStore(libraryRoot);
    const session = store.sessions.find(
      (candidate) =>
        candidate.device_id === input.device_id &&
        candidate.session_token === input.session_token
    );
    if (!session) {
      return { ok: false, reason: "登录凭证无效" };
    }

    const user = store.users.find((candidate) => candidate.user_id === session.user_id);
    if (!user) {
      return { ok: false, reason: "用户不存在" };
    }
    if (user.status === "disabled") {
      return { ok: false, reason: "用户已停用" };
    }
    if (user.status !== "approved") {
      return { ok: false, reason: "用户尚未通过审核" };
    }

    session.last_seen_at = input.now;
    user.last_login_at = input.now;
    const device = user.devices.find((candidate) => candidate.device_id === input.device_id);
    if (device) {
      device.last_login_at = input.now;
    }
    await writeStore(libraryRoot, store);
    return { ok: true, user };
  });
}
