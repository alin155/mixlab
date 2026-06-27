import path from "node:path";
import {
  approveCutterUser,
  disableCutterUser,
  resetCutterUserPassword,
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
  return runAdminCommand({
    library_root: input.library_root,
    command: "cutter-user-approve",
    now: input.now,
    actor: input.actor,
    snapshot_files: cutterUserStoreSnapshotFiles(input.library_root)
  }, () => approveCutterUser(input.library_root, {
    user_id: input.user_id,
    now: input.now
  }));
}

export async function runAdminDisableCutterUserCommand(
  input: AdminCutterUserCommandContext & { user_id: string }
): Promise<CutterUserRecord> {
  return runAdminCommand({
    library_root: input.library_root,
    command: "cutter-user-disable",
    now: input.now,
    actor: input.actor,
    snapshot_files: cutterUserStoreSnapshotFiles(input.library_root)
  }, () => disableCutterUser(input.library_root, {
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
  return runAdminCommand({
    library_root: input.library_root,
    command: "cutter-user-password-reset",
    now: input.now,
    actor: input.actor,
    snapshot_files: cutterUserStoreSnapshotFiles(input.library_root)
  }, () => resetCutterUserPassword(input.library_root, {
    user_id: input.user_id,
    new_password: input.new_password
  }));
}
