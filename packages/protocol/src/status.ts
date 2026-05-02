import type {
  CutMode,
  ExportClipManifest,
  LibraryCountValidationResult,
  LibraryCounts,
  LocalClipManifest,
  SourceVideoManifest,
  ValidationResult
} from "./types.ts";

const CUT_MODES = new Set<CutMode>(["copy", "smart", "precise"]);

export function isVideoVisibleToCutters(video: SourceVideoManifest): boolean {
  return video.preprocess_status === "ready" && video.visible_to_cutters === true;
}

function isPortablePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");

  if (normalized.startsWith("library://")) {
    const rest = normalized.slice("library://".length);
    return rest.trim() !== "" && !rest.split("/").filter(Boolean).includes("..");
  }

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return false;
  }

  return !normalized.split("/").filter(Boolean).includes("..");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function validatePositiveOrZeroInteger(value: unknown, field: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) < 0) {
    errors.push(`${field} must be a non-negative integer`);
  }
}

function validateCutMode(value: unknown, errors: string[]): void {
  if (typeof value !== "string" || !CUT_MODES.has(value as CutMode)) {
    errors.push("cut_mode must be copy, smart, or precise");
  }
}

function validateOptionalTextField(
  value: unknown,
  field: string,
  errors: string[]
): void {
  if (value !== undefined && !isNonEmptyString(value)) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function validatePublicMetadata(manifest: SourceVideoManifest, errors: string[]): void {
  validateOptionalTextField(manifest.description, "description", errors);
  validateOptionalTextField(manifest.lecturer, "lecturer", errors);
  validateOptionalTextField(manifest.course, "course", errors);
  validateOptionalTextField(manifest.category, "category", errors);

  if (
    manifest.tags !== undefined &&
    (!Array.isArray(manifest.tags) ||
      manifest.tags.length === 0 ||
      manifest.tags.some((tag) => !isNonEmptyString(tag)))
  ) {
    errors.push("tags must contain non-empty strings");
  }
}

export function validateSourceVideoManifest(manifest: SourceVideoManifest): ValidationResult {
  const errors: string[] = [];

  if (manifest.visible_to_cutters && manifest.preprocess_status !== "ready") {
    errors.push("visible_to_cutters=true requires preprocess_status=ready");
  }

  if (manifest.preprocess_status === "ready") {
    for (const key of [
      "transcript_path",
      "srt_path",
      "keyframes_path",
      "cover_path"
    ] as const) {
      if (manifest[key].trim() === "") {
        errors.push(`ready video requires ${key}`);
      }
    }
  }

  for (const key of [
    "relative_path",
    "transcript_path",
    "srt_path",
    "keyframes_path",
    "cover_path"
  ] as const) {
    const value = manifest[key];

    if (value.trim() !== "" && !isPortablePath(value)) {
      errors.push(`${key} must be portable and must not be absolute or traversal`);
    }
  }

  validatePublicMetadata(manifest, errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateLocalClipManifest(
  manifest: LocalClipManifest
): ValidationResult {
  const errors: string[] = [];

  if (!/^LC\d{6}$/.test(manifest.local_clip_id)) {
    errors.push("local_clip_id must use LC000001 format");
  }

  for (const key of [
    "title",
    "source_video_id",
    "source_title",
    "source_relative_path",
    "selected_text",
    "created_at"
  ] as const) {
    if (!isNonEmptyString(manifest[key])) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  validatePositiveOrZeroInteger(manifest.begin_ms, "begin_ms", errors);
  validatePositiveOrZeroInteger(manifest.end_ms, "end_ms", errors);
  validatePositiveOrZeroInteger(manifest.duration_ms, "duration_ms", errors);

  if (manifest.end_ms <= manifest.begin_ms) {
    errors.push("end_ms must be greater than begin_ms");
  }

  if (manifest.duration_ms !== manifest.end_ms - manifest.begin_ms) {
    errors.push("duration_ms must equal end_ms - begin_ms");
  }

  if (!isPortablePath(manifest.source_relative_path)) {
    errors.push("source_relative_path must be portable");
  }

  if (!isPortablePath(manifest.media_path)) {
    errors.push("media_path must be portable");
  }

  validateCutMode(manifest.cut_mode, errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateExportClipManifest(
  manifest: ExportClipManifest
): ValidationResult {
  const errors: string[] = [];

  if (!/^E\d{6}$/.test(manifest.export_clip_id)) {
    errors.push("export_clip_id must use E000001 format");
  }

  for (const key of [
    "library_id",
    "source_video_id",
    "source_title",
    "selected_text",
    "created_at"
  ] as const) {
    if (!isNonEmptyString(manifest[key])) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  validatePositiveOrZeroInteger(manifest.begin_ms, "begin_ms", errors);
  validatePositiveOrZeroInteger(manifest.end_ms, "end_ms", errors);

  if (manifest.end_ms <= manifest.begin_ms) {
    errors.push("end_ms must be greater than begin_ms");
  }

  if (!isPortablePath(manifest.output_file)) {
    errors.push("output_file must be portable");
  }

  validateCutMode(manifest.cut_mode, errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateLibraryCounts(counts: LibraryCounts): LibraryCountValidationResult {
  const actualTotal =
    counts.ready_video_count +
    counts.processing_video_count +
    counts.queued_video_count +
    counts.unprocessed_video_count +
    counts.failed_video_count +
    counts.index_required_video_count;

  if (actualTotal !== counts.video_count) {
    return {
      ok: false,
      expected_total: counts.video_count,
      actual_total: actualTotal,
      message: `video_count is ${counts.video_count} but status counts add up to ${actualTotal}`
    };
  }

  return {
    ok: true,
    expected_total: counts.video_count,
    actual_total: actualTotal,
    message: "library counts are consistent"
  };
}
