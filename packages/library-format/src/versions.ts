import { LibraryFormatError } from "./errors.ts";

/** Safe single path segment: no separators, no leading dot, no "..", no NUL. */
export const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Release / index version: v + exactly six digits (v000001). */
export const RELEASE_VERSION_PATTERN = /^v[0-9]{6}$/;
/** Source video id: V + exactly six digits (V000001). */
export const SOURCE_VIDEO_ID_PATTERN = /^V[0-9]{6}$/;
const WINDOWS_RESERVED_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function isSafePathSegment(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("\0") &&
    SAFE_PATH_SEGMENT_PATTERN.test(value) &&
    !WINDOWS_RESERVED_PATTERN.test(value);
}

export function assertSafePathSegment(value: unknown, label: string): string {
  if (!isSafePathSegment(value)) {
    throw new LibraryFormatError("PATH_UNSAFE", `${label}格式无效`, { label });
  }
  return value;
}

export function isSafeReleaseVersion(value: unknown): value is string {
  return typeof value === "string" && RELEASE_VERSION_PATTERN.test(value);
}

/** Release/index version segment safety (v000001 form). */
export function assertSafeReleaseVersion(value: unknown, label = "发布版本号"): string {
  if (!isSafeReleaseVersion(value)) {
    throw new LibraryFormatError("VERSION_INVALID", `${label}格式无效`, { label });
  }
  return value;
}

export function releaseVersionSequence(value: string): number {
  return Number.parseInt(assertSafeReleaseVersion(value).slice(1), 10);
}

/** Ascending numeric comparison for vNNNNNN release/index versions; invalid input throws. */
export function compareReleaseVersions(left: string, right: string): number {
  const a = releaseVersionSequence(left);
  const b = releaseVersionSequence(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

export function isSourceVideoId(value: unknown): value is string {
  return typeof value === "string" && SOURCE_VIDEO_ID_PATTERN.test(value);
}

export function assertSourceVideoId(value: unknown, label = "素材编号"): string {
  if (!isSourceVideoId(value)) {
    throw new LibraryFormatError("VERSION_INVALID", `${label}格式无效`, { label });
  }
  return value;
}
