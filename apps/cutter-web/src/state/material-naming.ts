export function normalizedMaterialTitlePart(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function stripKnownVideoExtension(value: string): string {
  return value.replace(/\.(mp4|mov|m4v|webm|mkv|avi)$/i, "");
}

export function sourceMaterialTitleFromStableName(
  value: string | undefined,
  fallback = "本地剪切任务"
): string {
  const title = stripKnownVideoExtension(normalizedMaterialTitlePart(value, fallback));
  const parts = title.split(/\s*-\s*/).filter(Boolean);

  if (parts.length >= 2 && /^\d+$/.test(parts[0] ?? "")) {
    return stripKnownVideoExtension(parts[parts.length - 1]?.trim() || title);
  }

  return title;
}
