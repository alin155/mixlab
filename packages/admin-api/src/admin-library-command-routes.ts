import {
  adminDockerMvpCommandBlockedRouteError,
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";
import { AdminScanApplyBlockedError } from "./admin-scan-planner.ts";

export interface AdminLibraryCommandRouteApiInput {
  library_root: string;
}

export interface AdminLibraryCommandRouteCommandInput<TApiInput extends AdminLibraryCommandRouteApiInput> {
  api_input: TApiInput;
}

export interface AdminLibraryScanRouteResult<TReadModelHandoff extends object> {
  read_model: TReadModelHandoff | null;
}

export interface AdminLibraryCommandRouteDeps<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule
> {
  run_library_init_command(input: AdminLibraryCommandRouteCommandInput<TApiInput>): Promise<TLibraryInitResult>;
  run_library_scan_apply_command(input: AdminLibraryCommandRouteCommandInput<TApiInput>): Promise<TScanApplyResult>;
  run_library_scan_new_command(input: AdminLibraryCommandRouteCommandInput<TApiInput>): Promise<TScanApplyResult>;
  run_library_scan_preview_command(input: AdminLibraryCommandRouteCommandInput<TApiInput>): Promise<TScanPreviewResult>;
  schedule_read_model_reconcile_after_scan(input: {
    handoff: TScanApplyResult["read_model"];
  }): TReconcileSchedule;
  clear_source_video_page_cache(libraryRoot: string): void;
}

export type AdminLibraryCommandRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminLibraryCommandRoutesInput<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminLibraryCommandRouteDeps<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule
  >;
}

export function matchAdminLibraryInitPath(pathname: string): boolean {
  return pathname === "/api/admin/library/init";
}

export function matchAdminLibraryScanApplyPath(pathname: string): boolean {
  return pathname === "/api/admin/library/scan";
}

export function matchAdminLibraryScanNewPath(pathname: string): boolean {
  return pathname === "/api/admin/library/scan-new";
}

export function matchAdminLibraryScanPreviewPath(pathname: string): boolean {
  return pathname === "/api/admin/library/scan-preview";
}

export async function handleAdminLibraryCommandRoutes<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule
>(
  input: HandleAdminLibraryCommandRoutesInput<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule
  >
): Promise<AdminLibraryCommandRouteResult> {
  if (input.method === "POST" && matchAdminLibraryInitPath(input.pathname)) {
    try {
      const result = await input.deps.run_library_init_command({
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

  if (input.method === "POST" && matchAdminLibraryScanApplyPath(input.pathname)) {
    try {
      const result = await input.deps.run_library_scan_apply_command({
        api_input: input.api_input
      });
      const reconcileSchedule = input.deps.schedule_read_model_reconcile_after_scan({
        handoff: result.read_model
      });
      input.deps.clear_source_video_page_cache(input.api_input.library_root);

      return {
        handled: true,
        status_code: 200,
        body: apiOk({
          ...result,
          read_model: result.read_model
            ? {
                ...result.read_model,
                reconcile_schedule: reconcileSchedule
              }
            : result.read_model
        })
      };
    } catch (error) {
      if (error instanceof AdminScanApplyBlockedError) {
        return {
          handled: true,
          status_code: 409,
          body: apiError(
            error.code,
            error.message,
            { preview: error.preview as unknown as Record<string, unknown> }
          )
        };
      }

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

  if (input.method === "POST" && matchAdminLibraryScanNewPath(input.pathname)) {
    try {
      const result = await input.deps.run_library_scan_new_command({
        api_input: input.api_input
      });
      const reconcileSchedule = input.deps.schedule_read_model_reconcile_after_scan({
        handoff: result.read_model
      });
      input.deps.clear_source_video_page_cache(input.api_input.library_root);

      return {
        handled: true,
        status_code: 200,
        body: apiOk({
          ...result,
          read_model: result.read_model
            ? {
                ...result.read_model,
                reconcile_schedule: reconcileSchedule
              }
            : result.read_model
        })
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

  if (input.method === "POST" && matchAdminLibraryScanPreviewPath(input.pathname)) {
    return {
      handled: true,
      status_code: 200,
      body: apiOk(await input.deps.run_library_scan_preview_command({
        api_input: input.api_input
      }))
    };
  }

  return { handled: false };
}
