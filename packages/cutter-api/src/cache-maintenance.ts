import { constants as fsConstants, type Stats } from "node:fs";
import { randomUUID } from "node:crypto";
import { access, readdir, rmdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { isCachePathPinned } from "../../cutter-local/src/index.ts";

/**
 * D1b 磁盘缓存清理（Windows / cutter-api）。
 *
 * 契约要点（Mac 已批准）：
 * - GET  /cutter/cache/inventory -> targets/protected/warnings/confirm_token/expected_bytes
 * - POST /cutter/cache/clean     -> cleaned/freed_bytes/skipped/errors
 * - confirm_token 由 inventory 签发，短时有效、一次性、绑定 targets 快照与 expected_bytes；
 * - expected_bytes 与清理前重新计算的 deletable 总和必须一致，否则不删除任何东西；
 * - 被 pin / 正在预取 / release（D4 处理）的目标只 skip 不删除；
 * - 同一服务实例内串行清理，第二个并发请求返回 cache_busy。
 *
 * 该模块不 import index.ts（避免循环依赖）：路径解析、运行态失效等由 index.ts 通过
 * CacheMaintenanceEnvironment 注入；文件扫描逻辑与 index.ts 内私有 helper 等价。
 */

export const CACHE_TARGET_IDS = ["searchd", "thumbnail", "source_video", "cut_temp", "release"] as const;
export type CacheTargetId = (typeof CACHE_TARGET_IDS)[number];

/** 稳定错误码（cutter-api 内导出，前端/测试按码分支；不改现有错误码语义）。 */
export const CACHE_MAINTENANCE_ERROR_CODES = {
  cache_path_not_writable: "cache_path_not_writable",
  cache_target_unknown: "cache_target_unknown",
  cache_confirm_expired: "cache_confirm_expired",
  cache_confirm_invalid: "cache_confirm_invalid",
  cache_busy: "cache_busy",
  cache_expected_bytes_mismatch: "cache_expected_bytes_mismatch",
  /** 请求体字段缺失/类型错误（400）；与缓存状态无关。 */
  cache_request_invalid: "cache_request_invalid",
  /** 删除单个缓存文件失败（记录在 clean 结果的 errors 中，HTTP 仍为 200）。 */
  cache_delete_failed: "cache_delete_failed"
} as const;
export type CacheMaintenanceErrorCode = (typeof CACHE_MAINTENANCE_ERROR_CODES)[keyof typeof CACHE_MAINTENANCE_ERROR_CODES];

const CACHE_ERROR_STATUS: Record<CacheMaintenanceErrorCode, number> = {
  cache_path_not_writable: 403,
  cache_target_unknown: 400,
  cache_confirm_expired: 409,
  cache_confirm_invalid: 409,
  cache_busy: 409,
  cache_expected_bytes_mismatch: 409,
  cache_request_invalid: 400,
  cache_delete_failed: 500
};

const CACHE_ERROR_REMEDIATION: Record<CacheMaintenanceErrorCode, string> = {
  cache_path_not_writable: "检查缓存目录是否存在、是否为目录且当前用户可写；若路径被其他程序占用，请关闭后重试。",
  cache_target_unknown: "从 /cutter/cache/inventory 重新获取 targets 列表后再试。",
  cache_confirm_expired: "重新调用 /cutter/cache/inventory 获取新的 confirm_token 后再清理。",
  cache_confirm_invalid: "confirm_token 已使用或与本次 targets 不匹配，请重新预览后再清理。",
  cache_busy: "等待当前磁盘缓存清理完成后重试。",
  cache_expected_bytes_mismatch: "磁盘缓存内容已变化，请重新调用 /cutter/cache/inventory 预览后再清理。",
  cache_request_invalid: "检查请求体：targets 为非空字符串数组、confirm_token 为字符串、expected_bytes 为非负整数。",
  cache_delete_failed: "关闭占用缓存文件的程序后重试。"
};

/** CutterApiError envelope 内的稳定缓存错误（code/message/remediation + HTTP status）。 */
export class CacheMaintenanceError extends Error {
  readonly code: CacheMaintenanceErrorCode;
  readonly status: number;
  readonly remediation: string;

  constructor(code: CacheMaintenanceErrorCode, message: string) {
    super(message);
    this.name = "CacheMaintenanceError";
    this.code = code;
    this.status = CACHE_ERROR_STATUS[code];
    this.remediation = CACHE_ERROR_REMEDIATION[code];
  }
}

export interface CacheInventoryTarget {
  id: CacheTargetId;
  label: string;
  path: string;
  size_bytes: number;
  file_count: number;
  updated_at?: string;
  writable: boolean;
  deletable: boolean;
  deletable_bytes: number;
  reason?: string;
}

export type CacheProtectedItemKind = "project" | "cut_job" | "local_clip" | "pinned_cache";

export interface CacheInventoryProtectedItem {
  kind: CacheProtectedItemKind;
  ref_id: string;
  title: string;
  reason: string;
}

export interface CacheInventoryWarning {
  code: string;
  message: string;
  path?: string;
}

export interface CacheInventory {
  targets: CacheInventoryTarget[];
  protected: CacheInventoryProtectedItem[];
  warnings: CacheInventoryWarning[];
  confirm_token: string;
  expected_bytes: number;
}

export interface CacheCleanResult {
  cleaned: string[];
  freed_bytes: number;
  skipped: Array<{ id: string; reason: string }>;
  errors: Array<{ code: string; path?: string; message: string }>;
}

export type CacheMaintenanceTargetPaths = Record<CacheTargetId, string>;

export interface ActiveCutJobSummary {
  cut_job_id: string;
  title?: string;
  status?: string;
}

export interface CacheMaintenanceEnvironment {
  /** localCacheRootForInput(input)：release cache root 或 workspace/cache。 */
  cache_root: string;
  /** workspace cache 子目录（workspace_root/cache）；无 workspace 时省略。 */
  workspace_cache_root?: string;
  /** 各目标根目录（路径解析由 index.ts 私有 helper 提供）。 */
  target_paths: CacheMaintenanceTargetPaths;
  /** readSourceVideoCacheStatus(input) 的薄包装；用于识别 active prefetch。 */
  read_source_video_cache_status?: () => Promise<{ active_prefetch_count: number; cache_root_path?: string }>;
  /** 待剪/执行中的 cut job（protected.cut_job）；best-effort。 */
  list_active_cut_jobs?: () => Promise<ActiveCutJobSummary[]>;
  /** invalidateLocalCacheRuntimeStatus(input)。 */
  invalidate_runtime_status?: () => void;
  /** 测试注入时钟（毫秒）；默认 Date.now。 */
  now_ms?: () => number;
  /** confirm_token TTL；默认 120_000。 */
  confirm_ttl_ms?: number;
}

export interface CacheMaintenanceService {
  inventory(include?: string | null): Promise<CacheInventory>;
  clean(body: unknown): Promise<CacheCleanResult>;
  /** 并发保护：同一服务实例同一时刻只允许一个 clean；拿不到返回 null。 */
  tryBeginClean(): (() => void) | null;
  isCleaning(): boolean;
  confirmTokenTtlMs(): number;
}

const DEFAULT_CONFIRM_TTL_MS = 120_000;
const CACHE_MANIFEST_FILE_NAME = ".manifest.json";

const TARGET_LABELS: Record<CacheTargetId, string> = {
  searchd: "搜索索引缓存（searchd）",
  thumbnail: "缩略图缓存",
  source_video: "源视频缓存",
  cut_temp: "剪切临时区",
  release: "Release 缓存"
};

const TARGET_SCAN_MODES: Record<CacheTargetId, "direct" | "recursive"> = {
  searchd: "recursive",
  thumbnail: "direct",
  source_video: "direct",
  cut_temp: "direct",
  release: "recursive"
};

/** 这些目标的 .manifest.json 是索引元数据，不计入 size_bytes/file_count，也不会被删除。 */
const MANIFEST_EXCLUDED_TARGETS = new Set<CacheTargetId>(["thumbnail", "source_video"]);

const RELEASE_DEFERRED_REASON = "Release 缓存由版本淘汰端点（D4）管理，本端点不会删除";
const SOURCE_VIDEO_PREFETCH_REASON = "源视频缓存正在预取中，本次清理会跳过（预取完成后可重试）";
const TARGET_NOT_DIRECTORY_REASON = "缓存目标路径被同名文件占用（不是目录），无法清理";
const TARGET_OUTSIDE_ROOT_REASON = "缓存目标路径不在本机缓存根目录内，已拒绝清理";
const TARGET_NOT_WRITABLE_REASON = "缓存目标目录当前不可写，无法清理";
const MISSING_TARGET_REASON = "缓存目标不存在，无需清理";
const DEFAULT_SKIPPED_REASON = "目标受保护或正在使用中，已跳过";
const PINNED_FILE_REASON = "缓存文件正在使用中（已 pin），本次清理会跳过";

interface ConfirmTokenRecord {
  targets: CacheTargetId[];
  expected_bytes: number;
  expires_at_ms: number;
}

interface ScannedFile {
  path: string;
  name: string;
  size: number;
  mtime_ms: number;
  pinned: boolean;
}

interface TargetScan {
  exists: boolean;
  is_file: boolean;
  is_directory: boolean;
  writable: boolean;
  files: ScannedFile[];
  manifest_present: boolean;
  size_bytes: number;
  file_count: number;
  updated_at?: string;
}

interface TargetAnalysis {
  id: CacheTargetId;
  label: string;
  path: string;
  size_bytes: number;
  file_count: number;
  updated_at?: string;
  writable: boolean;
  deletable: boolean;
  deletable_bytes: number;
  reason?: string;
  path_is_file: boolean;
  outside_allowed_roots: boolean;
  exists: boolean;
  deletable_files: ScannedFile[];
  pinned_files: ScannedFile[];
  warnings: CacheInventoryWarning[];
}

function normalizeConfirmTtlMs(value: number | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN) || (value ?? 0) <= 0) {
    return DEFAULT_CONFIRM_TTL_MS;
  }

  return Math.max(1, Math.floor(value!));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function statFile(filePath: string): Promise<Stats | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function isPathInsideAny(parents: string[], child: string): boolean {
  return parents.some((parent) => isPathInside(parent, child));
}

