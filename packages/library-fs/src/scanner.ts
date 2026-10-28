import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { LibraryCounts, PreprocessStatus, SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  readAdminSettings,
  writeAdminSettings,
  type AdminSourceFolder
} from "./admin-settings.ts";
import { stripTrailingNulls, writeJsonFileAtomically } from "./atomic-json.ts";

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".mkv",
  ".m4v",
  ".avi",
  ".webm",
  ".mts",
  ".m2ts"
]);
const MPEG_TRANSPORT_STREAM_EXTENSIONS = new Set([".mts", ".m2ts"]);
const MIN_MPEG_TRANSPORT_STREAM_BYTES = 1024 * 1024;

export interface ScanSourceVideosInput {
  library_root: string;
  library_id: string;
  library_name: string;
  now: string;
  on_progress?(progress: SourceVideoScanProgress): Promise<void> | void;
}

export interface SourceVideoScanProgress {
  stage: "listing" | "indexing" | "writing" | "completed";
  current_source_folder_id: string;
  current_source_folder_name: string;
  scanned_folder_count: number;
  total_source_folder_count: number;
  discovered_video_count: number;
  indexed_file_count: number;
  new_video_count: number;
  existing_video_count: number;
  written_video_count: number;
  total_video_count: number;
  updated_at: string;
}

export interface ScanSourceVideosResult {
  total_video_count: number;
  new_video_count: number;
  existing_video_count: number;
  source_video_ids: string[];
}

export interface ScanNewSourceVideosResult extends ScanSourceVideosResult {
  scan_mode: "additive-source-folder-scan";
  inactive_manifest_count: number;
  inactive_ready_count: number;
  protected_inactive_source_video_ids: string[];
}

export type SourceVideoScanBlockerCode = "ready-manifest-removal";

export interface SourceVideoScanBlocker {
  code: SourceVideoScanBlockerCode;
  message: string;
  source_video_ids: string[];
}

export interface SourceVideoScanPreviewResult extends ScanSourceVideosResult {
  scan_mode: "full-source-folder-scan";
  inactive_manifest_count: number;
  inactive_ready_count: number;
  inactive_source_video_ids: string[];
  inactive_ready_source_video_ids: string[];
  skipped_source_folder_ids: string[];
  blocked: boolean;
  blockers: SourceVideoScanBlocker[];
}

interface InvalidExistingManifest {
  directory_name: string;
  manifest_path: string;
  reason: string;
}

interface ExistingManifestIndex {
  byRelativePath: Map<string, SourceVideoManifest>;
  manifests: SourceVideoManifest[];
  maxNumericId: number;
  invalid_manifests: InvalidExistingManifest[];
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

interface SourceVideoScanPlan extends ScanSourceVideosResult {
  manifests: SourceVideoManifest[];
  new_manifests: SourceVideoManifest[];
  active_source_video_ids: Set<string>;
  inactive_manifests: SourceVideoManifest[];
  invalid_manifests: InvalidExistingManifest[];
  folder_stats: Map<string, SourceFolderScanStats>;
  skipped_source_folder_ids: Set<string>;
}

function mixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

function videosRoot(libraryRoot: string): string {
  return path.join(mixlabRoot(libraryRoot), "videos");
}

function sourceVideosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "source-videos");
}

function toLibraryRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

const SOURCE_VIDEO_ID_PATTERN = /^V\d{6}$/;
const PROTECTED_INACTIVE_PRUNE_STATUSES: ReadonlySet<PreprocessStatus> = new Set<PreprocessStatus>([
  "processing",
  "queued",
  "index-required"
]);
const MANIFEST_ARTIFACT_PATH_FIELDS = [
  "transcript_path",
  "srt_path",
  "keyframes_path",
  "cover_path"
] as const;

function scanAuditLog(event: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    component: "library-fs.scanner",
    event,
    ...details
  }));
}

export function isValidSourceVideoId(value: unknown): value is string {
  return typeof value === "string" && SOURCE_VIDEO_ID_PATTERN.test(value);
}

