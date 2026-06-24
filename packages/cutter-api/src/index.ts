import { constants, createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildFfprobeSourceMetadataPlan,
  buildFfmpegCoverImagePlan,
  buildFfmpegCutPlan,
  parseFfprobeSourceMetadata,
  resolveFfmpegRuntime,
  type SourceVideoMediaMetadata,
  type CutMode
} from "../../ffmpeg-core/src/index.ts";
import {
  allocateNextLocalClipId,
  appendUsageEvent,
  buildLocalClipArtifactPaths,
  changeCutterAccountPassword,
  createCutterLoginApplication,
  ensureCutterSessionForDevice,
  getCutterSourceVideoDetail,
  listCutterSourceFolders,
  getLocalClipDetail,
  listCutterSourceLibrary,
  listLocalClips,
  loginCutterAccount,
  logoutCutterSession,
  publicCutterUser,
  registerCutterAccount,
  searchCutterSourceLibrary,
  readFastLocalCutterReleaseCacheStatus,
  readLocalCutterReleaseCacheStatus,
  syncCutterReleaseCache,
  writeLocalClipManifest,
  validateCutterSession,
  type CutterUserRecord,
  type CutterReleaseCacheStatus,
  type SyncCutterReleaseCacheInput,
  type SyncCutterReleaseCacheResult,
  type CutterSourceLibrarySearchGroup,
  type CutterSourceLibrarySearchResult,
  type CutterSourceFolderOption,
  type CutterSourceVideoCard,
  type CutterSourceVideoDetail,
  type LocalClipView
} from "../../library-fs/src/index.ts";
import {
  buildProjectClipOutputFile,
  getExportClipDetail,
  deleteProjectOutputs,
  exportClipsDirectory,
  listClipLists,
  listCutJobs,
  readCutTempCacheStatus,
  listExportClips,
  readClipList,
  retryCutJob,
  runCutJob,
  runNextCutJob,
  submitClipListToQueue,
  writeClipList,
  type ClipListManifest,
  type CutJobSourceDetail,
  type CoverRunner,
  type ExportClipView,
  type RunNextCutJobInput,
  type CutTempCacheStatus,
  type WriteClipListItemInput
} from "../../cutter-local/src/index.ts";
import {
  createSegmentSpanSelection,
  resolveSourceVideoPath,
  type TranscriptSegment
} from "../../protocol/src/index.ts";

export interface CreateCutterApiServerInput {
  library_root: string;
  workspace_root?: string;
  release_cache_root?: string;
  release_cache_max_releases?: number;
  thumbnail_cache_max_bytes?: number;
  cut_temp_max_bytes?: number;
  source_video_cache_max_bytes?: number;
  source_video_cache_cut_wait_ms?: number;
  source_video_cache_copy_file?: (source_path: string, output_path: string) => Promise<void>;
  searchd_cache_root?: string;
  release_sync_timeout_ms?: number;
  searchd_base_url?: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
  release_cache_status_reader?: (input: {
    cache_root: string;
    max_cached_releases?: number;
    include_cache_size?: boolean;
  }) => Promise<CutterReleaseCacheStatus>;
  library_id_reader?: (library_root: string) => Promise<string>;
  search_index_warmup_runner?: (input: {
    library_root: string;
    release_root: string;
    query: string;
    limit: number;
  }) => Promise<{
    index_version: string;
    returned_count: number;
    search_ms: number;
  }>;
  release_cache_sync_runner?: (
    input: SyncCutterReleaseCacheInput
  ) => Promise<SyncCutterReleaseCacheResult>;
  usage_event_recorder?: CutterUsageEventRecorder;
  auth_mode?: "reviewed" | "local_trusted";
  trusted_user_id?: string;
  trusted_username?: string;
  now?: () => string;
  cut_runner?: CutterClipCutRunner;
  cover_runner?: CoverRunner;
  source_video_probe_runner?: CutterSourceVideoProbeRunner;
  open_path?: CutterPathOpener;
  auto_run_cut_queue?: boolean;
}

export interface CutterApiRuntimeConfig extends CreateCutterApiServerInput {
  host: string;
  port: number;
}

export type CutterAuthMode = "reviewed" | "local_trusted";

export interface CutterApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

interface ApiSourceVideoUrls {
  detail_url: string;
  media_url: string;
  cover_url: string;
  subtitles_url: string;
}

type ApiSourceVideoCard = CutterSourceVideoCard & ApiSourceVideoUrls;
type ApiSourceVideoDetail = CutterSourceVideoDetail & ApiSourceVideoUrls;
type ApiSearchGroup = CutterSourceLibrarySearchGroup & ApiSourceVideoUrls;

const SOURCE_VIDEO_ID_PATTERN = /^V\d{6}$/;
const LOCAL_CLIP_ID_PATTERN = /^(?:LC|E)\d{6}$/;
const CUT_JOB_ID_PATTERN = /^CJ\d{8}-\d{4}$/;

export interface CutterClipCutRunnerInput {
  source_video_path: string;
  output_path: string;
  begin_ms: number;
  end_ms: number;
  cut_mode: CutMode;
}

export type CutterClipCutRunner = (input: CutterClipCutRunnerInput) => Promise<void> | void;
export type CutterPathOpener = (targetPath: string) => Promise<void> | void;
export type CutterSourceVideoProbeRunner = (
  input: { source_video_path: string; timeout_ms: number }
) => Promise<SourceVideoMediaMetadata>;

export type CutterUsageEventRecorder = (
  libraryRoot: string,
  event: Parameters<typeof appendUsageEvent>[1]
) => Promise<void> | void;

interface CreateLocalClipRequestBody {
  source_video_id?: unknown;
  start_segment_id?: unknown;
  end_segment_id?: unknown;
  begin_ms?: unknown;
  end_ms?: unknown;
  selected_text?: unknown;
  pre_roll_ms?: unknown;
  post_roll_ms?: unknown;
  cut_mode?: unknown;
  title?: unknown;
}

interface CreateClipListRequestBody {
  library_id?: unknown;
  project_id?: unknown;
  title?: unknown;
  items?: unknown;
}

interface SubmitCutJobsRequestBody {
  clip_list_id?: unknown;
}

interface OpenExportDirectoryRequestBody {
  project_id?: unknown;
  project_title?: unknown;
  open?: unknown;
}

interface LocalClipSelection {
  source_video_id: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  pre_roll_ms: number;
  post_roll_ms: number;
  selected_text: string;
}

export interface OpenPathCommandPlan {
  command: string;
  args: string[];
}

interface CutterLoginRequestBody {
  username?: unknown;
  password?: unknown;
  device_id?: unknown;
  device_name?: unknown;
}

interface CutterPasswordChangeRequestBody {
  current_password?: unknown;
  new_password?: unknown;
}

interface AuthenticatedCutterSession {
  user: CutterUserRecord;
  device_id: string;
}

interface CutterRuntimeStatusPayload {
  mode: "api";
  mode_label: string;
  api_ready: boolean;
  generated_at: string;
  library_id: string;
  library_root_label: string;
  library_root_path: string;
  available_video_count: number;
  workspace_enabled: boolean;
  workspace_root_label: string;
  workspace_root_path: string;
  local_clip_count: number;
  ffmpeg_status: "可用" | "不可用";
  ffmpeg_source: "内置" | "环境配置" | "未检测到";
  local_runtime: {
    cpu_usage_percent: number;
    disk_io_bytes_per_second?: number;
  };
  search_backend: CutterSearchBackendStatus;
  release_cache: CutterReleaseCacheRuntimeStatus;
  local_cache: CutterLocalCacheRuntimeStatus;
  source_video_preflight: CutterSourceVideoPreflightStatus;
  current_user: {
    user_id: string;
    username: string;
    display_name: string;
  };
  diagnostics?: {
    runtime_timings_ms: Record<string, number>;
    search_index_warmup?: SearchIndexWarmupStatus;
  };
}

interface SearchIndexWarmupStatus {
  status: "idle" | "warming" | "ready" | "failed";
  release_version: string;
  query: string;
  index_version: string;
  returned_count: number;
  search_ms: number;
  warmed_at: string;
  error?: string;
}

interface CutterLocalCacheRuntimeStatus {
  cache_root_path: string;
  searchd_cache_root_path: string;
  searchd_cache_size_bytes: number;
  thumbnail_cache_root_path: string;
  thumbnail_cache_manifest_path: string;
  thumbnail_cache_size_bytes: number;
  thumbnail_cache_max_bytes: number;
  thumbnail_cache_manifest_entry_count: number;
  thumbnail_cache_checksum_entry_count: number;
  source_video_cache: CutterSourceVideoCacheStatus;
  cut_temp_cache: CutTempCacheStatus;
}

interface CutterSourceVideoCacheStatus {
  cache_root_path: string;
  max_bytes: number;
  size_bytes: number;
  file_count: number;
  cached_video_count: number;
  active_prefetch_count: number;
  last_error?: string;
}

interface CutterSourceVideoMediaProbe {
  checked: boolean;
  ok: boolean;
  duration_ms?: number;
  width?: number;
  height?: number;
  codec?: string;
  reason: string;
}

interface CutterSourceVideoPreflightSample {
  source_video_id: string;
  title: string;
  source_video_file_path: string;
  readable: boolean;
  file_size?: number;
  media_probe: CutterSourceVideoMediaProbe;
  reason: string;
}

interface CutterSourceVideoPreflightStatus {
  status: "ready" | "checking" | "blocked" | "unavailable";
  checked_count: number;
  readable_count: number;
  probe_count: number;
  probe_readable_count: number;
  sample_count: number;
  samples: CutterSourceVideoPreflightSample[];
  message: string;
}

interface CutterReleaseCacheRuntimeStatus {
  enabled: boolean;
  ready: boolean;
  sync_status: "ready" | "syncing" | "unavailable" | "failed";
  active_release_version: string;
  source_release_version: string;
  search_index_version: string;
  ready_video_count: number;
  cached_release_versions: string[];
  cached_release_count: number;
  max_cached_releases: number;
  cache_size_bytes: number;
  pruned_release_versions: string[];
  cache_root_path: string;
  catalog_file_path: string;
  message: string;
}

interface CutterSearchBackendStatus {
  mode: "searchd" | "sqlite-index" | "transcript-artifact-fallback";
  preferred_mode: "searchd" | "sqlite-index" | "transcript-artifact-fallback";
  label: string;
  healthy: boolean;
  degraded: boolean;
  index_version: string;
  source_video_count: number;
  segment_count: number;
  response_ms?: number;
  message: string;
  last_error?: string;
}

function delayedFallback<T>(promise: Promise<T>, milliseconds: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const guardedPromise = promise.catch(() => fallback);
  const delayed = new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), Math.max(50, milliseconds));
  });

  return Promise.race([guardedPromise, delayed]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function localCpuUsagePercent(): number {
  const coreCount = Math.max(1, os.cpus().length);
  const loadAverage = os.loadavg()[0] ?? 0;
  return clampPercent((loadAverage / coreCount) * 100);
}

export function parseIostatDiskIoBytesPerSecond(output: string): number | undefined {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let mbColumnIndexes: number[] = [];
  let latestBytesPerSecond: number | undefined;

  for (const line of lines) {
    const columns = line.split(/\s+/);
    if (columns.includes("MB/s")) {
      mbColumnIndexes = columns
        .map((column, index) => (column === "MB/s" ? index : -1))
        .filter((index) => index >= 0);
      continue;
    }

    if (mbColumnIndexes.length === 0 || !/^-?\d/.test(columns[0] ?? "")) {
      continue;
    }

    const totalMbPerSecond = mbColumnIndexes.reduce((total, index) => {
      const value = Number.parseFloat(columns[index] ?? "");
      return Number.isFinite(value) ? total + Math.max(0, value) : total;
    }, 0);
    latestBytesPerSecond = Math.round(totalMbPerSecond * 1024 * 1024);
  }

  return latestBytesPerSecond;
}

async function localDiskIoBytesPerSecond(): Promise<number | undefined> {
  if (process.platform !== "darwin") {
    return undefined;
  }

  return new Promise((resolve) => {
    const child = spawn("iostat", ["-d", "-w", "1", "-c", "2"]);
    let settled = false;
    let output = "";

    const finish = (value: number | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(undefined);
    }, 1500);

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => finish(undefined));
    child.on("close", () => finish(parseIostatDiskIoBytesPerSecond(output)));
  });
}

const LOCAL_DISK_IO_CACHE_TTL_MS = 10_000;
let localDiskIoCache: {
  value: number | undefined;
  expires_at_ms: number;
  sampling: boolean;
} = {
  value: undefined,
  expires_at_ms: 0,
  sampling: false
};

function cachedLocalDiskIoBytesPerSecond(nowMs = Date.now()): number | undefined {
  if (process.platform !== "darwin") {
    return undefined;
  }

  if (nowMs < localDiskIoCache.expires_at_ms) {
    return localDiskIoCache.value;
  }

  if (!localDiskIoCache.sampling) {
    localDiskIoCache = {
      ...localDiskIoCache,
      sampling: true
    };
    void localDiskIoBytesPerSecond()
      .then((value) => {
        localDiskIoCache = {
          value,
          expires_at_ms: Date.now() + LOCAL_DISK_IO_CACHE_TTL_MS,
          sampling: false
        };
      })
      .catch(() => {
        localDiskIoCache = {
          value: localDiskIoCache.value,
          expires_at_ms: Date.now() + LOCAL_DISK_IO_CACHE_TTL_MS,
          sampling: false
        };
      });
  }

  return localDiskIoCache.value;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultCutterWorkspaceRoot(): string {
  return path.join(os.homedir(), "Movies", "MixLabLocal");
}

function defaultCutterReleaseCacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  const localAppData = optionalTrimmed(env.LOCALAPPDATA);

  if (localAppData) {
    return path.join(localAppData, "MixLab Cutter", "cache");
  }

  return path.join(defaultCutterWorkspaceRoot(), "cache");
}

const DEFAULT_THUMBNAIL_CACHE_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_CUT_TEMP_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const DEFAULT_SOURCE_VIDEO_CACHE_MAX_BYTES = 100 * 1024 * 1024 * 1024;
const DEFAULT_SOURCE_VIDEO_CACHE_CUT_WAIT_MS = 1_500;
const SOURCE_PREFLIGHT_SAMPLE_COUNT = 3;
const SOURCE_PREFLIGHT_PROBE_TIMEOUT_MS = 1_500;
const SOURCE_PREFLIGHT_BACKGROUND_DELAY_MS = 500;
const SOURCE_PREFLIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
const RELEASE_CACHE_STATUS_INLINE_TIMEOUT_MS = 200;
const RELEASE_CACHE_STATUS_CACHE_TTL_MS = 60_000;
const RELEASE_CACHE_BACKGROUND_SYNC_DELAY_MS = 250;
const SOURCE_LIBRARY_DEFAULT_PAGE_LIMIT = 20;
const SOURCE_LIBRARY_MAX_PAGE_LIMIT = 100;
const SOURCE_LIBRARY_PAGE_CACHE_TTL_MS = 30_000;
const LIBRARY_ID_INLINE_TIMEOUT_MS = 200;
const LIBRARY_ID_CACHE_TTL_MS = 60_000;
const SEARCH_INDEX_WARMUP_QUERY = "第一场";
const SEARCH_BACKEND_STATUS_INLINE_TIMEOUT_MS = 150;
const SEARCH_BACKEND_STATUS_CACHE_TTL_MS = 10_000;
const LOCAL_CACHE_STATUS_INLINE_TIMEOUT_MS = 150;
const LOCAL_CACHE_STATUS_CACHE_TTL_MS = 30_000;
const THUMBNAIL_CACHE_MANIFEST_FILE_NAME = ".manifest.json";

interface ThumbnailCacheManifestEntry {
  source_video_id: string;
  source_file_path: string;
  source_size: number;
  source_mtime_ms: number;
  cache_file_name: string;
  cache_size: number;
  checksum_sha256: string;
  cached_at: string;
}

interface ThumbnailCacheManifest {
  schema_version: "1.0";
  generated_at: string;
  entries: Record<string, ThumbnailCacheManifestEntry>;
}

interface SourceVideoCacheManifestEntry {
  source_video_id: string;
  source_video_file_path: string;
  source_size: number;
  source_mtime_ms?: number;
  cache_file_name: string;
  cache_size: number;
  cached_at: string;
  last_accessed_at: string;
}

interface SourceVideoCacheManifest {
  schema_version: "1.0";
  generated_at: string;
  entries: Record<string, SourceVideoCacheManifestEntry>;
}

function normalizeByteLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? 0) <= 0) {
    return fallback;
  }

  return Math.max(64 * 1024 * 1024, Math.floor(value!));
}

function localCacheRootForInput(input: CreateCutterApiServerInput): string {
  return (
    releaseCacheRootForInput(input) ??
    path.join(input.workspace_root ?? defaultCutterWorkspaceRoot(), "cache")
  );
}

function thumbnailCacheMaxBytes(input: CreateCutterApiServerInput): number {
  return normalizeByteLimit(input.thumbnail_cache_max_bytes, DEFAULT_THUMBNAIL_CACHE_MAX_BYTES);
}

function cutTempMaxBytes(input: CreateCutterApiServerInput): number {
  return normalizeByteLimit(input.cut_temp_max_bytes, DEFAULT_CUT_TEMP_MAX_BYTES);
}

function sourceVideoCacheMaxBytes(input: CreateCutterApiServerInput): number {
  return normalizeByteLimit(input.source_video_cache_max_bytes, DEFAULT_SOURCE_VIDEO_CACHE_MAX_BYTES);
}

function sourceVideoCacheCutWaitMs(input: CreateCutterApiServerInput): number {
  const value = input.source_video_cache_cut_wait_ms;
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? -1) < 0) {
    return DEFAULT_SOURCE_VIDEO_CACHE_CUT_WAIT_MS;
  }

  return Math.min(30_000, Math.floor(value!));
}

function thumbnailCacheRoot(input: CreateCutterApiServerInput): string {
  return path.join(localCacheRootForInput(input), "source-thumbnails");
}

function sourceVideoCacheRoot(input: CreateCutterApiServerInput): string {
  return path.join(localCacheRootForInput(input), "source-videos");
}

function searchdCacheRoot(input: CreateCutterApiServerInput): string {
  const explicitRoot = input.searchd_cache_root?.trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  return path.join(localCacheRootForInput(input), "searchd");
}

function thumbnailCacheManifestPath(root: string): string {
  return path.join(root, THUMBNAIL_CACHE_MANIFEST_FILE_NAME);
}

function sourceVideoCacheManifestPath(root: string): string {
  return path.join(root, THUMBNAIL_CACHE_MANIFEST_FILE_NAME);
}

function emptyThumbnailCacheManifest(): ThumbnailCacheManifest {
  return {
    schema_version: "1.0",
    generated_at: new Date(0).toISOString(),
    entries: {}
  };
}

function emptySourceVideoCacheManifest(): SourceVideoCacheManifest {
  return {
    schema_version: "1.0",
    generated_at: new Date(0).toISOString(),
    entries: {}
  };
}

function isThumbnailCacheManifestFile(fileName: string): boolean {
  return fileName === THUMBNAIL_CACHE_MANIFEST_FILE_NAME;
}

async function readThumbnailCacheManifest(root: string): Promise<ThumbnailCacheManifest> {
  try {
    const parsed = JSON.parse(await readFile(thumbnailCacheManifestPath(root), "utf8")) as Partial<ThumbnailCacheManifest>;
    if (parsed.schema_version !== "1.0" || !parsed.entries || typeof parsed.entries !== "object") {
      return emptyThumbnailCacheManifest();
    }

    return {
      schema_version: "1.0",
      generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : new Date(0).toISOString(),
      entries: parsed.entries as Record<string, ThumbnailCacheManifestEntry>
    };
  } catch {
    return emptyThumbnailCacheManifest();
  }
}

async function readSourceVideoCacheManifest(root: string): Promise<SourceVideoCacheManifest> {
  try {
    const parsed = JSON.parse(await readFile(sourceVideoCacheManifestPath(root), "utf8")) as Partial<SourceVideoCacheManifest>;
    if (parsed.schema_version !== "1.0" || !parsed.entries || typeof parsed.entries !== "object") {
      return emptySourceVideoCacheManifest();
    }

    return {
      schema_version: "1.0",
      generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : new Date(0).toISOString(),
      entries: parsed.entries as Record<string, SourceVideoCacheManifestEntry>
    };
  } catch {
    return emptySourceVideoCacheManifest();
  }
}

