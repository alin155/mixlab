import { stat } from "node:fs/promises";
import path from "node:path";
import {
  inspectPreprocessSafety,
  readCurrentCutterRelease,
  type PreprocessSafetyStatus
} from "../../library-fs/src/index.ts";
import {
  buildInfo,
  pathProfile,
  preprocessDiskBlockUsagePercent
} from "./admin-release-gates.ts";

export interface AdminHealthQueryApiInput {
  library_root: string;
  now?: () => string;
  env?: NodeJS.ProcessEnv;
}

export interface AdminHealthQueryDeps {
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
  read_processing_source_video_ids(libraryRoot: string): Promise<string[]>;
}

export async function getAdminPreprocessSafety(input: {
  api_input: AdminHealthQueryApiInput;
  include_processing_guard: boolean;
  deps: Pick<AdminHealthQueryDeps, "read_processing_source_video_ids">;
}): Promise<PreprocessSafetyStatus> {
  const env = input.api_input.env ?? process.env;
  const processingSourceVideoIds = input.include_processing_guard
    ? await input.deps.read_processing_source_video_ids(input.api_input.library_root).catch(() => undefined)
    : undefined;

  return inspectPreprocessSafety({
    library_root: input.api_input.library_root,
    now: input.api_input.now?.() ?? new Date().toISOString(),
    disk_block_usage_percent: preprocessDiskBlockUsagePercent(env),
    include_processing_guard: input.include_processing_guard,
    processing_source_video_ids: processingSourceVideoIds
  });
}

export async function getAdminHealth(input: {
  api_input: AdminHealthQueryApiInput;
  deep: boolean;
  deps: AdminHealthQueryDeps;
}) {
  const safety = await getAdminPreprocessSafety({
    api_input: input.api_input,
    include_processing_guard: input.deep,
    deps: input.deps
  });
  const env = input.api_input.env ?? process.env;

  return {
    ok: true,
    service: "admin-api",
    status: safety.status,
    build: buildInfo(env),
    // Liveness responses are unauthenticated and widely readable: never expose the NAS layout.
    runtime: {
      path_profile: pathProfile(input.api_input.library_root)
    },
    preprocess: safety
  };
}

export interface AdminReadyCheck {
  id: "library_readable" | "read_model_readable" | "release_pointer_valid" | "preprocess_safety";
  ok: boolean;
  message: string;
  duration_ms?: number;
}

export interface AdminReadySafetySummary {
  status: PreprocessSafetyStatus["status"];
  safe_to_start: boolean;
  checked_at: string;
  blocker_codes: string[];
}

/**
 * Readiness contract for GET /ready. Never contains absolute filesystem paths: monitoring
 * endpoints are widely readable and must not leak the NAS layout.
 */
export interface AdminReadyReport {
  service: "admin-api";
  ready: boolean;
  status: "ready" | "not_ready";
  checked_at: string;
  build: {
    sha: string;
    version: string;
    image_tag: string;
  };
  checks: AdminReadyCheck[];
  reasons: string[];
  safety: AdminReadySafetySummary;
}

export interface AdminReadyQueryDeps {
  read_processing_source_video_ids(libraryRoot: string): Promise<string[]>;
}

function safeDurationSince(startedAtMs: number): number {
  return Math.max(0, Math.round(adminRuntimeNowMsForReady() - startedAtMs));
}