async function isWritableDirectory(directoryPath: string): Promise<boolean> {
  try {
    await access(directoryPath, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function listDirectCacheFiles(root: string, excludeManifest: boolean): Promise<ScannedFile[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: ScannedFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (excludeManifest && entry.name === CACHE_MANIFEST_FILE_NAME) {
      continue;
    }
    const filePath = path.join(root, entry.name);
    const fileStat = await statFile(filePath);
    if (!fileStat?.isFile()) {
      continue;
    }
    files.push({
      path: filePath,
      name: entry.name,
      size: fileStat.size,
      mtime_ms: fileStat.mtimeMs,
      pinned: isCachePathPinned(filePath)
    });
  }

  return files;
}

async function listRecursiveCacheFiles(root: string, excludeManifest: boolean): Promise<ScannedFile[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: ScannedFile[] = [];
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRecursiveCacheFiles(entryPath, excludeManifest)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (excludeManifest && entry.name === CACHE_MANIFEST_FILE_NAME) {
      continue;
    }
    const fileStat = await statFile(entryPath);
    if (!fileStat?.isFile()) {
      continue;
    }
    files.push({
      path: entryPath,
      name: entry.name,
      size: fileStat.size,
      mtime_ms: fileStat.mtimeMs,
      pinned: isCachePathPinned(entryPath)
    });
  }

  return files;
}

/** 自底向上删除空目录；非空目录（含新写入/pin 文件）会保留。 */
async function removeEmptyDirectories(root: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await removeEmptyDirectories(path.join(root, entry.name));
    }
  }

  try {
    // rmdir 只能删除空目录；目录被并发写入会失败并保留。
    await rmdir(root);
  } catch {
    // 目录非空或不可删除：保留。
  }
}

