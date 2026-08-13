import type {
  AdminLibraryCommandRouteApiInput,
  AdminLibraryCommandRouteDeps,
  AdminLibraryScanRouteResult
} from "./admin-library-command-routes.ts";

interface LibraryCommandContext<TActor> {
  library_root: string;
  library_id: string;
  library_name: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
}

export interface CreateAdminLibraryCommandRouteDepsInput<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
> {
  library_id: string;
  library_name: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
  run_library_init_command(input: LibraryCommandContext<TActor>): Promise<TLibraryInitResult>;
  run_library_scan_apply_command(input: LibraryCommandContext<TActor>): Promise<TScanApplyResult>;
  run_library_scan_new_command(input: LibraryCommandContext<TActor>): Promise<TScanApplyResult>;
  read_library_scan_new_status(input: LibraryCommandContext<TActor>): Promise<unknown>;
  run_library_scan_preview_command(input: LibraryCommandContext<TActor>): Promise<TScanPreviewResult>;
  schedule_read_model_reconcile_after_scan(input: {
    handoff: TScanApplyResult["read_model"];
  }): TReconcileSchedule;
  clear_source_video_page_cache(libraryRoot: string): void;
}

export function createAdminLibraryCommandRouteDeps<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
>(
  input: CreateAdminLibraryCommandRouteDepsInput<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule,
    TActor
  >
): AdminLibraryCommandRouteDeps<
  TApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff,
  TScanApplyResult,
  TReconcileSchedule
> {
  function commandContext(apiInput: TApiInput): LibraryCommandContext<TActor> {
    return {
      library_root: apiInput.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      command_now: input.command_now,
      actor: input.actor,
      now: input.now
    };
  }

  return {
    run_library_init_command({ api_input }) {
      return input.run_library_init_command(commandContext(api_input));
    },
    run_library_scan_apply_command({ api_input }) {
      return input.run_library_scan_apply_command(commandContext(api_input));
    },
    run_library_scan_new_command({ api_input }) {
      return input.run_library_scan_new_command(commandContext(api_input));
    },
    read_library_scan_new_status({ api_input }) {
      return input.read_library_scan_new_status(commandContext(api_input));
    },
    run_library_scan_preview_command({ api_input }) {
      return input.run_library_scan_preview_command(commandContext(api_input));
    },
    schedule_read_model_reconcile_after_scan: input.schedule_read_model_reconcile_after_scan,
    clear_source_video_page_cache: input.clear_source_video_page_cache
  };
}

type LibraryInitCommandService<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
> = CreateAdminLibraryCommandRouteDepsInput<
  TApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff,
  TScanApplyResult,
  TReconcileSchedule,
  TActor
>["run_library_init_command"];

type LibraryScanApplyCommandService<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
> = CreateAdminLibraryCommandRouteDepsInput<
  TApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff,
  TScanApplyResult,
  TReconcileSchedule,
  TActor
>["run_library_scan_apply_command"];

type LibraryScanNewCommandService<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
> = CreateAdminLibraryCommandRouteDepsInput<
  TApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff,
  TScanApplyResult,
  TReconcileSchedule,
  TActor
>["run_library_scan_new_command"];

type LibraryScanPreviewCommandService<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
> = CreateAdminLibraryCommandRouteDepsInput<
  TApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff,
  TScanApplyResult,
  TReconcileSchedule,
  TActor
>["run_library_scan_preview_command"];

export interface CreateAdminLibraryCommandRouteServerDepsInput<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
> extends Omit<
    CreateAdminLibraryCommandRouteDepsInput<
      TApiInput,
      TLibraryInitResult,
      TScanPreviewResult,
      TReadModelHandoff,
      TScanApplyResult,
      TReconcileSchedule,
      TActor
    >,
    | "run_library_init_command"
    | "run_library_scan_apply_command"
    | "run_library_scan_new_command"
    | "read_library_scan_new_status"
    | "run_library_scan_preview_command"
  > {
  run_library_init_service: LibraryInitCommandService<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule,
    TActor
  >;
  run_library_scan_apply_service: LibraryScanApplyCommandService<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule,
    TActor
  >;
  run_library_scan_new_service: LibraryScanNewCommandService<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule,
    TActor
  >;
  read_library_scan_new_status_service(input: LibraryCommandContext<TActor>): Promise<unknown>;
  run_library_scan_preview_service: LibraryScanPreviewCommandService<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule,
    TActor
  >;
}

export function createAdminLibraryCommandRouteServerDeps<
  TApiInput extends AdminLibraryCommandRouteApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff extends object,
  TScanApplyResult extends AdminLibraryScanRouteResult<TReadModelHandoff>,
  TReconcileSchedule,
  TActor
>(
  input: CreateAdminLibraryCommandRouteServerDepsInput<
    TApiInput,
    TLibraryInitResult,
    TScanPreviewResult,
    TReadModelHandoff,
    TScanApplyResult,
    TReconcileSchedule,
    TActor
  >
): AdminLibraryCommandRouteDeps<
  TApiInput,
  TLibraryInitResult,
  TScanPreviewResult,
  TReadModelHandoff,
  TScanApplyResult,
  TReconcileSchedule
> {
  return createAdminLibraryCommandRouteDeps({
    ...input,
    run_library_init_command: input.run_library_init_service,
    run_library_scan_apply_command: input.run_library_scan_apply_service,
    run_library_scan_new_command: input.run_library_scan_new_service,
    read_library_scan_new_status: input.read_library_scan_new_status_service,
    run_library_scan_preview_command: input.run_library_scan_preview_service
  });
}
