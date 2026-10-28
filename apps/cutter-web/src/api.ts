import {
  isCapabilityTableV1,
  type CapabilityTableV1
} from "../../../packages/contracts/src/capabilities.ts";
import type {
  ContractErrorBody,
  ErrorRetryability
} from "../../../packages/contracts/src/errors.ts";

export interface CutterApiEnvelope<T> {
  schema_version: string;
  data: T;
}

export interface CutterApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  /** Contract error registry envelope v1 (may be absent on legacy servers). */
  ok?: false;
  error_code?: string;
  code?: string;
  message?: string;
  remediation?: string;
  retryable?: ErrorRetryability;
  http_status?: number;
  details?: Record<string, unknown>;
  contract_version?: string;
}

export interface SourceVideoCard {
  source_video_id: string;
  title: string;
  duration_ms: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  file_size?: number;
  relative_path?: string;
  source_video_file_path?: string;
  source_folder_name?: string;
  description?: string;
  tags?: string[];
  category?: string;
  course?: string;
  lecturer?: string;
  publish_status?: "ready";
  media_url: string;
  cover_url: string;
  detail_url: string;
  subtitles_url: string;
}

export interface SourceLibraryResponse {
  library_id?: string;
  available_video_count: number;
  videos: SourceVideoCard[];
  source_folders?: SourceFolderOption[];
}

export interface SourceFolderOption {
  name: string;
  count: number;
}

export interface SourceFolderResponse {
  source_folders: SourceFolderOption[];
}

export interface TranscriptSegment {
  segment_id: string;
  begin_ms: number;
  end_ms: number;
  text: string;
}

export interface SourceVideoDetail extends SourceVideoCard {
  transcript: {
    full_text: string;
    segments: TranscriptSegment[];
  };
  keyframes: {
    keyframes_ms: number[];
  };
}

export interface SearchHitSegment extends TranscriptSegment {
  match_ranges?: Array<[number, number]>;
  match_id?: string;
  match_type?: "exact" | "tolerant";
}

export interface SearchGroup {
  source_video_id: string;
  title: string;
  duration_ms?: number;
  hit_count: number;
  best_excerpt: string;
  hit_segments: SearchHitSegment[];
  transcript_character_count?: number;
  source_folder_name?: string;
  media_url?: string;
  cover_url?: string;
  detail_url?: string;
  subtitles_url?: string;
}

export interface SearchResponse {
  query: string;
  normalized_query: string;
  groups: SearchGroup[];
  cursor?: string;
  next_cursor?: string;
  has_more?: boolean;
  returned_count?: number;
  limit?: number;
  index_version?: string;
  search_ms?: number;
  search_mode?: "sqlite-index" | "transcript-artifact-fallback" | "searchd";
}

export interface LocalClip {
  local_clip_id: string;
  project_id?: string;
  title: string;
  source_video_id?: string;
  source_title?: string;
  relative_path?: string;
  begin_ms?: number;
  end_ms?: number;
  duration_ms?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  file_size?: number;
  selected_text?: string;
  cover_url?: string;
  subtitles_url?: string;
  transcript_segments?: TranscriptSegment[];
  media_url: string;
  detail_url: string;
}

export interface LocalClipCatalog {
  local_clip_count: number;
  clips: LocalClip[];
}

export interface CreateLocalClipRequest {
  source_video_id: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms?: number;
  end_ms?: number;
  selected_text?: string;
  pre_roll_ms?: number;
  post_roll_ms?: number;
  cut_mode?: "copy" | "smart" | "precise";
  title?: string;
}

export type CutMode = "copy" | "smart" | "precise";

export interface CutListItemInput {
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  start_segment_id: string;
  end_segment_id: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  pre_roll_ms?: number;
  post_roll_ms?: number;
}

export interface ClipListItem extends CutListItemInput {
  item_id: string;
  order: number;
  pre_roll_ms: number;
  post_roll_ms: number;
}

export interface ClipList {
  schema_version: string;
  clip_list_id: string;
  library_id: string;
  project_id?: string;
  title: string;
  item_count: number;
  created_at: string;
  updated_at: string;
  items: ClipListItem[];
}

