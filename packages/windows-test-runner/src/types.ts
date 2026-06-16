export type RunnerSuite = "probe_api" | "launch_app_probe" | "launch_runner";

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
  | "runner_launch_failure"
  | "runner_ready_timeout"
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
