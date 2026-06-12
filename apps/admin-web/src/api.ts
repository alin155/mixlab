import type {
  DoctorCheck,
  MixlabDoctorExport,
  MixlabDoctorReport
} from "../../../packages/doctor-core/src/index.ts";

export type AdminApiEnvelope<T> =
  | {
      ok: true;
      data: T;
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
}

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
  passed?: boolean;
  message?: string;
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
}

export interface LoadAdminDashboardDataOptions {
  includeHeavy?: boolean;
}

const ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT = 20;

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
    "publish-index": "发布到剪辑端",
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
      detail: `${queuedCount} 个视频已排队，启动预处理后会继续提取音频、语音识别、生成产物并自动发布索引。`,
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
      label: "存在待发布索引视频",
      detail: `${indexRequiredCount} 个视频已完成预处理但尚未进入当前索引，预处理流水线会自动增量发布。`,
      action: "start-preprocess"
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
        : unprocessedCount > 0
          ? "start-preprocess"
          : indexRequiredCount > 0
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
      : primaryAction === "start-preprocess"
        ? queuedCount > 0 && !supervisorRunning
          ? `${queuedCount} 个视频已排队，但预处理服务未运行`
          : unprocessedCount > 0
            ? `发现 ${unprocessedCount} 个视频可进入预处理流水线`
            : `有 ${indexRequiredCount} 个视频等待自动发布`
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
  getLibraryStatus(): Promise<AdminLibraryStatus>;
  getPathChecks(): Promise<AdminPathCheck[]>;
  getAdminSettings(): Promise<AdminSettingsConfig>;
  saveAdminSettings(settings: AdminSettingsConfigUpdate): Promise<AdminSettingsConfig>;
  addSourceFolder(folder: AdminSourceFolderCreate): Promise<AdminSettingsConfig>;
  updateSourceFolder(sourceFolderId: string, patch: AdminSourceFolderUpdate): Promise<AdminSettingsConfig>;
  removeSourceFolder(sourceFolderId: string): Promise<AdminSettingsConfig>;
  getDashboardMetrics(): Promise<AdminDashboardMetrics>;
  listSourceVideos(options?: AdminSourceVideoListOptions): Promise<AdminSourceVideo[]>;
  getSourceVideoDetail(sourceVideoId: string): Promise<AdminSourceVideoDetail>;
  listCutterUsers(): Promise<AdminCutterUsersResponse>;
  approveCutterUser(userId: string): Promise<AdminCutterUserApprovalResult>;
  disableCutterUser(userId: string): Promise<AdminCutterUser>;
  listPreprocessJobs(options?: { limit?: number; offset?: number }): Promise<AdminPreprocessJobsResponse>;
  getPreprocessJobLog(jobId: string): Promise<AdminPreprocessJobLog>;
  listIndexVersions(): Promise<AdminIndexVersionsResponse>;
  getDoctorReport(): Promise<MixlabDoctorReport>;
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
  repairIndex(): Promise<AdminActionResult>;
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
}

export function unwrapAdminResponse<T>(envelope: AdminApiEnvelope<T>): T {
  if (envelope.ok) {
    return envelope.data;
  }

  throw new Error(`${envelope.error_code}: ${envelope.message}`);
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function listQuery(options?: { limit?: number; offset?: number; query?: string; status?: string }): string {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  if (options?.offset) {
    params.set("offset", String(options.offset));
  }

  if (options?.query?.trim()) {
    params.set("query", options.query.trim());
  }

  if (options?.status && options.status !== "all") {
    params.set("status", options.status);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function resolveMediaUrl(baseUrl: string, pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();

  if (!trimmed) {
    return "";
  }

  if (/^data:/i.test(trimmed)) {
    return /^data:image\//i.test(trimmed) ? trimmed : "";
  }

  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);

  try {
    if (hasExplicitScheme) {
      const resolved = new URL(trimmed);
      return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : "";
    }

    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const parsedBaseUrl = new URL(normalizedBaseUrl);
    const resolved = new URL(trimmed, normalizedBaseUrl);
    return (parsedBaseUrl.protocol === "http:" || parsedBaseUrl.protocol === "https:") &&
      (resolved.protocol === "http:" || resolved.protocol === "https:")
      ? resolved.toString()
      : "";
  } catch {
    if (hasExplicitScheme || trimmed.startsWith("//")) {
      return "";
    }

    try {
      const relativeBaseUrl = baseUrl.trim() || "/";
      const rootedRelativeBase = relativeBaseUrl.startsWith("/")
        ? relativeBaseUrl
        : `/${relativeBaseUrl}`;
      const normalizedRelativeBase = rootedRelativeBase.endsWith("/")
        ? rootedRelativeBase
        : `${rootedRelativeBase}/`;
      const resolved = new URL(trimmed, `http://mixlab.local${normalizedRelativeBase}`);
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return "";
    }
  }
}

function resolveSourceVideoMedia(baseUrl: string, video: AdminSourceVideo): AdminSourceVideo {
  return {
    ...video,
    cover_url: resolveMediaUrl(baseUrl, video.cover_url)
  };
}

function resolveSourceVideoDetailMedia(
  baseUrl: string,
  detail: AdminSourceVideoDetail
): AdminSourceVideoDetail {
  return {
    ...detail,
    source_video: resolveSourceVideoMedia(baseUrl, detail.source_video)
  };
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

async function getJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint));
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
}

async function sendJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  method: "POST" | "PATCH",
  body?: unknown
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
}

async function deleteJson<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string
): Promise<T> {
  const response = await fetchImpl(joinUrl(baseUrl, endpoint), {
    method: "DELETE"
  });
  const envelope = (await response.json()) as AdminApiEnvelope<T>;
  return unwrapAdminResponse(envelope);
}