async function scanCacheTarget(input: {
  root_path: string;
  scan_mode: "direct" | "recursive";
  exclude_manifest: boolean;
}): Promise<TargetScan> {
  const rootStat = await statFile(input.root_path);

  if (!rootStat) {
    return {
      exists: false,
      is_file: false,
      is_directory: false,
      // 目录不存在时删除是无操作，视为可清理；真正的权限问题会在创建/写入时暴露。
      writable: true,
      files: [],
      manifest_present: false,
      size_bytes: 0,
      file_count: 0
    };
  }

  if (!rootStat.isDirectory()) {
    return {
      exists: true,
      is_file: true,
      is_directory: false,
      writable: false,
      files: [],
      manifest_present: false,
      size_bytes: 0,
      file_count: 0
    };
  }

  const writable = await isWritableDirectory(input.root_path);
  const files = input.scan_mode === "recursive"
    ? await listRecursiveCacheFiles(input.root_path, input.exclude_manifest)
    : await listDirectCacheFiles(input.root_path, input.exclude_manifest);
  const manifestStat = input.exclude_manifest
    ? await statFile(path.join(input.root_path, CACHE_MANIFEST_FILE_NAME))
    : null;
  const sizeBytes = files.reduce((total, file) => total + file.size, 0);
  const latestMtime = files.reduce((latest, file) => Math.max(latest, file.mtime_ms), 0);

  return {
    exists: true,
    is_file: false,
    is_directory: true,
    writable,
    files,
    manifest_present: Boolean(manifestStat?.isFile()),
    size_bytes: sizeBytes,
    file_count: files.length,
    ...(latestMtime > 0 ? { updated_at: new Date(latestMtime).toISOString() } : {})
  };
}