export interface CreateClipListRequest {
  library_id: string;
  project_id?: string;
  title: string;
  items: CutListItemInput[];
}

export type CutJobStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type CutJobPhaseId =
  | "queue_wait"
  | "resolve_source"
  | "preflight_source"
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

export interface CutJobVerificationCheck {
  check_id?: string;
  label?: string;
  passed?: boolean;
  message?: string;
}

/**
 * Optional post-cut output verification written by newer cutter engines.
 * Older engines omit this field entirely; the UI must treat a missing/invalid
 * value as "unverified" and never as "verified".
 */
export interface CutJobVerification {
  passed: boolean;
  expected_duration_ms?: number;
  actual_duration_ms?: number;
  tolerance_ms?: number;
  checks?: CutJobVerificationCheck[];
}

export interface CutJob {
  cut_job_id: string;
  clip_list_id: string;
  clip_list_item_id?: string;
  library_id?: string;
  project_id?: string;
  title?: string;
  project_title?: string;
  project_clip_order?: number;
  source_video_id?: string;
  source_title?: string;
  source_relative_path?: string;
  start_segment_id?: string;
  end_segment_id?: string;
  begin_ms?: number;
  end_ms?: number;
  selected_text?: string;
  cut_mode?: CutMode;
  status: CutJobStatus;
  current_phase?: CutJobPhaseId;
  phase_timings?: CutJobPhaseTiming[];
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  export_clip_id?: string;
  output_file?: string;
  cut_mode_used?: CutMode;
  verification?: CutJobVerification;
}

export interface CutJobSubmission {
  submitted_count: number;
  jobs: CutJob[];
}

export interface CutJobCatalog {
  job_count: number;
  jobs: CutJob[];
}

export interface SubmitCutJobsRequest {
  clip_list_id: string;
}

export interface OpenCutOutputDirectoryResult {
  path: string;
}

export interface OpenCutOutputDirectoryRequest {
  project_id?: string;
  project_title?: string;
  open?: boolean;
}

export interface OpenSourceVideoDirectoryRequest {
  source_video_id?: string;
  source_video_file_path?: string;
  open?: boolean;
}

export interface DeleteProjectOutputsResult {
  project_id: string;
  removed_export_clips: number;
  removed_local_clips: number;
  removed_project_outputs: number;
  removed_cut_jobs: number;
  removed_clip_lists: number;
}

export type CutterUserStatus = "pending" | "approved" | "rejected" | "disabled";
export type CutterLoginStatusValue = "unknown" | CutterUserStatus;

export interface CutterDeviceRecord {
  device_id: string;
  device_name: string;
  status: "active" | "disabled";
  first_seen_at: string;
  last_login_at: string;
}

export interface CutterUserRecord {
  user_id: string;
  username: string;
  display_name: string;
  status: CutterUserStatus;
  applied_at: string;
  approved_at: string;
  rejected_at: string;
  disabled_at: string;
  last_login_at: string;
  last_used_at: string;
  note: string;
  devices: CutterDeviceRecord[];
}

export interface CutterLoginRequest {
  username: string;
  device_id: string;
  device_name: string;
}

export interface CutterAccountCredentials extends CutterLoginRequest {
  password: string;
}

export interface CutterSessionRecord {
  user_id: string;
  device_id: string;
  session_token: string;
  created_at: string;
  last_seen_at: string;
}

export interface CutterLoginApplication {
  user: CutterUserRecord;
  session?: CutterSessionRecord;
}

export interface CutterLogoutResult {
  removed: boolean;
}

export interface CutterPasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export interface CutterPasswordChangeResult {
  user: CutterUserRecord;
}

export type CutterAuthMode = "reviewed" | "local_trusted";

export interface CutterAuthModeStatus {
  auth_mode: CutterAuthMode;
  local_trusted: boolean;
  trusted_username: string;
}

