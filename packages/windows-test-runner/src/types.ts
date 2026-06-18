export type RunnerSuite =
  | "probe_api"
  | "launch_app_probe"
  | "launch_runner"
  | "app_runtime_smoke"
  | "real_data_smoke"
  | "cache_smoke"
  | "real_cut_smoke"
  | "windows_acceptance"
  | "install_latest_and_smoke";

export type RunnerStatus =
  | "queued"
  | "starting"
  | "running"
  | "writing_report"
  | "passed"
  | "failed"
  | "cancelled";

export type FailureCategory =
  | "runner_unreachable"
  | "app_executable_not_found"
  | "app_launch_failure"
  | "api_health_timeout"
  | "api_auth_failure"
  | "real_data_unavailable"
  | "public_library_slow"
  | "search_failure"
  | "transcript_failure"
  | "cut_failure"
  | "cache_not_growing"
  | "runner_launch_failure"
  | "runner_ready_timeout"
  | "installer_missing"
  | "installer_hash_mismatch"
  | "installer_failed"
  | "unknown";

export interface RunnerConfig {
  host: string;
  port: number;
  share_root: string;
  reports_root: string;
  cutter_api_base_url: string;
  runner_version: string;
}

export interface RunRequest {
  suite: RunnerSuite;
  options?: Record<string, unknown>;
}

export interface TimelineEvent {
  at: string;
  stage: RunnerStatus | string;
  message: string;
  details?: unknown;
}

export interface ApiProbeResult {
  id: string;
  path: string;
  url: string;
  ok: boolean;
  status_code: number | null;
  elapsed_ms: number;
  body?: unknown;
  error?: string;
}

export interface ProbeApiReport {
  api_base_url: string;
  probes: ApiProbeResult[];
}

export interface LaunchAppCandidate {
  path: string;
  exists: boolean;
}

export interface DesktopDiagnosticFile {
  path: string;
  exists: boolean;
  size_bytes?: number;
  tail?: string;
  error?: string;
}

export interface DesktopDiagnosticsReport {
  collected_at: string;
  appdata?: string;
  localappdata?: string;
  userprofile?: string;
  files: DesktopDiagnosticFile[];
}

export interface LaunchAppProbeReport {
  api_base_url: string;
  api_ready_before_launch: boolean;
  api_ready: boolean;
  api_ready_elapsed_ms: number;
  app_started: boolean;
  app_executable_path?: string;
  app_launch_method?: "direct" | "windows_shortcut";
  app_shortcut_path?: string;
  app_pid?: number;
  launch_error?: string;
  health_status_code?: number | null;
  health_error?: string;
  candidates: LaunchAppCandidate[];
  desktop_diagnostics?: DesktopDiagnosticsReport;
  probe_api?: ProbeApiReport;
}

export interface LaunchRunnerReport {
  requested_port: number;
  host: string;
  health_url: string;
  version_url: string;
  already_ready: boolean;
  ready: boolean;
  ready_elapsed_ms: number;
  expected_runner_version?: string;
  observed_runner_version?: string;
  shared_manifest_path: string;
  shared_manifest_version?: string;
  source_runner_path: string;
  local_runner_path: string;
  copied_runner: boolean;
  child_pid?: number;
  launch_error?: string;
  ready_error?: string;
}

export interface SourceLibrarySmokeSummary {
  library_id?: string;
  available_video_count: number;
  returned_count: number;
  first_source_video_id?: string;
  first_title?: string;
  elapsed_ms: number;
}

export interface RuntimeCacheBucketSummary {
  cache_root_path?: string;
  size_bytes?: number;
  file_count?: number;
  cached_video_count?: number;
  max_bytes?: number;
  last_error?: string;
}

export interface RuntimeStatusSmokeSummary {
  mode?: string;
  mode_label?: string;
  api_ready?: boolean;
  auth_mode?: string;
  library_id?: string;
  library_root_label?: string;
  library_root_path?: string;
  available_video_count?: number;
  workspace_enabled?: boolean;
  workspace_root_label?: string;
  workspace_root_path?: string;
  ffmpeg_status?: string;
  ffmpeg_source?: string;
  release_cache?: RuntimeCacheBucketSummary;
  thumbnail_cache?: RuntimeCacheBucketSummary;
  source_video_cache?: RuntimeCacheBucketSummary;
  cut_temp_cache?: RuntimeCacheBucketSummary;
  source_video_preflight?: unknown;
  elapsed_ms: number;
}