async function analyzeCacheTarget(input: {
  env: CacheMaintenanceEnvironment;
  id: CacheTargetId;
  active_prefetch_count: number;
}): Promise<TargetAnalysis> {
  const targetPath = input.env.target_paths[input.id];
  const scan = await scanCacheTarget({
    root_path: targetPath,
    scan_mode: TARGET_SCAN_MODES[input.id],
    exclude_manifest: MANIFEST_EXCLUDED_TARGETS.has(input.id)
  });
  const allowedRoots = [
    input.env.cache_root,
    ...(input.env.workspace_cache_root ? [input.env.workspace_cache_root] : [])
  ];
  const inside = isPathInsideAny(allowedRoots, targetPath);
  const warnings: CacheInventoryWarning[] = [];
  const pinnedFiles = scan.files.filter((file) => file.pinned);
  let deletableFiles = scan.files.filter((file) => !file.pinned);
  let deletable = false;
  let reason: string | undefined;

  if (scan.is_file) {
    reason = TARGET_NOT_DIRECTORY_REASON;
    deletableFiles = [];
    warnings.push({ code: "cache_target_not_directory", message: reason, path: targetPath });
  } else if (!inside) {
    reason = TARGET_OUTSIDE_ROOT_REASON;
    deletableFiles = [];
    warnings.push({ code: "cache_path_outside_root", message: reason, path: targetPath });
  } else if (input.id === "release") {
    reason = RELEASE_DEFERRED_REASON;
    deletableFiles = [];
    warnings.push({ code: "release_cache_deferred", message: RELEASE_DEFERRED_REASON, path: targetPath });
  } else if (input.id === "source_video" && input.active_prefetch_count > 0) {
    reason = SOURCE_VIDEO_PREFETCH_REASON;
    deletableFiles = [];
    warnings.push({
      code: "source_video_prefetch_active",
      message: "源视频缓存有 " + input.active_prefetch_count + " 个预取任务进行中，本次清理会跳过该目标",
      path: targetPath
    });
  } else if (!scan.writable) {
    reason = TARGET_NOT_WRITABLE_REASON;
    deletableFiles = [];
    warnings.push({ code: "cache_target_not_writable", message: reason, path: targetPath });
  } else {
    deletable = true;
  }

  if (input.id === "thumbnail" && scan.manifest_present) {
    warnings.push({
      code: "thumbnail_manifest_preserved",
      message: "缩略图缓存清理会保留 manifest 索引文件（不删除）",
      path: path.join(targetPath, CACHE_MANIFEST_FILE_NAME)
    });
  }

  if (deletable && input.id === "thumbnail" && scan.manifest_present) {
    reason = "清理会保留 manifest 索引文件";
  }

  if (deletable && pinnedFiles.length > 0) {
    reason = "有 " + pinnedFiles.length + " 个缓存文件正在使用中（已 pin），清理时会跳过";
  }

  return {
    id: input.id,
    label: TARGET_LABELS[input.id],
    path: targetPath,
    size_bytes: scan.size_bytes,
    file_count: scan.file_count,
    ...(scan.updated_at ? { updated_at: scan.updated_at } : {}),
    writable: scan.writable,
    deletable,
    deletable_bytes: deletable
      ? deletableFiles.reduce((total, file) => total + file.size, 0)
      : 0,
    ...(reason ? { reason } : {}),
    path_is_file: scan.is_file,
    outside_allowed_roots: !inside,
    exists: scan.exists,
    deletable_files: deletableFiles,
    pinned_files: pinnedFiles,
    warnings
  };
}

