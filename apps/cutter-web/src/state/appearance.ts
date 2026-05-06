export type CutterAppearanceMode = "dark" | "light" | "system";

export const CUTTER_APPEARANCE_STORAGE_KEY = "mixlab:cutter:appearance_mode";

const APPEARANCE_MODES: readonly CutterAppearanceMode[] = ["dark", "light", "system"];

function localStorageSafe(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isCutterAppearanceMode(value: string): value is CutterAppearanceMode {
  return APPEARANCE_MODES.includes(value as CutterAppearanceMode);
}

export function appearanceModeLabel(mode: CutterAppearanceMode): string {
  switch (mode) {
    case "dark":
      return "深色";
    case "light":
      return "浅色";
    case "system":
      return "系统";
  }
}

export function readCutterAppearanceMode(): CutterAppearanceMode {
  const storage = localStorageSafe();

  try {
    const stored = storage?.getItem(CUTTER_APPEARANCE_STORAGE_KEY) ?? "";
    if (isCutterAppearanceMode(stored)) {
      return stored;
    }

    if (stored === "comfort") {
      return "light";
    }

    return "dark";
  } catch {
    return "dark";
  }
}

export function writeCutterAppearanceMode(mode: CutterAppearanceMode): void {
  const storage = localStorageSafe();

  try {
    storage?.setItem(CUTTER_APPEARANCE_STORAGE_KEY, mode);
  } catch {
    // 显示偏好写入失败不应该影响剪辑工作台使用。
  }
}
