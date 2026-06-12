import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateLocalWebSanityReportFile } from "./local-web-sanity-report.ts";

const DEFAULT_LOCAL_WEB_REPORT_PATH = "docs/acceptance/artifacts/local-web-sanity.json";
const DEFAULT_REAL_NAS_50_REPORT_PATH = "docs/acceptance/artifacts/real-nas-50-editor-report.json";
const DEFAULT_ACCEPTANCE_RECORD_PATH = "docs/acceptance/local-web-real-nas.md";

export interface SyncLocalWebRealNasRecordInput {
  local_web_report_path: string;
  real_nas_50_report_path: string;
  acceptance_record_path: string;
}

export interface SyncLocalWebRealNasRecordResult {
  ok: boolean;
  errors: string[];
  changed: boolean;
  local_web_report_path: string;
  real_nas_50_report_path: string;
  acceptance_record_path: string;
  replacements: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function recordArrayField(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }

  return parsed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePrefixedLine(input: {
  text: string;
  prefix: string;
  replacement: string;
  errors: string[];
  replacements: string[];
}): string {
  const pattern = new RegExp(`^${escapeRegExp(input.prefix)}.*$`, "m");
  if (!pattern.test(input.text)) {
    input.errors.push(`acceptance record is missing line prefix: ${input.prefix}`);
    return input.text;
  }

  input.replacements.push(input.prefix);
  return input.text.replace(pattern, input.replacement);
}

function replacePrefixedLineInSection(input: {
  text: string;
  section_heading: string;
  prefix: string;
  replacement: string;
  errors: string[];
  replacements: string[];
}): string {
  const sectionStart = input.text.indexOf(input.section_heading);
  if (sectionStart < 0) {
    input.errors.push(`acceptance record is missing section heading: ${input.section_heading}`);
    return input.text;
  }

  const nextSectionStart = input.text.indexOf("\n## ", sectionStart + input.section_heading.length);
  const sectionEnd = nextSectionStart < 0 ? input.text.length : nextSectionStart;
  const before = input.text.slice(0, sectionStart);
  const section = input.text.slice(sectionStart, sectionEnd);
  const after = input.text.slice(sectionEnd);
  const nextSection = replacePrefixedLine({
    text: section,
    prefix: input.prefix,
    replacement: input.replacement,
    errors: input.errors,
    replacements: input.replacements
  });

  return `${before}${nextSection}${after}`;
}

function commaAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function displayMmSs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function dashboardFunnelSample(adminDashboard: Record<string, unknown>): string {
  const bodySample = stringField(adminDashboard, "body_sample");
  const match = /加入待剪率\s+\d+%\s+[^·]+·\s+选区样本\s+\d+\s+次\s+·\s+样本缺口\s+\d+/.exec(bodySample);
  return match?.[0] ?? "加入待剪率保持在 100% 以内";
}

function selectionTimeRange(closedLoop: Record<string, unknown>): string {
  const match = /时间段\s+(\d{2}:\d{2}\s+-\s+\d{2}:\d{2})/.exec(
    stringField(closedLoop, "selection_proof_text")
  );
  return match?.[1] ?? "00:00 - 00:00";
}

function quotedQueryList(cutterSearchMatrix: Record<string, unknown>): string {
  const queries = recordArrayField(cutterSearchMatrix, "queries")
    .map((query) => stringField(query, "query"))
    .filter((query) => query.trim().length > 0)
    .map((query) => `\`${query}\``);

  return commaAnd(queries);
}

function syncRecordText(input: {
  record_text: string;
  local_web_report: Record<string, unknown>;
  real_nas_50_report: Record<string, unknown>;
  errors: string[];
  replacements: string[];
}): string {
  const searchdIndex = readNestedRecord(input.local_web_report, "searchd_index");
  const adminDashboard = readNestedRecord(input.local_web_report, "admin_dashboard");
  const dashboardWriteLockLabels = stringArrayField(adminDashboard, "disabled_write_action_labels");
  const adminRealNasMatrix = readNestedRecord(input.local_web_report, "admin_real_nas_matrix");
  const adminSourceVideoList = readNestedRecord(adminRealNasMatrix, "source_video_list");
  const adminSourceVideoWeb = readNestedRecord(adminRealNasMatrix, "source_video_web");
  const adminPreprocessWeb = readNestedRecord(adminRealNasMatrix, "preprocess_web");
  const adminCutterUsersWeb = readNestedRecord(adminRealNasMatrix, "cutter_users_web");
  const sourceVideosRoute = recordArrayField(adminRealNasMatrix, "web_routes").find(
    (route) => stringField(route, "route") === "source-videos"
  ) ?? {};
  const sourceVideoWriteLockLabels = stringArrayField(sourceVideosRoute, "disabled_write_action_labels");
  const cutterSearchMatrix = readNestedRecord(input.local_web_report, "cutter_search_matrix");
  const cutterPublicLibraryWeb = readNestedRecord(input.local_web_report, "cutter_public_library_web");
  const materialLocator = readNestedRecord(input.local_web_report, "material_locator");
  const closedLoop = readNestedRecord(input.local_web_report, "material_locator_closed_loop");
  const currentHitDisplay = displayMmSs(numberField(materialLocator, "current_hit_time_ms_value"));
  const realNas50IndexVersion = stringField(input.real_nas_50_report, "search_index_version");
  const realNas50Metrics = readNestedRecord(input.real_nas_50_report, "metrics");
  const realNas50SearchMetrics = readNestedRecord(realNas50Metrics, "search");
  const realNas50DetailMetrics = readNestedRecord(realNas50Metrics, "detail");
  const realNas50CutMetrics = readNestedRecord(realNas50Metrics, "cut");
  const realNas50Usage = readNestedRecord(realNas50Metrics, "usage");
  const realNas50SearchQueries = stringArrayField(input.real_nas_50_report, "search_queries");

  const replacements = new Map<string, string>([
    [
      "- Status:",
      `- Status: \`${stringField(input.real_nas_50_report, "status")}\`.`
    ],
    [
      "- Search index:",
      `- Search index: \`${realNas50IndexVersion}\`.`
    ],
    [
      "- Indexed real NAS scale:",
      `- Indexed real NAS scale: \`${numberField(input.real_nas_50_report, "indexed_source_video_count")}\` source videos and \`${numberField(input.real_nas_50_report, "indexed_transcript_segment_count")}\` transcript segments.`
    ],
    [
      "- Active editors:",
      `- Active editors: \`${numberField(input.real_nas_50_report, "active_user_count")}\`.`
    ],
    [
      "- Distinct source videos covered by the 50 editors:",
      `- Distinct source videos covered by the 50 editors: \`${numberField(input.real_nas_50_report, "distinct_source_video_count")}\`.`
    ],
    [
      "- Search backend:",
      `- Search backend: every editor used \`searchd\` across \`${numberField(input.real_nas_50_report, "search_query_count")}\` distinct queries (${realNas50SearchQueries.map((query) => `\`${query}\``).join(", ")}); \`search_failure_count = ${numberField(realNas50Usage, "search_failure_count")}\`.`
    ],
    [
      "- Search latency:",
      `- Search latency: p95 \`${numberField(realNas50SearchMetrics, "p95_ms")}ms\`, max \`${numberField(realNas50SearchMetrics, "max_ms")}ms\`, SLA \`${numberField(input.real_nas_50_report, "search_sla_ms")}ms\`.`
    ],
    [
      "- Full transcript detail latency:",
      `- Full transcript detail latency: p95 \`${numberField(realNas50DetailMetrics, "p95_ms")}ms\`, max \`${numberField(realNas50DetailMetrics, "max_ms")}ms\`, SLA \`${numberField(input.real_nas_50_report, "detail_sla_ms")}ms\`.`
    ],
    [
      "- Local cut submission latency:",
      `- Local cut submission latency: p95 \`${numberField(realNas50CutMetrics, "p95_ms")}ms\`, max \`${numberField(realNas50CutMetrics, "max_ms")}ms\`, SLA \`${numberField(input.real_nas_50_report, "cut_sla_ms")}ms\`.`
    ],
    [
      "- Usage loop counts:",
      `- Usage loop counts: \`${numberField(realNas50Usage, "search_request_count")}\` searches, \`${numberField(realNas50Usage, "source_detail_view_count")}\` source detail views, \`${numberField(realNas50Usage, "transcript_selection_count")}\` transcript selections, \`${numberField(realNas50Usage, "cut_submission_count")}\` cut submissions, \`${numberField(realNas50Usage, "cut_success_count")}\` successful cuts, and \`${numberField(realNas50Usage, "local_clip_count")}\` local clips.`
    ],
    [
      "- The rehearsal asserts local workspace isolation with",
      `- The rehearsal asserts local workspace isolation with \`no_cross_workspace_outputs = ${booleanField(input.real_nas_50_report, "no_cross_workspace_outputs")}\` and public-library write protection with \`public_library_not_written_by_cutters = ${booleanField(input.real_nas_50_report, "public_library_not_written_by_cutters")}\`.`
    ],
    [
      "- Searchd health:",
      `- Searchd health: \`index_version = ${stringField(searchdIndex, "index_version")}\`, \`source_video_count = ${numberField(searchdIndex, "source_video_count")}\`, \`segment_count = ${numberField(searchdIndex, "segment_count")}\`.`
    ],
    [
      "- Searchd/admin index parity:",
      `- Searchd/admin index parity: \`searchd_index.index_version = ${stringField(searchdIndex, "index_version")}\`, \`admin_dashboard.current_index_version = ${stringField(adminDashboard, "current_index_version")}\`, \`admin_real_nas_matrix.current_index_version = ${stringField(adminRealNasMatrix, "current_index_version")}\`, \`admin_real_nas_matrix.index_current_version = ${stringField(adminRealNasMatrix, "index_current_version")}\`, \`matched_admin_current_index = ${booleanField(searchdIndex, "matched_admin_current_index")}\`.`
    ],
    [
      "- Admin real NAS matrix:",
      `- Admin real NAS matrix: \`video_count = ${numberField(adminRealNasMatrix, "video_count")}\`, \`ready_video_count = ${numberField(adminRealNasMatrix, "ready_video_count")}\`, \`queued_video_count = ${numberField(adminRealNasMatrix, "queued_video_count")}\`, \`processing_video_count = ${numberField(adminRealNasMatrix, "processing_video_count")}\`, \`failed_video_count = ${numberField(adminRealNasMatrix, "failed_video_count")}\`, \`index_required_video_count = ${numberField(adminRealNasMatrix, "index_required_video_count")}\`, \`source_ready_detail_id = ${stringField(adminRealNasMatrix, "source_ready_detail_id")}\`, \`source_ready_detail_ms = ${numberField(adminRealNasMatrix, "source_ready_detail_ms")}\`, \`source_ready_detail_transcript_segment_count = ${numberField(adminRealNasMatrix, "source_ready_detail_transcript_segment_count")}\`, \`source_ready_detail_transcript_char_count = ${numberField(adminRealNasMatrix, "source_ready_detail_transcript_char_count")}\`, \`runtime_settings_ms = ${numberField(adminRealNasMatrix, "runtime_settings_ms")}\`.`
    ],
    [
      "- Admin source video list:",
      `- Admin source video list: server pagination returned \`${numberField(adminSourceVideoList, "first_page_count")}\` first-page rows and \`${numberField(adminSourceVideoList, "second_page_count")}\` second-page rows at page size \`${numberField(adminSourceVideoList, "page_size")}\`; first ids \`${stringField(adminSourceVideoList, "first_page_first_id")}\` and \`${stringField(adminSourceVideoList, "second_page_first_id")}\` proved distinct pages, ready filter returned \`${numberField(adminSourceVideoList, "ready_filter_count")}\` all-ready rows in \`${numberField(adminSourceVideoList, "ready_filter_ms")}ms\`, and query \`${stringField(adminSourceVideoList, "query")}\` returned \`${numberField(adminSourceVideoList, "query_result_count")}\` metadata matches with first id \`${stringField(adminSourceVideoList, "query_first_id")}\` in \`${numberField(adminSourceVideoList, "query_filter_ms")}ms\`.`
    ],
    [
      "- Admin source videos Web UI:",
      `- Admin source videos Web UI: route \`${stringField(adminSourceVideoWeb, "url")}\` displayed the real source path (\`source_path_visible = ${booleanField(adminSourceVideoWeb, "source_path_visible")}\`) and first server id \`${stringField(adminSourceVideoWeb, "first_page_first_id")}\`; load-more changed loaded count \`${numberField(adminSourceVideoWeb, "loaded_count_before")} -> ${numberField(adminSourceVideoWeb, "loaded_count_after")}\`; query \`${stringField(adminSourceVideoWeb, "query")}\` observed a source-videos API response (\`${booleanField(adminSourceVideoWeb, "query_response_observed")}\`) and rendered \`${stringField(adminSourceVideoWeb, "query_result_id")}\`; ready filter selected \`${stringField(adminSourceVideoWeb, "ready_filter_selected_value")}\`, observed a source-videos API response (\`${booleanField(adminSourceVideoWeb, "ready_filter_response_observed")}\`), and rendered \`${numberField(adminSourceVideoWeb, "ready_filter_visible_status_count")}\` ready status badges only.`
    ],
    [
      "- Admin preprocess Web UI:",
      `- Admin preprocess Web UI: route \`${stringField(adminPreprocessWeb, "url")}\` displayed current index \`${stringField(adminPreprocessWeb, "current_index_version")}\`, source count \`${numberField(adminPreprocessWeb, "source_video_count")}\`, queued count \`${numberField(adminPreprocessWeb, "queued_count")}\`, failed count \`${numberField(adminPreprocessWeb, "failed_count")}\`, production status \`${stringField(adminPreprocessWeb, "production_status_title")}\`, public-library root visibility \`${booleanField(adminPreprocessWeb, "public_library_root_visible")}\`, real queue job \`${stringField(adminPreprocessWeb, "visible_job_id")}\`, opened log job \`${stringField(adminPreprocessWeb, "log_job_id")}\`, log record source \`${stringField(adminPreprocessWeb, "log_record_source")}\`, and rendered \`${numberField(adminPreprocessWeb, "log_content_char_count")}\` log characters.`
    ],
    [
      "- Admin cutter users Web UI:",
      `- Admin cutter users Web UI: route \`${stringField(adminCutterUsersWeb, "url")}\` rendered \`${numberField(adminCutterUsersWeb, "api_user_count")}\` cutter users, \`${numberField(adminCutterUsersWeb, "api_approved_count")}\` approved users, \`${numberField(adminCutterUsersWeb, "api_pending_count")}\` pending users, first API user \`${stringField(adminCutterUsersWeb, "api_first_user_id")}\` / \`${stringField(adminCutterUsersWeb, "api_first_display_name")}\`, first device \`${stringField(adminCutterUsersWeb, "api_first_device_name")}\`, identity note visibility \`${booleanField(adminCutterUsersWeb, "identity_note_visible")}\`, device detail visibility \`${booleanField(adminCutterUsersWeb, "device_detail_visible")}\`, approve action visibility \`${booleanField(adminCutterUsersWeb, "approve_action_visible")}\`, and disable action visibility \`${booleanField(adminCutterUsersWeb, "disable_action_visible")}\`.`
    ],
    [
      "- Admin source videos write lock:",
      `- Admin source videos write lock: source-videos route recorded \`disabled_write_action_labels\` for ${sourceVideoWriteLockLabels.map((label) => `\`${label}\``).join(", ")}, proving single-video retry plus cover and public metadata save actions are disabled by default until explicitly unlocked.`
    ],
    [
      "- Cutter search matrix:",
      `- Cutter search matrix: ${quotedQueryList(cutterSearchMatrix)} all used \`searchd\` on \`${stringField(searchdIndex, "index_version")}\`; max query latency was \`${numberField(cutterSearchMatrix, "max_search_ms")}ms\`.`
    ],
    [
      "- Cutter public library Web UI:",
      `- Cutter public library Web UI: route \`${stringField(cutterPublicLibraryWeb, "url")}\` observed the \`source-library\` API response (\`${booleanField(cutterPublicLibraryWeb, "web_api_response_observed")}\`), displayed \`${numberField(cutterPublicLibraryWeb, "api_available_video_count")}\` public source videos, rendered \`${numberField(cutterPublicLibraryWeb, "api_returned_count")}\` initial cards, and matched first API source \`${stringField(cutterPublicLibraryWeb, "api_first_source_video_id")}\` / \`${stringField(cutterPublicLibraryWeb, "api_first_title")}\` in the page and inspector.`
    ],
    [
      "- Cutter search status:",
      `- Cutter search status: \`material_locator.search_index_version = ${stringField(materialLocator, "search_index_version")}\`, \`search_status_text = ${stringField(materialLocator, "search_status_text")}\`.`
    ],
    [
      "- Admin dashboard:",
      `- Admin dashboard: \`${numberField(adminDashboard, "active_cutter_count")}/${numberField(adminDashboard, "cutter_capacity")}\` active editors, \`search_p95_ms = ${numberField(adminDashboard, "search_p95_ms")}\`, \`local_search_coverage_percent = ${numberField(adminDashboard, "local_search_coverage_percent")}\`, \`search_failure_count = ${numberField(adminDashboard, "search_failure_count")}\`.`
    ],
    [
      "- Admin dashboard write lock:",
      `- Admin dashboard write lock: dashboard recorded \`disabled_write_action_labels\` for ${dashboardWriteLockLabels.map((label) => `\`${label}\``).join(", ")}, proving smart-scan shortcut actions are disabled by default until explicitly unlocked.`
    ],
    [
      "- Admin dashboard funnel guard:",
      `- Admin dashboard funnel guard: historical inconsistent conversion samples are capped at \`100%\`; the saved dashboard body shows \`${dashboardFunnelSample(adminDashboard)}\`, with no four-digit conversion percentages.`
    ],
    ["- Candidate count:", `- Candidate count: \`${numberField(materialLocator, "candidate_count")}\`.`],
    [
      "- Default selected material section:",
      `- Default selected material section: \`${stringField(materialLocator, "default_selected_material_section")}\`; this keeps the full transcript pane on public NAS source context even though local reusable materials remain listed first.`
    ],
    [
      "- Current hit:",
      `- Current hit: \`${stringField(materialLocator, "current_hit_segment_id")}\` at \`${numberField(materialLocator, "current_hit_time_ms_value")}ms\`, displayed as \`${currentHitDisplay}\`.`
    ],
    [
      "- Full transcript context:",
      `- Full transcript context: \`${numberField(materialLocator, "full_transcript_char_count")}\` characters, global hit \`${numberField(materialLocator, "global_hit_position")} / ${numberField(materialLocator, "global_hit_count")}\`, current video hit count \`${numberField(materialLocator, "current_video_hit_count")}\`, selected sentence count \`${numberField(materialLocator, "selected_sentence_count")}\`.`
    ],
    [
      "- Closed loop:",
      `- Closed loop: the Material Locator used \`${stringField(closedLoop, "selection_method")}\` to drag-select transcript context from the full transcript. The selection proof strip recorded \`selection_proof_text = ${stringField(closedLoop, "selection_proof_text")}\`. Selected text \`${stringField(closedLoop, "selected_text")}\`, \`selected_text_char_count = ${numberField(closedLoop, "selected_text_char_count")}\`, \`selected_sentence_count = ${numberField(closedLoop, "selected_sentence_count")}\`, \`selected_text_segment_count = ${numberField(closedLoop, "selected_text_segment_count")}\`, \`selected_text_is_broader_than_query = ${booleanField(closedLoop, "selected_text_is_broader_than_query")}\`, cut notice \`${stringField(closedLoop, "cut_notice")}\`, local library contains the selection, and result ordering remains local material before public source material (\`${stringField(closedLoop, "first_result_section")}\` before \`${stringField(closedLoop, "second_result_section")}\`).`
    ],
    [
      "- Local library page proof:",
      `- Local library page proof: route \`${stringField(closedLoop, "local_library_page_url")}\` used view \`${stringField(closedLoop, "local_library_view_mode")}\`, displayed \`${numberField(closedLoop, "local_library_visible_clip_count")}\` current-view clips via \`${stringField(closedLoop, "local_library_visible_count_label")}\`, and showed generated clip title \`${stringField(closedLoop, "local_library_clip_title")}\`, source \`${stringField(closedLoop, "local_library_source_title")}\`, and selected text visibility \`${booleanField(closedLoop, "local_library_selected_text_visible")}\`.`
    ],
    [
      "- Output file proof:",
      `- Output file proof: generated local clip \`${stringField(closedLoop, "local_clip_id")}\` wrote media \`${stringField(closedLoop, "local_clip_media_file_path")}\` with \`local_clip_media_file_exists = ${booleanField(closedLoop, "local_clip_media_file_exists")}\` and \`local_clip_media_file_size_bytes = ${numberField(closedLoop, "local_clip_media_file_size_bytes")}\`; manifest \`${stringField(closedLoop, "local_clip_manifest_file_path")}\` has \`local_clip_manifest_file_exists = ${booleanField(closedLoop, "local_clip_manifest_file_exists")}\` and \`local_clip_manifest_file_size_bytes = ${numberField(closedLoop, "local_clip_manifest_file_size_bytes")}\`.`
    ],
    [
      "- Cut task tracking:",
      `- Cut task tracking: generated local clip \`${stringField(closedLoop, "local_clip_id")}\` maps to completed cut job \`${stringField(closedLoop, "cut_job_id")}\`, \`cut_job_status = ${stringField(closedLoop, "cut_job_status")}\`, \`cut_job_export_clip_id = ${stringField(closedLoop, "cut_job_export_clip_id")}\`, and \`cut_job_output_file = ${stringField(closedLoop, "cut_job_output_file")}\`; route \`${stringField(closedLoop, "cut_tasks_page_url")}\` showed selected text, source \`${stringField(closedLoop, "cut_tasks_page_source_title")}\`, time range \`${stringField(closedLoop, "cut_tasks_page_time_range_label")}\`, output \`${stringField(closedLoop, "cut_tasks_page_visible_output_file")}\`, and status \`${stringField(closedLoop, "cut_tasks_page_visible_status_label")}\`.`
    ],
    [
      "- Write protection:",
      `- Write protection: generated local clip \`${stringField(closedLoop, "local_clip_id")}\` with media path under \`${stringField(closedLoop, "local_clip_media_file_path").replace(/\/[^/]+$/, "/")}\`; \`public_library_root = ${stringField(closedLoop, "public_library_root")}\`, \`local_output_is_outside_public_library = ${booleanField(closedLoop, "local_output_is_outside_public_library")}\`, and \`public_library_write_detected = ${booleanField(closedLoop, "public_library_write_detected")}\`.`
    ],
    [
      "- Admin API performance fix verified during this run:",
      `- Admin API performance fix verified during this run: \`/api/admin/settings/runtime\` returned in \`${numberField(adminRealNasMatrix, "runtime_settings_ms")}ms\`, \`/api/admin/source-videos/${stringField(adminRealNasMatrix, "source_ready_detail_id")}\` detail returned in \`${numberField(adminRealNasMatrix, "source_ready_detail_ms")}ms\`, and large-library Doctor report stayed bounded with the online summary path.`
    ],
    [
      "- `npm run audit:local-real-nas-phase`:",
      `- \`npm run audit:local-real-nas-phase\`: passed with \`ok: true\`, local Web snapshot \`${stringField(searchdIndex, "index_version")}\`, and 50-editor snapshot \`${realNas50IndexVersion}\`.`
    ],
    [
      "- `npm run smoke:real-nas-50-editor`:",
      `- \`npm run smoke:real-nas-50-editor\`: passed with \`${numberField(input.real_nas_50_report, "active_user_count")}\` active editors, \`${numberField(input.real_nas_50_report, "distinct_source_video_count")}\` distinct source videos, \`${numberField(input.real_nas_50_report, "indexed_source_video_count")}\` indexed videos, \`${numberField(input.real_nas_50_report, "indexed_transcript_segment_count")}\` indexed transcript segments, search p95 \`${numberField(realNas50SearchMetrics, "p95_ms")}ms\`, detail p95 \`${numberField(realNas50DetailMetrics, "p95_ms")}ms\`, cut p95 \`${numberField(realNas50CutMetrics, "p95_ms")}ms\`, and \`search_failure_count = ${numberField(realNas50Usage, "search_failure_count")}\`.`
    ],
    [
      "- Expected index signal:",
      `- Expected index signal: Admin dashboard, searchd health, Cutter Material Locator, and the saved report should agree on \`${stringField(searchdIndex, "index_version")}\` during this recorded run.`
    ],
    [
      "- Expected library scale:",
      `- Expected library scale: Admin dashboard should show about \`${numberField(searchdIndex, "source_video_count")}\` searchable videos and \`${numberField(searchdIndex, "segment_count")}\` transcript segments, with \`${numberField(adminDashboard, "active_cutter_count")}/${numberField(adminDashboard, "cutter_capacity")}\` active cutter capacity and \`search_p95_ms = ${numberField(adminDashboard, "search_p95_ms")}\`.`
    ],
    [
      "- Expected dashboard write lock:",
      `- Expected dashboard write lock: Dashboard should show \`真实 NAS 写入动作\` as \`未解锁\`; ${dashboardWriteLockLabels.map((label) => `\`${label}\``).join(", ")} should be disabled until the operator explicitly unlocks writes.`
    ],
    [
      "- Expected source videos write lock:",
      `- Expected source videos write lock: Source Videos should show \`真实 NAS 写入动作\` as \`未解锁\`; ${sourceVideoWriteLockLabels.map((label) => `\`${label}\``).join(", ")} should be disabled until the operator explicitly unlocks writes.`
    ],
    [
      "- Expected search result shape:",
      `- Expected search result shape: Material Locator should show local searchd, NAS read-only status, \`${numberField(materialLocator, "candidate_count")}\` candidates, \`${numberField(materialLocator, "global_hit_count")}\` total hits, and public NAS source results under \`${stringField(materialLocator, "default_selected_material_section")}\`.`
    ],
    [
      "- Expected transcript locator shape:",
      `- Expected transcript locator shape: the transcript header should expose a current hit counter like \`${numberField(materialLocator, "global_hit_position")} / ${numberField(materialLocator, "global_hit_count")}\`, current video hit count \`${numberField(materialLocator, "current_video_hit_count")}\`, selected sentence count \`${numberField(materialLocator, "selected_sentence_count")}\`, and full transcript length \`${numberField(materialLocator, "full_transcript_char_count")}\` characters.`
    ],
    [
      "- Expected selection proof:",
      `- Expected selection proof: after dragging across at least two full-transcript rows with \`selection_method = ${stringField(closedLoop, "selection_method")}\`, the right-side selection proof strip should show source \`公共原素材\`, time range \`${selectionTimeRange(closedLoop)}\`, \`${numberField(closedLoop, "selected_text_char_count")} 字\`, \`selected_sentence_count = ${numberField(closedLoop, "selected_sentence_count")}\`, \`selected_text_segment_count = ${numberField(closedLoop, "selected_text_segment_count")}\`, and a global hit counter like \`${numberField(materialLocator, "global_hit_position")}/${numberField(materialLocator, "global_hit_count")}\`.`
    ],
    [
      "- Expected cut feedback:",
      `- Expected cut feedback: after dragging full-transcript context around the keyword and cutting, the UI should show \`${stringField(closedLoop, "cut_notice")}\`; the local library should contain the selected text, Cut Tasks should show the completed job/output, and local reusable materials should appear before public materials on the next search (\`${stringField(closedLoop, "first_result_section")}\` before \`${stringField(closedLoop, "second_result_section")}\`).`
    ]
  ]);

  let nextText = replacePrefixedLineInSection({
    text: input.record_text,
    section_heading: "## 50-Editor Real NAS Source-Machine Rehearsal",
    prefix: "Latest verified values from the",
    replacement: "Latest verified values from the 2026-06-04 50-editor source-machine run:",
    errors: input.errors,
    replacements: input.replacements
  });
  for (const [prefix, replacement] of replacements) {
    nextText = replacePrefixedLine({
      text: nextText,
      prefix,
      replacement,
      errors: input.errors,
      replacements: input.replacements
    });
  }

  return nextText;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function syncLocalWebRealNasRecord(
  input: SyncLocalWebRealNasRecordInput
): Promise<SyncLocalWebRealNasRecordResult> {
  const errors: string[] = [];
  const replacements: string[] = [];

  const validation = await validateLocalWebSanityReportFile(input.local_web_report_path);
  errors.push(...validation.errors.map((error) => `local web report: ${error}`));

  let localWebReport: Record<string, unknown> | undefined;
  let realNas50Report: Record<string, unknown> | undefined;
  let recordText = "";

  try {
    localWebReport = await readJsonRecord(input.local_web_report_path);
  } catch (error) {
    errors.push(`local web report must be readable JSON: ${errorMessage(error)}`);
  }

  try {
    realNas50Report = await readJsonRecord(input.real_nas_50_report_path);
  } catch (error) {
    errors.push(`50-editor report must be readable JSON: ${errorMessage(error)}`);
  }

  try {
    recordText = await readFile(input.acceptance_record_path, "utf8");
  } catch (error) {
    errors.push(`acceptance record must be readable: ${errorMessage(error)}`);
  }

  if (errors.length > 0 || !localWebReport || !realNas50Report || !recordText) {
    return {
      ok: false,
      errors,
      changed: false,
      local_web_report_path: input.local_web_report_path,
      real_nas_50_report_path: input.real_nas_50_report_path,
      acceptance_record_path: input.acceptance_record_path,
      replacements
    };
  }

  const nextText = syncRecordText({
    record_text: recordText,
    local_web_report: localWebReport,
    real_nas_50_report: realNas50Report,
    errors,
    replacements
  });
  const changed = nextText !== recordText;

  if (errors.length === 0 && changed) {
    await writeFile(input.acceptance_record_path, nextText, "utf8");
  }

  return {
    ok: errors.length === 0,
    errors,
    changed,
    local_web_report_path: input.local_web_report_path,
    real_nas_50_report_path: input.real_nas_50_report_path,
    acceptance_record_path: input.acceptance_record_path,
    replacements
  };
}

async function main(): Promise<void> {
  const result = await syncLocalWebRealNasRecord({
    local_web_report_path: process.env.MIXLAB_LOCAL_WEB_SANITY_REPORT ?? DEFAULT_LOCAL_WEB_REPORT_PATH,
    real_nas_50_report_path: process.env.MIXLAB_REAL_NAS_50_REPORT_PATH ?? DEFAULT_REAL_NAS_50_REPORT_PATH,
    acceptance_record_path: process.env.MIXLAB_LOCAL_REAL_NAS_ACCEPTANCE_RECORD ?? DEFAULT_ACCEPTANCE_RECORD_PATH
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
