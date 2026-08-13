import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseJsonText,
  writeJsonFileAtomically,
  type SourceVideoScanProgress
} from "../../library-fs/src/index.ts";
import { adminMixlabRoot } from "./admin-library-paths.ts";

export type AdminLibraryScanNewStatusState = "idle" | "running" | "completed" | "failed";

export interface AdminLibraryScanNewStatus {
  state: AdminLibraryScanNewStatusState;
  state_label: string;
  started_at: string;
  updated_at: string;
  completed_at: string;
  error_message: string;
  stage: SourceVideoScanProgress["stage"] | "";
  current_source_folder_id: string;
  current_source_folder_name: string;
  scanned_folder_count: number;
  total_source_folder_count: number;
  discovered_video_count: number;
  indexed_file_count: number;
  new_video_count: number;
  existing_video_count: number;
  written_video_count: number;
  total_video_count: number;
  inactive_manifest_count: number;
  inactive_ready_count: number;
}

function statusPath(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "admin", "library-scan-new-status.json");
}

function stateLabel(state: AdminLibraryScanNewStatusState): string {
  if (state === "running") {
    return "扫描中";
  }
  if (state === "completed") {
    return "扫描完成";
  }
  if (state === "failed") {
    return "扫描失败";
  }

  return "未扫描";
}

function normalizeStatus(input: Partial<AdminLibraryScanNewStatus>): AdminLibraryScanNewStatus {
  const state = input.state ?? "idle";
  return {
    state,
    state_label: stateLabel(state),
    started_at: input.started_at ?? "",
    updated_at: input.updated_at ?? "",
    completed_at: input.completed_at ?? "",
    error_message: input.error_message ?? "",
    stage: input.stage ?? "",
    current_source_folder_id: input.current_source_folder_id ?? "",
    current_source_folder_name: input.current_source_folder_name ?? "",
    scanned_folder_count: input.scanned_folder_count ?? 0,
    total_source_folder_count: input.total_source_folder_count ?? 0,
    discovered_video_count: input.discovered_video_count ?? 0,
    indexed_file_count: input.indexed_file_count ?? 0,
    new_video_count: input.new_video_count ?? 0,
    existing_video_count: input.existing_video_count ?? 0,
    written_video_count: input.written_video_count ?? 0,
    total_video_count: input.total_video_count ?? 0,
    inactive_manifest_count: input.inactive_manifest_count ?? 0,
    inactive_ready_count: input.inactive_ready_count ?? 0
  };
}

export function idleAdminLibraryScanNewStatus(): AdminLibraryScanNewStatus {
  return normalizeStatus({});
}

export async function readAdminLibraryScanNewStatus(libraryRoot: string): Promise<AdminLibraryScanNewStatus> {
  try {
    return normalizeStatus(parseJsonText<AdminLibraryScanNewStatus>(
      await readFile(statusPath(libraryRoot), "utf8")
    ));
  } catch {
    return idleAdminLibraryScanNewStatus();
  }
}

export async function writeAdminLibraryScanNewStatus(
  libraryRoot: string,
  status: Partial<AdminLibraryScanNewStatus>
): Promise<AdminLibraryScanNewStatus> {
  const normalized = normalizeStatus(status);
  const filePath = statusPath(libraryRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonFileAtomically(filePath, normalized);
  return normalized;
}

export function scanProgressToStatus(input: {
  started_at: string;
  progress: SourceVideoScanProgress;
}): AdminLibraryScanNewStatus {
  return normalizeStatus({
    state: "running",
    started_at: input.started_at,
    updated_at: input.progress.updated_at,
    stage: input.progress.stage,
    current_source_folder_id: input.progress.current_source_folder_id,
    current_source_folder_name: input.progress.current_source_folder_name,
    scanned_folder_count: input.progress.scanned_folder_count,
    total_source_folder_count: input.progress.total_source_folder_count,
    discovered_video_count: input.progress.discovered_video_count,
    indexed_file_count: input.progress.indexed_file_count,
    new_video_count: input.progress.new_video_count,
    existing_video_count: input.progress.existing_video_count,
    written_video_count: input.progress.written_video_count,
    total_video_count: input.progress.total_video_count
  });
}
