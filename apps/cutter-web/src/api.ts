export interface CutterApiEnvelope<T> {
  schema_version: string;
  data: T;
}

export interface CutterApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
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
  media_url?: string;
  cover_url?: string;
  detail_url?: string;
  subtitles_url?: string;
}

export interface SearchResponse {
  query: string;
  normalized_query: string;
  groups: SearchGroup[];
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
  available_video_count: number;
  workspace_enabled: boolean;
  workspace_root_label: string;
  local_clip_count: number;
  ffmpeg_status: "可用" | "不可用";
  ffmpeg_source: "内置" | "环境配置" | "未检测到";
  current_user: {
    user_id: string;
    username: string;
    display_name: string;
  };
}

export interface CutterAuthHeaders {
  device_id: string;
  session_token: string;
}

export interface CutterApiClientInput {
  base_url: string;
  fetch?: typeof fetch;
  auth?: CutterAuthHeaders;
}

export class CutterApiError extends Error {
  readonly name = "CutterApiError";
  readonly status: number;
  readonly code: string;

  constructor(input: { status: number; code: string; message: string }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
  }
}

export interface CutterApiClient {
  requestLogin(input: CutterLoginRequest): Promise<CutterLoginApplication>;
  getLoginStatus(): Promise<CutterLoginStatus>;
  getRuntimeStatus(): Promise<CutterRuntimeStatus>;
  listSourceLibrary(): Promise<SourceLibraryResponse>;
  getSourceVideoDetail(sourceVideoId: string): Promise<SourceVideoDetail>;
  searchSourceLibrary(query: string, limit?: number): Promise<SearchResponse>;
  listLocalClips(): Promise<LocalClipCatalog>;
  getLocalClipDetail(localClipId: string): Promise<LocalClip>;
  createLocalClip(request: CreateLocalClipRequest): Promise<LocalClip>;
  createClipList(request: CreateClipListRequest): Promise<ClipList>;
  submitCutJobs(request: SubmitCutJobsRequest): Promise<CutJobSubmission>;
  listCutJobs(): Promise<CutJobCatalog>;
  runNextCutJob(): Promise<CutJob | null>;
  retryCutJob(cutJobId: string): Promise<CutJob>;
  openCutOutputDirectory(request?: OpenCutOutputDirectoryRequest): Promise<OpenCutOutputDirectoryResult>;
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
    const errorBody = body as CutterApiErrorBody;
    throw new CutterApiError({
      status: response.status,
      code: errorBody.error?.code ?? "api_error",
      message: errorBody.error?.message ?? `Request failed with status ${response.status}`
    });
  }

  return (body as CutterApiEnvelope<T>).data;
}

export function createCutterApiClient(input: CutterApiClientInput): CutterApiClient {
  const fetchImpl = input.fetch ?? fetch;
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

    getLoginStatus() {
      return requestEnvelope<CutterLoginStatus>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/auth/status"),
        {
          headers: protectedHeaders
        }
      );
    },

    getRuntimeStatus() {
      return requestEnvelope<CutterRuntimeStatus>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/runtime-status"),
        {
          headers: protectedHeaders
        }
      );
    },

    listSourceLibrary() {
      return requestEnvelope<SourceLibraryResponse>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/source-library"),
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

    searchSourceLibrary(query: string, limit = 20) {
      const params = new URLSearchParams({
        query,
        limit: String(limit)
      });
      return requestEnvelope<SearchResponse>(
        fetchImpl,
        appendPath(input.base_url, `/cutter/source-search?${params.toString()}`),
        {
          headers: protectedHeaders
        }
      );
    },

    listLocalClips() {
      return requestEnvelope<LocalClipCatalog>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/local-clips"),
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

    listCutJobs() {
      return requestEnvelope<CutJobCatalog>(
        fetchImpl,
        appendPath(input.base_url, "/cutter/cut-jobs"),
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
