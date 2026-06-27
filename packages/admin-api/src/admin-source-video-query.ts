import path from "node:path";
import type { PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";

export function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

export function sourceVideoIdFromOrdinal(ordinal: number): string {
  return `V${String(ordinal).padStart(6, "0")}`;
}

export function escapeSqliteLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function fileNameFromRelativePath(relativePath: string): string {
  return path.basename(relativePath);
}

export function adminSourceVideoMatchesListFilter(
  manifest: SourceVideoManifest,
  filter: {
    query?: string;
    status?: PreprocessStatus;
  }
): boolean {
  if (filter.status && manifest.preprocess_status !== filter.status) {
    return false;
  }

  const normalizedQuery = filter.query?.trim().toLocaleLowerCase() ?? "";
  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [
    manifest.source_video_id,
    manifest.title,
    fileNameFromRelativePath(manifest.relative_path),
    manifest.relative_path,
    manifest.description ?? "",
    manifest.lecturer ?? "",
    manifest.course ?? "",
    manifest.category ?? "",
    ...(manifest.tags ?? [])
  ].join(" ").toLocaleLowerCase();

  return searchableText.includes(normalizedQuery);
}

export function sourceVideoManifestFromIndexedRow(row: {
  source_video_id: string;
  title: string;
  duration_ms: number;
  relative_path: string;
  cover_path: string;
}): SourceVideoManifest {
  return {
    source_video_id: row.source_video_id,
    title: row.title,
    relative_path: row.relative_path,
    logical_uri: `library://source-video/${row.source_video_id}`,
    duration_ms: row.duration_ms,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: 0,
    content_hash: "",
    preprocess_status: "ready",
    visible_to_cutters: true,
    transcript_path: "",
    srt_path: "",
    keyframes_path: "",
    cover_path: row.cover_path,
    description: "",
    tags: [],
    lecturer: "",
    course: "",
    category: ""
  };
}
