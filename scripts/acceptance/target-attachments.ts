import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type AttachmentKind = "concurrency-report" | "screenshot" | "text" | "worker-log";

export interface AttachmentReference {
  path: string;
  kind: AttachmentKind;
  required_path_segment?: string;
  expected_file_stem?: string;
  expected_count_refresh_interval?: number;
}

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".ndjson",
  ".srt",
  ".tsv",
  ".txt",
  ".vtt"
]);

const TEXT_ATTACHMENT_FORBIDDEN_PATTERNS = [
  /DASHSCOPE_API_KEY/i,
  /Authorization:\s*Bearer\s+(?!\*\*\*)/i,
  /sk-[A-Za-z0-9_-]{8,}/,
  /signature=/i,
  /x-oss-signature/i,
  /full_text/i,
  /pasted_search_text/i
] as const;

const NAS_CONCURRENCY_MIN_EDITOR_COUNT = 50;
const NAS_CONCURRENCY_MIN_SEARCH_QUERY_COUNT = 5;
const NAS_CONCURRENCY_MIN_INDEXED_SOURCE_VIDEO_COUNT = 2000;
const NAS_CONCURRENCY_MIN_INDEXED_TRANSCRIPT_SEGMENT_COUNT = 48000;
const NAS_CONCURRENCY_MIN_FULL_TRANSCRIPT_SEGMENT_COUNT = 4;
const NAS_CONCURRENCY_P95_SLA_MS = 1500;
const MIN_SCREENSHOT_WIDTH = 640;
const MIN_SCREENSHOT_HEIGHT = 360;
const FORBIDDEN_CONCURRENCY_REPORT_RUN_ROOT_FIELDS = [
  "library_root",
  "workspace_root",
  "searchd_cache_root"
] as const;
const REQUIRED_CONCURRENCY_REPORT_TRUE_FIELDS = [
  "all_searches_passed",
  "all_cuts_written_to_local_workspaces",
  "public_library_not_written_by_cutters",
  "no_cross_workspace_outputs"
] as const;
const CONCURRENCY_REPORT_SLA_FIELDS = {
  search: "search_sla_ms",
  detail: "detail_sla_ms",
  cut: "cut_sla_ms"
} as const;
const CONCURRENCY_REPORT_USAGE_FIELDS = [
  "search_request_count",
  "searchd_search_count",
  "source_detail_view_count",
  "transcript_selection_count",
  "cut_submission_count",
  "cut_success_count",
  "local_clip_count"
] as const;
const CONCURRENCY_REPORT_ZERO_USAGE_FIELDS = [
  "search_failure_count"
] as const;

interface ImageDimensions {
  width: number;
  height: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasPngSignature(bytes: Buffer): boolean {
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function hasJpegSignature(bytes: Buffer): boolean {
  return bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
}

function hasWebpSignature(bytes: Buffer): boolean {
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  if (!hasPngSignature(bytes) || bytes.length < 24 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    return null;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return null;
    }

    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) {
      return null;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }

    const isStartOfFrame = (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    );
    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (!hasWebpSignature(bytes) || bytes.length < 30) {
    return null;
  }

  const chunkType = bytes.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3)
    };
  }

  if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  if (
    chunkType === "VP8 " &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function readImageDimensions(bytes: Buffer, extension: string): ImageDimensions | null {
  if (extension === ".png") {
    return readPngDimensions(bytes);
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return readJpegDimensions(bytes);
  }
  if (extension === ".webp") {
    return readWebpDimensions(bytes);
  }
  return null;
}

export function artifactProvenanceCommitSha(evidence: unknown): string {
  if (!isRecord(evidence) || !isRecord(evidence.artifact_provenance)) {
    return "";
  }

  const commitSha = evidence.artifact_provenance.repository_commit_sha;
  return typeof commitSha === "string" ? commitSha.trim() : "";
}

function isRelativeArtifactPath(value: string): boolean {
  if (value.trim() === "") {
    return false;
  }

  return !path.isAbsolute(value)
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !/^\\\\/.test(value)
    && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isTextAttachmentPath(attachmentPath: string): boolean {
  return TEXT_ATTACHMENT_EXTENSIONS.has(path.extname(attachmentPath).toLowerCase());
}

function isPortableWorkspaceRelativePath(value: string): boolean {
  const trimmed = value.trim();
  if (!isRelativeArtifactPath(trimmed) || trimmed.includes("\\")) {
    return false;
  }

  const parts = trimmed.split("/");
  return parts.every((part) => part !== "" && part !== "..");
}

export function collectWindowsAttachmentPaths(evidence: unknown): AttachmentReference[] {
  if (!isRecord(evidence)) {
    return [];
  }

  const screenshotStems: Record<string, string> = {
    first_run_doctor_pass: "doctor-pass",
    engine_status: "engine-status",
    material_locator_playback: "material-locator",
    completed_cut_job: "cut-job",
    local_library_new_clip: "local-library"
  };

  return asRecords(evidence.environments).flatMap((environment) => {
    const screenshots = isRecord(environment.screenshots) ? environment.screenshots : {};
    const os = typeof environment.os === "string" ? environment.os : "";
    return Object.entries(screenshots)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([field, attachmentPath]) => {
        const attachment: AttachmentReference = {
          path: attachmentPath,
          kind: "screenshot",
          required_path_segment: os
        };
        const expectedFileStem = screenshotStems[field];
        if (expectedFileStem) {
          attachment.expected_file_stem = expectedFileStem;
        }
        return attachment;
      });
  });
}

export function collectNasAttachmentPaths(evidence: unknown): AttachmentReference[] {
  if (!isRecord(evidence)) {
    return [];
  }

  const evidenceFiles = isRecord(evidence.evidence_files) ? evidence.evidence_files : {};
  const deployment = isRecord(evidence.deployment) ? evidence.deployment : {};
  const countRefreshInterval = Number(deployment.preprocess_count_refresh_interval);
  const evidenceFileStems: Record<string, string> = {
    admin_web_screenshot: "admin-web",
    worker_log_excerpt: "worker",
    current_json_screenshot: "current-json",
    smb_permission_screenshot: "smb-permissions",
    multi_user_search_cut_report: "50-editor-report"
  };
  const attachments: AttachmentReference[] = [];

  for (const [field, value] of Object.entries(evidenceFiles)) {
    if (typeof value !== "string") {
      continue;
    }

    const attachment: AttachmentReference = {
      path: value,
      kind: field === "multi_user_search_cut_report"
        ? "concurrency-report"
        : field === "worker_log_excerpt"
          ? "worker-log"
          : "screenshot"
    };
    const expectedFileStem = evidenceFileStems[field];
    if (expectedFileStem) {
      attachment.expected_file_stem = expectedFileStem;
    }
    if (field === "worker_log_excerpt" && Number.isInteger(countRefreshInterval)) {
      attachment.expected_count_refresh_interval = countRefreshInterval;
    }
    attachments.push(attachment);
  }

  return attachments;
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${prefix}.${field} must be a finite number`);
    return Number.NaN;
  }

  return value;
}

function stringField(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${prefix}.${field} must be a non-empty string`);
    return "";
  }

  return value.trim();
}

