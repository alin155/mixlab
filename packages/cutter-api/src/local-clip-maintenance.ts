import { randomUUID } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  exportClipsDirectory,
  listClipLists,
  listCutJobs,
  listExportClips,
  type ExportClipView
} from "../../cutter-local/src/index.ts";

/**
 * D2 本地素材治理（Windows / cutter-api）。
 *
 * 契约要点（Mac 已批准草案 + Windows 侧细化）：
 * - GET  /cutter/local-clips/integrity -> referenced/orphans/total_bytes（+ expected_bytes/confirm_token）
 * - POST /cutter/local-clips/clean     -> removed/freed_bytes/skipped
 * - confirm_token 由 integrity 签发：短时有效（默认 120s）、一次性、绑定本地素材 id 快照与 expected_bytes；
 * - 被引用的本地素材只 skip 不删除；未知/过期 id 安全跳过；
 * - clean 只删除本地素材文件（export-clips/<E> 与 .mixlab-library/videos/<E>）与索引记录，
 *   不删除项目/作品文件（projects/ 下的成片）；
 * - DELETE /cutter/local-clips/{id} 保持现有成功响应；被引用时返回 409 local_clip_referenced +
 *   details.referenced_by；`?force=1` + 请求头 X-MixLab-Cache-Confirm-Token（token 来自 integrity）才允许强制删除。
 *
 * 引用口径（Mac 草案 "项目/任务/清单"）：
 * - project：本地素材清单带 project_output_file（属于某个项目作品的本地素材）；
 * - clip_list：清单条目 source_video_id 指向该本地素材（E 源复剪）；
 * - cut_job：未完成（pending/running/failed/cancelled）的剪切任务的 source_video_id 或 export_clip_id
 *   指向该本地素材。已完成任务的 export_clip_id 只是"该素材由哪个任务产出"的归属记录，不算引用，
 *   否则所有剪切产生的本地素材都无法清理。
 *
 * 该模块不 import index.ts（避免循环依赖）；workspace 路径由 index.ts 注入。
 */

export const LOCAL_CLIP_MAINTENANCE_ERROR_CODES = {
  local_clip_referenced: "local_clip_referenced",
  local_clip_confirm_invalid: "local_clip_confirm_invalid",
  local_clip_confirm_expired: "local_clip_confirm_expired",
  local_clip_unknown: "local_clip_unknown",
  local_clip_busy: "local_clip_busy",
  local_clip_expected_bytes_mismatch: "local_clip_expected_bytes_mismatch",
  /** 请求体字段缺失/类型错误（400）；与本地素材状态无关。 */
  local_clip_request_invalid: "local_clip_request_invalid",
  /** 引用索引（本地素材清单/清单/任务）读取失败或损坏；删除类操作 fail-safe 拒绝。 */
  local_clip_reference_index_unreadable: "local_clip_reference_index_unreadable",
  /** 删除单个本地素材失败（记录在 clean 结果的 skipped 中，HTTP 仍为 200）。 */
  local_clip_delete_failed: "local_clip_delete_failed"
} as const;
export type LocalClipMaintenanceErrorCode =
  (typeof LOCAL_CLIP_MAINTENANCE_ERROR_CODES)[keyof typeof LOCAL_CLIP_MAINTENANCE_ERROR_CODES];

const LOCAL_CLIP_ERROR_STATUS: Record<LocalClipMaintenanceErrorCode, number> = {
  local_clip_referenced: 409,
  local_clip_confirm_invalid: 409,
  local_clip_confirm_expired: 409,
  local_clip_unknown: 400,
  local_clip_busy: 409,
  local_clip_expected_bytes_mismatch: 409,
  local_clip_request_invalid: 400,
  local_clip_reference_index_unreadable: 409,
  local_clip_delete_failed: 500
};

