#!/usr/bin/env node
/**
 * Release 回滚工具（Round6）：灰度发布不切指针 → 验证 → 切指针；回滚 = 原子切回上一可用 release。
 *
 * 安全语义：
 * - 默认 dry-run（--apply 才写指针）；失败绝不动 current-release.json；
 * - 目标版本必须能被 cutter 消费端读取（legacy 制品 release.json/catalog/source-path-map/index 存在）；
 *   仅有 Manifest v2 而没有 legacy 制品的版本会被明确拒绝（当前消费端仍依赖 legacy 布局）；
 * - 切换前备份旧指针到 previous-current-release.json（tmp+rename 原子写），全程持本机文件锁；
 * - 每次 apply 追加审计 JSONL（时间/操作者/原因/from/to/verify）。
 *
 * 用法：
 *   node --import tsx scripts/operations/release-rollback.ts --library-root <PublicLibrary> [--dry-run]
 *   node --import tsx scripts/operations/release-rollback.ts --library-root <PublicLibrary> --apply --reason "..." [--to v000123] [--operator name]
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROLLBACK_AUDIT_FILE_NAME = "release-rollback-audit.jsonl";
export const PREVIOUS_POINTER_FILE_NAME = "previous-current-release.json";
const POINTER_FILE_NAME = "current-release.json";
const ROLLBACK_LOCK_FILE_NAME = ".release-rollback.lock";
const ROLLBACK_LOCK_STALE_MS = 60_000;
const REQUIRED_RELEASE_MANIFEST_FILE_NAME = "release.json";
const V2_MANIFEST_FILE_NAMES = ["release-manifest-v2.json", "manifest-v2.json"] as const;

export interface ReleasePointerRecord {
  schema_version: "1.0";
  library_id: string;
  current_version: string;
  updated_at: string;
  manifest_path: string;
}

export interface ReleaseRollbackTarget {
  release_version: string;
  release_id?: string;
  created_at: string;
  has_legacy_artifacts: boolean;
  has_v2_manifest: boolean;
  eligible: boolean;
  reason?: string;
}

export interface ReleaseVerificationCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export interface ReleaseTargetVerification {
  release_version: string;
  ok: boolean;
  checks: ReleaseVerificationCheck[];
  blocking_reasons: string[];
}

export interface RollbackPlan {
  action: "rollback";
  current_version: string;
  target_version: string;
  reason: string;
  operator: string;
  created_at: string;
  verification: ReleaseTargetVerification;
  previous_pointer_exists: boolean;
  commands: { dry_run: string; apply: string };
}

export interface RollbackApplyResult {
  ok: boolean;
  plan: RollbackPlan;
  from_version: string;
  to_version: string;
  pointer_path: string;
  previous_pointer_path: string;
  audit_path: string;
  verification: ReleaseTargetVerification;
  error?: string;
}

export interface ReleaseRollbackOptions {
  library_root: string;
  now?: () => string;
  operator?: string;
  reason?: string;
  audit_file?: string;
}

export class ReleaseRollbackError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "ReleaseRollbackError"; }
}

function mixlabRoot(libraryRoot: string): string { return path.join(libraryRoot, ".mixlab-library"); }
function pointerPath(libraryRoot: string): string { return path.join(mixlabRoot(libraryRoot), POINTER_FILE_NAME); }
function previousPointerPath(libraryRoot: string): string { return path.join(mixlabRoot(libraryRoot), PREVIOUS_POINTER_FILE_NAME); }
function releasesRoot(libraryRoot: string): string { return path.join(mixlabRoot(libraryRoot), "releases"); }
function releaseRoot(libraryRoot: string, version: string): string { return path.join(releasesRoot(libraryRoot), version); }
function rollbackLockPath(libraryRoot: string): string { return path.join(mixlabRoot(libraryRoot), ROLLBACK_LOCK_FILE_NAME); }
function defaultAuditPath(libraryRoot: string): string { return path.join(mixlabRoot(libraryRoot), ROLLBACK_AUDIT_FILE_NAME); }
function jsonBytes(value: unknown): string { return JSON.stringify(value, null, 2) + "\n"; }

async function fileExists(filePath: string): Promise<boolean> {
  try { return (await stat(filePath)).isFile(); } catch { return false; }
}

async function readPointer(libraryRoot: string, filePath = pointerPath(libraryRoot)): Promise<ReleasePointerRecord> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<ReleasePointerRecord>;
  if (!parsed.current_version?.trim()) throw new ReleaseRollbackError("ROLLBACK_POINTER_INVALID", "current-release.json 缺少 current_version");
  return {
    schema_version: "1.0",
    library_id: typeof parsed.library_id === "string" ? parsed.library_id : "",
    current_version: parsed.current_version.trim(),
    updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : "",
    manifest_path: typeof parsed.manifest_path === "string" ? parsed.manifest_path : ""
  };
}

async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await readFile(filePath, "utf8")) as T; }

export async function listReleaseRollbackTargets(input: { library_root: string }): Promise<{
  current_version: string;
  previous_version?: string;
  targets: ReleaseRollbackTarget[];
}> {
  const current = await readPointer(input.library_root);
  let previousVersion: string | undefined;
  try { previousVersion = (await readPointer(input.library_root, previousPointerPath(input.library_root))).current_version; } catch { previousVersion = undefined; }

  let entries;
  try { entries = await readdir(releasesRoot(input.library_root), { withFileTypes: true }); } catch { entries = []; }
  const targets: ReleaseRollbackTarget[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.includes(".tmp-")) continue;
    const version = entry.name;
    const dir = releaseRoot(input.library_root, version);
    const checks: string[] = [];
    const hasLegacy = await fileExists(path.join(dir, REQUIRED_RELEASE_MANIFEST_FILE_NAME));
    const v2FileName = (await Promise.all(V2_MANIFEST_FILE_NAMES.map(async (name) => (await fileExists(path.join(dir, name))) ? name : null))).find(Boolean) ?? undefined;
    let createdAt = "";
    let releaseId: string | undefined;
    if (hasLegacy) {
      try {
        const legacy = await readJson<{ release_version?: unknown; generated_at?: unknown }>(path.join(dir, REQUIRED_RELEASE_MANIFEST_FILE_NAME));
        if (typeof legacy.generated_at === "string") createdAt = legacy.generated_at;
        if (typeof legacy.release_version === "string" && legacy.release_version.trim()) checks.push(legacy.release_version.trim());
      } catch { checks.push("release.json 无法解析"); }
    }
    if (v2FileName) {
      try {
        const v2 = await readJson<{ release_id?: unknown; created_at?: unknown }>(path.join(dir, v2FileName));
        if (typeof v2.release_id === "string") releaseId = v2.release_id;
        if (!createdAt && typeof v2.created_at === "string") createdAt = v2.created_at;
      } catch { checks.push(v2FileName + " 无法解析"); }
    }
    const verification = await verifyReleaseTarget({ library_root: input.library_root, release_version: version });
    targets.push({
      release_version: version,
      ...(releaseId ? { release_id: releaseId } : {}),
      created_at: createdAt,
      has_legacy_artifacts: hasLegacy,
      has_v2_manifest: Boolean(v2FileName),
      eligible: verification.ok,
      ...(verification.ok ? {} : { reason: verification.blocking_reasons.join("；") })
    });
  }

  targets.sort((left, right) => right.created_at.localeCompare(left.created_at) || right.release_version.localeCompare(left.release_version));
  return { current_version: current.current_version, ...(previousVersion ? { previous_version: previousVersion } : {}), targets };
}

/** 校验目标版本可被 cutter 消费端读取（legacy 制品必需；纯 v2 版本会被拒绝并说明原因）。 */
export async function verifyReleaseTarget(input: { library_root: string; release_version: string }): Promise<ReleaseTargetVerification> {
  const dir = releaseRoot(input.library_root, input.release_version);
  const checks: ReleaseVerificationCheck[] = [];
  const blocking: string[] = [];
  const add = (check: string, passed: boolean, detail: string) => { checks.push({ check, passed, detail }); if (!passed) blocking.push(detail); };

  let legacy: { release_version?: unknown; source_index_version?: unknown; search_index_path?: unknown; catalog_path?: unknown; source_path_map_path?: unknown } | undefined;
  try { legacy = await readJson(path.join(dir, REQUIRED_RELEASE_MANIFEST_FILE_NAME)); } catch { legacy = undefined; }
  add("legacy_release_manifest", Boolean(legacy), legacy ? "release.json 存在且可解析" : "缺少 release.json（仅 v2 版本不被当前 cutter 消费端接受，请升级消费端或用包含 legacy 制品的版本）");

  const catalogPath = path.join(dir, typeof legacy?.catalog_path === "string" ? legacy.catalog_path : "catalog.sqlite");
  add("catalog", await fileExists(catalogPath), await fileExists(catalogPath) ? "catalog.sqlite 存在" : "缺少 catalog.sqlite");
  const sourceMapPath = path.join(dir, typeof legacy?.source_path_map_path === "string" ? legacy.source_path_map_path : "source-path-map.json");
  add("source_path_map", await fileExists(sourceMapPath), await fileExists(sourceMapPath) ? "source-path-map.json 存在" : "缺少 source-path-map.json");

  const searchIndexPath = typeof legacy?.search_index_path === "string" ? legacy.search_index_path : "search-index/source-transcript-index";
  const indexVersion = typeof legacy?.source_index_version === "string" ? legacy.source_index_version : input.release_version;
  const exactIndexPath = path.join(dir, searchIndexPath, indexVersion, "index.sqlite");
  // 兼容历史发布的索引目录命名差异：精确路径缺失时在 search-index 子树里查找 index.sqlite。
  let discoveredIndexPath = "";
  if (!(await fileExists(exactIndexPath))) {
    const searchRoot = path.join(dir, searchIndexPath);
    const versions = await readdir(searchRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of versions) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(searchRoot, entry.name, "index.sqlite");
      if (await fileExists(candidate)) { discoveredIndexPath = candidate; break; }
    }
  }
  const resolvedIndexPath = (await fileExists(exactIndexPath)) ? exactIndexPath : discoveredIndexPath;
  add("search_index", Boolean(resolvedIndexPath), resolvedIndexPath ? "搜索索引存在（" + path.relative(dir, resolvedIndexPath) + "）" : "缺少搜索索引 " + path.relative(dir, exactIndexPath));

  const v2FileName = (await Promise.all(V2_MANIFEST_FILE_NAMES.map(async (name) => (await fileExists(path.join(dir, name))) ? name : null))).find(Boolean);
  if (v2FileName) {
    try {
      const v2 = await readJson<{ schema_version?: unknown; release_id?: unknown; files?: unknown }>(path.join(dir, v2FileName));
      const valid = v2.schema_version === "2.0" && typeof v2.release_id === "string" && Array.isArray(v2.files);
      add("manifest_v2", valid, valid ? v2FileName + " 结构有效" : v2FileName + " 结构无效");
    } catch { add("manifest_v2", false, v2FileName + " 无法解析"); }
  }

  return { release_version: input.release_version, ok: blocking.length === 0, checks, blocking_reasons: blocking };
}

