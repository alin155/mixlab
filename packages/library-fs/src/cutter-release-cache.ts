import { cp, copyFile, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type {
  CutterReleaseCurrentPointer,
  CutterReleaseManifest
} from "./cutter-release.ts";

export interface SyncCutterReleaseCacheInput {
  source_library_root: string;
  cache_root: string;
  max_cached_releases?: number;
  include_cache_size?: boolean;
}

export interface CutterReleaseCacheStatus {
  cache_root: string;
  cache_ready: boolean;
  active_release_version: string;
  search_index_version: string;
  ready_video_count: number;
  cached_release_versions: string[];
  cached_release_count: number;
  max_cached_releases: number;
  cache_size_bytes: number;
  catalog_file_path: string;
  message: string;
}

export interface SyncCutterReleaseCacheResult extends CutterReleaseCacheStatus {
  source_release_version: string;
  copied: boolean;
  pruned_release_versions: string[];
}

interface CachedReleaseDirectory {
  release_version: string;
  dir_path: string;
  mtime_ms: number;
}

const DEFAULT_MAX_CACHED_RELEASES = 2;
const MIN_MAX_CACHED_RELEASES = 1;
const MAX_MAX_CACHED_RELEASES = 8;
const CACHE_SIZE_TTL_MS = 30_000;

const cacheSizeByRoot = new Map<string, {
  value: number;
  expires_at_ms: number;
}>();
const pendingCacheSizeByRoot = new Map<string, Promise<number>>();

function mixlabRoot(root: string): string {
  return path.join(root, ".mixlab-library");
}

function currentReleasePointerPath(root: string): string {
  return path.join(mixlabRoot(root), "current-release.json");
}

function releaseRoot(root: string, releaseVersion: string): string {
  return path.join(mixlabRoot(root), "releases", releaseVersion);
}

function releasesRoot(root: string): string {
  return path.join(mixlabRoot(root), "releases");
}

function releaseManifestPath(root: string, releaseVersion: string): string {
  return path.join(releaseRoot(root, releaseVersion), "release.json");
}

function releaseCatalogPath(root: string, releaseVersion: string): string {
  return path.join(releaseRoot(root, releaseVersion), "catalog.sqlite");
}

function releaseSourcePathMapPath(root: string, releaseVersion: string): string {
  return path.join(releaseRoot(root, releaseVersion), "source-path-map.json");
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function normalizeMaxCachedReleases(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_CACHED_RELEASES;
  }

  return Math.max(
    MIN_MAX_CACHED_RELEASES,
    Math.min(MAX_MAX_CACHED_RELEASES, Math.floor(value))
  );
}

async function listCachedReleaseDirectories(root: string): Promise<CachedReleaseDirectory[]> {
  try {
    const entries = await readdir(releasesRoot(root), { withFileTypes: true });
    const releases: CachedReleaseDirectory[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.includes(".tmp-")) {
        continue;
      }

      const dirPath = path.join(releasesRoot(root), entry.name);
      const releaseStat = await stat(dirPath);
      releases.push({
        release_version: entry.name,
        dir_path: dirPath,
        mtime_ms: releaseStat.mtimeMs
      });
    }

    return releases.sort((left, right) =>
      left.release_version.localeCompare(right.release_version)
    );
  } catch {
    return [];
  }
}

async function directorySizeBytes(root: string): Promise<number> {
  let entryStat;
  try {
    entryStat = await stat(root);
  } catch {
    return 0;
  }

  if (entryStat.isFile()) {
    return entryStat.size;
  }

  if (!entryStat.isDirectory()) {
    return 0;
  }

  const entries = await readdir(root, { withFileTypes: true });
  const sizes = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return directorySizeBytes(entryPath);
    }

    if (entry.isFile()) {
      return stat(entryPath).then((fileStat) => fileStat.size).catch(() => 0);
    }

    return Promise.resolve(0);
  }));

  return sizes.reduce((sum, size) => sum + size, 0);
}

async function localCacheSizeBytes(root: string): Promise<number> {
  const cacheKey = path.resolve(root);
  const cached = cacheSizeByRoot.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expires_at_ms > now) {
    return cached.value;
  }

  const value = await directorySizeBytes(mixlabRoot(root));
  cacheSizeByRoot.set(cacheKey, {
    value,
    expires_at_ms: now + CACHE_SIZE_TTL_MS
  });
  return value;
}