export function createAdminApiClient(input: CreateAdminApiClientInput): AdminApiClient {
  const fetchImpl = input.fetch ?? fetch;

  return {
    getLibraryStatus: () =>
      getJson<AdminLibraryStatus>(fetchImpl, input.base_url, "/api/admin/library/status"),
    getPathChecks: () =>
      getJson<AdminPathCheck[]>(fetchImpl, input.base_url, "/api/admin/library/path-checks"),
    getAdminSettings: () =>
      getJson<AdminSettingsConfig>(fetchImpl, input.base_url, "/api/admin/settings/config"),
    saveAdminSettings: (settingsUpdate) =>
      sendJson<AdminSettingsConfig>(
        fetchImpl,
        input.base_url,
        "/api/admin/settings/config",
        "PATCH",
        settingsUpdate
      ),
    addSourceFolder: (folder) =>
      sendJson<AdminSettingsConfig>(
        fetchImpl,
        input.base_url,
        "/api/admin/settings/source-folders",
        "POST",
        folder
      ),
    updateSourceFolder: (sourceFolderId, patch) =>
      sendJson<AdminSettingsConfig>(
        fetchImpl,
        input.base_url,
        `/api/admin/settings/source-folders/${sourceFolderId}`,
        "PATCH",
        patch
      ),
    removeSourceFolder: (sourceFolderId) =>
      deleteJson<AdminSettingsConfig>(
        fetchImpl,
        input.base_url,
        `/api/admin/settings/source-folders/${sourceFolderId}`
      ),
    getDashboardMetrics: () =>
      getJson<AdminDashboardMetrics>(fetchImpl, input.base_url, "/api/admin/dashboard/metrics"),
    listSourceVideos: (options) =>
      getJson<AdminSourceVideo[]>(fetchImpl, input.base_url, `/api/admin/source-videos${listQuery(options)}`)
        .then((videos) => videos.map((video) => resolveSourceVideoMedia(input.base_url, video))),
    getSourceVideoDetail: (sourceVideoId) =>
      getJson<AdminSourceVideoDetail>(fetchImpl, input.base_url, `/api/admin/source-videos/${sourceVideoId}`)
        .then((detail) => resolveSourceVideoDetailMedia(input.base_url, detail)),
    listCutterUsers: () =>
      getJson<AdminCutterUsersResponse>(fetchImpl, input.base_url, "/api/admin/cutter-users"),
    approveCutterUser: (userId) =>
      sendJson<AdminCutterUserApprovalResult>(
        fetchImpl,
        input.base_url,
        `/api/admin/cutter-users/${userId}/approve`,
        "POST"
      ).then(redactApprovalResult),
    disableCutterUser: (userId) =>
      sendJson<AdminCutterUser>(
        fetchImpl,
        input.base_url,
        `/api/admin/cutter-users/${userId}/disable`,
        "POST"
      ),
    listPreprocessJobs: (options) =>
      getJson<AdminPreprocessJobsResponse>(
        fetchImpl,
        input.base_url,
        `/api/admin/preprocess/jobs${listQuery(options ?? { limit: ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT })}`
      ),
    getPreprocessJobLog: (jobId) =>
      getJson<AdminPreprocessJobLog>(fetchImpl, input.base_url, `/api/admin/preprocess/jobs/${jobId}/log`),
    listIndexVersions: () =>
      getJson<AdminIndexVersionsResponse>(fetchImpl, input.base_url, "/api/admin/index/versions"),
    getDoctorReport: () =>
      getJson<MixlabDoctorReport>(fetchImpl, input.base_url, "/api/admin/doctor/report"),
    getRuntimeSettings: () =>
      getJson<AdminRuntimeSettings>(fetchImpl, input.base_url, "/api/admin/settings/runtime"),
    initializeLibrary: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/library/init", "POST"),
    scanSourceVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/library/scan", "POST"),
    queueUnprocessedVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/preprocess/queue-unprocessed", "POST"),
    retryFailedVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/preprocess/retry-failed", "POST"),
    recoverProcessingVideos: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/preprocess/recover-processing", "POST"),
    queueSourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/queue`,
        "POST"
      ),
    retrySourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/retry`,
        "POST"
      ),
    recoverProcessingSourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/recover-processing`,
        "POST"
      ),
    publishSourceVideo: (sourceVideoId) =>
      sendJson<AdminActionResult>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/publish`,
        "POST"
      ),
    getPreprocessSupervisorStatus: () =>
      getJson<AdminPreprocessSupervisorStatus>(
        fetchImpl,
        input.base_url,
        "/api/admin/preprocess/supervisor/status"
      ),
    startPreprocessSupervisor: (limit) =>
      sendJson<AdminPreprocessSupervisorStatus>(
        fetchImpl,
        input.base_url,
        "/api/admin/preprocess/supervisor/start",
        "POST",
        limit ? { limit } : {}
      ),
    stopPreprocessSupervisor: () =>
      sendJson<AdminPreprocessSupervisorStatus>(
        fetchImpl,
        input.base_url,
        "/api/admin/preprocess/supervisor/stop",
        "POST"
      ),
    repairIndex: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/index/repair", "POST"),
    runDoctor: () =>
      sendJson<MixlabDoctorReport>(fetchImpl, input.base_url, "/api/admin/doctor/run", "POST"),
    exportDoctorReport: () =>
      sendJson<MixlabDoctorExport>(fetchImpl, input.base_url, "/api/admin/doctor/export", "POST"),
    testAsrConfig: () =>
      sendJson<AdminActionResult>(fetchImpl, input.base_url, "/api/admin/settings/test-asr", "POST"),
    updateSourceVideoMetadata: (sourceVideoId, metadata) =>
      sendJson<AdminSourceVideo>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/metadata`,
        "PATCH",
        metadata
      ).then((video) => resolveSourceVideoMedia(input.base_url, video)),
    updateSourceVideoCover: (sourceVideoId, cover) =>
      sendJson<AdminSourceVideo>(
        fetchImpl,
        input.base_url,
        `/api/admin/source-videos/${sourceVideoId}/cover`,
        "PATCH",
        cover
      )
        .then((video) => resolveSourceVideoMedia(input.base_url, video))
  };
}

function cover(seed: string, tint: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="%23f5f6f8"/><rect y="98" width="320" height="82" fill="%23${tint}"/><path d="M28 122h24V78h26v44h18V60h30v62h22V88h24v34h25V48h31v74h20V82h25v40h28v15H28z" fill="%23262f3a"/><circle cx="266" cy="48" r="24" fill="%23ffffff" opacity=".68"/><text x="18" y="164" font-family="Arial" font-size="19" fill="%23ffffff">${seed}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

const status: AdminLibraryStatus = {
  library_id: "MLPUB-001",
  name: "公司公开课程素材库",
  root_path: "/Volumes/PublicLibrary",
  source_videos_path: "/Volumes/PublicLibrary/source-videos",
  mixlab_library_path: "/Volumes/PublicLibrary/.mixlab-library",
  protocol_version: "1.0.0",
  video_count: 623,
  ready_video_count: 120,
  processing_video_count: 3,
  queued_video_count: 28,
  unprocessed_video_count: 465,
  failed_video_count: 2,
  index_required_video_count: 5,
  disk_total_bytes: 4_000_000_000_000,
  disk_available_bytes: 2_480_000_000_000,
  index_status: "ready",
  current_index_version: "v000027",
  active_task_label: "V000043 - build-keyframes 65%",
  updated_at: "2024-05-07 10:26"
};

const pathChecks: AdminPathCheck[] = [
  {
    label: "公共素材库",
    path: status.root_path,
    status: "pass",
    message: "根路径可访问"
  },
  {
    label: "素材来源：默认素材来源",
    path: status.source_videos_path,
    status: "pass",
    message: "素材来源可读"
  },
  {
    label: ".mixlab-library",
    path: status.mixlab_library_path,
    status: "pass",
    message: "协议目录可写"
  },
  {
    label: "manifest.json",
    path: `${status.mixlab_library_path}/library.json`,
    status: "pass",
    message: "library.json 有效"
  }
];

const sourceVideos: AdminSourceVideo[] = [
  {
    source_video_id: "V000043",
    title: "现金流课程片段",
    file_name: "现金流课程片段.mp4",
    relative_path: "source-videos/2024/05/现金流课程片段.mp4",
    cover_url: cover("V43", "9bb8d6"),
    duration_ms: 3_374_000,
    file_size: 2_420_000_000,
    preprocess_status: "processing",
    visible_to_cutters: false,
    tags: ["财务", "现金流"],
    description: "正在生成关键帧，未对剪辑师可见。",
    lecturer: "李明",
    course: "企业现金流",
    category: "公开课",
    updated_at: "2024-05-07 10:24:18"
  },
  {
    source_video_id: "V000042",
    title: "现金流管理与风险控制",
    file_name: "现金流管理与风险控制.mp4",
    relative_path: "source-videos/2024/05/现金流管理与风险控制.mp4",
    cover_url: cover("V42", "86a98b"),
    duration_ms: 3_374_000,
    file_size: 2_110_000_000,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: ["财务", "风险控制"],
    description: "现金流安全边界、预算节奏和经营风险控制。",
    lecturer: "李明",
    course: "企业现金流",
    category: "公开课",
    updated_at: "2024-05-07 10:22:07"
  },
  {
    source_video_id: "V000041",
    title: "利润增长的估价优化",
    file_name: "利润增长估价优化.mp4",
    relative_path: "source-videos/2024/05/利润增长估价优化.mp4",
    cover_url: cover("V41", "d8b16f"),
    duration_ms: 4_329_000,
    file_size: 2_870_000_000,
    preprocess_status: "ready",
    visible_to_cutters: true,
    tags: ["利润", "估价"],
    description: "利润结构、毛利改善和估价模型说明。",
    lecturer: "孙悦",
    course: "增长模型",
    category: "经营课",
    updated_at: "2024-05-07 10:20:13"
  },
  {
    source_video_id: "V000039",
    title: "组织复制方法",
    file_name: "组织复制方法.mp4",
    relative_path: "source-videos/2024/05/组织复制方法.mp4",
    cover_url: cover("V39", "b0a2cb"),
    duration_ms: 2_821_000,
    file_size: 1_760_000_000,
    preprocess_status: "index-required",
    visible_to_cutters: false,
    tags: ["组织", "流程"],
    description: "文案已完成，等待索引发布后才可见。",
    lecturer: "周航",
    course: "组织复制",
    category: "管理课",
    updated_at: "2024-05-07 10:16:44"
  },
  {
    source_video_id: "V000037",
    title: "客户筛选与品牌定价",
    file_name: "客户筛选与品牌定价.mp4",
    relative_path: "source-videos/2024/05/客户筛选与品牌定价.mp4",
    cover_url: cover("V37", "c79f8d"),
    duration_ms: 2_295_000,
    file_size: 1_280_000_000,
    preprocess_status: "failed",
    visible_to_cutters: false,
    tags: ["客户", "定价"],
    description: "ASR 返回错误，等待管理员重试。",
    lecturer: "林青",
    course: "品牌定价",
    category: "营销课",
    error_stage: "asr",
    error_message: "DashScope ASR 网络超时",
    updated_at: "2024-05-07 10:12:51"
  },
  {
    source_video_id: "V000044",
    title: "人工智能商业落地",
    file_name: "人工智能商业落地.mp4",
    relative_path: "source-videos/2024/05/人工智能商业落地.mp4",
    cover_url: cover("V44", "95b9a8"),
    duration_ms: 0,
    file_size: 1_920_000_000,
    preprocess_status: "unprocessed",
    visible_to_cutters: false,
    tags: ["AI", "商业"],
    description: "新扫描素材，尚未预处理。",
    lecturer: "王然",
    course: "AI 商业化",
    category: "公开课",
    updated_at: "2024-05-07 10:27:03"
  }
];

const jobs: AdminPreprocessJobsResponse = {
  active_count: 1,
  queued_count: 2,
  completed_count: 3,
  failed_count: 1,
  supervisor: {
    state: "running",
    state_label: "运行中",
    worker_id: "admin-worker-5174",
    started_at: "2024-05-07 10:24:18",
    stopped_at: "",
    last_error: "",
    stop_requested: false,
    last_result: {
      total_claimed_count: 2,
      succeeded_count: 1,
      failed_count: 1
    }
  },
  jobs: [
    {
      job_id: "J000043",
      source_video_id: "V000043",
      title: "现金流课程片段",
      status: "running",
      status_label: "正在处理",
      stage: "build-keyframes",
      stage_label: "生成关键帧",
      progress: 65,
      started_at: "2024-05-07 10:24:18",
      elapsed_ms: 272_000,
      estimated_remaining_ms: 268_000,
      estimated_start_at: "2024-05-07 10:24:18",
      estimated_done_at: "2024-05-07 10:33:18",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000043.log",
      retryable: false
    },
    {
      job_id: "J000044",
      source_video_id: "V000044",
      title: "人工智能商业落地",
      status: "queued",
      status_label: "等待处理",
      stage: "extract-audio",
      stage_label: "等待处理",
      progress: 0,
      elapsed_ms: 0,
      estimated_remaining_ms: 540_000,
      estimated_start_at: "2024-05-07 10:33:18",
      estimated_done_at: "2024-05-07 10:42:18",
      queue_position: 1,
      log_path: ".mixlab-library/logs/V000044.log",
      retryable: false
    },
    {
      job_id: "J000037",
      source_video_id: "V000037",
      title: "客户筛选与品牌定价",
      status: "failed",
      status_label: "失败可重试",
      stage: "asr",
      stage_label: "语音识别",
      progress: 0,
      failed_at: "2024-05-07 10:18:20",
      elapsed_ms: 38_000,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000037.log",
      retryable: true,
      error_message: "DashScope ASR 网络超时"
    },
    {
      job_id: "J000042",
      source_video_id: "V000042",
      title: "现金流管理与风险控制",
      status: "done",
      status_label: "已完成",
      stage: "publish-ready",
      stage_label: "发布可用产物",
      progress: 100,
      completed_at: "2024-05-07 10:23:02",
      elapsed_ms: 468_000,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "2024-05-07 10:23:02",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000042.log",
      retryable: false
    },
    {
      job_id: "J000041",
      source_video_id: "V000041",
      title: "利润增长的估价优化",
      status: "done",
      status_label: "已完成",
      stage: "publish-ready",
      stage_label: "发布可用产物",
      progress: 100,
      completed_at: "2024-05-07 10:25:40",
      elapsed_ms: 655_000,
      estimated_remaining_ms: 0,
      estimated_start_at: "",
      estimated_done_at: "2024-05-07 10:25:40",
      queue_position: 0,
      log_path: ".mixlab-library/logs/V000041.log",
      retryable: false
    }
  ],
  observability: {
    running_job_id: "J000043",
    running_source_video_id: "V000043",
    pipeline_progress_percent: 46,
    estimated_all_done_at: "2024-05-07 10:42:18",
    estimated_queue_duration_ms: 1_078_000,
    throughput_label: "预计 17:58 完成当前队列",
    load_advice: "运行负荷正常，可以继续处理"
  }
};

const indexes: AdminIndexVersionsResponse = {
  current_version: "v000027",
  current_validation_status: "pass",
  current_validation_message: "current.json 指向 v000027",
  versions: [
    {
      index_version: "v000027",
      created_at: "2024-05-07 09:51:32",
      ready_video_count: 120,
      schema_version: "1.0.0",
      validation_status: "pass",
      validation_message: "索引包校验通过",
      is_current: true,
      published_by: "admin"
    },
    {
      index_version: "v000026",
      created_at: "2024-05-06 22:10:11",
      ready_video_count: 118,
      schema_version: "1.0.0",
      validation_status: "pass",
      validation_message: "索引包校验通过",
      is_current: false,
      published_by: "admin"
    },
    {
      index_version: "v000025",
      created_at: "2024-05-05 21:47:09",
      ready_video_count: 114,
      schema_version: "1.0.0",
      validation_status: "pass",
      validation_message: "索引包校验通过",
      is_current: false,
      published_by: "admin"
    }
  ]
};

const doctorChecks: DoctorCheck[] = [
  {
    check_id: "public-root",
    label: "公共路径",
    status: "pass",
    message: "公共素材库可访问，子目录完整"
  },
  {
    check_id: "manifest",
    label: "Manifest",
    status: "pass",
    message: "manifest.json 与 source-video.json 有效"
  },
  {
    check_id: "artifacts",
    label: "视频产物",
    status: "warn",
    message: "有 5 个视频缺少可视化产物"
  },
  {
    check_id: "preprocess-logs-writable",
    label: "Preprocess Logs Writable",
    status: "pass",
    message: "preprocess log directory is writable"
  },
  {
    check_id: "preprocess-logs",
    label: "Preprocess Logs",
    status: "warn",
    message: "preprocess logs are missing for V000037"
  },
  {
    check_id: "ffmpeg",
    label: "FFmpeg",
    status: "pass",
    message: "bundled ffmpeg 可用"
  },
  {
    check_id: "asr",
    label: "ASR",
    status: "pass",
    message: "DashScope key 已配置且未暴露"
  },
  {
    check_id: "counts",
    label: "状态计数",
    status: "warn",
    message: "index-required 与 ready 边界需发布"
  },
  {
    check_id: "local-clips",
    label: "Local Clips",
    status: "warn",
    message: "LC000001: media file is missing"
  }
];

const doctor: MixlabDoctorReport = {
  schema_version: "1.0",
  generated_at: "2024-05-07 10:26:15",
  library_root: status.root_path,
  summary: {
    pass: 5,
    warn: 4,
    fail: 0
  },
  checks: doctorChecks
};

const runtime: AdminRuntimeSettings = {
  ffmpeg: {
    available: true,
    source: "bundled",
    version: "ffmpeg 6.1.1 essentials",
    last_error: ""
  },
  ffprobe: {
    available: true,
    source: "bundled",
    version: "ffprobe 6.1.1 essentials",
    last_error: ""
  },
  asr: {
    provider: "dashscope",
    provider_label: "阿里云百炼 / DashScope",
    model: "paraformer-v2",
    audio_mode: "mp3_16k_mono_64k",
    dashscope_api_key_configured: true,
    language_hints: ["zh"],
    speaker_diarization_enabled: false,
    object_storage_mode: "dashscope-temporary",
    last_failure_reason: "V000037 ASR 网络超时，可重试"
  }
};

const settings: AdminSettingsConfig = {
  schema_version: "1.0",
  library_name: "公司公开课程素材库",
  source_folders: [
    {
      id: "src_default",
      name: "默认素材来源",
      path: "/Volumes/PublicLibrary/source-videos",
      enabled: true,
      last_scanned_at: "2024-05-07 10:27:03",
      discovered_video_count: 623,
      new_unprocessed_count: 1
    },
    {
      id: "src_002",
      name: "财务课程归档",
      path: "/Volumes/CourseArchive/finance",
      enabled: true,
      last_scanned_at: "2024-05-07 09:20:00",
      discovered_video_count: 84,
      new_unprocessed_count: 0
    }
  ],
  artifact_library: {
    mode: "default",
    path: "/Volumes/PublicLibrary/.mixlab-library",
    migration_required: false
  },
  runtime_policy: {
    audio_mode: "mp3_16k_mono_64k",
    concurrent_jobs: 2,
    auto_scan_enabled: true,
    auto_queue_enabled: false,
    auto_publish_index_enabled: true
  },
  updated_at: "2024-05-07 10:27:03"
};

const usage: UsageMetrics = {
  search_request_count: 42,
  search_hit_count: 36,
  search_empty_count: 6,
  search_failure_count: 0,
  search_latency_p50_ms: 12,
  search_latency_p95_ms: 47,
  search_latency_max_ms: 68,
  searchd_search_count: 39,
  sqlite_index_search_count: 2,
  fallback_search_count: 1,
  search_backend_unknown_count: 0,
  core_search_request_count: 20,
  core_search_failure_count: 0,
  core_search_latency_p50_ms: 11,
  core_search_latency_p95_ms: 47,
  core_search_latency_max_ms: 68,
  core_searchd_search_count: 20,
  core_sqlite_index_search_count: 0,
  core_fallback_search_count: 0,
  core_search_backend_unknown_count: 0,
  source_detail_view_count: 28,
  transcript_selection_count: 19,
  add_to_cut_list_count: 11,
  cut_submission_count: 8,
  cut_success_count: 7,
  cut_failure_count: 1,
  local_clip_count: 9,
  reuse_local_clip_count: 4,
  active_user_count: 2,
  recent_keywords: ["现金流", "风险控制", "品牌定价"],
  most_used_source_video_ids: ["V000042", "V000041", "V000037"],
  users: [
    {
      user_id: "CU000002",
      username: "wangwu",
      search_request_count: 24,
      search_failure_count: 0,
      add_to_cut_list_count: 8,
      transcript_selection_count: 12,
      cut_submission_count: 5,
      cut_success_count: 5,
      local_clip_count: 6,
      reuse_local_clip_count: 1,
      last_used_at: "2024-05-07 10:25:00"
    },
    {
      user_id: "CU000003",
      username: "zhaoliu",
      search_request_count: 18,
      search_failure_count: 0,
      add_to_cut_list_count: 3,
      transcript_selection_count: 7,
      cut_submission_count: 3,
      cut_success_count: 2,
      local_clip_count: 3,
      reuse_local_clip_count: 3,
      last_used_at: "2024-05-07 10:18:00"
    }
  ]
};

const dashboardMetrics: AdminDashboardMetrics = {
  material: {
    video_count: status.video_count,
    ready_video_count: status.ready_video_count,
    total_duration_ms: 1_982_000_000,
    ready_duration_ms: 426_000_000,
    unprocessed_duration_ms: 1_120_000_000,
    total_size_bytes: 820_000_000_000
  },
  transcript: {
    transcript_video_count: 118,
    character_count: 1_240_000,
    segment_count: 24_800,
    current_index_version: status.current_index_version
  },
  production: {
    completed_today_count: 6,
    failed_today_count: 1,
    average_video_process_ms: 540_000,
    estimated_queue_done_at: "2024-05-07 15:40:00"
  },
  usage,
  risk: {
    failed_video_count: status.failed_video_count,
    index_required_video_count: status.index_required_video_count
  },
  runtime_load: {
    overall_status: "healthy",
    cpu: {
      usage_percent: 32,
      load_average_1m: 1.1,
      status: "healthy",
      label: "负荷正常"
    },
    memory: {
      total_bytes: 32_000_000_000,
      used_bytes: 15_400_000_000,
      available_bytes: 16_600_000_000,
      usage_percent: 48,
      status: "healthy",
      label: "内存充足"
    },
    disk: {
      total_bytes: status.disk_total_bytes,
      available_bytes: status.disk_available_bytes,
      usage_percent: 38,
      status: "healthy",
      label: "空间充足"
    },
    network: {
      active_interface_count: 2,
      status: "healthy",
      label: "网络可用"
    },
    service: {
      uptime_seconds: 7420,
      heartbeat_at: "2024-05-07 10:26:00",
      status: "healthy",
      label: "服务运行中"
    }
  }
};

const cutterUsers: AdminCutterUser[] = [
  {
    user_id: "CU000001",
    username: "zhangsan",
    display_name: "张三",
    status: "pending",
    applied_at: "2024-05-07 09:10:00",
    approved_at: "",
    rejected_at: "",
    disabled_at: "",
    last_login_at: "",
    last_used_at: "",
    note: "新设备申请访问素材库",
    devices: [
      {
        device_id: "device-a",
        device_name: "剪辑工作站 A",
        status: "active",
        first_seen_at: "2024-05-07 09:10:00",
        last_login_at: ""
      }
    ]
  },
  {
    user_id: "CU000002",
    username: "wangwu",
    display_name: "王五",
    status: "approved",
    applied_at: "2024-05-06 11:12:00",
    approved_at: "2024-05-06 11:30:00",
    rejected_at: "",
    disabled_at: "",
    last_login_at: "2024-05-07 10:12:00",
    last_used_at: "2024-05-07 10:25:00",
    note: "",
    devices: [
      {
        device_id: "device-b",
        device_name: "剪辑工作站 B",
        status: "active",
        first_seen_at: "2024-05-06 11:12:00",
        last_login_at: "2024-05-07 10:12:00"
      }
    ]
  }
];

function cloneSettings(value: AdminSettingsConfig): AdminSettingsConfig {
  return {
    ...value,
    source_folders: value.source_folders.map((folder) => ({ ...folder })),
    artifact_library: { ...value.artifact_library },
    runtime_policy: { ...value.runtime_policy }
  };
}

function cloneRuntimeSettings(value: AdminRuntimeSettings): AdminRuntimeSettings {
  return {
    ffmpeg: { ...value.ffmpeg },
    ffprobe: { ...value.ffprobe },
    asr: { ...value.asr, language_hints: [...value.asr.language_hints] }
  };
}

function nextSourceFolderId(sourceFolders: AdminSourceFolder[]): string {
  let maxSuffix = BigInt(sourceFolders.length);

  for (const folder of sourceFolders) {
    const match = /^src_(\d+)$/.exec(folder.id);
    if (match) {
      const suffix = BigInt(match[1] ?? "0");
      if (suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }
  }

  return `src_${String(maxSuffix + 1n).padStart(3, "0")}`;
}

function normalizeFixtureSourceFolder(
  previous: AdminSourceFolder | undefined,
  next: AdminSourceFolder
): AdminSourceFolder {
  if (!previous || previous.path === next.path) {
    return next;
  }

  return {
    ...next,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  };
}

function cloneUsageMetrics(value: UsageMetrics): UsageMetrics {
  return {
    ...value,
    recent_keywords: [...value.recent_keywords],
    most_used_source_video_ids: [...value.most_used_source_video_ids],
    users: value.users.map((user) => ({ ...user }))
  };
}

function cloneDashboardMetrics(value: AdminDashboardMetrics): AdminDashboardMetrics {
  return {
    material: { ...value.material },
    transcript: { ...value.transcript },
    production: { ...value.production },
    usage: cloneUsageMetrics(value.usage),
    risk: { ...value.risk },
    runtime_load: {
      overall_status: value.runtime_load.overall_status,
      cpu: { ...value.runtime_load.cpu },
      memory: { ...value.runtime_load.memory },
      disk: { ...value.runtime_load.disk },
      network: { ...value.runtime_load.network },
      service: { ...value.runtime_load.service }
    }
  };
}

function cloneCutterUser(user: AdminCutterUser): AdminCutterUser {
  return {
    ...user,
    devices: user.devices.map((device) => ({ ...device }))
  };
}

function artifact(sourceVideoId: string, fileName: string, exists = true): AdminArtifactDetail {
  const path = `.mixlab-library/videos/${sourceVideoId}/${fileName}`;
  return {
    path,
    file_path: `/Volumes/PublicLibrary/${path}`,
    exists
  };
}

function makeSourceVideoDetail(
  video: AdminSourceVideo,
  input: {
    jobs: AdminPreprocessJobsResponse;
    status: AdminLibraryStatus;
  }
): AdminSourceVideoDetail {
  const job = input.jobs.jobs.find((candidate) => candidate.source_video_id === video.source_video_id);
  const ready = video.preprocess_status === "ready";

  return {
    source_video: {
      ...video,
      tags: [...video.tags]
    },
    technical: {
      duration_ms: video.duration_ms,
      width: ready ? 1920 : 0,
      height: ready ? 1080 : 0,
      fps: ready ? 25 : 0,
      codec: ready ? "h264" : "",
      file_size: video.file_size,
      content_hash: ready ? `${video.source_video_id.toLowerCase()}-content-hash` : "",
      relative_path: video.relative_path
    },
    visibility: {
      visible_to_cutters: video.preprocess_status === "ready" && video.visible_to_cutters,
      label: video.preprocess_status === "ready" && video.visible_to_cutters ? "剪辑师可见" : "剪辑师暂不可见",
      reason: video.preprocess_status === "ready" && video.visible_to_cutters
        ? ""
        : video.preprocess_status !== "ready"
          ? "视频尚未完成预处理"
          : "管理员尚未开放给剪辑师"
    },
    preprocess: {
      status: video.preprocess_status,
      job_id: `J${video.source_video_id.slice(1)}`,
      stage: job?.stage ?? video.preprocess_status,
      attempt: ready ? 1 : 0,
      started_at: job?.started_at ?? "",
      completed_at: job?.completed_at ?? "",
      failed_at: job?.failed_at ?? "",
      error_stage: video.error_stage ?? "",
      error_message: video.error_message ?? ""
    },
    artifacts: {
      transcript: artifact(video.source_video_id, "transcript.json", ready),
      subtitles: artifact(video.source_video_id, "subtitles.srt", ready),
      cover: artifact(video.source_video_id, "cover.jpg", ready),
      keyframes: artifact(video.source_video_id, "keyframes.json", ready),
      index_version: ready ? input.status.current_index_version : ""
    },
    transcript: {
      full_text: ready ? "现金流，是企业经营中的关键安全边界。" : "",
      segment_count: ready ? 12 : 0,
      character_count: ready ? 19 : 0
    }
  };
}

function adminSourceVideoMatchesOptions(
  video: AdminSourceVideo,
  options?: AdminSourceVideoListOptions
): boolean {
  const matchesStatus = !options?.status || options.status === "all" || video.preprocess_status === options.status;
  const normalizedQuery = options?.query?.trim().toLocaleLowerCase() ?? "";

  if (!matchesStatus) {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [
    video.source_video_id,
    video.title,
    video.file_name,
    video.relative_path,
    video.description,
    video.lecturer,
    video.course,
    video.category,
    ...video.tags
  ].join(" ").toLocaleLowerCase();

  return searchableText.includes(normalizedQuery);
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

  function recount(): void {
    fixtureStatus = {
      ...fixtureStatus,
      ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
      processing_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "processing").length,
      queued_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "queued").length,
      unprocessed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "unprocessed").length,
      failed_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "failed").length,
      index_required_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required").length
    };
    fixtureMetrics = {
      ...fixtureMetrics,
      material: {
        ...fixtureMetrics.material,
        video_count: fixtureSourceVideos.length,
        ready_video_count: fixtureStatus.ready_video_count,
        unprocessed_duration_ms: fixtureSourceVideos
          .filter((video) => video.preprocess_status === "unprocessed")
          .reduce((total, video) => total + video.duration_ms, 0)
      },
      risk: {
        failed_video_count: fixtureStatus.failed_video_count,
        index_required_video_count: fixtureStatus.index_required_video_count
      }
    };
  }

  function queueVideos(
    statuses: AdminPreprocessStatus[],
    message: string,
    sourceVideoId?: string
  ): AdminActionResult {
    const affected = fixtureSourceVideos.filter((video) =>
      statuses.includes(video.preprocess_status) &&
      (!sourceVideoId || video.source_video_id === sourceVideoId)
    );

    fixtureSourceVideos = fixtureSourceVideos.map((video) =>
      statuses.includes(video.preprocess_status) &&
        (!sourceVideoId || video.source_video_id === sourceVideoId)
        ? {
            ...video,
            preprocess_status: "queued",
            visible_to_cutters: false,
            error_stage: undefined,
            error_message: undefined,
            updated_at: "2024-05-07 10:30:00"
          }
        : video
    );

    for (const video of affected) {
      const jobId = `J${video.source_video_id.slice(1)}`;
      const existing = fixtureJobs.jobs.find((job) => job.job_id === jobId);
      const nextJob: AdminPreprocessJob = {
        job_id: jobId,
        source_video_id: video.source_video_id,
        title: video.title,
        status: "queued",
        status_label: "等待处理",
        stage: "extract-audio",
        stage_label: "等待处理",
        progress: 0,
        elapsed_ms: 0,
        estimated_remaining_ms: fixtureMetrics.production.average_video_process_ms,
        estimated_start_at: "",
        estimated_done_at: "",
        queue_position: fixtureJobs.jobs.filter((job) => job.status === "queued").length + 1,
        log_path: `.mixlab-library/logs/${video.source_video_id}.log`,
        retryable: false
      };

      fixtureJobs = {
        ...fixtureJobs,
        jobs: existing
          ? fixtureJobs.jobs.map((job) => job.job_id === jobId ? nextJob : job)
          : [nextJob, ...fixtureJobs.jobs]
      };
    }

    recount();
    return {
      affected_count: affected.length,
      source_video_ids: affected.map((video) => video.source_video_id),
      message
    };
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
    getLibraryStatus: async () => ({ ...fixtureStatus }),
    getPathChecks: async () => fixturePathChecks.map((item) => ({ ...item })),
    getAdminSettings: async () => cloneSettings(fixtureSettings),
    saveAdminSettings: async (settingsUpdate) => saveFixtureSettings(settingsUpdate),
    addSourceFolder: async (folder) => addFixtureSourceFolder(folder),
    updateSourceFolder: async (sourceFolderId, patch) => updateFixtureSourceFolder(sourceFolderId, patch),
    removeSourceFolder: async (sourceFolderId) => removeFixtureSourceFolder(sourceFolderId),
    getDashboardMetrics: async () => cloneDashboardMetrics(fixtureMetrics),
    listSourceVideos: async (options) => {
      const offset = options?.offset && options.offset > 0 ? options.offset : 0;
      const limit = options?.limit && options.limit > 0 ? options.limit : fixtureSourceVideos.length;

      return fixtureSourceVideos
        .filter((video) => adminSourceVideoMatchesOptions(video, options))
        .slice(offset, offset + limit)
        .map((video) => ({
          ...video,
          tags: [...video.tags]
        }));
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
    publishSourceVideo: async (sourceVideoId) => {
      const affected = fixtureSourceVideos.filter((video) =>
        video.preprocess_status === "index-required" &&
        video.source_video_id === sourceVideoId
      );

      fixtureSourceVideos = fixtureSourceVideos.map((video) =>
        video.preprocess_status === "index-required" && video.source_video_id === sourceVideoId
          ? {
              ...video,
              preprocess_status: "ready",
              visible_to_cutters: true,
              updated_at: "2024-05-07 10:31:00"
            }
          : video
      );
      if (affected.length > 0) {
        fixtureIndexes = {
          current_version: "v000028",
          current_validation_status: "pass",
          current_validation_message: "current.json 指向 v000028",
          versions: [
            {
              index_version: "v000028",
              created_at: "2024-05-07 10:31:00",
              ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
              schema_version: "1.0.0",
              validation_status: "pass",
              validation_message: "索引包校验通过",
              is_current: true,
              published_by: "admin"
            },
            ...fixtureIndexes.versions.map((version) => ({ ...version, is_current: false }))
          ]
        };
        fixtureStatus = {
          ...fixtureStatus,
          current_index_version: "v000028",
          index_status: "ready"
        };
      }
      recount();

      return {
        affected_count: affected.length,
        prepared_source_video_ids: affected.map((video) => video.source_video_id),
        published_source_video_ids: affected.map((video) => video.source_video_id),
        skipped_source_video_ids: [],
        published_count: affected.length,
        skipped_count: 0,
        ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
        message: affected.length > 0
          ? `已发布 ${affected.length} 个原视频，当前可用 ${fixtureStatus.ready_video_count} 个。`
          : "没有需要发布的待索引视频。"
      };
    },
    repairIndex: async () => {
      const affected = fixtureSourceVideos.filter((video) => video.preprocess_status === "index-required");

      fixtureSourceVideos = fixtureSourceVideos.map((video) =>
        video.preprocess_status === "index-required"
          ? {
              ...video,
              preprocess_status: "ready",
              visible_to_cutters: true,
              updated_at: "2024-05-07 10:31:00"
            }
          : video
      );
      fixtureIndexes = {
        current_version: "v000028",
        current_validation_status: "pass",
        current_validation_message: "current.json 指向 v000028",
        versions: [
          {
            index_version: "v000028",
            created_at: "2024-05-07 10:31:00",
            ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
            schema_version: "1.0.0",
            validation_status: "pass",
            validation_message: "索引包校验通过",
            is_current: true,
            published_by: "admin"
          },
          ...fixtureIndexes.versions.map((version) => ({ ...version, is_current: false }))
        ]
      };
      fixtureStatus = {
        ...fixtureStatus,
        current_index_version: "v000028",
        index_status: "ready"
      };
      recount();

      return {
        affected_count: affected.length,
        prepared_source_video_ids: affected.map((video) => video.source_video_id),
        published_source_video_ids: affected.map((video) => video.source_video_id),
        skipped_source_video_ids: [],
        published_count: affected.length,
        skipped_count: 0,
        ready_video_count: fixtureSourceVideos.filter((video) => video.preprocess_status === "ready").length,
        message: affected.length > 0
          ? `已发布 ${affected.length} 个原视频，当前可用 ${fixtureStatus.ready_video_count} 个。`
          : "没有需要发布的待索引视频。"
      };
    },
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
      let updated: AdminSourceVideo | undefined;

      fixtureSourceVideos = fixtureSourceVideos.map((video) => {
        if (video.source_video_id !== sourceVideoId) {
          return video;
        }

        updated = {
          ...video,
          ...metadata,
          tags: metadata.tags ?? video.tags,
          updated_at: "2024-05-07 10:32:00"
        };
        return updated;
      });

      if (!updated) {
        throw new Error(`source video not found: ${sourceVideoId}`);
      }

      return updated;
    },
    updateSourceVideoCover: async (sourceVideoId, coverUpdate) => {
      let updated: AdminSourceVideo | undefined;

      fixtureSourceVideos = fixtureSourceVideos.map((video) => {
        if (video.source_video_id !== sourceVideoId) {
          return video;
        }

        updated = {
          ...video,
          cover_url: `data:${coverUpdate.content_type};base64,${coverUpdate.image_base64}`,
          updated_at: "2024-05-07 10:33:00"
        };
        return updated;
      });

      if (!updated) {
        throw new Error(`source video not found: ${sourceVideoId}`);
      }

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
      users: []
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

function fastLoadFallbackStatus(): AdminLibraryStatus {
  return {
    ...status,
    name: "主素材库",
    active_task_label: "后台刷新中",
    updated_at: new Date().toISOString()
  };
}

export async function loadAdminDashboardData(
  client: AdminApiClient,
  options: LoadAdminDashboardDataOptions = {}
): Promise<AdminDashboardData> {
  const includeHeavy = options.includeHeavy ?? true;
  const fastFallbackStatus = fastLoadFallbackStatus();

  if (!includeHeavy) {
    const [
      libraryStatus,
      adminSettings,
      adminSupervisor
    ] = await Promise.all([
      settleWithin(client.getLibraryStatus(), fastFallbackStatus, 6_000),
      settleWithin(client.getAdminSettings(), cloneSettings(settings), 6_000),
      settleWithin(client.getPreprocessSupervisorStatus(), jobs.supervisor, 6_000)
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
      metrics: placeholderDashboardMetrics(libraryStatus)
    };
  }

  const [
    libraryStatus,
    adminSettings,
    adminRuntime,
    adminSourceVideos,
    adminJobs,
    adminSupervisor
  ] = await Promise.all([
    client.getLibraryStatus(),
    client.getAdminSettings(),
    client.getRuntimeSettings(),
    includeHeavy ? client.listSourceVideos() : Promise.resolve([]),
    includeHeavy ? client.listPreprocessJobs({ limit: ADMIN_PREPROCESS_JOB_DEFAULT_LOAD_LIMIT }) : Promise.resolve(null),
    includeHeavy ? Promise.resolve(null) : client.getPreprocessSupervisorStatus()
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
    metrics: includeHeavy ? await client.getDashboardMetrics() : placeholderDashboardMetrics(libraryStatus)
  };
}
