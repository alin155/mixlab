/**
 * Workspace residue notice dismissal memory.
 *
 * The notice must stay dismissed for the same residue count for 24 hours so a
 * transient residue warning does not nag on every navigation. A different
 * residue count is a new condition and re-opens the notice.
 */
export const WORKSPACE_RESIDUE_NOTICE_STORAGE_KEY = "mixlab:cutter:workspace_residue_notice_dismissal";
export const WORKSPACE_RESIDUE_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

export interface WorkspaceResidueNoticeDismissal {
  count: number;
  dismissed_at: number;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

function safeStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readWorkspaceResidueNoticeDismissal(
  storage: ReadableStorage | null = safeStorage()
): WorkspaceResidueNoticeDismissal | null {
  if (!storage) {
    return null;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(WORKSPACE_RESIDUE_NOTICE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceResidueNoticeDismissal>;
    if (typeof parsed.count !== "number" || !Number.isFinite(parsed.count) || parsed.count < 0) {
      return null;
    }
    if (typeof parsed.dismissed_at !== "number" || !Number.isFinite(parsed.dismissed_at) || parsed.dismissed_at <= 0) {
      return null;
    }
    return { count: parsed.count, dismissed_at: parsed.dismissed_at };
  } catch {
    return null;
  }
}

export function writeWorkspaceResidueNoticeDismissal(
  count: number,
  now: number = Date.now(),
  storage: WritableStorage | null = safeStorage()
): void {
  if (!storage || !Number.isFinite(count) || count <= 0) {
    return;
  }
  try {
    storage.setItem(
      WORKSPACE_RESIDUE_NOTICE_STORAGE_KEY,
      JSON.stringify({ count, dismissed_at: now } satisfies WorkspaceResidueNoticeDismissal)
    );
  } catch {
    // Local storage can be unavailable in locked-down WebView contexts.
  }
}

export function shouldShowWorkspaceResidueNotice(input: {
  count: number;
  now: number;
  dismissal: WorkspaceResidueNoticeDismissal | null;
}): boolean {
  if (!Number.isFinite(input.count) || input.count <= 0) {
    return false;
  }
  if (!input.dismissal) {
    return true;
  }
  if (input.dismissal.count !== input.count) {
    return true;
  }
  return input.now - input.dismissal.dismissed_at >= WORKSPACE_RESIDUE_NOTICE_TTL_MS;
}