export function assertValidSourceVideoId(
  value: unknown,
  label = "素材 ID"
): asserts value is string {
  if (!isValidSourceVideoId(value)) {
    throw new Error(`${label}格式无效，必须是 V000001 形式`);
  }
}

export function isSafeLibraryRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\u0000")) {
    return false;
  }

  const normalized = value.replace(/\\/g, "/");

  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }

  return !normalized.split("/").filter(Boolean).includes("..");
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreprocessStatusValue(value: unknown): value is PreprocessStatus {
  return (
    value === "unprocessed" ||
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed" ||
    value === "index-required"
  );
}

export function validateStoredSourceVideoManifest(value: unknown): SourceVideoManifest {
  if (!isRecordValue(value)) {
    throw new Error("素材清单必须是对象");
  }

  if (!isValidSourceVideoId(value.source_video_id)) {
    throw new Error("素材清单 source_video_id 格式无效");
  }

  if (!isSafeLibraryRelativePath(value.relative_path)) {
    throw new Error("素材清单 relative_path 必须是素材库内相对路径");
  }

  if (!isPreprocessStatusValue(value.preprocess_status)) {
    throw new Error("素材清单 preprocess_status 无效");
  }

  if (
    value.visible_to_cutters !== undefined &&
    typeof value.visible_to_cutters !== "boolean"
  ) {
    throw new Error("素材清单 visible_to_cutters 必须是布尔值");
  }

  for (const field of MANIFEST_ARTIFACT_PATH_FIELDS) {
    const artifactPath = value[field];

    if (artifactPath === undefined) {
      continue;
    }

    if (typeof artifactPath !== "string") {
      throw new Error(`素材清单 ${field} 必须是字符串`);
    }

    if (artifactPath.trim() !== "" && !isSafeLibraryRelativePath(artifactPath)) {
      throw new Error(`素材清单 ${field} 必须是素材库内相对路径`);
    }
  }

  const sourceFolderId = value.source_folder_id;
  if (
    sourceFolderId !== undefined &&
    sourceFolderId !== "src_default" &&
    !(typeof sourceFolderId === "string" && /^src_\d+$/.test(sourceFolderId))
  ) {
    throw new Error("素材清单 source_folder_id 无效");
  }

  const sourceFolderRelativePath = value.source_folder_relative_path;
  if (
    sourceFolderRelativePath !== undefined &&
    (
      typeof sourceFolderRelativePath !== "string" ||
      (
        sourceFolderRelativePath.trim() !== "" &&
        !isSafeLibraryRelativePath(sourceFolderRelativePath)
      )
    )
  ) {
    throw new Error("素材清单 source_folder_relative_path 必须是素材库内相对路径");
  }

  return value as unknown as SourceVideoManifest;
}

export function parseStoredSourceVideoManifest(text: string): SourceVideoManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripTrailingNulls(text));
  } catch {
    throw new Error("素材清单文件 JSON 格式无效");
  }

  return validateStoredSourceVideoManifest(parsed);
}

