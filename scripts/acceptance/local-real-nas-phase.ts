import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateLocalWebSanityReportFile } from "./local-web-sanity-report.ts";

const DEFAULT_LOCAL_WEB_REPORT_PATH = "docs/acceptance/artifacts/local-web-sanity.json";
const DEFAULT_REAL_NAS_50_REPORT_PATH = "docs/acceptance/artifacts/real-nas-50-editor-report.json";
const DEFAULT_ACCEPTANCE_RECORD_PATH = "docs/acceptance/local-web-real-nas.md";
const NAS_50_SELF_CHECK_PATH = "scripts/acceptance/nas-50-editor-report-self-check.sh";
const PREPROCESS_WRITE_ACTION_LABELS = [
  "重试失败",
  "发布待索引视频",
  "校验索引",
  "恢复处理中任务",
  "启动预处理流水线",
  "暂停预处理流水线"
] as const;
const DASHBOARD_WRITE_ACTION_LABELS = [
  "智能扫描"
] as const;
const SOURCE_VIDEO_WRITE_ACTION_LABELS = [
  "重试此视频",
  "保存封面",
  "保存公开说明"
] as const;
const LOCAL_REAL_NAS_P95_SLA_MS = 1_000;
const LOCAL_REAL_NAS_MIN_SEARCH_QUERY_COUNT = 5;

interface LocalWebPhaseSnapshot {
  index_version: string;
  source_video_count: number;
  transcript_segment_count: number;
  search_p95_ms: number;
  active_cutter_count: number;
  cutter_capacity: number;
  search_failure_count: number;
  dashboard_write_action_lock_labels: string[];
  source_video_web_first_id: string;
  source_video_web_loaded_before: number;
  source_video_web_loaded_after: number;
  source_video_web_query: string;
  source_video_web_query_result_id: string;
  source_video_web_ready_status_count: number;
  source_video_web_source_path_visible: boolean;
  source_video_web_loaded_count_increased: boolean;
  source_video_web_query_response_observed: boolean;
  source_video_web_query_result_matches_api: boolean;
  source_video_web_ready_filter_response_observed: boolean;
  source_video_web_ready_filter_all_visible_rows_ready: boolean;
  source_video_write_action_lock_labels: string[];
  preprocess_web_current_index_version: string;
  preprocess_web_source_video_count: number;
  preprocess_web_queued_count: number;
  preprocess_web_failed_count: number;
  preprocess_web_production_status_title: string;
  preprocess_web_visible_job_id: string;
  preprocess_web_log_job_id: string;
  preprocess_web_log_record_source: string;
  preprocess_web_log_content_char_count: number;
  preprocess_safety_labels: string[];
  preprocess_write_action_lock_labels: string[];
  cutter_users_web_user_count: number;
  cutter_users_web_approved_count: number;
  cutter_users_web_pending_count: number;
  cutter_users_web_first_user_id: string;
  cutter_users_web_first_display_name: string;
  cutter_users_web_first_device_name: string;
  cutter_public_library_available_count: number;
  cutter_public_library_returned_count: number;
  cutter_public_library_first_source_video_id: string;
  cutter_public_library_first_title: string;
  material_query: string;
  material_search_index_version: string;
  material_candidate_count: number;
  selection_method: string;
  selection_proof_text: string;
  selected_text_char_count: number;
  selected_sentence_count: number;
  selected_text_segment_count: number;
  selected_text_is_broader_than_query: boolean;
  local_clip_id: string;
  local_library_page_url: string;
  local_library_view_mode: string;
  local_library_visible_clip_count: number;
  local_library_clip_title: string;
  local_library_source_title: string;
  cut_job_id: string;
  cut_tasks_page_url: string;
  cut_tasks_page_visible_status_label: string;
  cut_tasks_page_visible_output_file: string;
  cut_tasks_page_source_title: string;
  cut_tasks_page_time_range_label: string;
  public_library_write_detected: boolean;
}

interface RealNas50PhaseSnapshot {
  index_version: string;
  indexed_source_video_count: number;
  indexed_transcript_segment_count: number;
  editor_count: number;
  active_user_count: number;
  distinct_source_video_count: number;
  search_query_count: number;
  search_queries: string[];
  search_p95_ms: number;
  detail_p95_ms: number;
  cut_p95_ms: number;
  search_failure_count: number;
}

interface LocalRealNasPhaseAuditInput {
  local_web_report_path: string;
  real_nas_50_report_path: string;
  acceptance_record_path: string;
}

