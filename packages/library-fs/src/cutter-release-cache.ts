import { chmod, cp, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import {
  compareVersions,
  releaseManifestIsCompatible,
  type ReleaseManifestV2
} from "../../contracts/src/release-manifest.ts";
import {
  RELEASE_MANIFEST_V2_FILE_NAMES as LIBRARY_FORMAT_RELEASE_MANIFEST_V2_FILE_NAMES,
  parseJsonText,
  parseReleaseManifestV2
} from "../../library-format/src/index.ts";
import { contractErrorDefinition } from "../../contracts/src/errors.ts";
import type {
  CutterReleaseCurrentPointer,
  CutterReleaseManifest
} from "./cutter-release.ts";

export interface SyncCutterReleaseCacheInput {
  source_library_root: string;
  cache_root: string;
  max_cached_releases?: number;
  include_cache_size?: boolean;
  /** 本机历史作品/项目引用到的 release 版本（调用方从 workspace 清单计算）；淘汰时必须保留。 */
  pinned_release_versions?: string[];
  /** 存在历史作品引用但清单未记录版本号时的保守策略：保留全部已缓存版本（无法证明未被引用）。 */
  preserve_cached_releases_for_unknown_references?: boolean;
  /** 客户端版本（用于 release manifest v2 的 min_client_version 兼容判断）；缺省时跳过兼容判断。 */
  client_version?: string;
}

export interface ReleaseCacheFileVerificationFailure {
  path: string;
  reason: string;
}

/** Release Manifest v2 消费端校验结果（Round3 契约：verified_files/failed_files/fallback_reason）。 */
export interface ReleaseCacheVerificationResult {
  manifest_schema_version: "2.0" | "legacy" | "none";
  release_id?: string;
  min_client_version?: string;
  verified_files: number;
  failed_files: ReleaseCacheFileVerificationFailure[];
  /** v2 未生效的原因：manifest_v2_missing | manifest_v2_invalid | file_verification_failed | legacy_artifacts_missing | contract_too_old。 */
  fallback_reason?: string;
  contract_error_code?: string;
  contract_error_message?: string;
  verified_at?: string;
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
  /** 淘汰后实际保留的缓存版本（含 active/最近窗口/引用保护/删除失败），供 UI/日志审计。 */
  kept_release_versions?: string[];
  /** 每个保留版本的原因：active | recent_window | workspace_reference | workspace_reference_version_unknown | prune_failed:<code>。 */
  kept_release_reasons?: Record<string, string>;
  /** 调用方本次传入的历史引用版本（原样回显，便于审计）。 */
  pinned_release_versions?: string[];
  /** 删除失败、因而不阻塞同步而被保留的旧版本。 */
  prune_failed_release_versions?: string[];
  /** Release Manifest v2 校验结果（legacy 路径也会记录 manifest_v2_missing 回退原因）。 */
  verification?: ReleaseCacheVerificationResult;
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

/** v2 manifest 候选文件名（统一来自 library-format；生产端写入 canonical，兼容 alias）。 */
export const RELEASE_MANIFEST_V2_FILE_NAMES = LIBRARY_FORMAT_RELEASE_MANIFEST_V2_FILE_NAMES;
const RELEASE_V2_VERIFICATION_SIDECAR = ".v2-verification.json";
const RELEASE_V2_HASH_CONCURRENCY = 4;
const CONTRACT_ERROR_TOO_OLD = "CONTRACT_TOO_OLD";

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

export interface PruneCachedReleasesResult {
  pruned_release_versions: string[];
  kept_release_versions: string[];
  kept_release_reasons: Record<string, string>;
  prune_failed_release_versions: string[];
}

function normalizePinnedReleaseVersions(
  value: string[] | undefined
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim()))].sort();
}

/**
 * 淘汰未引用的旧版本。保留优先级：active > 历史作品引用（pinned）> 最近 N 版；
 * 存在引用但无版本号时按保守策略全量保留；单个目录删除失败只记录、不阻塞同步。
 */
