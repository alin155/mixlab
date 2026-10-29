import { constants, createReadStream } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { access, copyFile, mkdir, readFile, readdir, rename, rm, stat, statfs, utimes, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildFfprobeFirstFramePtsPlan,
  buildFfprobeKeyframePlan,
  buildFfprobeOutputVerificationPlan,
  buildFfprobeSourceMetadataPlan,
  buildFfmpegCoverImagePlan,
  buildFfmpegCutPlan,
  parseFfprobeFirstFramePts,
  parseFfprobeKeyframeTimes,
  parseFfprobeOutputProbe,
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
  deleteLocalClip,
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
  cancelCutJob,
  deleteExportClip,
  getExportClipDetail,
  deleteProjectOutputs,
  exportClipsDirectory,
  listClipLists,
  listCutJobs,
  readCutTempCacheStatus,
  listExportClips,
  CUT_JOB_NOT_RETRYABLE_CODE,
  CUT_QUEUE_BUSY_CODE,
  CutQueueBusyError,
  WORKSPACE_LEASE_UNAVAILABLE_CODE,
  WorkspaceLeaseUnavailableError,
  acquireWorkspaceLease,
  isCachePathPinned,
  pinCachePath,
  readClipList,
  readWorkspaceLease,
  recoverInterruptedCutJobs,
  recoverInterruptedCutJobsIfLeased,
  resolveCutJobTimeoutMs,
  retryCutJob,
  runCutJob,
  runNextCutJob,
  submitClipListToQueue,
  writeClipList,
  type ClipListManifest,
  type AcquireWorkspaceLeaseInput,
  type CutJobSourceDetail,
  type CoverRunner,
  type WorkspaceLease,
  type CutKeyframeProbe,
  type CutOutputProbe,
  type CutOutputProbeResult,
  type CutSourceDurationProbe,
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
import {
  CONTRACT_VERSION,
  type CapabilityTableV1
} from "../../contracts/src/capabilities.ts";
import type { LocalAgentCapabilitiesV1 } from "../../contracts/src/local-agent.ts";
import {
  contractErrorDefinition,
  isContractErrorCode
} from "../../contracts/src/errors.ts";
import {
  usageServiceFromEnv,
  usageServiceMode,
  type UsageServiceConnection
} from "../../library-fs/src/usage-service-client.ts";
import { UsageOutbox } from "../../library-fs/src/usage-outbox.ts";
import {
  accountServiceFromEnv,
  accountsServiceMode,
  createCutterAccounts,
  type AccountServiceConnection
} from "../../library-fs/src/cutter-account-client.ts";
import {
  CacheMaintenanceError,
  createCacheMaintenanceService,
  type CacheMaintenanceService
} from "./cache-maintenance.ts";
export {
  CACHE_MAINTENANCE_ERROR_CODES,
  CacheMaintenanceError
} from "./cache-maintenance.ts";
import {
  LOCAL_CLIP_MAINTENANCE_ERROR_CODES,
  LocalClipMaintenanceError,
  createLocalClipMaintenanceService,
  type LocalClipMaintenanceService
} from "./local-clip-maintenance.ts";
export {
  LOCAL_CLIP_MAINTENANCE_ERROR_CODES,
  LocalClipMaintenanceError
} from "./local-clip-maintenance.ts";
import {
  WorkspaceResidueError,
  createWorkspaceResidueService,
  readWorkspaceResidueSummaryBestEffort,
  type WorkspaceResidueService
} from "./workspace-residue.ts";
export {
  WORKSPACE_RESIDUE_ERROR_CODES,
  WorkspaceResidueError,
  isWorkspaceResiduePathAllowed
} from "./workspace-residue.ts";
import {
  ReleaseCacheMaintenanceError,
  createReleaseCacheMaintenanceService,
  tryAcquireReleaseCacheMaintenanceLock,
  type ReleaseCacheMaintenanceService
} from "./release-cache-maintenance.ts";
export {
  RELEASE_CACHE_MAINTENANCE_ERROR_CODES,
  ReleaseCacheMaintenanceError,
  isReleaseCacheEvictionPathAllowed
} from "./release-cache-maintenance.ts";
import {
  GOVERNANCE_AUDIT_ERROR_CODES,
  GovernanceAuditError,
  createGovernanceAuditStore,
  parseGovernanceAuditLimit,
  type GovernanceAuditEntry,
  type GovernanceAuditResult,
  type GovernanceAuditStore
} from "./governance-audit.ts";
export {
  GOVERNANCE_AUDIT_ERROR_CODES,
  GOVERNANCE_AUDIT_MAX_ENTRIES,
  GOVERNANCE_AUDIT_OPERATIONS,
  GovernanceAuditError,
  createGovernanceAuditStore,
  parseGovernanceAuditLimit
} from "./governance-audit.ts";

export interface CreateCutterApiServerInput {
  /** 隔离事件服务连接（默认从 MIXLAB_USAGE_SERVICE_URL 读取；未配置走旧共享 NDJSON）。 */
  usage_service?: UsageServiceConnection;
  /** 事件 outbox 本机目录（默认 workspace/usage-outbox 或 MIXLAB_USAGE_OUTBOX_ROOT）。 */
  usage_outbox_root?: string;
  usage_outbox_max_events?: number;
  /** 隔离账号服务连接（默认从 MIXLAB_CUTTER_ACCOUNTS_SERVICE_URL 读取；未配置走旧 users.json）。 */
  account_service?: AccountServiceConnection;
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
  /** 磁盘缓存清理 confirm_token TTL（毫秒，默认 120000；测试可注入短 TTL）。 */
  cache_confirm_ttl_ms?: number;
  /** 本地素材治理 confirm_token TTL（毫秒，默认 120000；测试可注入短 TTL）。 */
  local_clip_confirm_ttl_ms?: number;
  /** 工作区残留清理 confirm_token TTL（毫秒，默认 120000；测试可注入短 TTL）。 */
  workspace_residue_confirm_ttl_ms?: number;
  /** Release 缓存淘汰 confirm_token TTL（毫秒，默认 120000；测试可注入短 TTL）。 */
  release_cache_evict_confirm_ttl_ms?: number;
  /** D5 治理审计（仅测试用）：替换默认 JSONL 写入器，抛错用于验证写失败不阻塞清理操作。 */
  governance_audit_writer?: (entry: GovernanceAuditEntry) => Promise<void>;
  release_sync_timeout_ms?: number;
  searchd_base_url?: string;
  searchd_fetch?: typeof fetch;
  searchd_timeout_ms?: number;
  /** 首屏搜索等待 searchd 的上限（毫秒，默认 10000；大库冷启动/索引预热需要）。 */
  searchd_first_page_timeout_ms?: number;
  /** 翻页搜索等待 searchd 的上限（毫秒，默认 4000）。 */
  searchd_cursor_timeout_ms?: number;
  /** 首屏 searchd 失败后的重试次数（默认 8，含首次）。 */
  searchd_retry_attempts?: number;
  /** searchd 重试退避基数（毫秒，默认 1200，按 attempt 线性递增并封顶 2500ms）。 */
  searchd_retry_backoff_ms?: number;
  /** 首屏搜索等待 searchd 的总预算（毫秒，默认 18000；预算内重试/预热等待，超时才回退）。 */
  searchd_first_page_budget_ms?: number;
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
  /** usage worker 的 additive 运行指标，仅桌面 sidecar 注入；health 只读暴露。 */
  usage_event_worker_stats?: () => {
    queued: number;
    sent: number;
    dropped: number;
    failed: number;
    spawn_failures: number;
    worker_alive: boolean;
    worker_pid?: number;
  };
  auth_mode?: "reviewed" | "local_trusted";
  trusted_user_id?: string;
  trusted_username?: string;
  /** 客户端版本（semver）；用于 Release Manifest v2 的 min_client_version 判断，缺省读 MIXLAB_CUTTER_APP_VERSION。 */
  client_version?: string;
  now?: () => string;
  cut_runner?: CutterClipCutRunner;
  cover_runner?: CoverRunner;
  output_probe?: CutOutputProbe;
  source_duration_probe?: CutSourceDurationProbe;
  keyframe_probe?: CutKeyframeProbe;
  /** FFmpeg 剪切超时上限（毫秒），未配置时按区间估算并使用内置上限。 */
  cut_timeout_ms_max?: number;
  /** workspace 租约参数（测试注入 instance_id/stale 等），默认使用进程默认值。 */
  workspace_lease_options?: Omit<AcquireWorkspaceLeaseInput, "workspace_root">;
  /** 显式禁用 workspace 租约（仅测试/单进程特殊场景；生产保持开启）。 */
  workspace_lease_disabled?: boolean;
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
    /** 可选修复建议（D1b 缓存清理错误新增；旧客户端忽略即可）。 */
    remediation?: string;
    /** 可选结构化细节（如 D2 local_clip_referenced 的 referenced_by）；旧客户端忽略即可。 */
    details?: Record<string, unknown>;
  };
  /** 兼容客户端从顶层读取 details 的约定（与 error.details 同值）。 */
  details?: Record<string, unknown>;
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
  /** 队列超时/取消时中止；默认 runner 收到后终止 FFmpeg 进程树。 */
  signal?: AbortSignal;
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
  client_request_id?: unknown;
}

interface OpenExportDirectoryRequestBody {
  project_id?: unknown;
  project_title?: unknown;
  open?: unknown;
}

interface OpenSourceVideoDirectoryRequestBody {
  source_video_id?: unknown;
  source_video_file_path?: unknown;
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
  /** 事件/账号服务模式（默认关闭时保持旧路径）。 */
  usage_service_mode?: "isolated-service" | "legacy-ndjson";
  accounts_service_mode?: "isolated-service" | "local-users-file";
  /** D3：工作区残留条目数与字节数（扫描失败/超时时省略并给出 reason）。 */
  workspace_residue_count?: number;
  workspace_residue_bytes?: number;
  workspace_residue_reason?: string;
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
  /** D2：缓存所在磁盘剩余字节（statfs 不可用时省略）。 */
  disk_free_bytes?: number;
  /** D2：缓存所在磁盘总字节（statfs 不可用时省略）。 */
  disk_total_bytes?: number;
  /** D2：剩余空间 <5% 时为 true（磁盘信息不可用时为 false）。 */
  disk_low?: boolean;
  /** D2：磁盘信息不可用时的原因说明（尽力而为，不阻塞 runtime-status）。 */
  disk_unavailable_reason?: string;
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
  /** 淘汰后保留的版本与原因（active/recent_window/workspace_reference/prune_failed:*）。 */
  kept_release_versions?: string[];
  kept_release_reasons?: Record<string, string>;
  /** 本次从 workspace 历史作品清单解析到的引用版本。 */
  pinned_release_versions?: string[];
  prune_failed_release_versions?: string[];
  /** Release Manifest v2 校验结果（verified_files/failed_files/fallback_reason/contract error）。 */
  verification?: CutterReleaseVerificationStatus;
  contract_error_code?: string;
  contract_error_message?: string;
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

function cutTempCacheRootForInput(input: CreateCutterApiServerInput): string {
  return input.workspace_root
    ? path.join(input.workspace_root, "cache", "cut-temp")
    : path.join(localCacheRootForInput(input), "cut-temp");
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

export interface KeyedAsyncLock {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

/** 进程内 keyed async lock：用于缓存 manifest 的 read-modify-write 串行化（Round2 CUT-14）。 */
export function createKeyedAsyncLock(): KeyedAsyncLock {
  const tails = new Map<string, Promise<void>>();

  return {
    async run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      let releaseCurrent!: () => void;
      const current = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      });
      const chained = previous.catch(() => undefined).then(() => current);
      tails.set(key, chained);
      await previous.catch(() => undefined);

      try {
        return await task();
      } finally {
        releaseCurrent();
        if (tails.get(key) === chained) {
          tails.delete(key);
        }
      }
    }
  };
}

const cacheManifestLock = createKeyedAsyncLock();

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