const LOCAL_CLIP_ERROR_REMEDIATION: Record<LocalClipMaintenanceErrorCode, string> = {
  local_clip_referenced: "该本地素材被项目、待剪任务或清单引用；如确认删除，请使用 DELETE 并携带 ?force=1 与 integrity 下发的 X-MixLab-Cache-Confirm-Token。",
  local_clip_confirm_invalid: "confirm_token 已使用、与本次 ids 不匹配或格式错误，请重新调用 GET /cutter/local-clips/integrity 预览后再操作。",
  local_clip_confirm_expired: "重新调用 GET /cutter/local-clips/integrity 获取新的 confirm_token 后再操作。",
  local_clip_unknown: "刷新本地素材清单后再试。",
  local_clip_busy: "等待当前本地素材清理完成后重试。",
  local_clip_expected_bytes_mismatch: "本地素材已变化，请重新调用 GET /cutter/local-clips/integrity 预览后再清理。",
  local_clip_request_invalid: "检查请求体：local_clip_ids 为非空字符串数组、confirm_token 为字符串、expected_bytes 为非负整数。",
  local_clip_reference_index_unreadable: "引用索引读取失败或损坏，清理已按安全策略拒绝；请修复/重建工作区索引后重试。",
  local_clip_delete_failed: "关闭占用本地素材文件的程序后重试。"
};

/** CutterApiError envelope 内的稳定本地素材治理错误（code/message/remediation + HTTP status）。 */
export class LocalClipMaintenanceError extends Error {
  readonly code: LocalClipMaintenanceErrorCode;
  readonly status: number;
  readonly remediation: string;

  constructor(code: LocalClipMaintenanceErrorCode, message: string) {
    super(message);
    this.name = "LocalClipMaintenanceError";
    this.code = code;
    this.status = LOCAL_CLIP_ERROR_STATUS[code];
    this.remediation = LOCAL_CLIP_ERROR_REMEDIATION[code];
  }
}

export type LocalClipReferenceKind = "project" | "cut_job" | "clip_list";

export interface LocalClipReference {
  kind: LocalClipReferenceKind;
  ref_id: string;
  title: string;
}

export interface LocalClipReferencedEntry {
  local_clip_id: string;
  referenced_by: LocalClipReference[];
}

export interface LocalClipOrphanEntry {
  local_clip_id: string;
  path: string;
  size_bytes: number;
  reason: string;
}

export interface LocalClipIntegrity {
  referenced: LocalClipReferencedEntry[];
  orphans: LocalClipOrphanEntry[];
  total_bytes: number;
  /** 本次快照可清理（孤儿）字节数；clean 的 expected_bytes 必须与之一致（子集时为所选 ids 的孤儿字节和）。 */
  expected_bytes: number;
  confirm_token: string;
  /** fail-safe：引用索引损坏/不可读时为 true，此时 orphans 为空且禁止 clean。 */
  degraded: boolean;
  warnings: Array<{ code: string; message: string }>;
}

export interface LocalClipCleanResult {
  removed: string[];
  freed_bytes: number;
  skipped: Array<{
    local_clip_id: string;
    reason: string;
    /** 附加稳定码（local_clip_referenced / local_clip_unknown / local_clip_delete_failed）。 */
    code?: string;
    referenced_by?: LocalClipReference[];
  }>;
}

export interface LocalClipMaintenanceEnvironment {
  /** 工作区根目录；未配置时 integrity 返回空清单（兼容仅公共库模式）。 */
  workspace_root?: string;
  /** 测试注入时钟（毫秒）；默认 Date.now。 */
  now_ms?: () => number;
  /** confirm_token TTL；默认 120_000。 */
  confirm_ttl_ms?: number;
}

export interface LocalClipMaintenanceService {
  integrity(): Promise<LocalClipIntegrity>;
  clean(body: unknown): Promise<LocalClipCleanResult>;
  /** DELETE 引用守卫：返回是否已知本地素材以及引用来源。 */
  inspect(local_clip_id: string): Promise<{ known: boolean; referenced_by: LocalClipReference[]; degraded: boolean }>;
  /** 校验并核销强制删除 token（一次性）。 */
  consumeForceToken(raw_token: string, local_clip_id: string): void;
  /** 并发保护：同一服务实例同一时刻只允许一个 clean；拿不到返回 null。 */
  tryBeginClean(): (() => void) | null;
  isCleaning(): boolean;
  confirmTokenTtlMs(): number;
}