function rollbackCommand(input: { library_root: string; target: string; operator: string; reason: string }): { dry_run: string; apply: string } {
  const quotedRoot = JSON.stringify(input.library_root);
  const quotedTarget = JSON.stringify(input.target);
  const quotedReason = JSON.stringify(input.reason);
  return {
    dry_run: `node --import tsx scripts/operations/release-rollback.ts --library-root ${quotedRoot} --to ${quotedTarget}`,
    apply: `node --import tsx scripts/operations/release-rollback.ts --library-root ${quotedRoot} --to ${quotedTarget} --apply --operator ${JSON.stringify(input.operator)} --reason ${quotedReason}`
  };
}

/** 生成回滚计划（dry-run）：默认目标 = previous-current-release.json，其次 = 当前版本之前最近的可用版本。 */
export async function planReleaseRollback(input: ReleaseRollbackOptions & { to?: string }): Promise<RollbackPlan> {
  const now = input.now ?? (() => new Date().toISOString());
  const operator = input.operator?.trim() || process.env.USER?.trim() || "unknown-operator";
  const reason = input.reason?.trim() || "未填写原因";
  const current = await readPointer(input.library_root);
  const targets = await listReleaseRollbackTargets({ library_root: input.library_root });
  let targetVersion = input.to?.trim() ?? "";

  if (!targetVersion) {
    if (targets.previous_version && targets.previous_version !== current.current_version) targetVersion = targets.previous_version;
    else if (await fileExists(previousPointerPath(input.library_root))) {
      const previous = await readPointer(input.library_root, previousPointerPath(input.library_root));
      targetVersion = previous.current_version;
    } else {
      const candidate = targets.targets.find((target) => target.release_version !== current.current_version && target.eligible);
      targetVersion = candidate?.release_version ?? "";
    }
  }

  if (!targetVersion) throw new ReleaseRollbackError("ROLLBACK_NO_TARGET", "没有可回滚的历史版本（仅存在当前版本或没有可用版本）");
  if (targetVersion === current.current_version) throw new ReleaseRollbackError("ROLLBACK_SAME_VERSION", "回滚目标与当前版本相同：" + targetVersion);

  const verification = await verifyReleaseTarget({ library_root: input.library_root, release_version: targetVersion });
  return {
    action: "rollback",
    current_version: current.current_version,
    target_version: targetVersion,
    reason,
    operator,
    created_at: now(),
    verification,
    previous_pointer_exists: await fileExists(previousPointerPath(input.library_root)),
    commands: rollbackCommand({ library_root: input.library_root, target: targetVersion, operator, reason })
  };
}