export interface LocalRealNasPhaseAuditReport {
  ok: boolean;
  errors: string[];
  local_web_report_path: string;
  real_nas_50_report_path: string;
  acceptance_record_path: string;
  local_web?: LocalWebPhaseSnapshot;
  real_nas_50?: RealNas50PhaseSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function booleanField(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : false;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function recordArrayField(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }

  return parsed;
}

function addPositiveIntegerCheck(errors: string[], value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    errors.push(`${label} must be a positive integer`);
  }
}

function addP95Check(errors: string[], value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > LOCAL_REAL_NAS_P95_SLA_MS) {
    errors.push(`${label} must be a finite millisecond value no higher than ${LOCAL_REAL_NAS_P95_SLA_MS}`);
  }
}

function localWebSnapshot(report: Record<string, unknown>): LocalWebPhaseSnapshot {
  const searchdIndex = readNestedRecord(report, "searchd_index");
  const adminDashboard = readNestedRecord(report, "admin_dashboard");
  const adminRealNasMatrix = readNestedRecord(report, "admin_real_nas_matrix");
  const adminSourceVideoWeb = readNestedRecord(adminRealNasMatrix, "source_video_web");
  const adminPreprocessWeb = readNestedRecord(adminRealNasMatrix, "preprocess_web");
  const adminCutterUsersWeb = readNestedRecord(adminRealNasMatrix, "cutter_users_web");
  const sourceVideosRoute = recordArrayField(adminRealNasMatrix, "web_routes").find(
    (route) => stringField(route, "route") === "source-videos"
  ) ?? {};
  const preprocessRoute = recordArrayField(adminRealNasMatrix, "web_routes").find(
    (route) => stringField(route, "route") === "preprocess-jobs"
  ) ?? {};
  const materialLocator = readNestedRecord(report, "material_locator");
  const cutterPublicLibraryWeb = readNestedRecord(report, "cutter_public_library_web");
  const closedLoop = readNestedRecord(report, "material_locator_closed_loop");

  return {
    index_version: stringField(searchdIndex, "index_version"),
    source_video_count: numberField(searchdIndex, "source_video_count"),
    transcript_segment_count: numberField(searchdIndex, "segment_count"),
    search_p95_ms: numberField(adminDashboard, "search_p95_ms"),
    active_cutter_count: numberField(adminDashboard, "active_cutter_count"),
    cutter_capacity: numberField(adminDashboard, "cutter_capacity"),
    search_failure_count: numberField(adminDashboard, "search_failure_count"),
    dashboard_write_action_lock_labels: stringArrayField(adminDashboard, "disabled_write_action_labels").filter((label) =>
      DASHBOARD_WRITE_ACTION_LABELS.includes(label as typeof DASHBOARD_WRITE_ACTION_LABELS[number])
    ),
    source_video_web_first_id: stringField(adminSourceVideoWeb, "first_page_first_id"),
    source_video_web_loaded_before: numberField(adminSourceVideoWeb, "loaded_count_before"),
    source_video_web_loaded_after: numberField(adminSourceVideoWeb, "loaded_count_after"),
    source_video_web_query: stringField(adminSourceVideoWeb, "query"),
    source_video_web_query_result_id: stringField(adminSourceVideoWeb, "query_result_id"),
    source_video_web_ready_status_count: numberField(adminSourceVideoWeb, "ready_filter_visible_status_count"),
    source_video_web_source_path_visible: booleanField(adminSourceVideoWeb, "source_path_visible"),
    source_video_web_loaded_count_increased: booleanField(adminSourceVideoWeb, "loaded_count_increased"),
    source_video_web_query_response_observed: booleanField(adminSourceVideoWeb, "query_response_observed"),
    source_video_web_query_result_matches_api: booleanField(adminSourceVideoWeb, "query_result_matches_api"),
    source_video_web_ready_filter_response_observed: booleanField(adminSourceVideoWeb, "ready_filter_response_observed"),
    source_video_web_ready_filter_all_visible_rows_ready: booleanField(adminSourceVideoWeb, "ready_filter_all_visible_rows_ready"),
    source_video_write_action_lock_labels: stringArrayField(sourceVideosRoute, "disabled_write_action_labels").filter((label) =>
      SOURCE_VIDEO_WRITE_ACTION_LABELS.includes(label as typeof SOURCE_VIDEO_WRITE_ACTION_LABELS[number])
    ),
    preprocess_web_current_index_version: stringField(adminPreprocessWeb, "current_index_version"),
    preprocess_web_source_video_count: numberField(adminPreprocessWeb, "source_video_count"),
    preprocess_web_queued_count: numberField(adminPreprocessWeb, "queued_count"),
    preprocess_web_failed_count: numberField(adminPreprocessWeb, "failed_count"),
    preprocess_web_production_status_title: stringField(adminPreprocessWeb, "production_status_title"),
    preprocess_web_visible_job_id: stringField(adminPreprocessWeb, "visible_job_id"),
    preprocess_web_log_job_id: stringField(adminPreprocessWeb, "log_job_id"),
    preprocess_web_log_record_source: stringField(adminPreprocessWeb, "log_record_source"),
    preprocess_web_log_content_char_count: numberField(adminPreprocessWeb, "log_content_char_count"),
    preprocess_safety_labels: stringArrayField(preprocessRoute, "visible_labels").filter((label) =>
      ["真实 NAS 安全边界", "只读观察", "人工确认", "本机工作区"].includes(label)
    ),
    preprocess_write_action_lock_labels: stringArrayField(preprocessRoute, "disabled_write_action_labels").filter((label) =>
      PREPROCESS_WRITE_ACTION_LABELS.includes(label as typeof PREPROCESS_WRITE_ACTION_LABELS[number])
    ),
    cutter_users_web_user_count: numberField(adminCutterUsersWeb, "api_user_count"),
    cutter_users_web_approved_count: numberField(adminCutterUsersWeb, "api_approved_count"),
    cutter_users_web_pending_count: numberField(adminCutterUsersWeb, "api_pending_count"),
    cutter_users_web_first_user_id: stringField(adminCutterUsersWeb, "api_first_user_id"),
    cutter_users_web_first_display_name: stringField(adminCutterUsersWeb, "api_first_display_name"),
    cutter_users_web_first_device_name: stringField(adminCutterUsersWeb, "api_first_device_name"),
    cutter_public_library_available_count: numberField(cutterPublicLibraryWeb, "api_available_video_count"),
    cutter_public_library_returned_count: numberField(cutterPublicLibraryWeb, "api_returned_count"),
    cutter_public_library_first_source_video_id: stringField(cutterPublicLibraryWeb, "api_first_source_video_id"),
    cutter_public_library_first_title: stringField(cutterPublicLibraryWeb, "api_first_title"),
    material_query: stringField(materialLocator, "query"),
    material_search_index_version: stringField(materialLocator, "search_index_version"),
    material_candidate_count: numberField(materialLocator, "candidate_count"),
    selection_method: stringField(closedLoop, "selection_method"),
    selection_proof_text: stringField(closedLoop, "selection_proof_text"),
    selected_text_char_count: numberField(closedLoop, "selected_text_char_count"),
    selected_sentence_count: numberField(closedLoop, "selected_sentence_count"),
    selected_text_segment_count: numberField(closedLoop, "selected_text_segment_count"),
    selected_text_is_broader_than_query: booleanField(closedLoop, "selected_text_is_broader_than_query"),
    local_clip_id: stringField(closedLoop, "local_clip_id"),
    local_library_page_url: stringField(closedLoop, "local_library_page_url"),
    local_library_view_mode: stringField(closedLoop, "local_library_view_mode"),
    local_library_visible_clip_count: numberField(closedLoop, "local_library_visible_clip_count"),
    local_library_clip_title: stringField(closedLoop, "local_library_clip_title"),
    local_library_source_title: stringField(closedLoop, "local_library_source_title"),
    cut_job_id: stringField(closedLoop, "cut_job_id"),
    cut_tasks_page_url: stringField(closedLoop, "cut_tasks_page_url"),
    cut_tasks_page_visible_status_label: stringField(closedLoop, "cut_tasks_page_visible_status_label"),
    cut_tasks_page_visible_output_file: stringField(closedLoop, "cut_tasks_page_visible_output_file"),
    cut_tasks_page_source_title: stringField(closedLoop, "cut_tasks_page_source_title"),
    cut_tasks_page_time_range_label: stringField(closedLoop, "cut_tasks_page_time_range_label"),
    public_library_write_detected: booleanField(closedLoop, "public_library_write_detected")
  };
}

