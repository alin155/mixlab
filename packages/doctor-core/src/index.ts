import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveFfmpegRuntime } from "../../ffmpeg-core/src/index.ts";
import { resolveSourceVideoFilePath } from "../../library-fs/src/index.ts";
import {
  validateIndexCurrentPointer,
  validateIndexPackageManifest,
  validateLibraryCounts,
  validateLocalClipManifest,
  validateSourceVideoManifest,
  type IndexCurrentPointer,
  type IndexPackageManifest,
  type LibraryCounts,
  type LocalClipManifest,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";
import { readSourceTranscriptSqliteIndexMetadata } from "../../search-sqlite/src/index.ts";

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  check_id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface MixlabDoctorReport {
  schema_version: "1.0";
  generated_at: string;
  library_root: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: DoctorCheck[];
}

export interface MixlabDoctorExport {
  file_name: string;
  relative_path: string;
  file_path: string;
  report: MixlabDoctorReport;
}

export interface RunMixlabDoctorInput {
  library_root: string;
  now: string;
  env?: NodeJS.ProcessEnv;
}

const DOCTOR_FULL_SCAN_MAX_SOURCE_VIDEOS = 500;
const DOCTOR_LARGE_LIBRARY_SAMPLE_COUNT = 8;

interface LibraryManifest extends LibraryCounts {
  library_id?: string;
  name?: string;
  version?: string;
  updated_at?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function check(
  check_id: string,
  label: string,
  status: DoctorCheckStatus,
  message: string,
  details?: Record<string, unknown>
): DoctorCheck {
  return details === undefined
    ? { check_id, label, status, message }
    : { check_id, label, status, message, details };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function directoryExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function isUnsafeRelativePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return (
    normalized.trim() === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").filter(Boolean).includes("..")
  );
}

function resolvePortableLibraryPath(libraryRoot: string, portablePath: string): string {
  const normalized = portablePath.replace(/\\/g, "/");

  if (normalized.startsWith("library://video/")) {
    return path.join(
      libraryRoot,
      ".mixlab-library",
      "videos",
      ...normalized.slice("library://video/".length).split("/").filter(Boolean)
    );
  }

  if (normalized.startsWith("library://.mixlab-library/")) {
    return path.join(
      libraryRoot,
      ".mixlab-library",
      ...normalized.slice("library://.mixlab-library/".length).split("/").filter(Boolean)
    );
  }

  if (normalized.startsWith("library://source-videos/")) {
    return path.join(
      libraryRoot,
      "source-videos",
      ...normalized.slice("library://source-videos/".length).split("/").filter(Boolean)
    );
  }

  if (normalized.startsWith("library://")) {
    throw new Error(`unsupported library URI: ${portablePath}`);
  }

  if (isUnsafeRelativePath(normalized)) {
    throw new Error(`unsafe library-relative path: ${portablePath}`);
  }

  return path.join(libraryRoot, ...normalized.split("/").filter(Boolean));
}

async function checkPublicRoot(libraryRoot: string): Promise<DoctorCheck> {
  return (await directoryExists(libraryRoot))
    ? check("public-root", "Public Library Root", "pass", "public library root is accessible")
    : check("public-root", "Public Library Root", "fail", "public library root is not accessible");
}

async function checkSourceVideos(libraryRoot: string): Promise<DoctorCheck> {
  try {
    await readdir(path.join(libraryRoot, "source-videos"));
    return check("source-videos-readable", "Source Videos", "pass", "source-videos is readable");
  } catch (error) {
    return check(
      "source-videos-readable",
      "Source Videos",
      "fail",
      `source-videos is not readable: ${(error as Error).message}`
    );
  }
}

async function checkMixlabLibraryWritable(libraryRoot: string): Promise<DoctorCheck> {
  const mixlabRoot = path.join(libraryRoot, ".mixlab-library");
  const probePath = path.join(mixlabRoot, `.doctor-write-test-${process.pid}-${Date.now()}`);

  try {
    await mkdir(mixlabRoot, { recursive: true });
    await writeFile(probePath, "ok", "utf8");
    await rm(probePath, { force: true });
    return check(
      "mixlab-library-writable",
      ".mixlab-library Writable",
      "pass",
      ".mixlab-library is writable"
    );
  } catch (error) {
    await rm(probePath, { force: true });
    return check(
      "mixlab-library-writable",
      ".mixlab-library Writable",
      "fail",
      `.mixlab-library is not writable: ${(error as Error).message}`
    );
  }
}

async function readLibraryManifest(libraryRoot: string): Promise<LibraryManifest | null> {
  try {
    return await readJson<LibraryManifest>(
      path.join(libraryRoot, ".mixlab-library", "library.json")
    );
  } catch {
    return null;
  }
}

async function checkLibraryCounts(
  libraryRoot: string,
  library?: LibraryManifest | null
): Promise<DoctorCheck> {
  const manifest = library === undefined ? await readLibraryManifest(libraryRoot) : library;

  if (!manifest) {
    return check("library-counts", "Library Counts", "fail", "library.json is missing or unreadable");
  }

  const validation = validateLibraryCounts(manifest);
  return validation.ok
    ? check("library-counts", "Library Counts", "pass", validation.message, {
        video_count: manifest.video_count,
        ready_video_count: manifest.ready_video_count,
        failed_video_count: manifest.failed_video_count,
        index_required_video_count: manifest.index_required_video_count
      })
    : check("library-counts", "Library Counts", "fail", validation.message);
}

function useLargeLibraryDoctorMode(library: LibraryManifest | null): boolean {
  return (library?.video_count ?? 0) > DOCTOR_FULL_SCAN_MAX_SOURCE_VIDEOS;
}

function expectedPreprocessLogCount(library: LibraryManifest | null): number {
  if (!library) {
    return 0;
  }

  return Math.max(
    0,
    library.ready_video_count +
      library.queued_video_count +
      library.processing_video_count +
      library.failed_video_count +
      library.index_required_video_count
  );
}

function evenlySample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }

  if (limit <= 1) {
    return items.slice(0, 1);
  }

  const sampled = new Map<number, T>();
  const lastIndex = items.length - 1;

  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * lastIndex) / (limit - 1));
    sampled.set(sourceIndex, items[sourceIndex]!);
  }

  return Array.from(sampled.entries())
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item);
}

