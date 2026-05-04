import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CutMode } from "../../protocol/src/index.ts";
import {
  allocateNextExportClipId,
  buildExportClipArtifactPaths,
  writeExportClipManifest
} from "./export-manifest.ts";
import type { ClipListManifest, ClipListItem } from "./cut-list.ts";

export type CutJobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface CutJobManifest {
  schema_version: "1.0";
  cut_job_id: string;
  clip_list_id: string;
  clip_list_item_id: string;
  library_id: string;
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  status: CutJobStatus;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  export_clip_id?: string;
  output_file?: string;
}

export interface SubmitClipListToQueueInput {
  workspace_root: string;
  clip_list: ClipListManifest;
  now: string;
}

export interface CutJobSubmission {
  submitted_count: number;
  jobs: CutJobManifest[];
}

export interface ListCutJobsInput {
  workspace_root: string;
}

export interface CutJobCatalog {
  job_count: number;
  jobs: CutJobManifest[];
}

export interface GetCutJobInput {
  workspace_root: string;
  cut_job_id: string;
}

export interface RetryCutJobInput {
  workspace_root: string;
  cut_job_id: string;
  now: string;
}

export interface CutJobSourceDetail {
  source_video_id: string;
  title: string;
  relative_path: string;
  source_video_file_path: string;
}

export interface CutRunnerInput {
  source_video_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
}

export type CutRunner = (input: CutRunnerInput) => Promise<void> | void;

export interface RunNextCutJobInput {
  workspace_root: string;
  library_root: string;
  now: () => string;
  resolve_source: (job: CutJobManifest) => Promise<CutJobSourceDetail | null> | CutJobSourceDetail | null;
  cut_runner: CutRunner;
}

const CUT_JOB_ID_PATTERN = /^CJ\d{8}-\d{4}$/;

function cutJobsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "clip-jobs");
}

function cutJobPath(workspaceRoot: string, cutJobId: string): string {
  assertCutJobId(cutJobId);
  return path.join(cutJobsRoot(workspaceRoot), `${cutJobId}.json`);
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertCutJobId(cutJobId: string): void {
  if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
    throw new Error("cut_job_id must use CJYYYYMMDD-0001 format");
  }
}

function dateStampFromIso(now: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(now);

  if (!match) {
    throw new Error("now must be an ISO timestamp");
  }

  return `${match[1]}${match[2]}${match[3]}`;
}

function numericCutJobSequence(cutJobId: string): number {
  const match = /^CJ\d{8}-(\d{4})$/.exec(cutJobId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function formatCutJobId(dateStamp: string, sequence: number): string {
  return `CJ${dateStamp}-${String(sequence).padStart(4, "0")}`;
}

async function allocateNextCutJobIds(input: {
  workspace_root: string;
  now: string;
  count: number;
}): Promise<string[]> {
  const dateStamp = dateStampFromIso(input.now);
  let entries;

  try {
    entries = await readdir(cutJobsRoot(input.workspace_root), { withFileTypes: true });
  } catch {
    return Array.from({ length: input.count }, (_, index) =>
      formatCutJobId(dateStamp, index + 1)
    );
  }

  let maxSequence = 0;

  for (const entry of entries) {
    const basename = entry.name.replace(/\.json$/, "");

    if (
      entry.isFile() &&
      basename.startsWith(`CJ${dateStamp}-`) &&
      CUT_JOB_ID_PATTERN.test(basename)
    ) {
      maxSequence = Math.max(maxSequence, numericCutJobSequence(basename));
    }
  }

  return Array.from({ length: input.count }, (_, index) =>
    formatCutJobId(dateStamp, maxSequence + index + 1)
  );
}

function jobFromClipListItem(input: {
  cut_job_id: string;
  clip_list: ClipListManifest;
  item: ClipListItem;
  now: string;
}): CutJobManifest {
  return {
    schema_version: "1.0",
    cut_job_id: input.cut_job_id,
    clip_list_id: input.clip_list.clip_list_id,
    clip_list_item_id: input.item.item_id,
    library_id: input.clip_list.library_id,
    source_video_id: input.item.source_video_id,
    source_title: input.item.source_title,
    source_relative_path: input.item.source_relative_path,
    start_segment_id: input.item.start_segment_id,
    end_segment_id: input.item.end_segment_id,
    begin_ms: input.item.begin_ms,
    end_ms: input.item.end_ms,
    selected_text: input.item.selected_text,
    cut_mode: input.item.cut_mode,
    status: "pending",
    created_at: input.now,
    updated_at: input.now
  };
}

async function writeCutJob(workspaceRoot: string, job: CutJobManifest): Promise<void> {
  const filePath = cutJobPath(workspaceRoot, job.cut_job_id);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, jsonBytes(job), "utf8");
}

async function readAllCutJobs(workspaceRoot: string): Promise<CutJobManifest[]> {
  let entries;

  try {
    entries = await readdir(cutJobsRoot(workspaceRoot), { withFileTypes: true });
  } catch {
    return [];
  }

  const jobs: CutJobManifest[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const cutJobId = entry.name.replace(/\.json$/, "");

    if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
      continue;
    }

    jobs.push(JSON.parse(await readFile(cutJobPath(workspaceRoot, cutJobId), "utf8")) as CutJobManifest);
  }

  return jobs;
}

