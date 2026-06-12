#!/bin/sh
set -eu

EVIDENCE_PATH="${1:-./nas-acc-009.json}"

if [ ! -f "$EVIDENCE_PATH" ]; then
  echo "Evidence file is missing: $EVIDENCE_PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required for this read-only self-check. The collector can still run, but copy evidence back to the repository for validation." >&2
  exit 2
fi

node - "$EVIDENCE_PATH" <<'NODE'
const fs = require("fs");
const path = require("path");

const evidencePath = process.argv[2];
const evidenceDir = path.dirname(path.resolve(evidencePath));
const issues = [];
const MIN_SCREENSHOT_WIDTH = 640;
const MIN_SCREENSHOT_HEIGHT = 360;
const SCREENSHOT_EVIDENCE_FIELDS = new Set([
  "admin_web_screenshot",
  "current_json_screenshot",
  "smb_permission_screenshot"
]);

function issue(message) {
  issues.push(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scanDraftMarkers(value, label) {
  if (value === null || value === undefined) {
    issue(label + " is null");
    return;
  }

  if (typeof value === "string") {
    if (value.trim() === "") issue(label + " is empty");
    return;
  }

  if (typeof value === "boolean") {
    if (!value) issue(label + " is false");
    return;
  }

  if (typeof value === "number") {
    if (value === 0) issue(label + " is zero");
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanDraftMarkers(item, label + "[" + index + "]"));
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      scanDraftMarkers(child, label + "." + key);
    }
  }
}

function portableAttachmentPath(reference, label) {
  if (typeof reference !== "string" || reference.trim() === "") {
    issue(label + " attachment path is empty");
    return null;
  }
  if (path.isAbsolute(reference) || reference.includes("\\") || reference.includes("..")) {
    issue(label + " attachment path is not portable: " + reference);
    return null;
  }
  return path.join(evidenceDir, reference);
}

function checkAttachment(reference, label) {
  const fullPath = portableAttachmentPath(reference, label);
  if (!fullPath) return null;
  if (!fs.existsSync(fullPath)) {
    issue(label + " attachment is missing: " + reference);
    return null;
  }
  if (fs.statSync(fullPath).size <= 0) {
    issue(label + " attachment is empty: " + reference);
  }
  return fullPath;
}

function hasPngSignature(bytes) {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
}

function hasJpegSignature(bytes) {
  return bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
}