async function readSourceVideoManifests(input: {
  library_root: string;
  sample_limit?: number;
}): Promise<Array<{ source_video_id: string; manifest?: SourceVideoManifest; error?: string }>> {
  const root = path.join(input.library_root, ".mixlab-library", "videos");
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];
  const sourceVideoEntries = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedEntries = input.sample_limit
    ? evenlySample(sourceVideoEntries, input.sample_limit)
    : sourceVideoEntries;

  for (const entry of selectedEntries) {
    try {
      result.push({
        source_video_id: entry.name,
        manifest: await readJson<SourceVideoManifest>(
          path.join(root, entry.name, "source-video.json")
        )
      });
    } catch (error) {
      result.push({
        source_video_id: entry.name,
        error: (error as Error).message
      });
    }
  }

  return result;
}

async function checkSourceVideoManifests(
  libraryRoot: string,
  library: LibraryManifest | null
): Promise<DoctorCheck> {
  const largeLibraryMode = useLargeLibraryDoctorMode(library);
  const records = await readSourceVideoManifests({
    library_root: libraryRoot,
    sample_limit: largeLibraryMode ? DOCTOR_LARGE_LIBRARY_SAMPLE_COUNT : undefined
  });
  const totalCount = library?.video_count ?? records.length;
  const errors: string[] = [];

  if (records.length === 0 && totalCount > 0) {
    errors.push("source video manifest samples are missing");
  }

  for (const record of records) {
    if (!record.manifest) {
      errors.push(`${record.source_video_id}: ${record.error ?? "manifest is unreadable"}`);
      continue;
    }

    const manifest = record.manifest;
    const validation = validateSourceVideoManifest(manifest);

    for (const error of validation.errors) {
      errors.push(`${manifest.source_video_id}: ${error}`);
    }

    if (!largeLibraryMode) {
      const sourcePath = await resolveSourceVideoFilePath(libraryRoot, manifest);

      if (!(await fileExists(sourcePath))) {
        errors.push(`${manifest.source_video_id}: source video file is missing`);
      }

      if (manifest.preprocess_status === "ready") {
        for (const [label, portablePath] of Object.entries({
          transcript: manifest.transcript_path,
          srt: manifest.srt_path,
          keyframes: manifest.keyframes_path,
          cover: manifest.cover_path
        })) {
          try {
            const artifactPath = resolvePortableLibraryPath(libraryRoot, portablePath);
            if (!(await fileExists(artifactPath))) {
              errors.push(`${manifest.source_video_id}: ${label} artifact is missing at ${portablePath}`);
            }
          } catch (error) {
            errors.push(`${manifest.source_video_id}: ${label} path is invalid: ${(error as Error).message}`);
          }
        }
      }
    }
  }

  const details = largeLibraryMode
    ? {
        mode: "sample",
        checked_count: records.length,
        total_count: totalCount,
        sample_limit: DOCTOR_LARGE_LIBRARY_SAMPLE_COUNT,
        file_existence_check: "skipped"
      }
    : undefined;

  return errors.length === 0
    ? check(
        "source-video-manifests",
        "Source Video Manifests",
        "pass",
        largeLibraryMode
          ? `${records.length} sampled source video manifests are valid in large-library mode`
          : `${records.length} source video manifests are valid`,
        details
      )
    : check(
        "source-video-manifests",
        "Source Video Manifests",
        "fail",
        errors.join("; "),
        {
          ...(details ?? {}),
          error_count: errors.length
        }
      );
}