async function writeThumbnailCacheManifest(root: string, manifest: ThumbnailCacheManifest): Promise<void> {
  await mkdir(root, { recursive: true });
  const nextManifest: ThumbnailCacheManifest = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    entries: manifest.entries
  };
  const manifestPath = thumbnailCacheManifestPath(root);
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  await rename(tempPath, manifestPath);
}

async function writeSourceVideoCacheManifest(root: string, manifest: SourceVideoCacheManifest): Promise<void> {
  await mkdir(root, { recursive: true });
  const nextManifest: SourceVideoCacheManifest = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    entries: manifest.entries
  };
  const manifestPath = sourceVideoCacheManifestPath(root);
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  await rename(tempPath, manifestPath);
}

async function fileSha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function thumbnailManifestEntryMatchesSource(input: {
  entry: ThumbnailCacheManifestEntry | undefined;
  source_video_id: string;
  source_file_path: string;
  source_size: number;
  source_mtime_ms: number;
  cache_file_name: string;
  cache_size: number;
}): boolean {
  const entry = input.entry;
  if (!entry) {
    return false;
  }

  return (
    entry.source_video_id === input.source_video_id &&
    entry.source_file_path === input.source_file_path &&
    entry.source_size === input.source_size &&
    Math.floor(entry.source_mtime_ms) === Math.floor(input.source_mtime_ms) &&
    entry.cache_file_name === input.cache_file_name &&
    entry.cache_size === input.cache_size &&
    typeof entry.checksum_sha256 === "string" &&
    entry.checksum_sha256.length === 64
  );
}

async function upsertThumbnailCacheManifestEntry(input: {
  root: string;
  source_video_id: string;
  source_file_path: string;
  source_size: number;
  source_mtime_ms: number;
  cache_file_name: string;
  cache_file_path: string;
  cache_size: number;
}): Promise<void> {
  const manifest = await readThumbnailCacheManifest(input.root);
  manifest.entries[input.cache_file_name] = {
    source_video_id: input.source_video_id,
    source_file_path: input.source_file_path,
    source_size: input.source_size,
    source_mtime_ms: input.source_mtime_ms,
    cache_file_name: input.cache_file_name,
    cache_size: input.cache_size,
    checksum_sha256: await fileSha256(input.cache_file_path),
    cached_at: new Date().toISOString()
  };
  await writeThumbnailCacheManifest(input.root, manifest);
}

async function compactThumbnailCacheManifest(root: string): Promise<ThumbnailCacheManifest> {
  const manifest = await readThumbnailCacheManifest(root);
  const entries = await readDirectFileCacheEntries(root);
  const existingFileNames = new Set(entries.map((entry) => path.basename(entry.file_path)));
  const compactedEntries = Object.fromEntries(
    Object.entries(manifest.entries).filter(([fileName]) => existingFileNames.has(fileName))
  );

  if (Object.keys(compactedEntries).length !== Object.keys(manifest.entries).length) {
    const compactedManifest: ThumbnailCacheManifest = {
      schema_version: "1.0",
      generated_at: manifest.generated_at,
      entries: compactedEntries
    };
    await writeThumbnailCacheManifest(root, compactedManifest);
    return compactedManifest;
  }

  return manifest;
}

const activeSourceVideoPrefetches = new Map<string, Promise<void>>();
const sourceVideoCacheLastErrors = new Map<string, string>();

function sourceVideoCacheFileName(input: {
  source_video_id: string;
  source_video_file_path: string;
  source_size: number;
  source_mtime_ms?: number;
}): string {
  const extension = path.extname(input.source_video_file_path).toLowerCase() || ".mp4";
  const safeExtension = /^\.[a-z0-9]{1,12}$/i.test(extension) ? extension : ".mp4";
  const hash = createHash("sha1")
    .update(input.source_video_id)
    .update("\0")
    .update(input.source_video_file_path)
    .update("\0")
    .update(String(input.source_size))
    .update("\0")
    .update(String(Math.floor(input.source_mtime_ms ?? 0)))
    .digest("hex")
    .slice(0, 16);

  return `${input.source_video_id}-${hash}${safeExtension}`;
}

function activeSourceVideoPrefetch(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
}): Promise<void> | undefined {
  const prefix = `${sourceVideoCacheRoot(input.api_input)}\0${input.source_video_id}\0`;
  for (const [key, promise] of activeSourceVideoPrefetches.entries()) {
    if (key.startsWith(prefix)) {
      return promise;
    }
  }

  return undefined;
}

function sourceVideoCacheEntryMatches(input: {
  entry: SourceVideoCacheManifestEntry | undefined;
  source_video_id: string;
  source_video_file_path: string;
  source_size?: number;
}): boolean {
  const entry = input.entry;
  if (!entry) {
    return false;
  }
  const hasKnownSourceSize = Number.isFinite(input.source_size ?? Number.NaN) && (input.source_size ?? 0) > 0;

  return (
    entry.source_video_id === input.source_video_id &&
    entry.source_video_file_path === input.source_video_file_path &&
    (!hasKnownSourceSize || entry.source_size === input.source_size)
  );
}

async function compactSourceVideoCacheManifest(root: string): Promise<SourceVideoCacheManifest> {
  const manifest = await readSourceVideoCacheManifest(root);
  const entries = await readDirectFileCacheEntries(root);
  const existingFileNames = new Set(entries.map((entry) => path.basename(entry.file_path)));
  const compactedEntries = Object.fromEntries(
    Object.entries(manifest.entries).filter(([, entry]) => existingFileNames.has(entry.cache_file_name))
  );

  if (Object.keys(compactedEntries).length !== Object.keys(manifest.entries).length) {
    const compactedManifest: SourceVideoCacheManifest = {
      schema_version: "1.0",
      generated_at: manifest.generated_at,
      entries: compactedEntries
    };
    await writeSourceVideoCacheManifest(root, compactedManifest);
    return compactedManifest;
  }

  return manifest;
}

async function pruneSourceVideoCache(input: {
  root: string;
  max_bytes: number;
  keep_source_video_id?: string;
}): Promise<void> {
  const manifest = await compactSourceVideoCacheManifest(input.root);
  const fileEntries = await readDirectFileCacheEntries(input.root);
  const fileSizes = new Map(fileEntries.map((entry) => [path.basename(entry.file_path), entry.size]));
  let totalBytes = fileEntries.reduce((total, entry) => total + entry.size, 0);
  const nextEntries = { ...manifest.entries };

  for (const entry of Object.values(manifest.entries)
    .filter((item) => item.source_video_id !== input.keep_source_video_id)
    .sort((left, right) =>
      Date.parse(left.last_accessed_at || left.cached_at) - Date.parse(right.last_accessed_at || right.cached_at)
    )) {
    if (totalBytes <= input.max_bytes) {
      break;
    }

    const cacheFilePath = path.join(input.root, entry.cache_file_name);
    try {
      await rm(cacheFilePath, { force: true });
      totalBytes -= fileSizes.get(entry.cache_file_name) ?? entry.cache_size;
      delete nextEntries[entry.source_video_id];
    } catch {
      // A concurrent cut or stream may still be using the cached source file.
    }
  }

  if (Object.keys(nextEntries).length !== Object.keys(manifest.entries).length) {
    await writeSourceVideoCacheManifest(input.root, {
      schema_version: "1.0",
      generated_at: manifest.generated_at,
      entries: nextEntries
    });
  }
}

async function cachedSourceVideoPath(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
  source_video_file_path: string;
  file_size?: number;
}): Promise<string | undefined> {
  const root = sourceVideoCacheRoot(input.api_input);
  const manifest = await compactSourceVideoCacheManifest(root);
  const entry = manifest.entries[input.source_video_id];

  if (!sourceVideoCacheEntryMatches({
    entry,
    source_video_id: input.source_video_id,
    source_video_file_path: input.source_video_file_path,
    source_size: input.file_size
  })) {
    return undefined;
  }

  const cacheFilePath = path.join(root, entry!.cache_file_name);
  const cacheStat = await stat(cacheFilePath).catch(() => null);
  if (!cacheStat?.isFile() || cacheStat.size !== entry!.cache_size) {
    return undefined;
  }

  manifest.entries[input.source_video_id] = {
    ...entry!,
    last_accessed_at: new Date().toISOString()
  };
  void writeSourceVideoCacheManifest(root, manifest).catch(() => undefined);
  void utimes(cacheFilePath, new Date(), new Date()).catch(() => undefined);

  return cacheFilePath;
}

