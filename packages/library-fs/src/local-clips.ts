import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CutMode } from "../../ffmpeg-core/src/index.ts";
import { validateLocalClipManifest } from "../../protocol/src/index.ts";

export interface BuildLocalClipArtifactPathsInput {
  library_root: string;
  local_clip_id: string;
}

export interface LocalClipManifestInput {
  library_root: string;
  local_clip_id: string;
  title: string;
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  media_path: string;
  created_at: string;
}

export interface LocalClipManifest {
  schema_version: "1.0";
  local_clip_id: string;
  title: string;
  source_video_id: string;
  source_title: string;
  source_relative_path: string;
  begin_ms: number;
  end_ms: number;
  duration_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  media_path: string;
  created_at: string;
}

export interface LocalClipView extends LocalClipManifest {
  media_file_path: string;
}

export interface ListLocalClipsInput {
  library_root: string;
}

export interface LocalClipCatalog {
  local_clip_count: number;
  clips: LocalClipView[];
}

export interface GetLocalClipDetailInput {
  library_root: string;
  local_clip_id: string;
}

export interface LocalClipArtifactPaths {
  media_path: string;
  media_file_path: string;
  manifest_file_path: string;
}

const LOCAL_CLIP_ID_PATTERN = /^LC\d{6}$/;

function localClipsRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "local-clips");
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertLocalClipId(localClipId: string): void {
  if (!LOCAL_CLIP_ID_PATTERN.test(localClipId)) {
    throw new Error("local_clip_id must use LC000001 format");
  }
}

function numericLocalClipId(localClipId: string): number {
  const match = /^LC(\d{6})$/.exec(localClipId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function formatLocalClipId(value: number): string {
  return `LC${String(value).padStart(6, "0")}`;
}

function safeLibraryRelativePath(libraryRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("media_path must be a library-relative path");
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.includes("..")) {
    throw new Error("media_path cannot escape library root");
  }

  return path.join(libraryRoot, ...parts);
}

export function buildLocalClipArtifactPaths(
  input: BuildLocalClipArtifactPathsInput
): LocalClipArtifactPaths {
  assertLocalClipId(input.local_clip_id);

  const mediaPath = `.mixlab-library/local-clips/${input.local_clip_id}/clip.mp4`;
  const clipRoot = path.join(localClipsRoot(input.library_root), input.local_clip_id);

  return {
    media_path: mediaPath,
    media_file_path: path.join(input.library_root, mediaPath),
    manifest_file_path: path.join(clipRoot, "local-clip.json")
  };
}

export async function allocateNextLocalClipId(libraryRoot: string): Promise<string> {
  let entries;

  try {
    entries = await readdir(localClipsRoot(libraryRoot), { withFileTypes: true });
  } catch {
    return "LC000001";
  }

  let maxId = 0;

  for (const entry of entries) {
    if (entry.isDirectory() && LOCAL_CLIP_ID_PATTERN.test(entry.name)) {
      maxId = Math.max(maxId, numericLocalClipId(entry.name));
    }
  }

  return formatLocalClipId(maxId + 1);
}

export async function writeLocalClipManifest(
  input: LocalClipManifestInput
): Promise<LocalClipManifest> {
  assertLocalClipId(input.local_clip_id);

  if (input.end_ms <= input.begin_ms) {
    throw new Error("end_ms must be greater than begin_ms");
  }

  const manifest: LocalClipManifest = {
    schema_version: "1.0",
    local_clip_id: input.local_clip_id,
    title: input.title,
    source_video_id: input.source_video_id,
    source_title: input.source_title,
    source_relative_path: input.source_relative_path,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    duration_ms: input.end_ms - input.begin_ms,
    selected_text: input.selected_text,
    cut_mode: input.cut_mode,
    media_path: input.media_path,
    created_at: input.created_at
  };
  const validation = validateLocalClipManifest(manifest);
  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const paths = buildLocalClipArtifactPaths({
    library_root: input.library_root,
    local_clip_id: input.local_clip_id
  });

  await mkdir(path.dirname(paths.manifest_file_path), { recursive: true });
  await writeFile(paths.manifest_file_path, jsonBytes(manifest), "utf8");

  return manifest;
}

async function readLocalClipManifest(
  libraryRoot: string,
  localClipId: string
): Promise<LocalClipManifest> {
  const paths = buildLocalClipArtifactPaths({
    library_root: libraryRoot,
    local_clip_id: localClipId
  });

  return JSON.parse(await readFile(paths.manifest_file_path, "utf8")) as LocalClipManifest;
}

function toLocalClipView(libraryRoot: string, manifest: LocalClipManifest): LocalClipView {
  return {
    ...manifest,
    media_file_path: safeLibraryRelativePath(libraryRoot, manifest.media_path)
  };
}

export async function listLocalClips(input: ListLocalClipsInput): Promise<LocalClipCatalog> {
  let entries;

  try {
    entries = await readdir(localClipsRoot(input.library_root), { withFileTypes: true });
  } catch {
    return {
      local_clip_count: 0,
      clips: []
    };
  }

  const clips: LocalClipView[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !LOCAL_CLIP_ID_PATTERN.test(entry.name)) {
      continue;
    }

    try {
      clips.push(toLocalClipView(input.library_root, await readLocalClipManifest(input.library_root, entry.name)));
    } catch {
      // Doctor/reporting can surface malformed local clips; the cutter library skips them.
    }
  }

  clips.sort((left, right) => {
    const createdCompare = right.created_at.localeCompare(left.created_at);
    return createdCompare || numericLocalClipId(right.local_clip_id) - numericLocalClipId(left.local_clip_id);
  });

  return {
    local_clip_count: clips.length,
    clips
  };
}

export async function getLocalClipDetail(
  input: GetLocalClipDetailInput
): Promise<LocalClipView | null> {
  assertLocalClipId(input.local_clip_id);

  try {
    return toLocalClipView(
      input.library_root,
      await readLocalClipManifest(input.library_root, input.local_clip_id)
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}
