import { stat } from "node:fs/promises";
import path from "node:path";

export function safeAdminRelativeArtifactPath(libraryRelativePath: string): string | null {
  const normalized = libraryRelativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return null;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    return null;
  }

  return path.join(...parts);
}

export function adminVideoArtifactsRoot(input: {
  library_root: string;
  source_video_id: string;
}): string {
  return path.join(input.library_root, ".mixlab-library", "videos", input.source_video_id);
}

export function resolveAdminVideoArtifactPath(input: {
  library_root: string;
  source_video_id: string;
  artifact_path: string;
  fallback_file_name?: string;
}): string | null {
  const artifactPath = input.artifact_path.trim();
  const libraryUriMatch = /^library:\/\/video\/(V\d{6})(?:\/(.*))?$/.exec(artifactPath);

  if (libraryUriMatch) {
    const uriSourceVideoId = libraryUriMatch[1] ?? "";
    if (uriSourceVideoId !== input.source_video_id) {
      return null;
    }

    const uriRelativePath = libraryUriMatch[2] || input.fallback_file_name || "";
    const safeUriRelativePath = safeAdminRelativeArtifactPath(uriRelativePath);
    return safeUriRelativePath
      ? path.join(adminVideoArtifactsRoot(input), safeUriRelativePath)
      : null;
  }

  const safeArtifactPath = safeAdminRelativeArtifactPath(artifactPath);
  if (safeArtifactPath) {
    return path.join(input.library_root, safeArtifactPath);
  }

  return input.fallback_file_name
    ? path.join(adminVideoArtifactsRoot(input), input.fallback_file_name)
    : null;
}

export function adminImageContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".svg") {
    return "image/svg+xml";
  }

  return "image/jpeg";
}

export async function adminFileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