function toInventoryTarget(analysis: TargetAnalysis): CacheInventoryTarget {
  return {
    id: analysis.id,
    label: analysis.label,
    path: analysis.path,
    size_bytes: analysis.size_bytes,
    file_count: analysis.file_count,
    ...(analysis.updated_at ? { updated_at: analysis.updated_at } : {}),
    writable: analysis.writable,
    deletable: analysis.deletable,
    deletable_bytes: analysis.deletable_bytes,
    ...(analysis.reason ? { reason: analysis.reason } : {})
  };
}

function relativeRefId(target: TargetAnalysis, file: ScannedFile): string {
  const relative = path.relative(target.path, file.path).split(path.sep).join("/");
  return target.id + ":" + (relative || file.name);
}

function buildPinnedProtectedItems(analyses: TargetAnalysis[]): CacheInventoryProtectedItem[] {
  return analyses.flatMap((analysis) =>
    analysis.pinned_files.map((file) => ({
      kind: "pinned_cache" as const,
      ref_id: relativeRefId(analysis, file),
      title: file.name,
      reason: PINNED_FILE_REASON
    }))
  );
}

function dedupeWarnings(warnings: CacheInventoryWarning[]): CacheInventoryWarning[] {
  const seen = new Set<string>();
  const result: CacheInventoryWarning[] = [];
  for (const warning of warnings) {
    const key = warning.code + "\u0000" + (warning.path ?? "");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(warning);
  }
  return result;
}

function parseIncludeTargets(rawInclude: string | null | undefined): CacheTargetId[] {
  const raw = rawInclude?.trim();
  if (!raw) {
    return [...CACHE_TARGET_IDS];
  }

  const requested = new Set<CacheTargetId>();
  const unknown: string[] = [];
  for (const part of raw.split(",")) {
    const candidate = part.trim().toLowerCase();
    if (!candidate) {
      continue;
    }
    const matched = CACHE_TARGET_IDS.find((id) => id === candidate);
    if (matched) {
      requested.add(matched);
    } else {
      unknown.push(part.trim());
    }
  }

  if (unknown.length > 0) {
    throw new CacheMaintenanceError(
      CACHE_MAINTENANCE_ERROR_CODES.cache_target_unknown,
      "未知的缓存目标：" + unknown.join("、") + "；支持：" + CACHE_TARGET_IDS.join("、")
    );
  }

  if (requested.size === 0) {
    return [...CACHE_TARGET_IDS];
  }

  return CACHE_TARGET_IDS.filter((id) => requested.has(id));
}

