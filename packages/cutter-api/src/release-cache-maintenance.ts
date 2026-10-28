import { randomUUID } from "node:crypto";
import { type Stats } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * D4 Release 缓存 pin/淘汰（Windows / cutter-api）。
 *
 * 契约要点（Mac 已批准草案 + Windows 侧细化）：
 * - GET  /cutter/release-cache/pins  -> { pinned:[{version,size_bytes,last_used_at?,referenced_by:[{project_id,title,kind?}]}],
 *                                          unpinned:[{version,size_bytes,last_used_at?}], max_cached_releases }
 *   另增补 active_release_version / expected_bytes / confirm_token（evict 必须先从 GET 拿 token）。
 * - POST /cutter/release-cache/evict -> { evicted, freed_bytes, blocked:[{version,reason,referenced_by?}] }
 *   规则：被 workspace 历史作品引用的版本不可淘汰（release_cache_pinned）；当前 active 版本不可淘汰
 *   （release_cache_in_use）；不存在的版本 blocked（release_cache_unknown）；token 短时有效（默认 120s）、
 *   一次性、绑定版本快照 + expected_bytes；expected 不符返回 409 且不删除；同一实例并发淘汰返回 release_cache_busy。
 * - 只删除 cache_root/.mixlab-library/releases/<version> 目录，版本号严格 vNNNNNN 白名单 + 路径包含校验。
 *
 * 该模块不 import index.ts（避免循环依赖）；workspace 引用扫描由 index.ts 注入（复用已有扫描函数）。
 */

export const RELEASE_CACHE_MAINTENANCE_ERROR_CODES = {
  release_cache_pinned: "release_cache_pinned",
  release_cache_in_use: "release_cache_in_use",
  release_cache_unknown: "release_cache_unknown",
  release_cache_confirm_invalid: "release_cache_confirm_invalid",
  release_cache_confirm_expired: "release_cache_confirm_expired",
  release_cache_expected_bytes_mismatch: "release_cache_expected_bytes_mismatch",
  release_cache_busy: "release_cache_busy",
  release_cache_request_invalid: "release_cache_request_invalid",
  release_cache_delete_failed: "release_cache_delete_failed",
  release_cache_unsafe_path: "release_cache_unsafe_path"
} as const;
export type ReleaseCacheMaintenanceErrorCode =
  (typeof RELEASE_CACHE_MAINTENANCE_ERROR_CODES)[keyof typeof RELEASE_CACHE_MAINTENANCE_ERROR_CODES];

const RELEASE_CACHE_ERROR_STATUS: Record<ReleaseCacheMaintenanceErrorCode, number> = {
  release_cache_pinned: 409,
  release_cache_in_use: 409,
  release_cache_unknown: 404,
  release_cache_confirm_invalid: 409,
  release_cache_confirm_expired: 409,
  release_cache_expected_bytes_mismatch: 409,
  release_cache_busy: 409,
  release_cache_request_invalid: 400,
  release_cache_delete_failed: 500,
  release_cache_unsafe_path: 403
};

const RELEASE_CACHE_ERROR_REMEDIATION: Record<ReleaseCacheMaintenanceErrorCode, string> = {
  release_cache_pinned: "该 Release 版本被本机项目/清单/任务引用，不能淘汰；如确认不再需要，请先清理对应项目或解除引用。",
  release_cache_in_use: "当前 active Release 版本正在被本机引擎使用，不能淘汰；等待新版本同步完成后再试。",
  release_cache_unknown: "刷新 Release 缓存清单后重试。",
  release_cache_confirm_invalid: "confirm_token 已使用、与本次 versions 不匹配或格式错误，请重新调用 GET /cutter/release-cache/pins 预览后再操作。",
  release_cache_confirm_expired: "重新调用 GET /cutter/release-cache/pins 获取新的 confirm_token 后再操作。",
  release_cache_expected_bytes_mismatch: "Release 缓存已变化，请重新调用 GET /cutter/release-cache/pins 预览后再淘汰。",
  release_cache_busy: "等待当前 Release 缓存淘汰完成后重试。",
  release_cache_request_invalid: "检查请求体：versions 为非空字符串数组、confirm_token 为字符串、expected_bytes 为非负整数。",
  release_cache_delete_failed: "关闭占用 Release 缓存文件的程序后重试。",
  release_cache_unsafe_path: "该 Release 版本路径不在允许淘汰的缓存目录内，已拒绝删除。"
};

