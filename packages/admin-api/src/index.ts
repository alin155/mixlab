import { constants, createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  createDashScopeTemporaryFileAudioUploader,
  createFetchDashScopeHttpClient,
  type DashScopeAsrModel
} from "../../asr-core/src/index.ts";
import {
  mkdir,
  access,
  readFile,
  readdir,
  stat,
  statfs,
  writeFile
} from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { cpus, freemem, loadavg, networkInterfaces, totalmem } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { exportMixlabDoctorReport, runMixlabDoctor } from "../../doctor-core/src/index.ts";
import {
  buildFfmpegCoverImagePlan,
  buildFfprobeSourceMetadataPlan,
  parseFfprobeSourceMetadata,
  resolveFfmpegRuntime
} from "../../ffmpeg-core/src/index.ts";
import {
  appendPreprocessJobLog,
  addAdminSourceFolder,
  applyAdminRuntimeSecretsToEnv,
  approveCutterUser,
  completeReadyVisualArtifacts,
  disableCutterUser,
  getFileIdentity,
  listCutterUsers,
  publishIndexRequiredSourceVideos,
  preprocessJobLogPath,
  readAdminSettings,
  readAllSourceVideoManifests,
  readPreprocessJobLog,
  readSourceVideoManifest,
  readUsageMetrics,
  removeAdminSourceFolder,
  resolveSourceVideoFilePath,
  scanSourceVideos,
  updateAdminRuntimeSecrets,
  updateAdminSettings,
  updateAdminSourceFolder,
  type AdminRuntimeSecretsPatch,
  type AdminSettingsPatch,
  type AdminRuntimePolicy,
  type AdminSourceFolder,
  type AdminSourceFolderPatch
} from "../../library-fs/src/index.ts";
import {
  validateIndexCurrentPointer,
  validateIndexPackageManifest,
  validateSourceVideoManifest,
  type IndexCurrentPointer,
  type IndexPackageManifest,
  type LibraryCounts,
  type PreprocessStatus,
  type SourceVideoManifest,
  type TranscriptSegment
} from "../../protocol/src/index.ts";
import {
  runLibraryTextPreprocessWorker,
  runSourceVideoTextPreprocess,
  type RunLibraryTextPreprocessWorkerInput,
  type RunLibraryTextPreprocessWorkerResult
} from "../../preprocess-core/src/index.ts";
import {
  createPreprocessSupervisor,
  type PreprocessSupervisorRunner,
  type PreprocessSupervisorStatus
} from "./preprocess-supervisor.ts";
import { readSourceTranscriptSqliteIndexMetadata } from "../../search-sqlite/src/index.ts";

export interface CreateAdminApiServerInput {
  library_root: string;
  library_id?: string;
  library_name?: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
  preprocess_runner?: PreprocessSupervisorRunner;
  ready_publish_media?: ReadyPublishMedia;
}

export interface ReadyPublishMedia {
  create_cover(input: {
    source_path: string;
    output_path: string;
    at_ms: number;
    width: number;
  }): Promise<void>;
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
  current_stage?: string;
  stage_updated_at?: string;
  error_stage?: string;
  error_message?: string;
}

interface PublicPreprocessSupervisorStatus {
  state: PreprocessSupervisorStatus["state"];
  state_label: string;
  worker_id: string;
  started_at: string;
  stopped_at: string;
  last_error: string;
  stop_requested: boolean;
  last_result: {
    total_claimed_count: number;
    succeeded_count: number;
    failed_count: number;
  } | null;
}

interface PreprocessJobsResponse {
  active_count: number;
  queued_count: number;
  completed_count: number;
  failed_count: number;
  supervisor?: PublicPreprocessSupervisorStatus;
  jobs: Array<{
    job_id: string;
    source_video_id: string;
    title: string;
    status: "running" | "queued" | "done" | "failed";
    status_label: string;
    stage: string;
    stage_label: string;
    progress: number;
    started_at?: string;
    completed_at?: string;
    failed_at?: string;
    elapsed_ms: number;
    estimated_remaining_ms: number;
    estimated_start_at: string;
    estimated_done_at: string;
    queue_position: number;
    log_path: string;
    log_url: string;
    retryable: boolean;
    error_message?: string;
  }>;
  observability?: {
    running_job_id: string;
    running_source_video_id: string;
    pipeline_progress_percent: number;
    estimated_all_done_at: string;
    estimated_queue_duration_ms: number;
    throughput_label: string;
    load_advice: string;
  };
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

const ADMIN_MANIFEST_CACHE_TTL_MS = 30_000;
const ADMIN_MANIFEST_READ_CONCURRENCY = 24;
const ADMIN_FILTERED_SCAN_BATCH_SIZE = ADMIN_MANIFEST_READ_CONCURRENCY * 4;
const ADMIN_FILTERED_QUERY_SCAN_BATCH_LIMIT = 8;
const ADMIN_FULL_TRANSCRIPT_METRICS_MAX_MANIFESTS = 100;
const ADMIN_FULL_DASHBOARD_METRICS_MAX_MANIFESTS = 100;
const ADMIN_ACTIVE_JOB_SYNC_SCAN_BATCH_LIMIT = 0;
const ADMIN_ACTIVE_JOB_BACKGROUND_SCAN_BATCH_SIZE = 12;
const ADMIN_ACTIVE_JOB_BACKGROUND_SCAN_PAUSE_MS = 20;
const ADMIN_COVER_MAX_BYTES = 10 * 1024 * 1024;

const ADMIN_COVER_CONTENT_TYPES: Record<string, {
  extension: "jpg" | "png" | "webp";
  content_type: "image/jpeg" | "image/png" | "image/webp";
}> = {
  "image/jpeg": { extension: "jpg", content_type: "image/jpeg" },
  "image/jpg": { extension: "jpg", content_type: "image/jpeg" },
  "image/png": { extension: "png", content_type: "image/png" },
  "image/webp": { extension: "webp", content_type: "image/webp" }
};

const manifestCache = new Map<string, {
  expires_at: number;
  manifests: SourceVideoManifest[];
  pending?: Promise<SourceVideoManifest[]>;
}>();

const sourceVideoIdsCache = new Map<string, {
  expires_at: number;
  source_video_ids: string[];
  pending?: Promise<string[]>;
}>();

const activePreprocessManifestCache = new Map<string, {
  expires_at: number;
  manifests: SourceVideoManifest[];
  pending?: Promise<SourceVideoManifest[]>;
}>();

function readFreshCachedSourceVideoManifests(libraryRoot: string): SourceVideoManifest[] | null {
  const cached = manifestCache.get(libraryRoot);
  return cached && !cached.pending && cached.expires_at > Date.now()
    ? cached.manifests
    : null;
}

async function readCachedSourceVideoManifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
  const nowMs = Date.now();
  const cached = manifestCache.get(libraryRoot);

  if (cached?.pending) {
    return cached.pending;
  }

  if (cached && cached.expires_at > nowMs) {
    return cached.manifests;
  }

  const pending = readAllAdminSourceVideoManifests(libraryRoot)
    .then((manifests) => {
      manifestCache.set(libraryRoot, {
        expires_at: Date.now() + ADMIN_MANIFEST_CACHE_TTL_MS,
        manifests
      });
      return manifests;
    })
    .catch((error) => {
      manifestCache.delete(libraryRoot);
      throw error;
    });

  manifestCache.set(libraryRoot, {
    expires_at: 0,
    manifests: cached?.manifests ?? [],
    pending
  });

  return pending;
}

async function readSortedSourceVideoIdsFromDisk(libraryRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(videosRoot(libraryRoot), { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((sourceVideoId) => /^V\d{6}$/.test(sourceVideoId))
    .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right));
}

async function readSortedSourceVideoIds(libraryRoot: string): Promise<string[]> {
  const nowMs = Date.now();
  const cached = sourceVideoIdsCache.get(libraryRoot);

  if (cached?.pending) {
    return cached.pending;
  }

  if (cached && cached.expires_at > nowMs) {
    return cached.source_video_ids;
  }

  const pending = readSortedSourceVideoIdsFromDisk(libraryRoot)
    .then((sourceVideoIds) => {
      sourceVideoIdsCache.set(libraryRoot, {
        expires_at: Date.now() + ADMIN_MANIFEST_CACHE_TTL_MS,
        source_video_ids: sourceVideoIds
      });
      return sourceVideoIds;
    })
    .catch((error) => {
      sourceVideoIdsCache.delete(libraryRoot);
      throw error;
    });

  sourceVideoIdsCache.set(libraryRoot, {
    expires_at: 0,
    source_video_ids: cached?.source_video_ids ?? [],
    pending
  });

  return pending;
}

async function readAdminSourceVideoManifestsByIds(input: {
  library_root: string;
  source_video_ids: string[];
}): Promise<SourceVideoManifest[]> {
  const manifests: SourceVideoManifest[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < input.source_video_ids.length) {
      const sourceVideoId = input.source_video_ids[nextIndex];
      nextIndex += 1;

      if (!sourceVideoId) {
        continue;
      }

      try {
        manifests.push(await readSourceVideoManifest(input.library_root, sourceVideoId));
      } catch {
        // Malformed manifests are reported by Doctor; list views skip them.
      }
    }
  }

  await Promise.all(
    Array.from({
      length: Math.min(ADMIN_MANIFEST_READ_CONCURRENCY, input.source_video_ids.length)
    }, () => worker())
  );

  return manifests.sort(
    (left, right) =>
      numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
  );
}

async function readAllAdminSourceVideoManifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
  const sourceVideoIds = await readSortedSourceVideoIds(libraryRoot);
  return readAdminSourceVideoManifestsByIds({
    library_root: libraryRoot,
    source_video_ids: sourceVideoIds
  });
}

async function readSourceVideoManifestPage(input: {
  library_root: string;
  offset: number;
  limit: number;
}): Promise<SourceVideoManifest[]> {
  const sourceVideoIds = (await readSortedSourceVideoIds(input.library_root))
    .slice(input.offset, input.offset + input.limit);

  return readAdminSourceVideoManifestsByIds({
    library_root: input.library_root,
    source_video_ids: sourceVideoIds
  });
}

function mergeSourceVideoManifestsById(manifests: SourceVideoManifest[]): SourceVideoManifest[] {
  const byId = new Map<string, SourceVideoManifest>();

  for (const manifest of manifests) {
    byId.set(manifest.source_video_id, manifest);
  }

  return Array.from(byId.values());
}

const adminSourceVideoStatuses = new Set<PreprocessStatus>([
  "unprocessed",
  "queued",
  "processing",
  "ready",
  "failed",
  "index-required"
]);

function adminSourceVideoMatchesListFilter(
  manifest: SourceVideoManifest,
  filter: {
    query?: string;
    status?: PreprocessStatus;
  }
): boolean {
  if (filter.status && manifest.preprocess_status !== filter.status) {
    return false;
  }

  const normalizedQuery = filter.query?.trim().toLocaleLowerCase() ?? "";
  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [
    manifest.source_video_id,
    manifest.title,
    fileNameFromRelativePath(manifest.relative_path),
    manifest.relative_path,
    manifest.description ?? "",
    manifest.lecturer ?? "",
    manifest.course ?? "",
    manifest.category ?? "",
    ...(manifest.tags ?? [])
  ].join(" ").toLocaleLowerCase();

  return searchableText.includes(normalizedQuery);
}

function escapeSqliteLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function libraryCountForPreprocessStatus(library: LibraryManifest, status: PreprocessStatus): number {
  switch (status) {
    case "ready":
      return library.ready_video_count;
    case "processing":
      return library.processing_video_count;
    case "queued":
      return library.queued_video_count;
    case "unprocessed":
      return library.unprocessed_video_count;
    case "failed":
      return library.failed_video_count;
    case "index-required":
      return library.index_required_video_count;
  }
}

function sourceVideoManifestFromIndexedRow(row: {
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path: string;
  cover_path: string;
}): SourceVideoManifest {
  return {
    source_video_id: row.source_video_id,
    title: row.title,
    relative_path: row.relative_path,
    logical_uri: `library://source-video/${row.source_video_id}`,
    duration_ms: row.duration_ms,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: 0,
    content_hash: "",
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: row.cover_path,
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}

async function readIndexedAdminSourceVideoManifests(input: {
  library_root: string;
  offset: number;
  limit: number;
  query?: string;
}): Promise<SourceVideoManifest[] | null> {
  const currentVersion = await readCurrentIndexVersion(input.library_root);
  if (!currentVersion) {
    return null;
  }

  const indexPath = path.join(
    mixlabRoot(input.library_root),
    "indexes",
    "source-transcript-index",
    currentVersion,
    "index.sqlite"
  );
  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(`file:${indexPath}?mode=ro&immutable=1`);
    const normalizedQuery = input.query?.trim() ?? "";
    const rows = normalizedQuery
      ? db.prepare(`
        SELECT source_video_id, title, duration_ms, relative_path, cover_path
        FROM source_videos
        WHERE lower(source_video_id) LIKE lower(?) ESCAPE '\\'
          OR lower(title) LIKE lower(?) ESCAPE '\\'
          OR lower(relative_path) LIKE lower(?) ESCAPE '\\'
        ORDER BY position
        LIMIT ? OFFSET ?
      `).all(
        `%${escapeSqliteLike(normalizedQuery)}%`,
        `%${escapeSqliteLike(normalizedQuery)}%`,
        `%${escapeSqliteLike(normalizedQuery)}%`,
        input.limit > 0 ? input.limit : -1,
        input.offset
      )
      : db.prepare(`
        SELECT source_video_id, title, duration_ms, relative_path, cover_path
        FROM source_videos
        ORDER BY position
        LIMIT ? OFFSET ?
      `).all(
        input.limit > 0 ? input.limit : -1,
        input.offset
      );

    return (rows as Array<{
      source_video_id: string;
      title: string;
      duration_ms: number;
      relative_path: string;
      cover_path: string;
    }>).map(sourceVideoManifestFromIndexedRow);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function readIndexedAdminSourceVideoIdSet(libraryRoot: string): Promise<Set<string> | null> {
  const currentVersion = await readCurrentIndexVersion(libraryRoot);
  if (!currentVersion) {
    return null;
  }

  const indexPath = path.join(
    mixlabRoot(libraryRoot),
    "indexes",
    "source-transcript-index",
    currentVersion,
    "index.sqlite"
  );
  let db: DatabaseSync | undefined;

  try {
    db = new DatabaseSync(`file:${indexPath}?mode=ro&immutable=1`);
    const rows = db.prepare("SELECT source_video_id FROM source_videos").all() as Array<{
      source_video_id: string;
    }>;

    return new Set(rows.map((row) => row.source_video_id));
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function readFilteredAdminSourceVideoManifestPage(input: {
  library_root: string;
  offset: number;
  limit: number;
  query?: string;
  status?: PreprocessStatus;
  exclude_indexed_ready?: boolean;
  max_scan_batches?: number;
}): Promise<SourceVideoManifest[]> {
  if (input.limit <= 0) {
    const fallbackManifests = await readCachedSourceVideoManifests(input.library_root);
    return fallbackManifests.filter((manifest) =>
      adminSourceVideoMatchesListFilter(manifest, {
        query: input.query,
        status: input.status
      })
    );
  }

  const normalizedQuery = input.query?.trim() ?? "";
  const library = input.status ? await readLibraryManifest(input.library_root) : null;
  if (library && input.status && libraryCountForPreprocessStatus(library, input.status) <= input.offset) {
    return [];
  }

  let sourceVideoIds = await readSortedSourceVideoIds(input.library_root);
  if (input.exclude_indexed_ready) {
    const indexedReadyIds = await readIndexedAdminSourceVideoIdSet(input.library_root);
    if (indexedReadyIds) {
      sourceVideoIds = sourceVideoIds.filter((sourceVideoId) => !indexedReadyIds.has(sourceVideoId));
    }
  }

  const requestedEnd = input.offset + input.limit;
  const targetMatchCount = library && input.status && !normalizedQuery
    ? Math.min(requestedEnd, libraryCountForPreprocessStatus(library, input.status))
    : requestedEnd;
  const matched: SourceVideoManifest[] = [];

  for (
    let start = 0, scannedBatchCount = 0;
    start < sourceVideoIds.length &&
      matched.length < targetMatchCount &&
      (!input.max_scan_batches || scannedBatchCount < input.max_scan_batches);
    start += ADMIN_FILTERED_SCAN_BATCH_SIZE, scannedBatchCount += 1
  ) {
    const manifests = await readAdminSourceVideoManifestsByIds({
      library_root: input.library_root,
      source_video_ids: sourceVideoIds.slice(start, start + ADMIN_FILTERED_SCAN_BATCH_SIZE)
    });

    for (const manifest of manifests) {
      if (adminSourceVideoMatchesListFilter(manifest, {
        query: input.query,
        status: input.status
      })) {
        matched.push(manifest);
      }
    }

    if (normalizedQuery && matched.length > input.offset) {
      break;
    }
  }

  return matched.slice(input.offset, requestedEnd);
}

async function readAdminSourceVideoQueryList(input: {
  library_root: string;
  offset: number;
  limit: number;
  query: string;
}): Promise<SourceVideoManifest[] | null> {
  if (input.limit <= 0) {
    return null;
  }

  const requestedEnd = input.offset + input.limit;
  const indexedReadyMatches = await readIndexedAdminSourceVideoManifests({
    library_root: input.library_root,
    offset: 0,
    limit: requestedEnd,
    query: input.query
  });

  if (!indexedReadyMatches) {
    return null;
  }

  const readyPage = indexedReadyMatches.slice(input.offset, requestedEnd);
  if (readyPage.length > 0) {
    return readyPage;
  }

  const remaining = input.limit - readyPage.length;
  if (remaining <= 0) {
    return readyPage;
  }

  const nonReadyOffset = Math.max(0, input.offset - indexedReadyMatches.length);
  const nonReadyPage = await readFilteredAdminSourceVideoManifestPage({
    library_root: input.library_root,
    offset: nonReadyOffset,
    limit: remaining,
    query: input.query,
    exclude_indexed_ready: true,
    max_scan_batches: ADMIN_FILTERED_QUERY_SCAN_BATCH_LIMIT
  });

  return [...readyPage, ...nonReadyPage];
}

async function readAdminSourceVideoList(input: {
  library_root: string;
  offset: number;
  limit: number;
  query?: string;
  status?: PreprocessStatus;
}): Promise<SourceVideoManifest[]> {
  const hasFilter = Boolean(input.query?.trim()) || Boolean(input.status);

  if (!hasFilter) {
    if (input.limit > 0) {
      const indexedReadyPage = await readIndexedAdminSourceVideoManifests({
        library_root: input.library_root,
        offset: input.offset,
        limit: input.limit,
        query: ""
      });

      if (indexedReadyPage && indexedReadyPage.length > 0) {
        return indexedReadyPage;
      }

      return readSourceVideoManifestPage(input);
    }

    return readCachedSourceVideoManifests(input.library_root);
  }

  const cachedManifests = readFreshCachedSourceVideoManifests(input.library_root);
  const manifests = cachedManifests ?? [];
  const normalizedQuery = input.query?.trim() ?? "";
  const canUseIndexedReadyList = input.status === "ready";

  if (cachedManifests) {
    const filtered = manifests.filter((manifest) =>
      adminSourceVideoMatchesListFilter(manifest, {
        query: input.query,
        status: input.status
      })
    );

    return input.limit > 0
      ? filtered.slice(input.offset, input.offset + input.limit)
      : filtered;
  }

  if (normalizedQuery && !input.status) {
    const queryMatches = await readAdminSourceVideoQueryList({
      library_root: input.library_root,
      offset: input.offset,
      limit: input.limit,
      query: normalizedQuery
    });

    if (queryMatches) {
      return queryMatches;
    }
  }

  if (canUseIndexedReadyList) {
    const indexedManifests = await readIndexedAdminSourceVideoManifests({
      library_root: input.library_root,
      offset: input.offset,
      limit: input.limit,
      query: normalizedQuery
    });

    if (indexedManifests) {
      return input.status
        ? indexedManifests.filter((manifest) => manifest.preprocess_status === input.status)
        : indexedManifests;
    }
  }

  return readFilteredAdminSourceVideoManifestPage({
    ...input,
    max_scan_batches: normalizedQuery ? ADMIN_FILTERED_QUERY_SCAN_BATCH_LIMIT : undefined
  });
}

function cacheActivePreprocessManifests(libraryRoot: string, manifests: SourceVideoManifest[]): SourceVideoManifest[] {
  activePreprocessManifestCache.set(libraryRoot, {
    expires_at: Date.now() + ADMIN_MANIFEST_CACHE_TTL_MS,
    manifests
  });
  return manifests;
}

async function readActivePreprocessManifestsSlowly(input: {
  library_root: string;
  limit: number;
}): Promise<SourceVideoManifest[]> {
  const sourceVideoIds = await readSortedSourceVideoIds(input.library_root);
  const manifests: SourceVideoManifest[] = [];

  for (
    let start = 0;
    start < sourceVideoIds.length && manifests.length < input.limit;
    start += ADMIN_ACTIVE_JOB_BACKGROUND_SCAN_BATCH_SIZE
  ) {
    const batch = await readAdminSourceVideoManifestsByIds({
      library_root: input.library_root,
      source_video_ids: sourceVideoIds.slice(start, start + ADMIN_ACTIVE_JOB_BACKGROUND_SCAN_BATCH_SIZE)
    });

    for (const manifest of batch) {
      if (manifest.preprocess_status === "processing") {
        manifests.push(manifest);
      }
    }

    if (manifests.length < input.limit) {
      await delay(ADMIN_ACTIVE_JOB_BACKGROUND_SCAN_PAUSE_MS);
    }
  }

  return manifests;
}

function refreshActivePreprocessManifestsInBackground(libraryRoot: string, limit: number): void {
  const cached = activePreprocessManifestCache.get(libraryRoot);
  if (cached?.pending) {
    return;
  }

  const pending = readActivePreprocessManifestsSlowly({
    library_root: libraryRoot,
    limit
  })
    .then((manifests) => cacheActivePreprocessManifests(libraryRoot, manifests))
    .catch(() => {
      activePreprocessManifestCache.set(libraryRoot, {
        expires_at: Date.now() + 2_000,
        manifests: cached?.manifests ?? []
      });
      return cached?.manifests ?? [];
    });

  activePreprocessManifestCache.set(libraryRoot, {
    expires_at: cached?.expires_at ?? 0,
    manifests: cached?.manifests ?? [],
    pending
  });
}

async function readActivePreprocessManifestsForJobList(input: {
  library_root: string;
  expected_count: number;
  fallback_limit: number;
}): Promise<SourceVideoManifest[]> {
  const limit = Math.min(Math.max(input.expected_count || input.fallback_limit, 1), 500);
  const cached = activePreprocessManifestCache.get(input.library_root);

  if (input.expected_count <= 0) {
    activePreprocessManifestCache.delete(input.library_root);
    return [];
  }

  if (cached && !cached.pending && cached.expires_at > Date.now()) {
    return cached.manifests;
  }

  if (cached?.pending) {
    return cached.manifests;
  }

  if (cached && cached.manifests.length > 0) {
    refreshActivePreprocessManifestsInBackground(input.library_root, limit);
    return cached.manifests;
  }

  const quickManifests = ADMIN_ACTIVE_JOB_SYNC_SCAN_BATCH_LIMIT > 0
    ? await readFilteredAdminSourceVideoManifestPage({
        library_root: input.library_root,
        offset: 0,
        limit,
        status: "processing",
        max_scan_batches: ADMIN_ACTIVE_JOB_SYNC_SCAN_BATCH_LIMIT
      })
    : [];

  if (quickManifests.length >= input.expected_count) {
    return cacheActivePreprocessManifests(input.library_root, quickManifests);
  }

  refreshActivePreprocessManifestsInBackground(input.library_root, limit);
  return quickManifests;
}

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

function publicPreprocessSupervisorStatus(status: PreprocessSupervisorStatus): PublicPreprocessSupervisorStatus {
  return {
    state: status.state,
    state_label: status.state_label,
    worker_id: status.worker_id,
    started_at: status.started_at,
    stopped_at: status.stopped_at,
    last_error: status.last_error,
    stop_requested: status.stop_requested,
    last_result: status.last_result
      ? {
          total_claimed_count: status.last_result.total_claimed_count,
          succeeded_count: status.last_result.succeeded_count,
          failed_count: status.last_result.failed_count
        }
      : null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRequestRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error("请求内容必须是对象");
  }

  return body;
}

interface AdminSettingsMutationPatch {
  settings_patch: AdminSettingsPatch;
  runtime_secrets_patch?: AdminRuntimeSecretsPatch;
}

function adminSettingsPatchFromBody(body: Record<string, unknown>): AdminSettingsMutationPatch {
  const patch: AdminSettingsPatch = {};
  let runtimeSecretsPatch: AdminRuntimeSecretsPatch | undefined;

  if ("library_name" in body) {
    patch.library_name = body.library_name as string;
  }

  if ("source_folders" in body) {
    if (!Array.isArray(body.source_folders)) {
      throw new Error("素材来源列表必须是数组");
    }
    patch.source_folders = body.source_folders as AdminSourceFolder[];
  }

  if ("runtime_policy" in body) {
    if (!isRecord(body.runtime_policy)) {
      throw new Error("运行策略必须是对象");
    }
    patch.runtime_policy = body.runtime_policy as unknown as AdminSettingsPatch["runtime_policy"];
  }

  if ("asr" in body) {
    if (!isRecord(body.asr)) {
      throw new Error("语音识别配置必须是对象");
    }

    if ("dashscope_api_key" in body.asr) {
      runtimeSecretsPatch = {
        dashscope_api_key: String(body.asr.dashscope_api_key ?? "")
      };
    }
  }

  return {
    settings_patch: patch,
    ...(runtimeSecretsPatch ? { runtime_secrets_patch: runtimeSecretsPatch } : {})
  };
}

function adminSourceFolderFromBody(body: Record<string, unknown>): Omit<AdminSourceFolder, "id"> {
  return {
    name: body.name as string,
    path: body.path as string,
    enabled: body.enabled === undefined ? true : (body.enabled as boolean)
  };
}

function adminSourceFolderPatchFromBody(body: Record<string, unknown>): AdminSourceFolderPatch {
  const patch: AdminSourceFolderPatch = {};

  if ("name" in body) {
    patch.name = body.name as string;
  }

  if ("path" in body) {
    patch.path = body.path as string;
  }

  if ("enabled" in body) {
    patch.enabled = body.enabled as boolean;
  }

  return patch;
}

function writeSettingsMutationError(response: ServerResponse, error: unknown): void {
  if (error instanceof SyntaxError) {
    writeJson(response, 400, apiError("invalid_request", "请求 JSON 格式无效"));
    return;
  }

  const message = error instanceof Error ? error.message : "设置保存失败";

  if (message === "素材来源不存在") {
    writeJson(response, 404, apiError("not_found", message));
    return;
  }

  if (
    message === "请求内容必须是对象" ||
    message === "素材来源列表必须是数组" ||
    message === "运行策略必须是对象" ||
    message === "语音识别配置必须是对象" ||
    message.includes("管理员设置文件格式无效") ||
    message.includes("素材来源") ||
    message.includes("预处理产物库") ||
    message.includes("默认素材来源不能移除")
  ) {
    writeJson(response, 400, apiError("invalid_request", message));
    return;
  }

  throw error;
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

function contentTypeForImage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  return "image/jpeg";
}

function dataUrlParts(value: string): {
  content_type: string;
  image_base64: string;
} | null {
  const match = /^data:([^;,]+);base64,(.*)$/is.exec(value.trim());
  return match
    ? {
        content_type: match[1]?.toLowerCase() ?? "",
        image_base64: match[2] ?? ""
      }
    : null;
}

function normalizedCoverContentType(value: unknown): {
  extension: "jpg" | "png" | "webp";
  content_type: "image/jpeg" | "image/png" | "image/webp";
} | null {
  if (typeof value !== "string") {
    return null;
  }

  return ADMIN_COVER_CONTENT_TYPES[value.trim().toLowerCase()] ?? null;
}

function assertCoverBytesMatchContentType(bytes: Buffer, contentType: string): void {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp = bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if (
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/webp" && isWebp)
  ) {
    return;
  }

  throw new Error("封面图片内容与类型不匹配");
}

function coverUpdateFromBody(body: unknown): {
  image_bytes: Buffer;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
} {
  const record = requireRequestRecord(body);
  const rawImageBase64 = typeof record.image_base64 === "string"
    ? record.image_base64
    : typeof record.data_base64 === "string"
      ? record.data_base64
      : typeof record.data_url === "string"
        ? record.data_url
        : "";
  const parsedDataUrl = dataUrlParts(rawImageBase64);
  const contentType = normalizedCoverContentType(parsedDataUrl?.content_type ?? record.content_type);

  if (!contentType) {
    throw new Error("封面图片仅支持 JPG、PNG 或 WebP");
  }

  const normalizedBase64 = (parsedDataUrl?.image_base64 ?? rawImageBase64).replace(/\s/g, "");
  if (
    normalizedBase64 === "" ||
    normalizedBase64.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64)
  ) {
    throw new Error("封面图片内容必须是有效的 base64");
  }

  const imageBytes = Buffer.from(normalizedBase64, "base64");
  if (imageBytes.length === 0) {
    throw new Error("封面图片内容不能为空");
  }

  if (imageBytes.length > ADMIN_COVER_MAX_BYTES) {
    throw new Error("封面图片不能超过 10MB");
  }

  assertCoverBytesMatchContentType(imageBytes, contentType.content_type);

  return {
    image_bytes: imageBytes,
    content_type: contentType.content_type,
    extension: contentType.extension
  };
}

async function updateSourceVideoCover(input: {
  library_root: string;
  source_video_id: string;
  body: unknown;
}): Promise<SourceVideoManifest | null> {
  let manifest: SourceVideoManifest;
  try {
    manifest = await readSourceVideoManifest(input.library_root, input.source_video_id);
  } catch {
    return null;
  }

  const coverUpdate = coverUpdateFromBody(input.body);
  const coverPath = `.mixlab-library/videos/${input.source_video_id}/cover.${coverUpdate.extension}`;
  const absoluteCoverPath = path.join(input.library_root, coverPath);

  await mkdir(path.dirname(absoluteCoverPath), { recursive: true });
  await writeFile(absoluteCoverPath, coverUpdate.image_bytes);

  const updated: SourceVideoManifest = {
    ...manifest,
    cover_path: coverPath
  };
  await writeSourceVideoManifest(input.library_root, updated);
  return updated;
}

function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function sourceVideoIdFromJobId(jobId: string): string | null {
  const match = /^J(\d{6})$/.exec(jobId);
  return match ? `V${match[1]}` : null;
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

type PathAccessStatus = "ok" | "missing" | "denied";

async function directoryAccessStatus(filePath: string, mode: number): Promise<PathAccessStatus> {
  try {
    if (!(await stat(filePath)).isDirectory()) {
      return "missing";
    }

    await access(filePath, mode);
    return "ok";
  } catch (error) {
    return isNotFoundError(error) ? "missing" : "denied";
  }
}

async function fileAccessStatus(filePath: string, mode: number): Promise<PathAccessStatus> {
  try {
    if (!(await stat(filePath)).isFile()) {
      return "missing";
    }

    await access(filePath, mode);
    return "ok";
  } catch (error) {
    return isNotFoundError(error) ? "missing" : "denied";
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
  manifestCache.delete(libraryRoot);
  sourceVideoIdsCache.delete(libraryRoot);
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

async function readCurrentIndexMetadata(libraryRoot: string): Promise<{
  source_video_count: number;
  segment_count: number;
} | null> {
  const currentVersion = await readCurrentIndexVersion(libraryRoot);

  if (!currentVersion) {
    return null;
  }

  try {
    const metadata = readSourceTranscriptSqliteIndexMetadata(path.join(
      mixlabRoot(libraryRoot),
      "indexes",
      "source-transcript-index",
      currentVersion,
      "index.sqlite"
    ));

    return {
      source_video_count: metadata.source_video_count,
      segment_count: metadata.segment_count
    };
  } catch {
    return null;
  }
}

async function readTranscriptMetrics(input: {
  library_root: string;
  manifests: SourceVideoManifest[];
}): Promise<{
  transcript_video_count: number;
  character_count: number;
  segment_count: number;
}> {
  if (input.manifests.length > ADMIN_FULL_TRANSCRIPT_METRICS_MAX_MANIFESTS) {
    const indexMetadata = await readCurrentIndexMetadata(input.library_root);

    if (indexMetadata) {
      return {
        transcript_video_count: indexMetadata.source_video_count,
        character_count: 0,
        segment_count: indexMetadata.segment_count
      };
    }
  }

  let characterCount = 0;
  let segmentCount = 0;
  let transcriptVideoCount = 0;

  for (const manifest of input.manifests) {
    const transcript = await readTranscriptSummary(input.library_root, manifest);
    if (transcript.segment_count > 0 || transcript.full_text.length > 0) {
      transcriptVideoCount += 1;
      characterCount += transcript.character_count;
      segmentCount += transcript.segment_count;
    }
  }

  return {
    transcript_video_count: transcriptVideoCount,
    character_count: characterCount,
    segment_count: segmentCount
  };
}

async function primarySourceVideosPath(libraryRoot: string): Promise<string> {
  const settings = await readAdminSettings(libraryRoot);
  const primaryFolder = settings.source_folders.find((folder) => folder.enabled)
    ?? settings.source_folders[0];

  return primaryFolder?.path ?? sourceVideosRoot(libraryRoot);
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
  const manifests = library ? [] : await readCachedSourceVideoManifests(input.library_root);
  const counts = library ?? countByStatus(manifests);
  const currentVersion = await readCurrentIndexVersion(input.library_root);
  const disk = await diskUsage(input.library_root);
  const activeManifest = manifests.find((manifest) => manifest.preprocess_status === "processing");

  return {
    library_id: library?.library_id ?? input.library_id ?? "lib_main_001",
    name: library?.name ?? input.library_name ?? "MixLab 公共素材库",
    root_path: input.library_root,
    source_videos_path: await primarySourceVideosPath(input.library_root),
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
    active_task_label: activeManifest
      ? `${activeManifest.source_video_id} - processing`
      : counts.processing_video_count > 0
        ? `${counts.processing_video_count} 个任务正在处理`
        : "无正在处理任务",
    updated_at: library?.updated_at ?? now
  };
}

type RuntimeLoadStatus = "healthy" | "attention" | "blocked";

interface RuntimeCpuTimesSample {
  idle_ms: number;
  total_ms: number;
}

function runtimeCpuTimesSample(): RuntimeCpuTimesSample {
  return cpus().reduce<RuntimeCpuTimesSample>(
    (sample, cpu) => {
      const totalMs = Object.values(cpu.times).reduce((total, value) => total + value, 0);

      return {
        idle_ms: sample.idle_ms + cpu.times.idle,
        total_ms: sample.total_ms + totalMs
      };
    },
    { idle_ms: 0, total_ms: 0 }
  );
}

export function runtimeCpuUsagePercentFromSamples(
  previous: RuntimeCpuTimesSample,
  current: RuntimeCpuTimesSample
): number {
  const totalDelta = current.total_ms - previous.total_ms;
  const idleDelta = current.idle_ms - previous.idle_ms;

  if (totalDelta <= 0 || idleDelta < 0) {
    return 0;
  }

  const busyRatio = 1 - (idleDelta / totalDelta);
  return Math.min(100, Math.max(0, Math.round(busyRatio * 100)));
}

async function sampleRuntimeCpuUsagePercent(): Promise<number> {
  const previous = runtimeCpuTimesSample();
  await delay(250);
  return runtimeCpuUsagePercentFromSamples(previous, runtimeCpuTimesSample());
}

export function runtimeMemoryMetricsFromMacosPressureLevel(input: {
  total_bytes: number;
  free_percent: number;
}): { total_bytes: number; used_bytes: number; available_bytes: number; usage_percent: number } {
  const freePercent = Math.min(100, Math.max(0, Math.round(input.free_percent)));
  const availableBytes = Math.round(input.total_bytes * (freePercent / 100));
  const usedBytes = Math.max(0, input.total_bytes - availableBytes);

  return {
    total_bytes: input.total_bytes,
    used_bytes: usedBytes,
    available_bytes: availableBytes,
    usage_percent: input.total_bytes > 0 ? Math.round((usedBytes / input.total_bytes) * 100) : 0
  };
}

function readMacosMemoryPressureFreePercent(): number | null {
  if (process.platform !== "darwin") {
    return null;
  }

  const result = spawnSync("sysctl", ["-n", "kern.memorystatus_level"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  const value = Number.parseInt(result.stdout.trim(), 10);
  return Number.isInteger(value) ? value : null;
}

function runtimeMemoryMetrics(): {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  usage_percent: number;
} {
  const memoryTotal = totalmem();
  const macosFreePercent = readMacosMemoryPressureFreePercent();

  if (macosFreePercent !== null) {
    return runtimeMemoryMetricsFromMacosPressureLevel({
      total_bytes: memoryTotal,
      free_percent: macosFreePercent
    });
  }

  const memoryAvailable = freemem();
  const memoryUsed = Math.max(0, memoryTotal - memoryAvailable);

  return {
    total_bytes: memoryTotal,
    used_bytes: memoryUsed,
    available_bytes: memoryAvailable,
    usage_percent: memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0
  };
}

function statusFromPercent(value: number, attentionAt: number, blockedAt: number): RuntimeLoadStatus {
  if (value >= blockedAt) {
    return "blocked";
  }

  if (value >= attentionAt) {
    return "attention";
  }

  return "healthy";
}

function worstRuntimeStatus(statuses: RuntimeLoadStatus[]): RuntimeLoadStatus {
  if (statuses.includes("blocked")) {
    return "blocked";
  }

  if (statuses.includes("attention")) {
    return "attention";
  }

  return "healthy";
}

function activeNetworkInterfaceCount(): number {
  return Object.values(networkInterfaces()).filter((entries) =>
    (entries ?? []).some((entry) => !entry.internal)
  ).length;
}

async function getRuntimeLoadMetrics(input: CreateAdminApiServerInput) {
  const now = input.now?.() ?? new Date().toISOString();
  const loadAverage1m = loadavg()[0] ?? 0;
  const cpuUsagePercent = await sampleRuntimeCpuUsagePercent();
  const cpuStatus = statusFromPercent(cpuUsagePercent, 70, 90);

  const memory = runtimeMemoryMetrics();
  const memoryUsagePercent = memory.usage_percent;
  const memoryStatus = statusFromPercent(memoryUsagePercent, 75, 90);

  const disk = await diskUsage(input.library_root);
  const diskUsed = Math.max(0, disk.total - disk.available);
  const diskUsagePercent = disk.total > 0 ? Math.round((diskUsed / disk.total) * 100) : 0;
  const diskStatus = statusFromPercent(diskUsagePercent, 80, 92);

  const activeInterfaceCount = activeNetworkInterfaceCount();
  const networkStatus: RuntimeLoadStatus = activeInterfaceCount > 0 ? "healthy" : "blocked";
  const serviceStatus: RuntimeLoadStatus = "healthy";

  return {
    overall_status: worstRuntimeStatus([cpuStatus, memoryStatus, diskStatus, networkStatus, serviceStatus]),
    cpu: {
      usage_percent: cpuUsagePercent,
      load_average_1m: Number(loadAverage1m.toFixed(2)),
      status: cpuStatus,
      label: cpuStatus === "healthy" ? "负荷正常" : cpuStatus === "attention" ? "负荷偏高" : "负荷过高"
    },
    memory: {
      total_bytes: memory.total_bytes,
      used_bytes: memory.used_bytes,
      available_bytes: memory.available_bytes,
      usage_percent: memoryUsagePercent,
      status: memoryStatus,
      label: memoryStatus === "healthy" ? "内存充足" : memoryStatus === "attention" ? "内存偏紧" : "内存不足"
    },
    disk: {
      total_bytes: disk.total,
      available_bytes: disk.available,
      usage_percent: diskUsagePercent,
      status: diskStatus,
      label: diskStatus === "healthy" ? "空间充足" : diskStatus === "attention" ? "空间偏紧" : "空间不足"
    },
    network: {
      active_interface_count: activeInterfaceCount,
      status: networkStatus,
      label: activeInterfaceCount > 0 ? "网络可用" : "网络不可用"
    },
    service: {
      uptime_seconds: Math.round(process.uptime()),
      heartbeat_at: now,
      status: serviceStatus,
      label: "服务运行中"
    }
  };
}

async function getDashboardMetrics(input: CreateAdminApiServerInput) {
  const now = input.now?.() ?? new Date().toISOString();
  const today = now.slice(0, 10);
  const library = await readLibraryManifest(input.library_root);
  const useSummaryMetrics = (library?.video_count ?? 0) > ADMIN_FULL_DASHBOARD_METRICS_MAX_MANIFESTS;
  const manifests = useSummaryMetrics ? [] : await readCachedSourceVideoManifests(input.library_root);
  const counts = library && useSummaryMetrics ? library : countByStatus(manifests);
  const currentIndexVersion = await readCurrentIndexVersion(input.library_root);
  const transcriptMetrics = useSummaryMetrics
    ? await readCurrentIndexMetadata(input.library_root).then((metadata) => ({
        transcript_video_count: metadata?.source_video_count ?? counts.ready_video_count,
        character_count: 0,
        segment_count: metadata?.segment_count ?? 0
      }))
    : await readTranscriptMetrics({
        library_root: input.library_root,
        manifests
      });
  let completedTodayCount = 0;
  let failedTodayCount = 0;
  const processDurations: number[] = [];
  let queuedOrRunningCount = 0;

  for (const manifest of manifests) {
    if (manifest.preprocess_status === "queued" || manifest.preprocess_status === "processing") {
      queuedOrRunningCount += 1;
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
  if (useSummaryMetrics) {
    queuedOrRunningCount = counts.queued_video_count + counts.processing_video_count;
  }
  const estimatedQueueDoneAt = averageVideoProcessMs > 0 && queuedOrRunningCount > 0
    ? new Date(Date.parse(now) + queuedOrRunningCount * averageVideoProcessMs).toISOString()
    : "";

  return {
    material: {
      video_count: counts.video_count,
      ready_video_count: counts.ready_video_count,
      total_duration_ms: useSummaryMetrics
        ? 0
        : manifests.reduce((total, manifest) => total + manifest.duration_ms, 0),
      ready_duration_ms: useSummaryMetrics
        ? 0
        : manifests
          .filter((manifest) => manifest.preprocess_status === "ready")
          .reduce((total, manifest) => total + manifest.duration_ms, 0),
      unprocessed_duration_ms: useSummaryMetrics
        ? 0
        : manifests
          .filter((manifest) => manifest.preprocess_status === "unprocessed")
          .reduce((total, manifest) => total + manifest.duration_ms, 0),
      total_size_bytes: useSummaryMetrics
        ? 0
        : manifests.reduce((total, manifest) => total + manifest.file_size, 0)
    },
    transcript: {
      transcript_video_count: transcriptMetrics.transcript_video_count,
      character_count: transcriptMetrics.character_count,
      segment_count: transcriptMetrics.segment_count,
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
    },
    runtime_load: await getRuntimeLoadMetrics(input)
  };
}

async function pathChecks(libraryRoot: string) {
  const settings = await readAdminSettings(libraryRoot);
  const sourceFolderChecks = await Promise.all(settings.source_folders.map(async (folder) => {
    const accessStatus = await directoryAccessStatus(folder.path, constants.R_OK);

    return {
      label: `素材来源：${folder.name}`,
      path: folder.path,
      status: folder.enabled ? (accessStatus === "ok" ? "pass" : "fail") : "warn",
      message: folder.enabled
        ? accessStatus === "ok"
          ? "素材来源可读"
          : accessStatus === "missing"
            ? "素材来源不存在"
            : "素材来源权限不足"
        : "素材来源已停用"
    };
  }));
  const libraryAccess = await directoryAccessStatus(libraryRoot, constants.R_OK | constants.W_OK);
  const mixlabAccess = await directoryAccessStatus(mixlabRoot(libraryRoot), constants.R_OK | constants.W_OK);
  const manifestAccess = await fileAccessStatus(libraryManifestPath(libraryRoot), constants.R_OK | constants.W_OK);

  return [
    {
      label: "公共素材库",
      path: libraryRoot,
      status: libraryAccess === "ok" ? "pass" : "fail",
      message: libraryAccess === "ok"
        ? "根路径可读写"
        : libraryAccess === "missing"
          ? "根路径不存在"
          : "根路径权限不足"
    },
    ...sourceFolderChecks,
    {
      label: ".mixlab-library",
      path: mixlabRoot(libraryRoot),
      status: mixlabAccess === "ok" ? "pass" : mixlabAccess === "missing" ? "warn" : "fail",
      message: mixlabAccess === "ok"
        ? "协议目录可读写"
        : mixlabAccess === "missing"
          ? "尚未初始化协议目录"
          : "协议目录权限不足"
    },
    {
      label: "library.json",
      path: libraryManifestPath(libraryRoot),
      status: manifestAccess === "ok" ? "pass" : manifestAccess === "missing" ? "warn" : "fail",
      message: manifestAccess === "ok"
        ? "library.json 可读写"
        : manifestAccess === "missing"
          ? "library.json 尚未创建"
          : "library.json 权限不足"
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

function preprocessJobStatusLabel(status: "running" | "queued" | "done" | "failed"): string {
  const labels = {
    running: "正在处理",
    queued: "等待处理",
    done: "已完成",
    failed: "失败可重试"
  } satisfies Record<"running" | "queued" | "done" | "failed", string>;

  return labels[status];
}

function preprocessStageLabel(stage: string, status?: "running" | "queued" | "done" | "failed"): string {
  if (status === "queued") {
    return "等待处理";
  }

  const labels: Record<string, string> = {
    unprocessed: "未处理",
    queued: "等待处理",
    "queued-by-admin": "等待处理",
    "queued-by-pipeline": "等待处理",
    "probe-media": "媒体探测",
    processing: "正在处理",
    "extract-audio": "提取音频",
    "upload-audio": "上传音频",
    asr: "语音识别",
    "write-transcript": "写入文案",
    "text-preprocess": "文案预处理",
    "build-keyframes": "生成关键帧",
    "build-index": "自动发布索引",
    "publish-ready": "发布可用产物",
    ready: "已完成",
    failed: "处理失败"
  };

  return labels[stage] ?? "正在处理";
}

function stageProgress(stage: string, status: "running" | "queued" | "done" | "failed"): number {
  if (status === "done") {
    return 100;
  }
  if (status === "failed" || status === "queued") {
    return 0;
  }

  const progressByStage: Record<string, number> = {
    processing: 15,
    "probe-media": 18,
    "extract-audio": 20,
    "upload-audio": 35,
    asr: 50,
    "write-transcript": 70,
    "text-preprocess": 65,
    "build-keyframes": 80,
    "build-index": 90,
    "publish-ready": 95
  };

  return progressByStage[stage] ?? 25;
}

function timestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoAt(ms: number | null): string {
  return ms === null ? "" : new Date(ms).toISOString();
}

function durationBetweenMs(start: string | undefined, end: string | undefined): number {
  const startMs = timestampMs(start);
  const endMs = timestampMs(end);

  if (startMs === null || endMs === null || endMs < startMs) {
    return 0;
  }

  return endMs - startMs;
}

function averageCompletedProcessMs(jobs: Array<PreprocessJobRecord | null>, fallbackMs: number): number {
  const durations = jobs
    .map((job) => durationBetweenMs(job?.claimed_at, job?.completed_at ?? job?.indexed_at))
    .filter((duration) => duration > 0);

  if (durations.length === 0) {
    return fallbackMs;
  }

  return Math.round(durations.reduce((total, value) => total + value, 0) / durations.length);
}

function formatBackendDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function loadAdvice(load: Awaited<ReturnType<typeof getRuntimeLoadMetrics>>): string {
  if (load.disk.status === "blocked") {
    return "磁盘空间不足，建议暂停流水线并清理空间。";
  }
  if (load.network.status === "blocked") {
    return "网络不可用，建议暂停流水线并检查语音识别网络。";
  }
  if (load.cpu.status === "blocked" || load.memory.status === "blocked") {
    return "运行负荷过高，建议暂停流水线或降低并发任务数。";
  }
  if (load.overall_status === "attention") {
    return "运行负荷偏高，建议继续观察，必要时降低并发任务数。";
  }

  return "运行负荷正常，可以继续处理";
}

function jobStageFromManifest(manifest: SourceVideoManifest, job: PreprocessJobRecord | null): string {
  if (manifest.preprocess_status === "processing" && job?.current_stage) {
    return job.current_stage;
  }

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

async function listPreprocessJobs(input: CreateAdminApiServerInput, options: {
  limit?: number;
  offset?: number;
} = {}) {
  const libraryRoot = input.library_root;
  const now = input.now?.() ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const settings = await readAdminSettings(libraryRoot);
  const concurrency = Math.max(1, settings.runtime_policy.concurrent_jobs);
  const library = options.limit ? await readLibraryManifest(libraryRoot) : null;
  const pageManifests = options.limit
    ? await readSourceVideoManifestPage({
        library_root: libraryRoot,
        offset: options.offset ?? 0,
        limit: options.limit
      })
    : await readCachedSourceVideoManifests(libraryRoot);
  const activeManifests = options.limit
    ? await readActivePreprocessManifestsForJobList({
        library_root: libraryRoot,
        expected_count: library?.processing_video_count ?? options.limit,
        fallback_limit: options.limit
      })
    : [];
  const manifests = mergeSourceVideoManifestsById([...pageManifests, ...activeManifests]);
  const jobRecords = await Promise.all(
    manifests.map((manifest) => readPreprocessJob(libraryRoot, manifest.source_video_id))
  );
  const averageProcessMs = averageCompletedProcessMs(
    jobRecords,
    manifests.length > 0
      ? Math.max(60_000, Math.round(
        manifests.reduce((total, manifest) => total + manifest.duration_ms, 0) / manifests.length
      ))
      : 0
  );
  const jobs: PreprocessJobsResponse["jobs"] = [];

  for (const [index, manifest] of manifests.entries()) {
    if (manifest.preprocess_status === "unprocessed") {
      continue;
    }

    const job = jobRecords[index] ?? null;
    const status = jobStatusFromManifest(manifest.preprocess_status);
    const stage = jobStageFromManifest(manifest, job);
    const completedAt = job?.completed_at ?? job?.indexed_at;
    const failedAt = job?.failed_at;
    const elapsedMs = status === "running"
      ? Math.max(0, nowMs - (timestampMs(job?.claimed_at) ?? nowMs))
      : status === "done"
        ? durationBetweenMs(job?.claimed_at, completedAt)
        : status === "failed"
          ? durationBetweenMs(job?.claimed_at, failedAt)
          : 0;
    const elapsedProgress = averageProcessMs > 0
      ? Math.min(95, Math.max(5, Math.round((elapsedMs / averageProcessMs) * 100)))
      : 0;

    jobs.push({
      job_id: `J${manifest.source_video_id.slice(1)}`,
      source_video_id: manifest.source_video_id,
      title: manifest.title,
      status,
      status_label: preprocessJobStatusLabel(status),
      stage,
      stage_label: preprocessStageLabel(stage, status),
      progress: status === "running"
        ? Math.max(stageProgress(stage, status), elapsedProgress)
        : stageProgress(stage, status),
      started_at: job?.claimed_at,
      completed_at: completedAt,
      failed_at: failedAt,
      elapsed_ms: elapsedMs,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "",
      queue_position: 0,
      log_path: preprocessJobLogPath(manifest.source_video_id),
      log_url: `/api/admin/preprocess/jobs/J${manifest.source_video_id.slice(1)}/log`,
      retryable: status === "failed",
      error_message: job?.error_message
    });
  }

  const ordered = jobs.sort((left, right) => {
    const statusToPreprocess = (status: "running" | "queued" | "done" | "failed"): PreprocessStatus =>
      status === "running" ? "processing" : status === "done" ? "ready" : status;
    const leftStatus = STATUS_ORDER.indexOf(statusToPreprocess(left.status));
    const rightStatus = STATUS_ORDER.indexOf(statusToPreprocess(right.status));

    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }

    if (left.status === "queued" && right.status === "queued") {
      return numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id);
    }

    return numericSourceVideoId(right.source_video_id) - numericSourceVideoId(left.source_video_id);
  });
  const runningJobs = ordered.filter((job) => job.status === "running");
  const queuedJobs = ordered.filter((job) => job.status === "queued");
  const firstRunningRemaining = runningJobs.length > 0 && averageProcessMs > 0
    ? Math.max(0, averageProcessMs - runningJobs[0]!.elapsed_ms)
    : 0;
  let queueCursorMs = nowMs + firstRunningRemaining;

  for (const [index, job] of queuedJobs.entries()) {
    const batchIndex = Math.floor(index / concurrency);
    const startMs = queueCursorMs + batchIndex * averageProcessMs;
    const doneMs = startMs + averageProcessMs;
    job.queue_position = index + 1;
    job.estimated_start_at = isoAt(startMs);
    job.estimated_done_at = isoAt(doneMs);
    job.estimated_remaining_ms = Math.max(0, doneMs - nowMs);
    job.stage_label = "等待处理";
  }

  for (const job of runningJobs) {
    job.estimated_remaining_ms = averageProcessMs > 0
      ? Math.max(0, averageProcessMs - job.elapsed_ms)
      : 0;
    job.estimated_start_at = job.started_at ?? "";
    job.estimated_done_at = job.estimated_remaining_ms > 0
      ? isoAt(nowMs + job.estimated_remaining_ms)
      : "";
  }

  const doneCount = ordered.filter((job) => job.status === "done").length;
  const failedCount = ordered.filter((job) => job.status === "failed").length;
  const totalObservableCount = Math.max(1, ordered.length);
  const runningProgress = runningJobs.reduce((total, job) => total + job.progress / 100, 0);
  const pipelineProgressPercent = Math.round(((doneCount + runningProgress) / totalObservableCount) * 100);
  const estimatedQueueDurationMs = firstRunningRemaining + Math.ceil(queuedJobs.length / concurrency) * averageProcessMs;
  const estimatedAllDoneAt = estimatedQueueDurationMs > 0 ? isoAt(nowMs + estimatedQueueDurationMs) : "";
  const runtimeLoad = await getRuntimeLoadMetrics(input);
  const queuedCount = library?.queued_video_count ?? queuedJobs.length;
  const activeCount = library?.processing_video_count ?? runningJobs.length;
  const failedTotalCount = library?.failed_video_count ?? failedCount;
  const throughputLabel = estimatedQueueDurationMs > 0
    ? `预计 ${formatBackendDuration(estimatedQueueDurationMs)} 完成当前队列`
    : queuedCount > 0
      ? `${queuedCount} 个视频正在等待处理`
      : activeCount > 0
        ? `${activeCount} 个视频正在处理中`
        : "当前没有等待处理的队列";

  return {
    active_count: activeCount,
    queued_count: queuedCount,
    completed_count: doneCount,
    failed_count: failedTotalCount,
    jobs: ordered,
    observability: {
      running_job_id: runningJobs[0]?.job_id ?? "",
      running_source_video_id: runningJobs[0]?.source_video_id ?? "",
      pipeline_progress_percent: pipelineProgressPercent,
      estimated_all_done_at: estimatedAllDoneAt,
      estimated_queue_duration_ms: estimatedQueueDurationMs,
      throughput_label: throughputLabel,
      load_advice: loadAdvice(runtimeLoad)
    }
  } satisfies PreprocessJobsResponse;
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
  let manifest: SourceVideoManifest;
  try {
    manifest = await readSourceVideoManifest(libraryRoot, sourceVideoId);
  } catch {
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

type AdminIndexValidationStatus = "pass" | "warn" | "fail";

function indexValidationStatus(messages: string[]): AdminIndexValidationStatus {
  return messages.length > 0 ? "fail" : "pass";
}

function chineseIndexPackageValidationMessage(error: string): string {
  if (error.includes("index_version must use")) {
    return "index-manifest.json 版本号格式错误";
  }

  if (error.includes("ready_video_count")) {
    return "ready_video_count 与 source_video_ids 数量不一致";
  }

  if (error.includes("schema_version")) {
    return "schema_version 缺失";
  }

  return error;
}

function chineseCurrentPointerValidationMessage(error: string): string {
  if (error.includes("current_version must use")) {
    return "current.json 当前版本格式错误";
  }

  if (error.includes("does not reference")) {
    return "current.json 指向不存在的索引版本";
  }

  return error;
}

async function readIndexVersionValidation(root: string, indexVersion: string): Promise<{
  created_at: string;
  ready_video_count: number;
  schema_version: string;
  validation_status: AdminIndexValidationStatus;
  validation_message: string;
}> {
  const versionRoot = path.join(root, indexVersion);
  const messages: string[] = [];
  let manifest: Partial<IndexPackageManifest> = {};

  try {
    manifest = await readJsonFile<IndexPackageManifest>(path.join(versionRoot, "index-manifest.json"));
    const manifestValidation = validateIndexPackageManifest(manifest as IndexPackageManifest);

    if (!manifestValidation.ok) {
      messages.push(...manifestValidation.errors.map(chineseIndexPackageValidationMessage));
    }

    if (manifest.index_version && manifest.index_version !== indexVersion) {
      messages.push("index-manifest.json 版本号与目录不一致");
    }
  } catch {
    messages.push("index-manifest.json 无法解析");
  }

  const sqlitePath = path.join(versionRoot, "index.sqlite");
  if (!(await fileExists(sqlitePath))) {
    messages.push("index.sqlite 不存在");
  } else {
    try {
      const metadata = readSourceTranscriptSqliteIndexMetadata(sqlitePath);

      if (metadata.index_version !== indexVersion) {
        messages.push("index.sqlite 元数据版本与目录不一致");
      }

      if (
        typeof manifest.ready_video_count === "number" &&
        metadata.source_video_count !== manifest.ready_video_count
      ) {
        messages.push("index.sqlite 视频数量与 index-manifest.json 不一致");
      }
    } catch {
      messages.push("index.sqlite 无法读取");
    }
  }

  return {
    created_at: manifest.created_at ?? "",
    ready_video_count: manifest.ready_video_count ?? 0,
    schema_version: manifest.schema_version ?? "",
    validation_status: indexValidationStatus(messages),
    validation_message: messages.length > 0 ? messages.join("；") : "索引包校验通过"
  };
}

async function readCurrentIndexValidation(root: string, publishedVersions: string[]): Promise<{
  current_version: string;
  current_validation_status: AdminIndexValidationStatus;
  current_validation_message: string;
}> {
  let pointer: IndexCurrentPointer;

  try {
    pointer = await readJsonFile<IndexCurrentPointer>(path.join(root, "current.json"));
  } catch {
    return {
      current_version: "",
      current_validation_status: publishedVersions.length > 0 ? "fail" : "warn",
      current_validation_message: publishedVersions.length > 0 ? "current.json 不存在或无法解析" : "暂无当前索引指针"
    };
  }

  const validation = validateIndexCurrentPointer(pointer, publishedVersions);

  return {
    current_version: pointer.current_version,
    current_validation_status: validation.ok ? "pass" : "fail",
    current_validation_message: validation.ok
      ? `current.json 指向 ${pointer.current_version}`
      : validation.errors.map(chineseCurrentPointerValidationMessage).join("；")
  };
}

async function listIndexVersions(
  libraryRoot: string,
  options: { limit?: number; offset?: number } = {}
) {
  const root = path.join(mixlabRoot(libraryRoot), "indexes", "source-transcript-index");
  const versionNames: string[] = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^v\d{6}$/.test(entry.name)) {
        continue;
      }

      versionNames.push(entry.name);
    }
  } catch {
    // No index yet.
  }

  const current = await readCurrentIndexValidation(root, versionNames);
  const sortedVersionNames = versionNames.sort((left, right) => right.localeCompare(left));
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, Math.min(options.limit ?? 80, 200));
  const pageVersionNames = sortedVersionNames.slice(offset, offset + limit);

  if (
    current.current_version &&
    sortedVersionNames.includes(current.current_version) &&
    !pageVersionNames.includes(current.current_version)
  ) {
    pageVersionNames.push(current.current_version);
  }

  const versions = await Promise.all(
    pageVersionNames.map(async (indexVersion) => ({
      index_version: indexVersion,
      ...await readIndexVersionValidation(root, indexVersion),
      is_current: indexVersion === current.current_version,
      published_by: "admin"
    }))
  );

  return {
    current_version: current.current_version,
    current_validation_status: current.current_validation_status,
    current_validation_message: current.current_validation_message,
    total_count: sortedVersionNames.length,
    returned_count: versions.length,
    offset,
    limit,
    has_more: offset + limit < sortedVersionNames.length,
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
  const result = spawnSync(executablePath, ["-version"], {
    encoding: "utf8",
    timeout: 250,
    maxBuffer: 64 * 1024
  });
  return result.status === 0 ? result.stdout.split("\n")[0] ?? "available" : "available";
}

function optionalTrimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function preprocessSupervisorIsActive(status: PublicPreprocessSupervisorStatus): boolean {
  return status.state === "running" || status.state === "stopping";
}

function parsePositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const raw = optionalTrimmed(env[key]);

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} 必须是正整数`);
  }

  return parsed;
}

function runProcess(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} 执行失败：${result.stderr}`);
  }
}

function runProcessForStdout(executable: string, args: string[]): string {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} 执行失败：${result.stderr}`);
  }

  return result.stdout;
}

function buildReadyPublishKeyframesMs(input: {
  duration_ms: number;
  interval_ms?: number;
  max_count?: number;
}): number[] {
  const intervalMs = input.interval_ms ?? 5_000;
  const maxCount = input.max_count ?? 60;
  const durationMs = Math.max(0, Math.trunc(input.duration_ms));

  if (durationMs === 0) {
    return [0];
  }

  const dense: number[] = [];

  for (let cursor = 0; cursor < durationMs; cursor += intervalMs) {
    dense.push(cursor);
  }

  dense.push(durationMs);

  if (dense.length <= maxCount) {
    return Array.from(new Set(dense));
  }

  const sampled = new Set<number>();

  for (let index = 0; index < maxCount; index += 1) {
    sampled.add(Math.round((durationMs * index) / (maxCount - 1)));
  }

  return Array.from(sampled).sort((left, right) => left - right);
}

function createDefaultReadyPublishMedia(): ReadyPublishMedia {
  return {
    async create_cover(input) {
      const runtime = resolveFfmpegRuntime();
      const plan = buildFfmpegCoverImagePlan({
        source_path: input.source_path,
        output_path: input.output_path,
        at_ms: input.at_ms,
        width: input.width
      });

      runProcess(runtime.ffmpeg_path, plan.args);
    }
  };
}

async function prepareReadyPublishArtifacts(input: {
  library_root: string;
  source_video_ids?: string[];
  now: string;
  media: ReadyPublishMedia;
}): Promise<string[]> {
  const requestedIds = input.source_video_ids ? new Set(input.source_video_ids) : null;
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const indexRequired = manifests.filter(
    (manifest) =>
      manifest.preprocess_status === "index-required" &&
      (!requestedIds || requestedIds.has(manifest.source_video_id))
  );
  const preparedSourceVideoIds: string[] = [];

  for (const manifest of indexRequired) {
    const coverPath = manifest.cover_path.trim()
      ? manifest.cover_path
      : `.mixlab-library/videos/${manifest.source_video_id}/cover.jpg`;
    const absoluteCoverPath = path.join(input.library_root, coverPath);

    if (!(await fileExists(absoluteCoverPath))) {
      await mkdir(path.dirname(absoluteCoverPath), { recursive: true });
      const sourcePath = await resolveSourceVideoFilePath(input.library_root, manifest);
      await input.media.create_cover({
        source_path: sourcePath,
        output_path: absoluteCoverPath,
        at_ms: Math.min(1_000, Math.max(0, manifest.duration_ms - 1)),
        width: 640
      });
    }

    await completeReadyVisualArtifacts({
      library_root: input.library_root,
      source_video_id: manifest.source_video_id,
      cover_path: coverPath,
      keyframes_ms: buildReadyPublishKeyframesMs({
        duration_ms: manifest.duration_ms
      }),
      now: input.now
    });
    preparedSourceVideoIds.push(manifest.source_video_id);
  }

  return preparedSourceVideoIds;
}

async function publishReadyPreparedVideos(input: {
  library_root: string;
  library_id: string;
  now: string;
  media: ReadyPublishMedia;
  source_video_ids?: string[];
}) {
  const preparedSourceVideoIds = await prepareReadyPublishArtifacts({
    library_root: input.library_root,
    source_video_ids: input.source_video_ids,
    now: input.now,
    media: input.media
  });
  const result = await publishIndexRequiredSourceVideos({
    library_root: input.library_root,
    library_id: input.library_id,
    now: input.now,
    ...(input.source_video_ids ? { source_video_ids: input.source_video_ids } : {})
  });
  const publishedCount = result.published_source_video_ids.length;
  const skippedCount = result.skipped_source_video_ids.length;
  const message = publishedCount > 0
    ? `已发布 ${publishedCount} 个原视频，当前可用 ${result.ready_video_count} 个。`
    : skippedCount > 0
      ? `没有发布新视频，${skippedCount} 个待发布视频缺少文案、字幕、封面或关键帧产物。`
      : "没有需要发布的待索引视频。";

  return {
    ...result,
    prepared_source_video_ids: preparedSourceVideoIds,
    published_count: publishedCount,
    skipped_count: skippedCount,
    affected_count: publishedCount,
    message
  };
}

function assertRealPreprocessStartReady(env: NodeJS.ProcessEnv): void {
  if (!optionalTrimmed(env.DASHSCOPE_API_KEY)) {
    throw new Error("语音识别接口密钥未配置，无法启动真实预处理服务");
  }
}

export type AdminPreprocessWorkerCycleInput = Omit<
  RunLibraryTextPreprocessWorkerInput,
  "probe_source_video" | "preprocess_source_video" | "get_content_hash"
>;

export interface RunAdminPreprocessPipelineInput {
  library_root: string;
  library_id: string;
  library_name: string;
  runtime_policy: AdminRuntimePolicy;
  limit?: number;
  now: () => string;
  media: ReadyPublishMedia;
  should_stop?: () => boolean;
  run_worker_cycle(input: AdminPreprocessWorkerCycleInput): Promise<RunLibraryTextPreprocessWorkerResult>;
}

export interface RunAdminPreprocessPipelineResult extends RunLibraryTextPreprocessWorkerResult {
  prepared_source_video_ids: string[];
  published_source_video_ids: string[];
  skipped_source_video_ids: string[];
  published_count: number;
  skipped_count: number;
}

export async function runAdminPreprocessPipeline(
  input: RunAdminPreprocessPipelineInput
): Promise<RunAdminPreprocessPipelineResult> {
  await initializeLibrary({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: input.now()
  });
  const scanResult = await scanSourceVideos({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: input.now()
  });
  await transitionManifests({
    library_root: input.library_root,
    from: ["unprocessed"],
    to: "queued",
    now: input.now(),
    reason: "queued-by-pipeline"
  });
  await writeLibraryManifest({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: input.now()
  });

  const items: RunLibraryTextPreprocessWorkerResult["items"] = [];
  const preparedSourceVideoIds: string[] = [];
  const publishedSourceVideoIds: string[] = [];
  const skippedSourceVideoIds: string[] = [];
  let totalClaimedCount = 0;
  let succeededCount = 0;
  let failedCount = 0;

  while (input.should_stop?.() !== true) {
    const cycleResult = await input.run_worker_cycle({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      worker_id: `admin-worker-${process.pid}`,
      limit: input.limit ?? input.runtime_policy.concurrent_jobs,
      audio_mode: input.runtime_policy.audio_mode,
      now: input.now,
      scan_before_claim: false,
      claim_statuses: ["queued"]
    });
    totalClaimedCount += cycleResult.total_claimed_count;
    succeededCount += cycleResult.succeeded_count;
    failedCount += cycleResult.failed_count;
    items.push(...cycleResult.items);

    const publishResult = await publishReadyPreparedVideos({
      library_root: input.library_root,
      library_id: input.library_id,
      now: input.now(),
      media: input.media
    });
    preparedSourceVideoIds.push(...publishResult.prepared_source_video_ids);
    publishedSourceVideoIds.push(...publishResult.published_source_video_ids);
    skippedSourceVideoIds.push(...publishResult.skipped_source_video_ids);

    if (cycleResult.total_claimed_count === 0) {
      break;
    }
  }

  return {
    scan_result: scanResult,
    total_claimed_count: totalClaimedCount,
    succeeded_count: succeededCount,
    failed_count: failedCount,
    items,
    prepared_source_video_ids: [...new Set(preparedSourceVideoIds)],
    published_source_video_ids: [...new Set(publishedSourceVideoIds)],
    skipped_source_video_ids: [...new Set(skippedSourceVideoIds)],
    published_count: new Set(publishedSourceVideoIds).size,
    skipped_count: new Set(skippedSourceVideoIds).size
  };
}

function createRealPreprocessRunner(input: {
  library_root: string;
  library_id: string;
  library_name: string;
  env: NodeJS.ProcessEnv;
  now: () => string;
  media: ReadyPublishMedia;
}): PreprocessSupervisorRunner {
  return {
    async runOnce(runInput) {
      assertRealPreprocessStartReady(input.env);

      const runtime = resolveFfmpegRuntime(input.env);
      const dashscopeHttp = createFetchDashScopeHttpClient();
      const apiKey = optionalTrimmed(input.env.DASHSCOPE_API_KEY);
      const asrModel = (optionalTrimmed(input.env.MIXLAB_ASR_MODEL) || "paraformer-v2") as DashScopeAsrModel;
      const maxPollAttempts = parsePositiveIntegerEnv(input.env, "MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
      const pollIntervalMs = parsePositiveIntegerEnv(input.env, "MIXLAB_ASR_POLL_INTERVAL_MS", 3000);
      const uploader = createDashScopeTemporaryFileAudioUploader({
        api_key: apiKey,
        model: asrModel,
        http: dashscopeHttp
      });

      return runAdminPreprocessPipeline({
        library_root: input.library_root,
        library_id: input.library_id,
        library_name: input.library_name,
        runtime_policy: runInput.runtime_policy,
        limit: runInput.limit,
        now: input.now,
        media: input.media,
        should_stop: runInput.should_stop,
        run_worker_cycle(workerInput) {
          return runLibraryTextPreprocessWorker({
            ...workerInput,
            async probe_source_video(probeInput) {
              const plan = buildFfprobeSourceMetadataPlan({
                source_path: probeInput.source_video_path
              });

              return parseFfprobeSourceMetadata(
                runProcessForStdout(runtime.ffprobe_path, plan.args)
              );
            },
            async get_content_hash(sourceVideoPath) {
              return getFileIdentity(sourceVideoPath, "stat");
            },
            async preprocess_source_video(preprocessInput) {
              return runSourceVideoTextPreprocess({
                library_root: preprocessInput.library_root,
                library_id: preprocessInput.library_id,
                source_video_id: preprocessInput.source_video_id,
                source_video_path: preprocessInput.source_video_path,
                ffmpeg_path: runtime.ffmpeg_path,
                audio_mode: preprocessInput.audio_mode,
                now: preprocessInput.now,
                on_stage: preprocessInput.on_stage,
                command_runner: {
                  async run(executable, args) {
                    runProcess(executable, args);
                  }
                },
                uploader,
                asr_http: dashscopeHttp,
                asr: {
                  api_key: apiKey,
                  model: asrModel,
                  max_poll_attempts: maxPollAttempts,
                  poll_interval_ms: pollIntervalMs,
                  parameters: {
                    channel_id: [0],
                    language_hints: ["zh", "en"],
                    diarization_enabled: false
                  }
                }
              });
            }
          });
        }
      });
    }
  };
}

async function latestAsrFailureReason(libraryRoot: string): Promise<string> {
  const library = await readLibraryManifest(libraryRoot);
  if (library && library.video_count > ADMIN_FULL_DASHBOARD_METRICS_MAX_MANIFESTS) {
    return "";
  }

  const manifests = await readAllSourceVideoManifests(libraryRoot);
  const jobs = await Promise.all(
    manifests.map((manifest) => readPreprocessJob(libraryRoot, manifest.source_video_id))
  );
  const failures = jobs
    .map((job) => job && job.error_stage === "asr" && job.error_message
      ? {
          source_video_id: job.source_video_id,
          message: job.error_message,
          failed_ms:
            timestampMs(job.failed_at) ??
            timestampMs(job.stage_updated_at) ??
            timestampMs(job.claimed_at) ??
            0
        }
      : null)
    .filter((item): item is { source_video_id: string; message: string; failed_ms: number } => item !== null)
    .sort((left, right) => right.failed_ms - left.failed_ms);

  const latest = failures[0];
  return latest ? `${latest.source_video_id} ${latest.message}` : "";
}

async function getRuntimeSettings(libraryRoot: string, env: NodeJS.ProcessEnv) {
  const settings = await readAdminSettings(libraryRoot);
  const asrFailureReason = await latestAsrFailureReason(libraryRoot);

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
        audio_mode: settings.runtime_policy.audio_mode,
        dashscope_api_key_configured: Boolean(env.DASHSCOPE_API_KEY?.trim()),
        language_hints: ["zh"],
        speaker_diarization_enabled: false,
        object_storage_mode: "dashscope-temporary" as const,
        last_failure_reason: asrFailureReason
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
        audio_mode: settings.runtime_policy.audio_mode,
        dashscope_api_key_configured: Boolean(env.DASHSCOPE_API_KEY?.trim()),
        language_hints: ["zh"],
        speaker_diarization_enabled: false,
        object_storage_mode: "dashscope-temporary" as const,
        last_failure_reason: asrFailureReason
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
  source_video_ids?: string[];
}): Promise<{ affected_count: number; source_video_ids: string[] }> {
  const manifests = await readAllSourceVideoManifests(input.library_root);
  const requestedIds = input.source_video_ids ? new Set(input.source_video_ids) : null;
  const affected = manifests.filter((manifest) =>
    input.from.includes(manifest.preprocess_status) &&
    (!requestedIds || requestedIds.has(manifest.source_video_id))
  );

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
      worker_id: "admin"
    });
    await appendPreprocessJobLog({
      library_root: input.library_root,
      source_video_id: manifest.source_video_id,
      now: input.now,
      stage: input.reason,
      message: `${manifest.preprocess_status} -> ${input.to}`
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

function parseOptionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${label}必须是正整数`);
  }

  return Number(value);
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
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function writeNoContent(response: ServerResponse): void {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
  });
  response.end();
}

async function writeCover(response: ServerResponse, input: CreateAdminApiServerInput, sourceVideoId: string): Promise<void> {
  let manifest: SourceVideoManifest | null = null;
  try {
    manifest = await readSourceVideoManifest(input.library_root, sourceVideoId);
  } catch {
    manifest = null;
  }

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
    "Content-Type": contentTypeForImage(coverPath)
  });
  createReadStream(coverPath).pipe(response);
}

export function createAdminApiServer(input: CreateAdminApiServerInput): Server {
  const libraryId = input.library_id ?? "lib_main_001";
  const libraryName = input.library_name ?? "MixLab 公共素材库";
  const env = input.env ?? process.env;
  const now = () => input.now?.() ?? new Date().toISOString();
  const readyPublishMedia = input.ready_publish_media ?? createDefaultReadyPublishMedia();
  const supervisor = createPreprocessSupervisor({
    worker_id: `admin-worker-${process.pid}`,
    now,
    runner: input.preprocess_runner ?? createRealPreprocessRunner({
      library_root: input.library_root,
      library_id: libraryId,
      library_name: libraryName,
      env,
      now,
      media: readyPublishMedia
    })
  });
  const refreshRuntimeSecrets = () => applyAdminRuntimeSecretsToEnv(input.library_root, env);

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

      if (request.method === "PATCH" && url.pathname === "/api/admin/settings/config") {
        try {
          const body = requireRequestRecord(await readRequestJson(request));
          const mutation = adminSettingsPatchFromBody(body);
          const settings = await updateAdminSettings(input.library_root, mutation.settings_patch);
          if (mutation.runtime_secrets_patch) {
            await updateAdminRuntimeSecrets(input.library_root, mutation.runtime_secrets_patch);
            await refreshRuntimeSecrets();
          }
          writeJson(
            response,
            200,
            apiOk(settings)
          );
        } catch (error) {
          writeSettingsMutationError(response, error);
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/settings/source-folders") {
        try {
          const body = requireRequestRecord(await readRequestJson(request));
          writeJson(
            response,
            200,
            apiOk(await addAdminSourceFolder(input.library_root, adminSourceFolderFromBody(body)))
          );
        } catch (error) {
          writeSettingsMutationError(response, error);
        }
        return;
      }

      const sourceFolderMutationMatch = /^\/api\/admin\/settings\/source-folders\/(src_default|src_\d+)$/.exec(url.pathname);
      if (request.method === "PATCH" && sourceFolderMutationMatch) {
        try {
          const body = requireRequestRecord(await readRequestJson(request));
          writeJson(
            response,
            200,
            apiOk(await updateAdminSourceFolder(
              input.library_root,
              sourceFolderMutationMatch[1] ?? "",
              adminSourceFolderPatchFromBody(body)
            ))
          );
        } catch (error) {
          writeSettingsMutationError(response, error);
        }
        return;
      }

      if (request.method === "DELETE" && sourceFolderMutationMatch) {
        try {
          writeJson(
            response,
            200,
            apiOk(await removeAdminSourceFolder(input.library_root, sourceFolderMutationMatch[1] ?? ""))
          );
        } catch (error) {
          writeSettingsMutationError(response, error);
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/dashboard/metrics") {
        writeJson(response, 200, apiOk(await getDashboardMetrics(input)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/source-videos") {
        const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
        const rawQuery = url.searchParams.get("query") ?? "";
        const rawStatus = url.searchParams.get("status") ?? "";
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(rawLimit, 500)
          : 0;
        const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
        const status = adminSourceVideoStatuses.has(rawStatus as PreprocessStatus)
          ? rawStatus as PreprocessStatus
          : undefined;
        const manifests = await readAdminSourceVideoList({
          library_root: input.library_root,
          offset,
          limit,
          query: rawQuery,
          status
        });
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

      if (request.method === "PATCH" && coverMatch) {
        try {
          const updated = await updateSourceVideoCover({
            library_root: input.library_root,
            source_video_id: coverMatch[1] ?? "",
            body: await readRequestJson(request)
          });

          if (!updated) {
            writeJson(response, 404, apiError("not_found", "原视频不存在"));
            return;
          }

          writeJson(response, 200, apiOk(toAdminSourceVideo(updated)));
        } catch (error) {
          const message = error instanceof SyntaxError ? "请求 JSON 格式无效" : (error as Error).message;
          writeJson(response, 400, apiError("invalid_request", message));
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/cutter-users") {
        writeJson(response, 200, apiOk(await listCutterUsers(input.library_root)));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/preprocess/jobs") {
        const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
        const jobs = await listPreprocessJobs(input, {
          limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : undefined,
          offset: Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0
        });
        writeJson(response, 200, apiOk({
          ...jobs,
          supervisor: publicPreprocessSupervisorStatus(supervisor.status())
        }));
        return;
      }

      const preprocessJobLogMatch = /^\/api\/admin\/preprocess\/jobs\/(J\d{6})\/log$/.exec(url.pathname);
      if (request.method === "GET" && preprocessJobLogMatch) {
        const jobId = preprocessJobLogMatch[1] ?? "";
        const sourceVideoId = sourceVideoIdFromJobId(jobId);

        if (!sourceVideoId || !(await getSourceVideoDetail(input.library_root, sourceVideoId))) {
          writeJson(response, 404, apiError("not_found", "预处理任务不存在"));
          return;
        }

        writeJson(response, 200, apiOk({
          job_id: jobId,
          ...await readPreprocessJobLog(input.library_root, sourceVideoId)
        }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/preprocess/supervisor/status") {
        writeJson(response, 200, apiOk(publicPreprocessSupervisorStatus(supervisor.status())));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/preprocess/supervisor/start") {
        try {
          const body = requireRequestRecord(await readRequestJson(request));
          const settings = await readAdminSettings(input.library_root);
          await refreshRuntimeSecrets();
          if (!input.preprocess_runner) {
            assertRealPreprocessStartReady(env);
          }
          writeJson(response, 200, apiOk(publicPreprocessSupervisorStatus(supervisor.start({
            limit: parseOptionalPositiveInteger(body.limit, "本次限制"),
            runtime_policy: settings.runtime_policy
          }))));
        } catch (error) {
          writeJson(response, 400, apiError(
            "invalid_request",
            error instanceof Error ? error.message : "启动预处理服务失败"
          ));
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/preprocess/supervisor/stop") {
        writeJson(response, 200, apiOk(publicPreprocessSupervisorStatus(supervisor.stop())));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/index/versions") {
        const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
        const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);
        writeJson(response, 200, apiOk(await listIndexVersions(input.library_root, {
          limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined,
          offset: Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0
        })));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/doctor/report") {
        await refreshRuntimeSecrets();
        writeJson(response, 200, apiOk(await runMixlabDoctor({
          library_root: input.library_root,
          now: now(),
          env
        })));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/admin/settings/runtime") {
        await refreshRuntimeSecrets();
        writeJson(response, 200, apiOk(await getRuntimeSettings(input.library_root, env)));
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

      if (request.method === "POST" && url.pathname === "/api/admin/preprocess/recover-processing") {
        const supervisorStatus = publicPreprocessSupervisorStatus(supervisor.status());
        if (preprocessSupervisorIsActive(supervisorStatus)) {
          writeJson(
            response,
            409,
            apiError("invalid_request", "预处理流水线仍在运行，不能恢复正在处理的任务。")
          );
          return;
        }

        const result = await transitionManifests({
          library_root: input.library_root,
          from: ["processing"],
          to: "queued",
          now: now(),
          reason: "recover-processing-by-admin"
        });
        await writeLibraryManifest({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk({
          ...result,
          message: result.affected_count > 0
            ? `已恢复 ${result.affected_count} 个停滞中的处理任务。`
            : "没有需要恢复的处理中任务。"
        }));
        return;
      }

      const sourceVideoQueueMatch = /^\/api\/admin\/source-videos\/(V\d{6})\/queue$/.exec(url.pathname);
      if (request.method === "POST" && sourceVideoQueueMatch) {
        const sourceVideoId = sourceVideoQueueMatch[1] ?? "";
        const result = await transitionManifests({
          library_root: input.library_root,
          from: ["unprocessed"],
          to: "queued",
          now: now(),
          reason: "queued-by-admin",
          source_video_ids: [sourceVideoId]
        });
        await writeLibraryManifest({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk({
          ...result,
          message: result.affected_count > 0
            ? `已将 ${sourceVideoId} 加入预处理队列。`
            : `${sourceVideoId} 当前状态不能加入预处理队列。`
        }));
        return;
      }

      const sourceVideoRetryMatch = /^\/api\/admin\/source-videos\/(V\d{6})\/retry$/.exec(url.pathname);
      if (request.method === "POST" && sourceVideoRetryMatch) {
        const sourceVideoId = sourceVideoRetryMatch[1] ?? "";
        const result = await transitionManifests({
          library_root: input.library_root,
          from: ["failed"],
          to: "queued",
          now: now(),
          reason: "retry-by-admin",
          source_video_ids: [sourceVideoId]
        });
        await writeLibraryManifest({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk({
          ...result,
          message: result.affected_count > 0
            ? `已将 ${sourceVideoId} 重新加入预处理队列。`
            : `${sourceVideoId} 当前状态不能重试。`
        }));
        return;
      }

      const sourceVideoRecoverProcessingMatch = /^\/api\/admin\/source-videos\/(V\d{6})\/recover-processing$/.exec(url.pathname);
      if (request.method === "POST" && sourceVideoRecoverProcessingMatch) {
        const supervisorStatus = publicPreprocessSupervisorStatus(supervisor.status());
        if (preprocessSupervisorIsActive(supervisorStatus)) {
          writeJson(
            response,
            409,
            apiError("invalid_request", "预处理流水线仍在运行，不能恢复正在处理的任务。")
          );
          return;
        }

        const sourceVideoId = sourceVideoRecoverProcessingMatch[1] ?? "";
        const result = await transitionManifests({
          library_root: input.library_root,
          from: ["processing"],
          to: "queued",
          now: now(),
          reason: "recover-processing-by-admin",
          source_video_ids: [sourceVideoId]
        });
        await writeLibraryManifest({
          library_root: input.library_root,
          library_id: libraryId,
          library_name: libraryName,
          now: now()
        });
        writeJson(response, 200, apiOk({
          ...result,
          message: result.affected_count > 0
            ? `已将 ${sourceVideoId} 从处理中恢复到预处理队列。`
            : `${sourceVideoId} 当前状态不能恢复。`
        }));
        return;
      }

      const sourceVideoPublishMatch = /^\/api\/admin\/source-videos\/(V\d{6})\/publish$/.exec(url.pathname);
      if (request.method === "POST" && sourceVideoPublishMatch) {
        writeJson(response, 200, apiOk(await publishReadyPreparedVideos({
          library_root: input.library_root,
          library_id: libraryId,
          now: now(),
          media: readyPublishMedia,
          source_video_ids: [sourceVideoPublishMatch[1] ?? ""]
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/index/repair") {
        writeJson(response, 200, apiOk(await publishReadyPreparedVideos({
          library_root: input.library_root,
          library_id: libraryId,
          now: now(),
          media: readyPublishMedia
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/doctor/run") {
        await refreshRuntimeSecrets();
        writeJson(response, 200, apiOk(await runMixlabDoctor({
          library_root: input.library_root,
          now: now(),
          env
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/doctor/export") {
        await refreshRuntimeSecrets();
        writeJson(response, 200, apiOk(await exportMixlabDoctorReport({
          library_root: input.library_root,
          now: now(),
          env
        })));
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/admin/settings/test-asr") {
        await refreshRuntimeSecrets();
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
          description: "description" in body ? cleanOptionalText(body.description) : manifest.description,
          lecturer: "lecturer" in body ? cleanOptionalText(body.lecturer) : manifest.lecturer,
          course: "course" in body ? cleanOptionalText(body.course) : manifest.course,
          category: "category" in body ? cleanOptionalText(body.category) : manifest.category,
          tags: "tags" in body ? cleanTags(body.tags) : manifest.tags
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
