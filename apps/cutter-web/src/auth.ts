export interface CutterAuthSession {
  user_id: string;
  device_id: string;
  session_token: string;
  username?: string;
}

export interface CutterPendingLogin {
  username: string;
  device_id: string;
  device_name: string;
}

export const CUTTER_AUTH_STORAGE_KEY = "mixlab:cutter:auth_session";

const CUTTER_DEVICE_STORAGE_KEY = "mixlab:cutter:device_id";
const CUTTER_PENDING_LOGIN_STORAGE_KEY = "mixlab:cutter:pending_login";

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeDeviceId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && "randomUUID" in cryptoApi) {
    return `cutter-${cryptoApi.randomUUID()}`;
  }

  return `cutter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDeviceId(): string {
  const storage = getLocalStorage();
  let existing: string | null = null;

  try {
    existing = storage?.getItem(CUTTER_DEVICE_STORAGE_KEY) ?? null;
  } catch {
    existing = null;
  }

  if (existing) {
    return existing;
  }

  const deviceId = makeDeviceId();
  try {
    storage?.setItem(CUTTER_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    // Storage may be unavailable in private or locked-down browser contexts.
  }
  return deviceId;
}

export function readCutterAuthSession(): CutterAuthSession | null {
  const storage = getLocalStorage();
  let raw: string | null = null;

  try {
    raw = storage?.getItem(CUTTER_AUTH_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CutterAuthSession>;

    if (
      typeof parsed.device_id !== "string" ||
      typeof parsed.session_token !== "string"
    ) {
      try {
        storage?.removeItem(CUTTER_AUTH_STORAGE_KEY);
      } catch {
        // Ignore storage cleanup failures.
      }
      return null;
    }

    return {
      user_id: typeof parsed.user_id === "string" ? parsed.user_id : "",
      device_id: parsed.device_id,
      session_token: parsed.session_token,
      ...(typeof parsed.username === "string" ? { username: parsed.username } : {})
    };
  } catch {
    try {
      storage?.removeItem(CUTTER_AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

export function writeCutterAuthSession(session: CutterAuthSession): void {
  const storage = getLocalStorage();
  try {
    storage?.setItem(CUTTER_AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures so auth checks do not crash rendering.
  }
}

export function clearCutterAuthSession(): void {
  const storage = getLocalStorage();
  try {
    storage?.removeItem(CUTTER_AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures so auth checks do not crash rendering.
  }
}

export function readCutterPendingLogin(): CutterPendingLogin | null {
  const storage = getLocalStorage();
  let raw: string | null = null;

  try {
    raw = storage?.getItem(CUTTER_PENDING_LOGIN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CutterPendingLogin>;

    if (
      typeof parsed.username !== "string" ||
      typeof parsed.device_id !== "string" ||
      typeof parsed.device_name !== "string"
    ) {
      try {
        storage?.removeItem(CUTTER_PENDING_LOGIN_STORAGE_KEY);
      } catch {
        // Ignore storage cleanup failures.
      }
      return null;
    }

    return {
      username: parsed.username,
      device_id: parsed.device_id,
      device_name: parsed.device_name
    };
  } catch {
    try {
      storage?.removeItem(CUTTER_PENDING_LOGIN_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

export function writeCutterPendingLogin(login: CutterPendingLogin): void {
  const storage = getLocalStorage();
  try {
    storage?.setItem(CUTTER_PENDING_LOGIN_STORAGE_KEY, JSON.stringify(login));
  } catch {
    // Ignore storage failures so auth checks do not crash rendering.
  }
}

export function clearCutterPendingLogin(): void {
  const storage = getLocalStorage();
  try {
    storage?.removeItem(CUTTER_PENDING_LOGIN_STORAGE_KEY);
  } catch {
    // Ignore storage failures so auth checks do not crash rendering.
  }
}
