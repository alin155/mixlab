#!/bin/sh
set -eu

EVIDENCE_PATH="${EVIDENCE_PATH:-./nas-acc-009.json}"
REPOSITORY_COMMIT_SHA="${REPOSITORY_COMMIT_SHA:-${GITHUB_SHA:-}}"
EVIDENCE_KIT_WORKFLOW_RUN_URL="${EVIDENCE_KIT_WORKFLOW_RUN_URL:-}"
ADMIN_WEB_URL="${ADMIN_WEB_URL:-}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-mixlab}"
IMAGE_TAG="${IMAGE_TAG:-${MIXLAB_IMAGE_TAG:-}}"
MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL="${MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL:-}"
PUBLIC_LIBRARY_HOST_PATH="${PUBLIC_LIBRARY_HOST_PATH:-}"
WINDOWS_UNC_PATH="${WINDOWS_UNC_PATH:-}"
NAS_SHARED_FOLDER="${NAS_SHARED_FOLDER:-}"
EVIDENCE_DIR="${EVIDENCE_DIR:-}"
EDITOR_SESSION_COUNT="${EDITOR_SESSION_COUNT:-0}"

case "$EDITOR_SESSION_COUNT" in
  ''|*[!0-9]*) EDITOR_SESSION_COUNT=0 ;;
esac

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

json_bool() {
  case "$1" in
    1|true|TRUE|yes|YES|y|Y) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

json_string_field_from_existing() {
  field_path="$1"

  if [ ! -f "$EVIDENCE_PATH" ]; then
    return
  fi

  if command_exists node; then
    node - "$EVIDENCE_PATH" "$field_path" <<'NODE' 2>/dev/null || true
const fs = require("fs");
const [, , evidencePath, fieldPath] = process.argv;
let value = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
for (const field of fieldPath.split(".")) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    value = undefined;
    break;
  }
  value = value[field];
}
if (typeof value === "string" && value.trim() !== "") {
  process.stdout.write(value);
}
NODE
    return
  fi

  if command_exists python3; then
    python3 - "$EVIDENCE_PATH" "$field_path" <<'PY' 2>/dev/null || true
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
for field in sys.argv[2].split("."):
    if not isinstance(value, dict):
        value = None
        break
    value = value.get(field)
if isinstance(value, str) and value.strip():
    sys.stdout.write(value)
PY
    return
  fi

  field_name="${field_path##*.}"
  awk -v field="$field_name" '
    $0 ~ "\"" field "\"[[:space:]]*:" {
      line = $0
      sub(".*\"" field "\"[[:space:]]*:[[:space:]]*\"", "", line)
      sub("\".*", "", line)
      if (line != "") {
        print line
        exit
      }
    }
  ' "$EVIDENCE_PATH" 2>/dev/null || true
}

first_non_empty() {
  explicit_value="$1"
  existing_field_path="$2"

  if [ "$explicit_value" != "" ]; then
    printf '%s' "$explicit_value"
    return
  fi

  json_string_field_from_existing "$existing_field_path"
}

json_positive_integer_field_from_existing() {
  field_path="$1"

  if [ ! -f "$EVIDENCE_PATH" ]; then
    return
  fi

  if command_exists node; then
    node - "$EVIDENCE_PATH" "$field_path" <<'NODE' 2>/dev/null || true
const fs = require("fs");
const [, , evidencePath, fieldPath] = process.argv;
let value = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
for (const field of fieldPath.split(".")) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    value = undefined;
    break;
  }
  value = value[field];
}
if (Number.isInteger(value) && value > 0) {
  process.stdout.write(String(value));
}
NODE
    return
  fi

  if command_exists python3; then
    python3 - "$EVIDENCE_PATH" "$field_path" <<'PY' 2>/dev/null || true
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
for field in sys.argv[2].split("."):
    if not isinstance(value, dict):
        value = None
        break
    value = value.get(field)
if isinstance(value, int) and not isinstance(value, bool) and value > 0:
    sys.stdout.write(str(value))
PY
    return
  fi

  field_name="${field_path##*.}"
  awk -v field="$field_name" '
    $0 ~ "\"" field "\"[[:space:]]*:" {
      line = $0
      sub(".*\"" field "\"[[:space:]]*:[[:space:]]*", "", line)
      gsub(/[",]/, "", line)
      gsub(/[[:space:]]/, "", line)
      if (line ~ /^[1-9][0-9]*$/) {
        print line
      }
      exit
    }
  ' "$EVIDENCE_PATH" 2>/dev/null || true
}

first_positive_integer() {
  explicit_value="$1"
  existing_field_path="$2"

  case "$explicit_value" in
    [1-9]*)
      case "$explicit_value" in
        *[!0-9]*) ;;
        *)
          printf '%s' "$explicit_value"
          return
          ;;
      esac
      ;;
  esac

  json_positive_integer_field_from_existing "$existing_field_path"
}

json_bool_field_from_existing() {
  field_path="$1"

  if [ ! -f "$EVIDENCE_PATH" ]; then
    return
  fi

  if command_exists node; then
    node - "$EVIDENCE_PATH" "$field_path" <<'NODE' 2>/dev/null || true
const fs = require("fs");
const [, , evidencePath, fieldPath] = process.argv;
let value = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
for (const field of fieldPath.split(".")) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    value = undefined;
    break;
  }
  value = value[field];
}
if (typeof value === "boolean") {
  process.stdout.write(value ? "true" : "false");
}
NODE
    return
  fi

  if command_exists python3; then
    python3 - "$EVIDENCE_PATH" "$field_path" <<'PY' 2>/dev/null || true
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
for field in sys.argv[2].split("."):
    if not isinstance(value, dict):
        value = None
        break
    value = value.get(field)
if isinstance(value, bool):
    sys.stdout.write("true" if value else "false")
