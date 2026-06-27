import {
  loginAdmin,
  logoutAdminSession,
  registerFirstAdmin,
  type AdminSessionRecord,
  type AdminUserRecord
} from "../../library-fs/src/index.ts";
import {
  adminCommandSystemActor,
  type AdminCommandActor
} from "./admin-command-audit.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";

interface AdminAuthCommandContext {
  library_root: string;
  now: string;
  actor?: AdminCommandActor;
}

export type AdminAuthLoginCommandResult =
  | { ok: true; user: AdminUserRecord; session: AdminSessionRecord }
  | { ok: false; reason: string };

function authCommandActor(actor?: AdminCommandActor): AdminCommandActor {
  return actor ?? adminCommandSystemActor("管理端认证", "system-task");
}

export async function runAdminAuthRegisterCommand(
  input: AdminAuthCommandContext & {
    username: string;
    password: string;
    display_name?: string;
  }
): Promise<{ user: AdminUserRecord; session: AdminSessionRecord }> {
  return runAdminCommand({
    library_root: input.library_root,
    command: "admin-auth-register",
    now: input.now,
    actor: authCommandActor(input.actor)
  }, () => registerFirstAdmin(input.library_root, {
    username: input.username,
    password: input.password,
    display_name: input.display_name,
    now: input.now
  }));
}

export async function runAdminAuthLoginCommand(
  input: AdminAuthCommandContext & {
    username: string;
    password: string;
  }
): Promise<AdminAuthLoginCommandResult> {
  return runAdminCommand({
    library_root: input.library_root,
    command: "admin-auth-login",
    now: input.now,
    actor: authCommandActor(input.actor)
  }, () => loginAdmin(input.library_root, {
    username: input.username,
    password: input.password,
    now: input.now
  }));
}

export async function runAdminAuthLogoutCommand(
  input: AdminAuthCommandContext & {
    session_token: string;
  }
): Promise<{ removed: boolean }> {
  return runAdminCommand({
    library_root: input.library_root,
    command: "admin-auth-logout",
    now: input.now,
    actor: authCommandActor(input.actor)
  }, () => logoutAdminSession(input.library_root, {
    session_token: input.session_token
  }));
}
