import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LibraryCounts, PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  readAdminSettings,
  writeAdminSettings,
  type AdminSourceFolder
} from "./admin-settings.ts";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".m4v", ".avi", ".webm"]);

export interface ScanSourceVideosInput {
  library_root: string;
  library_id: string;
  library_name: string;
  now: string;
}

export interface ScanSourceVideosResult {
  total_video_count: number;
  new_video_count: number;
  existing_video_count: number;
  source_video_ids: string[];
}

interface ExistingManifestIndex {
  byRelativePath: Map<string, SourceVideoManifest>;
  manifests: SourceVideoManifest[];
  maxNumericId: number;
}

interface ScanFolderRuntime {
  folder: AdminSourceFolder;
  is_default_source: boolean;
}

interface SourceFileRow {
  folder: ScanFolderRuntime;
  file_path: string;
}

interface SourceFolderScanStats {
  discovered_video_count: number;
  new_unprocessed_count: number;
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function videosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library", "videos");
}

function sourceVideosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "source-videos");
}

function toLibraryRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

async function readEnabledScanFolders(libraryRoot: string): Promise<ScanFolderRuntime[]> {
  const settings = await readAdminSettings(libraryRoot);
  return settings.source_folders
    .filter((folder) => folder.enabled)
    .map((folder) => ({
      folder,
      is_default_source:
        folder.id === "src_default" &&
        path.resolve(folder.path) === path.resolve(sourceVideosRoot(libraryRoot))
    }));
}

function toSourceFolderRelativePath(row: SourceFileRow): string {
  const relativePath = toSourceFolderFileRelativePath(row);
  return row.folder.is_default_source
    ? relativePath
    : `${row.folder.folder.id}/${relativePath}`;
}

function toSourceFolderFileRelativePath(row: SourceFileRow): string {
  return toLibraryRelativePath(row.folder.folder.path, row.file_path);
}

function assertUniqueSourceRelativePaths(files: SourceFileRow[]): void {
  const seen = new Set<string>();

  for (const row of files) {
    const relativePath = toSourceFolderRelativePath(row);

    if (seen.has(relativePath)) {
      throw new Error(`素材来源相对路径重复：${relativePath}`);
    }

    seen.add(relativePath);
  }
}

async function writeSourceFolderScanStats(input: {
  library_root: string;
  now: string;
  stats: Map<string, SourceFolderScanStats>;
}): Promise<void> {
  const settings = await readAdminSettings(input.library_root);
  await writeAdminSettings(input.library_root, {
    ...settings,
    source_folders: settings.source_folders.map((folder) => {
      const stats = input.stats.get(folder.id);
      return stats
        ? {
            ...folder,
            last_scanned_at: input.now,
            discovered_video_count: stats.discovered_video_count,
            new_unprocessed_count: stats.new_unprocessed_count
          }
        : folder;
    })
  });
}

function isVideoPath(filePath: string): boolean {
  if (path.basename(filePath).startsWith("._")) {
    return false;
  }

  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function formatSourceVideoId(value: number): string {
  return `V${value.toString().padStart(6, "0")}`;
}

function numericSourceVideoId(sourceVideoId: string): number {
  const match = /^V(\d{6})$/.exec(sourceVideoId);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function manifestSourceFolderId(manifest: SourceVideoManifest): string {
  return manifest.source_folder_id ?? "src_default";
}

async function listVideoFiles(root: string, current = root): Promise<string[]> {
  const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listVideoFiles(root, entryPath)));
    } else if (entry.isFile() && isVideoPath(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readExistingManifests(libraryRoot: string): Promise<ExistingManifestIndex> {
  const root = videosRoot(libraryRoot);
  const byRelativePath = new Map<string, SourceVideoManifest>();
  const manifests: SourceVideoManifest[] = [];
  let maxNumericId = 0;

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { byRelativePath, manifests, maxNumericId };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(root, entry.name, "source-video.json");

    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SourceVideoManifest;
      byRelativePath.set(manifest.relative_path, manifest);
      manifests.push(manifest);
      maxNumericId = Math.max(maxNumericId, numericSourceVideoId(manifest.source_video_id));
    } catch {
      // Ignore malformed existing manifests during scan; Doctor will report them later.
    }
  }

  return { byRelativePath, manifests, maxNumericId };
}

function emptyArtifactPath(): string {
  return "";
}

async function createUnprocessedManifest(input: {
  source_video_id: string;
  relative_path: string;
  source_folder_id: string;
  source_folder_relative_path: string;
  file_path: string;
}): Promise<SourceVideoManifest> {
  const fileStat = await stat(input.file_path);
  const title = path.basename(input.relative_path, path.extname(input.relative_path));

  return {
    source_video_id: input.source_video_id,
    title,
    relative_path: input.relative_path,
    source_folder_id: input.source_folder_id,
    source_folder_relative_path: input.source_folder_relative_path,
    logical_uri: `library://source-video/${input.source_video_id}`,
    duration_ms: 0,
    width: 0,
    height: 0,
    fps: 0,
    codec: "",
    file_size: fileStat.size,
    content_hash: `pending:size:${fileStat.size}`,
    preprocess_status: "unprocessed",
    visible_to_cutters: false,
    transcript_path: emptyArtifactPath(),
    srt_path: emptyArtifactPath(),
    keyframes_path: emptyArtifactPath(),
    cover_path: emptyArtifactPath()
  };
}

