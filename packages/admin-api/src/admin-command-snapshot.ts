import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  stat,
  writeFile
} from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import {
  adminCommandContract,
  adminCommandReadModelInvalidationPolicy,
  type AdminCommandName,
  type AdminCommandMutationTarget,
  type AdminCommandScanMode
} from "./admin-command-guard.ts";
import {
  adminMixlabRoot
} from "./admin-library-paths.ts";

export type AdminCommandSnapshotKind = "metadata-only" | "file-capture";
export type AdminCommandSnapshotRollbackStatus = "not-implemented";
export type AdminCommandSnapshotFileStatus =
  | "captured"
  | "missing"
  | "skipped-unsafe"
  | "skipped-not-file"
  | "copy-failed";

export interface AdminCommandSnapshotContract {
  command: AdminCommandName;
  method: "POST" | "PATCH" | "DELETE";
  scope: "library" | "bulk" | "single";
  scan_mode: AdminCommandScanMode;
  requires_scan_preview: boolean;
  requires_inactive_supervisor: boolean;
  invalidates_source_video_read_model: boolean;
  mutation_targets: AdminCommandMutationTarget[];
}

export interface AdminCommandSnapshotFileInput {
  label: string;
  file_path: string;
}

export interface AdminCommandSnapshotFileEntry {
  label: string;
  status: AdminCommandSnapshotFileStatus;
  source_relative_path?: string;
  snapshot_relative_path?: string;
  size_bytes?: number;
  modified_at?: string;
  error_name?: string;
  error_code?: string;
  error_message?: string;
}

export interface AdminCommandSnapshotManifest {
  schema_version: "1.0";
  snapshot_id: string;
  created_at: string;
  command: AdminCommandName;
  holder: string;
  lease_reason: AdminCommandName;
  snapshot_kind: AdminCommandSnapshotKind;
  rollback_status: AdminCommandSnapshotRollbackStatus;
  contract: AdminCommandSnapshotContract;
  read_model_invalidation: {
    invalidates_source_video_read_model: boolean;
    requires_read_model_reconcile: boolean;
    reason: string;
  };
  files: AdminCommandSnapshotFileEntry[];
  file_summary: {
    requested_file_count: number;
    captured_file_count: number;
    missing_file_count: number;
    skipped_file_count: number;
    failed_file_count: number;
  };
  notes: string[];
}

export interface CreateAdminCommandSnapshotInput {
  library_root: string;
  command: AdminCommandName;
  created_at: string;
  holder: string;
  snapshot_id?: string;
  files?: AdminCommandSnapshotFileInput[];
  make_directory?: (directoryPath: string) => Promise<void>;
  write_text_file?: (filePath: string, text: string) => Promise<void>;
  copy_file?: (sourcePath: string, destinationPath: string) => Promise<void>;
  stat_file?: (filePath: string) => Promise<Pick<Stats, "isFile" | "mtime" | "size">>;
}

export interface AdminCommandSnapshotCreatedResult {
  created: true;
  reason: "created";
  snapshot_kind: AdminCommandSnapshotKind;
  rollback_status: AdminCommandSnapshotRollbackStatus;
  snapshot_id: string;
  snapshot_directory: string;
  manifest_path: string;
  manifest_relative_path: string;
  requested_file_count: number;
  captured_file_count: number;
  missing_file_count: number;
  skipped_file_count: number;
  failed_file_count: number;
}

export interface AdminCommandSnapshotUnavailableResult {
  created: false;
  reason: "write_failed";
  snapshot_kind: AdminCommandSnapshotKind;
  rollback_status: AdminCommandSnapshotRollbackStatus;
  error_name: string;
  error_code: string;
  error_message: string;
}

export type AdminCommandSnapshotResult =
  | AdminCommandSnapshotCreatedResult
  | AdminCommandSnapshotUnavailableResult;

export function adminCommandSnapshotRoot(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "admin", "command-snapshots");
}

function fileSummary(files: AdminCommandSnapshotFileEntry[]): AdminCommandSnapshotManifest["file_summary"] {
  return {
    requested_file_count: files.length,
    captured_file_count: files.filter((file) => file.status === "captured").length,
    missing_file_count: files.filter((file) => file.status === "missing").length,
    skipped_file_count: files.filter((file) =>
      file.status === "skipped-unsafe" || file.status === "skipped-not-file"
    ).length,
    failed_file_count: files.filter((file) => file.status === "copy-failed").length
  };
}

