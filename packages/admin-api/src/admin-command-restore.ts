import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { LibraryCounts } from "../../protocol/src/index.ts";
import { runAdminCommand } from "./admin-command-runtime.ts";
import type { AdminCommandActor } from "./admin-command-audit.ts";
import type { AdminCommandSnapshotFileInput } from "./admin-command-snapshot.ts";
import type {
  AdminOperationLogAppendInput,
  AdminOperationLogEvent
} from "./admin-operation-log.ts";
import {
  planAdminCommandSnapshotRestore,
  type AdminCommandRestorePlan,
  type AdminCommandRestorePlanBlocker
} from "./admin-command-restore-plan.ts";
import { markAdminReadModelStoreStaleForCommand } from "./admin-read-model-invalidation.ts";

export type AdminCommandSnapshotRestoreStatus = "restored" | "blocked";

export type AdminCommandSnapshotRestoreBlocker =
  | AdminCommandRestorePlanBlocker
  | "restore_plan_blocked"
  | "restore_plan_empty"
  | "restore_file_missing_paths"
  | "restore_file_path_unsafe";

export interface AdminCommandSnapshotRestoreFile {
  label: string;
  restored: boolean;
  source_relative_path?: string;
  snapshot_relative_path?: string;
}

export interface AdminCommandSnapshotRestoreResult {
  schema_version: "1.0";
  restored_at: string;
  status: AdminCommandSnapshotRestoreStatus;
  restored_file_count: number;
  blocked_file_count: number;
  blockers: AdminCommandSnapshotRestoreBlocker[];
  plan: AdminCommandRestorePlan;
  files: AdminCommandSnapshotRestoreFile[];
}

export interface RestoreAdminCommandSnapshotInput {
  library_root: string;
  snapshot_manifest_path: string;
  now: string;
  holder?: string;
  actor?: AdminCommandActor;
  generated_at?: string;
  invalidated_at?: string;
  plan_restore?: typeof planAdminCommandSnapshotRestore;
  copy_file?: (sourcePath: string, destinationPath: string) => Promise<void>;
  make_directory?: (directoryPath: string) => Promise<void>;
  read_library_manifest?: () => Promise<(LibraryCounts & { updated_at?: string }) | null>;
  append_operation_log_event?: (input: AdminOperationLogAppendInput) => Promise<AdminOperationLogEvent>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function insidePath(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveLibraryRelativePath(libraryRoot: string, relativePath: string | undefined): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return null;
  }

  const resolved = path.resolve(libraryRoot, relativePath);
  return insidePath(libraryRoot, resolved) ? resolved : null;
}

function planBlockers(plan: AdminCommandRestorePlan): AdminCommandSnapshotRestoreBlocker[] {
  const blockers: AdminCommandSnapshotRestoreBlocker[] = [...plan.blockers];
  if (!plan.can_restore) {
    blockers.push("restore_plan_blocked");
  }
  if (plan.file_count === 0) {
    blockers.push("restore_plan_empty");
  }
  return unique(blockers);
}

function blockedRestoreResult(input: {
  restored_at: string;
  plan: AdminCommandRestorePlan;
  blockers?: AdminCommandSnapshotRestoreBlocker[];
}): AdminCommandSnapshotRestoreResult {
  return {
    schema_version: "1.0",
    restored_at: input.restored_at,
    status: "blocked",
    restored_file_count: 0,
    blocked_file_count: input.plan.file_count,
    blockers: unique(input.blockers ?? planBlockers(input.plan)),
    plan: input.plan,
    files: input.plan.files.map((file) => ({
      label: file.label,
      restored: false,
      source_relative_path: file.source_relative_path,
      snapshot_relative_path: file.snapshot_relative_path
    }))
  };
}

function snapshotFilesFromPlan(input: {
  library_root: string;
  plan: AdminCommandRestorePlan;
}): AdminCommandSnapshotFileInput[] {
  if (!input.plan.can_restore) {
    return [];
  }

  const files: AdminCommandSnapshotFileInput[] = [];
  for (const file of input.plan.files) {
    const targetPath = resolveLibraryRelativePath(input.library_root, file.source_relative_path);
    if (!file.can_restore || !targetPath) {
      return [];
    }
    files.push({
      label: `restore-target-${file.label}`,
      file_path: targetPath
    });
  }
  return files;
}

