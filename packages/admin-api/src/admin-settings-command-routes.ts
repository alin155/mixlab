import type {
  AdminSettings,
  AdminSettingsPatch,
  AdminSourceFolder,
  AdminSourceFolderPatch
} from "../../library-fs/src/index.ts";
import {
  adminDockerMvpCommandBlockedRouteError,
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";
import type { AdminSettingsCommandMutation } from "./admin-settings-commands.ts";

export interface AdminSettingsCommandRouteApiInput {
  library_root: string;
}

export interface AdminSettingsConfigRouteCommandInput<TApiInput extends AdminSettingsCommandRouteApiInput> {
  api_input: TApiInput;
  mutation: AdminSettingsCommandMutation;
}

export interface AdminSourceFolderAddRouteCommandInput<TApiInput extends AdminSettingsCommandRouteApiInput> {
  api_input: TApiInput;
  folder: Omit<AdminSourceFolder, "id">;
}

export interface AdminSourceFolderUpdateRouteCommandInput<TApiInput extends AdminSettingsCommandRouteApiInput> {
  api_input: TApiInput;
  source_folder_id: string;
  patch: AdminSourceFolderPatch;
}

export interface AdminSourceFolderRemoveRouteCommandInput<TApiInput extends AdminSettingsCommandRouteApiInput> {
  api_input: TApiInput;
  source_folder_id: string;
}

export interface AdminSettingsCommandRouteDeps<TApiInput extends AdminSettingsCommandRouteApiInput> {
  read_request_json(): Promise<unknown>;
  run_settings_config_command(input: AdminSettingsConfigRouteCommandInput<TApiInput>): Promise<AdminSettings>;
  run_source_folder_add_command(input: AdminSourceFolderAddRouteCommandInput<TApiInput>): Promise<AdminSettings>;
  run_source_folder_update_command(input: AdminSourceFolderUpdateRouteCommandInput<TApiInput>): Promise<AdminSettings>;
  run_source_folder_remove_command(input: AdminSourceFolderRemoveRouteCommandInput<TApiInput>): Promise<AdminSettings>;
}

export type AdminSettingsCommandRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminSettingsCommandRoutesInput<TApiInput extends AdminSettingsCommandRouteApiInput> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminSettingsCommandRouteDeps<TApiInput>;
}

export function matchAdminSettingsConfigPath(pathname: string): boolean {
  return pathname === "/api/admin/settings/config";
}

export function matchAdminSettingsSourceFolderPath(pathname: string): string | null {
  const match = /^\/api\/admin\/settings\/source-folders\/(src_default|src_\d+)$/.exec(pathname);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRequestRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error("请求内容必须是对象");
  }

  return body;
}

function adminSettingsPatchFromBody(body: Record<string, unknown>): AdminSettingsCommandMutation {
  const patch: AdminSettingsPatch = {};
  let runtimeSecretsPatch: AdminSettingsCommandMutation["runtime_secrets_patch"];

  if ("library_name" in body) {
    patch.library_name = body.library_name as string;
  }

  if ("source_folders" in body) {
    if (!Array.isArray(body.source_folders)) {
      throw new Error("素材来源列表必须是数组");
    }
    patch.source_folders = body.source_folders as AdminSourceFolder[];
  }

  if ("runtime_policy" in body) {
    if (!isRecord(body.runtime_policy)) {
      throw new Error("运行策略必须是对象");
    }
    patch.runtime_policy = body.runtime_policy as unknown as AdminSettingsPatch["runtime_policy"];
  }

  if ("asr" in body) {
    if (!isRecord(body.asr)) {
      throw new Error("语音识别配置必须是对象");
    }

    if ("dashscope_api_key" in body.asr) {
      runtimeSecretsPatch = {
        dashscope_api_key: String(body.asr.dashscope_api_key ?? "")
      };
    }
  }

  return {
    settings_patch: patch,
    ...(runtimeSecretsPatch ? { runtime_secrets_patch: runtimeSecretsPatch } : {})
  };
}

function adminSourceFolderFromBody(body: Record<string, unknown>): Omit<AdminSourceFolder, "id"> {
  return {
    name: body.name as string,
    path: body.path as string,
    enabled: body.enabled === undefined ? true : (body.enabled as boolean)
  };
}

function adminSourceFolderPatchFromBody(body: Record<string, unknown>): AdminSourceFolderPatch {
  const patch: AdminSourceFolderPatch = {};

  if ("name" in body) {
    patch.name = body.name as string;
  }

  if ("path" in body) {
    patch.path = body.path as string;
  }

  if ("enabled" in body) {
    patch.enabled = body.enabled as boolean;
  }

  return patch;
}

function settingsMutationErrorEnvelope(error: unknown): {
  status_code: number;
  body: AdminApiEnvelope<unknown>;
} {
  const dockerMvpBlock = adminDockerMvpCommandBlockedRouteError(error);
  if (dockerMvpBlock) {
    return dockerMvpBlock;
  }

  if (error instanceof SyntaxError) {
    return {
      status_code: 400,
      body: apiError("invalid_request", "请求 JSON 格式无效")
    };
  }

  const message = error instanceof Error ? error.message : "设置保存失败";

  if (message === "素材来源不存在") {
    return {
      status_code: 404,
      body: apiError("not_found", message)
    };
  }

  if (
    message === "请求内容必须是对象" ||
    message === "素材来源列表必须是数组" ||
    message === "运行策略必须是对象" ||
    message === "语音识别配置必须是对象" ||
    message.includes("管理员设置文件格式无效") ||
    message.includes("素材来源") ||
    message.includes("预处理产物库") ||
    message.includes("默认素材来源不能移除")
  ) {
    return {
      status_code: 400,
      body: apiError("invalid_request", message)
    };
  }

  throw error;
}

function settingsMutationErrorResult(error: unknown): AdminSettingsCommandRouteResult {
  const envelope = settingsMutationErrorEnvelope(error);
  return {
    handled: true,
    ...envelope
  };
}

export async function handleAdminSettingsCommandRoutes<TApiInput extends AdminSettingsCommandRouteApiInput>(
  input: HandleAdminSettingsCommandRoutesInput<TApiInput>
): Promise<AdminSettingsCommandRouteResult> {
  if (input.method === "PATCH" && matchAdminSettingsConfigPath(input.pathname)) {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_settings_config_command({
          api_input: input.api_input,
          mutation: adminSettingsPatchFromBody(body)
        }))
      };
    } catch (error) {
      return settingsMutationErrorResult(error);
    }
  }

  if (input.method === "POST" && input.pathname === "/api/admin/settings/source-folders") {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_source_folder_add_command({
          api_input: input.api_input,
          folder: adminSourceFolderFromBody(body)
        }))
      };
    } catch (error) {
      return settingsMutationErrorResult(error);
    }
  }

  const sourceFolderId = matchAdminSettingsSourceFolderPath(input.pathname);
  if (input.method === "PATCH" && sourceFolderId) {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_source_folder_update_command({
          api_input: input.api_input,
          source_folder_id: sourceFolderId,
          patch: adminSourceFolderPatchFromBody(body)
        }))
      };
    } catch (error) {
      return settingsMutationErrorResult(error);
    }
  }

  if (input.method === "DELETE" && sourceFolderId) {
    try {
      return {
        handled: true,
        status_code: 200,
        body: apiOk(await input.deps.run_source_folder_remove_command({
          api_input: input.api_input,
          source_folder_id: sourceFolderId
        }))
      };
    } catch (error) {
      return settingsMutationErrorResult(error);
    }
  }

  return { handled: false };
}
