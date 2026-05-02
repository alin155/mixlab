import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateSourceVideoManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";

export interface ClaimNextPreprocessJobInput {
  library_root: string;
  worker_id: string;
  now: string;
}

export interface PreprocessJobSummary {
  source_video_id: string;
  worker_id: string;
  status: "processing";
  attempt: number;
  claimed_at: string;
}

export interface CompletePreprocessArtifactsInput {
  library_root: string;
  source_video_id: string;
  now: string;
  media: {
    duration_ms: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    content_hash: string;
  };
  artifacts: {
    transcript_path: string;
    srt_path: string;
    keyframes_path: string;
    cover_path: string;
  };
}

export interface PublishReadySourceVideoInput {
  library_root: string;
  source_video_id: string;
  index_version: string;
  now: string;
}

export interface FailPreprocessJobInput {
  library_root: string;
  source_video_id: string;
  now: string;
  error_stage: string;
  error_message: string;
}

export interface CompleteReadyVisualArtifactsInput {
  library_root: string;
  source_video_id: string;
  cover_path: string;
  keyframes_ms: number[];
  now: string;
}

interface PreprocessJobRecord {
  source_video_id: string;
  worker_id: string;
  status: "processing" | "index-required" | "ready" | "failed";
  attempt: number;
  claimed_at: string;
  completed_at?: string;
  indexed_at?: string;
  index_version?: string;
  failed_at?: string;
  error_stage?: string;
  error_message?: string;
}

interface LibraryManifestMetadata {
  library_id?: string;
  name?: string;
  version?: string;
  created_at?: string;
  source_root?: string;
  preprocess_root?: string;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function videosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "videos");
}

function videoDir(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videosRoot(libraryRoot), sourceVideoId);
}

function sourceVideoManifestPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videoDir(libraryRoot, sourceVideoId), "source-video.json");
}

function preprocessJobPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videoDir(libraryRoot, sourceVideoId), "preprocess-job.json");
}

function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function assertRequiredArtifactPaths(paths: Pick<
  CompletePreprocessArtifactsInput["artifacts"],
  "transcript_path" | "srt_path"
>): void {
  const emptyKeys = Object.entries(paths)
    .filter(([, value]) => value.trim() === "")
    .map(([key]) => key);

  if (emptyKeys.length > 0) {
    throw new Error(`preprocess artifacts require non-empty paths: ${emptyKeys.join(", ")}`);
  }
}

export async function readSourceVideoManifest(
  libraryRoot: string,
  sourceVideoId: string
): Promise<SourceVideoManifest> {
  return JSON.parse(
    await readFile(sourceVideoManifestPath(libraryRoot, sourceVideoId), "utf8")
  ) as SourceVideoManifest;
}

async function writeSourceVideoManifest(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<void> {
  const targetDir = videoDir(libraryRoot, manifest.source_video_id);
  await mkdir(targetDir, { recursive: true });
  await writeFile(sourceVideoManifestPath(libraryRoot, manifest.source_video_id), jsonBytes(manifest));
}

async function readExistingJob(
  libraryRoot: string,
  sourceVideoId: string
): Promise<PreprocessJobRecord | undefined> {
  try {
    return JSON.parse(
      await readFile(preprocessJobPath(libraryRoot, sourceVideoId), "utf8")
    ) as PreprocessJobRecord;
  } catch {
    return undefined;
  }
}

async function writePreprocessJob(
  libraryRoot: string,
  job: PreprocessJobRecord
): Promise<void> {
  await mkdir(videoDir(libraryRoot, job.source_video_id), { recursive: true });
  await writeFile(preprocessJobPath(libraryRoot, job.source_video_id), jsonBytes(job));
}

export async function readAllSourceVideoManifests(
  libraryRoot: string
): Promise<SourceVideoManifest[]> {
  const root = videosRoot(libraryRoot);
  const manifests: SourceVideoManifest[] = [];

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return manifests;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      manifests.push(await readSourceVideoManifest(libraryRoot, entry.name));
    } catch {
      // Malformed manifests are reported by Doctor; lifecycle operations skip them.
    }
  }

  return manifests.sort(
    (left, right) =>
      numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
  );
}

function countByStatus(manifests: SourceVideoManifest[]): LibraryCounts {
  const counts: Record<PreprocessStatus, number> = {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };

  for (const manifest of manifests) {
    counts[manifest.preprocess_status] += 1;
  }

  return {
    video_count: manifests.length,
    ready_video_count: counts.ready,
    processing_video_count: counts.processing,
    queued_video_count: counts.queued,
    unprocessed_video_count: counts.unprocessed,
    failed_video_count: counts.failed,
    index_required_video_count: counts["index-required"]
  };
}

async function readLibraryMetadata(libraryRoot: string): Promise<LibraryManifestMetadata> {
  try {
    return JSON.parse(
      await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8")
    ) as LibraryManifestMetadata;
  } catch {
    return {};
  }
}