/** CutterApiError envelope 内的 Release 缓存淘汰稳定错误。 */
export class ReleaseCacheMaintenanceError extends Error {
  readonly code: ReleaseCacheMaintenanceErrorCode;
  readonly status: number;
  readonly remediation: string;

  constructor(code: ReleaseCacheMaintenanceErrorCode, message: string) {
    super(message);
    this.name = "ReleaseCacheMaintenanceError";
    this.code = code;
    this.status = RELEASE_CACHE_ERROR_STATUS[code];
    this.remediation = RELEASE_CACHE_ERROR_REMEDIATION[code];
  }
}

export interface ReleaseCacheReferenceDetail {
  release_version: string;
  kind: "project" | "cut_job" | "clip_list" | "export_clip";
  ref_id: string;
  title: string;
}

export interface ReleaseCacheWorkspaceReferences {
  referenced: boolean;
  release_versions: string[];
  version_references: ReleaseCacheReferenceDetail[];
  warnings: string[];
}

export interface ReleaseCacheReferencedBy {
  project_id: string;
  title: string;
  kind?: string;
}

export interface ReleaseCachePinnedVersion {
  version: string;
  size_bytes: number;
  last_used_at?: string;
  referenced_by: ReleaseCacheReferencedBy[];
}

export interface ReleaseCacheUnpinnedVersion {
  version: string;
  size_bytes: number;
  last_used_at?: string;
}

export interface ReleaseCachePinsInventory {
  pinned: ReleaseCachePinnedVersion[];
  unpinned: ReleaseCacheUnpinnedVersion[];
  max_cached_releases: number;
  active_release_version?: string;
  /** 本次快照可淘汰字节数（unpinned 且非 active 版本之和）；evict 的 expected_bytes 必须与之一致（子集时按所选版本和）。 */
  expected_bytes: number;
  confirm_token: string;
  warnings?: Array<{ code: string; message: string }>;
}

export interface ReleaseCacheEvictResult {
  evicted: string[];
  freed_bytes: number;
  blocked: Array<{
    version: string;
    reason: string;
    referenced_by?: ReleaseCacheReferencedBy[];
  }>;
}

export interface ReleaseCacheMaintenanceEnvironment {
  /** 本机 release cache root（其下 .mixlab-library/releases/<version>）。未配置时 pins 返回空清单。 */
  cache_root?: string;
  max_cached_releases?: number;
  /** 复用 index.ts 的 workspace release 引用扫描（只读 best-effort）。 */
  collect_workspace_references?: () => Promise<ReleaseCacheWorkspaceReferences>;
  /** 测试注入时钟（毫秒）；默认 Date.now。 */
  now_ms?: () => number;
  /** confirm_token TTL；默认 120_000。 */
  confirm_ttl_ms?: number;
}

export interface ReleaseCacheMaintenanceService {
  pins(): Promise<ReleaseCachePinsInventory>;
  evict(body: unknown): Promise<ReleaseCacheEvictResult>;
  /** 并发保护：同一服务实例同一时刻只允许一个 evict；拿不到返回 null。 */
  tryBeginEvict(): (() => void) | null;
  isEvicting(): boolean;
  confirmTokenTtlMs(): number;
}

const DEFAULT_CONFIRM_TTL_MS = 120_000;
const DEFAULT_MAX_CACHED_RELEASES = 2;
const RELEASE_VERSION_PATTERN = /^v[0-9]{4,12}$/;

interface ConfirmTokenRecord {
  versions: string[];
  expected_bytes: number;
  expires_at_ms: number;
}

interface CachedReleaseVersion {
  version: string;
  directory_path: string;
  size_bytes: number;
  last_used_at?: string;
}

interface ReleaseCacheSnapshot {
  cached: CachedReleaseVersion[];
  pinned_versions: Set<string>;
  referenced_by: Map<string, ReleaseCacheReferencedBy[]>;
  active_release_version?: string;
  expected_bytes: number;
  warnings: Array<{ code: string; message: string }>;
}

function normalizeConfirmTtlMs(value: number | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? 0) <= 0) {
    return DEFAULT_CONFIRM_TTL_MS;
  }

  return Math.max(1, Math.floor(value!));
}

function normalizeMaxCachedReleases(value: number | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? 0) <= 0) {
    return DEFAULT_MAX_CACHED_RELEASES;
  }

  return Math.max(1, Math.floor(value!));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mixlabRoot(cacheRoot: string): string {
  return path.join(cacheRoot, ".mixlab-library");
}