async function acquireRollbackLock(libraryRoot: string): Promise<() => Promise<void>> {
  const lockPath = rollbackLockPath(libraryRoot);
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeFile(lockPath, jsonBytes({ pid: process.pid, acquired_at: new Date().toISOString(), instance_id: randomUUID() }), { encoding: "utf8", flag: "wx" });
      return async () => { await rm(lockPath, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lockStat = await stat(lockPath).catch(() => null);
      if (!lockStat || Date.now() - lockStat.mtimeMs > ROLLBACK_LOCK_STALE_MS) { await rm(lockPath, { force: true }); continue; }
      throw new ReleaseRollbackError("ROLLBACK_LOCKED", "另一个发布/回滚操作正在进行（acquire release-rollback lock 失败），请稍后重试");
    }
  }
  throw new ReleaseRollbackError("ROLLBACK_LOCKED", "无法获取回滚锁，请稍后重试");
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = filePath + ".tmp-" + process.pid + "-" + Date.now();
  await writeFile(tempPath, jsonBytes(value), { encoding: "utf8", mode: 0o640 });
  await rename(tempPath, filePath);
}

async function appendAudit(auditPath: string, entry: {
  at: string; operator: string; reason: string; from_version: string; to_version: string;
  verify: { ok: boolean; checks: number; blocking_reasons: string[] };
}): Promise<void> {
  await mkdir(path.dirname(auditPath), { recursive: true });
  await appendFile(auditPath, JSON.stringify({ schema_version: "1.0", action: "release_rollback", ...entry }) + "\n", { encoding: "utf8", mode: 0o600 });
}

