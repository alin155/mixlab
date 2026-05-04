import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveFfmpegRuntime } from "../../ffmpeg-core/src/index.ts";
import { resolveSourceVideoFilePath } from "../../library-fs/src/index.ts";
import {
  validateIndexCurrentPointer,
  validateLibraryCounts,
  validateLocalClipManifest,
  validateSourceVideoManifest,
  type IndexCurrentPointer,
  type LibraryCounts,
  type LocalClipManifest,
  type SourceVideoManifest
} from "../../protocol/src/index.ts";

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

export interface RunMixlabDoctorInput {
  library_root: string;
  now: string;
  env?: NodeJS.ProcessEnv;
}

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

async function checkLibraryCounts(libraryRoot: string): Promise<DoctorCheck> {
  const manifest = await readLibraryManifest(libraryRoot);

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

async function readSourceVideoManifests(input: {
  library_root: string;
}): Promise<Array<{ source_video_id: string; manifest?: SourceVideoManifest; error?: string }>> {
  const root = path.join(input.library_root, ".mixlab-library", "videos");
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

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

async function checkSourceVideoManifests(libraryRoot: string): Promise<DoctorCheck> {
  const records = await readSourceVideoManifests({ library_root: libraryRoot });
  const errors: string[] = [];

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

  return errors.length === 0
    ? check(
        "source-video-manifests",
        "Source Video Manifests",
        "pass",
        `${records.length} source video manifests are valid`
      )
    : check(
        "source-video-manifests",
        "Source Video Manifests",
        "fail",
        errors.join("; "),
        { error_count: errors.length }
      );
}

async function checkCurrentIndex(libraryRoot: string): Promise<DoctorCheck> {
  const library = await readLibraryManifest(libraryRoot);
  const readyVideoCount = library?.ready_video_count ?? 0;
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

    return (await fileExists(manifestPath))
      ? check("current-index", "Current Index", "pass", `current index is ${pointer.current_version}`)
      : check(
          "current-index",
          "Current Index",
          "fail",
          `current index manifest is missing for ${pointer.current_version}`
        );
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

  checks.push(await checkPublicRoot(input.library_root));
  checks.push(await checkSourceVideos(input.library_root));
  checks.push(await checkMixlabLibraryWritable(input.library_root));
  checks.push(await checkLibraryCounts(input.library_root));
  checks.push(await checkSourceVideoManifests(input.library_root));
  checks.push(await checkCurrentIndex(input.library_root));
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
