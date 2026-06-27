import { stat } from "node:fs/promises";
import path from "node:path";

export type AdminWorkerTextArtifactKind = "transcript" | "srt";

export interface AdminWorkerTextArtifactCommitCheck {
  kind: AdminWorkerTextArtifactKind;
  relative_path: string;
  file_path: string;
  safe_path: boolean;
  scoped_to_source_video: boolean;
  exists: boolean;
  blocker: string;
}

export interface AdminWorkerTextArtifactCommitPlan {
  source_video_id: string;
  safe_to_commit: boolean;
  checks: AdminWorkerTextArtifactCommitCheck[];
  blockers: string[];
}

export interface InspectAdminWorkerTextArtifactCommitInput {
  library_root: string;
  source_video_id: string;
  transcript_path: string;
  srt_path: string;
}

export class AdminWorkerArtifactCommitError extends Error {
  readonly code = "artifact_commit_blocked";
  readonly blockers: string[];

  constructor(plan: AdminWorkerTextArtifactCommitPlan) {
    super(`preprocess artifact commit blocked: ${plan.blockers.join("; ")}`);
    this.name = "AdminWorkerArtifactCommitError";
    this.blockers = plan.blockers;
  }
}

function splitPath(value: string): string[] {
  return value.split(/[\\/]+/).filter((part) => part.length > 0);
}

function isSafeLibraryRelativePath(relativePath: string): boolean {
  const trimmed = relativePath.trim();
  return (
    trimmed !== "" &&
    !path.isAbsolute(trimmed) &&
    !splitPath(trimmed).includes("..")
  );
}

function isScopedToSourceVideo(relativePath: string, sourceVideoId: string): boolean {
  const parts = splitPath(relativePath.trim());
  return (
    parts.length >= 4 &&
    parts[0] === ".mixlab-library" &&
    parts[1] === "videos" &&
    parts[2] === sourceVideoId
  );
}

async function artifactExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function inspectOne(input: {
  library_root: string;
  source_video_id: string;
  kind: AdminWorkerTextArtifactKind;
  relative_path: string;
}): Promise<AdminWorkerTextArtifactCommitCheck> {
  const relativePath = input.relative_path.trim();
  const safePath = isSafeLibraryRelativePath(relativePath);
  const scopedToSourceVideo = safePath
    ? isScopedToSourceVideo(relativePath, input.source_video_id)
    : false;
  const filePath = path.join(input.library_root, relativePath);
  const exists = safePath && scopedToSourceVideo
    ? await artifactExists(filePath)
    : false;
  let blocker = "";

  if (!safePath) {
    blocker = `${input.kind}_path is not a safe library-relative path`;
  } else if (!scopedToSourceVideo) {
    blocker = `${input.kind}_path must be under .mixlab-library/videos/${input.source_video_id}/`;
  } else if (!exists) {
    blocker = `${input.kind}_path file is missing`;
  }

  return {
    kind: input.kind,
    relative_path: relativePath,
    file_path: filePath,
    safe_path: safePath,
    scoped_to_source_video: scopedToSourceVideo,
    exists,
    blocker
  };
}

export async function inspectAdminWorkerTextArtifactCommit(
  input: InspectAdminWorkerTextArtifactCommitInput
): Promise<AdminWorkerTextArtifactCommitPlan> {
  const checks = await Promise.all([
    inspectOne({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      kind: "transcript",
      relative_path: input.transcript_path
    }),
    inspectOne({
      library_root: input.library_root,
      source_video_id: input.source_video_id,
      kind: "srt",
      relative_path: input.srt_path
    })
  ]);
  const blockers = checks
    .filter((check) => check.blocker)
    .map((check) => `${check.kind}: ${check.blocker}`);

  return {
    source_video_id: input.source_video_id,
    safe_to_commit: blockers.length === 0,
    checks,
    blockers
  };
}

export async function assertAdminWorkerTextArtifactCommitReady(
  input: InspectAdminWorkerTextArtifactCommitInput
): Promise<AdminWorkerTextArtifactCommitPlan> {
  const plan = await inspectAdminWorkerTextArtifactCommit(input);

  if (!plan.safe_to_commit) {
    throw new AdminWorkerArtifactCommitError(plan);
  }

  return plan;
}
