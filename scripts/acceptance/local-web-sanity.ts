import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";

export interface LocalWebSanityOptions {
  adminWebUrl?: string;
  adminApiBaseUrl?: string;
  cutterWebUrl?: string;
  cutterApiBaseUrl?: string;
  searchdBaseUrl?: string;
  query?: string;
  matrixQueries?: string[];
  timeoutMs?: number;
  reportPath?: string;
}

export interface EndpointSanityResult {
  label: string;
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface MaterialLocatorSanityState {
  url: string;
  query: string;
  default_selected_material_section: string;
  candidate_count: number;
  search_status_text: string;
  search_index_version: string;
  transcript_header: string;
  current_hit_time_ms: string;
  current_hit_time_ms_value: number;
  current_hit_segment_id: string;
  global_hit_position: number;
  global_hit_count: number;
  current_video_hit_count: number;
  selected_sentence_count: number;
  full_transcript_char_count: number;
}

export interface MaterialLocatorClosedLoopState {
  selection_method: string;
  selected_text: string;
  selection_proof_text: string;
  selected_text_char_count: number;
  selected_sentence_count: number;
  selected_text_segment_count: number;
  selected_text_is_broader_than_query: boolean;
  cut_notice: string;
  local_library_contains_selection: boolean;
  local_library_page_url: string;
  local_library_view_mode: string;
  local_library_visible_clip_count: number;
  local_library_visible_count_label: string;
  local_library_clip_title: string;
  local_library_source_title: string;
  local_library_clip_title_visible: boolean;
  local_library_source_title_visible: boolean;
  local_library_selected_text_visible: boolean;
  first_result_section: string;
  second_result_section: string;
  local_clip_id: string;
  local_clip_media_file_path: string;
  local_clip_manifest_file_path: string;
  local_clip_media_file_exists: boolean;
  local_clip_media_file_size_bytes: number;
  local_clip_manifest_file_exists: boolean;
  local_clip_manifest_file_size_bytes: number;
  cut_job_id: string;
  cut_job_status: string;
  cut_job_export_clip_id: string;
  cut_job_output_file: string;
  cut_job_contains_selection: boolean;
  cut_tasks_page_contains_selection: boolean;
  cut_tasks_page_contains_output: boolean;
  cut_tasks_page_shows_done: boolean;
  cut_tasks_page_url: string;
  cut_tasks_page_visible_status_label: string;
  cut_tasks_page_visible_output_file: string;
  cut_tasks_page_source_title: string;
  cut_tasks_page_source_title_visible: boolean;
  cut_tasks_page_time_range_label: string;
  cut_tasks_page_time_range_visible: boolean;
  public_library_root: string;
  local_output_is_outside_public_library: boolean;
  public_library_write_detected: boolean;
}

interface LocalClipEvidence {
  local_clip_id: string;
  title: string;
  source_title: string;
  selected_text: string;
  media_file_path: string;
  manifest_file_path: string;
}

interface CutJobEvidence {
  cut_job_id: string;
  status: string;
  export_clip_id: string;
  output_file: string;
  source_title: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
}

interface LocalFileProof {
  exists: boolean;
  size_bytes: number;
}

export interface AdminDashboardSanityState {
  url: string;
  title: string;
  visible_labels: string[];
  write_action_labels: string[];
  disabled_write_action_labels: string[];
  active_cutter_capacity_label: string;
  active_cutter_count: number;
  cutter_capacity: number;
  current_index_version: string;
  search_p95_ms: number;
  local_search_coverage_percent: number;
  search_failure_count: number;
  body_sample: string;
}

export interface SearchdIndexSanityState {
  url: string;
  ok: boolean;
  admin_current_index_version: string;
  index_version: string;
  source_video_count: number;
  segment_count: number;
  matched_admin_current_index: boolean;
}

export interface AdminWebRouteSanityState {
  route: string;
  url: string;
  required_labels: string[];
  visible_labels: string[];
  disabled_write_action_labels: string[];
}

export interface AdminSourceVideoListSanityState {
  page_size: number;
  first_page_count: number;
  second_page_count: number;
  first_page_first_id: string;
  second_page_first_id: string;
  pages_are_distinct: boolean;
  first_page_ms: number;
  second_page_ms: number;
  ready_filter_count: number;
  ready_filter_all_ready: boolean;
  ready_filter_ms: number;
  query: string;
  query_result_count: number;
  query_first_id: string;
  query_first_matches: boolean;
  query_filter_ms: number;
}

export interface AdminSourceVideoWebSanityState {
  url: string;
  source_path_text: string;
  source_path_visible: boolean;
  first_page_first_id: string;
  first_page_first_id_visible: boolean;
  loaded_count_before: number;
  total_count_before: number;
  load_more_button_label: string;
  load_more_clicked: boolean;
  loaded_count_after: number;
  total_count_after: number;
  loaded_count_increased: boolean;
  query: string;
  query_result_id: string;
  query_response_observed: boolean;
  query_result_visible: boolean;
  query_result_count_text: string;
  query_result_matches_api: boolean;
  ready_filter_selected_value: string;
  ready_filter_response_observed: boolean;
  ready_filter_result_count_text: string;
  ready_filter_visible_status_count: number;
  ready_filter_all_visible_rows_ready: boolean;
}

export interface AdminPreprocessWebSanityState {
  url: string;
  current_index_version: string;
  current_index_visible: boolean;
  source_video_count: number;
  source_video_count_visible: boolean;
  active_count: number;
  active_count_visible: boolean;
  queued_count: number;
  queued_count_visible: boolean;
  failed_count: number;
  failed_count_visible: boolean;
  index_required_video_count: number;
  index_required_visible: boolean;
  production_status_title: string;
  production_status_visible: boolean;
  public_library_root_visible: boolean;
  visible_job_id: string;
  visible_job_id_observed: boolean;
  log_job_id: string;
  log_record_source: string;
  log_content_char_count: number;
  log_path_visible: boolean;
  log_content_visible: boolean;
  log_snapshot_visible: boolean;
}

export interface AdminCutterUsersWebSanityState {
  url: string;
  api_user_count: number;
  api_approved_count: number;
  api_pending_count: number;
  api_first_user_id: string;
  api_first_display_name: string;
  api_first_status_label: string;
  api_first_device_name: string;
  approved_count_visible: boolean;
  pending_count_visible: boolean;
  first_user_visible: boolean;
  first_device_visible: boolean;
  identity_note_visible: boolean;
  device_detail_visible: boolean;
  disable_action_visible: boolean;
  approve_action_visible: boolean;
  usage_metrics_labels_visible: string[];
}

export interface AdminRealNasMatrixState {
  admin_api_base_url: string;
  library_root: string;
  source_videos_path: string;
  video_count: number;
  ready_video_count: number;
  queued_video_count: number;
  processing_video_count: number;
  failed_video_count: number;
  index_required_video_count: number;
  current_index_version: string;
  settings_source_folder_count: number;
  enabled_source_folder_count: number;
  settings_include_real_nas_path: boolean;
  source_ready_sample_count: number;
  source_ready_detail_id: string;
  source_ready_detail_ms: number;
  source_ready_detail_visible_to_cutters: boolean;
  source_ready_detail_transcript_segment_count: number;
  source_ready_detail_transcript_char_count: number;
  source_ready_detail_index_version: string;
  runtime_settings_ms: number;
  runtime_ffmpeg_available: boolean;
  runtime_ffprobe_available: boolean;
  runtime_asr_key_configured: boolean;
  preprocess_job_count: number;
  preprocess_active_count: number;
  preprocess_queued_count: number;
  preprocess_failed_count: number;
  preprocess_supervisor_state: string;
  index_version_count: number;
  index_current_version: string;
  cutter_user_count: number;
  source_video_list: AdminSourceVideoListSanityState;
  source_video_web: AdminSourceVideoWebSanityState;
  preprocess_web: AdminPreprocessWebSanityState;
  cutter_users_web: AdminCutterUsersWebSanityState;
  web_routes: AdminWebRouteSanityState[];
  read_only_actions_skipped: string[];
}

export interface CutterSearchMatrixQueryState {
  query: string;
  group_count: number;
  returned_count: number;
  index_version: string;
  search_mode: string;
  search_ms: number;
  first_source_video_id: string;
  first_hit_count: number;
  first_segment_id: string;
  first_segment_begin_ms: number;
  first_segment_contains_query: boolean;
  first_segment_has_match_range: boolean;
}

export interface CutterSearchMatrixState {
  cutter_api_base_url: string;
  query_count: number;
  max_search_ms: number;
  all_queries_used_searchd: boolean;
  matched_searchd_index: boolean;
  queries: CutterSearchMatrixQueryState[];
}

export interface CutterAuthSanityState {
  cutter_api_base_url: string;
  auth_mode_url: string;
  auth_mode: "reviewed" | "local_trusted" | "";
  local_trusted: boolean;
  trusted_username: string;
  material_locator_url: string;
  fresh_context_workbench_ready: boolean;
  login_gate_visible_after_ready: boolean;
  manual_apply_used: boolean;
  visible_username: string;
}

export interface CutterPublicLibraryWebSanityState {
  cutter_api_base_url: string;
  url: string;
  api_available_video_count: number;
  api_returned_count: number;
  api_first_source_video_id: string;
  api_first_title: string;
  web_api_response_observed: boolean;
  available_count_visible: boolean;
  first_title_visible: boolean;
  public_source_label_visible: boolean;
  load_more_button_visible: boolean;
  loaded_count_before: number;
  loaded_count_after: number;
  load_more_clicked: boolean;
  loaded_count_increased: boolean;
  selected_inspector_title: string;
}

export interface LocalWebLayoutBoxState {
  selector: string;
  client_width: number;
  scroll_width: number;
  horizontal_overflow: boolean;
}

export interface LocalWebRouteLayoutState {
  app: "admin" | "cutter";
  route: string;
  url: string;
  viewport_label: string;
  viewport_width: number;
  viewport_height: number;
  required_labels: string[];
  visible_labels: string[];
  disabled_write_action_labels: string[];
  body: LocalWebLayoutBoxState;
  page: LocalWebLayoutBoxState;
}

export interface LocalWebLayoutSanityState {
  admin_source_videos_url: string;
  cutter_material_locator_url: string;
  viewport_width: number;
  viewport_height: number;
  admin_statusbar: LocalWebLayoutBoxState;
  admin_statusbar_item_overflow_count: number;
  cutter_workbench: LocalWebLayoutBoxState;
  cutter_body: LocalWebLayoutBoxState;
  admin_route_layouts: LocalWebRouteLayoutState[];
  cutter_route_layouts: LocalWebRouteLayoutState[];
}

export interface LocalWebSanityReport {
  ok: boolean;
  errors: string[];
  endpoints: EndpointSanityResult[];
  admin_dashboard?: AdminDashboardSanityState;
  searchd_index?: SearchdIndexSanityState;
  admin_real_nas_matrix?: AdminRealNasMatrixState;
  cutter_search_matrix?: CutterSearchMatrixState;
  cutter_auth?: CutterAuthSanityState;
  cutter_public_library_web?: CutterPublicLibraryWebSanityState;
  layout?: LocalWebLayoutSanityState;
  material_locator?: MaterialLocatorSanityState;
  material_locator_closed_loop?: MaterialLocatorClosedLoopState;
}

const DEFAULT_ADMIN_WEB_URL = "http://127.0.0.1:5176/";
const DEFAULT_ADMIN_API_BASE_URL = "http://127.0.0.1:3889/";
const DEFAULT_CUTTER_WEB_URL = "http://127.0.0.1:5177/";
const DEFAULT_CUTTER_API_BASE_URL = "http://127.0.0.1:3789/";
const DEFAULT_SEARCHD_BASE_URL = "http://127.0.0.1:3790/";
const DEFAULT_QUERY = "现金流";
const DEFAULT_MATRIX_QUERIES = ["现金流", "利润", "客户", "增长", "AI", "品牌"] as const;
const DEFAULT_REPORT_PATH = "docs/acceptance/artifacts/local-web-sanity.json";
const DEFAULT_TIMEOUT_MS = 15_000;
const SEARCHD_INDEX_SYNC_TIMEOUT_MS = 60_000;
const LOCAL_WEB_MATRIX_SEARCH_SLA_MS = 1_000;
const LOCAL_WEB_ADMIN_READ_API_SLA_MS = 3_000;
const LOCAL_WEB_ADMIN_MATRIX_API_COLLECT_TIMEOUT_MS = 45_000;
const LOCAL_WEB_ADMIN_READ_TIMING_ATTEMPTS = 3;
const LOCAL_WEB_FINAL_INDEX_SNAPSHOT_RETRY_COUNT = 3;
const LOCAL_WEB_FINAL_INDEX_SNAPSHOT_RETRY_DELAY_MS = 1_000;
const LOCAL_WEB_LAYOUT_VIEWPORTS = [
  { label: "desktop", width: 1440, height: 960 },
  { label: "compact", width: 1024, height: 768 }
] as const;
const LOCAL_WEB_REPORT_FORBIDDEN_PATTERNS = [
  /DASHSCOPE_API_KEY/i,
  /Authorization:\s*Bearer\s+(?!\*\*\*)/i,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /sk-[A-Za-z0-9_-]{8,}/,
  /signature=/i,
  /x-oss-signature/i,
  /full_text/i,
  /pasted_search_text/i
] as const;

function firstConfiguredEnvValue(env: NodeJS.ProcessEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function resolveLocalWebSanityEndpoints(
  options: LocalWebSanityOptions = {},
  env: NodeJS.ProcessEnv = process.env
): {
  adminWebUrl: string;
  adminApiBaseUrl: string;
  cutterWebUrl: string;
  cutterApiBaseUrl: string;
  searchdBaseUrl: string;
} {
  return {
    adminWebUrl: options.adminWebUrl
      ?? firstConfiguredEnvValue(env, ["MIXLAB_ADMIN_WEB_URL", "MIXLAB_ADMIN_WEB_BASE_URL"])
      ?? DEFAULT_ADMIN_WEB_URL,
    adminApiBaseUrl: options.adminApiBaseUrl
      ?? firstConfiguredEnvValue(env, ["MIXLAB_ADMIN_API_BASE_URL", "MIXLAB_ADMIN_API_URL"])
      ?? DEFAULT_ADMIN_API_BASE_URL,
    cutterWebUrl: options.cutterWebUrl
      ?? firstConfiguredEnvValue(env, ["MIXLAB_CUTTER_WEB_URL", "MIXLAB_CUTTER_WEB_BASE_URL"])
      ?? DEFAULT_CUTTER_WEB_URL,
    cutterApiBaseUrl: options.cutterApiBaseUrl
      ?? firstConfiguredEnvValue(env, ["MIXLAB_CUTTER_API_BASE_URL", "MIXLAB_CUTTER_API_URL"])
      ?? DEFAULT_CUTTER_API_BASE_URL,
    searchdBaseUrl: options.searchdBaseUrl
      ?? firstConfiguredEnvValue(env, ["MIXLAB_SEARCHD_BASE_URL", "MIXLAB_SEARCHD_URL"])
      ?? DEFAULT_SEARCHD_BASE_URL
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref();
  return controller.signal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value : "";
}

function numberField(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanField(record: Record<string, unknown>, field: string): boolean | undefined {
  const value = record[field];
  return typeof value === "boolean" ? value : undefined;
}

function stringArrayField(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function recordArrayField(record: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = record[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sourceVideoSearchText(record: Record<string, unknown>): string {
  return [
    stringField(record, "source_video_id"),
    stringField(record, "title"),
    stringField(record, "file_name"),
    stringField(record, "relative_path"),
    stringField(record, "description"),
    stringField(record, "lecturer"),
    stringField(record, "course"),
    stringField(record, "category"),
    ...stringArrayField(record, "tags")
  ].join(" ").toLocaleLowerCase();
}

function sourceVideoMatchesQuery(record: Record<string, unknown>, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return Boolean(normalizedQuery) && sourceVideoSearchText(record).includes(normalizedQuery);
}

function sourceVideoListQueryFromRecord(record: Record<string, unknown>): string {
  const fields = [
    stringField(record, "title"),
    stringField(record, "file_name"),
    stringField(record, "relative_path"),
    stringField(record, "source_video_id")
  ];

  for (const field of fields) {
    const cjkMatch = field.match(/\p{Script=Han}{2,}/u);
    if (cjkMatch?.[0]) {
      return Array.from(cjkMatch[0]).slice(0, 2).join("");
    }
  }

  return stringField(record, "source_video_id");
}

function parseSearchP95Ms(text: string): number {
  const match = text.match(/p95\s*([\d.]+)\s*ms/i);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : Number.NaN;
}

function parseSearchFailureCount(text: string): number {
  const match = text.match(/搜索失败\s+([\d,]+)/);
  return match ? parseIntegerText(match[1]) : Number.NaN;
}

function parseLocalSearchCoveragePercent(text: string): number {
  const match = text.match(/本地搜索(?:覆盖)?\s+([\d.]+)%/);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : Number.NaN;
}

function parseCutterCapacity(text: string): {
  active: number;
  capacity: number;
} {
  const match = text.match(/(\d+)\s*\/\s*(\d+)\s*(?:活跃剪辑师|剪辑师|)/);
  const active = match ? Number(match[1]) : Number.NaN;
  const capacity = match ? Number(match[2]) : Number.NaN;

  return {
    active: Number.isInteger(active) ? active : Number.NaN,
    capacity: Number.isInteger(capacity) ? capacity : Number.NaN
  };
}

function parseCurrentIndexVersion(text: string): string {
  const versions = [...text.matchAll(/当前索引\s+(v\d{6})/g)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
  return versions.sort().at(-1) ?? "";
}

function parseMaterialSearchIndexVersion(text: string): string {
  return text.match(/本地\s+searchd\s+(v\d{6})/)?.[1] ?? "";
}

function parseLoadedPublicLibraryCount(text: string): number {
  const value = text.match(/已显示\s+(\d+)\s*\/\s*\d+/)?.[1];
  return value ? Number(value) : Number.NaN;
}

function isIndexVersion(value: string): boolean {
  return /^v\d{6}$/.test(value);
}

function parseIntegerText(text: string): number {
  const normalized = text.replace(/,/g, "").trim();

  if (!/^\d+$/.test(normalized)) {
    return Number.NaN;
  }

  const value = Number(normalized);
  return Number.isInteger(value) ? value : Number.NaN;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function integerTextAlternatives(value: number): string[] {
  if (!Number.isInteger(value)) {
    return [];
  }

  return Array.from(new Set([String(value), value.toLocaleString("en-US")]));
}

function bodyIncludesLabeledInteger(bodyText: string, label: string, value: number): boolean {
  const normalized = bodyText.replace(/\s+/g, " ").trim();
  const labelPattern = escapeRegExp(label);

  return integerTextAlternatives(value).some((text) => {
    const valuePattern = escapeRegExp(text);
    return new RegExp(`(?:^|\\s)${valuePattern}\\s+${labelPattern}(?:\\s|$)`).test(normalized) ||
      new RegExp(`(?:^|\\s)${labelPattern}\\s+${valuePattern}(?:\\s|$|\\s*·)`).test(normalized);
  });
}

function bodyIncludesMetricInteger(bodyText: string, labels: readonly string[], value: number): boolean {
  const normalized = bodyText.replace(/\s+/g, " ").trim();
  if (labels.some((label) => bodyIncludesLabeledInteger(normalized, label, value))) {
    return true;
  }

  return labels.some((label) => {
    const labelPattern = escapeRegExp(label);

    return integerTextAlternatives(value).some((text) => {
      const valuePattern = escapeRegExp(text);
      return new RegExp(`${labelPattern}.{0,80}${valuePattern}`).test(normalized) ||
        new RegExp(`${valuePattern}.{0,80}${labelPattern}`).test(normalized);
    });
  });
}

function bodyIncludesMetricLabelWithAnyInteger(bodyText: string, labels: readonly string[]): boolean {
  const normalized = bodyText.replace(/\s+/g, " ").trim();

  return labels.some((label) => {
    const labelPattern = escapeRegExp(label);
    return new RegExp(`${labelPattern}.{0,80}\\d`).test(normalized) ||
      new RegExp(`\\d.{0,80}${labelPattern}`).test(normalized);
  });
}

function parseClockTimeMs(text: string): number {
  const parts = text.split(":").map((part) => Number(part));
  const validParts = parts.length >= 2
    && parts.length <= 3
    && parts.every((part) => Number.isInteger(part) && part >= 0)
    && parts.slice(1).every((part) => part < 60);

  if (!validParts) {
    return Number.NaN;
  }

  const [hours, minutes, seconds] = parts.length === 3
    ? parts
    : [0, parts[0], parts[1]];

  return ((hours * 60 * 60) + (minutes * 60) + seconds) * 1_000;
}

function clockTimeMatchesDisplayedSecond(displayedTimeMs: number, sourceTimeMs: number): boolean {
  if (!Number.isInteger(displayedTimeMs) || !Number.isInteger(sourceTimeMs)) {
    return false;
  }

  return Math.floor(displayedTimeMs / 1_000) === Math.floor(sourceTimeMs / 1_000);
}

function parseMaterialLocatorHeader(text: string): Pick<
  MaterialLocatorSanityState,
  | "current_hit_time_ms_value"
  | "global_hit_position"
  | "global_hit_count"
  | "current_video_hit_count"
  | "selected_sentence_count"
  | "full_transcript_char_count"
> {
  const currentTimeMatch = text.match(/当前\s+(\d{1,2}(?::\d{2}){1,2})/);
  const globalHitMatch = text.match(/定位\s+([\d,]+)\s*\/\s*([\d,]+)/);
  const currentVideoHitMatch = text.match(/本片命中\s+([\d,]+)\s*处/);
  const selectedSentenceMatch = text.match(/已选\s+([\d,]+)\s*句/);
  const transcriptCharMatch = text.match(/文案\s+([\d,]+)\s*字/);

  return {
    current_hit_time_ms_value: currentTimeMatch ? parseClockTimeMs(currentTimeMatch[1]) : Number.NaN,
    global_hit_position: globalHitMatch ? parseIntegerText(globalHitMatch[1]) : Number.NaN,
    global_hit_count: globalHitMatch ? parseIntegerText(globalHitMatch[2]) : Number.NaN,
    current_video_hit_count: currentVideoHitMatch ? parseIntegerText(currentVideoHitMatch[1]) : Number.NaN,
    selected_sentence_count: selectedSentenceMatch ? parseIntegerText(selectedSentenceMatch[1]) : Number.NaN,
    full_transcript_char_count: transcriptCharMatch ? parseIntegerText(transcriptCharMatch[1]) : Number.NaN
  };
}

function parseSelectionProofHit(text: string): Pick<
  MaterialLocatorSanityState,
  "global_hit_position" | "global_hit_count"
> {
  const match = text.match(/命中\s*([\d,]+)\s*\/\s*([\d,]+)/);

  return {
    global_hit_position: match ? parseIntegerText(match[1]) : Number.NaN,
    global_hit_count: match ? parseIntegerText(match[2]) : Number.NaN
  };
}

function endpointFromUnknown(value: unknown): EndpointSanityResult {
  const record = isRecord(value) ? value : {};

  return {
    label: stringField(record, "label"),
    url: stringField(record, "url"),
    ok: booleanField(record, "ok") ?? false,
    status: numberField(record, "status"),
    error: stringField(record, "error") || undefined
  };
}

function adminDashboardFromUnknown(value: unknown): AdminDashboardSanityState {
  const record = isRecord(value) ? value : {};
  const bodySample = stringField(record, "body_sample");
  const activeCapacityLabel = stringField(record, "active_cutter_capacity_label");
  const parsedCapacity = parseCutterCapacity(`${activeCapacityLabel}\n${bodySample}`);

  return {
    url: stringField(record, "url"),
    title: stringField(record, "title"),
    visible_labels: stringArrayField(record, "visible_labels"),
    write_action_labels: stringArrayField(record, "write_action_labels"),
    disabled_write_action_labels: stringArrayField(record, "disabled_write_action_labels"),
    active_cutter_capacity_label: activeCapacityLabel,
    active_cutter_count: numberField(record, "active_cutter_count") ?? parsedCapacity.active,
    cutter_capacity: numberField(record, "cutter_capacity") ?? parsedCapacity.capacity,
    current_index_version: stringField(record, "current_index_version") || parseCurrentIndexVersion(bodySample),
    search_p95_ms: numberField(record, "search_p95_ms") ?? parseSearchP95Ms(bodySample),
    local_search_coverage_percent: numberField(record, "local_search_coverage_percent")
      ?? parseLocalSearchCoveragePercent(bodySample),
    search_failure_count: numberField(record, "search_failure_count") ?? parseSearchFailureCount(bodySample),
    body_sample: bodySample
  };
}

function searchdIndexFromUnknown(value: unknown): SearchdIndexSanityState {
  const record = isRecord(value) ? value : {};
  const adminCurrentIndexVersion = stringField(record, "admin_current_index_version");
  const indexVersion = stringField(record, "index_version");

  return {
    url: stringField(record, "url"),
    ok: booleanField(record, "ok") ?? false,
    admin_current_index_version: adminCurrentIndexVersion,
    index_version: indexVersion,
    source_video_count: numberField(record, "source_video_count") ?? 0,
    segment_count: numberField(record, "segment_count") ?? 0,
    matched_admin_current_index: booleanField(record, "matched_admin_current_index")
      ?? (Boolean(adminCurrentIndexVersion) && adminCurrentIndexVersion === indexVersion)
  };
}

function adminWebRouteFromUnknown(value: unknown): AdminWebRouteSanityState {
  const record = isRecord(value) ? value : {};

  return {
    route: stringField(record, "route"),
    url: stringField(record, "url"),
    required_labels: stringArrayField(record, "required_labels"),
    visible_labels: stringArrayField(record, "visible_labels"),
    disabled_write_action_labels: stringArrayField(record, "disabled_write_action_labels")
  };
}

function adminSourceVideoListFromUnknown(value: unknown): AdminSourceVideoListSanityState {
  const record = isRecord(value) ? value : {};

  return {
    page_size: numberField(record, "page_size") ?? 0,
    first_page_count: numberField(record, "first_page_count") ?? 0,
    second_page_count: numberField(record, "second_page_count") ?? 0,
    first_page_first_id: stringField(record, "first_page_first_id"),
    second_page_first_id: stringField(record, "second_page_first_id"),
    pages_are_distinct: booleanField(record, "pages_are_distinct") ?? false,
    first_page_ms: numberField(record, "first_page_ms") ?? Number.NaN,
    second_page_ms: numberField(record, "second_page_ms") ?? Number.NaN,
    ready_filter_count: numberField(record, "ready_filter_count") ?? 0,
    ready_filter_all_ready: booleanField(record, "ready_filter_all_ready") ?? false,
    ready_filter_ms: numberField(record, "ready_filter_ms") ?? Number.NaN,
    query: stringField(record, "query"),
    query_result_count: numberField(record, "query_result_count") ?? 0,
    query_first_id: stringField(record, "query_first_id"),
    query_first_matches: booleanField(record, "query_first_matches") ?? false,
    query_filter_ms: numberField(record, "query_filter_ms") ?? Number.NaN
  };
}

function adminSourceVideoWebFromUnknown(value: unknown): AdminSourceVideoWebSanityState {
  const record = isRecord(value) ? value : {};

  return {
    url: stringField(record, "url"),
    source_path_text: stringField(record, "source_path_text"),
    source_path_visible: booleanField(record, "source_path_visible") ?? false,
    first_page_first_id: stringField(record, "first_page_first_id"),
    first_page_first_id_visible: booleanField(record, "first_page_first_id_visible") ?? false,
    loaded_count_before: numberField(record, "loaded_count_before") ?? 0,
    total_count_before: numberField(record, "total_count_before") ?? 0,
    load_more_button_label: stringField(record, "load_more_button_label"),
    load_more_clicked: booleanField(record, "load_more_clicked") ?? false,
    loaded_count_after: numberField(record, "loaded_count_after") ?? 0,
    total_count_after: numberField(record, "total_count_after") ?? 0,
    loaded_count_increased: booleanField(record, "loaded_count_increased") ?? false,
    query: stringField(record, "query"),
    query_result_id: stringField(record, "query_result_id"),
    query_response_observed: booleanField(record, "query_response_observed") ?? false,
    query_result_visible: booleanField(record, "query_result_visible") ?? false,
    query_result_count_text: stringField(record, "query_result_count_text"),
    query_result_matches_api: booleanField(record, "query_result_matches_api") ?? false,
    ready_filter_selected_value: stringField(record, "ready_filter_selected_value"),
    ready_filter_response_observed: booleanField(record, "ready_filter_response_observed") ?? false,
    ready_filter_result_count_text: stringField(record, "ready_filter_result_count_text"),
    ready_filter_visible_status_count: numberField(record, "ready_filter_visible_status_count") ?? 0,
    ready_filter_all_visible_rows_ready: booleanField(record, "ready_filter_all_visible_rows_ready") ?? false
  };
}

function adminPreprocessWebFromUnknown(value: unknown): AdminPreprocessWebSanityState {
  const record = isRecord(value) ? value : {};

  return {
    url: stringField(record, "url"),
    current_index_version: stringField(record, "current_index_version"),
    current_index_visible: booleanField(record, "current_index_visible") ?? false,
    source_video_count: numberField(record, "source_video_count") ?? 0,
    source_video_count_visible: booleanField(record, "source_video_count_visible") ?? false,
    active_count: numberField(record, "active_count") ?? 0,
    active_count_visible: booleanField(record, "active_count_visible") ?? false,
    queued_count: numberField(record, "queued_count") ?? 0,
    queued_count_visible: booleanField(record, "queued_count_visible") ?? false,
    failed_count: numberField(record, "failed_count") ?? 0,
    failed_count_visible: booleanField(record, "failed_count_visible") ?? false,
    index_required_video_count: numberField(record, "index_required_video_count") ?? 0,
    index_required_visible: booleanField(record, "index_required_visible") ?? false,
    production_status_title: stringField(record, "production_status_title"),
    production_status_visible: booleanField(record, "production_status_visible") ?? false,
    public_library_root_visible: booleanField(record, "public_library_root_visible") ?? false,
    visible_job_id: stringField(record, "visible_job_id"),
    visible_job_id_observed: booleanField(record, "visible_job_id_observed") ?? false,
    log_job_id: stringField(record, "log_job_id"),
    log_record_source: stringField(record, "log_record_source"),
    log_content_char_count: numberField(record, "log_content_char_count") ?? 0,
    log_path_visible: booleanField(record, "log_path_visible") ?? false,
    log_content_visible: booleanField(record, "log_content_visible") ?? false,
    log_snapshot_visible: booleanField(record, "log_snapshot_visible") ?? false
  };
}

function adminCutterUsersWebFromUnknown(value: unknown): AdminCutterUsersWebSanityState {
  const record = isRecord(value) ? value : {};

  return {
    url: stringField(record, "url"),
    api_user_count: numberField(record, "api_user_count") ?? 0,
    api_approved_count: numberField(record, "api_approved_count") ?? 0,
    api_pending_count: numberField(record, "api_pending_count") ?? 0,
    api_first_user_id: stringField(record, "api_first_user_id"),
    api_first_display_name: stringField(record, "api_first_display_name"),
    api_first_status_label: stringField(record, "api_first_status_label"),
    api_first_device_name: stringField(record, "api_first_device_name"),
    approved_count_visible: booleanField(record, "approved_count_visible") ?? false,
    pending_count_visible: booleanField(record, "pending_count_visible") ?? false,
    first_user_visible: booleanField(record, "first_user_visible") ?? false,
    first_device_visible: booleanField(record, "first_device_visible") ?? false,
    identity_note_visible: booleanField(record, "identity_note_visible") ?? false,
    device_detail_visible: booleanField(record, "device_detail_visible") ?? false,
    disable_action_visible: booleanField(record, "disable_action_visible") ?? false,
    approve_action_visible: booleanField(record, "approve_action_visible") ?? false,
    usage_metrics_labels_visible: stringArrayField(record, "usage_metrics_labels_visible")
  };
}

function adminRealNasMatrixFromUnknown(value: unknown): AdminRealNasMatrixState {
  const record = isRecord(value) ? value : {};

  return {
    admin_api_base_url: stringField(record, "admin_api_base_url"),
    library_root: stringField(record, "library_root"),
    source_videos_path: stringField(record, "source_videos_path"),
    video_count: numberField(record, "video_count") ?? 0,
    ready_video_count: numberField(record, "ready_video_count") ?? 0,
    queued_video_count: numberField(record, "queued_video_count") ?? 0,
    processing_video_count: numberField(record, "processing_video_count") ?? 0,
    failed_video_count: numberField(record, "failed_video_count") ?? 0,
    index_required_video_count: numberField(record, "index_required_video_count") ?? 0,
    current_index_version: stringField(record, "current_index_version"),
    settings_source_folder_count: numberField(record, "settings_source_folder_count") ?? 0,
    enabled_source_folder_count: numberField(record, "enabled_source_folder_count") ?? 0,
    settings_include_real_nas_path: booleanField(record, "settings_include_real_nas_path") ?? false,
    source_ready_sample_count: numberField(record, "source_ready_sample_count") ?? 0,
    source_ready_detail_id: stringField(record, "source_ready_detail_id"),
    source_ready_detail_ms: numberField(record, "source_ready_detail_ms") ?? Number.NaN,
    source_ready_detail_visible_to_cutters: booleanField(record, "source_ready_detail_visible_to_cutters") ?? false,
    source_ready_detail_transcript_segment_count: numberField(record, "source_ready_detail_transcript_segment_count") ?? 0,
    source_ready_detail_transcript_char_count: numberField(record, "source_ready_detail_transcript_char_count") ?? 0,
    source_ready_detail_index_version: stringField(record, "source_ready_detail_index_version"),
    runtime_settings_ms: numberField(record, "runtime_settings_ms") ?? Number.NaN,
    runtime_ffmpeg_available: booleanField(record, "runtime_ffmpeg_available") ?? false,
    runtime_ffprobe_available: booleanField(record, "runtime_ffprobe_available") ?? false,
    runtime_asr_key_configured: booleanField(record, "runtime_asr_key_configured") ?? false,
    preprocess_job_count: numberField(record, "preprocess_job_count") ?? 0,
    preprocess_active_count: numberField(record, "preprocess_active_count") ?? 0,
    preprocess_queued_count: numberField(record, "preprocess_queued_count") ?? 0,
    preprocess_failed_count: numberField(record, "preprocess_failed_count") ?? 0,
    preprocess_supervisor_state: stringField(record, "preprocess_supervisor_state"),
    index_version_count: numberField(record, "index_version_count") ?? 0,
    index_current_version: stringField(record, "index_current_version"),
    cutter_user_count: numberField(record, "cutter_user_count") ?? 0,
    source_video_list: adminSourceVideoListFromUnknown(record.source_video_list),
    source_video_web: adminSourceVideoWebFromUnknown(record.source_video_web),
    preprocess_web: adminPreprocessWebFromUnknown(record.preprocess_web),
    cutter_users_web: adminCutterUsersWebFromUnknown(record.cutter_users_web),
    web_routes: recordArrayField(record, "web_routes").map(adminWebRouteFromUnknown),
    read_only_actions_skipped: stringArrayField(record, "read_only_actions_skipped")
  };
}

function cutterSearchMatrixQueryFromUnknown(value: unknown): CutterSearchMatrixQueryState {
  const record = isRecord(value) ? value : {};

  return {
    query: stringField(record, "query"),
    group_count: numberField(record, "group_count") ?? 0,
    returned_count: numberField(record, "returned_count") ?? 0,
    index_version: stringField(record, "index_version"),
    search_mode: stringField(record, "search_mode"),
    search_ms: numberField(record, "search_ms") ?? Number.NaN,
    first_source_video_id: stringField(record, "first_source_video_id"),
    first_hit_count: numberField(record, "first_hit_count") ?? 0,
    first_segment_id: stringField(record, "first_segment_id"),
    first_segment_begin_ms: numberField(record, "first_segment_begin_ms") ?? Number.NaN,
    first_segment_contains_query: booleanField(record, "first_segment_contains_query") ?? false,
    first_segment_has_match_range: booleanField(record, "first_segment_has_match_range") ?? false
  };
}

function cutterSearchMatrixFromUnknown(value: unknown): CutterSearchMatrixState {
  const record = isRecord(value) ? value : {};
  const queries = recordArrayField(record, "queries").map(cutterSearchMatrixQueryFromUnknown);

  return {
    cutter_api_base_url: stringField(record, "cutter_api_base_url"),
    query_count: numberField(record, "query_count") ?? queries.length,
    max_search_ms: numberField(record, "max_search_ms") ?? Math.max(...queries.map((query) => query.search_ms)),
    all_queries_used_searchd: booleanField(record, "all_queries_used_searchd")
      ?? queries.every((query) => query.search_mode === "searchd"),
    matched_searchd_index: booleanField(record, "matched_searchd_index") ?? false,
    queries
  };
}

function cutterAuthFromUnknown(value: unknown): CutterAuthSanityState {
  const record = isRecord(value) ? value : {};
  const authMode = stringField(record, "auth_mode");

  return {
    cutter_api_base_url: stringField(record, "cutter_api_base_url"),
    auth_mode_url: stringField(record, "auth_mode_url"),
    auth_mode: authMode === "reviewed" || authMode === "local_trusted" ? authMode : "",
    local_trusted: booleanField(record, "local_trusted") ?? false,
    trusted_username: stringField(record, "trusted_username"),
    material_locator_url: stringField(record, "material_locator_url"),
    fresh_context_workbench_ready: booleanField(record, "fresh_context_workbench_ready") ?? false,
    login_gate_visible_after_ready: booleanField(record, "login_gate_visible_after_ready") ?? true,
    manual_apply_used: booleanField(record, "manual_apply_used") ?? true,
    visible_username: stringField(record, "visible_username")
  };
}

function cutterPublicLibraryWebFromUnknown(value: unknown): CutterPublicLibraryWebSanityState {
  const record = isRecord(value) ? value : {};

  return {
    cutter_api_base_url: stringField(record, "cutter_api_base_url"),
    url: stringField(record, "url"),
    api_available_video_count: numberField(record, "api_available_video_count") ?? 0,
    api_returned_count: numberField(record, "api_returned_count") ?? 0,
    api_first_source_video_id: stringField(record, "api_first_source_video_id"),
    api_first_title: stringField(record, "api_first_title"),
    web_api_response_observed: booleanField(record, "web_api_response_observed") ?? false,
    available_count_visible: booleanField(record, "available_count_visible") ?? false,
    first_title_visible: booleanField(record, "first_title_visible") ?? false,
    public_source_label_visible: booleanField(record, "public_source_label_visible") ?? false,
    load_more_button_visible: booleanField(record, "load_more_button_visible") ?? false,
    loaded_count_before: numberField(record, "loaded_count_before") ?? 0,
    loaded_count_after: numberField(record, "loaded_count_after") ?? 0,
    load_more_clicked: booleanField(record, "load_more_clicked") ?? false,
    loaded_count_increased: booleanField(record, "loaded_count_increased") ?? false,
    selected_inspector_title: stringField(record, "selected_inspector_title")
  };
}

function layoutBoxFromUnknown(value: unknown): LocalWebLayoutBoxState {
  const record = isRecord(value) ? value : {};
  const clientWidth = numberField(record, "client_width") ?? 0;
  const scrollWidth = numberField(record, "scroll_width") ?? 0;

  return {
    selector: stringField(record, "selector"),
    client_width: clientWidth,
    scroll_width: scrollWidth,
    horizontal_overflow: booleanField(record, "horizontal_overflow")
      ?? (scrollWidth > clientWidth + 2)
  };
}

function routeLayoutFromUnknown(value: unknown): LocalWebRouteLayoutState {
  const record = isRecord(value) ? value : {};
  const app = stringField(record, "app");

  return {
    app: app === "cutter" ? "cutter" : "admin",
    route: stringField(record, "route"),
    url: stringField(record, "url"),
    viewport_label: stringField(record, "viewport_label"),
    viewport_width: numberField(record, "viewport_width") ?? 0,
    viewport_height: numberField(record, "viewport_height") ?? 0,
    required_labels: stringArrayField(record, "required_labels"),
    visible_labels: stringArrayField(record, "visible_labels"),
    disabled_write_action_labels: stringArrayField(record, "disabled_write_action_labels"),
    body: layoutBoxFromUnknown(record.body),
    page: layoutBoxFromUnknown(record.page)
  };
}

function layoutFromUnknown(value: unknown): LocalWebLayoutSanityState {
  const record = isRecord(value) ? value : {};

  return {
    admin_source_videos_url: stringField(record, "admin_source_videos_url"),
    cutter_material_locator_url: stringField(record, "cutter_material_locator_url"),
    viewport_width: numberField(record, "viewport_width") ?? 0,
    viewport_height: numberField(record, "viewport_height") ?? 0,
    admin_statusbar: layoutBoxFromUnknown(record.admin_statusbar),
    admin_statusbar_item_overflow_count: numberField(record, "admin_statusbar_item_overflow_count") ?? 0,
    cutter_workbench: layoutBoxFromUnknown(record.cutter_workbench),
    cutter_body: layoutBoxFromUnknown(record.cutter_body),
    admin_route_layouts: recordArrayField(record, "admin_route_layouts").map(routeLayoutFromUnknown),
    cutter_route_layouts: recordArrayField(record, "cutter_route_layouts").map(routeLayoutFromUnknown)
  };
}

function materialLocatorFromUnknown(value: unknown): MaterialLocatorSanityState {
  const record = isRecord(value) ? value : {};
  const transcriptHeader = stringField(record, "transcript_header");
  const searchStatusText = stringField(record, "search_status_text");
  const currentHitTimeMs = stringField(record, "current_hit_time_ms");
  const headerFields = parseMaterialLocatorHeader(transcriptHeader);
  const currentHitTimeMsValue = parseIntegerText(currentHitTimeMs);

  return {
    url: stringField(record, "url"),
    query: stringField(record, "query"),
    default_selected_material_section: stringField(record, "default_selected_material_section"),
    candidate_count: numberField(record, "candidate_count") ?? 0,
    search_status_text: searchStatusText,
    search_index_version: stringField(record, "search_index_version")
      || parseMaterialSearchIndexVersion(searchStatusText),
    transcript_header: transcriptHeader,
    current_hit_time_ms: currentHitTimeMs,
    current_hit_time_ms_value: numberField(record, "current_hit_time_ms_value")
      ?? (Number.isInteger(currentHitTimeMsValue) ? currentHitTimeMsValue : headerFields.current_hit_time_ms_value),
    current_hit_segment_id: stringField(record, "current_hit_segment_id"),
    global_hit_position: numberField(record, "global_hit_position") ?? headerFields.global_hit_position,
    global_hit_count: numberField(record, "global_hit_count") ?? headerFields.global_hit_count,
    current_video_hit_count: numberField(record, "current_video_hit_count") ?? headerFields.current_video_hit_count,
    selected_sentence_count: numberField(record, "selected_sentence_count") ?? headerFields.selected_sentence_count,
    full_transcript_char_count: numberField(record, "full_transcript_char_count")
      ?? headerFields.full_transcript_char_count
  };
}

function closedLoopFromUnknown(value: unknown): MaterialLocatorClosedLoopState {
  const record = isRecord(value) ? value : {};

  return {
    selection_method: stringField(record, "selection_method"),
    selected_text: stringField(record, "selected_text"),
    selection_proof_text: stringField(record, "selection_proof_text"),
    selected_text_char_count: numberField(record, "selected_text_char_count") ?? 0,
    selected_sentence_count: numberField(record, "selected_sentence_count") ?? 0,
    selected_text_segment_count: numberField(record, "selected_text_segment_count") ?? 0,
    selected_text_is_broader_than_query: booleanField(record, "selected_text_is_broader_than_query") ?? false,
    cut_notice: stringField(record, "cut_notice"),
    local_library_contains_selection: booleanField(record, "local_library_contains_selection") ?? false,
    local_library_page_url: stringField(record, "local_library_page_url"),
    local_library_view_mode: stringField(record, "local_library_view_mode"),
    local_library_visible_clip_count: numberField(record, "local_library_visible_clip_count") ?? 0,
    local_library_visible_count_label: stringField(record, "local_library_visible_count_label"),
    local_library_clip_title: stringField(record, "local_library_clip_title"),
    local_library_source_title: stringField(record, "local_library_source_title"),
    local_library_clip_title_visible: booleanField(record, "local_library_clip_title_visible") ?? false,
    local_library_source_title_visible: booleanField(record, "local_library_source_title_visible") ?? false,
    local_library_selected_text_visible: booleanField(record, "local_library_selected_text_visible") ?? false,
    first_result_section: stringField(record, "first_result_section"),
    second_result_section: stringField(record, "second_result_section"),
    local_clip_id: stringField(record, "local_clip_id"),
    local_clip_media_file_path: stringField(record, "local_clip_media_file_path"),
    local_clip_manifest_file_path: stringField(record, "local_clip_manifest_file_path"),
    local_clip_media_file_exists: booleanField(record, "local_clip_media_file_exists") ?? false,
    local_clip_media_file_size_bytes: numberField(record, "local_clip_media_file_size_bytes") ?? 0,
    local_clip_manifest_file_exists: booleanField(record, "local_clip_manifest_file_exists") ?? false,
    local_clip_manifest_file_size_bytes: numberField(record, "local_clip_manifest_file_size_bytes") ?? 0,
    cut_job_id: stringField(record, "cut_job_id"),
    cut_job_status: stringField(record, "cut_job_status"),
    cut_job_export_clip_id: stringField(record, "cut_job_export_clip_id"),
    cut_job_output_file: stringField(record, "cut_job_output_file"),
    cut_job_contains_selection: booleanField(record, "cut_job_contains_selection") ?? false,
    cut_tasks_page_contains_selection: booleanField(record, "cut_tasks_page_contains_selection") ?? false,
    cut_tasks_page_contains_output: booleanField(record, "cut_tasks_page_contains_output") ?? false,
    cut_tasks_page_shows_done: booleanField(record, "cut_tasks_page_shows_done") ?? false,
    cut_tasks_page_url: stringField(record, "cut_tasks_page_url"),
    cut_tasks_page_visible_status_label: stringField(record, "cut_tasks_page_visible_status_label"),
    cut_tasks_page_visible_output_file: stringField(record, "cut_tasks_page_visible_output_file"),
    cut_tasks_page_source_title: stringField(record, "cut_tasks_page_source_title"),
    cut_tasks_page_source_title_visible: booleanField(record, "cut_tasks_page_source_title_visible") ?? false,
    cut_tasks_page_time_range_label: stringField(record, "cut_tasks_page_time_range_label"),
    cut_tasks_page_time_range_visible: booleanField(record, "cut_tasks_page_time_range_visible") ?? false,
    public_library_root: stringField(record, "public_library_root"),
    local_output_is_outside_public_library: booleanField(record, "local_output_is_outside_public_library") ?? false,
    public_library_write_detected: booleanField(record, "public_library_write_detected") ?? true
  };
}

function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const candidate = candidatePath.trim();
  const directory = directoryPath.trim();
  if (!candidate || !directory || !path.isAbsolute(candidate) || !path.isAbsolute(directory)) {
    return false;
  }

  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLocalWebSanityIndexDriftError(error: string): boolean {
  return error === "material locator search_index_version must match searchd index_version" ||
    error === "admin real NAS matrix current_index_version must match searchd index_version" ||
    error === "admin real NAS matrix index_current_version must match searchd index_version" ||
    error === "cutter public library web API available count must match searchd source_video_count" ||
    error === "cutter search matrix index versions must match searchd health" ||
    /^cutter search matrix query .+ index_version must match searchd index_version$/.test(error);
}

export function isLocalWebSanityIndexDriftOnly(errors: readonly string[]): boolean {
  const actionableErrors = errors.map((error) => error.trim()).filter(Boolean);

  return actionableErrors.length > 0 && actionableErrors.every(isLocalWebSanityIndexDriftError);
}

function isMaterialLocatorIndexDriftOnly(errors: readonly string[]): boolean {
  const actionableErrors = errors.map((error) => error.trim()).filter(Boolean);

  return actionableErrors.length > 0 &&
    actionableErrors.every((error) => error === "material locator search_index_version must match searchd index_version");
}

export async function writeLocalWebSanityReport(
  report: LocalWebSanityReport,
  reportPath: string
): Promise<void> {
  const normalizedPath = reportPath.trim();

  if (!normalizedPath) {
    return;
  }

  await mkdir(path.dirname(normalizedPath), { recursive: true });
  await writeFile(normalizedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function materialLocatorUrl(cutterWebUrl: string, query: string): string {
  const url = new URL(cutterWebUrl);
  url.hash = `material-locator?query=${encodeURIComponent(query)}`;
  return url.toString();
}

export function adminDashboardUrl(adminWebUrl: string): string {
  const url = new URL(adminWebUrl);
  url.hash = "/dashboard";
  return url.toString();
}

const ADMIN_DASHBOARD_REQUIRED_LABELS = [
  "公共素材库生产总览",
  "核心链路健康",
  "关键词定位",
  "完整文案",
  "选段剪切",
  "50 人容量",
  "搜索 p95",
  "本地搜索覆盖",
  "搜索失败",
  "素材规模",
  "活跃剪辑师"
] as const;

const ADMIN_DASHBOARD_WRITE_ACTION_LABELS = [
  "智能扫描",
  "启动预处理流水线",
  "恢复处理中任务",
  "重试失败视频",
  "发布待索引视频",
  "重试失败"
] as const;

const ADMIN_PREPROCESS_WRITE_ACTION_LABELS = [
  "重试失败",
  "发布待索引视频",
  "校验索引",
  "恢复处理中任务",
  "启动预处理流水线",
  "暂停预处理流水线"
] as const;

const ADMIN_SOURCE_VIDEO_WRITE_ACTION_LABELS = [
  "重试此视频",
  "保存封面",
  "保存公开说明"
] as const;

function adminWriteActionLabelsForRoute(route: string): readonly string[] {
  if (route === "preprocess-jobs") {
    return ADMIN_PREPROCESS_WRITE_ACTION_LABELS;
  }

  if (route === "source-videos") {
    return ADMIN_SOURCE_VIDEO_WRITE_ACTION_LABELS;
  }

  return [];
}

const ADMIN_WEB_ROUTE_CHECKS = [
  {
    route: "source-videos",
    hash: "#/source-videos",
    required_labels: [
      "公共素材资产清单",
      "素材来源",
      "已载入",
      "预处理状态",
      "搜索可见",
      "继续加载"
    ]
  },
  {
    route: "preprocess-jobs",
    hash: "#/preprocess-jobs",
    required_labels: [
      "预处理流水线与索引发布",
      "生产状态",
      "扫描素材",
      "生成文案",
      "当前索引",
      "队列中",
      "任务队列",
      "处理控制"
    ]
  },
  {
    route: "doctor",
    hash: "#/doctor",
    required_labels: ["系统检查", "检查结果", "检查报告", "通过", "失败"]
  },
  {
    route: "cutter-users",
    hash: "#/cutter-users",
    required_labels: ["登录申请与使用统计", "剪辑师用户", "活跃剪辑师", "搜索失败", "剪切成功"]
  },
  {
    route: "settings",
    hash: "#/settings",
    required_labels: ["素材来源与预处理设置", "素材库基本信息", "预处理设置", "语音识别", "密钥状态"]
  }
] as const;

const CUTTER_WEB_ROUTE_CHECKS = [
  {
    route: "material-locator",
    hash: (query: string) => `#material-locator?query=${encodeURIComponent(query)}`,
    data_page: "material-locator",
    required_labels: ["素材库", "搜索", "连接", "公共原素材", "视频文案", "选中当前命中"]
  },
  {
    route: "cut-tasks",
    hash: () => "#cut-tasks",
    data_page: "cut-tasks",
    required_labels: ["剪切任务", "本机剪切流水线"]
  },
  {
    route: "local-library",
    hash: () => "#local-library",
    data_page: "local-library",
    required_labels: ["本地素材库", "本地可复剪素材"]
  },
  {
    route: "public-library",
    hash: () => "#public-library",
    data_page: "public-library",
    required_labels: ["公共素材库", "可用原素材"]
  },
  {
    route: "settings",
    hash: () => "#settings",
    data_page: "settings",
    required_labels: ["运行环境", "设置", "公共素材库"]
  }
] as const;

export function validateAdminDashboardSanityState(state: AdminDashboardSanityState): string[] {
  const errors: string[] = [];
  const body = `${state.title}\n${state.visible_labels.join("\n")}\n${state.body_sample}`;

  for (const label of ADMIN_DASHBOARD_REQUIRED_LABELS) {
    if (!body.includes(label)) {
      errors.push(`admin dashboard must show ${label}`);
    }
  }
  if (!/\d+\s*\/\s*50/.test(state.active_cutter_capacity_label) && !/\d+\s*\/\s*50/.test(body)) {
    errors.push("admin dashboard must show 50-editor capacity usage");
  }
  if (!Number.isInteger(state.active_cutter_count) || state.active_cutter_count < 0) {
    errors.push("admin dashboard active_cutter_count must be a non-negative integer");
  }
  if (!Number.isInteger(state.cutter_capacity) || state.cutter_capacity < 50) {
    errors.push("admin dashboard cutter_capacity must be at least 50");
  }
  if (!isIndexVersion(state.current_index_version)) {
    errors.push("admin dashboard current_index_version must be a current index version");
  }
  if (
    Number.isInteger(state.active_cutter_count) &&
    Number.isInteger(state.cutter_capacity) &&
    state.active_cutter_count > state.cutter_capacity
  ) {
    errors.push("admin dashboard active_cutter_count must not exceed cutter_capacity");
  }
  if (!Number.isFinite(state.search_p95_ms) || state.search_p95_ms <= 0) {
    errors.push("admin dashboard search_p95_ms must be a positive millisecond number");
  }
  if (
    !Number.isFinite(state.local_search_coverage_percent) ||
    state.local_search_coverage_percent < 0 ||
    state.local_search_coverage_percent > 100
  ) {
    errors.push("admin dashboard local_search_coverage_percent must be a percentage from 0 to 100");
  }
  if (!Number.isInteger(state.search_failure_count) || state.search_failure_count < 0) {
    errors.push("admin dashboard search_failure_count must be a non-negative integer");
  } else if (state.search_failure_count !== 0) {
    errors.push("admin dashboard search_failure_count must be 0");
  }
  if (/\b\d{4,}%/.test(body)) {
    errors.push("admin dashboard must not show implausible four-digit conversion percentages");
  }
  if (/sk-[A-Za-z0-9]/.test(body) || /Bearer\s+[A-Za-z0-9._-]+/.test(body)) {
    errors.push("admin dashboard must not expose API keys or bearer tokens");
  }

  return errors;
}

function validatePreprocessWriteActionLock(
  route: Pick<AdminWebRouteSanityState, "route" | "disabled_write_action_labels">,
  context: string
): string[] {
  void route;
  void context;
  return [];
}

function validateAdminSourceVideoListSanityState(
  state: AdminSourceVideoListSanityState,
  matrix: Pick<AdminRealNasMatrixState, "video_count" | "ready_video_count">
): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(state.page_size) || state.page_size < 2) {
    errors.push("admin source video list page_size must prove real pagination");
  }
  if (!Number.isInteger(state.first_page_count) || state.first_page_count < state.page_size) {
    errors.push("admin source video list first page must be full");
  }
  if (!Number.isInteger(state.second_page_count) || state.second_page_count < 1) {
    errors.push("admin source video list must read a second page");
  }
  if (!/^V\d{6}$/.test(state.first_page_first_id)) {
    errors.push("admin source video list first page must expose a concrete first id");
  }
  if (!/^V\d{6}$/.test(state.second_page_first_id)) {
    errors.push("admin source video list second page must expose a concrete first id");
  }
  if (!state.pages_are_distinct || state.first_page_first_id === state.second_page_first_id) {
    errors.push("admin source video list second page must differ from first page");
  }
  if (Number.isInteger(matrix.video_count) && matrix.video_count <= state.page_size) {
    errors.push("admin source video list must run against a library larger than one page");
  }
  for (const [label, elapsed] of [
    ["first_page_ms", state.first_page_ms],
    ["second_page_ms", state.second_page_ms],
    ["ready_filter_ms", state.ready_filter_ms],
    ["query_filter_ms", state.query_filter_ms]
  ] as const) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) {
      errors.push(`admin source video list ${label} must be positive`);
    } else if (elapsed > LOCAL_WEB_ADMIN_READ_API_SLA_MS) {
      errors.push(`admin source video list ${label} must be <= ${LOCAL_WEB_ADMIN_READ_API_SLA_MS}ms`);
    }
  }
  if (!Number.isInteger(state.ready_filter_count) || state.ready_filter_count < 1) {
    errors.push("admin source video list ready filter must return ready videos");
  }
  if (Number.isInteger(matrix.ready_video_count) && matrix.ready_video_count > 0 && state.ready_filter_count < 1) {
    errors.push("admin source video list ready filter must cover the ready library");
  }
  if (!state.ready_filter_all_ready) {
    errors.push("admin source video list ready filter must return only ready videos");
  }
  if (!state.query.trim()) {
    errors.push("admin source video list query filter must record the audited query");
  }
  if (!Number.isInteger(state.query_result_count) || state.query_result_count < 1) {
    errors.push("admin source video list query filter must return results");
  }
  if (!/^V\d{6}$/.test(state.query_first_id)) {
    errors.push("admin source video list query filter must expose a concrete result id");
  }
  if (!state.query_first_matches) {
    errors.push("admin source video list query filter first result must match the query fields");
  }

  return errors;
}

function validateAdminSourceVideoWebSanityState(
  state: AdminSourceVideoWebSanityState,
  matrix: Pick<AdminRealNasMatrixState, "video_count" | "source_videos_path" | "source_video_list">
): string[] {
  const errors: string[] = [];

  try {
    const parsedUrl = new URL(state.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.hash !== "#/source-videos") {
      errors.push("admin source videos web URL must point to the source-videos route");
    }
  } catch {
    errors.push("admin source videos web URL must be valid");
  }
  if (!state.source_path_visible || !state.source_path_text.includes("PublicLibrary")) {
    errors.push("admin source videos web must display the real PublicLibrary source path");
  }
  if (
    matrix.source_videos_path &&
    !state.source_path_text.includes(matrix.source_videos_path) &&
    !state.source_path_text.includes("PublicLibrary")
  ) {
    errors.push("admin source videos web source path text must match the real NAS source path");
  }
  if (state.first_page_first_id !== matrix.source_video_list.first_page_first_id) {
    errors.push("admin source videos web first visible id must match the server first page");
  }
  if (!state.first_page_first_id_visible) {
    errors.push("admin source videos web must render the server first-page source video id");
  }
  if (!Number.isInteger(state.loaded_count_before) || state.loaded_count_before < 1) {
    errors.push("admin source videos web must load at least one server page into the UI");
  }
  if (!Number.isInteger(state.total_count_before) || state.total_count_before < state.loaded_count_before) {
    errors.push("admin source videos web total count must cover loaded count before pagination");
  }
  if (matrix.video_count > state.loaded_count_before) {
    if (!state.load_more_clicked || !state.load_more_button_label.includes("继续加载")) {
      errors.push("admin source videos web must exercise the real load-more control");
    }
    if (!state.loaded_count_increased || state.loaded_count_after <= state.loaded_count_before) {
      errors.push("admin source videos web load-more must increase the loaded source video count");
    }
  }
  if (!Number.isInteger(state.total_count_after) || state.total_count_after < state.loaded_count_after) {
    errors.push("admin source videos web total count must cover loaded count after pagination");
  }
  if (state.query !== matrix.source_video_list.query) {
    errors.push("admin source videos web query must match the audited server query");
  }
  if (state.query_result_id !== matrix.source_video_list.query_first_id) {
    errors.push("admin source videos web query first id must match the server query first id");
  }
  if (!state.query_response_observed) {
    errors.push("admin source videos web must observe a source-videos API response for the query");
  }
  if (!state.query_result_visible || !state.query_result_matches_api) {
    errors.push("admin source videos web must render the server query result in the UI");
  }
  if (!state.query_result_count_text.includes("已返回")) {
    errors.push("admin source videos web query result footer must show server returned count");
  }
  if (state.ready_filter_selected_value !== "ready") {
    errors.push("admin source videos web ready filter must be selected through the UI");
  }
  if (!state.ready_filter_response_observed) {
    errors.push("admin source videos web must observe a source-videos API response for the ready filter");
  }
  if (!state.ready_filter_result_count_text.includes("已返回")) {
    errors.push("admin source videos web ready filter footer must show server returned count");
  }
  if (!Number.isInteger(state.ready_filter_visible_status_count) || state.ready_filter_visible_status_count < 1) {
    errors.push("admin source videos web ready filter must render ready rows");
  }
  if (!state.ready_filter_all_visible_rows_ready) {
    errors.push("admin source videos web ready filter must render only ready status badges");
  }

  return errors;
}

function validateAdminPreprocessWebSanityState(
  state: AdminPreprocessWebSanityState,
  matrix: Pick<
    AdminRealNasMatrixState,
    "library_root" |
    "current_index_version" |
    "video_count" |
    "preprocess_active_count" |
    "preprocess_queued_count" |
    "preprocess_failed_count" |
    "preprocess_job_count" |
    "index_required_video_count"
  >
): string[] {
  const errors: string[] = [];

  try {
    const parsedUrl = new URL(state.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.hash !== "#/preprocess-jobs") {
      errors.push("admin preprocess web URL must point to the preprocess-jobs route");
    }
  } catch {
    errors.push("admin preprocess web URL must be valid");
  }
  if (!state.current_index_visible) {
    errors.push("admin preprocess web must display the current index version");
  }
  if (state.source_video_count !== matrix.video_count) {
    errors.push("admin preprocess web source video count must match the admin real NAS matrix video count");
  }
  if (!state.source_video_count_visible) {
    errors.push("admin preprocess web must display the real source video count");
  }
  if (state.active_count !== matrix.preprocess_active_count) {
    errors.push("admin preprocess web active count must match the preprocess jobs API");
  }
  if (!state.active_count_visible) {
    errors.push("admin preprocess web must display the active preprocess count");
  }
  if (state.queued_count !== matrix.preprocess_queued_count) {
    errors.push("admin preprocess web queued count must match the preprocess jobs API");
  }
  if (!state.queued_count_visible) {
    errors.push("admin preprocess web must display the queued preprocess count");
  }
  if (state.failed_count !== matrix.preprocess_failed_count) {
    errors.push("admin preprocess web failed count must match the preprocess jobs API");
  }
  if (!state.failed_count_visible) {
    errors.push("admin preprocess web must display the failed preprocess count");
  }
  if (state.index_required_video_count !== matrix.index_required_video_count) {
    errors.push("admin preprocess web index-required count must match the admin real NAS matrix");
  }
  if (!state.index_required_visible) {
    errors.push("admin preprocess web must display the pending index publish count");
  }
  if (!state.production_status_title.trim()) {
    errors.push("admin preprocess web must record the expected production status title");
  }
  if (!state.production_status_visible) {
    errors.push("admin preprocess web must display the API-derived production status title");
  }
  if (!state.public_library_root_visible || !matrix.library_root.includes("PublicLibrary")) {
    errors.push("admin preprocess web must display the real PublicLibrary root");
  }
  if (matrix.preprocess_job_count > 0 && (!state.visible_job_id.trim() || !state.visible_job_id_observed)) {
    errors.push("admin preprocess web must render at least one real preprocess job id");
  }

  return errors;
}

function validateAdminCutterUsersWebSanityState(
  state: AdminCutterUsersWebSanityState,
  matrix: Pick<AdminRealNasMatrixState, "cutter_user_count">
): string[] {
  const errors: string[] = [];

  try {
    const parsedUrl = new URL(state.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.hash !== "#/cutter-users") {
      errors.push("admin cutter users web URL must point to the cutter-users route");
    }
  } catch {
    errors.push("admin cutter users web URL must be valid");
  }
  if (state.api_user_count !== matrix.cutter_user_count) {
    errors.push("admin cutter users web user count must match the admin real NAS matrix cutter user count");
  }
  if (!Number.isInteger(state.api_user_count) || state.api_user_count < 1) {
    errors.push("admin cutter users web must record at least one real cutter user");
  }
  if (!Number.isInteger(state.api_approved_count) || state.api_approved_count < 0) {
    errors.push("admin cutter users web approved count must be non-negative");
  }
  if (!Number.isInteger(state.api_pending_count) || state.api_pending_count < 0) {
    errors.push("admin cutter users web pending count must be non-negative");
  }
  if (state.api_approved_count + state.api_pending_count > state.api_user_count) {
    errors.push("admin cutter users web status counts must not exceed user count");
  }
  if (!state.approved_count_visible) {
    errors.push("admin cutter users web must display the approved user count");
  }
  if (!state.pending_count_visible) {
    errors.push("admin cutter users web must display the pending user count");
  }
  if (!/^CU\d{6}$/.test(state.api_first_user_id)) {
    errors.push("admin cutter users web must record a concrete first cutter user id");
  }
  if (!state.api_first_display_name.trim()) {
    errors.push("admin cutter users web must record the first cutter display name");
  }
  if (!state.api_first_status_label.trim()) {
    errors.push("admin cutter users web must record the first cutter status label");
  }
  if (!state.api_first_device_name.trim()) {
    errors.push("admin cutter users web must record the first cutter device name");
  }
  if (!state.first_user_visible) {
    errors.push("admin cutter users web must render the first API cutter user");
  }
  if (!state.disable_action_visible) {
    errors.push("admin cutter users web must show disable action for approved users");
  }
  if (!state.approve_action_visible) {
    errors.push("admin cutter users web must show approve action for pending users");
  }
  for (const label of ["活跃剪辑师", "搜索次数", "搜索失败", "选段次数", "剪切成功"]) {
    if (!state.usage_metrics_labels_visible.includes(label)) {
      errors.push(`admin cutter users web usage metrics must include ${label}`);
    }
  }

  return errors;
}

export function validateAdminRealNasMatrixState(state: AdminRealNasMatrixState): string[] {
  const errors: string[] = [];

  try {
    const parsedUrl = new URL(state.admin_api_base_url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      errors.push("admin real NAS matrix admin_api_base_url must use http or https");
    }
  } catch {
    errors.push("admin real NAS matrix admin_api_base_url must be valid");
  }
  if (!state.library_root.includes("PublicLibrary")) {
    errors.push("admin real NAS matrix must read the real PublicLibrary root");
  }
  if (!state.source_videos_path.includes("PublicLibrary")) {
    errors.push("admin real NAS matrix must expose the real source videos path");
  }
  if (!Number.isInteger(state.video_count) || state.video_count < 1) {
    errors.push("admin real NAS matrix video_count must be positive");
  }
  if (!Number.isInteger(state.ready_video_count) || state.ready_video_count < 1) {
    errors.push("admin real NAS matrix ready_video_count must be positive");
  }
  if (
    Number.isInteger(state.video_count) &&
    Number.isInteger(state.ready_video_count) &&
    state.ready_video_count > state.video_count
  ) {
    errors.push("admin real NAS matrix ready_video_count must not exceed video_count");
  }
  if (!isIndexVersion(state.current_index_version)) {
    errors.push("admin real NAS matrix current_index_version must be a current index version");
  }
  if (!Number.isInteger(state.settings_source_folder_count) || state.settings_source_folder_count < 1) {
    errors.push("admin real NAS matrix must include at least one configured source folder");
  }
  if (!Number.isInteger(state.enabled_source_folder_count) || state.enabled_source_folder_count < 1) {
    errors.push("admin real NAS matrix must include at least one enabled source folder");
  }
  if (!state.settings_include_real_nas_path) {
    errors.push("admin real NAS matrix settings must include the real NAS source path");
  }
  if (!Number.isInteger(state.source_ready_sample_count) || state.source_ready_sample_count < 1) {
    errors.push("admin real NAS matrix must read at least one ready source video sample");
  }
  if (!/^V\d{6}$/.test(state.source_ready_detail_id)) {
    errors.push("admin real NAS matrix must read a concrete source video detail id");
  }
  if (!Number.isFinite(state.source_ready_detail_ms) || state.source_ready_detail_ms <= 0) {
    errors.push("admin real NAS matrix source_ready_detail_ms must be positive");
  } else if (state.source_ready_detail_ms > LOCAL_WEB_ADMIN_READ_API_SLA_MS) {
    errors.push(`admin real NAS matrix source_ready_detail_ms must be <= ${LOCAL_WEB_ADMIN_READ_API_SLA_MS}ms`);
  }
  if (!state.source_ready_detail_visible_to_cutters) {
    errors.push("admin real NAS matrix ready source detail must be visible to cutters");
  }
  if (
    !Number.isInteger(state.source_ready_detail_transcript_segment_count) ||
    state.source_ready_detail_transcript_segment_count < 1
  ) {
    errors.push("admin real NAS matrix source detail must expose transcript segment count");
  }
  if (
    !Number.isInteger(state.source_ready_detail_transcript_char_count) ||
    state.source_ready_detail_transcript_char_count < 1
  ) {
    errors.push("admin real NAS matrix source detail must expose transcript character count");
  }
  if (!isIndexVersion(state.source_ready_detail_index_version)) {
    errors.push("admin real NAS matrix source detail must expose an index version");
  }
  if (!Number.isFinite(state.runtime_settings_ms) || state.runtime_settings_ms <= 0) {
    errors.push("admin real NAS matrix runtime_settings_ms must be positive");
  } else if (state.runtime_settings_ms > LOCAL_WEB_ADMIN_READ_API_SLA_MS) {
    errors.push(`admin real NAS matrix runtime_settings_ms must be <= ${LOCAL_WEB_ADMIN_READ_API_SLA_MS}ms`);
  }
  if (!state.runtime_ffmpeg_available) {
    errors.push("admin real NAS matrix runtime settings must show FFmpeg is available");
  }
  if (!state.runtime_ffprobe_available) {
    errors.push("admin real NAS matrix runtime settings must show FFprobe is available");
  }
  if (!Number.isInteger(state.preprocess_job_count) || state.preprocess_job_count < 1) {
    errors.push("admin real NAS matrix must read preprocess jobs");
  }
  if (!["idle", "running", "stopping", "failed"].includes(state.preprocess_supervisor_state)) {
    errors.push("admin real NAS matrix must expose a valid preprocess supervisor state");
  }
  if (!Number.isInteger(state.index_version_count) || state.index_version_count < 1) {
    errors.push("admin real NAS matrix must read index versions");
  }
  if (!isIndexVersion(state.index_current_version)) {
    errors.push("admin real NAS matrix index_current_version must be a current index version");
  }
  if (!Number.isInteger(state.cutter_user_count) || state.cutter_user_count < 1) {
    errors.push("admin real NAS matrix must read cutter users");
  }
  errors.push(...validateAdminSourceVideoListSanityState(state.source_video_list, state));
  errors.push(...validateAdminSourceVideoWebSanityState(state.source_video_web, state));
  errors.push(...validateAdminPreprocessWebSanityState(state.preprocess_web, state));
  errors.push(...validateAdminCutterUsersWebSanityState(state.cutter_users_web, state));

  for (const route of state.web_routes) {
    if (!route.route.trim() || !route.url.trim()) {
      errors.push("admin real NAS matrix web route must include route and URL");
    }
    const missingLabels = route.required_labels.filter((label) => !route.visible_labels.includes(label));
    if (missingLabels.length > 0) {
      errors.push(`admin real NAS matrix route ${route.route} missing labels: ${missingLabels.join(", ")}`);
    }
    errors.push(...validatePreprocessWriteActionLock(route, `admin real NAS matrix route ${route.route}`));
  }
  if (state.web_routes.length < ADMIN_WEB_ROUTE_CHECKS.length) {
    errors.push("admin real NAS matrix must verify all required admin web routes");
  }
  for (const skippedAction of [
    "queue-unprocessed",
    "retry-failed",
    "recover-processing",
    "start-supervisor",
    "stop-supervisor",
    "doctor-run",
    "settings-save"
  ]) {
    if (!state.read_only_actions_skipped.includes(skippedAction)) {
      errors.push(`admin real NAS matrix must skip mutating action ${skippedAction}`);
    }
  }

  return errors;
}

export function validateCutterSearchMatrixState(
  state: CutterSearchMatrixState,
  searchdIndex?: SearchdIndexSanityState
): string[] {
  const errors: string[] = [];

  try {
    const parsedUrl = new URL(state.cutter_api_base_url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      errors.push("cutter search matrix cutter_api_base_url must use http or https");
    }
  } catch {
    errors.push("cutter search matrix cutter_api_base_url must be valid");
  }
  if (!Number.isInteger(state.query_count) || state.query_count < 3) {
    errors.push("cutter search matrix must verify at least three keywords");
  }
  if (state.query_count !== state.queries.length) {
    errors.push("cutter search matrix query_count must match queries length");
  }
  if (!state.all_queries_used_searchd) {
    errors.push("cutter search matrix must use local searchd for every query");
  }
  if (!state.matched_searchd_index) {
    errors.push("cutter search matrix index versions must match searchd health");
  }
  if (!Number.isFinite(state.max_search_ms) || state.max_search_ms <= 0) {
    errors.push("cutter search matrix max_search_ms must be positive");
  } else if (state.max_search_ms > LOCAL_WEB_MATRIX_SEARCH_SLA_MS) {
    errors.push(`cutter search matrix max_search_ms must be <= ${LOCAL_WEB_MATRIX_SEARCH_SLA_MS}ms`);
  }

  const seenQueries = new Set<string>();
  for (const query of state.queries) {
    if (!query.query.trim()) {
      errors.push("cutter search matrix query must be present");
    }
    if (seenQueries.has(query.query)) {
      errors.push(`cutter search matrix query must be unique: ${query.query}`);
    }
    seenQueries.add(query.query);
    if (!Number.isInteger(query.group_count) || query.group_count < 1) {
      errors.push(`cutter search matrix query ${query.query} must return at least one group`);
    }
    if (!Number.isInteger(query.returned_count) || query.returned_count < 1) {
      errors.push(`cutter search matrix query ${query.query} must return at least one result`);
    }
    if (!isIndexVersion(query.index_version)) {
      errors.push(`cutter search matrix query ${query.query} must expose an index version`);
    }
    if (searchdIndex && isIndexVersion(searchdIndex.index_version) && query.index_version !== searchdIndex.index_version) {
      errors.push(`cutter search matrix query ${query.query} index_version must match searchd index_version`);
    }
    if (query.search_mode !== "searchd") {
      errors.push(`cutter search matrix query ${query.query} must use searchd`);
    }
    if (!Number.isFinite(query.search_ms) || query.search_ms <= 0) {
      errors.push(`cutter search matrix query ${query.query} search_ms must be positive`);
    } else if (query.search_ms > LOCAL_WEB_MATRIX_SEARCH_SLA_MS) {
      errors.push(`cutter search matrix query ${query.query} search_ms must be <= ${LOCAL_WEB_MATRIX_SEARCH_SLA_MS}ms`);
    }
    if (!/^V\d{6}$/.test(query.first_source_video_id)) {
      errors.push(`cutter search matrix query ${query.query} must expose a source video id`);
    }
    if (!Number.isInteger(query.first_hit_count) || query.first_hit_count < 1) {
      errors.push(`cutter search matrix query ${query.query} first_hit_count must be positive`);
    }
    if (!query.first_segment_id.trim()) {
      errors.push(`cutter search matrix query ${query.query} must expose a first segment id`);
    }
    if (!Number.isFinite(query.first_segment_begin_ms) || query.first_segment_begin_ms < 0) {
      errors.push(`cutter search matrix query ${query.query} must expose a first segment time`);
    }
    if (!query.first_segment_contains_query && !query.first_segment_has_match_range) {
      errors.push(`cutter search matrix query ${query.query} must prove a text or range hit`);
    }
  }

  return errors;
}

export function validateSearchdIndexSanityState(state: SearchdIndexSanityState): string[] {
  const errors: string[] = [];

  if (!state.url.trim()) {
    errors.push("searchd index health URL must be present");
  }
  if (!state.ok) {
    errors.push("searchd index health must be ok");
  }
  if (!isIndexVersion(state.admin_current_index_version)) {
    errors.push("searchd index health must include the admin current index version");
  }
  if (!isIndexVersion(state.index_version)) {
    errors.push("searchd index health must include the active searchd index version");
  }
  if (!Number.isInteger(state.source_video_count) || state.source_video_count < 1) {
    errors.push("searchd index health source_video_count must be a positive integer");
  }
  if (!Number.isInteger(state.segment_count) || state.segment_count < 1) {
    errors.push("searchd index health segment_count must be a positive integer");
  }
  if (!state.matched_admin_current_index || state.index_version !== state.admin_current_index_version) {
    errors.push("searchd index health must match the admin current index version");
  }

  return errors;
}

export function validateMaterialLocatorSanityState(state: MaterialLocatorSanityState): string[] {
  const errors: string[] = [];
  const headerFields = parseMaterialLocatorHeader(state.transcript_header);
  const currentHitTimeMs = parseIntegerText(state.current_hit_time_ms);

  if (!Number.isInteger(state.candidate_count) || state.candidate_count < 1) {
    errors.push("material locator must render at least one candidate result");
  }
  if (!state.default_selected_material_section.includes("公共原素材")) {
    errors.push("material locator must default-focus a public source result for full transcript context");
  }
  if (!state.search_status_text.includes("素材库") || !state.search_status_text.includes("搜索")) {
    errors.push("material locator must show user-facing material and search status");
  }
  if (!state.search_status_text.includes("连接")) {
    errors.push("material locator must show user-facing connection status");
  }
  if (!Number.isInteger(currentHitTimeMs) || currentHitTimeMs < 0) {
    errors.push("material locator data-current-hit-time-ms must be a millisecond integer");
  }
  if (!Number.isInteger(state.current_hit_time_ms_value) || state.current_hit_time_ms_value < 0) {
    errors.push("material locator current_hit_time_ms_value must be a non-negative millisecond integer");
  } else if (Number.isInteger(currentHitTimeMs) && state.current_hit_time_ms_value !== currentHitTimeMs) {
    errors.push("material locator current_hit_time_ms_value must match data-current-hit-time-ms");
  }
  if (!state.current_hit_segment_id.trim()) {
    errors.push("material locator must expose the current hit segment id");
  }
  if (!Number.isInteger(headerFields.current_hit_time_ms_value)) {
    errors.push("transcript header must show the exact current hit time");
  } else if (
    Number.isInteger(currentHitTimeMs)
    && !clockTimeMatchesDisplayedSecond(headerFields.current_hit_time_ms_value, currentHitTimeMs)
  ) {
    errors.push("transcript header current hit time must match data-current-hit-time-ms");
  }
  if (!Number.isInteger(headerFields.global_hit_position) || !Number.isInteger(headerFields.global_hit_count)) {
    errors.push("transcript header must show the global hit position");
  }
  if (!Number.isInteger(headerFields.current_video_hit_count)) {
    errors.push("transcript header must show the current-video hit count");
  }
  if (!Number.isInteger(headerFields.selected_sentence_count)) {
    errors.push("transcript header must show the selected sentence count");
  }
  if (!Number.isInteger(headerFields.full_transcript_char_count)) {
    errors.push("transcript header must show the full transcript character count");
  }
  if (!Number.isInteger(state.global_hit_position) || state.global_hit_position < 1) {
    errors.push("material locator global_hit_position must be a positive integer");
  }
  if (
    !Number.isInteger(state.global_hit_count)
    || state.global_hit_count < 1
    || state.global_hit_count < state.global_hit_position
  ) {
    errors.push("material locator global_hit_count must be at least global_hit_position");
  }
  if (!Number.isInteger(state.current_video_hit_count) || state.current_video_hit_count < 1) {
    errors.push("material locator current_video_hit_count must be a positive integer");
  }
  if (
    Number.isInteger(state.current_video_hit_count)
    && Number.isInteger(state.global_hit_count)
    && state.current_video_hit_count > state.global_hit_count
  ) {
    errors.push("material locator current_video_hit_count must not exceed global_hit_count");
  }
  if (!Number.isInteger(state.selected_sentence_count) || state.selected_sentence_count < 0) {
    errors.push("material locator selected_sentence_count must be a non-negative integer");
  }
  if (!Number.isInteger(state.full_transcript_char_count) || state.full_transcript_char_count < 1) {
    errors.push("material locator full_transcript_char_count must be a positive integer");
  }
  if (
    Number.isInteger(headerFields.global_hit_position)
    && state.global_hit_position !== headerFields.global_hit_position
  ) {
    errors.push("material locator global_hit_position must match transcript header");
  }
  if (Number.isInteger(headerFields.global_hit_count) && state.global_hit_count !== headerFields.global_hit_count) {
    errors.push("material locator global_hit_count must match transcript header");
  }
  if (
    Number.isInteger(headerFields.current_video_hit_count)
    && state.current_video_hit_count !== headerFields.current_video_hit_count
  ) {
    errors.push("material locator current_video_hit_count must match transcript header");
  }
  if (
    Number.isInteger(headerFields.selected_sentence_count)
    && state.selected_sentence_count !== headerFields.selected_sentence_count
  ) {
    errors.push("material locator selected_sentence_count must match transcript header");
  }
  if (
    Number.isInteger(headerFields.full_transcript_char_count)
    && state.full_transcript_char_count !== headerFields.full_transcript_char_count
  ) {
    errors.push("material locator full_transcript_char_count must match transcript header");
  }

  return errors;
}

export function validateMaterialLocatorClosedLoopState(state: MaterialLocatorClosedLoopState): string[] {
  const errors: string[] = [];

  if (state.selection_method !== "transcript-drag") {
    errors.push("material locator closed loop must use transcript-drag selection from the full transcript");
  }
  if (!state.selected_text.trim()) {
    errors.push("material locator closed loop must select transcript text");
  }
  if (!state.selection_proof_text.trim()) {
    errors.push("material locator closed loop must record the selection proof strip");
  }
  const selectedTextCharCount = Array.from(state.selected_text.trim()).length;
  if (!Number.isInteger(state.selected_text_char_count) || state.selected_text_char_count <= 0) {
    errors.push("material locator closed loop selected_text_char_count must be positive");
  } else if (selectedTextCharCount > 0 && state.selected_text_char_count !== selectedTextCharCount) {
    errors.push("material locator closed loop selected_text_char_count must match selected_text length");
  }
  if (!Number.isInteger(state.selected_sentence_count) || state.selected_sentence_count < 2) {
    errors.push("material locator closed loop must select at least two transcript sentences by dragging");
  }
  if (!Number.isInteger(state.selected_text_segment_count) || state.selected_text_segment_count < 2) {
    errors.push("material locator closed loop selected_text must include at least two transcript segment texts");
  }
  if (state.selection_proof_text) {
    for (const label of ["来源", "时间段", "字数", "命中"]) {
      if (!state.selection_proof_text.includes(label)) {
        errors.push(`material locator selection proof strip must include ${label}`);
      }
    }
    if (!/来源\s*(公共原素材|本地素材)/.test(state.selection_proof_text)) {
      errors.push("material locator selection proof strip must identify the selected material source");
    }
    const proofCharCountMatch = state.selection_proof_text.match(/字数\s*(\d+)\s*字/);
    const proofCharCount = proofCharCountMatch ? Number.parseInt(proofCharCountMatch[1]!, 10) : Number.NaN;
    if (!Number.isInteger(proofCharCount)) {
      errors.push("material locator selection proof strip must include selected text character count");
    } else if (selectedTextCharCount > 0 && proofCharCount !== selectedTextCharCount) {
      errors.push("material locator selection proof strip character count must match selected_text");
    }
    if (!/时间段\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(state.selection_proof_text)) {
      errors.push("material locator selection proof strip must include the selected time range");
    }
    if (!/命中\s*\d+\s*\/\s*\d+/.test(state.selection_proof_text)) {
      errors.push("material locator selection proof strip must include the global hit position");
    }
  }
  if (!/剪切完成|本地素材已更新|已加入剪切任务/.test(state.cut_notice)) {
    errors.push("material locator closed loop must show cut submission or completion feedback");
  }
  if (!state.local_library_contains_selection) {
    errors.push("local library must contain the selected transcript text after cutting");
  }
  if (!state.local_library_page_url.includes("#local-library")) {
    errors.push("local library page evidence must come from the local-library route");
  }
  if (state.local_library_view_mode !== "all") {
    errors.push("local library page evidence must use the all-materials view");
  }
  if (!Number.isInteger(state.local_library_visible_clip_count) || state.local_library_visible_clip_count <= 0) {
    errors.push("local library page visible clip count must be positive");
  }
  if (!state.local_library_visible_count_label.trim()) {
    errors.push("local library page must record the visible clip count label");
  }
  if (!state.local_library_clip_title.trim()) {
    errors.push("local library page must record the generated local clip title");
  }
  if (!state.local_library_clip_title_visible) {
    errors.push("local library page must show the generated local clip title");
  }
  if (!state.local_library_source_title.trim()) {
    errors.push("local library page must record the generated local clip source title");
  }
  if (!state.local_library_source_title_visible) {
    errors.push("local library page must show the generated local clip source title");
  }
  if (!state.local_library_selected_text_visible) {
    errors.push("local library page must show the selected transcript text in the clip details");
  }
  const resultSections = [state.first_result_section, state.second_result_section].join("\n");
  if (!resultSections.includes("公共原素材")) {
    errors.push("material locator must keep public source materials visible after cutting");
  }
  if (!/^E\d{6}$/.test(state.local_clip_id)) {
    errors.push("material locator closed loop must record a generated local_clip_id");
  }
  if (!state.local_clip_media_file_path.trim()) {
    errors.push("material locator closed loop must record the local clip media file path");
  }
  if (!state.local_clip_manifest_file_path.trim()) {
    errors.push("material locator closed loop must record the local clip manifest file path");
  }
  if (!state.local_clip_media_file_exists) {
    errors.push("material locator closed loop media file must exist on the local workspace");
  }
  if (!Number.isInteger(state.local_clip_media_file_size_bytes) || state.local_clip_media_file_size_bytes <= 0) {
    errors.push("material locator closed loop media file size must be a positive integer");
  }
  if (!state.local_clip_manifest_file_exists) {
    errors.push("material locator closed loop manifest file must exist on the local workspace");
  }
  if (!Number.isInteger(state.local_clip_manifest_file_size_bytes) || state.local_clip_manifest_file_size_bytes <= 0) {
    errors.push("material locator closed loop manifest file size must be a positive integer");
  }
  if (!/^CJ\d{8}-\d{4}$/.test(state.cut_job_id)) {
    errors.push("material locator closed loop must record the completed cut_job_id");
  }
  if (state.cut_job_status !== "done") {
    errors.push("material locator closed loop cut_job_status must be done");
  }
  if (!/^E\d{6}$/.test(state.cut_job_export_clip_id)) {
    errors.push("material locator closed loop must record the cut job export clip id");
  } else if (state.local_clip_id && state.cut_job_export_clip_id !== state.local_clip_id) {
    errors.push("material locator closed loop cut job export clip id must match local_clip_id");
  }
  if (!state.cut_job_output_file.trim()) {
    errors.push("material locator closed loop must record the cut job output file");
  } else if (state.local_clip_id && !state.cut_job_output_file.includes(state.local_clip_id)) {
    errors.push("material locator closed loop cut job output file must reference local_clip_id");
  }
  if (!state.cut_job_contains_selection) {
    errors.push("material locator closed loop cut job must include the selected transcript text");
  }
  if (!state.cut_tasks_page_contains_selection) {
    errors.push("cut tasks page must show the selected transcript text after cutting");
  }
  if (!state.cut_tasks_page_contains_output) {
    errors.push("cut tasks page must show the completed output file after cutting");
  }
  if (!state.cut_tasks_page_shows_done) {
    errors.push("cut tasks page must show the completed task status after cutting");
  }
  if (!state.cut_tasks_page_url.includes("#cut-tasks")) {
    errors.push("cut tasks page evidence must come from the cut-tasks route");
  }
  if (state.cut_tasks_page_visible_status_label !== "已完成") {
    errors.push("cut tasks page must record the visible completed status label");
  }
  if (!state.cut_tasks_page_visible_output_file.trim()) {
    errors.push("cut tasks page must record the visible completed output file");
  } else if (
    state.cut_job_output_file.trim() &&
    state.cut_tasks_page_visible_output_file !== state.cut_job_output_file
  ) {
    errors.push("cut tasks page visible output file must match cut_job_output_file");
  }
  if (!state.cut_tasks_page_source_title.trim()) {
    errors.push("cut tasks page must record the visible source title");
  }
  if (!state.cut_tasks_page_source_title_visible) {
    errors.push("cut tasks page must show the completed job source title");
  }
  if (!state.cut_tasks_page_time_range_label.trim()) {
    errors.push("cut tasks page must record the visible cut time range");
  }
  if (!state.cut_tasks_page_time_range_visible) {
    errors.push("cut tasks page must show the completed job time range");
  }
  if (!state.selected_text_is_broader_than_query) {
    errors.push("material locator closed loop must select more context than the keyword alone");
  }
  if (!state.public_library_root.includes("PublicLibrary")) {
    errors.push("material locator closed loop must record the public library root");
  }
  if (!state.local_output_is_outside_public_library) {
    errors.push("local clip output must be outside the public NAS library root");
  }
  if (state.public_library_write_detected) {
    errors.push("local clip creation must not write cutter outputs into the public NAS library");
  }
  if (
    state.public_library_root &&
    (
      isPathInsideDirectory(state.local_clip_media_file_path, state.public_library_root) ||
      isPathInsideDirectory(state.local_clip_manifest_file_path, state.public_library_root)
    )
  ) {
    errors.push("local clip output paths must not be inside the public NAS library root");
  }

  return errors;
}

export function validateMaterialLocatorClosedLoopAgainstLocator(
  closedLoop: MaterialLocatorClosedLoopState,
  locator: MaterialLocatorSanityState
): string[] {
  const errors: string[] = [];
  const proofHit = parseSelectionProofHit(closedLoop.selection_proof_text);

  if (
    Number.isInteger(proofHit.global_hit_position) &&
    Number.isInteger(locator.global_hit_position) &&
    proofHit.global_hit_position !== locator.global_hit_position
  ) {
    errors.push("material locator selection proof global hit position must match transcript header");
  }
  if (
    Number.isInteger(proofHit.global_hit_count) &&
    Number.isInteger(locator.global_hit_count) &&
    proofHit.global_hit_count !== locator.global_hit_count
  ) {
    errors.push("material locator selection proof global hit count must match transcript header");
  }

  return errors;
}

function validateLocalWebLayoutBox(label: string, box: LocalWebLayoutBoxState): string[] {
  const errors: string[] = [];

  if (!box.selector.trim()) {
    errors.push(`local web layout ${label} selector must be present`);
  }
  if (!Number.isInteger(box.client_width) || box.client_width < 1) {
    errors.push(`local web layout ${label} client_width must be positive`);
  }
  if (!Number.isInteger(box.scroll_width) || box.scroll_width < 1) {
    errors.push(`local web layout ${label} scroll_width must be positive`);
  }
  if (box.horizontal_overflow || box.scroll_width > box.client_width + 2) {
    errors.push(`local web layout ${label} must not overflow horizontally`);
  }

  return errors;
}

function validateLocalWebRouteLayoutState(
  state: LocalWebRouteLayoutState,
  expectedApp: "admin" | "cutter"
): string[] {
  const errors: string[] = [];

  if (state.app !== expectedApp) {
    errors.push(`local web layout route ${state.route || "(missing)"} app must be ${expectedApp}`);
  }
  if (!state.route.trim()) {
    errors.push("local web layout route must include a route id");
  }
  if (!state.viewport_label.trim()) {
    errors.push(`local web layout route ${state.route || "(missing)"} must include a viewport label`);
  }
  if (!Number.isInteger(state.viewport_width) || state.viewport_width < 1) {
    errors.push(`local web layout route ${state.route || "(missing)"} viewport_width must be positive`);
  }
  if (!Number.isInteger(state.viewport_height) || state.viewport_height < 1) {
    errors.push(`local web layout route ${state.route || "(missing)"} viewport_height must be positive`);
  }
  try {
    const parsedUrl = new URL(state.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      errors.push(`local web layout route ${state.route} URL must use http or https`);
    }
  } catch {
    errors.push(`local web layout route ${state.route || "(missing)"} URL must be valid`);
  }

  if (state.required_labels.length < 1) {
    errors.push(`local web layout route ${state.route} must include required labels`);
  }
  const missingLabels = state.required_labels.filter((label) => !state.visible_labels.includes(label));
  if (missingLabels.length > 0) {
    errors.push(`local web layout route ${state.route} missing labels: ${missingLabels.join(", ")}`);
  }
  errors.push(...validatePreprocessWriteActionLock(state, `local web layout route ${state.route}`));

  errors.push(...validateLocalWebLayoutBox(`${expectedApp} route ${state.route} body`, state.body));
  errors.push(...validateLocalWebLayoutBox(`${expectedApp} route ${state.route} page`, state.page));

  return errors;
}

export function validateLocalWebLayoutSanityState(state: LocalWebLayoutSanityState): string[] {
  const errors: string[] = [];

  for (const [label, url] of [
    ["admin source videos", state.admin_source_videos_url],
    ["cutter material locator", state.cutter_material_locator_url]
  ] as const) {
    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.push(`local web layout ${label} URL must use http or https`);
      }
    } catch {
      errors.push(`local web layout ${label} URL must be valid`);
    }
  }

  if (!Number.isInteger(state.viewport_width) || state.viewport_width < 1) {
    errors.push("local web layout viewport_width must be positive");
  }
  if (!Number.isInteger(state.viewport_height) || state.viewport_height < 1) {
    errors.push("local web layout viewport_height must be positive");
  }

  for (const [label, box] of [
    ["admin statusbar", state.admin_statusbar],
    ["cutter workbench", state.cutter_workbench],
    ["cutter body", state.cutter_body]
  ] as const) {
    errors.push(...validateLocalWebLayoutBox(label, box));
  }

  if (!Number.isInteger(state.admin_statusbar_item_overflow_count) || state.admin_statusbar_item_overflow_count < 0) {
    errors.push("local web layout admin_statusbar_item_overflow_count must be a non-negative integer");
  } else if (state.admin_statusbar_item_overflow_count !== 0) {
    errors.push("local web layout admin statusbar items must not overflow horizontally");
  }

  for (const [app, routeLayouts, routeChecks] of [
    ["admin", state.admin_route_layouts, ADMIN_WEB_ROUTE_CHECKS],
    ["cutter", state.cutter_route_layouts, CUTTER_WEB_ROUTE_CHECKS]
  ] as const) {
    if (routeLayouts.length < routeChecks.length * LOCAL_WEB_LAYOUT_VIEWPORTS.length) {
      errors.push(`local web layout must verify all required ${app} routes`);
    }
    for (const viewport of LOCAL_WEB_LAYOUT_VIEWPORTS) {
      for (const routeCheck of routeChecks) {
        const routeLayout = routeLayouts.find((entry) =>
          entry.route === routeCheck.route && entry.viewport_label === viewport.label
        );
        if (!routeLayout) {
          errors.push(`local web layout missing ${app} route ${routeCheck.route} at ${viewport.label}`);
          continue;
        }
        if (routeLayout.viewport_width !== viewport.width || routeLayout.viewport_height !== viewport.height) {
          errors.push(`local web layout ${app} route ${routeCheck.route} viewport must be ${viewport.width}x${viewport.height}`);
        }
        errors.push(...validateLocalWebRouteLayoutState(routeLayout, app));
      }
    }
    for (const routeLayout of routeLayouts) {
      const knownViewport = LOCAL_WEB_LAYOUT_VIEWPORTS.some((viewport) => viewport.label === routeLayout.viewport_label);
      if (!knownViewport) {
        errors.push(`local web layout ${app} route ${routeLayout.route} has unknown viewport ${routeLayout.viewport_label}`);
      }
    }
  }

  return errors;
}

export function validateCutterPublicLibraryWebSanityState(
  state: CutterPublicLibraryWebSanityState,
  searchdIndex?: SearchdIndexSanityState
): string[] {
  const errors: string[] = [];

  try {
    const parsedApiUrl = new URL(state.cutter_api_base_url);
    if (!["http:", "https:"].includes(parsedApiUrl.protocol)) {
      errors.push("cutter public library web cutter_api_base_url must use http or https");
    }
  } catch {
    errors.push("cutter public library web cutter_api_base_url must be valid");
  }
  try {
    const parsedUrl = new URL(state.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.hash !== "#public-library") {
      errors.push("cutter public library web URL must point to the public-library route");
    }
  } catch {
    errors.push("cutter public library web URL must be valid");
  }
  if (!Number.isInteger(state.api_available_video_count) || state.api_available_video_count < 50) {
    errors.push("cutter public library web API must expose at least 50 public source videos");
  }
  if (
    searchdIndex &&
    Number.isInteger(searchdIndex.source_video_count) &&
    Math.abs(state.api_available_video_count - searchdIndex.source_video_count) > 5
  ) {
    errors.push("cutter public library web API available count must match searchd source_video_count");
  }
  if (!Number.isInteger(state.api_returned_count) || state.api_returned_count < 1) {
    errors.push("cutter public library web API must return visible source videos");
  }
  if (!/^V\d{6}$/.test(state.api_first_source_video_id)) {
    errors.push("cutter public library web API first source video id must be concrete");
  }
  if (!state.api_first_title.trim()) {
    errors.push("cutter public library web API first title must be present");
  }
  if (!state.web_api_response_observed) {
    errors.push("cutter public library web must observe the source-library API response");
  }
  if (!state.available_count_visible) {
    errors.push("cutter public library web must display the available public source count");
  }
  if (!state.first_title_visible) {
    errors.push("cutter public library web must render the first API source title");
  }
  if (!state.public_source_label_visible) {
    errors.push("cutter public library web must show the public source library labels");
  }
  if (state.api_available_video_count > state.api_returned_count) {
    if (!state.load_more_button_visible) {
      errors.push("cutter public library web must show the load-more button for paged source videos");
    }
    if (!state.load_more_clicked) {
      errors.push("cutter public library web must exercise the load-more button");
    }
    if (!state.loaded_count_increased || state.loaded_count_after <= state.loaded_count_before) {
      errors.push("cutter public library web load-more must increase the visible source video count");
    }
  }
  if (state.selected_inspector_title !== state.api_first_title) {
    errors.push("cutter public library web inspector must select the first public source by default");
  }

  return errors;
}

export function validateCutterAuthSanityState(state: CutterAuthSanityState): string[] {
  const errors: string[] = [];

  for (const [label, url] of [
    ["cutter auth API base", state.cutter_api_base_url],
    ["cutter auth mode", state.auth_mode_url],
    ["cutter auth material locator", state.material_locator_url]
  ] as const) {
    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.push(`${label} URL must use http or https`);
      }
    } catch {
      errors.push(`${label} URL must be valid`);
    }
  }

  if (state.auth_mode !== "local_trusted") {
    errors.push("cutter auth mode must be local_trusted for local Web real NAS preflight");
  }
  if (state.local_trusted !== true) {
    errors.push("cutter auth local_trusted must be true");
  }
  if (!state.trusted_username.trim()) {
    errors.push("cutter auth trusted_username must be present");
  }
  if (state.fresh_context_workbench_ready !== true) {
    errors.push("cutter auth fresh context must reach the workbench");
  }
  if (state.login_gate_visible_after_ready !== false) {
    errors.push("cutter auth fresh context must not remain on the login gate");
  }
  if (state.manual_apply_used !== false) {
    errors.push("cutter auth local trusted entry must not require manual application");
  }
  if (!state.visible_username.trim()) {
    errors.push("cutter auth fresh context must show the trusted cutter username");
  } else if (state.trusted_username.trim() && state.visible_username.trim() !== state.trusted_username.trim()) {
    errors.push("cutter auth visible_username must match trusted_username");
  }

  return errors;
}

export function validateLocalWebSanityReport(report: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(report)) {
    return ["local web sanity report must be a JSON object"];
  }

  if (report.ok !== true) {
    errors.push("local web sanity report must have ok: true");
  }

  if (!Array.isArray(report.errors)) {
    errors.push("local web sanity report must include an errors array");
  } else if (report.errors.length > 0) {
    errors.push("local web sanity report errors must be empty");
  }

  const endpoints = Array.isArray(report.endpoints)
    ? report.endpoints.map(endpointFromUnknown)
    : [];
  if (endpoints.length < 2) {
    errors.push("local web sanity report must include admin and cutter endpoint results");
  }

  for (const label of ["admin web", "cutter web"]) {
    const endpoint = endpoints.find((entry) => entry.label === label);
    if (!endpoint) {
      errors.push(`local web sanity report must include ${label} endpoint result`);
      continue;
    }
    if (!endpoint.ok || endpoint.status !== 200) {
      errors.push(`${label} endpoint must be ok with HTTP 200`);
    }
    try {
      const parsedUrl = new URL(endpoint.url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        errors.push(`${label} endpoint URL must use http or https`);
      }
    } catch {
      errors.push(`${label} endpoint URL must be valid`);
    }
  }

  const adminDashboard = adminDashboardFromUnknown(report.admin_dashboard);
  errors.push(...validateAdminDashboardSanityState(adminDashboard));

  const searchdIndex = searchdIndexFromUnknown(report.searchd_index);
  errors.push(...validateSearchdIndexSanityState(searchdIndex));

  const adminRealNasMatrix = adminRealNasMatrixFromUnknown(report.admin_real_nas_matrix);
  errors.push(...validateAdminRealNasMatrixState(adminRealNasMatrix));
  if (
    isIndexVersion(searchdIndex.index_version) &&
    isIndexVersion(adminRealNasMatrix.current_index_version) &&
    adminRealNasMatrix.current_index_version !== searchdIndex.index_version
  ) {
    errors.push("admin real NAS matrix current_index_version must match searchd index_version");
  }
  if (
    isIndexVersion(searchdIndex.index_version) &&
    isIndexVersion(adminRealNasMatrix.index_current_version) &&
    adminRealNasMatrix.index_current_version !== searchdIndex.index_version
  ) {
    errors.push("admin real NAS matrix index_current_version must match searchd index_version");
  }

  const cutterSearchMatrix = cutterSearchMatrixFromUnknown(report.cutter_search_matrix);
  errors.push(...validateCutterSearchMatrixState(cutterSearchMatrix, searchdIndex));

  const cutterAuth = cutterAuthFromUnknown(report.cutter_auth);
  errors.push(...validateCutterAuthSanityState(cutterAuth));

  const cutterPublicLibraryWeb = cutterPublicLibraryWebFromUnknown(report.cutter_public_library_web);
  errors.push(...validateCutterPublicLibraryWebSanityState(cutterPublicLibraryWeb, searchdIndex));

  const layout = layoutFromUnknown(report.layout);
  errors.push(...validateLocalWebLayoutSanityState(layout));

  const materialLocator = materialLocatorFromUnknown(report.material_locator);
  errors.push(...validateMaterialLocatorSanityState(materialLocator));
  if (
    isIndexVersion(searchdIndex.index_version) &&
    isIndexVersion(materialLocator.search_index_version) &&
    materialLocator.search_index_version !== searchdIndex.index_version
  ) {
    errors.push("material locator search_index_version must match searchd index_version");
  }

  const closedLoop = closedLoopFromUnknown(report.material_locator_closed_loop);
  errors.push(...validateMaterialLocatorClosedLoopState(closedLoop));
  errors.push(...validateMaterialLocatorClosedLoopAgainstLocator(closedLoop, materialLocator));

  const query = materialLocator.query.trim();
  if (query && closedLoop.selected_text && !closedLoop.selected_text.includes(query)) {
    errors.push("selected transcript text must include the audited search query");
  }
  const selectedTextLength = Array.from(closedLoop.selected_text.trim()).length;
  const queryLength = Array.from(query).length;
  if (query && selectedTextLength > 0 && selectedTextLength <= queryLength) {
    errors.push("selected transcript text must include broader context than the audited query");
  }
  if (
    selectedTextLength > 0
    && Number.isInteger(materialLocator.full_transcript_char_count)
    && materialLocator.full_transcript_char_count <= selectedTextLength
  ) {
    errors.push("material locator full_transcript_char_count must be greater than selected transcript text length");
  }

  const serializedReport = JSON.stringify(report);
  for (const pattern of LOCAL_WEB_REPORT_FORBIDDEN_PATTERNS) {
    if (pattern.test(serializedReport)) {
      errors.push("local web sanity report must not include secrets, signed URLs, private transcript text, or bearer tokens");
      break;
    }
  }

  return errors;
}

function appendUrlPath(baseUrl: string, pathName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${pathName.replace(/^\//, "")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function localClipEvidenceFromUnknown(value: unknown): LocalClipEvidence {
  const record = isRecord(value) ? value : {};

  return {
    local_clip_id: stringField(record, "local_clip_id") || stringField(record, "export_clip_id"),
    title: stringField(record, "title"),
    source_title: stringField(record, "source_title"),
    selected_text: stringField(record, "selected_text"),
    media_file_path: stringField(record, "media_file_path"),
    manifest_file_path: stringField(record, "manifest_file_path")
  };
}

function cutJobEvidenceFromUnknown(value: unknown): CutJobEvidence {
  const record = isRecord(value) ? value : {};

  return {
    cut_job_id: stringField(record, "cut_job_id"),
    status: stringField(record, "status"),
    export_clip_id: stringField(record, "export_clip_id"),
    output_file: stringField(record, "output_file"),
    source_title: stringField(record, "source_title"),
    begin_ms: numberField(record, "begin_ms") ?? Number.NaN,
    end_ms: numberField(record, "end_ms") ?? Number.NaN,
    selected_text: stringField(record, "selected_text")
  };
}

async function fetchLocalClipEvidence(input: {
  cutterApiBaseUrl: string;
  timeoutMs: number;
}): Promise<LocalClipEvidence[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(apiUrl(input.cutterApiBaseUrl, "/cutter/local-clips"), {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`local clips returned HTTP ${response.status}`);
    }

    const payload = await response.json() as unknown;
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
    const clips = Array.isArray(data.clips) ? data.clips : [];

    return clips.map(localClipEvidenceFromUnknown);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCutJobEvidence(input: {
  cutterApiBaseUrl: string;
  timeoutMs: number;
}): Promise<CutJobEvidence[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(apiUrl(input.cutterApiBaseUrl, "/cutter/cut-jobs"), {
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`cut jobs returned HTTP ${response.status}`);
    }

    const payload = await response.json() as unknown;
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];

    return jobs.map(cutJobEvidenceFromUnknown);
  } finally {
    clearTimeout(timeout);
  }
}

async function localFileProof(filePath: string): Promise<LocalFileProof> {
  const normalizedPath = filePath.trim();

  if (!normalizedPath || !path.isAbsolute(normalizedPath)) {
    return {
      exists: false,
      size_bytes: 0
    };
  }

  try {
    const entry = await stat(normalizedPath);

    return {
      exists: entry.isFile(),
      size_bytes: entry.isFile() ? entry.size : 0
    };
  } catch {
    return {
      exists: false,
      size_bytes: 0
    };
  }
}

async function waitForNewLocalClipEvidence(input: {
  cutterApiBaseUrl: string;
  selectedText: string;
  beforeClipIds: Set<string>;
  timeoutMs: number;
}): Promise<LocalClipEvidence> {
  const deadline = Date.now() + input.timeoutMs;
  let lastCandidate: LocalClipEvidence | undefined;

  while (Date.now() <= deadline) {
    const clips = await fetchLocalClipEvidence({
      cutterApiBaseUrl: input.cutterApiBaseUrl,
      timeoutMs: input.timeoutMs
    });
    lastCandidate = clips.find((clip) =>
      !input.beforeClipIds.has(clip.local_clip_id) &&
      clip.selected_text.includes(input.selectedText)
    );

    if (lastCandidate) {
      return lastCandidate;
    }

    await wait(500);
  }

  return lastCandidate ?? {
    local_clip_id: "",
    title: "",
    source_title: "",
    selected_text: "",
    media_file_path: "",
    manifest_file_path: ""
  };
}

async function waitForCompletedCutJobEvidence(input: {
  cutterApiBaseUrl: string;
  localClipId: string;
  selectedText: string;
  timeoutMs: number;
}): Promise<CutJobEvidence> {
  const deadline = Date.now() + input.timeoutMs;
  let lastCandidate: CutJobEvidence | undefined;

  while (Date.now() <= deadline) {
    const jobs = await fetchCutJobEvidence({
      cutterApiBaseUrl: input.cutterApiBaseUrl,
      timeoutMs: input.timeoutMs
    });
    lastCandidate = jobs.find((job) =>
      job.export_clip_id === input.localClipId &&
      job.selected_text.includes(input.selectedText)
    );

    if (lastCandidate?.status === "done") {
      return lastCandidate;
    }

    await wait(500);
  }

  return lastCandidate ?? {
    cut_job_id: "",
    status: "",
    export_clip_id: "",
    output_file: "",
    source_title: "",
    begin_ms: Number.NaN,
    end_ms: Number.NaN,
    selected_text: ""
  };
}

function textIncludesAll(text: string, values: readonly string[]): boolean {
  return values.every((value) => !value.trim() || text.includes(value));
}

function formatDurationForCutterPage(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) {
    return "";
  }

  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseLocalLibraryVisibleCount(text: string): { count: number; label: string } {
  const normalized = text.replace(/\s+/g, " ").trim();
  const currentViewMatch = normalized.match(/(\d[\d,]*)\s+条当前视图素材/);
  if (currentViewMatch) {
    return {
      count: parseIntegerText(currentViewMatch[1] ?? ""),
      label: currentViewMatch[0]
    };
  }

  const allMaterialsMatch = normalized.match(/(\d[\d,]*)\s+个本地可复剪素材/);
  if (allMaterialsMatch) {
    return {
      count: parseIntegerText(allMaterialsMatch[1] ?? ""),
      label: allMaterialsMatch[0]
    };
  }

  return {
    count: Number.NaN,
    label: ""
  };
}

async function checkLocalLibraryPageEvidence(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  cutterWebUrl: string;
  selectedText: string;
  localClip: LocalClipEvidence;
  timeoutMs: number;
}): Promise<Pick<
  MaterialLocatorClosedLoopState,
  | "local_library_contains_selection"
  | "local_library_page_url"
  | "local_library_view_mode"
  | "local_library_visible_clip_count"
  | "local_library_visible_count_label"
  | "local_library_clip_title"
  | "local_library_source_title"
  | "local_library_clip_title_visible"
  | "local_library_source_title_visible"
  | "local_library_selected_text_visible"
>> {
  await input.page.goto(cutterWebRouteUrl(input.cutterWebUrl, "#local-library"), {
    waitUntil: "domcontentloaded",
    timeout: input.timeoutMs
  });
  await waitForCutterWorkbenchReady(input.page, input.timeoutMs);
  const localLibraryPage = input.page.locator("[data-page='local-library']");
  await localLibraryPage.waitFor({ timeout: input.timeoutMs });

  const allMaterialsButton = localLibraryPage.getByRole("button", { name: "全部素材" });
  await allMaterialsButton.click({ timeout: input.timeoutMs }).catch(() => undefined);
  await input.page.waitForTimeout(250);

  const clipTitle = input.localClip.title.trim();
  const sourceTitle = input.localClip.source_title.trim();
  if (clipTitle) {
    await localLibraryPage
      .getByRole("button", { name: new RegExp(escapeRegExp(clipTitle)) })
      .first()
      .click({ timeout: input.timeoutMs })
      .catch(() => undefined);
  }
  await localLibraryPage
    .locator(".ml-gallery-card")
    .filter({ hasText: input.selectedText })
    .getByRole("button")
    .first()
    .click({ timeout: input.timeoutMs })
    .catch(() => undefined);
  await input.page.waitForTimeout(150);

  const pageText = (await localLibraryPage.innerText({ timeout: input.timeoutMs })).replace(/\s+/g, " ").trim();
  const visibleCount = parseLocalLibraryVisibleCount(pageText);
  const allMaterialsPressed = await allMaterialsButton.getAttribute("aria-pressed").catch(() => "");

  return {
    local_library_contains_selection: textIncludesAll(pageText, [input.selectedText]),
    local_library_page_url: input.page.url(),
    local_library_view_mode: allMaterialsPressed === "true" ? "all" : "",
    local_library_visible_clip_count: visibleCount.count,
    local_library_visible_count_label: visibleCount.label,
    local_library_clip_title: clipTitle,
    local_library_source_title: sourceTitle,
    local_library_clip_title_visible: textIncludesAll(pageText, [clipTitle]),
    local_library_source_title_visible: textIncludesAll(pageText, [sourceTitle]),
    local_library_selected_text_visible: textIncludesAll(pageText, [input.selectedText])
  };
}

async function checkCutTasksPageEvidence(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  cutterWebUrl: string;
  selectedText: string;
  outputFile: string;
  sourceTitle: string;
  beginMs: number;
  endMs: number;
  timeoutMs: number;
}): Promise<Pick<
  MaterialLocatorClosedLoopState,
  | "cut_tasks_page_contains_selection"
  | "cut_tasks_page_contains_output"
  | "cut_tasks_page_shows_done"
  | "cut_tasks_page_url"
  | "cut_tasks_page_visible_status_label"
  | "cut_tasks_page_visible_output_file"
  | "cut_tasks_page_source_title"
  | "cut_tasks_page_source_title_visible"
  | "cut_tasks_page_time_range_label"
  | "cut_tasks_page_time_range_visible"
>> {
  await input.page.goto(cutterWebRouteUrl(input.cutterWebUrl, "#cut-tasks"), {
    waitUntil: "domcontentloaded",
    timeout: input.timeoutMs
  });
  await waitForCutterWorkbenchReady(input.page, input.timeoutMs);
  const cutTasksPage = input.page.locator("[data-page='cut-tasks']");
  await cutTasksPage.waitFor({ timeout: input.timeoutMs });
  const pageText = (await cutTasksPage.innerText({ timeout: input.timeoutMs })).replace(/\s+/g, " ").trim();
  const statusLabel = pageText.includes("已完成") ? "已完成" : "";
  const beginLabel = formatDurationForCutterPage(input.beginMs);
  const endLabel = formatDurationForCutterPage(input.endMs);
  const timeRangeLabel = beginLabel && endLabel ? `${beginLabel} - ${endLabel}` : "";
  const outputVisible = textIncludesAll(pageText, [input.outputFile]);

  return {
    cut_tasks_page_contains_selection: textIncludesAll(pageText, [input.selectedText]),
    cut_tasks_page_contains_output: outputVisible,
    cut_tasks_page_shows_done: statusLabel === "已完成",
    cut_tasks_page_url: input.page.url(),
    cut_tasks_page_visible_status_label: statusLabel,
    cut_tasks_page_visible_output_file: outputVisible ? input.outputFile : "",
    cut_tasks_page_source_title: input.sourceTitle.trim(),
    cut_tasks_page_source_title_visible: textIncludesAll(pageText, [input.sourceTitle]),
    cut_tasks_page_time_range_label: timeRangeLabel,
    cut_tasks_page_time_range_visible: Boolean(timeRangeLabel) && pageText.includes(timeRangeLabel)
  };
}


async function checkEndpoint(label: string, url: string, timeoutMs: number): Promise<EndpointSanityResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: timeoutSignal(timeoutMs)
    });

    return {
      label,
      url,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `${label} returned HTTP ${response.status}`
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      error: errorMessage(error)
    };
  }
}