const DEFAULT_CONFIRM_TTL_MS = 120_000;
const LOCAL_CLIP_ID_PATTERN = /^E\d{6}$/;
const BROKEN_LOCAL_CLIP_REASON = "本地素材清单缺失或损坏";
const ORPHAN_LOCAL_CLIP_REASON = "未被项目、待剪任务或清单引用";
const REFERENCED_SKIP_REASON = "该本地素材仍被引用，未删除";
const UNKNOWN_LOCAL_CLIP_REASON = "本地素材不存在或不在本次预览快照中，已跳过";

interface ConfirmTokenRecord {
  ids: string[];
  expected_bytes: number;
  expires_at_ms: number;
}

interface LocalClipRecord {
  local_clip_id: string;
  title: string;
  export_dir_path: string;
  asset_dir_path: string;
  directories: string[];
  size_bytes: number;
  broken: boolean;
}

interface LocalClipSnapshot {
  records: Map<string, LocalClipRecord>;
  referenced: Map<string, LocalClipReference[]>;
  orphans: LocalClipRecord[];
  total_orphan_bytes: number;
  degraded: boolean;
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

async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

async function listLocalClipIdsInDirectory(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && LOCAL_CLIP_ID_PATTERN.test(entry.name))
    .map((entry) => entry.name);
}

/** 统计本地素材两个目录的磁盘字节数；按 dev:ino 去重，避免 hardlink（source.mp4 常见）重复计数。 */
async function measureLocalClipBytes(roots: string[]): Promise<number> {
  const seen = new Set<string>();
  let totalBytes = 0;
  const pending = [...roots];

  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(entryPath);
      } catch {
        continue;
      }
      if (!fileStat.isFile()) {
        continue;
      }

      const inodeKey = fileStat.ino > 0 ? fileStat.dev + ":" + fileStat.ino : "path:" + entryPath;
      if (seen.has(inodeKey)) {
        continue;
      }
      seen.add(inodeKey);
      totalBytes += fileStat.size;
    }
  }

  return totalBytes;
}

function projectReferenceForView(view: ExportClipView | undefined): LocalClipReference | undefined {
  if (!view) {
    return undefined;
  }

  const projectOutputFile = view.project_output_file;
  if (projectOutputFile) {
    const normalized = projectOutputFile.replace(/\\/g, "/");
    const projectFolder = path.basename(path.dirname(normalized));
    return {
      kind: "project",
      ref_id: view.project_id ?? projectFolder,
      title: view.project_title ?? projectFolder
    };
  }

  // 旧素材可能只有 project_id/project_title 而无 project_output_file，同样视为项目作品保护。
  if (view.project_id) {
    return {
      kind: "project",
      ref_id: view.project_id,
      title: view.project_title ?? view.project_id
    };
  }

  return undefined;
}

function addReference(
  references: Map<string, LocalClipReference[]>,
  localClipId: string,
  reference: LocalClipReference,
  knownLocalClipIds: Set<string>
): void {
  if (!knownLocalClipIds.has(localClipId)) {
    return;
  }

  const current = references.get(localClipId) ?? [];
  if (current.some((item) => item.kind === reference.kind && item.ref_id === reference.ref_id)) {
    return;
  }

  current.push(reference);
  references.set(localClipId, current);
}