async function checkCurrentIndex(
  libraryRoot: string,
  library?: LibraryManifest | null
): Promise<DoctorCheck> {
  const manifest = library === undefined ? await readLibraryManifest(libraryRoot) : library;
  const readyVideoCount = manifest?.ready_video_count ?? 0;
  const currentPath = path.join(
    libraryRoot,
    ".mixlab-library",
    "indexes",
    "source-transcript-index",
    "current.json"
  );

  try {
    const pointer = await readJson<IndexCurrentPointer>(currentPath);
    const indexRoot = path.dirname(currentPath);
    const entries = await readdir(indexRoot, { withFileTypes: true });
    const publishedVersions = entries
      .filter((entry) => entry.isDirectory() && /^v\d{6}$/.test(entry.name))
      .map((entry) => entry.name);
    const validation = validateIndexCurrentPointer(pointer, publishedVersions);

    if (!validation.ok) {
      return check("current-index", "Current Index", "fail", validation.errors.join("; "));
    }

    const manifestPath = path.join(
      libraryRoot,
      ".mixlab-library",
      "indexes",
      "source-transcript-index",
      pointer.current_version,
      "index-manifest.json"
    );
    const sqlitePath = path.join(path.dirname(manifestPath), "index.sqlite");
    const messages: string[] = [];
    let manifest: IndexPackageManifest | null = null;

    try {
      manifest = await readJson<IndexPackageManifest>(manifestPath);
      const manifestValidation = validateIndexPackageManifest(manifest);

      if (!manifestValidation.ok) {
        messages.push(...manifestValidation.errors);
      }

      if (manifest.index_version !== pointer.current_version) {
        messages.push("index-manifest.json version does not match current.json");
      }
    } catch {
      messages.push("index-manifest.json is missing or unreadable");
    }

    if (!(await fileExists(sqlitePath))) {
      messages.push("index.sqlite is missing");
    } else {
      try {
        const metadata = readSourceTranscriptSqliteIndexMetadata(sqlitePath);

        if (metadata.index_version !== pointer.current_version) {
          messages.push("index.sqlite metadata version does not match current.json");
        }

        if (
          manifest &&
          metadata.source_video_count !== manifest.ready_video_count
        ) {
          messages.push("index.sqlite video count does not match index-manifest.json");
        }
      } catch {
        messages.push("index.sqlite is unreadable");
      }
    }

    return messages.length === 0
      ? check("current-index", "Current Index", "pass", "current index package is valid", {
          current_version: pointer.current_version,
          ready_video_count: manifest?.ready_video_count ?? 0
        })
      : check("current-index", "Current Index", "fail", messages.join("; "), {
          current_version: pointer.current_version,
          error_count: messages.length
        });
  } catch (error) {
    return readyVideoCount > 0
      ? check(
          "current-index",
          "Current Index",
          "fail",
          `current index is required when ready_video_count is ${readyVideoCount}: ${(error as Error).message}`
        )
      : check("current-index", "Current Index", "warn", "current index is not available yet");
  }
}