PY
    return
  fi

  field_name="${field_path##*.}"
  awk -v field="$field_name" '
    $0 ~ "\"" field "\"[[:space:]]*:" {
      line = $0
      sub(".*\"" field "\"[[:space:]]*:[[:space:]]*", "", line)
      gsub(/[",]/, "", line)
      gsub(/[[:space:]]/, "", line)
      if (line == "true" || line == "false") {
        print line
      }
      exit
    }
  ' "$EVIDENCE_PATH" 2>/dev/null || true
}

first_bool() {
  explicit_value="$1"
  existing_field_path="$2"

  if [ "$explicit_value" != "" ]; then
    json_bool "$explicit_value"
    return
  fi

  existing_value="$(json_bool_field_from_existing "$existing_field_path")"
  if [ "$existing_value" = "true" ] || [ "$existing_value" = "false" ]; then
    printf '%s' "$existing_value"
    return
  fi

  printf 'false'
}

is_text_attachment_name() {
  case "$1" in
    *.csv|*.json|*.jsonl|*.log|*.md|*.ndjson|*.srt|*.tsv|*.txt|*.vtt) return 0 ;;
    *) return 1 ;;
  esac
}

is_json_attachment_name() {
  case "$1" in
    *.json) return 0 ;;
    *) return 1 ;;
  esac
}

assert_text_attachment_safe() {
  source_path="$1"
  attachment_name="$2"

  if ! is_text_attachment_name "$attachment_name"; then
    return
  fi

  if grep -Eiq 'DASHSCOPE_API_KEY|sk-[A-Za-z0-9_-]{8,}|signature=|x-oss-signature|full_text|pasted_search_text' "$source_path"; then
    echo "Text evidence contains forbidden secret/private data: $source_path" >&2
    exit 1
  fi

  if grep -Eiq 'Authorization:[[:space:]]*Bearer[[:space:]]*[^*[:space:]]' "$source_path"; then
    echo "Text evidence contains forbidden secret/private data: $source_path" >&2
    exit 1
  fi
}

assert_json_attachment_parseable() {
  source_path="$1"
  attachment_name="$2"

  if ! is_json_attachment_name "$attachment_name"; then
    return
  fi

  if command_exists node; then
    if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$source_path" >/dev/null 2>&1; then
      echo "JSON evidence must parse as valid JSON before copying: $source_path" >&2
      exit 1
    fi
    return
  fi

  if command_exists python3; then
    if ! python3 -c 'import json,sys; json.load(open(sys.argv[1], encoding="utf-8"))' "$source_path" >/dev/null 2>&1; then
      echo "JSON evidence must parse as valid JSON before copying: $source_path" >&2
      exit 1
    fi
  fi
}

assert_concurrency_report_valid_when_possible() {
  source_path="$1"
  attachment_name="$2"

  if [ "$attachment_name" != "50-editor-report.json" ] || ! command_exists node; then
    return
  fi

  if ! node - "$source_path" >/dev/null 2>&1 <<'NODE'
const crypto = require("crypto");
const fs = require("fs");

const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const minimumEditorCount = 50;
const minimumDistinctSearchQueryCount = 5;
const minimumIndexedSourceVideoCount = 2000;
const minimumIndexedTranscriptSegmentCount = 48000;
const minimumFullTranscriptSegmentCount = 4;
const p95SlaMs = 1500;
const slaFieldsByMetric = {
  search: "search_sla_ms",
  detail: "detail_sla_ms",
  cut: "cut_sla_ms"
};

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

function integerNumber(value) {
  return typeof value === "number" && Number.isInteger(value) ? value : NaN;
}

function atLeast(value, minimum) {
  return Number.isFinite(value) && value >= minimum;
}

function atMost(value, maximum) {
  return Number.isFinite(value) && value <= maximum;
}

function latencySummaryPasses(currentMetric, slaMs) {
  const count = finiteNumber(currentMetric.count);
  const min = finiteNumber(currentMetric.min_ms);
  const p50 = finiteNumber(currentMetric.p50_ms);
  const p95 = finiteNumber(currentMetric.p95_ms);
  const max = finiteNumber(currentMetric.max_ms);
  return atLeast(count, minimumEditorCount) &&
    atLeast(min, 0) &&
    atLeast(p50, min) &&
    atLeast(p95, p50) &&
    atLeast(max, p95) &&
    atMost(p95, slaMs);
}

function latencyMetricMatchesEditorSessions(metricName, currentMetric, sessions) {
  const sessionField = `${metricName}_ms`;
  const count = finiteNumber(currentMetric.count);
  const max = finiteNumber(currentMetric.max_ms);
  const durations = sessions
    .map((session) => session && typeof session[sessionField] === "number" ? session[sessionField] : NaN)
    .filter((value) => Number.isFinite(value));
  return Number.isFinite(count) &&
    count === sessions.length &&
    durations.length > 0 &&
    Number.isFinite(max) &&
    max >= Math.max(...durations);
}

function metric(name) {
  return isRecord(report.metrics) && isRecord(report.metrics[name]) ? report.metrics[name] : {};
}

function usageCount(name) {
  const usage = isRecord(report.metrics) && isRecord(report.metrics.usage) ? report.metrics.usage : {};
  return finiteNumber(usage[name]);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function portableRelativePath(value) {
  return typeof value === "string" &&
    value.trim() !== "" &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.split("/").some((part) => part === "" || part === "..");
}

function searchHitQueryProofPasses(session) {
  const searchQuery = typeof session.search_query === "string" ? session.search_query.trim() : "";
  const begin = integerNumber(session.search_result_begin_char);
  const end = integerNumber(session.search_result_end_char);
  const rank = integerNumber(session.search_result_rank);
  const groupCount = integerNumber(session.search_result_group_count);
  const limit = integerNumber(session.search_result_limit);
  return searchQuery.length > 0 &&
    atLeast(begin, 0) &&
    atLeast(end, begin + 1) &&
    end - begin === searchQuery.length &&
    atLeast(limit, minimumEditorCount) &&
    atLeast(groupCount, limit) &&
    atLeast(rank, 1) &&
    atMost(rank, groupCount) &&
    typeof session.search_result_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.search_result_text_sha256) &&
    session.search_result_text_sha256.toLowerCase() === sha256Hex(searchQuery);
}

function searchIndexVersionProofPasses(session) {
  return typeof report.search_index_version === "string" &&
    report.search_index_version.trim() !== "" &&
    typeof session.search_index_version === "string" &&
    session.search_index_version === report.search_index_version;
}

function searchdHealthProofPasses() {
  return typeof report.search_index_version === "string" &&
    report.search_index_version.trim() !== "" &&
    typeof report.searchd_health_index_version === "string" &&
    report.searchd_health_index_version === report.search_index_version &&
    integerNumber(report.searchd_health_source_video_count) === integerNumber(report.indexed_source_video_count) &&
    integerNumber(report.searchd_health_segment_count) === integerNumber(report.indexed_transcript_segment_count);
}

function selectedTextRangeProofPasses(session) {
  const searchQuery = typeof session.search_query === "string" ? session.search_query.trim() : "";
  const begin = integerNumber(session.selected_text_begin_char);
  const end = integerNumber(session.selected_text_end_char);
  const charCount = integerNumber(session.selected_text_char_count);
  return atLeast(begin, 0) &&
    atLeast(end, begin + 1) &&
    atLeast(charCount, searchQuery.length) &&
    charCount === end - begin;
}

function fullTranscriptProofPasses(session) {
  const begin = integerNumber(session.full_transcript_begin_char);
  const end = integerNumber(session.full_transcript_end_char);
  const charCount = integerNumber(session.full_transcript_char_count);
  const selectedTextCharCount = integerNumber(session.selected_text_char_count);
  const segmentCount = integerNumber(session.full_transcript_segment_count);
  return typeof session.full_transcript_source_video_id === "string" &&
    session.full_transcript_source_video_id === session.source_video_id &&
    atLeast(segmentCount, minimumFullTranscriptSegmentCount) &&
    atLeast(begin, 0) &&
    atLeast(end, begin + 1) &&
    charCount === end - begin &&
    charCount > selectedTextCharCount &&
    typeof session.full_transcript_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.full_transcript_text_sha256);
}

