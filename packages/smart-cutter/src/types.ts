export type Platform = "douyin";
export type CreationMode = "manual" | "automatic";
export type MatchKind = "exact" | "near" | "conflict" | "gap" | "pending";
export type CropMode = "portrait" | "follow" | "center" | "fit";
export type JobStatus = "queued" | "running" | "paused" | "cancelled" | "failed" | "needs_review" | "done";

export interface Settings {
  library_root: string;
  workspace_root: string;
  monitor_platform: Platform;
  monitor_interval_minutes: number;
  request_limit_per_day: number;
  reference_cache_gb: number;
  source_cache_gb: number;
  max_download_mb: number;
  asr_model: string;
  default_source_folder: string;
  teacher_folder_bindings?: Record<string, string>;
  device_id: string;
}
export interface OutputSettings {
  ratio: "9:16" | "16:9";
  crop_mode: CropMode;
  crop_position: number;
  shot_size?: "wide" | "medium" | "close";
  subtitles: boolean;
  subtitle_style: "white" | "yellow" | "outline" | "box" | "cinema" | "pop";
  subtitle_size: number;
  subtitle_margin?: number;
  normalize_audio: boolean;
  source_folder: string;
  teacher?: string;
  same_lecturer: boolean;
}
export const DEFAULT_OUTPUT: OutputSettings = {
  ratio: "9:16", crop_mode: "portrait", crop_position: 0.5, shot_size: "medium",
  subtitles: true, subtitle_style: "outline", subtitle_size: 58, subtitle_margin: 0.12,
  normalize_audio: true, source_folder: "", same_lecturer: true
};
export interface Candidate {
  rotation?: 0 | 90 | 180 | 270;
  id: string;
  snapshot_id: string;
  source_video_id: string;
  source_title: string;
  source_folder: string;
  lecturer: string;
  segment_ids: string[];
  actual: string;
  begin_ms: number;
  end_ms: number;
  kind: Exclude<MatchKind, "gap" | "pending">;
  score: number;
  width: number;
  height: number;
  source_file_path: string;
  cover_file_path: string;
  fingerprint: { size: number; mtime_ms: number };
  content_hash?: string;
}
export interface WorkSegment {
  id: number;
  target: string;
  actual: string;
  status: MatchKind;
  accepted: boolean;
  skipped?: boolean;
  selected: Candidate | null;
  candidates: Candidate[];
  reason: string;
  retrieval?: { mode: "ann" | "candidate"; complete: boolean; examined: number };
}
export interface WorkOrigin {
  trigger: CreationMode;
  kind: "manual_script" | "hot_manual" | "rule";
  platform?: Platform;
  account_id?: string;
  account_name?: string;
  rule_id?: string;
  rule_name?: string;
  hot_id?: string;
  reference_title?: string;
}
export type MatchPhase = "snapshot_check" | "snapshot_sync" | "snapshot_ready" | "text_search" | "source_check" | "semantic_wait" | "semantic_index" | "semantic_search" | "complete" | "failed";
export interface MatchActivity { phase: MatchPhase; snapshot_id?: string; snapshot_version?: string }
export interface MatchProgress extends MatchActivity {
  started_at: string;
  updated_at: string;
  total_sentences: number;
  completed_sentences: number;
  current_sentence: number;
  exact_matches: number;
  near_matches: number;
  missing_matches: number;
  pending_matches?: number;
  semantic?: { running: boolean; done: number; total: number; error: string; snapshot_id: string; version: string };
}
export interface Work {
  id: string;
  title: string;
  script: string;
  original_script: string;
  origin: WorkOrigin;
  revision: number;
  status: "draft" | "matching" | "review" | "ready" | "rendering" | "done" | "failed";
  snapshot_id: string;
  segments: WorkSegment[];
  settings: OutputSettings;
  created_at: string;
  updated_at: string;
  error: string;
  match_progress?: MatchProgress;
}
export interface FacePoint { at_ms: number; x: number; y?: number; width?: number; height?: number; confidence: number }
export interface Composition {
  usable: boolean;
  reason: string;
  points: FacePoint[];
  multiple_faces: boolean;
  source_aspect?: number;
  crop_height?: number;
  target_face_ratio?: number;
}
export interface Job {
  id: string;
  work_id: string;
  revision: number;
  work: Work;
  status: JobStatus;
  phase: string;
  progress: number;
  error: string;
  created_at: string;
  updated_at: string;
  output_path: string;
  manifest_path: string;
  workspace_root: string;
  duration_ms: number;
  completed_clips: string[];
  clip_checksums?: Record<string, string>;
  compositions: Record<string, Composition>;
  result_sha256?: string;
}
export interface Account {
  id: string;
  platform: Platform;
  name: string;
  input: string;
  sec_user_id: string;
  unique_id: string;
  group: string;
  enabled: boolean;
  followers: number | null;
  last_checked_at: string;
  last_error: string;
  cursor: string;
  teacher?: string;
}
export interface VideoStats {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  plays: number | null;
}
export interface Observation { at: string; stats: VideoStats }
export interface HotVideo {
  id: string;
  platform: Platform;
  video_id: string;
  account_id: string;
  author: string;
  title: string;
  published_at: string;
  duration_ms: number;
  download_url: string;
  cover_url: string;
  observations: Observation[];
  growth_per_hour: number | null;
  status: "discovered" | "downloading" | "transcribing" | "ready" | "failed";
  error: string;
  local_video_path: string;
  local_audio_path: string;
  transcript: string;
  asr_task_id: string;
  asr_model: string;
  asr_submitted_at?: string;
  updated_at: string;
}
export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  platform: Platform;
  account_group: string;
  max_age_hours: number;
  min_likes: number;
  min_growth_per_hour: number;
  execution: "plan" | "review" | "qualified";
  daily_limit: number;
  candidates_per_run: number;
  source_folder: string;
  last_run_at: string;
  last_error: string;
}
export class SmartError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function requireText(value: unknown, label: string, max = 20_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new SmartError("invalid_input", `${label}不能为空，且不得超过 ${max} 字符`);
  }
  return value.trim();
}
export function boundedNumber(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new SmartError("invalid_input", `${label}必须在 ${min} 到 ${max} 之间`);
  }
  return value;
}
export function validatePlatform(value: unknown): Platform {
  if (value !== "douyin") throw new SmartError("invalid_platform", "首期监控平台为抖音");
  return value;
}
export function splitScript(script: string): string[] {
  return script.split(/(?<=[。！？!?])\s*|[\r\n]+/u).map(text => text.trim()).filter(Boolean);
}
export function automaticTitle(script: string): string {
  const first = splitScript(script)[0]?.replace(/[。！？!?]+$/u, "") ?? "";
  const chars = Array.from(first);
  return chars.length > 22 ? `${chars.slice(0, 21).join("")}…` : first;
}
export function workReady(work: Work): boolean {
  const segments = includedSegments(work);
  return !!work.settings.teacher && segments.length > 0 && segments.every(segment =>
    segment.selected !== null && !!segment.actual.trim() &&
    (segment.status === "exact" || segment.status === "near" && segment.accepted)
  );
}
export function includedSegments(work: Work): WorkSegment[] { return work.segments.filter(segment => !segment.skipped); }