function realNas50Snapshot(report: Record<string, unknown>): RealNas50PhaseSnapshot {
  const metrics = readNestedRecord(report, "metrics");
  const search = readNestedRecord(metrics, "search");
  const detail = readNestedRecord(metrics, "detail");
  const cut = readNestedRecord(metrics, "cut");
  const usage = readNestedRecord(metrics, "usage");

  return {
    index_version: stringField(report, "search_index_version"),
    indexed_source_video_count: numberField(report, "indexed_source_video_count"),
    indexed_transcript_segment_count: numberField(report, "indexed_transcript_segment_count"),
    editor_count: numberField(report, "editor_count"),
    active_user_count: numberField(report, "active_user_count"),
    distinct_source_video_count: numberField(report, "distinct_source_video_count"),
    search_query_count: numberField(report, "search_query_count"),
    search_queries: stringArrayField(report, "search_queries"),
    search_p95_ms: numberField(search, "p95_ms"),
    detail_p95_ms: numberField(detail, "p95_ms"),
    cut_p95_ms: numberField(cut, "p95_ms"),
    search_failure_count: numberField(usage, "search_failure_count")
  };
}

function validateSnapshotThresholds(input: {
  errors: string[];
  local_web: LocalWebPhaseSnapshot;
  real_nas_50: RealNas50PhaseSnapshot;
}): void {
  if (!/^v\d{6}$/.test(input.local_web.index_version)) {
    input.errors.push("local web report searchd index_version must use v000001 format");
  }
  addPositiveIntegerCheck(input.errors, input.local_web.source_video_count, "local web source_video_count");
  addPositiveIntegerCheck(input.errors, input.local_web.transcript_segment_count, "local web segment_count");
  addP95Check(input.errors, input.local_web.search_p95_ms, "local web admin search_p95_ms");
  if (input.local_web.cutter_capacity < 50) {
    input.errors.push("local web cutter_capacity must be at least 50");
  }
  if (input.local_web.search_failure_count !== 0) {
    input.errors.push("local web search_failure_count must be 0");
  }
  if (!input.local_web.source_video_web_source_path_visible) {
    input.errors.push("local web source videos Web UI must display the real source path");
  }
  if (!/^V\d{6}$/.test(input.local_web.source_video_web_first_id)) {
    input.errors.push("local web source videos Web UI must expose a first server source video id");
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.source_video_web_loaded_before,
    "local web source videos Web UI loaded_count_before"
  );
  if (
    !input.local_web.source_video_web_loaded_count_increased ||
    input.local_web.source_video_web_loaded_after <= input.local_web.source_video_web_loaded_before
  ) {
    input.errors.push("local web source videos Web UI load-more must increase loaded source videos");
  }
  if (!input.local_web.source_video_web_query.trim()) {
    input.errors.push("local web source videos Web UI query must be non-empty");
  }
  if (!/^V\d{6}$/.test(input.local_web.source_video_web_query_result_id)) {
    input.errors.push("local web source videos Web UI query result id must be concrete");
  }
  if (
    !input.local_web.source_video_web_query_response_observed ||
    !input.local_web.source_video_web_query_result_matches_api
  ) {
    input.errors.push("local web source videos Web UI must observe and render the query API result");
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.source_video_web_ready_status_count,
    "local web source videos Web UI ready status count"
  );
  if (
    !input.local_web.source_video_web_ready_filter_response_observed ||
    !input.local_web.source_video_web_ready_filter_all_visible_rows_ready
  ) {
    input.errors.push("local web source videos Web UI must observe ready filter API response and render only ready rows");
  }
  if (input.local_web.preprocess_web_current_index_version !== input.local_web.index_version) {
    input.errors.push("local web preprocess Web UI current index must match searchd index version");
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.preprocess_web_source_video_count,
    "local web preprocess Web UI source video count"
  );
  if (!Number.isInteger(input.local_web.preprocess_web_queued_count) || input.local_web.preprocess_web_queued_count < 0) {
    input.errors.push("local web preprocess Web UI queued count must be a non-negative integer");
  }
  if (!Number.isInteger(input.local_web.preprocess_web_failed_count) || input.local_web.preprocess_web_failed_count < 0) {
    input.errors.push("local web preprocess Web UI failed count must be a non-negative integer");
  }
  if (!input.local_web.preprocess_web_production_status_title.trim()) {
    input.errors.push("local web preprocess Web UI production status title must be non-empty");
  }
  if (!input.local_web.preprocess_web_visible_job_id.trim()) {
    input.errors.push("local web preprocess Web UI must render a real preprocess job id");
  }
  if (!/^J\d{6}$/.test(input.local_web.preprocess_web_log_job_id)) {
    input.errors.push("local web preprocess Web UI must open a concrete preprocess job log");
  }
  if (!["file", "preprocess-job", "source-video"].includes(input.local_web.preprocess_web_log_record_source)) {
    input.errors.push("local web preprocess Web UI log record source must be concrete");
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.preprocess_web_log_content_char_count,
    "local web preprocess Web UI log content char count"
  );
  for (const label of ["真实 NAS 安全边界", "只读观察", "人工确认", "本机工作区"]) {
    if (!input.local_web.preprocess_safety_labels.includes(label)) {
      input.errors.push(`local web preprocess safety labels must include ${label}`);
    }
  }
  for (const label of PREPROCESS_WRITE_ACTION_LABELS) {
    if (!input.local_web.preprocess_write_action_lock_labels.includes(label)) {
      input.errors.push(`local web preprocess write action lock labels must include ${label}`);
    }
  }
  for (const label of SOURCE_VIDEO_WRITE_ACTION_LABELS) {
    if (!input.local_web.source_video_write_action_lock_labels.includes(label)) {
      input.errors.push(`local web source videos write action lock labels must include ${label}`);
    }
  }
  for (const label of DASHBOARD_WRITE_ACTION_LABELS) {
    if (!input.local_web.dashboard_write_action_lock_labels.includes(label)) {
      input.errors.push(`local web dashboard write action lock labels must include ${label}`);
    }
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.cutter_users_web_user_count,
    "local web cutter users Web UI user count"
  );
  if (
    !Number.isInteger(input.local_web.cutter_users_web_approved_count) ||
    input.local_web.cutter_users_web_approved_count < 0
  ) {
    input.errors.push("local web cutter users Web UI approved count must be a non-negative integer");
  }
  if (
    !Number.isInteger(input.local_web.cutter_users_web_pending_count) ||
    input.local_web.cutter_users_web_pending_count < 0
  ) {
    input.errors.push("local web cutter users Web UI pending count must be a non-negative integer");
  }
  if (
    input.local_web.cutter_users_web_approved_count + input.local_web.cutter_users_web_pending_count >
    input.local_web.cutter_users_web_user_count
  ) {
    input.errors.push("local web cutter users Web UI status counts must not exceed user count");
  }
  if (!/^CU\d{6}$/.test(input.local_web.cutter_users_web_first_user_id)) {
    input.errors.push("local web cutter users Web UI first user id must be concrete");
  }
  if (!input.local_web.cutter_users_web_first_display_name.trim()) {
    input.errors.push("local web cutter users Web UI first display name must be non-empty");
  }
  if (!input.local_web.cutter_users_web_first_device_name.trim()) {
    input.errors.push("local web cutter users Web UI first device name must be non-empty");
  }
  if (input.local_web.cutter_public_library_available_count !== input.local_web.source_video_count) {
    input.errors.push("local web cutter public library available count must match searchd source video count");
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.cutter_public_library_returned_count,
    "local web cutter public library returned count"
  );
  if (!/^V\d{6}$/.test(input.local_web.cutter_public_library_first_source_video_id)) {
    input.errors.push("local web cutter public library first source video id must be concrete");
  }
  if (!input.local_web.cutter_public_library_first_title.trim()) {
    input.errors.push("local web cutter public library first title must be non-empty");
  }
  if (!input.local_web.material_query.trim()) {
    input.errors.push("local web material query must be non-empty");
  }
  if (input.local_web.material_search_index_version !== input.local_web.index_version) {
    input.errors.push("local web material search index version must match searchd index version");
  }
  addPositiveIntegerCheck(input.errors, input.local_web.material_candidate_count, "local web material candidate_count");
  if (input.local_web.selection_method !== "transcript-drag") {
    input.errors.push("local web closed loop selection_method must be transcript-drag");
  }
  if (
    !/来源\s*(公共原素材|本地素材)/.test(input.local_web.selection_proof_text) ||
    !/时间段\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(input.local_web.selection_proof_text) ||
    !/字数\s*\d+\s*字/.test(input.local_web.selection_proof_text) ||
    !/命中\s*\d+\s*\/\s*\d+/.test(input.local_web.selection_proof_text)
  ) {
    input.errors.push("local web selection proof text must include source, time range, character count, and hit position");
  }
  addPositiveIntegerCheck(input.errors, input.local_web.selected_text_char_count, "local web selected_text_char_count");
  if (!Number.isInteger(input.local_web.selected_sentence_count) || input.local_web.selected_sentence_count < 2) {
    input.errors.push("local web selected_sentence_count must be at least 2");
  }
  if (
    !Number.isInteger(input.local_web.selected_text_segment_count) ||
    input.local_web.selected_text_segment_count < 2
  ) {
    input.errors.push("local web selected_text_segment_count must be at least 2");
  }
  if (!input.local_web.selected_text_is_broader_than_query) {
    input.errors.push("local web selected text must be broader than the query keyword");
  }
  if (!/^E\d{6}$/.test(input.local_web.local_clip_id)) {
    input.errors.push("local web local_clip_id must be a generated local clip id");
  }
  if (!input.local_web.local_library_page_url.includes("#local-library")) {
    input.errors.push("local web local library page evidence must come from the local-library route");
  }
  if (input.local_web.local_library_view_mode !== "all") {
    input.errors.push("local web local library page evidence must use the all-materials view");
  }
  addPositiveIntegerCheck(
    input.errors,
    input.local_web.local_library_visible_clip_count,
    "local web local library visible clip count"
  );
  if (!input.local_web.local_library_clip_title.trim()) {
    input.errors.push("local web local library clip title must be non-empty");
  }
  if (!input.local_web.local_library_source_title.trim()) {
    input.errors.push("local web local library source title must be non-empty");
  }
  if (!/^CJ\d{8}-\d{4}$/.test(input.local_web.cut_job_id)) {
    input.errors.push("local web cut_job_id must be a generated cut job id");
  }
  if (!input.local_web.cut_tasks_page_url.includes("#cut-tasks")) {
    input.errors.push("local web cut tasks page evidence must come from the cut-tasks route");
  }
  if (input.local_web.cut_tasks_page_visible_status_label !== "已完成") {
    input.errors.push("local web cut tasks page visible status label must be 已完成");
  }
  if (!input.local_web.cut_tasks_page_visible_output_file.trim()) {
    input.errors.push("local web cut tasks page visible output file must be non-empty");
  }
  if (!input.local_web.cut_tasks_page_source_title.trim()) {
    input.errors.push("local web cut tasks page source title must be non-empty");
  }
  if (!/\d{2}:\d{2}(?::\d{2})?\s+-\s+\d{2}:\d{2}(?::\d{2})?/.test(input.local_web.cut_tasks_page_time_range_label)) {
    input.errors.push("local web cut tasks page time range label must be concrete");
  }
  if (input.local_web.public_library_write_detected) {
    input.errors.push("local web public_library_write_detected must be false");
  }

  if (!/^v\d{6}$/.test(input.real_nas_50.index_version)) {
    input.errors.push("50-editor report search_index_version must use v000001 format");
  }
  if (input.real_nas_50.editor_count < 50 || input.real_nas_50.active_user_count < 50) {
    input.errors.push("50-editor report must include at least 50 active editors");
  }
  if (input.real_nas_50.distinct_source_video_count < 50) {
    input.errors.push("50-editor report must cover at least 50 distinct source videos");
  }
  if (input.real_nas_50.search_query_count < LOCAL_REAL_NAS_MIN_SEARCH_QUERY_COUNT) {
    input.errors.push(`50-editor report must cover at least ${LOCAL_REAL_NAS_MIN_SEARCH_QUERY_COUNT} distinct search queries`);
  }
  if (input.real_nas_50.search_queries.length !== input.real_nas_50.search_query_count) {
    input.errors.push("50-editor report search_queries must match search_query_count");
  }
  if (input.real_nas_50.indexed_source_video_count < 2000) {
    input.errors.push("50-editor report indexed_source_video_count must be at least 2000");
  }
  if (input.real_nas_50.indexed_transcript_segment_count < 48000) {
    input.errors.push("50-editor report indexed_transcript_segment_count must be at least 48000");
  }
  addP95Check(input.errors, input.real_nas_50.search_p95_ms, "50-editor search p95");
  addP95Check(input.errors, input.real_nas_50.detail_p95_ms, "50-editor detail p95");
  addP95Check(input.errors, input.real_nas_50.cut_p95_ms, "50-editor cut p95");
  if (input.real_nas_50.search_failure_count !== 0) {
    input.errors.push("50-editor search_failure_count must be 0");
  }
  if (input.local_web.index_version !== input.real_nas_50.index_version) {
    input.errors.push(
      `local Web and 50-editor reports must use the same search index version (${input.local_web.index_version} !== ${input.real_nas_50.index_version})`
    );
  }
  if (input.local_web.source_video_count !== input.real_nas_50.indexed_source_video_count) {
    input.errors.push(
      `local Web and 50-editor source video counts must match (${input.local_web.source_video_count} !== ${input.real_nas_50.indexed_source_video_count})`
    );
  }
  if (input.local_web.transcript_segment_count !== input.real_nas_50.indexed_transcript_segment_count) {
    input.errors.push(
      `local Web and 50-editor transcript segment counts must match (${input.local_web.transcript_segment_count} !== ${input.real_nas_50.indexed_transcript_segment_count})`
    );
  }
}

