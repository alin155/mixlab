import { LibraryFormatError } from "./errors.ts";
import {
  isRecord,
  parseJsonText,
  requireNonNegativeInteger,
  requireRecord,
  requireStringField,
  optionalStringField
} from "./json.ts";
import {
  assertLibraryRelativePath,
  RELEASE_CATALOG_FILE,
  RELEASE_SEARCH_INDEX_PATH,
  RELEASE_SOURCE_PATH_MAP_FILE,
  RELEASE_THUMBNAILS_PATH,
  RELEASE_TRANSCRIPT_PACK_PATH
} from "./paths.ts";
import {
  assertSafePathSegment,
  assertSafeReleaseVersion,
  assertSourceVideoId
} from "./versions.ts";

export const RELEASE_MANIFEST_SCHEMA_VERSION_V1 = "1.0";

export interface CutterReleaseManifestV1 {
  schema_version: "1.0";
  release_version: string;
  library_id: string;
  generated_at: string;
  ready_video_count: number;
  source_index_version: string;
  catalog_path: "catalog.sqlite";
  source_path_map_path: "source-path-map.json";
  search_index_path?: typeof RELEASE_SEARCH_INDEX_PATH;
  thumbnails_path?: typeof RELEASE_THUMBNAILS_PATH;
  transcript_pack_path?: typeof RELEASE_TRANSCRIPT_PACK_PATH;
}

export interface CutterReleaseCurrentPointer {
  schema_version: "1.0";
  library_id: string;
  current_version: string;
  updated_at?: string;
  manifest_path?: string;
}

export interface IndexPackageManifestV1 {
  schema_version: string;
  index_version: string;
  library_id: string;
  created_at: string;
  ready_video_count: number;
  source_video_ids: string[];
}

export interface IndexCurrentPointer {
  library_id?: string;
  current_version: string;
  updated_at?: string;
}

export interface SourceVideoManifestV1 {
  source_video_id: string;
  title: string;
  relative_path: string;
  logical_uri: string;
  duration_ms: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  file_size: number;
  content_hash: string;
  preprocess_status: string;
  visible_to_cutters: boolean;
  source_folder_id?: string;
  source_folder_relative_path?: string;
  transcript_path?: string;
  srt_path?: string;
  keyframes_path?: string;
  cover_path?: string;
  description?: string;
  lecturer?: string;
  course?: string;
  category?: string;
}

function assertExpectedField(
  record: Record<string, unknown>,
  field: string,
  expected: string,
  label: string
): void {
  if (record[field] !== expected) {
    throw new LibraryFormatError("MANIFEST_INVALID", `${label}字段 ${field} 必须为 ${expected}`, {
      label,
      field
    });
  }
}

/** Mirror production completeness rules for a v1 release manifest (release.json). */
export function parseReleaseManifestV1(
  value: unknown,
  options: { expected_release_version?: string } = {}
): CutterReleaseManifestV1 {
  const label = "发布清单 release.json";
  const record = requireRecord(value, label);

  if (record.schema_version !== RELEASE_MANIFEST_SCHEMA_VERSION_V1) {
    throw new LibraryFormatError("MANIFEST_INVALID", `${label} schema_version 必须为 1.0`, { label });
  }

  const releaseVersion = assertSafeReleaseVersion(record.release_version, "发布版本号");
  if (options.expected_release_version !== undefined && releaseVersion !== options.expected_release_version) {
    throw new LibraryFormatError("MANIFEST_INVALID", "发布清单版本与期望版本不一致", {
      label,
      expected: options.expected_release_version,
      actual: releaseVersion
    });
  }

  const manifest: CutterReleaseManifestV1 = {
    schema_version: "1.0",
    release_version: releaseVersion,
    library_id: requireStringField(record, "library_id", label),
    generated_at: requireStringField(record, "generated_at", label, { allowEmpty: true }),
    ready_video_count: requireNonNegativeInteger(record, "ready_video_count", label),
    source_index_version: assertSafePathSegment(record.source_index_version, "索引版本号"),
    catalog_path: RELEASE_CATALOG_FILE,
    source_path_map_path: RELEASE_SOURCE_PATH_MAP_FILE
  };

  assertExpectedField(record, "catalog_path", RELEASE_CATALOG_FILE, label);
  assertExpectedField(record, "source_path_map_path", RELEASE_SOURCE_PATH_MAP_FILE, label);

  if (record.search_index_path !== undefined) {
    assertExpectedField(record, "search_index_path", RELEASE_SEARCH_INDEX_PATH, label);
    manifest.search_index_path = RELEASE_SEARCH_INDEX_PATH;
  }
  if (record.thumbnails_path !== undefined) {
    assertExpectedField(record, "thumbnails_path", RELEASE_THUMBNAILS_PATH, label);
    manifest.thumbnails_path = RELEASE_THUMBNAILS_PATH;
  }
  if (record.transcript_pack_path !== undefined) {
    assertExpectedField(record, "transcript_pack_path", RELEASE_TRANSCRIPT_PACK_PATH, label);
    manifest.transcript_pack_path = RELEASE_TRANSCRIPT_PACK_PATH;
  }

  return manifest;
}

