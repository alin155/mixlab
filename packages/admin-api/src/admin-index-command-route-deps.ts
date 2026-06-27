import type {
  AdminIndexCommandRouteApiInput,
  AdminIndexCommandRouteDeps
} from "./admin-index-command-routes.ts";

interface IndexRepairCommandContext<TMedia, TActor> {
  library_root: string;
  library_id: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
  media: TMedia;
  invalidate_index_version_cache(): void;
}

export interface CreateAdminIndexCommandRouteDepsInput<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TMedia,
  TIndexRepairResult,
  TActor
> {
  library_id: string;
  command_now: string;
  actor?: TActor;
  now?: () => string;
  media: TMedia;
  run_index_repair_command(input: IndexRepairCommandContext<TMedia, TActor>): Promise<TIndexRepairResult>;
  clear_index_version_cache(libraryRoot: string): void;
  clear_source_video_page_cache(libraryRoot: string): void;
}

export function createAdminIndexCommandRouteDeps<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TMedia,
  TIndexRepairResult,
  TActor
>(
  input: CreateAdminIndexCommandRouteDepsInput<TApiInput, TMedia, TIndexRepairResult, TActor>
): AdminIndexCommandRouteDeps<TApiInput, TIndexRepairResult> {
  return {
    run_index_repair_command({ api_input }) {
      return input.run_index_repair_command({
        library_root: api_input.library_root,
        library_id: input.library_id,
        command_now: input.command_now,
        actor: input.actor,
        now: input.now,
        media: input.media,
        invalidate_index_version_cache() {
          input.clear_index_version_cache(api_input.library_root);
        }
      });
    },
    clear_source_video_page_cache: input.clear_source_video_page_cache
  };
}

type IndexRepairCommandService<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TMedia,
  TIndexRepairResult,
  TActor
> = CreateAdminIndexCommandRouteDepsInput<
  TApiInput,
  TMedia,
  TIndexRepairResult,
  TActor
>["run_index_repair_command"];

export interface CreateAdminIndexCommandRouteServerDepsInput<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TMedia,
  TIndexRepairResult,
  TActor
> extends Omit<
    CreateAdminIndexCommandRouteDepsInput<TApiInput, TMedia, TIndexRepairResult, TActor>,
    "run_index_repair_command"
  > {
  run_index_repair_service: IndexRepairCommandService<
    TApiInput,
    TMedia,
    TIndexRepairResult,
    TActor
  >;
}

export function createAdminIndexCommandRouteServerDeps<
  TApiInput extends AdminIndexCommandRouteApiInput,
  TMedia,
  TIndexRepairResult,
  TActor
>(
  input: CreateAdminIndexCommandRouteServerDepsInput<
    TApiInput,
    TMedia,
    TIndexRepairResult,
    TActor
  >
): AdminIndexCommandRouteDeps<TApiInput, TIndexRepairResult> {
  return createAdminIndexCommandRouteDeps({
    ...input,
    run_index_repair_command: input.run_index_repair_service
  });
}