async function prefetchSourceVideo(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
  source_video_file_path: string;
  file_size?: number;
}): Promise<void> {
  if (/^E\d{6}$/.test(input.source_video_id)) {
    return;
  }

  const root = sourceVideoCacheRoot(input.api_input);
  const maxBytes = sourceVideoCacheMaxBytes(input.api_input);
  const sourceStat = await stat(input.source_video_file_path);
  if (!sourceStat.isFile()) {
    throw new Error("source video path is not a file");
  }

  if (sourceStat.size > maxBytes) {
    throw new Error(`source video is larger than source cache limit: ${sourceStat.size} > ${maxBytes}`);
  }

  const existing = await cachedSourceVideoPath({
    api_input: input.api_input,
    source_video_id: input.source_video_id,
    source_video_file_path: input.source_video_file_path,
    file_size: input.file_size ?? sourceStat.size
  });
  if (existing) {
    return;
  }

  const cacheFileName = sourceVideoCacheFileName({
    source_video_id: input.source_video_id,
    source_video_file_path: input.source_video_file_path,
    source_size: sourceStat.size,
    source_mtime_ms: sourceStat.mtimeMs
  });
  const cacheFilePath = path.join(root, cacheFileName);
  const lockKey = `${root}\0${input.source_video_id}\0${cacheFileName}`;
  const active = activeSourceVideoPrefetches.get(lockKey);
  if (active) {
    await active;
    return;
  }

  const promise = (async () => {
    await mkdir(root, { recursive: true });
    const tempPath = `${cacheFilePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    try {
      await (input.api_input.source_video_cache_copy_file ?? copyFile)(
        input.source_video_file_path,
        tempPath
      );
      const tempStat = await stat(tempPath);
      if (!tempStat.isFile() || tempStat.size !== sourceStat.size) {
        throw new Error("source video cache copy did not match source size");
      }

      await rename(tempPath, cacheFilePath);
      const now = new Date().toISOString();
      const manifest = await readSourceVideoCacheManifest(root);
      const previous = manifest.entries[input.source_video_id];
      if (previous && previous.cache_file_name !== cacheFileName) {
        void rm(path.join(root, previous.cache_file_name), { force: true }).catch(() => undefined);
      }
      manifest.entries[input.source_video_id] = {
        source_video_id: input.source_video_id,
        source_video_file_path: input.source_video_file_path,
        source_size: sourceStat.size,
        source_mtime_ms: sourceStat.mtimeMs,
        cache_file_name: cacheFileName,
        cache_size: tempStat.size,
        cached_at: now,
        last_accessed_at: now
      };
      await writeSourceVideoCacheManifest(root, manifest);
      await pruneSourceVideoCache({
        root,
        max_bytes: maxBytes,
        keep_source_video_id: input.source_video_id
      });
      invalidateLocalCacheRuntimeStatus(input.api_input);
      sourceVideoCacheLastErrors.delete(root);
    } catch (error) {
      await rm(tempPath, { force: true });
      sourceVideoCacheLastErrors.set(root, (error as Error).message || "source video cache failed");
      invalidateLocalCacheRuntimeStatus(input.api_input);
      throw error;
    }
  })();

  activeSourceVideoPrefetches.set(lockKey, promise);
  try {
    await promise;
  } finally {
    activeSourceVideoPrefetches.delete(lockKey);
  }
}

function prefetchSourceVideoBestEffort(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
  source_video_file_path: string;
  file_size?: number;
}): void {
  void prefetchSourceVideo(input).catch(() => undefined);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

async function sourceDetailWithLocalSourceCache<T extends {
  source_video_id: string;
  source_video_file_path: string;
  file_size?: number;
}>(apiInput: CreateCutterApiServerInput, source: T): Promise<T> {
  if (/^E\d{6}$/.test(source.source_video_id)) {
    return source;
  }

  const cachedPath = await cachedSourceVideoPath({
    api_input: apiInput,
    source_video_id: source.source_video_id,
    source_video_file_path: source.source_video_file_path,
    file_size: source.file_size
  });

  if (cachedPath) {
    return {
      ...source,
      source_video_file_path: cachedPath
    };
  }

  return source;
}

async function sourceDetailWithLocalSourceForCut<T extends {
  source_video_id: string;
  source_video_file_path: string;
  file_size?: number;
}>(apiInput: CreateCutterApiServerInput, source: T): Promise<T> {
  if (/^E\d{6}$/.test(source.source_video_id)) {
    return source;
  }

  const cachedPath = await cachedSourceVideoPath({
    api_input: apiInput,
    source_video_id: source.source_video_id,
    source_video_file_path: source.source_video_file_path,
    file_size: source.file_size
  });

  if (cachedPath) {
    return {
      ...source,
      source_video_file_path: cachedPath
    };
  }

  const prefetchPromise = activeSourceVideoPrefetch({
    api_input: apiInput,
    source_video_id: source.source_video_id
  });

  try {
    const waitMs = sourceVideoCacheCutWaitMs(apiInput);
    if (prefetchPromise && waitMs > 0) {
      await Promise.race([prefetchPromise, delay(waitMs)]);
      const readyPath = await cachedSourceVideoPath({
        api_input: apiInput,
        source_video_id: source.source_video_id,
        source_video_file_path: source.source_video_file_path,
        file_size: source.file_size
      });

      if (readyPath) {
        return {
          ...source,
          source_video_file_path: readyPath
        };
      }
    }
  } catch (error) {
    const root = sourceVideoCacheRoot(apiInput);
    const message = error instanceof Error ? error.message : "source video cache before cut failed";
    sourceVideoCacheLastErrors.set(root, `源视频缓存准备失败，已降级读取原素材：${message}`);
  }

  return source;
}

async function readSourceVideoCacheStatus(input: CreateCutterApiServerInput): Promise<CutterSourceVideoCacheStatus> {
  const root = sourceVideoCacheRoot(input);
  const manifest = await compactSourceVideoCacheManifest(root);
  const entries = await readDirectFileCacheEntries(root);
  const activePrefix = `${root}\0`;
  const lastError = sourceVideoCacheLastErrors.get(root);

  return {
    cache_root_path: root,
    max_bytes: sourceVideoCacheMaxBytes(input),
    size_bytes: entries.reduce((total, entry) => total + entry.size, 0),
    file_count: entries.length,
    cached_video_count: Object.keys(manifest.entries).length,
    active_prefetch_count: [...activeSourceVideoPrefetches.keys()].filter((key) =>
      key.startsWith(activePrefix)
    ).length,
    ...(lastError ? { last_error: lastError } : {})
  };
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveCutterApiRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): CutterApiRuntimeConfig {
  const libraryRoot =
    optionalTrimmed(env.MIXLAB_CUTTER_LIBRARY_ROOT) ??
    optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_ROOT);

  if (!libraryRoot) {
    throw new Error("MIXLAB_CUTTER_LIBRARY_ROOT or MIXLAB_PREPROCESS_LIBRARY_ROOT is required");
  }

  const rawPort = optionalTrimmed(env.MIXLAB_CUTTER_API_PORT);
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3789;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MIXLAB_CUTTER_API_PORT must be an integer between 1 and 65535");
  }

  const rawAuthMode = optionalTrimmed(env.MIXLAB_CUTTER_AUTH_MODE);
  if (rawAuthMode && rawAuthMode !== "reviewed" && rawAuthMode !== "local_trusted") {
    throw new Error("MIXLAB_CUTTER_AUTH_MODE must be reviewed or local_trusted");
  }
  const authMode: CreateCutterApiServerInput["auth_mode"] =
    rawAuthMode === "reviewed" || rawAuthMode === "local_trusted" ? rawAuthMode : undefined;

  return {
    library_root: libraryRoot,
    workspace_root: optionalTrimmed(env.MIXLAB_CUTTER_WORKSPACE_ROOT) ?? defaultCutterWorkspaceRoot(),
    release_cache_root:
      optionalTrimmed(env.MIXLAB_CUTTER_RELEASE_CACHE_ROOT) ??
      defaultCutterReleaseCacheRoot(env),
    release_cache_max_releases: optionalPositiveInteger(
      env.MIXLAB_CUTTER_RELEASE_CACHE_MAX_RELEASES
    ),
    thumbnail_cache_max_bytes: optionalPositiveInteger(
      env.MIXLAB_CUTTER_THUMBNAIL_CACHE_MAX_BYTES
    ),
    cut_temp_max_bytes: optionalPositiveInteger(env.MIXLAB_CUTTER_CUT_TEMP_MAX_BYTES),
    source_video_cache_max_bytes: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SOURCE_VIDEO_CACHE_MAX_BYTES
    ),
    source_video_cache_cut_wait_ms: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SOURCE_VIDEO_CACHE_CUT_WAIT_MS
    ),
    searchd_base_url:
      optionalTrimmed(env.MIXLAB_SEARCHD_BASE_URL) ??
      optionalTrimmed(env.MIXLAB_CUTTER_SEARCHD_BASE_URL),
    searchd_cache_root:
      optionalTrimmed(env.MIXLAB_CUTTER_SEARCHD_CACHE_ROOT) ??
      optionalTrimmed(env.MIXLAB_SEARCHD_CACHE_ROOT),
    searchd_timeout_ms: optionalPositiveInteger(
      env.MIXLAB_SEARCHD_TIMEOUT_MS ?? env.MIXLAB_CUTTER_SEARCHD_TIMEOUT_MS
    ),
    host: optionalTrimmed(env.MIXLAB_CUTTER_API_HOST) ?? "127.0.0.1",
    port,
    ...(authMode ? { auth_mode: authMode } : {}),
    trusted_user_id: optionalTrimmed(env.MIXLAB_CUTTER_TRUSTED_USER_ID),
    trusted_username: optionalTrimmed(env.MIXLAB_CUTTER_TRUSTED_USERNAME)
  };
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,DELETE,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Range,X-MixLab-Device-Id,X-MixLab-Session-Token"
  );
  response.setHeader("Access-Control-Expose-Headers", "Content-Length,Content-Range,Accept-Ranges");
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function writeNoContent(response: ServerResponse): void {
  setCorsHeaders(response);
  response.writeHead(204);
  response.end();
}

function writeText(response: ServerResponse, statusCode: number, body: string): void {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function writeError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string
): void {
  writeJson(response, statusCode, {
    error: {
      code,
      message
    }
  } satisfies CutterApiErrorBody);
}

function logUnhandledCutterApiError(request: IncomingMessage, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[mixlab-cutter-api] unhandled request error", {
    method: request.method,
    url: request.url,
    message,
    ...(stack ? { stack } : {})
  });
}

export function cutterApiInfrastructureErrorPayload(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} | null {
  if (hasErrorCode(error, "ENOSPC") || errorMessageIncludes(error, "no space left on device")) {
    return {
      statusCode: 507,
      code: "insufficient_storage",
      message: "本机磁盘空间不足，无法写入剪切任务或本地素材。请清理 MixLab 本地缓存或更换本地工作区后重试。"
    };
  }

  return null;
}

function hasErrorCode(error: unknown, code: string, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown };
  return record.code === code || hasErrorCode(record.cause, code, depth + 1);
}

function errorMessageIncludes(error: unknown, needle: string, depth = 0): boolean {
  if (!error || depth > 3) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes(needle)) {
    return true;
  }

  if (typeof error === "object") {
    return errorMessageIncludes((error as { cause?: unknown }).cause, needle, depth + 1);
  }

  return false;
}

function apiResponse(data: unknown): { schema_version: "1.0"; data: unknown } {
  return {
    schema_version: "1.0",
    data
  };
}

function sourceVideoUrls(sourceVideoId: string): ApiSourceVideoUrls {
  return {
    detail_url: `/cutter/source-videos/${sourceVideoId}`,
    media_url: `/cutter/source-videos/${sourceVideoId}/media`,
    cover_url: `/cutter/source-videos/${sourceVideoId}/cover`,
    subtitles_url: `/cutter/source-videos/${sourceVideoId}/subtitles.srt`
  };
}

function localClipUrls(localClipId: string): {
  detail_url: string;
  media_url: string;
} {
  return {
    detail_url: `/cutter/local-clips/${localClipId}`,
    media_url: `/cutter/local-clips/${localClipId}/media`
  };
}

function addLocalClipUrls<T extends { local_clip_id: string }>(item: T): T & {
  detail_url: string;
  media_url: string;
} {
  return {
    ...item,
    ...localClipUrls(item.local_clip_id)
  };
}

function addSourceVideoUrls<T extends { source_video_id: string }>(item: T): T & ApiSourceVideoUrls {
  return {
    ...item,
    ...sourceVideoUrls(item.source_video_id)
  };
}

function parsePositiveLimit(value: string | null): number {
  if (value === null || value.trim() === "") {
    return 20;
  }

  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  return limit;
}

function parseSourceLibraryLimit(value: string | null): number {
  if (value === null || value.trim() === "") {
    return SOURCE_LIBRARY_DEFAULT_PAGE_LIMIT;
  }

  const limit = Number.parseInt(value, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return SOURCE_LIBRARY_DEFAULT_PAGE_LIMIT;
  }

  return Math.min(limit, SOURCE_LIBRARY_MAX_PAGE_LIMIT);
}

function parseSourceLibraryOffset(value: string | null): number {
  if (value === null || value.trim() === "") {
    return 0;
  }

  const offset = Number.parseInt(value, 10);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function numberField(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanField(record: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function searchdInteractiveTimeoutMs(searchdTimeoutMs: number | undefined): number {
  return Math.max(250, Math.min(searchdTimeoutMs ?? 1500, 1500));
}

function normalizeSearchdBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function searchdSourceSearchUrl(input: {
  base_url: string;
  query: string;
  limit: number;
  cursor?: string;
  source_folder_name?: string;
}): string {
  const url = new URL(`${normalizeSearchdBaseUrl(input.base_url)}/source-search`);
  url.searchParams.set("query", input.query);
  url.searchParams.set("limit", String(input.limit));
  if (input.cursor) {
    url.searchParams.set("cursor", input.cursor);
  }
  if (input.source_folder_name) {
    url.searchParams.set("source_folder_name", input.source_folder_name);
  }

  return url.toString();
}

function searchdSourceVideoDetailUrl(input: {
  base_url: string;
  source_video_id: string;
}): string {
  return `${normalizeSearchdBaseUrl(input.base_url)}/source-videos/${encodeURIComponent(input.source_video_id)}/detail`;
}

function searchdHealthUrl(baseUrl: string): string {
  return `${normalizeSearchdBaseUrl(baseUrl)}/health`;
}

function unwrapSearchdPayload(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.data)) {
    return value.data;
  }

  return value;
}

function coerceSearchdHitSegment(value: unknown): CutterSourceLibrarySearchGroup["hit_segments"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const segmentId = stringField(value, "segment_id");
  const text = stringField(value, "text");
  if (!segmentId || !text) {
    return null;
  }

  const ranges = Array.isArray(value.match_ranges)
    ? value.match_ranges
        .filter((range): range is [number, number] =>
          Array.isArray(range) &&
          range.length === 2 &&
          typeof range[0] === "number" &&
          typeof range[1] === "number"
        )
    : [];
  const matchType = value.match_type === "tolerant" ? "tolerant" : value.match_type === "exact" ? "exact" : undefined;

  return {
    segment_id: segmentId,
    begin_ms: numberField(value, "begin_ms"),
    end_ms: numberField(value, "end_ms"),
    text,
    match_ranges: ranges,
    ...(typeof value.match_id === "string" ? { match_id: value.match_id } : {}),
    ...(matchType ? { match_type: matchType } : {})
  };
}

function coerceSearchdGroup(value: unknown): CutterSourceLibrarySearchGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceVideoId = stringField(value, "source_video_id");
  const title = stringField(value, "title");
  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId) || !title) {
    return null;
  }

  const hitSegments = Array.isArray(value.hit_segments)
    ? value.hit_segments
        .map(coerceSearchdHitSegment)
        .filter((segment): segment is CutterSourceLibrarySearchGroup["hit_segments"][number] => Boolean(segment))
    : [];

  if (hitSegments.length === 0) {
    return null;
  }

  return {
    source_video_id: sourceVideoId,
    title,
    duration_ms: numberField(value, "duration_ms"),
    hit_count: Math.max(1, Math.round(numberField(value, "hit_count", hitSegments.length))),
    best_excerpt: stringField(value, "best_excerpt", hitSegments[0]?.text ?? ""),
    hit_segments: hitSegments,
    relative_path: stringField(value, "relative_path"),
    source_folder_name: stringField(value, "source_folder_name"),
    source_video_file_path: stringField(value, "source_video_file_path"),
    cover_path: stringField(value, "cover_path"),
    cover_file_path: stringField(value, "cover_file_path"),
    transcript_character_count: Math.max(0, Math.round(numberField(value, "transcript_character_count")))
  };
}

function coerceSearchdResult(input: {
  payload: unknown;
  query: string;
  limit: number;
  cursor?: string;
  elapsed_ms: number;
}): CutterSourceLibrarySearchResult {
  const record = unwrapSearchdPayload(input.payload);
  if (!isRecord(record)) {
    throw new Error("invalid_searchd_response");
  }

  const groups = Array.isArray(record.groups)
    ? record.groups
        .map(coerceSearchdGroup)
        .filter((group): group is CutterSourceLibrarySearchGroup => Boolean(group))
    : [];
  const normalizedQuery = stringField(record, "normalized_query", input.query.trim());

  return {
    query: stringField(record, "query", input.query),
    normalized_query: normalizedQuery,
    groups,
    cursor: stringField(record, "cursor", input.cursor ?? ""),
    next_cursor: stringField(record, "next_cursor"),
    has_more: booleanField(record, "has_more"),
    returned_count: Math.max(0, Math.round(numberField(record, "returned_count", groups.length))),
    limit: Math.max(1, Math.round(numberField(record, "limit", input.limit))),
    index_version: stringField(record, "index_version"),
    search_ms: Math.max(0, Math.round(numberField(record, "search_ms", input.elapsed_ms))),
    search_mode: "searchd"
  };
}

function coerceSearchdTranscriptSegment(value: unknown): TranscriptSegment | null {
  if (!isRecord(value)) {
    return null;
  }

  const segmentId = stringField(value, "segment_id");
  const text = stringField(value, "text");
  if (!segmentId || !text) {
    return null;
  }

  return {
    segment_id: segmentId,
    index: Math.max(0, Math.round(numberField(value, "index"))),
    begin_ms: Math.max(0, Math.round(numberField(value, "begin_ms"))),
    end_ms: Math.max(0, Math.round(numberField(value, "end_ms"))),
    begin_char: Math.max(0, Math.round(numberField(value, "begin_char"))),
    end_char: Math.max(0, Math.round(numberField(value, "end_char", text.length))),
    normalized_begin_char: Math.max(0, Math.round(numberField(value, "normalized_begin_char"))),
    normalized_end_char: Math.max(0, Math.round(numberField(value, "normalized_end_char"))),
    text,
    normalized_text: stringField(value, "normalized_text"),
    confidence: numberField(value, "confidence", 1)
  };
}

function coerceSearchdTranscript(value: unknown): CutterSourceVideoDetail["transcript"] {
  if (!isRecord(value)) {
    throw new Error("invalid_searchd_response");
  }

  const sourceVideoId = stringField(value, "source_video_id");
  const segments = Array.isArray(value.segments)
    ? value.segments
        .map(coerceSearchdTranscriptSegment)
        .filter((segment): segment is TranscriptSegment => Boolean(segment))
    : [];

  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId) || segments.length === 0) {
    throw new Error("invalid_searchd_response");
  }

  return {
    schema_version: stringField(value, "schema_version", "1.0"),
    source_video_id: sourceVideoId,
    provider: stringField(value, "provider", "sqlite-index"),
    model: stringField(value, "model", "source-transcript-index"),
    generated_at: stringField(value, "generated_at"),
    duration_ms: Math.max(0, Math.round(numberField(value, "duration_ms"))),
    full_text: stringField(value, "full_text", segments.map((segment) => segment.text).join("")),
    segments
  };
}

function coerceSearchdSourceVideoDetailPayload(payload: unknown): {
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path: string;
  source_folder_name: string;
  cover_path: string;
  transcript: CutterSourceVideoDetail["transcript"];
} {
  const record = unwrapSearchdPayload(payload);
  if (!isRecord(record)) {
    throw new Error("invalid_searchd_response");
  }

  const sourceVideoId = stringField(record, "source_video_id");
  const title = stringField(record, "title");
  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId) || !title) {
    throw new Error("invalid_searchd_response");
  }

  return {
    source_video_id: sourceVideoId,
    title,
    duration_ms: Math.max(0, Math.round(numberField(record, "duration_ms"))),
    relative_path: stringField(record, "relative_path"),
    source_folder_name: stringField(record, "source_folder_name"),
    cover_path: stringField(record, "cover_path"),
    transcript: coerceSearchdTranscript(record.transcript)
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : {};
}

async function readSearchdBackendStatus(input: {
  searchd_base_url: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
}): Promise<CutterSearchBackendStatus> {
  const startedAt = Date.now();
  const fetchImpl = input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, input.searchd_timeout_ms ?? 800));

  try {
    const response = await fetchImpl(searchdHealthUrl(input.searchd_base_url), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);
    const record = unwrapSearchdPayload(payload);

    if (!response.ok || !isRecord(record)) {
      throw new Error("searchd_unavailable");
    }

    const ready = booleanField(record, "ready", true);
    const lastError = stringField(record, "last_refresh_error");

    return {
      mode: "searchd",
      preferred_mode: "searchd",
      label: ready ? "本地 searchd" : lastError ? "本地 searchd（索引异常）" : "本地 searchd（索引预热中）",
      healthy: ready,
      degraded: !ready,
      index_version: stringField(record, "index_version"),
      source_video_count: Math.max(0, Math.round(numberField(record, "source_video_count"))),
      segment_count: Math.max(0, Math.round(numberField(record, "segment_count"))),
      response_ms: Math.max(0, Date.now() - startedAt),
      message: ready
        ? "本地 Tantivy 搜索索引可用"
        : lastError
          ? `本地 Tantivy 搜索索引加载失败：${lastError}`
          : "本地 Tantivy 搜索索引正在预热，首批搜索会临时使用本地 SQLite 索引",
      ...(lastError ? { last_error: lastError } : {})
    };
  } finally {
    clearTimeout(timeout);
  }
}

type SearchCursorBackend = "none" | "searchd" | "local-index" | "unknown";

function searchCursorBackend(cursor: string | undefined): SearchCursorBackend {
  const normalized = cursor?.trim();
  if (!normalized) {
    return "none";
  }

  if (normalized.startsWith("searchd:")) {
    return "searchd";
  }

  if (normalized.startsWith("sqlite:") || normalized.startsWith("artifact:")) {
    return "local-index";
  }

  return "unknown";
}

function failedSearchAttemptMode(
  cursor: string | undefined
): Parameters<typeof appendUsageEvent>[1]["search_mode"] | undefined {
  const normalized = cursor?.trim();
  if (normalized?.startsWith("searchd:")) {
    return "searchd";
  }
  if (normalized?.startsWith("sqlite:")) {
    return "sqlite-index";
  }
  if (normalized?.startsWith("artifact:")) {
    return "transcript-artifact-fallback";
  }

  return undefined;
}

async function searchCutterSourceLibraryViaSearchd(input: {
  searchd_base_url: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
  query: string;
  limit: number;
  cursor?: string;
  source_folder_name?: string;
}): Promise<CutterSourceLibrarySearchResult> {
  const startedAt = Date.now();
  const fetchImpl = input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), searchdInteractiveTimeoutMs(input.searchd_timeout_ms));

  try {
    const response = await fetchImpl(searchdSourceSearchUrl({
      base_url: input.searchd_base_url,
      query: input.query,
      limit: input.limit,
      cursor: input.cursor,
      source_folder_name: input.source_folder_name
    }), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      const data = unwrapSearchdPayload(payload);
      const errorCode = isRecord(data) && isRecord(data.error)
        ? stringField(data.error, "code")
        : isRecord(data)
          ? stringField(data, "code")
          : "";
      if (errorCode === "invalid_search_cursor" || response.status === 400) {
        throw new Error("invalid_search_cursor");
      }

      throw new Error("searchd_unavailable");
    }

    return coerceSearchdResult({
      payload,
      query: input.query,
      limit: input.limit,
      cursor: input.cursor,
      elapsed_ms: Date.now() - startedAt
    });
  } catch (error) {
    if ((error as Error).message === "invalid_search_cursor") {
      throw error;
    }

    throw new Error("searchd_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function libraryRelativeFilePath(libraryRoot: string, libraryRelativePath: string): string {
  const normalized = libraryRelativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("artifact path must be a library-relative path");
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new Error("artifact path cannot escape library root");
  }

  return path.join(libraryRoot, ...parts);
}

function optionalLibraryRelativeFilePath(libraryRoot: string, libraryRelativePath: string): string {
  return optionalTrimmed(libraryRelativePath)
    ? libraryRelativeFilePath(libraryRoot, libraryRelativePath)
    : "";
}

function searchdTranscriptDetail(input: {
  library_root: string;
  indexed: ReturnType<typeof coerceSearchdSourceVideoDetailPayload>;
}): CutterSourceVideoDetail {
  const artifactRoot = `.mixlab-library/videos/${input.indexed.source_video_id}`;

  return {
    source_video_id: input.indexed.source_video_id,
    title: input.indexed.title,
    duration_ms: input.indexed.duration_ms,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: 0,
    relative_path: input.indexed.relative_path,
    source_folder_name: input.indexed.source_folder_name,
    logical_uri: "",
    source_video_file_path: input.indexed.relative_path
      ? resolveSourceVideoPath({
          mount_root: input.library_root,
          relative_path: input.indexed.relative_path
        })
      : "",
    cover_path: input.indexed.cover_path,
    cover_file_path: optionalLibraryRelativeFilePath(input.library_root, input.indexed.cover_path),
    transcript_path: `${artifactRoot}/transcript.json`,
    transcript_file_path: libraryRelativeFilePath(input.library_root, `${artifactRoot}/transcript.json`),
    srt_path: `${artifactRoot}/subtitles.srt`,
    srt_file_path: libraryRelativeFilePath(input.library_root, `${artifactRoot}/subtitles.srt`),
    keyframes_path: `${artifactRoot}/keyframes.json`,
    keyframes_file_path: libraryRelativeFilePath(input.library_root, `${artifactRoot}/keyframes.json`),
    transcript: input.indexed.transcript,
    srt: "",
    keyframes: {
      schema_version: "1.0",
      keyframes_ms: []
    }
  };
}

async function searchCutterSourceVideoTranscriptDetailViaSearchd(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
}): Promise<CutterSourceVideoDetail | null> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  if (!searchdBaseUrl) {
    return null;
  }

  const fetchImpl = input.api_input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), searchdInteractiveTimeoutMs(input.api_input.searchd_timeout_ms));

  try {
    const response = await fetchImpl(searchdSourceVideoDetailUrl({
      base_url: searchdBaseUrl,
      source_video_id: input.source_video_id
    }), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("searchd_unavailable");
    }

    return searchdTranscriptDetail({
      library_root: input.api_input.library_root,
      indexed: coerceSearchdSourceVideoDetailPayload(payload)
    });
  } catch (error) {
    if ((error as Error).message === "invalid_searchd_response") {
      throw error;
    }

    throw new Error("searchd_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCutterSourceVideoDetailViaSearchd(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
}): Promise<CutterSourceVideoDetail | null> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  if (!searchdBaseUrl) {
    return null;
  }

  const fetchImpl = input.api_input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), searchdInteractiveTimeoutMs(input.api_input.searchd_timeout_ms));

  try {
    const response = await fetchImpl(searchdSourceVideoDetailUrl({
      base_url: searchdBaseUrl,
      source_video_id: input.source_video_id
    }), {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("searchd_unavailable");
    }

    return searchdTranscriptDetail({
      library_root: input.api_input.library_root,
      indexed: coerceSearchdSourceVideoDetailPayload(payload)
    });
  } catch (error) {
    if ((error as Error).message === "invalid_searchd_response") {
      throw error;
    }

    throw new Error("searchd_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCutterSourceLibraryWithPreferredBackend(input: {
  api_input: CreateCutterApiServerInput;
  query: string;
  limit: number;
  cursor?: string;
  source_folder_name?: string;
}): Promise<CutterSourceLibrarySearchResult> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  const cursorBackend = searchCursorBackend(input.cursor);
  if (searchdBaseUrl && cursorBackend !== "local-index") {
    try {
      return await searchCutterSourceLibraryViaSearchd({
        searchd_base_url: searchdBaseUrl,
        searchd_fetch: input.api_input.searchd_fetch,
        searchd_timeout_ms: input.api_input.searchd_timeout_ms,
        query: input.query,
        limit: input.limit,
        cursor: input.cursor,
        source_folder_name: input.source_folder_name
      });
    } catch (error) {
      if ((error as Error).message === "invalid_search_cursor" || cursorBackend === "searchd" || cursorBackend === "unknown") {
        throw error;
      }
      // First-page search remains usable if local searchd is restarting or absent.
      // Cursor continuations stay on the same backend to avoid mixing result windows.
    }
  }

  const releaseRoot = await releaseRootForFastLibraryRead(input.api_input);
  return searchCutterSourceLibrary({
    library_root: input.api_input.library_root,
    ...(releaseRoot ? { release_root: releaseRoot } : {}),
    query: input.query,
    limit: input.limit,
    cursor: input.cursor,
    source_folder_name: input.source_folder_name
  });
}

function parseSourceVideoRoute(
  pathname: string
): { source_video_id: string; action: "" | "media" | "cover" | "subtitles.srt" } | undefined {
  const match = /^\/cutter\/source-videos\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);

  if (!match) {
    return undefined;
  }

  const sourceVideoId = match[1] ?? "";
  const action = match[2] ?? "";

  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) {
    throw new Error("invalid_source_video_id");
  }

  if (action !== "" && action !== "media" && action !== "cover" && action !== "subtitles.srt") {
    throw new Error("not_found");
  }

  return {
    source_video_id: sourceVideoId,
    action
  };
}

function parseLocalClipRoute(
  pathname: string
): { local_clip_id: string; action: "" | "media" | "cover" | "subtitles.srt" } | undefined {
  const match = /^\/cutter\/local-clips\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);

  if (!match) {
    return undefined;
  }

  const localClipId = match[1] ?? "";
  const action = match[2] ?? "";

  if (!LOCAL_CLIP_ID_PATTERN.test(localClipId)) {
    throw new Error("invalid_local_clip_id");
  }

  if (action !== "" && action !== "media" && action !== "cover" && action !== "subtitles.srt") {
    throw new Error("not_found");
  }

  return {
    local_clip_id: localClipId,
    action
  };
}

function contentTypeForSourceVideo(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".mp4" || extension === ".m4v") {
    return "video/mp4";
  }

  if (extension === ".mov") {
    return "video/quicktime";
  }

  if (extension === ".webm") {
    return "video/webm";
  }

  if (extension === ".mkv") {
    return "video/x-matroska";
  }

  return "application/octet-stream";
}

function contentTypeForImage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number
): { start: number; end: number } | undefined {
  if (!rangeHeader) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

  if (!match) {
    throw new Error("invalid_range");
  }

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";

  if (startText === "" && endText === "") {
    throw new Error("invalid_range");
  }

  if (startText === "") {
    const suffixLength = Number.parseInt(endText, 10);

    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      throw new Error("invalid_range");
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1
    };
  }

  const start = Number.parseInt(startText, 10);
  const end = endText === "" ? fileSize - 1 : Number.parseInt(endText, 10);

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    throw new Error("invalid_range");
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}

async function streamFile(input: {
  request: IncomingMessage;
  response: ServerResponse;
  file_path: string;
  content_type: string;
  range_enabled: boolean;
}): Promise<void> {
  const fileStat = await stat(input.file_path);
  const range = input.range_enabled
    ? parseRangeHeader(input.request.headers.range, fileStat.size)
    : undefined;
  const readStream = range
    ? createReadStream(input.file_path, { start: range.start, end: range.end })
    : createReadStream(input.file_path);

  setCorsHeaders(input.response);

  if (input.range_enabled) {
    input.response.setHeader("Accept-Ranges", "bytes");
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      readStream.destroy();
      resolve();
    };

    readStream.once("open", () => {
      if (range) {
        input.response.writeHead(206, {
          "Content-Type": input.content_type,
          "Content-Length": range.end - range.start + 1,
          "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`
        });
      } else {
        input.response.writeHead(200, {
          "Content-Type": input.content_type,
          "Content-Length": fileStat.size
        });
      }

      readStream.pipe(input.response);
    });

    readStream.once("error", (error) => {
      console.error(JSON.stringify({
        event: "cutter_api_stream_file_failed",
        file_path: input.file_path,
        range_enabled: input.range_enabled,
        range,
        error: error instanceof Error ? error.message : String(error)
      }));

      if (input.response.headersSent) {
        input.response.destroy(error);
      } else {
        writeError(input.response, 500, "file_stream_failed", "File stream failed");
      }
      settle();
    });

    input.response.once("finish", settle);
    input.response.once("close", settle);
    input.response.once("error", settle);
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function fileIsReadable(filePath: string): Promise<{
  readable: boolean;
  reason: string;
  file_size?: number;
}> {
  if (!filePath.trim()) {
    return {
      readable: false,
      reason: "源视频路径为空"
    };
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return {
        readable: false,
        reason: "路径不是文件"
      };
    }

    await access(filePath, constants.R_OK);
    return {
      readable: true,
      reason: "可读取",
      file_size: fileStat.size
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      readable: false,
      reason: code === "ENOENT"
        ? "文件不存在"
        : code === "EACCES" || code === "EPERM"
          ? "没有读取权限"
          : (error as Error).message || "读取失败"
    };
  }
}

