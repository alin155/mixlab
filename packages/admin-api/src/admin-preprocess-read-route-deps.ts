import type {
  AdminPreprocessProcessHistoryOptions,
  AdminPreprocessReadRouteApiInput,
  AdminPreprocessReadRouteDeps
} from "./admin-preprocess-read-routes.ts";
import {
  readAdminPreprocessProcessHistoryQuery,
  readAdminPreprocessProcessHistoryReadinessQuery,
  type AdminPreprocessProcessHistoryQueryDeps,
  type AdminPreprocessProcessHistoryReadinessResponse,
  type AdminPreprocessProcessHistoryResponse
} from "./admin-preprocess-process-history-query.ts";

export interface CreateAdminPreprocessReadRouteDepsInput<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorStatus,
  TSafety
> extends AdminPreprocessProcessHistoryQueryDeps {
  read_source_video_detail(libraryRoot: string, sourceVideoId: string): Promise<TSourceVideoDetail | null>;
  read_preprocess_job_log(libraryRoot: string, sourceVideoId: string): Promise<TPreprocessJobLog>;
  read_preprocess_supervisor_status(): TSupervisorStatus;
  read_preprocess_safety(input: TApiInput): Promise<TSafety>;
}

export interface CreateAdminPreprocessReadRouteServerDepsInput<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorRuntimeStatus,
  TSupervisorPublicStatus,
  TSafety
> extends AdminPreprocessProcessHistoryQueryDeps {
  read_source_video_detail(libraryRoot: string, sourceVideoId: string): Promise<TSourceVideoDetail | null>;
  read_preprocess_job_log(libraryRoot: string, sourceVideoId: string): Promise<TPreprocessJobLog>;
  read_preprocess_supervisor_status(): TSupervisorRuntimeStatus;
  to_public_preprocess_supervisor_status(status: TSupervisorRuntimeStatus): TSupervisorPublicStatus;
  read_preprocess_safety(input: {
    api_input: TApiInput;
    include_processing_guard: boolean;
  }): Promise<TSafety>;
}

export function createAdminPreprocessReadRouteDeps<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorStatus,
  TSafety
>(
  input: CreateAdminPreprocessReadRouteDepsInput<
    TApiInput,
    TSourceVideoDetail,
    TPreprocessJobLog,
    TSupervisorStatus,
    TSafety
  >
): AdminPreprocessReadRouteDeps<
  TApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog,
  TSupervisorStatus,
  TSafety,
  AdminPreprocessProcessHistoryResponse,
  AdminPreprocessProcessHistoryReadinessResponse
> {
  const processHistoryQueryDeps: AdminPreprocessProcessHistoryQueryDeps = {
    read_library_manifest: input.read_library_manifest,
    read_process_history_from_store: input.read_process_history_from_store,
    read_process_history_readiness_from_store: input.read_process_history_readiness_from_store
  };

  return {
    read_source_video_detail: input.read_source_video_detail,
    read_preprocess_job_log: input.read_preprocess_job_log,
    read_preprocess_supervisor_status: input.read_preprocess_supervisor_status,
    read_preprocess_safety: input.read_preprocess_safety,
    read_preprocess_process_history(apiInput: TApiInput, options: AdminPreprocessProcessHistoryOptions) {
      return readAdminPreprocessProcessHistoryQuery(processHistoryQueryDeps, {
        library_root: apiInput.library_root,
        now: options.now,
        window_days: options.window_days,
        limit: options.limit,
        source_folder_name: options.source_folder_name,
        preprocess_status: options.preprocess_status,
        event_type: options.event_type
      });
    },
    read_preprocess_process_history_readiness(apiInput: TApiInput) {
      return readAdminPreprocessProcessHistoryReadinessQuery(processHistoryQueryDeps, {
        library_root: apiInput.library_root
      });
    }
  };
}

export function createAdminPreprocessReadRouteServerDeps<
  TApiInput extends AdminPreprocessReadRouteApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog extends object,
  TSupervisorRuntimeStatus,
  TSupervisorPublicStatus,
  TSafety
>(
  input: CreateAdminPreprocessReadRouteServerDepsInput<
    TApiInput,
    TSourceVideoDetail,
    TPreprocessJobLog,
    TSupervisorRuntimeStatus,
    TSupervisorPublicStatus,
    TSafety
  >
): AdminPreprocessReadRouteDeps<
  TApiInput,
  TSourceVideoDetail,
  TPreprocessJobLog,
  TSupervisorPublicStatus,
  TSafety,
  AdminPreprocessProcessHistoryResponse,
  AdminPreprocessProcessHistoryReadinessResponse
> {
  return createAdminPreprocessReadRouteDeps({
    read_source_video_detail: input.read_source_video_detail,
    read_preprocess_job_log: input.read_preprocess_job_log,
    read_preprocess_supervisor_status() {
      return input.to_public_preprocess_supervisor_status(input.read_preprocess_supervisor_status());
    },
    read_preprocess_safety(apiInput: TApiInput) {
      return input.read_preprocess_safety({
        api_input: apiInput,
        include_processing_guard: true
      });
    },
    read_library_manifest: input.read_library_manifest,
    read_process_history_from_store: input.read_process_history_from_store,
    read_process_history_readiness_from_store: input.read_process_history_readiness_from_store
  });
}