export type CutterLoginStatus =
  | {
      ok: true;
      user: CutterUserRecord;
    }
  | {
      ok: false;
      user?: CutterUserRecord;
      reason?: string;
      message?: string;
    };

export interface CutterLoginStatusFailure {
  ok: false;
  reason?: string;
  message?: string;
}

export interface CutterRuntimeStatus {
  mode: "api" | "fixture";
  mode_label: string;
  api_ready: boolean;
  generated_at: string;
  library_id: string;
  library_root_label: string;
  library_root_path?: string;
  available_video_count: number;
  workspace_enabled: boolean;
  workspace_root_label: string;
  workspace_root_path?: string;
  local_clip_count: number;
  ffmpeg_status: "可用" | "不可用";
  ffmpeg_source: "内置" | "环境配置" | "未检测到";
  local_runtime?: {
    cpu_usage_percent?: number;
    disk_io_bytes_per_second?: number;
  };
  search_backend?: {
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
  };
  release_cache?: {
    enabled: boolean;
    ready: boolean;
    sync_status: "ready" | "syncing" | "unavailable" | "failed";
    active_release_version: string;
    source_release_version: string;
    search_index_version?: string;
    ready_video_count: number;
    cached_release_versions?: string[];
    cached_release_count?: number;
    max_cached_releases?: number;
    cache_size_bytes?: number;
    cache_root_path: string;
    catalog_file_path: string;
    message: string;
  };
  local_cache?: {
    cache_root_path: string;
    searchd_cache_root_path?: string;
    searchd_cache_size_bytes?: number;
    thumbnail_cache_root_path: string;
    thumbnail_cache_manifest_path?: string;
    thumbnail_cache_size_bytes: number;
    thumbnail_cache_max_bytes: number;
    thumbnail_cache_manifest_entry_count?: number;
    thumbnail_cache_checksum_entry_count?: number;
    source_video_cache?: {
      cache_root_path: string;
      max_bytes: number;
      size_bytes: number;
      file_count: number;
      cached_video_count: number;
      active_prefetch_count: number;
      last_error?: string;
    };
    cut_temp_cache: {
      cache_root_path: string;
      max_bytes: number;
      size_bytes: number;
      file_count: number;
    };
    disk_free_bytes?: number;
    disk_total_bytes?: number;
    disk_low?: boolean;
    disk_unavailable_reason?: string;
  };
  workspace_residue_count?: number;
  workspace_residue_bytes?: number;
  workspace_residue_reason?: string;
  source_video_preflight?: {
    status: "ready" | "checking" | "blocked" | "unavailable";
    checked_count: number;
    readable_count: number;
    probe_count?: number;
    probe_readable_count?: number;
    sample_count: number;
    samples: Array<{
      source_video_id: string;
      title: string;
      source_video_file_path: string;
      readable: boolean;
      file_size?: number;
      media_probe?: {
        checked: boolean;
        ok: boolean;
        duration_ms?: number;
        width?: number;
        height?: number;
        codec?: string;
        reason: string;
      };
      reason: string;
    }>;
    message: string;
  };
  current_user: {
    user_id: string;
    username: string;
    display_name: string;
  };
}

export interface CutterWorkspaceResidueItem {
  id: string;
  kind: string;
  path: string;
  size_bytes: number;
  created_at?: string;
  safe_to_delete: boolean;
  reason?: string;
}

export interface CutterWorkspaceResidue {
  items: CutterWorkspaceResidueItem[];
  total_bytes: number;
  expected_bytes: number;
  confirm_token: string;
}

export interface CutterWorkspaceResidueCleanRequest {
  ids: string[];
  confirm_token: string;
  expected_bytes: number;
}

export interface CutterWorkspaceResidueCleanResult {
  removed: string[];
  freed_bytes: number;
  skipped: Array<{ id: string; reason: string }>;
  errors: Array<{ id: string; code: string; message: string; path?: string }>;
}

export interface CutterReleaseCacheReference {
  project_id: string;
  title: string;
  kind: string;
}

export interface CutterReleaseCacheVersion {
  version: string;
  size_bytes: number;
  last_used_at?: string;
  referenced_by?: CutterReleaseCacheReference[];
}

