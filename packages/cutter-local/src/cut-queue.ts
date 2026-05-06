import { copyFile, link, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  validateSourceVideoManifest,
  type CutMode,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import {
  allocateNextExportClipId,
  buildCanonicalClipTitle,
  buildExportClipArtifactPaths,
  buildProjectClipOutputFile,
  sourceTitleForCanonicalClipName,
  writeExportClipManifest
} from "./export-manifest.ts";
import type { ClipListManifest, ClipListItem } from "./cut-list.ts";

export type CutJobStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type CutJobPhaseId =
  | "queue_wait"
  | "resolve_source"
  | "cut_media"
  | "write_project_output"
  | "preprocess_local_asset"
  | "generate_cover"
  | "write_manifest";
export type CutJobPhaseStatus = "pending" | "running" | "done" | "failed";

export interface CutJobPhaseTiming {
  phase_id: CutJobPhaseId;
  label: string;
  status: CutJobPhaseStatus;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
}

export interface CutJobManifest {
  schema_version: "1.0";
  cut_job_id: string;
  clip_list_id: string;
  clip_list_item_id: string;
  library_id: string;
  project_id?: string;
  title?: string;
  project_title?: string;
  project_clip_order?: number;
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
  current_phase?: CutJobPhaseId;
  phase_timings?: CutJobPhaseTiming[];
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
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  file_size?: number;
  transcript_segments?: TranscriptSegment[];
}

export interface CutRunnerInput {
  source_video_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
}

export type CutRunner = (input: CutRunnerInput) => Promise<void> | void;

export interface CoverRunnerInput {
  source_video_path: string;
  output_path: string;
  at_ms: number;
  width: number;
}

export type CoverRunner = (input: CoverRunnerInput) => Promise<void> | void;

export interface RunNextCutJobInput {
  workspace_root: string;
  library_root: string;
  now: () => string;
  resolve_source: (job: CutJobManifest) => Promise<CutJobSourceDetail | null> | CutJobSourceDetail | null;
  cut_runner: CutRunner;
  cover_runner?: CoverRunner;
}

const CUT_JOB_PHASES: Array<{ phase_id: CutJobPhaseId; label: string }> = [
  { phase_id: "queue_wait", label: "排队等待" },
  { phase_id: "resolve_source", label: "读取源素材" },
  { phase_id: "cut_media", label: "剪切/重编码" },
  { phase_id: "write_project_output", label: "写入交付目录" },
  { phase_id: "preprocess_local_asset", label: "本地素材预处理" },
  { phase_id: "generate_cover", label: "生成封面" },
  { phase_id: "write_manifest", label: "写入清单" }
];

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

function durationMs(startedAt: string | undefined, finishedAt: string): number | undefined {
  if (!startedAt) {
    return undefined;
  }

  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}

function initialPhaseTimings(createdAt: string): CutJobPhaseTiming[] {
  return CUT_JOB_PHASES.map((phase, index) => ({
    ...phase,
    status: index === 0 ? "running" : "pending",
    ...(index === 0 ? { started_at: createdAt } : {})
  }));
}

function ensurePhaseTimings(job: CutJobManifest): CutJobPhaseTiming[] {
  if (job.phase_timings?.length === CUT_JOB_PHASES.length) {
    return job.phase_timings.map((phase) => ({ ...phase }));
  }

  return initialPhaseTimings(job.created_at);
}

function updatePhase(
  phases: CutJobPhaseTiming[],
  phaseId: CutJobPhaseId,
  update: Partial<CutJobPhaseTiming>
): CutJobPhaseTiming[] {
  return phases.map((phase) =>
    phase.phase_id === phaseId
      ? {
          ...phase,
          ...update
        }
      : phase
  );
}

function startPhase(job: CutJobManifest, phaseId: CutJobPhaseId, now: string): CutJobManifest {
  let phases = ensurePhaseTimings(job);
  const currentPhaseId = job.current_phase;

  if (currentPhaseId && currentPhaseId !== phaseId) {
    const currentPhase = phases.find((phase) => phase.phase_id === currentPhaseId);
    if (currentPhase?.status === "running") {
      phases = updatePhase(phases, currentPhaseId, {
        status: "done",
        finished_at: now,
        duration_ms: durationMs(currentPhase.started_at, now)
      });
    }
  }

  phases = updatePhase(phases, phaseId, {
    status: "running",
    started_at: phases.find((phase) => phase.phase_id === phaseId)?.started_at ?? now,
    finished_at: undefined,
    duration_ms: undefined
  });

  return {
    ...job,
    current_phase: phaseId,
    phase_timings: phases,
    updated_at: now
  };
}

function finishPhase(job: CutJobManifest, phaseId: CutJobPhaseId, now: string): CutJobManifest {
  const phases = ensurePhaseTimings(job);
  const phase = phases.find((item) => item.phase_id === phaseId);

  return {
    ...job,
    phase_timings: updatePhase(phases, phaseId, {
      status: "done",
      finished_at: now,
      duration_ms: durationMs(phase?.started_at, now)
    }),
    updated_at: now
  };
}

function failPhase(job: CutJobManifest, phaseId: CutJobPhaseId, now: string): CutJobManifest {
  const phases = ensurePhaseTimings(job);
  const phase = phases.find((item) => item.phase_id === phaseId);

  return {
    ...job,
    current_phase: phaseId,
    phase_timings: updatePhase(phases, phaseId, {
      status: "failed",
      finished_at: now,
      duration_ms: durationMs(phase?.started_at, now)
    }),
    updated_at: now
  };
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
  project_clip_order: number;
  now: string;
}): CutJobManifest {
  const sourceTitle = sourceTitleForCanonicalClipName(input.item.source_title, input.clip_list.title);
  const title = buildCanonicalClipTitle({
    project_clip_order: input.project_clip_order,
    project_title: input.clip_list.title,
    source_title: sourceTitle
  });

  return {
    schema_version: "1.0",
    cut_job_id: input.cut_job_id,
    clip_list_id: input.clip_list.clip_list_id,
    clip_list_item_id: input.item.item_id,
    library_id: input.clip_list.library_id,
    ...(input.clip_list.project_id ? { project_id: input.clip_list.project_id } : {}),
    source_video_id: input.item.source_video_id,
    title,
    project_title: input.clip_list.title,
    project_clip_order: input.project_clip_order,
    source_title: sourceTitle,
    source_relative_path: input.item.source_relative_path,
    start_segment_id: input.item.start_segment_id,
    end_segment_id: input.item.end_segment_id,
    begin_ms: input.item.begin_ms,
    end_ms: input.item.end_ms,
    selected_text: input.item.selected_text,
    cut_mode: input.item.cut_mode,
    status: "pending",
    current_phase: "queue_wait",
    phase_timings: initialPhaseTimings(input.now),
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
  const existingProjectOrder = (await readAllCutJobs(input.workspace_root))
    .filter((job) =>
      input.clip_list.project_id
        ? job.project_id === input.clip_list.project_id
        : job.project_title === input.clip_list.title
    )
    .reduce((max, job) => Math.max(max, job.project_clip_order ?? 0), 0);
  const jobs = input.clip_list.items.map((item, index) =>
    jobFromClipListItem({
      cut_job_id: cutJobIds[index] ?? formatCutJobId(dateStampFromIso(input.now), index + 1),
      clip_list: input.clip_list,
      item,
      project_clip_order: existingProjectOrder + index + 1,
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
    current_phase: "queue_wait",
    phase_timings: initialPhaseTimings(input.now),
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

function workspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("workspace artifact path must be workspace-relative");
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("workspace artifact path must be workspace-relative");
  }

  return path.join(workspaceRoot, ...parts);
}

function formatSrtTime(milliseconds: number): string {
  const safe = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const ms = safe % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function transcriptTextMetadata(text: string, beginChar: number): {
  begin_char: number;
  end_char: number;
  normalized_begin_char: number;
  normalized_end_char: number;
  normalized_text: string;
} {
  const normalizedText = text.replace(/\s+/g, "");

  return {
    begin_char: beginChar,
    end_char: beginChar + text.length,
    normalized_begin_char: beginChar,
    normalized_end_char: beginChar + normalizedText.length,
    normalized_text: normalizedText
  };
}

function fallbackTranscriptSegment(input: {
  export_clip_id: string;
  duration_ms: number;
  selected_text: string;
}): TranscriptSegment {
  const text = input.selected_text.trim();

  return {
    segment_id: `${input.export_clip_id}-S000001`,
    index: 1,
    begin_ms: 0,
    end_ms: input.duration_ms,
    ...transcriptTextMetadata(text, 0),
    text,
    confidence: 1
  };
}

function localTranscriptSegments(input: {
  export_clip_id: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  source_segments?: TranscriptSegment[];
}): TranscriptSegment[] {
  const durationMs = Math.max(0, input.end_ms - input.begin_ms);
  const sourceSegments = input.source_segments ?? [];
  const overlapping = sourceSegments.filter(
    (segment) => segment.end_ms > input.begin_ms && segment.begin_ms < input.end_ms
  );

  if (overlapping.length === 0) {
    return [fallbackTranscriptSegment({
      export_clip_id: input.export_clip_id,
      duration_ms: durationMs,
      selected_text: input.selected_text
    })];
  }

  let beginChar = 0;

  return overlapping.map((segment, index) => {
    const text = segment.text.trim();
    const metadata = transcriptTextMetadata(text, beginChar);
    beginChar = metadata.end_char + 1;

    return {
      ...segment,
      segment_id: `${input.export_clip_id}-S${String(index + 1).padStart(6, "0")}`,
      index: index + 1,
      begin_ms: Math.max(0, segment.begin_ms - input.begin_ms),
      end_ms: Math.min(durationMs, Math.max(0, segment.end_ms - input.begin_ms)),
      ...metadata,
      text,
      confidence: segment.confidence ?? 1
    };
  });
}

function srtFromSegments(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((segment, index) => [
      String(index + 1),
      `${formatSrtTime(segment.begin_ms)} --> ${formatSrtTime(segment.end_ms)}`,
      segment.text
    ].join("\n"))
    .join("\n\n") + "\n";
}

async function linkOrCopyFile(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await link(sourcePath, targetPath);
  } catch {
    await copyFile(sourcePath, targetPath);
  }
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function localVideoArtifactPath(exportClipId: string, fileName: string): string {
  return `.mixlab-library/videos/${exportClipId}/${fileName}`;
}

async function writePlaceholderSvgCover(input: {
  output_path: string;
  title: string;
}): Promise<void> {
  const title = input.title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1f2937"/><text x="32" y="188" fill="#f9fafb" font-family="Arial, sans-serif" font-size="28">${title}</text></svg>\n`;

  await mkdir(path.dirname(input.output_path), { recursive: true });
  await writeFile(input.output_path, svg, "utf8");
}

async function writePreprocessedLocalAsset(input: {
  workspace_root: string;
  export_clip_id: string;
  title: string;
  library_id: string;
  source_video_id: string;
  source_title: string;
  output_media_file_path: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  created_at: string;
  source: CutJobSourceDetail;
  cover_runner?: CoverRunner;
  before_cover?: () => Promise<void>;
  after_cover?: () => Promise<void>;
}): Promise<{
  local_asset_relative_path: string;
  source_video_manifest_path: string;
  transcript_path: string;
  srt_path: string;
  keyframes_path: string;
  cover_path: string;
  file_size: number;
  content_hash: string;
  transcript_segments: TranscriptSegment[];
  width: number;
  height: number;
  fps: number;
  codec: string;
}> {
  const durationMs = Math.max(0, input.end_ms - input.begin_ms);
  const localAssetRelativePath = localVideoArtifactPath(input.export_clip_id, "source.mp4");
  const transcriptPath = localVideoArtifactPath(input.export_clip_id, "transcript.json");
  const srtPath = localVideoArtifactPath(input.export_clip_id, "subtitles.srt");
  const keyframesPath = localVideoArtifactPath(input.export_clip_id, "keyframes.json");
  const coverPath = localVideoArtifactPath(input.export_clip_id, input.cover_runner ? "cover.jpg" : "cover.svg");
  const localMediaPath = workspaceRelativePath(input.workspace_root, localAssetRelativePath);
  const coverFilePath = workspaceRelativePath(input.workspace_root, coverPath);
  const transcriptSegments = localTranscriptSegments({
    export_clip_id: input.export_clip_id,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    selected_text: input.selected_text,
    source_segments: input.source.transcript_segments
  });
  const fullText = transcriptSegments.map((segment) => segment.text).join(" ");

  await linkOrCopyFile(input.output_media_file_path, localMediaPath);
  await mkdir(path.dirname(workspaceRelativePath(input.workspace_root, transcriptPath)), {
    recursive: true
  });
  await writeFile(
    workspaceRelativePath(input.workspace_root, transcriptPath),
    jsonBytes({
      schema_version: "1.0",
      source_video_id: input.export_clip_id,
      provider: "mixlab-local-cut",
      model: "source-transcript-span",
      generated_at: input.created_at,
      duration_ms: durationMs,
      full_text: fullText,
      segments: transcriptSegments
    }),
    "utf8"
  );
  await writeFile(workspaceRelativePath(input.workspace_root, srtPath), srtFromSegments(transcriptSegments), "utf8");
  await writeFile(
    workspaceRelativePath(input.workspace_root, keyframesPath),
    jsonBytes({
      schema_version: "1.0",
      keyframes_ms: [0, Math.min(durationMs, 1000)].filter((value, index, values) => index === 0 || value !== values[0])
    }),
    "utf8"
  );

  await input.before_cover?.();
  if (input.cover_runner) {
    await mkdir(path.dirname(coverFilePath), { recursive: true });
    await input.cover_runner({
      source_video_path: input.output_media_file_path,
      output_path: coverFilePath,
      at_ms: Math.min(1000, Math.floor(durationMs / 2)),
      width: 640
    });
  } else {
    await writePlaceholderSvgCover({
      output_path: coverFilePath,
      title: input.title
    });
  }
  await input.after_cover?.();

  const mediaStat = await stat(input.output_media_file_path);
  const width = input.source.width ?? 0;
  const height = input.source.height ?? 0;
  const fps = input.source.fps ?? 0;
  const codec = input.source.codec ?? "";
  const sourceVideoManifest: SourceVideoManifest = {
    source_video_id: input.export_clip_id,
    title: input.title,
    relative_path: localAssetRelativePath,
    logical_uri: `mixlab-local://export-clips/${input.export_clip_id}`,
    duration_ms: durationMs,
    width,
    height,
    fps,
    codec,
    file_size: mediaStat.size,
    content_hash: await sha256File(input.output_media_file_path),
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: transcriptPath,
    srt_path: srtPath,
    keyframes_path: keyframesPath,
    cover_path: coverPath,
    description: `剪切自 ${input.source_title}`,
    tags: ["本地剪切素材"]
  };
  const validation = validateSourceVideoManifest(sourceVideoManifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const sourceVideoManifestPath = localVideoArtifactPath(input.export_clip_id, "source-video.json");
  await writeFile(
    workspaceRelativePath(input.workspace_root, sourceVideoManifestPath),
    jsonBytes(sourceVideoManifest),
    "utf8"
  );

  return {
    local_asset_relative_path: localAssetRelativePath,
    source_video_manifest_path: sourceVideoManifestPath,
    transcript_path: transcriptPath,
    srt_path: srtPath,
    keyframes_path: keyframesPath,
    cover_path: coverPath,
    file_size: mediaStat.size,
    content_hash: sourceVideoManifest.content_hash,
    transcript_segments: transcriptSegments,
    width,
    height,
    fps,
    codec
  };
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
    error_message: undefined,
    current_phase: pending.current_phase ?? "queue_wait",
    phase_timings: pending.phase_timings ?? initialPhaseTimings(pending.created_at)
  };

  try {
    async function runPhase<T>(
      phaseId: CutJobPhaseId,
      task: () => Promise<T> | T
    ): Promise<T> {
      running = startPhase(running, phaseId, input.now());
      await writeCutJob(input.workspace_root, running);
      const result = await task();
      running = finishPhase(running, phaseId, input.now());
      await writeCutJob(input.workspace_root, running);
      return result;
    }

    const source = await runPhase("resolve_source", async () => input.resolve_source(running));

    if (!source) {
      throw new Error("source video not found");
    }

    const exportClipId = await allocateNextExportClipId(input.workspace_root);
    const projectOutputFile = buildProjectClipOutputFile({
      project_clip_order: running.project_clip_order,
      project_title: running.project_title,
      source_title: running.source_title
    });
    const exportPaths = buildExportClipArtifactPaths({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      selected_text: running.selected_text,
      project_title: running.project_title,
      project_clip_order: running.project_clip_order,
      source_title: running.source_title
    });
    const title = buildCanonicalClipTitle({
      project_clip_order: running.project_clip_order,
      project_title: running.project_title,
      source_title: running.source_title
    });

    await runPhase("cut_media", async () => {
      await mkdir(path.dirname(exportPaths.media_file_path), { recursive: true });
      await input.cut_runner({
        source_video_path: source.source_video_file_path,
        output_path: exportPaths.media_file_path,
        begin_ms: running.begin_ms,
        end_ms: running.end_ms,
        cut_mode: running.cut_mode
      });
    });

    await runPhase("write_project_output", async () => {
      await linkOrCopyFile(
        exportPaths.media_file_path,
        workspaceRelativePath(input.workspace_root, projectOutputFile)
      );
    });

    running = startPhase(running, "preprocess_local_asset", input.now());
    await writeCutJob(input.workspace_root, running);
    const localAsset = await writePreprocessedLocalAsset({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      title,
      library_id: running.library_id,
      source_video_id: running.source_video_id,
      source_title: running.source_title,
      output_media_file_path: exportPaths.media_file_path,
      begin_ms: running.begin_ms,
      end_ms: running.end_ms,
      selected_text: running.selected_text,
      created_at: input.now(),
      source,
      cover_runner: input.cover_runner,
      before_cover: async () => {
        running = finishPhase(running, "preprocess_local_asset", input.now());
        await writeCutJob(input.workspace_root, running);
        running = startPhase(running, "generate_cover", input.now());
        await writeCutJob(input.workspace_root, running);
      },
      after_cover: async () => {
        running = finishPhase(running, "generate_cover", input.now());
        await writeCutJob(input.workspace_root, running);
        running = startPhase(running, "write_manifest", input.now());
        await writeCutJob(input.workspace_root, running);
      }
    });

    await writeExportClipManifest({
      workspace_root: input.workspace_root,
      export_clip_id: exportClipId,
      library_id: running.library_id,
      source_video_id: running.source_video_id,
      title,
      project_title: running.project_title,
      project_id: running.project_id,
      project_clip_order: running.project_clip_order,
      source_title: running.source_title,
      begin_ms: running.begin_ms,
      end_ms: running.end_ms,
      selected_text: running.selected_text,
      cut_mode: running.cut_mode,
      output_file: exportPaths.output_file,
      project_output_file: projectOutputFile,
      local_asset_relative_path: localAsset.local_asset_relative_path,
      source_video_manifest_path: localAsset.source_video_manifest_path,
      transcript_path: localAsset.transcript_path,
      srt_path: localAsset.srt_path,
      keyframes_path: localAsset.keyframes_path,
      cover_path: localAsset.cover_path,
      width: localAsset.width,
      height: localAsset.height,
      fps: localAsset.fps,
      codec: localAsset.codec,
      file_size: localAsset.file_size,
      content_hash: localAsset.content_hash,
      transcript_segments: localAsset.transcript_segments,
      created_at: input.now()
    });
    running = finishPhase(running, "write_manifest", input.now());

    running = {
      ...running,
      status: "done",
      title,
      export_clip_id: exportClipId,
      output_file: exportPaths.output_file,
      finished_at: input.now(),
      updated_at: input.now()
    };
    await writeCutJob(input.workspace_root, running);
    return running;
  } catch (error) {
    const failedAt = input.now();
    const failedPhaseId = running.current_phase ?? "queue_wait";
    running = failPhase(running, failedPhaseId, failedAt);
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