export function parseReleaseManifestV1Json(
  text: unknown,
  options: { expected_release_version?: string } = {}
): CutterReleaseManifestV1 {
  return parseReleaseManifestV1(parseJsonText(text, "发布清单 release.json"), options);
}

/** Production completeness contract: every release payload path is the canonical relative path. */
export function isCompleteReleaseManifestV1(
  value: unknown,
  expectedReleaseVersion: string
): value is CutterReleaseManifestV1 {
  try {
    const manifest = parseReleaseManifestV1(value, { expected_release_version: expectedReleaseVersion });
    return (
      manifest.catalog_path === RELEASE_CATALOG_FILE &&
      manifest.source_path_map_path === RELEASE_SOURCE_PATH_MAP_FILE &&
      manifest.search_index_path === RELEASE_SEARCH_INDEX_PATH &&
      manifest.thumbnails_path === RELEASE_THUMBNAILS_PATH &&
      manifest.transcript_pack_path === RELEASE_TRANSCRIPT_PACK_PATH
    );
  } catch {
    return false;
  }
}

export function parseCurrentReleasePointer(value: unknown): CutterReleaseCurrentPointer {
  const label = "发布指针 current-release.json";
  const record = requireRecord(value, label);

  if (record.schema_version !== undefined && record.schema_version !== RELEASE_MANIFEST_SCHEMA_VERSION_V1) {
    throw new LibraryFormatError("POINTER_INVALID", `${label} schema_version 必须为 1.0`, { label });
  }

  const pointer: CutterReleaseCurrentPointer = {
    schema_version: "1.0",
    library_id: requireStringField(record, "library_id", label, { allowEmpty: true }),
    current_version: assertSafeReleaseVersion(record.current_version, "发布版本号")
  };

  if (record.updated_at !== undefined) {
    pointer.updated_at = requireStringField(record, "updated_at", label, { allowEmpty: true });
  }
  if (record.manifest_path !== undefined) {
    pointer.manifest_path = assertLibraryRelativePath(record.manifest_path, "发布清单相对路径");
  }

  return pointer;
}

export function parseCurrentReleasePointerJson(text: unknown): CutterReleaseCurrentPointer {
  return parseCurrentReleasePointer(parseJsonText(text, "发布指针 current-release.json"));
}

export function assertPointerMatchesManifest(
  pointer: CutterReleaseCurrentPointer,
  manifest: CutterReleaseManifestV1
): void {
  if (pointer.current_version !== manifest.release_version) {
    throw new LibraryFormatError("POINTER_INVALID", "发布指针版本与发布清单不一致", {
      pointer_version: pointer.current_version,
      manifest_version: manifest.release_version
    });
  }
}

