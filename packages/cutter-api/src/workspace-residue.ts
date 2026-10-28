import { randomUUID } from "node:crypto";
import { type Dirent, type Stats } from "node:fs";
import { lstat, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  exportClipsDirectory,
  getExportClipDetail,
  listCutJobs,
  listExportClips
} from "../../cutter-local/src/index.ts";

/**
 * D3 工作区/临时残留治理（Windows / cutter-api）。
 *
 * 契约要点（Mac 已批准）：
 * - GET  /cutter/workspace/residue        -> { items:[{id,kind,path,size_bytes,created_at,safe_to_delete,reason?}], total_bytes }
 * - POST /cutter/workspace/residue/clean  -> { removed, freed_bytes, skipped, errors }
 * - GET 只读不删；扫描三类残留：
 *   failed_cut_temp：cache/cut-temp 下属于 failed/cancelled 剪切任务的临时文件；
 *   failed_export：export-clips 下的 .tmp/.part/.partial 导出临时文件；
 *   restart_temp：找不到归属任务的临时文件、中断的导出暂存目录、未完成的 export 目录、clip-jobs 提交暂存/临时文件等。
 * - safe_to_delete=false：路径包含已完成作品/项目输出引用、符号链接、无法识别的孤儿目录等；
 *   clean 对 safe_to_delete=false 只 skip 不删除。
 * - clean 的 confirm_token 由 GET 签发：短时有效（默认 120s）、一次性、绑定 id 快照与 expected_bytes；
 *   删除前再次做白名单路径包含校验（只允许 workspace 内 cache/cut-temp、export-clips 临时项、clip-jobs 暂存项），
 *   永不删除 projects/ 下的项目成片。
 * - 并发：同一 server 实例同时只允许一个 clean，第二个请求返回 workspace_residue_busy。
 *
 * 该模块不 import index.ts（避免循环依赖）；workspace_root 由 index.ts 注入。
 */

export const WORKSPACE_RESIDUE_KINDS = [
  "failed_cut_temp",
  "failed_export",
  "restart_temp"
] as const;
export type WorkspaceResidueKind = (typeof WORKSPACE_RESIDUE_KINDS)[number];

export const WORKSPACE_RESIDUE_ERROR_CODES = {
  workspace_residue_confirm_invalid: "workspace_residue_confirm_invalid",
  workspace_residue_confirm_expired: "workspace_residue_confirm_expired",
  workspace_residue_expected_bytes_mismatch: "workspace_residue_expected_bytes_mismatch",
  workspace_residue_unknown: "workspace_residue_unknown",
  workspace_residue_busy: "workspace_residue_busy",
  workspace_residue_unsafe_path: "workspace_residue_unsafe_path",
  /** 请求体字段缺失/类型错误（400）；与残留状态无关。 */
  workspace_residue_request_invalid: "workspace_residue_request_invalid",
  /** 删除单个残留失败（记录在 clean 结果的 errors 中，HTTP 仍为 200）。 */
  workspace_residue_delete_failed: "workspace_residue_delete_failed"
} as const;
export type WorkspaceResidueErrorCode =
  (typeof WORKSPACE_RESIDUE_ERROR_CODES)[keyof typeof WORKSPACE_RESIDUE_ERROR_CODES];

const WORKSPACE_RESIDUE_ERROR_STATUS: Record<WorkspaceResidueErrorCode, number> = {
  workspace_residue_confirm_invalid: 409,
  workspace_residue_confirm_expired: 409,
  workspace_residue_expected_bytes_mismatch: 409,
  workspace_residue_unknown: 400,
  workspace_residue_busy: 409,
  workspace_residue_unsafe_path: 403,
  workspace_residue_request_invalid: 400,
  workspace_residue_delete_failed: 500
};

