import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  accountDirectory,
  accountEntitlementsPath,
  accountUsersPath,
  acquireCutterAccountLock
} from "./cutter-account-lock.ts";

export const CUTTER_ACCOUNT_IMPORT_FILE = "account-import.json";
export const CUTTER_ACCOUNT_ROLLBACK_FILE = "account-rollback.json";
export const CUTTER_ACCOUNT_BACKUP_ROOT = "backups";

export interface CutterAccountMigrationInput {
  legacy_root: string;
  state_root: string;
}

export interface CutterAccountMigrationApplyInput extends CutterAccountMigrationInput {
  legacy_writers_stopped: boolean;
}

export interface CutterAccountMigrationInspection {
  legacy_root: string;
  state_root: string;
  users_count: number;
  sessions_count: number;
  entitlements_count: number;
  source_digest: string;
  state_ready: boolean;
  already_applied: boolean;
  imported_source_digest: string | null;
  blockers: string[];
}

interface AccountImportRecord {
  version: 1;
  legacy_root: string;
  source_digest: string;
  state_root: string;
  backup_dir: string;
  users_backup: string | null;
  entitlements_backup: string | null;
  users_count: number;
  sessions_count: number;
  entitlements_count: number;
  applied_at: string;
  ready: boolean;
}

interface AccountRollbackRecord {
  version: 1;
  legacy_root: string;
  state_root: string;
  source_digest: string;
  restored_at: string;
  rolled_back: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestSnapshot(input: { users_raw: string | null; entitlements_raw: string | null }): string {
  return sha256(JSON.stringify([input.users_raw, input.entitlements_raw]));
}

function contains(ancestor: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(ancestor), path.resolve(candidate));
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))
  );
}