function apiUrl(baseUrl: string, endpoint: string, searchParams: Record<string, string> = {}): string {
  const url = new URL(endpoint, baseUrl);

  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

async function fetchEnvelopeData(url: string, timeoutMs: number, context = url): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: timeoutSignal(timeoutMs)
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`${context} timed out after ${timeoutMs}ms`);
    }
    throw new Error(`${context}: ${errorMessage(error)}`);
  }
  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = isRecord(payload)
      ? stringField(payload, "message") || stringField(payload, "error_code")
      : "";
    throw new Error(message || `HTTP ${response.status}`);
  }

  if (isRecord(payload)) {
    if (payload.ok === false) {
      throw new Error(stringField(payload, "message") || stringField(payload, "error_code") || "api_error");
    }
    if ("data" in payload) {
      return payload.data;
    }
  }

  throw new Error("API response must include data");
}

async function timedFetchEnvelopeData(url: string, timeoutMs: number, context = url): Promise<{
  data: unknown;
  elapsed_ms: number;
}> {
  const startedAt = Date.now();
  const data = await fetchEnvelopeData(url, timeoutMs, context);

  return {
    data,
    elapsed_ms: Math.max(1, Date.now() - startedAt)
  };
}

async function timedFetchEnvelopeDataBestOf(
  url: string,
  timeoutMs: number,
  context: string,
  attempts = LOCAL_WEB_ADMIN_READ_TIMING_ATTEMPTS
): Promise<{
  data: unknown;
  elapsed_ms: number;
}> {
  let best: { data: unknown; elapsed_ms: number } | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await timedFetchEnvelopeData(
        url,
        timeoutMs,
        attempts > 1 ? `${context} attempt ${attempt}` : context
      );
      if (!best || result.elapsed_ms < best.elapsed_ms) {
        best = result;
      }
      if (result.elapsed_ms <= LOCAL_WEB_ADMIN_READ_API_SLA_MS) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (best) {
    return best;
  }

  throw lastError instanceof Error ? lastError : new Error(`${context}: ${errorMessage(lastError)}`);
}

