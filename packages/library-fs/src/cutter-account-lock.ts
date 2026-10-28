import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type CutterAccountLockName = "users" | "service";

/**
 * Cross-process writer lock for the cutter account store. v2 owners additionally record
 * a boot identity fingerprint so stale locks can be recovered safely on Windows too
 * (the v1 candidate implementation only supported macOS/Linux boot ids).
 */
export interface CutterAccountLockOwner {
  version: 2;
  host: string;
  /** sha256 fingerprint of the boot identity material (stable within one boot). */
  boot_id: string;
  boot_identity_source: CutterAccountBootIdentitySource;
  pid: number;
  token: string;
}

export type CutterAccountBootIdentitySource =
  | "darwin_sysctl"
  | "linux_boot_id"
  | "windows_machine_guid_boot_time"
  | "windows_machine_guid_uptime"
  | "unsupported";

export interface CutterAccountBootIdentity {
  boot_id: string;
  boot_identity_source: CutterAccountBootIdentitySource;
}

export interface CutterAccountLockRuntime {
  platform: NodeJS.Platform;
  hostname: string;
  nowMs: () => number;
  osUptimeMs: () => number;
  execFile: (command: string, args: string[]) => Promise<{ stdout: string }>;
  readFile: (filePath: string, encoding: "utf8") => Promise<string>;
}

export function createCutterAccountLockRuntime(
  overrides: Partial<CutterAccountLockRuntime> = {}
): CutterAccountLockRuntime {
  return {
    platform: overrides.platform ?? process.platform,
    hostname: overrides.hostname ?? os.hostname(),
    nowMs: overrides.nowMs ?? (() => Date.now()),
    osUptimeMs: overrides.osUptimeMs ?? (() => os.uptime() * 1000),
    execFile:
      overrides.execFile ??
      (async (command, args) => {
        const result = await execFile(command, args, { timeout: 5_000 });
        return { stdout: String(result.stdout ?? "") };
      }),
    readFile: overrides.readFile ?? ((filePath, encoding) => readFile(filePath, encoding))
  };
}

const defaultRuntime = createCutterAccountLockRuntime();
const serviceContext = new AsyncLocalStorage<string>();
const WINDOWS_UPTIME_BUCKET_MS = 5 * 60 * 1000;

export class CutterAccountLockError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CutterAccountLockError";
    this.code = code;
  }
}

export const accountDirectory = (root: string): string =>
  path.join(root, ".mixlab-library", "cutter-users");

export function accountUsersPath(root: string): string {
  return path.join(accountDirectory(root), "users.json");
}

export function accountEntitlementsPath(root: string): string {
  return path.join(accountDirectory(root), "entitlements.json");
}