function localClipProofPasses(session) {
  const selectedBeginMs = integerNumber(session.selected_begin_ms);
  const selectedEndMs = integerNumber(session.selected_end_ms);
  const localClipFileSizeBytes = integerNumber(session.local_clip_file_size_bytes);
  const localClipBeginMs = integerNumber(session.local_clip_begin_ms);
  const localClipEndMs = integerNumber(session.local_clip_end_ms);
  return typeof session.local_clip_id === "string" &&
    /^E[0-9A-Za-z_-]+$/.test(session.local_clip_id) &&
    typeof session.local_clip_source_video_id === "string" &&
    session.local_clip_source_video_id === session.source_video_id &&
    portableRelativePath(session.local_clip_relative_path) &&
    atLeast(localClipFileSizeBytes, 1) &&
    typeof session.local_clip_selected_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.local_clip_selected_text_sha256) &&
    typeof session.local_clip_content_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.local_clip_content_sha256) &&
    typeof session.selected_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.selected_text_sha256) &&
    session.local_clip_selected_text_sha256.toLowerCase() === session.selected_text_sha256.toLowerCase() &&
    atLeast(selectedBeginMs, 0) &&
    atLeast(selectedEndMs, selectedBeginMs + 1) &&
    localClipBeginMs === selectedBeginMs &&
    localClipEndMs === selectedEndMs;
}

function aggregateCountsMatchEditorSessions(editorCount, activeUserCount, sessions) {
  return sessions.length >= minimumEditorCount &&
    Number.isFinite(editorCount) &&
    editorCount === sessions.length &&
    Number.isFinite(activeUserCount) &&
    activeUserCount === sessions.length;
}

if (!isRecord(report) || report.status !== "passed") {
  process.exit(1);
}
for (const field of ["library_root", "workspace_root", "searchd_cache_root"]) {
  if (Object.prototype.hasOwnProperty.call(report, field)) {
    process.exit(1);
  }
}
for (const field of [
  "all_searches_passed",
  "all_cuts_written_to_local_workspaces",
  "public_library_not_written_by_cutters",
  "no_cross_workspace_outputs"
]) {
  if (report[field] !== true) {
    process.exit(1);
  }
}

const editorCount = finiteNumber(report.editor_count);
const activeUserCount = finiteNumber(report.active_user_count);
const distinctSourceVideoCount = finiteNumber(report.distinct_source_video_count);
const indexedSourceVideoCount = finiteNumber(report.indexed_source_video_count);
const indexedTranscriptSegmentCount = finiteNumber(report.indexed_transcript_segment_count);
if (
  !atLeast(editorCount, minimumEditorCount) ||
  !atLeast(activeUserCount, minimumEditorCount) ||
  !atLeast(distinctSourceVideoCount, minimumEditorCount) ||
  !atLeast(indexedSourceVideoCount, minimumIndexedSourceVideoCount) ||
  !atLeast(indexedTranscriptSegmentCount, minimumIndexedTranscriptSegmentCount) ||
  !searchdHealthProofPasses()
) {
  process.exit(1);
}

const sessions = Array.isArray(report.editor_sessions) ? report.editor_sessions : [];
if (!aggregateCountsMatchEditorSessions(editorCount, activeUserCount, sessions)) {
  process.exit(1);
}
for (const metricName of ["search", "detail", "cut"]) {
  const currentMetric = metric(metricName);
  const slaMs = finiteNumber(report[slaFieldsByMetric[metricName]]);
  if (
    !atLeast(slaMs, 1) ||
    !atMost(slaMs, p95SlaMs) ||
    !latencySummaryPasses(currentMetric, slaMs) ||
    !latencyMetricMatchesEditorSessions(metricName, currentMetric, sessions)
  ) {
    process.exit(1);
  }
}

for (const field of [
  "search_request_count",
  "searchd_search_count",
  "search_failure_count",
  "source_detail_view_count",
  "transcript_selection_count",
  "cut_submission_count",
  "cut_success_count",
  "local_clip_count"
]) {
  const currentUsageCount = usageCount(field);
  if (field === "search_failure_count") {
    if (currentUsageCount !== 0) {
      process.exit(1);
    }
  } else if (!atLeast(currentUsageCount, minimumEditorCount) || !atLeast(currentUsageCount, sessions.length)) {
    process.exit(1);
  }
}

const requiredSessionCount = Math.max(minimumEditorCount, editorCount, activeUserCount);
if (sessions.length < requiredSessionCount || sessions.some((session) => !isRecord(session))) {
  process.exit(1);
}