async function upsertThumbnailCacheManifestEntryUnlocked(input: {
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

async function upsertThumbnailCacheManifestEntry(
  input: Parameters<typeof upsertThumbnailCacheManifestEntryUnlocked>[0]
): Promise<void> {
  await cacheManifestLock.run(thumbnailCacheManifestPath(input.root), () =>
    upsertThumbnailCacheManifestEntryUnlocked(input)
  );
}

async function compactThumbnailCacheManifestUnlocked(root: string): Promise<ThumbnailCacheManifest> {
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

async function compactThumbnailCacheManifest(root: string): Promise<ThumbnailCacheManifest> {
  return cacheManifestLock.run(thumbnailCacheManifestPath(root), () =>
    compactThumbnailCacheManifestUnlocked(root)
  );
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

async function compactSourceVideoCacheManifestUnlocked(root: string): Promise<SourceVideoCacheManifest> {
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

async function compactSourceVideoCacheManifest(root: string): Promise<SourceVideoCacheManifest> {
  return cacheManifestLock.run(sourceVideoCacheManifestPath(root), () =>
    compactSourceVideoCacheManifestUnlocked(root)
  );
}

async function pruneSourceVideoCacheUnlocked(input: {
  root: string;
  max_bytes: number;
  keep_source_video_id?: string;
}): Promise<void> {
  const manifest = await compactSourceVideoCacheManifestUnlocked(input.root);
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

    if (isCachePathPinned(cacheFilePath)) {
      // 正在被剪切/播放使用的缓存文件不淘汰（Round2 CUT-14）。
      continue;
    }

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

async function pruneSourceVideoCache(input: {
  root: string;
  max_bytes: number;
  keep_source_video_id?: string;
}): Promise<void> {
  await cacheManifestLock.run(sourceVideoCacheManifestPath(input.root), () =>
    pruneSourceVideoCacheUnlocked(input)
  );
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

  const nextLastAccessedAt = new Date().toISOString();
  void cacheManifestLock
    .run(sourceVideoCacheManifestPath(root), async () => {
      const latest = await readSourceVideoCacheManifest(root);
      const latestEntry = latest.entries[input.source_video_id];

      if (!latestEntry) {
        return;
      }

      latest.entries[input.source_video_id] = {
        ...latestEntry,
        last_accessed_at: nextLastAccessedAt
      };
      await writeSourceVideoCacheManifest(root, latest);
    })
    .catch(() => undefined);
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
      await cacheManifestLock.run(sourceVideoCacheManifestPath(root), async () => {
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
      });
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

function resolveCutterClientVersion(input: CreateCutterApiServerInput): string | undefined {
  const configured =
    input.client_version?.trim() ||
    optionalTrimmed(process.env.MIXLAB_CUTTER_APP_VERSION) ||
    "";
  const semverLike = /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(configured);
  return semverLike ? configured : undefined;
}

interface CutterReleaseVerificationStatus {
  manifest_schema_version: "2.0" | "legacy" | "none";
  release_id?: string;
  min_client_version?: string;
  verified_files: number;
  failed_files: Array<{ path: string; reason: string }>;
  fallback_reason?: string;
  contract_error_code?: string;
  contract_error_message?: string;
  verified_at?: string;
}

/**
 * GET /cutter/capabilities：LocalAgentCapabilitiesV1 主体 + CapabilityTableV1 加法字段。
 * 同时满足 Local Agent 契约与剪辑前端 CapabilityTableV1 解析器（旧客户端可忽略新增字段）。
 */
function buildCutterCapabilities(
  input: CreateCutterApiServerInput
): LocalAgentCapabilitiesV1 & CapabilityTableV1 {
  const agentVersion =
    optionalTrimmed(process.env.MIXLAB_CUTTER_APP_VERSION) ?? "0.18.12";
  const minClientVersion =
    optionalTrimmed(process.env.MIXLAB_CUTTER_MIN_CLIENT_VERSION) ?? "0.18.12";
  const features: Record<string, boolean> = {
    cut_verification: true,
    release_v2: true,
    release_cache_verification: true,
    output_verification: true,
    workspace_lease: input.workspace_lease_disabled !== true,
    cut_job_retry: true,
    local_agent_api_v1: true,
    event_envelope_v1: true,
    capabilities_v1: true,
    searchd: Boolean(optionalTrimmed(input.searchd_base_url))
  };
  const limits: Record<string, number> = {
    max_cached_releases: releaseCacheMaxReleases(input) ?? 2,
    cut_temp_max_bytes: cutTempMaxBytes(input),
    source_video_cache_max_bytes: sourceVideoCacheMaxBytes(input),
    thumbnail_cache_max_bytes: thumbnailCacheMaxBytes(input),
    cut_timeout_ms_max: cutTimeoutMaxMsForInput(input) ?? 0,
    page_max: 200,
    request_body_max_bytes: 1_000_000,
    event_batch_max: 100
  };

  return {
    contract_version: CONTRACT_VERSION,
    agent_version: agentVersion,
    product: "cutter",
    features,
    limits,
    server_version: agentVersion,
    server_product: "cutter",
    min_client_version: minClientVersion,
    generated_at: currentNow(input)
  };
}

function cutTimeoutMaxMsForInput(input: CreateCutterApiServerInput): number | undefined {
  if (Number.isFinite(input.cut_timeout_ms_max) && (input.cut_timeout_ms_max ?? 0) > 0) {
    return Math.floor(input.cut_timeout_ms_max!);
  }

  return optionalPositiveInteger(process.env.MIXLAB_CUTTER_FFMPEG_TIMEOUT_MS);
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
    searchd_first_page_timeout_ms: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SEARCHD_FIRST_PAGE_TIMEOUT_MS ?? env.MIXLAB_SEARCHD_FIRST_PAGE_TIMEOUT_MS
    ),
    searchd_cursor_timeout_ms: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SEARCHD_CURSOR_TIMEOUT_MS ?? env.MIXLAB_SEARCHD_CURSOR_TIMEOUT_MS
    ),
    searchd_retry_attempts: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SEARCHD_RETRY_ATTEMPTS ?? env.MIXLAB_SEARCHD_RETRY_ATTEMPTS
    ),
    searchd_retry_backoff_ms: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SEARCHD_RETRY_BACKOFF_MS ?? env.MIXLAB_SEARCHD_RETRY_BACKOFF_MS
    ),
    searchd_first_page_budget_ms: optionalPositiveInteger(
      env.MIXLAB_CUTTER_SEARCHD_FIRST_PAGE_BUDGET_MS ?? env.MIXLAB_SEARCHD_FIRST_PAGE_BUDGET_MS
    ),
    cut_timeout_ms_max: optionalPositiveInteger(env.MIXLAB_CUTTER_FFMPEG_TIMEOUT_MS),
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
    "Content-Type,Range,X-MixLab-Device-Id,X-MixLab-Session-Token,X-MixLab-Cache-Confirm-Token"
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
  message: string,
  remediation?: string,
  details?: Record<string, unknown>
): void {
  writeJson(response, statusCode, {
    error: {
      code,
      message,
      ...(remediation ? { remediation } : {}),
      ...(details ? { details } : {})
    },
    ...(details ? { details } : {})
  } satisfies CutterApiErrorBody);
}

/** 将 D1b 缓存清理稳定错误写成 CutterApiError envelope；非该类错误返回 false 交给上层兜底。 */
function writeCacheMaintenanceError(response: ServerResponse, error: unknown): boolean {
  if (!(error instanceof CacheMaintenanceError)) {
    return false;
  }

  writeError(response, error.status, error.code, error.message, error.remediation);
  return true;
}

/** 将 D2 本地素材治理稳定错误写成 CutterApiError envelope；非该类错误返回 false 交给上层兜底。 */
function writeLocalClipMaintenanceError(response: ServerResponse, error: unknown): boolean {
  if (!(error instanceof LocalClipMaintenanceError)) {
    return false;
  }

  writeError(response, error.status, error.code, error.message, error.remediation);
  return true;
}

/** 将 D3 工作区残留稳定错误写成 CutterApiError envelope；非该类错误返回 false 交给上层兜底。 */
function writeWorkspaceResidueError(response: ServerResponse, error: unknown): boolean {
  if (!(error instanceof WorkspaceResidueError)) {
    return false;
  }

  writeError(response, error.status, error.code, error.message, error.remediation);
  return true;
}

/** 将 D4 Release 缓存淘汰稳定错误写成 CutterApiError envelope；非该类错误返回 false 交给上层兜底。 */
function writeReleaseCacheMaintenanceError(response: ServerResponse, error: unknown): boolean {
  if (!(error instanceof ReleaseCacheMaintenanceError)) {
    return false;
  }

  writeError(response, error.status, error.code, error.message, error.remediation);
  return true;
}

/** 将 D5 治理审计稳定错误写成 CutterApiError envelope；非该类错误返回 false 交给上层兜底。 */
function writeGovernanceAuditError(response: ServerResponse, error: unknown): boolean {
  if (!(error instanceof GovernanceAuditError)) {
    return false;
  }

  writeError(response, error.status, error.code, error.message, error.remediation);
  return true;
}

/** D5：从请求体提取审计 targets（仅展示用，best-effort）。 */
function governanceAuditTargetsFromBody(body: unknown, key: string): string[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return [];
  }

  const value = (body as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());
}

/** D5：ok=全部成功、partial=部分成功、failed=全失败。 */
function governanceAuditResultOf(input: {
  target_count: number;
  removed_count: number;
  skipped_count: number;
  error_count: number;
}): GovernanceAuditResult {
  const attempted = Math.max(
    input.target_count,
    input.removed_count + input.skipped_count + input.error_count
  );
  if (attempted === 0) {
    return "ok";
  }
  if (input.removed_count === 0) {
    return "failed";
  }
  if (
    input.skipped_count > 0 ||
    input.error_count > 0 ||
    input.removed_count < input.target_count
  ) {
    return "partial";
  }
  return "ok";
}

/** D5：写治理审计；失败只返回中文原因，绝不影响清理操作结果。 */
async function recordGovernanceAuditBestEffort(
  store: GovernanceAuditStore,
  entry: Omit<GovernanceAuditEntry, "at">
): Promise<string | undefined> {
  if (!store.isEnabled()) {
    return undefined;
  }

  const result = await store.record(entry);
  return result.ok ? undefined : result.error ?? "治理操作审计写入失败";
}

/** D5：成功响应追加可选 audit_error；不改变原有字段。 */
function withAuditError<T extends object>(
  data: T,
  auditError: string | undefined
): T & { audit_error?: string } {
  return {
    ...data,
    ...(auditError ? { audit_error: auditError } : {})
  };
}

/** D5：force delete 审计用删除前字节估算（hardlink 未去重，仅审计展示）。 */
async function measureLocalClipAuditFreedBytes(
  workspaceRoot: string,
  localClipId: string
): Promise<number> {
  try {
    const exportBytes = await recursiveFileCacheSize(path.join(workspaceRoot, "export-clips", localClipId));
    const assetBytes = await recursiveFileCacheSize(
      path.join(workspaceRoot, ".mixlab-library", "videos", localClipId)
    );
    return exportBytes + assetBytes;
  } catch {
    return 0;
  }
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

const DEFAULT_SEARCHD_FIRST_PAGE_TIMEOUT_MS = 10_000;
const DEFAULT_SEARCHD_CURSOR_TIMEOUT_MS = 4_000;
const DEFAULT_SEARCHD_DETAIL_TIMEOUT_MS = 5_000;
const DEFAULT_SEARCHD_RETRY_ATTEMPTS = 8;
const DEFAULT_SEARCHD_RETRY_BACKOFF_MS = 1_200;
const DEFAULT_SEARCHD_RETRY_MAX_DELAY_MS = 2_500;
const DEFAULT_SEARCHD_FIRST_PAGE_BUDGET_MS = 18_000;

function searchdDetailTimeoutMs(searchdTimeoutMs: number | undefined): number {
  return Math.max(250, Math.min(searchdTimeoutMs ?? DEFAULT_SEARCHD_DETAIL_TIMEOUT_MS, DEFAULT_SEARCHD_DETAIL_TIMEOUT_MS));
}

function searchdPageTimeoutMs(input: {
  searchd_timeout_ms?: number;
  searchd_first_page_timeout_ms?: number;
  searchd_cursor_timeout_ms?: number;
  cursor?: string;
}): number {
  const isCursor = Boolean(input.cursor);
  const configured = isCursor
    ? input.searchd_cursor_timeout_ms ?? input.searchd_timeout_ms ?? DEFAULT_SEARCHD_CURSOR_TIMEOUT_MS
    : input.searchd_first_page_timeout_ms ?? input.searchd_timeout_ms ?? DEFAULT_SEARCHD_FIRST_PAGE_TIMEOUT_MS;
  return Math.max(250, configured);
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

function looksLikeSourceFilenameQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return false;
  }

  return (
    /[\\/_.-]/.test(trimmed) ||
    /\.(mp4|mov|mkv|m4v|avi|webm)$/i.test(trimmed) ||
    (/[A-Za-z]/.test(trimmed) && /\d/.test(trimmed))
  );
}

function normalizeFilenameProbeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function shouldTrySourceFilenameSearch(query: string): boolean {
  const normalized = normalizeFilenameProbeQuery(query);
  if (!normalized) {
    return false;
  }

  if (looksLikeSourceFilenameQuery(query)) {
    return true;
  }

  const cjkLength = [...query.matchAll(/\p{Script=Han}/gu)].length;
  return cjkLength >= 4 || normalized.length >= 8;
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
  searchd_first_page_timeout_ms?: number;
  searchd_cursor_timeout_ms?: number;
  query: string;
  limit: number;
  cursor?: string;
  source_folder_name?: string;
}): Promise<CutterSourceLibrarySearchResult> {
  const startedAt = Date.now();
  const fetchImpl = input.searchd_fetch ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, searchdPageTimeoutMs(input));

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
      if (
        response.status === 503 ||
        errorCode === "searchd_warming" ||
        errorCode === "index_warming" ||
        errorCode === "searchd_not_ready"
      ) {
        throw new Error("searchd_warming");
      }

      throw new Error("searchd_unavailable");
    }

    const unwrappedPayload = unwrapSearchdPayload(payload);
    if (
      isRecord(unwrappedPayload) &&
      (unwrappedPayload.status === "warming" || unwrappedPayload.ready === false)
    ) {
      throw new Error("searchd_warming");
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
    if ((error as Error).message === "searchd_warming") {
      throw error;
    }
    if (timedOut || (error as Error).name === "AbortError") {
      throw new Error("searchd_timeout");
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

/**
 * 共享包 packages/protocol 的 resolveSourceVideoPath 在 Windows 深度挂载根（例如
 * C:\Users\...\library）下会退回 path.posix 实现，拼出
 * `C:\root/source-videos/a.mp4` 这种混合分隔符路径。Windows 文件系统 API 能容忍它，
 * 但路径相等比较、本地缓存清单核对和返回给前端的绝对路径都会出错。这里在 Cutter API
 * 边界统一规范为宿主平台路径；macOS（纯 POSIX 路径）上是无副作用的空操作。
 */
function normalizeHostPath(value: string): string {
  return value ? path.normalize(value) : value;
}

function withNormalizedSourceVideoPath<T extends { source_video_file_path: string }>(value: T): T {
  const normalized = normalizeHostPath(value.source_video_file_path);

  return normalized === value.source_video_file_path
    ? value
    : { ...value, source_video_file_path: normalized };
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
      ? normalizeHostPath(
          resolveSourceVideoPath({
            mount_root: input.library_root,
            relative_path: input.indexed.relative_path
          })
        )
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
  const timeout = setTimeout(() => controller.abort(), searchdDetailTimeoutMs(input.api_input.searchd_timeout_ms));

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
  const timeout = setTimeout(() => controller.abort(), searchdDetailTimeoutMs(input.api_input.searchd_timeout_ms));

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

interface CutterSourceLibrarySearchResultWithMeta extends CutterSourceLibrarySearchResult {
  /** 首屏 searchd 失败并回退到本地索引时的原因（成功或未尝试时省略）。 */
  searchd_fallback_reason?: "timeout" | "warming" | "unavailable";
  /** 首屏 searchd 实际尝试次数（回退时用于诊断）。 */
  searchd_attempts?: number;
}

function searchdFallbackReason(error: Error): "timeout" | "warming" | "unavailable" {
  if (error.message === "searchd_timeout") {
    return "timeout";
  }
  if (error.message === "searchd_warming") {
    return "warming";
  }
  return "unavailable";
}

function searchdRetryDelayMs(backoffMs: number, attempt: number): number {
  return Math.min(Math.max(0, backoffMs) * attempt, DEFAULT_SEARCHD_RETRY_MAX_DELAY_MS);
}

async function searchCutterSourceLibraryWithPreferredBackend(input: {
  api_input: CreateCutterApiServerInput;
  query: string;
  limit: number;
  cursor?: string;
  source_folder_name?: string;
  folder_query?: string;
}): Promise<CutterSourceLibrarySearchResultWithMeta> {
  const searchdBaseUrl = optionalTrimmed(input.api_input.searchd_base_url);
  const cursorBackend = searchCursorBackend(input.cursor);
  if (input.folder_query?.trim()) {
    const releaseRoot = await releaseRootForFastLibraryRead(input.api_input);
    return searchCutterSourceLibrary({
      library_root: input.api_input.library_root,
      ...(releaseRoot ? { release_root: releaseRoot } : {}),
      query: input.query,
      limit: input.limit,
      cursor: input.cursor,
      source_folder_name: input.source_folder_name,
      folder_query: input.folder_query
    });
  }

  const shouldTryFilenameFirst = !input.cursor && shouldTrySourceFilenameSearch(input.query);
  if (shouldTryFilenameFirst) {
    const releaseRoot = await releaseRootForFastLibraryRead(input.api_input);
    const filenameResult = await searchCutterSourceLibrary({
      library_root: input.api_input.library_root,
      ...(releaseRoot ? { release_root: releaseRoot } : {}),
      query: input.query,
      limit: input.limit,
      source_folder_name: input.source_folder_name,
      filename_only: true
    });
    if (looksLikeSourceFilenameQuery(input.query) || filenameResult.groups.length > 0) {
      return filenameResult;
    }
  }

  let searchdFallback: "timeout" | "warming" | "unavailable" | undefined;
  let searchdAttempts = 0;
  if (searchdBaseUrl && cursorBackend !== "local-index") {
    const attempts = input.cursor
      ? 1
      : Math.max(1, Math.min(input.api_input.searchd_retry_attempts ?? DEFAULT_SEARCHD_RETRY_ATTEMPTS, 12));
    const backoffMs = input.api_input.searchd_retry_backoff_ms ?? DEFAULT_SEARCHD_RETRY_BACKOFF_MS;
    const firstPageBudgetMs = input.cursor
      ? Number.POSITIVE_INFINITY
      : Math.max(250, input.api_input.searchd_first_page_budget_ms ?? DEFAULT_SEARCHD_FIRST_PAGE_BUDGET_MS);
    const loopStartedAt = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      searchdAttempts = attempt;
      const remainingBudgetMs = firstPageBudgetMs - (Date.now() - loopStartedAt);
      if (remainingBudgetMs < 250) {
        break;
      }
      const perAttemptTimeoutMs = input.cursor
        ? input.api_input.searchd_first_page_timeout_ms
        : Math.max(
            250,
            Math.min(
              input.api_input.searchd_first_page_timeout_ms ?? DEFAULT_SEARCHD_FIRST_PAGE_TIMEOUT_MS,
              remainingBudgetMs
            )
          );
      try {
        const searchdResult = await searchCutterSourceLibraryViaSearchd({
          searchd_base_url: searchdBaseUrl,
          searchd_fetch: input.api_input.searchd_fetch,
          searchd_timeout_ms: input.api_input.searchd_timeout_ms,
          searchd_first_page_timeout_ms: perAttemptTimeoutMs,
          searchd_cursor_timeout_ms: input.api_input.searchd_cursor_timeout_ms,
          query: input.query,
          limit: input.limit,
          cursor: input.cursor,
          source_folder_name: input.source_folder_name
        });
        if (input.cursor || searchdResult.groups.length > 0) {
          return searchdResult;
        }
        // Searchd is transcript-indexed. Keep filename-only queries usable by
        // falling through to the local library search, which can supplement by
        // source title/path when the first page has no transcript hits.
        lastError = undefined;
        break;
      } catch (error) {
        const failure = error as Error;
        if (
          failure.message === "invalid_search_cursor" ||
          cursorBackend === "searchd" ||
          cursorBackend === "unknown"
        ) {
          throw failure;
        }
        lastError = failure;
        if (attempt < attempts) {
          const remainingAfterFailureMs = firstPageBudgetMs - (Date.now() - loopStartedAt);
          const delayMs = Math.min(
            searchdRetryDelayMs(backoffMs, attempt),
            Math.max(0, remainingAfterFailureMs)
          );
          if (delayMs > 0) {
            await delay(delayMs);
          }
        }
      }
    }

    if (lastError) {
      searchdFallback = searchdFallbackReason(lastError);
    }
  }

  const releaseRoot = await releaseRootForFastLibraryRead(input.api_input);
  const localResult = await searchCutterSourceLibrary({
    library_root: input.api_input.library_root,
    ...(releaseRoot ? { release_root: releaseRoot } : {}),
    query: input.query,
    limit: input.limit,
    cursor: input.cursor,
    source_folder_name: input.source_folder_name
  });

  if (searchdFallback) {
    return {
      ...localResult,
      searchd_fallback_reason: searchdFallback,
      searchd_attempts: searchdAttempts
    };
  }
  return localResult;
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

/** 流式读取期间 pin 文件路径，避免缓存淘汰删除正在读取的媒体（Round2 CUT-14）。 */
async function streamFileWithCachePin(
  input: Parameters<typeof streamFile>[0]
): Promise<void> {
  const release = pinCachePath(input.file_path);

  try {
    await streamFile(input);
  } finally {
    release();
  }
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
    .filter(
      (item) => path.resolve(item.file_path) !== keepPath && !isCachePathPinned(item.file_path)
    )
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

  const validation = await createCutterAccounts(input.api_input.account_service).validateCutterSession(
    input.api_input.library_root,
    {
      device_id: deviceId,
      session_token: sessionToken,
      now: currentNow(input.api_input)
    }
  );

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

function killChildProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Already exited.
    }
    return;
  }

  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.on("error", () => {
        try {
          child.kill();
        } catch {
          // Already exited.
        }
      });
      killer.unref?.();
    } catch {
      try {
        child.kill();
      } catch {
        // Already exited.
      }
    }
    return;
  }

  try {
    child.kill("SIGKILL");
  } catch {
    // Already exited.
  }
}