async function readDirectFileCacheEntries(root: string): Promise<Array<{
  file_path: string;
  size: number;
  mtime_ms: number;
}>> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !isThumbnailCacheManifestFile(entry.name))
      .map(async (entry) => {
        const filePath = path.join(root, entry.name);
        try {
          const fileStat = await stat(filePath);
          return {
            file_path: filePath,
            size: fileStat.size,
            mtime_ms: fileStat.mtimeMs
          };
        } catch {
          return null;
        }
      })
  );

  return files.filter((file): file is {
    file_path: string;
    size: number;
    mtime_ms: number;
  } => Boolean(file));
}

async function directFileCacheSize(root: string): Promise<number> {
  return (await readDirectFileCacheEntries(root)).reduce((total, entry) => total + entry.size, 0);
}

async function recursiveFileCacheSize(root: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return recursiveFileCacheSize(entryPath);
      }
      if (!entry.isFile()) {
        return 0;
      }

      try {
        return (await stat(entryPath)).size;
      } catch {
        return 0;
      }
    })
  );
  return sizes.reduce((total, size) => total + size, 0);
}

async function pruneDirectFileCache(input: {
  root: string;
  max_bytes: number;
  keep_path?: string;
}): Promise<void> {
  const keepPath = input.keep_path ? path.resolve(input.keep_path) : "";
  const entries = await readDirectFileCacheEntries(input.root);
  let totalBytes = entries.reduce((total, entry) => total + entry.size, 0);

  for (const entry of entries
    .filter((item) => path.resolve(item.file_path) !== keepPath)
    .sort((left, right) => left.mtime_ms - right.mtime_ms)) {
    if (totalBytes <= input.max_bytes) {
      break;
    }

    try {
      await rm(entry.file_path, { force: true });
      totalBytes -= entry.size;
    } catch {
      // Cache pruning is best-effort; a concurrent request may be reading it.
    }
  }
}

function thumbnailCacheFileName(input: {
  source_video_id: string;
  source_file_path: string;
  source_size: number;
  source_mtime_ms: number;
}): string {
  const extension = path.extname(input.source_file_path).toLowerCase() || ".jpg";
  const safeExtension = /^\.[a-z0-9]{1,12}$/i.test(extension) ? extension : ".jpg";
  const hash = createHash("sha1")
    .update(input.source_video_id)
    .update("\0")
    .update(input.source_file_path)
    .update("\0")
    .update(String(input.source_size))
    .update("\0")
    .update(String(Math.floor(input.source_mtime_ms)))
    .digest("hex")
    .slice(0, 16);

  return `${input.source_video_id}-${hash}${safeExtension}`;
}

async function cachedThumbnailFilePath(input: {
  api_input: CreateCutterApiServerInput;
  source_video_id: string;
  source_file_path: string;
}): Promise<string> {
  const cacheRoot = thumbnailCacheRoot(input.api_input);
  const cachedFromManifest = async (): Promise<string | undefined> => {
    const manifest = await compactThumbnailCacheManifest(cacheRoot);
    const entries = Object.values(manifest.entries)
      .filter((entry) => entry.source_video_id === input.source_video_id)
      .sort((left, right) => Date.parse(right.cached_at) - Date.parse(left.cached_at));
    const exactCandidates = entries.filter((entry) => entry.source_file_path === input.source_file_path);
    const candidates = exactCandidates.length > 0 ? exactCandidates : entries;
    for (const entry of candidates) {
      const cacheFilePath = path.join(cacheRoot, entry.cache_file_name);
      const cacheStat = await stat(cacheFilePath).catch(() => null);
      if (cacheStat?.isFile() && cacheStat.size === entry.cache_size) {
        const now = new Date();
        void utimes(cacheFilePath, now, now).catch(() => undefined);
        return cacheFilePath;
      }
    }
    return undefined;
  };

  const sourceStat = await stat(input.source_file_path).catch(() => null);
  if (!sourceStat?.isFile()) {
    return (await cachedFromManifest()) ?? input.source_file_path;
  }

  const cacheFileName = thumbnailCacheFileName({
    source_video_id: input.source_video_id,
    source_file_path: input.source_file_path,
    source_size: sourceStat.size,
    source_mtime_ms: sourceStat.mtimeMs
  });
  const cacheFilePath = path.join(cacheRoot, cacheFileName);

  try {
    const cacheStat = await stat(cacheFilePath);
    if (cacheStat.isFile() && cacheStat.size === sourceStat.size) {
      const manifest = await readThumbnailCacheManifest(cacheRoot);
      if (!thumbnailManifestEntryMatchesSource({
        entry: manifest.entries[cacheFileName],
        source_video_id: input.source_video_id,
        source_file_path: input.source_file_path,
        source_size: sourceStat.size,
        source_mtime_ms: sourceStat.mtimeMs,
        cache_file_name: cacheFileName,
        cache_size: cacheStat.size
      })) {
        void upsertThumbnailCacheManifestEntry({
          root: cacheRoot,
          source_video_id: input.source_video_id,
          source_file_path: input.source_file_path,
          source_size: sourceStat.size,
          source_mtime_ms: sourceStat.mtimeMs,
          cache_file_name: cacheFileName,
          cache_file_path: cacheFilePath,
          cache_size: cacheStat.size
        }).catch(() => undefined);
      }
      const now = new Date();
      void utimes(cacheFilePath, now, now).catch(() => undefined);
      return cacheFilePath;
    }
  } catch {
    // Cache miss; copy below.
  }

  await mkdir(cacheRoot, { recursive: true });
  const tempPath = `${cacheFilePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await copyFile(input.source_file_path, tempPath);
    await rename(tempPath, cacheFilePath);
    const cachedStat = await stat(cacheFilePath);
    await upsertThumbnailCacheManifestEntry({
      root: cacheRoot,
      source_video_id: input.source_video_id,
      source_file_path: input.source_file_path,
      source_size: sourceStat.size,
      source_mtime_ms: sourceStat.mtimeMs,
      cache_file_name: cacheFileName,
      cache_file_path: cacheFilePath,
      cache_size: cachedStat.size
    });
    await pruneDirectFileCache({
      root: cacheRoot,
      max_bytes: thumbnailCacheMaxBytes(input.api_input),
      keep_path: cacheFilePath
    });
    void compactThumbnailCacheManifest(cacheRoot).catch(() => undefined);
    return cacheFilePath;
  } catch {
    await rm(tempPath, { force: true });
    return input.source_file_path;
  }
}

async function readRequestJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > 1_000_000) {
      throw new Error("request_body_too_large");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

function requiredString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }

  return value.trim();
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }

  return optionalTrimmed(value);
}

function requiredChineseString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function requestIpAddress(request: IncomingMessage): string | undefined {
  const forwardedFor = firstHeaderValue(request.headers["x-forwarded-for"]);
  const forwardedIp = forwardedFor.split(",")[0]?.trim();
  if (forwardedIp) {
    return forwardedIp;
  }

  return request.socket.remoteAddress?.trim() || undefined;
}

function currentNow(input: CreateCutterApiServerInput): string {
  return input.now?.() ?? new Date().toISOString();
}

function trustedDesktopSession(input: CreateCutterApiServerInput): AuthenticatedCutterSession {
  const now = currentNow(input);
  const userId = input.trusted_user_id?.trim() || "CU-DESKTOP-LOCAL";
  const username = input.trusted_username?.trim() || "Allen";

  return {
    user: {
      user_id: userId,
      username,
      display_name: username,
      status: "approved",
      applied_at: now,
      approved_at: now,
      rejected_at: "",
      disabled_at: "",
      last_login_at: now,
      last_used_at: now,
      note: "Windows 桌面端本地可信会话",
      devices: [
        {
          device_id: "desktop-local",
          device_name: "MixLab Windows Desktop",
          status: "active",
          first_seen_at: now,
          last_login_at: now
        }
      ]
    },
    device_id: "desktop-local"
  };
}

async function requireCutterSession(input: {
  api_input: CreateCutterApiServerInput;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<AuthenticatedCutterSession | null> {
  if (input.api_input.auth_mode === "local_trusted") {
    return trustedDesktopSession(input.api_input);
  }

  const deviceId = firstHeaderValue(input.request.headers["x-mixlab-device-id"]);
  const sessionToken = firstHeaderValue(input.request.headers["x-mixlab-session-token"]);

  if (!deviceId || !sessionToken) {
    writeError(input.response, 401, "login_required", "请先登录剪辑工作台");
    return null;
  }

  const validation = await validateCutterSession(input.api_input.library_root, {
    device_id: deviceId,
    session_token: sessionToken,
    now: currentNow(input.api_input)
  });

  if (!validation.ok) {
    writeError(input.response, 401, "login_required", validation.reason);
    return null;
  }

  return {
    user: validation.user,
    device_id: deviceId
  };
}

async function recordCutterUsageEventBestEffort(input: {
  api_input: CreateCutterApiServerInput;
  auth: AuthenticatedCutterSession;
  event_type: Parameters<typeof appendUsageEvent>[1]["event_type"];
  source_video_id?: string;
  cut_job_id?: string;
  query?: string;
  search_mode?: Parameters<typeof appendUsageEvent>[1]["search_mode"];
  search_page_type?: Parameters<typeof appendUsageEvent>[1]["search_page_type"];
  search_elapsed_ms?: number;
  selected_duration_ms?: number;
  result_status?: Parameters<typeof appendUsageEvent>[1]["result_status"];
}): Promise<void> {
  try {
    const recorder = input.api_input.usage_event_recorder ?? appendUsageEvent;
    await recorder(input.api_input.library_root, {
      user_id: input.auth.user.user_id,
      username: input.auth.user.username,
      device_id: input.auth.device_id,
      event_type: input.event_type,
      occurred_at: currentNow(input.api_input),
      source_video_id: input.source_video_id,
      cut_job_id: input.cut_job_id,
      query: input.query,
      search_mode: input.search_mode,
      search_page_type: input.search_page_type,
      search_elapsed_ms: input.search_elapsed_ms,
      selected_duration_ms: input.selected_duration_ms,
      result_status: input.result_status
    });
  } catch {
    // Usage analytics are best-effort for cutter workflows. Do not let malformed
    // history or write failures turn successful search/view/cut actions into 500s.
  }
}

async function recordCutterUsageEventsBestEffort(
  events: Array<Parameters<typeof recordCutterUsageEventBestEffort>[0]>
): Promise<void> {
  for (const event of events) {
    await recordCutterUsageEventBestEffort(event);
  }
}

function selectedDurationMs(input: { begin_ms: number; end_ms: number }): number {
  return Math.max(input.end_ms - input.begin_ms, 0);
}

function optionalNonNegativeInteger(value: unknown, fallback: number, key: string): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return value;
}

function requiredNonNegativeInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }

  return value;
}

function parseCutMode(value: unknown): CutMode {
  if (value === undefined || value === null || value === "") {
    return "copy";
  }

  if (value === "copy" || value === "smart" || value === "precise") {
    return value;
  }

  throw new Error("cut_mode must be copy, smart, or precise");
}

function formatClipTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function runFfmpegAsync(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`);
      reject(new Error(`ffmpeg clip cut failed: ${reason}`));
    });
  });
}

function runProcessForStdoutAsync(input: {
  executable: string;
  args: string[];
  timeout_ms: number;
  failure_label: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${input.failure_label} timed out after ${input.timeout_ms}ms`));
    }, Math.max(250, input.timeout_ms));

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const reason = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`);
      reject(new Error(`${input.failure_label} failed: ${reason}`));
    });
  });
}

function windowsExplorerCommand(env: NodeJS.ProcessEnv): string {
  const windowsRoot = env.SystemRoot?.trim() || env.WINDIR?.trim();
  return windowsRoot ? path.win32.join(windowsRoot, "explorer.exe") : "explorer.exe";
}

export function buildOpenPathCommandPlan(input: {
  target_path: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}): OpenPathCommandPlan {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;

  if (platform === "darwin") {
    return { command: "open", args: [input.target_path] };
  }

  if (platform === "win32") {
    return { command: windowsExplorerCommand(env), args: [input.target_path] };
  }

  return { command: "xdg-open", args: [input.target_path] };
}

function defaultOpenPath(targetPath: string): Promise<void> {
  const { command, args } = buildOpenPathCommandPlan({ target_path: targetPath });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      windowsHide: true,
      stdio: "ignore"
    });

    child.once("error", (error) => {
      reject(new Error(`open directory failed: ${error.message}`));
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function defaultCutRunner(input: CutterClipCutRunnerInput): Promise<void> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfmpegCutPlan({
    source_path: input.source_video_path,
    output_path: input.output_path,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    cut_mode: input.cut_mode
  });

  await runFfmpegAsync(runtime.ffmpeg_path, plan.args);
}

async function defaultCoverRunner(input: {
  source_video_path: string;
  output_path: string;
  at_ms: number;
  width: number;
}): Promise<void> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfmpegCoverImagePlan({
    source_path: input.source_video_path,
    output_path: input.output_path,
    at_ms: input.at_ms,
    width: input.width
  });

  await runFfmpegAsync(runtime.ffmpeg_path, plan.args);
}

async function defaultSourceVideoProbeRunner(input: {
  source_video_path: string;
  timeout_ms: number;
}): Promise<SourceVideoMediaMetadata> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfprobeSourceMetadataPlan({
    source_path: input.source_video_path
  });
  const runProbe = async (executable: string) => runProcessForStdoutAsync({
    executable,
    args: plan.args,
    timeout_ms: input.timeout_ms,
    failure_label: "ffprobe source video preflight"
  });

  let stdout: string;
  try {
    stdout = await runProbe(runtime.ffprobe_path);
  } catch (error) {
    if (runtime.source === "env") {
      throw error;
    }

    try {
      stdout = await runProbe("ffprobe");
    } catch {
      throw error;
    }
  }

  return parseFfprobeSourceMetadata(stdout);
}

const VISIBLE_DETAIL_CACHE_TTL_MS = 10_000;

interface VisibleDetailCacheEntry {
  expires_at_ms: number;
  promise: Promise<CutterSourceVideoDetail | null>;
}

const visibleDetailCacheByInput = new WeakMap<
  CreateCutterApiServerInput,
  Map<string, VisibleDetailCacheEntry>
>();

