/**
 * Release Manifest v2: immutable release bundle description.
 *
 * The bundle directory is write-once. Every file is content addressed by sha256 and the
 * release_id keys the manifest; clients verify files before switching their local cache.
 */
export const RELEASE_MANIFEST_SCHEMA_VERSION = "2.0";

export type ReleaseFileRole =
  | "catalog"
  | "search-index"
  | "source-map"
  | "transcript"
  | "srt"
  | "cover"
  | "keyframes"
  | "index-manifest"
  | "other";

export interface ReleaseFileEntryV2 {
  path: string;
  role: ReleaseFileRole;
  size: number;
  sha256: string;
}

export interface ReleaseManifestV2 {
  schema_version: "2.0";
  contract_version: string;
  release_id: string;
  library_id: string;
  created_at: string;
  created_by?: string;
  min_client_version: string;
  index_version: string;
  ready_video_count: number;
  files: ReleaseFileEntryV2[];
  stats?: Record<string, number>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_PATH_PATTERN = /^[^\\/]+(?:\/[^\\/]+)*$/;

function assertReleasePath(pathValue: string): void {
  if (!pathValue || pathValue.includes("\0") || pathValue.startsWith("/") || pathValue.includes("..")) {
    throw new Error("release file path must be a safe relative path");
  }
  if (!SAFE_PATH_PATTERN.test(pathValue)) {
    throw new Error("release file path must use forward slashes without empty segments");
  }
}

export function validateReleaseManifestV2(value: unknown): ReleaseManifestV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("release manifest must be an object");
  }
  const manifest = value as Record<string, unknown>;
  if (manifest.schema_version !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    throw new Error("release manifest schema_version must be 2.0");
  }
  for (const field of ["contract_version", "release_id", "library_id", "created_at", "min_client_version", "index_version"] as const) {
    if (typeof manifest[field] !== "string" || (manifest[field] as string).trim() === "") {
      throw new Error(`release manifest field ${field} is required`);
    }
  }
  if (!Number.isSafeInteger(manifest.ready_video_count) || (manifest.ready_video_count as number) < 0) {
    throw new Error("release manifest ready_video_count must be a non-negative integer");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("release manifest files must be a non-empty array");
  }
  const seen = new Set<string>();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== "object") {
      throw new Error("release manifest file entry must be an object");
    }
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== "string") {
      throw new Error("release manifest file.path is required");
    }
    assertReleasePath(file.path);
    if (seen.has(file.path)) {
      throw new Error("release manifest file paths must be unique");
    }
    seen.add(file.path);
    if (typeof file.role !== "string" || file.role.trim() === "") {
      throw new Error("release manifest file.role is required");
    }
    if (!Number.isSafeInteger(file.size) || (file.size as number) < 0) {
      throw new Error("release manifest file.size must be a non-negative integer");
    }
    if (typeof file.sha256 !== "string" || !SHA256_PATTERN.test(file.sha256)) {
      throw new Error("release manifest file.sha256 must be lowercase hex sha256");
    }
  }
  if (manifest.stats !== undefined && (typeof manifest.stats !== "object" || manifest.stats === null || Array.isArray(manifest.stats))) {
    throw new Error("release manifest stats must be an object");
  }
  return manifest as unknown as ReleaseManifestV2;
}

export function releaseManifestIsCompatible(
  manifest: ReleaseManifestV2,
  clientVersion: string
): boolean {
  return compareVersions(clientVersion, manifest.min_client_version) >= 0;
}

/** Minimal semver comparison for x.y.z (pre-release/build metadata ignored). */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value.split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}