interface RunFfmpegOptions {
  timeout_ms?: number;
  signal?: AbortSignal;
}

function runFfmpegAsync(
  executable: string,
  args: string[],
  options: RunFfmpegOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      options.signal?.removeEventListener("abort", onAbort);
    };
    const settle = (action: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      action();
    };
    const onAbort = () => {
      killChildProcessTree(child);
      settle(() => reject(new Error("ffmpeg clip cut aborted")));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    if (!settled && options.timeout_ms && options.timeout_ms > 0) {
      timer = setTimeout(() => {
        killChildProcessTree(child);
        settle(() =>
          reject(new Error(`ffmpeg clip cut timed out after ${Math.round(options.timeout_ms!)}ms`))
        );
      }, options.timeout_ms);
      timer.unref?.();
    }

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        settle(() => resolve());
        return;
      }

      const reason = stderr.trim() || (signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`);
      settle(() => reject(new Error(`ffmpeg clip cut failed: ${reason}`)));
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

async function defaultCutRunner(
  input: CutterClipCutRunnerInput,
  options: { timeout_ms_max?: number } = {}
): Promise<void> {
  const runtime = resolveFfmpegRuntime();
  const plan = buildFfmpegCutPlan({
    source_path: input.source_video_path,
    output_path: input.output_path,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    cut_mode: input.cut_mode
  });
  const timeoutMs = resolveCutJobTimeoutMs({
    range_ms: Math.max(0, input.end_ms - input.begin_ms),
    ...(options.timeout_ms_max !== undefined ? { max_ms: options.timeout_ms_max } : {})
  });

  await runFfmpegAsync(runtime.ffmpeg_path, plan.args, {
    timeout_ms: timeoutMs,
    ...(input.signal ? { signal: input.signal } : {})
  });
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

const OUTPUT_VERIFICATION_PROBE_TIMEOUT_MS = 10_000;
const SOURCE_DURATION_PROBE_TIMEOUT_MS = 10_000;
const KEYFRAME_PROBE_TIMEOUT_MS = 5_000;

async function runFfprobeWithFallback(
  args: string[],
  timeoutMs: number,
  failureLabel: string
): Promise<string> {
  const runtime = resolveFfmpegRuntime();

  try {
    return await runProcessForStdoutAsync({
      executable: runtime.ffprobe_path,
      args,
      timeout_ms: timeoutMs,
      failure_label: failureLabel
    });
  } catch (error) {
    if (runtime.source === "env") {
      throw error;
    }

    return runProcessForStdoutAsync({
      executable: "ffprobe",
      args,
      timeout_ms: timeoutMs,
      failure_label: failureLabel
    });
  }
}

/** 生产输出验收探针：文件存在/size/时长/音视频流/首帧 PTS/源是否含音轨。 */
async function defaultCutOutputProbe(input: {
  output_path: string;
  source_path: string;
  cut_mode: CutMode;
}): Promise<CutOutputProbeResult> {
  const outputStat = await stat(input.output_path).catch(() => null);

  if (!outputStat?.isFile()) {
    return {
      exists: false,
      size_bytes: 0,
      has_video_stream: false,
      has_audio_stream: false
    };
  }

  const [outputProbeStdout, firstFrameStdout] = await Promise.all([
    runFfprobeWithFallback(
      buildFfprobeOutputVerificationPlan({ output_path: input.output_path }).args,
      OUTPUT_VERIFICATION_PROBE_TIMEOUT_MS,
      "ffprobe output verification"
    ),
    runFfprobeWithFallback(
      buildFfprobeFirstFramePtsPlan({ output_path: input.output_path }).args,
      OUTPUT_VERIFICATION_PROBE_TIMEOUT_MS,
      "ffprobe output first frame"
    ).catch(() => "")
  ]);
  const parsed = parseFfprobeOutputProbe(outputProbeStdout);
  const firstFramePtsMs = firstFrameStdout ? parseFfprobeFirstFramePts(firstFrameStdout) : undefined;
  let outputMediaMetadata: SourceVideoMediaMetadata | undefined;

  try {
    const metadataStdout = await runFfprobeWithFallback(
      buildFfprobeSourceMetadataPlan({ source_path: input.output_path }).args,
      OUTPUT_VERIFICATION_PROBE_TIMEOUT_MS,
      "ffprobe output metadata"
    );
    outputMediaMetadata = parseFfprobeSourceMetadata(metadataStdout);
  } catch {
    // 元数据探测失败不阻断输出验收；本地素材清单会标记 unknown。
  }

  let sourceHasAudio: boolean | undefined;

  if (parsed.has_audio_stream) {
    sourceHasAudio = true;
  } else {
    try {
      const sourceStdout = await runFfprobeWithFallback(
        buildFfprobeOutputVerificationPlan({ output_path: input.source_path }).args,
        OUTPUT_VERIFICATION_PROBE_TIMEOUT_MS,
        "ffprobe source audio"
      );
      sourceHasAudio = parseFfprobeOutputProbe(sourceStdout).has_audio_stream;
    } catch {
      // 无法确认源音轨时按"未知"处理，不因音轨存在性阻断成片。
    }
  }

  return {
    exists: true,
    size_bytes: outputStat.size,
    has_video_stream: parsed.has_video_stream,
    has_audio_stream: parsed.has_audio_stream,
    ...(sourceHasAudio !== undefined ? { source_has_audio_stream: sourceHasAudio } : {}),
    ...(firstFramePtsMs !== undefined ? { first_video_pts_ms: firstFramePtsMs } : {}),
    ...(parsed.duration_ms !== undefined ? { duration_ms: parsed.duration_ms } : {}),
    ...(parsed.video_duration_ms !== undefined ? { video_duration_ms: parsed.video_duration_ms } : {}),
    ...(parsed.audio_duration_ms !== undefined ? { audio_duration_ms: parsed.audio_duration_ms } : {}),
    ...(outputMediaMetadata && outputMediaMetadata.width > 0 ? { width: outputMediaMetadata.width } : {}),
    ...(outputMediaMetadata && outputMediaMetadata.height > 0 ? { height: outputMediaMetadata.height } : {}),
    ...(outputMediaMetadata && outputMediaMetadata.fps > 0 ? { fps: outputMediaMetadata.fps } : {}),
    ...(outputMediaMetadata && outputMediaMetadata.codec ? { codec: outputMediaMetadata.codec } : {})
  };
}

/** 生产源时长探针：用于区间边界校验与 E 源（重剪）真实时长。 */
async function defaultCutSourceDurationProbe(input: {
  source_video_path: string;
}): Promise<{ duration_ms?: number }> {
  const stdout = await runFfprobeWithFallback(
    buildFfprobeSourceMetadataPlan({ source_path: input.source_video_path }).args,
    SOURCE_DURATION_PROBE_TIMEOUT_MS,
    "ffprobe source duration"
  );
  const metadata = parseFfprobeSourceMetadata(stdout);

  return { duration_ms: metadata.duration_ms };
}

/** 生产关键帧探针：copy 模式判断起点是否贴近关键帧，失败时返回空列表触发降级。 */
async function defaultCutKeyframeProbe(input: {
  source_video_path: string;
  begin_ms: number;
}): Promise<{ keyframe_times_ms: number[] }> {
  try {
    const stdout = await runFfprobeWithFallback(
      buildFfprobeKeyframePlan({
        source_path: input.source_video_path,
        begin_ms: input.begin_ms
      }).args,
      KEYFRAME_PROBE_TIMEOUT_MS,
      "ffprobe keyframe preflight"
    );
    return { keyframe_times_ms: parseFfprobeKeyframeTimes(stdout) };
  } catch {
    return { keyframe_times_ms: [] };
  }
}

const VISIBLE_DETAIL_CACHE_TTL_MS = 300_000;
const VISIBLE_DETAIL_CACHE_MAX_ENTRIES = 200;
const RELEASE_DETAIL_CACHE_KEY_TTL_MS = 5_000;
const releaseDetailCacheKeyByRoot = new Map<string, { expires_at_ms: number; version: string }>();

async function currentReleaseVersionForDetailCache(input: CreateCutterApiServerInput): Promise<string> {
  const root = optionalTrimmed(input.release_cache_root);
  if (!root) {
    return "";
  }
  const now = Date.now();
  const cached = releaseDetailCacheKeyByRoot.get(root);
  if (cached && cached.expires_at_ms > now) {
    return cached.version;
  }
  let version = "";
  try {
    const payload = JSON.parse(
      await readFile(path.join(root, ".mixlab-library", "current-release.json"), "utf8")
    ) as { current_version?: unknown };
    if (typeof payload.current_version === "string") {
      version = payload.current_version.trim();
    }
  } catch {
    // 没有 release 指针时使用空 key；不影响 detail 读取。
  }
  releaseDetailCacheKeyByRoot.set(root, {
    expires_at_ms: now + RELEASE_DETAIL_CACHE_KEY_TTL_MS,
    version
  });
  return version;
}
const SOURCE_VIEW_DEDUPE_MS = 30_000;
const SOURCE_VIEW_DEDUPE_MAX_ENTRIES = 1_000;
const sourceViewRecordedAtByUser = new Map<string, number>();

function shouldRecordSourceView(auth: { user: { user_id: string } }, sourceVideoId: string): boolean {
  const key = `${auth.user.user_id}:${sourceVideoId}`;
  const now = Date.now();
  const last = sourceViewRecordedAtByUser.get(key) ?? 0;
  if (now - last < SOURCE_VIEW_DEDUPE_MS) {
    return false;
  }
  sourceViewRecordedAtByUser.set(key, now);
  if (sourceViewRecordedAtByUser.size > SOURCE_VIEW_DEDUPE_MAX_ENTRIES) {
    const oldest = sourceViewRecordedAtByUser.keys().next().value;
    if (oldest) {
      sourceViewRecordedAtByUser.delete(oldest);
    }
  }
  return true;
}

interface VisibleDetailCacheEntry {
  expires_at_ms: number;
  promise: Promise<CutterSourceVideoDetail | null>;
}

const visibleDetailCacheByInput = new WeakMap<
  CreateCutterApiServerInput,
  Map<string, VisibleDetailCacheEntry>
>();

interface CutterDetailTimingLog {
  event: "cutter_detail_timing";
  source_video_id: string;
  cache_hit: boolean;
  searchd_ms?: number;
  searchd_status?: "ok" | "not_found" | "error";
  searchd_error?: string;
  fallback_used?: boolean;
  fallback_ms?: number;
  release_root_path?: string;
  transcript_segments?: number;
  total_ms: number;
}

function logCutterDetailTiming(event: CutterDetailTimingLog): void {
  if (event.total_ms < 500 && !event.fallback_used && (event.searchd_ms ?? 0) < 500) {
    return;
  }
  try {
    // 慢详情/回退详情写入 sidecar stderr，供桌面日志与 E2E 采集。
    console.error(JSON.stringify({ at: new Date().toISOString(), ...event }));
  } catch {
    // Diagnostics must never affect request behavior.
  }
}

async function loadVisibleDetailUncached(
  input: CreateCutterApiServerInput,
  sourceVideoId: string
): Promise<CutterSourceVideoDetail | null> {
  const startedAt = performance.now();
  const searchdStartedAt = performance.now();
  let searchdMs = -1;
  let searchdStatus: "ok" | "not_found" | "error" = "error";
  let searchdError = "";

  try {
    const searchdDetail = await searchCutterSourceVideoDetailViaSearchd({
      api_input: input,
      source_video_id: sourceVideoId
    });
    searchdMs = Math.round(performance.now() - searchdStartedAt);

    if (searchdDetail) {
      const normalized = withNormalizedSourceVideoPath(searchdDetail);
      logCutterDetailTiming({
        event: "cutter_detail_timing",
        source_video_id: sourceVideoId,
        cache_hit: false,
        searchd_ms: searchdMs,
        searchd_status: "ok",
        fallback_used: false,
        transcript_segments: normalized.transcript.segments.length,
        total_ms: Math.round(performance.now() - startedAt)
      });
      return normalized;
    }

    searchdStatus = "not_found";
  } catch (error) {
    searchdMs = Math.round(performance.now() - searchdStartedAt);
    searchdStatus = "error";
    searchdError = error instanceof Error ? error.message : String(error);
    // If searchd is restarting or does not expose detail yet, preserve the
    // existing artifact-backed detail path.
  }

  const fallbackStartedAt = performance.now();
  let releaseRootPath = "";
  try {
    const releaseRoot = await releaseRootForFastLibraryRead(input);
    releaseRootPath = releaseRoot ?? "";
    const detail = await getCutterSourceVideoDetail({
      library_root: input.library_root,
      ...(releaseRoot ? { release_root: releaseRoot } : {}),
      source_video_id: sourceVideoId
    });
    const normalized = detail ? withNormalizedSourceVideoPath(detail) : detail;
    logCutterDetailTiming({
      event: "cutter_detail_timing",
      source_video_id: sourceVideoId,
      cache_hit: false,
      searchd_ms: searchdMs,
      searchd_status: searchdStatus,
      ...(searchdError ? { searchd_error: searchdError } : {}),
      fallback_used: true,
      fallback_ms: Math.round(performance.now() - fallbackStartedAt),
      release_root_path: releaseRootPath,
      transcript_segments: normalized?.transcript.segments.length,
      total_ms: Math.round(performance.now() - startedAt)
    });
    return normalized;
  } catch (error) {
    logCutterDetailTiming({
      event: "cutter_detail_timing",
      source_video_id: sourceVideoId,
      cache_hit: false,
      searchd_ms: searchdMs,
      searchd_status: searchdStatus,
      ...(searchdError ? { searchd_error: searchdError } : {}),
      fallback_used: true,
      fallback_ms: Math.round(performance.now() - fallbackStartedAt),
      release_root_path: releaseRootPath,
      total_ms: Math.round(performance.now() - startedAt)
    });
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
  const releaseKey = await currentReleaseVersionForDetailCache(input);
  const cacheKey = releaseKey ? `${releaseKey}:${sourceVideoId}` : sourceVideoId;
  let cache = visibleDetailCacheByInput.get(input);
  if (!cache) {
    cache = new Map();
    visibleDetailCacheByInput.set(input, cache);
  }

  const cached = cache.get(cacheKey);
  if (cached && cached.expires_at_ms > nowMs) {
    const startedAt = performance.now();
    const value = await cached.promise;
    logCutterDetailTiming({
      event: "cutter_detail_timing",
      source_video_id: sourceVideoId,
      cache_hit: true,
      transcript_segments: value?.transcript.segments.length,
      total_ms: Math.round(performance.now() - startedAt)
    });
    return value;
  }

  const promise = loadVisibleDetailUncached(input, sourceVideoId).catch((error) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, {
    expires_at_ms: nowMs + VISIBLE_DETAIL_CACHE_TTL_MS,
    promise
  });
  if (cache.size > VISIBLE_DETAIL_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

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
    ...(previous?.verification ? { verification: previous.verification } : {}),
    ...(previous?.contract_error_code
      ? {
          contract_error_code: previous.contract_error_code,
          ...(previous.contract_error_message
            ? { contract_error_message: previous.contract_error_message }
            : {})
        }
      : {}),
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
  filename_query?: string;
  folder_query?: string;
}): string {
  return [
    input.state.release_root ?? "source",
    input.state.release_version || "fallback",
    input.limit,
    input.offset,
    input.source_folder_name ?? "",
    input.filename_query ?? "",
    input.folder_query ?? ""
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
  sourceFolderName?: string,
  filenameQuery?: string,
  folderQuery?: string
): Promise<SourceLibraryPagePayload> {
  const cache = sourceLibraryPageCacheForInput(input);
  const key = sourceLibraryPageCacheKey({
    state,
    limit,
    offset,
    source_folder_name: sourceFolderName,
    filename_query: filenameQuery,
    folder_query: folderQuery
  });
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
      source_folder_name: sourceFolderName,
      filename_query: filenameQuery,
      folder_query: folderQuery
    });

    return {
      library_id: await readLibraryIdBestEffort(input),
      available_video_count: library.available_video_count,
      ...(library.source_folders ? { source_folders: library.source_folders } : {}),
      videos: library.videos.map((video) => addSourceVideoUrls(withNormalizedSourceVideoPath(video)))
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

export interface CutterWorkspaceReleaseReferenceDetail {
  release_version: string;
  kind: "project" | "cut_job" | "clip_list" | "export_clip";
  ref_id: string;
  title: string;
  /** 命中的清单相对路径（不含绝对路径）。 */
  artifact: string;
}

export interface CutterWorkspaceReleaseReferences {
  /** workspace 中是否存在项目/切片清单/剪切任务/本地素材等历史作品产物。 */
  referenced: boolean;
  /** 清单中记录的 release 版本（vNNNNNN），去重排序。 */
  release_versions: string[];
  scanned_files: number;
  /** 命中的清单相对路径样例（最多 5 条，便于审计，不含绝对路径）。 */
  source_artifacts: string[];
  warnings: string[];
  /** 逐版本引用明细（D4 release cache pins 用）；旧调用方可忽略。 */
  version_references: CutterWorkspaceReleaseReferenceDetail[];
}

const CUTTER_WORKSPACE_REFERENCE_DIRECTORIES = [
  "projects",
  "clip-lists",
  // 历史清单目录名；cutter-local 当前实际把任务写在 clip-jobs/，两个都扫以保护 release 版本。
  "cut-jobs",
  "clip-jobs",
  "export-clips"
] as const;
const CUTTER_RELEASE_REFERENCE_KEYS = new Set([
  "release_version",
  "release_versions",
  "source_release_version",
  "snapshot_version",
  "library_release_version"
]);
const CUTTER_RELEASE_VERSION_PATTERN = /^v[0-9]{4,12}$/;
const CUTTER_REFERENCE_SCAN_MAX_FILES = 400;
const CUTTER_REFERENCE_SCAN_MAX_FILE_BYTES = 512 * 1024;
const CUTTER_REFERENCE_SCAN_MAX_DEPTH = 4;
const CUTTER_REFERENCE_SCAN_WARNING_LIMIT = 20;

export function emptyWorkspaceReleaseReferences(): CutterWorkspaceReleaseReferences {
  return {
    referenced: false,
    release_versions: [],
    scanned_files: 0,
    source_artifacts: [],
    warnings: [],
    version_references: []
  };
}

function workspaceReleaseReferenceKind(relativePath: string): CutterWorkspaceReleaseReferenceDetail["kind"] | undefined {
  const directory = relativePath.split("/")[0];
  if (directory === "projects") {
    return "project";
  }
  if (directory === "cut-jobs" || directory === "clip-jobs") {
    return "cut_job";
  }
  if (directory === "clip-lists") {
    return "clip_list";
  }
  if (directory === "export-clips") {
    return "export_clip";
  }
  return undefined;
}

function workspaceReleaseReferenceDetail(input: {
  relative_path: string;
  parsed: unknown;
  versions: Set<string>;
}): CutterWorkspaceReleaseReferenceDetail[] {
  const kind = workspaceReleaseReferenceKind(input.relative_path);
  if (!kind || input.versions.size === 0) {
    return [];
  }

  const parts = input.relative_path.split("/");
  const folderName = parts.length >= 2 ? parts[1] : "";
  const record = input.parsed && typeof input.parsed === "object" && !Array.isArray(input.parsed)
    ? input.parsed as Record<string, unknown>
    : {};
  const artifactName = parts[parts.length - 1]?.replace(/[.]json$/i, "") ?? "";
  const candidateIds = [
    // 历史作品通常以 project_id 标识归属；缺失时回退到各类清单自身 id。
    record.project_id,
    kind === "project" ? record.project_id : undefined,
    kind === "cut_job" ? record.cut_job_id : undefined,
    kind === "clip_list" ? record.clip_list_id : undefined,
    kind === "export_clip" ? record.export_clip_id : undefined
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");
  const refId = candidateIds[0] ?? (folderName || artifactName);
  const candidateTitles = [record.project_title, record.title, record.source_title, record.clip_list_title]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  const title = candidateTitles[0] ?? refId;

  return [...input.versions].sort().map((releaseVersion) => ({
    release_version: releaseVersion,
    kind,
    ref_id: refId,
    title,
    artifact: input.relative_path
  }));
}

function collectReleaseVersionValues(
  value: unknown,
  output: Set<string>,
  depth = 0
): void {
  if (depth > 6 || value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (CUTTER_RELEASE_VERSION_PATTERN.test(value.trim())) {
      output.add(value.trim());
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReleaseVersionValues(item, output, depth + 1);
    }

    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (CUTTER_RELEASE_REFERENCE_KEYS.has(key)) {
      collectReleaseVersionValues(nested, output, depth + 1);
      continue;
    }

    // 只向已知容器的浅层嵌套继续查找，不扫描任意字符串，
    // 避免把标题/文案里的 "v1234" 误判为版本号。
    if (depth < 2 && nested !== null && typeof nested === "object") {
      collectReleaseVersionValues(nested, output, depth + 1);
    }
  }
}

/**
 * 扫描本机 workspace 历史作品清单，解析其引用的 release 版本。
 * 只读、best-effort：目录缺失/清单损坏不抛错，仅记录 warnings；文件数与大小有上限。
 */
export async function collectWorkspaceReleaseReferences(input: {
  workspace_root?: string;
  max_files?: number;
}): Promise<CutterWorkspaceReleaseReferences> {
  const result = emptyWorkspaceReleaseReferences();
  const root = input.workspace_root?.trim();

  if (!root) {
    return result;
  }

  const maxFiles = Math.max(
    1,
    Math.min(2000, Math.floor(input.max_files ?? CUTTER_REFERENCE_SCAN_MAX_FILES))
  );
  const versions = new Set<string>();
  const detailKeys = new Set<string>();
  const warn = (message: string): void => {
    if (result.warnings.length < CUTTER_REFERENCE_SCAN_WARNING_LIMIT) {
      result.warnings.push(message);
    }
  };

  async function visit(directory: string, relative: string, depth: number): Promise<void> {
    if (result.scanned_files >= maxFiles || depth > CUTTER_REFERENCE_SCAN_MAX_DEPTH) {
      return;
    }

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (result.scanned_files >= maxFiles) {
        return;
      }

      const childPath = path.join(directory, entry.name);
      const childRelative = `${relative}/${entry.name}`;

      if (entry.isDirectory()) {
        await visit(childPath, childRelative, depth + 1);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }

      result.scanned_files += 1;

      if (result.source_artifacts.length < 5) {
        result.source_artifacts.push(childRelative);
      }

      try {
        const info = await stat(childPath);

        if (info.size > CUTTER_REFERENCE_SCAN_MAX_FILE_BYTES) {
          warn(`清单过大，已跳过：${childRelative}`);
          continue;
        }

        const parsed = JSON.parse(await readFile(childPath, "utf8")) as unknown;
        const artifactVersions = new Set<string>();
        collectReleaseVersionValues(parsed, versions);
        collectReleaseVersionValues(parsed, artifactVersions);
        for (const detail of workspaceReleaseReferenceDetail({
          relative_path: childRelative,
          parsed,
          versions: artifactVersions
        })) {
          const key = detail.release_version + "|" + detail.kind + "|" + detail.ref_id;
          if (!detailKeys.has(key)) {
            detailKeys.add(key);
            result.version_references.push(detail);
          }
        }
      } catch {
        warn(`清单无法解析，已跳过：${childRelative}`);
      }
    }
  }

  for (const directory of CUTTER_WORKSPACE_REFERENCE_DIRECTORIES) {
    await visit(path.join(root, directory), directory, 0);
  }

  result.referenced = result.scanned_files > 0;
  result.release_versions = [...versions].sort();

  return result;
}

/**
 * 计算 release cache 淘汰所需的引用保护参数：
 * - 能解析到版本号 → 精确 pin；
 * - 有历史作品产物但清单未记录版本（当前剪辑交付线旧清单）→ 保守保留全部已缓存版本；
 * - 扫描异常 → 同样保守保留，避免误删仍被引用的版本。
 */
export async function workspaceReleaseCacheReferenceOptions(
  workspaceRoot?: string
): Promise<Pick<
  SyncCutterReleaseCacheInput,
  "pinned_release_versions" | "preserve_cached_releases_for_unknown_references"
>> {
  try {
    const references = await collectWorkspaceReleaseReferences({
      workspace_root: workspaceRoot
    });

    if (references.release_versions.length > 0) {
      return { pinned_release_versions: references.release_versions };
    }

    if (references.referenced) {
      return { preserve_cached_releases_for_unknown_references: true };
    }
  } catch {
    return { preserve_cached_releases_for_unknown_references: true };
  }

  return {};
}

async function syncCutterReleaseCacheRuntimeStatusUncached(
  input: CreateCutterApiServerInput
): Promise<CutterReleaseCacheRuntimeStatus> {
  const cacheRoot = releaseCacheRootForInput(input);
  if (!cacheRoot) {
    return disabledReleaseCacheRuntimeStatus();
  }
  const syncRunner = input.release_cache_sync_runner ?? syncCutterReleaseCache;
  const statusReader = input.release_cache_status_reader ?? readLocalCutterReleaseCacheStatus;
  // PLAT-06：淘汰未引用旧版本前，先按本机历史作品清单保护引用版本；
  // 扫描是只读 best-effort，异常时保守保留全部缓存，绝不阻塞同步。
  const referenceOptions = await workspaceReleaseCacheReferenceOptions(input.workspace_root);
  // D4 收口：与 POST /cutter/release-cache/evict 共用 cache_root 文件锁，避免同步/淘汰交叉修改缓存目录。
  const maintenanceLock = await tryAcquireReleaseCacheMaintenanceLock(cacheRoot);
  if (!maintenanceLock) {
    return releaseCacheRuntimeStatusFromLocal(
      await statusReader({
        cache_root: cacheRoot,
        max_cached_releases: releaseCacheMaxReleases(input),
        include_cache_size: false
      }),
      "syncing"
    );
  }

  try {
    const clientVersion = resolveCutterClientVersion(input);
    const result = await syncRunner({
      source_library_root: input.library_root,
      cache_root: cacheRoot,
      max_cached_releases: releaseCacheMaxReleases(input),
      include_cache_size: false,
      ...(clientVersion ? { client_version: clientVersion } : {}),
      ...referenceOptions
    });

    // 校验失败（hash/清单无效）时保留旧缓存可用，但同步状态显式标 failed 供 UI/诊断读取。
    const verificationFailed = Boolean(
      result.verification &&
        (
          result.verification.failed_files.length > 0 ||
          result.verification.fallback_reason === "file_verification_failed" ||
          result.verification.fallback_reason === "manifest_v2_invalid"
        )
    );

    return {
      enabled: true,
      ready: result.cache_ready,
      sync_status: verificationFailed
        ? "failed"
        : result.cache_ready
          ? "ready"
          : "unavailable",
      active_release_version: result.active_release_version,
      source_release_version: result.source_release_version,
      search_index_version: result.search_index_version,
      ready_video_count: result.ready_video_count,
      cached_release_versions: result.cached_release_versions,
      cached_release_count: result.cached_release_count,
      max_cached_releases: result.max_cached_releases,
      cache_size_bytes: result.cache_size_bytes,
      pruned_release_versions: result.pruned_release_versions,
      kept_release_versions: result.kept_release_versions ?? [],
      kept_release_reasons: result.kept_release_reasons ?? {},
      pinned_release_versions: result.pinned_release_versions ??
        referenceOptions.pinned_release_versions ?? [],
      prune_failed_release_versions: result.prune_failed_release_versions ?? [],
      ...(result.verification
        ? {
            verification: result.verification,
            ...(result.verification.contract_error_code
              ? {
                  contract_error_code: result.verification.contract_error_code,
                  ...(result.verification.contract_error_message
                    ? { contract_error_message: result.verification.contract_error_message }
                    : {})
                }
              : {})
          }
        : {}),
      cache_root_path: result.cache_root,
      catalog_file_path: result.catalog_file_path,
      message: result.message
    };
  } catch {
    return releaseCacheRuntimeStatusFromLocal(
      await statusReader({
        cache_root: cacheRoot,
        max_cached_releases: releaseCacheMaxReleases(input),
        include_cache_size: false
      }),
      "failed"
    );
  } finally {
    await maintenanceLock.release();
  }
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
    filename_query?: string;
    folder_query?: string;
  }
): Promise<SourceLibraryPagePayload> {
  const state = await fastLibraryReadState(input);
  return loadSourceLibraryPageWithState(
    input,
    state,
    request.limit,
    request.offset,
    request.source_folder_name,
    request.filename_query,
    request.folder_query
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
  const videos = library.videos.map(withNormalizedSourceVideoPath);

  if (videos.length === 0) {
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
    videos.map(async (video): Promise<CutterSourceVideoPreflightSample> => {
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

const CACHE_DISK_STATS_TIMEOUT_MS = 150;
const DISK_LOW_FREE_RATIO = 0.05;

/** D2：缓存磁盘空间信息（statfs 尽力而为、150ms 超时；失败不阻塞 runtime-status）。 */
async function readCacheDiskUsage(input: CreateCutterApiServerInput): Promise<{
  disk_free_bytes?: number;
  disk_total_bytes?: number;
  disk_low: boolean;
  disk_unavailable_reason?: string;
}> {
  const candidates = [
    localCacheRootForInput(input),
    ...(input.workspace_root ? [input.workspace_root] : []),
    os.homedir()
  ];

  for (const candidate of candidates) {
    try {
      let timer: NodeJS.Timeout | undefined;
      const stats = await Promise.race([
        statfs(candidate),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), CACHE_DISK_STATS_TIMEOUT_MS);
        })
      ]).finally(() => {
        if (timer) {
          clearTimeout(timer);
        }
      });
      if (!stats) {
        continue;
      }

      const blockSize = Number(stats.bsize);
      const totalBytes = Number(stats.blocks) * blockSize;
      const freeBytes = Number(stats.bavail) * blockSize;
      if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(freeBytes)) {
        continue;
      }

      return {
        disk_free_bytes: Math.max(0, Math.floor(freeBytes)),
        disk_total_bytes: Math.floor(totalBytes),
        disk_low: freeBytes / totalBytes < DISK_LOW_FREE_RATIO
      };
    } catch {
      // 尝试下一个候选路径（目录尚不存在时 statfs 会失败）。
    }
  }

  return {
    disk_low: false,
    disk_unavailable_reason: "本机磁盘空间信息暂不可用（statfs 失败或超时）"
  };
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
  const diskUsage = await readCacheDiskUsage(input);

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
    cut_temp_cache: cutTempStatus,
    ...diskUsage
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
    },
    disk_low: false
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
  // D3：残留扫描与其它状态并行，最多等 200ms；失败/超时不阻塞 runtime-status。
  const workspaceResiduePromise = timeAsync("workspace_residue", () =>
    readWorkspaceResidueSummaryBestEffort({
      ...(input.api_input.workspace_root ? { workspace_root: input.api_input.workspace_root } : {}),
      timeout_ms: 200
    })
  );
  const [searchBackend, localCache, sourceVideoPreflight] = await Promise.all([
    timeAsync("search_backend", () => readSearchBackendStatus(input.api_input, availableVideoCount)),
    timeAsync("local_cache", () => input.include_local_cache
      ? readLocalCacheRuntimeStatusBestEffort(input.api_input)
      : Promise.resolve(checkingLocalCacheRuntimeStatus(input.api_input))),
    timeAsync("source_video_preflight", () => readSourceVideoPreflightStatus(input.api_input))
  ]);
  const workspaceResidue = await workspaceResiduePromise;
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
    ...workspaceResidue,
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
    usage_service_mode: usageServiceMode(input.api_input.usage_service),
    accounts_service_mode: accountsServiceMode(input.api_input.account_service),
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
  /** workspace 租约闸门：只有持租约的进程可执行任务（Round2）。 */
  execution_allowed?: () => Promise<boolean>;
  lease_unavailable_message?: () => string;
}): ReturnType<typeof runNextCutJob> {
  if (input.execution_allowed && !(await input.execution_allowed())) {
    throw new WorkspaceLeaseUnavailableError(
      input.lease_unavailable_message?.() ??
        "本机工作区正被另一个剪辑实例使用，当前实例只读/排队。"
    );
  }

  const injectedCutRunner = input.api_input.cut_runner;
  const cutTimeoutMaxMs = cutTimeoutMaxMsForInput(input.api_input);
  const cutRunner =
    injectedCutRunner ??
    ((runnerInput: CutterClipCutRunnerInput) =>
      defaultCutRunner(
        runnerInput,
        cutTimeoutMaxMs !== undefined ? { timeout_ms_max: cutTimeoutMaxMs } : {}
      ));
  const coverRunner = input.api_input.cover_runner ?? (injectedCutRunner ? undefined : defaultCoverRunner);
  // 注入 runner 的调用方（测试/自定义执行器）默认不启用真实 ffprobe 探针，除非显式注入；
  // 生产默认 runner 一律启用输出验收、源时长与关键帧探针（CUT-P0 契约）。
  const outputProbe = input.api_input.output_probe ?? (injectedCutRunner ? undefined : defaultCutOutputProbe);
  const keyframeProbe = input.api_input.keyframe_probe ?? (injectedCutRunner ? undefined : defaultCutKeyframeProbe);
  const sourceDurationProbe =
    input.api_input.source_duration_probe ?? (injectedCutRunner ? undefined : defaultCutSourceDurationProbe);
  let sourceToPrefetchAfterCut: CutJobSourceDetail | undefined;
  // 剪切期间 pin 源缓存文件，避免 source-video cache 淘汰删掉正在读取的文件（Round2 CUT-14）。
  const releaseCachePins: Array<() => void> = [];
  const pinCutSourcePath = (filePath: string): void => {
    if (filePath.trim()) {
      releaseCachePins.push(pinCachePath(filePath));
    }
  };

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

        pinCutSourcePath(clip.media_file_path);

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
        pinCutSourcePath(cutSource.source_video_file_path);
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
      pinCutSourcePath(cutSource.source_video_file_path);
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
    ...(coverRunner ? { cover_runner: coverRunner } : {}),
    ...(outputProbe ? { output_probe: outputProbe } : {}),
    ...(keyframeProbe ? { keyframe_probe: keyframeProbe } : {}),
    source_duration_probe: sourceDurationProbe,
    ...(cutTimeoutMaxMs !== undefined ? { cut_timeout_ms_max: cutTimeoutMaxMs } : {})
  };

  try {
    return input.cut_job_id
      ? await runCutJob({ ...runInput, cut_job_id: input.cut_job_id })
      : await runNextCutJob(runInput);
  } finally {
    for (const release of releaseCachePins) {
      release();
    }
  }
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

async function openSourceVideoDirectory(
  input: CreateCutterApiServerInput,
  body: OpenSourceVideoDirectoryRequestBody = {}
): Promise<{ path: string }> {
  const sourceVideoId = optionalString(body.source_video_id, "source_video_id");
  const sourceVideoFilePath = optionalString(body.source_video_file_path, "source_video_file_path");
  const detail = sourceVideoId && SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)
    ? await loadVisibleDetail(input, sourceVideoId)
    : null;
  const resolvedSourcePath =
    detail?.source_video_file_path ||
    (sourceVideoFilePath
      ? path.isAbsolute(sourceVideoFilePath)
        ? sourceVideoFilePath
        : resolveSourceVideoPath({
            mount_root: input.library_root,
            relative_path: sourceVideoFilePath
          })
      : "");

  if (!resolvedSourcePath) {
    throw new Error(sourceVideoId ? "source_video_not_found" : "source_video_file_path is required");
  }

  const targetPath = path.dirname(resolvedSourcePath);
  const openPath = input.open_path ?? defaultOpenPath;

  await stat(targetPath);
  if (body.open !== false) {
    await openPath(targetPath);
  }

  return { path: targetPath };
}

async function createWorkspaceLocalClip(input: {
  api_input: CreateCutterApiServerInput;
  body: CreateLocalClipRequestBody;
  execution_allowed?: () => Promise<boolean>;
  lease_unavailable_message?: () => string;
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
    persist_phase_progress: false,
    ...(input.execution_allowed ? { execution_allowed: input.execution_allowed } : {}),
    ...(input.lease_unavailable_message
      ? { lease_unavailable_message: input.lease_unavailable_message }
      : {})
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

const usageOutboxes = new WeakMap<Server, UsageOutbox>();

export async function closeCutterUsageOutbox(server: Server): Promise<void> {
  await usageOutboxes.get(server)?.close();
}

export function cutterUsageOutbox(server: Server): UsageOutbox | undefined {
  return usageOutboxes.get(server);
}

const cacheMaintenanceServices = new WeakMap<Server, CacheMaintenanceService>();

/** 测试/诊断入口：返回该 server 实例的磁盘缓存清理服务（confirm_token/busy 状态在实例内）。 */
export function cutterCacheMaintenanceService(server: Server): CacheMaintenanceService | undefined {
  return cacheMaintenanceServices.get(server);
}

const localClipMaintenanceServices = new WeakMap<Server, LocalClipMaintenanceService>();

/** 测试/诊断入口：返回该 server 实例的本地素材治理服务（confirm_token/busy 状态在实例内）。 */
export function cutterLocalClipMaintenanceService(
  server: Server
): LocalClipMaintenanceService | undefined {
  return localClipMaintenanceServices.get(server);
}

const workspaceResidueServices = new WeakMap<Server, WorkspaceResidueService>();

/** 测试/诊断入口：返回该 server 实例的工作区残留清理服务（confirm_token/busy 状态在实例内）。 */
export function cutterWorkspaceResidueService(
  server: Server
): WorkspaceResidueService | undefined {
  return workspaceResidueServices.get(server);
}

const releaseCacheMaintenanceServices = new WeakMap<Server, ReleaseCacheMaintenanceService>();

/** 测试/诊断入口：返回该 server 实例的 Release 缓存淘汰服务（confirm_token/busy 状态在实例内）。 */
export function cutterReleaseCacheMaintenanceService(
  server: Server
): ReleaseCacheMaintenanceService | undefined {
  return releaseCacheMaintenanceServices.get(server);
}

function envPositiveInteger(name: string): number | undefined {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function createCutterApiServer(input: CreateCutterApiServerInput): Server {
  // 服务模式默认关闭：只有显式配置 URL（或调用方注入连接）才切换到隔离服务。
  input.usage_service = input.usage_service ?? usageServiceFromEnv(process.env, "client");
  input.account_service = input.account_service ?? accountServiceFromEnv(process.env, "client");

  if (input.usage_service && input.usage_event_recorder) {
    throw new Error("统计服务不能同时配置其他事件写入器");
  }

  const usageOutbox = input.usage_service
    ? new UsageOutbox(
        input.usage_outbox_root ??
          optionalTrimmed(process.env.MIXLAB_USAGE_OUTBOX_ROOT) ??
          (input.workspace_root ? path.join(input.workspace_root, "usage-outbox") : ""),
        input.usage_service,
        {
          ...(input.usage_outbox_max_events !== undefined
            ? { max_events: input.usage_outbox_max_events }
            : envPositiveInteger("MIXLAB_USAGE_OUTBOX_MAX_EVENTS") !== undefined
              ? { max_events: envPositiveInteger("MIXLAB_USAGE_OUTBOX_MAX_EVENTS")! }
              : {})
        }
      )
    : undefined;

  if (usageOutbox) {
    input.usage_event_recorder = async (_root, event) => {
      await usageOutbox.enqueue(event);
    };
  }

  // D1b 磁盘缓存清理：token/busy 状态跟随 server 实例；路径与运行态失效复用本文件 helper。
  const cacheMaintenance = createCacheMaintenanceService({
    cache_root: localCacheRootForInput(input),
    ...(input.workspace_root ? { workspace_cache_root: path.join(input.workspace_root, "cache") } : {}),
    target_paths: {
      searchd: searchdCacheRoot(input),
      thumbnail: thumbnailCacheRoot(input),
      source_video: sourceVideoCacheRoot(input),
      cut_temp: cutTempCacheRootForInput(input),
      release: path.join(localCacheRootForInput(input), ".mixlab-library")
    },
    read_source_video_cache_status: async () => {
      const status = await readSourceVideoCacheStatus(input);
      return {
        active_prefetch_count: status.active_prefetch_count,
        cache_root_path: status.cache_root_path
      };
    },
    list_active_cut_jobs: async () => {
      if (!input.workspace_root) {
        return [];
      }

      try {
        const catalog = await listCutJobs({ workspace_root: input.workspace_root, limit: 100 });
        return catalog.jobs
          .filter((job) => job.status === "pending" || job.status === "running")
          .map((job) => ({
            cut_job_id: job.cut_job_id,
            ...(job.project_title ? { title: job.project_title } : {}),
            status: job.status
          }));
      } catch {
        return [];
      }
    },
    invalidate_runtime_status: () => invalidateLocalCacheRuntimeStatus(input),
    ...(input.cache_confirm_ttl_ms !== undefined
      ? { confirm_ttl_ms: input.cache_confirm_ttl_ms }
      : {})
  });

  // D2 本地素材治理：confirm_token/busy 状态跟随 server 实例；引用扫描复用 cutter-local 读取函数。
  const localClipMaintenance = createLocalClipMaintenanceService({
    ...(input.workspace_root ? { workspace_root: input.workspace_root } : {}),
    ...(input.local_clip_confirm_ttl_ms !== undefined
      ? { confirm_ttl_ms: input.local_clip_confirm_ttl_ms }
      : {})
  });

  // D3 工作区/临时残留：token/busy 状态跟随 server 实例。
  const workspaceResidue = createWorkspaceResidueService({
    ...(input.workspace_root ? { workspace_root: input.workspace_root } : {}),
    ...(input.workspace_residue_confirm_ttl_ms !== undefined
      ? { confirm_ttl_ms: input.workspace_residue_confirm_ttl_ms }
      : {})
  });

  // D5 治理操作审计：append-only JSONL、保留最近 50 条；写/读失败不阻塞清理操作。
  const governanceAudit = createGovernanceAuditStore({
    ...(input.workspace_root ? { workspace_root: input.workspace_root } : {}),
    ...(input.governance_audit_writer ? { writer: input.governance_audit_writer } : {})
  });

  // D4 Release 缓存 pin/淘汰：引用扫描复用 collectWorkspaceReleaseReferences。
  const releaseCacheMaintenance = createReleaseCacheMaintenanceService({
    cache_root: releaseCacheRootForInput(input) ?? localCacheRootForInput(input),
    max_cached_releases: releaseCacheMaxReleases(input) ?? 2,
    collect_workspace_references: async () => {
      const references = await collectWorkspaceReleaseReferences({
        workspace_root: input.workspace_root
      });
      return {
        referenced: references.referenced,
        release_versions: references.release_versions,
        version_references: references.version_references,
        warnings: references.warnings
      };
    },
    ...(input.release_cache_evict_confirm_ttl_ms !== undefined
      ? { confirm_ttl_ms: input.release_cache_evict_confirm_ttl_ms }
      : {})
  });

  let cutQueueDrainRunning = false;
  let cutQueueDrainRequested = false;
  let cutQueueDrainTimer: NodeJS.Timeout | undefined;
  let workspaceLease: WorkspaceLease | undefined;
  let workspaceLeaseUnavailable: WorkspaceLeaseUnavailableError | undefined;

  // Round2：workspace 独占租约。只有持租约的进程能执行启动恢复与队列任务。
  const leaseReady: Promise<void> = (async () => {
    if (!input.workspace_root) {
      return;
    }

    if (input.workspace_lease_disabled) {
      // 显式禁用租约（测试/单进程特殊场景）：保持 Round1 启动恢复行为。
      try {
        await recoverInterruptedCutJobs({
          workspace_root: input.workspace_root,
          now: input.now?.() ?? new Date().toISOString()
        });
      } catch (error) {
        console.error(JSON.stringify({
          event: "cut_queue_recovery_failed",
          message: error instanceof Error ? error.message : String(error)
        }));
      }
      return;
    }

    try {
      workspaceLease = await acquireWorkspaceLease({
        workspace_root: input.workspace_root,
        ...(input.workspace_lease_options ?? {}),
        now: input.workspace_lease_options?.now ?? (() => input.now?.() ?? new Date().toISOString())
      });
      const recovery = await recoverInterruptedCutJobsIfLeased({
        workspace_root: input.workspace_root,
        now: () => input.now?.() ?? new Date().toISOString(),
        lease: workspaceLease
      });
      if (recovery.skipped) {
        console.error(JSON.stringify({
          event: "cut_queue_recovery_skipped",
          reason: recovery.reason
        }));
      }
    } catch (error) {
      if (error instanceof WorkspaceLeaseUnavailableError) {
        workspaceLeaseUnavailable = error;
        console.error(JSON.stringify({
          event: "workspace_lease_unavailable",
          message: error.message,
          holder: error.holder ?? null
        }));
        return;
      }

      console.error(JSON.stringify({
        event: "workspace_lease_acquire_failed",
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  })();

  const workspaceExecutionAllowed = async (): Promise<boolean> => {
    await leaseReady;

    if (!input.workspace_root || input.workspace_lease_disabled) {
      return true;
    }

    return Boolean(workspaceLease?.is_held());
  };

  const workspaceLeaseMessage = (): string =>
    workspaceLeaseUnavailable?.message ??
    "本机工作区正被另一个剪辑实例使用（workspace 租约被占用），当前实例只读/排队。";

  void leaseReady.finally(() => {
    if (input.workspace_lease_disabled || workspaceLease?.is_held()) {
      scheduleCutQueueDrain("startup");
    }
  });

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

    if (!(await workspaceExecutionAllowed())) {
      console.error(JSON.stringify({
        event: "cut_queue_drain_skipped",
        reason,
        cause: WORKSPACE_LEASE_UNAVAILABLE_CODE
      }));
      return;
    }

    cutQueueDrainRunning = true;

    try {
      do {
        cutQueueDrainRequested = false;

        for (;;) {
          const job = await runWorkspaceCutJob({
            api_input: input,
            workspace_root: input.workspace_root,
            execution_allowed: workspaceExecutionAllowed,
            lease_unavailable_message: workspaceLeaseMessage
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

  const server = createServer(async (request, response) => {
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

      // 能力协商端点：公开（仅能力/版本，不含路径/凭据），旧客户端 404 时自动降级。
      if (request.method === "GET" && url.pathname === "/cutter/capabilities") {
        writeJson(response, 200, apiResponse(buildCutterCapabilities(input)));
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/auth/register") {
        try {
          const body = (await readRequestJson(request)) as CutterLoginRequestBody;
          const user = await createCutterAccounts(input.account_service).registerCutterAccount(input.library_root, {
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
          if ((error as { code?: string }).code === "AGENT_UNAVAILABLE") {
            throw error;
          }
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

          const login = await createCutterAccounts(input.account_service).loginCutterAccount(input.library_root, {
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
          if ((error as { code?: string }).code === "AGENT_UNAVAILABLE") {
            throw error;
          }
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
          ? await createCutterAccounts(input.account_service).logoutCutterSession(input.library_root, {
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
          const result = await createCutterAccounts(input.account_service).changeCutterAccountPassword(input.library_root, {
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
          if ((error as { code?: string }).code === "AGENT_UNAVAILABLE") {
            throw error;
          }
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
          const application = await createCutterAccounts(input.account_service).createCutterLoginApplication(input.library_root, {
            username: requiredChineseString(body.username, "用户名不能为空"),
            device_id: deviceId,
            device_name: requiredChineseString(body.device_name, "设备名称不能为空"),
            now,
            ip_address: requestIpAddress(request),
            user_agent: firstHeaderValue(request.headers["user-agent"]) || undefined
          });
          const session = application.status === "approved"
            ? await createCutterAccounts(input.account_service).ensureCutterSessionForDevice(input.library_root, {
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
          if ((error as { code?: string }).code === "AGENT_UNAVAILABLE") {
            throw error;
          }
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
              body,
              execution_allowed: workspaceExecutionAllowed,
              lease_unavailable_message: workspaceLeaseMessage
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
        const clientRequestId = optionalString(body.client_request_id, "client_request_id");

        if (clientRequestId && !/^[A-Za-z0-9._:-]{1,120}$/.test(clientRequestId)) {
          writeError(
            response,
            400,
            "invalid_client_request_id",
            "client_request_id 只能包含字母、数字、点、下划线、冒号、连字符（最长 120）"
          );
          return;
        }
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
          now: input.now?.() ?? new Date().toISOString(),
          ...(clientRequestId ? { client_request_id: clientRequestId } : {})
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
          workspace_root: workspaceRoot,
          execution_allowed: workspaceExecutionAllowed,
          lease_unavailable_message: workspaceLeaseMessage
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

      if (request.method === "POST" && url.pathname === "/cutter/source-videos/open-directory") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const body = (await readRequestJson(request)) as OpenSourceVideoDirectoryRequestBody;
        const sourceVideoId = typeof body.source_video_id === "string" ? body.source_video_id.trim() : "";
        const sourceVideoFilePath = typeof body.source_video_file_path === "string"
          ? body.source_video_file_path.trim()
          : "";
        if ((!sourceVideoId || !SOURCE_VIDEO_ID_PATTERN.test(sourceVideoId)) && !sourceVideoFilePath) {
          writeError(
            response,
            400,
            "invalid_source_video_id",
            "source_video_id must use V000001 format or source_video_file_path must be provided"
          );
          return;
        }

        writeJson(
          response,
          200,
          apiResponse(await openSourceVideoDirectory(input, {
            source_video_id: sourceVideoId,
            source_video_file_path: sourceVideoFilePath,
            open: body.open
          }))
        );
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

          const retryErrorCode = (error as { code?: unknown })?.code;
          if (
            retryErrorCode === CUT_JOB_NOT_RETRYABLE_CODE ||
            message === "only failed or cancelled cut jobs can be retried"
          ) {
            // 复剪契约：failed/cancelled，或 done 但 verification.passed === false 才可重试。
            writeError(
              response,
              409,
              "cut_job_not_retryable",
              message || "该任务当前状态不可复剪"
            );
            return;
          }

          throw error;
        }
        return;
      }

      const cutJobCancelMatch = /^\/cutter\/cut-jobs\/([^/]+)\/cancel$/.exec(url.pathname);
      if (request.method === "POST" && cutJobCancelMatch) {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        const cutJobId = cutJobCancelMatch[1] ?? "";
        if (!CUT_JOB_ID_PATTERN.test(cutJobId)) {
          writeError(response, 400, "invalid_cut_job_id", "剪切任务编号格式不正确");
          return;
        }

        const workspaceRoot = workspaceRootOrThrow(input);
        try {
          writeJson(response, 200, apiResponse(await cancelCutJob({
            workspace_root: workspaceRoot,
            cut_job_id: cutJobId,
            now: input.now?.() ?? new Date().toISOString()
          })));
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "cut job not found") {
            writeError(response, 404, "cut_job_not_found", "剪切任务不存在");
            return;
          }

          throw error;
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/cache/clean") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        let body: unknown;
        try {
          body = await readRequestJson(request);
        } catch (error) {
          writeError(
            response,
            400,
            "invalid_request",
            (error as Error).message === "invalid_json"
              ? "请求 JSON 格式不正确"
              : "请求体过大或格式不正确"
          );
          return;
        }

        const auditStartedAt = Date.now();
        try {
          const cleanResult = await cacheMaintenance.clean(body);
          const auditTargets = governanceAuditTargetsFromBody(body, "targets");
          const auditError = await recordGovernanceAuditBestEffort(governanceAudit, {
            operation: "cache_clean",
            targets: auditTargets,
            removed_count: cleanResult.cleaned.length,
            freed_bytes: cleanResult.freed_bytes,
            skipped_count: cleanResult.skipped.length,
            errors: cleanResult.errors.map((item) => ({
              code: item.code,
              message: item.message
            })),
            result: governanceAuditResultOf({
              target_count: auditTargets.length,
              removed_count: cleanResult.cleaned.length,
              skipped_count: cleanResult.skipped.length,
              error_count: cleanResult.errors.length
            }),
            duration_ms: Date.now() - auditStartedAt
          });
          writeJson(response, 200, apiResponse(withAuditError(cleanResult, auditError)));
        } catch (error) {
          if (!writeCacheMaintenanceError(response, error)) {
            throw error;
          }
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/local-clips/clean") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        let body: unknown;
        try {
          body = await readRequestJson(request);
        } catch (error) {
          writeError(
            response,
            400,
            "invalid_request",
            (error as Error).message === "invalid_json"
              ? "请求 JSON 格式不正确"
              : "请求体过大或格式不正确"
          );
          return;
        }

        const auditStartedAt = Date.now();
        try {
          const cleanResult = await localClipMaintenance.clean(body);
          const auditTargets = governanceAuditTargetsFromBody(body, "local_clip_ids");
          const auditError = await recordGovernanceAuditBestEffort(governanceAudit, {
            operation: "local_clip_clean",
            targets: auditTargets,
            removed_count: cleanResult.removed.length,
            freed_bytes: cleanResult.freed_bytes,
            skipped_count: cleanResult.skipped.length,
            errors: [],
            result: governanceAuditResultOf({
              target_count: auditTargets.length,
              removed_count: cleanResult.removed.length,
              skipped_count: cleanResult.skipped.length,
              error_count: 0
            }),
            duration_ms: Date.now() - auditStartedAt
          });
          writeJson(response, 200, apiResponse(withAuditError(cleanResult, auditError)));
        } catch (error) {
          if (!writeLocalClipMaintenanceError(response, error)) {
            throw error;
          }
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/workspace/residue/clean") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        let body: unknown;
        try {
          body = await readRequestJson(request);
        } catch (error) {
          writeError(
            response,
            400,
            "invalid_request",
            (error as Error).message === "invalid_json"
              ? "请求 JSON 格式不正确"
              : "请求体过大或格式不正确"
          );
          return;
        }

        const auditStartedAt = Date.now();
        try {
          const cleanResult = await workspaceResidue.clean(body);
          const auditTargets = governanceAuditTargetsFromBody(body, "ids");
          const auditError = await recordGovernanceAuditBestEffort(governanceAudit, {
            operation: "workspace_residue_clean",
            targets: auditTargets,
            removed_count: cleanResult.removed.length,
            freed_bytes: cleanResult.freed_bytes,
            skipped_count: cleanResult.skipped.length,
            errors: cleanResult.errors.map((item) => ({
              code: item.code,
              message: item.message
            })),
            result: governanceAuditResultOf({
              target_count: auditTargets.length,
              removed_count: cleanResult.removed.length,
              skipped_count: cleanResult.skipped.length,
              error_count: cleanResult.errors.length
            }),
            duration_ms: Date.now() - auditStartedAt
          });
          writeJson(response, 200, apiResponse(withAuditError(cleanResult, auditError)));
        } catch (error) {
          if (!writeWorkspaceResidueError(response, error)) {
            throw error;
          }
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/cutter/release-cache/evict") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        let body: unknown;
        try {
          body = await readRequestJson(request);
        } catch (error) {
          writeError(
            response,
            400,
            "invalid_request",
            (error as Error).message === "invalid_json"
              ? "请求 JSON 格式不正确"
              : "请求体过大或格式不正确"
          );
          return;
        }

        const auditStartedAt = Date.now();
        try {
          const evictResult = await releaseCacheMaintenance.evict(body);
          const auditTargets = governanceAuditTargetsFromBody(body, "versions");
          const auditError = await recordGovernanceAuditBestEffort(governanceAudit, {
            operation: "release_cache_evict",
            targets: auditTargets,
            removed_count: evictResult.evicted.length,
            freed_bytes: evictResult.freed_bytes,
            skipped_count: evictResult.blocked.length,
            errors: [],
            result: governanceAuditResultOf({
              target_count: auditTargets.length,
              removed_count: evictResult.evicted.length,
              skipped_count: evictResult.blocked.length,
              error_count: 0
            }),
            duration_ms: Date.now() - auditStartedAt
          });
          writeJson(response, 200, apiResponse(withAuditError(evictResult, auditError)));
        } catch (error) {
          if (!writeReleaseCacheMaintenanceError(response, error)) {
            throw error;
          }
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

      const sourceViewMatch = /^\/cutter\/source-videos\/([^/]+)\/view$/.exec(url.pathname);
      if (request.method === "POST" && sourceViewMatch) {
        const auth = await requireCutterSession({
          api_input: input,
          request,
          response
        });
        if (!auth) {
          return;
        }
        try {
          const sourceVideoId = decodeURIComponent(sourceViewMatch[1] ?? "");
          if (!/^V\d{6}$/.test(sourceVideoId)) {
            writeError(response, 400, "invalid_source_video_id", "source_video_id must use V000001 format");
            return;
          }
          if (shouldRecordSourceView(auth, sourceVideoId)) {
            await recordCutterUsageEventBestEffort({
              api_input: input,
              auth,
              event_type: "view_source_video",
              source_video_id: sourceVideoId
            });
          }
          writeNoContent(response);
        } catch {
          writeError(response, 500, "usage_event_failed", "failed to record source video view");
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
          usage_service_mode: usageServiceMode(input.usage_service),
          ...(input.usage_event_worker_stats
            ? { usage_event_worker: input.usage_event_worker_stats() }
            : {}),
          accounts_service_mode: accountsServiceMode(input.account_service),
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

        const runtimeStatus = await runtimeStatusForSession({
          api_input: input,
          auth,
          include_local_cache: url.searchParams.get("include_cache") === "1"
        });
        writeJson(response, 200, apiResponse({
          ...runtimeStatus,
          ...(input.usage_event_worker_stats ? { usage_event_worker: input.usage_event_worker_stats() } : {})
        }));
        return;
      }

      if (request.method === "GET" && url.pathname === "/cutter/cache/inventory") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        try {
          writeJson(
            response,
            200,
            apiResponse(await cacheMaintenance.inventory(url.searchParams.get("include")))
          );
        } catch (error) {
          if (!writeCacheMaintenanceError(response, error)) {
            throw error;
          }
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/cutter/workspace/residue") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        try {
          writeJson(response, 200, apiResponse(await workspaceResidue.inventory()));
        } catch (error) {
          if (!writeWorkspaceResidueError(response, error)) {
            throw error;
          }
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/cutter/release-cache/pins") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        try {
          writeJson(response, 200, apiResponse(await releaseCacheMaintenance.pins()));
        } catch (error) {
          if (!writeReleaseCacheMaintenanceError(response, error)) {
            throw error;
          }
        }
        return;
      }

      if (request.method === "GET" && url.pathname === "/cutter/governance/audit") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        let limit: number;
        try {
          limit = parseGovernanceAuditLimit(url.searchParams.get("limit"));
        } catch (error) {
          if (!writeGovernanceAuditError(response, error)) {
            throw error;
          }
          return;
        }

        const auditRead = await governanceAudit.readRecent(limit);
        writeJson(response, 200, apiResponse({
          entries: auditRead.entries,
          ...(auditRead.error ? { audit_error: auditRead.error } : {})
        }));
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
          source_folder_name: optionalTrimmed(url.searchParams.get("source_folder_name") ?? undefined),
          filename_query: optionalTrimmed(url.searchParams.get("filename_query") ?? undefined),
          folder_query: optionalTrimmed(url.searchParams.get("folder_query") ?? undefined)
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
        const folderQuery = optionalTrimmed(url.searchParams.get("folder_query") ?? undefined);
        const startedAt = Date.now();
        let result: CutterSourceLibrarySearchResult;
        try {
          result = await searchCutterSourceLibraryWithPreferredBackend({
            api_input: input,
            query,
            limit: parsePositiveLimit(url.searchParams.get("limit")),
            cursor,
            source_folder_name: sourceFolderName,
            folder_query: folderQuery
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

      if (url.pathname === "/cutter/local-clips/integrity") {
        if (!(await requireCutterSession({
          api_input: input,
          request,
          response
        }))) {
          return;
        }

        try {
          writeJson(response, 200, apiResponse(await localClipMaintenance.integrity()));
        } catch (error) {
          if (!writeLocalClipMaintenanceError(response, error)) {
            throw error;
          }
        }
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

        if (request.method === "DELETE") {
          if (localClipRoute.action !== "") {
            writeError(response, 404, "not_found", "Route not found");
            return;
          }

          if (input.workspace_root) {
            if (!/^E\d{6}$/.test(localClipRoute.local_clip_id)) {
              writeError(response, 404, "local_clip_not_found", "Local clip not found");
              return;
            }

            // fail-safe：引用索引不可读/损坏时，删除类操作必须拒绝（不能按“无引用”处理）。
            const inspection = await localClipMaintenance.inspect(localClipRoute.local_clip_id);
            if (inspection.degraded) {
              writeError(
                response,
                409,
                LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_reference_index_unreadable,
                "本地素材引用索引读取失败或损坏，已按安全策略拒绝删除。",
                "请修复或重建工作区引用索引后重试。"
              );
              return;
            }

            // D5：force 删除成功后追加治理审计（普通删除不审计）。
            let forceDeleteAuthorized = false;

            // D2：被项目/任务/清单引用时拒绝；?force=1 + X-MixLab-Cache-Confirm-Token 才允许强制删除。
            if (inspection.known && inspection.referenced_by.length > 0) {
              const force = url.searchParams.get("force") === "1";
              if (!force) {
                writeError(
                  response,
                  409,
                  LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_referenced,
                  "本地素材被项目、待剪任务或清单引用，未删除。",
                  "如确认删除，请重新调用 GET /cutter/local-clips/integrity 并在 DELETE 请求携带 ?force=1 与 X-MixLab-Cache-Confirm-Token 请求头。",
                  { referenced_by: inspection.referenced_by }
                );
                return;
              }

              try {
                localClipMaintenance.consumeForceToken(
                  firstHeaderValue(request.headers["x-mixlab-cache-confirm-token"]),
                  localClipRoute.local_clip_id
                );
                forceDeleteAuthorized = true;
              } catch (error) {
                if (!writeLocalClipMaintenanceError(response, error)) {
                  throw error;
                }
                return;
              }
            }

            const auditStartedAt = Date.now();
            const auditFreedBytes = forceDeleteAuthorized && governanceAudit.isEnabled()
              ? await measureLocalClipAuditFreedBytes(
                  input.workspace_root,
                  localClipRoute.local_clip_id
                )
              : 0;
            const result = await deleteExportClip({
              workspace_root: input.workspace_root,
              export_clip_id: localClipRoute.local_clip_id
            });

            if (!result.deleted) {
              writeError(response, 404, "local_clip_not_found", "Local clip not found");
              return;
            }

            const auditError = forceDeleteAuthorized
              ? await recordGovernanceAuditBestEffort(governanceAudit, {
                  operation: "local_clip_force_delete",
                  targets: [localClipRoute.local_clip_id],
                  removed_count: 1,
                  freed_bytes: auditFreedBytes,
                  skipped_count: 0,
                  errors: [],
                  result: "ok",
                  duration_ms: Date.now() - auditStartedAt
                })
              : undefined;

            writeJson(response, 200, apiResponse(withAuditError({
              local_clip_id: result.export_clip_id,
              deleted: result.deleted
            }, auditError)));
            return;
          }

          const result = await deleteLocalClip({
            library_root: input.library_root,
            local_clip_id: localClipRoute.local_clip_id
          });

          if (!result.deleted) {
            writeError(response, 404, "local_clip_not_found", "Local clip not found");
            return;
          }

          writeJson(response, 200, apiResponse(result));
          return;
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

            await streamFileWithCachePin({
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

            await streamFileWithCachePin({
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
          await streamFileWithCachePin({
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
        await streamFileWithCachePin({
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
          // 预取详情不算真实浏览，避免污染 usage analytics；点击路径不传 prefetch=1。
          if (url.searchParams.get("prefetch") !== "1" && shouldRecordSourceView(auth, detail.source_video_id)) {
            await recordCutterUsageEventBestEffort({
              api_input: input,
              auth,
              event_type: "view_source_video",
              source_video_id: detail.source_video_id
            });
          }
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
          await streamFileWithCachePin({
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
          await streamFileWithCachePin({
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
          await streamFileWithCachePin({
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

      if ((error as Error).message === "searchd_timeout" || (error as Error).message === "searchd_warming") {
        writeError(response, 502, "searchd_unavailable", "本地搜索服务暂不可用，请稍后重试搜索。");
        return;
      }

      if ((error as { code?: unknown })?.code === CUT_QUEUE_BUSY_CODE) {
        writeError(
          response,
          409,
          CUT_QUEUE_BUSY_CODE,
          error instanceof Error ? error.message : "另一个剪辑实例正在提交剪切任务，请稍后重试。"
        );
        return;
      }

      if ((error as { code?: unknown })?.code === WORKSPACE_LEASE_UNAVAILABLE_CODE) {
        writeError(
          response,
          409,
          WORKSPACE_LEASE_UNAVAILABLE_CODE,
          error instanceof Error
            ? error.message
            : "本机工作区正被另一个剪辑实例使用（workspace 租约被占用），当前实例只读/排队。"
        );
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

      const contractCode = (error as { code?: unknown })?.code;
      if (typeof contractCode === "string" && isContractErrorCode(contractCode)) {
        const definition = contractErrorDefinition(contractCode);
        writeError(
          response,
          definition?.http_status ?? 503,
          contractCode,
          error instanceof Error && error.message
            ? error.message
            : definition?.user_message ?? "服务暂时不可用"
        );
        return;
      }

      logUnhandledCutterApiError(request, error);
      writeError(response, 500, "internal_error", "Internal server error");
    }
  });

  cacheMaintenanceServices.set(server, cacheMaintenance);
  localClipMaintenanceServices.set(server, localClipMaintenance);
  workspaceResidueServices.set(server, workspaceResidue);
  releaseCacheMaintenanceServices.set(server, releaseCacheMaintenance);

  server.once("close", () => {
    void workspaceLease?.release();
  });

  if (usageOutbox) {
    usageOutboxes.set(server, usageOutbox);
    server.once("close", () => {
      void usageOutbox.close();
    });
  }

  return server;
}
