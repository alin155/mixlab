import path from "node:path";

export interface CutterDesktopConfig {
  api_host: "127.0.0.1";
  api_port: 3789;
  public_library_root: string;
  local_workspace_root: string;
  log_root?: string;
  ffmpeg_path?: string;
  ffprobe_path?: string;
}

export interface DesktopRuntimeFsStat {
  kind: "directory" | "file";
}

export interface DesktopRuntimeFsLike {
  stat(pathValue: string): Promise<DesktopRuntimeFsStat>;
  canWrite?(pathValue: string): Promise<boolean>;
  countReadyMaterials?(publicLibraryRoot: string): Promise<number>;
}

export interface DesktopDoctorCheck {
  id: string;
  label: string;
  status: "pass" | "fail";
  message?: string;
}

export interface DesktopDoctorResult {
  status: "pass" | "fail";
  checks: DesktopDoctorCheck[];
}

export interface ValidateLocalWorkspaceInput {
  workspace_root: string;
  public_library_root: string;
  fs: DesktopRuntimeFsLike;
}

export interface DesktopDiagnosticsInput {
  app_version?: string;
  windows_version?: string;
  api_address?: string;
  public_library_root?: string;
  local_workspace_root?: string;
  ffmpeg_status?: string;
  doctor_result?: unknown;
  latest_error_summary?: string;
  transcript_excerpt?: string;
  env?: Record<string, string | undefined>;
}

export interface RedactedDesktopDiagnostics {
  app_version?: string;
  windows_version?: string;
  api_address?: string;
  public_library_root?: string;
  local_workspace_root?: string;
  ffmpeg_status?: string;
  doctor_result?: unknown;
  latest_error_summary?: string;
  env?: Record<string, string>;
}

function hasWindowsDrivePrefix(pathValue: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(pathValue);
}

function toBackslashes(pathValue: string): string {
  return pathValue.trim().replace(/\//g, "\\");
}

export function normalizeDesktopPathForStorage(pathValue: string): string {
  const trimmed = toBackslashes(pathValue);
  if (!trimmed) {
    return "";
  }

  if (isWindowsUncPath(trimmed) || hasWindowsDrivePrefix(trimmed)) {
    const normalized = path.win32.normalize(trimmed);
    return /^[a-zA-Z]:\\$/.test(normalized) ? normalized : normalized.replace(/\\+$/, "");
  }

  return path.normalize(trimmed);
}

export function isWindowsUncPath(pathValue: string): boolean {
  return /^\\\\[^\\]+\\[^\\]+/.test(toBackslashes(pathValue));
}

export function defaultWindowsWorkspaceRoot(env: Partial<Record<string, string | undefined>> = {}): string {
  const userProfile = env.USERPROFILE?.trim();
  if (userProfile) {
    return path.win32.join(userProfile, "Videos", "MixLabLocal");
  }

  const homeDrive = env.HOMEDRIVE?.trim();
  const homePath = env.HOMEPATH?.trim();
  if (homeDrive && homePath) {
    return path.win32.join(`${homeDrive}${homePath}`, "Videos", "MixLabLocal");
  }

  return path.win32.join("C:\\Users\\Default", "Videos", "MixLabLocal");
}

export function isSubPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = normalizeDesktopPathForStorage(candidate).toLowerCase();
  const normalizedParent = normalizeDesktopPathForStorage(parent).toLowerCase();
  if (!normalizedCandidate || !normalizedParent || normalizedCandidate === normalizedParent) {
    return false;
  }

  const relativePath = path.win32.relative(normalizedParent, normalizedCandidate);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.win32.isAbsolute(relativePath);
}

async function runCheck(
  id: string,
  label: string,
  action: () => Promise<boolean>,
  message: string
): Promise<DesktopDoctorCheck> {
  try {
    return (await action())
      ? { id, label, status: "pass" }
      : { id, label, status: "fail", message };
  } catch (error) {
    return {
      id,
      label,
      status: "fail",
      message: error instanceof Error ? error.message : message
    };
  }
}

async function isDirectory(fs: DesktopRuntimeFsLike, pathValue: string): Promise<boolean> {
  return (await fs.stat(pathValue)).kind === "directory";
}

async function isFile(fs: DesktopRuntimeFsLike, pathValue: string): Promise<boolean> {
  return (await fs.stat(pathValue)).kind === "file";
}