function requireTrueField(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): void {
  if (record[field] !== true) {
    errors.push(`${prefix}.${field} must be true`);
  }
}

function requireFalseField(
  record: Record<string, unknown>,
  field: string,
  errors: string[],
  prefix: string
): void {
  if (record[field] !== false) {
    errors.push(`${prefix}.${field} must be false`);
  }
}

function requireAtLeast(
  value: number,
  minimum: number,
  errors: string[],
  field: string
): void {
  if (Number.isFinite(value) && value < minimum) {
    errors.push(`${field} must be at least ${minimum}`);
  }
}

function requireAtMost(
  value: number,
  maximum: number,
  errors: string[],
  field: string
): void {
  if (Number.isFinite(value) && value > maximum) {
    errors.push(`${field} must be <= ${maximum}ms`);
  }
}

function requireInteger(
  value: number,
  errors: string[],
  field: string
): void {
  if (Number.isFinite(value) && !Number.isInteger(value)) {
    errors.push(`${field} must be an integer`);
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateLatencyMetricSummary(
  metric: Record<string, unknown>,
  metricName: string,
  slaMs: number,
  errors: string[]
): void {
  const prefix = `concurrency_report.metrics.${metricName}`;
  const count = numberField(metric, "count", errors, prefix);
  const min = numberField(metric, "min_ms", errors, prefix);
  const p50 = numberField(metric, "p50_ms", errors, prefix);
  const p95 = numberField(metric, "p95_ms", errors, prefix);
  const max = numberField(metric, "max_ms", errors, prefix);

  requireAtLeast(count, NAS_CONCURRENCY_MIN_EDITOR_COUNT, errors, `${prefix}.count`);
  requireAtMost(p95, slaMs, errors, `${prefix}.p95_ms`);

  for (const [field, value] of [
    ["min_ms", min],
    ["p50_ms", p50],
    ["p95_ms", p95],
    ["max_ms", max]
  ] as const) {
    if (Number.isFinite(value) && value < 0) {
      errors.push(`${prefix}.${field} must be >= 0`);
    }
  }

  if (
    Number.isFinite(min) &&
    Number.isFinite(p50) &&
    Number.isFinite(p95) &&
    Number.isFinite(max) &&
    (min > p50 || p50 > p95 || p95 > max)
  ) {
    errors.push(`${prefix} latency summary must satisfy min_ms <= p50_ms <= p95_ms <= max_ms`);
  }
}

function validateConcurrencyReportSla(
  report: Record<string, unknown>,
  metricName: "search" | "detail" | "cut",
  errors: string[]
): number {
  const field = CONCURRENCY_REPORT_SLA_FIELDS[metricName];
  const value = numberField(report, field, errors, "concurrency_report");
  requireAtLeast(value, 1, errors, `concurrency_report.${field}`);
  requireAtMost(value, NAS_CONCURRENCY_P95_SLA_MS, errors, `concurrency_report.${field}`);
  return value;
}

function validateLatencyMetricsMatchEditorSessions(
  metrics: Record<string, unknown>,
  sessions: Record<string, unknown>[],
  errors: string[]
): void {
  const metricToSessionField = {
    search: "search_ms",
    detail: "detail_ms",
    cut: "cut_ms"
  } as const;

  for (const [metricName, sessionField] of Object.entries(metricToSessionField)) {
    const prefix = `concurrency_report.metrics.${metricName}`;
    const metric = isRecord(metrics[metricName]) ? metrics[metricName] : {};
    const count = typeof metric.count === "number" && Number.isFinite(metric.count)
      ? metric.count
      : Number.NaN;
    const max = typeof metric.max_ms === "number" && Number.isFinite(metric.max_ms)
      ? metric.max_ms
      : Number.NaN;

    if (Number.isFinite(count) && count !== sessions.length) {
      errors.push(`${prefix}.count must equal concurrency_report.editor_sessions length`);
    }

    const sessionDurations = sessions
      .map((session) => session[sessionField])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (Number.isFinite(max) && sessionDurations.length > 0 && max < Math.max(...sessionDurations)) {
      errors.push(`${prefix}.max_ms must be at least the maximum ${sessionField} in editor_sessions`);
    }
  }
}

function validateAggregateCountsMatchEditorSessions(
  editorCount: number,
  activeUserCount: number,
  distinctSourceVideoCount: number,
  usage: Record<string, unknown>,
  sessions: Record<string, unknown>[],
  errors: string[]
): void {
  const sessionCount = sessions.length;
  if (sessionCount === 0) {
    return;
  }

  if (Number.isFinite(editorCount) && editorCount !== sessionCount) {
    errors.push("concurrency_report.editor_count must equal concurrency_report.editor_sessions length");
  }
  if (Number.isFinite(activeUserCount) && activeUserCount !== sessionCount) {
    errors.push("concurrency_report.active_user_count must equal concurrency_report.editor_sessions length");
  }
  const uniqueSourceVideoCount = new Set(
    sessions
      .map((session) => session.source_video_id)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
  ).size;
  if (Number.isFinite(distinctSourceVideoCount) && distinctSourceVideoCount !== uniqueSourceVideoCount) {
    errors.push("concurrency_report.distinct_source_video_count must equal unique source_video_id values in editor_sessions");
  }
  if (Number.isFinite(distinctSourceVideoCount) && distinctSourceVideoCount < sessionCount) {
    errors.push("concurrency_report.distinct_source_video_count must be at least concurrency_report.editor_sessions length");
  }

  for (const field of CONCURRENCY_REPORT_USAGE_FIELDS) {
    const value = usage[field];
    const count = typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
    if (Number.isFinite(count) && count < sessionCount) {
      errors.push(`concurrency_report.metrics.usage.${field} must be at least concurrency_report.editor_sessions length`);
    }
  }
  for (const field of CONCURRENCY_REPORT_ZERO_USAGE_FIELDS) {
    const value = usage[field];
    const count = typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
    if (Number.isFinite(count) && count !== 0) {
      errors.push(`concurrency_report.metrics.usage.${field} must be 0`);
    }
  }
}

function validateEditorSessionProofs(
  report: Record<string, unknown>,
  editorCount: number,
  activeUserCount: number,
  expectedSearchIndexVersion: string,
  errors: string[]
): void {
  const requiredSessionCount = Math.max(
    NAS_CONCURRENCY_MIN_EDITOR_COUNT,
    Number.isFinite(editorCount) ? editorCount : 0,
    Number.isFinite(activeUserCount) ? activeUserCount : 0
  );
  const sessionsValue = report.editor_sessions;
  if (!Array.isArray(sessionsValue)) {
    errors.push("concurrency_report.editor_sessions must be an array");
    return;
  }

  const sessions = sessionsValue.filter(isRecord);
  if (sessions.length !== sessionsValue.length) {
    errors.push("concurrency_report.editor_sessions must contain only JSON objects");
  }
  if (sessions.length < requiredSessionCount) {
    errors.push(`concurrency_report.editor_sessions must include at least ${requiredSessionCount} sessions`);
  }

  const userIds = new Set<string>();
  const workspaceIds = new Set<string>();
  const sourceVideoIds = new Set<string>();
  const searchQueries = new Set<string>();
  for (const [index, session] of sessions.entries()) {
    const prefix = `concurrency_report.editor_sessions[${index}]`;
    const userId = stringField(session, "user_id", errors, prefix);
    stringField(session, "username", errors, prefix);
    const workspaceId = stringField(session, "workspace_id", errors, prefix);
    const sourceVideoId = stringField(session, "source_video_id", errors, prefix);
    const selectedSegmentId = stringField(session, "selected_segment_id", errors, prefix);
    const searchQuery = stringField(session, "search_query", errors, prefix);
    const searchResultSourceVideoId = stringField(session, "search_result_source_video_id", errors, prefix);
    const searchResultSegmentId = stringField(session, "search_result_segment_id", errors, prefix);
    const searchResultTextSha256 = stringField(session, "search_result_text_sha256", errors, prefix);
    const fullTranscriptSourceVideoId = stringField(session, "full_transcript_source_video_id", errors, prefix);
    const fullTranscriptSegmentId = stringField(session, "full_transcript_segment_id", errors, prefix);
    const fullTranscriptTextSha256 = stringField(session, "full_transcript_text_sha256", errors, prefix);
    const selectedTextSha256 = stringField(session, "selected_text_sha256", errors, prefix);
    const localClipId = stringField(session, "local_clip_id", errors, prefix);
    const localClipSourceVideoId = stringField(session, "local_clip_source_video_id", errors, prefix);
    const localClipSelectedTextSha256 = stringField(session, "local_clip_selected_text_sha256", errors, prefix);
    const localClipRelativePath = stringField(session, "local_clip_relative_path", errors, prefix);
    const localClipFileSizeBytes = numberField(session, "local_clip_file_size_bytes", errors, prefix);
    const localClipContentSha256 = stringField(session, "local_clip_content_sha256", errors, prefix);
    const searchBackend = stringField(session, "search_backend", errors, prefix);
    const searchIndexVersion = stringField(session, "search_index_version", errors, prefix);
    const searchResultBeginChar = numberField(session, "search_result_begin_char", errors, prefix);
    const searchResultEndChar = numberField(session, "search_result_end_char", errors, prefix);
    const fullTranscriptSegmentCount = numberField(session, "full_transcript_segment_count", errors, prefix);
    const fullTranscriptBeginChar = numberField(session, "full_transcript_begin_char", errors, prefix);
    const fullTranscriptEndChar = numberField(session, "full_transcript_end_char", errors, prefix);
    const fullTranscriptCharCount = numberField(session, "full_transcript_char_count", errors, prefix);
    const searchResultRank = numberField(session, "search_result_rank", errors, prefix);
    const searchResultGroupCount = numberField(session, "search_result_group_count", errors, prefix);
    const searchResultLimit = numberField(session, "search_result_limit", errors, prefix);
    const selectedTextBeginChar = numberField(session, "selected_text_begin_char", errors, prefix);
    const selectedTextEndChar = numberField(session, "selected_text_end_char", errors, prefix);
    const selectedTextCharCount = numberField(session, "selected_text_char_count", errors, prefix);
    const selectedBeginMs = numberField(session, "selected_begin_ms", errors, prefix);
    const selectedEndMs = numberField(session, "selected_end_ms", errors, prefix);
    const localClipBeginMs = numberField(session, "local_clip_begin_ms", errors, prefix);
    const localClipEndMs = numberField(session, "local_clip_end_ms", errors, prefix);

    requireInteger(searchResultBeginChar, errors, `${prefix}.search_result_begin_char`);
    requireInteger(searchResultEndChar, errors, `${prefix}.search_result_end_char`);
    requireInteger(fullTranscriptSegmentCount, errors, `${prefix}.full_transcript_segment_count`);
    requireInteger(fullTranscriptBeginChar, errors, `${prefix}.full_transcript_begin_char`);
    requireInteger(fullTranscriptEndChar, errors, `${prefix}.full_transcript_end_char`);
    requireInteger(fullTranscriptCharCount, errors, `${prefix}.full_transcript_char_count`);
    requireInteger(searchResultRank, errors, `${prefix}.search_result_rank`);
    requireInteger(searchResultGroupCount, errors, `${prefix}.search_result_group_count`);
    requireInteger(searchResultLimit, errors, `${prefix}.search_result_limit`);
    requireInteger(selectedTextBeginChar, errors, `${prefix}.selected_text_begin_char`);
    requireInteger(selectedTextEndChar, errors, `${prefix}.selected_text_end_char`);
    requireInteger(selectedTextCharCount, errors, `${prefix}.selected_text_char_count`);
    requireInteger(selectedBeginMs, errors, `${prefix}.selected_begin_ms`);
    requireInteger(selectedEndMs, errors, `${prefix}.selected_end_ms`);
    requireInteger(localClipFileSizeBytes, errors, `${prefix}.local_clip_file_size_bytes`);
    requireInteger(localClipBeginMs, errors, `${prefix}.local_clip_begin_ms`);
    requireInteger(localClipEndMs, errors, `${prefix}.local_clip_end_ms`);

    if (userId) {
      if (userIds.has(userId)) {
        errors.push(`${prefix}.user_id must be unique`);
      }
      userIds.add(userId);
    }
    if (workspaceId) {
      if (workspaceIds.has(workspaceId)) {
        errors.push(`${prefix}.workspace_id must be unique per editor`);
      }
      workspaceIds.add(workspaceId);
    }
    if (sourceVideoId) {
      sourceVideoIds.add(sourceVideoId);
    }
    if (searchQuery) {
      searchQueries.add(searchQuery.trim());
    }
    if (selectedTextSha256 && !/^[a-f0-9]{64}$/i.test(selectedTextSha256)) {
      errors.push(`${prefix}.selected_text_sha256 must be a 64-character sha256 hex digest`);
    }
    if (localClipSelectedTextSha256 && !/^[a-f0-9]{64}$/i.test(localClipSelectedTextSha256)) {
      errors.push(`${prefix}.local_clip_selected_text_sha256 must be a 64-character sha256 hex digest`);
    }
    if (localClipContentSha256 && !/^[a-f0-9]{64}$/i.test(localClipContentSha256)) {
      errors.push(`${prefix}.local_clip_content_sha256 must be a 64-character sha256 hex digest`);
    }
    if (
      selectedTextSha256 &&
      localClipSelectedTextSha256 &&
      localClipSelectedTextSha256.toLowerCase() !== selectedTextSha256.toLowerCase()
    ) {
      errors.push(`${prefix}.local_clip_selected_text_sha256 must equal selected_text_sha256`);
    }
    if (searchResultTextSha256 && !/^[a-f0-9]{64}$/i.test(searchResultTextSha256)) {
      errors.push(`${prefix}.search_result_text_sha256 must be a 64-character sha256 hex digest`);
    }
    if (fullTranscriptTextSha256 && !/^[a-f0-9]{64}$/i.test(fullTranscriptTextSha256)) {
      errors.push(`${prefix}.full_transcript_text_sha256 must be a 64-character sha256 hex digest`);
    }
    if (searchQuery && searchResultTextSha256 && searchResultTextSha256.toLowerCase() !== sha256Hex(searchQuery)) {
      errors.push(`${prefix}.search_result_text_sha256 must equal sha256(search_query)`);
    }
    if (Number.isFinite(searchResultLimit) && searchResultLimit < NAS_CONCURRENCY_MIN_EDITOR_COUNT) {
      errors.push(`${prefix}.search_result_limit must be at least ${NAS_CONCURRENCY_MIN_EDITOR_COUNT}`);
    }
    if (Number.isFinite(searchResultGroupCount) && searchResultGroupCount < NAS_CONCURRENCY_MIN_EDITOR_COUNT) {
      errors.push(`${prefix}.search_result_group_count must be at least ${NAS_CONCURRENCY_MIN_EDITOR_COUNT}`);
    }
    if (
      Number.isFinite(searchResultLimit) &&
      Number.isFinite(searchResultGroupCount) &&
      searchResultGroupCount < searchResultLimit
    ) {
      errors.push(`${prefix}.search_result_group_count must be at least search_result_limit`);
    }
    if (Number.isFinite(searchResultRank) && searchResultRank < 1) {
      errors.push(`${prefix}.search_result_rank must be at least 1`);
    }
    if (
      Number.isFinite(searchResultRank) &&
      Number.isFinite(searchResultGroupCount) &&
      searchResultRank > searchResultGroupCount
    ) {
      errors.push(`${prefix}.search_result_rank must be no greater than search_result_group_count`);
    }
    if (localClipId && !/^E[0-9A-Za-z_-]+$/.test(localClipId)) {
      errors.push(`${prefix}.local_clip_id must be a local clip id starting with E`);
    }
    if (sourceVideoId && localClipSourceVideoId && localClipSourceVideoId !== sourceVideoId) {
      errors.push(`${prefix}.local_clip_source_video_id must match source_video_id`);
    }
    if (localClipRelativePath && !isPortableWorkspaceRelativePath(localClipRelativePath)) {
      errors.push(`${prefix}.local_clip_relative_path must be a workspace-relative portable path`);
    }
    requireAtLeast(localClipFileSizeBytes, 1, errors, `${prefix}.local_clip_file_size_bytes`);
    if (searchBackend && searchBackend !== "searchd") {
      errors.push(`${prefix}.search_backend must be searchd`);
    }
    if (
      expectedSearchIndexVersion &&
      searchIndexVersion &&
      searchIndexVersion !== expectedSearchIndexVersion
    ) {
      errors.push(`${prefix}.search_index_version must equal concurrency_report.search_index_version`);
    }
    if (sourceVideoId && searchResultSourceVideoId && searchResultSourceVideoId !== sourceVideoId) {
      errors.push(`${prefix}.search_result_source_video_id must match source_video_id`);
    }
    if (sourceVideoId && fullTranscriptSourceVideoId && fullTranscriptSourceVideoId !== sourceVideoId) {
      errors.push(`${prefix}.full_transcript_source_video_id must match source_video_id`);
    }
    if (selectedSegmentId && searchResultSegmentId && searchResultSegmentId !== selectedSegmentId) {
      errors.push(`${prefix}.search_result_segment_id must match selected_segment_id`);
    }
    if (selectedSegmentId && fullTranscriptSegmentId && fullTranscriptSegmentId !== selectedSegmentId) {
      errors.push(`${prefix}.full_transcript_segment_id must match selected_segment_id`);
    }
    if (Number.isFinite(searchResultBeginChar) && searchResultBeginChar < 0) {
      errors.push(`${prefix}.search_result_begin_char must be >= 0`);
    }
    if (
      Number.isFinite(searchResultBeginChar) &&
      Number.isFinite(searchResultEndChar) &&
      searchResultEndChar <= searchResultBeginChar
    ) {
      errors.push(`${prefix}.search_result_end_char must be greater than search_result_begin_char`);
    }
    if (Number.isFinite(fullTranscriptBeginChar) && fullTranscriptBeginChar < 0) {
      errors.push(`${prefix}.full_transcript_begin_char must be >= 0`);
    }
    if (
      Number.isFinite(fullTranscriptSegmentCount) &&
      fullTranscriptSegmentCount < NAS_CONCURRENCY_MIN_FULL_TRANSCRIPT_SEGMENT_COUNT
    ) {
      errors.push(
        `${prefix}.full_transcript_segment_count must be at least `
        + `${NAS_CONCURRENCY_MIN_FULL_TRANSCRIPT_SEGMENT_COUNT}`
      );
    }
    if (
      Number.isFinite(fullTranscriptBeginChar) &&
      Number.isFinite(fullTranscriptEndChar) &&
      fullTranscriptEndChar <= fullTranscriptBeginChar
    ) {
      errors.push(`${prefix}.full_transcript_end_char must be greater than full_transcript_begin_char`);
    }
    if (
      Number.isFinite(fullTranscriptBeginChar) &&
      Number.isFinite(fullTranscriptEndChar) &&
      Number.isFinite(fullTranscriptCharCount) &&
      fullTranscriptCharCount !== fullTranscriptEndChar - fullTranscriptBeginChar
    ) {
      errors.push(`${prefix}.full_transcript_char_count must equal full_transcript_end_char - full_transcript_begin_char`);
    }
    if (
      Number.isFinite(searchResultBeginChar) &&
      Number.isFinite(searchResultEndChar) &&
      Number.isFinite(fullTranscriptBeginChar) &&
      Number.isFinite(fullTranscriptEndChar) &&
      (searchResultBeginChar < fullTranscriptBeginChar || searchResultEndChar > fullTranscriptEndChar)
    ) {
      errors.push(`${prefix}.search_result character range must fall within full_transcript character offsets`);
    }
    if (
      searchQuery &&
      Number.isFinite(searchResultBeginChar) &&
      Number.isFinite(searchResultEndChar) &&
      searchResultEndChar - searchResultBeginChar !== searchQuery.length
    ) {
      errors.push(`${prefix}.search_result character range length must equal search_query length`);
    }
    if (
      Number.isFinite(selectedTextBeginChar) &&
      Number.isFinite(selectedTextEndChar) &&
      selectedTextEndChar <= selectedTextBeginChar
    ) {
      errors.push(`${prefix}.selected_text_end_char must be greater than selected_text_begin_char`);
    }
    if (
      Number.isFinite(selectedTextBeginChar) &&
      Number.isFinite(selectedTextEndChar) &&
      Number.isFinite(fullTranscriptBeginChar) &&
      Number.isFinite(fullTranscriptEndChar) &&
      (selectedTextBeginChar < fullTranscriptBeginChar || selectedTextEndChar > fullTranscriptEndChar)
    ) {
      errors.push(`${prefix}.selected_text character range must fall within full_transcript character offsets`);
    }
    if (
      Number.isFinite(selectedTextBeginChar) &&
      Number.isFinite(selectedTextEndChar) &&
      Number.isFinite(searchResultBeginChar) &&
      Number.isFinite(searchResultEndChar) &&
      (selectedTextBeginChar > searchResultBeginChar || selectedTextEndChar < searchResultEndChar)
    ) {
      errors.push(`${prefix}.selected_text character range must include the search_result character range`);
    }
    if (
      Number.isFinite(selectedTextBeginChar) &&
      Number.isFinite(selectedTextEndChar) &&
      Number.isFinite(selectedTextCharCount) &&
      selectedTextCharCount !== selectedTextEndChar - selectedTextBeginChar
    ) {
      errors.push(`${prefix}.selected_text_char_count must equal selected_text_end_char - selected_text_begin_char`);
    }
    if (searchQuery && Number.isFinite(selectedTextCharCount) && selectedTextCharCount < searchQuery.length) {
      errors.push(`${prefix}.selected_text_char_count must be at least search_query length`);
    }
    if (
      Number.isFinite(fullTranscriptCharCount) &&
      Number.isFinite(selectedTextCharCount) &&
      fullTranscriptCharCount <= selectedTextCharCount
    ) {
      errors.push(`${prefix}.full_transcript_char_count must be greater than selected_text_char_count`);
    }
    if (Number.isFinite(selectedBeginMs) && selectedBeginMs < 0) {
      errors.push(`${prefix}.selected_begin_ms must be >= 0`);
    }
    if (
      Number.isFinite(selectedBeginMs) &&
      Number.isFinite(selectedEndMs) &&
      selectedEndMs <= selectedBeginMs
    ) {
      errors.push(`${prefix}.selected_end_ms must be greater than selected_begin_ms`);
    }
    if (Number.isFinite(localClipBeginMs) && localClipBeginMs < 0) {
      errors.push(`${prefix}.local_clip_begin_ms must be >= 0`);
    }
    if (
      Number.isFinite(localClipBeginMs) &&
      Number.isFinite(localClipEndMs) &&
      localClipEndMs <= localClipBeginMs
    ) {
      errors.push(`${prefix}.local_clip_end_ms must be greater than local_clip_begin_ms`);
    }
    if (
      Number.isFinite(selectedBeginMs) &&
      Number.isFinite(localClipBeginMs) &&
      localClipBeginMs !== selectedBeginMs
    ) {
      errors.push(`${prefix}.local_clip_begin_ms must equal selected_begin_ms`);
    }
    if (
      Number.isFinite(selectedEndMs) &&
      Number.isFinite(localClipEndMs) &&
      localClipEndMs !== selectedEndMs
    ) {
      errors.push(`${prefix}.local_clip_end_ms must equal selected_end_ms`);
    }

    requireTrueField(session, "location_verified", errors, prefix);
    requireTrueField(session, "completed_closed_loop", errors, prefix);
    requireTrueField(session, "workspace_output_written", errors, prefix);
    requireFalseField(session, "public_library_written", errors, prefix);
    for (const field of ["search_ms", "detail_ms", "cut_ms"]) {
      const value = numberField(session, field, errors, prefix);
      if (Number.isFinite(value) && value < 0) {
        errors.push(`${prefix}.${field} must be >= 0`);
      }
    }
  }

  if (userIds.size < requiredSessionCount) {
    errors.push(`concurrency_report.editor_sessions must include at least ${requiredSessionCount} unique user_id values`);
  }
  if (workspaceIds.size < requiredSessionCount) {
    errors.push(`concurrency_report.editor_sessions must include at least ${requiredSessionCount} unique workspace_id values`);
  }
  if (sourceVideoIds.size < requiredSessionCount) {
    errors.push(`concurrency_report.editor_sessions must include at least ${requiredSessionCount} unique source_video_id values`);
  }
  if (searchQueries.size < NAS_CONCURRENCY_MIN_SEARCH_QUERY_COUNT) {
    errors.push(
      `concurrency_report.editor_sessions must cover at least ${NAS_CONCURRENCY_MIN_SEARCH_QUERY_COUNT} unique search_query values`
    );
  }
  const searchQueryCount = numberField(report, "search_query_count", errors, "concurrency_report");
  if (Number.isFinite(searchQueryCount) && searchQueryCount !== searchQueries.size) {
    errors.push("concurrency_report.search_query_count must equal the distinct search_query count");
  }
  if (!Array.isArray(report.search_queries)) {
    errors.push("concurrency_report.search_queries must list the distinct search_query values");
  } else {
    const listedQueries = new Set(
      report.search_queries
        .filter((query): query is string => typeof query === "string" && query.trim().length > 0)
        .map((query) => query.trim())
    );
    if (listedQueries.size !== searchQueries.size) {
      errors.push("concurrency_report.search_queries must contain each distinct search_query exactly once");
    }
    for (const query of searchQueries) {
      if (!listedQueries.has(query)) {
        errors.push(`concurrency_report.search_queries must include search query ${query}`);
      }
    }
  }
}

async function validateScreenshotAttachment(
  resolvedPath: string,
  attachmentPath: string
): Promise<string[]> {
  const extension = path.extname(attachmentPath).toLowerCase();
  if (![".jpeg", ".jpg", ".png", ".webp"].includes(extension)) {
    return [`screenshot attachment must be .png, .jpg, .jpeg, or .webp: ${attachmentPath}`];
  }

  const bytes = await readFile(resolvedPath);
  if (
    (extension === ".png" && !hasPngSignature(bytes))
    || ((extension === ".jpg" || extension === ".jpeg") && !hasJpegSignature(bytes))
    || (extension === ".webp" && !hasWebpSignature(bytes))
  ) {
    return [`screenshot attachment has invalid file signature: ${attachmentPath}`];
  }

  const dimensions = readImageDimensions(bytes, extension);
  if (!dimensions) {
    return [`screenshot attachment dimensions could not be read: ${attachmentPath}`];
  }
  if (dimensions.width < MIN_SCREENSHOT_WIDTH || dimensions.height < MIN_SCREENSHOT_HEIGHT) {
    return [
      `screenshot attachment must be at least ${MIN_SCREENSHOT_WIDTH}x${MIN_SCREENSHOT_HEIGHT}: ${attachmentPath} (${dimensions.width}x${dimensions.height})`
    ];
  }

  return [];
}

async function validateTextAttachment(
  resolvedPath: string,
  attachmentPath: string
): Promise<string[]> {
  const errors: string[] = [];
  const text = await readFile(resolvedPath, "utf8");
  for (const pattern of TEXT_ATTACHMENT_FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(`text attachment contains forbidden secret/private data: ${attachmentPath}`);
      break;
    }
  }

  if (path.extname(attachmentPath).toLowerCase() === ".json") {
    try {
      JSON.parse(text);
    } catch {
      errors.push(`JSON attachment must parse as valid JSON: ${attachmentPath}`);
    }
  }

  return errors;
}

async function validateWorkerLogAttachment(
  resolvedPath: string,
  attachmentPath: string,
  expectedCountRefreshInterval: number | undefined
): Promise<string[]> {
  const errors = await validateTextAttachment(resolvedPath, attachmentPath);
  const text = await readFile(resolvedPath, "utf8");

  if (
    expectedCountRefreshInterval === undefined ||
    !Number.isInteger(expectedCountRefreshInterval) ||
    expectedCountRefreshInterval < 1
  ) {
    errors.push(`worker log cannot be matched without deployment.preprocess_count_refresh_interval: ${attachmentPath}`);
    return errors;
  }

  const countRefreshPattern = new RegExp(
    `"count_refresh_interval"\\s*:\\s*${expectedCountRefreshInterval}(?:\\D|$)`
  );
  if (!countRefreshPattern.test(text)) {
    errors.push(
      `worker log must include count_refresh_interval matching deployment.preprocess_count_refresh_interval (${expectedCountRefreshInterval}): ${attachmentPath}`
    );
  }

  return errors;
}

async function validateConcurrencyReportAttachment(
  resolvedPath: string,
  attachmentPath: string
): Promise<string[]> {
  const errors = await validateTextAttachment(resolvedPath, attachmentPath);
  let report: unknown;

  try {
    report = JSON.parse(await readFile(resolvedPath, "utf8")) as unknown;
  } catch {
    if (!errors.some((error) => error.includes("JSON attachment must parse"))) {
      errors.push(`JSON attachment must parse as valid JSON: ${attachmentPath}`);
    }
    return errors;
  }

  if (!isRecord(report)) {
    return [...errors, `concurrency report must be a JSON object: ${attachmentPath}`];
  }

  for (const field of FORBIDDEN_CONCURRENCY_REPORT_RUN_ROOT_FIELDS) {
    if (field in report) {
      errors.push(`concurrency_report.${field} must not be included in portable target evidence`);
    }
  }

  if (report.status !== "passed") {
    errors.push("concurrency report status must be passed");
  }
  for (const field of REQUIRED_CONCURRENCY_REPORT_TRUE_FIELDS) {
    requireTrueField(report, field, errors, "concurrency_report");
  }

  const editorCount = numberField(report, "editor_count", errors, "concurrency_report");
  const activeUserCount = numberField(report, "active_user_count", errors, "concurrency_report");
  const distinctSourceVideoCount = numberField(report, "distinct_source_video_count", errors, "concurrency_report");
  const indexedSourceVideoCount = numberField(report, "indexed_source_video_count", errors, "concurrency_report");
  const indexedTranscriptSegmentCount = numberField(report, "indexed_transcript_segment_count", errors, "concurrency_report");
  const searchIndexVersion = stringField(report, "search_index_version", errors, "concurrency_report");
  const searchdHealthIndexVersion = stringField(
    report,
    "searchd_health_index_version",
    errors,
    "concurrency_report"
  );
  const searchdHealthSourceVideoCount = numberField(
    report,
    "searchd_health_source_video_count",
    errors,
    "concurrency_report"
  );
  const searchdHealthSegmentCount = numberField(
    report,
    "searchd_health_segment_count",
    errors,
    "concurrency_report"
  );

  requireAtLeast(editorCount, NAS_CONCURRENCY_MIN_EDITOR_COUNT, errors, "concurrency_report.editor_count");
  requireAtLeast(activeUserCount, NAS_CONCURRENCY_MIN_EDITOR_COUNT, errors, "concurrency_report.active_user_count");
  requireAtLeast(
    distinctSourceVideoCount,
    NAS_CONCURRENCY_MIN_EDITOR_COUNT,
    errors,
    "concurrency_report.distinct_source_video_count"
  );
  requireAtLeast(
    indexedSourceVideoCount,
    NAS_CONCURRENCY_MIN_INDEXED_SOURCE_VIDEO_COUNT,
    errors,
    "concurrency_report.indexed_source_video_count"
  );
  requireAtLeast(
    indexedTranscriptSegmentCount,
    NAS_CONCURRENCY_MIN_INDEXED_TRANSCRIPT_SEGMENT_COUNT,
    errors,
    "concurrency_report.indexed_transcript_segment_count"
  );
  requireInteger(
    indexedSourceVideoCount,
    errors,
    "concurrency_report.indexed_source_video_count"
  );
  requireInteger(
    indexedTranscriptSegmentCount,
    errors,
    "concurrency_report.indexed_transcript_segment_count"
  );
  requireInteger(
    searchdHealthSourceVideoCount,
    errors,
    "concurrency_report.searchd_health_source_video_count"
  );
  requireInteger(
    searchdHealthSegmentCount,
    errors,
    "concurrency_report.searchd_health_segment_count"
  );
  if (
    searchIndexVersion &&
    searchdHealthIndexVersion &&
    searchdHealthIndexVersion !== searchIndexVersion
  ) {
    errors.push("concurrency_report.searchd_health_index_version must equal concurrency_report.search_index_version");
  }
  if (
    Number.isFinite(searchdHealthSourceVideoCount) &&
    Number.isFinite(indexedSourceVideoCount) &&
    searchdHealthSourceVideoCount !== indexedSourceVideoCount
  ) {
    errors.push(
      "concurrency_report.searchd_health_source_video_count must equal concurrency_report.indexed_source_video_count"
    );
  }
  if (
    Number.isFinite(searchdHealthSegmentCount) &&
    Number.isFinite(indexedTranscriptSegmentCount) &&
    searchdHealthSegmentCount !== indexedTranscriptSegmentCount
  ) {
    errors.push(
      "concurrency_report.searchd_health_segment_count must equal concurrency_report.indexed_transcript_segment_count"
    );
  }

  const metrics = isRecord(report.metrics) ? report.metrics : {};
  for (const metricName of ["search", "detail", "cut"] as const) {
    const metric = isRecord(metrics[metricName]) ? metrics[metricName] : {};
    const slaMs = validateConcurrencyReportSla(report, metricName, errors);
    validateLatencyMetricSummary(metric, metricName, slaMs, errors);
  }

  const usage = isRecord(metrics.usage) ? metrics.usage : {};
  for (const field of CONCURRENCY_REPORT_USAGE_FIELDS) {
    requireAtLeast(
      numberField(usage, field, errors, "concurrency_report.metrics.usage"),
      NAS_CONCURRENCY_MIN_EDITOR_COUNT,
      errors,
      `concurrency_report.metrics.usage.${field}`
    );
  }
  for (const field of CONCURRENCY_REPORT_ZERO_USAGE_FIELDS) {
    const count = numberField(usage, field, errors, "concurrency_report.metrics.usage");
    if (Number.isFinite(count) && count !== 0) {
      errors.push(`concurrency_report.metrics.usage.${field} must be 0`);
    }
  }

  const editorSessions = asRecords(report.editor_sessions);
  validateEditorSessionProofs(report, editorCount, activeUserCount, searchIndexVersion, errors);
  validateAggregateCountsMatchEditorSessions(
    editorCount,
    activeUserCount,
    distinctSourceVideoCount,
    usage,
    editorSessions,
    errors
  );
  validateLatencyMetricsMatchEditorSessions(metrics, editorSessions, errors);

  return errors;
}

export async function validateReferencedAttachments(
  evidencePath: string,
  attachments: AttachmentReference[]
): Promise<string[]> {
  const errors: string[] = [];
  const baseDir = path.dirname(path.resolve(evidencePath));
  const basePrefix = `${baseDir}${path.sep}`;
  const seen = new Set<string>();

  for (const attachment of attachments) {
    const attachmentPath = attachment.path;
    if (!isRelativeArtifactPath(attachmentPath)) {
      errors.push(`attachment path must be repository-relative to the evidence file: ${attachmentPath}`);
      continue;
    }
    if (attachmentPath.includes("\\")) {
      errors.push(`attachment path must use forward slashes: ${attachmentPath}`);
      continue;
    }

    const resolvedPath = path.resolve(baseDir, attachmentPath);
    if (!resolvedPath.startsWith(basePrefix)) {
      errors.push(`attachment path must not leave the evidence directory: ${attachmentPath}`);
      continue;
    }

    if (seen.has(resolvedPath)) {
      errors.push(`attachment path is referenced more than once: ${attachmentPath}`);
      continue;
    }
    seen.add(resolvedPath);

    const normalizedAttachmentPath = path.relative(baseDir, resolvedPath);
    if (
      attachment.required_path_segment &&
      !normalizedAttachmentPath.split(path.sep).includes(attachment.required_path_segment)
    ) {
      errors.push(`attachment path must include ${attachment.required_path_segment}: ${attachmentPath}`);
      continue;
    }

    if (attachment.expected_file_stem) {
      const basename = path.basename(normalizedAttachmentPath);
      const extension = path.extname(basename);
      const fileStem = basename.slice(0, basename.length - extension.length).toLowerCase();
      if (fileStem !== attachment.expected_file_stem.toLowerCase()) {
        errors.push(`attachment filename must be ${attachment.expected_file_stem}: ${attachmentPath}`);
        continue;
      }
    }

    try {
      const stats = await stat(resolvedPath);
      if (!stats.isFile()) {
        errors.push(`attachment path must point to a file: ${attachmentPath}`);
        continue;
      }

      if (stats.size === 0) {
        errors.push(`attachment file must not be empty: ${attachmentPath}`);
        continue;
      }

      if (attachment.kind === "screenshot") {
        errors.push(...await validateScreenshotAttachment(resolvedPath, attachmentPath));
      } else if (attachment.kind === "concurrency-report") {
        errors.push(...await validateConcurrencyReportAttachment(resolvedPath, attachmentPath));
      } else if (attachment.kind === "worker-log") {
        errors.push(...await validateWorkerLogAttachment(
          resolvedPath,
          attachmentPath,
          attachment.expected_count_refresh_interval
        ));
      } else if (attachment.kind === "text" || isTextAttachmentPath(attachmentPath)) {
        errors.push(...await validateTextAttachment(resolvedPath, attachmentPath));
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        errors.push(`attachment file is missing: ${attachmentPath}`);
        continue;
      }

      errors.push(`attachment file could not be read: ${attachmentPath}`);
    }
  }

  return errors;
}
