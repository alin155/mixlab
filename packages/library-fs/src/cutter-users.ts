import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function usersPath(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json");
}

async function readStore(libraryRoot: string): Promise<CutterUserStore> {
  try {
    return JSON.parse(await readFile(usersPath(libraryRoot), "utf8")) as CutterUserStore;
  } catch {
    return { schema_version: "1.0", users: [], sessions: [] };
  }
}

async function writeStore(libraryRoot: string, store: CutterUserStore): Promise<void> {
  await mkdir(path.dirname(usersPath(libraryRoot)), { recursive: true });
  await writeFile(usersPath(libraryRoot), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function createUserId(sequence: number): string {
  return `CU${String(sequence).padStart(6, "0")}`;
}

export async function createCutterLoginApplication(
  libraryRoot: string,
  input: { username: string; device_id: string; device_name: string; now: string }
): Promise<CutterUserRecord> {
  const username = input.username.trim();
  if (!username) {
    throw new Error("用户名不能为空");
  }

  const store = await readStore(libraryRoot);
  const existing = store.users.find((user) => user.username === username);

  if (existing) {
    if (!existing.devices.some((device) => device.device_id === input.device_id)) {
      existing.devices.push({
        device_id: input.device_id,
        device_name: input.device_name,
        status: "active",
        first_seen_at: input.now,
        last_login_at: ""
      });
    }
    await writeStore(libraryRoot, store);
    return existing;
  }

  const user: CutterUserRecord = {
    user_id: createUserId(store.users.length + 1),
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
}

export async function approveCutterUser(
  libraryRoot: string,
  input: { user_id: string; now: string }
): Promise<{ status: "approved"; user: CutterUserRecord; session: CutterSessionRecord }> {
  const store = await readStore(libraryRoot);
  const user = store.users.find((candidate) => candidate.user_id === input.user_id);
  if (!user) {
    throw new Error("剪辑师用户不存在");
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
}

export async function disableCutterUser(
  libraryRoot: string,
  input: { user_id: string; now: string }
): Promise<CutterUserRecord> {
  const store = await readStore(libraryRoot);
  const user = store.users.find((candidate) => candidate.user_id === input.user_id);
  if (!user) {
    throw new Error("剪辑师用户不存在");
  }
  user.status = "disabled";
  user.disabled_at = input.now;
  await writeStore(libraryRoot, store);
  return user;
}

export async function listCutterUsers(libraryRoot: string): Promise<{ users: CutterUserRecord[] }> {
  const store = await readStore(libraryRoot);
  return { users: store.users };
}

export async function validateCutterSession(
  libraryRoot: string,
  input: { device_id: string; session_token: string; now: string }
): Promise<{ ok: true; user: CutterUserRecord } | { ok: false; reason: string }> {
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
}
