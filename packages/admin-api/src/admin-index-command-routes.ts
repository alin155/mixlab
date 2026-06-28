import {
  adminDockerMvpCommandBlockedRouteError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminIndexCommandRouteApiInput {
  library_root: string;
}

export interface AdminIndexRepairRouteCommandInput<TApiInput extends AdminIndexCommandRouteApiInput> {
  api_input: TApiInput;
}

export interface AdminIndexCommandRouteDeps<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TIndexRepairResult
> {
  run_index_repair_command(input: AdminIndexRepairRouteCommandInput<TApiInput>): Promise<TIndexRepairResult>;
  clear_source_video_page_cache(libraryRoot: string): void;
}

export type AdminIndexCommandRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminIndexCommandRoutesInput<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TIndexRepairResult
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminIndexCommandRouteDeps<TApiInput, TIndexRepairResult>;
}

export function matchAdminIndexRepairPath(pathname: string): boolean {
  return pathname === "/api/admin/index/repair";
}

export async function handleAdminIndexCommandRoutes<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TIndexRepairResult
>(
  input: HandleAdminIndexCommandRoutesInput<TApiInput, TIndexRepairResult>
): Promise<AdminIndexCommandRouteResult> {
  if (input.method === "POST" && matchAdminIndexRepairPath(input.pathname)) {
    try {
      const result = await input.deps.run_index_repair_command({
        api_input: input.api_input
      });
      input.deps.clear_source_video_page_cache(input.api_input.library_root);

      return {
        handled: true,
        status_code: 200,
        body: apiOk(result)
      };
    } catch (error) {
      const dockerMvpBlock = adminDockerMvpCommandBlockedRouteError(error);
      if (dockerMvpBlock) {
        return {
          handled: true,
          ...dockerMvpBlock
        };
      }

      throw error;
    }
  }

  return { handled: false };
}