async function writeSourceVideoManifest(
  libraryRoot: string,
  manifest: SourceVideoManifest
): Promise<void> {
  const targetDir = path.join(videosRoot(libraryRoot), manifest.source_video_id);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, "source-video.json"), jsonBytes(manifest), "utf8");
}

async function pruneInactiveManifestDirectories(input: {
  library_root: string;
  existing_manifests: SourceVideoManifest[];
  active_source_video_ids: Set<string>;
}): Promise<void> {
  for (const manifest of input.existing_manifests) {
    if (input.active_source_video_ids.has(manifest.source_video_id)) {
      continue;
    }

    await rm(path.join(videosRoot(input.library_root), manifest.source_video_id), {
      recursive: true,
      force: true
    });
  }
}

function countByStatus(manifests: SourceVideoManifest[]): LibraryCounts {
  const counts: Record<PreprocessStatus, number> = {
    unprocessed: 0,
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    "index-required": 0
  };

  for (const manifest of manifests) {
    counts[manifest.preprocess_status] += 1;
  }

  return {
    video_count: manifests.length,
    ready_video_count: counts.ready,
    processing_video_count: counts.processing,
    queued_video_count: counts.queued,
    unprocessed_video_count: counts.unprocessed,
    failed_video_count: counts.failed,
    index_required_video_count: counts["index-required"]
  };
}

async function writeLibraryManifest(input: {
  library_root: string;
  library_id: string;
  library_name: string;
  now: string;
  manifests: SourceVideoManifest[];
}): Promise<void> {
  const counts = countByStatus(input.manifests);
  const libraryManifest = {
    library_id: input.library_id,
    name: input.library_name,
    version: "1.0",
    created_at: input.now,
    updated_at: input.now,
    source_root: "library://source-videos",
    preprocess_root: "library://.mixlab-library",
    source_video_ids: input.manifests
      .map((manifest) => manifest.source_video_id)
      .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right)),
    ...counts
  };

  await mkdir(path.join(input.library_root, ".mixlab-library"), { recursive: true });
  await writeFile(
    path.join(input.library_root, ".mixlab-library", "library.json"),
    jsonBytes(libraryManifest),
    "utf8"
  );
}

export async function scanSourceVideos(
  input: ScanSourceVideosInput
): Promise<ScanSourceVideosResult> {
  const scanFolders = await readEnabledScanFolders(input.library_root);
  const files: SourceFileRow[] = [];
  const folderStats = new Map<string, SourceFolderScanStats>();
  const skippedFolderIds = new Set<string>();

  for (const folder of scanFolders) {
    let folderFiles: string[] = [];
    try {
      folderFiles = await listVideoFiles(folder.folder.path);
    } catch {
      skippedFolderIds.add(folder.folder.id);
      continue;
    }
    folderStats.set(folder.folder.id, {
      discovered_video_count: folderFiles.length,
      new_unprocessed_count: 0
    });
    files.push(...folderFiles.map((file_path) => ({ folder, file_path })));
  }

  assertUniqueSourceRelativePaths(files);

  const existing = await readExistingManifests(input.library_root);
  const manifests: SourceVideoManifest[] = [];
  let nextNumericId = existing.maxNumericId + 1;
  let newVideoCount = 0;
  let existingVideoCount = 0;

  await mkdir(videosRoot(input.library_root), { recursive: true });

  for (const row of files) {
    const relativePath = toSourceFolderRelativePath(row);
    const sourceFolderRelativePath = toSourceFolderFileRelativePath(row);
    const existingManifest = existing.byRelativePath.get(relativePath);

    if (existingManifest) {
      manifests.push(existingManifest);
      existingVideoCount += 1;
      continue;
    }

    const manifest = await createUnprocessedManifest({
      source_video_id: formatSourceVideoId(nextNumericId),
      relative_path: relativePath,
      source_folder_id: row.folder.folder.id,
      source_folder_relative_path: sourceFolderRelativePath,
      file_path: row.file_path
    });

    const stats = folderStats.get(row.folder.folder.id);
    if (stats) {
      stats.new_unprocessed_count += 1;
    }

    nextNumericId += 1;
    newVideoCount += 1;
    manifests.push(manifest);
  }

  const includedSourceVideoIds = new Set(
    manifests.map((manifest) => manifest.source_video_id)
  );

  for (const manifest of existing.manifests) {
    if (
      skippedFolderIds.has(manifestSourceFolderId(manifest)) &&
      !includedSourceVideoIds.has(manifest.source_video_id)
    ) {
      manifests.push(manifest);
      includedSourceVideoIds.add(manifest.source_video_id);
      existingVideoCount += 1;
    }
  }

  await pruneInactiveManifestDirectories({
    library_root: input.library_root,
    existing_manifests: existing.manifests,
    active_source_video_ids: includedSourceVideoIds
  });

  for (const manifest of manifests) {
    await writeSourceVideoManifest(input.library_root, manifest);
  }

  await writeLibraryManifest({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: input.now,
    manifests
  });

  await writeSourceFolderScanStats({
    library_root: input.library_root,
    now: input.now,
    stats: folderStats
  });

  return {
    total_video_count: manifests.length,
    new_video_count: newVideoCount,
    existing_video_count: existingVideoCount,
    source_video_ids: manifests
      .map((manifest) => manifest.source_video_id)
      .sort((left, right) => numericSourceVideoId(left) - numericSourceVideoId(right))
  };
}