function releasesRoot(cacheRoot: string): string {
  return path.join(mixlabRoot(cacheRoot), "releases");
}

function currentReleasePointerPath(cacheRoot: string): string {
  return path.join(mixlabRoot(cacheRoot), "current-release.json");
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
}

/** 淘汰白名单：只允许 cache_root/.mixlab-library/releases/<vNNNNNN>/...。 */
export function isReleaseCacheEvictionPathAllowed(input: {
  cache_root: string;
  target_path: string;
}): boolean {
  const root = releasesRoot(input.cache_root);
  const targetPath = path.resolve(input.target_path);
  if (!isInsidePath(root, targetPath)) {
    return false;
  }

  const relative = path.relative(root, targetPath);
  const parts = relative.split(path.sep);
  return parts.length >= 1 && RELEASE_VERSION_PATTERN.test(parts[0] ?? "");
}

async function statSafe(targetPath: string): Promise<Stats | null> {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

async function measureDirectoryBytes(
  directoryPath: string
): Promise<{ size_bytes: number; latest_mtime_ms: number }> {
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return { size_bytes: 0, latest_mtime_ms: 0 };
  }

  let sizeBytes = 0;
  let latestMtimeMs = 0;
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await measureDirectoryBytes(entryPath);
      sizeBytes += nested.size_bytes;
      latestMtimeMs = Math.max(latestMtimeMs, nested.latest_mtime_ms);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const fileStat = await statSafe(entryPath);
    if (!fileStat?.isFile()) {
      continue;
    }
    sizeBytes += fileStat.size;
    latestMtimeMs = Math.max(latestMtimeMs, fileStat.mtimeMs);
  }

  return { size_bytes: sizeBytes, latest_mtime_ms: latestMtimeMs };
}

async function readActiveReleaseVersion(cacheRoot: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(currentReleasePointerPath(cacheRoot), "utf8")) as unknown;
    const currentVersion = isRecord(parsed) && typeof parsed.current_version === "string"
      ? parsed.current_version.trim()
      : "";
    return RELEASE_VERSION_PATTERN.test(currentVersion) ? currentVersion : undefined;
  } catch {
    return undefined;
  }
}

async function listCachedReleaseVersions(cacheRoot: string): Promise<CachedReleaseVersion[]> {
  let entries;
  try {
    entries = await readdir(releasesRoot(cacheRoot), { withFileTypes: true });
  } catch {
    return [];
  }

  const releases: CachedReleaseVersion[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !RELEASE_VERSION_PATTERN.test(entry.name)) {
      continue;
    }
    const directoryPath = path.join(releasesRoot(cacheRoot), entry.name);
    const measured = await measureDirectoryBytes(directoryPath);
    releases.push({
      version: entry.name,
      directory_path: directoryPath,
      size_bytes: measured.size_bytes,
      ...(measured.latest_mtime_ms > 0
        ? { last_used_at: new Date(measured.latest_mtime_ms).toISOString() }
        : {})
    });
  }

  releases.sort((left, right) => left.version.localeCompare(right.version));
  return releases;
}

async function buildReleaseCacheSnapshot(
  env: ReleaseCacheMaintenanceEnvironment
): Promise<ReleaseCacheSnapshot> {
  const cacheRoot = env.cache_root;
  if (!cacheRoot) {
    return {
      cached: [],
      pinned_versions: new Set(),
      referenced_by: new Map(),
      expected_bytes: 0,
      warnings: []
    };
  }

  const cached = await listCachedReleaseVersions(cacheRoot);
  const pinnedVersions = new Set<string>();
  const referencedBy = new Map<string, ReleaseCacheReferencedBy[]>();
  const warnings: Array<{ code: string; message: string }> = [];
  let referencesUnknown = false;

  if (env.collect_workspace_references) {
    try {
      const references = await env.collect_workspace_references();
      for (const version of references.release_versions) {
        pinnedVersions.add(version);
      }
      for (const detail of references.version_references) {
        pinnedVersions.add(detail.release_version);
        const current = referencedBy.get(detail.release_version) ?? [];
        if (!current.some((item) => item.kind === detail.kind && item.project_id === detail.ref_id)) {
          current.push({
            project_id: detail.ref_id,
            title: detail.title,
            kind: detail.kind
          });
        }
        referencedBy.set(detail.release_version, current);
      }
      for (const warning of references.warnings) {
        warnings.push({ code: "release_cache_reference_scan_warning", message: warning });
      }
      if (references.referenced && references.release_versions.length === 0) {
        referencesUnknown = true;
        warnings.push({
          code: "release_cache_references_unknown",
          message: "本机历史作品清单未记录 Release 版本，已保守保留全部已缓存版本"
        });
      }
    } catch (error) {
      referencesUnknown = true;
      warnings.push({
        code: "release_cache_reference_scan_failed",
        message: "本机历史作品引用扫描失败，已保守保留全部已缓存版本：" + errorText(error)
      });
    }
  }

  const activeReleaseVersion = await readActiveReleaseVersion(cacheRoot);
  let expectedBytes = 0;
  for (const release of cached) {
    const pinned = referencesUnknown || pinnedVersions.has(release.version);
    if (pinned) {
      pinnedVersions.add(release.version);
      if (!referencedBy.has(release.version)) {
        referencedBy.set(release.version, []);
      }
      continue;
    }
    if (release.version !== activeReleaseVersion) {
      expectedBytes += release.size_bytes;
    }
  }

  return {
    cached,
    pinned_versions: pinnedVersions,
    referenced_by: referencedBy,
    ...(activeReleaseVersion ? { active_release_version: activeReleaseVersion } : {}),
    expected_bytes: expectedBytes,
    warnings
  };
}

