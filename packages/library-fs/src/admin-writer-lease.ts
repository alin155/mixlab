import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AdminWriterLeaseDetails {
  holder: string;
  reason: string;
  acquired_at: string;
  expires_at: string;
}

export interface WithAdminWriterLeaseInput {
  library_root: string;
  holder: string;
  reason: string;
  now: string;
  stale_ms?: number;
}

export class AdminWriterLeaseError extends Error {
  readonly code = "admin_writer_busy";
  readonly details: { lease: AdminWriterLeaseDetails | null };

  constructor(lease: AdminWriterLeaseDetails | null) {
    super(lease
      ? `管理端写入门禁已被 ${lease.holder} 占用：${lease.reason}`
      : "管理端写入门禁已被占用");
    this.name = "AdminWriterLeaseError";
    this.details = { lease };
  }
}

const DEFAULT_ADMIN_WRITER_LEASE_STALE_MS = 5 * 60 * 1000;

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function lockDir(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "locks", "admin-writer.lock");
}

function leasePath(libraryRoot: string): string {
  return path.join(lockDir(libraryRoot), "lease.json");
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function leaseDetails(input: Required<WithAdminWriterLeaseInput>): AdminWriterLeaseDetails {
  const acquiredAtMs = timestampMs(input.now) || Date.now();
  return {
    holder: input.holder,
    reason: input.reason,
    acquired_at: new Date(acquiredAtMs).toISOString(),
    expires_at: new Date(acquiredAtMs + input.stale_ms).toISOString()
  };
}

async function readLease(libraryRoot: string): Promise<AdminWriterLeaseDetails | null> {
  try {
    const parsed = JSON.parse(await readFile(leasePath(libraryRoot), "utf8")) as AdminWriterLeaseDetails;
    return {
      holder: typeof parsed.holder === "string" ? parsed.holder : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      acquired_at: typeof parsed.acquired_at === "string" ? parsed.acquired_at : "",
      expires_at: typeof parsed.expires_at === "string" ? parsed.expires_at : ""
    };
  } catch {
    return null;
  }
}

async function acquireAdminWriterLease(input: Required<WithAdminWriterLeaseInput>): Promise<void> {
  const root = mixlabRoot(input.library_root);
  await mkdir(path.join(root, "locks"), { recursive: true });

  try {
    await mkdir(lockDir(input.library_root));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    const existing = await readLease(input.library_root);
    const nowMs = timestampMs(input.now) || Date.now();
    if (!existing || (existing.expires_at && timestampMs(existing.expires_at) <= nowMs)) {
      await rm(lockDir(input.library_root), { recursive: true, force: true });
      await mkdir(lockDir(input.library_root));
    } else {
      throw new AdminWriterLeaseError(existing);
    }
  }

  await writeFile(
    leasePath(input.library_root),
    `${JSON.stringify(leaseDetails(input), null, 2)}\n`,
    "utf8"
  );
}

export async function withAdminWriterLease<T>(
  input: WithAdminWriterLeaseInput,
  operation: () => Promise<T>
): Promise<T> {
  const normalized: Required<WithAdminWriterLeaseInput> = {
    ...input,
    stale_ms: input.stale_ms ?? DEFAULT_ADMIN_WRITER_LEASE_STALE_MS
  };

  await acquireAdminWriterLease(normalized);
  try {
    return await operation();
  } finally {
    await rm(lockDir(input.library_root), { recursive: true, force: true });
  }
}
