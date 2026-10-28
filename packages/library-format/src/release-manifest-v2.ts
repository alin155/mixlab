import {
  releaseManifestIsCompatible,
  validateReleaseManifestV2,
  type ReleaseManifestV2
} from "../../contracts/src/release-manifest.ts";
import { LibraryFormatError } from "./errors.ts";
import { parseJsonText } from "./json.ts";
import type {
  CutterReleaseCurrentPointer,
  CutterReleaseManifestV1
} from "./manifests.ts";

export const RELEASE_MANIFEST_V2_CANONICAL_FILE = "release-manifest-v2.json";
export const RELEASE_MANIFEST_V2_COMPAT_FILE = "manifest-v2.json";
export const RELEASE_MANIFEST_V2_FILE_NAMES = [
  RELEASE_MANIFEST_V2_CANONICAL_FILE,
  RELEASE_MANIFEST_V2_COMPAT_FILE
] as const;

export type { ReleaseManifestV2 };

export function selectReleaseManifestV2File(fileNames: readonly string[]): string | null {
  const available = new Set(fileNames);

  for (const candidate of RELEASE_MANIFEST_V2_FILE_NAMES) {
    if (available.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function parseReleaseManifestV2(value: unknown): ReleaseManifestV2 {
  try {
    return validateReleaseManifestV2(value);
  } catch (error) {
    throw new LibraryFormatError(
      "MANIFEST_INVALID",
      "发布清单 manifest v2 无效：" + ((error as Error).message || "unknown"),
      { label: "release manifest v2" }
    );
  }
}

export function parseReleaseManifestV2Json(text: unknown): ReleaseManifestV2 {
  return parseReleaseManifestV2(parseJsonText(text, "发布清单 manifest v2"));
}

export function isReleaseManifestV2Compatible(
  manifest: ReleaseManifestV2,
  clientVersion: string
): boolean {
  return releaseManifestIsCompatible(manifest, clientVersion);
}

export type ReleaseFormatReadState =
  | {
      kind: "v2";
      manifest: ReleaseManifestV2;
      compatible: boolean;
      manifest_file?: string;
    }
  | {
      kind: "legacy";
      manifest: CutterReleaseManifestV1;
      reason: "manifest_v2_missing" | "manifest_v2_invalid";
    }
  | {
      kind: "none";
      reason: "no_release_manifest";
    }
  | {
      kind: "invalid";
      reason: string;
    };

export function resolveReleaseFormatState(input: {
  pointer?: CutterReleaseCurrentPointer;
  release_manifest_v1?: CutterReleaseManifestV1;
  release_manifest_v2?: unknown;
  available_files?: readonly string[];
  client_version?: string;
}): ReleaseFormatReadState {
  const availableFiles = input.available_files;
  const manifestFile = availableFiles ? selectReleaseManifestV2File(availableFiles) : null;
  const hasV2Candidate = input.release_manifest_v2 !== undefined ||
    (availableFiles !== undefined && manifestFile !== null);

  if (hasV2Candidate) {
    try {
      const manifest = parseReleaseManifestV2(input.release_manifest_v2);
      return {
        kind: "v2",
        manifest,
        compatible: input.client_version === undefined
          ? true
          : isReleaseManifestV2Compatible(manifest, input.client_version),
        ...(manifestFile ? { manifest_file: manifestFile } : {})
      };
    } catch (error) {
      if (input.release_manifest_v1) {
        return { kind: "legacy", manifest: input.release_manifest_v1, reason: "manifest_v2_invalid" };
      }

      return { kind: "invalid", reason: (error as Error).message };
    }
  }

  if (input.release_manifest_v1) {
    return { kind: "legacy", manifest: input.release_manifest_v1, reason: "manifest_v2_missing" };
  }

  return { kind: "none", reason: "no_release_manifest" };
}