function requestInvalid(message: string): CacheMaintenanceError {
  return new CacheMaintenanceError(CACHE_MAINTENANCE_ERROR_CODES.cache_request_invalid, message);
}

interface ParsedCleanRequest {
  targets: CacheTargetId[];
  confirm_token: string;
  expected_bytes: number;
}

function parseCleanRequest(body: unknown): ParsedCleanRequest {
  if (!isRecord(body)) {
    throw requestInvalid("请求体必须是 JSON 对象");
  }

  if (!Array.isArray(body.targets) || body.targets.length === 0) {
    throw requestInvalid("targets 必须是非空字符串数组");
  }

  const requested = new Set<CacheTargetId>();
  const unknown: string[] = [];
  for (const item of body.targets) {
    if (typeof item !== "string" || item.trim() === "") {
      throw requestInvalid("targets 必须是非空字符串数组");
    }
    const candidate = item.trim().toLowerCase();
    const matched = CACHE_TARGET_IDS.find((id) => id === candidate);
    if (matched) {
      requested.add(matched);
    } else {
      unknown.push(item.trim());
    }
  }

  if (unknown.length > 0) {
    throw new CacheMaintenanceError(
      CACHE_MAINTENANCE_ERROR_CODES.cache_target_unknown,
      "未知的缓存目标：" + unknown.join("、") + "；支持：" + CACHE_TARGET_IDS.join("、")
    );
  }

  if (typeof body.confirm_token !== "string" || body.confirm_token.trim() === "") {
    throw new CacheMaintenanceError(
      CACHE_MAINTENANCE_ERROR_CODES.cache_confirm_invalid,
      "缺少 confirm_token，请先调用 /cutter/cache/inventory 预览后再清理。"
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
    targets: CACHE_TARGET_IDS.filter((id) => requested.has(id)),
    confirm_token: body.confirm_token.trim(),
    expected_bytes: body.expected_bytes
  };
}

async function readSourceVideoStatusBestEffort(
  env: CacheMaintenanceEnvironment
): Promise<{ active_prefetch_count: number }> {
  if (!env.read_source_video_cache_status) {
    return { active_prefetch_count: 0 };
  }

  try {
    const status = await env.read_source_video_cache_status();
    const count = status.active_prefetch_count;
    return {
      active_prefetch_count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
    };
  } catch {
    return { active_prefetch_count: 0 };
  }
}

async function listActiveCutJobsBestEffort(
  env: CacheMaintenanceEnvironment
): Promise<ActiveCutJobSummary[]> {
  if (!env.list_active_cut_jobs) {
    return [];
  }

  try {
    return await env.list_active_cut_jobs();
  } catch {
    return [];
  }
}

export function createCacheMaintenanceService(
  env: CacheMaintenanceEnvironment
): CacheMaintenanceService {
  const ttlMs = normalizeConfirmTtlMs(env.confirm_ttl_ms);
  const nowMs = env.now_ms ?? Date.now;
  const confirmTokens = new Map<string, ConfirmTokenRecord>();
  let cleaning = false;

  function pruneExpiredTokens(): void {
    const current = nowMs();
    for (const [token, record] of confirmTokens) {
      if (record.expires_at_ms <= current) {
        confirmTokens.delete(token);
      }
    }
  }

  function issueConfirmToken(targets: CacheTargetId[], expectedBytes: number): string {
    pruneExpiredTokens();
    const token = randomUUID();
    confirmTokens.set(token, {
      targets: [...targets],
      expected_bytes: expectedBytes,
      expires_at_ms: nowMs() + ttlMs
    });
    return token;
  }

  function consumeConfirmToken(input: {
    raw_token: string;
    targets: CacheTargetId[];
  }): ConfirmTokenRecord {
    const token = input.raw_token.trim();
    const record = confirmTokens.get(token);
    if (!record) {
      throw new CacheMaintenanceError(
        CACHE_MAINTENANCE_ERROR_CODES.cache_confirm_invalid,
        "confirm_token 无效或已使用，请重新预览后再清理。"
      );
    }

    if (record.expires_at_ms <= nowMs()) {
      confirmTokens.delete(token);
      throw new CacheMaintenanceError(
        CACHE_MAINTENANCE_ERROR_CODES.cache_confirm_expired,
        "confirm_token 已过期，请重新预览后再清理。"
      );
    }

    for (const target of input.targets) {
      if (!record.targets.includes(target)) {
        throw new CacheMaintenanceError(
          CACHE_MAINTENANCE_ERROR_CODES.cache_confirm_invalid,
          "confirm_token 与本次 targets 不匹配，请重新预览后再清理。"
        );
      }
    }

    // 一次性：校验通过后立即作废，避免并发/重放。
    confirmTokens.delete(token);
    return record;
  }

  function tryBeginClean(): (() => void) | null {
    if (cleaning) {
      return null;
    }

    cleaning = true;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      cleaning = false;
    };
  }

  async function analyzeTargets(
    targets: CacheTargetId[],
    sourceVideoActivePrefetchCount: number
  ): Promise<TargetAnalysis[]> {
    return Promise.all(
      targets.map((id) =>
        analyzeCacheTarget({
          env,
          id,
          active_prefetch_count: id === "source_video" ? sourceVideoActivePrefetchCount : 0
        })
      )
    );
  }

  async function inventory(rawInclude?: string | null): Promise<CacheInventory> {
    const include = parseIncludeTargets(rawInclude);
    const sourceVideoStatus = include.includes("source_video")
      ? await readSourceVideoStatusBestEffort(env)
      : { active_prefetch_count: 0 };
    const analyses = await analyzeTargets(include, sourceVideoStatus.active_prefetch_count);
    const targets = analyses.map(toInventoryTarget);
    const warnings = dedupeWarnings(analyses.flatMap((analysis) => analysis.warnings));
    const protectedItems = buildPinnedProtectedItems(analyses);

    if (include.includes("cut_temp")) {
      const activeCutJobs = await listActiveCutJobsBestEffort(env);
      for (const job of activeCutJobs) {
        protectedItems.push({
          kind: "cut_job",
          ref_id: job.cut_job_id,
          title: job.title ? job.title + "（" + job.cut_job_id + "）" : job.cut_job_id,
          reason: "待剪/剪切中的任务会继续写入临时区缓存，清理前请先完成或取消任务"
        });
      }
    }

    const expectedBytes = targets.reduce(
      (total, target) => total + (target.deletable ? target.deletable_bytes : 0),
      0
    );
    const confirmToken = issueConfirmToken(include, expectedBytes);

    return {
      targets,
      protected: protectedItems,
      warnings,
      confirm_token: confirmToken,
      expected_bytes: expectedBytes
    };
  }

  function assertDeletablePath(analysis: TargetAnalysis): void {
    if (analysis.path_is_file) {
      throw new CacheMaintenanceError(
        CACHE_MAINTENANCE_ERROR_CODES.cache_path_not_writable,
        "缓存目标 " + analysis.id + " 的路径不是目录（被同名文件占用）：" + analysis.path
      );
    }

    if (analysis.outside_allowed_roots) {
      throw new CacheMaintenanceError(
        CACHE_MAINTENANCE_ERROR_CODES.cache_path_not_writable,
        "缓存目标 " + analysis.id + " 的路径不在允许清理的缓存根目录内：" + analysis.path
      );
    }

    if (analysis.exists && !analysis.writable) {
      throw new CacheMaintenanceError(
        CACHE_MAINTENANCE_ERROR_CODES.cache_path_not_writable,
        "缓存目标 " + analysis.id + " 的路径当前不可写：" + analysis.path
      );
    }
  }

  async function clean(body: unknown): Promise<CacheCleanResult> {
    const releaseBusy = tryBeginClean();
    if (!releaseBusy) {
      throw new CacheMaintenanceError(
        CACHE_MAINTENANCE_ERROR_CODES.cache_busy,
        "本机磁盘缓存清理正在进行中，请等待当前清理完成后再试。"
      );
    }

    try {
      const request = parseCleanRequest(body);
      const tokenRecord = consumeConfirmToken({
        raw_token: request.confirm_token,
        targets: request.targets
      });
      const sameTargetSet =
        request.targets.length === tokenRecord.targets.length &&
        request.targets.every((target) => tokenRecord.targets.includes(target));

      if (sameTargetSet && request.expected_bytes !== tokenRecord.expected_bytes) {
        throw new CacheMaintenanceError(
          CACHE_MAINTENANCE_ERROR_CODES.cache_expected_bytes_mismatch,
          "expected_bytes 与 inventory 时的可清理字节数不一致：预览 " +
            tokenRecord.expected_bytes + "，请求 " + request.expected_bytes + "；请重新预览。"
        );
      }

      const sourceVideoStatus = request.targets.includes("source_video")
        ? await readSourceVideoStatusBestEffort(env)
        : { active_prefetch_count: 0 };
      const analyses = await analyzeTargets(request.targets, sourceVideoStatus.active_prefetch_count);

      for (const analysis of analyses) {
        assertDeletablePath(analysis);
      }

      const recomputedBytes = analyses.reduce(
        (total, analysis) => total + (analysis.deletable ? analysis.deletable_bytes : 0),
        0
      );
      if (recomputedBytes !== request.expected_bytes) {
        throw new CacheMaintenanceError(
          CACHE_MAINTENANCE_ERROR_CODES.cache_expected_bytes_mismatch,
          "磁盘缓存已变化：预期释放 " + request.expected_bytes + " 字节，当前重新计算为 " +
            recomputedBytes + " 字节；未删除任何内容，请重新预览。"
        );
      }

      const cleaned: string[] = [];
      const skipped: Array<{ id: string; reason: string }> = [];
      const errors: Array<{ code: string; path?: string; message: string }> = [];
      let freedBytes = 0;
      let deletedAny = false;

      for (const analysis of analyses) {
        if (!analysis.exists) {
          skipped.push({ id: analysis.id, reason: MISSING_TARGET_REASON });
          continue;
        }

        if (!analysis.deletable) {
          skipped.push({ id: analysis.id, reason: analysis.reason ?? DEFAULT_SKIPPED_REASON });
          continue;
        }

        let deletedForTarget = 0;
        let newlyPinned = 0;
        for (const file of analysis.deletable_files) {
          // 扫描后可能才开始被 cut/stream pin：删除前再确认一次，避免误删正在使用的缓存。
          if (isCachePathPinned(file.path)) {
            newlyPinned += 1;
            continue;
          }

          try {
            const fileStat = await statFile(file.path);
            await rm(file.path, { force: true });
            freedBytes += fileStat?.size ?? file.size;
            deletedForTarget += 1;
            deletedAny = true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
              continue;
            }
            errors.push({
              code: CACHE_MAINTENANCE_ERROR_CODES.cache_delete_failed,
              path: file.path,
              message: errorText(error)
            });
          }
        }

        // searchd 缓存删除文件后清掉空目录（非空目录会保留，避免误删并发写入/pin 的文件）。
        if (analysis.id === "searchd") {
          await removeEmptyDirectories(analysis.path);
        }

        const pinnedCount = analysis.pinned_files.length + newlyPinned;
        if (pinnedCount > 0) {
          skipped.push({
            id: analysis.id,
            reason: "有 " + pinnedCount + " 个缓存文件正在使用中（已 pin），已跳过"
          });
        }

        if (deletedForTarget > 0 || (analysis.deletable_files.length === 0 && analysis.pinned_files.length === 0)) {
          cleaned.push(analysis.id);
        }
      }

      if (deletedAny) {
        env.invalidate_runtime_status?.();
      }

      return {
        cleaned,
        freed_bytes: freedBytes,
        skipped,
        errors
      };
    } finally {
      releaseBusy();
    }
  }

  return {
    inventory,
    clean,
    tryBeginClean,
    isCleaning: () => cleaning,
    confirmTokenTtlMs: () => ttlMs
  };
}