function adminRuntimeNowMsForReady(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

async function checkLibraryReadable(libraryRoot: string): Promise<AdminReadyCheck> {
  const startedAtMs = adminRuntimeNowMsForReady();

  try {
    const libraryStat = await stat(path.resolve(libraryRoot));

    if (!libraryStat.isDirectory()) {
      return {
        id: "library_readable",
        ok: false,
        message: "公共素材库根路径不是目录",
        duration_ms: safeDurationSince(startedAtMs)
      };
    }
  } catch {
    return {
      id: "library_readable",
      ok: false,
      message: "公共素材库不可读，请检查 NAS 挂载或共享库权限",
      duration_ms: safeDurationSince(startedAtMs)
    };
  }

  return {
    id: "library_readable",
    ok: true,
    message: "公共素材库可读",
    duration_ms: safeDurationSince(startedAtMs)
  };
}

async function checkReadModelReadable(
  libraryRoot: string,
  deps: AdminReadyQueryDeps
): Promise<AdminReadyCheck> {
  const startedAtMs = adminRuntimeNowMsForReady();

  try {
    const processingSourceVideoIds = await deps.read_processing_source_video_ids(libraryRoot);

    return {
      id: "read_model_readable",
      ok: true,
      message: `素材读模型可读（处理中 ${processingSourceVideoIds.length} 个）`,
      duration_ms: safeDurationSince(startedAtMs)
    };
  } catch {
    return {
      id: "read_model_readable",
      ok: false,
      message: "素材读模型不可读，请检查共享库内的 read model 文件或对账状态",
      duration_ms: safeDurationSince(startedAtMs)
    };
  }
}

async function checkReleasePointer(libraryRoot: string): Promise<AdminReadyCheck> {
  const startedAtMs = adminRuntimeNowMsForReady();

  try {
    const release = await readCurrentCutterRelease(libraryRoot);

    return {
      id: "release_pointer_valid",
      ok: true,
      message: `发布指针有效（${release.release_version}，${release.ready_video_count} 个可剪辑素材）`,
      duration_ms: safeDurationSince(startedAtMs)
    };
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    if (errorCode === "ENOENT") {
      // A brand-new library has no release yet; that is not a readiness failure for admin.
      return {
        id: "release_pointer_valid",
        ok: true,
        message: "尚未发布版本（公共库为空或首次初始化）",
        duration_ms: safeDurationSince(startedAtMs)
      };
    }

    return {
      id: "release_pointer_valid",
      ok: false,
      message: "发布指针无效或指向不完整版本，剪辑端可能读不到公共库",
      duration_ms: safeDurationSince(startedAtMs)
    };
  }
}

function safetyCheck(safety: PreprocessSafetyStatus): AdminReadyCheck {
  const message = safety.status === "blocked"
    ? "预处理安全门禁已阻断，请查看原因列表"
    : safety.status === "attention" ? "预处理安全门禁有告警" : "预处理安全门禁通过";

  return {
    id: "preprocess_safety",
    ok: safety.status !== "blocked",
    message
  };
}

export async function getAdminReady(input: {
  api_input: AdminHealthQueryApiInput;
  deep: boolean;
  deps: AdminReadyQueryDeps;
}): Promise<AdminReadyReport> {
  const env = input.api_input.env ?? process.env;
  const checkedAt = input.api_input.now?.() ?? new Date().toISOString();
  const safety = await getAdminPreprocessSafety({
    api_input: input.api_input,
    include_processing_guard: input.deep,
    deps: {
      read_processing_source_video_ids: input.deps.read_processing_source_video_ids
    }
  });
  const checks = [
    await checkLibraryReadable(input.api_input.library_root),
    await checkReadModelReadable(input.api_input.library_root, input.deps),
    await checkReleasePointer(input.api_input.library_root),
    safetyCheck(safety)
  ];
  const reasons = [
    ...checks.filter((check) => !check.ok).map((check) => check.message),
    ...safety.blockers.map((blocker) => `${blocker.code}: ${blocker.message}`)
  ];
  const build = buildInfo(env);

  return {
    service: "admin-api",
    ready: reasons.length === 0,
    status: reasons.length === 0 ? "ready" : "not_ready",
    checked_at: checkedAt,
    build: {
      sha: build.sha,
      version: build.version,
      image_tag: build.image_tag
    },
    checks,
    reasons,
    safety: {
      status: safety.status,
      safe_to_start: safety.safe_to_start,
      checked_at: safety.checked_at,
      blocker_codes: safety.blockers.map((blocker) => blocker.code)
    }
  };
}
