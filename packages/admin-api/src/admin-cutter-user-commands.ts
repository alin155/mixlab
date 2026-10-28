import path from "node:path";
import {
  createCutterAccountsFromEnv,
  type CutterAccounts,
  type CutterUserRecord,
  type CutterSessionRecord
} from "../../library-fs/src/index.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";

export type AdminApproveCutterUserResult = {
  status: "approved";
  user: CutterUserRecord;
  session: CutterSessionRecord;
};

interface AdminCutterUserCommandContext {
  library_root: string;
  now: string;
  actor?: AdminCommandActor;
  /**
   * Feature-flag aware account client. Omitted in production: resolved from
   * MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL (unset => legacy shared users.json).
   */
  accounts?: CutterAccounts;
}

function resolveCutterAccounts(input: AdminCutterUserCommandContext): CutterAccounts {
  return input.accounts ?? createCutterAccountsFromEnv();
}

/**
 * Command snapshots only make sense for the legacy shared users.json. When the account
 * service is authoritative, snapshotting the (now stale) shared file would mislead
 * rollback tooling, so snapshots are skipped in service mode.
 */
function commandSnapshotFiles(
  input: AdminCutterUserCommandContext,
  accounts: CutterAccounts
): { label: string; file_path: string }[] {
  return accounts.mode === "service" ? [] : cutterUserStoreSnapshotFiles(input.library_root);
}

function cutterUserStoreSnapshotFiles(libraryRoot: string): {
  label: string;
  file_path: string;
}[] {
  return [{
    label: "cutter-user-store",
    file_path: path.join(libraryRoot, ".mixlab-library", "cutter-users", "users.json")
  }];
}

export async function runAdminApproveCutterUserCommand(
  input: AdminCutterUserCommandContext & { user_id: string }
): Promise<AdminApproveCutterUserResult> {
  const accounts = resolveCutterAccounts(input);
  return runAdminCommand({
    library_root: input.library_root,
    command: "cutter-user-approve",
    now: input.now,
    actor: input.actor,
    snapshot_files: commandSnapshotFiles(input, accounts)
  }, () => accounts.approveCutterUser(input.library_root, {
    user_id: input.user_id,
    now: input.now
  }));
}

export async function runAdminDisableCutterUserCommand(
  input: AdminCutterUserCommandContext & { user_id: string }
): Promise<CutterUserRecord> {
  const accounts = resolveCutterAccounts(input);
  return runAdminCommand({
    library_root: input.library_root,
    command: "cutter-user-disable",
    now: input.now,
    actor: input.actor,
    snapshot_files: commandSnapshotFiles(input, accounts)
  }, () => accounts.disableCutterUser(input.library_root, {
    user_id: input.user_id,
    now: input.now
  }));
}

export async function runAdminResetCutterUserPasswordCommand(
  input: AdminCutterUserCommandContext & {
    user_id: string;
    new_password: string;
  }
): Promise<CutterUserRecord> {
  const accounts = resolveCutterAccounts(input);
  return runAdminCommand({
    library_root: input.library_root,
    command: "cutter-user-password-reset",
    now: input.now,
    actor: input.actor,
    snapshot_files: commandSnapshotFiles(input, accounts)
  }, () => accounts.resetCutterUserPassword(input.library_root, {
    user_id: input.user_id,
    new_password: input.new_password
  }));
}

/**
 * Read-path providers (Round5). With the account service flag enabled the Admin read
 * paths must resolve the service authority instead of the legacy users.json; with the
 * flag off they fall back to the exact legacy behavior. Service errors propagate
 * (fail-closed) — we never silently read a stale shared file when the service is on.
 */
export interface AdminCutterUserReadContext {
  library_root: string;
  env?: NodeJS.ProcessEnv;
  accounts?: CutterAccounts;
}

export async function listCutterUsersForAdmin(
  input: AdminCutterUserReadContext
): Promise<{ users: CutterUserRecord[] }> {
  const accounts = input.accounts ?? createCutterAccountsFromEnv(input.env);
  return accounts.listCutterUsers(input.library_root);
}

export async function listCutterUsersWithTiersForAdmin(
  input: AdminCutterUserReadContext
): Promise<{ users: Array<CutterUserRecord & { tier: "ordinary" | "pro" }> }> {
  const accounts = input.accounts ?? createCutterAccountsFromEnv(input.env);
  return accounts.listCutterUsersWithTiers(input.library_root);
}

export async function readCutterAccountEntitlementsForAdmin(
  input: AdminCutterUserReadContext
): Promise<{ schema_version: "1.0"; accounts: Record<string, "ordinary" | "pro"> }> {
  const accounts = input.accounts ?? createCutterAccountsFromEnv(input.env);
  return accounts.getCutterAccountEntitlements(input.library_root);
}

/**
 * Ready-to-wire Admin read service for admin-system-read (index.ts currently passes the
 * legacy `listCutterUsers`). One-line wiring once scope allows index.ts:
 *   list_cutter_users_service: createAdminCutterUserListService()
 */
export function createAdminCutterUserListService(
  env: Partial<NodeJS.ProcessEnv> = process.env
): (libraryRoot: string) => Promise<{ users: CutterUserRecord[] }> {
  return (libraryRoot) => listCutterUsersForAdmin({ library_root: libraryRoot, env });
}

export function createAdminCutterUserListWithTiersService(
  env: Partial<NodeJS.ProcessEnv> = process.env
): (libraryRoot: string) => Promise<{ users: Array<CutterUserRecord & { tier: "ordinary" | "pro" }> }> {
  return (libraryRoot) => listCutterUsersWithTiersForAdmin({ library_root: libraryRoot, env });
}