function requireDocValue(errors: string[], docText: string, value: string | number, label: string): void {
  if (!docText.includes(String(value))) {
    errors.push(`acceptance record must include ${label}: ${value}`);
  }
}

function validateAcceptanceRecord(input: {
  errors: string[];
  doc_text: string;
  local_web: LocalWebPhaseSnapshot;
  real_nas_50: RealNas50PhaseSnapshot;
}): void {
  requireDocValue(input.errors, input.doc_text, input.local_web.index_version, "local web index version");
  requireDocValue(input.errors, input.doc_text, input.local_web.source_video_count, "local web source video count");
  requireDocValue(input.errors, input.doc_text, input.local_web.transcript_segment_count, "local web transcript segment count");
  requireDocValue(input.errors, input.doc_text, input.local_web.search_p95_ms, "local web search p95");
  requireDocValue(input.errors, input.doc_text, input.local_web.source_video_web_first_id, "local web source videos Web UI first id");
  requireDocValue(input.errors, input.doc_text, input.local_web.source_video_web_loaded_after, "local web source videos Web UI loaded count after pagination");
  requireDocValue(input.errors, input.doc_text, input.local_web.source_video_web_query, "local web source videos Web UI query");
  requireDocValue(input.errors, input.doc_text, input.local_web.source_video_web_query_result_id, "local web source videos Web UI query result id");
  requireDocValue(input.errors, input.doc_text, input.local_web.source_video_web_ready_status_count, "local web source videos Web UI ready status count");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_current_index_version, "local web preprocess Web UI current index");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_source_video_count, "local web preprocess Web UI source video count");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_queued_count, "local web preprocess Web UI queued count");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_failed_count, "local web preprocess Web UI failed count");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_production_status_title, "local web preprocess Web UI production status title");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_visible_job_id, "local web preprocess Web UI visible job id");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_log_job_id, "local web preprocess Web UI log job id");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_log_record_source, "local web preprocess Web UI log record source");
  requireDocValue(input.errors, input.doc_text, input.local_web.preprocess_web_log_content_char_count, "local web preprocess Web UI log content char count");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_users_web_user_count, "local web cutter users Web UI user count");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_users_web_approved_count, "local web cutter users Web UI approved count");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_users_web_pending_count, "local web cutter users Web UI pending count");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_users_web_first_user_id, "local web cutter users Web UI first user id");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_users_web_first_display_name, "local web cutter users Web UI first display name");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_users_web_first_device_name, "local web cutter users Web UI first device name");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_public_library_available_count, "local web cutter public library available count");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_public_library_returned_count, "local web cutter public library returned count");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_public_library_first_source_video_id, "local web cutter public library first source video id");
  requireDocValue(input.errors, input.doc_text, input.local_web.cutter_public_library_first_title, "local web cutter public library first title");
  requireDocValue(input.errors, input.doc_text, input.local_web.material_query, "local web material query");
  requireDocValue(input.errors, input.doc_text, input.local_web.material_candidate_count, "local web material candidate count");
  requireDocValue(input.errors, input.doc_text, input.local_web.selection_proof_text, "local web selection proof text");
  requireDocValue(input.errors, input.doc_text, input.local_web.selection_method, "local web selection method");
  requireDocValue(input.errors, input.doc_text, input.local_web.selected_text_char_count, "local web selected text character count");
  requireDocValue(input.errors, input.doc_text, input.local_web.selected_sentence_count, "local web selected sentence count");
  requireDocValue(input.errors, input.doc_text, input.local_web.selected_text_segment_count, "local web selected text segment count");
  requireDocValue(input.errors, input.doc_text, input.local_web.local_clip_id, "local web local clip id");
  requireDocValue(input.errors, input.doc_text, input.local_web.local_library_visible_clip_count, "local web local library visible clip count");
  requireDocValue(input.errors, input.doc_text, input.local_web.local_library_clip_title, "local web local library clip title");
  requireDocValue(input.errors, input.doc_text, input.local_web.local_library_source_title, "local web local library source title");
  requireDocValue(input.errors, input.doc_text, input.local_web.cut_job_id, "local web cut job id");
  requireDocValue(input.errors, input.doc_text, input.local_web.cut_tasks_page_visible_status_label, "local web cut tasks page visible status label");
  requireDocValue(input.errors, input.doc_text, input.local_web.cut_tasks_page_visible_output_file, "local web cut tasks page visible output file");
  requireDocValue(input.errors, input.doc_text, input.local_web.cut_tasks_page_source_title, "local web cut tasks page source title");
  requireDocValue(input.errors, input.doc_text, input.local_web.cut_tasks_page_time_range_label, "local web cut tasks page time range label");
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.index_version, "50-editor index version");
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.indexed_source_video_count, "50-editor source video count");
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.indexed_transcript_segment_count, "50-editor transcript segment count");
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.search_query_count, "50-editor search query count");
  for (const query of input.real_nas_50.search_queries) {
    requireDocValue(input.errors, input.doc_text, query, `50-editor search query ${query}`);
  }
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.search_p95_ms, "50-editor search p95");
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.detail_p95_ms, "50-editor detail p95");
  requireDocValue(input.errors, input.doc_text, input.real_nas_50.cut_p95_ms, "50-editor cut p95");

  if (!/does not complete ACC-008/i.test(input.doc_text) || !/does not complete ACC-009/i.test(input.doc_text)) {
    input.errors.push("acceptance record must state that local Web preflight does not complete ACC-008 or ACC-009");
  }
  if (
    !input.doc_text.includes("Admin source videos Web UI") ||
    !input.doc_text.includes("source-videos API response")
  ) {
    input.errors.push("acceptance record must include local Web source videos UI/API evidence");
  }
  if (!input.doc_text.includes("Admin preprocess Web UI")) {
    input.errors.push("acceptance record must include local Web preprocess UI/API evidence");
  }
  if (!input.doc_text.includes("Admin cutter users Web UI")) {
    input.errors.push("acceptance record must include local Web cutter users UI/API evidence");
  }
  if (!input.doc_text.includes("Cutter public library Web UI")) {
    input.errors.push("acceptance record must include Cutter public library UI/API evidence");
  }
  if (!input.doc_text.includes("Local library page proof")) {
    input.errors.push("acceptance record must include local library page evidence");
  }
  if (!input.doc_text.includes("Cut task tracking")) {
    input.errors.push("acceptance record must include cut task page evidence");
  }
  for (const label of ["真实 NAS 安全边界", "只读观察", "人工确认", "本机工作区"]) {
    if (!input.doc_text.includes(label)) {
      input.errors.push(`acceptance record must include local Web preprocess safety label: ${label}`);
    }
  }
  for (const label of PREPROCESS_WRITE_ACTION_LABELS) {
    if (!input.doc_text.includes(label)) {
      input.errors.push(`acceptance record must include local Web preprocess write lock label: ${label}`);
    }
  }
  for (const label of SOURCE_VIDEO_WRITE_ACTION_LABELS) {
    if (!input.doc_text.includes(label)) {
      input.errors.push(`acceptance record must include local Web source videos write lock label: ${label}`);
    }
  }
  for (const label of DASHBOARD_WRITE_ACTION_LABELS) {
    if (!input.doc_text.includes(label)) {
      input.errors.push(`acceptance record must include local Web dashboard write lock label: ${label}`);
    }
  }
}

