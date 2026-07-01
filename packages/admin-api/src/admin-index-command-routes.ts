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
  limit?: number;
}

export interface AdminIndexCommandRouteDeps<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TIndexRepairResult
> {
  run_index_repair_command(input: AdminIndexRepairRouteCommandInput<TApiInput>): Promise<TIndexRepairResult>;
  read_request_json(): Promise<unknown>;
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

export const ADMIN_INDEX_REPAIR_DEFAULT_BATCH_LIMIT = 10;
const ADMIN_INDEX_REPAIR_MAX_BATCH_LIMIT = 10;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function indexRepairBatchLimitFromBody(body: unknown): number {
  const rawLimit = asRecord(body).limit;
  const numericLimit = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;

  if (typeof numericLimit !== "number" || !Number.isFinite(numericLimit) || numericLimit <= 0) {
    return ADMIN_INDEX_REPAIR_DEFAULT_BATCH_LIMIT;
  }

  return Math.min(Math.floor(numericLimit), ADMIN_INDEX_REPAIR_MAX_BATCH_LIMIT);
}

export async function handleAdminIndexCommandRoutes<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TIndexRepairResult
>(
  input: HandleAdminIndexCommandRoutesInput<TApiInput, TIndexRepairResult>
): Promise<AdminIndexCommandRouteResult> {
  if (input.method === "POST" && matchAdminIndexRepairPath(input.pathname)) {
    try {
      const body = await input.deps.read_request_json();
      const result = await input.deps.run_index_repair_command({
        api_input: input.api_input,
        limit: indexRepairBatchLimitFromBody(body)
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
