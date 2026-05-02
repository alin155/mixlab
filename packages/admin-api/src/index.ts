import { createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  statfs,
  writeFile
} from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { runMixlabDoctor } from "../../doctor-core/src/index.ts";
import { resolveFfmpegRuntime } from "../../ffmpeg-core/src/index.ts";
import {
  approveCutterUser,
  disableCutterUser,
  listCutterUsers,
  publishIndexRequiredSourceVideos,
  readAdminSettings,
  readAllSourceVideoManifests,
  readUsageMetrics,
  scanSourceVideos
} from "../../library-fs/src/index.ts";
import {
  validateSourceVideoManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../protocol/src/index.ts";

export interface CreateAdminApiServerInput {
  library_root: string;
  library_id?: string;
  library_name?: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
}

interface LibraryManifest extends LibraryCounts {
  library_id?: string;
  name?: string;
  version?: string;
  created_at?: string;
  updated_at?: string;
}

interface PreprocessJobRecord {
  source_video_id: string;
  worker_id?: string;
  status: "processing" | "queued" | "index-required" | "ready" | "failed";
  attempt: number;
  claimed_at?: string;
  completed_at?: string;
  indexed_at?: string;
  index_version?: string;
  failed_at?: string;
  error_stage?: string;
  error_message?: string;
}

interface TranscriptArtifact {
  full_text?: string;
  segments?: TranscriptSegment[];
}

interface SourceVideoDetailTranscript {
  full_text: string;
  segment_count: number;
  character_count: number;
}

const STATUS_ORDER: PreprocessStatus[] = [
  "processing",
  "queued",
  "failed",
  "index-required",
  "ready",
  "unprocessed"
];

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function apiOk<T>(data: T) {
  return {
    ok: true,
    data
  };
}

function apiError(errorCode: string, message: string, details?: Record<string, unknown>) {
  return details ? { ok: false, error_code: errorCode, message, details } : { ok: false, error_code: errorCode, message };
}

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function sourceVideosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "source-videos");
}

function videosRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "videos");
}

function libraryManifestPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "library.json");
}

function sourceVideoManifestPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videosRoot(libraryRoot), sourceVideoId, "source-video.json");
}

function preprocessJobPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videosRoot(libraryRoot), sourceVideoId, "preprocess-job.json");
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT";
}

function safeRelativeArtifactPath(libraryRelativePath: string): string | null {
  const normalized = libraryRelativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return null;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return null;
  }

  return path.join(...parts);
}

function resolveVideoArtifactPath(input: {
  library_root: string;
  source_video_id: string;
  artifact_path: string;
  fallback_file_name?: string;
}): string | null {
  const artifactPath = input.artifact_path.trim();
  const libraryUriMatch = /^library:\/\/video\/(V\d{6})(?:\/(.*))?$/.exec(artifactPath);

  if (libraryUriMatch) {
    const uriSourceVideoId = libraryUriMatch[1] ?? "";
    if (uriSourceVideoId !== input.source_video_id) {
      return null;
    }

    const uriRelativePath = libraryUriMatch[2] || input.fallback_file_name || "";
    const safeUriRelativePath = safeRelativeArtifactPath(uriRelativePath);
    return safeUriRelativePath
      ? path.join(videosRoot(input.library_root), input.source_video_id, safeUriRelativePath)
      : null;
  }

  const safeArtifactPath = safeRelativeArtifactPath(artifactPath);
  if (safeArtifactPath) {
    return path.join(input.library_root, safeArtifactPath);
  }

  return input.fallback_file_name
    ? path.join(videosRoot(input.library_root), input.source_video_id, input.fallback_file_name)
    : null;
}

function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function directoryExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readLibraryManifest(libraryRoot: string): Promise<LibraryManifest | null> {
  try {
    return await readJsonFile<LibraryManifest>(libraryManifestPath(libraryRoot));
  } catch {
    return null;
  }
}