async function buildLocalClipSnapshot(
  env: LocalClipMaintenanceEnvironment
): Promise<LocalClipSnapshot> {
  const empty: LocalClipSnapshot = {
    records: new Map(),
    referenced: new Map(),
    orphans: [],
    total_orphan_bytes: 0,
    degraded: false
  };
  const workspaceRoot = env.workspace_root;
  if (!workspaceRoot) {
    return empty;
  }

  const exportRoot = exportClipsDirectory(workspaceRoot);
  const assetRoot = path.join(workspaceRoot, ".mixlab-library", "videos");
  const candidateIds = new Set<string>();
  for (const id of await listLocalClipIdsInDirectory(exportRoot)) {
    candidateIds.add(id);
  }
  for (const id of await listLocalClipIdsInDirectory(assetRoot)) {
    candidateIds.add(id);
  }

  const views = new Map<string, ExportClipView>();
  let degraded = false;
  try {
    const catalog = await listExportClips({ workspace_root: workspaceRoot });
    for (const clip of catalog.clips) {
      views.set(clip.local_clip_id, clip);
      candidateIds.add(clip.local_clip_id);
    }
  } catch {
    // fail-safe：本地素材清单是项目引用的唯一来源，读取失败时不能按“无引用”处理。
    degraded = true;
  }

  const records = new Map<string, LocalClipRecord>();
  for (const localClipId of [...candidateIds].sort()) {
    const exportDirPath = path.join(exportRoot, localClipId);
    const assetDirPath = path.join(assetRoot, localClipId);
    const directories: string[] = [];
    if (await isDirectory(exportDirPath)) {
      directories.push(exportDirPath);
    }
    if (await isDirectory(assetDirPath)) {
      directories.push(assetDirPath);
    }
    if (directories.length === 0) {
      continue;
    }

    const view = views.get(localClipId);
    records.set(localClipId, {
      local_clip_id: localClipId,
      title: view?.title ?? localClipId,
      export_dir_path: exportDirPath,
      asset_dir_path: assetDirPath,
      directories,
      size_bytes: await measureLocalClipBytes(directories),
      broken: !view
    });
  }

  // fail-safe：任一本地素材清单缺失/损坏都意味着项目引用未知，不能把它当孤儿清理。
  if ([...records.values()].some((record) => record.broken)) {
    degraded = true;
  }

  const knownLocalClipIds = new Set(records.keys());
  const referenced = new Map<string, LocalClipReference[]>();
  for (const localClipId of records.keys()) {
    const projectReference = projectReferenceForView(views.get(localClipId));
    if (projectReference) {
      addReference(referenced, localClipId, projectReference, knownLocalClipIds);
    }
  }

  try {
    const clipListCatalog = await listClipLists({ workspace_root: workspaceRoot });
    for (const clipList of clipListCatalog.clip_lists) {
      for (const item of clipList.items) {
        addReference(
          referenced,
          item.source_video_id,
          { kind: "clip_list", ref_id: clipList.clip_list_id, title: clipList.title },
          knownLocalClipIds
        );
      }
    }
  } catch {
    // fail-safe：清单索引损坏时删除类操作必须拒绝（否则可能误删被清单引用的素材）。
    degraded = true;
  }

  try {
    const jobCatalog = await listCutJobs({ workspace_root: workspaceRoot });
    for (const job of jobCatalog.jobs) {
      // 已完成任务的 export_clip_id 是素材归属记录而非引用，不参与保护。
      if (job.status === "done") {
        continue;
      }

      const jobReference: LocalClipReference = {
        kind: "cut_job",
        ref_id: job.cut_job_id,
        title: job.title ?? job.project_title ?? job.cut_job_id
      };
      addReference(referenced, job.source_video_id, jobReference, knownLocalClipIds);
      if (job.export_clip_id) {
        addReference(referenced, job.export_clip_id, jobReference, knownLocalClipIds);
      }
    }
  } catch {
    // fail-safe：任务索引损坏时删除类操作必须拒绝。
    degraded = true;
  }

  const orphans = [...records.values()]
    .filter((record) => !referenced.has(record.local_clip_id))
    .sort((left, right) => left.local_clip_id.localeCompare(right.local_clip_id));

  return {
    records,
    referenced,
    orphans,
    total_orphan_bytes: orphans.reduce((total, record) => total + record.size_bytes, 0),
    degraded
  };
}