/** 执行回滚：校验目标 → 备份旧指针 → 原子切指针 → 写审计。任何失败都不改变现指针。 */
export async function applyReleaseRollback(input: ReleaseRollbackOptions & { plan?: RollbackPlan; to?: string }): Promise<RollbackApplyResult> {
  const auditPath = input.audit_file?.trim() || defaultAuditPath(input.library_root);
  const plan = input.plan ?? await planReleaseRollback(input);
  const releaseLock = await acquireRollbackLock(input.library_root);
  const pointerFilePath = pointerPath(input.library_root);
  const previousFilePath = previousPointerPath(input.library_root);

  try {
    const verification = await verifyReleaseTarget({ library_root: input.library_root, release_version: plan.target_version });
    const baseResult = { plan, from_version: plan.current_version, to_version: plan.target_version, pointer_path: pointerFilePath, previous_pointer_path: previousFilePath, audit_path: auditPath, verification };

    if (!verification.ok) {
      return { ok: false, ...baseResult, error: "回滚目标不可被当前消费端接受：" + verification.blocking_reasons.join("；") };
    }

    const latestPointer = await readPointer(input.library_root);
    if (latestPointer.current_version !== plan.current_version) {
      return { ok: false, ...baseResult, error: "回滚期间 current-release.json 已被其他操作修改（计划基于 " + plan.current_version + "，当前 " + latestPointer.current_version + "），请重新生成计划" };
    }

    const nextPointer: ReleasePointerRecord = {
      schema_version: "1.0",
      library_id: latestPointer.library_id,
      current_version: plan.target_version,
      updated_at: plan.created_at,
      manifest_path: latestPointer.manifest_path
    };
    // 先备份旧指针，再原子切换；中途失败时现指针保持原样（rename 前所有校验都已完成）。
    await atomicWriteJson(previousFilePath, latestPointer);
    await atomicWriteJson(pointerFilePath, nextPointer);
    await appendAudit(auditPath, {
      at: plan.created_at,
      operator: plan.operator,
      reason: plan.reason,
      from_version: plan.current_version,
      to_version: plan.target_version,
      verify: { ok: verification.ok, checks: verification.checks.length, blocking_reasons: verification.blocking_reasons }
    });
    const pointerStat = await stat(pointerFilePath);
    return { ok: true, ...baseResult, error: undefined, ...(pointerStat.isFile() ? {} : {}) };
  } catch (error) {
    return { ok: false, plan, from_version: plan.current_version, to_version: plan.target_version, pointer_path: pointerFilePath, previous_pointer_path: previousFilePath, audit_path: auditPath, verification: plan.verification, error: (error as Error).message };
  } finally {
    await releaseLock().catch(() => undefined);
  }
}