function requireSeparateAbsolutePaths(legacyRoot: string, stateRoot: string): void {
  if (!path.isAbsolute(legacyRoot) || !path.isAbsolute(stateRoot)) {
    throw new Error("账号迁移必须使用显式的绝对路径");
  }
  if (contains(legacyRoot, stateRoot) || contains(stateRoot, legacyRoot)) {
    throw new Error("账号服务状态目录必须与旧账号目录互相独立，不能互相包含");
  }
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function parseUsers(raw: string | null): { users_count: number; sessions_count: number } {
  if (raw === null) {
    return { users_count: 0, sessions_count: 0 };
  }
  const value = JSON.parse(raw) as { users?: unknown; sessions?: unknown };
  return {
    users_count: Array.isArray(value.users) ? value.users.length : 0,
    sessions_count: Array.isArray(value.sessions) ? value.sessions.length : 0
  };
}

function parseEntitlements(raw: string | null): number {
  if (raw === null) {
    return 0;
  }
  const value = JSON.parse(raw) as { accounts?: unknown };
  return value.accounts && typeof value.accounts === "object"
    ? Object.keys(value.accounts as Record<string, unknown>).length
    : 0;
}

async function snapshotAccountStore(root: string): Promise<{
  users_raw: string | null;
  entitlements_raw: string | null;
  digest: string;
  users_count: number;
  sessions_count: number;
  entitlements_count: number;
}> {
  const usersRaw = await readOptional(accountUsersPath(root));
  const entitlementsRaw = await readOptional(accountEntitlementsPath(root));
  const counts = parseUsers(usersRaw);
  return {
    users_raw: usersRaw,
    entitlements_raw: entitlementsRaw,
    digest: digestSnapshot({ users_raw: usersRaw, entitlements_raw: entitlementsRaw }),
    users_count: counts.users_count,
    sessions_count: counts.sessions_count,
    entitlements_count: parseEntitlements(entitlementsRaw)
  };
}

async function readImportRecord(stateRoot: string): Promise<AccountImportRecord | null> {
  const raw = await readOptional(path.join(stateRoot, CUTTER_ACCOUNT_IMPORT_FILE));
  if (raw === null) {
    return null;
  }
  const value = JSON.parse(raw) as AccountImportRecord;
  if (value.version !== 1 || value.ready !== true || typeof value.source_digest !== "string") {
    throw new Error("账号导入记录未完成或格式无效，禁止继续迁移/回滚");
  }
  return value;
}

async function readRollbackRecord(stateRoot: string): Promise<AccountRollbackRecord | null> {
  const raw = await readOptional(path.join(stateRoot, CUTTER_ACCOUNT_ROLLBACK_FILE));
  return raw === null ? null : (JSON.parse(raw) as AccountRollbackRecord);
}

async function writeAtomic(filePath: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = filePath + ".tmp-" + randomUUID();
  try {
    await writeFile(temporary, content, { mode });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Read-only migration plan: never writes and never acquires the writer lock.
 * apply/rollback require explicit confirmation that legacy writers are stopped.
 */
export async function inspectCutterAccountMigration(
  input: CutterAccountMigrationInput
): Promise<CutterAccountMigrationInspection> {
  const blockers: string[] = [];
  try {
    requireSeparateAbsolutePaths(input.legacy_root, input.state_root);
  } catch (error) {
    blockers.push((error as Error).message);
  }
  const snapshot = await snapshotAccountStore(input.legacy_root);
  const stateExists = await fileExists(path.join(input.state_root, accountDirectory("")));
  let importRecord: AccountImportRecord | null = null;
  try {
    importRecord = stateExists ? await readImportRecord(input.state_root) : null;
  } catch (error) {
    blockers.push((error as Error).message);
  }
  const targetSnapshot = stateExists ? await snapshotAccountStore(input.state_root) : null;
  if (targetSnapshot && targetSnapshot.digest !== snapshot.digest) {
    blockers.push("目标账号目录已有不同账号数据，禁止覆盖");
  }
  return {
    legacy_root: input.legacy_root,
    state_root: input.state_root,
    users_count: snapshot.users_count,
    sessions_count: snapshot.sessions_count,
    entitlements_count: snapshot.entitlements_count,
    source_digest: snapshot.digest,
    state_ready: stateExists,
    already_applied: importRecord?.source_digest === snapshot.digest,
    imported_source_digest: importRecord?.source_digest ?? null,
    blockers
  };
}

export interface CutterAccountMigrationApplyResult {
  applied: boolean;
  reason: "applied" | "already_applied";
  users_count: number;
  sessions_count: number;
  entitlements_count: number;
  source_digest: string;
  backup_dir: string;
}

function backupDirectory(stateRoot: string, digest: string): string {
  return path.join(stateRoot, CUTTER_ACCOUNT_BACKUP_ROOT, "original-" + digest.slice(0, 12));
}

export async function applyCutterAccountMigration(
  input: CutterAccountMigrationApplyInput,
  options: { now?: () => string } = {}
): Promise<CutterAccountMigrationApplyResult> {
  if (!input.legacy_writers_stopped) {
    throw new Error("应用账号迁移前必须显式确认所有旧账号写入者已停止");
  }
  requireSeparateAbsolutePaths(input.legacy_root, input.state_root);
  const now = options.now ?? (() => new Date().toISOString());

  const unlock = await acquireCutterAccountLock(input.legacy_root, {
    holder: "cutter-account-migration",
    reason: "migrate-accounts",
    now: now()
  });
  try {
    const snapshot = await snapshotAccountStore(input.legacy_root);
    const existingImport = (await fileExists(path.join(input.state_root, CUTTER_ACCOUNT_IMPORT_FILE)))
      ? await readImportRecord(input.state_root)
      : null;
    if (existingImport) {
      if (existingImport.source_digest === snapshot.digest) {
        return {
          applied: false,
          reason: "already_applied",
          users_count: snapshot.users_count,
          sessions_count: snapshot.sessions_count,
          entitlements_count: snapshot.entitlements_count,
          source_digest: snapshot.digest,
          backup_dir: existingImport.backup_dir
        };
      }
      throw new Error("账号服务已导入过另一版本账号数据，禁止覆盖；如需切换请先安全回滚");
    }

    const targetSnapshot = await snapshotAccountStore(input.state_root);
    const targetEmpty =
      targetSnapshot.users_raw === null && targetSnapshot.entitlements_raw === null;
    if (!targetEmpty && targetSnapshot.digest !== snapshot.digest) {
      throw new Error("目标账号目录已有不同数据，禁止覆盖");
    }

    const backupDir = backupDirectory(input.state_root, snapshot.digest);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const usersBackup = path.join(backupDir, "users.json");
    const entitlementsBackup = path.join(backupDir, "entitlements.json");
    if (snapshot.users_raw !== null && !(await fileExists(usersBackup))) {
      await writeAtomic(usersBackup, snapshot.users_raw);
    }
    if (snapshot.entitlements_raw !== null && !(await fileExists(entitlementsBackup))) {
      await writeAtomic(entitlementsBackup, snapshot.entitlements_raw);
    }

    if (snapshot.users_raw !== null) {
      await writeAtomic(accountUsersPath(input.state_root), snapshot.users_raw);
    }
    if (snapshot.entitlements_raw !== null) {
      await writeAtomic(accountEntitlementsPath(input.state_root), snapshot.entitlements_raw);
    }

    const record: AccountImportRecord = {
      version: 1,
      legacy_root: path.resolve(input.legacy_root),
      source_digest: snapshot.digest,
      state_root: path.resolve(input.state_root),
      backup_dir: backupDir,
      users_backup: snapshot.users_raw !== null ? usersBackup : null,
      entitlements_backup: snapshot.entitlements_raw !== null ? entitlementsBackup : null,
      users_count: snapshot.users_count,
      sessions_count: snapshot.sessions_count,
      entitlements_count: snapshot.entitlements_count,
      applied_at: now(),
      ready: true
    };
    await writeAtomic(
      path.join(input.state_root, CUTTER_ACCOUNT_IMPORT_FILE),
      JSON.stringify(record, null, 2) + "\n"
    );

    const after = await snapshotAccountStore(input.state_root);
    if (after.digest !== snapshot.digest) {
      throw new Error("账号服务副本写入后校验失败");
    }
    if ((await snapshotAccountStore(input.legacy_root)).digest !== snapshot.digest) {
      throw new Error("旧账号数据在迁移期间发生变化；未启用账号服务");
    }

    return {
      applied: true,
      reason: "applied",
      users_count: record.users_count,
      sessions_count: record.sessions_count,
      entitlements_count: record.entitlements_count,
      source_digest: record.source_digest,
      backup_dir: backupDir
    };
  } finally {
    await unlock.release();
  }
}

export interface CutterAccountMigrationRollbackResult {
  rolled_back: boolean;
  reason: "restored" | "already_rolled_back" | "nothing_to_restore";
  source_digest: string;
  restored_files: string[];
}

export async function rollbackCutterAccountMigration(
  input: CutterAccountMigrationApplyInput,
  options: { now?: () => string } = {}
): Promise<CutterAccountMigrationRollbackResult> {
  if (!input.legacy_writers_stopped) {
    throw new Error("回滚账号迁移前必须显式确认所有旧账号写入者已停止");
  }
  requireSeparateAbsolutePaths(input.legacy_root, input.state_root);
  const now = options.now ?? (() => new Date().toISOString());
  const importRecord = await readImportRecord(input.state_root);
  if (!importRecord) {
    throw new Error("账号服务没有可回滚的导入记录");
  }

  let serviceLock;
  try {
    serviceLock = await acquireCutterAccountLock(input.state_root, {
      name: "service",
      holder: "cutter-account-migration-rollback",
      reason: "rollback-accounts",
      now: now()
    });
  } catch (error) {
    throw new Error("账号服务仍在运行或状态目录被占用，禁止回滚：" + (error as Error).message);
  }
  try {
    const unlockLegacy = await acquireCutterAccountLock(input.legacy_root, {
      holder: "cutter-account-migration-rollback",
      reason: "rollback-accounts",
      now: now()
    });
    try {
      const current = await snapshotAccountStore(input.legacy_root);
      if (current.digest !== importRecord.source_digest) {
        throw Object.assign(new Error("旧账号库在接管后发生了变化；回滚会覆盖新数据，已拒绝"), {
          code: "account_rollback_conflict"
        });
      }
      const existingRollback = await readRollbackRecord(input.state_root);
      if (existingRollback?.rolled_back === true) {
        return {
          rolled_back: false,
          reason: "already_rolled_back",
          source_digest: importRecord.source_digest,
          restored_files: []
        };
      }
      if (!importRecord.users_backup) {
        return {
          rolled_back: false,
          reason: "nothing_to_restore",
          source_digest: importRecord.source_digest,
          restored_files: []
        };
      }

      const restoredFiles: string[] = [];
      const usersBackupRaw = await readOptional(importRecord.users_backup);
      if (usersBackupRaw === null) {
        throw new Error("账号回滚备份缺失，禁止回滚");
      }
      if (usersBackupRaw !== current.users_raw) {
        throw new Error("账号回滚备份内容与导入记录不一致，禁止回滚");
      }
      await writeAtomic(accountUsersPath(input.legacy_root), usersBackupRaw);
      restoredFiles.push("users.json");

      if (importRecord.entitlements_backup) {
        const entitlementsBackupRaw = await readOptional(importRecord.entitlements_backup);
        if (entitlementsBackupRaw !== null) {
          await writeAtomic(accountEntitlementsPath(input.legacy_root), entitlementsBackupRaw);
          restoredFiles.push("entitlements.json");
        }
      }

      const after = await snapshotAccountStore(input.legacy_root);
      if (after.digest !== importRecord.source_digest) {
        throw new Error("账号回滚恢复后校验失败，请保留现场并人工核对");
      }
      const record: AccountRollbackRecord = {
        version: 1,
        legacy_root: importRecord.legacy_root,
        state_root: importRecord.state_root,
        source_digest: importRecord.source_digest,
        restored_at: now(),
        rolled_back: true
      };
      await writeAtomic(
        path.join(input.state_root, CUTTER_ACCOUNT_ROLLBACK_FILE),
        JSON.stringify(record, null, 2) + "\n"
      );
      return {
        rolled_back: true,
        reason: "restored",
        source_digest: record.source_digest,
        restored_files: restoredFiles
      };
    } finally {
      await unlockLegacy.release();
    }
  } finally {
    await serviceLock.release();
  }
}