function errorFields(error: unknown): Pick<
  AdminCommandSnapshotFileEntry,
  "error_name" | "error_code" | "error_message"
> {
  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      error_name: typeof candidate.name === "string" ? candidate.name : "Error",
      error_code: typeof candidate.code === "string" ? candidate.code : "",
      error_message: typeof candidate.message === "string" ? candidate.message : "File snapshot failed."
    };
  }

  return {
    error_name: "Error",
    error_code: "",
    error_message: typeof error === "string" ? error : "File snapshot failed."
  };
}

function libraryRelativePath(libraryRoot: string, filePath: string): string | null {
  const root = path.resolve(libraryRoot);
  const target = path.resolve(filePath);
  const relative = path.relative(root, target);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return relative;
}

export function adminCommandSnapshotSafeSegment(value: string): string {
  const safe = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 96);
  if (/^\.+$/u.test(safe)) {
    return "unknown";
  }
  return safe || "unknown";
}

export function buildAdminCommandSnapshotManifest(input: {
  snapshot_id: string;
  created_at: string;
  command: AdminCommandName;
  holder: string;
  files?: AdminCommandSnapshotFileEntry[];
}): AdminCommandSnapshotManifest {
  const contract = adminCommandContract(input.command);
  const readModelPolicy = adminCommandReadModelInvalidationPolicy(input.command);
  const files = input.files ?? [];
  const snapshotKind: AdminCommandSnapshotKind = files.length > 0 ? "file-capture" : "metadata-only";

  return {
    schema_version: "1.0",
    snapshot_id: input.snapshot_id,
    created_at: input.created_at,
    command: input.command,
    holder: input.holder,
    lease_reason: contract.command,
    snapshot_kind: snapshotKind,
    rollback_status: "not-implemented",
    contract: {
      command: contract.command,
      method: contract.method,
      scope: contract.scope,
      scan_mode: contract.scan_mode,
      requires_scan_preview: contract.requires_scan_preview,
      requires_inactive_supervisor: contract.requires_inactive_supervisor,
      invalidates_source_video_read_model: contract.invalidates_source_video_read_model,
      mutation_targets: [...contract.mutation_targets]
    },
    read_model_invalidation: {
      invalidates_source_video_read_model: readModelPolicy.invalidates_source_video_read_model,
      requires_read_model_reconcile: readModelPolicy.requires_read_model_reconcile,
      reason: readModelPolicy.reason
    },
    files,
    file_summary: fileSummary(files),
    notes: snapshotKind === "file-capture"
      ? [
          "This targeted file snapshot captures selected pre-command files only.",
          "Automatic rollback is not implemented by this slice."
        ]
      : [
          "This metadata-only snapshot is a recovery anchor for future file-level backup and rollback work.",
          "No file contents are copied by this slice."
        ]
  };
}

async function captureSnapshotFiles(input: {
  library_root: string;
  snapshot_directory: string;
  directory_name: string;
  files: AdminCommandSnapshotFileInput[];
  make_directory: (directoryPath: string) => Promise<void>;
  copy_file: (sourcePath: string, destinationPath: string) => Promise<void>;
  stat_file: (filePath: string) => Promise<Pick<Stats, "isFile" | "mtime" | "size">>;
}): Promise<AdminCommandSnapshotFileEntry[]> {
  if (input.files.length === 0) {
    return [];
  }

  const filesDirectory = path.join(input.snapshot_directory, "files");
  await input.make_directory(filesDirectory);

  const entries: AdminCommandSnapshotFileEntry[] = [];
  for (const [index, file] of input.files.entries()) {
    const label = adminCommandSnapshotSafeSegment(file.label);
    const sourceRelativePath = libraryRelativePath(input.library_root, file.file_path);
    if (!sourceRelativePath) {
      entries.push({
        label,
        status: "skipped-unsafe"
      });
      continue;
    }

    let fileStat: Pick<Stats, "isFile" | "mtime" | "size">;
    try {
      fileStat = await input.stat_file(file.file_path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        entries.push({
          label,
          status: "missing",
          source_relative_path: sourceRelativePath
        });
        continue;
      }

      entries.push({
        label,
        status: "copy-failed",
        source_relative_path: sourceRelativePath,
        ...errorFields(error)
      });
      continue;
    }

    if (!fileStat.isFile()) {
      entries.push({
        label,
        status: "skipped-not-file",
        source_relative_path: sourceRelativePath
      });
      continue;
    }

    const destinationName = [
      String(index + 1).padStart(3, "0"),
      label,
      adminCommandSnapshotSafeSegment(path.basename(file.file_path))
    ].join("-");
    const destinationPath = path.join(filesDirectory, destinationName);
    const snapshotRelativePath = path.join(
      ".mixlab-library",
      "admin",
      "command-snapshots",
      input.directory_name,
      "files",
      destinationName
    );

    try {
      await input.copy_file(file.file_path, destinationPath);
      entries.push({
        label,
        status: "captured",
        source_relative_path: sourceRelativePath,
        snapshot_relative_path: snapshotRelativePath,
        size_bytes: fileStat.size,
        modified_at: fileStat.mtime.toISOString()
      });
    } catch (error) {
      entries.push({
        label,
        status: "copy-failed",
        source_relative_path: sourceRelativePath,
        ...errorFields(error)
      });
    }
  }

  return entries;
}