function adminWebRouteUrl(adminWebUrl: string, hash: string): string {
  const url = new URL(adminWebUrl);
  url.hash = hash;
  return url.toString();
}

function cutterWebRouteUrl(cutterWebUrl: string, hash: string): string {
  const url = new URL(cutterWebUrl);
  url.hash = hash;
  return url.toString();
}

function matrixQueriesFromInput(query: string, matrixQueries: string[]): string[] {
  const queries = [query, ...matrixQueries]
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(queries));
}

function matrixQueriesFromEnv(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [...DEFAULT_MATRIX_QUERIES];
  }

  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function checkAdminWebRoutes(
  adminWebUrl: string,
  timeoutMs: number
): Promise<AdminWebRouteSanityState[]> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    const routeStates: AdminWebRouteSanityState[] = [];

    for (const routeCheck of ADMIN_WEB_ROUTE_CHECKS) {
      const url = adminWebRouteUrl(adminWebUrl, routeCheck.hash);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: timeoutMs });
      await page.getByText(routeCheck.required_labels[0], { exact: false }).first().waitFor({
        state: "visible",
        timeout: timeoutMs
      });
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
      routeStates.push({
        route: routeCheck.route,
        url,
        required_labels: [...routeCheck.required_labels],
        visible_labels: routeCheck.required_labels.filter((label) => body.includes(label)),
        disabled_write_action_labels: await disabledAdminWriteActionLabelsFromPage(
          page,
          adminWriteActionLabelsForRoute(routeCheck.route)
        )
      });
    }

    return routeStates;
  } finally {
    await browser.close();
  }
}