async function writeLibraryManifest(input: {
  library_root: string;
  library_id: string;
  library_name: string;
  now: string;
}): Promise<LibraryManifest> {
  const previous = await readLibraryManifest(input.library_root);
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const manifest: LibraryManifest = {
    library_id: previous?.library_id ?? input.library_id,
    name: previous?.name ?? input.library_name,
    version: previous?.version ?? "1.0",
    created_at: previous?.created_at ?? input.now,
    updated_at: input.now,
    ...countByStatus(manifests)
  };

  await mkdir(mixlabRoot(input.library_root), { recursive: true });
  await writeFile(libraryManifestPath(input.library_root), jsonBytes(manifest), "utf8");
  return manifest;
}

async function writeSourceVideoManifest(libraryRoot: string, manifest: SourceVideoManifest): Promise<void> {
  const validation = validateSourceVideoManifest(manifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  await mkdir(path.dirname(sourceVideoManifestPath(libraryRoot, manifest.source_video_id)), {
    recursive: true
  });
  await writeFile(sourceVideoManifestPath(libraryRoot, manifest.source_video_id), jsonBytes(manifest), "utf8");
}

async function readPreprocessJob(libraryRoot: string, sourceVideoId: string): Promise<PreprocessJobRecord | null> {
  try {
    return await readJsonFile<PreprocessJobRecord>(preprocessJobPath(libraryRoot, sourceVideoId));
  } catch {
    return null;
  }
}

async function writePreprocessJob(libraryRoot: string, job: PreprocessJobRecord): Promise<void> {
  await mkdir(path.dirname(preprocessJobPath(libraryRoot, job.source_video_id)), { recursive: true });
  await writeFile(preprocessJobPath(libraryRoot, job.source_video_id), jsonBytes(job), "utf8");
}

async function initializeLibrary(input: Required<Pick<CreateAdminApiServerInput, "library_root">> & {
  library_id: string;
  library_name: string;
  now: string;
}): Promise<LibraryManifest> {
  await mkdir(input.library_root, { recursive: true });
  await mkdir(sourceVideosRoot(input.library_root), { recursive: true });
  await mkdir(videosRoot(input.library_root), { recursive: true });
  await mkdir(path.join(mixlabRoot(input.library_root), "indexes", "source-transcript-index"), { recursive: true });
  return writeLibraryManifest(input);
}

function defaultCoverSvg(sourceVideoId: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23eef1f5"/><rect x="24" y="112" width="272" height="28" rx="5" fill="%23252b34"/><text x="36" y="132" font-family="Arial" font-size="17" fill="%23fff">${sourceVideoId}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

function adminCoverUrl(manifest: SourceVideoManifest): string {
  return manifest.cover_path ? `/api/admin/source-videos/${manifest.source_video_id}/cover` : defaultCoverSvg(manifest.source_video_id);
}

function fileNameFromRelativePath(relativePath: string): string {
  return path.basename(relativePath);
}

function toAdminSourceVideo(manifest: SourceVideoManifest) {
  return {
    source_video_id: manifest.source_video_id,
    title: manifest.title,
    file_name: fileNameFromRelativePath(manifest.relative_path),
    relative_path: manifest.relative_path,
    cover_url: adminCoverUrl(manifest),
    duration_ms: manifest.duration_ms,
    file_size: manifest.file_size,
    preprocess_status: manifest.preprocess_status,
    visible_to_cutters: manifest.visible_to_cutters,
    tags: manifest.tags ?? [],
    description: manifest.description ?? "",
    lecturer: manifest.lecturer ?? "",
    course: manifest.course ?? "",
    category: manifest.category ?? "",
    updated_at: "",
    ...(manifest.preprocess_status === "failed" ? { error_stage: "", error_message: "" } : {})
  };
}

async function diskUsage(libraryRoot: string): Promise<{ total: number; available: number }> {
  try {
    const stats = await statfs(libraryRoot);
    return {
      total: Number(stats.blocks) * Number(stats.bsize),
      available: Number(stats.bavail) * Number(stats.bsize)
    };
  } catch {
    return {
      total: 0,
      available: 0
    };
  }
}

async function readCurrentIndexVersion(libraryRoot: string): Promise<string> {
  try {
    const pointer = await readJsonFile<{ current_version: string }>(
      path.join(mixlabRoot(libraryRoot), "indexes", "source-transcript-index", "current.json")
    );
    return pointer.current_version;
  } catch {
    return "";
  }
}

function indexStatus(input: {
  current_version: string;
  ready_video_count: number;
  index_required_video_count: number;
}) {
  if (input.index_required_video_count > 0) {
    return "needs-publish" as const;
  }

  if (input.ready_video_count > 0 && !input.current_version) {
    return "error" as const;
  }

  return "ready" as const;
}

async function readTranscriptSummary(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<SourceVideoDetailTranscript> {
  if (!manifest.transcript_path.trim()) {
    return { full_text: "", segment_count: 0, character_count: 0 };
  }

  const transcriptPath = resolveVideoArtifactPath({
    library_root: libraryRoot,
    source_video_id: manifest.source_video_id,
    artifact_path: manifest.transcript_path,
    fallback_file_name: "transcript.json"
  });

  if (!transcriptPath) {
    return { full_text: "", segment_count: 0, character_count: 0 };
  }

  let artifact: TranscriptArtifact;
  try {
    artifact = await readJsonFile<TranscriptArtifact>(transcriptPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return { full_text: "", segment_count: 0, character_count: 0 };
    }

    throw error;
  }

  const segments = Array.isArray(artifact.segments) ? artifact.segments : [];
  const joinedSegmentText = segments
    .map((segment) => typeof segment.text === "string" ? segment.text : "")
    .join("");
  const fullText = typeof artifact.full_text === "string" ? artifact.full_text : joinedSegmentText;

  return {
    full_text: fullText,
    segment_count: segments.length,
    character_count: fullText.length
  };
}

async function getLibraryStatus(input: CreateAdminApiServerInput) {
  const now = input.now?.() ?? new Date().toISOString();
  const library = await readLibraryManifest(input.library_root);
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const counts = library ?? countByStatus(manifests);
  const currentVersion = await readCurrentIndexVersion(input.library_root);
  const disk = await diskUsage(input.library_root);
  const activeManifest = manifests.find((manifest) => manifest.preprocess_status === "processing");

  return {
    library_id: library?.library_id ?? input.library_id ?? "lib_main_001",
    name: library?.name ?? input.library_name ?? "MixLab 公共素材库",
    root_path: input.library_root,
    source_videos_path: sourceVideosRoot(input.library_root),
    mixlab_library_path: mixlabRoot(input.library_root),
    protocol_version: library?.version ?? "1.0",
    ...counts,
    disk_total_bytes: disk.total,
    disk_available_bytes: disk.available,
    index_status: indexStatus({
      current_version: currentVersion,
      ready_video_count: counts.ready_video_count,
      index_required_video_count: counts.index_required_video_count
    }),
    current_index_version: currentVersion,
    active_task_label: activeManifest ? `${activeManifest.source_video_id} - processing` : "无正在处理任务",
    updated_at: library?.updated_at ?? now
  };
}

async function getDashboardMetrics(input: CreateAdminApiServerInput) {
  const now = input.now?.() ?? new Date().toISOString();
  const today = now.slice(0, 10);
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const counts = countByStatus(manifests);
  const currentIndexVersion = await readCurrentIndexVersion(input.library_root);
  let characterCount = 0;
  let segmentCount = 0;
  let transcriptVideoCount = 0;
  let completedTodayCount = 0;
  let failedTodayCount = 0;
  const processDurations: number[] = [];
  let queuedOrRunningCount = 0;

  for (const manifest of manifests) {
    if (manifest.preprocess_status === "queued" || manifest.preprocess_status === "processing") {
      queuedOrRunningCount += 1;
    }

    const transcript = await readTranscriptSummary(input.library_root, manifest);
    if (transcript.segment_count > 0 || transcript.full_text.length > 0) {
      transcriptVideoCount += 1;
      characterCount += transcript.character_count;
      segmentCount += transcript.segment_count;
    }

    const job = await readPreprocessJob(input.library_root, manifest.source_video_id);
    const completedAt = job?.completed_at ?? job?.indexed_at ?? "";
    if (completedAt.startsWith(today) || (job?.indexed_at ?? "").startsWith(today)) {
      completedTodayCount += 1;
    }
    if ((job?.failed_at ?? "").startsWith(today)) {
      failedTodayCount += 1;
    }

    const startedMs = Date.parse(job?.claimed_at ?? "");
    const finishedMs = Date.parse(job?.indexed_at ?? job?.completed_at ?? "");
    if (Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs >= startedMs) {
      processDurations.push(finishedMs - startedMs);
    }
  }

  const averageVideoProcessMs = processDurations.length > 0
    ? Math.round(processDurations.reduce((total, value) => total + value, 0) / processDurations.length)
    : 0;
  const estimatedQueueDoneAt = averageVideoProcessMs > 0 && queuedOrRunningCount > 0
    ? new Date(Date.parse(now) + queuedOrRunningCount * averageVideoProcessMs).toISOString()
    : "";

  return {
    material: {
      video_count: counts.video_count,
      ready_video_count: counts.ready_video_count,
      total_duration_ms: manifests.reduce((total, manifest) => total + manifest.duration_ms, 0),
      ready_duration_ms: manifests
        .filter((manifest) => manifest.preprocess_status === "ready")
        .reduce((total, manifest) => total + manifest.duration_ms, 0),
      unprocessed_duration_ms: manifests
        .filter((manifest) => manifest.preprocess_status === "unprocessed")
        .reduce((total, manifest) => total + manifest.duration_ms, 0),
      total_size_bytes: manifests.reduce((total, manifest) => total + manifest.file_size, 0)
    },
    transcript: {
      transcript_video_count: transcriptVideoCount,
      character_count: characterCount,
      segment_count: segmentCount,
      current_index_version: currentIndexVersion
    },
    production: {
      completed_today_count: completedTodayCount,
      failed_today_count: failedTodayCount,
      average_video_process_ms: averageVideoProcessMs,
      estimated_queue_done_at: estimatedQueueDoneAt
    },
    usage: await readUsageMetrics(input.library_root),
    risk: {
      failed_video_count: counts.failed_video_count,
      index_required_video_count: counts.index_required_video_count
    }
  };
}

async function pathChecks(libraryRoot: string) {
  return [
    {
      label: "公共素材库",
      path: libraryRoot,
      status: (await directoryExists(libraryRoot)) ? "pass" : "fail",
      message: (await directoryExists(libraryRoot)) ? "根路径可访问" : "根路径不存在"
    },
    {
      label: "source-videos",
      path: sourceVideosRoot(libraryRoot),
      status: (await directoryExists(sourceVideosRoot(libraryRoot))) ? "pass" : "fail",
      message: (await directoryExists(sourceVideosRoot(libraryRoot))) ? "原视频目录可读" : "原视频目录不存在"
    },
    {
      label: ".mixlab-library",
      path: mixlabRoot(libraryRoot),
      status: (await directoryExists(mixlabRoot(libraryRoot))) ? "pass" : "warn",
      message: (await directoryExists(mixlabRoot(libraryRoot))) ? "协议目录存在" : "尚未初始化协议目录"
    },
    {
      label: "library.json",
      path: libraryManifestPath(libraryRoot),
      status: (await fileExists(libraryManifestPath(libraryRoot))) ? "pass" : "warn",
      message: (await fileExists(libraryManifestPath(libraryRoot))) ? "library.json 可读" : "library.json 尚未创建"
    }
  ];
}

function jobStatusFromManifest(status: PreprocessStatus): "running" | "queued" | "done" | "failed" {
  if (status === "processing") {
    return "running";
  }

  if (status === "queued" || status === "unprocessed") {
    return "queued";
  }

  if (status === "failed") {
    return "failed";
  }

  return "done";
}

function jobStageFromManifest(manifest: SourceVideoManifest, job: PreprocessJobRecord | null): string {
  if (job?.error_stage) {
    return job.error_stage;
  }

  if (manifest.preprocess_status === "index-required") {
    return "build-index";
  }

  if (manifest.preprocess_status === "ready") {
    return "publish-ready";
  }

  if (manifest.preprocess_status === "queued") {
    return "extract-audio";
  }

  return manifest.preprocess_status;
}

async function listPreprocessJobs(libraryRoot: string) {
  const manifests = await readAllSourceVideoManifests(libraryRoot);
  const jobs = [];

  for (const manifest of manifests) {
    if (manifest.preprocess_status === "unprocessed") {
      continue;
    }

    const job = await readPreprocessJob(libraryRoot, manifest.source_video_id);
    const status = jobStatusFromManifest(manifest.preprocess_status);

    jobs.push({
      job_id: `J${manifest.source_video_id.slice(1)}`,
      source_video_id: manifest.source_video_id,
      title: manifest.title,
      status,
      stage: jobStageFromManifest(manifest, job),
      progress: status === "done" ? 100 : status === "running" ? 50 : 0,
      started_at: job?.claimed_at,
      completed_at: job?.completed_at ?? job?.indexed_at,
      failed_at: job?.failed_at,
      elapsed_ms: 0,
      log_path: `.mixlab-library/logs/${manifest.source_video_id}.log`,
      retryable: status === "failed",
      error_message: job?.error_message
    });
  }

  const ordered = jobs.sort((left, right) => {
    const leftStatus = STATUS_ORDER.indexOf(
      (left.status === "running" ? "processing" : left.status === "done" ? "ready" : left.status) as PreprocessStatus
    );
    const rightStatus = STATUS_ORDER.indexOf(
      (right.status === "running" ? "processing" : right.status === "done" ? "ready" : right.status) as PreprocessStatus
    );

    return leftStatus - rightStatus || numericSourceVideoId(right.source_video_id) - numericSourceVideoId(left.source_video_id);
  });

  return {
    active_count: ordered.filter((job) => job.status === "running").length,
    queued_count: ordered.filter((job) => job.status === "queued").length,
    completed_count: ordered.filter((job) => job.status === "done").length,
    failed_count: ordered.filter((job) => job.status === "failed").length,
    jobs: ordered
  };
}

function visibilityDetail(manifest: SourceVideoManifest) {
  const visible = manifest.preprocess_status === "ready" && manifest.visible_to_cutters;

  return {
    visible_to_cutters: visible,
    label: visible ? "剪辑师可见" : "剪辑师暂不可见",
    reason: visible
      ? ""
      : manifest.preprocess_status !== "ready"
        ? "视频尚未完成预处理"
        : "管理员尚未开放给剪辑师"
  };
}

function toAdminApproveCutterUserResponse(result: Awaited<ReturnType<typeof approveCutterUser>>) {
  return {
    status: result.status,
    user: result.user,
    session: {
      user_id: result.session.user_id,
      device_id: result.session.device_id,
      created_at: result.session.created_at,
      last_seen_at: result.session.last_seen_at
    }
  };
}

async function artifactDetail(input: {
  library_root: string;
  source_video_id: string;
  artifact_path: string;
  fallback_file_name?: string;
}) {
  const filePath = input.artifact_path.trim()
    ? resolveVideoArtifactPath(input)
    : null;

  return {
    path: input.artifact_path,
    file_path: filePath ?? "",
    exists: filePath ? await fileExists(filePath) : false
  };
}

async function getSourceVideoDetail(libraryRoot: string, sourceVideoId: string) {
  const manifests = await readAllSourceVideoManifests(libraryRoot);
  const manifest = manifests.find((candidate) => candidate.source_video_id === sourceVideoId);

  if (!manifest) {
    return null;
  }

  const job = await readPreprocessJob(libraryRoot, sourceVideoId);
  const transcript = await readTranscriptSummary(libraryRoot, manifest);

  return {
    source_video: toAdminSourceVideo(manifest),
    technical: {
      duration_ms: manifest.duration_ms,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
      codec: manifest.codec,
      file_size: manifest.file_size,
      content_hash: manifest.content_hash,
      relative_path: manifest.relative_path
    },
    visibility: visibilityDetail(manifest),
    preprocess: {
      status: manifest.preprocess_status,
      job_id: `J${manifest.source_video_id.slice(1)}`,
      stage: jobStageFromManifest(manifest, job),
      attempt: job?.attempt ?? 0,
      started_at: job?.claimed_at ?? "",
      completed_at: job?.completed_at ?? job?.indexed_at ?? "",
      failed_at: job?.failed_at ?? "",
      error_stage: job?.error_stage ?? "",
      error_message: job?.error_message ?? ""
    },
    artifacts: {
      transcript: await artifactDetail({
        library_root: libraryRoot,
        source_video_id: sourceVideoId,
        artifact_path: manifest.transcript_path,
        fallback_file_name: "transcript.json"
      }),
      subtitles: await artifactDetail({
        library_root: libraryRoot,
        source_video_id: sourceVideoId,
        artifact_path: manifest.srt_path,
        fallback_file_name: "subtitles.srt"
      }),
      cover: await artifactDetail({
        library_root: libraryRoot,
        source_video_id: sourceVideoId,
        artifact_path: manifest.cover_path,
        fallback_file_name: "cover.jpg"
      }),
      keyframes: await artifactDetail({
        library_root: libraryRoot,
        source_video_id: sourceVideoId,
        artifact_path: manifest.keyframes_path,
        fallback_file_name: "keyframes.json"
      }),
      index_version: job?.index_version ?? ""
    },
    transcript
  };
}

async function listIndexVersions(libraryRoot: string) {
  const root = path.join(mixlabRoot(libraryRoot), "indexes", "source-transcript-index");
  const currentVersion = await readCurrentIndexVersion(libraryRoot);
  const versions = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^v\d{6}$/.test(entry.name)) {
        continue;
      }

      let manifest: { created_at?: string; ready_video_count?: number; schema_version?: string } = {};
      try {
        manifest = await readJsonFile(path.join(root, entry.name, "index-manifest.json"));
      } catch {
        // Surface malformed versions as failed rows.
      }

      versions.push({
        index_version: entry.name,
        created_at: manifest.created_at ?? "",
        ready_video_count: manifest.ready_video_count ?? 0,
        schema_version: manifest.schema_version ?? "1.0",
        validation_status: (await fileExists(path.join(root, entry.name, "index.sqlite"))) ? "pass" : "fail",
        is_current: entry.name === currentVersion,
        published_by: "admin"
      });
    }
  } catch {
    // No index yet.
  }

  return {
    current_version: currentVersion,
    versions: versions.sort((left, right) => right.index_version.localeCompare(left.index_version))
  };
}