async function refreshLibraryCounts(libraryRoot: string, now: string): Promise<void> {
  const metadata = await readLibraryMetadata(libraryRoot);
  const manifests = await readAllSourceVideoManifests(libraryRoot);
  const libraryManifest = {
    library_id: metadata.library_id ?? "",
    name: metadata.name ?? "",
    version: metadata.version ?? "1.0",
    created_at: metadata.created_at ?? now,
    updated_at: now,
    source_root: metadata.source_root ?? "library://source-videos",
    preprocess_root: metadata.preprocess_root ?? "library://.mixlab-library",
    ...countByStatus(manifests)
  };

  await mkdir(path.join(libraryRoot, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(libraryRoot, ".mixlab-library", "library.json"),
    jsonBytes(libraryManifest)
  );
}

export async function claimNextPreprocessJob(
  input: ClaimNextPreprocessJobInput
): Promise<PreprocessJobSummary | null> {
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const manifest = manifests.find((candidate) => candidate.preprocess_status === "unprocessed");

  if (!manifest) {
    return null;
  }

  const existingJob = await readExistingJob(input.library_root, manifest.source_video_id);
  const nextAttempt = (existingJob?.attempt ?? 0) + 1;
  const job: PreprocessJobRecord = {
    source_video_id: manifest.source_video_id,
    worker_id: input.worker_id,
    status: "processing",
    attempt: nextAttempt,
    claimed_at: input.now
  };

  await writeSourceVideoManifest(input.library_root, {
    ...manifest,
    preprocess_status: "processing",
    visible_to_cutters: false
  });
  await writePreprocessJob(input.library_root, job);
  await refreshLibraryCounts(input.library_root, input.now);

  return {
    source_video_id: job.source_video_id,
    worker_id: job.worker_id,
    status: "processing",
    attempt: job.attempt,
    claimed_at: job.claimed_at
  };
}

export async function completePreprocessArtifacts(
  input: CompletePreprocessArtifactsInput
): Promise<void> {
  assertRequiredArtifactPaths({
    transcript_path: input.artifacts.transcript_path,
    srt_path: input.artifacts.srt_path
  });

  const manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);

  if (manifest.preprocess_status !== "processing") {
    throw new Error(
      `source video ${input.source_video_id} must be processing before completing artifacts`
    );
  }

  const nextManifest: SourceVideoManifest = {
    ...manifest,
    ...input.media,
    ...input.artifacts,
    preprocess_status: "index-required",
    visible_to_cutters: false
  };

  await writeSourceVideoManifest(input.library_root, nextManifest);

  const existingJob = await readExistingJob(input.library_root, input.source_video_id);
  await writePreprocessJob(input.library_root, {
    source_video_id: input.source_video_id,
    worker_id: existingJob?.worker_id ?? "",
    status: "index-required",
    attempt: existingJob?.attempt ?? 1,
    claimed_at: existingJob?.claimed_at ?? input.now,
    completed_at: input.now
  });
  await refreshLibraryCounts(input.library_root, input.now);
}

export async function failPreprocessJob(input: FailPreprocessJobInput): Promise<void> {
  const manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);

  if (manifest.preprocess_status !== "processing") {
    throw new Error(`source video ${input.source_video_id} must be processing before failing`);
  }

  await writeSourceVideoManifest(input.library_root, {
    ...manifest,
    preprocess_status: "failed",
    visible_to_cutters: false
  });

  const existingJob = await readExistingJob(input.library_root, input.source_video_id);
  await writePreprocessJob(input.library_root, {
    source_video_id: input.source_video_id,
    worker_id: existingJob?.worker_id ?? "",
    status: "failed",
    attempt: existingJob?.attempt ?? 1,
    claimed_at: existingJob?.claimed_at ?? input.now,
    failed_at: input.now,
    error_stage: input.error_stage,
    error_message: input.error_message
  });
  await refreshLibraryCounts(input.library_root, input.now);
}

function assertKeyframes(keyframesMs: number[]): void {
  if (keyframesMs.length === 0) {
    throw new Error("keyframes_ms must include at least one timestamp");
  }

  for (const keyframeMs of keyframesMs) {
    if (!Number.isInteger(keyframeMs) || keyframeMs < 0) {
      throw new Error("keyframes_ms must contain non-negative integer timestamps");
    }
  }
}

export async function completeReadyVisualArtifacts(
  input: CompleteReadyVisualArtifactsInput
): Promise<void> {
  if (input.cover_path.trim() === "") {
    throw new Error("cover_path is required before completing ready visual artifacts");
  }

  assertKeyframes(input.keyframes_ms);

  const manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);

  if (manifest.preprocess_status !== "index-required") {
    throw new Error(
      `source video ${input.source_video_id} must be index-required before visual artifact completion`
    );
  }

  const keyframesPath = `.mixlab-library/videos/${input.source_video_id}/keyframes.json`;
  await mkdir(path.dirname(path.join(input.library_root, keyframesPath)), { recursive: true });
  await writeFile(
    path.join(input.library_root, keyframesPath),
    jsonBytes({
      source_video_id: input.source_video_id,
      keyframes_ms: input.keyframes_ms
    }),
    "utf8"
  );
  await writeSourceVideoManifest(input.library_root, {
    ...manifest,
    cover_path: input.cover_path,
    keyframes_path: keyframesPath,
    preprocess_status: "index-required",
    visible_to_cutters: false
  });
  await refreshLibraryCounts(input.library_root, input.now);
}

export async function publishReadySourceVideo(
  input: PublishReadySourceVideoInput
): Promise<void> {
  if (input.index_version.trim() === "") {
    throw new Error("index_version is required before publishing a ready source video");
  }

  const manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);

  if (manifest.preprocess_status !== "index-required") {
    throw new Error(
      `source video ${input.source_video_id} must be index-required before ready publication`
    );
  }

  const nextManifest: SourceVideoManifest = {
    ...manifest,
    preprocess_status: "ready",
    visible_to_cutters: true
  };
  const validation = validateSourceVideoManifest(nextManifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  await writeSourceVideoManifest(input.library_root, nextManifest);

  const existingJob = await readExistingJob(input.library_root, input.source_video_id);
  await writePreprocessJob(input.library_root, {
    source_video_id: input.source_video_id,
    worker_id: existingJob?.worker_id ?? "",
    status: "ready",
    attempt: existingJob?.attempt ?? 1,
    claimed_at: existingJob?.claimed_at ?? input.now,
    completed_at: existingJob?.completed_at,
    indexed_at: input.now,
    index_version: input.index_version
  });
  await refreshLibraryCounts(input.library_root, input.now);
}
