import type {
  ClipListManifest,
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

function validatePositiveInteger(value: unknown, field: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    errors.push(`${field} must be a positive integer`);
  }
}

function validateCutMode(value: unknown, errors: string[], field = "cut_mode"): void {
  if (typeof value !== "string" || !CUT_MODES.has(value as CutMode)) {
    errors.push(`${field} must be copy, smart, or precise`);
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
    "source_folder_relative_path",
    "transcript_path",
    "srt_path",
    "keyframes_path",
    "cover_path"
  ] as const) {
    const value = manifest[key];

    if (value !== undefined && value.trim() !== "" && !isPortablePath(value)) {
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

export function validateClipListManifest(
  manifest: ClipListManifest
): ValidationResult {
  const errors: string[] = [];

  if (manifest.schema_version !== "1.0") {
    errors.push("schema_version must be 1.0");
  }

  if (!/^CL\d{8}-\d{4}$/.test(manifest.clip_list_id)) {
    errors.push("clip_list_id must use CLYYYYMMDD-0001 format");
  }

  for (const key of [
    "library_id",
    "title",
    "created_at",
    "updated_at"
  ] as const) {
    if (!isNonEmptyString(manifest[key])) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  if (
    manifest.project_id !== undefined &&
    (typeof manifest.project_id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(manifest.project_id))
  ) {
    errors.push("project_id must be a safe project identifier");
  }

  validatePositiveOrZeroInteger(manifest.item_count, "item_count", errors);

  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    errors.push("items must contain at least one cut-list row");
  } else {
    if (manifest.item_count !== manifest.items.length) {
      errors.push("item_count must equal items.length");
    }

    manifest.items.forEach((item, index) => {
      const prefix = `items[${index}]`;

      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        errors.push(`${prefix} must be an object`);
        return;
      }

      if (!/^CLI\d{6}$/.test(item.item_id)) {
        errors.push(`${prefix}.item_id must use CLI000001 format`);
      }

      validatePositiveInteger(item.order, `${prefix}.order`, errors);

      if (item.order !== index + 1) {
        errors.push(`${prefix}.order must equal item position`);
      }

      for (const key of [
        "source_video_id",
        "source_title",
        "source_relative_path",
        "start_segment_id",
        "end_segment_id",
        "selected_text"
      ] as const) {
        if (!isNonEmptyString(item[key])) {
          errors.push(`${prefix}.${key} must be a non-empty string`);
        }
      }

      validatePositiveOrZeroInteger(item.begin_ms, `${prefix}.begin_ms`, errors);
      validatePositiveOrZeroInteger(item.end_ms, `${prefix}.end_ms`, errors);
      validatePositiveOrZeroInteger(item.pre_roll_ms, `${prefix}.pre_roll_ms`, errors);
      validatePositiveOrZeroInteger(item.post_roll_ms, `${prefix}.post_roll_ms`, errors);

      if (item.end_ms <= item.begin_ms) {
        errors.push(`${prefix}.end_ms must be greater than begin_ms`);
      }

      if (!isPortablePath(item.source_relative_path)) {
        errors.push(`${prefix}.source_relative_path must be portable`);
      }

      validateCutMode(item.cut_mode, errors, `${prefix}.cut_mode`);
    });
  }

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