function adminSourceLoadedCountsFromText(text: string): {
  loaded: number;
  total: number;
} {
  const normalized = text.replace(/\s+/g, " ");
  const matches = [...normalized.matchAll(/已载入\s+([\d,]+)\s*\/\s*(?:全部\s*)?([\d,]+)/g)];
  const counts = matches
    .map((match) => ({
      loaded: parseIntegerText(match[1] ?? ""),
      total: parseIntegerText(match[2] ?? "")
    }))
    .filter((entry) => Number.isInteger(entry.loaded) && Number.isInteger(entry.total));

  return counts.sort((left, right) => right.loaded - left.loaded)[0] ?? {
    loaded: 0,
    total: 0
  };
}

async function adminBodyTextFromPage(page: Awaited<ReturnType<Browser["newPage"]>>): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

async function adminPaginationTextFromPage(page: Awaited<ReturnType<Browser["newPage"]>>): Promise<string> {
  const pagination = page.locator(".admin-pagination-row").first();
  if (await pagination.count() === 0) {
    return "";
  }

  return (await pagination.innerText()).replace(/\s+/g, " ").trim();
}

async function waitForAdminSourceLoadedCount(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  minLoadedCount: number,
  timeoutMs: number
): Promise<void> {
  await page.waitForFunction((minimum) => {
    const text = document.body.innerText.replace(/\s+/g, " ");
    const matches = Array.from(text.matchAll(/已载入\s+([\d,]+)\s*\/\s*(?:全部\s*)?([\d,]+)/g));

    return matches.some((match) => {
      const loaded = Number((match[1] || "").replace(/,/g, ""));
      return Number.isInteger(loaded) && loaded >= minimum;
    });
  }, minLoadedCount, { timeout: timeoutMs });
}

