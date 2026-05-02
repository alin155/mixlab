import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  isVideoVisibleToCutters,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";

export interface ListCutterVisibleSourceVideosInput {
  library_root: string;
}

export interface CutterVisibleSourceVideoCatalog {
  available_video_count: number;
  videos: SourceVideoManifest[];
}

function videosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "videos");
}

function sourceVideoManifestPath(libraryRoot: string, sourceVideoId: string): string {
  return path.join(videosRoot(libraryRoot), sourceVideoId, "source-video.json");
}

function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

async function readAllSourceVideoManifests(libraryRoot: string): Promise<SourceVideoManifest[]> {
  let entries;
  try {
    entries = await readdir(videosRoot(libraryRoot), { withFileTypes: true });
  } catch {
    return [];
  }

  const manifests: SourceVideoManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      manifests.push(
        JSON.parse(await readFile(sourceVideoManifestPath(libraryRoot, entry.name), "utf8"))
      );
    } catch {
      // Doctor owns malformed metadata reporting; cutter catalog skips invalid records.
    }
  }

  return manifests.sort(
    (left, right) =>
      numericSourceVideoId(left.source_video_id) - numericSourceVideoId(right.source_video_id)
  );
}

export async function listCutterVisibleSourceVideos(
  input: ListCutterVisibleSourceVideosInput
): Promise<CutterVisibleSourceVideoCatalog> {
  const videos = (await readAllSourceVideoManifests(input.library_root)).filter(
    isVideoVisibleToCutters
  );

  return {
    available_video_count: videos.length,
    videos
  };
}