async function executeRestoreFromPlan(input: {
  library_root: string;
  plan: AdminCommandRestorePlan;
  restored_at: string;
  copy_file: (sourcePath: string, destinationPath: string) => Promise<void>;
  make_directory: (directoryPath: string) => Promise<void>;
}): Promise<AdminCommandSnapshotRestoreResult> {
  if (
    !input.plan.can_restore ||
    input.plan.file_count === 0 ||
    input.plan.blocked_file_count > 0 ||
    input.plan.restorable_file_count !== input.plan.file_count
  ) {
    return blockedRestoreResult({
      restored_at: input.restored_at,
      plan: input.plan
    });
  }

  const plannedFiles: Array<{
    label: string;
    source_relative_path: string;
    snapshot_relative_path: string;
    source_path: string;
    snapshot_path: string;
  }> = [];

  for (const file of input.plan.files) {
    const sourcePath = resolveLibraryRelativePath(input.library_root, file.source_relative_path);
    const snapshotPath = resolveLibraryRelativePath(input.library_root, file.snapshot_relative_path);
    if (!file.source_relative_path || !file.snapshot_relative_path) {
      return blockedRestoreResult({
        restored_at: input.restored_at,
        plan: input.plan,
        blockers: ["restore_file_missing_paths"]
      });
    }
    if (!sourcePath || !snapshotPath) {
      return blockedRestoreResult({
        restored_at: input.restored_at,
        plan: input.plan,
        blockers: ["restore_file_path_unsafe"]
      });
    }
    plannedFiles.push({
      label: file.label,
      source_relative_path: file.source_relative_path,
      snapshot_relative_path: file.snapshot_relative_path,
      source_path: sourcePath,
      snapshot_path: snapshotPath
    });
  }

  for (const file of plannedFiles) {
    await input.make_directory(path.dirname(file.source_path));
    await input.copy_file(file.snapshot_path, file.source_path);
  }

  return {
    schema_version: "1.0",
    restored_at: input.restored_at,
    status: "restored",
    restored_file_count: plannedFiles.length,
    blocked_file_count: 0,
    blockers: [],
    plan: input.plan,
    files: plannedFiles.map((file) => ({
      label: file.label,
      restored: true,
      source_relative_path: file.source_relative_path,
      snapshot_relative_path: file.snapshot_relative_path
    }))
  };
}

export async function restoreAdminCommandSnapshot(
  input: RestoreAdminCommandSnapshotInput
): Promise<AdminCommandSnapshotRestoreResult> {
  const planRestore = input.plan_restore ?? planAdminCommandSnapshotRestore;
  const copyRestoreFile = input.copy_file ?? copyFile;
  const makeDirectory = input.make_directory ?? (async (directoryPath: string) => {
    await mkdir(directoryPath, { recursive: true });
  });
  let plannedRestore: AdminCommandRestorePlan | null = null;

  const result = await runAdminCommand({
    library_root: input.library_root,
    command: "command-snapshot-restore",
    now: input.now,
    holder: input.holder,
    actor: input.actor,
    append_operation_log_event: input.append_operation_log_event,
    snapshot_files_provider: async () => {
      plannedRestore = await planRestore({
        library_root: input.library_root,
        snapshot_manifest_path: input.snapshot_manifest_path,
        generated_at: input.generated_at ?? input.now
      });
      return snapshotFilesFromPlan({
        library_root: input.library_root,
        plan: plannedRestore
      });
    }
  }, async () => {
    const plan = plannedRestore ?? await planRestore({
      library_root: input.library_root,
      snapshot_manifest_path: input.snapshot_manifest_path,
      generated_at: input.generated_at ?? input.now
    });

    const restoreResult = await executeRestoreFromPlan({
      library_root: input.library_root,
      plan,
      restored_at: input.now,
      copy_file: copyRestoreFile,
      make_directory: makeDirectory
    });

    if (restoreResult.status === "restored") {
      await markAdminReadModelStoreStaleForCommand({
        library_root: input.library_root,
        command: "command-snapshot-restore",
        invalidated_at: input.invalidated_at ?? input.now,
        read_library_manifest: input.read_library_manifest
      });
    }

    return restoreResult;
  });

  return result;
}
