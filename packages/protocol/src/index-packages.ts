import type {
  IndexCurrentPointer,
  IndexPackageManifest,
  ValidationResult
} from "./types.ts";

export function validateIndexPackageManifest(
  manifest: IndexPackageManifest
): ValidationResult {
  const errors: string[] = [];

  if (!/^v\d{6}$/.test(manifest.index_version)) {
    errors.push("index_version must use v000001 format");
  }

  if (manifest.ready_video_count !== manifest.source_video_ids.length) {
    errors.push("ready_video_count must equal source_video_ids length");
  }

  if (manifest.schema_version.trim() === "") {
    errors.push("schema_version is required");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function validateIndexCurrentPointer(
  pointer: IndexCurrentPointer,
  publishedVersions: string[]
): ValidationResult {
  const errors: string[] = [];

  if (!/^v\d{6}$/.test(pointer.current_version)) {
    errors.push("current_version must use v000001 format");
  } else if (!publishedVersions.includes(pointer.current_version)) {
    errors.push("current_version does not reference a published index package");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