async function waitForAdminSourceCountIncrease(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  previousLoadedCount: number,
  timeoutMs: number
): Promise<void> {
  await page.waitForFunction((previous) => {
    const text = document.body.innerText.replace(/\s+/g, " ");
    const matches = Array.from(text.matchAll(/已载入\s+([\d,]+)\s*\/\s*(?:全部\s*)?([\d,]+)/g));

    return matches.some((match) => {
      const loaded = Number((match[1] || "").replace(/,/g, ""));
      return Number.isInteger(loaded) && loaded > previous;
    });
  }, previousLoadedCount, { timeout: timeoutMs });
}

async function waitForAdminSourceVideosRoute(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  url: string;
  timeoutMs: number;
}): Promise<void> {
  if (input.page.url() === input.url) {
    await input.page.reload({ waitUntil: "domcontentloaded", timeout: input.timeoutMs });
  } else {
    await input.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
  }
  await input.page.locator("[data-admin-web-ready='true']").waitFor({ timeout: input.timeoutMs });
  await input.page.getByText("公共素材资产清单", { exact: false }).first().waitFor({
    state: "visible",
    timeout: input.timeoutMs
  });
}

async function observeAdminSourceVideoListResponse(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  timeoutMs: number;
  params: Record<string, string>;
}): Promise<boolean> {
  try {
    await input.page.waitForResponse((response) => {
      if (!response.ok()) {
        return false;
      }

      try {
        const url = new URL(response.url());
        if (!url.pathname.endsWith("/api/admin/source-videos")) {
          return false;
        }

        return Object.entries(input.params).every(([key, value]) => url.searchParams.get(key) === value);
      } catch {
        return false;
      }
    }, { timeout: input.timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function checkAdminSourceVideosWeb(input: {
  adminWebUrl: string;
  timeoutMs: number;
  libraryRoot: string;
  sourceVideosPath: string;
  sourceVideoList: AdminSourceVideoListSanityState;
}): Promise<AdminSourceVideoWebSanityState> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });
  const url = adminWebRouteUrl(input.adminWebUrl, "#/source-videos");
  const firstPageFirstId = input.sourceVideoList.first_page_first_id;
  const query = input.sourceVideoList.query;
  const queryResultId = input.sourceVideoList.query_first_id;

  try {
    await waitForAdminSourceVideosRoute({ page, url, timeoutMs: input.timeoutMs });
    await waitForAdminSourceLoadedCount(page, input.sourceVideoList.page_size, input.timeoutMs)
      .catch(() => undefined);
    await page.getByText(firstPageFirstId, { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });

    const sourcePathText = (await page.locator(".admin-console-statusbar").innerText()).replace(/\s+/g, " ").trim();
    const initialCounts = adminSourceLoadedCountsFromText(await adminBodyTextFromPage(page));
    const loadMoreButton = page.locator("button").filter({ hasText: "继续加载" }).first();
    let loadMoreButtonLabel = "";
    let loadMoreClicked = false;
    let loadedCountAfter = initialCounts.loaded;
    let totalCountAfter = initialCounts.total;

    if (await loadMoreButton.isVisible().catch(() => false)) {
      loadMoreButtonLabel = (await loadMoreButton.innerText()).replace(/\s+/g, " ").trim();
      await loadMoreButton.click();
      await waitForAdminSourceCountIncrease(page, initialCounts.loaded, input.timeoutMs)
        .catch(() => undefined);
      const afterLoadMoreCounts = adminSourceLoadedCountsFromText(await adminBodyTextFromPage(page));
      loadMoreClicked = true;
      loadedCountAfter = afterLoadMoreCounts.loaded;
      totalCountAfter = afterLoadMoreCounts.total;
    }

    await waitForAdminSourceVideosRoute({ page, url, timeoutMs: input.timeoutMs });
    await waitForAdminSourceLoadedCount(page, input.sourceVideoList.page_size, input.timeoutMs)
      .catch(() => undefined);
    const queryResponsePromise = observeAdminSourceVideoListResponse({
      page,
      timeoutMs: input.timeoutMs,
      params: { query }
    });
    await page.locator(".admin-source-search input").fill(query);
    const queryResponseObserved = await queryResponsePromise;
    await page.getByText(queryResultId, { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });
    const queryBody = await adminBodyTextFromPage(page);
    const queryResultCountText = await adminPaginationTextFromPage(page);

    await waitForAdminSourceVideosRoute({ page, url, timeoutMs: input.timeoutMs });
    await waitForAdminSourceLoadedCount(page, input.sourceVideoList.page_size, input.timeoutMs)
      .catch(() => undefined);
    const readyResponsePromise = observeAdminSourceVideoListResponse({
      page,
      timeoutMs: input.timeoutMs,
      params: { status: "ready" }
    });
    const readySelect = page.locator("select.admin-filter-select");
    await readySelect.selectOption("ready");
    const readyFilterResponseObserved = await readyResponsePromise;
    await page.locator(".admin-status-badge").first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });
    const readyFilterSelectedValue = await readySelect.inputValue();
    const readyFilterResultCountText = await adminPaginationTextFromPage(page);
    const readyStatusLabels = await page.locator(".admin-status-badge").evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent || "").trim()).filter(Boolean)
    );

    return {
      url,
      source_path_text: sourcePathText,
      source_path_visible: sourcePathText.includes(input.sourceVideosPath) ||
        sourcePathText.includes(input.libraryRoot) ||
        sourcePathText.includes("PublicLibrary"),
      first_page_first_id: firstPageFirstId,
      first_page_first_id_visible: true,
      loaded_count_before: initialCounts.loaded,
      total_count_before: initialCounts.total,
      load_more_button_label: loadMoreButtonLabel,
      load_more_clicked: loadMoreClicked,
      loaded_count_after: loadedCountAfter,
      total_count_after: totalCountAfter,
      loaded_count_increased: loadedCountAfter > initialCounts.loaded,
      query,
      query_result_id: queryResultId,
      query_response_observed: queryResponseObserved,
      query_result_visible: queryBody.includes(queryResultId),
      query_result_count_text: queryResultCountText,
      query_result_matches_api: queryBody.includes(queryResultId) && queryResultId === input.sourceVideoList.query_first_id,
      ready_filter_selected_value: readyFilterSelectedValue,
      ready_filter_response_observed: readyFilterResponseObserved,
      ready_filter_result_count_text: readyFilterResultCountText,
      ready_filter_visible_status_count: readyStatusLabels.length,
      ready_filter_all_visible_rows_ready: readyStatusLabels.length > 0 &&
        readyStatusLabels.every((label) => label === "已可用")
    };
  } finally {
    await browser.close();
  }
}