export function parseIndexPackageManifest(value: unknown): IndexPackageManifestV1 {
  const label = "索引清单 index-manifest.json";
  const record = requireRecord(value, label);
  const sourceVideoIds = record.source_video_ids;

  if (!Array.isArray(sourceVideoIds) || sourceVideoIds.some((item) => typeof item !== "string")) {
    throw new LibraryFormatError("MANIFEST_INVALID", `${label} source_video_ids 必须是字符串数组`, { label });
  }

  const ids = sourceVideoIds.map((item) => assertSourceVideoId(item, "素材编号"));
  if (new Set(ids).size !== ids.length) {
    throw new LibraryFormatError("MANIFEST_INVALID", `${label} source_video_ids 重复`, { label });
  }

  return {
    schema_version: requireStringField(record, "schema_version", label),
    index_version: assertSafePathSegment(record.index_version, "索引版本号"),
    library_id: requireStringField(record, "library_id", label),
    created_at: requireStringField(record, "created_at", label, { allowEmpty: true }),
    ready_video_count: requireNonNegativeInteger(record, "ready_video_count", label),
    source_video_ids: ids
  };
}

export function parseIndexPackageManifestJson(text: unknown): IndexPackageManifestV1 {
  return parseIndexPackageManifest(parseJsonText(text, "索引清单 index-manifest.json"));
}

export function parseIndexCurrentPointer(value: unknown): IndexCurrentPointer {
  const label = "索引指针 current.json";
  const record = requireRecord(value, label);
  const pointer: IndexCurrentPointer = {
    current_version: assertSafePathSegment(record.current_version, "索引版本号")
  };

  if (record.library_id !== undefined) {
    pointer.library_id = requireStringField(record, "library_id", label, { allowEmpty: true });
  }
  if (record.updated_at !== undefined) {
    pointer.updated_at = requireStringField(record, "updated_at", label, { allowEmpty: true });
  }

  return pointer;
}

export function parseIndexCurrentPointerJson(text: unknown): IndexCurrentPointer {
  return parseIndexCurrentPointer(parseJsonText(text, "索引指针 current.json"));
}

/** Read-only source video manifest validation for format consumers (not a replacement validator). */
export function parseSourceVideoManifest(value: unknown): SourceVideoManifestV1 {
  const label = "素材清单 source-video.json";
  const record = requireRecord(value, label);

  if (record.visible_to_cutters !== undefined && typeof record.visible_to_cutters !== "boolean") {
    throw new LibraryFormatError("MANIFEST_INVALID", `${label} visible_to_cutters 必须是布尔值`, { label });
  }

  const manifest: SourceVideoManifestV1 = {
    source_video_id: assertSourceVideoId(record.source_video_id),
    title: requireStringField(record, "title", label, { allowEmpty: true }),
    relative_path: assertLibraryRelativePath(record.relative_path, "素材相对路径"),
    logical_uri: requireStringField(record, "logical_uri", label, { allowEmpty: true }),
    duration_ms: requireNonNegativeInteger(record, "duration_ms", label),
    width: requireNonNegativeInteger(record, "width", label),
    height: requireNonNegativeInteger(record, "height", label),
    fps: requireNonNegativeInteger(record, "fps", label),
    codec: requireStringField(record, "codec", label, { allowEmpty: true }),
    file_size: requireNonNegativeInteger(record, "file_size", label),
    content_hash: requireStringField(record, "content_hash", label, { allowEmpty: true }),
    preprocess_status: requireStringField(record, "preprocess_status", label),
    visible_to_cutters: record.visible_to_cutters === true
  };

  for (const field of ["source_folder_id", "source_folder_relative_path", "description", "lecturer", "course", "category"] as const) {
    const fieldValue = optionalStringField(record, field, label);
    if (fieldValue !== undefined) {
      manifest[field] = fieldValue;
    }
  }
  for (const field of ["transcript_path", "srt_path", "keyframes_path", "cover_path"] as const) {
    const fieldValue = optionalStringField(record, field, label);
    if (fieldValue !== undefined) {
      manifest[field] = assertLibraryRelativePath(fieldValue, label + " " + field);
    }
  }

  if (isRecord(record.tags)) {
    throw new LibraryFormatError("MANIFEST_INVALID", `${label} tags 必须是字符串数组`, { label });
  }

  return manifest;
}

export function parseSourceVideoManifestJson(text: unknown): SourceVideoManifestV1 {
  return parseSourceVideoManifest(parseJsonText(text, "素材清单 source-video.json"));
}
