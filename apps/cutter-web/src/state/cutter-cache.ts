import type { CutterRuntimeStatus } from "../api.ts";
import { CUT_LIST_STORAGE_KEY } from "./cut-list.ts";
import {
  CUTTER_CURRENT_PROJECT_STORAGE_KEY,
  CUTTER_PROJECTS_STORAGE_KEY
} from "./cutter-projects.ts";
import { CUT_JOB_PROJECT_INDEX_STORAGE_KEY } from "./cut-queue.ts";
import { CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY } from "./cut-queue-batch.ts";

const CUTTER_PREFERENCE_STORAGE_PREFIX = "mixlab:cutter:";
const CUTTER_PRESERVED_STORAGE_KEYS = new Set([
  "mixlab:cutter:auth_session",
  "mixlab:cutter:device_id",
  "mixlab:cutter:pending_login"
]);

/**
 * User data that must NEVER be removed by the "clear UI cache" action:
 * projects, the cut list, the selected project and the job->project index.
 * They live in "mixlab.cutter.*" keys and are only touched by their own
 * editing flows (with confirmation + in-memory state reset).
 */
export const CUTTER_USER_DATA_STORAGE_KEYS: readonly string[] = [
  CUT_LIST_STORAGE_KEY,
  CUTTER_PROJECTS_STORAGE_KEY,
  CUTTER_CURRENT_PROJECT_STORAGE_KEY,
  CUT_JOB_PROJECT_INDEX_STORAGE_KEY,
  CUT_QUEUE_HIDDEN_JOBS_STORAGE_KEY
];

export function isCutterUserDataStorageKey(key: string): boolean {
  return CUTTER_USER_DATA_STORAGE_KEYS.includes(key);
}

export interface CutterLocalCacheSnapshot {
  bytes: number;
  keys: string[];
}

function localStorageSafe(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "Clear UI cache" only ever targets disposable preferences (display mode,
 * default filters, ...). User data, corrupt-data backups and auth keys are
 * kept; auth keys so cache clearing cannot log the user out (CW-07).
 */
function isCutterPreferenceStorageKey(key: string): boolean {
  return key.startsWith(CUTTER_PREFERENCE_STORAGE_PREFIX) &&
    !CUTTER_PRESERVED_STORAGE_KEYS.has(key) &&
    !isCutterUserDataStorageKey(key);
}

function cutterKeysMatching(
  storage: Storage | null,
  predicate: (key: string) => boolean
): string[] {
  if (!storage) {
    return [];
  }

  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && predicate(key)) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }

  return keys;
}

function snapshotForKeys(
  storage: Storage | null,
  keys: readonly string[]
): CutterLocalCacheSnapshot {
  let bytes = 0;
  if (storage) {
    for (const key of keys) {
      try {
        bytes += (key.length + (storage.getItem(key) ?? "").length) * 2;
      } catch {
        // Ignore unreadable keys; the snapshot is informational only.
      }
    }
  }

  return { bytes, keys: [...keys] };
}

export function formatCutterCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  const tb = gb * 1024;

  if (bytes < mb) {
    return `${Math.max(1, Math.round(bytes / kb))} KB`;
  }

  if (bytes < gb) {
    return `${(bytes / mb).toFixed(bytes < 10 * mb ? 1 : 0)} MB`;
  }

  if (bytes < tb) {
    return `${(bytes / gb).toFixed(bytes < 10 * gb ? 1 : 0)} GB`;
  }

  return `${(bytes / tb).toFixed(bytes < 10 * tb ? 1 : 0)} TB`;
}

export function cutterRuntimeCacheBytes(runtimeStatus?: CutterRuntimeStatus): number {
  if (!runtimeStatus) {
    return 0;
  }

  return (
    (runtimeStatus.release_cache?.cache_size_bytes ?? 0) +
    (runtimeStatus.local_cache?.searchd_cache_size_bytes ?? 0) +
    (runtimeStatus.local_cache?.thumbnail_cache_size_bytes ?? 0) +
    (runtimeStatus.local_cache?.source_video_cache?.size_bytes ?? 0) +
    (runtimeStatus.local_cache?.cut_temp_cache.size_bytes ?? 0)
  );
}

export function cutterCachePercent(value: number | undefined, max: number | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN) || !Number.isFinite(max ?? Number.NaN) || (max ?? 0) <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, ((value ?? 0) / (max ?? 1)) * 100));
}

/** UI preferences only: shown as the clearable "界面缓存". */
export function cutterLocalCacheSnapshot(
  storage: Storage | null = localStorageSafe()
): CutterLocalCacheSnapshot {
  return snapshotForKeys(storage, cutterKeysMatching(storage, isCutterPreferenceStorageKey));
}

/** User data (projects / cut list / index): displayed as protected, never cleared here. */
export function cutterUserDataStorageSnapshot(
  storage: Storage | null = localStorageSafe()
): CutterLocalCacheSnapshot {
  return snapshotForKeys(storage, cutterKeysMatching(storage, isCutterUserDataStorageKey));
}

export const CUTTER_TRANSIENT_UI_STORAGE_PREFIX = CUTTER_PREFERENCE_STORAGE_PREFIX;

/** Key names only (never values): safe to include in crash diagnostics. */
export function cutterStorageKeyInventory(storage: Storage | null = localStorageSafe()): string[] {
  return cutterKeysMatching(
    storage,
    (key) => key.startsWith("mixlab:cutter:") || key.startsWith("mixlab.cutter.")
  );
}

/** Crash recovery: clear only disposable UI preferences, keep user data + auth. */
export function clearCutterTransientUiState(storage: Storage | null = localStorageSafe()): string[] {
  const keys = cutterKeysMatching(storage, isCutterPreferenceStorageKey);

  if (!storage) {
    return [];
  }

  const removed: string[] = [];
  for (const key of keys) {
    if (isCutterUserDataStorageKey(key)) {
      continue;
    }

    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // Best-effort cleanup; a locked-down storage should not block recovery.
    }
  }

  return removed;
}

/**
 * Clear the "界面缓存" action entry point: preferences only. Projects, cut
 * list, current project, job->project index and auth state are preserved.
 */
export function clearCutterLocalCache(
  storage: Storage | null = localStorageSafe()
): CutterLocalCacheSnapshot {
  const snapshot = cutterLocalCacheSnapshot(storage);
  clearCutterTransientUiState(storage);

  return snapshot;
}