const userIds = new Set();
const workspaceIds = new Set();
const sourceVideoIds = new Set();
const searchQueries = new Set();
for (const session of sessions) {
  if (typeof session.user_id !== "string" || session.user_id.trim() === "" || userIds.has(session.user_id)) {
    process.exit(1);
  }
  userIds.add(session.user_id);
  if (typeof session.workspace_id !== "string" || session.workspace_id.trim() === "" || workspaceIds.has(session.workspace_id)) {
    process.exit(1);
  }
  workspaceIds.add(session.workspace_id);
  if (typeof session.source_video_id !== "string" || session.source_video_id.trim() === "") {
    process.exit(1);
  }
  sourceVideoIds.add(session.source_video_id);
  if (typeof session.search_query !== "string" || session.search_query.trim() === "") {
    process.exit(1);
  }
  searchQueries.add(session.search_query.trim());

  if (
    typeof session.username !== "string" ||
    typeof session.selected_segment_id !== "string" ||
    !searchIndexVersionProofPasses(session) ||
    !searchHitQueryProofPasses(session) ||
    typeof session.search_result_source_video_id !== "string" ||
    session.search_result_source_video_id !== session.source_video_id ||
    !fullTranscriptProofPasses(session) ||
    typeof session.search_result_segment_id !== "string" ||
    session.search_result_segment_id !== session.selected_segment_id ||
    typeof session.full_transcript_segment_id !== "string" ||
    session.full_transcript_segment_id !== session.selected_segment_id ||
    !atLeast(integerNumber(session.search_result_begin_char), 0) ||
    !atLeast(integerNumber(session.search_result_end_char), integerNumber(session.search_result_begin_char) + 1) ||
    !atLeast(integerNumber(session.full_transcript_begin_char), 0) ||
    !atLeast(integerNumber(session.full_transcript_end_char), integerNumber(session.full_transcript_begin_char) + 1) ||
    !atLeast(integerNumber(session.search_result_begin_char), integerNumber(session.full_transcript_begin_char)) ||
    !atMost(integerNumber(session.search_result_end_char), integerNumber(session.full_transcript_end_char)) ||
    !atLeast(integerNumber(session.selected_text_begin_char), integerNumber(session.full_transcript_begin_char)) ||
    !atLeast(integerNumber(session.selected_text_end_char), integerNumber(session.selected_text_begin_char) + 1) ||
    !atMost(integerNumber(session.selected_text_end_char), integerNumber(session.full_transcript_end_char)) ||
    !atMost(integerNumber(session.selected_text_begin_char), integerNumber(session.search_result_begin_char)) ||
    !atLeast(integerNumber(session.selected_text_end_char), integerNumber(session.search_result_end_char)) ||
    !selectedTextRangeProofPasses(session) ||
    !localClipProofPasses(session) ||
    session.search_backend !== "searchd" ||
    session.location_verified !== true ||
    session.completed_closed_loop !== true ||
    session.workspace_output_written !== true ||
    session.public_library_written !== false ||
    !atLeast(finiteNumber(session.search_ms), 0) ||
    !atLeast(finiteNumber(session.detail_ms), 0) ||
    !atLeast(finiteNumber(session.cut_ms), 0)
  ) {
    process.exit(1);
  }
}

if (userIds.size < requiredSessionCount) {
  process.exit(1);
}
if (workspaceIds.size < requiredSessionCount) {
  process.exit(1);
}
if (sourceVideoIds.size < requiredSessionCount || sourceVideoIds.size !== distinctSourceVideoCount) {
  process.exit(1);
}
if (searchQueries.size < minimumDistinctSearchQueryCount) {
  process.exit(1);
}
if (report.search_query_count !== searchQueries.size || !Array.isArray(report.search_queries)) {
  process.exit(1);
}
const listedSearchQueries = new Set(report.search_queries.filter((query) =>
  typeof query === "string" && query.trim() !== ""
).map((query) => query.trim()));
if (listedSearchQueries.size !== searchQueries.size) {
  process.exit(1);
}
for (const query of searchQueries) {
  if (!listedSearchQueries.has(query)) {
    process.exit(1);
  }
}
NODE
  then
    echo "50-editor report must prove passed 50-editor search/detail/cut closed-loop evidence before copying: $source_path" >&2
    exit 1
  fi
}

file_hex_prefix() {
  source_path="$1"
  byte_count="$2"
  LC_ALL=C od -An -tx1 -N "$byte_count" "$source_path" 2>/dev/null | tr -d ' \n'
}

assert_screenshot_signature() {
  source_path="$1"
  extension="$2"
  prefix12="$(file_hex_prefix "$source_path" 12)"

  case "$extension" in
    .png)
      case "$prefix12" in
        89504e470d0a1a0a*) return ;;
      esac
      ;;
    .jpg|.jpeg)
      case "$prefix12" in
        ffd8ff*) return ;;
      esac
      ;;
    .webp)
      case "$prefix12" in
        52494646????????57454250) return ;;
      esac
      ;;
  esac

  echo "Screenshot evidence has invalid file signature: $source_path" >&2
  exit 1
}

manual_or_false() {
  value="${1:-}"
  json_bool "$value"
}

check_admin_web() {
  if [ "${ADMIN_WEB_REACHABLE:-}" != "" ]; then
    json_bool "$ADMIN_WEB_REACHABLE"
    return
  fi

  if [ "$ADMIN_WEB_URL" != "" ] && command_exists curl && curl -fsS "$ADMIN_WEB_URL" >/dev/null 2>&1; then
    printf 'true'
    return
  fi

  printf 'false'
}

compose_logs() {
  service="$1"
  if command_exists docker; then
    docker compose -p "$COMPOSE_PROJECT" logs --no-color "$service" 2>/dev/null || true
  fi
}

check_log_contains() {
  env_name="$1"
  service="$2"
  pattern="$3"
  override="$(eval "printf '%s' \"\${$env_name:-}\"")"

  if [ "$override" != "" ]; then
    json_bool "$override"
    return
  fi

  if compose_logs "$service" | grep -q "$pattern"; then
    printf 'true'
    return
  fi

  printf 'false'
}