async function loadVisibleDetailUncached(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  try {
    const searchdDetail = await searchCutterSourceVideoDetailViaSearchd({
      api_input: input,
      source_video_id: sourceVideoId
    });

    if (searchdDetail) {
      return searchdDetail;
    }
  } catch {
    // If searchd is restarting or does not expose detail yet, preserve the
    // existing artifact-backed detail path.
  }

  try {
    const releaseRoot = await releaseRootForFastLibraryRead(input);
    return await getCutterSourceVideoDetail({
      library_root: input.library_root,
      ...(releaseRoot ? { release_root: releaseRoot } : {}),
      source_video_id: sourceVideoId
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function loadVisibleDetail(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  const nowMs = Date.now();
  let cache = visibleDetailCacheByInput.get(input);
  if (!cache) {
    cache = new Map();
    visibleDetailCacheByInput.set(input, cache);
  }

  const cached = cache.get(sourceVideoId);
  if (cached && cached.expires_at_ms > nowMs) {
    return cached.promise;
  }

  const promise = loadVisibleDetailUncached(input, sourceVideoId).catch((error) => {
    cache.delete(sourceVideoId);
    throw error;
  });
  cache.set(sourceVideoId, {
    expires_at_ms: nowMs + VISIBLE_DETAIL_CACHE_TTL_MS,
    promise
  });

  return promise;
}

async function loadReadableTranscriptDetail(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  const visibleDetail = await loadVisibleDetail(input, sourceVideoId);
  if (visibleDetail) {
    return visibleDetail;
  }

  try {
    const searchdDetail = await searchCutterSourceVideoTranscriptDetailViaSearchd({
      api_input: input,
      source_video_id: sourceVideoId
    });

    if (searchdDetail) {
      return searchdDetail;
    }
  } catch {
    // Preserve direct detail access while searchd is restarting or rebuilding.
  }

  return loadVisibleDetail(input, sourceVideoId);
}

async function readLibraryId(
  libraryRoot: string,
  reader?: (library_root: string) => Promise<string>
): Promise<string> {
  try {
    const libraryId = reader
      ? await reader(libraryRoot)
      : (JSON.parse(
          await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8")
        ) as { library_id?: unknown }).library_id;

    if (typeof libraryId === "string" && libraryId.trim()) {
      return libraryId.trim();
    }
  } catch {
    // A hand-built fixture may not have library.json; keep the local bridge usable.
  }

  return "local-library";
}

interface LibraryIdRuntimeCacheEntry {
  expires_at_ms: number;
  value?: string;
  promise?: Promise<string>;
}

const libraryIdRuntimeCacheByInput = new WeakMap<
  CreateCutterApiServerInput,
  LibraryIdRuntimeCacheEntry
>();

function readLibraryIdFromInput(input: CreateCutterApiServerInput): Promise<string> {
  return readLibraryId(input.library_root, input.library_id_reader);
}

async function readLibraryIdBestEffort(
  input: CreateCutterApiServerInput,
  fallback = "lib_main_001"
): Promise<string> {
  const nowMs = Date.now();
  let cache = libraryIdRuntimeCacheByInput.get(input);

  if (!cache) {
    cache = {
      expires_at_ms: 0
    };
    libraryIdRuntimeCacheByInput.set(input, cache);
  }

  if (cache.value && cache.expires_at_ms > nowMs) {
    return cache.value;
  }

  if (!cache.promise) {
    cache.promise = readLibraryIdFromInput(input)
      .then((value) => {
        cache.value = value;
        cache.expires_at_ms = Date.now() + LIBRARY_ID_CACHE_TTL_MS;
        return value;
      })
      .catch(() => {
        const value = cache.value ?? fallback;
        cache.value = value;
        cache.expires_at_ms = Date.now() + Math.min(5_000, LIBRARY_ID_CACHE_TTL_MS);
        return value;
      })
      .finally(() => {
        if (cache) {
          delete cache.promise;
        }
      });
  }

  if (!cache.value) {
    return fallback;
  }

  return delayedFallback(
    cache.promise,
    LIBRARY_ID_INLINE_TIMEOUT_MS,
    cache.value
  );
}

async function readReadyVideoCount(libraryRoot: string): Promise<number> {
  try {
    const current = JSON.parse(
      await readFile(
        path.join(libraryRoot, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
        "utf8"
      )
    ) as { current_version?: unknown };

    if (typeof current.current_version === "string" && current.current_version.trim()) {
      const manifest = JSON.parse(
        await readFile(
          path.join(
            libraryRoot,
            ".mixlab-library",
            "indexes",
            "source-transcript-index",
            current.current_version,
            "index-manifest.json"
          ),
          "utf8"
        )
      ) as { ready_video_count?: unknown; source_video_ids?: unknown };

      if (typeof manifest.ready_video_count === "number") {
        return manifest.ready_video_count;
      }

      if (Array.isArray(manifest.source_video_ids)) {
        return manifest.source_video_ids.length;
      }
    }
  } catch {
    // Fall through to library.json for older or partially built libraries.
  }

  try {
    const library = JSON.parse(
      await readFile(path.join(libraryRoot, ".mixlab-library", "library.json"), "utf8")
    ) as { ready_video_count?: unknown };

    if (typeof library.ready_video_count === "number") {
      return library.ready_video_count;
    }
  } catch {
    // A hand-built fixture may not have library.json.
  }

  return 0;
}

async function readSqliteSearchBackendStatus(input: {
  library_root: string;
  preferred_mode?: CutterSearchBackendStatus["preferred_mode"];
  degraded_reason?: string;
}): Promise<CutterSearchBackendStatus> {
  const preferredMode = input.preferred_mode ?? "sqlite-index";

  try {
    const current = JSON.parse(
      await readFile(
        path.join(input.library_root, ".mixlab-library", "indexes", "source-transcript-index", "current.json"),
        "utf8"
      )
    ) as { current_version?: unknown };
    const currentVersion =
      typeof current.current_version === "string" && current.current_version.trim()
        ? current.current_version.trim()
        : "";

    if (currentVersion) {
      const manifest = JSON.parse(
        await readFile(
          path.join(
            input.library_root,
            ".mixlab-library",
            "indexes",
            "source-transcript-index",
            currentVersion,
            "index-manifest.json"
          ),
          "utf8"
        )
      ) as Record<string, unknown>;
      const sourceVideoCount = typeof manifest.ready_video_count === "number"
        ? manifest.ready_video_count
        : Array.isArray(manifest.source_video_ids)
          ? manifest.source_video_ids.length
          : 0;
      const degraded = preferredMode !== "sqlite-index";

      return {
        mode: "sqlite-index",
        preferred_mode: preferredMode,
        label: degraded ? "本地索引（searchd 未响应）" : "本地索引",
        healthy: true,
        degraded,
        index_version: stringField(manifest, "index_version", currentVersion),
        source_video_count: Math.max(0, Math.round(sourceVideoCount)),
        segment_count: 0,
        message: degraded
          ? "本地 searchd 未响应，首批搜索会降级到 SQLite 索引"
          : "SQLite 搜索索引可用"
      };
    }
  } catch {
    // Fall through to transcript artifact fallback.
  }

  return {
    mode: "transcript-artifact-fallback",
    preferred_mode: preferredMode,
    label: preferredMode === "searchd" ? "文案兜底（searchd 未响应）" : "文案兜底",
    healthy: true,
    degraded: true,
    index_version: "",
    source_video_count: await readReadyVideoCount(input.library_root),
    segment_count: 0,
    message: input.degraded_reason ?? "未发现可用搜索索引，搜索会读取文案 artifact 兜底"
  };
}

async function readSearchBackendStatusFresh(
  input: CreateCutterApiServerInput,
  fallbackSourceVideoCount: number
): Promise<CutterSearchBackendStatus> {
  const searchdBaseUrl = optionalTrimmed(input.searchd_base_url);

  if (searchdBaseUrl) {
    try {
      return await readSearchdBackendStatus({
        searchd_base_url: searchdBaseUrl,
        searchd_fetch: input.searchd_fetch,
        searchd_timeout_ms: input.searchd_timeout_ms
      });
    } catch {
      return {
        mode: "searchd",
        preferred_mode: "searchd",
        label: "本地 searchd（启动中）",
        healthy: false,
        degraded: true,
        index_version: "",
        source_video_count: fallbackSourceVideoCount,
        segment_count: 0,
        message: "本地搜索服务正在启动或缓存索引，素材搜索会稍后自动恢复"
      };
    }
  }

  return delayedFallback(
    readSqliteSearchBackendStatus({
      library_root: input.library_root
    }),
    Math.max(250, input.searchd_timeout_ms ?? 800),
    {
      mode: "transcript-artifact-fallback",
      preferred_mode: "sqlite-index",
      label: "文案兜底（状态读取中）",
      healthy: false,
      degraded: true,
      index_version: "",
      source_video_count: fallbackSourceVideoCount,
      segment_count: 0,
      message: "搜索索引状态读取较慢，工作台先进入可用状态"
    }
  );
}

function checkingSearchBackendStatus(
  input: CreateCutterApiServerInput,
  fallbackSourceVideoCount: number
): CutterSearchBackendStatus {
  const searchdBaseUrl = optionalTrimmed(input.searchd_base_url);

  if (searchdBaseUrl) {
    return {
      mode: "searchd",
      preferred_mode: "searchd",
      label: "本地 searchd（状态读取中）",
      healthy: false,
      degraded: true,
      index_version: "",
      source_video_count: fallbackSourceVideoCount,
      segment_count: 0,
      message: "本地搜索服务状态读取中，页面先进入可用状态"
    };
  }

  return {
    mode: "transcript-artifact-fallback",
    preferred_mode: "sqlite-index",
    label: "搜索索引（状态读取中）",
    healthy: false,
    degraded: true,
    index_version: "",
    source_video_count: fallbackSourceVideoCount,
    segment_count: 0,
    message: "搜索索引状态读取中，页面先进入可用状态"
  };
}

interface SearchBackendRuntimeStatusCacheEntry {
  expires_at_ms: number;
  status?: CutterSearchBackendStatus;
  promise?: Promise<CutterSearchBackendStatus>;
}

const searchBackendRuntimeStatusByInput = new WeakMap<
  CreateCutterApiServerInput,
  SearchBackendRuntimeStatusCacheEntry
>();

async function readSearchBackendStatus(
  input: CreateCutterApiServerInput,
  fallbackSourceVideoCount: number
): Promise<CutterSearchBackendStatus> {
  const nowMs = Date.now();
  let cache = searchBackendRuntimeStatusByInput.get(input);

  if (!cache) {
    cache = {
      expires_at_ms: 0
    };
    searchBackendRuntimeStatusByInput.set(input, cache);
  }

  if (cache.status && cache.expires_at_ms > nowMs) {
    return cache.status;
  }

  if (!cache.promise) {
    cache.promise = new Promise<CutterSearchBackendStatus>((resolve, reject) => {
      setTimeout(() => {
        readSearchBackendStatusFresh(input, fallbackSourceVideoCount).then(resolve, reject);
      }, 0);
    })
      .then((status) => {
        cache.status = status;
        cache.expires_at_ms = Date.now() + SEARCH_BACKEND_STATUS_CACHE_TTL_MS;
        return status;
      })
      .catch(() => {
        const fallback = cache.status ?? checkingSearchBackendStatus(input, fallbackSourceVideoCount);
        cache.status = fallback;
        cache.expires_at_ms = Date.now() + Math.min(5_000, SEARCH_BACKEND_STATUS_CACHE_TTL_MS);
        return fallback;
      })
      .finally(() => {
        if (cache) {
          delete cache.promise;
        }
      });
  }

  if (!cache.status) {
    return checkingSearchBackendStatus(input, fallbackSourceVideoCount);
  }

  return delayedFallback(
    cache.promise,
    SEARCH_BACKEND_STATUS_INLINE_TIMEOUT_MS,
    cache.status
  );
}

function pathLabel(filePath: string | undefined, fallback: string): string {
  if (!filePath) {
    return fallback;
  }

  return path.basename(filePath) || filePath;
}

function releaseCacheRootForInput(input: CreateCutterApiServerInput): string | undefined {
  return input.release_cache_root?.trim() || undefined;
}

function releaseSyncTimeoutMs(input: CreateCutterApiServerInput): number {
  return Math.max(150, input.release_sync_timeout_ms ?? 450);
}

function releaseCacheMaxReleases(input: CreateCutterApiServerInput): number | undefined {
  if (
    typeof input.release_cache_max_releases !== "number" ||
    !Number.isFinite(input.release_cache_max_releases)
  ) {
    return undefined;
  }

  return Math.max(1, Math.floor(input.release_cache_max_releases));
}

function releaseCacheRuntimeStatusFromLocal(
  status: CutterReleaseCacheStatus,
  syncStatus: CutterReleaseCacheRuntimeStatus["sync_status"],
  sourceReleaseVersion = ""
): CutterReleaseCacheRuntimeStatus {
  return {
    enabled: true,
    ready: status.cache_ready,
    sync_status: status.cache_ready ? syncStatus : "unavailable",
    active_release_version: status.active_release_version,
    source_release_version: sourceReleaseVersion,
    search_index_version: status.search_index_version,
    ready_video_count: status.ready_video_count,
    cached_release_versions: status.cached_release_versions,
    cached_release_count: status.cached_release_count,
    max_cached_releases: status.max_cached_releases,
    cache_size_bytes: status.cache_size_bytes,
    pruned_release_versions: [],
    cache_root_path: status.cache_root,
    catalog_file_path: status.catalog_file_path,
    message: status.message
  };
}

function disabledReleaseCacheRuntimeStatus(): CutterReleaseCacheRuntimeStatus {
  return {
    enabled: false,
    ready: false,
    sync_status: "unavailable",
    active_release_version: "",
    source_release_version: "",
    search_index_version: "",
    ready_video_count: 0,
    cached_release_versions: [],
    cached_release_count: 0,
    max_cached_releases: 0,
    cache_size_bytes: 0,
    pruned_release_versions: [],
    cache_root_path: "",
    catalog_file_path: "",
    message: "本机 Release 缓存未启用"
  };
}

function refreshingReleaseCacheRuntimeStatus(
  input: CreateCutterApiServerInput,
  cacheRoot: string,
  previous?: CutterReleaseCacheRuntimeStatus
): CutterReleaseCacheRuntimeStatus {
  return {
    enabled: true,
    ready: previous?.ready ?? false,
    sync_status: "syncing",
    active_release_version: previous?.active_release_version ?? "",
    source_release_version: previous?.source_release_version ?? "",
    search_index_version: previous?.search_index_version ?? "",
    ready_video_count: previous?.ready_video_count ?? 0,
    cached_release_versions: previous?.cached_release_versions ?? [],
    cached_release_count: previous?.cached_release_count ?? 0,
    max_cached_releases: previous?.max_cached_releases ?? releaseCacheMaxReleases(input) ?? 2,
    cache_size_bytes: previous?.cache_size_bytes ?? 0,
    pruned_release_versions: [],
    cache_root_path: cacheRoot,
    catalog_file_path: previous?.catalog_file_path ?? "",
    message: previous?.ready
      ? "本机 Release 缓存状态正在后台刷新"
      : "本机 Release 缓存正在后台准备"
  };
}

interface ReleaseCacheRuntimeCacheEntry {
  expires_at_ms: number;
  status?: CutterReleaseCacheRuntimeStatus;
  promise?: Promise<CutterReleaseCacheRuntimeStatus>;
}

const releaseCacheRuntimeStatusByInput = new WeakMap<
  CreateCutterApiServerInput,
  ReleaseCacheRuntimeCacheEntry
>();

interface FastLibraryReadState {
  release_root?: string;
  release_version: string;
}

interface SourceLibraryPagePayload {
  library_id: string;
  available_video_count: number;
  videos: ApiSourceVideoCard[];
  source_folders?: CutterSourceFolderOption[];
}

interface SourceLibraryPageCacheEntry {
  expires_at_ms: number;
  promise: Promise<SourceLibraryPagePayload>;
}

const sourceLibraryPageCacheByInput = new WeakMap<
  CreateCutterApiServerInput,
  Map<string, SourceLibraryPageCacheEntry>
>();

interface SearchIndexWarmupCacheEntry {
  release_version: string;
  status: SearchIndexWarmupStatus;
  promise?: Promise<void>;
}

const searchIndexWarmupByInput = new WeakMap<
  CreateCutterApiServerInput,
  SearchIndexWarmupCacheEntry
>();

function idleSearchIndexWarmupStatus(): SearchIndexWarmupStatus {
  return {
    status: "idle",
    release_version: "",
    query: SEARCH_INDEX_WARMUP_QUERY,
    index_version: "",
    returned_count: 0,
    search_ms: 0,
    warmed_at: ""
  };
}

function readSearchIndexWarmupStatus(input: CreateCutterApiServerInput): SearchIndexWarmupStatus {
  return searchIndexWarmupByInput.get(input)?.status ?? idleSearchIndexWarmupStatus();
}

function scheduleSearchIndexWarmup(
  input: CreateCutterApiServerInput,
  status: CutterReleaseCacheRuntimeStatus
): void {
  const releaseRoot = releaseCacheRootForInput(input);
  if (!releaseRoot || !status.ready || !status.active_release_version) {
    return;
  }

  const current = searchIndexWarmupByInput.get(input);
  if (
    current?.release_version === status.active_release_version &&
    (current.promise || current.status.status === "ready")
  ) {
    return;
  }

  const startedAt = input.now?.() ?? new Date().toISOString();
  const entry: SearchIndexWarmupCacheEntry = {
    release_version: status.active_release_version,
    status: {
      status: "warming",
      release_version: status.active_release_version,
      query: SEARCH_INDEX_WARMUP_QUERY,
      index_version: status.search_index_version,
      returned_count: 0,
      search_ms: 0,
      warmed_at: startedAt
    }
  };
  searchIndexWarmupByInput.set(input, entry);

  const runner = input.search_index_warmup_runner ?? ((warmupInput) =>
    searchCutterSourceLibrary({
      library_root: warmupInput.library_root,
      release_root: warmupInput.release_root,
      query: warmupInput.query,
      limit: warmupInput.limit
    }).then((result) => ({
      index_version: result.index_version,
      returned_count: result.returned_count,
      search_ms: result.search_ms
    }))
  );

  entry.promise = runner({
    library_root: input.library_root,
    release_root: releaseRoot,
    query: SEARCH_INDEX_WARMUP_QUERY,
    limit: 1
  })
    .then((result) => {
      entry.status = {
        status: "ready",
        release_version: status.active_release_version,
        query: SEARCH_INDEX_WARMUP_QUERY,
        index_version: result.index_version || status.search_index_version,
        returned_count: result.returned_count,
        search_ms: result.search_ms,
        warmed_at: input.now?.() ?? new Date().toISOString()
      };
    })
    .catch((error) => {
      entry.status = {
        status: "failed",
        release_version: status.active_release_version,
        query: SEARCH_INDEX_WARMUP_QUERY,
        index_version: status.search_index_version,
        returned_count: 0,
        search_ms: 0,
        warmed_at: input.now?.() ?? new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      };
    })
    .finally(() => {
      delete entry.promise;
    });
}

function sourceLibraryPageCacheKey(input: {
  state: FastLibraryReadState;
  limit: number;
  offset: number;
  source_folder_name?: string;
}): string {
  return [
    input.state.release_root ?? "source",
    input.state.release_version || "fallback",
    input.limit,
    input.offset,
    input.source_folder_name ?? ""
  ].join("\0");
}

function sourceLibraryPageCacheForInput(
  input: CreateCutterApiServerInput
): Map<string, SourceLibraryPageCacheEntry> {
  let cache = sourceLibraryPageCacheByInput.get(input);
  if (!cache) {
    cache = new Map();
    sourceLibraryPageCacheByInput.set(input, cache);
  }

  return cache;
}

async function loadSourceLibraryPageWithState(
  input: CreateCutterApiServerInput,
  state: FastLibraryReadState,
  limit: number,
  offset: number,
  sourceFolderName?: string
): Promise<SourceLibraryPagePayload> {
  const cache = sourceLibraryPageCacheForInput(input);
  const key = sourceLibraryPageCacheKey({ state, limit, offset, source_folder_name: sourceFolderName });
  const nowMs = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expires_at_ms > nowMs) {
    return cached.promise;
  }

  const promise = (async (): Promise<SourceLibraryPagePayload> => {
    const library = await listCutterSourceLibrary({
      library_root: input.library_root,
      ...(state.release_root ? { release_root: state.release_root } : {}),
      limit,
      offset,
      source_folder_name: sourceFolderName
    });

    return {
      library_id: await readLibraryIdBestEffort(input),
      available_video_count: library.available_video_count,
      ...(library.source_folders ? { source_folders: library.source_folders } : {}),
      videos: library.videos.map(addSourceVideoUrls)
    };
  })().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, {
    expires_at_ms: nowMs + SOURCE_LIBRARY_PAGE_CACHE_TTL_MS,
    promise
  });

  return promise;
}

function scheduleSourceLibraryFirstPageWarmup(
  input: CreateCutterApiServerInput,
  status: CutterReleaseCacheRuntimeStatus
): Promise<unknown> | undefined {
  const releaseRoot = releaseCacheRootForInput(input);
  if (!releaseRoot || !status.ready || !status.active_release_version) {
    return undefined;
  }

  return loadSourceLibraryPageWithState(
    input,
    {
      release_root: releaseRoot,
      release_version: status.active_release_version
    },
    SOURCE_LIBRARY_DEFAULT_PAGE_LIMIT,
    0
  ).catch(() => undefined);
}

function scheduleReleaseCacheWarmups(
  input: CreateCutterApiServerInput,
  status: CutterReleaseCacheRuntimeStatus
): void {
  if (!status.ready) {
    return;
  }

  const firstPageWarmup = scheduleSourceLibraryFirstPageWarmup(input, status);
  if (firstPageWarmup) {
    void firstPageWarmup.finally(() => {
      scheduleSearchIndexWarmup(input, status);
    });
    return;
  }

  scheduleSearchIndexWarmup(input, status);
}

function syncCutterReleaseCacheRuntimeStatusUncached(
  input: CreateCutterApiServerInput
): Promise<CutterReleaseCacheRuntimeStatus> {
  const cacheRoot = releaseCacheRootForInput(input);
  if (!cacheRoot) {
    return Promise.resolve(disabledReleaseCacheRuntimeStatus());
  }
  const syncRunner = input.release_cache_sync_runner ?? syncCutterReleaseCache;
  const statusReader = input.release_cache_status_reader ?? readLocalCutterReleaseCacheStatus;

  return syncRunner({
    source_library_root: input.library_root,
    cache_root: cacheRoot,
    max_cached_releases: releaseCacheMaxReleases(input),
    include_cache_size: false
  })
    .then((result): CutterReleaseCacheRuntimeStatus => ({
      enabled: true,
      ready: result.cache_ready,
      sync_status: result.cache_ready ? "ready" : "unavailable",
      active_release_version: result.active_release_version,
      source_release_version: result.source_release_version,
      search_index_version: result.search_index_version,
      ready_video_count: result.ready_video_count,
      cached_release_versions: result.cached_release_versions,
      cached_release_count: result.cached_release_count,
      max_cached_releases: result.max_cached_releases,
      cache_size_bytes: result.cache_size_bytes,
      pruned_release_versions: result.pruned_release_versions,
      cache_root_path: result.cache_root,
      catalog_file_path: result.catalog_file_path,
      message: result.message
    }))
    .catch(async () =>
      releaseCacheRuntimeStatusFromLocal(
        await statusReader({
          cache_root: cacheRoot,
          max_cached_releases: releaseCacheMaxReleases(input),
          include_cache_size: false
        }),
        "failed"
      )
    );
}

async function syncCutterReleaseCacheBestEffort(
  input: CreateCutterApiServerInput
): Promise<CutterReleaseCacheRuntimeStatus> {
  const cacheRoot = releaseCacheRootForInput(input);
  if (!cacheRoot) {
    return disabledReleaseCacheRuntimeStatus();
  }

  const nowMs = Date.now();
  let cache = releaseCacheRuntimeStatusByInput.get(input);

  if (!cache) {
    cache = {
      expires_at_ms: 0
    };
    releaseCacheRuntimeStatusByInput.set(input, cache);
  }

  if (cache.status && cache.expires_at_ms > nowMs) {
    scheduleReleaseCacheWarmups(input, cache.status);
    return cache.status;
  }

  if (!cache.promise) {
    cache.promise = new Promise<CutterReleaseCacheRuntimeStatus>((resolve, reject) => {
      setTimeout(() => {
        syncCutterReleaseCacheRuntimeStatusUncached(input).then(resolve, reject);
      }, RELEASE_CACHE_BACKGROUND_SYNC_DELAY_MS);
    })
      .then((status) => {
        cache.status = status;
        cache.expires_at_ms = Date.now() + (
          status.cache_size_bytes > 0 ? RELEASE_CACHE_STATUS_CACHE_TTL_MS : 5_000
        );
        scheduleReleaseCacheWarmups(input, status);
        return status;
      })
      .catch((error): CutterReleaseCacheRuntimeStatus => {
        const fallback = refreshingReleaseCacheRuntimeStatus(input, cacheRoot, cache.status);
        cache.status = {
          ...fallback,
          sync_status: "failed",
          message: `本机 Release 缓存后台刷新失败：${(error as Error).message || "未知错误"}`
        };
        cache.expires_at_ms = Date.now() + Math.min(30_000, RELEASE_CACHE_STATUS_CACHE_TTL_MS);
        return cache.status;
      })
      .finally(() => {
        if (cache) {
          delete cache.promise;
        }
      });
  }

  const pendingSync = cache.promise;
  const localFallback = await localReleaseCacheRuntimeStatusFallback(input, cacheRoot, cache.status);
  if (!cache.status) {
    cache.status = localFallback;
    cache.expires_at_ms = Date.now() + Math.min(5_000, RELEASE_CACHE_STATUS_CACHE_TTL_MS);
    scheduleReleaseCacheWarmups(input, localFallback);
    return localFallback;
  }

  const status = await delayedFallback(
    pendingSync,
    Math.min(releaseSyncTimeoutMs(input), RELEASE_CACHE_STATUS_INLINE_TIMEOUT_MS),
    localFallback
  );
  scheduleReleaseCacheWarmups(input, status);
  return status;
}

async function localReleaseCacheRuntimeStatusFallback(
  input: CreateCutterApiServerInput,
  cacheRoot: string,
  previous?: CutterReleaseCacheRuntimeStatus
): Promise<CutterReleaseCacheRuntimeStatus> {
  try {
    const localStatus = input.release_cache_status_reader
      ? await input.release_cache_status_reader({
          cache_root: cacheRoot,
          max_cached_releases: releaseCacheMaxReleases(input),
          include_cache_size: false
        })
      : await readFastLocalCutterReleaseCacheStatus({
          cache_root: cacheRoot,
          max_cached_releases: releaseCacheMaxReleases(input)
        });

    if (localStatus.cache_ready) {
      return releaseCacheRuntimeStatusFromLocal(
        localStatus,
        previous?.sync_status === "failed" ? "failed" : "syncing",
        previous?.source_release_version
      );
    }
  } catch {
    // Keep startup resilient: if the local cache status read fails, fall back to
    // the existing background-refresh state and let the sync promise finish.
  }

  return refreshingReleaseCacheRuntimeStatus(input, cacheRoot, previous);
}

async function releaseRootForFastLibraryRead(
  input: CreateCutterApiServerInput
): Promise<string | undefined> {
  const state = await fastLibraryReadState(input);
  return state.release_root;
}

async function fastLibraryReadState(
  input: CreateCutterApiServerInput
): Promise<FastLibraryReadState> {
  const cacheRoot = releaseCacheRootForInput(input);
  if (!cacheRoot) {
    return {
      release_version: ""
    };
  }
  const status = await syncCutterReleaseCacheBestEffort(input);
  return status.ready
    ? {
        release_root: cacheRoot,
        release_version: status.active_release_version
      }
    : {
        release_version: ""
      };
}

async function loadSourceLibraryPage(
  input: CreateCutterApiServerInput,
  request: {
    limit: number;
    offset: number;
    source_folder_name?: string;
  }
): Promise<SourceLibraryPagePayload> {
  const state = await fastLibraryReadState(input);
  return loadSourceLibraryPageWithState(
    input,
    state,
    request.limit,
    request.offset,
    request.source_folder_name
  );
}

function checkingSourceVideoPreflightStatus(): CutterSourceVideoPreflightStatus {
  return {
    status: "checking",
    checked_count: 0,
    readable_count: 0,
    probe_count: 0,
    probe_readable_count: 0,
    sample_count: SOURCE_PREFLIGHT_SAMPLE_COUNT,
    samples: [],
    message: "源视频可读性正在后台检查"
  };
}

interface SourceVideoPreflightCacheEntry {
  expires_at_ms: number;
  status?: CutterSourceVideoPreflightStatus;
  promise?: Promise<CutterSourceVideoPreflightStatus>;
}

const sourceVideoPreflightCacheByInput = new WeakMap<
  CreateCutterApiServerInput,
  SourceVideoPreflightCacheEntry
>();

async function probeSourceVideoMedia(input: {
  api_input: CreateCutterApiServerInput;
  source_video_file_path: string;
}): Promise<CutterSourceVideoMediaProbe> {
  const runner = input.api_input.source_video_probe_runner ?? defaultSourceVideoProbeRunner;

  try {
    const metadata = await runner({
      source_video_path: input.source_video_file_path,
      timeout_ms: SOURCE_PREFLIGHT_PROBE_TIMEOUT_MS
    });

    if (metadata.duration_ms <= 0 || metadata.width <= 0 || metadata.height <= 0) {
      return {
        checked: true,
        ok: false,
        duration_ms: metadata.duration_ms,
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        reason: "媒体流信息不完整"
      };
    }

    return {
      checked: true,
      ok: true,
      duration_ms: metadata.duration_ms,
      width: metadata.width,
      height: metadata.height,
      codec: metadata.codec,
      reason: "FFprobe 可解析"
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      reason: (error as Error).message || "FFprobe 检测失败"
    };
  }
}

async function readSourceVideoPreflightStatusUncached(
  input: CreateCutterApiServerInput
): Promise<CutterSourceVideoPreflightStatus> {
  const releaseRoot = await releaseRootForFastLibraryRead(input);
  const library = await listCutterSourceLibrary({
    library_root: input.library_root,
    ...(releaseRoot ? { release_root: releaseRoot } : {}),
    limit: SOURCE_PREFLIGHT_SAMPLE_COUNT,
    offset: 0
  });

  if (library.videos.length === 0) {
    return {
      status: "unavailable",
      checked_count: 0,
      readable_count: 0,
      probe_count: 0,
      probe_readable_count: 0,
      sample_count: SOURCE_PREFLIGHT_SAMPLE_COUNT,
      samples: [],
      message: "暂无可预检的源视频"
    };
  }

  const samples = await Promise.all(
    library.videos.map(async (video): Promise<CutterSourceVideoPreflightSample> => {
      const readable = await fileIsReadable(video.source_video_file_path);
      const mediaProbe = readable.readable
        ? await probeSourceVideoMedia({
            api_input: input,
            source_video_file_path: video.source_video_file_path
          })
        : {
            checked: false,
            ok: false,
            reason: "文件不可读，未执行 FFprobe"
          };

      return {
        source_video_id: video.source_video_id,
        title: video.title,
        source_video_file_path: video.source_video_file_path,
        readable: readable.readable,
        ...(typeof readable.file_size === "number" ? { file_size: readable.file_size } : {}),
        media_probe: mediaProbe,
        reason: readable.reason
      };
    })
  );
  const readableCount = samples.filter((sample) => sample.readable).length;
  const probeCount = samples.filter((sample) => sample.media_probe.checked).length;
  const probeReadableCount = samples.filter((sample) => sample.media_probe.ok).length;
  const hasUnreadableFile = readableCount !== samples.length;
  const hasProbeFailure = probeReadableCount !== probeCount || probeCount !== samples.length;

  return {
    status: !hasUnreadableFile && !hasProbeFailure ? "ready" : "blocked",
    checked_count: samples.length,
    readable_count: readableCount,
    probe_count: probeCount,
    probe_readable_count: probeReadableCount,
    sample_count: SOURCE_PREFLIGHT_SAMPLE_COUNT,
    samples,
    message: !hasUnreadableFile && !hasProbeFailure
      ? "源视频样本可读取并可被 FFprobe 解析，剪切前置检查通过"
      : hasUnreadableFile
        ? "部分源视频样本不可读取，请检查公共素材库路径映射或 Windows 共享挂载"
        : "部分源视频样本无法被 FFprobe 解析，请检查视频文件完整性或编码"
  };
}

async function readSourceVideoPreflightStatus(
  input: CreateCutterApiServerInput
): Promise<CutterSourceVideoPreflightStatus> {
  const nowMs = Date.now();
  let cache = sourceVideoPreflightCacheByInput.get(input);

  if (!cache) {
    cache = {
      expires_at_ms: 0
    };
    sourceVideoPreflightCacheByInput.set(input, cache);
  }

  if (cache.status && cache.expires_at_ms > nowMs) {
    return cache.status;
  }

  if (!cache.promise) {
    cache.promise = new Promise<CutterSourceVideoPreflightStatus>((resolve, reject) => {
      setTimeout(() => {
        readSourceVideoPreflightStatusUncached(input).then(resolve, reject);
      }, SOURCE_PREFLIGHT_BACKGROUND_DELAY_MS);
    })
      .then((status) => {
        cache.status = status;
        cache.expires_at_ms = Date.now() + SOURCE_PREFLIGHT_CACHE_TTL_MS;
        return status;
      })
      .catch((error): CutterSourceVideoPreflightStatus => {
        const fallback = cache.status ?? checkingSourceVideoPreflightStatus();
        cache.status = {
          ...fallback,
          status: fallback.status === "ready" ? "checking" : fallback.status,
          message: `源视频可读性后台检查失败：${(error as Error).message || "未知错误"}`
        };
        cache.expires_at_ms = Date.now() + Math.min(30_000, SOURCE_PREFLIGHT_CACHE_TTL_MS);
        return cache.status;
      })
      .finally(() => {
        if (cache) {
          delete cache.promise;
        }
      });
  }

  return cache.status ?? checkingSourceVideoPreflightStatus();
}

async function readLocalCacheRuntimeStatus(
  input: CreateCutterApiServerInput
): Promise<CutterLocalCacheRuntimeStatus> {
  const cacheRoot = localCacheRootForInput(input);
  const thumbnailRoot = thumbnailCacheRoot(input);
  const thumbnailManifest = await compactThumbnailCacheManifest(thumbnailRoot);
  const sourceVideoCacheStatus = await readSourceVideoCacheStatus(input);
  const cutTempStatus = input.workspace_root
    ? await readCutTempCacheStatus({
        workspace_root: input.workspace_root,
        max_bytes: cutTempMaxBytes(input)
      })
    : {
        cache_root_path: path.join(cacheRoot, "cut-temp"),
        max_bytes: cutTempMaxBytes(input),
        size_bytes: 0,
        file_count: 0
      };

  return {
    cache_root_path: cacheRoot,
    searchd_cache_root_path: searchdCacheRoot(input),
    searchd_cache_size_bytes: await recursiveFileCacheSize(searchdCacheRoot(input)),
    thumbnail_cache_root_path: thumbnailRoot,
    thumbnail_cache_manifest_path: thumbnailCacheManifestPath(thumbnailRoot),
    thumbnail_cache_size_bytes: await directFileCacheSize(thumbnailRoot),
    thumbnail_cache_max_bytes: thumbnailCacheMaxBytes(input),
    thumbnail_cache_manifest_entry_count: Object.keys(thumbnailManifest.entries).length,
    thumbnail_cache_checksum_entry_count: Object.values(thumbnailManifest.entries).filter((entry) =>
      typeof entry.checksum_sha256 === "string" && entry.checksum_sha256.length === 64
    ).length,
    source_video_cache: sourceVideoCacheStatus,
    cut_temp_cache: cutTempStatus
  };
}

function checkingLocalCacheRuntimeStatus(input: CreateCutterApiServerInput): CutterLocalCacheRuntimeStatus {
  const cacheRoot = localCacheRootForInput(input);
  const thumbnailRoot = thumbnailCacheRoot(input);
  return {
    cache_root_path: cacheRoot,
    searchd_cache_root_path: searchdCacheRoot(input),
    searchd_cache_size_bytes: 0,
    thumbnail_cache_root_path: thumbnailRoot,
    thumbnail_cache_manifest_path: thumbnailCacheManifestPath(thumbnailRoot),
    thumbnail_cache_size_bytes: 0,
    thumbnail_cache_max_bytes: thumbnailCacheMaxBytes(input),
    thumbnail_cache_manifest_entry_count: 0,
    thumbnail_cache_checksum_entry_count: 0,
    source_video_cache: {
      cache_root_path: sourceVideoCacheRoot(input),
      max_bytes: sourceVideoCacheMaxBytes(input),
      size_bytes: 0,
      file_count: 0,
      cached_video_count: 0,
      active_prefetch_count: [...activeSourceVideoPrefetches.keys()].filter((key) =>
        key.startsWith(`${sourceVideoCacheRoot(input)}\0`)
      ).length
    },
    cut_temp_cache: {
      cache_root_path: input.workspace_root
        ? path.join(input.workspace_root, "cache", "cut-temp")
        : path.join(cacheRoot, "cut-temp"),
      max_bytes: cutTempMaxBytes(input),
      size_bytes: 0,
      file_count: 0
    }
  };
}

interface LocalCacheRuntimeStatusCacheEntry {
  expires_at_ms: number;
  status?: CutterLocalCacheRuntimeStatus;
  promise?: Promise<CutterLocalCacheRuntimeStatus>;
}

const localCacheRuntimeStatusByInput = new WeakMap<
  CreateCutterApiServerInput,
  LocalCacheRuntimeStatusCacheEntry
>();

function invalidateLocalCacheRuntimeStatus(input: CreateCutterApiServerInput): void {
  const cache = localCacheRuntimeStatusByInput.get(input);
  if (!cache) {
    return;
  }

  cache.expires_at_ms = 0;
  delete cache.status;
}

async function readLocalCacheRuntimeStatusBestEffort(
  input: CreateCutterApiServerInput
): Promise<CutterLocalCacheRuntimeStatus> {
  const nowMs = Date.now();
  let cache = localCacheRuntimeStatusByInput.get(input);

  if (!cache) {
    cache = {
      expires_at_ms: 0
    };
    localCacheRuntimeStatusByInput.set(input, cache);
  }

  if (cache.status && cache.expires_at_ms > nowMs) {
    return cache.status;
  }

  if (!cache.promise) {
    cache.promise = new Promise<CutterLocalCacheRuntimeStatus>((resolve, reject) => {
      setTimeout(() => {
        readLocalCacheRuntimeStatus(input).then(resolve, reject);
      }, 0);
    })
      .then((status) => {
        cache.status = status;
        cache.expires_at_ms = Date.now() + LOCAL_CACHE_STATUS_CACHE_TTL_MS;
        return status;
      })
      .catch(() => {
        const fallback = cache.status ?? checkingLocalCacheRuntimeStatus(input);
        cache.status = fallback;
        cache.expires_at_ms = Date.now() + Math.min(5_000, LOCAL_CACHE_STATUS_CACHE_TTL_MS);
        return fallback;
      })
      .finally(() => {
        if (cache) {
          delete cache.promise;
        }
      });
  }

  if (!cache.status) {
    return checkingLocalCacheRuntimeStatus(input);
  }

  return delayedFallback(
    cache.promise,
    LOCAL_CACHE_STATUS_INLINE_TIMEOUT_MS,
    cache.status
  );
}

async function runtimeStatusForSession(input: {
  api_input: CreateCutterApiServerInput;
  auth: AuthenticatedCutterSession;
  include_local_cache?: boolean;
}): Promise<CutterRuntimeStatusPayload> {
  const timings: Record<string, number> = {};
  const totalStartedAt = Date.now();
  const timeAsync = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      timings[key] = Date.now() - startedAt;
    }
  };
  const timeSync = <T>(key: string, task: () => T): T => {
    const startedAt = Date.now();
    try {
      return task();
    } finally {
      timings[key] = Date.now() - startedAt;
    }
  };

  const localClips = input.api_input.workspace_root
    ? await timeAsync("local_clips", () =>
        listExportClips({
          workspace_root: input.api_input.workspace_root!,
          limit: 1
        })
      )
    : await timeAsync("local_clips", () => listLocalClips({ library_root: input.api_input.library_root }));

  let ffmpegStatus: CutterRuntimeStatusPayload["ffmpeg_status"] = "不可用";
  let ffmpegSource: CutterRuntimeStatusPayload["ffmpeg_source"] = "未检测到";

  timeSync("ffmpeg_runtime", () => {
    try {
      const runtime = resolveFfmpegRuntime();
      ffmpegStatus = "可用";
      ffmpegSource = runtime.source === "env" ? "环境配置" : "内置";
    } catch {
      ffmpegStatus = "不可用";
    }
  });

  const diskIoBytesPerSecond = timeSync("local_runtime", () => cachedLocalDiskIoBytesPerSecond());
  const releaseCache = await timeAsync("release_cache", () => syncCutterReleaseCacheBestEffort(input.api_input));
  const statusIoTimeoutMs = Math.max(250, input.api_input.searchd_timeout_ms ?? 800);
  const availableVideoCount = releaseCache.ready && releaseCache.ready_video_count > 0
    ? timeSync("available_video_count", () => releaseCache.ready_video_count)
    : await timeAsync("available_video_count", () =>
        delayedFallback(
          readReadyVideoCount(input.api_input.library_root),
          statusIoTimeoutMs,
          0
        )
      );
  const libraryId = await timeAsync("library_id", () =>
    readLibraryIdBestEffort(input.api_input)
  );
  const [searchBackend, localCache, sourceVideoPreflight] = await Promise.all([
    timeAsync("search_backend", () => readSearchBackendStatus(input.api_input, availableVideoCount)),
    timeAsync("local_cache", () => input.include_local_cache
      ? readLocalCacheRuntimeStatusBestEffort(input.api_input)
      : Promise.resolve(checkingLocalCacheRuntimeStatus(input.api_input))),
    timeAsync("source_video_preflight", () => readSourceVideoPreflightStatus(input.api_input))
  ]);
  const effectiveAvailableVideoCount =
    releaseCache.ready && releaseCache.ready_video_count > 0
      ? releaseCache.ready_video_count
      : availableVideoCount;
  timings.total = Date.now() - totalStartedAt;

  return {
    mode: "api",
    mode_label: "真实 Cutter API 模式",
    api_ready: true,
    generated_at: input.api_input.now?.() ?? new Date().toISOString(),
    library_id: libraryId,
    library_root_label: pathLabel(input.api_input.library_root, "公共素材库"),
    library_root_path: input.api_input.library_root,
    available_video_count: effectiveAvailableVideoCount,
    workspace_enabled: Boolean(input.api_input.workspace_root),
    workspace_root_label: pathLabel(input.api_input.workspace_root, "未启用本地剪切工作区"),
    workspace_root_path: input.api_input.workspace_root ?? "",
    local_clip_count: localClips.local_clip_count,
    ffmpeg_status: ffmpegStatus,
    ffmpeg_source: ffmpegSource,
    local_runtime: {
      cpu_usage_percent: localCpuUsagePercent(),
      ...(typeof diskIoBytesPerSecond === "number"
        ? { disk_io_bytes_per_second: diskIoBytesPerSecond }
        : {})
    },
    search_backend: searchBackend,
    release_cache: releaseCache,
    local_cache: localCache,
    source_video_preflight: sourceVideoPreflight,
    current_user: {
      user_id: input.auth.user.user_id,
      username: input.auth.user.username,
      display_name: input.auth.user.display_name
    },
    diagnostics: {
      runtime_timings_ms: timings,
      search_index_warmup: readSearchIndexWarmupStatus(input.api_input)
    }
  };
}

function workspaceRootOrThrow(input: CreateCutterApiServerInput): string {
  if (!input.workspace_root) {
    throw new Error("workspace_root is required for cutter workspace routes");
  }

  return input.workspace_root;
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

function toWorkspaceLocalClipPayload(clip: ExportClipView): ExportClipView & {
  detail_url: string;
  media_url: string;
  cover_url?: string;
  subtitles_url?: string;
  relative_path: string;
} {
  return {
    ...addLocalClipUrls(clip),
    ...(clip.cover_file_path ? { cover_url: `/cutter/local-clips/${clip.local_clip_id}/cover` } : {}),
    ...(clip.subtitles_file_path ? { subtitles_url: `/cutter/local-clips/${clip.local_clip_id}/subtitles.srt` } : {}),
    relative_path: clip.local_asset_relative_path ?? clip.output_file
  };
}

function parseClipListItems(value: unknown): WriteClipListItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("items must contain at least one cut-list row");
  }

  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`items[${index}] must be an object`);
    }

    const item = raw as Record<string, unknown>;

    return {
      source_video_id: requiredString(item.source_video_id, `items[${index}].source_video_id`),
      source_title: requiredString(item.source_title, `items[${index}].source_title`),
      source_relative_path: requiredString(item.source_relative_path, `items[${index}].source_relative_path`),
      start_segment_id: requiredString(item.start_segment_id, `items[${index}].start_segment_id`),
      end_segment_id: requiredString(item.end_segment_id, `items[${index}].end_segment_id`),
      begin_ms: requiredNonNegativeInteger(item.begin_ms, `items[${index}].begin_ms`),
      end_ms: requiredNonNegativeInteger(item.end_ms, `items[${index}].end_ms`),
      selected_text: requiredString(item.selected_text, `items[${index}].selected_text`),
      cut_mode: parseCutMode(item.cut_mode),
      pre_roll_ms: optionalNonNegativeInteger(item.pre_roll_ms, 0, `items[${index}].pre_roll_ms`),
      post_roll_ms: optionalNonNegativeInteger(item.post_roll_ms, 0, `items[${index}].post_roll_ms`)
    };
  });
}

