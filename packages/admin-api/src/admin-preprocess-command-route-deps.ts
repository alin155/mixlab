import type {
  AdminBulkPreprocessRouteCommand,
  AdminBulkPreprocessRouteResult,
  AdminPreprocessCommandRouteApiInput,
  AdminPreprocessCommandRouteDeps,
  AdminPreprocessRecoverSupervisorStatus,
  AdminPreprocessSupervisorStartInput
} from "./admin-preprocess-command-routes.ts";

interface PreprocessBulkCommandContext<TActor> {
  library_root: string;
  library_id: string;
  library_name: string;
  command: AdminBulkPreprocessRouteCommand;
  command_now: string;
  actor?: TActor;
  now?: () => string;
}

export interface CreateAdminPreprocessCommandRouteDepsInput<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus extends AdminPreprocessRecoverSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult,
  TActor
> {
  library_id: string;
  library_name: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
  read_request_json(): Promise<unknown>;
  read_admin_settings: AdminPreprocessCommandRouteDeps<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult
  >["read_admin_settings"];
  refresh_runtime_secrets(): Promise<void>;
  preprocess_runner_available: boolean;
  env: NodeJS.ProcessEnv;
  assert_real_preprocess_start_ready(env: NodeJS.ProcessEnv): void;
  read_preprocess_safety(input: { api_input: TApiInput; include_processing_guard: boolean }): Promise<TSafety>;
  assert_preprocess_safe_to_start(safety: TSafety): void;
  start_preprocess_supervisor(input: AdminPreprocessSupervisorStartInput<TRuntimePolicy>): TSupervisorStatus;
  stop_preprocess_supervisor(): TSupervisorStatus;
  read_preprocess_supervisor_status(): TSupervisorStatus;
  run_bulk_transition_command(input: PreprocessBulkCommandContext<TActor>): Promise<TBulkTransitionResult>;
  recover_processing_supervisor_block: AdminPreprocessCommandRouteDeps<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult
  >["recover_processing_supervisor_block"];
  clear_source_video_page_cache(libraryRoot: string): void;
}

export interface CreateAdminPreprocessCommandRouteServerDepsInput<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorInternal,
  TSupervisorStatus extends AdminPreprocessRecoverSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult,
  TActor
> extends Omit<
  CreateAdminPreprocessCommandRouteDepsInput<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult,
    TActor
  >,
  "start_preprocess_supervisor" | "stop_preprocess_supervisor" | "read_preprocess_supervisor_status"
> {
  start_preprocess_supervisor(input: AdminPreprocessSupervisorStartInput<TRuntimePolicy>): TSupervisorInternal;
  stop_preprocess_supervisor(): TSupervisorInternal;
  read_preprocess_supervisor_status(): TSupervisorInternal;
  to_public_preprocess_supervisor_status(status: TSupervisorInternal): TSupervisorStatus;
}

export function createAdminPreprocessCommandRouteDeps<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus extends AdminPreprocessRecoverSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult,
  TActor
>(
  input: CreateAdminPreprocessCommandRouteDepsInput<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult,
    TActor
  >
): AdminPreprocessCommandRouteDeps<
  TApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus,
  TBulkTransitionResult
> {
  return {
    read_request_json: input.read_request_json,
    read_admin_settings: input.read_admin_settings,
    refresh_runtime_secrets: input.refresh_runtime_secrets,
    assert_real_preprocess_start_ready() {
      if (!input.preprocess_runner_available) {
        input.assert_real_preprocess_start_ready(input.env);
      }
    },
    read_preprocess_safety(apiInput) {
      return input.read_preprocess_safety({
        api_input: apiInput,
        include_processing_guard: true
      });
    },
    assert_preprocess_safe_to_start: input.assert_preprocess_safe_to_start,
    start_preprocess_supervisor: input.start_preprocess_supervisor,
    stop_preprocess_supervisor: input.stop_preprocess_supervisor,
    run_bulk_transition_command({ api_input, command }) {
      return input.run_bulk_transition_command({
        library_root: api_input.library_root,
        library_id: input.library_id,
        library_name: input.library_name,
        command,
        command_now: input.command_now,
        actor: input.actor,
        now: input.now
      });
    },
    read_preprocess_supervisor_status: input.read_preprocess_supervisor_status,
    recover_processing_supervisor_block: input.recover_processing_supervisor_block,
    clear_source_video_page_cache: input.clear_source_video_page_cache
  };
}

export function createAdminPreprocessCommandRouteServerDeps<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorInternal,
  TSupervisorStatus extends AdminPreprocessRecoverSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult,
  TActor
>(
  input: CreateAdminPreprocessCommandRouteServerDepsInput<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorInternal,
    TSupervisorStatus,
    TBulkTransitionResult,
    TActor
  >
): AdminPreprocessCommandRouteDeps<
  TApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus,
  TBulkTransitionResult
> {
  const {
    start_preprocess_supervisor,
    stop_preprocess_supervisor,
    read_preprocess_supervisor_status,
    to_public_preprocess_supervisor_status,
    ...routeDepsInput
  } = input;

  return createAdminPreprocessCommandRouteDeps({
    ...routeDepsInput,
    start_preprocess_supervisor(startInput) {
      return to_public_preprocess_supervisor_status(start_preprocess_supervisor(startInput));
    },
    stop_preprocess_supervisor() {
      return to_public_preprocess_supervisor_status(stop_preprocess_supervisor());
    },
    read_preprocess_supervisor_status() {
      return to_public_preprocess_supervisor_status(read_preprocess_supervisor_status());
    }
  });
}
