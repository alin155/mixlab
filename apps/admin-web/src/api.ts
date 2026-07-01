import type {
  MixlabDoctorExport,
  MixlabDoctorReport
} from "../../../packages/doctor-core/src/index.ts";
import {
  adminAuthHeaders,
  getJson,
  listQuery,
  sendJson
} from "./admin-http.ts";
import { createAdminAuthClientMethods } from "./admin-auth-client.ts";
import {
  ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT,
  ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT,
  createAdminOperationsClientMethods
} from "./admin-operations-client.ts";
import { createAdminSourceVideoClientMethods } from "./admin-source-video-client.ts";
import { createAdminFixtureDataLoadingPlan } from "./fixtures/admin-data-loading-plan.ts";
import {
  adminSourceVideoMatchesOptions,
  cloneCutterUser,
  cloneDashboardMetrics,
  cloneDataLoadingPlan,
  clonePreprocessProcessHistory,
  cloneRuntimeSettings,
  cloneSettings,
  cutterUsers,
  dashboardMetrics,
  doctor,
  fixtureCommandSnapshotRestorePlan,
  fixtureCommandSnapshotRestoreResult,
  fixtureOperationLog,
  fixtureOperationsOverview,
  fixtureReadModelReconcileStatus,
  indexes,
  jobs,
  nextSourceFolderId,
  normalizeFixtureSourceFolder,
  pathChecks,
  publishFixtureSourceVideos,
  processHistory,
  queueFixtureSourceVideos,
  recountFixtureSourceVideoState,
  runtime,
  settings,
  makeSourceVideoDetail,
  sourceVideos,
  status,
  updateFixtureSourceVideoCover,
  updateFixtureSourceVideoMetadata
} from "./fixtures/admin-fixture-data.ts";

export { unwrapAdminResponse } from "./admin-http.ts";
export { resolveMediaUrl } from "./admin-source-video-media.ts";

export type AdminApiEnvelope<T> =
  | {
      ok: true;
      data: T;
      meta?: AdminApiResponseMeta;
    }
  | {
      ok: false;
      error_code: string;
      message: string;
      details?: Record<string, unknown>;
    };

export type AdminPreprocessStatus =
  | "unprocessed"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "index-required";

export interface AdminLibraryStatus {
  library_id: string;
  name: string;
  root_path: string;
  source_videos_path: string;
  mixlab_library_path: string;
  protocol_version: string;
  video_count: number;
  ready_video_count: number;
  processing_video_count: number;
  queued_video_count: number;
  unprocessed_video_count: number;
  failed_video_count: number;
  index_required_video_count: number;
  disk_total_bytes: number;
  disk_available_bytes: number;
  index_status: "ready" | "building" | "needs-publish" | "error";
  current_index_version: string;
  active_task_label: string;
  updated_at: string;
}

