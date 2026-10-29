import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * D5 治理操作审计（append-only JSONL）。
 *
 * 存储：<workspace>/.mixlab-library/ops/governance-audit.jsonl
 * - 每次 record 追加一行；写入后若超过 50 行，轮转保留最新 50 条（原子 rename）；
 * - readRecent(limit<=50) 返回最新在前；
 * - 写/读失败不向清理操作抛错：record 返回 {ok,error}，readRecent 返回 {entries,error}；
 * - 无 workspace_root 时 record 为 no-op，readRecent 返回空。
 *
 * 该模块不 import index.ts；HTTP 装配在 index.ts。
 */

export const GOVERNANCE_AUDIT_MAX_ENTRIES = 50;
export const GOVERNANCE_AUDIT_DEFAULT_LIMIT = 50;

export const GOVERNANCE_AUDIT_OPERATIONS = [
  "cache_clean",
  "local_clip_clean",
  "local_clip_force_delete",
  "workspace_residue_clean",
  "release_cache_evict"
] as const;
export type GovernanceAuditOperation = (typeof GOVERNANCE_AUDIT_OPERATIONS)[number];

export type GovernanceAuditResult = "ok" | "partial" | "failed";

/** 治理审计稳定错误码（limit 校验用稳定 HTTP 错误；读写失败以 audit_error 形式返回）。 */
export const GOVERNANCE_AUDIT_ERROR_CODES = {
  governance_audit_invalid_limit: "governance_audit_invalid_limit",
  governance_audit_record_failed: "governance_audit_record_failed",
  governance_audit_read_failed: "governance_audit_read_failed"
} as const;
export type GovernanceAuditErrorCode =
  (typeof GOVERNANCE_AUDIT_ERROR_CODES)[keyof typeof GOVERNANCE_AUDIT_ERROR_CODES];

export class GovernanceAuditError extends Error {
  readonly code: GovernanceAuditErrorCode;
  readonly status: number;
  readonly remediation: string;

  constructor(code: GovernanceAuditErrorCode, message: string) {
    super(message);
    this.name = "GovernanceAuditError";
    this.code = code;
    this.status = code === GOVERNANCE_AUDIT_ERROR_CODES.governance_audit_invalid_limit ? 400 : 500;
    this.remediation =
      code === GOVERNANCE_AUDIT_ERROR_CODES.governance_audit_invalid_limit
        ? "limit 必须是 1 到 50 之间的整数；不传时默认 50。"
        : "稍后重试；治理审计不影响清理操作本身。";
  }
}

export interface GovernanceAuditErrorDetail {
  code: string;
  message: string;
}

export interface GovernanceAuditEntry {
  /** ISO 时间戳。 */
  at: string;
  operation: GovernanceAuditOperation;
  targets: string[];
  removed_count: number;
  freed_bytes: number;
  skipped_count: number;
  errors: GovernanceAuditErrorDetail[];
  result: GovernanceAuditResult;
  duration_ms: number;
}

export type GovernanceAuditRecordInput = Omit<GovernanceAuditEntry, "at" | "targets" | "errors"> & {
  at?: string;
  targets?: string[];
  errors?: GovernanceAuditErrorDetail[];
};

export interface GovernanceAuditRecordResult {
  ok: boolean;
  error?: string;
}

export interface GovernanceAuditReadResult {
  entries: GovernanceAuditEntry[];
  error?: string;
}

export interface GovernanceAuditStoreInput {
  workspace_root?: string;
  /** 测试注入：替换默认 JSONL 写入器（抛错时 record 返回 {ok:false,error}，不影响清理操作）。 */
  writer?: (entry: GovernanceAuditEntry) => Promise<void>;
  /** 测试注入时钟（ISO 字符串）。 */
  now?: () => string;
}

export interface GovernanceAuditStore {
  isEnabled(): boolean;
  auditPath(): string | undefined;
  record(input: GovernanceAuditRecordInput): Promise<GovernanceAuditRecordResult>;
  readRecent(limit?: number): Promise<GovernanceAuditReadResult>;
}

const OPERATION_SET = new Set<string>(GOVERNANCE_AUDIT_OPERATIONS);

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEntriesLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return GOVERNANCE_AUDIT_DEFAULT_LIMIT;
  }

  return Math.min(GOVERNANCE_AUDIT_MAX_ENTRIES, Math.max(1, Math.floor(limit!)));
}

/** GET /cutter/governance/audit 的 limit 解析；非法（<1、>50、非数字）抛 governance_audit_invalid_limit。 */
export function parseGovernanceAuditLimit(rawLimit: string | null | undefined): number {
  const raw = rawLimit?.trim();
  if (!raw) {
    return GOVERNANCE_AUDIT_DEFAULT_LIMIT;
  }

  if (!/^[0-9]+$/.test(raw)) {
    throw new GovernanceAuditError(
      GOVERNANCE_AUDIT_ERROR_CODES.governance_audit_invalid_limit,
      "limit 必须是 1 到 50 之间的整数"
    );
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > GOVERNANCE_AUDIT_MAX_ENTRIES) {
    throw new GovernanceAuditError(
      GOVERNANCE_AUDIT_ERROR_CODES.governance_audit_invalid_limit,
      "limit 必须是 1 到 50 之间的整数"
    );
  }

  return parsed;
}