async function pruneCachedReleases(input: {
  cache_root: string;
  active_release_version: string;
  max_cached_releases: number;
  pinned_release_versions?: string[];
  preserve_cached_releases_for_unknown_references?: boolean;
}): Promise<PruneCachedReleasesResult> {
  const releases = await listCachedReleaseDirectories(input.cache_root);
  const pinned = new Set(normalizePinnedReleaseVersions(input.pinned_release_versions));
  const keep = new Map<string, string>();
  keep.set(input.active_release_version, "active");

  if (input.preserve_cached_releases_for_unknown_references) {
    for (const release of releases) {
      keep.set(release.release_version, "workspace_reference_version_unknown");
    }
  }

  for (const release of releases) {
    if (pinned.has(release.release_version)) {
      keep.set(release.release_version, "workspace_reference");
    }
  }

  const spareSlots = Math.max(0, input.max_cached_releases - keep.size);
  const previousReleases = releases
    .filter((release) => !keep.has(release.release_version))
    .sort((left, right) => right.mtime_ms - left.mtime_ms)
    .slice(0, spareSlots);

  for (const release of previousReleases) {
    keep.set(release.release_version, "recent_window");
  }

  const prunedReleaseVersions: string[] = [];
  const pruneFailedReleaseVersions: string[] = [];
  for (const release of releases) {
    if (keep.has(release.release_version)) {
      continue;
    }

    try {
      await rm(release.dir_path, { recursive: true, force: true });
      prunedReleaseVersions.push(release.release_version);
    } catch (error) {
      // 删除失败（只读、占用、SMB 权限）不阻塞同步：保留版本并记录原因，供调用方审计。
      keep.set(
        release.release_version,
        `prune_failed:${(error as NodeJS.ErrnoException).code ?? "unknown"}`
      );
      pruneFailedReleaseVersions.push(release.release_version);
    }
  }

  if (prunedReleaseVersions.length > 0) {
    invalidateLocalCacheSize(input.cache_root);
  }

  const keptReleaseVersions = releases
    .map((release) => release.release_version)
    .filter((releaseVersion) => keep.has(releaseVersion))
    .sort();

  return {
    pruned_release_versions: prunedReleaseVersions.sort(),
    kept_release_versions: keptReleaseVersions,
    kept_release_reasons: Object.fromEntries(
      keptReleaseVersions.map((releaseVersion) => [
        releaseVersion,
        keep.get(releaseVersion) ?? "unknown"
      ])
    ),
    prune_failed_release_versions: pruneFailedReleaseVersions.sort()
  };
}

function releaseCachePruneMessage(result: PruneCachedReleasesResult): string {
  const parts: string[] = [];
  const referencedVersions = result.kept_release_versions.filter(
    (releaseVersion) => result.kept_release_reasons[releaseVersion] === "workspace_reference"
  );
  const unknownReferences = result.kept_release_versions.some(
    (releaseVersion) => result.kept_release_reasons[releaseVersion] === "workspace_reference_version_unknown"
  );

  if (referencedVersions.length > 0) {
    parts.push(`已按历史作品引用保留 ${referencedVersions.length} 个旧版本`);
  }
  if (unknownReferences) {
    parts.push("历史作品引用的版本无法确定，已保守保留全部已缓存版本");
  }
  if (result.pruned_release_versions.length > 0) {
    parts.push(`已清理 ${result.pruned_release_versions.length} 个未引用旧版本`);
  }
  if (result.prune_failed_release_versions.length > 0) {
    parts.push(`${result.prune_failed_release_versions.length} 个旧版本删除失败，已保留`);
  }

  return parts.join("；");
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

/**
 * 本机 Release 缓存只服务当前用户：目录 0750 / 文件 0640（不再向同机其他用户开放写/读权限）。
 * SMB/NAS 等不支持 chmod 的文件系统保持 best-effort，不阻塞同步。
 */
async function makeReleaseTreeReadable(root: string): Promise<void> {
  await chmod(root, 0o750).catch(() => {
    // Best effort for filesystems that do not support chmod.
  });

  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await makeReleaseTreeReadable(entryPath);
      return;
    }
    if (entry.isFile()) {
      await chmod(entryPath, 0o640).catch(() => {
        // Best effort for filesystems that do not support chmod.
      });
    }
  }));
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
    await makeReleaseTreeReadable(tempReleaseRoot);
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
  await chmod(tempPointerPath, 0o640).catch(() => {
    // Best effort for filesystems that do not support chmod.
  });
  await rename(tempPointerPath, targetPointerPath);
}


