import type { Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  adminCommandSnapshotRoot,
  type AdminCommandSnapshotFileEntry,
  type AdminCommandSnapshotManifest
} from "./admin-command-snapshot.ts";

export type AdminCommandRestorePlanFileStatus =
  | "restorable"
  | "blocked";

export type AdminCommandRestorePlanTargetStatus =
  | "exists"
  | "missing"
  | "not-file"
  | "unsafe";

export type AdminCommandRestorePlanSnapshotStatus =
  | "exists"
  | "missing"
  | "not-file"
  | "size-mismatch"
  | "unsafe"
  | "not-captured";

export type AdminCommandRestorePlanBlocker =
  | "snapshot_manifest_outside_command_snapshot_root"
  | "snapshot_manifest_missing"
  | "snapshot_manifest_not_file"
  | "snapshot_manifest_invalid_json"
  | "snapshot_manifest_invalid_schema"
  | "snapshot_is_not_file_capture"
  | "snapshot_file_not_captured"
  | "snapshot_file_path_missing"
  | "snapshot_file_path_unsafe"
  | "snapshot_file_missing"
  | "snapshot_file_not_file"
  | "snapshot_file_size_mismatch"
  | "source_path_missing"
  | "source_path_unsafe"
  | "target_is_not_file";

export interface AdminCommandRestorePlanFile {
  label: string;
  can_restore: boolean;
  status: AdminCommandRestorePlanFileStatus;
  source_relative_path?: string;
  snapshot_relative_path?: string;
  target_status: AdminCommandRestorePlanTargetStatus;
  snapshot_status: AdminCommandRestorePlanSnapshotStatus;
  expected_size_bytes?: number;
  snapshot_size_bytes?: number;
  blockers: AdminCommandRestorePlanBlocker[];
}

export interface AdminCommandRestorePlan {
  schema_version: "1.0";
  generated_at: string;
  can_restore: boolean;
  command?: string;
  snapshot_id?: string;
  snapshot_kind?: string;
  snapshot_manifest_relative_path?: string;
  file_count: number;
  restorable_file_count: number;
  blocked_file_count: number;
  blockers: AdminCommandRestorePlanBlocker[];
  files: AdminCommandRestorePlanFile[];
}

export interface PlanAdminCommandSnapshotRestoreInput {
  library_root: string;
  snapshot_manifest_path: string;
  generated_at: string;
  read_text_file?: (filePath: string) => Promise<string>;
  stat_file?: (filePath: string) => Promise<Pick<Stats, "isFile" | "size">>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function insidePath(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function libraryRelativePath(libraryRoot: string, candidatePath: string): string | null {
  if (!insidePath(libraryRoot, candidatePath)) {
    return null;
  }
  return path.relative(path.resolve(libraryRoot), path.resolve(candidatePath));
}

function resolveLibraryRelativePath(libraryRoot: string, relativePath: string | undefined): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return null;
  }

  const resolved = path.resolve(libraryRoot, relativePath);
  return insidePath(libraryRoot, resolved) ? resolved : null;
}

function emptyPlan(input: {
  generated_at: string;
  snapshot_manifest_relative_path?: string;
  blockers: AdminCommandRestorePlanBlocker[];
}): AdminCommandRestorePlan {
  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    can_restore: false,
    snapshot_manifest_relative_path: input.snapshot_manifest_relative_path,
    file_count: 0,
    restorable_file_count: 0,
    blocked_file_count: 0,
    blockers: unique(input.blockers),
    files: []
  };
}

function isSnapshotManifest(value: unknown): value is AdminCommandSnapshotManifest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const manifest = value as AdminCommandSnapshotManifest;
  return manifest.schema_version === "1.0" &&
    typeof manifest.snapshot_id === "string" &&
    typeof manifest.command === "string" &&
    typeof manifest.snapshot_kind === "string" &&
    Array.isArray(manifest.files);
}

async function inspectFile(input: {
  file_path: string | null;
  stat_file: (filePath: string) => Promise<Pick<Stats, "isFile" | "size">>;
  missing_status: AdminCommandRestorePlanSnapshotStatus | AdminCommandRestorePlanTargetStatus;
  not_file_status: AdminCommandRestorePlanSnapshotStatus | AdminCommandRestorePlanTargetStatus;
}): Promise<{
  status: AdminCommandRestorePlanSnapshotStatus | AdminCommandRestorePlanTargetStatus;
  size_bytes?: number;
}> {
  if (!input.file_path) {
    return {
      status: "unsafe"
    };
  }

  try {
    const fileStat = await input.stat_file(input.file_path);
    if (!fileStat.isFile()) {
      return {
        status: input.not_file_status
      };
    }
    return {
      status: "exists",
      size_bytes: fileStat.size
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        status: input.missing_status
      };
    }
    throw error;
  }
}