export async function submitClipListToQueue(
  input: SubmitClipListToQueueInput
): Promise<CutJobSubmission> {
  const cutJobIds = await allocateNextCutJobIds({
    workspace_root: input.workspace_root,
    now: input.now,
    count: input.clip_list.items.length
  });
  const jobs = input.clip_list.items.map((item, index) =>
    jobFromClipListItem({
      cut_job_id: cutJobIds[index] ?? formatCutJobId(dateStampFromIso(input.now), index + 1),
      clip_list: input.clip_list,
      item,
      now: input.now
    })
  );

  for (const job of jobs) {
    await writeCutJob(input.workspace_root, job);
  }

  return {
    submitted_count: jobs.length,
    jobs
  };
}

export async function getCutJob(input: GetCutJobInput): Promise<CutJobManifest | null> {
  try {
    return JSON.parse(await readFile(cutJobPath(input.workspace_root, input.cut_job_id), "utf8")) as CutJobManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function listCutJobs(input: ListCutJobsInput): Promise<CutJobCatalog> {
  const jobs = await readAllCutJobs(input.workspace_root);
  jobs.sort((left, right) => {
    const updatedCompare = right.updated_at.localeCompare(left.updated_at);
    return updatedCompare || right.cut_job_id.localeCompare(left.cut_job_id);
  });

  return {
    job_count: jobs.length,
    jobs
  };
}

export async function retryCutJob(input: RetryCutJobInput): Promise<CutJobManifest> {
  const job = await getCutJob({
    workspace_root: input.workspace_root,
    cut_job_id: input.cut_job_id
  });

  if (!job) {
    throw new Error("cut job not found");
  }

  if (job.status !== "failed") {
    throw new Error("only failed cut jobs can be retried");
  }

  const retried: CutJobManifest = {
    ...job,
    status: "pending",
    updated_at: input.now,
    started_at: undefined,
    finished_at: undefined,
    error_message: undefined,
    export_clip_id: undefined,
    output_file: undefined
  };
  await writeCutJob(input.workspace_root, retried);
  return retried;
}

function oldestPendingJob(jobs: CutJobManifest[]): CutJobManifest | null {
  return [...jobs]
    .filter((job) => job.status === "pending")
    .sort((left, right) => {
      const createdCompare = left.created_at.localeCompare(right.created_at);
      return createdCompare || left.cut_job_id.localeCompare(right.cut_job_id);
    })[0] ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runNextCutJob(
  input: RunNextCutJobInput
): Promise<CutJobManifest | null> {
  const pending = oldestPendingJob(await readAllCutJobs(input.workspace_root));

  if (!pending) {
    return null;
  }

  const startedAt = input.now();
  let running: CutJobManifest = {
    ...pending,
    status: "running",
    started_at: startedAt,
    updated_at: startedAt,
    error_message: undefined
  };
  await writeCutJob(input.workspace_root, running);

  try {
    const source = await input.resolve_source(running);

    if (!source) {
      throw new Error("source video not found");
    }

    const exportClipId = await allocateNextExportClipId(input.workspace_root);
    const exportPaths = buildExportClipArtifactPaths({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      selected_text: running.selected_text
    });

    await mkdir(path.dirname(exportPaths.media_file_path), { recursive: true });
    await input.cut_runner({
      source_video_path: source.source_video_file_path,
      output_path: exportPaths.media_file_path,
      begin_ms: running.begin_ms,
      end_ms: running.end_ms,
      cut_mode: running.cut_mode
    });

    await writeExportClipManifest({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      library_id: running.library_id,
      source_video_id: running.source_video_id,
      source_title: running.source_title,
      begin_ms: running.begin_ms,
      end_ms: running.end_ms,
      selected_text: running.selected_text,
      cut_mode: running.cut_mode,
      output_file: exportPaths.output_file,
      created_at: input.now()
    });

    running = {
      ...running,
      status: "done",
      export_clip_id: exportClipId,
      output_file: exportPaths.output_file,
      finished_at: input.now(),
      updated_at: input.now()
    };
    await writeCutJob(input.workspace_root, running);
    return running;
  } catch (error) {
    const failedAt = input.now();
    const failed: CutJobManifest = {
      ...running,
      status: "failed",
      error_message: errorMessage(error),
      finished_at: failedAt,
      updated_at: failedAt
    };
    await writeCutJob(input.workspace_root, failed);
    return failed;
  }
}