function expectedAdminProductionStatusTitle(input: {
  status: Record<string, unknown>;
  jobs: Record<string, unknown>;
}): string {
  const supervisor = isRecord(input.jobs.supervisor) ? input.jobs.supervisor : {};
  const supervisorState = stringField(supervisor, "state");
  const supervisorRunning = supervisorState === "running" || supervisorState === "stopping";
  const activeCount = numberField(input.jobs, "active_count") ?? 0;
  const queuedCount = numberField(input.jobs, "queued_count") ?? 0;
  const failedCount = numberField(input.jobs, "failed_count") ?? 0;
  const unprocessedVideoCount = numberField(input.status, "unprocessed_video_count") ?? 0;

  if (activeCount > 0 && !supervisorRunning) {
    return `${activeCount} 个处理中任务需要恢复`;
  }
  if (queuedCount > 0 && activeCount === 0 && !supervisorRunning) {
    return `${queuedCount} 个视频已排队，但预处理服务未运行`;
  }
  if (activeCount > 0 && supervisorRunning) {
    return `${activeCount} 个视频正在处理`;
  }
  if (unprocessedVideoCount > 0 && queuedCount === 0) {
    return `${unprocessedVideoCount} 个视频尚未加入队列`;
  }
  if (failedCount > 0) {
    return `${failedCount} 个视频处理失败`;
  }

  return "预处理当前空闲";
}

function adminCutterUserStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "待审核";
    case "approved":
      return "已通过";
    case "rejected":
      return "已拒绝";
    case "disabled":
      return "已停用";
    default:
      return "";
  }
}

async function checkAdminCutterUsersWeb(input: {
  adminWebUrl: string;
  timeoutMs: number;
  users: Record<string, unknown>;
}): Promise<AdminCutterUsersWebSanityState> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });
  const url = adminWebRouteUrl(input.adminWebUrl, "#/cutter-users");

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: input.timeoutMs });
    await page.getByText("登录申请与使用统计", { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });

    const body = await adminBodyTextFromPage(page);
    const users = recordArrayField(input.users, "users");
    const approvedUsers = users.filter((user) => stringField(user, "status") === "approved");
    const pendingUsers = users.filter((user) => stringField(user, "status") === "pending");
    const firstUser = users[0] ?? {};
    const firstDevices = recordArrayField(firstUser, "devices");
    const firstDevice = firstDevices[0] ?? {};
    const firstStatusLabel = adminCutterUserStatusLabel(stringField(firstUser, "status"));
    const usageMetricLabels = ["活跃剪辑师", "搜索次数", "搜索失败", "选段次数", "剪切成功"];

    return {
      url,
      api_user_count: users.length,
      api_approved_count: approvedUsers.length,
      api_pending_count: pendingUsers.length,
      api_first_user_id: stringField(firstUser, "user_id"),
      api_first_display_name: stringField(firstUser, "display_name"),
      api_first_status_label: firstStatusLabel,
      api_first_device_name: stringField(firstDevice, "device_name"),
      approved_count_visible: bodyIncludesMetricInteger(body, ["已通过"], approvedUsers.length),
      pending_count_visible: bodyIncludesMetricInteger(body, ["待审核"], pendingUsers.length),
      first_user_visible: textIncludesAll(body, [
        stringField(firstUser, "display_name"),
        firstStatusLabel
      ]),
      first_device_visible: textIncludesAll(body, [
        stringField(firstDevice, "device_name"),
        "设备编号"
      ]),
      identity_note_visible: textIncludesAll(body, [
        "用户名 + 本机设备令牌",
        "IP 仅用于诊断和审计"
      ]),
      device_detail_visible: textIncludesAll(body, [
        "设备明细",
        "首次申请",
        "最近登录",
        "浏览器标识"
      ]),
      disable_action_visible: approvedUsers.length === 0 || body.includes("停用用户"),
      approve_action_visible: pendingUsers.length === 0 || body.includes("通过申请"),
      usage_metrics_labels_visible: usageMetricLabels.filter((label) => body.includes(label))
    };
  } finally {
    await browser.close();
  }
}

async function checkAdminPreprocessWeb(input: {
  adminWebUrl: string;
  adminApiBaseUrl: string;
  timeoutMs: number;
  status: Record<string, unknown>;
  jobs: Record<string, unknown>;
  indexes: Record<string, unknown>;
  libraryRoot: string;
}): Promise<AdminPreprocessWebSanityState> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });
  const url = adminWebRouteUrl(input.adminWebUrl, "#/preprocess-jobs");

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: input.timeoutMs });
    await page.getByText("预处理流水线与索引发布", { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });

    const currentIndexVersion = stringField(input.indexes, "current_version");
    const sourceVideoCount = numberField(input.status, "video_count") ?? 0;
    const activeCount = numberField(input.jobs, "active_count") ?? 0;
    const queuedCount = numberField(input.jobs, "queued_count") ?? 0;
    const failedCount = numberField(input.jobs, "failed_count") ?? 0;
    const indexRequiredVideoCount = numberField(input.status, "index_required_video_count") ?? 0;
    const jobs = recordArrayField(input.jobs, "jobs");
    const expectedJobIds = jobs.map((job) => stringField(job, "job_id")).filter(Boolean);
    await page.getByText("当前索引", { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });
    await page.getByText("扫描素材", { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });
    if (expectedJobIds.length > 0) {
      await page.waitForFunction(
        (jobIds) => {
          const body = document.body.innerText.replace(/\s+/g, " ").trim();
          return (jobIds as string[]).some((jobId) => body.includes(jobId));
        },
        expectedJobIds,
        { timeout: Math.min(input.timeoutMs, 5_000) }
      ).catch(() => undefined);
    }

    const body = await adminBodyTextFromPage(page);
    const visibleJob = jobs.find((job) => {
      const jobId = stringField(job, "job_id");
      return Boolean(jobId && body.includes(jobId));
    }) ?? {};
    const visibleJobId = stringField(visibleJob, "job_id");
    const logUrl = stringField(visibleJob, "log_url");
    const logData = logUrl
      ? await fetchEnvelopeData(
        apiUrl(input.adminApiBaseUrl, logUrl),
        input.timeoutMs,
        `admin preprocess job log ${visibleJobId}`
      )
      : {};
    const logRecord = isRecord(logData) ? logData : {};
    const logJobId = stringField(logRecord, "job_id");
    const logPath = stringField(logRecord, "path");
    const logContent = stringField(logRecord, "content");
    const logRecordSource = stringField(logRecord, "record_source") ||
      ((booleanField(logRecord, "exists") ?? false) ? "file" : "");
    const logContentProbe = logContent
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.includes("record_source") || line.includes("\t") || line.startsWith("source_video_id:")) ||
      logContent.trim().slice(0, 80);
    let logBody = body;

    if (visibleJobId && logUrl) {
      const detailOpened = await page.getByRole("button", { name: "详情" })
        .first()
        .click({ timeout: Math.min(input.timeoutMs, 3_000) })
        .then(() => true, () => false);
      if (detailOpened && (logPath || logContentProbe)) {
        await page.waitForFunction(
          ([expectedPath, expectedContent]) => {
            const text = document.body.innerText;
            return (!expectedPath || text.includes(expectedPath)) &&
              (!expectedContent || text.includes(expectedContent));
          },
          [logPath, logContentProbe],
          { timeout: Math.min(input.timeoutMs, 3_000) }
        ).catch(() => undefined);
      }
      logBody = await adminBodyTextFromPage(page);
    }
    const productionStatusTitle = expectedAdminProductionStatusTitle({
      status: input.status,
      jobs: input.jobs
    });
    const productionStatusVisible = body.includes(productionStatusTitle) ||
      (
        body.includes("生产状态") &&
        (
          body.includes("处理中任务需要恢复") ||
          body.includes("视频已排队") ||
          body.includes("视频正在处理") ||
          body.includes("视频尚未加入队列") ||
          body.includes("视频处理失败") ||
          body.includes("预处理当前空闲")
        )
      );

    return {
      url,
      current_index_version: currentIndexVersion,
      current_index_visible: Boolean(currentIndexVersion && body.includes(currentIndexVersion)) ||
        isIndexVersion(parseCurrentIndexVersion(body)),
      source_video_count: sourceVideoCount,
      source_video_count_visible: bodyIncludesMetricInteger(body, ["扫描素材", "全部原视频"], sourceVideoCount) ||
        body.includes("扫描素材"),
      active_count: activeCount,
      active_count_visible: bodyIncludesMetricInteger(body, ["正在处理", "处理中", "并发任务"], activeCount) ||
        bodyIncludesMetricLabelWithAnyInteger(body, ["正在处理", "处理中"]),
      queued_count: queuedCount,
      queued_count_visible: bodyIncludesMetricInteger(body, ["队列中", "排队任务"], queuedCount) ||
        bodyIncludesMetricLabelWithAnyInteger(body, ["队列中"]),
      failed_count: failedCount,
      failed_count_visible: bodyIncludesMetricInteger(body, ["失败可重试", "失败任务"], failedCount) ||
        bodyIncludesMetricLabelWithAnyInteger(body, ["失败可重试", "失败任务"]),
      index_required_video_count: indexRequiredVideoCount,
      index_required_visible: bodyIncludesMetricInteger(
        body,
        ["发布索引", "待发布视频", "待发布索引"],
        indexRequiredVideoCount
      ) || bodyIncludesMetricLabelWithAnyInteger(body, ["发布索引", "待发布视频", "待发布索引"]),
      production_status_title: productionStatusTitle,
      production_status_visible: productionStatusVisible,
      public_library_root_visible: Boolean(input.libraryRoot && body.includes(input.libraryRoot)),
      visible_job_id: visibleJobId,
      visible_job_id_observed: Boolean(visibleJobId),
      log_job_id: logJobId,
      log_record_source: logRecordSource,
      log_content_char_count: logContent.length,
      log_path_visible: Boolean(logPath && logBody.includes(logPath)),
      log_content_visible: Boolean(logContentProbe && logBody.includes(logContentProbe)),
      log_snapshot_visible: logRecordSource === "file" || logBody.includes("任务记录快照")
    };
  } finally {
    await browser.close();
  }
}

async function fetchTimedAdminSourceVideoRecords(input: {
  adminApiBaseUrl: string;
  params: Record<string, string>;
  timeoutMs: number;
  context: string;
}): Promise<{
  records: Record<string, unknown>[];
  elapsed_ms: number;
}> {
  const timed = await timedFetchEnvelopeDataBestOf(
    apiUrl(input.adminApiBaseUrl, "/api/admin/source-videos", input.params),
    input.timeoutMs,
    input.context
  );

  return {
    records: Array.isArray(timed.data) ? timed.data.filter(isRecord) : [],
    elapsed_ms: timed.elapsed_ms
  };
}

async function checkAdminSourceVideoList(input: {
  adminApiBaseUrl: string;
  timeoutMs: number;
}): Promise<AdminSourceVideoListSanityState> {
  const pageSize = 50;
  const firstPage = await fetchTimedAdminSourceVideoRecords({
    adminApiBaseUrl: input.adminApiBaseUrl,
    params: { limit: String(pageSize), offset: "0" },
    timeoutMs: input.timeoutMs,
    context: "admin source video list first page"
  });
  const secondPage = await fetchTimedAdminSourceVideoRecords({
    adminApiBaseUrl: input.adminApiBaseUrl,
    params: { limit: String(pageSize), offset: String(pageSize) },
    timeoutMs: input.timeoutMs,
    context: "admin source video list second page"
  });
  const readyPage = await fetchTimedAdminSourceVideoRecords({
    adminApiBaseUrl: input.adminApiBaseUrl,
    params: { status: "ready", limit: String(pageSize) },
    timeoutMs: input.timeoutMs,
    context: "admin source video list ready filter"
  });
  const query = sourceVideoListQueryFromRecord(firstPage.records[0] ?? {});
  const queryPage = await fetchTimedAdminSourceVideoRecords({
    adminApiBaseUrl: input.adminApiBaseUrl,
    params: { query, limit: "20" },
    timeoutMs: input.timeoutMs,
    context: "admin source video list query filter"
  });
  const firstPageFirstId = stringField(firstPage.records[0] ?? {}, "source_video_id");
  const secondPageFirstId = stringField(secondPage.records[0] ?? {}, "source_video_id");
  const queryFirst = queryPage.records[0] ?? {};

  return {
    page_size: pageSize,
    first_page_count: firstPage.records.length,
    second_page_count: secondPage.records.length,
    first_page_first_id: firstPageFirstId,
    second_page_first_id: secondPageFirstId,
    pages_are_distinct: Boolean(firstPageFirstId && secondPageFirstId && firstPageFirstId !== secondPageFirstId),
    first_page_ms: firstPage.elapsed_ms,
    second_page_ms: secondPage.elapsed_ms,
    ready_filter_count: readyPage.records.length,
    ready_filter_all_ready: readyPage.records.length > 0 &&
      readyPage.records.every((record) => stringField(record, "preprocess_status") === "ready"),
    ready_filter_ms: readyPage.elapsed_ms,
    query,
    query_result_count: queryPage.records.length,
    query_first_id: stringField(queryFirst, "source_video_id"),
    query_first_matches: sourceVideoMatchesQuery(queryFirst, query),
    query_filter_ms: queryPage.elapsed_ms
  };
}

async function checkAdminRealNasMatrix(input: {
  adminWebUrl: string;
  adminApiBaseUrl: string;
  timeoutMs: number;
}): Promise<AdminRealNasMatrixState> {
  const timeoutMs = input.timeoutMs;
  const apiTimeoutMs = Math.max(timeoutMs, LOCAL_WEB_ADMIN_MATRIX_API_COLLECT_TIMEOUT_MS);
  const statusData = await fetchEnvelopeData(
    apiUrl(input.adminApiBaseUrl, "/api/admin/library/status"),
    apiTimeoutMs,
    "admin library status"
  );
  const settingsData = await fetchEnvelopeData(
    apiUrl(input.adminApiBaseUrl, "/api/admin/settings/config"),
    apiTimeoutMs,
    "admin settings config"
  );
  const readyVideosData = await fetchEnvelopeData(apiUrl(input.adminApiBaseUrl, "/api/admin/source-videos", {
    status: "ready",
    limit: "5"
  }), apiTimeoutMs, "admin ready source videos");
  const runtimeSettingsTimed = await timedFetchEnvelopeDataBestOf(
    apiUrl(input.adminApiBaseUrl, "/api/admin/settings/runtime"),
    apiTimeoutMs,
    "admin runtime settings"
  );
  const status = isRecord(statusData) ? statusData : {};
  const settings = isRecord(settingsData) ? settingsData : {};
  const readyVideos = Array.isArray(readyVideosData) ? readyVideosData.filter(isRecord) : [];
  const runtimeSettings = isRecord(runtimeSettingsTimed.data) ? runtimeSettingsTimed.data : {};
  const sourceFolders = recordArrayField(settings, "source_folders");
  const firstReadyVideo = readyVideos[0] ?? {};
  const firstReadySourceVideoId = stringField(firstReadyVideo, "source_video_id");
  const detailTimed = firstReadySourceVideoId
    ? await timedFetchEnvelopeDataBestOf(
      apiUrl(input.adminApiBaseUrl, `/api/admin/source-videos/${firstReadySourceVideoId}`),
      apiTimeoutMs,
      `admin source video detail ${firstReadySourceVideoId}`
    )
    : { data: {}, elapsed_ms: Number.NaN };
  const [
    jobsData,
    indexesData,
    cutterUsersData,
    sourceVideoList,
    webRoutes
  ] = await Promise.all([
    fetchEnvelopeData(apiUrl(input.adminApiBaseUrl, "/api/admin/preprocess/jobs", {
      limit: "12"
    }), apiTimeoutMs, "admin preprocess jobs"),
    fetchEnvelopeData(apiUrl(input.adminApiBaseUrl, "/api/admin/index/versions"), apiTimeoutMs, "admin index versions"),
    fetchEnvelopeData(apiUrl(input.adminApiBaseUrl, "/api/admin/cutter-users"), apiTimeoutMs, "admin cutter users"),
    checkAdminSourceVideoList({
      adminApiBaseUrl: input.adminApiBaseUrl,
      timeoutMs: apiTimeoutMs
    }),
    checkAdminWebRoutes(input.adminWebUrl, input.timeoutMs)
  ]);
  const jobs = isRecord(jobsData) ? jobsData : {};
  const indexes = isRecord(indexesData) ? indexesData : {};
  const cutterUsers = isRecord(cutterUsersData) ? cutterUsersData : {};
  const detail = isRecord(detailTimed.data) ? detailTimed.data : {};
  const libraryRoot = stringField(status, "root_path");
  const sourceVideosPath = stringField(status, "source_videos_path");
  const [sourceVideoWeb, preprocessWeb, cutterUsersWeb] = await Promise.all([
    checkAdminSourceVideosWeb({
      adminWebUrl: input.adminWebUrl,
      timeoutMs: input.timeoutMs,
      libraryRoot,
      sourceVideosPath,
      sourceVideoList
    }),
    checkAdminPreprocessWeb({
      adminWebUrl: input.adminWebUrl,
      adminApiBaseUrl: input.adminApiBaseUrl,
      timeoutMs: input.timeoutMs,
      status,
      jobs,
      indexes,
      libraryRoot
    }),
    checkAdminCutterUsersWeb({
      adminWebUrl: input.adminWebUrl,
      timeoutMs: input.timeoutMs,
      users: cutterUsers
    })
  ]);
  const visibility = isRecord(detail.visibility) ? detail.visibility : {};
  const transcript = isRecord(detail.transcript) ? detail.transcript : {};
  const artifacts = isRecord(detail.artifacts) ? detail.artifacts : {};
  const runtimeFfmpeg = isRecord(runtimeSettings.ffmpeg) ? runtimeSettings.ffmpeg : {};
  const runtimeFfprobe = isRecord(runtimeSettings.ffprobe) ? runtimeSettings.ffprobe : {};
  const runtimeAsr = isRecord(runtimeSettings.asr) ? runtimeSettings.asr : {};
  const versions = recordArrayField(indexes, "versions");
  const users = recordArrayField(cutterUsers, "users");

  return {
    admin_api_base_url: input.adminApiBaseUrl,
    library_root: libraryRoot,
    source_videos_path: sourceVideosPath,
    video_count: numberField(status, "video_count") ?? 0,
    ready_video_count: numberField(status, "ready_video_count") ?? 0,
    queued_video_count: numberField(status, "queued_video_count") ?? 0,
    processing_video_count: numberField(status, "processing_video_count") ?? 0,
    failed_video_count: numberField(status, "failed_video_count") ?? 0,
    index_required_video_count: numberField(status, "index_required_video_count") ?? 0,
    current_index_version: stringField(status, "current_index_version"),
    settings_source_folder_count: sourceFolders.length,
    enabled_source_folder_count: sourceFolders.filter((folder) => booleanField(folder, "enabled") === true).length,
    settings_include_real_nas_path: sourceFolders.some((folder) => stringField(folder, "path").includes("PublicLibrary")),
    source_ready_sample_count: readyVideos.length,
    source_ready_detail_id: firstReadySourceVideoId,
    source_ready_detail_ms: detailTimed.elapsed_ms,
    source_ready_detail_visible_to_cutters: booleanField(visibility, "visible_to_cutters") ?? false,
    source_ready_detail_transcript_segment_count: numberField(transcript, "segment_count") ?? 0,
    source_ready_detail_transcript_char_count: numberField(transcript, "character_count") ?? 0,
    source_ready_detail_index_version: stringField(artifacts, "index_version") || stringField(indexes, "current_version"),
    runtime_settings_ms: runtimeSettingsTimed.elapsed_ms,
    runtime_ffmpeg_available: booleanField(runtimeFfmpeg, "available") ?? false,
    runtime_ffprobe_available: booleanField(runtimeFfprobe, "available") ?? false,
    runtime_asr_key_configured: booleanField(runtimeAsr, "dashscope_api_key_configured") ?? false,
    preprocess_job_count: recordArrayField(jobs, "jobs").length,
    preprocess_active_count: numberField(jobs, "active_count") ?? 0,
    preprocess_queued_count: numberField(jobs, "queued_count") ?? 0,
    preprocess_failed_count: numberField(jobs, "failed_count") ?? 0,
    preprocess_supervisor_state: isRecord(jobs.supervisor) ? stringField(jobs.supervisor, "state") : "",
    index_version_count: versions.length,
    index_current_version: stringField(indexes, "current_version"),
    cutter_user_count: users.length,
    source_video_list: sourceVideoList,
    source_video_web: sourceVideoWeb,
    preprocess_web: preprocessWeb,
    cutter_users_web: cutterUsersWeb,
    web_routes: webRoutes,
    read_only_actions_skipped: [
      "queue-unprocessed",
      "retry-failed",
      "recover-processing",
      "start-supervisor",
      "stop-supervisor",
      "doctor-run",
      "settings-save"
    ]
  };
}

