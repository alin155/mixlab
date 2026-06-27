import type { AdminSourceVideo, AdminSourceVideoDetail } from "./api.ts";

export function resolveMediaUrl(baseUrl: string, pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();

  if (!trimmed) {
    return "";
  }

  if (/^data:/i.test(trimmed)) {
    return /^data:image\//i.test(trimmed) ? trimmed : "";
  }

  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);

  try {
    if (hasExplicitScheme) {
      const resolved = new URL(trimmed);
      return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : "";
    }

    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const parsedBaseUrl = new URL(normalizedBaseUrl);
    const resolved = new URL(trimmed, normalizedBaseUrl);
    return (parsedBaseUrl.protocol === "http:" || parsedBaseUrl.protocol === "https:") &&
      (resolved.protocol === "http:" || resolved.protocol === "https:")
      ? resolved.toString()
      : "";
  } catch {
    if (hasExplicitScheme || trimmed.startsWith("//")) {
      return "";
    }

    try {
      const relativeBaseUrl = baseUrl.trim() || "/";
      const rootedRelativeBase = relativeBaseUrl.startsWith("/")
        ? relativeBaseUrl
        : `/${relativeBaseUrl}`;
      const normalizedRelativeBase = rootedRelativeBase.endsWith("/")
        ? rootedRelativeBase
        : `${rootedRelativeBase}/`;
      const resolved = new URL(trimmed, `http://mixlab.local${normalizedRelativeBase}`);
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return "";
    }
  }
}

export function resolveSourceVideoMedia(baseUrl: string, video: AdminSourceVideo): AdminSourceVideo {
  return {
    ...video,
    cover_url: resolveMediaUrl(baseUrl, video.cover_url)
  };
}

export function resolveSourceVideoDetailMedia(
  baseUrl: string,
  detail: AdminSourceVideoDetail
): AdminSourceVideoDetail {
  return {
    ...detail,
    source_video: resolveSourceVideoMedia(baseUrl, detail.source_video)
  };
}
