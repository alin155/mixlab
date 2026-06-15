import type { CutterRuntimeStatus } from "../api.ts";

const CUTTER_CACHE_STORAGE_PREFIXES = ["mixlab:cutter:", "mixlab.cutter."] as const;
const CUTTER_PRESERVED_STORAGE_KEYS = new Set([
  "mixlab:cutter:auth_session",
  "mixlab:cutter:device_id",
  "mixlab:cutter:pending_login"
]);

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

function isCutterCacheStorageKey(key: string): boolean {
  return CUTTER_CACHE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    !CUTTER_PRESERVED_STORAGE_KEYS.has(key);
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

export function cutterLocalCacheSnapshot(storage: Storage | null = localStorageSafe()): CutterLocalCacheSnapshot {
  if (!storage) {
    return { bytes: 0, keys: [] };
  }

  const keys: string[] = [];
  let bytes = 0;

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !isCutterCacheStorageKey(key)) {
        continue;
      }

      const value = storage.getItem(key) ?? "";
      keys.push(key);
      bytes += (key.length + value.length) * 2;
    }
  } catch {
    return { bytes: 0, keys: [] };
  }

  return { bytes, keys };
}

export function clearCutterLocalCache(storage: Storage | null = localStorageSafe()): CutterLocalCacheSnapshot {
  const snapshot = cutterLocalCacheSnapshot(storage);

  if (!storage) {
    return snapshot;
  }

  for (const key of snapshot.keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Cache cleanup is best-effort; storage can be unavailable in desktop shells.
    }
  }

  return snapshot;
}
