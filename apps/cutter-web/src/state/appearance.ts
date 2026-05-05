export type CutterAppearanceMode = "system" | "default" | "night" | "comfort";

export const CUTTER_APPEARANCE_STORAGE_KEY = "mixlab:cutter:appearance_mode";

const APPEARANCE_MODES: readonly CutterAppearanceMode[] = ["system", "default", "night", "comfort"];

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
    case "system":
      return "跟随系统";
    case "default":
      return "默认";
    case "night":
      return "深夜";
    case "comfort":
      return "护眼";
  }
}

export function readCutterAppearanceMode(): CutterAppearanceMode {
  const storage = localStorageSafe();

  try {
    const stored = storage?.getItem(CUTTER_APPEARANCE_STORAGE_KEY) ?? "";
    return isCutterAppearanceMode(stored) ? stored : "system";
  } catch {
    return "system";
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