function requestInvalid(message: string): ReleaseCacheMaintenanceError {
  return new ReleaseCacheMaintenanceError(
    RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_request_invalid,
    message
  );
}

interface ParsedEvictRequest {
  versions: string[];
  confirm_token: string;
  expected_bytes: number;
}

function parseEvictRequest(body: unknown): ParsedEvictRequest {
  if (!isRecord(body)) {
    throw requestInvalid("请求体必须是 JSON 对象");
  }

  if (!Array.isArray(body.versions) || body.versions.length === 0) {
    throw requestInvalid("versions 必须是非空字符串数组");
  }

  const normalizedVersions: string[] = [];
  for (const item of body.versions) {
    if (typeof item !== "string" || item.trim() === "") {
      throw requestInvalid("versions 必须是非空字符串数组");
    }
    if (!normalizedVersions.includes(item.trim())) {
      normalizedVersions.push(item.trim());
    }
  }

  if (typeof body.confirm_token !== "string" || body.confirm_token.trim() === "") {
    throw new ReleaseCacheMaintenanceError(
      RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_confirm_invalid,
      "缺少 confirm_token，请先调用 GET /cutter/release-cache/pins 预览后再淘汰。"
    );
  }

  if (
    typeof body.expected_bytes !== "number" ||
    !Number.isInteger(body.expected_bytes) ||
    body.expected_bytes < 0
  ) {
    throw requestInvalid("expected_bytes 必须是非负整数");
  }

  return {
    versions: normalizedVersions,
    confirm_token: body.confirm_token.trim(),
    expected_bytes: body.expected_bytes
  };
}

