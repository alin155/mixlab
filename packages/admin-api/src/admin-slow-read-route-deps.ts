import type {
  AdminSlowReadRouteApiInput,
  AdminSlowReadRouteDeps,
  AdminSlowReadRoutePagedOptions,
  AdminSlowReadRouteRuntimeResult
} from "./admin-slow-read-routes.ts";
import type {
  AdminRuntimeComponentTiming,
  AdminRuntimeEndpointMeta
} from "./admin-runtime-observability.ts";

export interface AdminSlowReadRoutePreprocessJobsWrapper<TPreprocessJobs> {
  jobs: TPreprocessJobs;
  actual_data_source: AdminSlowReadRouteRuntimeResult<TPreprocessJobs>["actual_data_source"];
  cache_status: AdminSlowReadRouteRuntimeResult<TPreprocessJobs>["cache_status"];
  component_timings?: AdminRuntimeComponentTiming[];
}

export interface CreateAdminSlowReadRouteDepsInput<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisor,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
> {
  read_dashboard_metrics(
    input: AdminSlowReadRouteApiInput
  ): Promise<AdminSlowReadRouteRuntimeResult<TDashboardMetrics>>;
  read_preprocess_jobs_with_runtime_meta(
    input: AdminSlowReadRouteApiInput,
    options: AdminSlowReadRoutePagedOptions
  ): Promise<AdminSlowReadRoutePreprocessJobsWrapper<TPreprocessJobs>>;
  read_preprocess_supervisor_status(): TPreprocessSupervisor;
  read_index_versions: AdminSlowReadRouteDeps<
    TDashboardMetrics,
    TPreprocessJobs,
    TPreprocessSupervisor,
    TIndexVersions
  >["read_index_versions"];
  record_runtime_diagnostic?(libraryRoot: string, runtime: AdminRuntimeEndpointMeta): void | Promise<void>;
}

export interface CreateAdminSlowReadRouteServerDepsInput<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisorRuntime,
  TPreprocessSupervisorPublic,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
> extends Omit<
  CreateAdminSlowReadRouteDepsInput<
    TDashboardMetrics,
    TPreprocessJobs,
    TPreprocessSupervisorPublic,
    TIndexVersions
  >,
  "read_preprocess_supervisor_status"
> {
  read_preprocess_supervisor_status(): TPreprocessSupervisorRuntime;
  to_public_preprocess_supervisor_status(status: TPreprocessSupervisorRuntime): TPreprocessSupervisorPublic;
}

export function createAdminSlowReadRouteDeps<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisor,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
>(
  input: CreateAdminSlowReadRouteDepsInput<
    TDashboardMetrics,
    TPreprocessJobs,
    TPreprocessSupervisor,
    TIndexVersions
  >
): AdminSlowReadRouteDeps<TDashboardMetrics, TPreprocessJobs, TPreprocessSupervisor, TIndexVersions> {
  return {
    read_dashboard_metrics: input.read_dashboard_metrics,
    async read_preprocess_jobs(apiInput, options) {
      const result = await input.read_preprocess_jobs_with_runtime_meta(apiInput, options);
      return {
        data: result.jobs,
        actual_data_source: result.actual_data_source,
        cache_status: result.cache_status,
        component_timings: result.component_timings
      };
    },
    read_preprocess_supervisor_status: input.read_preprocess_supervisor_status,
    read_index_versions: input.read_index_versions,
    record_runtime_diagnostic: input.record_runtime_diagnostic
  };
}

export function createAdminSlowReadRouteServerDeps<
  TDashboardMetrics,
  TPreprocessJobs extends { jobs: unknown[] },
  TPreprocessSupervisorRuntime,
  TPreprocessSupervisorPublic,
  TIndexVersions extends { versions: unknown[]; offset: number; limit: number }
>(
  input: CreateAdminSlowReadRouteServerDepsInput<
    TDashboardMetrics,
    TPreprocessJobs,
    TPreprocessSupervisorRuntime,
    TPreprocessSupervisorPublic,
    TIndexVersions
  >
): AdminSlowReadRouteDeps<TDashboardMetrics, TPreprocessJobs, TPreprocessSupervisorPublic, TIndexVersions> {
  const {
    read_preprocess_supervisor_status,
    to_public_preprocess_supervisor_status,
    ...routeDepsInput
  } = input;

  return createAdminSlowReadRouteDeps({
    ...routeDepsInput,
    read_preprocess_supervisor_status() {
      return to_public_preprocess_supervisor_status(read_preprocess_supervisor_status());
    }
  });
}