async function sha256FileStream(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let nextIndex = 0;
  const runnerCount = Math.max(1, Math.min(limit, items.length || 1));

  await Promise.all(
    Array.from({ length: runnerCount }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) {
          return;
        }

        results[index] = await worker(items[index]!);
      }
    })
  );

  return results;
}

export interface ReleaseBundleV2Verification {
  verified_files: number;
  failed_files: ReleaseCacheFileVerificationFailure[];
}

/** 逐文件校验 Manifest v2：size + 流式 sha256（大文件也用流式 hash，不整体读入内存）。 */
export async function verifyReleaseBundleV2(input: {
  release_root: string;
  manifest: ReleaseManifestV2;
  concurrency?: number;
}): Promise<ReleaseBundleV2Verification> {
  const outcomes = await mapWithConcurrency(
    input.manifest.files,
    Number.isInteger(input.concurrency) && (input.concurrency ?? 0) > 0
      ? Math.floor(input.concurrency!)
      : RELEASE_V2_HASH_CONCURRENCY,
    async (entry) => {
      const filePath = path.join(input.release_root, ...entry.path.split("/"));

      try {
        const fileStat = await stat(filePath);

        if (!fileStat.isFile()) {
          return { ok: false, path: entry.path, reason: "not_a_regular_file" };
        }

        if (fileStat.size !== entry.size) {
          return {
            ok: false,
            path: entry.path,
            reason: `size_mismatch expected=${entry.size} actual=${fileStat.size}`
          };
        }

        const actualSha256 = await sha256FileStream(filePath);

        if (actualSha256 !== entry.sha256) {
          return {
            ok: false,
            path: entry.path,
            reason: `sha256_mismatch expected=${entry.sha256.slice(0, 12)} actual=${actualSha256.slice(0, 12)}`
          };
        }

        return { ok: true, path: entry.path, reason: "" };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        return {
          ok: false,
          path: entry.path,
          reason: code === "ENOENT" ? "missing" : ((error as Error).message || "read_error")
        };
      }
    }
  );

  const failedFiles = outcomes
    .filter((outcome) => !outcome.ok)
    .map((outcome) => ({ path: outcome.path, reason: outcome.reason || "unknown" }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    verified_files: outcomes.length - failedFiles.length,
    failed_files: failedFiles
  };
}

interface ReleaseV2VerificationSidecar {
  schema_version: "1.0";
  release_id: string;
  verified_files: number;
  verified_at: string;
}

function releaseV2VerificationSidecarPath(cacheRoot: string, releaseVersion: string): string {
  return path.join(releaseRoot(cacheRoot, releaseVersion), RELEASE_V2_VERIFICATION_SIDECAR);
}

async function readReleaseV2VerificationSidecar(
  cacheRoot: string,
  releaseVersion: string
): Promise<ReleaseV2VerificationSidecar | null> {
  try {
    const parsed = JSON.parse(
      await readFile(releaseV2VerificationSidecarPath(cacheRoot, releaseVersion), "utf8")
    ) as Partial<ReleaseV2VerificationSidecar>;

    if (
      parsed.schema_version !== "1.0" ||
      typeof parsed.release_id !== "string" ||
      !Number.isSafeInteger(parsed.verified_files)
    ) {
      return null;
    }

    return {
      schema_version: "1.0",
      release_id: parsed.release_id,
      verified_files: parsed.verified_files!,
      verified_at: typeof parsed.verified_at === "string" ? parsed.verified_at : ""
    };
  } catch {
    return null;
  }
}

async function writeReleaseV2VerificationSidecar(input: {
  cache_root: string;
  release_version: string;
  release_id: string;
  verified_files: number;
}): Promise<void> {
  await writeFile(
    releaseV2VerificationSidecarPath(input.cache_root, input.release_version),
    `${JSON.stringify({
      schema_version: "1.0",
      release_id: input.release_id,
      verified_files: input.verified_files,
      verified_at: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );
}

interface ReleaseManifestV2Lookup {
  manifest?: ReleaseManifestV2;
  manifest_file?: string;
  invalid_reason?: string;
}

async function readCutterReleaseManifestV2(
  sourceLibraryRoot: string,
  releaseVersion: string
): Promise<ReleaseManifestV2Lookup> {
  for (const fileName of RELEASE_MANIFEST_V2_FILE_NAMES) {
    const manifestPath = path.join(releaseRoot(sourceLibraryRoot, releaseVersion), fileName);

    if (!(await fileExists(manifestPath))) {
      continue;
    }

    try {
      // Round5: v2 manifest 解析切换到 library-format（JSON 错误 + 契约校验统一）。
      return {
        manifest: parseReleaseManifestV2(
          parseJsonText(await readFile(manifestPath, "utf8"), "发布清单 manifest v2")
        ),
        manifest_file: fileName
      };
    } catch (error) {
      return {
        manifest_file: fileName,
        invalid_reason: (error as Error).message || "invalid release manifest v2"
      };
    }
  }

  return {};
}

async function buildReleaseCacheSyncResult(input: {
  cache_root: string;
  max_cached_releases: number;
  include_cache_size?: boolean;
  source_release_version: string;
  copied: boolean;
  verification: ReleaseCacheVerificationResult;
  pinned_release_versions: string[];
  prune_result?: PruneCachedReleasesResult;
  message_override?: string;
}): Promise<SyncCutterReleaseCacheResult> {
  const status = await readLocalCutterReleaseCacheStatus({
    cache_root: input.cache_root,
    max_cached_releases: input.max_cached_releases,
    include_cache_size: input.include_cache_size
  });
  const pruneMessage = input.prune_result ? releaseCachePruneMessage(input.prune_result) : "";
  const baseMessage = input.copied ? "已同步最新 Release" : "本机 Release 已是最新";
  const message = input.message_override
    ? input.message_override
    : pruneMessage
      ? `${baseMessage}；${pruneMessage}`
      : baseMessage;

  return {
    ...status,
    source_release_version: input.source_release_version,
    copied: input.copied,
    pruned_release_versions: input.prune_result?.pruned_release_versions ?? [],
    kept_release_versions: input.prune_result?.kept_release_versions,
    kept_release_reasons: input.prune_result?.kept_release_reasons,
    pinned_release_versions: input.pinned_release_versions,
    prune_failed_release_versions: input.prune_result?.prune_failed_release_versions,
    verification: input.verification,
    message
  };
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
  const sourceReleaseVersion = pointer.current_version;
  const pinnedReleaseVersions = normalizePinnedReleaseVersions(input.pinned_release_versions);
  const preservedUnreferencedVersions = input.preserve_cached_releases_for_unknown_references === true;
  const clientVersion = input.client_version?.trim() ?? "";

  const legacySync = async (
    verification: ReleaseCacheVerificationResult
  ): Promise<SyncCutterReleaseCacheResult> => {
    const copied = await copyReleaseFiles({
      source_library_root: input.source_library_root,
      cache_root: input.cache_root,
      release_version: sourceReleaseVersion
    });

    if (copied) {
      invalidateLocalCacheSize(input.cache_root);
    }

    await writeCachePointer(input);
    const pruneResult = await pruneCachedReleases({
      cache_root: input.cache_root,
      active_release_version: sourceReleaseVersion,
      max_cached_releases: maxCachedReleases,
      pinned_release_versions: pinnedReleaseVersions,
      preserve_cached_releases_for_unknown_references: preservedUnreferencedVersions
    });

    return buildReleaseCacheSyncResult({
      cache_root: input.cache_root,
      max_cached_releases: maxCachedReleases,
      include_cache_size: input.include_cache_size,
      source_release_version: sourceReleaseVersion,
      copied,
      verification,
      pinned_release_versions: pinnedReleaseVersions,
      prune_result: pruneResult
    });
  };

  const failClosed = (
    verification: ReleaseCacheVerificationResult,
    message: string
  ): Promise<SyncCutterReleaseCacheResult> =>
    buildReleaseCacheSyncResult({
      cache_root: input.cache_root,
      max_cached_releases: maxCachedReleases,
      include_cache_size: input.include_cache_size,
      source_release_version: sourceReleaseVersion,
      copied: false,
      verification,
      pinned_release_versions: pinnedReleaseVersions,
      message_override: message
    });

  const manifestLookup = await readCutterReleaseManifestV2(
    input.source_library_root,
    sourceReleaseVersion
  );

  if (manifestLookup.invalid_reason) {
    return failClosed(
      {
        manifest_schema_version: "2.0",
        verified_files: 0,
        failed_files: [{
          path: manifestLookup.manifest_file ?? RELEASE_MANIFEST_V2_FILE_NAMES[0],
          reason: manifestLookup.invalid_reason
        }],
        fallback_reason: "manifest_v2_invalid",
        verified_at: new Date().toISOString()
      },
      `发布制品清单 v2 无效：${manifestLookup.invalid_reason}；已保留本机旧缓存，不切换、不淘汰。`
    );
  }

  if (manifestLookup.manifest) {
    const manifest = manifestLookup.manifest;
    const baseVerification = {
      manifest_schema_version: "2.0" as const,
      release_id: manifest.release_id,
      min_client_version: manifest.min_client_version,
      verified_at: new Date().toISOString()
    };

    if (clientVersion && !releaseManifestIsCompatible(manifest, clientVersion)) {
      const definition = contractErrorDefinition(CONTRACT_ERROR_TOO_OLD);
      const verification: ReleaseCacheVerificationResult = {
        ...baseVerification,
        verified_files: 0,
        failed_files: [],
        fallback_reason: "contract_too_old",
        contract_error_code: CONTRACT_ERROR_TOO_OLD,
        ...(definition
          ? { contract_error_message: `${definition.user_message}；${definition.remediation}` }
          : {})
      };

      // 契约兼容失败不影响旧路径：legacy 制品可读时按既有目录校验继续同步。
      if (await releaseFilesReady(input.source_library_root, sourceReleaseVersion)) {
        const legacyResult = await legacySync(verification);

        return {
          ...legacyResult,
          verification,
          message: `客户端版本 ${clientVersion} 低于 Release 要求的 ${manifest.min_client_version}（CONTRACT_TOO_OLD）；已按 legacy 目录继续同步。${legacyResult.message}`
        };
      }

      return failClosed(
        verification,
        `客户端版本 ${clientVersion} 低于 Release 要求的 ${manifest.min_client_version}（CONTRACT_TOO_OLD），且发布缺少 legacy 制品；已保留本机旧缓存。`
      );
    }

    if (!(await releaseFilesReady(input.source_library_root, sourceReleaseVersion))) {
      return failClosed(
        {
          ...baseVerification,
          verified_files: 0,
          failed_files: [{
            path: "release.json",
            reason: "legacy_artifacts_required_for_consumers"
          }],
          fallback_reason: "legacy_artifacts_missing"
        },
        "Manifest v2 对应的 Release 缺少本机消费端所需的 legacy 制品（catalog/source-path-map/index）；已保留本机旧缓存，不切换。"
      );
    }

    const sidecar = await readReleaseV2VerificationSidecar(
      input.cache_root,
      sourceReleaseVersion
    );
    const cacheReusable =
      sidecar?.release_id === manifest.release_id &&
      (await releaseFilesReady(input.cache_root, sourceReleaseVersion));
    let verification: ReleaseCacheVerificationResult = {
      ...baseVerification,
      verified_files: cacheReusable ? manifest.files.length : 0,
      failed_files: []
    };

    if (!cacheReusable) {
      const check = await verifyReleaseBundleV2({
        release_root: releaseRoot(input.source_library_root, sourceReleaseVersion),
        manifest
      });

      if (
        check.failed_files.length > 0 ||
        check.verified_files !== manifest.files.length
      ) {
        return failClosed(
          {
            ...baseVerification,
            verified_files: check.verified_files,
            failed_files: check.failed_files,
            fallback_reason: "file_verification_failed"
          },
          `发布制品校验失败：${check.failed_files.length} 个文件与 Manifest v2 不一致（首个：${check.failed_files[0]?.path ?? "unknown"}）；已保留本机旧缓存，不切换、不淘汰。`
        );
      }

      verification = {
        ...verification,
        verified_files: check.verified_files
      };
      // 丢弃可能不一致的旧缓存目录，复制已验证源制品。
      await rm(releaseRoot(input.cache_root, sourceReleaseVersion), {
        recursive: true,
        force: true
      });
    }

    const copied = cacheReusable
      ? false
      : await copyReleaseFiles({
          source_library_root: input.source_library_root,
          cache_root: input.cache_root,
          release_version: sourceReleaseVersion
        });

    if (copied) {
      invalidateLocalCacheSize(input.cache_root);
    }

    await writeReleaseV2VerificationSidecar({
      cache_root: input.cache_root,
      release_version: sourceReleaseVersion,
      release_id: manifest.release_id,
      verified_files: verification.verified_files
    }).catch(() => {
      // 诊断用 sidecar 写入失败不影响主流程（下次仍会重新 hash 校验）。
    });

    await writeCachePointer(input);
    const pruneResult = await pruneCachedReleases({
      cache_root: input.cache_root,
      active_release_version: sourceReleaseVersion,
      max_cached_releases: maxCachedReleases,
      pinned_release_versions: pinnedReleaseVersions,
      preserve_cached_releases_for_unknown_references: preservedUnreferencedVersions
    });

    return buildReleaseCacheSyncResult({
      cache_root: input.cache_root,
      max_cached_releases: maxCachedReleases,
      include_cache_size: input.include_cache_size,
      source_release_version: sourceReleaseVersion,
      copied,
      verification,
      pinned_release_versions: pinnedReleaseVersions,
      prune_result: pruneResult
    });
  }

  // Manifest v2 缺失：回退既有 legacy 目录校验/同步（记录 fallback_reason 供诊断）。
  return legacySync({
    manifest_schema_version: "none",
    verified_files: 0,
    failed_files: [],
    fallback_reason: "manifest_v2_missing",
    verified_at: new Date().toISOString()
  });
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

export async function readFastLocalCutterReleaseCacheStatus(input: {
  cache_root: string;
  max_cached_releases?: number;
}): Promise<CutterReleaseCacheStatus> {
  const maxCachedReleases = normalizeMaxCachedReleases(input.max_cached_releases);

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
      cached_release_versions: [manifest.release_version],
      cached_release_count: 1,
      max_cached_releases: maxCachedReleases,
      cache_size_bytes: 0,
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
      cached_release_versions: [],
      cached_release_count: 0,
      max_cached_releases: maxCachedReleases,
      cache_size_bytes: 0,
      catalog_file_path: "",
      message: "本机 Release 不可用"
    };
  }
}