export async function validatePublicLibraryCandidate(
  publicLibraryRoot: string,
  fs: DesktopRuntimeFsLike
): Promise<DesktopDoctorResult> {
  const root = normalizeDesktopPathForStorage(publicLibraryRoot);
  const sourceVideosRoot = path.win32.join(root, "source-videos");
  const mixlabLibraryRoot = path.win32.join(root, ".mixlab-library");
  const currentIndexPath = path.win32.join(mixlabLibraryRoot, "indexes", "source-transcript-index", "current.json");

  const checks = await Promise.all([
    runCheck("root", "公共素材库目录", () => isDirectory(fs, root), "公共素材库目录不存在或不可读"),
    runCheck("source_videos", "source-videos", () => isDirectory(fs, sourceVideosRoot), "source-videos 不存在或不可读"),
    runCheck("mixlab_library", ".mixlab-library", () => isDirectory(fs, mixlabLibraryRoot), ".mixlab-library 不存在或不可读"),
    runCheck("current_index", "current.json", () => isFile(fs, currentIndexPath), "current.json 不存在或不可读"),
    runCheck(
      "ready_materials",
      "ready 素材",
      async () => {
        if (!fs.countReadyMaterials) {
          return false;
        }
        return (await fs.countReadyMaterials(root)) > 0;
      },
      "没有可供剪辑端使用的 ready 素材"
    )
  ]);

  return {
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks
  };
}

export async function validateLocalWorkspaceCandidate(
  input: ValidateLocalWorkspaceInput
): Promise<DesktopDoctorResult> {
  const workspaceRoot = normalizeDesktopPathForStorage(input.workspace_root);
  const publicLibraryRoot = normalizeDesktopPathForStorage(input.public_library_root);
  const checks = await Promise.all([
    runCheck("workspace_root", "本地工作区", () => isDirectory(input.fs, workspaceRoot), "本地工作区不存在或不可读"),
    runCheck(
      "writable",
      "可写",
      async () => input.fs.canWrite ? input.fs.canWrite(workspaceRoot) : false,
      "本地工作区不可写"
    ),
    runCheck(
      "outside_public_library",
      "不在公共素材库内",
      async () => workspaceRoot !== publicLibraryRoot && !isSubPath(workspaceRoot, publicLibraryRoot),
      "本地工作区不能放在公共素材库内"
    )
  ]);

  return {
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks
  };
}

export function buildCutterApiEnv(config: CutterDesktopConfig): Record<string, string> {
  return {
    MIXLAB_CUTTER_API_HOST: config.api_host,
    MIXLAB_CUTTER_API_PORT: String(config.api_port),
    MIXLAB_CUTTER_LIBRARY_ROOT: normalizeDesktopPathForStorage(config.public_library_root),
    MIXLAB_CUTTER_WORKSPACE_ROOT: normalizeDesktopPathForStorage(config.local_workspace_root),
    ...(config.log_root ? { MIXLAB_DESKTOP_LOG_DIR: normalizeDesktopPathForStorage(config.log_root) } : {}),
    ...(config.ffmpeg_path ? { MIXLAB_FFMPEG_PATH: normalizeDesktopPathForStorage(config.ffmpeg_path) } : {}),
    ...(config.ffprobe_path ? { MIXLAB_FFPROBE_PATH: normalizeDesktopPathForStorage(config.ffprobe_path) } : {})
  };
}

function redactString(value: string): string {
  return value
    .replace(/([?&](?:Signature|Expires|OSSAccessKeyId|security-token|token|key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|ak)-[a-z0-9_-]+/gi, "[REDACTED_KEY]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[REDACTED_TOKEN]");
}

function shouldCopyEnvKey(key: string): boolean {
  return !/(KEY|TOKEN|SECRET|PASSWORD|SIGNED|SIGNATURE)/i.test(key);
}

export function redactDesktopDiagnostics(input: DesktopDiagnosticsInput): RedactedDesktopDiagnostics {
  const env = input.env
    ? Object.fromEntries(
        Object.entries(input.env)
          .filter(([key, value]) => shouldCopyEnvKey(key) && typeof value === "string")
          .map(([key, value]) => [key, redactString(value ?? "")])
      )
    : undefined;

  return {
    app_version: input.app_version,
    windows_version: input.windows_version,
    api_address: input.api_address,
    public_library_root: input.public_library_root,
    local_workspace_root: input.local_workspace_root,
    ffmpeg_status: input.ffmpeg_status,
    doctor_result: input.doctor_result,
    latest_error_summary: input.latest_error_summary ? redactString(input.latest_error_summary) : undefined,
    ...(env && Object.keys(env).length > 0 ? { env } : {})
  };
}
