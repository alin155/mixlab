import path from "node:path";
import { LibraryFormatError } from "./errors.ts";
import {
  assertSafePathSegment,
  assertSafeReleaseVersion,
  assertSourceVideoId
} from "./versions.ts";

export const MIXLAB_DIR = ".mixlab-library";
export const SOURCE_VIDEOS_DIR = "source-videos";
export const CURRENT_RELEASE_POINTER_FILE = "current-release.json";
export const RELEASE_MANIFEST_V1_FILE = "release.json";
export const RELEASE_CATALOG_FILE = "catalog.sqlite";
export const RELEASE_SOURCE_PATH_MAP_FILE = "source-path-map.json";
export const RELEASE_SEARCH_INDEX_PATH = "search-index/source-transcript-index";
export const RELEASE_SEARCH_INDEX_CURRENT_FILE = "current.json";
export const RELEASE_THUMBNAILS_PATH = "thumbnails";
export const RELEASE_TRANSCRIPT_PACK_PATH = "transcript-pack";
export const INDEX_PACKAGE_MANIFEST_FILE = "index-manifest.json";
export const INDEX_PACKAGE_SQLITE_FILE = "index.sqlite";

function assertLibraryRoot(root: unknown): string {
  if (typeof root !== "string" || root.trim() === "" || root.includes("\0")) {
    throw new LibraryFormatError("PATH_UNSAFE", "素材库根路径无效", { label: "library_root" });
  }
  return root;
}

export function mixlabRoot(libraryRoot: string): string {
  return path.join(assertLibraryRoot(libraryRoot), MIXLAB_DIR);
}

export function releasesRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "releases");
}

export function releaseRoot(libraryRoot: string, releaseVersion: string): string {
  return path.join(releasesRoot(libraryRoot), assertSafeReleaseVersion(releaseVersion));
}

export function releaseManifestPath(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), RELEASE_MANIFEST_V1_FILE);
}

export function releaseCatalogPath(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), RELEASE_CATALOG_FILE);
}

export function releaseSourcePathMapPath(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), RELEASE_SOURCE_PATH_MAP_FILE);
}

export function releaseSearchIndexRoot(libraryRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(libraryRoot, releaseVersion), RELEASE_SEARCH_INDEX_PATH);
}

export function releaseSearchIndexVersionPath(
  libraryRoot: string,
  releaseVersion: string,
  indexVersion: string
): string {
  return path.join(
    releaseSearchIndexRoot(libraryRoot, releaseVersion),
    assertSafePathSegment(indexVersion, "索引版本号")
  );
}

export function releaseManifestRelativePath(releaseVersion: string): string {
  return `${MIXLAB_DIR}/releases/${assertSafeReleaseVersion(releaseVersion)}/${RELEASE_MANIFEST_V1_FILE}`;
}

export function currentReleasePointerPath(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), CURRENT_RELEASE_POINTER_FILE);
}

export function sourceVideosRoot(libraryRoot: string): string {
  return path.join(assertLibraryRoot(libraryRoot), SOURCE_VIDEOS_DIR);
}

export function sourceVideoManifestsRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "videos");
}

export function sourceVideoManifestPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(sourceVideoManifestsRoot(libraryRoot), assertSourceVideoId(sourceVideoId), "source-video.json");
}

export function indexPackagesRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "indexes", "source-transcript-index");
}

export function indexCurrentPointerPath(libraryRoot: string): string {
  return path.join(indexPackagesRoot(libraryRoot), RELEASE_SEARCH_INDEX_CURRENT_FILE);
}

export function indexPackageManifestPath(libraryRoot: string, indexVersion: string): string {
  return path.join(
    indexPackagesRoot(libraryRoot),
    assertSafePathSegment(indexVersion, "索引版本号"),
    INDEX_PACKAGE_MANIFEST_FILE
  );
}

export function indexPackageSqlitePath(libraryRoot: string, indexVersion: string): string {
  return path.join(
    indexPackagesRoot(libraryRoot),
    assertSafePathSegment(indexVersion, "索引版本号"),
    INDEX_PACKAGE_SQLITE_FILE
  );
}

/** Portable library-relative path check (no absolute/UNC/drive/NUL/empty/.. segments). */
export function isSafeLibraryRelativePath(relativePath: unknown): relativePath is string {
  if (typeof relativePath !== "string") {
    return false;
  }

  const normalized = relativePath.replace(/\\/g, "/");
  return (
    normalized.trim() !== "" &&
    !normalized.includes("\0") &&
    !normalized.startsWith("/") &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !normalized.split("/").includes("..")
  );
}

export function assertLibraryRelativePath(relativePath: unknown, label = "库内相对路径"): string {
  if (!isSafeLibraryRelativePath(relativePath)) {
    throw new LibraryFormatError("PATH_UNSAFE", `${label}必须是安全的库内相对路径`, { label });
  }
  return relativePath;
}

export function libraryRelativePathParts(relativePath: string): string[] {
  return assertLibraryRelativePath(relativePath).replace(/\\/g, "/").split("/").filter(Boolean);
}

/** Resolve a validated library-relative path under root; never returns a path outside root. */
export function resolveLibraryRelativePath(libraryRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(assertLibraryRoot(libraryRoot));
  const resolved = path.resolve(resolvedRoot, ...libraryRelativePathParts(relativePath));
  const delta = path.relative(resolvedRoot, resolved);

  if (delta === "" || delta.startsWith("..") || path.isAbsolute(delta)) {
    throw new LibraryFormatError("PATH_UNSAFE", "解析后的路径超出素材库目录", { label: relativePath });
  }

  return resolved;
}

export function artifactFilePath(libraryRoot: string, libraryRelativePath: string): string {
  return resolveLibraryRelativePath(libraryRoot, libraryRelativePath);
}