check_worker_output() {
  if [ "${WORKER_OUTPUT_CREATED:-}" != "" ]; then
    json_bool "$WORKER_OUTPUT_CREATED"
    return
  fi

  if [ "$PUBLIC_LIBRARY_HOST_PATH" != "" ] && [ -d "$PUBLIC_LIBRARY_HOST_PATH/.mixlab-library" ]; then
    printf 'true'
    return
  fi

  printf 'false'
}

check_current_json() {
  if [ "${CURRENT_JSON_CREATED:-}" != "" ]; then
    json_bool "$CURRENT_JSON_CREATED"
    return
  fi

  current_json="$PUBLIC_LIBRARY_HOST_PATH/.mixlab-library/indexes/source-transcript-index/current.json"
  if [ "$PUBLIC_LIBRARY_HOST_PATH" != "" ] && [ -f "$current_json" ]; then
    printf 'true'
    return
  fi

  printf 'false'
}

EVIDENCE_ROOT="$(dirname "$EVIDENCE_PATH")"
mkdir -p "$EVIDENCE_ROOT"

copy_attachment() {
  source_path="$1"
  destination_name="$2"

  if [ ! -f "$source_path" ]; then
    echo "Evidence attachment file does not exist: $source_path" >&2
    exit 1
  fi

  if [ ! -s "$source_path" ]; then
    echo "Evidence attachment file must not be empty: $source_path" >&2
    exit 1
  fi

  destination_dir="$EVIDENCE_ROOT/evidence"
  mkdir -p "$destination_dir"
  destination="$destination_dir/$destination_name"
  temporary_destination="$destination.tmp.$$"
  assert_text_attachment_safe "$source_path" "$destination_name"
  assert_json_attachment_parseable "$source_path" "$destination_name"
  assert_concurrency_report_valid_when_possible "$source_path" "$destination_name"
  cp "$source_path" "$temporary_destination"
  mv "$temporary_destination" "$destination"
  printf 'evidence/%s' "$destination_name"
}

attachment_source() {
  env_name="$1"
  default_name="$2"
  override="$(eval "printf '%s' \"\${$env_name:-}\"")"

  if [ "$override" != "" ]; then
    printf '%s' "$override"
    return
  fi

  if [ "$EVIDENCE_DIR" != "" ] && [ -e "$EVIDENCE_DIR/$default_name" ]; then
    printf '%s' "$EVIDENCE_DIR/$default_name"
    return
  fi

  printf ''
}

evidence_file_value() {
  env_name="$1"
  default_name="$2"
  source_path="$(attachment_source "$env_name" "$default_name")"

  if [ "$source_path" = "" ]; then
    printf ''
    return
  fi

  copied_path="$(copy_attachment "$source_path" "$default_name")"
  json_escape "$copied_path"
}

report_json_value() {
  field="$1"
  source_path="$(attachment_source MULTI_USER_SEARCH_CUT_REPORT 50-editor-report.json)"

  if [ "$source_path" = "" ] || ! command_exists node; then
    printf ''
    return
  fi

  node - "$source_path" "$field" <<'NODE' 2>/dev/null || true
const crypto = require("crypto");
const fs = require("fs");

const reportPath = process.argv[2];
const field = process.argv[3];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const minimumFullTranscriptSegmentCount = 4;
const metrics = report && typeof report.metrics === "object" && report.metrics !== null
  ? report.metrics
  : {};
const usage = metrics && typeof metrics.usage === "object" && metrics.usage !== null
  ? metrics.usage
  : {};
const sessions = Array.isArray(report.editor_sessions) ? report.editor_sessions : [];

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function countFor(metricName) {
  const metric = metrics && typeof metrics[metricName] === "object" && metrics[metricName] !== null
    ? metrics[metricName]
    : {};
  return finiteNumber(metric.count);
}

function writeBool(value) {
  process.stdout.write(value ? "true" : "false");
}

function uniqueUserCount() {
  return new Set(
    sessions
      .map((session) => session && typeof session.user_id === "string" ? session.user_id.trim() : "")
      .filter(Boolean)
  ).size;
}

function uniqueWorkspaceCount() {
  return new Set(
    sessions
      .map((session) => session && typeof session.workspace_id === "string" ? session.workspace_id.trim() : "")
      .filter(Boolean)
  ).size;
}

function uniqueSourceVideoCount() {
  return new Set(
    sessions
      .map((session) => session && typeof session.source_video_id === "string" ? session.source_video_id.trim() : "")
      .filter(Boolean)
  ).size;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function portableRelativePath(value) {
  return typeof value === "string" &&
    value.trim() !== "" &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.split("/").some((part) => part === "" || part === "..");
}

function searchHitQueryProofPasses(session) {
  const searchQuery = session && typeof session.search_query === "string" ? session.search_query.trim() : "";
  return searchQuery.length > 0 &&
    isNonNegativeInteger(session.search_result_begin_char) &&
    isNonNegativeInteger(session.search_result_end_char) &&
    session.search_result_end_char - session.search_result_begin_char === searchQuery.length &&
    Number.isInteger(session.search_result_limit) &&
    session.search_result_limit >= 50 &&
    Number.isInteger(session.search_result_group_count) &&
    session.search_result_group_count >= session.search_result_limit &&
    Number.isInteger(session.search_result_rank) &&
    session.search_result_rank >= 1 &&
    session.search_result_rank <= session.search_result_group_count &&
    typeof session.search_result_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.search_result_text_sha256) &&
    session.search_result_text_sha256.toLowerCase() === sha256Hex(searchQuery);
}

function searchIndexVersionProofPasses(session) {
  return report &&
    typeof report.search_index_version === "string" &&
    report.search_index_version.trim() !== "" &&
    session &&
    typeof session.search_index_version === "string" &&
    session.search_index_version === report.search_index_version;
}

function searchdHealthProofPasses() {
  return report &&
    typeof report.search_index_version === "string" &&
    report.search_index_version.trim() !== "" &&
    typeof report.searchd_health_index_version === "string" &&
    report.searchd_health_index_version === report.search_index_version &&
    isNonNegativeInteger(report.searchd_health_source_video_count) &&
    report.searchd_health_source_video_count === report.indexed_source_video_count &&
    isNonNegativeInteger(report.searchd_health_segment_count) &&
    report.searchd_health_segment_count === report.indexed_transcript_segment_count;
}

function selectedTextRangeProofPasses(session) {
  const searchQuery = session && typeof session.search_query === "string" ? session.search_query.trim() : "";
  return session &&
    isNonNegativeInteger(session.selected_text_begin_char) &&
    isNonNegativeInteger(session.selected_text_end_char) &&
    isNonNegativeInteger(session.selected_text_char_count) &&
    session.selected_text_end_char > session.selected_text_begin_char &&
    session.selected_text_char_count === session.selected_text_end_char - session.selected_text_begin_char &&
    session.selected_text_char_count >= searchQuery.length;
}

function fullTranscriptProofPasses(session) {
  return session &&
    typeof session.full_transcript_source_video_id === "string" &&
    session.full_transcript_source_video_id === session.source_video_id &&
    isNonNegativeInteger(session.full_transcript_segment_count) &&
    session.full_transcript_segment_count >= minimumFullTranscriptSegmentCount &&
    isNonNegativeInteger(session.full_transcript_begin_char) &&
    isNonNegativeInteger(session.full_transcript_end_char) &&
    isNonNegativeInteger(session.full_transcript_char_count) &&
    session.full_transcript_end_char > session.full_transcript_begin_char &&
    session.full_transcript_char_count === session.full_transcript_end_char - session.full_transcript_begin_char &&
    session.full_transcript_char_count > session.selected_text_char_count &&
    typeof session.full_transcript_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.full_transcript_text_sha256);
}