function runtimeSource(source: string): "bundled" | "custom" | "path" | "missing" {
  if (source.includes("bundled")) {
    return "bundled";
  }

  return source === "path" || source === "custom" ? source : "path";
}

function runtimeVersion(executablePath: string): string {
  const result = spawnSync(executablePath, ["-version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.split("\n")[0] ?? "available" : "available";
}

function getRuntimeSettings(env: NodeJS.ProcessEnv) {
  try {
    const runtime = resolveFfmpegRuntime();
    return {
      ffmpeg: {
        available: true,
        source: runtimeSource(runtime.source),
        version: runtimeVersion(runtime.ffmpeg_path),
        last_error: ""
      },
      ffprobe: {
        available: true,
        source: runtimeSource(runtime.source),
        version: runtimeVersion(runtime.ffprobe_path),
        last_error: ""
      },
      asr: {
        provider: "dashscope" as const,
        provider_label: "阿里云百炼 / DashScope",
        model: env.MIXLAB_ASR_MODEL || "paraformer-v2",
        audio_mode: (env.MIXLAB_PREPROCESS_AUDIO_MODE || "mp3_16k_mono_64k") as "mp3_16k_mono_64k",
        dashscope_api_key_configured: Boolean(env.DASHSCOPE_API_KEY?.trim()),
        language_hints: ["zh"],
        speaker_diarization_enabled: false,
        object_storage_mode: "dashscope-temporary" as const,
        last_failure_reason: ""
      }
    };
  } catch (error) {
    return {
      ffmpeg: {
        available: false,
        source: "missing" as const,
        version: "",
        last_error: (error as Error).message
      },
      ffprobe: {
        available: false,
        source: "missing" as const,
        version: "",
        last_error: (error as Error).message
      },
      asr: {
        provider: "dashscope" as const,
        provider_label: "阿里云百炼 / DashScope",
        model: env.MIXLAB_ASR_MODEL || "paraformer-v2",
        audio_mode: (env.MIXLAB_PREPROCESS_AUDIO_MODE || "mp3_16k_mono_64k") as "mp3_16k_mono_64k",
        dashscope_api_key_configured: Boolean(env.DASHSCOPE_API_KEY?.trim()),
        language_hints: ["zh"],
        speaker_diarization_enabled: false,
        object_storage_mode: "dashscope-temporary" as const,
        last_failure_reason: ""
      }
    };
  }
}

async function transitionManifests(input: {
  library_root: string;
  from: PreprocessStatus[];
  to: PreprocessStatus;
  now: string;
  reason: string;
}): Promise<{ affected_count: number; source_video_ids: string[] }> {
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const affected = manifests.filter((manifest) => input.from.includes(manifest.preprocess_status));

  for (const manifest of affected) {
    await writeSourceVideoManifest(input.library_root, {
      ...manifest,
      preprocess_status: input.to,
      visible_to_cutters: false
    });
    await writePreprocessJob(input.library_root, {
      source_video_id: manifest.source_video_id,
      status: input.to === "queued" ? "queued" : "processing",
      attempt: ((await readPreprocessJob(input.library_root, manifest.source_video_id))?.attempt ?? 0) + 1,
      claimed_at: input.now,
      worker_id: "admin",
      ...(input.reason ? { error_stage: input.reason } : {})
    });
  }

  return {
    affected_count: affected.length,
    source_video_ids: affected.map((manifest) => manifest.source_video_id)
  };
}

function cleanOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : undefined;
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function writeNoContent(response: ServerResponse): void {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  response.end();
}

async function writeCover(response: ServerResponse, input: CreateAdminApiServerInput, sourceVideoId: string): Promise<void> {
  const manifest = (await readAllSourceVideoManifests(input.library_root)).find(
    (candidate) => candidate.source_video_id === sourceVideoId
  );

  if (!manifest?.cover_path) {
    writeJson(response, 404, apiError("not_found", "封面不存在"));
    return;
  }

  const coverPath = resolveVideoArtifactPath({
    library_root: input.library_root,
    source_video_id: sourceVideoId,
    artifact_path: manifest.cover_path,
    fallback_file_name: "cover.jpg"
  });

  if (!coverPath || !(await fileExists(coverPath))) {
    writeJson(response, 404, apiError("not_found", "封面不存在"));
    return;
  }

  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "image/jpeg"
  });
  createReadStream(coverPath).pipe(response);
}

