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
  project_title?: string;
  project_clip_order?: number;
  source_title?: string;
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
  project_id?: string;
  source_video_id: string;
  title?: string;
  project_title?: string;
  project_clip_order?: number;
  source_title: string;
  begin_ms: number;
  end_ms: number;
  selected_text: string;
  cut_mode: CutMode;
  output_file: string;
  project_output_file?: string;
  local_asset_relative_path?: string;
  source_video_manifest_path?: string;
  transcript_path?: string;
  srt_path?: string;
  keyframes_path?: string;
  cover_path?: string;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  file_size?: number;
  content_hash?: string;
  transcript_segments?: ExportClipManifest["transcript_segments"];
  created_at: string;
}

export interface ExportClipView extends ExportClipManifest {
  local_clip_id: string;
  title: string;
  duration_ms: number;
  media_file_path: string;
  manifest_file_path: string;
  cover_file_path?: string;
  subtitles_file_path?: string;
  source_video_manifest_file_path?: string;
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

export function exportClipsDirectory(workspaceRoot: string): string {
  return path.join(workspaceRoot, "export-clips");
}

function exportClipsRoot(workspaceRoot: string): string {
  return exportClipsDirectory(workspaceRoot);
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

function cleanTitlePart(text: string | undefined, fallback: string): string {
  const safe = (text ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[._\-\s,，.。!！?？、:：;；]+$/u, "")
    .trim();

  return safe || fallback;
}

function stripKnownVideoExtension(text: string): string {
  return text.replace(/\.(mp4|mov|m4v|webm|mkv|avi)$/i, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sourceTitleForCanonicalClipName(
  sourceTitle: string | undefined,
  projectTitle?: string
): string {
  const title = stripKnownVideoExtension(cleanTitlePart(sourceTitle, "本地素材"));
  const project = cleanTitlePart(projectTitle, "");

  if (project) {
    const projectMatch = new RegExp(`^\\d+\\s*-\\s*${escapeRegExp(project)}\\s*-\\s*(.+)$`).exec(title);
    if (projectMatch?.[1]?.trim()) {
      return stripKnownVideoExtension(cleanTitlePart(projectMatch[1], title));
    }
  }

  const parts = title.split(/\s*-\s*/).filter(Boolean);
  if (parts.length >= 2 && /^\d+$/.test(parts[0] ?? "")) {
    return stripKnownVideoExtension(cleanTitlePart(parts[parts.length - 1], title));
  }

  return title;
}

function sequenceLabel(value: number | undefined, padded: boolean): string {
  const numeric = Number.isFinite(value) && (value ?? 0) > 0
    ? Math.floor(value!)
    : 1;

  return padded ? String(numeric).padStart(3, "0") : String(numeric);
}

export function buildCanonicalClipTitle(input: {
  project_clip_order?: number;
  project_title?: string;
  source_title?: string;
  padded_sequence?: boolean;
}): string {
  return [
    sequenceLabel(input.project_clip_order, input.padded_sequence ?? false),
    cleanTitlePart(input.project_title, "未归属项目"),
    sourceTitleForCanonicalClipName(input.source_title, input.project_title)
  ].join("-");
}

export function buildProjectClipOutputFile(input: {
  project_clip_order?: number;
  project_title?: string;
  source_title?: string;
  extension?: string;
}): string {
  const projectFolder = cleanTitlePart(input.project_title, "未归属项目");
  const fileName = `${buildCanonicalClipTitle({
    project_clip_order: input.project_clip_order,
    project_title: input.project_title,
    source_title: input.source_title,
    padded_sequence: true
  })}${normalizeExtension(input.extension)}`;

  return `projects/${projectFolder}/${fileName}`;
}

export function buildExportClipFileName(input: BuildExportClipFileNameInput): string {
  assertExportClipId(input.export_clip_id);

  if (input.project_title || input.project_clip_order || input.source_title) {
    return `${buildCanonicalClipTitle({
      project_clip_order: input.project_clip_order,
      project_title: input.project_title,
      source_title: input.source_title,
      padded_sequence: true
    })}${normalizeExtension(input.extension)}`;
  }

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
    title: manifest.title ?? cleanFileNameText(manifest.selected_text),
    duration_ms: manifest.end_ms - manifest.begin_ms,
    media_file_path: safeWorkspaceRelativePath(workspaceRoot, manifest.output_file),
    manifest_file_path: manifestFilePath,
    ...(manifest.cover_path ? { cover_file_path: safeWorkspaceRelativePath(workspaceRoot, manifest.cover_path) } : {}),
    ...(manifest.srt_path ? { subtitles_file_path: safeWorkspaceRelativePath(workspaceRoot, manifest.srt_path) } : {}),
    ...(manifest.source_video_manifest_path
      ? { source_video_manifest_file_path: safeWorkspaceRelativePath(workspaceRoot, manifest.source_video_manifest_path) }
      : {})
  };
}

export async function writeExportClipManifest(
  input: WriteExportClipManifestInput
): Promise<ExportClipView> {
  assertExportClipId(input.export_clip_id);

  const manifest: ExportClipManifest = {
    export_clip_id: input.export_clip_id,
    library_id: input.library_id,
    ...(input.project_id ? { project_id: input.project_id } : {}),
    source_video_id: input.source_video_id,
    ...(input.title ? { title: input.title } : {}),
    ...(input.project_title ? { project_title: input.project_title } : {}),
    ...(input.project_clip_order ? { project_clip_order: input.project_clip_order } : {}),
    source_title: input.source_title,
    begin_ms: input.begin_ms,
    end_ms: input.end_ms,
    selected_text: input.selected_text,
    output_file: input.output_file.replace(/\\/g, "/"),
    ...(input.project_output_file ? { project_output_file: input.project_output_file.replace(/\\/g, "/") } : {}),
    ...(input.local_asset_relative_path ? { local_asset_relative_path: input.local_asset_relative_path.replace(/\\/g, "/") } : {}),
    ...(input.source_video_manifest_path ? { source_video_manifest_path: input.source_video_manifest_path.replace(/\\/g, "/") } : {}),
    ...(input.transcript_path ? { transcript_path: input.transcript_path.replace(/\\/g, "/") } : {}),
    ...(input.srt_path ? { srt_path: input.srt_path.replace(/\\/g, "/") } : {}),
    ...(input.keyframes_path ? { keyframes_path: input.keyframes_path.replace(/\\/g, "/") } : {}),
    ...(input.cover_path ? { cover_path: input.cover_path.replace(/\\/g, "/") } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.fps !== undefined ? { fps: input.fps } : {}),
    ...(input.codec !== undefined ? { codec: input.codec } : {}),
    ...(input.file_size !== undefined ? { file_size: input.file_size } : {}),
    ...(input.content_hash ? { content_hash: input.content_hash } : {}),
    ...(input.transcript_segments ? { transcript_segments: input.transcript_segments } : {}),
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
