import type {
  AdminSourceVideoCommandRouteApiInput,
  AdminSourceVideoCommandRouteDeps,
  AdminSourceVideoRecoverSupervisorBlock,
  AdminSourceVideoRecoverSupervisorStatus,
  AdminSourceVideoTransitionRouteCommand,
  AdminSourceVideoTransitionRouteResult
} from "./admin-source-video-command-routes.ts";

interface SourceVideoCommandContext<TActor> {
  library_root: string;
  source_video_id: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
}

export interface CreateAdminSourceVideoCommandRouteDepsInput<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic,
  TActor,
  TMedia
> {
  library_id: string;
  library_name: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
  media: TMedia;
  read_request_json(): Promise<unknown>;
  run_cover_command(input: SourceVideoCommandContext<TActor> & { body: unknown }): Promise<TManifest | null>;
  run_metadata_command(
    input: SourceVideoCommandContext<TActor> & { body: Record<string, unknown> }
  ): Promise<TManifest | null>;
  run_transition_command(input: SourceVideoCommandContext<TActor> & {
    library_id: string;
    library_name: string;
    command: AdminSourceVideoTransitionRouteCommand;
  }): Promise<AdminSourceVideoTransitionRouteResult>;
  read_preprocess_supervisor_status(): AdminSourceVideoRecoverSupervisorStatus;
  recover_processing_supervisor_block(
    input: { command: "source-video-recover-processing"; supervisor_state: string }
  ): AdminSourceVideoRecoverSupervisorBlock | null;
  run_publish_command(input: SourceVideoCommandContext<TActor> & {
    library_id: string;
    media: TMedia;
    invalidate_index_version_cache: () => void;
  }): Promise<unknown>;
  to_public_source_video(manifest: TManifest): TPublic;
  clear_source_video_page_cache(libraryRoot: string): void;
  clear_index_version_cache(libraryRoot: string): void;
}

export interface CreateAdminSourceVideoCommandRouteServerDepsInput<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic,
  TActor,
  TMedia,
  TSupervisorRuntimeStatus,
  TSupervisorPublicStatus extends AdminSourceVideoRecoverSupervisorStatus
> extends Omit<
  CreateAdminSourceVideoCommandRouteDepsInput<TApiInput, TManifest, TPublic, TActor, TMedia>,
  "read_preprocess_supervisor_status"
> {
  read_preprocess_supervisor_status(): TSupervisorRuntimeStatus;
  to_public_preprocess_supervisor_status(status: TSupervisorRuntimeStatus): TSupervisorPublicStatus;
}

export function createAdminSourceVideoCommandRouteDeps<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic,
  TActor,
  TMedia
>(
  input: CreateAdminSourceVideoCommandRouteDepsInput<TApiInput, TManifest, TPublic, TActor, TMedia>
): AdminSourceVideoCommandRouteDeps<TApiInput, TManifest, TPublic> {
  const commandContext = (apiInput: TApiInput, sourceVideoId: string): SourceVideoCommandContext<TActor> => ({
    library_root: apiInput.library_root,
    source_video_id: sourceVideoId,
    command_now: input.command_now,
    actor: input.actor,
    now: input.now
  });

  return {
    read_request_json: input.read_request_json,
    run_cover_command({ api_input, source_video_id, body }) {
      return input.run_cover_command({
        ...commandContext(api_input, source_video_id),
        body
      });
    },
    run_metadata_command({ api_input, source_video_id, body }) {
      return input.run_metadata_command({
        ...commandContext(api_input, source_video_id),
        body
      });
    },
    run_transition_command({ api_input, source_video_id, command }) {
      return input.run_transition_command({
        ...commandContext(api_input, source_video_id),
        library_id: input.library_id,
        library_name: input.library_name,
        command
      });
    },
    read_preprocess_supervisor_status: input.read_preprocess_supervisor_status,
    recover_processing_supervisor_block: input.recover_processing_supervisor_block,
    run_publish_command({ api_input, source_video_id }) {
      return input.run_publish_command({
        ...commandContext(api_input, source_video_id),
        library_id: input.library_id,
        media: input.media,
        invalidate_index_version_cache: () => input.clear_index_version_cache(api_input.library_root)
      });
    },
    to_public_source_video: input.to_public_source_video,
    clear_source_video_page_cache: input.clear_source_video_page_cache
  };
}

export function createAdminSourceVideoCommandRouteServerDeps<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic,
  TActor,
  TMedia,
  TSupervisorRuntimeStatus,
  TSupervisorPublicStatus extends AdminSourceVideoRecoverSupervisorStatus
>(
  input: CreateAdminSourceVideoCommandRouteServerDepsInput<
    TApiInput,
    TManifest,
    TPublic,
    TActor,
    TMedia,
    TSupervisorRuntimeStatus,
    TSupervisorPublicStatus
  >
): AdminSourceVideoCommandRouteDeps<TApiInput, TManifest, TPublic> {
  const {
    read_preprocess_supervisor_status,
    to_public_preprocess_supervisor_status,
    ...routeDepsInput
  } = input;

  return createAdminSourceVideoCommandRouteDeps({
    ...routeDepsInput,
    read_preprocess_supervisor_status() {
      return to_public_preprocess_supervisor_status(read_preprocess_supervisor_status());
    }
  });
}