function preciseLocalClipSelectionRequested(body: CreateLocalClipRequestBody): boolean {
  return body.begin_ms !== undefined ||
    body.end_ms !== undefined ||
    body.selected_text !== undefined;
}

function resolveLocalClipSelection(input: {
  source_video_id: string;
  segments: TranscriptSegment[];
  body: CreateLocalClipRequestBody;
}): LocalClipSelection {
  const startSegmentId = requiredString(input.body.start_segment_id, "start_segment_id");
  const endSegmentId = requiredString(input.body.end_segment_id, "end_segment_id");
  const preRollMs = optionalNonNegativeInteger(input.body.pre_roll_ms, 0, "pre_roll_ms");
  const postRollMs = optionalNonNegativeInteger(input.body.post_roll_ms, 0, "post_roll_ms");

  if (!preciseLocalClipSelectionRequested(input.body)) {
    return createSegmentSpanSelection({
      source_video_id: input.source_video_id,
      segments: input.segments,
      start_segment_id: startSegmentId,
      end_segment_id: endSegmentId,
      pre_roll_ms: preRollMs,
      post_roll_ms: postRollMs
    });
  }

  const segmentSpan = createSegmentSpanSelection({
    source_video_id: input.source_video_id,
    segments: input.segments,
    start_segment_id: startSegmentId,
    end_segment_id: endSegmentId
  });
  const beginMs = requiredNonNegativeInteger(input.body.begin_ms, "begin_ms");
  const endMs = requiredNonNegativeInteger(input.body.end_ms, "end_ms");
  const selectedText = requiredString(input.body.selected_text, "selected_text");

  if (endMs <= beginMs) {
    throw new Error("end_ms must be greater than begin_ms");
  }

  if (beginMs < segmentSpan.begin_ms || endMs > segmentSpan.end_ms) {
    throw new Error("precise selection must stay within selected transcript segments");
  }

  return {
    source_video_id: input.source_video_id,
    start_segment_id: segmentSpan.start_segment_id,
    end_segment_id: segmentSpan.end_segment_id,
    begin_ms: Math.max(0, beginMs - preRollMs),
    end_ms: endMs + postRollMs,
    pre_roll_ms: preRollMs,
    post_roll_ms: postRollMs,
    selected_text: selectedText
  };
}

