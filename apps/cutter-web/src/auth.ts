export interface CutterAuthSession {
  device_id: string;
  session_token: string;
  username?: string;
}

export const CUTTER_AUTH_STORAGE_KEY = "mixlab:cutter:auth_session";

const CUTTER_DEVICE_STORAGE_KEY = "mixlab:cutter:device_id";

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
  const existing = storage?.getItem(CUTTER_DEVICE_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const deviceId = makeDeviceId();
  storage?.setItem(CUTTER_DEVICE_STORAGE_KEY, deviceId);
  return deviceId;
}

export function readCutterAuthSession(): CutterAuthSession | null {
  const storage = getLocalStorage();
  const raw = storage?.getItem(CUTTER_AUTH_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CutterAuthSession>;

    if (typeof parsed.device_id !== "string" || typeof parsed.session_token !== "string") {
      storage?.removeItem(CUTTER_AUTH_STORAGE_KEY);
      return null;
    }

    return {
      device_id: parsed.device_id,
      session_token: parsed.session_token,
      ...(typeof parsed.username === "string" ? { username: parsed.username } : {})
    };
  } catch {
    storage?.removeItem(CUTTER_AUTH_STORAGE_KEY);
    return null;
  }
}

export function writeCutterAuthSession(session: CutterAuthSession): void {
  const storage = getLocalStorage();
  storage?.setItem(CUTTER_AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearCutterAuthSession(): void {
  const storage = getLocalStorage();
  storage?.removeItem(CUTTER_AUTH_STORAGE_KEY);
}
