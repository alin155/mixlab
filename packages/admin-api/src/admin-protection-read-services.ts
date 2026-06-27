import type {
  PreprocessSafetyStatus,
  UsageMetrics
} from "../../library-fs/src/index.ts";
import type { LibraryCounts } from "../../protocol/src/index.ts";
import {
  getAdminProtectionPathChecks,
  getAdminProtectionStatus,
  getAdminReleaseGates,
  type AdminProtectionQueryApiInput
} from "./admin-protection-query.ts";
import type {
  AdminPathChecksSourceFolder
} from "./admin-path-checks-query.ts";

export interface AdminProtectionReadServicesApiInput extends AdminProtectionQueryApiInput {}

export interface CreateAdminProtectionReadServicesInput<
  TApiInput extends AdminProtectionReadServicesApiInput,
  TLibraryStatus extends Pick<LibraryCounts, "ready_video_count" | "index_required_video_count"> & {
    current_index_version: string;
  }
> {
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
  read_library_status(input: TApiInput): Promise<TLibraryStatus>;
  read_preprocess_safety(input: {
    api_input: TApiInput;
    include_processing_guard: boolean;
  }): Promise<PreprocessSafetyStatus>;
  read_usage_metrics(libraryRoot: string): Promise<UsageMetrics>;
  read_settings_config(libraryRoot: string): Promise<{ source_folders: AdminPathChecksSourceFolder[] }>;
  mixlab_library_path(libraryRoot: string): string;
  library_manifest_path(libraryRoot: string): string;
}

export interface AdminProtectionReadServices<
  TApiInput extends AdminProtectionReadServicesApiInput
> {
  read_protection_status(input: TApiInput): ReturnType<typeof getAdminProtectionStatus>;
  read_release_gates(input: TApiInput): ReturnType<typeof getAdminReleaseGates>;
  read_path_checks(libraryRoot: string): ReturnType<typeof getAdminProtectionPathChecks>;
}

export function createAdminProtectionReadServices<
  TApiInput extends AdminProtectionReadServicesApiInput,
  TLibraryStatus extends Pick<LibraryCounts, "ready_video_count" | "index_required_video_count"> & {
    current_index_version: string;
  }
>(
  input: CreateAdminProtectionReadServicesInput<TApiInput, TLibraryStatus>
): AdminProtectionReadServices<TApiInput> {
  return {
    read_protection_status(apiInput) {
      return getAdminProtectionStatus({
        api_input: apiInput,
        deps: {
          read_library_manifest: input.read_library_manifest,
          read_current_index_version: input.read_current_index_version
        }
      });
    },
    read_release_gates(apiInput) {
      return getAdminReleaseGates({
        api_input: apiInput,
        deps: {
          read_primary_source_videos_path: input.read_primary_source_videos_path,
          read_library_status: input.read_library_status,
          read_preprocess_safety: input.read_preprocess_safety,
          read_usage_metrics: input.read_usage_metrics
        }
      });
    },
    read_path_checks(libraryRoot) {
      return getAdminProtectionPathChecks({
        library_root: libraryRoot,
        deps: {
          read_settings_config: input.read_settings_config,
          mixlab_library_path: input.mixlab_library_path,
          library_manifest_path: input.library_manifest_path
        }
      });
    }
  };
}