function localClipSelectionErrorPayload(error: unknown): { code: string; message: string } | undefined {
  const message = error instanceof Error ? error.message : "";

  if (
    message === "segment not found" ||
    message === "start segment must be before end segment" ||
    message === "start_segment_id is required" ||
    message === "end_segment_id is required"
  ) {
    return {
      code: "invalid_segment_selection",
      message
    };
  }

  if (
    message === "begin_ms must be a non-negative integer" ||
    message === "end_ms must be a non-negative integer" ||
    message === "selected_text is required" ||
    message === "end_ms must be greater than begin_ms" ||
    message === "precise selection must stay within selected transcript segments"
  ) {
    return {
      code: "invalid_precise_selection",
      message
    };
  }

  return undefined;
}

function cutJobSourceFromDetail(detail: CutterSourceVideoDetail): CutJobSourceDetail {
  return {
    source_video_id: detail.source_video_id,
    title: detail.title,
    relative_path: detail.relative_path,
    source_video_file_path: detail.source_video_file_path,
    duration_ms: detail.duration_ms,
    width: detail.width,
    height: detail.height,
    fps: detail.fps,
    codec: detail.codec,
    file_size: detail.file_size,
    transcript_segments: detail.transcript.segments
  };
}

async function runWorkspaceCutJob(input: {
  api_input: CreateCutterApiServerInput;
  workspace_root: string;
  cut_job_id?: string;
  resolved_sources?: Map<string, CutJobSourceDetail>;
  persist_phase_progress?: boolean;
}): ReturnType<typeof runNextCutJob> {
  const cutRunner = input.api_input.cut_runner ?? defaultCutRunner;
  const coverRunner = input.api_input.cover_runner ?? (input.api_input.cut_runner ? undefined : defaultCoverRunner);
  let sourceToPrefetchAfterCut: CutJobSourceDetail | undefined;

  const runInput: RunNextCutJobInput = {
    workspace_root: input.workspace_root,
    library_root: input.api_input.library_root,
    now: () => input.api_input.now?.() ?? new Date().toISOString(),
    resolve_source: async (job) => {
      if (/^E\d{6}$/.test(job.source_video_id)) {
        const clip = await getExportClipDetail({
          workspace_root: input.workspace_root,
          export_clip_id: job.source_video_id
        });

        if (!clip) {
          return null;
        }

        return {
          source_video_id: clip.export_clip_id,
          title: clip.title,
          relative_path: clip.local_asset_relative_path ?? clip.output_file,
          source_video_file_path: clip.media_file_path,
          duration_ms: clip.duration_ms,
          width: clip.width,
          height: clip.height,
          fps: clip.fps,
          codec: clip.codec,
          file_size: clip.file_size,
          transcript_segments: clip.transcript_segments
        };
      }

      const cachedSource = input.resolved_sources?.get(job.source_video_id);
      if (cachedSource) {
        const cutSource = await sourceDetailWithLocalSourceForCut(input.api_input, cachedSource);
        if (cutSource.source_video_file_path === cachedSource.source_video_file_path) {
          sourceToPrefetchAfterCut = cachedSource;
        }
        return cutSource;
      }

      const detail = await loadVisibleDetail(input.api_input, job.source_video_id);

      if (!detail) {
        return null;
      }

      const source = cutJobSourceFromDetail(detail);
      const cutSource = await sourceDetailWithLocalSourceForCut(input.api_input, source);
      if (cutSource.source_video_file_path === source.source_video_file_path) {
        sourceToPrefetchAfterCut = source;
      }
      return cutSource;
    },
    cut_runner: async (runnerInput) => {
      await cutRunner(runnerInput);
      const source = sourceToPrefetchAfterCut;
      sourceToPrefetchAfterCut = undefined;
      if (source) {
        prefetchSourceVideoBestEffort({
          api_input: input.api_input,
          source_video_id: source.source_video_id,
          source_video_file_path: source.source_video_file_path,
          file_size: source.file_size
        });
      }
    },
    cut_temp_max_bytes: cutTempMaxBytes(input.api_input),
    persist_phase_progress: input.persist_phase_progress,
    ...(coverRunner ? { cover_runner: coverRunner } : {})
  };

  return input.cut_job_id
    ? runCutJob({ ...runInput, cut_job_id: input.cut_job_id })
    : runNextCutJob(runInput);
}

async function resolveProjectOutputDirectory(input: {
  workspace_root: string;
  project_id?: string;
  project_title?: string;
}): Promise<string | undefined> {
  if (input.project_id) {
    const catalog = await listExportClips({ workspace_root: input.workspace_root });
    const matchedClip = catalog.clips.find((clip) =>
      clip.project_id === input.project_id && clip.project_output_file
    );

    if (matchedClip?.project_output_file) {
      return path.dirname(workspaceRelativePath(input.workspace_root, matchedClip.project_output_file));
    }
  }

  if (input.project_title) {
    return path.dirname(workspaceRelativePath(input.workspace_root, buildProjectClipOutputFile({
      project_title: input.project_title,
      project_clip_order: 1,
      source_title: "本地素材"
    })));
  }

  return undefined;
}

async function openWorkspaceExportDirectory(
  input: CreateCutterApiServerInput,
  body: OpenExportDirectoryRequestBody = {}
): Promise<{ path: string }> {
  const workspaceRoot = workspaceRootOrThrow(input);
  const projectId = optionalString(body.project_id, "project_id");
  const projectTitle = optionalString(body.project_title, "project_title");
  const shouldOpen = body.open !== false;
  const targetPath = await resolveProjectOutputDirectory({
    workspace_root: workspaceRoot,
    project_id: projectId,
    project_title: projectTitle
  }) ?? exportClipsDirectory(workspaceRoot);
  const openPath = input.open_path ?? defaultOpenPath;

  await mkdir(targetPath, { recursive: true });
  if (shouldOpen) {
    await openPath(targetPath);
  }

  return { path: targetPath };
}

async function createWorkspaceLocalClip(input: {
  api_input: CreateCutterApiServerInput;
  body: CreateLocalClipRequestBody;
}): Promise<ExportClipView> {
  const workspaceRoot = workspaceRootOrThrow(input.api_input);
  const sourceVideoId = requiredString(input.body.source_video_id, "source_video_id");

  if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) {
    throw new Error("invalid_source_video_id");
  }

  const detail = await loadVisibleDetail(input.api_input, sourceVideoId);

  if (!detail) {
    throw new Error("source_video_not_found");
  }

  const selection = resolveLocalClipSelection({
    source_video_id: sourceVideoId,
    segments: detail.transcript.segments,
    body: input.body
  });
  const createdAt = input.api_input.now?.() ?? new Date().toISOString();
  const clipList = await writeClipList({
    workspace_root: workspaceRoot,
    library_id: await readLibraryIdFromInput(input.api_input),
    title:
      typeof input.body.title === "string" && input.body.title.trim()
        ? input.body.title.trim()
        : `${detail.title} ${formatClipTime(selection.begin_ms)}-${formatClipTime(selection.end_ms)}`,
    items: [{
      source_video_id: sourceVideoId,
      source_title: detail.title,
      source_relative_path: detail.relative_path,
      start_segment_id: selection.start_segment_id,
      end_segment_id: selection.end_segment_id,
      begin_ms: selection.begin_ms + selection.pre_roll_ms,
      end_ms: selection.end_ms - selection.post_roll_ms,
      selected_text: selection.selected_text,
      cut_mode: parseCutMode(input.body.cut_mode),
      pre_roll_ms: selection.pre_roll_ms,
      post_roll_ms: selection.post_roll_ms
    }],
    now: createdAt
  });
  const submission = await submitClipListToQueue({
    workspace_root: workspaceRoot,
    clip_list: clipList,
    now: createdAt
  });
  const submittedJob = submission.jobs[0];

  if (!submittedJob) {
    throw new Error("cut job did not submit");
  }

  const job = await runWorkspaceCutJob({
    api_input: input.api_input,
    workspace_root: workspaceRoot,
    cut_job_id: submittedJob.cut_job_id,
    resolved_sources: new Map([[sourceVideoId, cutJobSourceFromDetail(detail)]]),
    persist_phase_progress: false
  });

  if (!job || job.status !== "done" || !job.export_clip_id) {
    throw new Error(job?.error_message ?? "cut job did not complete");
  }

  const clip = await getExportClipDetail({
    workspace_root: workspaceRoot,
    export_clip_id: job.export_clip_id
  });

  if (!clip) {
    throw new Error("export clip not found after cut");
  }

  return clip;
}