function localClipProofPasses(session) {
  return session &&
    typeof session.local_clip_id === "string" &&
    /^E[0-9A-Za-z_-]+$/.test(session.local_clip_id) &&
    typeof session.local_clip_source_video_id === "string" &&
    session.local_clip_source_video_id === session.source_video_id &&
    portableRelativePath(session.local_clip_relative_path) &&
    isNonNegativeInteger(session.local_clip_file_size_bytes) &&
    session.local_clip_file_size_bytes > 0 &&
    typeof session.local_clip_selected_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.local_clip_selected_text_sha256) &&
    typeof session.local_clip_content_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.local_clip_content_sha256) &&
    typeof session.selected_text_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(session.selected_text_sha256) &&
    session.local_clip_selected_text_sha256.toLowerCase() === session.selected_text_sha256.toLowerCase() &&
    isNonNegativeInteger(session.selected_begin_ms) &&
    isNonNegativeInteger(session.selected_end_ms) &&
    isNonNegativeInteger(session.local_clip_begin_ms) &&
    isNonNegativeInteger(session.local_clip_end_ms) &&
    session.selected_end_ms > session.selected_begin_ms &&
    session.local_clip_begin_ms === session.selected_begin_ms &&
    session.local_clip_end_ms === session.selected_end_ms;
}

function aggregateCountsMatchEditorSessions() {
  return finiteNumber(report.editor_count) === sessions.length &&
    finiteNumber(report.active_user_count) === sessions.length;
}

const editorSessionCount = sessions.length;

switch (field) {
  case "editor_session_count":
    process.stdout.write(String(editorSessionCount));
    break;
  case "all_searches_passed":
    writeBool(
      report.status === "passed" &&
      aggregateCountsMatchEditorSessions() &&
      searchdHealthProofPasses() &&
      report.all_searches_passed === true &&
      countFor("search") >= editorSessionCount &&
      finiteNumber(usage.search_request_count) >= editorSessionCount &&
      finiteNumber(usage.searchd_search_count) >= editorSessionCount &&
      finiteNumber(usage.search_failure_count) === 0 &&
      finiteNumber(report.distinct_source_video_count) === uniqueSourceVideoCount() &&
      uniqueSourceVideoCount() >= editorSessionCount &&
      sessions.length >= 50 &&
      sessions.every((session) =>
        session &&
        session.search_backend === "searchd" &&
        searchIndexVersionProofPasses(session) &&
        session.location_verified === true &&
        searchHitQueryProofPasses(session) &&
        typeof session.search_result_source_video_id === "string" &&
        session.search_result_source_video_id === session.source_video_id &&
        fullTranscriptProofPasses(session) &&
        typeof session.search_result_segment_id === "string" &&
        session.search_result_segment_id === session.selected_segment_id &&
        typeof session.full_transcript_segment_id === "string" &&
        session.full_transcript_segment_id === session.selected_segment_id &&
        isNonNegativeInteger(session.search_result_begin_char) &&
        isNonNegativeInteger(session.search_result_end_char) &&
        session.search_result_end_char > session.search_result_begin_char &&
        isNonNegativeInteger(session.full_transcript_begin_char) &&
        isNonNegativeInteger(session.full_transcript_end_char) &&
        session.full_transcript_end_char > session.full_transcript_begin_char &&
        session.search_result_begin_char >= session.full_transcript_begin_char &&
        session.search_result_end_char <= session.full_transcript_end_char &&
        isNonNegativeInteger(session.selected_text_begin_char) &&
        isNonNegativeInteger(session.selected_text_end_char) &&
        selectedTextRangeProofPasses(session) &&
        session.selected_text_end_char > session.selected_text_begin_char &&
        session.selected_text_begin_char >= session.full_transcript_begin_char &&
        session.selected_text_end_char <= session.full_transcript_end_char &&
        session.selected_text_begin_char <= session.search_result_begin_char &&
        session.selected_text_end_char >= session.search_result_end_char &&
        isNonNegativeNumber(session.search_ms)
      )
    );
    break;
  case "all_cuts_written_to_local_workspaces":
    writeBool(
      report.status === "passed" &&
      aggregateCountsMatchEditorSessions() &&
      report.all_cuts_written_to_local_workspaces === true &&
      countFor("cut") >= editorSessionCount &&
      finiteNumber(usage.cut_submission_count) >= editorSessionCount &&
      finiteNumber(usage.cut_success_count) >= editorSessionCount &&
      finiteNumber(usage.local_clip_count) >= editorSessionCount &&
      sessions.length >= 50 &&
      sessions.every((session) =>
        session &&
        session.completed_closed_loop === true &&
        session.workspace_output_written === true &&
        localClipProofPasses(session) &&
        isNonNegativeNumber(session.cut_ms)
      )
    );
    break;
  case "public_library_not_written_by_cutters":
    writeBool(
      report.status === "passed" &&
      aggregateCountsMatchEditorSessions() &&
      report.public_library_not_written_by_cutters === true &&
      sessions.length >= 50 &&
      sessions.every((session) => session && session.public_library_written === false)
    );
    break;
  case "no_cross_workspace_outputs":
    writeBool(
      report.status === "passed" &&
      aggregateCountsMatchEditorSessions() &&
      report.no_cross_workspace_outputs === true &&
      uniqueWorkspaceCount() >= editorSessionCount &&
      uniqueUserCount() >= editorSessionCount &&
      editorSessionCount >= 50
    );
    break;
  default:
    process.exitCode = 1;
}
NODE
}