const WORKSPACE_RESIDUE_ERROR_REMEDIATION: Record<WorkspaceResidueErrorCode, string> = {
  workspace_residue_confirm_invalid: "confirm_token 已使用、与本次 ids 不匹配或格式错误，请重新调用 GET /cutter/workspace/residue 预览后再操作。",
  workspace_residue_confirm_expired: "重新调用 GET /cutter/workspace/residue 获取新的 confirm_token 后再操作。",
  workspace_residue_expected_bytes_mismatch: "工作区残留已变化，请重新调用 GET /cutter/workspace/residue 预览后再清理。",
  workspace_residue_unknown: "刷新工作区残留清单后再试。",
  workspace_residue_busy: "等待当前工作区残留清理完成后重试。",
  workspace_residue_unsafe_path: "该路径不在允许清理的残留白名单内（projects/ 项目成片永不删除），请刷新清单后重试。",
  workspace_residue_request_invalid: "检查请求体：ids 为非空字符串数组、confirm_token 为字符串、expected_bytes 为非负整数。",
  workspace_residue_delete_failed: "关闭占用残留文件的程序后重试。"
};

/** CutterApiError envelope 内的工作区残留稳定错误（code/message/remediation + HTTP status）。 */
export class WorkspaceResidueError extends Error {
  readonly code: WorkspaceResidueErrorCode;
  readonly status: number;
  readonly remediation: string;

  constructor(code: WorkspaceResidueErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceResidueError";
    this.code = code;
    this.status = WORKSPACE_RESIDUE_ERROR_STATUS[code];
    this.remediation = WORKSPACE_RESIDUE_ERROR_REMEDIATION[code];
  }
}

export interface WorkspaceResidueItem {
  id: string;
  kind: WorkspaceResidueKind;
  path: string;
  size_bytes: number;
  created_at: string;
  safe_to_delete: boolean;
  reason?: string;
}

export interface WorkspaceResidueInventory {
  items: WorkspaceResidueItem[];
  total_bytes: number;
  /** 本次快照可安全清理字节数；clean 的 expected_bytes 必须与之一致（子集时为所选 ids 的可清理字节和）。 */
  expected_bytes: number;
  confirm_token: string;
}

export interface WorkspaceResidueCleanResult {
  removed: string[];
  freed_bytes: number;
  skipped: Array<{ id: string; reason: string; code?: string }>;
  errors: Array<{ id: string; code: string; message: string; path?: string }>;
}

export interface WorkspaceResidueEnvironment {
  workspace_root?: string;
  /** 测试注入时钟（毫秒）；默认 Date.now。 */
  now_ms?: () => number;
  /** confirm_token TTL；默认 120_000。 */
  confirm_ttl_ms?: number;
}

export interface WorkspaceResidueService {
  inventory(): Promise<WorkspaceResidueInventory>;
  clean(body: unknown): Promise<WorkspaceResidueCleanResult>;
  /** 并发保护：同一服务实例同一时刻只允许一个 clean；拿不到返回 null。 */
  tryBeginClean(): (() => void) | null;
  isCleaning(): boolean;
  confirmTokenTtlMs(): number;
}

const DEFAULT_CONFIRM_TTL_MS = 120_000;
const LOCAL_CLIP_EXPORT_ID_PATTERN = /^E[0-9]{6}$/;
const CUT_JOB_ID_PREFIX_PATTERN = /^(CJ[0-9]{8}-[0-9]{4})-/;
const TEMP_FILE_NAME_PATTERN = /[.](?:tmp|part|partial)$/i;
const STAGING_NAME_PREFIXES = [".staging-", ".tmp-", ".partial-" ] as const;

interface ConfirmTokenRecord {
  ids: string[];
  expected_bytes: number;
  expires_at_ms: number;
}

interface ProtectedReferences {
  paths: Set<string>;
  inodes: Set<string>;
}