async function planFile(input: {
  library_root: string;
  file: AdminCommandSnapshotFileEntry;
  stat_file: (filePath: string) => Promise<Pick<Stats, "isFile" | "size">>;
}): Promise<AdminCommandRestorePlanFile> {
  const blockers: AdminCommandRestorePlanBlocker[] = [];

  if (input.file.status !== "captured") {
    blockers.push("snapshot_file_not_captured");
  }

  if (!input.file.snapshot_relative_path) {
    blockers.push("snapshot_file_path_missing");
  }

  if (!input.file.source_relative_path) {
    blockers.push("source_path_missing");
  }

  const snapshotPath = resolveLibraryRelativePath(input.library_root, input.file.snapshot_relative_path);
  const sourcePath = resolveLibraryRelativePath(input.library_root, input.file.source_relative_path);

  if (input.file.snapshot_relative_path && !snapshotPath) {
    blockers.push("snapshot_file_path_unsafe");
  }
  if (input.file.source_relative_path && !sourcePath) {
    blockers.push("source_path_unsafe");
  }

  const snapshotInspection = await inspectFile({
    file_path: snapshotPath,
    stat_file: input.stat_file,
    missing_status: "missing",
    not_file_status: "not-file"
  });
  const targetInspection = await inspectFile({
    file_path: sourcePath,
    stat_file: input.stat_file,
    missing_status: "missing",
    not_file_status: "not-file"
  });

  let snapshotStatus: AdminCommandRestorePlanSnapshotStatus = snapshotInspection.status as AdminCommandRestorePlanSnapshotStatus;
  const targetStatus = targetInspection.status as AdminCommandRestorePlanTargetStatus;

  if (snapshotStatus === "missing") {
    blockers.push("snapshot_file_missing");
  } else if (snapshotStatus === "not-file") {
    blockers.push("snapshot_file_not_file");
  } else if (snapshotStatus === "unsafe") {
    blockers.push("snapshot_file_path_unsafe");
  }

  if (targetStatus === "not-file") {
    blockers.push("target_is_not_file");
  } else if (targetStatus === "unsafe") {
    blockers.push("source_path_unsafe");
  }

  if (
    snapshotStatus === "exists" &&
    input.file.size_bytes !== undefined &&
    snapshotInspection.size_bytes !== input.file.size_bytes
  ) {
    snapshotStatus = "size-mismatch";
    blockers.push("snapshot_file_size_mismatch");
  }

  if (input.file.status !== "captured" && blockers.includes("snapshot_file_not_captured")) {
    snapshotStatus = "not-captured";
  }

  const uniqueBlockers = unique(blockers);
  return {
    label: input.file.label,
    can_restore: uniqueBlockers.length === 0,
    status: uniqueBlockers.length === 0 ? "restorable" : "blocked",
    source_relative_path: input.file.source_relative_path,
    snapshot_relative_path: input.file.snapshot_relative_path,
    target_status: targetStatus,
    snapshot_status: snapshotStatus,
    expected_size_bytes: input.file.size_bytes,
    snapshot_size_bytes: snapshotInspection.size_bytes,
    blockers: uniqueBlockers
  };
}

export async function planAdminCommandSnapshotRestore(
  input: PlanAdminCommandSnapshotRestoreInput
): Promise<AdminCommandRestorePlan> {
  const readTextFile = input.read_text_file ?? (async (filePath: string) => readFile(filePath, "utf8"));
  const statFile = input.stat_file ?? stat;
  const snapshotManifestRelativePath = libraryRelativePath(input.library_root, input.snapshot_manifest_path);

  if (!snapshotManifestRelativePath || !insidePath(adminCommandSnapshotRoot(input.library_root), input.snapshot_manifest_path)) {
    return emptyPlan({
      generated_at: input.generated_at,
      snapshot_manifest_relative_path: snapshotManifestRelativePath ?? undefined,
      blockers: ["snapshot_manifest_outside_command_snapshot_root"]
    });
  }

  const manifestInspection = await inspectFile({
    file_path: input.snapshot_manifest_path,
    stat_file: statFile,
    missing_status: "missing",
    not_file_status: "not-file"
  });

  if (manifestInspection.status === "missing") {
    return emptyPlan({
      generated_at: input.generated_at,
      snapshot_manifest_relative_path: snapshotManifestRelativePath,
      blockers: ["snapshot_manifest_missing"]
    });
  }
  if (manifestInspection.status === "not-file") {
    return emptyPlan({
      generated_at: input.generated_at,
      snapshot_manifest_relative_path: snapshotManifestRelativePath,
      blockers: ["snapshot_manifest_not_file"]
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readTextFile(input.snapshot_manifest_path));
  } catch {
    return emptyPlan({
      generated_at: input.generated_at,
      snapshot_manifest_relative_path: snapshotManifestRelativePath,
      blockers: ["snapshot_manifest_invalid_json"]
    });
  }

  if (!isSnapshotManifest(parsed)) {
    return emptyPlan({
      generated_at: input.generated_at,
      snapshot_manifest_relative_path: snapshotManifestRelativePath,
      blockers: ["snapshot_manifest_invalid_schema"]
    });
  }

  const manifest = parsed;
  const manifestBlockers: AdminCommandRestorePlanBlocker[] = [];
  if (manifest.snapshot_kind !== "file-capture") {
    manifestBlockers.push("snapshot_is_not_file_capture");
  }

  const files = await Promise.all(manifest.files.map((file) =>
    planFile({
      library_root: input.library_root,
      file,
      stat_file: statFile
    })
  ));
  const fileBlockers = unique(files.flatMap((file) => file.blockers));
  const allBlockers = unique([...manifestBlockers, ...fileBlockers]);
  const restorableFileCount = files.filter((file) => file.can_restore).length;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    can_restore: allBlockers.length === 0 && files.length > 0,
    command: manifest.command,
    snapshot_id: manifest.snapshot_id,
    snapshot_kind: manifest.snapshot_kind,
    snapshot_manifest_relative_path: snapshotManifestRelativePath,
    file_count: files.length,
    restorable_file_count: restorableFileCount,
    blocked_file_count: files.length - restorableFileCount,
    blockers: allBlockers,
    files
  };
}