export interface CutterReleaseCachePins {
  pinned: CutterReleaseCacheVersion[];
  unpinned: CutterReleaseCacheVersion[];
  active_release_version?: string;
  max_cached_releases: number;
  expected_bytes: number;
  confirm_token: string;
  warnings: Array<{ code: string; message: string }>;
}

export interface CutterReleaseCacheEvictRequest {
  versions: string[];
  confirm_token: string;
  expected_bytes: number;
}

export interface CutterReleaseCacheEvictResult {
  evicted: string[];
  freed_bytes: number;
  blocked: Array<{ version: string; reason: string; referenced_by?: CutterReleaseCacheReference[] }>;
}

export interface CutterLocalClipIntegrityReference {
  local_clip_id: string;
  referenced_by: Array<{ kind: string; ref_id: string; title: string }>;
}

export interface CutterLocalClipOrphan {
  local_clip_id: string;
  path: string;
  size_bytes: number;
  reason: string;
}

export interface CutterLocalClipIntegrity {
  referenced: CutterLocalClipIntegrityReference[];
  orphans: CutterLocalClipOrphan[];
  total_bytes: number;
  expected_bytes: number;
  confirm_token: string;
  /** fail-safe：引用索引损坏/不可读时为 true，orphans 为空且禁止 clean。 */
  degraded: boolean;
  warnings: Array<{ code: string; message: string }>;
}

export interface CutterLocalClipCleanRequest {
  local_clip_ids: string[];
  confirm_token: string;
  expected_bytes: number;
}

export interface CutterLocalClipCleanResult {
  removed: string[];
  freed_bytes: number;
  skipped: Array<{ local_clip_id: string; reason: string }>;
}

export interface CutterCacheInventoryTarget {
  id: string;
  label: string;
  path: string;
  size_bytes: number;
  file_count: number;
  updated_at?: string;
  writable: boolean;
  deletable: boolean;
  deletable_bytes: number;
  reason?: string;
}

export interface CutterCacheInventoryProtectedItem {
  kind: string;
  ref_id: string;
  title: string;
  reason: string;
}

export interface CutterCacheInventoryWarning {
  code: string;
  message: string;
  path?: string;
}

export interface CutterCacheInventory {
  targets: CutterCacheInventoryTarget[];
  protected: CutterCacheInventoryProtectedItem[];
  warnings: CutterCacheInventoryWarning[];
  confirm_token: string;
  expected_bytes: number;
}

export interface CutterCacheCleanRequest {
  targets: string[];
  confirm_token: string;
  expected_bytes: number;
}

export interface CutterCacheCleanResult {
  cleaned: string[];
  freed_bytes: number;
  skipped: Array<{ id: string; reason: string }>;
  errors: Array<{ code: string; path?: string; message: string }>;
}

export interface CutterAuthHeaders {
  device_id: string;
  session_token: string;
}

export interface CutterApiClientInput {
  base_url: string;
  fetch?: typeof fetch;
  auth?: CutterAuthHeaders;
  /**
   * Called when a session-authenticated request is rejected with 401:
   * the app layer clears the stored session and returns to the login gate.
   */
  on_unauthenticated?: (error: CutterApiError) => void;
}

export class CutterApiError extends Error {
  readonly name = "CutterApiError";
  readonly status: number;
  readonly code: string;
  readonly remediation?: string;
  readonly retryable?: ErrorRetryability;
  readonly details?: Record<string, unknown>;
  readonly contract_version?: string;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    remediation?: string;
    retryable?: ErrorRetryability;
    details?: Record<string, unknown>;
    contract_version?: string;
  }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.remediation = input.remediation;
    this.retryable = input.retryable;
    this.details = input.details;
    this.contract_version = input.contract_version;
  }
}

