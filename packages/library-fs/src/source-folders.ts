export function sourceFolderNameFromRelativePath(relativePath: string | undefined): string {
  const normalized = (relativePath ?? "").replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/")) {
    return "";
  }

  const firstPart = normalized.split("/").find(Boolean);
  return firstPart ?? "";
}

export function normalizeSourceFolderName(value: string | undefined): string {
  return (value ?? "").trim();
}