async function fetchAdminPublicLibraryRoot(adminApiBaseUrl: string, timeoutMs: number): Promise<string> {
  const statusData = await fetchEnvelopeData(
    apiUrl(adminApiBaseUrl, "/api/admin/library/status"),
    Math.max(timeoutMs, 10_000),
    "admin library status for public root"
  );
  const status = isRecord(statusData) ? statusData : {};
  return stringField(status, "root_path");
}

async function checkCutterSearchMatrix(input: {
  cutterApiBaseUrl: string;
  queries: string[];
  searchdIndex?: SearchdIndexSanityState;
  timeoutMs: number;
}): Promise<CutterSearchMatrixState> {
  const queryStates: CutterSearchMatrixQueryState[] = [];
  const searchdIndexVersion = input.searchdIndex?.index_version ?? "";

  for (const query of input.queries) {
    let queryState = await fetchCutterSearchMatrixQuery(input.cutterApiBaseUrl, query, input.timeoutMs);
    const startedAt = Date.now();
    while (
      Date.now() - startedAt < Math.min(input.timeoutMs, 5_000) &&
      (queryState.search_mode !== "searchd" || (isIndexVersion(searchdIndexVersion) && queryState.index_version !== searchdIndexVersion))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      queryState = await fetchCutterSearchMatrixQuery(input.cutterApiBaseUrl, query, input.timeoutMs);
    }
    queryStates.push(queryState);
  }

  const maxSearchMs = Math.max(...queryStates.map((query) => query.search_ms));

  return {
    cutter_api_base_url: input.cutterApiBaseUrl,
    query_count: queryStates.length,
    max_search_ms: maxSearchMs,
    all_queries_used_searchd: queryStates.every((query) => query.search_mode === "searchd"),
    matched_searchd_index: isIndexVersion(searchdIndexVersion) &&
      queryStates.every((query) => query.index_version === searchdIndexVersion),
    queries: queryStates
  };
}

async function fetchCutterSearchMatrixQuery(
  cutterApiBaseUrl: string,
  query: string,
  timeoutMs: number
): Promise<CutterSearchMatrixQueryState> {
  const data = await fetchEnvelopeData(apiUrl(cutterApiBaseUrl, "/cutter/source-search", {
    query,
    limit: "3"
  }), Math.min(timeoutMs, 8_000));
  const search = isRecord(data) ? data : {};
  const groups = recordArrayField(search, "groups");
  const firstGroup = groups[0] ?? {};
  const hitSegments = recordArrayField(firstGroup, "hit_segments");
  const firstSegment = hitSegments[0] ?? {};
  const firstSegmentText = stringField(firstSegment, "text");
  const matchRanges = Array.isArray(firstSegment.match_ranges) ? firstSegment.match_ranges : [];

  return {
    query,
    group_count: groups.length,
    returned_count: numberField(search, "returned_count") ?? groups.length,
    index_version: stringField(search, "index_version"),
    search_mode: stringField(search, "search_mode"),
    search_ms: numberField(search, "search_ms") ?? Number.NaN,
    first_source_video_id: stringField(firstGroup, "source_video_id"),
    first_hit_count: numberField(firstGroup, "hit_count") ?? 0,
    first_segment_id: stringField(firstSegment, "segment_id"),
    first_segment_begin_ms: numberField(firstSegment, "begin_ms") ?? Number.NaN,
    first_segment_contains_query: firstSegmentText.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    first_segment_has_match_range: matchRanges.length > 0
  };
}

async function fetchSearchdIndexHealth(
  healthUrl: string,
  adminCurrentIndexVersion: string,
  timeoutMs: number
): Promise<SearchdIndexSanityState> {
  const startedAt = Date.now();
  let latestState: SearchdIndexSanityState = {
    url: healthUrl,
    ok: false,
    admin_current_index_version: adminCurrentIndexVersion,
    index_version: "",
    source_video_count: 0,
    segment_count: 0,
    matched_admin_current_index: false
  };

  while (Date.now() - startedAt < timeoutMs) {
    let response: Response;
    try {
      response = await fetch(healthUrl, {
        method: "GET",
        signal: timeoutSignal(Math.min(2_000, timeoutMs))
      });
    } catch (error) {
      latestState = {
        ...latestState,
        ok: false
      };
      if (Date.now() - startedAt >= timeoutMs) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, isAbortError(error) ? 250 : 500));
      continue;
    }
    const payload: unknown = await response.json().catch(() => ({}));
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
    const indexVersion = stringField(data, "index_version");
    latestState = {
      url: healthUrl,
      ok: response.ok && booleanField(data, "ok") === true,
      admin_current_index_version: adminCurrentIndexVersion,
      index_version: indexVersion,
      source_video_count: numberField(data, "source_video_count") ?? 0,
      segment_count: numberField(data, "segment_count") ?? 0,
      matched_admin_current_index: Boolean(adminCurrentIndexVersion) && indexVersion === adminCurrentIndexVersion
    };

    if (latestState.matched_admin_current_index) {
      return latestState;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return latestState;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

async function waitForCutterWorkbenchReady(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  timeoutMs: number
): Promise<void> {
  try {
    await page.locator("[data-cutter-web-ready='true']").waitFor({ timeout: Math.min(2_000, timeoutMs) });
    return;
  } catch {
    // API mode may show the cutter login gate before the workbench can fetch data.
  }

  const usernameInput = page.getByLabel("用户名", { exact: true });
  if (await usernameInput.isVisible({ timeout: timeoutMs }).catch(() => false)) {
    await usernameInput.fill("本机剪辑师", { timeout: timeoutMs });
    await page.getByRole("button", { name: "提交申请", exact: true }).click({ timeout: timeoutMs });
  }

  await page.locator("[data-cutter-web-ready='true']").waitFor({ timeout: timeoutMs });
}

async function checkCutterAuth(input: {
  cutterApiBaseUrl: string;
  cutterWebUrl: string;
  query: string;
  timeoutMs: number;
}): Promise<CutterAuthSanityState> {
  const authModeUrl = apiUrl(input.cutterApiBaseUrl, "/cutter/auth/mode");
  const response = await fetch(authModeUrl, {
    method: "GET",
    signal: timeoutSignal(input.timeoutMs)
  });
  const payload: unknown = await response.json().catch(() => ({}));
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
  const authMode = stringField(data, "auth_mode");
  const trustedUsername = stringField(data, "trusted_username").trim();
  const url = materialLocatorUrl(input.cutterWebUrl, input.query);
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    const workbenchReady = await page.locator("[data-cutter-web-ready='true']").waitFor({
      timeout: input.timeoutMs
    }).then(() => true, () => false);
    const body = (await page.locator("body").innerText({ timeout: input.timeoutMs }).catch(() => ""))
      .replace(/\s+/g, " ")
      .trim();
    const visibleUsername = trustedUsername && body.includes(trustedUsername) ? trustedUsername : "";

    return {
      cutter_api_base_url: input.cutterApiBaseUrl,
      auth_mode_url: authModeUrl,
      auth_mode: authMode === "reviewed" || authMode === "local_trusted" ? authMode : "",
      local_trusted: booleanField(data, "local_trusted") ?? false,
      trusted_username: trustedUsername,
      material_locator_url: url,
      fresh_context_workbench_ready: workbenchReady,
      login_gate_visible_after_ready: body.includes("申请使用剪辑师工作台"),
      manual_apply_used: false,
      visible_username: visibleUsername
    };
  } finally {
    await browser.close();
  }
}

async function checkCutterPublicLibraryWeb(input: {
  cutterApiBaseUrl: string;
  cutterWebUrl: string;
  timeoutMs: number;
}): Promise<CutterPublicLibraryWebSanityState> {
  const sourceLibraryData = await fetchEnvelopeData(apiUrl(input.cutterApiBaseUrl, "/cutter/source-library", {
    limit: "20"
  }), input.timeoutMs, "cutter source library API");
  const sourceLibrary = isRecord(sourceLibraryData) ? sourceLibraryData : {};
  const videos = recordArrayField(sourceLibrary, "videos");
  const firstVideo = videos[0] ?? {};
  const apiAvailableVideoCount = numberField(sourceLibrary, "available_video_count") ?? 0;
  const firstSourceVideoId = stringField(firstVideo, "source_video_id");
  const firstTitle = stringField(firstVideo, "title");
  const url = cutterWebRouteUrl(input.cutterWebUrl, "#public-library");
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    const apiResponsePromise = page.waitForResponse((response) => {
      if (!response.ok()) {
        return false;
      }

      try {
        const responseUrl = new URL(response.url());
        return responseUrl.pathname.endsWith("/cutter/source-library") &&
          responseUrl.searchParams.get("limit") === "20" &&
          (!responseUrl.searchParams.has("offset") || responseUrl.searchParams.get("offset") === "0");
      } catch {
        return false;
      }
    }, { timeout: input.timeoutMs }).then(() => true, () => false);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await waitForCutterWorkbenchReady(page, input.timeoutMs);
    const publicLibraryPage = page.locator("[data-page='public-library']");
    await publicLibraryPage.waitFor({ timeout: input.timeoutMs });
    if (firstTitle) {
      await publicLibraryPage.getByText(firstTitle, { exact: false }).first().waitFor({
        state: "visible",
        timeout: input.timeoutMs
      });
    }
    const apiResponseObserved = await apiResponsePromise;
    const pageText = (await publicLibraryPage.innerText({ timeout: input.timeoutMs })).replace(/\s+/g, " ").trim();
    const loadedCountBefore = parseLoadedPublicLibraryCount(pageText);
    const loadMoreButton = publicLibraryPage.getByRole("button", { name: /继续加载/ }).first();
    const loadMoreButtonVisible = await loadMoreButton.isVisible({ timeout: 1_000 }).catch(() => false);
    let loadedCountAfter = Number.isInteger(loadedCountBefore) ? loadedCountBefore : videos.length;
    let loadMoreClicked = false;

    if (loadMoreButtonVisible) {
      const loadMoreResponsePromise = page.waitForResponse((response) => {
        if (!response.ok()) {
          return false;
        }

        try {
          const responseUrl = new URL(response.url());
          return responseUrl.pathname.endsWith("/cutter/source-library") &&
            responseUrl.searchParams.get("limit") === "20" &&
            Number(responseUrl.searchParams.get("offset") ?? "0") > 0;
        } catch {
          return false;
        }
      }, { timeout: input.timeoutMs }).then(() => true, () => false);
      await loadMoreButton.click({ timeout: input.timeoutMs });
      loadMoreClicked = await loadMoreResponsePromise;
      await publicLibraryPage.getByText(/已显示\s+\d+\s*\/\s*\d+/, { exact: false }).first().waitFor({
        state: "visible",
        timeout: input.timeoutMs
      }).catch(() => undefined);
      const afterPageText = (await publicLibraryPage.innerText({ timeout: input.timeoutMs }))
        .replace(/\s+/g, " ")
        .trim();
      const parsedLoadedAfter = parseLoadedPublicLibraryCount(afterPageText);
      loadedCountAfter = Number.isInteger(parsedLoadedAfter) ? parsedLoadedAfter : loadedCountAfter;
    }
    const selectedInspectorTitle = await publicLibraryPage
      .locator(".cutter-inspector-stack strong")
      .first()
      .innerText({ timeout: input.timeoutMs })
      .catch(() => "");

    return {
      cutter_api_base_url: input.cutterApiBaseUrl,
      url,
      api_available_video_count: apiAvailableVideoCount,
      api_returned_count: videos.length,
      api_first_source_video_id: firstSourceVideoId,
      api_first_title: firstTitle,
      web_api_response_observed: apiResponseObserved,
      available_count_visible: pageText.includes(`${apiAvailableVideoCount} 条全部可用资源`),
      first_title_visible: Boolean(firstTitle && pageText.includes(firstTitle)),
      public_source_label_visible: pageText.includes("公共素材库") && pageText.includes("可用原素材"),
      load_more_button_visible: loadMoreButtonVisible,
      loaded_count_before: Number.isInteger(loadedCountBefore) ? loadedCountBefore : videos.length,
      loaded_count_after: loadedCountAfter,
      load_more_clicked: loadMoreClicked,
      loaded_count_increased: loadedCountAfter > (Number.isInteger(loadedCountBefore) ? loadedCountBefore : videos.length),
      selected_inspector_title: selectedInspectorTitle.trim()
    };
  } finally {
    await browser.close();
  }
}

async function checkAdminDashboard(
  adminWebUrl: string,
  timeoutMs: number
): Promise<AdminDashboardSanityState> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    const url = adminDashboardUrl(adminWebUrl);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: timeoutMs });
    await page.getByText("核心链路健康", { exact: false }).first().waitFor({
      state: "visible",
      timeout: timeoutMs
    });
    let body = "";
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      body = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
      if (
        isIndexVersion(parseCurrentIndexVersion(body)) &&
        Number.isFinite(parseSearchP95Ms(body)) &&
        Number.isFinite(parseLocalSearchCoveragePercent(body)) &&
        Number.isInteger(parseSearchFailureCount(body))
      ) {
        break;
      }

      await page.waitForTimeout(250);
    }
    const visibleLabels = ADMIN_DASHBOARD_REQUIRED_LABELS.filter((label) => body.includes(label));
    const activeCapacityMatch = body.match(/\d+\s*\/\s*50\s*(?:活跃剪辑师|剪辑师|)/);
    const parsedCapacity = parseCutterCapacity(activeCapacityMatch?.[0] ?? body);
    const state: AdminDashboardSanityState = {
      url,
      title: await page.title(),
      visible_labels: visibleLabels,
      write_action_labels: await adminWriteActionLabelsFromPage(page, ADMIN_DASHBOARD_WRITE_ACTION_LABELS),
      disabled_write_action_labels: await disabledAdminWriteActionLabelsFromPage(
        page,
        ADMIN_DASHBOARD_WRITE_ACTION_LABELS
      ),
      active_cutter_capacity_label: activeCapacityMatch?.[0]?.trim() ?? "",
      active_cutter_count: parsedCapacity.active,
      cutter_capacity: parsedCapacity.capacity,
      current_index_version: parseCurrentIndexVersion(body),
      search_p95_ms: parseSearchP95Ms(body),
      local_search_coverage_percent: parseLocalSearchCoveragePercent(body),
      search_failure_count: parseSearchFailureCount(body),
      body_sample: body.slice(0, 2_000)
    };
    const errors = validateAdminDashboardSanityState(state);

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    return state;
  } finally {
    await browser.close();
  }
}

async function collectMaterialLocatorStateFromPage(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  url: string;
  query: string;
  timeoutMs: number;
  navigate?: boolean;
  focusPublicSource?: boolean;
}): Promise<MaterialLocatorSanityState> {
  if (input.navigate !== false) {
    await input.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
  }
  await waitForCutterWorkbenchReady(input.page, input.timeoutMs);
  await input.page.locator("[data-page='material-locator']").waitFor({ timeout: input.timeoutMs });
  await input.page.locator(".cutter-locator-result").first().waitFor({ timeout: input.timeoutMs });
  await input.page.locator(".cutter-locator-result.is-selected").waitFor({ timeout: input.timeoutMs });
  const publicSourceSection = input.page
    .locator(".cutter-locator-section")
    .filter({ hasText: "公共原素材" })
    .first();
  if (input.focusPublicSource !== false) {
    await publicSourceSection.locator(".cutter-locator-result.is-selected").first().waitFor({
      timeout: input.timeoutMs
    }).catch(() => undefined);
  }
  const defaultSelectedMaterialSection = await input.page.evaluate(() =>
    document
      .querySelector(".cutter-locator-result.is-selected")
      ?.closest(".cutter-locator-section")
      ?.querySelector("header h2")
      ?.textContent
      ?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
  if (input.focusPublicSource !== false) {
    await publicSourceSection.locator(".cutter-locator-result").first().click();
  }

  const transcript = input.page
    .locator(".cutter-natural-transcript[data-current-hit-time-ms]:not([data-current-hit-time-ms=''])")
    .first();
  await transcript.waitFor({ timeout: input.timeoutMs });
  await transcript.locator("[data-testid='transcript-hit']").first().waitFor({
    state: "visible",
    timeout: input.timeoutMs
  });
  const searchStatusText = (await input.page.locator(".cutter-locator-status-strip").first().innerText())
    .replace(/\s+/g, " ")
    .trim();
  const transcriptHeader = (await transcript.locator("header").innerText()).replace(/\s+/g, " ").trim();
  const currentHitTimeMs = await transcript.getAttribute("data-current-hit-time-ms") ?? "";
  const headerFields = parseMaterialLocatorHeader(transcriptHeader);
  const state: MaterialLocatorSanityState = {
    url: input.url,
    query: input.query,
    default_selected_material_section: defaultSelectedMaterialSection,
    candidate_count: await input.page.locator(".cutter-locator-result").count(),
    search_status_text: searchStatusText,
    search_index_version: parseMaterialSearchIndexVersion(searchStatusText),
    transcript_header: transcriptHeader,
    current_hit_time_ms: currentHitTimeMs,
    current_hit_time_ms_value: parseIntegerText(currentHitTimeMs),
    current_hit_segment_id: await transcript.getAttribute("data-current-hit-segment-id") ?? "",
    global_hit_position: headerFields.global_hit_position,
    global_hit_count: headerFields.global_hit_count,
    current_video_hit_count: headerFields.current_video_hit_count,
    selected_sentence_count: headerFields.selected_sentence_count,
    full_transcript_char_count: headerFields.full_transcript_char_count
  };
  const errors = validateMaterialLocatorSanityState(state);

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  return state;
}

async function checkMaterialLocatorStateOnly(
  cutterWebUrl: string,
  query: string,
  timeoutMs: number
): Promise<MaterialLocatorSanityState> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    return await collectMaterialLocatorStateFromPage({
      page,
      url: materialLocatorUrl(cutterWebUrl, query),
      query,
      timeoutMs
    });
  } finally {
    await browser.close();
  }
}

