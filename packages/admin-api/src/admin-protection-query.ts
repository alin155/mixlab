import type {
  PreprocessSafetyStatus,
  UsageMetrics
} from "../../library-fs/src/index.ts";
import type { LibraryCounts } from "../../protocol/src/index.ts";
import {
  buildAdminProtectionStatus
} from "./admin-protection.ts";
import {
  buildAdminReleaseGates,
  buildInfo,
  pathProfile
} from "./admin-release-gates.ts";
import {
  getAdminPathChecks,
  type AdminPathChecksSourceFolder
} from "./admin-path-checks-query.ts";

export interface AdminProtectionQueryApiInput {
  library_root: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
}

export interface AdminProtectionQueryDeps<TLibraryStatus> {
  read_library_manifest(libraryRoot: string): Promise<LibraryCounts | null>;
  read_current_index_version(libraryRoot: string): Promise<string>;
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
  read_library_status(input: AdminProtectionQueryApiInput): Promise<TLibraryStatus>;
  read_preprocess_safety(input: {
    api_input: AdminProtectionQueryApiInput;
    include_processing_guard: boolean;
  }): Promise<PreprocessSafetyStatus>;
  read_usage_metrics(libraryRoot: string): Promise<UsageMetrics>;
  read_settings_config(libraryRoot: string): Promise<{ source_folders: AdminPathChecksSourceFolder[] }>;
  mixlab_library_path(libraryRoot: string): string;
  library_manifest_path(libraryRoot: string): string;
}

export async function getAdminProtectionStatus<TLibraryStatus>(input: {
  api_input: AdminProtectionQueryApiInput;
  deps: Pick<AdminProtectionQueryDeps<TLibraryStatus>, "read_library_manifest" | "read_current_index_version">;
}) {
  const now = input.api_input.now?.() ?? new Date().toISOString();
  const library = await input.deps.read_library_manifest(input.api_input.library_root);
  const currentIndexVersion = await input.deps.read_current_index_version(input.api_input.library_root);

  return buildAdminProtectionStatus({
    checked_at: now,
    library,
    current_index_version: currentIndexVersion
  });
}

export async function getAdminReleaseGates<
  TLibraryStatus extends Pick<LibraryCounts, "ready_video_count" | "index_required_video_count"> & {
    current_index_version: string;
  }
>(input: {
  api_input: AdminProtectionQueryApiInput;
  deps: Pick<
    AdminProtectionQueryDeps<TLibraryStatus>,
    "read_primary_source_videos_path" | "read_library_status" | "read_preprocess_safety" | "read_usage_metrics"
  >;
}) {
  const now = input.api_input.now?.() ?? new Date().toISOString();
  const env = input.api_input.env ?? process.env;
  const runtime = {
    library_root: input.api_input.library_root,
    source_videos_path: await input.deps.read_primary_source_videos_path(input.api_input.library_root),
    path_profile: pathProfile(input.api_input.library_root)
  };
  const library = await input.deps.read_library_status(input.api_input);
  const safety = await input.deps.read_preprocess_safety({
    api_input: input.api_input,
    include_processing_guard: true
  });
  const usage = await input.deps.read_usage_metrics(input.api_input.library_root);

  return buildAdminReleaseGates({
    checked_at: now,
    build: buildInfo(env),
    runtime,
    library,
    safety,
    usage
  });
}

export async function getAdminProtectionPathChecks<TLibraryStatus>(input: {
  library_root: string;
  deps: Pick<
    AdminProtectionQueryDeps<TLibraryStatus>,
    "read_settings_config" | "mixlab_library_path" | "library_manifest_path"
  >;
}) {
  const settings = await input.deps.read_settings_config(input.library_root);
  return getAdminPathChecks({
    library_root: input.library_root,
    source_folders: settings.source_folders,
    mixlab_library_path: input.deps.mixlab_library_path,
    library_manifest_path: input.deps.library_manifest_path
  });
}