export interface CutterApiClient {
  requestLogin(input: CutterLoginRequest): Promise<CutterLoginApplication>;
  registerAccount(input: CutterAccountCredentials): Promise<CutterLoginApplication>;
  loginAccount(input: CutterAccountCredentials): Promise<CutterLoginApplication>;
  logoutAccount(): Promise<CutterLogoutResult>;
  changePassword(input: CutterPasswordChangeRequest): Promise<CutterPasswordChangeResult>;
  getAuthMode(): Promise<CutterAuthModeStatus>;
  /** GET /cutter/capabilities; null means the endpoint is absent (legacy server). */
  getCapabilities(): Promise<CapabilityTableV1 | null>;
  getLoginStatus(): Promise<CutterLoginStatus>;
  getRuntimeStatus(options?: { includeCache?: boolean }): Promise<CutterRuntimeStatus>;
  getCacheInventory(options?: { include?: readonly string[] }): Promise<CutterCacheInventory>;
  cleanCache(request: CutterCacheCleanRequest): Promise<CutterCacheCleanResult>;
  getLocalClipIntegrity(): Promise<CutterLocalClipIntegrity>;
  cleanLocalClips(request: CutterLocalClipCleanRequest): Promise<CutterLocalClipCleanResult>;
  getWorkspaceResidue(): Promise<CutterWorkspaceResidue>;
  cleanWorkspaceResidue(request: CutterWorkspaceResidueCleanRequest): Promise<CutterWorkspaceResidueCleanResult>;
  getReleaseCachePins(): Promise<CutterReleaseCachePins>;
  evictReleaseCache(request: CutterReleaseCacheEvictRequest): Promise<CutterReleaseCacheEvictResult>;
  listSourceLibrary(options?: {
    limit?: number;
    offset?: number;
    sourceFolderName?: string;
    filenameQuery?: string;
    folderQuery?: string;
  }): Promise<SourceLibraryResponse>;
  listSourceFolders(): Promise<SourceFolderResponse>;
  getSourceVideoDetail(sourceVideoId: string): Promise<SourceVideoDetail>;
  searchSourceLibrary(
    query: string,
    limit?: number,
    options?: { cursor?: string; sourceFolderName?: string; folderQuery?: string }
  ): Promise<SearchResponse>;
  listLocalClips(options?: { limit?: number; offset?: number }): Promise<LocalClipCatalog>;
  getLocalClipDetail(localClipId: string): Promise<LocalClip>;
  deleteLocalClip(localClipId: string): Promise<{ local_clip_id: string; deleted: boolean }>;
  createLocalClip(request: CreateLocalClipRequest): Promise<LocalClip>;
  createClipList(request: CreateClipListRequest): Promise<ClipList>;
  submitCutJobs(request: SubmitCutJobsRequest): Promise<CutJobSubmission>;
  listCutJobs(options?: { limit?: number; offset?: number }): Promise<CutJobCatalog>;
  runNextCutJob(): Promise<CutJob | null>;
  retryCutJob(cutJobId: string): Promise<CutJob>;
  cancelCutJob(cutJobId: string): Promise<CutJob>;
  openCutOutputDirectory(request?: OpenCutOutputDirectoryRequest): Promise<OpenCutOutputDirectoryResult>;
  openSourceVideoDirectory(request: OpenSourceVideoDirectoryRequest): Promise<OpenCutOutputDirectoryResult>;
  deleteProjectOutputs(projectId: string): Promise<DeleteProjectOutputsResult>;
  resolveApiUrl(pathOrUrl: string): string;
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function appendPath(baseUrl: string, path: string): string {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}${path}` : path;
}

function authHeaders(auth: CutterAuthHeaders | undefined): HeadersInit {
  return auth
    ? {
        "X-MixLab-Device-Id": auth.device_id,
        "X-MixLab-Session-Token": auth.session_token
      }
    : {};
}

function jsonHeaders(auth?: CutterAuthHeaders): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...authHeaders(auth)
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function requestEnvelope<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await readJson<CutterApiEnvelope<T> | CutterApiErrorBody>(response);

  if (!response.ok) {
    const errorBody = body as CutterApiErrorBody & Partial<ContractErrorBody>;
    const legacyCode = errorBody.error?.code;
    const contractCode = typeof errorBody.error_code === "string" && errorBody.error_code.trim()
      ? errorBody.error_code.trim()
      : typeof errorBody.code === "string" && errorBody.code.trim()
        ? errorBody.code.trim()
        : "";
    const code = contractCode || legacyCode || "api_error";
    const message = legacyCode
      ? errorBody.error?.message ?? `Request failed with status ${response.status}`
      : typeof errorBody.message === "string" && errorBody.message.trim()
        ? errorBody.message
        : `Request failed with status ${response.status}`;
    throw new CutterApiError({
      status: response.status,
      code,
      message,
      ...(typeof errorBody.remediation === "string" ? { remediation: errorBody.remediation } : {}),
      ...(errorBody.retryable ? { retryable: errorBody.retryable } : {}),
      ...(errorBody.details && typeof errorBody.details === "object" ? { details: errorBody.details } : {}),
      ...(typeof errorBody.contract_version === "string"
        ? { contract_version: errorBody.contract_version }
        : {})
    });
  }

  return (body as CutterApiEnvelope<T>).data;
}

function requestHasSessionToken(init?: RequestInit): boolean {
  if (!init?.headers) {
    return false;
  }

  try {
    return new Headers(init.headers).has("X-MixLab-Session-Token");
  } catch {
    return false;
  }
}

async function readUnauthorizedError(response: Response): Promise<CutterApiError> {
  try {
    const body = (await response.clone().json()) as CutterApiErrorBody & Partial<ContractErrorBody>;
    return new CutterApiError({
      status: response.status,
      code: body.error_code ?? body.code ?? body.error?.code ?? "login_required",
      message: body.message ?? body.error?.message ?? "登录已失效，请重新登录。",
      ...(typeof body.remediation === "string" ? { remediation: body.remediation } : {})
    });
  } catch {
    return new CutterApiError({
      status: response.status,
      code: "login_required",
      message: "登录已失效，请重新登录。"
    });
  }
}

export function createCutterApiClient(input: CutterApiClientInput): CutterApiClient {
  const rawFetchImpl = input.fetch ?? fetch;
  const fetchImpl: typeof fetch = async (resource, init) => {
    const response = await rawFetchImpl(resource, init);

    if (response.status === 401 && input.on_unauthenticated && requestHasSessionToken(init)) {
      input.on_unauthenticated(await readUnauthorizedError(response));
    }

    return response;
  };
  const protectedHeaders = authHeaders(input.auth);

  return {
    requestLogin(request: CutterLoginRequest) {
      return requestEnvelope<CutterLoginApplication>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/request-login"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username: request.username,
            device_id: request.device_id,
            device_name: request.device_name
          })
        }
      );
    },

    registerAccount(request: CutterAccountCredentials) {
      return requestEnvelope<CutterLoginApplication>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/register"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username: request.username,
            password: request.password,
            device_id: request.device_id,
            device_name: request.device_name
          })
        }
      );
    },

    loginAccount(request: CutterAccountCredentials) {
      return requestEnvelope<CutterLoginApplication>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/login"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username: request.username,
            password: request.password,
            device_id: request.device_id,
            device_name: request.device_name
          })
        }
      );
    },

    logoutAccount() {
      return requestEnvelope<CutterLogoutResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/logout"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify({})
        }
      );
    },

    changePassword(request: CutterPasswordChangeRequest) {
      return requestEnvelope<CutterPasswordChangeResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/change-password"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify(request)
        }
      );
    },

    getAuthMode() {
      return requestEnvelope<CutterAuthModeStatus>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/mode")
      );
    },

    async getCapabilities() {
      try {
        const table = await requestEnvelope<unknown>(
          fetchImpl,
          appendPath(input.base_url, "/cutter/capabilities"),
          { headers: protectedHeaders }
        );
        return isCapabilityTableV1(table) ? table : null;
      } catch (capabilityError) {
        if (
          capabilityError instanceof CutterApiError &&
          (capabilityError.status === 404 ||
            capabilityError.status === 405 ||
            capabilityError.status === 501)
        ) {
          // Legacy engines do not expose capabilities: degrade to old behaviour.
          return null;
        }
        throw capabilityError;
      }
    },

    getLoginStatus() {
      return requestEnvelope<CutterLoginStatus>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/status"),
        {
          headers: protectedHeaders
        }
      );
    },

    getRuntimeStatus(options) {
      const params = new URLSearchParams();
      if (options?.includeCache) {
        params.set("include_cache", "1");
      }
      const query = params.toString();
      return requestEnvelope<CutterRuntimeStatus>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/runtime-status${query ? `?${query}` : ""}`),
        {
          headers: protectedHeaders
        }
      );
    },

    getCacheInventory(options) {
      const params = new URLSearchParams();
      if (options?.include && options.include.length > 0) {
        params.set("include", options.include.join(","));
      }
      const query = params.toString();
      return requestEnvelope<CutterCacheInventory>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/cache/inventory${query ? `?${query}` : ""}`),
        {
          headers: protectedHeaders
        }
      );
    },

    cleanCache(request) {
      return requestEnvelope<CutterCacheCleanResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/cache/clean"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify(request)
        }
      );
    },

    getLocalClipIntegrity() {
      return requestEnvelope<CutterLocalClipIntegrity>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/local-clips/integrity"),
        {
          headers: protectedHeaders
        }
      );
    },

    cleanLocalClips(request) {
      return requestEnvelope<CutterLocalClipCleanResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/local-clips/clean"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify(request)
        }
      );
    },

    getWorkspaceResidue() {
      return requestEnvelope<CutterWorkspaceResidue>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/workspace/residue"),
        { headers: protectedHeaders }
      );
    },

    cleanWorkspaceResidue(request) {
      return requestEnvelope<CutterWorkspaceResidueCleanResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/workspace/residue/clean"),
        { method: "POST", headers: jsonHeaders(input.auth), body: JSON.stringify(request) }
      );
    },

    getReleaseCachePins() {
      return requestEnvelope<CutterReleaseCachePins>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/release-cache/pins"),
        { headers: protectedHeaders }
      );
    },

    evictReleaseCache(request) {
      return requestEnvelope<CutterReleaseCacheEvictResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/release-cache/evict"),
        { method: "POST", headers: jsonHeaders(input.auth), body: JSON.stringify(request) }
      );
    },

    listSourceLibrary(options) {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set("limit", String(options.limit));
      }
      if (options?.offset) {
        params.set("offset", String(options.offset));
      }
      if (options?.sourceFolderName) {
        params.set("source_folder_name", options.sourceFolderName);
      }
      if (options?.filenameQuery) {
        params.set("filename_query", options.filenameQuery);
      }
      if (options?.folderQuery) {
        params.set("folder_query", options.folderQuery);
      }
      const query = params.toString();
      return requestEnvelope<SourceLibraryResponse>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/source-library${query ? `?${query}` : ""}`),
        {
          headers: protectedHeaders
        }
      );
    },

    listSourceFolders() {
      return requestEnvelope<SourceFolderResponse>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/source-folders"),
        {
          headers: protectedHeaders
        }
      );
    },

    getSourceVideoDetail(sourceVideoId: string) {
      return requestEnvelope<SourceVideoDetail>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/source-videos/${encodeURIComponent(sourceVideoId)}`),
        {
          headers: protectedHeaders
        }
      );
    },

    searchSourceLibrary(query: string, limit = 20, options = {}) {
      const params = new URLSearchParams({
        query,
        limit: String(limit)
      });
      if (options.cursor) {
        params.set("cursor", options.cursor);
      }
      if (options.sourceFolderName) {
        params.set("source_folder_name", options.sourceFolderName);
      }
      if (options.folderQuery) {
        params.set("folder_query", options.folderQuery);
      }
      return requestEnvelope<SearchResponse>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/source-search?${params.toString()}`),
        {
          headers: protectedHeaders
        }
      );
    },

    listLocalClips(options) {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set("limit", String(options.limit));
      }
      if (options?.offset) {
        params.set("offset", String(options.offset));
      }
      const query = params.toString();
      return requestEnvelope<LocalClipCatalog>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/local-clips${query ? `?${query}` : ""}`),
        {
          headers: protectedHeaders
        }
      );
    },

    getLocalClipDetail(localClipId: string) {
      return requestEnvelope<LocalClip>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/local-clips/${encodeURIComponent(localClipId)}`),
        {
          headers: protectedHeaders
        }
      );
    },

    deleteLocalClip(localClipId: string) {
      return requestEnvelope<{ local_clip_id: string; deleted: boolean }>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/local-clips/${encodeURIComponent(localClipId)}`),
        {
          method: "DELETE",
          headers: protectedHeaders
        }
      );
    },

    createLocalClip(request: CreateLocalClipRequest) {
      return requestEnvelope<LocalClip>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/local-clips"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify({
            source_video_id: request.source_video_id,
            start_segment_id: request.start_segment_id,
            end_segment_id: request.end_segment_id,
            ...(typeof request.begin_ms === "number" ? { begin_ms: request.begin_ms } : {}),
            ...(typeof request.end_ms === "number" ? { end_ms: request.end_ms } : {}),
            ...(request.selected_text ? { selected_text: request.selected_text } : {}),
            pre_roll_ms: request.pre_roll_ms ?? 0,
            post_roll_ms: request.post_roll_ms ?? 0,
            cut_mode: request.cut_mode ?? "copy",
            ...(request.title ? { title: request.title } : {})
          })
        }
      );
    },

    createClipList(request: CreateClipListRequest) {
      return requestEnvelope<ClipList>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/clip-lists"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify({
            library_id: request.library_id,
            ...(request.project_id ? { project_id: request.project_id } : {}),
            title: request.title,
            items: request.items
          })
        }
      );
    },

    submitCutJobs(request: SubmitCutJobsRequest) {
      return requestEnvelope<CutJobSubmission>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/cut-jobs"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify({
            clip_list_id: request.clip_list_id
          })
        }
      );
    },

    listCutJobs(options) {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set("limit", String(options.limit));
      }
      if (options?.offset) {
        params.set("offset", String(options.offset));
      }
      const query = params.toString();
      return requestEnvelope<CutJobCatalog>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/cut-jobs${query ? `?${query}` : ""}`),
        {
          headers: protectedHeaders
        }
      );
    },

    runNextCutJob() {
      return requestEnvelope<CutJob | null>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/cut-jobs/run-next"),
        {
          method: "POST",
          headers: protectedHeaders
        }
      );
    },

    retryCutJob(cutJobId: string) {
      return requestEnvelope<CutJob>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/cut-jobs/${encodeURIComponent(cutJobId)}/retry`),
        {
          method: "POST",
          headers: protectedHeaders
        }
      );
    },

    cancelCutJob(cutJobId: string) {
      return requestEnvelope<CutJob>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/cut-jobs/${encodeURIComponent(cutJobId)}/cancel`),
        {
          method: "POST",
          headers: protectedHeaders
        }
      );
    },

    openCutOutputDirectory(request = {}) {
      return requestEnvelope<OpenCutOutputDirectoryResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/workspace/open-export-directory"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify(request)
        }
      );
    },

    openSourceVideoDirectory(request: OpenSourceVideoDirectoryRequest) {
      return requestEnvelope<OpenCutOutputDirectoryResult>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/source-videos/open-directory"),
        {
          method: "POST",
          headers: jsonHeaders(input.auth),
          body: JSON.stringify(request)
        }
      );
    },

    deleteProjectOutputs(projectId: string) {
      return requestEnvelope<DeleteProjectOutputsResult>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/projects/${encodeURIComponent(projectId)}/outputs`),
        {
          method: "DELETE",
          headers: protectedHeaders
        }
      );
    },

    resolveApiUrl(pathOrUrl: string) {
      if (/^(?:https?:\/\/|data:|blob:)/.test(pathOrUrl)) {
        return pathOrUrl;
      }

      return appendPath(input.base_url, pathOrUrl);
    }
  };
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