export function isLibraryPathInside(libraryRoot: string, targetPath: string): boolean {
  const root = path.resolve(libraryRoot);
  const target = path.resolve(targetPath);
  const relativePath = path.relative(root, target);

  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

async function escapesLibraryThroughSymlink(
  libraryRoot: string,
  targetPath: string
): Promise<boolean> {
  const root = path.resolve(libraryRoot);
  let realRoot: string;

  try {
    realRoot = await realpath(root);
  } catch {
    // Best effort: when the library root itself cannot be resolved, keep the lexical check only.
    return false;
  }

  let ancestorPath = path.resolve(targetPath);
  const missingParts: string[] = [];

  for (;;) {
    try {
      const realAncestor = await realpath(ancestorPath);
      const realTarget = missingParts.length === 0
        ? realAncestor
        : path.join(realAncestor, ...[...missingParts].reverse());
      const relativePath = path.relative(realRoot, realTarget);

      return (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return false;
      }

      const parentPath = path.dirname(ancestorPath);
      if (parentPath === ancestorPath) {
        return false;
      }

      missingParts.push(path.basename(ancestorPath));
      ancestorPath = parentPath;
    }
  }
}

export async function assertLibraryPathInside(
  libraryRoot: string,
  targetPath: string,
  label: string
): Promise<void> {
  if (!isLibraryPathInside(libraryRoot, targetPath)) {
    throw new Error(`${label}超出素材库范围，已阻止操作`);
  }

  if (await escapesLibraryThroughSymlink(libraryRoot, targetPath)) {
    throw new Error(`${label}通过符号链接指向素材库外，已阻止操作`);
  }
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

async function isVideoPath(filePath: string): Promise<boolean> {
  if (path.basename(filePath).startsWith("._")) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension)) {
    return false;
  }

  if (!MPEG_TRANSPORT_STREAM_EXTENSIONS.has(extension)) {
    return true;
  }

  return (await stat(filePath)).size >= MIN_MPEG_TRANSPORT_STREAM_BYTES;
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
    } else if (entry.isFile() && await isVideoPath(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readExistingManifests(libraryRoot: string): Promise<ExistingManifestIndex> {
  const root = videosRoot(libraryRoot);
  const byRelativePath = new Map<string, SourceVideoManifest>();
  const manifests: SourceVideoManifest[] = [];
  const invalidManifests: InvalidExistingManifest[] = [];
  let maxNumericId = 0;

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return { byRelativePath, manifests, maxNumericId, invalid_manifests: invalidManifests };
  }

  for (const entry of entries) {
    // Hidden entries include quarantine folders and in-progress temp folders; they never carry
    // an active source-video manifest and must not be treated as source video directories.
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const manifestPath = path.join(root, entry.name, "source-video.json");
    let raw: string;

    try {
      raw = await readFile(manifestPath, "utf8");
    } catch {
      // Directories without a manifest are not source video directories; skip them silently.
      continue;
    }

    try {
      const manifest = parseStoredSourceVideoManifest(raw);
      byRelativePath.set(manifest.relative_path, manifest);
      manifests.push(manifest);
      maxNumericId = Math.max(maxNumericId, numericSourceVideoId(manifest.source_video_id));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "素材清单格式无效";
      scanAuditLog("scan.invalid_manifest_skipped", { directory_name: entry.name, reason });

      // Malformed JSON is likely a transient write on the shared library; skip it without moving
      // the directory. Structurally unsafe manifests are collected for quarantine by full scans.
      if (!reason.includes("JSON 格式无效")) {
        invalidManifests.push({
          directory_name: entry.name,
          manifest_path: toLibraryRelativePath(libraryRoot, manifestPath),
          reason
        });
      }
    }
  }

  return { byRelativePath, manifests, maxNumericId, invalid_manifests: invalidManifests };
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
  assertValidSourceVideoId(manifest.source_video_id);
  const targetDir = path.join(videosRoot(libraryRoot), manifest.source_video_id);
  await assertLibraryPathInside(libraryRoot, targetDir, "素材清单目录");
  await mkdir(targetDir, { recursive: true });
  await writeJsonFileAtomically(path.join(targetDir, "source-video.json"), manifest);
}

async function quarantineInvalidManifestDirectories(input: {
  library_root: string;
  invalid_manifests: InvalidExistingManifest[];
}): Promise<void> {
  if (input.invalid_manifests.length === 0) {
    return;
  }

  const root = videosRoot(input.library_root);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const quarantineRoot = path.join(root, `.quarantine-${timestamp}`);
  const quarantinedEntries: Array<{
    directory_name: string;
    reason: string;
    quarantined_to: string;
  }> = [];

  try {
    await mkdir(quarantineRoot, { recursive: true });
  } catch (error) {
    scanAuditLog("scan.quarantine_unavailable", {
      reason: error instanceof Error ? error.message : "unknown"
    });
    return;
  }

  for (const invalidManifest of input.invalid_manifests) {
    const sourceDirectory = path.join(root, invalidManifest.directory_name);
    const targetDirectory = path.join(quarantineRoot, invalidManifest.directory_name);

    try {
      if (path.dirname(path.resolve(sourceDirectory)) !== path.resolve(root)) {
        throw new Error("素材清单目录不是 videos 根目录的直接子目录");
      }

      await assertLibraryPathInside(input.library_root, sourceDirectory, "隔离素材清单目录");
      await rename(sourceDirectory, targetDirectory);
      const quarantinedTo = toLibraryRelativePath(input.library_root, targetDirectory);
      quarantinedEntries.push({
        directory_name: invalidManifest.directory_name,
        reason: invalidManifest.reason,
        quarantined_to: quarantinedTo
      });
      scanAuditLog("scan.invalid_manifest_quarantined", {
        directory_name: invalidManifest.directory_name,
        reason: invalidManifest.reason,
        quarantined_to: quarantinedTo
      });
    } catch (error) {
      // Never delete data: if the directory cannot be isolated it is left untouched and logged.
      scanAuditLog("scan.invalid_manifest_quarantine_failed", {
        directory_name: invalidManifest.directory_name,
        reason: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  if (quarantinedEntries.length > 0) {
    await writeJsonFileAtomically(path.join(quarantineRoot, "quarantine.json"), {
      schema_version: "1.0",
      quarantined_at: new Date().toISOString(),
      entries: quarantinedEntries
    }).catch(() => {
      // Best effort audit sidecar; the JSON audit log above is authoritative.
    });
  }
}

async function pruneInactiveManifestDirectories(input: {
  library_root: string;
  existing_manifests: SourceVideoManifest[];
  active_source_video_ids: Set<string>;
}): Promise<void> {
  const root = videosRoot(input.library_root);

  for (const manifest of input.existing_manifests) {
    if (input.active_source_video_ids.has(manifest.source_video_id)) {
      continue;
    }

    if (
      PROTECTED_INACTIVE_PRUNE_STATUSES.has(manifest.preprocess_status) ||
      manifest.visible_to_cutters === true
    ) {
      scanAuditLog("scan.prune_skipped_protected", {
        source_video_id: manifest.source_video_id,
        preprocess_status: manifest.preprocess_status
      });
      continue;
    }

    if (!isValidSourceVideoId(manifest.source_video_id)) {
      scanAuditLog("scan.prune_skipped_invalid_id", {
        source_video_id: String(manifest.source_video_id)
      });
      continue;
    }

    const targetPath = path.join(root, manifest.source_video_id);
    const relativePath = toLibraryRelativePath(input.library_root, targetPath);

    try {
      if (path.dirname(path.resolve(targetPath)) !== path.resolve(root)) {
        throw new Error("清理目标不是 videos 根目录的直接子目录");
      }

      await assertLibraryPathInside(input.library_root, targetPath, "扫描清理目标");
      const targetStat = await lstat(targetPath);

      if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
        scanAuditLog("scan.prune_skipped_non_directory", {
          source_video_id: manifest.source_video_id,
          relative_path: relativePath
        });
        continue;
      }
    } catch (error) {
      scanAuditLog("scan.prune_skipped_unsafe_path", {
        source_video_id: manifest.source_video_id,
        relative_path: relativePath,
        reason: error instanceof Error ? error.message : "unknown"
      });
      continue;
    }

    scanAuditLog("scan.prune_delete", {
      source_video_id: manifest.source_video_id,
      relative_path: relativePath,
      preprocess_status: manifest.preprocess_status
    });
    await rm(targetPath, { recursive: true, force: true });
  }
}

function sortSourceVideoIds(sourceVideoIds: string[]): string[] {
  return [...sourceVideoIds].sort(
    (left, right) => numericSourceVideoId(left) - numericSourceVideoId(right)
  );
}

function scanBlockers(plan: SourceVideoScanPlan): SourceVideoScanBlocker[] {
  const inactiveReadyIds = sortSourceVideoIds(
    plan.inactive_manifests
      .filter((manifest) => manifest.preprocess_status === "ready")
      .map((manifest) => manifest.source_video_id)
  );

  if (inactiveReadyIds.length === 0) {
    return [];
  }

  return [{
    code: "ready-manifest-removal",
    message: `扫描结果会移除 ${inactiveReadyIds.length} 个已发布 ready 视频，已阻断以保护剪辑端生产数据。`,
    source_video_ids: inactiveReadyIds
  }];
}

function toScanPreviewResult(plan: SourceVideoScanPlan): SourceVideoScanPreviewResult {
  const inactiveSourceVideoIds = sortSourceVideoIds(
    plan.inactive_manifests.map((manifest) => manifest.source_video_id)
  );
  const inactiveReadySourceVideoIds = sortSourceVideoIds(
    plan.inactive_manifests
      .filter((manifest) => manifest.preprocess_status === "ready")
      .map((manifest) => manifest.source_video_id)
  );
  const blockers = scanBlockers(plan);

  return {
    scan_mode: "full-source-folder-scan",
    total_video_count: plan.total_video_count,
    new_video_count: plan.new_video_count,
    existing_video_count: plan.existing_video_count,
    source_video_ids: sortSourceVideoIds(plan.source_video_ids),
    inactive_manifest_count: inactiveSourceVideoIds.length,
    inactive_ready_count: inactiveReadySourceVideoIds.length,
    inactive_source_video_ids: inactiveSourceVideoIds,
    inactive_ready_source_video_ids: inactiveReadySourceVideoIds,
    skipped_source_folder_ids: [...plan.skipped_source_folder_ids].sort(),
    blocked: blockers.length > 0,
    blockers
  };
}

function assertScanPlanCanApply(plan: SourceVideoScanPlan): void {
  const blockers = scanBlockers(plan);

  if (blockers.length === 0) {
    return;
  }

  throw new Error(blockers.map((blocker) => blocker.message).join(" "));
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

  const libraryManifestPath = path.join(mixlabRoot(input.library_root), "library.json");
  await assertLibraryPathInside(input.library_root, libraryManifestPath, "素材库清单路径");
  await mkdir(mixlabRoot(input.library_root), { recursive: true });
  await writeJsonFileAtomically(libraryManifestPath, libraryManifest);
}

async function emitScanProgress(
  input: ScanSourceVideosInput,
  progress: Omit<SourceVideoScanProgress, "updated_at">
): Promise<void> {
  await input.on_progress?.({
    ...progress,
    updated_at: new Date().toISOString()
  });
}

async function buildSourceVideoScanPlan(input: ScanSourceVideosInput): Promise<SourceVideoScanPlan> {
  const scanFolders = await readEnabledScanFolders(input.library_root);
  const files: SourceFileRow[] = [];
  const folderStats = new Map<string, SourceFolderScanStats>();
  const skippedFolderIds = new Set<string>();
  let discoveredVideoCount = 0;

  for (const [folderIndex, folder] of scanFolders.entries()) {
    let folderFiles: string[] = [];
    await emitScanProgress(input, {
      stage: "listing",
      current_source_folder_id: folder.folder.id,
      current_source_folder_name: folder.folder.name,
      scanned_folder_count: folderIndex,
      total_source_folder_count: scanFolders.length,
      discovered_video_count: discoveredVideoCount,
      indexed_file_count: 0,
      new_video_count: 0,
      existing_video_count: 0,
      written_video_count: 0,
      total_video_count: 0
    });
    try {
      folderFiles = await listVideoFiles(folder.folder.path);
    } catch {
      skippedFolderIds.add(folder.folder.id);
      continue;
    }
    discoveredVideoCount += folderFiles.length;
    folderStats.set(folder.folder.id, {
      discovered_video_count: folderFiles.length,
      new_unprocessed_count: 0
    });
    files.push(...folderFiles.map((file_path) => ({ folder, file_path })));
    await emitScanProgress(input, {
      stage: "listing",
      current_source_folder_id: folder.folder.id,
      current_source_folder_name: folder.folder.name,
      scanned_folder_count: folderIndex + 1,
      total_source_folder_count: scanFolders.length,
      discovered_video_count: discoveredVideoCount,
      indexed_file_count: 0,
      new_video_count: 0,
      existing_video_count: 0,
      written_video_count: 0,
      total_video_count: 0
    });
  }

  assertUniqueSourceRelativePaths(files);

  const existing = await readExistingManifests(input.library_root);
  const manifests: SourceVideoManifest[] = [];
  const newManifests: SourceVideoManifest[] = [];
  let nextNumericId = existing.maxNumericId + 1;
  let newVideoCount = 0;
  let existingVideoCount = 0;

  for (const [rowIndex, row] of files.entries()) {
    const relativePath = toSourceFolderRelativePath(row);
    const sourceFolderRelativePath = toSourceFolderFileRelativePath(row);
    const existingManifest = existing.byRelativePath.get(relativePath);

    if (existingManifest) {
      manifests.push(existingManifest);
      existingVideoCount += 1;
      if ((rowIndex + 1) % 250 === 0) {
        await emitScanProgress(input, {
          stage: "indexing",
          current_source_folder_id: row.folder.folder.id,
          current_source_folder_name: row.folder.folder.name,
          scanned_folder_count: scanFolders.length,
          total_source_folder_count: scanFolders.length,
          discovered_video_count: discoveredVideoCount,
          indexed_file_count: rowIndex + 1,
          new_video_count: newVideoCount,
          existing_video_count: existingVideoCount,
          written_video_count: 0,
          total_video_count: files.length
        });
      }
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
    newManifests.push(manifest);
    manifests.push(manifest);
    if ((rowIndex + 1) % 250 === 0) {
      await emitScanProgress(input, {
        stage: "indexing",
        current_source_folder_id: row.folder.folder.id,
        current_source_folder_name: row.folder.folder.name,
        scanned_folder_count: scanFolders.length,
        total_source_folder_count: scanFolders.length,
        discovered_video_count: discoveredVideoCount,
        indexed_file_count: rowIndex + 1,
        new_video_count: newVideoCount,
        existing_video_count: existingVideoCount,
        written_video_count: 0,
        total_video_count: files.length
      });
    }
  }

  await emitScanProgress(input, {
    stage: "indexing",
    current_source_folder_id: "",
    current_source_folder_name: "",
    scanned_folder_count: scanFolders.length,
    total_source_folder_count: scanFolders.length,
    discovered_video_count: discoveredVideoCount,
    indexed_file_count: files.length,
    new_video_count: newVideoCount,
    existing_video_count: existingVideoCount,
    written_video_count: 0,
    total_video_count: files.length
  });

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

  const inactiveManifests = existing.manifests.filter(
    (manifest) => !includedSourceVideoIds.has(manifest.source_video_id)
  );

  return {
    total_video_count: manifests.length,
    new_video_count: newVideoCount,
    existing_video_count: existingVideoCount,
    source_video_ids: sortSourceVideoIds(manifests.map((manifest) => manifest.source_video_id)),
    manifests,
    new_manifests: newManifests,
    active_source_video_ids: includedSourceVideoIds,
    inactive_manifests: inactiveManifests,
    invalid_manifests: existing.invalid_manifests,
    folder_stats: folderStats,
    skipped_source_folder_ids: skippedFolderIds
  };
}

export async function previewSourceVideoScan(
  input: ScanSourceVideosInput
): Promise<SourceVideoScanPreviewResult> {
  return toScanPreviewResult(await buildSourceVideoScanPlan(input));
}

export async function scanSourceVideos(
  input: ScanSourceVideosInput
): Promise<ScanSourceVideosResult> {
  const plan = await buildSourceVideoScanPlan(input);
  assertScanPlanCanApply(plan);

  await assertLibraryPathInside(input.library_root, mixlabRoot(input.library_root), "素材库元数据目录");
  await assertLibraryPathInside(input.library_root, videosRoot(input.library_root), "素材清单根目录");
  await mkdir(videosRoot(input.library_root), { recursive: true });

  await quarantineInvalidManifestDirectories({
    library_root: input.library_root,
    invalid_manifests: plan.invalid_manifests
  });

  await pruneInactiveManifestDirectories({
    library_root: input.library_root,
    existing_manifests: plan.inactive_manifests,
    active_source_video_ids: plan.active_source_video_ids
  });

  for (const [index, manifest] of plan.manifests.entries()) {
    await writeSourceVideoManifest(input.library_root, manifest);
    if ((index + 1) % 250 === 0) {
      await emitScanProgress(input, {
        stage: "writing",
        current_source_folder_id: manifest.source_folder_id ?? "",
        current_source_folder_name: manifest.source_folder_id ?? "",
        scanned_folder_count: plan.folder_stats.size,
        total_source_folder_count: plan.folder_stats.size,
        discovered_video_count: plan.total_video_count,
        indexed_file_count: plan.total_video_count,
        new_video_count: plan.new_video_count,
        existing_video_count: plan.existing_video_count,
        written_video_count: index + 1,
        total_video_count: plan.total_video_count
      });
    }
  }

  await writeLibraryManifest({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: input.now,
    manifests: plan.manifests
  });

  await writeSourceFolderScanStats({
    library_root: input.library_root,
    now: input.now,
    stats: plan.folder_stats
  });

  await emitScanProgress(input, {
    stage: "completed",
    current_source_folder_id: "",
    current_source_folder_name: "",
    scanned_folder_count: plan.folder_stats.size,
    total_source_folder_count: plan.folder_stats.size,
    discovered_video_count: plan.total_video_count,
    indexed_file_count: plan.total_video_count,
    new_video_count: plan.new_video_count,
    existing_video_count: plan.existing_video_count,
    written_video_count: plan.total_video_count,
    total_video_count: plan.total_video_count
  });

  return {
    total_video_count: plan.total_video_count,
    new_video_count: plan.new_video_count,
    existing_video_count: plan.existing_video_count,
    source_video_ids: plan.source_video_ids
  };
}

export async function scanNewSourceVideos(
  input: ScanSourceVideosInput
): Promise<ScanNewSourceVideosResult> {
  const plan = await buildSourceVideoScanPlan(input);
  const preservedManifests = [...plan.manifests, ...plan.inactive_manifests];
  await assertLibraryPathInside(input.library_root, mixlabRoot(input.library_root), "素材库元数据目录");
  const preservedSourceVideoIds = sortSourceVideoIds(
    preservedManifests.map((manifest) => manifest.source_video_id)
  );
  const inactiveReadySourceVideoIds = sortSourceVideoIds(
    plan.inactive_manifests
      .filter((manifest) => manifest.preprocess_status === "ready")
      .map((manifest) => manifest.source_video_id)
  );

  await mkdir(videosRoot(input.library_root), { recursive: true });

  for (const [index, manifest] of plan.new_manifests.entries()) {
    await writeSourceVideoManifest(input.library_root, manifest);
    await emitScanProgress(input, {
      stage: "writing",
      current_source_folder_id: manifest.source_folder_id ?? "",
      current_source_folder_name: manifest.source_folder_id ?? "",
      scanned_folder_count: plan.folder_stats.size,
      total_source_folder_count: plan.folder_stats.size,
      discovered_video_count: plan.total_video_count,
      indexed_file_count: plan.total_video_count,
      new_video_count: plan.new_video_count,
      existing_video_count: plan.existing_video_count,
      written_video_count: index + 1,
      total_video_count: plan.total_video_count
    });
  }

  await writeLibraryManifest({
    library_root: input.library_root,
    library_id: input.library_id,
    library_name: input.library_name,
    now: input.now,
    manifests: preservedManifests
  });

  await writeSourceFolderScanStats({
    library_root: input.library_root,
    now: input.now,
    stats: plan.folder_stats
  });

  await emitScanProgress(input, {
    stage: "completed",
    current_source_folder_id: "",
    current_source_folder_name: "",
    scanned_folder_count: plan.folder_stats.size,
    total_source_folder_count: plan.folder_stats.size,
    discovered_video_count: plan.total_video_count,
    indexed_file_count: plan.total_video_count,
    new_video_count: plan.new_video_count,
    existing_video_count: plan.existing_video_count,
    written_video_count: plan.new_manifests.length,
    total_video_count: plan.total_video_count
  });

  return {
    scan_mode: "additive-source-folder-scan",
    total_video_count: preservedManifests.length,
    new_video_count: plan.new_video_count,
    existing_video_count: plan.existing_video_count + plan.inactive_manifests.length,
    source_video_ids: preservedSourceVideoIds,
    inactive_manifest_count: plan.inactive_manifests.length,
    inactive_ready_count: inactiveReadySourceVideoIds.length,
    protected_inactive_source_video_ids: inactiveReadySourceVideoIds
  };
}
