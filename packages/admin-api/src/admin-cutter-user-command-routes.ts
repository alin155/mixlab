import {
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminCutterUserCommandRouteApiInput {
  library_root: string;
}

export interface AdminCutterUserApproveRouteCommandInput<
  TApiInput extends AdminCutterUserCommandRouteApiInput
> {
  api_input: TApiInput;
  user_id: string;
}

export interface AdminCutterUserDisableRouteCommandInput<
  TApiInput extends AdminCutterUserCommandRouteApiInput
> {
  api_input: TApiInput;
  user_id: string;
}

export interface AdminCutterUserPasswordRouteCommandInput<
  TApiInput extends AdminCutterUserCommandRouteApiInput
> {
  api_input: TApiInput;
  user_id: string;
  new_password: string;
}

export interface AdminCutterUserCommandRouteDeps<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TApprovalResult,
  TPublicUser
> {
  read_request_json(): Promise<unknown>;
  run_approve_cutter_user(
    input: AdminCutterUserApproveRouteCommandInput<TApiInput>
  ): Promise<TApprovalResult>;
  run_disable_cutter_user(
    input: AdminCutterUserDisableRouteCommandInput<TApiInput>
  ): Promise<TPublicUser>;
  run_reset_cutter_user_password(
    input: AdminCutterUserPasswordRouteCommandInput<TApiInput>
  ): Promise<TPublicUser>;
}

export type AdminCutterUserCommandRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminCutterUserCommandRoutesInput<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TApprovalResult,
  TPublicUser
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminCutterUserCommandRouteDeps<TApiInput, TApprovalResult, TPublicUser>;
}

export function matchAdminCutterUserApprovePath(pathname: string): string | null {
  const match = /^\/api\/admin\/cutter-users\/(CU\d+)\/approve$/.exec(pathname);
  return match?.[1] ?? null;
}

export function matchAdminCutterUserDisablePath(pathname: string): string | null {
  const match = /^\/api\/admin\/cutter-users\/(CU\d+)\/disable$/.exec(pathname);
  return match?.[1] ?? null;
}

export function matchAdminCutterUserPasswordPath(pathname: string): string | null {
  const match = /^\/api\/admin\/cutter-users\/(CU\d+)\/password$/.exec(pathname);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredBodyString(body: Record<string, unknown>, key: string, message: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function cutterUserCommandErrorEnvelope(error: unknown): {
  status_code: number;
  body: AdminApiEnvelope<unknown>;
} {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "剪辑师用户不存在") {
    return {
      status_code: 404,
      body: apiError("not_found", message)
    };
  }

  if (
    message === "invalid_json" ||
    message === "只有待审核剪辑师用户可以通过审核" ||
    message === "剪辑师设备不存在" ||
    message === "新密码不能为空" ||
    message === "密码至少需要 8 位" ||
    message === "密码需要同时包含字母和数字"
  ) {
    return {
      status_code: 400,
      body: apiError(
        "invalid_request",
        message === "invalid_json" ? "请求 JSON 格式不正确" : message
      )
    };
  }

  throw error;
}

function cutterUserCommandErrorResult(error: unknown): AdminCutterUserCommandRouteResult {
  const envelope = cutterUserCommandErrorEnvelope(error);
  return {
    handled: true,
    ...envelope
  };
}

export async function handleAdminCutterUserCommandRoutes<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TApprovalResult,
  TPublicUser
>(
  input: HandleAdminCutterUserCommandRoutesInput<TApiInput, TApprovalResult, TPublicUser>
): Promise<AdminCutterUserCommandRouteResult> {
  const approveUserId = matchAdminCutterUserApprovePath(input.pathname);
  if (input.method === "POST" && approveUserId) {
    try {
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_approve_cutter_user({
          api_input: input.api_input,
          user_id: approveUserId
        }))
      };
    } catch (error) {
      return cutterUserCommandErrorResult(error);
    }
  }

  const disableUserId = matchAdminCutterUserDisablePath(input.pathname);
  if (input.method === "POST" && disableUserId) {
    try {
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_disable_cutter_user({
          api_input: input.api_input,
          user_id: disableUserId
        }))
      };
    } catch (error) {
      return cutterUserCommandErrorResult(error);
    }
  }

  const passwordUserId = matchAdminCutterUserPasswordPath(input.pathname);
  if (input.method === "POST" && passwordUserId) {
    try {
      const rawBody = await input.deps.read_request_json();
      const body = isRecord(rawBody) ? rawBody : {};
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_reset_cutter_user_password({
          api_input: input.api_input,
          user_id: passwordUserId,
          new_password: requiredBodyString(body, "new_password", "新密码不能为空")
        }))
      };
    } catch (error) {
      return cutterUserCommandErrorResult(error);
    }
  }

  return { handled: false };
}