export function createAdminApiServer(input: CreateAdminApiServerInput): Server {
  const libraryId = input.library_id ?? "lib_main_001";
  const libraryName = input.library_name ?? "MixLab 公共素材库";
  const env = input.env ?? process.env;
  const now = () => input.now?.() ?? new Date().toISOString();

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

      if (request.method === "OPTIONS") {
        writeNoContent(response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/library/status") {
        writeJson(response, 200, apiOk(await getLibraryStatus(input)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/library/path-checks") {
        writeJson(response, 200, apiOk(await pathChecks(input.library_root)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/settings/config") {
        writeJson(response, 200, apiOk(await readAdminSettings(input.library_root)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/dashboard/metrics") {
        writeJson(response, 200, apiOk(await getDashboardMetrics(input)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/source-videos") {
        const manifests = await readAllSourceVideoManifests(input.library_root);
        writeJson(response, 200, apiOk(manifests.map(toAdminSourceVideo)));
        return;
      }

      const sourceVideoDetailMatch = /^\/api\/admin\/source-videos\/(V\d{6})$/.exec(url.pathname);
      if (request.method === "GET" && sourceVideoDetailMatch) {
        const detail = await getSourceVideoDetail(input.library_root, sourceVideoDetailMatch[1] ?? "");

        if (!detail) {
          writeJson(response, 404, apiError("not_found", "原视频不存在"));
          return;
        }

        writeJson(response, 200, apiOk(detail));
        return;
      }

      const coverMatch = /^\/api\/admin\/source-videos\/(V\d{6})\/cover$/.exec(url.pathname);
      if (request.method === "GET" && coverMatch) {
        await writeCover(response, input, coverMatch[1] ?? "");
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/cutter-users") {
        writeJson(response, 200, apiOk(await listCutterUsers(input.library_root)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/preprocess/jobs") {
        writeJson(response, 200, apiOk(await listPreprocessJobs(input.library_root)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/index/versions") {
        writeJson(response, 200, apiOk(await listIndexVersions(input.library_root)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/doctor/report") {
        writeJson(response, 200, apiOk(await runMixlabDoctor({
          library_root: input.library_root,
          now: now(),
          env
        })));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/settings/runtime") {
        writeJson(response, 200, apiOk(getRuntimeSettings(env)));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/library/init") {
        writeJson(response, 200, apiOk(await initializeLibrary({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/library/scan") {
        await initializeLibrary({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk(await scanSourceVideos({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/preprocess/queue-unprocessed") {
        const result = await transitionManifests({
          library_root: input.library_root,
          from: ["unprocessed"],
          to: "queued",
          now: now(),
          reason: "queued-by-admin"
        });
        await writeLibraryManifest({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk(result));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/preprocess/retry-failed") {
        const result = await transitionManifests({
          library_root: input.library_root,
          from: ["failed"],
          to: "queued",
          now: now(),
          reason: "retry-by-admin"
        });
        await writeLibraryManifest({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk(result));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/index/repair") {
        writeJson(response, 200, apiOk(await publishIndexRequiredSourceVideos({
          library_root: input.library_root,
          library_id: libraryId,
          now: now()
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/doctor/run") {
        writeJson(response, 200, apiOk(await runMixlabDoctor({
          library_root: input.library_root,
          now: now(),
          env
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/settings/test-asr") {
        writeJson(response, 200, apiOk({
          passed: Boolean(env.DASHSCOPE_API_KEY?.trim()),
          message: env.DASHSCOPE_API_KEY?.trim()
            ? "DashScope API Key 已配置，未执行真实音频提交。"
            : "DashScope API Key 未配置。"
        }));
        return;
      }

      const approveCutterUserMatch = /^\/api\/admin\/cutter-users\/(CU\d+)\/approve$/.exec(url.pathname);
      if (request.method === "POST" && approveCutterUserMatch) {
        try {
          const result = await approveCutterUser(input.library_root, {
            user_id: approveCutterUserMatch[1] ?? "",
            now: now()
          });
          writeJson(response, 200, apiOk(toAdminApproveCutterUserResponse(result)));
        } catch (error) {
          const message = (error as Error).message;
          if (!["剪辑师用户不存在", "只有待审核剪辑师用户可以通过审核", "剪辑师设备不存在"].includes(message)) {
            throw error;
          }
          writeJson(
            response,
            message === "剪辑师用户不存在" ? 404 : 400,
            apiError(message === "剪辑师用户不存在" ? "not_found" : "invalid_request", message)
          );
        }
        return;
      }

      const disableCutterUserMatch = /^\/api\/admin\/cutter-users\/(CU\d+)\/disable$/.exec(url.pathname);
      if (request.method === "POST" && disableCutterUserMatch) {
        try {
          writeJson(response, 200, apiOk(await disableCutterUser(input.library_root, {
            user_id: disableCutterUserMatch[1] ?? "",
            now: now()
          })));
        } catch (error) {
          const message = (error as Error).message;
          if (message !== "剪辑师用户不存在") {
            throw error;
          }
          writeJson(
            response,
            message === "剪辑师用户不存在" ? 404 : 400,
            apiError(message === "剪辑师用户不存在" ? "not_found" : "invalid_request", message)
          );
        }
        return;
      }

      const metadataMatch = /^\/api\/admin\/source-videos\/(V\d{6})\/metadata$/.exec(url.pathname);
      if (request.method === "PATCH" && metadataMatch) {
        const sourceVideoId = metadataMatch[1] ?? "";
        const body = (await readRequestJson(request)) as Record<string, unknown>;
        const manifest = (await readAllSourceVideoManifests(input.library_root)).find(
          (candidate) => candidate.source_video_id === sourceVideoId
        );

        if (!manifest) {
          writeJson(response, 404, apiError("not_found", "原视频不存在"));
          return;
        }

        const updated: SourceVideoManifest = {
          ...manifest,
          title: cleanOptionalText(body.title) ?? manifest.title,
          description: cleanOptionalText(body.description),
          lecturer: cleanOptionalText(body.lecturer),
          course: cleanOptionalText(body.course),
          category: cleanOptionalText(body.category),
          tags: cleanTags(body.tags)
        };

        await writeSourceVideoManifest(input.library_root, updated);
        writeJson(response, 200, apiOk(toAdminSourceVideo(updated)));
        return;
      }

      writeJson(response, 404, apiError("not_found", "路由不存在"));
    } catch (error) {
      writeJson(response, 500, apiError("internal_error", (error as Error).message));
    }
  });
}