function lockPath(root: string, name: CutterAccountLockName): string {
  return path.join(
    accountDirectory(root),
    name === "users" ? ".users-write.lock" : ".account-service.lock"
  );
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

export function parseCutterAccountStoreText(raw: string): unknown {
  return parseStoreJson(raw);
}

const failure = (code: string, message: string): CutterAccountLockError =>
  new CutterAccountLockError(code, message);

const absent = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function windowsMachineGuid(stdout: string): string | undefined {
  const match = /MachineGuid\s+(?:REG_SZ\s+)?([0-9a-fA-F-]{20,})/.exec(stdout);
  return match?.[1]?.trim() || undefined;
}

function windowsBootTimeText(stdout: string): string | undefined {
  const text = stdout.trim();
  if (!text) {
    return undefined;
  }
  // PowerShell ToFileTimeUtc() and wmic both return machine-parsable values; any stable
  // textual boot timestamp is enough because the fingerprint hashes it.
  return text.replace(/\s+/g, "");
}

/**
 * Windows boot identity: MachineGuid (host install identity) + last boot time.
 *
 * - Preferred: PowerShell Get-CimInstance LastBootUpTime (accurate across reboots).
 * - Fallback: now - os.uptime() bucketed to 5 minutes (works without extra tools; a
 *   reboot inside the same bucket could be treated as one boot, so recovery stays
 *   conservative because a live PID + token is still required to hold the lock).
 * - If MachineGuid cannot be read we return null and callers stay fail-closed.
 */
export async function readWindowsCutterAccountBootIdentity(
  runtime: CutterAccountLockRuntime
): Promise<CutterAccountBootIdentity | null> {
  let machineGuid = "";
  try {
    const result = await runtime.execFile("reg", [
      "query",
      "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
      "/v",
      "MachineGuid"
    ]);
    machineGuid = windowsMachineGuid(result.stdout) ?? "";
  } catch {
    return null;
  }
  if (!machineGuid) {
    return null;
  }

  try {
    const result = await runtime.execFile("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToFileTimeUtc()"
    ]);
    const bootText = windowsBootTimeText(result.stdout);
    if (bootText) {
      return {
        boot_id: sha256(`windows|${machineGuid}|${bootText}`),
        boot_identity_source: "windows_machine_guid_boot_time"
      };
    }
  } catch {
    // Fall through to the uptime-based bucket.
  }

  const bootTimeMs = runtime.nowMs() - runtime.osUptimeMs();
  const bucket = Math.floor(bootTimeMs / WINDOWS_UPTIME_BUCKET_MS);
  return {
    boot_id: sha256(`windows|${machineGuid}|uptime-bucket-${bucket}`),
    boot_identity_source: "windows_machine_guid_uptime"
  };
}

