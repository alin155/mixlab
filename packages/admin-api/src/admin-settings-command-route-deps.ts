import type { AdminSettings } from "../../library-fs/src/index.ts";
import type {
  AdminSettingsCommandRouteApiInput,
  AdminSettingsCommandRouteDeps
} from "./admin-settings-command-routes.ts";

interface SettingsCommandContext<TActor, TManifest> {
  library_root: string;
  now: string;
  invalidated_at: string;
  actor?: TActor;
  read_library_manifest(): Promise<TManifest | null>;
}

export interface CreateAdminSettingsCommandRouteDepsInput<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
> {
  command_now: string;
  invalidated_at: string;
  actor?: TActor;
  read_request_json(): Promise<unknown>;
  refresh_runtime_secrets(): Promise<void>;
  read_library_manifest(libraryRoot: string): Promise<TManifest | null>;
  run_settings_config_command(input: SettingsCommandContext<TActor, TManifest> & {
    mutation: Parameters<AdminSettingsCommandRouteDeps<TApiInput>["run_settings_config_command"]>[0]["mutation"];
    refresh_runtime_secrets(): Promise<void>;
  }): Promise<TSettings>;
  run_source_folder_add_command(input: SettingsCommandContext<TActor, TManifest> & {
    folder: Parameters<AdminSettingsCommandRouteDeps<TApiInput>["run_source_folder_add_command"]>[0]["folder"];
  }): Promise<TSettings>;
  run_source_folder_update_command(input: SettingsCommandContext<TActor, TManifest> & {
    source_folder_id: string;
    patch: Parameters<AdminSettingsCommandRouteDeps<TApiInput>["run_source_folder_update_command"]>[0]["patch"];
  }): Promise<TSettings>;
  run_source_folder_remove_command(input: SettingsCommandContext<TActor, TManifest> & {
    source_folder_id: string;
  }): Promise<TSettings>;
}

export function createAdminSettingsCommandRouteDeps<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
>(
  input: CreateAdminSettingsCommandRouteDepsInput<TApiInput, TSettings, TActor, TManifest>
): AdminSettingsCommandRouteDeps<TApiInput> {
  function commandContext(apiInput: TApiInput): SettingsCommandContext<TActor, TManifest> {
    return {
      library_root: apiInput.library_root,
      now: input.command_now,
      invalidated_at: input.invalidated_at,
      actor: input.actor,
      read_library_manifest() {
        return input.read_library_manifest(apiInput.library_root);
      }
    };
  }

  return {
    read_request_json: input.read_request_json,
    run_settings_config_command({ api_input, mutation }) {
      return input.run_settings_config_command({
        ...commandContext(api_input),
        mutation,
        refresh_runtime_secrets: input.refresh_runtime_secrets
      });
    },
    run_source_folder_add_command({ api_input, folder }) {
      return input.run_source_folder_add_command({
        ...commandContext(api_input),
        folder
      });
    },
    run_source_folder_update_command({ api_input, source_folder_id, patch }) {
      return input.run_source_folder_update_command({
        ...commandContext(api_input),
        source_folder_id,
        patch
      });
    },
    run_source_folder_remove_command({ api_input, source_folder_id }) {
      return input.run_source_folder_remove_command({
        ...commandContext(api_input),
        source_folder_id
      });
    }
  };
}

type SettingsConfigCommandService<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
> = CreateAdminSettingsCommandRouteDepsInput<
  TApiInput,
  TSettings,
  TActor,
  TManifest
>["run_settings_config_command"];

type SourceFolderAddCommandService<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
> = CreateAdminSettingsCommandRouteDepsInput<
  TApiInput,
  TSettings,
  TActor,
  TManifest
>["run_source_folder_add_command"];

type SourceFolderUpdateCommandService<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
> = CreateAdminSettingsCommandRouteDepsInput<
  TApiInput,
  TSettings,
  TActor,
  TManifest
>["run_source_folder_update_command"];

type SourceFolderRemoveCommandService<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
> = CreateAdminSettingsCommandRouteDepsInput<
  TApiInput,
  TSettings,
  TActor,
  TManifest
>["run_source_folder_remove_command"];

export interface CreateAdminSettingsCommandRouteServerDepsInput<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
> extends Omit<
    CreateAdminSettingsCommandRouteDepsInput<TApiInput, TSettings, TActor, TManifest>,
    | "run_settings_config_command"
    | "run_source_folder_add_command"
    | "run_source_folder_update_command"
    | "run_source_folder_remove_command"
  > {
  run_settings_config_service: SettingsConfigCommandService<TApiInput, TSettings, TActor, TManifest>;
  run_source_folder_add_service: SourceFolderAddCommandService<TApiInput, TSettings, TActor, TManifest>;
  run_source_folder_update_service: SourceFolderUpdateCommandService<TApiInput, TSettings, TActor, TManifest>;
  run_source_folder_remove_service: SourceFolderRemoveCommandService<TApiInput, TSettings, TActor, TManifest>;
}

export function createAdminSettingsCommandRouteServerDeps<
  TApiInput extends AdminSettingsCommandRouteApiInput,
  TSettings extends AdminSettings,
  TActor,
  TManifest
>(
  input: CreateAdminSettingsCommandRouteServerDepsInput<TApiInput, TSettings, TActor, TManifest>
): AdminSettingsCommandRouteDeps<TApiInput> {
  return createAdminSettingsCommandRouteDeps({
    ...input,
    run_settings_config_command: input.run_settings_config_service,
    run_source_folder_add_command: input.run_source_folder_add_service,
    run_source_folder_update_command: input.run_source_folder_update_service,
    run_source_folder_remove_command: input.run_source_folder_remove_service
  });
}