export interface AppRuntimeSmokeReport {
  api_base_url: string;
  launch_app_probe: LaunchAppProbeReport;
  checks: ApiProbeResult[];
  auth_mode?: string;
  local_trusted?: boolean;
  runtime_status?: RuntimeStatusSmokeSummary;
  source_library?: SourceLibrarySmokeSummary;
  public_library_max_elapsed_ms: number;
}

export interface SearchSmokeSummary {
  query: string;
  elapsed_ms: number;
  returned_group_count: number;
  total_hit_count: number;
  search_ms?: number;
  search_mode?: string;
  first_source_video_id?: string;
  first_title?: string;
  first_detail_url?: string;
}

export interface SourceVideoDetailSmokeSummary {
  source_video_id: string;
  title?: string;
  elapsed_ms: number;
  transcript_character_count: number;
  transcript_segment_count: number;
}

export interface CutJobsSmokeSummary {
  elapsed_ms: number;
  job_count: number;
  pending_count: number;
  running_count: number;
  done_count: number;
  failed_count: number;
  cancelled_count: number;
}

export interface RealDataSmokeReport {
  api_base_url: string;
  queries: string[];
  checks: ApiProbeResult[];
  source_library?: SourceLibrarySmokeSummary;
  searches: SearchSmokeSummary[];
  selected_search?: SearchSmokeSummary;
  selected_detail?: SourceVideoDetailSmokeSummary;
  cut_jobs?: CutJobsSmokeSummary;
}

export interface CacheSmokeReport {
  api_base_url: string;
  checks: ApiProbeResult[];
  runtime_status?: RuntimeStatusSmokeSummary;
  total_observed_cache_size_bytes: number;
  observed_cache_bucket_count: number;
}

export interface CutPhaseTimingSummary {
  phase_id?: string;
  label?: string;
  status?: string;
  duration_ms?: number;
}

export interface RealCutSmokeReport {
  api_base_url: string;
  app_runtime_smoke?: AppRuntimeSmokeReport;
  checks: ApiProbeResult[];
  query: string;
  selected_source_video_id?: string;
  selected_title?: string;
  selected_segment_id?: string;
  selected_text_preview?: string;
  begin_ms?: number;
  end_ms?: number;
  selected_duration_ms?: number;
  cut_mode: string;
  project_id?: string;
  project_title?: string;
  clip_list_id?: string;
  cut_job_id?: string;
  run_next_status?: string;
  run_next_elapsed_ms?: number;
  export_clip_id?: string;
  output_file?: string;
  phase_timings?: CutPhaseTimingSummary[];
}

export interface WindowsAcceptanceReport {
  api_base_url: string;
  app_runtime_smoke?: AppRuntimeSmokeReport;
  real_data_smoke?: RealDataSmokeReport;
  cache_smoke?: CacheSmokeReport;
}

export interface ProcessExitSummary {
  command: string;
  args: string[];
  exit_code: number | null;
  elapsed_ms: number;
  stdout_tail?: string;
  stderr_tail?: string;
  error?: string;
}

export interface InstallLatestAndSmokeReport {
  installer_source_path: string;
  installer_local_path: string;
  expected_sha256?: string;
  actual_sha256?: string;
  copied_installer: boolean;
  unblocked_installer?: ProcessExitSummary;
  stopped_processes: ProcessExitSummary[];
  install_exit_code: number | null;
  install_elapsed_ms: number;
  installer_stdout_tail?: string;
  installer_stderr_tail?: string;
  installer_error?: string;
  windows_acceptance?: WindowsAcceptanceReport;
}

export interface RunReport {
  schema_version: "1.0";
  run_id: string;
  suite: RunnerSuite;
  status: RunnerStatus;
  runner_version: string;
  started_at: string;
  updated_at: string;
  finished_at?: string;
  failure_category?: FailureCategory;
  failure_message?: string;
  report_dir: string;
  timeline_path: string;
  summary_path: string;
  report_write_error?: string;
  probe_api?: ProbeApiReport;
  launch_app_probe?: LaunchAppProbeReport;
  launch_runner?: LaunchRunnerReport;
  app_runtime_smoke?: AppRuntimeSmokeReport;
  real_data_smoke?: RealDataSmokeReport;
  cache_smoke?: CacheSmokeReport;
  real_cut_smoke?: RealCutSmokeReport;
  windows_acceptance?: WindowsAcceptanceReport;
  install_latest_and_smoke?: InstallLatestAndSmokeReport;
}

export interface RunRecord extends RunReport {
  request: RunRequest;
  timeline: TimelineEvent[];
}

export interface RunSummary {
  run_id: string;
  suite: RunnerSuite;
  status: RunnerStatus;
  failure_category?: FailureCategory;
  failure_message?: string;
  report_path?: string;
  summary_path?: string;
}
