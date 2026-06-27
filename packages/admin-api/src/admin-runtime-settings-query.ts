import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  readAdminSettings,
  readAllSourceVideoManifests
} from "../../library-fs/src/index.ts";
import type { SourceVideoManifest } from "../../protocol/src/index.ts";
import {
  resolveFfmpegRuntime
} from "../../ffmpeg-core/src/index.ts";
import {
  readAdminLibraryManifest,
  type AdminLibraryManifest
} from "./admin-library-commands.ts";
import {
  adminPreprocessJobPath
} from "./admin-library-paths.ts";

export interface AdminRuntimeSettingsAsr {
  provider: "dashscope";
  provider_label: string;
  model: string;
  audio_mode: string;
  dashscope_api_key_configured: boolean;
  language_hints: string[];
  speaker_diarization_enabled: boolean;
  object_storage_mode: "dashscope-temporary";
  last_failure_reason: string;
}

export interface AdminRuntimeExecutableStatus {
  available: boolean;
  source: "bundled" | "custom" | "path" | "missing";
  version: string;
  last_error: string;
}

export interface AdminRuntimeSettingsResult {
  ffmpeg: AdminRuntimeExecutableStatus;
  ffprobe: AdminRuntimeExecutableStatus;
  asr: AdminRuntimeSettingsAsr;
}

interface AdminRuntimeSettingsConfig {
  runtime_policy: {
    audio_mode: string;
  };
}

interface AdminRuntimePreprocessJob {
  source_video_id: string;
  error_stage?: string;
  error_message?: string;
  failed_at?: string;
  stage_updated_at?: string;
  claimed_at?: string;
}

interface AdminRuntimeSettingsFfmpegRuntime {
  source: string;
  ffmpeg_path: string;
  ffprobe_path: string;
}

export interface AdminRuntimeSettingsQueryDeps {
  read_admin_settings(libraryRoot: string): Promise<AdminRuntimeSettingsConfig>;
  read_library_manifest(libraryRoot: string): Promise<AdminLibraryManifest | null>;
  read_all_source_video_manifests(libraryRoot: string): Promise<SourceVideoManifest[]>;
  read_preprocess_job(libraryRoot: string, sourceVideoId: string): Promise<AdminRuntimePreprocessJob | null>;
  resolve_ffmpeg_runtime(env?: NodeJS.ProcessEnv): AdminRuntimeSettingsFfmpegRuntime;
  read_runtime_version(executablePath: string): string;
}

export interface GetAdminRuntimeSettingsInput {
  library_root: string;
  env?: NodeJS.ProcessEnv;
  max_asr_failure_scan_manifests: number;
  deps?: Partial<AdminRuntimeSettingsQueryDeps>;
}

async function readPreprocessJob(
  libraryRoot: string,
  sourceVideoId: string
): Promise<AdminRuntimePreprocessJob | null> {
  try {
    return JSON.parse(await readFile(adminPreprocessJobPath(libraryRoot, sourceVideoId), "utf8")) as AdminRuntimePreprocessJob;
  } catch {
    return null;
  }
}

function runtimeSource(source: string): AdminRuntimeExecutableStatus["source"] {
  if (source.includes("bundled")) {
    return "bundled";
  }

  return source === "path" || source === "custom" ? source : "path";
}

function runtimeVersion(executablePath: string): string {
  const result = spawnSync(executablePath, ["-version"], {
    encoding: "utf8",
    timeout: 250,
    maxBuffer: 64 * 1024
  });
  return result.status === 0 ? result.stdout.split("\n")[0] ?? "available" : "available";
}

function timestampMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function createDefaultDeps(): AdminRuntimeSettingsQueryDeps {
  return {
    read_admin_settings: readAdminSettings,
    read_library_manifest: readAdminLibraryManifest,
    read_all_source_video_manifests: readAllSourceVideoManifests,
    read_preprocess_job: readPreprocessJob,
    resolve_ffmpeg_runtime: resolveFfmpegRuntime,
    read_runtime_version: runtimeVersion
  };
}

function asrSettings(input: {
  env: NodeJS.ProcessEnv;
  settings: AdminRuntimeSettingsConfig;
  last_failure_reason: string;
}): AdminRuntimeSettingsAsr {
  return {
    provider: "dashscope",
    provider_label: "阿里云百炼 / DashScope",
    model: input.env.MIXLAB_ASR_MODEL || "paraformer-v2",
    audio_mode: input.settings.runtime_policy.audio_mode,
    dashscope_api_key_configured: Boolean(input.env.DASHSCOPE_API_KEY?.trim()),
    language_hints: ["zh"],
    speaker_diarization_enabled: false,
    object_storage_mode: "dashscope-temporary",
    last_failure_reason: input.last_failure_reason
  };
}

async function latestAsrFailureReason(input: {
  library_root: string;
  max_asr_failure_scan_manifests: number;
  deps: AdminRuntimeSettingsQueryDeps;
}): Promise<string> {
  const library = await input.deps.read_library_manifest(input.library_root);
  if (library && library.video_count > input.max_asr_failure_scan_manifests) {
    return "";
  }

  const manifests = await input.deps.read_all_source_video_manifests(input.library_root);
  const jobs = await Promise.all(
    manifests.map((manifest) => input.deps.read_preprocess_job(input.library_root, manifest.source_video_id))
  );
  const failures = jobs
    .map((job) => job && job.error_stage === "asr" && job.error_message
      ? {
          source_video_id: job.source_video_id,
          message: job.error_message,
          failed_ms:
            timestampMs(job.failed_at) ??
            timestampMs(job.stage_updated_at) ??
            timestampMs(job.claimed_at) ??
            0
        }
      : null)
    .filter((item): item is { source_video_id: string; message: string; failed_ms: number } => item !== null)
    .sort((left, right) => right.failed_ms - left.failed_ms);

  const latest = failures[0];
  return latest ? `${latest.source_video_id} ${latest.message}` : "";
}

export async function getAdminRuntimeSettings(
  input: GetAdminRuntimeSettingsInput
): Promise<AdminRuntimeSettingsResult> {
  const env = input.env ?? process.env;
  const deps = {
    ...createDefaultDeps(),
    ...input.deps
  };
  const settings = await deps.read_admin_settings(input.library_root);
  const asrFailureReason = await latestAsrFailureReason({
    library_root: input.library_root,
    max_asr_failure_scan_manifests: input.max_asr_failure_scan_manifests,
    deps
  });

  try {
    const runtime = deps.resolve_ffmpeg_runtime(env);
    return {
      ffmpeg: {
        available: true,
        source: runtimeSource(runtime.source),
        version: deps.read_runtime_version(runtime.ffmpeg_path),
        last_error: ""
      },
      ffprobe: {
        available: true,
        source: runtimeSource(runtime.source),
        version: deps.read_runtime_version(runtime.ffprobe_path),
        last_error: ""
      },
      asr: asrSettings({
        env,
        settings,
        last_failure_reason: asrFailureReason
      })
    };
  } catch (error) {
    return {
      ffmpeg: {
        available: false,
        source: "missing",
        version: "",
        last_error: (error as Error).message
      },
      ffprobe: {
        available: false,
        source: "missing",
        version: "",
        last_error: (error as Error).message
      },
      asr: asrSettings({
        env,
        settings,
        last_failure_reason: asrFailureReason
      })
    };
  }
}
