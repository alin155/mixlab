import { readdir, rmdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { listClipLists } from "./cut-list.ts";
import { listCutJobs } from "./cut-queue.ts";
import { listExportClips } from "./export-manifest.ts";

export interface DeleteProjectOutputsInput {
  workspace_root: string;
  project_id: string;
}

export interface DeleteProjectOutputsResult {
  project_id: string;
  removed_export_clips: number;
  removed_local_clips: number;
  removed_project_outputs: number;
  removed_cut_jobs: number;
  removed_clip_lists: number;
}

function assertProjectId(projectId: string): void {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) {
    throw new Error("project_id must be a safe project identifier");
  }
}

function workspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("workspace path must be relative");
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("workspace path must be relative");
  }

  return path.join(workspaceRoot, ...parts);
}

async function removeIfPresent(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    await rm(targetPath, { force: true, recursive: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function isDirectoryEmpty(directoryPath: string): Promise<boolean> {
  try {
    return (await readdir(directoryPath)).length === 0;
  } catch {
    return false;
  }
}

async function removeEmptyParentsUntil(startPath: string, stopPath: string): Promise<void> {
  let current = startPath;
  const stop = path.resolve(stopPath);

  while (path.resolve(current).startsWith(stop) && path.resolve(current) !== stop) {
    if (!(await isDirectoryEmpty(current))) {
      return;
    }

    try {
      await rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

export async function deleteProjectOutputs(
  input: DeleteProjectOutputsInput
): Promise<DeleteProjectOutputsResult> {
  assertProjectId(input.project_id);

  const clips = (await listExportClips({
    workspace_root: input.workspace_root
  })).clips.filter((clip) => clip.project_id === input.project_id);
  const jobs = (await listCutJobs({
    workspace_root: input.workspace_root
  })).jobs.filter((job) => job.project_id === input.project_id);
  const clipLists = (await listClipLists({
    workspace_root: input.workspace_root
  })).clip_lists.filter((clipList) => clipList.project_id === input.project_id);

  let removedProjectOutputs = 0;
  for (const clip of clips) {
    if (clip.project_output_file) {
      const projectOutputPath = workspaceRelativePath(input.workspace_root, clip.project_output_file);
      if (await removeIfPresent(projectOutputPath)) {
        removedProjectOutputs += 1;
        await removeEmptyParentsUntil(path.dirname(projectOutputPath), path.join(input.workspace_root, "projects"));
      }
    }
  }

  let removedLocalClips = 0;
  for (const clip of clips) {
    const localClipPath = path.join(input.workspace_root, ".mixlab-library", "videos", clip.export_clip_id);
    if (await removeIfPresent(localClipPath)) {
      removedLocalClips += 1;
    }
  }

  let removedExportClips = 0;
  for (const clip of clips) {
    const exportClipPath = path.join(input.workspace_root, "export-clips", clip.export_clip_id);
    if (await removeIfPresent(exportClipPath)) {
      removedExportClips += 1;
    }
  }

  let removedCutJobs = 0;
  for (const job of jobs) {
    if (await removeIfPresent(path.join(input.workspace_root, "clip-jobs", `${job.cut_job_id}.json`))) {
      removedCutJobs += 1;
    }
  }

  let removedClipLists = 0;
  for (const clipList of clipLists) {
    if (await removeIfPresent(path.join(input.workspace_root, "clip-lists", clipList.clip_list_id))) {
      removedClipLists += 1;
    }
  }

  return {
    project_id: input.project_id,
    removed_export_clips: removedExportClips,
    removed_local_clips: removedLocalClips,
    removed_project_outputs: removedProjectOutputs,
    removed_cut_jobs: removedCutJobs,
    removed_clip_lists: removedClipLists
  };
}