function refreshLocalCacheSizeBytes(root: string): void {
  const cacheKey = path.resolve(root);
  if (pendingCacheSizeByRoot.has(cacheKey)) {
    return;
  }

  const pending = directorySizeBytes(mixlabRoot(root))
    .then((value) => {
      cacheSizeByRoot.set(cacheKey, {
        value,
        expires_at_ms: Date.now() + CACHE_SIZE_TTL_MS
      });
      return value;
    })
    .finally(() => {
      pendingCacheSizeByRoot.delete(cacheKey);
    });

  pendingCacheSizeByRoot.set(cacheKey, pending);
}

function localCacheSizeBytesBestEffort(root: string): number {
  const cacheKey = path.resolve(root);
  const cached = cacheSizeByRoot.get(cacheKey);
  const now = Date.now();

  if (!cached || cached.expires_at_ms <= now) {
    refreshLocalCacheSizeBytes(root);
  }

  return cached?.value ?? 0;
}

function invalidateLocalCacheSize(root: string): void {
  cacheSizeByRoot.delete(path.resolve(root));
}

async function pruneCachedReleases(input: {
  cache_root: string;
  active_release_version: string;
  max_cached_releases: number;
}): Promise<string[]> {
  const releases = await listCachedReleaseDirectories(input.cache_root);
  const keep = new Set<string>([input.active_release_version]);
  const spareSlots = Math.max(0, input.max_cached_releases - keep.size);
  const previousReleases = releases
    .filter((release) => release.release_version !== input.active_release_version)
    .sort((left, right) => right.mtime_ms - left.mtime_ms)
    .slice(0, spareSlots);

  for (const release of previousReleases) {
    keep.add(release.release_version);
  }

  const prunedReleaseVersions: string[] = [];
  for (const release of releases) {
    if (keep.has(release.release_version)) {
      continue;
    }

    await rm(release.dir_path, { recursive: true, force: true });
    prunedReleaseVersions.push(release.release_version);
  }

  if (prunedReleaseVersions.length > 0) {
    invalidateLocalCacheSize(input.cache_root);
  }

  return prunedReleaseVersions.sort();
}

async function releaseFilesReady(root: string, releaseVersion: string): Promise<boolean> {
  if (
    !(await fileExists(releaseManifestPath(root, releaseVersion))) ||
    !(await fileExists(releaseCatalogPath(root, releaseVersion))) ||
    !(await fileExists(releaseSourcePathMapPath(root, releaseVersion)))
  ) {
    return false;
  }

  try {
    const manifest = await readJsonFile<CutterReleaseManifest>(
      releaseManifestPath(root, releaseVersion)
    );
    return Boolean(
      manifest.search_index_path &&
      manifest.thumbnails_path &&
      manifest.transcript_pack_path &&
      (await fileExists(path.join(
        releaseRoot(root, releaseVersion),
        manifest.search_index_path,
        manifest.source_index_version,
        "index.sqlite"
      )))
    );
  } catch {
    return false;
  }
}

async function readCurrentPointer(root: string): Promise<CutterReleaseCurrentPointer> {
  const pointer = await readJsonFile<CutterReleaseCurrentPointer>(currentReleasePointerPath(root));

  if (!pointer.current_version?.trim()) {
    throw new Error("current release pointer is missing current_version");
  }

  return pointer;
}

async function copyReleaseFiles(input: {
  source_library_root: string;
  cache_root: string;
  release_version: string;
}): Promise<boolean> {
  if (await releaseFilesReady(input.cache_root, input.release_version)) {
    return false;
  }

  const sourceReleaseRoot = releaseRoot(input.source_library_root, input.release_version);
  const targetReleaseRoot = releaseRoot(input.cache_root, input.release_version);
  const tempReleaseRoot = `${targetReleaseRoot}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(path.dirname(targetReleaseRoot), { recursive: true });

  try {
    await cp(sourceReleaseRoot, tempReleaseRoot, {
      recursive: true,
      force: true,
      errorOnExist: false
    });
    await rm(targetReleaseRoot, { recursive: true, force: true });
    await rename(tempReleaseRoot, targetReleaseRoot);
    return true;
  } catch (error) {
    await rm(tempReleaseRoot, { recursive: true, force: true });
    throw error;
  }
}

async function writeCachePointer(input: {
  source_library_root: string;
  cache_root: string;
}): Promise<void> {
  const sourcePointerPath = currentReleasePointerPath(input.source_library_root);
  const targetPointerPath = currentReleasePointerPath(input.cache_root);
  const tempPointerPath = `${targetPointerPath}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(path.dirname(targetPointerPath), { recursive: true });
  await copyFile(sourcePointerPath, tempPointerPath);
  await rename(tempPointerPath, targetPointerPath);
}

