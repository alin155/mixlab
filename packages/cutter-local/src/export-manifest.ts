import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  validateExportClipManifest,
  type CutMode,
  type ExportClipManifest
} from "../../protocol/src/index.ts";

export interface BuildExportClipFileNameInput {
  export_clip_id: string;
  selected_text: string;
  extension?: string;
}

export interface BuildExportClipArtifactPathsInput extends BuildExportClipFileNameInput {
  workspace_root: string;
}

export interface ExportClipArtifactPaths {
  export_dir: string;
  output_file: string;
  media_file_path: string;
  manifest_file_path: string;
}

export interface WriteExportClipManifestInput {
  workspace_root: string;
  export_clip_id: string;
  library_id: string;
  source_video_id: string;
  source_title: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  output_file: string;
  created_at: string;
}

export interface ExportClipView extends ExportClipManifest {
  local_clip_id: string;
  title: string;
  duration_ms: number;
  media_file_path: string;
  manifest_file_path: string;
}

export interface ExportClipCatalog {
  local_clip_count: number;
  clips: ExportClipView[];
}

export interface ListExportClipsInput {
  workspace_root: string;
}

export interface GetExportClipDetailInput {
  workspace_root: string;
  export_clip_id: string;
}

const EXPORT_CLIP_ID_PATTERN = /^E\d{6}$/;

function exportClipsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, "export-clips");
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertExportClipId(exportClipId: string): void {
  if (!EXPORT_CLIP_ID_PATTERN.test(exportClipId)) {
    throw new Error("export_clip_id must use E000001 format");
  }
}

function numericExportClipId(exportClipId: string): number {
  const match = /^E(\d{6})$/.exec(exportClipId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function formatExportClipId(value: number): string {
  return `E${String(value).padStart(6, "0")}`;
}

function normalizeExtension(extension: string | undefined): string {
  if (extension === undefined || extension.trim() === "") {
    return ".mp4";
  }

  const normalized = extension.startsWith(".") ? extension : `.${extension}`;

  if (!/^\.[a-z0-9]{1,12}$/i.test(normalized)) {
    throw new Error("extension must be a simple file extension");
  }

  return normalized.toLowerCase();
}

function cleanFileNameText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const firstChars = Array.from(compact).slice(0, 20).join("");
  const safe = firstChars
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[._\-\s,，.。!！?？、:：;；]+$/u, "")
    .trim();

  return safe || "clip";
}

export function buildExportClipFileName(input: BuildExportClipFileNameInput): string {
  assertExportClipId(input.export_clip_id);

  return `${input.export_clip_id}_${cleanFileNameText(input.selected_text)}${normalizeExtension(input.extension)}`;
}

function safeWorkspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");

  if (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error("output_file must be workspace-relative");
  }

  const parts = normalized.split("/").filter(Boolean);

  if (parts.includes("..")) {
    throw new Error("output_file must be workspace-relative");
  }

  return path.join(workspaceRoot, ...parts);
}

export function buildExportClipArtifactPaths(
  input: BuildExportClipArtifactPathsInput
): ExportClipArtifactPaths {
  assertExportClipId(input.export_clip_id);

  const fileName = buildExportClipFileName(input);
  const outputFile = `export-clips/${input.export_clip_id}/${fileName}`;
  const exportDir = path.join(exportClipsRoot(input.workspace_root), input.export_clip_id);

  return {
    export_dir: exportDir,
    output_file: outputFile,
    media_file_path: safeWorkspaceRelativePath(input.workspace_root, outputFile),
    manifest_file_path: path.join(exportDir, "export-clip.json")
  };
}

export async function allocateNextExportClipId(workspaceRoot: string): Promise<string> {
  let entries;

  try {
    entries = await readdir(exportClipsRoot(workspaceRoot), { withFileTypes: true });
  } catch {
    return "E000001";
  }

  let maxId = 0;

  for (const entry of entries) {
    if (entry.isDirectory() && EXPORT_CLIP_ID_PATTERN.test(entry.name)) {
      maxId = Math.max(maxId, numericExportClipId(entry.name));
    }
  }

  return formatExportClipId(maxId + 1);
}

function toExportClipView(
  workspaceRoot: string,
  manifest: ExportClipManifest,
  manifestFilePath: string
): ExportClipView {
  return {
    ...manifest,
    local_clip_id: manifest.export_clip_id,
    title: cleanFileNameText(manifest.selected_text),
    duration_ms: manifest.end_ms - manifest.begin_ms,
    media_file_path: safeWorkspaceRelativePath(workspaceRoot, manifest.output_file),
    manifest_file_path: manifestFilePath
  };
}

export async function writeExportClipManifest(
  input: WriteExportClipManifestInput
): Promise<ExportClipView> {
  assertExportClipId(input.export_clip_id);

  const manifest: ExportClipManifest = {
    export_clip_id: input.export_clip_id,
    library_id: input.library_id,
    source_video_id: input.source_video_id,
    source_title: input.source_title,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    selected_text: input.selected_text,
    output_file: input.output_file.replace(/\\/g, "/"),
    created_at: input.created_at,
    cut_mode: input.cut_mode
  };
  const mediaFilePath = safeWorkspaceRelativePath(input.workspace_root, manifest.output_file);
  const validation = validateExportClipManifest(manifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  const manifestFilePath = path.join(
    exportClipsRoot(input.workspace_root),
    input.export_clip_id,
    "export-clip.json"
  );

  await mkdir(path.dirname(mediaFilePath), { recursive: true });
  await mkdir(path.dirname(manifestFilePath), { recursive: true });
  await writeFile(manifestFilePath, jsonBytes(manifest), "utf8");

  return toExportClipView(input.workspace_root, manifest, manifestFilePath);
}

async function readExportClipManifest(
  workspaceRoot: string,
  exportClipId: string
): Promise<ExportClipView> {
  assertExportClipId(exportClipId);

  const manifestFilePath = path.join(
    exportClipsRoot(workspaceRoot),
    exportClipId,
    "export-clip.json"
  );
  const manifest = JSON.parse(await readFile(manifestFilePath, "utf8")) as ExportClipManifest;
  const validation = validateExportClipManifest(manifest);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  return toExportClipView(workspaceRoot, manifest, manifestFilePath);
}

export async function listExportClips(
  input: ListExportClipsInput
): Promise<ExportClipCatalog> {
  let entries;

  try {
    entries = await readdir(exportClipsRoot(input.workspace_root), { withFileTypes: true });
  } catch {
    return {
      local_clip_count: 0,
      clips: []
    };
  }

  const clips: ExportClipView[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !EXPORT_CLIP_ID_PATTERN.test(entry.name)) {
      continue;
    }

    try {
      clips.push(await readExportClipManifest(input.workspace_root, entry.name));
    } catch {
      // Malformed local exports are skipped here; Doctor/acceptance can report them later.
    }
  }

  clips.sort((left, right) => {
    const createdCompare = right.created_at.localeCompare(left.created_at);
    return createdCompare || numericExportClipId(right.export_clip_id) - numericExportClipId(left.export_clip_id);
  });

  return {
    local_clip_count: clips.length,
    clips
  };
}

export async function getExportClipDetail(
  input: GetExportClipDetailInput
): Promise<ExportClipView | null> {
  try {
    return await readExportClipManifest(input.workspace_root, input.export_clip_id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}