export async function createAdminCommandSnapshot(
  input: CreateAdminCommandSnapshotInput
): Promise<AdminCommandSnapshotCreatedResult> {
  const snapshotId = input.snapshot_id ?? randomUUID();
  const directoryName = [
    adminCommandSnapshotSafeSegment(input.created_at),
    adminCommandSnapshotSafeSegment(input.command),
    adminCommandSnapshotSafeSegment(snapshotId)
  ].join("-");
  const snapshotDirectory = path.join(adminCommandSnapshotRoot(input.library_root), directoryName);
  const manifestPath = path.join(snapshotDirectory, "snapshot.json");
  const manifestRelativePath = path.join(
    ".mixlab-library",
    "admin",
    "command-snapshots",
    directoryName,
    "snapshot.json"
  );
  const makeDirectory = input.make_directory ?? (async (directoryPath: string) => {
    await mkdir(directoryPath, { recursive: true });
  });
  const writeTextFile = input.write_text_file ?? (async (filePath: string, text: string) => {
    await writeFile(filePath, text, "utf8");
  });
  const copySnapshotFile = input.copy_file ?? copyFile;
  const statFile = input.stat_file ?? stat;

  await makeDirectory(snapshotDirectory);
  const files = await captureSnapshotFiles({
    library_root: input.library_root,
    snapshot_directory: snapshotDirectory,
    directory_name: directoryName,
    files: input.files ?? [],
    make_directory: makeDirectory,
    copy_file: copySnapshotFile,
    stat_file: statFile
  });
  const manifest = buildAdminCommandSnapshotManifest({
    snapshot_id: snapshotId,
    created_at: input.created_at,
    command: input.command,
    holder: input.holder,
    files
  });
  await writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const summary = manifest.file_summary;

  return {
    created: true,
    reason: "created",
    snapshot_kind: manifest.snapshot_kind,
    rollback_status: "not-implemented",
    snapshot_id: snapshotId,
    snapshot_directory: snapshotDirectory,
    manifest_path: manifestPath,
    manifest_relative_path: manifestRelativePath,
    requested_file_count: summary.requested_file_count,
    captured_file_count: summary.captured_file_count,
    missing_file_count: summary.missing_file_count,
    skipped_file_count: summary.skipped_file_count,
    failed_file_count: summary.failed_file_count
  };
}

export function adminCommandSnapshotUnavailable(error: unknown): AdminCommandSnapshotUnavailableResult {
  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      created: false,
      reason: "write_failed",
      snapshot_kind: "metadata-only",
      rollback_status: "not-implemented",
      error_name: typeof candidate.name === "string" ? candidate.name : "Error",
      error_code: typeof candidate.code === "string" ? candidate.code : "",
      error_message: typeof candidate.message === "string" ? candidate.message : "Command snapshot unavailable."
    };
  }

  return {
    created: false,
    reason: "write_failed",
    snapshot_kind: "metadata-only",
    rollback_status: "not-implemented",
    error_name: "Error",
    error_code: "",
    error_message: typeof error === "string" ? error : "Command snapshot unavailable."
  };
}

export async function createAdminCommandSnapshotBestEffort(
  input: CreateAdminCommandSnapshotInput
): Promise<AdminCommandSnapshotResult> {
  try {
    return await createAdminCommandSnapshot(input);
  } catch (error) {
    return adminCommandSnapshotUnavailable(error);
  }
}