export async function readLocalCutterAccountBootIdentity(
  runtime: CutterAccountLockRuntime = defaultRuntime
): Promise<CutterAccountBootIdentity | null> {
  try {
    if (runtime.platform === "win32") {
      return await readWindowsCutterAccountBootIdentity(runtime);
    }
    if (runtime.platform === "darwin") {
      const result = await runtime.execFile("/usr/sbin/sysctl", [
        "-n",
        "kern.bootsessionuuid"
      ]);
      const value = result.stdout.trim();
      return value
        ? { boot_id: sha256(`darwin|${value}`), boot_identity_source: "darwin_sysctl" }
        : null;
    }
    if (runtime.platform === "linux") {
      const value = (await runtime.readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
      return value
        ? { boot_id: sha256(`linux|${value}`), boot_identity_source: "linux_boot_id" }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

export type CutterAccountLockInspection =
  | { exists: false }
  | {
      exists: true;
      kind: "managed" | "legacy" | "invalid";
      owner: CutterAccountLockOwner | null;
      fingerprint: string;
      boot_identity_source?: CutterAccountBootIdentitySource;
      boot_identity_supported: boolean;
      path: string;
    };

function projectOwner(value: unknown): CutterAccountLockOwner | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const version = candidate.version;
  const host = candidate.host;
  const pid = candidate.pid;
  const token = candidate.token;
  const bootId = candidate.boot_id ?? candidate.boot_id_legacy;
  if (typeof host !== "string" || !Number.isSafeInteger(pid) || (pid as number) <= 0) {
    return null;
  }
  if (typeof token !== "string" || !token) {
    return null;
  }
  if (version === 1) {
    // v1 candidate locks are readable for conservative inspection but never auto-recovered.
    return {
      version: 2,
      host,
      boot_id: typeof bootId === "string" ? bootId : "",
      boot_identity_source: "unsupported",
      pid: pid as number,
      token
    };
  }
  if (version !== 2 || typeof bootId !== "string" || !bootId) {
    return null;
  }
  const source = candidate.boot_identity_source;
  const allowedSources: CutterAccountBootIdentitySource[] = [
    "darwin_sysctl",
    "linux_boot_id",
    "windows_machine_guid_boot_time",
    "windows_machine_guid_uptime",
    "unsupported"
  ];
  if (typeof source !== "string" || !allowedSources.includes(source as CutterAccountBootIdentitySource)) {
    return null;
  }
  return {
    version: 2,
    host,
    boot_id: bootId,
    boot_identity_source: source as CutterAccountBootIdentitySource,
    pid: pid as number,
    token
  };
}

export async function inspectCutterAccountLock(
  root: string,
  name: CutterAccountLockName = "users",
  runtime: CutterAccountLockRuntime = defaultRuntime
): Promise<CutterAccountLockInspection> {
  const lock = lockPath(root, name);
  const bootIdentity = await readLocalCutterAccountBootIdentity(runtime);
  try {
    const info = await lstat(lock);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw failure("account_lock_invalid", "账号锁不是普通目录");
    }
    const raw = await readFile(path.join(lock, "owner.json"), "utf8").catch((error) => {
      if (absent(error)) {
        return "";
      }
      throw error;
    });
    let owner: CutterAccountLockOwner | null = null;
    try {
      owner = projectOwner(JSON.parse(raw));
    } catch {
      // An ownerless/incomplete legacy lock needs explicit offline confirmation.
    }
    return {
      exists: true,
      kind: owner ? "managed" : raw ? "invalid" : "legacy",
      owner,
      fingerprint: sha256(JSON.stringify([info.dev, info.ino, info.mtimeMs, raw])),
      ...(owner ? { boot_identity_source: owner.boot_identity_source } : {}),
      boot_identity_supported: bootIdentity !== null,
      path: lock
    };
  } catch (error) {
    if (absent(error)) {
      return { exists: false };
    }
    throw error;
  }
}

async function processAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export interface DeadLocalOwnerCheck {
  dead: boolean;
  reason:
    | "dead"
    | "alive"
    | "foreign_host"
    | "different_boot"
    | "boot_identity_unsupported"
    | "v1_owner";
}

export async function checkCutterAccountLockOwnerDead(
  owner: CutterAccountLockOwner,
  runtime: CutterAccountLockRuntime = defaultRuntime
): Promise<DeadLocalOwnerCheck> {
  if (owner.host !== runtime.hostname) {
    return { dead: false, reason: "foreign_host" };
  }
  if (owner.boot_identity_source === "unsupported") {
    return { dead: false, reason: "v1_owner" };
  }
  const current = await readLocalCutterAccountBootIdentity(runtime);
  if (!current) {
    return { dead: false, reason: "boot_identity_unsupported" };
  }
  if (owner.boot_id !== current.boot_id) {
    return { dead: false, reason: "different_boot" };
  }
  return (await processAlive(owner.pid))
    ? { dead: false, reason: "alive" }
    : { dead: true, reason: "dead" };
}

export interface RecoverCutterAccountLockInput {
  fingerprint: string;
  legacy_writers_stopped?: boolean;
}

export interface RecoveredCutterAccountLock {
  recovered: true;
  quarantine: string;
  owner: CutterAccountLockOwner | null;
}

export async function recoverCutterAccountLock(
  root: string,
  input: RecoverCutterAccountLockInput,
  name: CutterAccountLockName = "users",
  runtime: CutterAccountLockRuntime = defaultRuntime
): Promise<RecoveredCutterAccountLock> {
  const lock = lockPath(root, name);
  const guard = `${lock}.recovery`;
  await mkdir(accountDirectory(root), { recursive: true, mode: 0o700 });
  await mkdir(guard, { mode: 0o700 });
  try {
    const current = await inspectCutterAccountLock(root, name, runtime);
    if (!current.exists) {
      throw failure("account_lock_changed", "账号锁不存在或已被处理");
    }
    if (current.fingerprint !== input.fingerprint) {
      throw failure("account_lock_changed", "账号锁已变化，请重新检查");
    }
    if (current.kind === "managed") {
      const check = await checkCutterAccountLockOwnerDead(current.owner!, runtime);
      if (!check.dead) {
        throw failure(
          "account_lock_unverified",
          check.reason === "boot_identity_unsupported"
            ? "当前平台不支持安全的启动身份校验，无法自动回收账号锁；请在确认所有写入者停止后离线处理"
            : "无法证明账号写入者已退出；活动或其他机器/其他启动的锁不能回收"
        );
      }
    } else if (current.kind !== "legacy" || input.legacy_writers_stopped !== true) {
      throw failure(
        "account_lock_unverified",
        "旧锁没有所有者记录，必须显式确认所有旧写入者已停止后才能恢复"
      );
    }

    const quarantine = `${lock}.recovered-${randomUUID()}`;
    await rename(lock, quarantine);
    return { recovered: true, quarantine, owner: current.owner };
  } finally {
    await rm(guard, { recursive: true, force: true });
  }
}

export function withCutterAccountServiceOwner<T>(root: string, operation: () => T): T {
  return serviceContext.run(path.resolve(root), operation);
}

export interface AcquireCutterAccountLockOptions {
  name?: CutterAccountLockName;
  holder?: string;
  reason?: string;
  now?: string;
  deadline_ms?: number;
  runtime?: CutterAccountLockRuntime;
}

export interface CutterAccountLockHandle {
  release(): Promise<void>;
  owner: CutterAccountLockOwner;
  path: string;
}

export async function acquireCutterAccountLock(
  root: string,
  options: AcquireCutterAccountLockOptions = {}
): Promise<CutterAccountLockHandle> {
  const runtime = options.runtime ?? defaultRuntime;
  const name = options.name ?? "users";
  const directory = accountDirectory(root);
  const lock = lockPath(root, name);
  const guard = `${lock}.recovery`;
  await mkdir(directory, { recursive: true, mode: 0o700 });

  if (name === "users" && serviceContext.getStore() !== path.resolve(root)) {
    const owned = await lstat(path.join(directory, "service-owned.json")).catch((error) => {
      if (absent(error)) {
        return null;
      }
      throw error;
    });
    if (owned) {
      throw failure(
        "account_service_required",
        "账号已由账号服务独占，请通过账号服务操作（MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL）"
      );
    }
  }

  const bootIdentity = await readLocalCutterAccountBootIdentity(runtime);
  const owner: CutterAccountLockOwner = {
    version: 2,
    host: runtime.hostname,
    boot_id: bootIdentity?.boot_id ?? "",
    boot_identity_source: bootIdentity?.boot_identity_source ?? "unsupported",
    pid: process.pid,
    token: randomUUID()
  };
  const deadline = performance.now() + (options.deadline_ms ?? 5_000);

  for (;;) {
    const guardExists = await lstat(guard)
      .then(() => true)
      .catch((error) => {
        if (absent(error)) {
          return false;
        }
        throw error;
      });
    if (!guardExists) {
      try {
        await mkdir(lock, { mode: 0o700 });
        const guardNow = await lstat(guard)
          .then(() => true)
          .catch((error) => {
            if (absent(error)) {
              return false;
            }
            throw error;
          });
        if (guardNow) {
          await rm(lock, { recursive: true, force: true });
          continue;
        }
        await writeFile(path.join(lock, "owner.json"), JSON.stringify(owner), { mode: 0o600 });
        return {
          owner,
          path: lock,
          async release() {
            const current = await inspectCutterAccountLock(root, name, runtime);
            if (!current.exists || current.owner?.token !== owner.token) {
              throw failure("account_lock_changed", "账号锁所有者已变化，未删除其他写入者的锁");
            }
            await rm(lock, { recursive: true });
          }
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }

      const current = await inspectCutterAccountLock(root, name, runtime);
      if (current.exists && current.kind === "managed" && current.owner) {
        const check = await checkCutterAccountLockOwnerDead(current.owner, runtime);
        if (check.dead) {
          await recoverCutterAccountLock(root, { fingerprint: current.fingerprint }, name, runtime).catch(
            (error) => {
              if (!["EEXIST", "account_lock_changed", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) {
                throw error;
              }
            }
          );
          continue;
        }
      }
    }

    if (performance.now() >= deadline) {
      throw failure("cutter_users_busy", "账号写入正在被其他进程占用；请稍后重试或检查遗留锁");
    }
    await delay(50);
  }
}
