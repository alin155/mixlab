import path from "node:path";
import {
  addAdminSourceFolder,
  removeAdminSourceFolder,
  updateAdminRuntimeSecrets,
  updateAdminSettings,
  updateAdminSourceFolder,
  type AdminRuntimeSecretsPatch,
  type AdminSettings,
  type AdminSettingsPatch,
  type AdminSourceFolder,
  type AdminSourceFolderPatch
} from "../../library-fs/src/index.ts";
import type { LibraryCounts } from "../../protocol/src/index.ts";
import { adminCommandContract } from "./admin-command-guard.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import { markAdminReadModelStoreStaleForCommand } from "./admin-read-model-invalidation.ts";

export interface AdminSettingsCommandMutation {
  settings_patch: AdminSettingsPatch;
  runtime_secrets_patch?: AdminRuntimeSecretsPatch;
}

type ReadLibraryManifest = () => Promise<(LibraryCounts & { updated_at?: string }) | null>;

interface AdminSettingsCommandContext {
  library_root: string;
  now: string;
  invalidated_at?: string;
  actor?: AdminCommandActor;
  read_library_manifest?: ReadLibraryManifest;
}

function adminSettingsSnapshotFiles(libraryRoot: string): {
  label: string;
  file_path: string;
}[] {
  return [{
    label: "admin-settings",
    file_path: path.join(libraryRoot, ".mixlab-library", "admin-settings.json")
  }];
}

async function invalidateSettingsReadModel(input: AdminSettingsCommandContext & {
  command: "settings-config" | "source-folder-add" | "source-folder-update" | "source-folder-remove";
}): Promise<void> {
  await markAdminReadModelStoreStaleForCommand({
    library_root: input.library_root,
    command: input.command,
    invalidated_at: input.invalidated_at ?? input.now,
    read_library_manifest: input.read_library_manifest
  });
}

export async function runAdminSettingsConfigCommand(input: AdminSettingsCommandContext & {
  mutation: AdminSettingsCommandMutation;
  refresh_runtime_secrets?: () => Promise<void>;
}): Promise<AdminSettings> {
  const commandName = "settings-config";
  const command = adminCommandContract(commandName);
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: input.actor,
    snapshot_files: adminSettingsSnapshotFiles(input.library_root)
  }, async () => {
    const updated = await updateAdminSettings(input.library_root, input.mutation.settings_patch);
    if (input.mutation.runtime_secrets_patch) {
      await updateAdminRuntimeSecrets(input.library_root, input.mutation.runtime_secrets_patch);
      if (input.refresh_runtime_secrets) {
        await input.refresh_runtime_secrets();
      }
    }
    if (input.mutation.settings_patch.source_folders !== undefined) {
      await invalidateSettingsReadModel({
        ...input,
        command: commandName
      });
    }
    return updated;
  });
}

export async function runAdminSourceFolderAddCommand(input: AdminSettingsCommandContext & {
  folder: Omit<AdminSourceFolder, "id">;
}): Promise<AdminSettings> {
  const commandName = "source-folder-add";
  const command = adminCommandContract(commandName);
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: input.actor,
    snapshot_files: adminSettingsSnapshotFiles(input.library_root)
  }, async () => {
    const result = await addAdminSourceFolder(input.library_root, input.folder);
    await invalidateSettingsReadModel({
      ...input,
      command: commandName
    });
    return result;
  });
}

export async function runAdminSourceFolderUpdateCommand(input: AdminSettingsCommandContext & {
  source_folder_id: string;
  patch: AdminSourceFolderPatch;
}): Promise<AdminSettings> {
  const commandName = "source-folder-update";
  const command = adminCommandContract(commandName);
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: input.actor,
    snapshot_files: adminSettingsSnapshotFiles(input.library_root)
  }, async () => {
    const result = await updateAdminSourceFolder(
      input.library_root,
      input.source_folder_id,
      input.patch
    );
    await invalidateSettingsReadModel({
      ...input,
      command: commandName
    });
    return result;
  });
}

export async function runAdminSourceFolderRemoveCommand(input: AdminSettingsCommandContext & {
  source_folder_id: string;
}): Promise<AdminSettings> {
  const commandName = "source-folder-remove";
  const command = adminCommandContract(commandName);
  return runAdminCommand({
    library_root: input.library_root,
    command: command.command,
    now: input.now,
    actor: input.actor,
    snapshot_files: adminSettingsSnapshotFiles(input.library_root)
  }, async () => {
    const result = await removeAdminSourceFolder(input.library_root, input.source_folder_id);
    await invalidateSettingsReadModel({
      ...input,
      command: commandName
    });
    return result;
  });
}