const pendingSyncs = new Map<string, Promise<SyncCutterReleaseCacheResult>>();

export function syncCutterReleaseCache(
  input: SyncCutterReleaseCacheInput
): Promise<SyncCutterReleaseCacheResult> {
  const key = `${path.resolve(input.source_library_root)}:${path.resolve(input.cache_root)}`;
  const pending = pendingSyncs.get(key);

  if (pending) {
    return pending;
  }

  const sync = syncCutterReleaseCacheOnce(input).finally(() => {
    pendingSyncs.delete(key);
  });

  pendingSyncs.set(key, sync);
  return sync;
}

async function syncCutterReleaseCacheOnce(
  input: SyncCutterReleaseCacheInput
): Promise<SyncCutterReleaseCacheResult> {
  const maxCachedReleases = normalizeMaxCachedReleases(input.max_cached_releases);
  const pointer = await readCurrentPointer(input.source_library_root);
  const copied = await copyReleaseFiles({
    source_library_root: input.source_library_root,
    cache_root: input.cache_root,
    release_version: pointer.current_version
  });
  if (copied) {
    invalidateLocalCacheSize(input.cache_root);
  }
  await writeCachePointer(input);
  const prunedReleaseVersions = await pruneCachedReleases({
    cache_root: input.cache_root,
    active_release_version: pointer.current_version,
    max_cached_releases: maxCachedReleases
  });

  const status = await readLocalCutterReleaseCacheStatus({
    cache_root: input.cache_root,
    max_cached_releases: maxCachedReleases,
    include_cache_size: input.include_cache_size
  });

  return {
    ...status,
    source_release_version: pointer.current_version,
    copied,
    pruned_release_versions: prunedReleaseVersions,
    message: copied ? "已同步最新 Release" : "本机 Release 已是最新"
  };
}

export async function readLocalCutterReleaseCacheStatus(input: {
  cache_root: string;
  max_cached_releases?: number;
  include_cache_size?: boolean;
}): Promise<CutterReleaseCacheStatus> {
  const maxCachedReleases = normalizeMaxCachedReleases(input.max_cached_releases);
  const cachedReleaseVersions = (await listCachedReleaseDirectories(input.cache_root))
    .map((release) => release.release_version);
  const cacheSizeBytes = input.include_cache_size === false
    ? localCacheSizeBytesBestEffort(input.cache_root)
    : await localCacheSizeBytes(input.cache_root);

  try {
    const pointer = await readCurrentPointer(input.cache_root);
    const manifest = await readJsonFile<CutterReleaseManifest>(
      releaseManifestPath(input.cache_root, pointer.current_version)
    );
    const catalogFilePath = releaseCatalogPath(input.cache_root, pointer.current_version);

    if (!(await fileExists(catalogFilePath))) {
      throw new Error("cached catalog is missing");
    }

    if (!(await releaseFilesReady(input.cache_root, pointer.current_version))) {
      throw new Error("cached release is incomplete");
    }

    return {
      cache_root: input.cache_root,
      cache_ready: true,
      active_release_version: manifest.release_version,
      search_index_version: manifest.source_index_version,
      ready_video_count: manifest.ready_video_count,
      cached_release_versions: cachedReleaseVersions,
      cached_release_count: cachedReleaseVersions.length,
      max_cached_releases: maxCachedReleases,
      cache_size_bytes: cacheSizeBytes,
      catalog_file_path: catalogFilePath,
      message: "本机 Release 可用"
    };
  } catch {
    return {
      cache_root: input.cache_root,
      cache_ready: false,
      active_release_version: "",
      search_index_version: "",
      ready_video_count: 0,
      cached_release_versions: cachedReleaseVersions,
      cached_release_count: cachedReleaseVersions.length,
      max_cached_releases: maxCachedReleases,
      cache_size_bytes: cacheSizeBytes,
      catalog_file_path: "",
      message: "本机 Release 尚未就绪"
    };
  }
}