editor_session_count_value() {
  if [ "$EDITOR_SESSION_COUNT" != "0" ]; then
    printf '%s' "$EDITOR_SESSION_COUNT"
    return
  fi

  report_count="$(report_json_value editor_session_count)"
  case "$report_count" in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$report_count" ;;
  esac
}

preprocess_count_refresh_interval_value() {
  value="$(first_positive_integer "$MIXLAB_PREPROCESS_COUNT_REFRESH_INTERVAL" deployment.preprocess_count_refresh_interval)"
  if [ "$value" = "" ]; then
    printf '0'
    return
  fi

  printf '%s' "$value"
}

assert_worker_log_count_refresh_interval() {
  source_path="$1"
  expected_interval="$2"

  case "$expected_interval" in
    [1-9]*)
      case "$expected_interval" in
        *[!0-9]*) return ;;
      esac
      ;;
    *) return ;;
  esac

  if ! grep -Eq "\"count_refresh_interval\"[[:space:]]*:[[:space:]]*$expected_interval([^0-9]|$)" "$source_path"; then
    echo "Worker log evidence must include count_refresh_interval matching deployment.preprocess_count_refresh_interval ($expected_interval): $source_path" >&2
    exit 1
  fi
}

manual_or_report_bool() {
  env_name="$1"
  report_field="$2"
  override="$(eval "printf '%s' \"\${$env_name:-}\"")"

  if [ "$override" != "" ]; then
    json_bool "$override"
    return
  fi

  value="$(report_json_value "$report_field")"
  if [ "$value" != "" ]; then
    json_bool "$value"
    return
  fi

  printf 'false'
}

worker_log_value() {
  source_path="$(attachment_source WORKER_LOG_EXCERPT worker.log)"

  if [ "$source_path" != "" ]; then
    assert_worker_log_count_refresh_interval "$source_path" "$preprocess_count_refresh_interval_json_value"
    copied_path="$(copy_attachment "$source_path" worker.log)"
    json_escape "$copied_path"
    return
  fi

  logs="$(compose_logs admin-worker | tail -n 200 || true)"
  if [ "$logs" = "" ]; then
    printf ''
    return
  fi

  destination_dir="$EVIDENCE_ROOT/evidence"
  mkdir -p "$destination_dir"
  destination="$destination_dir/worker.log"
  temporary_destination="$destination.tmp.$$"
  printf '%s\n' "$logs" > "$temporary_destination"
  assert_text_attachment_safe "$temporary_destination" worker.log
  assert_worker_log_count_refresh_interval "$temporary_destination" "$preprocess_count_refresh_interval_json_value"
  mv "$temporary_destination" "$destination"
  json_escape "evidence/worker.log"
}

evidence_screenshot_value() {
  env_name="$1"
  default_stem="$2"
  default_name="$3"
  source_path="$(attachment_source "$env_name" "$default_name")"

  if [ "$source_path" = "" ]; then
    printf ''
    return
  fi

  if [ ! -f "$source_path" ]; then
    echo "Evidence attachment file does not exist: $source_path" >&2
    exit 1
  fi

  source_base="${source_path##*/}"
  if [ "$source_base" = "${source_base%.*}" ]; then
    echo "Screenshot evidence must have .png, .jpg, .jpeg, or .webp extension: $source_path" >&2
    exit 1
  fi

  extension="$(printf '%s' ".${source_base##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$extension" in
    .png|.jpg|.jpeg|.webp) ;;
    *)
      echo "Screenshot evidence must have .png, .jpg, .jpeg, or .webp extension: $source_path" >&2
      exit 1
      ;;
  esac

  assert_screenshot_signature "$source_path" "$extension"
  copied_path="$(copy_attachment "$source_path" "$default_stem$extension")"
  json_escape "$copied_path"
}