function parseArgs(argv: string[]): { libraryRoot?: string; apply: boolean; to?: string; operator?: string; reason?: string; auditFile?: string; json: boolean } {
  const result = { apply: false, json: true as boolean } as { libraryRoot?: string; apply: boolean; to?: string; operator?: string; reason?: string; auditFile?: string; json: boolean };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = () => argv[++index];
    if (arg === "--library-root") result.libraryRoot = next();
    else if (arg === "--apply") result.apply = true;
    else if (arg === "--dry-run") result.apply = false;
    else if (arg === "--to") result.to = next();
    else if (arg === "--operator") result.operator = next();
    else if (arg === "--reason") result.reason = next();
    else if (arg === "--audit-file") result.auditFile = next();
    else if (arg === "--help" || arg === "-h") { console.log("usage: release-rollback.ts --library-root <dir> [--dry-run] [--to <version>] [--apply --operator <name> --reason <text>] [--audit-file <path>]"); process.exit(0); }
  }
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.libraryRoot) { console.error("缺少 --library-root"); process.exit(2); }
  const options = { library_root: path.resolve(args.libraryRoot), ...(args.operator ? { operator: args.operator } : {}), ...(args.reason ? { reason: args.reason } : {}), ...(args.auditFile ? { audit_file: args.auditFile } : {}), ...(args.to ? { to: args.to } : {}) };

  try {
    if (!args.apply) {
      const plan = await planReleaseRollback(options);
      console.log(JSON.stringify({ mode: "dry-run", plan, targets: await listReleaseRollbackTargets({ library_root: options.library_root }) }, null, 2));
      process.exit(plan.verification.ok ? 0 : 1);
    }
    if (!args.reason?.trim()) { console.error("--apply 需要 --reason 说明回滚原因"); process.exit(2); }
    const result = await applyReleaseRollback(options);
    console.log(JSON.stringify({ mode: "apply", result }, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", error: { code: (error as { code?: string }).code ?? "ROLLBACK_FAILED", message: (error as Error).message } }, null, 2));
    process.exit(1);
  }
}

if (shouldRunDirect()) void main();
function shouldRunDirect(): boolean {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