export function createCutterApiServer(input: CreateCutterApiServerInput): Server {
  let cutQueueDrainRunning = false;
  let cutQueueDrainRequested = false;
  let cutQueueDrainTimer: NodeJS.Timeout | undefined;

  const scheduleCutQueueDrain = (reason: string): void => {
    if (!input.auto_run_cut_queue || !input.workspace_root) {
      return;
    }

    cutQueueDrainRequested = true;

    if (cutQueueDrainRunning || cutQueueDrainTimer) {
      return;
    }

    cutQueueDrainTimer = setTimeout(() => {
      cutQueueDrainTimer = undefined;
      void drainCutQueueBestEffort(reason);
    }, 0);
  };

  const drainCutQueueBestEffort = async (reason: string): Promise<void> => {
    if (cutQueueDrainRunning || !input.workspace_root) {
      return;
    }

    cutQueueDrainRunning = true;

    try {
      do {
        cutQueueDrainRequested = false;

        for (;;) {
          const job = await runWorkspaceCutJob({
            api_input: input,
            workspace_root: input.workspace_root
          });

          if (!job) {
            break;
          }
        }
      } while (cutQueueDrainRequested);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        event: "cut_queue_auto_drain_failed",
        reason,
        message
      }));
    } finally {
      cutQueueDrainRunning = false;
      if (cutQueueDrainRequested) {
        scheduleCutQueueDrain("rerun");
      }
    }
  };

  scheduleCutQueueDrain("startup");

  return createServer(async (request, response) => {
    try {
      setCorsHeaders(response);

      if (request.method === "OPTIONS") {
        writeNoContent(response);
        return;
      }

      if (
        request.method !== "GET" &&
        request.method !== "HEAD" &&
        request.method !== "POST" &&
        request.method !== "DELETE"
      ) {
        writeError(response, 405, "method_not_allowed", "Only GET, HEAD, POST, DELETE, and OPTIONS are supported");
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "POST" && url.pathname === "/cutter/auth/register") {
        try {
          const body = (await readRequestJson(request)) as CutterLoginRequestBody;
          const user = await registerCutterAccount(input.library_root, {
            username: requiredChineseString(body.username, "用户名不能为空"),
            password: requiredChineseString(body.password, "密码不能为空"),
            device_id: requiredChineseString(body.device_id, "设备 ID 不能为空"),
            device_name: requiredChineseString(body.device_name, "设备名称不能为空"),
            now: currentNow(input),
            ip_address: requestIpAddress(request),
            user_agent: firstHeaderValue(request.headers["user-agent"]) || undefined
          });
          writeJson(response, 201, apiResponse({
            user: publicCutterUser(user)
          }));
          return;
        } catch (error) {
          const message = (error as Error).message;
          writeError(
            response,
            message === "用户名已存在，请直接登录" ? 409 : 400,
            message === "用户名已存在，请直接登录" ? "username_exists" : "invalid_register_request",
            message === "invalid_json" ? "请求 JSON 格式不正确" : message
          );
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/cutter/auth/login") {
        try {
          const body = (await readRequestJson(request)) as CutterLoginRequestBody;
          if (input.auth_mode === "local_trusted") {
            const auth = trustedDesktopSession(input);
            const now = currentNow(input);
            writeJson(response, 200, apiResponse({
              user: publicCutterUser(auth.user),
              session: {
                user_id: auth.user.user_id,
                device_id: auth.device_id,
                session_token: "desktop-local-trusted",
                created_at: now,
                last_seen_at: now
              }
            }));
            return;
          }

          const login = await loginCutterAccount(input.library_root, {
            username: requiredChineseString(body.username, "用户名不能为空"),
            password: requiredChineseString(body.password, "密码不能为空"),
            device_id: requiredChineseString(body.device_id, "设备 ID 不能为空"),
            device_name: requiredChineseString(body.device_name, "设备名称不能为空"),
            now: currentNow(input),
            ip_address: requestIpAddress(request),
            user_agent: firstHeaderValue(request.headers["user-agent"]) || undefined
          });
          if (!login.ok) {
            writeError(response, 401, "login_failed", login.reason);
            return;
          }

          writeJson(response, 200, apiResponse({
            user: publicCutterUser(login.user),
            session: login.session
          }));
          return;
        } catch (error) {
          const message = (error as Error).message;
          writeError(
            response,
            400,
            "invalid_login_request",
            message === "invalid_json" ? "请求 JSON 格式不正确" : message
          );
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/cutter/auth/logout") {
        if (input.auth_mode === "local_trusted") {
          writeJson(response, 200, apiResponse({ removed: false }));
          return;
        }

        const deviceId = firstHeaderValue(request.headers["x-mixlab-device-id"]);
        const sessionToken = firstHeaderValue(request.headers["x-mixlab-session-token"]);
        writeJson(response, 200, apiResponse(deviceId && sessionToken
          ? await logoutCutterSession(input.library_root, {
              device_id: deviceId,
              session_token: sessionToken
            })
          : { removed: false }));
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/auth/change-password") {
        if (input.auth_mode === "local_trusted") {
          writeError(response, 400, "unsupported_auth_mode", "本机信任模式不支持修改密码");
          return;
        }

        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });
        if (!auth) {
          return;
        }

        try {
          const body = (await readRequestJson(request)) as CutterPasswordChangeRequestBody;
          const sessionToken = firstHeaderValue(request.headers["x-mixlab-session-token"]);
          const result = await changeCutterAccountPassword(input.library_root, {
            user_id: auth.user.user_id,
            current_password: requiredChineseString(body.current_password, "当前密码不能为空"),
            new_password: requiredChineseString(body.new_password, "新密码不能为空"),
            device_id: auth.device_id,
            session_token: sessionToken,
            now: currentNow(input)
          });

          if (!result.ok) {
            writeError(
              response,
              result.reason === "当前密码错误" ? 401 : 400,
              result.reason === "当前密码错误" ? "password_mismatch" : "invalid_password_change",
              result.reason
            );
            return;
          }

          writeJson(response, 200, apiResponse({
            user: publicCutterUser(result.user)
          }));
          return;
        } catch (error) {
          const message = (error as Error).message;
          writeError(
            response,
            400,
            "invalid_password_change",
            message === "invalid_json" ? "请求 JSON 格式不正确" : message
          );
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/cutter/auth/request-login") {
        try {
          const body = (await readRequestJson(request)) as CutterLoginRequestBody;
          if (input.auth_mode === "local_trusted") {
            const auth = trustedDesktopSession(input);
            const deviceId = typeof body.device_id === "string" && body.device_id.trim()
              ? body.device_id.trim()
              : auth.device_id;
            const now = currentNow(input);
            writeJson(response, 200, apiResponse({
              user: publicCutterUser(auth.user),
              session: {
                user_id: auth.user.user_id,
                device_id: deviceId,
                session_token: "desktop-local-trusted",
                created_at: now,
                last_seen_at: now
              }
            }));
            return;
          }

          const deviceId = requiredChineseString(body.device_id, "设备 ID 不能为空");
          const now = currentNow(input);
          const application = await createCutterLoginApplication(input.library_root, {
            username: requiredChineseString(body.username, "用户名不能为空"),
            device_id: deviceId,
            device_name: requiredChineseString(body.device_name, "设备名称不能为空"),
            now,
            ip_address: requestIpAddress(request),
            user_agent: firstHeaderValue(request.headers["user-agent"]) || undefined
          });
          const session = application.status === "approved"
            ? await ensureCutterSessionForDevice(input.library_root, {
                user_id: application.user_id,
                device_id: deviceId,
                now
              })
            : undefined;
          writeJson(response, 200, apiResponse({
            user: publicCutterUser(application),
            ...(session ? { session } : {})
          }));
          return;
        } catch (error) {
          const message = (error as Error).message;
          writeError(
            response,
            400,
            "invalid_login_request",
            message === "invalid_json" ? "请求 JSON 格式不正确" : message
          );
          return;
        }
      }

      if (request.method === "POST" && url.pathname === "/cutter/local-clips") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const body = (await readRequestJson(request)) as CreateLocalClipRequestBody;

        if (input.workspace_root) {
          try {
            const clip = await createWorkspaceLocalClip({
              api_input: input,
              body
            });
            writeJson(response, 201, apiResponse(toWorkspaceLocalClipPayload(clip)));
            await recordCutterUsageEventsBestEffort([
              {
                api_input: input,
                auth,
                event_type: "select_transcript_span",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              },
              {
                api_input: input,
                auth,
                event_type: "submit_cut_job",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              },
              {
                api_input: input,
                auth,
                event_type: "cut_success",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              },
              {
                api_input: input,
                auth,
                event_type: "create_local_clip",
                source_video_id: clip.source_video_id,
                selected_duration_ms: selectedDurationMs(clip)
              }
            ]);
            return;
          } catch (error) {
            if ((error as Error).message === "invalid_source_video_id") {
              writeError(
                response,
                400,
                "invalid_source_video_id",
                "source_video_id must use V000001 format"
              );
              return;
            }

            if ((error as Error).message === "source_video_not_found") {
              writeError(response, 404, "source_video_not_found", "Source video not found");
              return;
            }

            const selectionError = localClipSelectionErrorPayload(error);
            if (selectionError) {
              writeError(response, 400, selectionError.code, selectionError.message);
              return;
            }

            throw error;
          }
        }

        const sourceVideoId = requiredString(body.source_video_id, "source_video_id");

        if (!SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) {
          writeError(
            response,
            400,
            "invalid_source_video_id",
            "source_video_id must use V000001 format"
          );
          return;
        }

        const detail = await loadVisibleDetail(input, sourceVideoId);

        if (!detail) {
          writeError(response, 404, "source_video_not_found", "Source video not found");
          return;
        }

        let selection: LocalClipSelection;
        try {
          selection = resolveLocalClipSelection({
            source_video_id: sourceVideoId,
            segments: detail.transcript.segments,
            body
          });
        } catch (error) {
          const selectionError = localClipSelectionErrorPayload(error);
          if (selectionError) {
            writeError(response, 400, selectionError.code, selectionError.message);
            return;
          }

          throw error;
        }
        const cutMode = parseCutMode(body.cut_mode);
        const localClipId = await allocateNextLocalClipId(input.library_root);
        const clipPaths = buildLocalClipArtifactPaths({
          library_root: input.library_root,
          local_clip_id: localClipId
        });
        const cutRunner = input.cut_runner ?? defaultCutRunner;
        const cutSource = await sourceDetailWithLocalSourceForCut(input, detail);
        const shouldPrefetchAfterCut = cutSource.source_video_file_path === detail.source_video_file_path;

        await mkdir(path.dirname(clipPaths.media_file_path), { recursive: true });
        await cutRunner({
          source_video_path: cutSource.source_video_file_path,
          output_path: clipPaths.media_file_path,
          begin_ms: selection.begin_ms,
          end_ms: selection.end_ms,
          cut_mode: cutMode
        });
        if (shouldPrefetchAfterCut) {
          prefetchSourceVideoBestEffort({
            api_input: input,
            source_video_id: detail.source_video_id,
            source_video_file_path: detail.source_video_file_path,
            file_size: detail.file_size
          });
        }

        const manifest = await writeLocalClipManifest({
          library_root: input.library_root,
          local_clip_id: localClipId,
          title:
            typeof body.title === "string" && body.title.trim()
              ? body.title.trim()
              : `${detail.title} ${formatClipTime(selection.begin_ms)}-${formatClipTime(selection.end_ms)}`,
          source_video_id: sourceVideoId,
          source_title: detail.title,
          source_relative_path: detail.relative_path,
          begin_ms: selection.begin_ms,
          end_ms: selection.end_ms,
          selected_text: selection.selected_text,
          cut_mode: cutMode,
          media_path: clipPaths.media_path,
          created_at: input.now?.() ?? new Date().toISOString()
        });

        writeJson(response, 201, apiResponse({
          ...manifest,
          media_file_path: clipPaths.media_file_path,
          ...localClipUrls(localClipId)
        }));
        await recordCutterUsageEventsBestEffort([
          {
            api_input: input,
            auth,
            event_type: "select_transcript_span",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          },
          {
            api_input: input,
            auth,
            event_type: "submit_cut_job",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          },
          {
            api_input: input,
            auth,
            event_type: "cut_success",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          },
          {
            api_input: input,
            auth,
            event_type: "create_local_clip",
            source_video_id: sourceVideoId,
            selected_duration_ms: selectedDurationMs(selection)
          }
        ]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/clip-lists") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const body = (await readRequestJson(request)) as CreateClipListRequestBody;
        const clipList = await writeClipList({
          workspace_root: workspaceRoot,
          library_id: requiredString(body.library_id, "library_id"),
          project_id: optionalString(body.project_id, "project_id"),
          title: requiredString(body.title, "title"),
          items: parseClipListItems(body.items),
          now: input.now?.() ?? new Date().toISOString()
        });

        writeJson(response, 201, apiResponse(clipList));
        await recordCutterUsageEventsBestEffort(
          clipList.items.map((item) => ({
            api_input: input,
            auth,
            event_type: "add_to_cut_list",
            source_video_id: item.source_video_id,
            selected_duration_ms: selectedDurationMs(item)
          }))
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cut-jobs") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const body = (await readRequestJson(request)) as SubmitCutJobsRequestBody;
        const clipListId = requiredString(body.clip_list_id, "clip_list_id");
        const clipList = await readClipList({
          workspace_root: workspaceRoot,
          clip_list_id: clipListId
        });

        if (!clipList) {
          writeError(response, 404, "clip_list_not_found", "Clip list not found");
          return;
        }

        const submission = await submitClipListToQueue({
          workspace_root: workspaceRoot,
          clip_list: clipList,
          now: input.now?.() ?? new Date().toISOString()
        });
        writeJson(response, 201, apiResponse(submission));
        scheduleCutQueueDrain("submit");
        await recordCutterUsageEventsBestEffort(
          submission.jobs.map((job) => ({
            api_input: input,
            auth,
            event_type: "submit_cut_job",
            source_video_id: job.source_video_id,
            cut_job_id: job.cut_job_id,
            selected_duration_ms: selectedDurationMs(job)
          }))
        );
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cut-jobs/run-next") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const job = await runWorkspaceCutJob({
          api_input: input,
          workspace_root: workspaceRoot
        });
        writeJson(response, 200, apiResponse(job));
        if (job && (job.status === "done" || job.status === "failed")) {
          await recordCutterUsageEventBestEffort({
            api_input: input,
            auth,
            event_type: job.status === "done" ? "cut_success" : "cut_failure",
            source_video_id: job.source_video_id,
            cut_job_id: job.cut_job_id,
            selected_duration_ms: selectedDurationMs(job)
          });
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/workspace/open-export-directory") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const body = (await readRequestJson(request)) as OpenExportDirectoryRequestBody;
        writeJson(response, 200, apiResponse(await openWorkspaceExportDirectory(input, body)));
        return;
      }

      const cutJobRetryMatch = /^\/cutter\/cut-jobs\/([^/]+)\/retry$/.exec(url.pathname);
      if (request.method === "POST" && cutJobRetryMatch) {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const cutJobId = cutJobRetryMatch[1] ?? "";
        if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
          writeError(response, 400, "invalid_cut_job_id", "剪切任务编号格式不正确");
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        try {
          writeJson(response, 200, apiResponse(await retryCutJob({
            workspace_root: workspaceRoot,
            cut_job_id: cutJobId,
            now: input.now?.() ?? new Date().toISOString()
          })));
          scheduleCutQueueDrain("retry");
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "cut job not found") {
            writeError(response, 404, "cut_job_not_found", "剪切任务不存在");
            return;
          }

          if (message === "only failed cut jobs can be retried") {
            writeError(response, 409, "cut_job_not_failed", "只有失败任务需要重试");
            return;
          }

          throw error;
        }
        return;
      }

      const projectOutputsDeleteMatch = /^\/cutter\/projects\/([^/]+)\/outputs$/.exec(url.pathname);
      if (request.method === "DELETE" && projectOutputsDeleteMatch) {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        try {
          writeJson(response, 200, apiResponse(await deleteProjectOutputs({
            workspace_root: workspaceRoot,
            project_id: decodeURIComponent(projectOutputsDeleteMatch[1] ?? "")
          })));
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "project_id must be a safe project identifier") {
            writeError(response, 400, "invalid_project_id", "项目编号格式不正确");
            return;
          }

          throw error;
        }
        return;
      }

      if (request.method === "POST") {
        writeError(response, 404, "not_found", "Route not found");
        return;
      }

      if (url.pathname === "/health") {
        writeJson(response, 200, apiResponse({
          ok: true,
          searchd_configured: Boolean(optionalTrimmed(input.searchd_base_url)),
          library_root_path: input.library_root,
          workspace_root_path: input.workspace_root ?? "",
          release_cache_root_path: input.release_cache_root ?? ""
        }));
        return;
      }

      if (url.pathname === "/cutter/auth/mode") {
        const authMode: CutterAuthMode = input.auth_mode === "local_trusted" ? "local_trusted" : "reviewed";
        writeJson(response, 200, apiResponse({
          auth_mode: authMode,
          local_trusted: authMode === "local_trusted",
          trusted_username: authMode === "local_trusted"
            ? (input.trusted_username?.trim() || "Allen")
            : ""
        }));
        return;
      }

      if (url.pathname === "/cutter/auth/status") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        writeJson(response, 200, apiResponse({
          ok: true,
          user: publicCutterUser(auth.user)
        }));
        return;
      }

      if (url.pathname === "/cutter/runtime-status") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        writeJson(response, 200, apiResponse(await runtimeStatusForSession({
          api_input: input,
          auth,
          include_local_cache: url.searchParams.get("include_cache") === "1"
        })));
        return;
      }

      if (url.pathname === "/cutter/source-library") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const library = await loadSourceLibraryPage(input, {
          limit: parseSourceLibraryLimit(url.searchParams.get("limit")),
          offset: parseSourceLibraryOffset(url.searchParams.get("offset")),
          source_folder_name: optionalTrimmed(url.searchParams.get("source_folder_name") ?? undefined)
        });
        writeJson(
          response,
          200,
          apiResponse(library)
        );
        return;
      }

      if (url.pathname === "/cutter/source-folders") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const state = await fastLibraryReadState(input);
        const sourceFolders = await listCutterSourceFolders({
          library_root: input.library_root,
          ...(state.release_root ? { release_root: state.release_root } : {})
        });
        writeJson(
          response,
          200,
          apiResponse({
            source_folders: sourceFolders
          })
        );
        return;
      }

      if (url.pathname === "/cutter/source-search") {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });

        if (!auth) {
          return;
        }

        const query = url.searchParams.get("query") ?? "";
        const cursor = optionalTrimmed(url.searchParams.get("cursor") ?? undefined);
        const sourceFolderName = optionalTrimmed(url.searchParams.get("source_folder_name") ?? undefined);
        const startedAt = Date.now();
        let result: CutterSourceLibrarySearchResult;
        try {
          result = await searchCutterSourceLibraryWithPreferredBackend({
            api_input: input,
            query,
            limit: parsePositiveLimit(url.searchParams.get("limit")),
            cursor,
            source_folder_name: sourceFolderName
          });
        } catch (error) {
          await recordCutterUsageEventBestEffort({
            api_input: input,
            auth,
            event_type: "search",
            query,
            search_mode: failedSearchAttemptMode(cursor),
            search_page_type: cursor ? "cursor" : "first",
            search_elapsed_ms: Math.max(0, Date.now() - startedAt),
            result_status: "failure"
          });
          throw error;
        }
        const groups: ApiSearchGroup[] = result.groups.map(addSourceVideoUrls);
        writeJson(
          response,
          200,
          apiResponse({
            ...result,
            groups
          })
        );
        await recordCutterUsageEventBestEffort({
          api_input: input,
          auth,
          event_type: "search",
          query,
          search_mode: result.search_mode,
          search_page_type: cursor ? "cursor" : "first",
          search_elapsed_ms: result.search_ms,
          result_status: groups.length > 0 ? "success" : "empty"
        });
        return;
      }

      if (url.pathname === "/cutter/clip-lists") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        writeJson(response, 200, apiResponse(await listClipLists({
          workspace_root: workspaceRoot
        })));
        return;
      }

      if (url.pathname === "/cutter/cut-jobs") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        if (!input.workspace_root) {
          writeJson(response, 200, apiResponse({
            job_count: 0,
            jobs: []
          }));
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
        writeJson(response, 200, apiResponse(await listCutJobs({
          workspace_root: workspaceRoot,
          limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : undefined,
          offset: Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0
        })));
        return;
      }

      if (url.pathname === "/cutter/local-clips") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : undefined;
        const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

        if (input.workspace_root) {
          const catalog = await listExportClips({
            workspace_root: input.workspace_root,
            limit,
            offset
          });
          writeJson(response, 200, apiResponse({
            ...catalog,
            clips: catalog.clips.map(toWorkspaceLocalClipPayload)
          }));
          return;
        }

        const catalog = await listLocalClips({
          library_root: input.library_root,
          limit,
          offset
        });
        writeJson(response, 200, apiResponse({
          ...catalog,
          clips: catalog.clips.map((clip) => ({
            ...clip,
            ...localClipUrls(clip.local_clip_id)
          }))
        }));
        return;
      }

      let localClipRoute;

      try {
        localClipRoute = parseLocalClipRoute(url.pathname);
      } catch (error) {
        if ((error as Error).message === "invalid_local_clip_id") {
          writeError(
            response,
            400,
            "invalid_local_clip_id",
            "local_clip_id must use LC000001 or E000001 format"
          );
          return;
        }

        writeError(response, 404, "not_found", "Route not found");
        return;
      }

      if (localClipRoute) {
        if (localClipRoute.action === "") {
          if (!(await requireCutterSession({
            api_input: input,
            request,
            response
          }))) {
            return;
          }
        }

        if (input.workspace_root) {
          if (!/^E\d{6}$/.test(localClipRoute.local_clip_id)) {
            writeError(response, 404, "local_clip_not_found", "Local clip not found");
            return;
          }

          const clip = await getExportClipDetail({
            workspace_root: input.workspace_root,
            export_clip_id: localClipRoute.local_clip_id
          });

          if (!clip) {
            writeError(response, 404, "local_clip_not_found", "Local clip not found");
            return;
          }

          if (localClipRoute.action === "") {
            writeJson(response, 200, apiResponse(toWorkspaceLocalClipPayload(clip)));
            return;
          }

          if (localClipRoute.action === "cover") {
            if (!clip.cover_file_path) {
              writeError(response, 404, "local_clip_cover_not_found", "Local clip cover not found");
              return;
            }

            await streamFile({
              request,
              response,
              file_path: clip.cover_file_path,
              content_type: contentTypeForImage(clip.cover_file_path),
              range_enabled: false
            });
            return;
          }

          if (localClipRoute.action === "subtitles.srt") {
            if (!clip.subtitles_file_path) {
              writeError(response, 404, "local_clip_subtitles_not_found", "Local clip subtitles not found");
              return;
            }

            await streamFile({
              request,
              response,
              file_path: clip.subtitles_file_path,
              content_type: "text/plain; charset=utf-8",
              range_enabled: false
            });
            return;
          }

          // Media streams are intentionally not header-gated: browser video elements
          // cannot reliably attach the custom cutter auth headers after an approved
          // page has loaded the URL.
          await streamFile({
            request,
            response,
            file_path: clip.media_file_path,
            content_type: "video/mp4",
            range_enabled: true
          });
          return;
        }

        const clip = await getLocalClipDetail({
          library_root: input.library_root,
          local_clip_id: localClipRoute.local_clip_id
        });

        if (!clip) {
          writeError(response, 404, "local_clip_not_found", "Local clip not found");
          return;
        }

        if (localClipRoute.action === "") {
          writeJson(response, 200, apiResponse({
            ...clip,
            ...localClipUrls(clip.local_clip_id)
          }));
          return;
        }

        if (localClipRoute.action !== "media") {
          writeError(response, 404, "local_clip_artifact_not_found", "Local clip artifact not found");
          return;
        }

        // Media streams are intentionally not header-gated; see the workspace
        // branch above for the browser playback rationale.
        await streamFile({
          request,
          response,
          file_path: clip.media_file_path,
          content_type: "video/mp4",
          range_enabled: true
        });
        return;
      }

      let route;

      try {
        route = parseSourceVideoRoute(url.pathname);
      } catch (error) {
        if ((error as Error).message === "invalid_source_video_id") {
          writeError(
            response,
            400,
            "invalid_source_video_id",
            "source_video_id must use V000001 format"
          );
          return;
        }

        writeError(response, 404, "not_found", "Route not found");
        return;
      }

      if (route) {
        if (route.action === "") {
          const auth = await requireCutterSession({
            api_input: input,
            request,
            response
          });

          if (!auth) {
            return;
          }

          const detail = await loadReadableTranscriptDetail(input, route.source_video_id);

          if (!detail) {
            writeError(response, 404, "source_video_not_found", "Source video not found");
            return;
          }

          writeJson(response, 200, apiResponse(addSourceVideoUrls(detail) as ApiSourceVideoDetail));
          await recordCutterUsageEventBestEffort({
            api_input: input,
            auth,
            event_type: "view_source_video",
            source_video_id: detail.source_video_id
          });
          return;
        }

        const detail = await loadVisibleDetail(input, route.source_video_id);

        if (!detail) {
          writeError(response, 404, "source_video_not_found", "Source video not found");
          return;
        }

        // Media, covers, and subtitles are allowed without custom auth headers so
        // authenticated pages can hand URLs to native video/img/subtitle loaders.
        if (route.action === "media") {
          const mediaDetail = await sourceDetailWithLocalSourceCache(input, detail);
          await streamFile({
            request,
            response,
            file_path: mediaDetail.source_video_file_path,
            content_type: contentTypeForSourceVideo(detail.source_video_file_path),
            range_enabled: true
          });
          return;
        }

        if (route.action === "cover") {
          const sourceCoverFilePath = optionalLibraryRelativeFilePath(
            input.library_root,
            detail.cover_path
          );
          const coverFilePath = await fileExists(detail.cover_file_path)
            ? detail.cover_file_path
            : sourceCoverFilePath;
          if (!coverFilePath) {
            writeError(response, 404, "source_video_cover_not_found", "Source video cover not found");
            return;
          }
          const cachedCoverFilePath = await cachedThumbnailFilePath({
            api_input: input,
            source_video_id: detail.source_video_id,
            source_file_path: coverFilePath
          });
          if (!(await fileExists(cachedCoverFilePath))) {
            writeError(response, 404, "source_video_cover_not_found", "Source video cover not found");
            return;
          }
          await streamFile({
            request,
            response,
            file_path: cachedCoverFilePath,
            content_type: contentTypeForImage(cachedCoverFilePath),
            range_enabled: false
          });
          return;
        }

        if (route.action === "subtitles.srt") {
          if (!(await fileExists(detail.srt_file_path))) {
            writeText(response, 200, detail.srt);
            return;
          }
          await streamFile({
            request,
            response,
            file_path: detail.srt_file_path,
            content_type: "text/plain; charset=utf-8",
            range_enabled: false
          });
          return;
        }
      }

      writeError(response, 404, "not_found", "Route not found");
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error as Error);
        return;
      }

      if ((error as Error).message === "invalid_range") {
        writeError(response, 416, "invalid_range", "Range header is invalid");
        return;
      }

      if ((error as Error).message === "limit must be an integer between 1 and 100") {
        writeError(response, 400, "invalid_limit", "limit must be an integer between 1 and 100");
        return;
      }

      if ((error as Error).message === "invalid_search_cursor") {
        writeError(response, 400, "invalid_search_cursor", "搜索分页游标格式不正确");
        return;
      }

      if ((error as Error).message === "searchd_unavailable") {
        writeError(response, 502, "searchd_unavailable", "本地搜索服务暂不可用，请重试搜索。");
        return;
      }

      const infrastructureError = cutterApiInfrastructureErrorPayload(error);
      if (infrastructureError) {
        writeError(
          response,
          infrastructureError.statusCode,
          infrastructureError.code,
          infrastructureError.message
        );
        return;
      }

      logUnhandledCutterApiError(request, error);
      writeError(response, 500, "internal_error", "Internal server error");
    }
  });
}
