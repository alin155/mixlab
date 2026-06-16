export type RunnerSuite = "probe_api";

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
  | "app_launch_failure"
  | "api_health_timeout"
  | "api_auth_failure"
  | "real_data_unavailable"
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
  probe_api?: ProbeApiReport;
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