function parseAuditEntry(line: string): GovernanceAuditEntry | null {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }

  const operation = typeof value.operation === "string" && OPERATION_SET.has(value.operation)
    ? value.operation as GovernanceAuditOperation
    : undefined;
  const result = value.result === "ok" || value.result === "partial" || value.result === "failed"
    ? value.result
    : undefined;
  if (
    typeof value.at !== "string" ||
    !operation ||
    !result ||
    !Array.isArray(value.targets) ||
    typeof value.removed_count !== "number" ||
    typeof value.freed_bytes !== "number" ||
    typeof value.skipped_count !== "number" ||
    typeof value.duration_ms !== "number" ||
    !Array.isArray(value.errors)
  ) {
    return null;
  }

  const errors: GovernanceAuditErrorDetail[] = [];
  for (const error of value.errors) {
    if (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string") {
      continue;
    }
    errors.push({ code: error.code, message: error.message });
  }

  return {
    at: value.at,
    operation,
    targets: value.targets.filter((item): item is string => typeof item === "string"),
    removed_count: value.removed_count,
    freed_bytes: value.freed_bytes,
    skipped_count: value.skipped_count,
    errors,
    result,
    duration_ms: value.duration_ms
  };
}

export function createGovernanceAuditStore(
  input: GovernanceAuditStoreInput
): GovernanceAuditStore {
  const workspaceRoot = input.workspace_root?.trim() || undefined;
  const auditFilePath = workspaceRoot
    ? path.join(workspaceRoot, ".mixlab-library", "ops", "governance-audit.jsonl")
    : undefined;
  const now = input.now ?? (() => new Date().toISOString());
  let queue: Promise<void> = Promise.resolve();

  function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function rotateToLatestEntries(): Promise<void> {
    if (!auditFilePath) {
      return;
    }

    const content = await readFile(auditFilePath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length <= GOVERNANCE_AUDIT_MAX_ENTRIES) {
      return;
    }

    const kept = lines.slice(lines.length - GOVERNANCE_AUDIT_MAX_ENTRIES);
    const tempPath = auditFilePath + "." + process.pid + "." + Date.now() + ".tmp";
    await writeFile(tempPath, kept.join("\n") + "\n", "utf8");
    try {
      await rename(tempPath, auditFilePath);
    } catch (error) {
      await rmQuiet(tempPath);
      throw error;
    }
  }

  async function defaultWrite(entry: GovernanceAuditEntry): Promise<void> {
    if (!auditFilePath) {
      return;
    }

    await mkdir(path.dirname(auditFilePath), { recursive: true });
    await appendFile(auditFilePath, JSON.stringify(entry) + "\n", "utf8");
    await rotateToLatestEntries();
  }

  const writer = input.writer ?? defaultWrite;

  function normalizeRecordInput(recordInput: GovernanceAuditRecordInput): GovernanceAuditEntry {
    return {
      at: recordInput.at ?? now(),
      operation: recordInput.operation,
      targets: [...(recordInput.targets ?? [])],
      removed_count: Math.max(0, Math.floor(recordInput.removed_count)),
      freed_bytes: Math.max(0, Math.floor(recordInput.freed_bytes)),
      skipped_count: Math.max(0, Math.floor(recordInput.skipped_count)),
      errors: (recordInput.errors ?? []).map((error) => ({
        code: error.code,
        message: error.message
      })),
      result: recordInput.result,
      duration_ms: Math.max(0, Math.floor(recordInput.duration_ms))
    };
  }

  async function record(
    recordInput: GovernanceAuditRecordInput
  ): Promise<GovernanceAuditRecordResult> {
    if (!auditFilePath) {
      return { ok: true };
    }

    const entry = normalizeRecordInput(recordInput);
    return withWriteLock(async () => {
      try {
        await writer(entry);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: "治理操作审计写入失败：" + errorText(error)
        };
      }
    });
  }

  async function readRecent(limit?: number): Promise<GovernanceAuditReadResult> {
    if (!auditFilePath) {
      return { entries: [] };
    }

    const clampedLimit = normalizeEntriesLimit(limit);
    try {
      const content = await readFile(auditFilePath, "utf8");
      const entries = content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map(parseAuditEntry)
        .filter((entry): entry is GovernanceAuditEntry => entry !== null);
      return {
        entries: entries.slice(entries.length - clampedLimit).reverse()
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { entries: [] };
      }
      return {
        entries: [],
        error: "治理操作审计读取失败：" + errorText(error)
      };
    }
  }

  return {
    isEnabled: () => Boolean(auditFilePath),
    auditPath: () => auditFilePath,
    record,
    readRecent
  };
}

async function rmQuiet(targetPath: string): Promise<void> {
  try {
    await rm(targetPath, { force: true });
  } catch {
    // best effort temp cleanup
  }
}