admin_web_screenshot_value="$(evidence_screenshot_value ADMIN_WEB_SCREENSHOT admin-web admin-web.png)"
repository_commit_sha_value="$(first_non_empty "$REPOSITORY_COMMIT_SHA" artifact_provenance.repository_commit_sha)"
evidence_kit_workflow_run_url_value="$(first_non_empty "$EVIDENCE_KIT_WORKFLOW_RUN_URL" artifact_provenance.evidence_kit_workflow_run_url)"
image_tag_value="$(first_non_empty "$IMAGE_TAG" deployment.image_tag)"
preprocess_count_refresh_interval_json_value="$(preprocess_count_refresh_interval_value)"
admin_source_videos_source_path_visible_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_SOURCE_PATH_VISIBLE:-}" admin_source_videos_ui.source_path_visible)"
admin_source_videos_first_id_value="$(first_non_empty "${ADMIN_SOURCE_VIDEOS_FIRST_ID:-}" admin_source_videos_ui.first_source_video_id)"
admin_source_videos_first_id_visible_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_FIRST_ID_VISIBLE:-}" admin_source_videos_ui.first_source_video_id_visible)"
admin_source_videos_loaded_count_before_value="$(first_positive_integer "${ADMIN_SOURCE_VIDEOS_LOADED_COUNT_BEFORE:-}" admin_source_videos_ui.loaded_count_before)"
admin_source_videos_loaded_count_after_value="$(first_positive_integer "${ADMIN_SOURCE_VIDEOS_LOADED_COUNT_AFTER:-}" admin_source_videos_ui.loaded_count_after)"
admin_source_videos_load_more_increased_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_LOAD_MORE_INCREASED:-}" admin_source_videos_ui.load_more_increased)"
admin_source_videos_query_value="$(first_non_empty "${ADMIN_SOURCE_VIDEOS_QUERY:-}" admin_source_videos_ui.query)"
admin_source_videos_query_result_id_value="$(first_non_empty "${ADMIN_SOURCE_VIDEOS_QUERY_RESULT_ID:-}" admin_source_videos_ui.query_result_id)"
admin_source_videos_query_api_response_observed_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_QUERY_API_RESPONSE_OBSERVED:-}" admin_source_videos_ui.query_api_response_observed)"
admin_source_videos_query_result_visible_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_QUERY_RESULT_VISIBLE:-}" admin_source_videos_ui.query_result_visible)"
admin_source_videos_ready_filter_selected_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_READY_FILTER_SELECTED:-}" admin_source_videos_ui.ready_filter_selected)"
admin_source_videos_ready_filter_api_response_observed_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_READY_FILTER_API_RESPONSE_OBSERVED:-}" admin_source_videos_ui.ready_filter_api_response_observed)"
admin_source_videos_ready_filter_visible_status_count_value="$(first_positive_integer "${ADMIN_SOURCE_VIDEOS_READY_FILTER_VISIBLE_STATUS_COUNT:-}" admin_source_videos_ui.ready_filter_visible_status_count)"
admin_source_videos_ready_filter_all_visible_rows_ready_value="$(first_bool "${ADMIN_SOURCE_VIDEOS_READY_FILTER_ALL_VISIBLE_ROWS_READY:-}" admin_source_videos_ui.ready_filter_all_visible_rows_ready)"
worker_log_excerpt_value="$(worker_log_value)"
current_json_screenshot_value="$(evidence_screenshot_value CURRENT_JSON_SCREENSHOT current-json current-json.png)"
smb_permission_screenshot_value="$(evidence_screenshot_value SMB_PERMISSION_SCREENSHOT smb-permissions smb-permissions.png)"
multi_user_search_cut_report_value="$(evidence_file_value MULTI_USER_SEARCH_CUT_REPORT 50-editor-report.json)"

cat > "$EVIDENCE_PATH" <<JSON
{
  "schema_version": "1.0",
  "acceptance_id": "ACC-009",
  "collector_note": "Collected by scripts/acceptance/nas-acc-009-collector.sh. Validate after replacing every remaining empty, false, or zero field with real NAS evidence.",
  "artifact_provenance": {
    "repository_commit_sha": "$(json_escape "$repository_commit_sha_value")",
    "evidence_kit_artifact_name": "mixlab-target-evidence-kit",
    "evidence_kit_workflow_run_url": "$(json_escape "$evidence_kit_workflow_run_url_value")"
  },
  "deployment": {
    "admin_web_url": "$(json_escape "$ADMIN_WEB_URL")",
    "compose_project": "$(json_escape "$COMPOSE_PROJECT")",
    "image_tag": "$(json_escape "$image_tag_value")",
    "preprocess_count_refresh_interval": $preprocess_count_refresh_interval_json_value,
    "admin_web_reachable": $(check_admin_web),
    "admin_api_listening": $(check_log_contains ADMIN_API_LISTENING admin-api "0.0.0.0:3889"),
    "admin_worker_loop_started": $(check_log_contains ADMIN_WORKER_LOOP_STARTED admin-worker "admin-worker-loop-started"),
    "worker_output_created": $(check_worker_output),
    "current_json_created": $(check_current_json)
  },
  "smb_public_library": {
    "windows_unc_path": "$(json_escape "$WINDOWS_UNC_PATH")",
    "nas_shared_folder": "$(json_escape "$NAS_SHARED_FOLDER")",
    "readonly_from_cutter": $(manual_or_false "${READONLY_FROM_CUTTER:-}"),
    "public_library_not_written_by_cutters": $(manual_or_false "${SMB_PUBLIC_LIBRARY_NOT_WRITTEN_BY_CUTTERS:-}")
  },
  "multi_user": {
    "editor_session_count": $(editor_session_count_value),
    "all_searches_passed": $(manual_or_report_bool ALL_SEARCHES_PASSED all_searches_passed),
    "all_cuts_written_to_local_workspaces": $(manual_or_report_bool ALL_CUTS_WRITTEN_TO_LOCAL_WORKSPACES all_cuts_written_to_local_workspaces),
    "public_library_not_written_by_cutters": $(manual_or_report_bool MULTI_USER_PUBLIC_LIBRARY_NOT_WRITTEN_BY_CUTTERS public_library_not_written_by_cutters),
    "no_cross_workspace_outputs": $(manual_or_report_bool NO_CROSS_WORKSPACE_OUTPUTS no_cross_workspace_outputs)
  },
  "admin_source_videos_ui": {
    "source_path_visible": $admin_source_videos_source_path_visible_value,
    "first_source_video_id": "$(json_escape "$admin_source_videos_first_id_value")",
    "first_source_video_id_visible": $admin_source_videos_first_id_visible_value,
    "loaded_count_before": ${admin_source_videos_loaded_count_before_value:-0},
    "loaded_count_after": ${admin_source_videos_loaded_count_after_value:-0},
    "load_more_increased": $admin_source_videos_load_more_increased_value,
    "query": "$(json_escape "$admin_source_videos_query_value")",
    "query_result_id": "$(json_escape "$admin_source_videos_query_result_id_value")",
    "query_api_response_observed": $admin_source_videos_query_api_response_observed_value,
    "query_result_visible": $admin_source_videos_query_result_visible_value,
    "ready_filter_selected": $admin_source_videos_ready_filter_selected_value,
    "ready_filter_api_response_observed": $admin_source_videos_ready_filter_api_response_observed_value,
    "ready_filter_visible_status_count": ${admin_source_videos_ready_filter_visible_status_count_value:-0},
    "ready_filter_all_visible_rows_ready": $admin_source_videos_ready_filter_all_visible_rows_ready_value
  },
  "evidence_files": {
    "admin_web_screenshot": "$admin_web_screenshot_value",
    "worker_log_excerpt": "$worker_log_excerpt_value",
    "current_json_screenshot": "$current_json_screenshot_value",
    "smb_permission_screenshot": "$smb_permission_screenshot_value",
    "multi_user_search_cut_report": "$multi_user_search_cut_report_value"
  }
}
JSON

echo "Wrote ACC-009 evidence draft to $EVIDENCE_PATH"
