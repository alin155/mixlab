import type { IncomingMessage, ServerResponse } from "node:http";
import type { AdminUserRecord } from "../../library-fs/src/index.ts";
import {
  adminCommandSystemActor,
  type AdminCommandActor
} from "./admin-command-audit.ts";
import {
  adminSessionTokenFromRequest
} from "./admin-auth-routes.ts";
import {
  apiError
} from "./admin-route-adapter.ts";
import {
  matchAdminSourceVideoCoverPath
} from "./admin-source-video-media-routes.ts";

export interface AdminHttpSessionApiInput {
  library_root: string;
  auth_mode?: "password" | "disabled";
}

export interface AdminSessionValidationResult {
  ok: boolean;
  reason?: string;
  user?: AdminUserRecord;
}

export function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readAdminRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function writeAdminJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-MixLab-Admin-Session-Token",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

export function writeAdminNoContent(response: ServerResponse): void {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-MixLab-Admin-Session-Token",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
  });
  response.end();
}

export function isPublicAdminMediaRoute(method: string | undefined, pathname: string): boolean {
  return method === "GET" && Boolean(matchAdminSourceVideoCoverPath(pathname));
}

export function adminCommandActorFromAdminUser(user: AdminUserRecord): AdminCommandActor {
  return {
    kind: "admin-user",
    source: "admin-session",
    admin_id: user.admin_id,
    username: user.username,
    display_name: user.display_name,
    role: user.role
  };
}

export async function requireAdminSession(input: {
  api_input: AdminHttpSessionApiInput;
  request: IncomingMessage;
  response: ServerResponse;
  now: string;
  deps: {
    validate_admin_session(
      libraryRoot: string,
      session: { session_token: string; now: string }
    ): Promise<AdminSessionValidationResult>;
    write_json(response: ServerResponse, statusCode: number, body: unknown): void;
  };
}): Promise<AdminCommandActor | null> {
  if ((input.api_input.auth_mode ?? "disabled") === "disabled") {
    return adminCommandSystemActor("管理端登录已关闭", "auth-disabled");
  }

  const sessionToken = adminSessionTokenFromRequest(input.request);
  if (!sessionToken) {
    input.deps.write_json(input.response, 401, apiError("login_required", "请先登录管理端"));
    return null;
  }

  const validation = await input.deps.validate_admin_session(input.api_input.library_root, {
    session_token: sessionToken,
    now: input.now
  });
  if (!validation.ok || !validation.user) {
    input.deps.write_json(input.response, 401, apiError("login_required", validation.reason ?? "登录凭证无效"));
    return null;
  }

  return adminCommandActorFromAdminUser(validation.user);
}