export interface AdminPathCheck {
  label: string;
  path: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface AdminSourceVideo {
  source_video_id: string;
  title: string;
  file_name: string;
  relative_path: string;
  cover_url: string;
  duration_ms: number;
  file_size: number;
  preprocess_status: AdminPreprocessStatus;
  visible_to_cutters: boolean;
  tags: string[];
  description: string;
  lecturer: string;
  course: string;
  category: string;
  error_stage?: string;
  error_message?: string;
  updated_at: string;
}

export interface AdminSourceVideoCoverUpdate {
  image_base64: string;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  file_name?: string;
}

export interface AdminSourceVideoListOptions {
  limit?: number;
  offset?: number;
  query?: string;
  status?: AdminPreprocessStatus | "all";
  manifest_fallback?: AdminSourceVideoManifestFallbackPolicy;
}

export type AdminSourceVideoManifestFallbackPolicy = "allow" | "forbid";

export interface AdminPreprocessJob {
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
  log_url?: string;
  retryable: boolean;
  error_message?: string;
}

export interface AdminPreprocessJobLog {
  job_id: string;
  source_video_id: string;
  path: string;
  file_path: string;
  exists: boolean;
  content: string;
  record_source?: "file" | "preprocess-job" | "source-video";
}

export interface AdminPreprocessSupervisorStatus {
  state: "idle" | "running" | "stopping" | "failed";
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

export interface AdminPreprocessJobsResponse {
  active_count: number;
  queued_count: number;
  completed_count: number;
  failed_count: number;
  supervisor: AdminPreprocessSupervisorStatus;
  observability: {
    running_job_id: string;
    running_source_video_id: string;
    pipeline_progress_percent: number;
    estimated_all_done_at: string;
    estimated_queue_duration_ms: number;
    throughput_label: string;
    load_advice: string;
  };
  jobs: AdminPreprocessJob[];
  runtime?: AdminRuntimeEndpointMeta;
}

export type AdminPreprocessProcessHistoryEvent =
  | "failed"
  | "indexed"
  | "completed"
  | "claimed"
  | "status";

export interface AdminPreprocessProcessHistoryItem {
  source_video_id: string;
  title: string;
  preprocess_status: AdminPreprocessStatus;
  source_folder_name: string;
  visible_to_cutters: boolean;
  claimed_at: string;
  completed_at: string;
  indexed_at: string;
  failed_at: string;
  last_event_at: string;
  last_event_type: AdminPreprocessProcessHistoryEvent;
  elapsed_ms: number;
}

export interface AdminPreprocessProcessHistorySummary {
  returned_count: number;
  completed_count: number;
  failed_count: number;
  active_count: number;
  average_process_ms: number;
  tracked_count: number;
  tracked_completed_count: number;
  tracked_failed_count: number;
  tracked_active_count: number;
  tracked_average_process_ms: number;
  window_start_at: string;
  newest_event_at: string;
  oldest_event_at: string;
  status_counts: Record<AdminPreprocessStatus, number>;
  event_counts: Record<AdminPreprocessProcessHistoryEvent, number>;
  source_folder_summaries: AdminPreprocessProcessHistorySourceFolderSummary[];
  daily_trend: AdminPreprocessProcessHistoryTrendBucket[];
}

export interface AdminPreprocessProcessHistoryFilters {
  source_folder_name: string;
  preprocess_status: AdminPreprocessStatus | "";
  event_type: AdminPreprocessProcessHistoryEvent | "";
}

export interface AdminPreprocessProcessHistoryFilterOptions {
  source_folder_names: string[];
  preprocess_statuses: AdminPreprocessStatus[];
  event_types: AdminPreprocessProcessHistoryEvent[];
}

export interface AdminPreprocessProcessHistorySourceFolderSummary {
  source_folder_name: string;
  tracked_count: number;
  completed_count: number;
  failed_count: number;
  active_count: number;
  average_process_ms: number;
  newest_event_at: string;
}

export interface AdminPreprocessProcessHistoryTrendBucket {
  date: string;
  tracked_count: number;
  completed_count: number;
  failed_count: number;
  active_count: number;
  average_process_ms: number;
}

export interface AdminPreprocessProcessHistoryResponse {
  schema_version: "1.0";
  generated_at: string;
  library_updated_at?: string;
  data_source: "admin-read-model";
  actual_data_source: "admin-read-model";
  cache_status: AdminRuntimeCacheStatus;
  scan_mode: "no-scan";
  scan_reason: "route-owned-page";
  history_available: boolean;
  window_days: number;
  limit: number;
  filters: AdminPreprocessProcessHistoryFilters;
  filter_options: AdminPreprocessProcessHistoryFilterOptions;
  summary: AdminPreprocessProcessHistorySummary;
  items: AdminPreprocessProcessHistoryItem[];
}

export interface AdminPreprocessProcessHistoryOptions {
  limit?: number;
  window_days?: number;
  source_folder_name?: string;
  preprocess_status?: AdminPreprocessStatus | "all" | "";
  event_type?: AdminPreprocessProcessHistoryEvent | "all" | "";
}

export interface AdminIndexVersion {
  index_version: string;
  created_at: string;
  ready_video_count: number;
  schema_version: string;
  validation_status: "pass" | "warn" | "fail";
  validation_message: string;
  is_current: boolean;
  published_by: string;
}

export interface AdminIndexVersionsResponse {
  current_version: string;
  current_validation_status: "pass" | "warn" | "fail";
  current_validation_message: string;
  total_count?: number;
  returned_count?: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
  versions: AdminIndexVersion[];
  runtime?: AdminRuntimeEndpointMeta;
}

export interface AdminRuntimeSettings {
  ffmpeg: {
    available: boolean;
    source: "bundled" | "custom" | "path" | "missing";
    version: string;
    last_error: string;
  };
  ffprobe: {
    available: boolean;
    source: "bundled" | "custom" | "path" | "missing";
    version: string;
    last_error: string;
  };
  asr: {
    provider: "dashscope";
    provider_label: string;
    model: string;
    audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
    dashscope_api_key_configured: boolean;
    language_hints: string[];
    speaker_diarization_enabled: boolean;
    object_storage_mode: "dashscope-temporary";
    last_failure_reason: string;
  };
}

export interface AdminSourceFolder {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  last_scanned_at?: string;
  discovered_video_count?: number;
  new_unprocessed_count?: number;
}

export interface AdminSettingsConfig {
  schema_version: "1.0";
  library_name: string;
  source_folders: AdminSourceFolder[];
  artifact_library: {
    mode: "default" | "custom";
    path: string;
    migration_required: boolean;
  };
  runtime_policy: {
    audio_mode: "mp3_16k_mono_64k" | "wav_16k_mono_pcm_s16le";
    concurrent_jobs: number;
    auto_scan_enabled: boolean;
    auto_queue_enabled: boolean;
    auto_publish_index_enabled: boolean;
  };
  updated_at: string;
}

export interface AdminAsrSecretUpdate {
  dashscope_api_key?: string;
}

export type AdminSettingsConfigUpdate = Pick<
  AdminSettingsConfig,
  "library_name" | "source_folders" | "runtime_policy"
> & {
  asr?: AdminAsrSecretUpdate;
};
export type AdminSourceFolderCreate = Omit<AdminSourceFolder, "id">;
export type AdminSourceFolderUpdate = Partial<Pick<AdminSourceFolder, "name" | "path" | "enabled">>;

export interface UserUsageMetrics {
  user_id: string;
  username: string;
  search_request_count: number;
  search_failure_count: number;
  add_to_cut_list_count: number;
  transcript_selection_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  local_clip_count: number;
  reuse_local_clip_count: number;
  last_used_at: string;
}

export interface UsageEventStoreMetrics {
  line_count: number;
  valid_line_count: number;
  malformed_line_count: number;
  malformed_lines: number[];
  warning: string;
}

export interface UsageMetrics {
  search_request_count: number;
  search_hit_count: number;
  search_empty_count: number;
  search_failure_count: number;
  search_latency_p50_ms: number;
  search_latency_p95_ms: number;
  search_latency_max_ms: number;
  searchd_search_count: number;
  sqlite_index_search_count: number;
  fallback_search_count: number;
  search_backend_unknown_count: number;
  core_search_request_count: number;
  core_search_failure_count: number;
  core_search_latency_p50_ms: number;
  core_search_latency_p95_ms: number;
  core_search_latency_max_ms: number;
  core_searchd_search_count: number;
  core_sqlite_index_search_count: number;
  core_fallback_search_count: number;
  core_search_backend_unknown_count: number;
  source_detail_view_count: number;
  transcript_selection_count: number;
  add_to_cut_list_count: number;
  cut_submission_count: number;
  cut_success_count: number;
  cut_failure_count: number;
  local_clip_count: number;
  reuse_local_clip_count: number;
  active_user_count: number;
  recent_keywords: string[];
  most_used_source_video_ids: string[];
  users: UserUsageMetrics[];
  event_store: UsageEventStoreMetrics;
}

export interface AdminDashboardMetrics {
  material: {
    video_count: number;
    ready_video_count: number;
    total_duration_ms: number;
    ready_duration_ms: number;
    unprocessed_duration_ms: number;
    total_size_bytes: number;
  };
  transcript: {
    transcript_video_count: number;
    character_count: number;
    segment_count: number;
    current_index_version: string;
  };
  production: {
    completed_today_count: number;
    failed_today_count: number;
    average_video_process_ms: number;
    estimated_queue_done_at: string;
  };
  usage: UsageMetrics;
  risk: {
    failed_video_count: number;
    index_required_video_count: number;
  };
  runtime_load: AdminRuntimeLoadMetrics;
  sources: AdminDashboardMetricsSources;
}

export type AdminRuntimeLoadStatus = "healthy" | "attention" | "blocked";

export interface AdminRuntimeLoadMetrics {
  overall_status: AdminRuntimeLoadStatus;
  cpu: {
    usage_percent: number;
    load_average_1m: number;
    status: AdminRuntimeLoadStatus;
    label: string;
  };
  memory: {
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    usage_percent: number;
    status: AdminRuntimeLoadStatus;
    label: string;
  };
  disk: {
    total_bytes: number;
    available_bytes: number;
    usage_percent: number;
    status: AdminRuntimeLoadStatus;
    label: string;
  };
  network: {
    active_interface_count: number;
    status: AdminRuntimeLoadStatus;
    label: string;
  };
  service: {
    uptime_seconds: number;
    heartbeat_at: string;
    status: AdminRuntimeLoadStatus;
    label: string;
  };
}

export interface AdminArtifactDetail {
  path: string;
  file_path: string;
  exists: boolean;
}

export interface AdminSourceVideoDetail {
  source_video: AdminSourceVideo;
  technical: {
    duration_ms: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    file_size: number;
    content_hash: string;
    relative_path: string;
  };
  visibility: {
    visible_to_cutters: boolean;
    label: string;
    reason: string;
  };
  preprocess: {
    status: AdminPreprocessStatus;
    job_id: string;
    stage: string;
    attempt: number;
    started_at: string;
    completed_at: string;
    failed_at: string;
    error_stage: string;
    error_message: string;
  };
  artifacts: {
    transcript: AdminArtifactDetail;
    subtitles: AdminArtifactDetail;
    cover: AdminArtifactDetail;
    keyframes: AdminArtifactDetail;
    index_version: string;
  };
  transcript: {
    full_text: string;
    segment_count: number;
    character_count: number;
  };
}

export interface AdminCutterDevice {
  device_id: string;
  device_name: string;
  status: "active" | "disabled";
  first_seen_at: string;
  last_login_at: string;
  last_ip_address?: string;
  user_agent?: string;
}

export interface AdminCutterUser {
  user_id: string;
  username: string;
  display_name: string;
  status: "pending" | "approved" | "rejected" | "disabled";
  applied_at: string;
  approved_at: string;
  rejected_at: string;
  disabled_at: string;
  last_login_at: string;
  last_used_at: string;
  note: string;
  devices: AdminCutterDevice[];
}

export interface AdminCutterUsersResponse {
  users: AdminCutterUser[];
}

export interface AdminCutterUserApprovalResult {
  status: "approved";
  user: AdminCutterUser;
  session: {
    user_id: string;
    device_id: string;
    created_at: string;
    last_seen_at: string;
  };
}

export interface AdminAuthBootstrapStatus {
  has_admin: boolean;
  registration_open: boolean;
}

export interface AdminPublicUser {
  admin_id: string;
  username: string;
  display_name: string;
  role: "owner" | "admin";
  status: "active" | "disabled";
  created_at: string;
  last_login_at: string;
  disabled_at: string;
}

export interface AdminAuthSession {
  admin_id: string;
  session_token: string;
  created_at: string;
  last_seen_at: string;
}

export interface AdminAuthResult {
  user: AdminPublicUser;
  session: AdminAuthSession;
}

export interface AdminAuthStatus {
  authenticated: boolean;
  auth_mode: "password" | "disabled";
  user: AdminPublicUser | null;
  bootstrap: AdminAuthBootstrapStatus;
  message?: string;
}

export interface AdminActionResult {
  affected_count?: number;
  source_video_ids?: string[];
  new_video_count?: number;
  existing_video_count?: number;
  prepared_source_video_ids?: string[];
  published_source_video_ids?: string[];
  skipped_source_video_ids?: string[];
  published_count?: number;
  skipped_count?: number;
  ready_video_count?: number;
  remaining_index_required_count?: number;
  passed?: boolean;
  message?: string;
}

export type AdminDataLoadPhase = "shell" | "route" | "background" | "command";
export type AdminDataLoadCost = "cheap" | "bounded" | "expensive";
export type AdminDataLoadScanMode =
  | "no-scan"
  | "single-id"
  | "paged-list"
  | "folder-scan"
  | "status-scan"
  | "full-reconcile";
export type AdminScanDataSource =
  | "admin-settings"
  | "admin-read-model"
  | "command-snapshot"
  | "current-index"
  | "data-loading-contract"
  | "doctor-probes"
  | "index-version-packages"
  | "library-manifest"
  | "operation-log"
  | "path-checks"
  | "read-model-reconcile"
  | "runtime-telemetry"
  | "runtime-secrets"
  | "source-folders"
  | "source-video-manifest"
  | "supervisor-runtime"
  | "transcript-artifacts"
  | "usage-events"
  | "user-store";
export type AdminScanReason =
  | "background-metrics"
  | "doctor-route"
  | "explicit-reconcile-cancel"
  | "explicit-read-model-reconcile"
  | "explicit-scan-apply"
  | "explicit-scan-preview"
  | "index-version-page"
  | "operation-log-tail"
  | "read-model-health"
  | "route-owned-page"
  | "selected-record"
  | "settings-route"
  | "shell-contract"
  | "shell-summary"
  | "user-management-route";

export type AdminRuntimeCacheStatus =
  | "hit"
  | "miss"
  | "pending"
  | "not-applicable"
  | "unknown";

export interface AdminRuntimeEndpointMeta {
  schema_version: "1.0";
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  duration_ms: number;
  scan_mode: AdminDataLoadScanMode;
  data_source: AdminScanDataSource;
  scan_reason: AdminScanReason;
  actual_data_source: AdminScanDataSource;
  cache_status: AdminRuntimeCacheStatus;
  result_count: number;
  offset: number;
  limit: number;
  slow: boolean;
  slow_reason: string;
  fallback_reason?: string;
  repair_reason?: string;
  components?: AdminRuntimeComponentTiming[];
}

export interface AdminRuntimeComponentTiming {
  name: string;
  duration_ms: number;
  data_source?: AdminScanDataSource;
  scan_mode?: AdminDataLoadScanMode;
  scan_reason?: AdminScanReason;
  cache_status?: AdminRuntimeCacheStatus;
  detail?: string;
}

export interface AdminDashboardMetricSource {
  data_source: AdminScanDataSource;
  scan_mode: AdminDataLoadScanMode;
  scan_reason: AdminScanReason;
}

export interface AdminDashboardMetricsSources {
  material: AdminDashboardMetricSource;
  transcript: AdminDashboardMetricSource;
  production: AdminDashboardMetricSource;
  usage: AdminDashboardMetricSource;
  risk: AdminDashboardMetricSource;
  runtime_load: AdminDashboardMetricSource;
}

export interface AdminApiResponseMeta {
  runtime: AdminRuntimeEndpointMeta;
}

export interface AdminRuntimeDiagnosticsHistoryEntry {
  schema_version: "1.0";
  recorded_at: string;
  runtime: AdminRuntimeEndpointMeta;
}

export interface AdminRuntimeDiagnosticsHistoryResponse {
  schema_version: "1.0";
  generated_at: string;
  path: string;
  entries: AdminRuntimeDiagnosticsHistoryEntry[];
  limit: number;
  total_line_count: number;
  malformed_line_count: number;
  truncated: boolean;
}

export interface AdminRuntimeDiagnosticsHistoryOptions {
  limit?: number;
}

export interface AdminSourceVideoListResult {
  source_videos: AdminSourceVideo[];
  runtime?: AdminRuntimeEndpointMeta;
}

export interface AdminDataLoadingEndpointPlan {
  endpoint: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  phase: AdminDataLoadPhase;
  cost: AdminDataLoadCost;
  scan_mode: AdminDataLoadScanMode;
  data_source: AdminScanDataSource;
  scan_reason: AdminScanReason;
  critical: boolean;
  default_limit?: number;
  cache_ttl_ms?: number;
  read_model?: string;
  timeout_ms: number;
  refresh: "manual" | "interval" | "route-entry" | "command-only";
  notes: string;
}

export interface AdminRouteDataLoadingPlan {
  route: string;
  load_phase: "shell" | "route-entry" | "manual-command";
  prefetch: boolean;
  endpoints: string[];
  fallback: string;
}

export interface AdminDataLoadingPlan {
  schema_version: "1.0";
  generated_at: string;
  strategy: "shell-first-route-owned-v1";
  shell_interactive_target_ms: number;
  route_timeout_ms: number;
  background_prefetch_default: boolean;
  hidden_full_scan_allowed: boolean;
  endpoints: AdminDataLoadingEndpointPlan[];
  routes: AdminRouteDataLoadingPlan[];
}

export type AdminGateStatus = "pass" | "attention" | "blocked";

export interface AdminReleaseGate {
  code: string;
  status: AdminGateStatus;
  message: string;
  details: Record<string, unknown>;
}

export interface AdminPreprocessSafetyStatus {
  checked_at: string;
  safe_to_start: boolean;
  status: "healthy" | "attention" | "blocked";
  disk: {
    total_bytes: number;
    available_bytes: number;
    used_bytes: number;
    usage_percent: number;
    block_usage_percent: number;
    status: "healthy" | "attention" | "blocked";
    last_error: string;
  };
  processing: {
    checked: boolean;
    processing_count: number;
    source_video_ids: string[];
  };
  blockers: Array<{
    code: string;
    message: string;
    source_video_ids: string[];
  }>;
}

export interface AdminProtectionStatus {
  checked_at: string;
  mode: "preprocess-protection-v1";
  ready_video_count: number;
  processing_video_count: number;
  queued_video_count: number;
  index_required_video_count: number;
  current_index_version: string;
  scan_apply_requires_preview: boolean;
  ready_asset_policy: {
    immutable_status: "ready";
    allowed_ready_mutations: string[];
    blocked_ready_mutations: string[];
  };
  scan_preview_endpoint: string;
  release_gates_endpoint: string;
}

export interface AdminUsageEventStoreHealth {
  line_count: number;
  valid_line_count: number;
  malformed_line_count: number;
  malformed_lines: number[];
  warning: string;
}

export interface AdminUsageEventsRepairReadiness {
  repair_required: boolean;
  status: "clean" | "dry-run-required";
  events_path: string;
  projection_path: string;
  dry_run_command: string;
  apply_command: string;
  artifacts_pattern: string;
  backup_directory: string;
  quarantine_directory: string;
  safe_scope: "usage-events-only";
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminProcessingRecoveryReadiness {
  recovery_required: boolean;
  status: "clear" | "preflight-required";
  processing_count: number;
  source_video_ids: string[];
  sample_truncated: boolean;
  preflight_endpoints: string[];
  bulk_recovery_endpoint: string;
  single_recovery_endpoints: string[];
  supervisor_must_be_idle: true;
  safe_scope: "processing-to-queued-only";
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminDiskSpaceProtectionReadiness {
  status: "healthy" | "attention" | "blocked";
  safe_to_preprocess: boolean;
  preprocess_write_blocked: boolean;
  release_blocked: boolean;
  library_root: string;
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  usage_percent: number;
  block_usage_percent: number;
  attention_usage_percent: number;
  last_error: string;
  threshold_env_var: "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT";
  write_block_scope: "preprocess-and-docker-upload";
  preflight_endpoints: string[];
  starts_workers: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminVersionHealthParityReadiness {
  status: "ready" | "incomplete";
  metadata_complete: boolean;
  build_sha: string;
  build_version: string;
  image_tag: string;
  expected_services: Array<"admin-web" | "admin-api" | "admin-worker">;
  health_preflight_endpoints: string[];
  live_probe_command: string;
  external_proof_required: string[];
  static_compose_gate: "image-tag-static-parity";
  safe_scope: "version-health-only";
  starts_workers: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminWorkerEnvProofReadiness {
  proof_required: true;
  status: "external-proof-required";
  expected_service: "admin-worker";
  required_env_flags: {
    MIXLAB_ADMIN_DOCKER_MVP_MODE: "off";
    MIXLAB_ENABLE_LIBRARY_PREPROCESS_WORKER: "0";
    MIXLAB_ENABLE_READY_PUBLISH_WORKER: "0";
  };
  required_library_roots: {
    MIXLAB_ADMIN_LIBRARY_ROOT: "/data/PublicLibrary";
    MIXLAB_PREPROCESS_LIBRARY_ROOT: "/data/PublicLibrary";
  };
  env_file_name: "admin-worker.env";
  inspect_json_name: "admin-worker.inspect.json";
  env_file_variable: "MIXLAB_ADMIN_WORKER_ENV_FILE";
  inspect_json_variable: "MIXLAB_ADMIN_WORKER_INSPECT_JSON";
  proof_command: "npx tsx scripts/acceptance/admin-worker-env-proof.ts";
  collection_commands: string[];
  artifacts_pattern: "docs/acceptance/artifacts/admin-worker-env-proof-*.{json,md}";
  safe_scope: "admin-worker-env-only";
  starts_workers: false;
  records_secrets: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminCutterCompatibilityProofReadiness {
  proof_required: true;
  status: "external-proof-required";
  expected_ready_count: number;
  expected_auth_mode: "reviewed";
  required_reports: {
    windows_acceptance_env_var: "MIXLAB_CUTTER_WINDOWS_ACCEPTANCE_REPORT";
    real_cut_env_var: "MIXLAB_CUTTER_REAL_CUT_REPORT";
    optional_desktop_screenshot_env_var: "MIXLAB_CUTTER_DESKTOP_SCREENSHOT_REPORT";
    expected_ready_count_env_var: "MIXLAB_CUTTER_EXPECTED_READY_COUNT";
    expected_release_version_env_var: "MIXLAB_CUTTER_EXPECTED_RELEASE_VERSION";
  };
  required_evidence: string[];
  proof_command: "npx tsx scripts/acceptance/admin-cutter-compatibility-proof.ts";
  artifacts_pattern: "docs/acceptance/artifacts/admin-cutter-compatibility-proof-*.{json,md}";
  safe_scope: "cutter-compatibility-only";
  requires_staged_candidate: true;
  contacts_windows_runner: false;
  contacts_docker: false;
  starts_workers: false;
  mutates_ready_assets: false;
  mutates_cutter_protocol: false;
  notes: string[];
}

export interface AdminReleaseGatesResponse {
  checked_at: string;
  overall_status: AdminGateStatus;
  release_allowed: boolean;
  gates: AdminReleaseGate[];
  build: Record<string, unknown>;
  runtime: Record<string, unknown>;
  safety: AdminPreprocessSafetyStatus;
  usage_event_store: AdminUsageEventStoreHealth;
  usage_events_repair: AdminUsageEventsRepairReadiness;
  processing_recovery: AdminProcessingRecoveryReadiness;
  disk_space_protection: AdminDiskSpaceProtectionReadiness;
  version_health_parity: AdminVersionHealthParityReadiness;
  admin_worker_env_proof: AdminWorkerEnvProofReadiness;
  cutter_compatibility_proof: AdminCutterCompatibilityProofReadiness;
}

export interface AdminSourceVideoStatusReadModelOverview {
  name: string;
  storage: "persistent-json";
  path: string;
  freshness: "fresh" | "building" | "stale" | "missing";
  memory_cache: "fresh" | "building" | "stale" | "missing";
  persisted: "fresh" | "stale" | "missing";
  generated_at: string;
  library_updated_at: string;
  current_library_updated_at: string;
  video_count: number;
  current_video_count: number;
  counts_by_status: Record<AdminPreprocessStatus, number>;
  cache_ttl_ms: number;
}

export interface AdminReadModelStoreOverview {
  schema_version: "1.0";
  storage: "sqlite";
  path: string;
  freshness: "fresh" | "stale" | "missing" | "unreadable";
  exists: boolean;
  generated_at: string;
  library_updated_at: string;
  current_library_updated_at: string;
  video_count: number;
  current_video_count: number;
  counts_by_status: Record<AdminPreprocessStatus, number>;
  invalidated_at: string;
  invalidation_reason: string;
  last_error: string;
  reconciliation: {
    store_path: string;
    action: "none" | "build" | "rebuild" | "manual-review";
    reason: "fresh" | "missing_library" | "missing_store" | "stale_store" | "unreadable_store";
    scan_mode: "no-scan" | "full-reconcile";
    requires_background_reconcile: boolean;
    safe_for_page_request: boolean;
  };
}

export interface AdminReadModelStatus {
  schema_version: "1.0";
  generated_at: string;
  admin_read_model: AdminReadModelStoreOverview;
  source_video_status: AdminSourceVideoStatusReadModelOverview;
}

export type AdminReadModelReconcilerRunStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "skipped"
  | "cancelled"
  | "failed";

export type AdminReadModelReconcilerPhase =
  | "idle"
  | "starting"
  | "scanning"
  | "writing"
  | "completed"
  | "cancelled"
  | "failed";

export type AdminReadModelReconcilerProgressStep =
  | "idle"
  | "starting"
  | "library-manifest"
  | "source-video-manifests"
  | "preprocess-job-snapshots"
  | "writing"
  | "completed"
  | "cancelled"
  | "failed";

export interface AdminReadModelReconcilerProgress {
  scanned_source_video_count: number;
  total_source_video_count: number;
  preprocess_job_snapshot_count: number;
  total_preprocess_job_snapshot_count: number;
  current_step: AdminReadModelReconcilerProgressStep;
  step_completed_count: number;
  step_total_count: number;
  step_percent: number;
  percent: number;
  message: string;
}

export interface AdminReadModelReconcilerEvent {
  at: string;
  event_type:
    | "started"
    | "progress"
    | "cancel-requested"
    | "cancelled"
    | "succeeded"
    | "skipped"
    | "failed";
  phase: AdminReadModelReconcilerPhase;
  message: string;
  scanned_source_video_count: number;
  total_source_video_count: number;
  preprocess_job_snapshot_count: number;
  total_preprocess_job_snapshot_count: number;
  current_step: AdminReadModelReconcilerProgressStep;
  step_completed_count: number;
  step_total_count: number;
  step_percent: number;
}

export interface AdminReadModelReconcilerStatus {
  schema_version: "1.0";
  command: "read-model-reconcile";
  status: AdminReadModelReconcilerRunStatus;
  phase: AdminReadModelReconcilerPhase;
  scan_mode: "full-reconcile";
  cancel_requested: boolean;
  started_at: string;
  finished_at: string;
  snapshot_video_count: number;
  progress: AdminReadModelReconcilerProgress;
  events: AdminReadModelReconcilerEvent[];
  message: string;
  result: Record<string, unknown> | null;
  error_code: string;
  error_message: string;
}

export interface AdminReadModelReconcilerStartResult {
  accepted: boolean;
  status: AdminReadModelReconcilerStatus;
}

export interface AdminReadModelReconcilerCancelResult {
  accepted: boolean;
  status: AdminReadModelReconcilerStatus;
}

export interface AdminOperationsOverview {
  schema_version: "1.0";
  generated_at: string;
  title: string;
  summary: {
    overall_status: AdminGateStatus;
    release_allowed: boolean;
    blocked_gate_count: number;
    attention_gate_count: number;
    ready_video_count: number;
    queued_video_count: number;
    processing_video_count: number;
    index_required_video_count: number;
    current_index_version: string;
  };
  next_actions: Array<{
    key: string;
    label: string;
    detail: string;
    route: string;
  }>;
  protection: AdminProtectionStatus;
  release: AdminReleaseGatesResponse;
  read_model: AdminReadModelStatus;
  data_loading: AdminDataLoadingPlan;
}

export interface AdminOperationLogEvent {
  schema_version: "1.0";
  event_id: string;
  occurred_at: string;
  area: "read-model" | "protection" | "preprocess" | "release" | "settings" | "users" | "system";
  action: string;
  event_type: "started" | "progress" | "cancel-requested" | "cancelled" | "succeeded" | "skipped" | "failed";
  message: string;
  details: Record<string, unknown>;
}

export interface AdminCommandActor {
  kind: "admin-user" | "system" | "unknown";
  source: "admin-session" | "auth-disabled" | "system-task" | "runtime-holder";
  admin_id?: string;
  username?: string;
  display_name?: string;
  role?: string;
  label?: string;
}

export interface AdminOperationLogResponse {
  schema_version: "1.0";
  generated_at: string;
  path: string;
  events: AdminOperationLogEvent[];
  limit: number;
  total_line_count: number;
  malformed_line_count: number;
  truncated: boolean;
}

export type AdminCommandRestorePlanFileStatus = "restorable" | "blocked";
export type AdminCommandRestorePlanTargetStatus = "exists" | "missing" | "not-file" | "unsafe";
export type AdminCommandRestorePlanSnapshotStatus =
  | "exists"
  | "missing"
  | "not-file"
  | "size-mismatch"
  | "unsafe"
  | "not-captured";
export type AdminCommandRestorePlanBlocker =
  | "snapshot_manifest_outside_command_snapshot_root"
  | "snapshot_manifest_missing"
  | "snapshot_manifest_not_file"
  | "snapshot_manifest_invalid_json"
  | "snapshot_manifest_invalid_schema"
  | "snapshot_is_not_file_capture"
  | "snapshot_file_not_captured"
  | "snapshot_file_path_missing"
  | "snapshot_file_path_unsafe"
  | "snapshot_file_missing"
  | "snapshot_file_not_file"
  | "snapshot_file_size_mismatch"
  | "source_path_missing"
  | "source_path_unsafe"
  | "target_is_not_file";

export interface AdminCommandRestorePlanFile {
  label: string;
  can_restore: boolean;
  status: AdminCommandRestorePlanFileStatus;
  source_relative_path?: string;
  snapshot_relative_path?: string;
  target_status: AdminCommandRestorePlanTargetStatus;
  snapshot_status: AdminCommandRestorePlanSnapshotStatus;
  expected_size_bytes?: number;
  snapshot_size_bytes?: number;
  blockers: AdminCommandRestorePlanBlocker[];
}

export interface AdminCommandRestorePlan {
  schema_version: "1.0";
  generated_at: string;
  can_restore: boolean;
  command?: string;
  snapshot_id?: string;
  snapshot_kind?: string;
  snapshot_manifest_relative_path?: string;
  file_count: number;
  restorable_file_count: number;
  blocked_file_count: number;
  blockers: AdminCommandRestorePlanBlocker[];
  files: AdminCommandRestorePlanFile[];
}

export type AdminCommandSnapshotRestoreStatus = "restored" | "blocked";
export type AdminCommandSnapshotRestoreBlocker =
  | AdminCommandRestorePlanBlocker
  | "restore_plan_blocked"
  | "restore_plan_empty"
  | "restore_file_missing_paths"
  | "restore_file_path_unsafe";

export interface AdminCommandSnapshotRestoreFile {
  label: string;
  restored: boolean;
  source_relative_path?: string;
  snapshot_relative_path?: string;
}

export interface AdminCommandSnapshotRestoreResult {
  schema_version: "1.0";
  restored_at: string;
  status: AdminCommandSnapshotRestoreStatus;
  restored_file_count: number;
  blocked_file_count: number;
  blockers: AdminCommandSnapshotRestoreBlocker[];
  plan: AdminCommandRestorePlan;
  files: AdminCommandSnapshotRestoreFile[];
}

export interface AdminSourceVideoMetadataUpdate {
  title?: string;
  description?: string;
  tags?: string[];
  lecturer?: string;
  course?: string;
  category?: string;
}

export interface AdminDashboardData {
  status: AdminLibraryStatus;
  path_checks: AdminPathCheck[];
  settings: AdminSettingsConfig;
  source_videos: AdminSourceVideo[];
  jobs: AdminPreprocessJobsResponse;
  indexes: AdminIndexVersionsResponse;
  doctor: MixlabDoctorReport;
  runtime: AdminRuntimeSettings;
  metrics: AdminDashboardMetrics;
  data_loading_plan: AdminDataLoadingPlan;
}

export interface LoadAdminDashboardDataOptions {
  includeHeavy?: boolean;
}

export type AdminSmartScanAction =
  | "none"
  | "queue-unprocessed"
  | "start-preprocess"
  | "retry-failed"
  | "recover-processing"
  | "publish-index"
  | "run-doctor";

export interface AdminSmartScanSuggestion {
  key: string;
  label: string;
  detail: string;
  action: AdminSmartScanAction;
}

export interface AdminSmartScanReport {
  severity: "healthy" | "attention" | "blocked";
  title: string;
  detail: string;
  primary_action: AdminSmartScanAction;
  primary_label: string;
  suggestions: AdminSmartScanSuggestion[];
}

function smartScanActionLabel(action: AdminSmartScanAction): string {
  const labels: Record<AdminSmartScanAction, string> = {
    none: "无需处理",
    "queue-unprocessed": "加入预处理队列",
    "start-preprocess": "启动预处理",
    "retry-failed": "重试失败视频",
    "recover-processing": "恢复卡住任务",
    "publish-index": "查看待上线素材",
    "run-doctor": "查看系统检查"
  };

  return labels[action];
}

export function createAdminSmartScanReport(data: AdminDashboardData): AdminSmartScanReport {
  const doctorFailureCount = data.doctor.summary.fail;
  const runtimeBlocked = data.metrics.runtime_load.overall_status === "blocked";
  const runtimeAttention = data.metrics.runtime_load.overall_status === "attention";
  const unprocessedCount = data.status.unprocessed_video_count;
  const queuedCount = data.jobs.queued_count;
  const activeCount = data.jobs.active_count;
  const failedCount = data.jobs.failed_count;
  const indexRequiredCount = data.status.index_required_video_count;
  const supervisorRunning = data.jobs.supervisor.state === "running" || data.jobs.supervisor.state === "stopping";

  const suggestions: AdminSmartScanSuggestion[] = [];

  if (runtimeBlocked) {
    suggestions.push({
      key: "runtime-load",
      label: "运行负荷存在阻塞风险，建议降低并发或暂停处理",
      detail: "CPU、内存、磁盘或网络存在阻塞风险，继续启动更多预处理可能导致失败。建议先查看系统检查并调整运行策略。",
      action: "run-doctor"
    });
  } else if (runtimeAttention) {
    suggestions.push({
      key: "runtime-load",
      label: "运行负荷偏高，建议观察或降低并发",
      detail: "系统仍可继续处理，但建议观察 CPU、内存、磁盘和网络状态，必要时降低并发任务数。",
      action: "none"
    });
  }

  if (doctorFailureCount > 0) {
    suggestions.push({
      key: "doctor",
      label: "系统检查存在需处理项",
      detail: `发现 ${doctorFailureCount} 个会影响生产的系统问题，建议先进入系统检查确认。`,
      action: "run-doctor"
    });
  }

  if (failedCount > 0) {
    suggestions.push({
      key: "failed",
      label: "存在失败视频",
      detail: `${failedCount} 个视频失败可重试，单个视频失败不会阻塞其他队列。`,
      action: "retry-failed"
    });
  }

  if (activeCount > 0 && !supervisorRunning) {
    suggestions.push({
      key: "processing-idle",
      label: "存在停滞中的处理任务",
      detail: `${activeCount} 个视频仍标记为处理中，但预处理服务未运行。建议先恢复到队列，再启动流水线。`,
      action: "recover-processing"
    });
  }

  if (queuedCount > 0 && !supervisorRunning) {
    suggestions.push({
      key: "queued-idle",
      label: "队列已准备但服务未运行",
      detail: `${queuedCount} 个视频已排队，启动预处理后会继续提取音频、识别文案、生成产物，并在安全时上线。`,
      action: "start-preprocess"
    });
  }

  if (unprocessedCount > 0) {
    suggestions.push({
      key: "unprocessed",
      label: "存在未处理视频",
      detail: `${unprocessedCount} 个原视频尚未预处理，启动预处理后会扫描素材来源、自动入队并持续生产。`,
      action: "start-preprocess"
    });
  }

  if (indexRequiredCount > 0) {
    suggestions.push({
      key: "index",
      label: "存在已处理待上线素材",
      detail: `${indexRequiredCount} 个视频已经处理完成，点击上线后剪辑端即可搜索和使用。`,
      action: "publish-index"
    });
  }

  if (activeCount > 0 && supervisorRunning) {
    suggestions.push({
      key: "running",
      label: "预处理服务正在运行",
      detail: `${activeCount} 个任务正在处理，建议观察当前阶段、耗时和失败信息。`,
      action: "none"
    });
  }

  const primaryAction: AdminSmartScanAction = runtimeBlocked
    ? "run-doctor"
    : doctorFailureCount > 0
    ? "run-doctor"
    : failedCount > 0
      ? "retry-failed"
      : activeCount > 0 && !supervisorRunning
        ? "recover-processing"
      : queuedCount > 0 && !supervisorRunning
        ? "start-preprocess"
        : indexRequiredCount > 0
          ? "publish-index"
          : unprocessedCount > 0
            ? "start-preprocess"
            : "none";

  const severity: AdminSmartScanReport["severity"] = runtimeBlocked || doctorFailureCount > 0
    ? "blocked"
    : primaryAction === "none"
      ? "healthy"
      : "attention";

  const title = runtimeBlocked
    ? "运行负荷存在阻塞风险"
    : primaryAction === "run-doctor"
      ? `系统检查存在 ${doctorFailureCount} 个需处理项`
    : primaryAction === "retry-failed"
      ? `有 ${failedCount} 个失败视频可重试`
      : primaryAction === "recover-processing"
      ? `${activeCount} 个处理中任务需要恢复`
      : primaryAction === "publish-index"
        ? `有 ${indexRequiredCount} 个已处理素材待上线`
      : primaryAction === "start-preprocess"
        ? queuedCount > 0 && !supervisorRunning
          ? `${queuedCount} 个视频已排队，但预处理服务未运行`
          : unprocessedCount > 0
            ? `发现 ${unprocessedCount} 个视频可进入预处理流水线`
            : "素材处理可继续"
        : supervisorRunning
          ? "预处理服务正在运行"
          : "素材库当前无需处理";

  const detail = primaryAction === "none"
    ? "系统没有发现需要立即执行的生产动作。"
    : suggestions.find((item) => item.action === primaryAction)?.detail ?? "请按建议执行下一步。";

  return {
    severity,
    title,
    detail,
    primary_action: primaryAction,
    primary_label: smartScanActionLabel(primaryAction),
    suggestions
  };
}

export interface AdminApiClient {
  getAuthBootstrap(): Promise<AdminAuthBootstrapStatus>;
  getAuthStatus(): Promise<AdminAuthStatus>;
  registerAdmin(input: { username: string; password: string; display_name?: string }): Promise<AdminAuthResult>;
  loginAdmin(input: { username: string; password: string }): Promise<AdminAuthResult>;
  logoutAdmin(): Promise<{ removed: boolean }>;
  getLibraryStatus(): Promise<AdminLibraryStatus>;
  getDataLoadingPlan(): Promise<AdminDataLoadingPlan>;
  getOperationsOverview(): Promise<AdminOperationsOverview>;
  getReadModelReconcileStatus(): Promise<AdminReadModelReconcilerStatus>;
  startReadModelReconcile(): Promise<AdminReadModelReconcilerStartResult>;
  cancelReadModelReconcile(): Promise<AdminReadModelReconcilerCancelResult>;
  getOperationLog(options?: { limit?: number }): Promise<AdminOperationLogResponse>;
  getCommandSnapshotRestorePlan(snapshotId: string): Promise<AdminCommandRestorePlan>;
  restoreCommandSnapshot(snapshotId: string): Promise<AdminCommandSnapshotRestoreResult>;
  getPathChecks(): Promise<AdminPathCheck[]>;
  getAdminSettings(): Promise<AdminSettingsConfig>;
  saveAdminSettings(settings: AdminSettingsConfigUpdate): Promise<AdminSettingsConfig>;
  addSourceFolder(folder: AdminSourceFolderCreate): Promise<AdminSettingsConfig>;
  updateSourceFolder(sourceFolderId: string, patch: AdminSourceFolderUpdate): Promise<AdminSettingsConfig>;
  removeSourceFolder(sourceFolderId: string): Promise<AdminSettingsConfig>;
  getDashboardMetrics(): Promise<AdminDashboardMetrics>;
  listSourceVideos(options?: AdminSourceVideoListOptions): Promise<AdminSourceVideo[]>;
  listSourceVideosReadOnly(options?: AdminSourceVideoListOptions): Promise<AdminSourceVideo[]>;
  listSourceVideosWithRuntime(options?: AdminSourceVideoListOptions): Promise<AdminSourceVideoListResult>;
  getSourceVideoDetail(sourceVideoId: string): Promise<AdminSourceVideoDetail>;
  listCutterUsers(): Promise<AdminCutterUsersResponse>;
  approveCutterUser(userId: string): Promise<AdminCutterUserApprovalResult>;
  disableCutterUser(userId: string): Promise<AdminCutterUser>;
  resetCutterUserPassword(userId: string, input: { new_password: string }): Promise<AdminCutterUser>;
  listPreprocessJobs(options?: { limit?: number; offset?: number }): Promise<AdminPreprocessJobsResponse>;
  listPreprocessProcessHistory(
    options?: AdminPreprocessProcessHistoryOptions
  ): Promise<AdminPreprocessProcessHistoryResponse>;
  getPreprocessJobLog(jobId: string): Promise<AdminPreprocessJobLog>;
  listIndexVersions(): Promise<AdminIndexVersionsResponse>;
  getDoctorReport(): Promise<MixlabDoctorReport>;
  getRuntimeDiagnosticsHistory(
    options?: AdminRuntimeDiagnosticsHistoryOptions
  ): Promise<AdminRuntimeDiagnosticsHistoryResponse>;
  getRuntimeSettings(): Promise<AdminRuntimeSettings>;
  initializeLibrary(): Promise<AdminActionResult>;
  scanSourceVideos(): Promise<AdminActionResult>;
  queueUnprocessedVideos(): Promise<AdminActionResult>;
  retryFailedVideos(): Promise<AdminActionResult>;
  recoverProcessingVideos(): Promise<AdminActionResult>;
  queueSourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  retrySourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  recoverProcessingSourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  publishSourceVideo(sourceVideoId: string): Promise<AdminActionResult>;
  getPreprocessSupervisorStatus(): Promise<AdminPreprocessSupervisorStatus>;
  startPreprocessSupervisor(limit?: number): Promise<AdminPreprocessSupervisorStatus>;
  stopPreprocessSupervisor(): Promise<AdminPreprocessSupervisorStatus>;
  repairIndex(options?: { limit?: number }): Promise<AdminActionResult>;
  runDoctor(): Promise<MixlabDoctorReport>;
  exportDoctorReport(): Promise<MixlabDoctorExport>;
  testAsrConfig(): Promise<AdminActionResult>;
  updateSourceVideoMetadata(
    sourceVideoId: string,
    metadata: AdminSourceVideoMetadataUpdate
  ): Promise<AdminSourceVideo>;
  updateSourceVideoCover(
    sourceVideoId: string,
    cover: AdminSourceVideoCoverUpdate
  ): Promise<AdminSourceVideo>;
}

export interface CreateAdminApiClientInput {
  base_url: string;
  fetch?: typeof fetch;
  auth?: { session_token: string };
  signal?: AbortSignal;
}

function redactApprovalResult(
  result: AdminCutterUserApprovalResult & {
    session: AdminCutterUserApprovalResult["session"] & { session_token?: unknown };
  }
): AdminCutterUserApprovalResult {
  return {
    ...result,
    session: {
      user_id: result.session.user_id,
      device_id: result.session.device_id,
      created_at: result.session.created_at,
      last_seen_at: result.session.last_seen_at
    }
  };
}

export function createAdminApiClient(input: CreateAdminApiClientInput): AdminApiClient {
  const baseFetch = input.fetch ?? fetch;
  const fetchImpl: typeof fetch = input.signal
    ? (resource, init) => baseFetch(resource, { ...(init ?? {}), signal: input.signal })
    : baseFetch;
  const protectedHeaders = adminAuthHeaders(input.auth);
  const authMethods = createAdminAuthClientMethods({
    fetchImpl,
    baseUrl: input.base_url,
    protectedHeaders
  });
  const operationsMethods = createAdminOperationsClientMethods({
    fetchImpl,
    baseUrl: input.base_url,
    protectedHeaders
  });
  const sourceVideoMethods = createAdminSourceVideoClientMethods({
    fetchImpl,
    baseUrl: input.base_url,
    protectedHeaders
  });

  return {
    ...authMethods,
    ...operationsMethods,
    ...sourceVideoMethods,
    listCutterUsers: () =>
      getJson<AdminCutterUsersResponse>(fetchImpl, input.base_url, "/api/admin/cutter-users", protectedHeaders),
    approveCutterUser: (userId) =>
      sendJson<AdminCutterUserApprovalResult>(
        fetchImpl,
        input.base_url,
        `/api/admin/cutter-users/${userId}/approve`,
        "POST",
        undefined,
        protectedHeaders
      ).then(redactApprovalResult),
    disableCutterUser: (userId) =>
      sendJson<AdminCutterUser>(
        fetchImpl,
        input.base_url,
        `/api/admin/cutter-users/${userId}/disable`,
        "POST",
        undefined,
        protectedHeaders
      ),
    resetCutterUserPassword: (userId, passwordInput) =>
      sendJson<AdminCutterUser>(
        fetchImpl,
        input.base_url,
        `/api/admin/cutter-users/${userId}/password`,
        "POST",
        passwordInput,
        protectedHeaders
      )
  };
}

function fixtureDataLoadingPlan(): AdminDataLoadingPlan {
  return createAdminFixtureDataLoadingPlan({
    process_history_default_load_limit: ADMIN_PREPROCESS_PROCESS_HISTORY_DEFAULT_LOAD_LIMIT
  });
}

function cloneRuntimeEndpointMeta(runtime: AdminRuntimeEndpointMeta): AdminRuntimeEndpointMeta {
  return {
    ...runtime,
    components: runtime.components?.map((component) => ({ ...component }))
  };
}

function createFixtureRuntimeDiagnosticsHistory(): AdminRuntimeDiagnosticsHistoryResponse {
  return {
    schema_version: "1.0",
    generated_at: "2024-05-07T10:40:00.000Z",
    path: "/Volumes/PublicLibrary/.mixlab-library/admin-read-model/runtime-diagnostics.ndjson",
    limit: 20,
    total_line_count: 2,
    malformed_line_count: 1,
    truncated: false,
    entries: [
      {
        schema_version: "1.0",
        recorded_at: "2024-05-07T10:39:00.000Z",
        runtime: {
          schema_version: "1.0",
          endpoint: "/api/admin/dashboard/metrics",
          method: "GET",
          duration_ms: 925,
          scan_mode: "status-scan",
          data_source: "admin-read-model",
          scan_reason: "background-metrics",
          actual_data_source: "admin-read-model",
          cache_status: "miss",
          result_count: 1,
          offset: 0,
          limit: 0,
          slow: true,
          slow_reason: "dashboard-cold-path-above-target",
          components: [
            {
              name: "production_summary",
              duration_ms: 345,
              data_source: "admin-read-model",
              scan_mode: "status-scan",
              scan_reason: "background-metrics",
              cache_status: "miss"
            },
            {
              name: "runtime_load",
              duration_ms: 261,
              data_source: "runtime-telemetry",
              scan_mode: "no-scan",
              scan_reason: "background-metrics",
              cache_status: "not-applicable"
            }
          ]
        }
      },
      {
        schema_version: "1.0",
        recorded_at: "2024-05-07T10:38:30.000Z",
        runtime: {
          schema_version: "1.0",
          endpoint: "/api/admin/source-videos",
          method: "GET",
          duration_ms: 184,
          scan_mode: "paged-list",
          data_source: "admin-read-model",
          scan_reason: "route-owned-page",
          actual_data_source: "admin-read-model",
          cache_status: "hit",
          result_count: 20,
          offset: 0,
          limit: 20,
          slow: false,
          slow_reason: ""
        }
      }
    ]
  };
}

function cloneRuntimeDiagnosticsHistory(
  history: AdminRuntimeDiagnosticsHistoryResponse,
  options?: AdminRuntimeDiagnosticsHistoryOptions
): AdminRuntimeDiagnosticsHistoryResponse {
  const limit = options?.limit && options.limit > 0 ? Math.floor(options.limit) : history.limit;

  return {
    ...history,
    limit,
    entries: history.entries.slice(0, limit).map((entry) => ({
      ...entry,
      runtime: cloneRuntimeEndpointMeta(entry.runtime)
    }))
  };
}

export function createFixtureAdminApiClient(): AdminApiClient {
  let fixtureStatus: AdminLibraryStatus = { ...status };
  let fixturePathChecks: AdminPathCheck[] = pathChecks.map((item) => ({ ...item }));
  let fixtureSourceVideos: AdminSourceVideo[] = sourceVideos.map((video) => ({
    ...video,
    tags: [...video.tags]
  }));
  let fixtureJobs: AdminPreprocessJobsResponse = {
    ...jobs,
    jobs: jobs.jobs.map((job) => ({ ...job }))
  };
  let fixtureProcessHistory = clonePreprocessProcessHistory(processHistory);
  let fixtureIndexes: AdminIndexVersionsResponse = {
    ...indexes,
    versions: indexes.versions.map((version) => ({ ...version }))
  };
  let fixtureDoctor: MixlabDoctorReport = {
    ...doctor,
    summary: { ...doctor.summary },
    checks: doctor.checks.map((check) => ({ ...check }))
  };
  let fixtureSettings = cloneSettings(settings);
  let fixtureMetrics = cloneDashboardMetrics(dashboardMetrics);
  let fixtureCutterUsers = cutterUsers.map(cloneCutterUser);
  let fixtureRuntimeDiagnosticsHistory = createFixtureRuntimeDiagnosticsHistory();

  function recount(): void {
    const counted = recountFixtureSourceVideoState({
      sourceVideos: fixtureSourceVideos,
      status: fixtureStatus,
      metrics: fixtureMetrics
    });
    fixtureStatus = counted.status;
    fixtureMetrics = counted.metrics;
  }

  function listFixtureSourceVideos(options?: AdminSourceVideoListOptions): AdminSourceVideo[] {
    const offset = options?.offset && options.offset > 0 ? options.offset : 0;
    const limit = options?.limit && options.limit > 0 ? options.limit : fixtureSourceVideos.length;

    return fixtureSourceVideos
      .filter((video) => adminSourceVideoMatchesOptions(video, options))
      .slice(offset, offset + limit)
      .map((video) => ({
        ...video,
        tags: [...video.tags]
      }));
  }

  function fixtureSourceVideoListRuntime(
    options: AdminSourceVideoListOptions | undefined,
    resultCount: number
  ): AdminRuntimeEndpointMeta {
    return {
      schema_version: "1.0",
      endpoint: `/api/admin/source-videos${listQuery(options)}`,
      method: "GET",
      duration_ms: 12,
      scan_mode: "paged-list",
      data_source: "admin-read-model",
      scan_reason: "route-owned-page",
      actual_data_source: "admin-read-model",
      cache_status: "hit",
      result_count: resultCount,
      offset: options?.offset && options.offset > 0 ? options.offset : 0,
      limit: options?.limit && options.limit > 0 ? options.limit : fixtureSourceVideos.length,
      slow: false,
      slow_reason: "",
      fallback_reason: ""
    };
  }

  function queueVideos(
    statuses: AdminPreprocessStatus[],
    message: string,
    sourceVideoId?: string
  ): AdminActionResult {
    const mutation = queueFixtureSourceVideos(
      {
        sourceVideos: fixtureSourceVideos,
        jobs: fixtureJobs,
        indexes: fixtureIndexes,
        status: fixtureStatus,
        metrics: fixtureMetrics
      },
      { statuses, message, sourceVideoId }
    );
    fixtureSourceVideos = mutation.state.sourceVideos;
    fixtureJobs = mutation.state.jobs;
    fixtureStatus = mutation.state.status;
    fixtureMetrics = mutation.state.metrics;
    return mutation.result;
  }

  function publishFixtureSourceVideosAndSave(input: {
    sourceVideoId?: string;
    alwaysPublishIndex?: boolean;
  } = {}): AdminActionResult {
    const mutation = publishFixtureSourceVideos(
      {
        sourceVideos: fixtureSourceVideos,
        jobs: fixtureJobs,
        indexes: fixtureIndexes,
        status: fixtureStatus,
        metrics: fixtureMetrics
      },
      input
    );
    fixtureSourceVideos = mutation.state.sourceVideos;
    fixtureIndexes = mutation.state.indexes;
    fixtureStatus = mutation.state.status;
    fixtureMetrics = mutation.state.metrics;
    return mutation.result;
  }

  function syncSettingsSideEffects(): void {
    const primarySourceFolder = fixtureSettings.source_folders.find((folder) => folder.enabled)
      ?? fixtureSettings.source_folders[0];
    fixtureStatus = {
      ...fixtureStatus,
      name: fixtureSettings.library_name,
      source_videos_path: primarySourceFolder?.path ?? fixtureStatus.source_videos_path
    };
  }

  function saveFixtureSettings(settingsUpdate: AdminSettingsConfigUpdate): AdminSettingsConfig {
    if (settingsUpdate.asr?.dashscope_api_key?.trim()) {
      runtime.asr.dashscope_api_key_configured = true;
    }

    const currentById = new Map(fixtureSettings.source_folders.map((folder) => [folder.id, folder]));
    fixtureSettings = cloneSettings({
      ...fixtureSettings,
      library_name: settingsUpdate.library_name,
      source_folders: settingsUpdate.source_folders.map((folder) =>
        normalizeFixtureSourceFolder(currentById.get(folder.id), folder)
      ),
      runtime_policy: { ...settingsUpdate.runtime_policy },
      updated_at: "2024-05-07 10:37:00"
    });
    syncSettingsSideEffects();
    return cloneSettings(fixtureSettings);
  }

  function addFixtureSourceFolder(folder: AdminSourceFolderCreate): AdminSettingsConfig {
    const nextFolder: AdminSourceFolder = {
      ...folder,
      id: nextSourceFolderId(fixtureSettings.source_folders),
      last_scanned_at: folder.last_scanned_at ?? "",
      discovered_video_count: folder.discovered_video_count ?? 0,
      new_unprocessed_count: folder.new_unprocessed_count ?? 0
    };
    fixtureSettings = cloneSettings({
      ...fixtureSettings,
      source_folders: [...fixtureSettings.source_folders, nextFolder],
      updated_at: "2024-05-07 10:38:00"
    });
    syncSettingsSideEffects();
    return cloneSettings(fixtureSettings);
  }

  function updateFixtureSourceFolder(
    sourceFolderId: string,
    patch: AdminSourceFolderUpdate
  ): AdminSettingsConfig {
    let found = false;
    fixtureSettings = cloneSettings({
      ...fixtureSettings,
      source_folders: fixtureSettings.source_folders.map((folder) => {
        if (folder.id !== sourceFolderId) {
          return folder;
        }

        found = true;
        return normalizeFixtureSourceFolder(folder, {
          ...folder,
          ...patch
        });
      }),
      updated_at: "2024-05-07 10:39:00"
    });

    if (!found) {
      throw new Error("素材来源不存在");
    }

    syncSettingsSideEffects();
    return cloneSettings(fixtureSettings);
  }

  function removeFixtureSourceFolder(sourceFolderId: string): AdminSettingsConfig {
    if (sourceFolderId === "src_default") {
      throw new Error("默认素材来源不能移除");
    }

    const sourceFolders = fixtureSettings.source_folders.filter((folder) => folder.id !== sourceFolderId);
    if (sourceFolders.length === fixtureSettings.source_folders.length) {
      throw new Error("素材来源不存在");
    }

    fixtureSettings = cloneSettings({
      ...fixtureSettings,
      source_folders: sourceFolders,
      updated_at: "2024-05-07 10:40:00"
    });
    syncSettingsSideEffects();
    return cloneSettings(fixtureSettings);
  }

  return {
    getAuthBootstrap: async () => ({
      has_admin: true,
      registration_open: false
    }),
    getAuthStatus: async () => ({
      authenticated: true,
      auth_mode: "disabled",
      user: {
        admin_id: "AU000001",
        username: "admin",
        display_name: "管理员",
        role: "owner",
        status: "active",
        created_at: "2024-05-07 10:00:00",
        last_login_at: "2024-05-07 10:00:00",
        disabled_at: ""
      },
      bootstrap: {
        has_admin: true,
        registration_open: false
      }
    }),
    registerAdmin: async (input) => ({
      user: {
        admin_id: "AU000001",
        username: input.username,
        display_name: input.display_name || input.username,
        role: "owner",
        status: "active",
        created_at: "2024-05-07 10:00:00",
        last_login_at: "2024-05-07 10:00:00",
        disabled_at: ""
      },
      session: {
        admin_id: "AU000001",
        session_token: "fixture-admin-session",
        created_at: "2024-05-07 10:00:00",
        last_seen_at: "2024-05-07 10:00:00"
      }
    }),
    loginAdmin: async (input) => ({
      user: {
        admin_id: "AU000001",
        username: input.username,
        display_name: input.username,
        role: "owner",
        status: "active",
        created_at: "2024-05-07 10:00:00",
        last_login_at: "2024-05-07 10:00:00",
        disabled_at: ""
      },
      session: {
        admin_id: "AU000001",
        session_token: "fixture-admin-session",
        created_at: "2024-05-07 10:00:00",
        last_seen_at: "2024-05-07 10:00:00"
      }
    }),
    logoutAdmin: async () => ({
      removed: true
    }),
    getLibraryStatus: async () => ({ ...fixtureStatus }),
    getDataLoadingPlan: async () => cloneDataLoadingPlan(fixtureDataLoadingPlan()),
    getOperationsOverview: async () => fixtureOperationsOverview({
      status: fixtureStatus,
      jobs: fixtureJobs,
      sourceVideos: fixtureSourceVideos,
      metrics: fixtureMetrics,
      dataLoadingPlan: fixtureDataLoadingPlan()
    }),
    getReadModelReconcileStatus: async () => fixtureReadModelReconcileStatus(fixtureStatus.video_count),
    startReadModelReconcile: async () => ({
      accepted: true,
      status: {
        ...fixtureReadModelReconcileStatus(fixtureStatus.video_count),
        status: "running",
        phase: "scanning",
        message: "Fixture read-model reconcile started"
      }
    }),
    cancelReadModelReconcile: async () => ({
      accepted: true,
      status: {
        ...fixtureReadModelReconcileStatus(fixtureStatus.video_count),
        status: "running",
        cancel_requested: true,
        message: "Fixture read-model reconcile cancellation requested"
      }
    }),
    getOperationLog: async (options) => fixtureOperationLog(options?.limit),
    getCommandSnapshotRestorePlan: async (snapshotId) => fixtureCommandSnapshotRestorePlan(snapshotId),
    restoreCommandSnapshot: async (snapshotId) => fixtureCommandSnapshotRestoreResult(snapshotId),
    getPathChecks: async () => fixturePathChecks.map((item) => ({ ...item })),
    getAdminSettings: async () => cloneSettings(fixtureSettings),
    saveAdminSettings: async (settingsUpdate) => saveFixtureSettings(settingsUpdate),
    addSourceFolder: async (folder) => addFixtureSourceFolder(folder),
    updateSourceFolder: async (sourceFolderId, patch) => updateFixtureSourceFolder(sourceFolderId, patch),
    removeSourceFolder: async (sourceFolderId) => removeFixtureSourceFolder(sourceFolderId),
    getDashboardMetrics: async () => cloneDashboardMetrics(fixtureMetrics),
    listSourceVideos: async (options) => listFixtureSourceVideos(options),
    listSourceVideosReadOnly: async (options) => listFixtureSourceVideos(options),
    listSourceVideosWithRuntime: async (options) => {
      const sourceVideoList = listFixtureSourceVideos(options);
      return {
        source_videos: sourceVideoList,
        runtime: fixtureSourceVideoListRuntime(options, sourceVideoList.length)
      };
    },
    getSourceVideoDetail: async (sourceVideoId) => {
      const video = fixtureSourceVideos.find((candidate) => candidate.source_video_id === sourceVideoId);
      if (!video) {
        throw new Error(`source video not found: ${sourceVideoId}`);
      }
      return makeSourceVideoDetail(video, {
        jobs: fixtureJobs,
        status: fixtureStatus
      });
    },
    listCutterUsers: async () => ({
      users: fixtureCutterUsers.map(cloneCutterUser)
    }),
    approveCutterUser: async (userId) => {
      let updated: AdminCutterUser | undefined;

      fixtureCutterUsers = fixtureCutterUsers.map((user) => {
        if (user.user_id !== userId) {
          return user;
        }

        updated = {
          ...user,
          status: "approved",
          approved_at: user.approved_at || "2024-05-07 10:35:00",
          disabled_at: "",
          devices: user.devices.map((device) => ({
            ...device,
            status: "active"
          }))
        };
        return updated;
      });

      if (!updated) {
        throw new Error(`cutter user not found: ${userId}`);
      }

      const device = updated.devices[0];
      if (!device) {
        throw new Error(`cutter user has no devices: ${userId}`);
      }

      return {
        status: "approved",
        user: cloneCutterUser(updated),
        session: {
          user_id: updated.user_id,
          device_id: device.device_id,
          created_at: "2024-05-07 10:35:00",
          last_seen_at: "2024-05-07 10:35:00"
        }
      };
    },
    disableCutterUser: async (userId) => {
      let updated: AdminCutterUser | undefined;

      fixtureCutterUsers = fixtureCutterUsers.map((user) => {
        if (user.user_id !== userId) {
          return user;
        }

        updated = {
          ...user,
          status: "disabled",
          disabled_at: "2024-05-07 10:36:00",
          devices: user.devices.map((device) => ({
            ...device,
            status: "disabled"
          }))
        };
        return updated;
      });

      if (!updated) {
        throw new Error(`cutter user not found: ${userId}`);
      }

      return cloneCutterUser(updated);
    },
    resetCutterUserPassword: async (userId, passwordInput) => {
      if (!passwordInput.new_password.trim()) {
        throw new Error("新密码不能为空");
      }

      const updated = fixtureCutterUsers.find((user) => user.user_id === userId);
      if (!updated) {
        throw new Error(`cutter user not found: ${userId}`);
      }

      return cloneCutterUser(updated);
    },
    listPreprocessJobs: async () => ({
      ...fixtureJobs,
      supervisor: {
        ...fixtureJobs.supervisor,
        last_result: fixtureJobs.supervisor.last_result
          ? { ...fixtureJobs.supervisor.last_result }
          : null
      },
      jobs: fixtureJobs.jobs.map((job) => ({ ...job }))
    }),
    listPreprocessProcessHistory: async (options) =>
      clonePreprocessProcessHistory(fixtureProcessHistory, options),
    getPreprocessJobLog: async (jobId) => {
      const job = fixtureJobs.jobs.find((candidate) => candidate.job_id === jobId);

      if (!job) {
        throw new Error(`preprocess job not found: ${jobId}`);
      }

      return {
        job_id: job.job_id,
        source_video_id: job.source_video_id,
        path: job.log_path,
        file_path: `/Volumes/PublicLibrary/${job.log_path}`,
        exists: true,
        content: [
          `${job.started_at || job.failed_at || job.completed_at || "2024-05-07 10:24:18"}\t${job.source_video_id}\t${job.stage}\t${job.stage_label}`,
          job.error_message
            ? `${job.failed_at || "2024-05-07 10:18:20"}\t${job.source_video_id}\t${job.stage}\tfailed: ${job.error_message}`
            : ""
        ].filter(Boolean).join("\n")
      };
    },
    listIndexVersions: async () => ({
      ...fixtureIndexes,
      versions: fixtureIndexes.versions.map((version) => ({ ...version }))
    }),
    getDoctorReport: async () => ({
      ...fixtureDoctor,
      summary: { ...fixtureDoctor.summary },
      checks: fixtureDoctor.checks.map((check) => ({ ...check }))
    }),
    getRuntimeDiagnosticsHistory: async (options) =>
      cloneRuntimeDiagnosticsHistory(fixtureRuntimeDiagnosticsHistory, options),
    getRuntimeSettings: async () => {
      const clonedRuntime = cloneRuntimeSettings(runtime);
      return {
        ...clonedRuntime,
        asr: {
          ...clonedRuntime.asr,
          audio_mode: fixtureSettings.runtime_policy.audio_mode
        }
      };
    },
    initializeLibrary: async () => ({
      affected_count: 0,
      message: "fixture 素材库已初始化"
    }),
    scanSourceVideos: async () => ({
      new_video_count: 0,
      existing_video_count: fixtureSourceVideos.length,
      message: "fixture 扫描完成"
    }),
    queueUnprocessedVideos: async () =>
      queueVideos(["unprocessed"], "已将未处理视频加入预处理队列"),
    retryFailedVideos: async () =>
      queueVideos(["failed"], "已将失败视频重新加入预处理队列"),
    recoverProcessingVideos: async () =>
      queueVideos(["processing"], "已恢复停滞中的处理任务"),
    queueSourceVideo: async (sourceVideoId) =>
      queueVideos(["unprocessed"], `已将 ${sourceVideoId} 加入预处理队列`, sourceVideoId),
    retrySourceVideo: async (sourceVideoId) =>
      queueVideos(["failed"], `已将 ${sourceVideoId} 重新加入预处理队列`, sourceVideoId),
    recoverProcessingSourceVideo: async (sourceVideoId) =>
      queueVideos(["processing"], `已将 ${sourceVideoId} 从处理中恢复到预处理队列`, sourceVideoId),
    getPreprocessSupervisorStatus: async () => ({
      ...fixtureJobs.supervisor,
      last_result: fixtureJobs.supervisor.last_result
        ? { ...fixtureJobs.supervisor.last_result }
        : null
    }),
    startPreprocessSupervisor: async (limit) => {
      fixtureJobs = {
        ...fixtureJobs,
        supervisor: {
          ...fixtureJobs.supervisor,
          state: "running",
          state_label: "运行中",
          started_at: "2024-05-07 10:45:00",
          stopped_at: "",
          stop_requested: false,
          last_error: "",
          last_result: limit
            ? {
                total_claimed_count: limit,
                succeeded_count: Math.max(0, limit - 1),
                failed_count: limit > 1 ? 1 : 0
              }
            : fixtureJobs.supervisor.last_result
        }
      };
      return {
        ...fixtureJobs.supervisor,
        last_result: fixtureJobs.supervisor.last_result
          ? { ...fixtureJobs.supervisor.last_result }
          : null
      };
    },
    stopPreprocessSupervisor: async () => {
      fixtureJobs = {
        ...fixtureJobs,
        supervisor: {
          ...fixtureJobs.supervisor,
          state: "idle",
          state_label: "未运行",
          stopped_at: "2024-05-07 10:46:00",
          stop_requested: false
        }
      };
      return {
        ...fixtureJobs.supervisor,
        last_result: fixtureJobs.supervisor.last_result
          ? { ...fixtureJobs.supervisor.last_result }
          : null
      };
    },
    publishSourceVideo: async (sourceVideoId) =>
      publishFixtureSourceVideosAndSave({ sourceVideoId }),
    repairIndex: async () =>
      publishFixtureSourceVideosAndSave({ alwaysPublishIndex: true }),
    runDoctor: async () => fixtureDoctor,
    exportDoctorReport: async () => ({
      file_name: `mixlab-doctor-${fixtureDoctor.generated_at.replaceAll(/[:\s]/g, "-")}.json`,
      relative_path: ".mixlab-library/exports/doctor/mixlab-doctor-fixture.json",
      file_path: "/Volumes/PublicLibrary/.mixlab-library/exports/doctor/mixlab-doctor-fixture.json",
      report: {
        ...fixtureDoctor,
        summary: { ...fixtureDoctor.summary },
        checks: fixtureDoctor.checks.map((check) => ({ ...check }))
      }
    }),
    testAsrConfig: async () => ({
      passed: runtime.asr.dashscope_api_key_configured,
      message: runtime.asr.dashscope_api_key_configured
        ? "DashScope API Key 已配置，测试通过。"
        : "DashScope API Key 未配置。"
    }),
    updateSourceVideoMetadata: async (sourceVideoId, metadata) => {
      const { sourceVideos: nextSourceVideos, updated } = updateFixtureSourceVideoMetadata(
        fixtureSourceVideos,
        sourceVideoId,
        metadata
      );
      fixtureSourceVideos = nextSourceVideos;
      return updated;
    },
    updateSourceVideoCover: async (sourceVideoId, coverUpdate) => {
      const { sourceVideos: nextSourceVideos, updated } = updateFixtureSourceVideoCover(
        fixtureSourceVideos,
        sourceVideoId,
        coverUpdate
      );
      fixtureSourceVideos = nextSourceVideos;
      return updated;
    }
  };
}

function summaryPreprocessJobs(
  status: AdminLibraryStatus,
  supervisor: AdminPreprocessSupervisorStatus
): AdminPreprocessJobsResponse {
  return {
    active_count: status.processing_video_count,
    queued_count: status.queued_video_count,
    completed_count: status.ready_video_count + status.index_required_video_count,
    failed_count: status.failed_video_count,
    supervisor,
    jobs: [],
    observability: {
      running_job_id: "",
      running_source_video_id: "",
      pipeline_progress_percent: 0,
      estimated_all_done_at: "",
      estimated_queue_duration_ms: 0,
      throughput_label: status.queued_video_count > 0
        ? "进入预处理页查看队列详情"
        : "当前没有等待处理的队列",
      load_advice: "进入预处理页查看运行负荷详情"
    }
  };
}

function placeholderDoctorReport(status: AdminLibraryStatus): MixlabDoctorReport {
  return {
    schema_version: "1.0",
    generated_at: status.updated_at,
    library_root: status.root_path,
    summary: { pass: 0, warn: 0, fail: 0 },
    checks: []
  };
}

function placeholderIndexVersions(status: AdminLibraryStatus): AdminIndexVersionsResponse {
  return {
    current_version: status.current_index_version,
    current_validation_status: status.current_index_version ? "pass" : "warn",
    current_validation_message: status.current_index_version
      ? `当前索引已发布 ${status.current_index_version}`
      : "暂无当前索引",
    versions: status.current_index_version
      ? [{
          index_version: status.current_index_version,
          created_at: status.updated_at,
          ready_video_count: status.ready_video_count,
          schema_version: "",
          validation_status: "pass",
          validation_message: "当前索引指针可读，完整包校验需加载索引版本。",
          is_current: true,
          published_by: ""
        }]
      : []
  };
}

function placeholderPathChecks(status: AdminLibraryStatus): AdminPathCheck[] {
  return [{
    label: "公共素材库",
    path: status.root_path,
    status: "warn",
    message: "进入设置页后按需校验"
  }];
}

function placeholderDashboardMetrics(status: AdminLibraryStatus): AdminDashboardMetrics {
  return {
    material: {
      video_count: status.video_count,
      ready_video_count: status.ready_video_count,
      total_duration_ms: 0,
      ready_duration_ms: 0,
      unprocessed_duration_ms: 0,
      total_size_bytes: 0
    },
    transcript: {
      transcript_video_count: status.ready_video_count,
      character_count: 0,
      segment_count: 0,
      current_index_version: status.current_index_version
    },
    production: {
      completed_today_count: 0,
      failed_today_count: 0,
      average_video_process_ms: 0,
      estimated_queue_done_at: ""
    },
    usage: {
      search_request_count: 0,
      search_hit_count: 0,
      search_empty_count: 0,
      search_failure_count: 0,
      search_latency_p50_ms: 0,
      search_latency_p95_ms: 0,
      search_latency_max_ms: 0,
      searchd_search_count: 0,
      sqlite_index_search_count: 0,
      fallback_search_count: 0,
      search_backend_unknown_count: 0,
      core_search_request_count: 0,
      core_search_failure_count: 0,
      core_search_latency_p50_ms: 0,
      core_search_latency_p95_ms: 0,
      core_search_latency_max_ms: 0,
      core_searchd_search_count: 0,
      core_sqlite_index_search_count: 0,
      core_fallback_search_count: 0,
      core_search_backend_unknown_count: 0,
      source_detail_view_count: 0,
      transcript_selection_count: 0,
      add_to_cut_list_count: 0,
      cut_submission_count: 0,
      cut_success_count: 0,
      cut_failure_count: 0,
      local_clip_count: 0,
      reuse_local_clip_count: 0,
      active_user_count: 0,
      recent_keywords: [],
      most_used_source_video_ids: [],
      users: [],
      event_store: {
        line_count: 0,
        valid_line_count: 0,
        malformed_line_count: 0,
        malformed_lines: [],
        warning: ""
      }
    },
    risk: {
      failed_video_count: status.failed_video_count,
      index_required_video_count: status.index_required_video_count
    },
    runtime_load: {
      overall_status: "healthy",
      cpu: { usage_percent: 0, load_average_1m: 0, status: "healthy", label: "待刷新" },
      memory: { total_bytes: 0, used_bytes: 0, available_bytes: 0, usage_percent: 0, status: "healthy", label: "待刷新" },
      disk: {
        total_bytes: status.disk_total_bytes,
        available_bytes: status.disk_available_bytes,
        usage_percent: status.disk_total_bytes > 0
          ? Math.round(((status.disk_total_bytes - status.disk_available_bytes) / status.disk_total_bytes) * 100)
          : 0,
        status: "healthy",
        label: "待刷新"
      },
      network: { active_interface_count: 0, status: "healthy", label: "待刷新" },
      service: { uptime_seconds: 0, heartbeat_at: status.updated_at, status: "healthy", label: "待刷新" }
    },
    sources: {
      material: {
        data_source: "library-manifest",
        scan_mode: "no-scan",
        scan_reason: "shell-summary"
      },
      transcript: {
        data_source: "current-index",
        scan_mode: "no-scan",
        scan_reason: "shell-summary"
      },
      production: {
        data_source: "library-manifest",
        scan_mode: "no-scan",
        scan_reason: "shell-summary"
      },
      usage: {
        data_source: "usage-events",
        scan_mode: "status-scan",
        scan_reason: "background-metrics"
      },
      risk: {
        data_source: "library-manifest",
        scan_mode: "no-scan",
        scan_reason: "shell-summary"
      },
      runtime_load: {
        data_source: "runtime-telemetry",
        scan_mode: "no-scan",
        scan_reason: "background-metrics"
      }
    }
  };
}

function settleWithin<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number
): Promise<T> {
  let settled = false;

  return new Promise((resolve) => {
    const finish = (value: T) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeoutMs);

    promise.then(finish).catch(() => finish(fallback));
  });
}

export async function loadAdminDashboardData(
  client: AdminApiClient,
  options: LoadAdminDashboardDataOptions = {}
): Promise<AdminDashboardData> {
  const includeHeavy = options.includeHeavy ?? true;

  if (!includeHeavy) {
    const libraryStatus = await client.getLibraryStatus();
    const [
      adminSettings,
      adminSupervisor,
      dataLoadingPlan
    ] = await Promise.all([
      settleWithin(client.getAdminSettings(), cloneSettings(settings), 6_000),
      settleWithin(client.getPreprocessSupervisorStatus(), jobs.supervisor, 6_000),
      settleWithin(client.getDataLoadingPlan(), fixtureDataLoadingPlan(), 6_000)
    ]);

    return {
      status: libraryStatus,
      path_checks: placeholderPathChecks(libraryStatus),
      settings: adminSettings,
      source_videos: [],
      jobs: summaryPreprocessJobs(libraryStatus, adminSupervisor),
      indexes: placeholderIndexVersions(libraryStatus),
      doctor: placeholderDoctorReport(libraryStatus),
      runtime: cloneRuntimeSettings(runtime),
      metrics: placeholderDashboardMetrics(libraryStatus),
      data_loading_plan: dataLoadingPlan
    };
  }

  const [
    libraryStatus,
    adminSettings,
    adminRuntime,
    adminSourceVideos,
    adminJobs,
    adminSupervisor,
    dataLoadingPlan
  ] = await Promise.all([
    client.getLibraryStatus(),
    client.getAdminSettings(),
    client.getRuntimeSettings(),
    includeHeavy ? client.listSourceVideos() : Promise.resolve([]),
    includeHeavy ? client.listPreprocessJobs({ limit: ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT }) : Promise.resolve(null),
    includeHeavy ? Promise.resolve(null) : client.getPreprocessSupervisorStatus(),
    client.getDataLoadingPlan()
  ]);

  return {
    status: libraryStatus,
    path_checks: includeHeavy ? await client.getPathChecks() : placeholderPathChecks(libraryStatus),
    settings: adminSettings,
    source_videos: adminSourceVideos,
    jobs: adminJobs ?? summaryPreprocessJobs(libraryStatus, adminSupervisor!),
    indexes: includeHeavy ? await client.listIndexVersions() : placeholderIndexVersions(libraryStatus),
    doctor: includeHeavy ? await client.getDoctorReport() : placeholderDoctorReport(libraryStatus),
    runtime: adminRuntime,
    metrics: includeHeavy ? await client.getDashboardMetrics() : placeholderDashboardMetrics(libraryStatus),
    data_loading_plan: dataLoadingPlan
  };
}