export async function auditLocalRealNasPhaseArtifacts(
  input: LocalRealNasPhaseAuditInput
): Promise<LocalRealNasPhaseAuditReport> {
  const errors: string[] = [];
  const localWebValidation = await validateLocalWebSanityReportFile(input.local_web_report_path);
  errors.push(...localWebValidation.errors.map((error) => `local web report: ${error}`));

  try {
    execFileSync("sh", [NAS_50_SELF_CHECK_PATH, input.real_nas_50_report_path], {
      stdio: "pipe",
      encoding: "utf8"
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    errors.push(`50-editor report self-check failed: ${(stderr || stdout || String(error)).trim()}`);
  }

  let localWeb: LocalWebPhaseSnapshot | undefined;
  let realNas50: RealNas50PhaseSnapshot | undefined;
  let docText = "";

  try {
    localWeb = localWebSnapshot(await readJsonRecord(input.local_web_report_path));
  } catch (error) {
    errors.push(`local web report snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    realNas50 = realNas50Snapshot(await readJsonRecord(input.real_nas_50_report_path));
  } catch (error) {
    errors.push(`50-editor report snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    docText = await readFile(input.acceptance_record_path, "utf8");
  } catch (error) {
    errors.push(`acceptance record must be readable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (localWeb && realNas50) {
    validateSnapshotThresholds({
      errors,
      local_web: localWeb,
      real_nas_50: realNas50
    });
    if (docText) {
      validateAcceptanceRecord({
        errors,
        doc_text: docText,
        local_web: localWeb,
        real_nas_50: realNas50
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    local_web_report_path: input.local_web_report_path,
    real_nas_50_report_path: input.real_nas_50_report_path,
    acceptance_record_path: input.acceptance_record_path,
    ...(localWeb ? { local_web: localWeb } : {}),
    ...(realNas50 ? { real_nas_50: realNas50 } : {})
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const report = await auditLocalRealNasPhaseArtifacts({
    local_web_report_path: process.env.MIXLAB_LOCAL_WEB_SANITY_REPORT ?? DEFAULT_LOCAL_WEB_REPORT_PATH,
    real_nas_50_report_path: process.env.MIXLAB_REAL_NAS_50_REPORT_PATH ?? DEFAULT_REAL_NAS_50_REPORT_PATH,
    acceptance_record_path: process.env.MIXLAB_LOCAL_REAL_NAS_ACCEPTANCE_RECORD ?? DEFAULT_ACCEPTANCE_RECORD_PATH
  });

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
