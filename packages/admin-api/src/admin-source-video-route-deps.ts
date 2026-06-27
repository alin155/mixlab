import type { PreprocessStatus } from "../../protocol/src/index.ts";
import type { AdminRuntimeEndpointMeta } from "./admin-runtime-observability.ts";
import {
  type AdminSourceVideoRouteDeps,
  type AdminSourceVideoRouteListInput,
  type AdminSourceVideoRouteListResult
} from "./admin-source-video-routes.ts";
import { adminSourceVideoStatuses } from "./admin-source-video-read-model.ts";

export interface CreateAdminSourceVideoRouteDepsInput<TManifest, TPublic, TDetail> {
  read_source_video_list(
    input: AdminSourceVideoRouteListInput
  ): Promise<AdminSourceVideoRouteListResult<TManifest>>;
  to_public_source_video(manifest: TManifest): TPublic;
  read_source_video_detail(libraryRoot: string, sourceVideoId: string): Promise<TDetail | null>;
  record_runtime_diagnostic?(libraryRoot: string, runtime: AdminRuntimeEndpointMeta): void | Promise<void>;
}

export type ReadAdminSourceVideoRouteListService<TManifest> = (
  input: AdminSourceVideoRouteListInput
) => Promise<AdminSourceVideoRouteListResult<TManifest>>;

export type ProjectAdminSourceVideoRoutePublicManifest<TManifest, TPublic> = (
  manifest: TManifest
) => TPublic;

export type ReadAdminSourceVideoRouteDetailService<TDetail> = (
  libraryRoot: string,
  sourceVideoId: string
) => Promise<TDetail | null>;

export type RecordAdminSourceVideoRouteRuntimeDiagnostic = (
  libraryRoot: string,
  runtime: AdminRuntimeEndpointMeta
) => void | Promise<void>;

export function createAdminSourceVideoRouteDeps<TManifest, TPublic, TDetail>(
  input: CreateAdminSourceVideoRouteDepsInput<TManifest, TPublic, TDetail>
): AdminSourceVideoRouteDeps<TManifest, TPublic, TDetail> {
  return {
    is_source_video_status(value): value is PreprocessStatus {
      return adminSourceVideoStatuses.has(value as PreprocessStatus);
    },
    read_source_video_list: input.read_source_video_list,
    to_public_source_video: input.to_public_source_video,
    read_source_video_detail: input.read_source_video_detail,
    record_runtime_diagnostic: input.record_runtime_diagnostic
  };
}

export interface CreateAdminSourceVideoRouteServerDepsInput<TManifest, TPublic, TDetail> {
  read_source_video_list_service: ReadAdminSourceVideoRouteListService<TManifest>;
  project_public_source_video: ProjectAdminSourceVideoRoutePublicManifest<TManifest, TPublic>;
  read_source_video_detail_service: ReadAdminSourceVideoRouteDetailService<TDetail>;
  record_runtime_diagnostic?: RecordAdminSourceVideoRouteRuntimeDiagnostic;
}

export function createAdminSourceVideoRouteServerDeps<TManifest, TPublic, TDetail>(
  input: CreateAdminSourceVideoRouteServerDepsInput<TManifest, TPublic, TDetail>
): AdminSourceVideoRouteDeps<TManifest, TPublic, TDetail> {
  return createAdminSourceVideoRouteDeps({
    read_source_video_list: input.read_source_video_list_service,
    to_public_source_video: input.project_public_source_video,
    read_source_video_detail: input.read_source_video_detail_service,
    record_runtime_diagnostic: input.record_runtime_diagnostic
  });
}