interface ScanContext {
  workspace_root: string;
  roots: {
    cut_temp: string;
    export_clips: string;
    clip_jobs: string;
    projects: string;
  };
  job_statuses: Map<string, string>;
  protected_references: ProtectedReferences;
  seen_file_inodes: Set<string>;
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

function residueRoots(workspaceRoot: string): ScanContext["roots"] {
  return {
    cut_temp: path.join(workspaceRoot, "cache", "cut-temp"),
    export_clips: exportClipsDirectory(workspaceRoot),
    clip_jobs: path.join(workspaceRoot, "clip-jobs"),
    projects: path.join(workspaceRoot, "projects")
  };
}

function toWorkspaceRelativePath(workspaceRoot: string, targetPath: string): string {
  return path.relative(workspaceRoot, targetPath).split(path.sep).join("/");
}

function inodeKey(fileStat: Stats): string {
  return fileStat.ino > 0 ? fileStat.dev + ":" + fileStat.ino : "";
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
}

async function statSafe(targetPath: string): Promise<Stats | null> {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

async function lstatSafe(targetPath: string): Promise<Stats | null> {
  try {
    return await lstat(targetPath);
  } catch {
    return null;
  }
}

function workspacePathFromRelative(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return path.join(workspaceRoot, ...parts);
}

function isStagingLikeName(name: string): boolean {
  return STAGING_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * 残留清理白名单：只允许 workspace 内的 cut-temp、export-clips 临时项、clip-jobs 暂存项；
 * projects/ 与真实作品输出永不允许。
 */
export function isWorkspaceResiduePathAllowed(input: {
  workspace_root: string;
  target_path: string;
}): boolean {
  const workspaceRoot = path.resolve(input.workspace_root);
  const targetPath = path.resolve(input.target_path);
  if (!isInsidePath(workspaceRoot, targetPath)) {
    return false;
  }

  const relative = path.relative(workspaceRoot, targetPath);
  const parts = relative.split(path.sep);
  if (parts.some((part) => part === "..")) {
    return false;
  }

  if (parts[0] === "projects") {
    return false;
  }

  if (parts[0] === "cache") {
    return parts[1] === "cut-temp" && parts.length >= 3;
  }

  if (parts[0] === "clip-jobs") {
    if (parts.length < 2) {
      return false;
    }
    const name = parts[1]!;
    return isStagingLikeName(name) || TEMP_FILE_NAME_PATTERN.test(name);
  }

  if (parts[0] === "export-clips") {
    if (parts.length < 2) {
      return false;
    }
    const name = parts[1]!;
    if (TEMP_FILE_NAME_PATTERN.test(name) || isStagingLikeName(name)) {
      return true;
    }
    return LOCAL_CLIP_EXPORT_ID_PATTERN.test(name) && parts.length === 2;
  }

  return false;
}

async function collectProtectedReferences(workspaceRoot: string): Promise<ProtectedReferences> {
  const paths = new Set<string>();
  const inodes = new Set<string>();

  try {
    const catalog = await listExportClips({ workspace_root: workspaceRoot });
    for (const clip of catalog.clips) {
      const relativePaths = [
        clip.output_file,
        clip.project_output_file,
        clip.local_asset_relative_path,
        clip.source_video_manifest_path,
        clip.transcript_path,
        clip.srt_path,
        clip.keyframes_path,
        clip.cover_path
      ];
      for (const relativePath of relativePaths) {
        if (typeof relativePath !== "string" || relativePath.trim() === "") {
          continue;
        }
        const absolutePath = path.resolve(workspacePathFromRelative(workspaceRoot, relativePath));
        paths.add(absolutePath);
        const fileStat = await statSafe(absolutePath);
        if (fileStat?.isFile()) {
          const key = inodeKey(fileStat);
          if (key) {
            inodes.add(key);
          }
        }
      }
    }
  } catch {
    // 索引损坏时保守按"无保护引用"处理，但 safe_to_delete 仍需通过路径白名单校验。
  }

  return { paths, inodes };
}

interface PathMeasurement {
  size_bytes: number;
  protected_hit: boolean;
  symlink_hit: boolean;
}

async function measureResiduePath(
  targetPath: string,
  protectedReferences: ProtectedReferences,
  depth = 0
): Promise<PathMeasurement> {
  if (depth > 16) {
    return { size_bytes: 0, protected_hit: false, symlink_hit: false };
  }

  const entryStat = await lstatSafe(targetPath);
  if (!entryStat) {
    return { size_bytes: 0, protected_hit: false, symlink_hit: false };
  }
  if (entryStat.isSymbolicLink()) {
    return { size_bytes: 0, protected_hit: false, symlink_hit: true };
  }
  if (entryStat.isFile()) {
    const resolvedPath = path.resolve(targetPath);
    const key = inodeKey(entryStat);
    return {
      size_bytes: entryStat.size,
      protected_hit:
        protectedReferences.paths.has(resolvedPath) ||
        (key !== "" && protectedReferences.inodes.has(key)),
      symlink_hit: false
    };
  }
  if (!entryStat.isDirectory()) {
    return { size_bytes: 0, protected_hit: false, symlink_hit: false };
  }

  let sizeBytes = 0;
  let protectedHit = false;
  let symlinkHit = false;
  let entries;
  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch {
    return { size_bytes: 0, protected_hit: false, symlink_hit: false };
  }

  for (const entry of entries) {
    const childMeasurement = await measureResiduePath(
      path.join(targetPath, entry.name),
      protectedReferences,
      depth + 1
    );
    sizeBytes += childMeasurement.size_bytes;
    protectedHit = protectedHit || childMeasurement.protected_hit;
    symlinkHit = symlinkHit || childMeasurement.symlink_hit;
  }

  return { size_bytes: sizeBytes, protected_hit: protectedHit, symlink_hit: symlinkHit };
}

async function buildResidueItem(input: {
  context: ScanContext;
  absolute_path: string;
  kind: WorkspaceResidueKind;
  base_safe_to_delete: boolean;
  base_reason: string;
}): Promise<WorkspaceResidueItem | null> {
  const entryStat = await lstatSafe(input.absolute_path);
  if (!entryStat) {
    return null;
  }

  const relativePath = toWorkspaceRelativePath(input.context.workspace_root, input.absolute_path);
  const id = input.kind + ":" + relativePath;
  const createdAt = entryStat.mtime.toISOString();

  let sizeBytes = 0;
  let safeToDelete = input.base_safe_to_delete;
  let reason: string | undefined = input.base_reason;

  if (entryStat.isSymbolicLink()) {
    safeToDelete = false;
    reason = "路径是符号链接，无法确认可安全删除";
  } else if (entryStat.isFile()) {
    const key = inodeKey(entryStat);
    if (key && input.context.seen_file_inodes.has(key)) {
      // hardlink 去重：同一 inode 只统计一条残留。
      return null;
    }
    if (key) {
      input.context.seen_file_inodes.add(key);
    }
    const measurement = await measureResiduePath(input.absolute_path, input.context.protected_references);
    sizeBytes = measurement.size_bytes;
    if (measurement.protected_hit) {
      safeToDelete = false;
      reason = "文件被已完成作品/项目输出引用";
    }
  } else if (entryStat.isDirectory()) {
    const measurement = await measureResiduePath(input.absolute_path, input.context.protected_references);
    sizeBytes = measurement.size_bytes;
    if (measurement.protected_hit) {
      safeToDelete = false;
      reason = "目录包含已完成作品/项目输出引用的文件";
    } else if (measurement.symlink_hit) {
      safeToDelete = false;
      reason = "目录包含符号链接，无法确认可安全删除";
    }
  }

  return {
    id,
    kind: input.kind,
    path: input.absolute_path,
    size_bytes: sizeBytes,
    created_at: createdAt,
    safe_to_delete: safeToDelete,
    ...(reason ? { reason } : {})
  };
}

async function listDirectoryEntries(directoryPath: string): Promise<Dirent[]> {
  try {
    return await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function scanCutTempResidue(context: ScanContext): Promise<WorkspaceResidueItem[]> {
  const items: WorkspaceResidueItem[] = [];
  for (const entry of await listDirectoryEntries(context.roots.cut_temp)) {
    const absolutePath = path.join(context.roots.cut_temp, entry.name);
    const match = CUT_JOB_ID_PREFIX_PATTERN.exec(entry.name);
    const jobStatus = match?.[1] ? context.job_statuses.get(match[1]) : undefined;

    if (jobStatus === "pending" || jobStatus === "running") {
      // 正在排队/执行的剪切任务仍在使用临时文件，不属于残留。
      continue;
    }

    let kind: WorkspaceResidueKind = "restart_temp";
    let reason = "找不到归属剪切任务的临时文件";
    if (entry.isDirectory()) {
      reason = "找不到归属剪切任务的孤儿临时目录";
    } else if (jobStatus === "failed" || jobStatus === "cancelled") {
      kind = "failed_cut_temp";
      reason = "失败/已取消剪切任务遗留的临时文件";
    } else if (jobStatus === "done") {
      reason = "已完成任务遗留的临时文件";
    }

    const item = await buildResidueItem({
      context,
      absolute_path: absolutePath,
      kind,
      base_safe_to_delete: true,
      base_reason: reason
    });
    if (item) {
      items.push(item);
    }
  }

  return items;
}

async function scanExportClipsResidue(context: ScanContext): Promise<WorkspaceResidueItem[]> {
  const items: WorkspaceResidueItem[] = [];
  for (const entry of await listDirectoryEntries(context.roots.export_clips)) {
    const absolutePath = path.join(context.roots.export_clips, entry.name);

    if (entry.isFile()) {
      if (!TEMP_FILE_NAME_PATTERN.test(entry.name)) {
        continue;
      }
      const item = await buildResidueItem({
        context,
        absolute_path: absolutePath,
        kind: "failed_export",
        base_safe_to_delete: true,
        base_reason: "中断的导出临时文件"
      });
      if (item) {
        items.push(item);
      }
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    if (isStagingLikeName(entry.name)) {
      const item = await buildResidueItem({
        context,
        absolute_path: absolutePath,
        kind: "restart_temp",
        base_safe_to_delete: true,
        base_reason: "中断的导出暂存目录"
      });
      if (item) {
        items.push(item);
      }
      continue;
    }

    if (!LOCAL_CLIP_EXPORT_ID_PATTERN.test(entry.name)) {
      const item = await buildResidueItem({
        context,
        absolute_path: absolutePath,
        kind: "restart_temp",
        base_safe_to_delete: false,
        base_reason: "无法识别的导出孤儿目录，无法确认可安全删除"
      });
      if (item) {
        items.push(item);
      }
      continue;
    }

    const detail = await getExportClipDetail({
      workspace_root: context.workspace_root,
      export_clip_id: entry.name
    }).catch(() => null);
    if (detail) {
      // 清单完整的导出目录是真实本地素材，不属于残留。
      continue;
    }

    let baseSafeToDelete = true;
    let reason = "未完成的导出目录（缺少完整清单）";
    const rawManifest = await readFile(path.join(absolutePath, "export-clip.json"), "utf8")
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => null);
    const projectOutputFile = isRecord(rawManifest) && typeof rawManifest.project_output_file === "string"
      ? rawManifest.project_output_file
      : undefined;
    if (projectOutputFile) {
      const projectOutputPath = path.resolve(
        workspacePathFromRelative(context.workspace_root, projectOutputFile)
      );
      if (await statSafe(projectOutputPath)) {
        baseSafeToDelete = false;
        reason = "未完成的导出目录关联了已完成的项目成片，无法确认可安全删除";
      }
    }

    const item = await buildResidueItem({
      context,
      absolute_path: absolutePath,
      kind: "restart_temp",
      base_safe_to_delete: baseSafeToDelete,
      base_reason: reason
    });
    if (item) {
      items.push(item);
    }
  }

  return items;
}

async function scanClipJobsResidue(context: ScanContext): Promise<WorkspaceResidueItem[]> {
  const items: WorkspaceResidueItem[] = [];
  for (const entry of await listDirectoryEntries(context.roots.clip_jobs)) {
    const absolutePath = path.join(context.roots.clip_jobs, entry.name);
    if (entry.isDirectory() && isStagingLikeName(entry.name)) {
      const item = await buildResidueItem({
        context,
        absolute_path: absolutePath,
        kind: "restart_temp",
        base_safe_to_delete: true,
        base_reason: "中断的任务提交暂存目录"
      });
      if (item) {
        items.push(item);
      }
      continue;
    }

    if (entry.isFile() && TEMP_FILE_NAME_PATTERN.test(entry.name)) {
      const item = await buildResidueItem({
        context,
        absolute_path: absolutePath,
        kind: "restart_temp",
        base_safe_to_delete: true,
        base_reason: "任务清单写入遗留的临时文件"
      });
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

const KIND_ORDER: Record<WorkspaceResidueKind, number> = {
  failed_cut_temp: 0,
  failed_export: 1,
  restart_temp: 2
};

async function buildWorkspaceResidueInventory(
  env: WorkspaceResidueEnvironment
): Promise<{ items: WorkspaceResidueItem[]; total_bytes: number }> {
  const workspaceRoot = env.workspace_root;
  if (!workspaceRoot) {
    return { items: [], total_bytes: 0 };
  }

  const jobStatuses = new Map<string, string>();
  try {
    const catalog = await listCutJobs({ workspace_root: workspaceRoot });
    for (const job of catalog.jobs) {
      jobStatuses.set(job.cut_job_id, job.status);
    }
  } catch {
    // 任务索引不可读时，cut-temp 残留按"找不到归属任务"处理。
  }

  const context: ScanContext = {
    workspace_root: workspaceRoot,
    roots: residueRoots(workspaceRoot),
    job_statuses: jobStatuses,
    protected_references: await collectProtectedReferences(workspaceRoot),
    seen_file_inodes: new Set()
  };

  const items = [
    ...(await scanCutTempResidue(context)),
    ...(await scanExportClipsResidue(context)),
    ...(await scanClipJobsResidue(context))
  ];

  items.sort((left, right) => {
    const kindCompare = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    return kindCompare || left.path.localeCompare(right.path);
  });

  return {
    items,
    total_bytes: items.reduce((total, item) => total + item.size_bytes, 0)
  };
}

/**
 * runtime-status 用：以超时保护读取工作区残留摘要；失败/超时省略字段并给出 reason。
 * 不阻塞 runtime-status 主流程。
 */
export async function readWorkspaceResidueSummaryBestEffort(input: {
  workspace_root?: string;
  timeout_ms?: number;
}): Promise<{
  workspace_residue_count?: number;
  workspace_residue_bytes?: number;
  workspace_residue_reason?: string;
}> {
  if (!input.workspace_root) {
    return {};
  }

  const timeoutMs = Number.isFinite(input.timeout_ms) && (input.timeout_ms ?? 0) > 0
    ? Math.floor(input.timeout_ms!)
    : 200;
  let timer: NodeJS.Timeout | undefined;

  try {
    const inventory = await Promise.race([
      buildWorkspaceResidueInventory({ workspace_root: input.workspace_root }),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      })
    ]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
    });

    if (!inventory) {
      return { workspace_residue_reason: "工作区残留扫描超时" };
    }

    return {
      workspace_residue_count: inventory.items.length,
      workspace_residue_bytes: inventory.total_bytes
    };
  } catch (error) {
    return { workspace_residue_reason: "工作区残留扫描失败：" + errorText(error) };
  }
}

function requestInvalid(message: string): WorkspaceResidueError {
  return new WorkspaceResidueError(
    WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_request_invalid,
    message
  );
}

interface ParsedCleanRequest {
  ids: string[];
  confirm_token: string;
  expected_bytes: number;
}

function parseCleanRequest(body: unknown): ParsedCleanRequest {
  if (!isRecord(body)) {
    throw requestInvalid("请求体必须是 JSON 对象");
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    throw requestInvalid("ids 必须是非空字符串数组");
  }

  const normalizedIds: string[] = [];
  for (const item of body.ids) {
    if (typeof item !== "string" || item.trim() === "") {
      throw requestInvalid("ids 必须是非空字符串数组");
    }
    if (!normalizedIds.includes(item.trim())) {
      normalizedIds.push(item.trim());
    }
  }

  if (typeof body.confirm_token !== "string" || body.confirm_token.trim() === "") {
    throw new WorkspaceResidueError(
      WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_confirm_invalid,
      "缺少 confirm_token，请先调用 GET /cutter/workspace/residue 预览后再清理。"
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
    ids: normalizedIds,
    confirm_token: body.confirm_token.trim(),
    expected_bytes: body.expected_bytes
  };
}

export function createWorkspaceResidueService(
  env: WorkspaceResidueEnvironment
): WorkspaceResidueService {
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

  function issueConfirmToken(ids: string[], expectedBytes: number): string {
    pruneExpiredTokens();
    const token = randomUUID();
    confirmTokens.set(token, {
      ids: [...ids],
      expected_bytes: expectedBytes,
      expires_at_ms: nowMs() + ttlMs
    });
    return token;
  }

  function readConfirmToken(rawToken: string): ConfirmTokenRecord {
    const token = rawToken.trim();
    const record = confirmTokens.get(token);
    if (!record) {
      throw new WorkspaceResidueError(
        WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_confirm_invalid,
        "confirm_token 无效或已使用，请重新预览后再操作。"
      );
    }

    if (record.expires_at_ms <= nowMs()) {
      confirmTokens.delete(token);
      throw new WorkspaceResidueError(
        WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_confirm_expired,
        "confirm_token 已过期，请重新预览后再操作。"
      );
    }

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

  async function inventory(): Promise<WorkspaceResidueInventory> {
    const snapshot = await buildWorkspaceResidueInventory(env);
    const expectedBytes = snapshot.items.reduce(
      (total, item) => total + (item.safe_to_delete ? item.size_bytes : 0),
      0
    );
    return {
      items: snapshot.items,
      total_bytes: snapshot.total_bytes,
      expected_bytes: expectedBytes,
      confirm_token: issueConfirmToken(
        snapshot.items.map((item) => item.id),
        expectedBytes
      )
    };
  }

  async function clean(body: unknown): Promise<WorkspaceResidueCleanResult> {
    const releaseBusy = tryBeginClean();
    if (!releaseBusy) {
      throw new WorkspaceResidueError(
        WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_busy,
        "本机工作区残留清理正在进行中，请等待当前清理完成后再试。"
      );
    }

    try {
      const request = parseCleanRequest(body);
      const tokenRecord = readConfirmToken(request.confirm_token);
      const snapshot = await buildWorkspaceResidueInventory(env);
      const itemsById = new Map(snapshot.items.map((item) => [item.id, item]));
      const skipped: WorkspaceResidueCleanResult["skipped"] = [];
      const candidates: WorkspaceResidueItem[] = [];

      for (const id of request.ids) {
        if (!tokenRecord.ids.includes(id)) {
          skipped.push({
            id,
            reason: "残留不存在或不在本次预览快照中，已跳过",
            code: WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_unknown
          });
          continue;
        }

        const item = itemsById.get(id);
        if (!item) {
          skipped.push({
            id,
            reason: "残留不存在或不在本次预览快照中，已跳过",
            code: WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_unknown
          });
          continue;
        }

        if (!item.safe_to_delete) {
          skipped.push({
            id,
            reason: item.reason ?? "无法确认可安全删除，已跳过",
            code: "workspace_residue_unsafe"
          });
          continue;
        }

        candidates.push(item);
      }

      const cleanableBytes = candidates.reduce((total, item) => total + item.size_bytes, 0);
      if (cleanableBytes !== request.expected_bytes) {
        throw new WorkspaceResidueError(
          WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_expected_bytes_mismatch,
          "工作区残留已变化：预期释放 " + request.expected_bytes + " 字节，当前可清理 " +
            cleanableBytes + " 字节；未删除任何内容，请重新预览。"
        );
      }

      // 一次性：所有校验通过、真正开始删除前核销 token。
      confirmTokens.delete(request.confirm_token);

      const removed: string[] = [];
      const errors: WorkspaceResidueCleanResult["errors"] = [];
      let freedBytes = 0;

      for (const item of candidates) {
        const workspaceRoot = env.workspace_root ?? "";
        if (!isWorkspaceResiduePathAllowed({
          workspace_root: workspaceRoot,
          target_path: item.path
        })) {
          errors.push({
            id: item.id,
            code: WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_unsafe_path,
            message: "残留路径不在允许清理的白名单内，已拒绝删除",
            path: item.path
          });
          continue;
        }

        try {
          await rm(item.path, { recursive: true, force: true });
          removed.push(item.id);
          freedBytes += item.size_bytes;
        } catch (error) {
          errors.push({
            id: item.id,
            code: WORKSPACE_RESIDUE_ERROR_CODES.workspace_residue_delete_failed,
            message: errorText(error),
            path: item.path
          });
        }
      }

      return {
        removed,
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