function hasWebpSignature(bytes) {
  return bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function readPngDimensions(bytes) {
  if (!hasPngSignature(bytes) || bytes.length < 24 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    return null;
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function readJpegDimensions(bytes) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
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

function readWebpDimensions(bytes) {
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

function readImageDimensions(bytes, extension) {
  if (extension === ".png") return readPngDimensions(bytes);
  if (extension === ".jpg" || extension === ".jpeg") return readJpegDimensions(bytes);
  if (extension === ".webp") return readWebpDimensions(bytes);
  return null;
}

function checkScreenshotAttachment(filePath, label) {
  if (!filePath) return;
  const extension = path.extname(filePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    issue(label + " screenshot must use .png, .jpg, .jpeg, or .webp");
    return;
  }
  const bytes = fs.readFileSync(filePath);
  const dimensions = readImageDimensions(bytes, extension);
  if (!dimensions) {
    issue(label + " screenshot must be a real PNG/JPEG/WebP image with readable dimensions");
    return;
  }
  if (dimensions.width < MIN_SCREENSHOT_WIDTH || dimensions.height < MIN_SCREENSHOT_HEIGHT) {
    issue(
      label + " screenshot must be at least " +
      MIN_SCREENSHOT_WIDTH + "x" + MIN_SCREENSHOT_HEIGHT +
      " but was " + dimensions.width + "x" + dimensions.height
    );
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issue(label + " must parse as JSON: " + error.message);
    return undefined;
  }
}

const evidence = readJson(evidencePath, "nas evidence");
if (!evidence) process.exit(1);

if (evidence.acceptance_id !== "ACC-009") {
  issue("acceptance_id must be ACC-009");
}

scanDraftMarkers(evidence, "evidence");

const adminSourceVideosUi = isPlainObject(evidence.admin_source_videos_ui)
  ? evidence.admin_source_videos_ui
  : {};
if (!/^V\d{6}$/.test(String(adminSourceVideosUi.first_source_video_id || ""))) {
  issue("admin_source_videos_ui.first_source_video_id must look like V000001");
}
if (!/^V\d{6}$/.test(String(adminSourceVideosUi.query_result_id || ""))) {
  issue("admin_source_videos_ui.query_result_id must look like V000001");
}
if (
  Number(adminSourceVideosUi.loaded_count_after) <= Number(adminSourceVideosUi.loaded_count_before)
) {
  issue("admin_source_videos_ui.loaded_count_after must be greater than loaded_count_before");
}

const evidenceFiles = isPlainObject(evidence.evidence_files) ? evidence.evidence_files : {};
const attachmentPaths = {};
for (const [field, reference] of Object.entries(evidenceFiles)) {
  attachmentPaths[field] = checkAttachment(reference, "evidence_files." + field);
  if (SCREENSHOT_EVIDENCE_FIELDS.has(field)) {
    checkScreenshotAttachment(attachmentPaths[field], "evidence_files." + field);
  }
}

const reportPath = attachmentPaths.multi_user_search_cut_report;
if (reportPath && fs.existsSync(reportPath)) {
  const report = readJson(reportPath, "50-editor report");
  if (report) {
    if (report.status !== "passed") issue("50-editor report status must be passed");
    if (!Array.isArray(report.editor_sessions) || report.editor_sessions.length < 50) {
      issue("50-editor report must include at least 50 editor_sessions");
    }
    if (report.indexed_source_video_count < 2000) issue("50-editor report indexed_source_video_count must be at least 2000");
    if (report.indexed_transcript_segment_count < 48000) issue("50-editor report indexed_transcript_segment_count must be at least 48000");
    if (report.searchd_health_index_version !== report.search_index_version) {
      issue("50-editor report searchd_health_index_version must equal search_index_version");
    }
    if (report.searchd_health_source_video_count !== report.indexed_source_video_count) {
      issue("50-editor report searchd_health_source_video_count must equal indexed_source_video_count");
    }
    if (report.searchd_health_segment_count !== report.indexed_transcript_segment_count) {
      issue("50-editor report searchd_health_segment_count must equal indexed_transcript_segment_count");
    }
    if (report.metrics?.usage?.search_failure_count !== 0) {
      issue("50-editor report metrics.usage.search_failure_count must be 0");
    }
    for (const flag of [
      "all_searches_passed",
      "all_cuts_written_to_local_workspaces",
      "public_library_not_written_by_cutters",
      "no_cross_workspace_outputs"
    ]) {
      if (report[flag] !== true) issue("50-editor report " + flag + " must be true");
    }
    for (const forbidden of ["library_root", "workspace_root", "searchd_cache_root"]) {
      if (Object.prototype.hasOwnProperty.call(report, forbidden)) {
        issue("50-editor report must not include target run root field " + forbidden);
      }
    }
    if (Array.isArray(report.editor_sessions)) {
      const userIds = new Set();
      const workspaceIds = new Set();
      const sourceVideoIds = new Set();
      const searchQueries = new Set();
      for (const session of report.editor_sessions) {
        if (session && typeof session.user_id === "string" && session.user_id) userIds.add(session.user_id);
        if (session && typeof session.workspace_id === "string" && session.workspace_id) workspaceIds.add(session.workspace_id);
        if (session && typeof session.source_video_id === "string" && session.source_video_id) sourceVideoIds.add(session.source_video_id);
        if (session && typeof session.search_query === "string" && session.search_query.trim()) {
          searchQueries.add(session.search_query.trim());
        }
      }
      if (userIds.size < 50) issue("50-editor report must include at least 50 unique user_id values");
      if (workspaceIds.size < 50) issue("50-editor report must include at least 50 unique workspace_id values");
      if (sourceVideoIds.size < 50) issue("50-editor report must include at least 50 distinct source_video_id values");
      if (searchQueries.size < 5) issue("50-editor report must include at least 5 distinct search_query values");
      if (report.search_query_count !== searchQueries.size) issue("50-editor report search_query_count must equal distinct search_query count");
      if (!Array.isArray(report.search_queries)) {
        issue("50-editor report search_queries must list distinct search_query values");
      } else {
        const listedQueries = new Set(report.search_queries.filter((query) =>
          typeof query === "string" && query.trim()
        ).map((query) => query.trim()));
        if (listedQueries.size !== searchQueries.size) {
          issue("50-editor report search_queries must contain each distinct search_query exactly once");
        }
        for (const query of searchQueries) {
          if (!listedQueries.has(query)) issue("50-editor report search_queries must include " + query);
        }
      }
    }
  }
}

if (issues.length > 0) {
  console.log("ACC-009 target-side self-check found " + issues.length + " issue(s):");
  for (const item of issues.slice(0, 100)) console.log("- " + item);
  if (issues.length > 100) console.log("- ... " + (issues.length - 100) + " more");
  process.exit(1);
}

console.log("ACC-009 target-side self-check found no draft markers, missing attachments, fake/undersized screenshots, or obvious 50-editor report gaps.");
console.log("Copy nas-acc-009.json plus evidence/ back to the repository and run npm run validate:target-evidence.");
NODE