async function checkPreprocessLogsWritable(libraryRoot: string): Promise<DoctorCheck> {
  const logsRoot = path.join(libraryRoot, ".mixlab-library", "logs");
  const probePath = path.join(logsRoot, `.doctor-log-write-test-${process.pid}-${Date.now()}`);

  try {
    await mkdir(logsRoot, { recursive: true });
    await writeFile(probePath, "ok", "utf8");
    await rm(probePath, { force: true });
    return check(
      "preprocess-logs-writable",
      "Preprocess Logs Writable",
      "pass",
      "preprocess log directory is writable"
    );
  } catch (error) {
    await rm(probePath, { force: true });
    return check(
      "preprocess-logs-writable",
      "Preprocess Logs Writable",
      "fail",
      `preprocess log directory is not writable: ${(error as Error).message}`
    );
  }
}

async function checkPreprocessLogs(
  libraryRoot: string,
  library: LibraryManifest | null
): Promise<DoctorCheck> {
  const logRoot = path.join(libraryRoot, ".mixlab-library", "logs");
  const errors: string[] = [];
  let logFileCount = 0;
  const largeLibraryMode = useLargeLibraryDoctorMode(library);
  const expectedLogCount = expectedPreprocessLogCount(library);

  try {
    const entries = await readdir(logRoot, { withFileTypes: true });
    logFileCount = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".log")).length;
  } catch (error) {
    if (expectedLogCount > 0) {
      return check(
        "preprocess-logs",
        "Preprocess Logs",
        "warn",
        `preprocess logs are not readable: ${(error as Error).message}`,
        {
          ...(largeLibraryMode ? { mode: "summary" } : {}),
          expected_log_count: expectedLogCount
        }
      );
    }
  }

  if (largeLibraryMode) {
    return check(
      "preprocess-logs",
      "Preprocess Logs",
      "pass",
      "preprocess log directory is readable in large-library mode",
      {
        mode: "summary",
        log_file_count: logFileCount,
        expected_log_count: expectedLogCount
      }
    );
  }

  const records = await readSourceVideoManifests({ library_root: libraryRoot });
  const expected = records.filter((record) =>
    record.manifest && record.manifest.preprocess_status !== "unprocessed"
  );

  for (const record of expected) {
    const sourceVideoId = record.manifest?.source_video_id ?? record.source_video_id;
    const logPath = path.join(logRoot, `${sourceVideoId}.log`);

    try {
      const content = await readFile(logPath, "utf8");
      if (content.trim() === "") {
        errors.push(`preprocess log is empty for ${sourceVideoId}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        errors.push(`preprocess logs are missing for ${sourceVideoId}`);
      } else {
        errors.push(`preprocess logs are not readable for ${sourceVideoId}: ${(error as Error).message}`);
      }
    }
  }

  if (expected.length === 0) {
    return check("preprocess-logs", "Preprocess Logs", "pass", "no preprocess logs required yet", {
      log_file_count: logFileCount,
      expected_log_count: 0
    });
  }

  return errors.length === 0
    ? check("preprocess-logs", "Preprocess Logs", "pass", "preprocess logs are readable", {
        log_file_count: logFileCount,
        expected_log_count: expected.length
      })
    : check("preprocess-logs", "Preprocess Logs", "warn", errors.join("; "), {
        log_file_count: logFileCount,
        expected_log_count: expected.length,
        error_count: errors.length
      });
}

async function checkFfmpegRuntime(): Promise<DoctorCheck[]> {
  try {
    const runtime = resolveFfmpegRuntime();
    return [
      (await fileExists(runtime.ffmpeg_path))
        ? check("ffmpeg", "FFmpeg", "pass", `ffmpeg is available from ${runtime.source}`)
        : check("ffmpeg", "FFmpeg", "fail", "ffmpeg path does not exist"),
      (await fileExists(runtime.ffprobe_path))
        ? check("ffprobe", "FFprobe", "pass", `ffprobe is available from ${runtime.source}`)
        : check("ffprobe", "FFprobe", "fail", "ffprobe path does not exist")
    ];
  } catch (error) {
    return [
      check("ffmpeg", "FFmpeg", "fail", (error as Error).message),
      check("ffprobe", "FFprobe", "fail", (error as Error).message)
    ];
  }
}

function checkAsrConfig(env: NodeJS.ProcessEnv): DoctorCheck {
  const configured = typeof env.DASHSCOPE_API_KEY === "string" && env.DASHSCOPE_API_KEY.trim() !== "";
  const model = env.MIXLAB_ASR_MODEL || "paraformer-v2";

  if (!configured) {
    return check("asr-config", "ASR Config", "warn", "DashScope API key is not configured", {
      dashscope_api_key_configured: false,
      asr_model: model
    });
  }

  if (model !== "paraformer-v2") {
    return check("asr-config", "ASR Config", "warn", `unexpected ASR model: ${model}`, {
      dashscope_api_key_configured: true,
      asr_model: model
    });
  }

  return check("asr-config", "ASR Config", "pass", "DashScope ASR config is present", {
    dashscope_api_key_configured: true,
    asr_model: model
  });
}

async function checkLocalClips(libraryRoot: string): Promise<DoctorCheck> {
  const root = path.join(libraryRoot, ".mixlab-library", "local-clips");
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return check("local-clips", "Local Clips", "pass", "no local clips found");
  }

  const errors: string[] = [];
  let checkedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const clipId = entry.name;
    const manifestPath = path.join(root, clipId, "local-clip.json");
    checkedCount += 1;

    try {
      const raw = await readJson<unknown>(manifestPath);
      if (!isRecord(raw)) {
        errors.push(`${clipId}: local-clip.json must be an object`);
        continue;
      }

      const validation = validateLocalClipManifest(raw as unknown as LocalClipManifest);
      if (!validation.ok) {
        errors.push(`${clipId}: ${validation.errors.join(", ")}`);
        continue;
      }

      const manifest = raw as unknown as LocalClipManifest;
      const mediaPath = resolvePortableLibraryPath(libraryRoot, manifest.media_path);
      if (!(await fileExists(mediaPath))) {
        errors.push(`${clipId}: media file is missing at ${manifest.media_path}`);
      }
    } catch (error) {
      errors.push(`${clipId}: ${(error as Error).message}`);
    }
  }

  return errors.length === 0
    ? check("local-clips", "Local Clips", "pass", `${checkedCount} local clip manifests are valid`)
    : check("local-clips", "Local Clips", "warn", errors.join("; "), {
        error_count: errors.length
      });
}

function summarize(checks: DoctorCheck[]): MixlabDoctorReport["summary"] {
  return {
    pass: checks.filter((item) => item.status === "pass").length,
    warn: checks.filter((item) => item.status === "warn").length,
    fail: checks.filter((item) => item.status === "fail").length
  };
}

export async function runMixlabDoctor(
  input: RunMixlabDoctorInput
): Promise<MixlabDoctorReport> {
  const checks: DoctorCheck[] = [];
  const library = await readLibraryManifest(input.library_root);

  checks.push(await checkPublicRoot(input.library_root));
  checks.push(await checkSourceVideos(input.library_root));
  checks.push(await checkMixlabLibraryWritable(input.library_root));
  checks.push(await checkPreprocessLogsWritable(input.library_root));
  checks.push(await checkLibraryCounts(input.library_root, library));
  checks.push(await checkSourceVideoManifests(input.library_root, library));
  checks.push(await checkCurrentIndex(input.library_root, library));
  checks.push(await checkPreprocessLogs(input.library_root, library));
  checks.push(...(await checkFfmpegRuntime()));
  checks.push(checkAsrConfig(input.env ?? process.env));
  checks.push(await checkLocalClips(input.library_root));

  return {
    schema_version: "1.0",
    generated_at: input.now,
    library_root: input.library_root,
    summary: summarize(checks),
    checks
  };
}

function safeDoctorTimestamp(value: string): string {
  return value.replaceAll(/[:\s]/g, "-").replaceAll(/[^A-Za-z0-9_.-]/g, "-");
}

export async function exportMixlabDoctorReport(
  input: RunMixlabDoctorInput
): Promise<MixlabDoctorExport> {
  const report = await runMixlabDoctor(input);
  const fileName = `mixlab-doctor-${safeDoctorTimestamp(report.generated_at)}.json`;
  const relativePath = [".mixlab-library", "exports", "doctor", fileName].join("/");
  const filePath = path.join(input.library_root, relativePath);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return {
    file_name: fileName,
    relative_path: relativePath,
    file_path: filePath,
    report
  };
}