function requestInvalid(message: string): LocalClipMaintenanceError {
  return new LocalClipMaintenanceError(
    LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_request_invalid,
    message
  );
}

interface ParsedCleanRequest {
  local_clip_ids: string[];
  confirm_token: string;
  expected_bytes: number;
}

function parseCleanRequest(body: unknown): ParsedCleanRequest {
  if (!isRecord(body)) {
    throw requestInvalid("请求体必须是 JSON 对象");
  }

  if (!Array.isArray(body.local_clip_ids) || body.local_clip_ids.length === 0) {
    throw requestInvalid("local_clip_ids 必须是非空字符串数组");
  }

  const normalizedIds: string[] = [];
  for (const item of body.local_clip_ids) {
    if (typeof item !== "string" || item.trim() === "") {
      throw requestInvalid("local_clip_ids 必须是非空字符串数组");
    }
    if (!normalizedIds.includes(item.trim())) {
      normalizedIds.push(item.trim());
    }
  }

  if (typeof body.confirm_token !== "string" || body.confirm_token.trim() === "") {
    throw new LocalClipMaintenanceError(
      LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_invalid,
      "缺少 confirm_token，请先调用 GET /cutter/local-clips/integrity 预览后再清理。"
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
    local_clip_ids: normalizedIds,
    confirm_token: body.confirm_token.trim(),
    expected_bytes: body.expected_bytes
  };
}

export function createLocalClipMaintenanceService(
  env: LocalClipMaintenanceEnvironment
): LocalClipMaintenanceService {
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
      throw new LocalClipMaintenanceError(
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_invalid,
        "confirm_token 无效或已使用，请重新预览后再操作。"
      );
    }

    if (record.expires_at_ms <= nowMs()) {
      confirmTokens.delete(token);
      throw new LocalClipMaintenanceError(
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_expired,
        "confirm_token 已过期，请重新预览后再操作。"
      );
    }

    return record;
  }

  function consumeConfirmToken(rawToken: string): void {
    confirmTokens.delete(rawToken.trim());
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

  async function integrity(): Promise<LocalClipIntegrity> {
    const snapshot = await buildLocalClipSnapshot(env);
    if (snapshot.degraded) {
      return {
        referenced: [],
        orphans: [],
        total_bytes: 0,
        expected_bytes: 0,
        confirm_token: issueConfirmToken([], 0),
        degraded: true,
        warnings: [{
          code: LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_reference_index_unreadable,
          message: "本地素材引用索引读取失败或损坏，已暂停孤儿识别与清理；请修复或重建工作区索引后重试。"
        }]
      };
    }
    const referenced: LocalClipReferencedEntry[] = [...snapshot.referenced.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([localClipId, references]) => ({
        local_clip_id: localClipId,
        referenced_by: references
      }));
    const orphans: LocalClipOrphanEntry[] = snapshot.orphans.map((record) => ({
      local_clip_id: record.local_clip_id,
      path: record.directories[0] ?? record.export_dir_path,
      size_bytes: record.size_bytes,
      reason: record.broken ? BROKEN_LOCAL_CLIP_REASON : ORPHAN_LOCAL_CLIP_REASON
    }));
    const totalBytes = snapshot.total_orphan_bytes;

    return {
      referenced,
      orphans,
      total_bytes: totalBytes,
      expected_bytes: totalBytes,
      confirm_token: issueConfirmToken([...snapshot.records.keys()], totalBytes),
      degraded: false,
      warnings: []
    };
  }

  async function inspect(
    localClipId: string
  ): Promise<{ known: boolean; referenced_by: LocalClipReference[]; degraded: boolean }> {
    if (!LOCAL_CLIP_ID_PATTERN.test(localClipId)) {
      return { known: false, referenced_by: [], degraded: false };
    }

    const snapshot = await buildLocalClipSnapshot(env);
    return {
      known: snapshot.records.has(localClipId),
      referenced_by: snapshot.referenced.get(localClipId) ?? [],
      degraded: snapshot.degraded
    };
  }

  function consumeForceToken(rawToken: string, localClipId: string): void {
    if (typeof rawToken !== "string" || rawToken.trim() === "") {
      throw new LocalClipMaintenanceError(
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_invalid,
        "强制删除本地素材需要 X-MixLab-Cache-Confirm-Token 请求头（来自 GET /cutter/local-clips/integrity）。"
      );
    }

    const record = readConfirmToken(rawToken);
    if (!record.ids.includes(localClipId)) {
      throw new LocalClipMaintenanceError(
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_confirm_invalid,
        "confirm_token 与目标本地素材不匹配，请重新预览后再操作。"
      );
    }

    consumeConfirmToken(rawToken);
  }

  async function clean(body: unknown): Promise<LocalClipCleanResult> {
    const releaseBusy = tryBeginClean();
    if (!releaseBusy) {
      throw new LocalClipMaintenanceError(
        LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_busy,
        "本机本地素材清理正在进行中，请等待当前清理完成后再试。"
      );
    }

    try {
      const request = parseCleanRequest(body);
      const tokenRecord = readConfirmToken(request.confirm_token);
      const snapshot = await buildLocalClipSnapshot(env);
      if (snapshot.degraded) {
        throw new LocalClipMaintenanceError(
          LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_reference_index_unreadable,
          "本地素材引用索引读取失败或损坏，已按安全策略拒绝清理；未删除任何文件。"
        );
      }
      const skipped: LocalClipCleanResult["skipped"] = [];
      const candidates: LocalClipRecord[] = [];

      for (const localClipId of request.local_clip_ids) {
        if (!tokenRecord.ids.includes(localClipId)) {
          skipped.push({
            local_clip_id: localClipId,
            reason: UNKNOWN_LOCAL_CLIP_REASON,
            code: LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_unknown
          });
          continue;
        }

        const record = snapshot.records.get(localClipId);
        if (!record) {
          skipped.push({
            local_clip_id: localClipId,
            reason: UNKNOWN_LOCAL_CLIP_REASON,
            code: LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_unknown
          });
          continue;
        }

        const references = snapshot.referenced.get(localClipId) ?? [];
        if (references.length > 0) {
          skipped.push({
            local_clip_id: localClipId,
            reason: REFERENCED_SKIP_REASON,
            code: LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_referenced,
            referenced_by: references
          });
          continue;
        }

        candidates.push(record);
      }

      const cleanableBytes = candidates.reduce((total, record) => total + record.size_bytes, 0);
      if (cleanableBytes !== request.expected_bytes) {
        throw new LocalClipMaintenanceError(
          LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_expected_bytes_mismatch,
          "本地素材已变化：预期释放 " + request.expected_bytes + " 字节，当前可清理 " +
            cleanableBytes + " 字节；未删除任何内容，请重新预览。"
        );
      }

      // 一次性：所有校验通过、真正开始删除前核销 token。
      consumeConfirmToken(request.confirm_token);

      const removed: string[] = [];
      let freedBytes = 0;
      for (const record of candidates) {
        try {
          for (const directory of record.directories) {
            await rm(directory, { recursive: true, force: true });
          }
          removed.push(record.local_clip_id);
          freedBytes += record.size_bytes;
        } catch (error) {
          skipped.push({
            local_clip_id: record.local_clip_id,
            reason: "删除失败：" + errorText(error),
            code: LOCAL_CLIP_MAINTENANCE_ERROR_CODES.local_clip_delete_failed
          });
        }
      }

      return {
        removed,
        freed_bytes: freedBytes,
        skipped
      };
    } finally {
      releaseBusy();
    }
  }

  return {
    integrity,
    clean,
    inspect,
    consumeForceToken,
    tryBeginClean,
    isCleaning: () => cleaning,
    confirmTokenTtlMs: () => ttlMs
  };
}
