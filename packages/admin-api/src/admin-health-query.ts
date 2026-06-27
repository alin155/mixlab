import {
  inspectPreprocessSafety,
  type PreprocessSafetyStatus
} from "../../library-fs/src/index.ts";
import {
  buildInfo,
  pathProfile,
  preprocessDiskBlockUsagePercent
} from "./admin-release-gates.ts";

export interface AdminHealthQueryApiInput {
  library_root: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
}

export interface AdminHealthQueryDeps {
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
  read_processing_source_video_ids(libraryRoot: string): Promise<string[]>;
}

export async function getAdminPreprocessSafety(input: {
  api_input: AdminHealthQueryApiInput;
  include_processing_guard: boolean;
  deps: Pick<AdminHealthQueryDeps, "read_processing_source_video_ids">;
}): Promise<PreprocessSafetyStatus> {
  const env = input.api_input.env ?? process.env;
  const processingSourceVideoIds = input.include_processing_guard
    ? await input.deps.read_processing_source_video_ids(input.api_input.library_root).catch(() => undefined)
    : undefined;

  return inspectPreprocessSafety({
    library_root: input.api_input.library_root,
    now: input.api_input.now?.() ?? new Date().toISOString(),
    disk_block_usage_percent: preprocessDiskBlockUsagePercent(env),
    include_processing_guard: input.include_processing_guard,
    processing_source_video_ids: processingSourceVideoIds
  });
}

export async function getAdminHealth(input: {
  api_input: AdminHealthQueryApiInput;
  deep: boolean;
  deps: AdminHealthQueryDeps;
}) {
  const safety = await getAdminPreprocessSafety({
    api_input: input.api_input,
    include_processing_guard: input.deep,
    deps: input.deps
  });
  const sourceVideosPath = await input.deps.read_primary_source_videos_path(input.api_input.library_root);
  const env = input.api_input.env ?? process.env;

  return {
    ok: true,
    service: "admin-api",
    status: safety.status,
    build: buildInfo(env),
    runtime: {
      library_root: input.api_input.library_root,
      source_videos_path: sourceVideosPath,
      path_profile: pathProfile(input.api_input.library_root)
    },
    preprocess: safety
  };
}
