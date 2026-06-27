import type {
  AdminSettings
} from "../../library-fs/src/index.ts";
import type { LibraryCounts, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  listAdminPreprocessJobsWithRuntimeMeta,
  type AdminPreprocessJobManifestPage,
  type AdminPreprocessJobsReadApiInput,
  type AdminPreprocessJobsReadOptions
} from "./admin-preprocess-jobs-read-facade.ts";
import type {
  AdminPreprocessJobRecord,
  AdminPreprocessJobsRuntimeLoad
} from "./admin-preprocess-jobs-query.ts";

export interface AdminPreprocessJobsReadServicesApiInput extends AdminPreprocessJobsReadApiInput {}

export interface CreateAdminPreprocessJobsReadServicesInput<
  TApiInput extends AdminPreprocessJobsReadServicesApiInput
> {
  read_admin_settings(libraryRoot: string): Promise<AdminSettings>;
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_preprocess_job_manifest_page(input: {
    library_root: string;
    offset: number;
    limit: number;
  }): Promise<AdminPreprocessJobManifestPage>;
  read_all_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_preprocess_job(libraryRoot: string, sourceVideoId: string): Promise<AdminPreprocessJobRecord | null>;
  read_runtime_load(input: TApiInput): Promise<AdminPreprocessJobsRuntimeLoad>;
}

export interface AdminPreprocessJobsReadServices<
  TApiInput extends AdminPreprocessJobsReadServicesApiInput
> {
  read_preprocess_jobs_with_runtime_meta(
    input: TApiInput,
    options?: AdminPreprocessJobsReadOptions
  ): ReturnType<typeof listAdminPreprocessJobsWithRuntimeMeta>;
}

export function createAdminPreprocessJobsReadServices<
  TApiInput extends AdminPreprocessJobsReadServicesApiInput
>(
  input: CreateAdminPreprocessJobsReadServicesInput<TApiInput>
): AdminPreprocessJobsReadServices<TApiInput> {
  return {
    read_preprocess_jobs_with_runtime_meta(apiInput, options) {
      return listAdminPreprocessJobsWithRuntimeMeta({
        api_input: apiInput,
        options,
        deps: {
          async read_concurrent_job_count(libraryRoot) {
            const settings = await input.read_admin_settings(libraryRoot);
            return settings.runtime_policy.concurrent_jobs;
          },
          read_library_manifest: input.read_library_manifest,
          read_preprocess_job_manifest_page: input.read_preprocess_job_manifest_page,
          read_all_source_video_manifests: input.read_all_source_video_manifests,
          read_preprocess_job: input.read_preprocess_job,
          read_runtime_load: input.read_runtime_load
        }
      });
    }
  };
}
