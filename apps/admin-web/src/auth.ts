import type { AdminAuthResult, AdminPublicUser } from "./api.ts";

const ADMIN_AUTH_STORAGE_KEY = "mixlab.admin.auth.v1";

export interface StoredAdminAuthSession {
  admin_id: string;
  username: string;
  display_name: string;
  role: AdminPublicUser["role"];
  session_token: string;
  created_at: string;
  last_seen_at: string;
}

function storageAvailable(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isStoredAdminAuthSession(value: unknown): value is StoredAdminAuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<StoredAdminAuthSession>;
  return typeof record.admin_id === "string" &&
    typeof record.username === "string" &&
    typeof record.display_name === "string" &&
    typeof record.role === "string" &&
    typeof record.session_token === "string" &&
    typeof record.created_at === "string" &&
    typeof record.last_seen_at === "string";
}

export function adminAuthSessionFromResult(result: AdminAuthResult): StoredAdminAuthSession {
  return {
    admin_id: result.user.admin_id,
    username: result.user.username,
    display_name: result.user.display_name || result.user.username,
    role: result.user.role,
    session_token: result.session.session_token,
    created_at: result.session.created_at,
    last_seen_at: result.session.last_seen_at
  };
}

export function readAdminAuthSession(): StoredAdminAuthSession | null {
  const storage = storageAvailable();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isStoredAdminAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAdminAuthSession(session: StoredAdminAuthSession): void {
  const storage = storageAvailable();
  if (!storage) {
    return;
  }

  storage.setItem(ADMIN_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminAuthSession(): void {
  const storage = storageAvailable();
  if (!storage) {
    return;
  }

  storage.removeItem(ADMIN_AUTH_STORAGE_KEY);
}