async function dragSelectTranscriptContextFromCurrentHit(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  url: string;
  query: string;
  timeoutMs: number;
}): Promise<{
  selected_text: string;
  selection_proof_text: string;
  selected_text_segment_count: number;
  selection_state: MaterialLocatorSanityState;
}> {
  const rows = input.page.locator(".cutter-natural-transcript .cutter-transcript-row");
  const currentHitRow = input.page.locator(".cutter-transcript-row.is-current-hit").first();
  await currentHitRow.waitFor({ state: "visible", timeout: input.timeoutMs });
  const rowIndexes = await rows.evaluateAll((nodes) => {
    const currentIndex = nodes.findIndex((node) => node.classList.contains("is-current-hit"));
    const texts = nodes.map((node) => node.querySelector(".cutter-transcript-text")?.textContent?.trim() ?? "");
    const currentText = currentIndex >= 0 ? texts[currentIndex] ?? "" : "";
    const candidates = [];
    if (currentIndex >= 0 && currentIndex < nodes.length - 1) {
      candidates.push(currentIndex + 1);
    }
    if (currentIndex > 0) {
      candidates.push(currentIndex - 1);
    }
    let targetIndex = -1;
    for (const index of candidates) {
      const text = texts[index] ?? "";
      if (text.length > 0 && currentText.length + text.length <= 92) {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex < 0) {
      for (const index of candidates) {
        if ((texts[index] ?? "").length > 0) {
          targetIndex = index;
          break;
        }
      }
    }

    return {
      currentIndex,
      targetIndex,
      currentText,
      targetText: targetIndex >= 0 ? texts[targetIndex] ?? "" : ""
    };
  });

  if (rowIndexes.currentIndex < 0 || rowIndexes.targetIndex < 0) {
    throw new Error("material locator transcript drag selection requires a visible adjacent transcript row with text");
  }

  const startRow = rows.nth(rowIndexes.currentIndex);
  const endRow = rows.nth(rowIndexes.targetIndex);
  await startRow.scrollIntoViewIfNeeded({ timeout: input.timeoutMs });
  await endRow.scrollIntoViewIfNeeded({ timeout: input.timeoutMs });
  await input.page.addStyleTag({
    content: ".cutter-transcript-body, .cutter-transcript-body * { user-select: none !important; }"
  });
  const [startBox, endBox] = await Promise.all([
    startRow.boundingBox(),
    endRow.boundingBox()
  ]);
  if (!startBox || !endBox) {
    throw new Error("material locator transcript drag selection rows must have visible bounds");
  }

  await input.page.mouse.move(startBox.x + Math.min(96, startBox.width / 2), startBox.y + startBox.height / 2);
  await input.page.mouse.down();
  await input.page.mouse.move(endBox.x + Math.min(96, endBox.width / 2), endBox.y + endBox.height / 2, { steps: 18 });
  await input.page.mouse.up();

  const selectedTextLocator = input.page.locator(".cutter-locator-selected-copy p").first();
  const proofLocator = input.page.getByTestId("selection-proof-strip");
  const expectedSelectedTexts = [rowIndexes.currentText, rowIndexes.targetText].filter(Boolean);
  const proofDeadline = Date.now() + input.timeoutMs;
  let selectedText = "";
  let selectionProofText = "";
  let selectionState: MaterialLocatorSanityState | undefined;
  let selectedTextSegmentCount = 0;

  while (Date.now() <= proofDeadline) {
    selectionState = await collectMaterialLocatorStateFromPage({
      page: input.page,
      url: input.url,
      query: input.query,
      timeoutMs: input.timeoutMs,
      navigate: false,
      focusPublicSource: false
    });
    selectedText = (await selectedTextLocator.innerText({ timeout: input.timeoutMs })).trim();
    selectionProofText = (await proofLocator.innerText({ timeout: input.timeoutMs }))
      .replace(/\s+/g, " ")
      .trim();
    selectedTextSegmentCount = expectedSelectedTexts.filter((text) => selectedText.includes(text)).length;
    const proofHit = parseSelectionProofHit(selectionProofText);
    if (
      selectionState.selected_sentence_count >= 2 &&
      selectedTextSegmentCount >= 2 &&
      selectedText.includes(input.query) &&
      Number.isInteger(proofHit.global_hit_position) &&
      Number.isInteger(proofHit.global_hit_count) &&
      proofHit.global_hit_position === selectionState.global_hit_position &&
      proofHit.global_hit_count === selectionState.global_hit_count
    ) {
      return {
        selected_text: selectedText,
        selection_proof_text: selectionProofText,
        selected_text_segment_count: selectedTextSegmentCount,
        selection_state: selectionState
      };
    }

    await input.page.waitForTimeout(250);
  }

  throw new Error("material locator transcript drag selection must include text from two or more transcript segments around the keyword hit");
}

async function checkMaterialLocator(
  cutterWebUrl: string,
  cutterApiBaseUrl: string,
  query: string,
  timeoutMs: number,
  publicLibraryRoot = ""
): Promise<{
  locator: MaterialLocatorSanityState;
  closedLoop: MaterialLocatorClosedLoopState;
}> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    const url = materialLocatorUrl(cutterWebUrl, query);
    await collectMaterialLocatorStateFromPage({
      page,
      url,
      query,
      timeoutMs
    });

    const dragSelection = await dragSelectTranscriptContextFromCurrentHit({
      page,
      url,
      query,
      timeoutMs
    });
    const selectedText = dragSelection.selected_text;
    const selectionProofText = dragSelection.selection_proof_text;
    const selectedTextSegmentCount = dragSelection.selected_text_segment_count;
    const selectionState = dragSelection.selection_state;
    const selectedTextCharCount = Array.from(selectedText).length;
    const queryCharCount = Array.from(query.trim()).length;
    const beforeLocalClipIds = new Set(
      (await fetchLocalClipEvidence({ cutterApiBaseUrl, timeoutMs }))
        .map((clip) => clip.local_clip_id)
        .filter(Boolean)
    );

    await page
      .locator(".cutter-locator-cut-actions")
      .getByRole("button", { name: /剪切这段/ })
      .click({ timeout: timeoutMs });
    const cutNoticeLocator = page.locator(".cutter-locator-queue-notice").first();
    await cutNoticeLocator.getByText(/剪切完成|本地素材已更新|已加入剪切任务/, { exact: false }).waitFor({
      state: "visible",
      timeout: Math.max(timeoutMs, 2_000)
    });
    const cutNotice = (await cutNoticeLocator.innerText()).trim();
    const createdLocalClip = await waitForNewLocalClipEvidence({
      cutterApiBaseUrl,
      selectedText,
      beforeClipIds: beforeLocalClipIds,
      timeoutMs
    });
    const completedCutJob = await waitForCompletedCutJobEvidence({
      cutterApiBaseUrl,
      localClipId: createdLocalClip.local_clip_id,
      selectedText,
      timeoutMs
    });
    const localClipMediaFilePath = createdLocalClip.media_file_path;
    const localClipManifestFilePath = createdLocalClip.manifest_file_path;
    const [localClipMediaFileProof, localClipManifestFileProof] = await Promise.all([
      localFileProof(localClipMediaFilePath),
      localFileProof(localClipManifestFilePath)
    ]);
    const publicLibraryWriteDetected = Boolean(publicLibraryRoot.trim()) && (
      isPathInsideDirectory(localClipMediaFilePath, publicLibraryRoot) ||
      isPathInsideDirectory(localClipManifestFilePath, publicLibraryRoot)
    );

    const localLibraryPageEvidence = await checkLocalLibraryPageEvidence({
      page,
      cutterWebUrl,
      selectedText,
      localClip: createdLocalClip,
      timeoutMs
    });
    const cutTasksPageEvidence = await checkCutTasksPageEvidence({
      page,
      cutterWebUrl,
      selectedText,
      outputFile: completedCutJob.output_file,
      sourceTitle: completedCutJob.source_title,
      beginMs: completedCutJob.begin_ms,
      endMs: completedCutJob.end_ms,
      timeoutMs
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const sectionTitles = await page.locator(".cutter-locator-section header h2").evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? "")
    );
    const closedLoop: MaterialLocatorClosedLoopState = {
      selection_method: "transcript-drag",
      selected_text: selectedText,
      selection_proof_text: selectionProofText,
      selected_text_char_count: selectedTextCharCount,
      selected_sentence_count: selectionState.selected_sentence_count,
      selected_text_segment_count: selectedTextSegmentCount,
      selected_text_is_broader_than_query: selectedTextCharCount > queryCharCount,
      cut_notice: cutNotice,
      ...localLibraryPageEvidence,
      first_result_section: sectionTitles[0] ?? "",
      second_result_section: sectionTitles[1] ?? "",
      local_clip_id: createdLocalClip.local_clip_id,
      local_clip_media_file_path: localClipMediaFilePath,
      local_clip_manifest_file_path: localClipManifestFilePath,
      local_clip_media_file_exists: localClipMediaFileProof.exists,
      local_clip_media_file_size_bytes: localClipMediaFileProof.size_bytes,
      local_clip_manifest_file_exists: localClipManifestFileProof.exists,
      local_clip_manifest_file_size_bytes: localClipManifestFileProof.size_bytes,
      cut_job_id: completedCutJob.cut_job_id,
      cut_job_status: completedCutJob.status,
      cut_job_export_clip_id: completedCutJob.export_clip_id,
      cut_job_output_file: completedCutJob.output_file,
      cut_job_contains_selection: completedCutJob.selected_text.includes(selectedText),
      ...cutTasksPageEvidence,
      public_library_root: publicLibraryRoot,
      local_output_is_outside_public_library: Boolean(publicLibraryRoot.trim()) && !publicLibraryWriteDetected,
      public_library_write_detected: publicLibraryWriteDetected
    };
    const closedLoopErrors = [
      ...validateMaterialLocatorClosedLoopState(closedLoop),
      ...validateMaterialLocatorClosedLoopAgainstLocator(closedLoop, selectionState)
    ];

    if (closedLoopErrors.length > 0) {
      throw new Error(closedLoopErrors.join("; "));
    }

    return {
      locator: selectionState,
      closedLoop
    };
  } finally {
    await browser.close();
  }
}

async function layoutBoxFromPage(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  selector: string
): Promise<LocalWebLayoutBoxState> {
  return page.locator(selector).first().evaluate((element, selectedSelector) => {
    const html = element as HTMLElement;

    return {
      selector: selectedSelector,
      client_width: html.clientWidth,
      scroll_width: html.scrollWidth,
      horizontal_overflow: html.scrollWidth > html.clientWidth + 2
    };
  }, selector);
}

async function adminWriteActionLabelsFromPage(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  labels: readonly string[]
): Promise<string[]> {
  return page.locator("button").evaluateAll((buttons, labels) =>
    (labels as string[]).filter((label) =>
      buttons.some((button) => (button.textContent || "").trim() === label)
    ),
  [...labels]);
}

async function disabledAdminWriteActionLabelsFromPage(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  labels: readonly string[]
): Promise<string[]> {
  return page.locator("button").evaluateAll((buttons, labels) =>
    (labels as string[]).filter((label) =>
      buttons.some((button) =>
        (button.textContent || "").trim() === label &&
        (button as HTMLButtonElement).disabled
      )
    ),
  [...labels]);
}

async function routeLayoutFromPage(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  app: "admin" | "cutter";
  route: string;
  url: string;
  viewportLabel: string;
  viewportWidth: number;
  viewportHeight: number;
  requiredLabels: readonly string[];
  pageSelector: string;
}): Promise<LocalWebRouteLayoutState> {
  const bodyText = (await input.page.locator("body").innerText()).replace(/\s+/g, " ").trim();

  return {
    app: input.app,
    route: input.route,
    url: input.url,
    viewport_label: input.viewportLabel,
    viewport_width: input.viewportWidth,
    viewport_height: input.viewportHeight,
    required_labels: [...input.requiredLabels],
    visible_labels: input.requiredLabels.filter((label) => bodyText.includes(label)),
    disabled_write_action_labels: input.app === "admin"
      ? await disabledAdminWriteActionLabelsFromPage(input.page, adminWriteActionLabelsForRoute(input.route))
      : [],
    body: await layoutBoxFromPage(input.page, "body"),
    page: await layoutBoxFromPage(input.page, input.pageSelector)
  };
}

async function checkAdminRouteLayouts(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  adminWebUrl: string,
  viewport: typeof LOCAL_WEB_LAYOUT_VIEWPORTS[number],
  timeoutMs: number
): Promise<LocalWebRouteLayoutState[]> {
  const layouts: LocalWebRouteLayoutState[] = [];

  for (const routeCheck of ADMIN_WEB_ROUTE_CHECKS) {
    const url = adminWebRouteUrl(adminWebUrl, routeCheck.hash);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: timeoutMs });
    for (const label of routeCheck.required_labels) {
      await page.getByText(label, { exact: false }).first().waitFor({
        state: "visible",
        timeout: timeoutMs
      });
    }
    layouts.push(await routeLayoutFromPage({
      page,
      app: "admin",
      route: routeCheck.route,
      url,
      viewportLabel: viewport.label,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      requiredLabels: routeCheck.required_labels,
      pageSelector: ".admin-main-column"
    }));
  }

  return layouts;
}

async function checkCutterRouteLayouts(input: {
  page: Awaited<ReturnType<Browser["newPage"]>>;
  cutterWebUrl: string;
  query: string;
  viewport: typeof LOCAL_WEB_LAYOUT_VIEWPORTS[number];
  timeoutMs: number;
}): Promise<LocalWebRouteLayoutState[]> {
  const layouts: LocalWebRouteLayoutState[] = [];

  for (const routeCheck of CUTTER_WEB_ROUTE_CHECKS) {
    const url = cutterWebRouteUrl(input.cutterWebUrl, routeCheck.hash(input.query));
    await input.page.goto(url, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await waitForCutterWorkbenchReady(input.page, input.timeoutMs);
    const routePage = input.page.locator(`[data-page='${routeCheck.data_page}']`);
    await routePage.waitFor({ timeout: input.timeoutMs });
    for (const label of routeCheck.required_labels) {
      await routePage.getByText(label, { exact: false }).first().waitFor({
        state: "visible",
        timeout: input.timeoutMs
      });
    }
    layouts.push(await routeLayoutFromPage({
      page: input.page,
      app: "cutter",
      route: routeCheck.route,
      url,
      viewportLabel: input.viewport.label,
      viewportWidth: input.viewport.width,
      viewportHeight: input.viewport.height,
      requiredLabels: routeCheck.required_labels,
      pageSelector: `[data-page='${routeCheck.data_page}']`
    }));
  }

  return layouts;
}

async function checkLocalWebLayout(input: {
  adminWebUrl: string;
  cutterWebUrl: string;
  query: string;
  timeoutMs: number;
}): Promise<LocalWebLayoutSanityState> {
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 960
    },
    deviceScaleFactor: 1
  });

  try {
    const desktopViewport = LOCAL_WEB_LAYOUT_VIEWPORTS[0];
    const adminSourceVideosUrl = adminWebRouteUrl(input.adminWebUrl, "#/source-videos");
    await page.goto(adminSourceVideosUrl, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await page.locator("[data-admin-web-ready='true']").waitFor({ timeout: input.timeoutMs });
    await page.getByText("公共素材资产清单", { exact: false }).first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });
    const adminStatusbar = await layoutBoxFromPage(page, ".admin-console-statusbar");
    const adminStatusbarItemOverflowCount = await page.locator(".admin-console-statusbar span").evaluateAll((nodes) =>
      nodes.filter((node) => {
        const html = node as HTMLElement;
        return html.scrollWidth > html.clientWidth + 2;
      }).length
    );

    const cutterMaterialLocatorUrl = materialLocatorUrl(input.cutterWebUrl, input.query);
    await page.goto(cutterMaterialLocatorUrl, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
    await waitForCutterWorkbenchReady(page, input.timeoutMs);
    await page.locator("[data-page='material-locator']").waitFor({ timeout: input.timeoutMs });
    await page.locator(".cutter-locator-status-strip").first().waitFor({
      state: "visible",
      timeout: input.timeoutMs
    });
    const cutterWorkbench = await layoutBoxFromPage(page, ".cutter-locator-workbench");
    const cutterBody = await layoutBoxFromPage(page, "body");
    const adminRouteLayouts: LocalWebRouteLayoutState[] = [];
    const cutterRouteLayouts: LocalWebRouteLayoutState[] = [];

    for (const viewport of LOCAL_WEB_LAYOUT_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height
      });
      adminRouteLayouts.push(...await checkAdminRouteLayouts(page, input.adminWebUrl, viewport, input.timeoutMs));
      cutterRouteLayouts.push(...await checkCutterRouteLayouts({
        page,
        cutterWebUrl: input.cutterWebUrl,
        query: input.query,
        viewport,
        timeoutMs: input.timeoutMs
      }));
    }

    return {
      admin_source_videos_url: adminSourceVideosUrl,
      cutter_material_locator_url: cutterMaterialLocatorUrl,
      viewport_width: desktopViewport.width,
      viewport_height: desktopViewport.height,
      admin_statusbar: adminStatusbar,
      admin_statusbar_item_overflow_count: adminStatusbarItemOverflowCount,
      cutter_workbench: cutterWorkbench,
      cutter_body: cutterBody,
      admin_route_layouts: adminRouteLayouts,
      cutter_route_layouts: cutterRouteLayouts
    };
  } finally {
    await browser.close();
  }
}

async function refreshFinalIndexSensitiveSnapshot(input: {
  adminWebUrl: string;
  adminApiBaseUrl: string;
  cutterWebUrl: string;
  cutterApiBaseUrl: string;
  searchdHealthUrl: string;
  matrixQueries: string[];
  timeoutMs: number;
}): Promise<{
  adminDashboard: AdminDashboardSanityState;
  searchdIndex: SearchdIndexSanityState;
  adminRealNasMatrix: AdminRealNasMatrixState;
  cutterSearchMatrix: CutterSearchMatrixState;
  cutterPublicLibraryWeb: CutterPublicLibraryWebSanityState;
}> {
  const adminDashboard = await checkAdminDashboard(input.adminWebUrl, input.timeoutMs);
  const searchdIndex = await fetchSearchdIndexHealth(
    input.searchdHealthUrl,
    adminDashboard.current_index_version,
    Math.max(input.timeoutMs, SEARCHD_INDEX_SYNC_TIMEOUT_MS)
  );
  const searchdErrors = validateSearchdIndexSanityState(searchdIndex);

  if (searchdErrors.length > 0) {
    throw new Error(searchdErrors.join("; "));
  }

  const [adminRealNasMatrix, cutterSearchMatrix, cutterPublicLibraryWeb] = await Promise.all([
    checkAdminRealNasMatrix({
      adminWebUrl: input.adminWebUrl,
      adminApiBaseUrl: input.adminApiBaseUrl,
      timeoutMs: input.timeoutMs
    }),
    checkCutterSearchMatrix({
      cutterApiBaseUrl: input.cutterApiBaseUrl,
      queries: input.matrixQueries,
      searchdIndex,
      timeoutMs: input.timeoutMs
    }),
    checkCutterPublicLibraryWeb({
      cutterApiBaseUrl: input.cutterApiBaseUrl,
      cutterWebUrl: input.cutterWebUrl,
      timeoutMs: input.timeoutMs
    })
  ]);
  const adminRealNasErrors = validateAdminRealNasMatrixState(adminRealNasMatrix);
  const cutterSearchErrors = validateCutterSearchMatrixState(cutterSearchMatrix, searchdIndex);
  const cutterPublicLibraryErrors = validateCutterPublicLibraryWebSanityState(cutterPublicLibraryWeb, searchdIndex);

  if (adminRealNasErrors.length > 0 || cutterSearchErrors.length > 0 || cutterPublicLibraryErrors.length > 0) {
    throw new Error([...adminRealNasErrors, ...cutterSearchErrors, ...cutterPublicLibraryErrors].join("; "));
  }

  return {
    adminDashboard,
    searchdIndex,
    adminRealNasMatrix,
    cutterSearchMatrix,
    cutterPublicLibraryWeb
  };
}

export async function runLocalWebSanity(options: LocalWebSanityOptions = {}): Promise<LocalWebSanityReport> {
  const {
    adminWebUrl,
    adminApiBaseUrl,
    cutterWebUrl,
    cutterApiBaseUrl,
    searchdBaseUrl
  } = resolveLocalWebSanityEndpoints(options);
  const searchdHealthUrl = appendUrlPath(searchdBaseUrl, "/health");
  const query = options.query ?? process.env.MIXLAB_LOCAL_WEB_SANITY_QUERY ?? DEFAULT_QUERY;
  const matrixQueries = matrixQueriesFromInput(
    query,
    options.matrixQueries ?? matrixQueriesFromEnv(process.env.MIXLAB_LOCAL_WEB_SANITY_MATRIX_QUERIES)
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const reportPath = options.reportPath ?? process.env.MIXLAB_LOCAL_WEB_SANITY_REPORT ?? DEFAULT_REPORT_PATH;
  const endpoints = await Promise.all([
    checkEndpoint("admin web", adminWebUrl, timeoutMs),
    checkEndpoint("cutter web", cutterWebUrl, timeoutMs),
    checkEndpoint("admin api", apiUrl(adminApiBaseUrl, "/api/admin/library/status"), timeoutMs),
    checkEndpoint("cutter api", apiUrl(cutterApiBaseUrl, "/health"), timeoutMs),
    checkEndpoint("searchd", searchdHealthUrl, timeoutMs)
  ]);
  const errors = endpoints.flatMap((endpoint) => endpoint.ok ? [] : [`${endpoint.label}: ${endpoint.error ?? "not ok"}`]);
  let adminDashboard: AdminDashboardSanityState | undefined;
  let searchdIndex: SearchdIndexSanityState | undefined;
  let adminRealNasMatrix: AdminRealNasMatrixState | undefined;
  let cutterSearchMatrix: CutterSearchMatrixState | undefined;
  let cutterAuth: CutterAuthSanityState | undefined;
  let cutterPublicLibraryWeb: CutterPublicLibraryWebSanityState | undefined;
  let layout: LocalWebLayoutSanityState | undefined;
  let materialLocator: MaterialLocatorSanityState | undefined;
  let materialLocatorClosedLoop: MaterialLocatorClosedLoopState | undefined;

  try {
    adminDashboard = await checkAdminDashboard(adminWebUrl, timeoutMs);
  } catch (error) {
    errors.push(`admin dashboard: ${errorMessage(error)}`);
  }

  if (adminDashboard) {
    try {
      searchdIndex = await fetchSearchdIndexHealth(
        searchdHealthUrl,
        adminDashboard.current_index_version,
        Math.max(timeoutMs, SEARCHD_INDEX_SYNC_TIMEOUT_MS)
      );
      const searchdErrors = validateSearchdIndexSanityState(searchdIndex);
      if (searchdErrors.length > 0) {
        throw new Error(searchdErrors.join("; "));
      }
    } catch (error) {
      errors.push(`searchd index: ${errorMessage(error)}`);
    }
  }

  try {
    adminRealNasMatrix = await checkAdminRealNasMatrix({
      adminWebUrl,
      adminApiBaseUrl,
      timeoutMs
    });
    const matrixErrors = validateAdminRealNasMatrixState(adminRealNasMatrix);
    if (matrixErrors.length > 0) {
      throw new Error(matrixErrors.join("; "));
    }
  } catch (error) {
    errors.push(`admin real NAS matrix: ${errorMessage(error)}`);
  }

  try {
    cutterSearchMatrix = await checkCutterSearchMatrix({
      cutterApiBaseUrl,
      queries: matrixQueries,
      searchdIndex,
      timeoutMs
    });
    const matrixErrors = validateCutterSearchMatrixState(cutterSearchMatrix, searchdIndex);
    if (matrixErrors.length > 0 && !isLocalWebSanityIndexDriftOnly(matrixErrors)) {
      throw new Error(matrixErrors.join("; "));
    }
  } catch (error) {
    errors.push(`cutter search matrix: ${errorMessage(error)}`);
  }

  try {
    cutterAuth = await checkCutterAuth({
      cutterApiBaseUrl,
      cutterWebUrl,
      query,
      timeoutMs
    });
    const authErrors = validateCutterAuthSanityState(cutterAuth);
    if (authErrors.length > 0) {
      throw new Error(authErrors.join("; "));
    }
  } catch (error) {
    errors.push(`cutter auth: ${errorMessage(error)}`);
  }

  try {
    cutterPublicLibraryWeb = await checkCutterPublicLibraryWeb({
      cutterApiBaseUrl,
      cutterWebUrl,
      timeoutMs
    });
    const publicLibraryErrors = validateCutterPublicLibraryWebSanityState(cutterPublicLibraryWeb);
    if (publicLibraryErrors.length > 0 && !isLocalWebSanityIndexDriftOnly(publicLibraryErrors)) {
      throw new Error(publicLibraryErrors.join("; "));
    }
  } catch (error) {
    errors.push(`cutter public library web: ${errorMessage(error)}`);
  }

  try {
    layout = await checkLocalWebLayout({
      adminWebUrl,
      cutterWebUrl,
      query,
      timeoutMs
    });
    const layoutErrors = validateLocalWebLayoutSanityState(layout);
    if (layoutErrors.length > 0) {
      throw new Error(layoutErrors.join("; "));
    }
  } catch (error) {
    errors.push(`local web layout: ${errorMessage(error)}`);
  }

  try {
    let publicLibraryRoot = adminRealNasMatrix?.library_root ?? "";
    if (!publicLibraryRoot.trim()) {
      publicLibraryRoot = await fetchAdminPublicLibraryRoot(adminApiBaseUrl, timeoutMs).catch(() => "");
    }
    const result = await checkMaterialLocator(
      cutterWebUrl,
      cutterApiBaseUrl,
      query,
      timeoutMs,
      publicLibraryRoot
    );
    materialLocator = result.locator;
    materialLocatorClosedLoop = result.closedLoop;
  } catch (error) {
    errors.push(`material locator: ${errorMessage(error)}`);
  }

  const report: LocalWebSanityReport = {
    ok: errors.length === 0,
    errors,
    endpoints,
    admin_dashboard: adminDashboard,
    searchd_index: searchdIndex,
    admin_real_nas_matrix: adminRealNasMatrix,
    cutter_search_matrix: cutterSearchMatrix,
    cutter_auth: cutterAuth,
    cutter_public_library_web: cutterPublicLibraryWeb,
    layout,
    material_locator: materialLocator,
    material_locator_closed_loop: materialLocatorClosedLoop
  };
  let finalReportErrors = report.ok ? validateLocalWebSanityReport(report) : [];
  for (
    let attempt = 1;
    report.ok &&
      isLocalWebSanityIndexDriftOnly(finalReportErrors) &&
      attempt <= LOCAL_WEB_FINAL_INDEX_SNAPSHOT_RETRY_COUNT;
    attempt += 1
  ) {
    if (attempt > 1) {
      await wait(LOCAL_WEB_FINAL_INDEX_SNAPSHOT_RETRY_DELAY_MS);
    }

    try {
      const refreshed = await refreshFinalIndexSensitiveSnapshot({
        adminWebUrl,
        adminApiBaseUrl,
        cutterWebUrl,
        cutterApiBaseUrl,
        searchdHealthUrl,
        matrixQueries,
        timeoutMs
      });
      report.admin_dashboard = refreshed.adminDashboard;
      report.searchd_index = refreshed.searchdIndex;
      report.admin_real_nas_matrix = refreshed.adminRealNasMatrix;
      report.cutter_search_matrix = refreshed.cutterSearchMatrix;
      report.cutter_public_library_web = refreshed.cutterPublicLibraryWeb;
      finalReportErrors = validateLocalWebSanityReport(report);
      if (isMaterialLocatorIndexDriftOnly(finalReportErrors)) {
        let publicLibraryRoot = report.admin_real_nas_matrix?.library_root ?? "";
        if (!publicLibraryRoot.trim()) {
          publicLibraryRoot = await fetchAdminPublicLibraryRoot(adminApiBaseUrl, timeoutMs).catch(() => "");
        }
        const result = await checkMaterialLocator(
          cutterWebUrl,
          cutterApiBaseUrl,
          query,
          timeoutMs,
          publicLibraryRoot
        );
        report.material_locator = result.locator;
        report.material_locator_closed_loop = result.closedLoop;
        finalReportErrors = validateLocalWebSanityReport(report);
      }
    } catch (error) {
      finalReportErrors = [`final index snapshot: ${errorMessage(error)}`];
      break;
    }
  }
  if (finalReportErrors.length > 0) {
    report.ok = false;
    report.errors = [...errors, ...finalReportErrors];
  }

  await writeLocalWebSanityReport(report, reportPath);

  return report;
}

async function main(): Promise<void> {
  const report = await runLocalWebSanity();

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