export function createReleaseCacheMaintenanceService(
  env: ReleaseCacheMaintenanceEnvironment
): ReleaseCacheMaintenanceService {
  const ttlMs = normalizeConfirmTtlMs(env.confirm_ttl_ms);
  const nowMs = env.now_ms ?? Date.now;
  const maxCachedReleases = normalizeMaxCachedReleases(env.max_cached_releases);
  const confirmTokens = new Map<string, ConfirmTokenRecord>();
  let evicting = false;

  function pruneExpiredTokens(): void {
    const current = nowMs();
    for (const [token, record] of confirmTokens) {
      if (record.expires_at_ms <= current) {
        confirmTokens.delete(token);
      }
    }
  }

  function issueConfirmToken(versions: string[], expectedBytes: number): string {
    pruneExpiredTokens();
    const token = randomUUID();
    confirmTokens.set(token, {
      versions: [...versions],
      expected_bytes: expectedBytes,
      expires_at_ms: nowMs() + ttlMs
    });
    return token;
  }

  function readConfirmToken(rawToken: string): ConfirmTokenRecord {
    const token = rawToken.trim();
    const record = confirmTokens.get(token);
    if (!record) {
      throw new ReleaseCacheMaintenanceError(
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_confirm_invalid,
        "confirm_token 无效或已使用，请重新预览后再操作。"
      );
    }

    if (record.expires_at_ms <= nowMs()) {
      confirmTokens.delete(token);
      throw new ReleaseCacheMaintenanceError(
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_confirm_expired,
        "confirm_token 已过期，请重新预览后再操作。"
      );
    }

    return record;
  }

  function tryBeginEvict(): (() => void) | null {
    if (evicting) {
      return null;
    }

    evicting = true;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      evicting = false;
    };
  }

  async function pins(): Promise<ReleaseCachePinsInventory> {
    const snapshot = await buildReleaseCacheSnapshot(env);
    const pinned: ReleaseCachePinnedVersion[] = [];
    const unpinned: ReleaseCacheUnpinnedVersion[] = [];

    for (const release of snapshot.cached) {
      const lastUsed = release.last_used_at ? { last_used_at: release.last_used_at } : {};
      if (snapshot.pinned_versions.has(release.version)) {
        pinned.push({
          version: release.version,
          size_bytes: release.size_bytes,
          ...lastUsed,
          referenced_by: snapshot.referenced_by.get(release.version) ?? []
        });
        continue;
      }
      unpinned.push({
        version: release.version,
        size_bytes: release.size_bytes,
        ...lastUsed
      });
    }

    return {
      pinned,
      unpinned,
      max_cached_releases: maxCachedReleases,
      ...(snapshot.active_release_version
        ? { active_release_version: snapshot.active_release_version }
        : {}),
      expected_bytes: snapshot.expected_bytes,
      confirm_token: issueConfirmToken(
        snapshot.cached.map((release) => release.version),
        snapshot.expected_bytes
      ),
      ...(snapshot.warnings.length > 0 ? { warnings: snapshot.warnings } : {})
    };
  }

  async function evict(body: unknown): Promise<ReleaseCacheEvictResult> {
    const releaseBusy = tryBeginEvict();
    if (!releaseBusy) {
      throw new ReleaseCacheMaintenanceError(
        RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_busy,
        "本机 Release 缓存淘汰正在进行中，请等待当前淘汰完成后再试。"
      );
    }

    try {
      const request = parseEvictRequest(body);
      const tokenRecord = readConfirmToken(request.confirm_token);
      const snapshot = await buildReleaseCacheSnapshot(env);
      const cachedByVersion = new Map(snapshot.cached.map((release) => [release.version, release]));
      const blocked: ReleaseCacheEvictResult["blocked"] = [];
      const candidates: CachedReleaseVersion[] = [];

      for (const version of request.versions) {
        if (!RELEASE_VERSION_PATTERN.test(version) || !tokenRecord.versions.includes(version)) {
          blocked.push({
            version,
            reason: RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_unknown
          });
          continue;
        }

        const release = cachedByVersion.get(version);
        if (!release) {
          blocked.push({
            version,
            reason: RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_unknown
          });
          continue;
        }

        if (snapshot.pinned_versions.has(version)) {
          blocked.push({
            version,
            reason: RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_pinned,
            referenced_by: snapshot.referenced_by.get(version) ?? []
          });
          continue;
        }

        if (snapshot.active_release_version === version) {
          blocked.push({
            version,
            reason: RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_in_use
          });
          continue;
        }

        candidates.push(release);
      }

      const evictableBytes = candidates.reduce((total, release) => total + release.size_bytes, 0);
      if (evictableBytes !== request.expected_bytes) {
        throw new ReleaseCacheMaintenanceError(
          RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_expected_bytes_mismatch,
          "Release 缓存已变化：预期释放 " + request.expected_bytes + " 字节，当前可淘汰 " +
            evictableBytes + " 字节；未删除任何内容，请重新预览。"
        );
      }

      // 一次性：所有校验通过、真正开始删除前核销 token。
      confirmTokens.delete(request.confirm_token);

      const evicted: string[] = [];
      let freedBytes = 0;
      const cacheRoot = env.cache_root ?? "";
      for (const release of candidates) {
        if (!isReleaseCacheEvictionPathAllowed({
          cache_root: cacheRoot,
          target_path: release.directory_path
        })) {
          blocked.push({
            version: release.version,
            reason: RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_unsafe_path
          });
          continue;
        }

        try {
          await rm(release.directory_path, { recursive: true, force: true });
          evicted.push(release.version);
          freedBytes += release.size_bytes;
        } catch (error) {
          blocked.push({
            version: release.version,
            reason: RELEASE_CACHE_MAINTENANCE_ERROR_CODES.release_cache_delete_failed + ":" + errorText(error)
          });
        }
      }

      return {
        evicted,
        freed_bytes: freedBytes,
        blocked
      };
    } finally {
      releaseBusy();
    }
  }

  return {
    pins,
    evict,
    tryBeginEvict,
    isEvicting: () => evicting,
    confirmTokenTtlMs: () => ttlMs
  };
}
