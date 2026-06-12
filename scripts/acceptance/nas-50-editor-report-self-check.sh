#!/bin/sh
set -eu

REPORT_PATH="${1:-./captures/50-editor-report.json}"

if [ ! -f "$REPORT_PATH" ]; then
  echo "50-editor report is missing: $REPORT_PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required for this read-only 50-editor report self-check." >&2
  exit 2
fi

node - "$REPORT_PATH" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const reportPath = process.argv[2];
const issues = [];
const minimumDistinctSearchQueryCount = 5;
const sha256Pattern = /^[a-f0-9]{64}$/i;
const forbiddenPrivateFieldNames = new Set([
  "api_key",
  "authorization",
  "bearer_token",
  "dashscope_api_key",
  "full_text",
  "pasted_search_text",
  "raw_transcript",
  "signed_url",
  "transcript_text"
]);
const forbiddenPrivateTextPatterns = [
  /DASHSCOPE_API_KEY/i,
  /Authorization:\s*Bearer\s+\S+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{8,}/i,
  /signature=/i,
  /x-oss-signature/i,
  /pasted_search_text/i
];

function issue(message) {
  issues.push(message);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value) {
  return finiteNumber(value) && value > 0;
}

function integer(value) {
  return Number.isInteger(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function requireSha256(value, label) {
  if (!nonEmptyString(value) || !sha256Pattern.test(value)) {
    issue(label + " must be a 64-character sha256 hex digest");
  }
}

function portableRelativePath(value) {
  return nonEmptyString(value) &&
    !path.isAbsolute(value) &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !value.includes("\\") &&
    !value.split("/").includes("..");
}

function metricTiming(report, sessions, name, sessionField, slaField, sessionCount) {
  const metric = report.metrics && report.metrics[name];
  const sla = report[slaField];
  if (!positiveNumber(sla) || sla > 1500) {
    issue(slaField + " must be positive and no higher than 1500");
  }
  if (!metric || typeof metric !== "object") {
    issue("metrics." + name + " is missing");
    return;
  }
  if (metric.count !== sessionCount) {
    issue("metrics." + name + ".count must equal editor_sessions.length");
  }
  for (const field of ["min_ms", "p50_ms", "p95_ms", "max_ms"]) {
    if (!finiteNumber(metric[field])) issue("metrics." + name + "." + field + " must be finite");
  }
  if (
    finiteNumber(metric.min_ms) &&
    finiteNumber(metric.p50_ms) &&
    finiteNumber(metric.p95_ms) &&
    finiteNumber(metric.max_ms) &&
    !(metric.min_ms <= metric.p50_ms && metric.p50_ms <= metric.p95_ms && metric.p95_ms <= metric.max_ms)
  ) {
    issue("metrics." + name + " must satisfy min_ms <= p50_ms <= p95_ms <= max_ms");
  }
  if (finiteNumber(metric.p95_ms) && positiveNumber(sla) && metric.p95_ms > sla) {
    issue("metrics." + name + ".p95_ms must be no higher than " + slaField);
  }
  const observedMax = Math.max(
    ...sessions
      .map((session) => session && typeof session === "object" && !Array.isArray(session) ? Number(session[sessionField]) : NaN)
      .filter(finiteNumber)
  );
  if (finiteNumber(metric.max_ms) && finiteNumber(observedMax) && metric.max_ms < observedMax) {
    issue("metrics." + name + ".max_ms must be at least the maximum per-editor " + sessionField);
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issue("50-editor report must parse as JSON: " + error.message);
    return undefined;
  }
}

function scanForbiddenPrivateData(value, label) {
  if (typeof value === "string") {
    for (const pattern of forbiddenPrivateTextPatterns) {
      if (pattern.test(value)) {
        issue(label + " must not include forbidden secret/private marker");
        return;
      }
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbiddenPrivateData(entry, label + "[" + index + "]"));
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const keyLabel = label + "." + key;
    if (forbiddenPrivateFieldNames.has(key.toLowerCase())) {
      issue(keyLabel + " must not include forbidden private transcript, secret, or signed URL field");
    }
    scanForbiddenPrivateData(entry, keyLabel);
  }
}

const report = readJson(reportPath);
if (!report) process.exit(1);
scanForbiddenPrivateData(report, "report");

const sessions = Array.isArray(report.editor_sessions) ? report.editor_sessions : [];
const sessionCount = sessions.length;

if (report.status !== "passed") issue('status must be "passed"');
if (sessionCount < 50) issue("editor_sessions must include at least 50 rows");
if (report.editor_count !== sessionCount) issue("editor_count must equal editor_sessions.length");
if (report.active_user_count !== sessionCount) issue("active_user_count must equal editor_sessions.length");

if (!nonEmptyString(report.search_index_version)) issue("search_index_version must be non-empty");
if (report.searchd_health_index_version !== report.search_index_version) {
  issue("searchd_health_index_version must equal search_index_version");
}
if (!integer(report.indexed_source_video_count) || report.indexed_source_video_count < 2000) {
  issue("indexed_source_video_count must be at least 2000");
}
if (!integer(report.indexed_transcript_segment_count) || report.indexed_transcript_segment_count < 48000) {
  issue("indexed_transcript_segment_count must be at least 48000");
}
if (report.searchd_health_source_video_count !== report.indexed_source_video_count) {
  issue("searchd_health_source_video_count must equal indexed_source_video_count");
}
if (report.searchd_health_segment_count !== report.indexed_transcript_segment_count) {
  issue("searchd_health_segment_count must equal indexed_transcript_segment_count");
}

for (const flag of [
  "all_searches_passed",
  "all_cuts_written_to_local_workspaces",
  "public_library_not_written_by_cutters",
  "no_cross_workspace_outputs"
]) {
  if (report[flag] !== true) issue(flag + " must be true");
}

for (const forbidden of ["library_root", "workspace_root", "searchd_cache_root"]) {
  if (Object.prototype.hasOwnProperty.call(report, forbidden)) {
    issue("report must not include target run root field " + forbidden);
  }
}

const uniqueUserIds = new Set();
const uniqueWorkspaceIds = new Set();
const uniqueSourceVideoIds = new Set();
const uniqueSearchQueries = new Set();

sessions.forEach((session, index) => {
  const label = "editor_sessions[" + index + "]";

  if (!session || typeof session !== "object" || Array.isArray(session)) {
    issue(label + " must be an object");
    return;
  }

  for (const field of [
    "user_id",
    "username",
    "workspace_id",
    "source_video_id",
    "selected_segment_id",
    "search_query",
    "search_result_source_video_id",
    "search_result_segment_id",
    "full_transcript_source_video_id",
    "full_transcript_segment_id",
    "selected_text_sha256",
    "local_clip_id",
    "local_clip_source_video_id",
    "local_clip_selected_text_sha256",
    "local_clip_relative_path",
    "local_clip_content_sha256",
    "search_backend",
    "search_index_version"
  ]) {
    if (!nonEmptyString(session[field])) issue(label + "." + field + " must be non-empty");
  }
  if (nonEmptyString(session.user_id)) {
    if (uniqueUserIds.has(session.user_id)) issue(label + ".user_id must be unique");
    uniqueUserIds.add(session.user_id);
  }
  if (nonEmptyString(session.workspace_id)) {
    if (uniqueWorkspaceIds.has(session.workspace_id)) issue(label + ".workspace_id must be unique per editor");
    uniqueWorkspaceIds.add(session.workspace_id);
  }
  if (nonEmptyString(session.source_video_id)) uniqueSourceVideoIds.add(session.source_video_id);
  if (nonEmptyString(session.search_query)) uniqueSearchQueries.add(session.search_query.trim());
  if (session.search_backend !== "searchd") issue(label + '.search_backend must be "searchd"');
  if (session.search_index_version !== report.search_index_version) issue(label + ".search_index_version must equal report.search_index_version");
  if (session.completed_closed_loop !== true) issue(label + ".completed_closed_loop must be true");
  if (session.workspace_output_written !== true) issue(label + ".workspace_output_written must be true");
  if (session.public_library_written !== false) issue(label + ".public_library_written must be false");
  if (session.location_verified !== true) issue(label + ".location_verified must be true");
  if (session.search_result_source_video_id !== session.source_video_id) issue(label + ".search_result_source_video_id must match source_video_id");
  if (session.full_transcript_source_video_id !== session.source_video_id) issue(label + ".full_transcript_source_video_id must match source_video_id");
  if (session.local_clip_source_video_id !== session.source_video_id) issue(label + ".local_clip_source_video_id must match source_video_id");
  if (session.search_result_segment_id !== session.selected_segment_id) issue(label + ".search_result_segment_id must match selected_segment_id");
  if (session.full_transcript_segment_id !== session.selected_segment_id) issue(label + ".full_transcript_segment_id must match selected_segment_id");
  if (
    nonEmptyString(session.local_clip_selected_text_sha256) &&
    nonEmptyString(session.selected_text_sha256) &&
    session.local_clip_selected_text_sha256.toLowerCase() !== session.selected_text_sha256.toLowerCase()
  ) {
    issue(label + ".local_clip_selected_text_sha256 must equal selected_text_sha256");
  }
  if (!/^E[0-9A-Za-z_-]+$/.test(String(session.local_clip_id))) issue(label + ".local_clip_id must be a local clip id starting with E");
  if (!portableRelativePath(session.local_clip_relative_path)) issue(label + ".local_clip_relative_path must be a workspace-relative portable path");
  if (!integer(session.search_result_rank) || session.search_result_rank < 1) issue(label + ".search_result_rank must be positive");
  if (!integer(session.search_result_group_count) || session.search_result_group_count < 50) issue(label + ".search_result_group_count must be at least 50");
  if (!integer(session.search_result_limit) || session.search_result_limit < 50) issue(label + ".search_result_limit must be at least 50");
  if (integer(session.search_result_group_count) && integer(session.search_result_limit) && session.search_result_group_count < session.search_result_limit) {
    issue(label + ".search_result_group_count must be at least search_result_limit");
  }
  if (integer(session.search_result_rank) && integer(session.search_result_group_count) && session.search_result_rank > session.search_result_group_count) {
    issue(label + ".search_result_rank must be no greater than search_result_group_count");
  }
  if (!integer(session.full_transcript_segment_count) || session.full_transcript_segment_count < 4) {
    issue(label + ".full_transcript_segment_count must be at least 4");
  }
  for (const field of ["full_transcript_begin_char", "full_transcript_end_char", "full_transcript_char_count", "search_result_begin_char", "search_result_end_char", "selected_text_begin_char", "selected_text_end_char", "selected_text_char_count"]) {
    if (!integer(session[field])) issue(label + "." + field + " must be an integer");
  }
  if (integer(session.full_transcript_begin_char) && integer(session.full_transcript_end_char) && session.full_transcript_end_char <= session.full_transcript_begin_char) {
    issue(label + ".full_transcript_end_char must be greater than full_transcript_begin_char");
  }
  if (integer(session.search_result_begin_char) && integer(session.search_result_end_char) && session.search_result_end_char <= session.search_result_begin_char) {
    issue(label + ".search_result_end_char must be greater than search_result_begin_char");
  }
  if (integer(session.selected_text_begin_char) && integer(session.selected_text_end_char) && session.selected_text_end_char <= session.selected_text_begin_char) {
    issue(label + ".selected_text_end_char must be greater than selected_text_begin_char");
  }
  if (
    integer(session.full_transcript_begin_char) &&
    integer(session.full_transcript_end_char) &&
    integer(session.full_transcript_char_count) &&
    session.full_transcript_char_count !== session.full_transcript_end_char - session.full_transcript_begin_char
  ) {
    issue(label + ".full_transcript_char_count must equal full_transcript_end_char - full_transcript_begin_char");
  }
  if (
    integer(session.selected_text_begin_char) &&
    integer(session.selected_text_end_char) &&
    integer(session.selected_text_char_count) &&
    session.selected_text_char_count !== session.selected_text_end_char - session.selected_text_begin_char
  ) {
    issue(label + ".selected_text_char_count must equal selected_text_end_char - selected_text_begin_char");
  }
  if (
    integer(session.full_transcript_char_count) &&
    integer(session.selected_text_char_count) &&
    session.full_transcript_char_count <= session.selected_text_char_count
  ) {
    issue(label + ".full_transcript_char_count must be greater than selected_text_char_count");
  }
  if (
    integer(session.full_transcript_begin_char) &&
    integer(session.full_transcript_end_char) &&
    integer(session.search_result_begin_char) &&
    integer(session.search_result_end_char) &&
    !(session.full_transcript_begin_char <= session.search_result_begin_char && session.full_transcript_end_char >= session.search_result_end_char)
  ) {
    issue(label + ".search_result range must fall within full_transcript character offsets");
  }
  if (
    integer(session.full_transcript_begin_char) &&
    integer(session.full_transcript_end_char) &&
    integer(session.selected_text_begin_char) &&
    integer(session.selected_text_end_char) &&
    !(session.full_transcript_begin_char <= session.selected_text_begin_char && session.full_transcript_end_char >= session.selected_text_end_char)
  ) {
    issue(label + ".selected_text range must fall within full_transcript character offsets");
  }
  if (
    integer(session.selected_text_begin_char) &&
    integer(session.selected_text_end_char) &&
    integer(session.search_result_begin_char) &&
    integer(session.search_result_end_char) &&
    !(session.selected_text_begin_char <= session.search_result_begin_char && session.selected_text_end_char >= session.search_result_end_char)
  ) {
    issue(label + ".selected_text range must include search_result range");
  }
  if (
    integer(session.search_result_begin_char) &&
    integer(session.search_result_end_char) &&
    nonEmptyString(session.search_query) &&
    session.search_result_end_char - session.search_result_begin_char !== session.search_query.length
  ) {
    issue(label + ".search_result character range length must equal search_query length");
  }
  if (session.local_clip_begin_ms !== session.selected_begin_ms) issue(label + ".local_clip_begin_ms must equal selected_begin_ms");
  if (session.local_clip_end_ms !== session.selected_end_ms) issue(label + ".local_clip_end_ms must equal selected_end_ms");
  for (const field of ["selected_begin_ms", "selected_end_ms", "local_clip_begin_ms", "local_clip_end_ms", "local_clip_file_size_bytes"]) {
    if (!integer(session[field])) issue(label + "." + field + " must be an integer");
  }
  if (!finiteNumber(session.selected_begin_ms)) issue(label + ".selected_begin_ms must be finite");
  if (finiteNumber(session.selected_begin_ms) && session.selected_begin_ms < 0) issue(label + ".selected_begin_ms must be >= 0");
  if (!finiteNumber(session.selected_end_ms)) issue(label + ".selected_end_ms must be finite");
  if (finiteNumber(session.selected_begin_ms) && finiteNumber(session.selected_end_ms) && session.selected_end_ms <= session.selected_begin_ms) {
    issue(label + ".selected_end_ms must be greater than selected_begin_ms");
  }
  if (finiteNumber(session.local_clip_begin_ms) && session.local_clip_begin_ms < 0) issue(label + ".local_clip_begin_ms must be >= 0");
  if (finiteNumber(session.local_clip_begin_ms) && finiteNumber(session.local_clip_end_ms) && session.local_clip_end_ms <= session.local_clip_begin_ms) {
    issue(label + ".local_clip_end_ms must be greater than local_clip_begin_ms");
  }
  if (!positiveNumber(session.local_clip_file_size_bytes)) issue(label + ".local_clip_file_size_bytes must be positive");
  for (const field of ["search_ms", "detail_ms", "cut_ms"]) {
    if (!finiteNumber(session[field]) || session[field] < 0) issue(label + "." + field + " must be finite and >= 0");
  }
  for (const field of ["search_result_text_sha256", "full_transcript_text_sha256", "selected_text_sha256", "local_clip_selected_text_sha256", "local_clip_content_sha256"]) {
    requireSha256(session[field], label + "." + field);
  }
  if (
    nonEmptyString(session.search_query) &&
    nonEmptyString(session.search_result_text_sha256) &&
    session.search_result_text_sha256.toLowerCase() !== sha256Hex(session.search_query)
  ) {
    issue(label + ".search_result_text_sha256 must equal sha256(search_query)");
  }
});

if (uniqueUserIds.size < 50) issue("editor_sessions must include at least 50 unique user_id values");
if (uniqueWorkspaceIds.size < 50) issue("editor_sessions must include at least 50 unique workspace_id values");
if (uniqueSourceVideoIds.size < 50) issue("editor_sessions must include at least 50 distinct source_video_id values");
if (uniqueSearchQueries.size < minimumDistinctSearchQueryCount) {
  issue("editor_sessions must cover at least " + minimumDistinctSearchQueryCount + " distinct search_query values");
}
if (report.search_query_count !== uniqueSearchQueries.size) {
  issue("search_query_count must equal distinct search_query count");
}
if (!Array.isArray(report.search_queries)) {
  issue("search_queries must list the distinct search_query values");
} else {
  const listedQueries = new Set(report.search_queries.filter(nonEmptyString).map((query) => query.trim()));
  if (listedQueries.size !== uniqueSearchQueries.size) {
    issue("search_queries must contain each distinct search_query exactly once");
  }
  for (const query of uniqueSearchQueries) {
    if (!listedQueries.has(query)) {
      issue("search_queries must include search query " + query);
    }
  }
}
if (report.distinct_source_video_count !== uniqueSourceVideoIds.size) {
  issue("distinct_source_video_count must equal unique source_video_id count");
}
if (integer(report.distinct_source_video_count) && report.distinct_source_video_count < sessionCount) {
  issue("distinct_source_video_count must be at least editor_sessions.length");
}

metricTiming(report, sessions, "search", "search_ms", "search_sla_ms", sessionCount);
metricTiming(report, sessions, "detail", "detail_ms", "detail_sla_ms", sessionCount);
metricTiming(report, sessions, "cut", "cut_ms", "cut_sla_ms", sessionCount);

const usage = report.metrics && report.metrics.usage;
if (!usage || typeof usage !== "object") {
  issue("metrics.usage is missing");
} else {
  for (const field of ["search_request_count", "searchd_search_count", "source_detail_view_count", "transcript_selection_count", "cut_submission_count", "cut_success_count", "local_clip_count"]) {
    if (!integer(usage[field]) || usage[field] < sessionCount) {
      issue("metrics.usage." + field + " must be at least editor_sessions.length");
    }
  }
  if (usage.search_failure_count !== 0) {
    issue("metrics.usage.search_failure_count must be 0");
  }
}

if (issues.length > 0) {
  console.log("ACC-009 50-editor report self-check found " + issues.length + " issue(s):");
  for (const item of issues.slice(0, 120)) console.log("- " + item);
  if (issues.length > 120) console.log("- ... " + (issues.length - 120) + " more");
  process.exit(1);
}

console.log("ACC-009 50-editor report self-check passed for " + reportPath + ".");
console.log("Report is ready for nas-acc-009-collector.sh to copy into evidence/50-editor-report.json.");
NODE
