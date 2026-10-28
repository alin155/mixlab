import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadProjectEnv } from "../shared/load-project-env.ts";
import {
  buildFfmpegCoverImagePlan,
  resolveFfmpegRuntime
} from "../../packages/ffmpeg-core/src/index.ts";
import {
  AdminWriterLeaseError,
  completeReadyVisualArtifacts,
  DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT,
  inspectPreprocessSafety,
  publishIndexRequiredSourceVideos,
  readAdminSettings,
  readAdminWriterLease,
  readAllSourceVideoManifests,
  withAdminWriterLeaseWait,
  type AdminWriterLeaseDetails,
  type PublishIndexRequiredSourceVideosResult
} from "../../packages/library-fs/src/index.ts";
import {
  resolveAdminDockerMvpMode
} from "../../packages/admin-api/src/admin-command-guard.ts";
import {
  adminCommandSystemActor
} from "../../packages/admin-api/src/admin-command-audit.ts";
import {
  appendReadyPublishWorkerAuditEventBestEffort,
  READY_PUBLISH_WORKER_COMMAND,
  readyPublishWorkerHolder,
  type ReadyPublishWorkerAuditEventType
} from "../../packages/admin-api/src/admin-publish-commands.ts";
import { resolveReadyPublishSourceVideoPath } from "./publish-ready-source-path.ts";

const ENABLE_FLAG = "MIXLAB_ENABLE_READY_PUBLISH_WORKER";
const DEFAULT_LEASE_WAIT_MS = 30_000;
const DEFAULT_LEASE_STALE_MS = 30 * 60 * 1000;

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEnabled(key: string, env: NodeJS.ProcessEnv): boolean {
  return optionalTrimmed(env[key]) === "1";
}

function parsePositiveIntegerEnv(
  key: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = optionalTrimmed(env[key]);

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be greater than 0`);
  }

  return parsed;
}

function parseNonNegativeIntegerEnv(
  key: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = optionalTrimmed(env[key]);

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be greater than or equal to 0`);
  }

  return parsed;
}

function defaultRunProcess(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} failed:\n${result.stderr}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function buildKeyframesMs(input: {
  duration_ms: number;
  interval_ms: number;
  max_count: number;
}): number[] {
  const durationMs = Math.max(0, Math.trunc(input.duration_ms));

  if (durationMs === 0) {
    return [0];
  }

  const dense: number[] = [];

  for (let cursor = 0; cursor < durationMs; cursor += input.interval_ms) {
    dense.push(cursor);
  }

  dense.push(durationMs);

  if (dense.length <= input.max_count) {
    return Array.from(new Set(dense));
  }

  const sampled = new Set<number>();

  for (let index = 0; index < input.max_count; index += 1) {
    sampled.add(Math.round((durationMs * index) / (input.max_count - 1)));
  }

  return Array.from(sampled).sort((left, right) => left - right);
}

export interface ReadyPublishWorkerDeps {
  resolve_ffmpeg_runtime: typeof resolveFfmpegRuntime;
  run_process: (executable: string, args: string[]) => void;
  read_admin_settings: typeof readAdminSettings;
  inspect_preprocess_safety: typeof inspectPreprocessSafety;
  read_all_source_video_manifests: typeof readAllSourceVideoManifests;
  complete_ready_visual_artifacts: typeof completeReadyVisualArtifacts;
  publish_index_required_source_videos: typeof publishIndexRequiredSourceVideos;
  resolve_source_video_path: typeof resolveReadyPublishSourceVideoPath;
  read_writer_lease: typeof readAdminWriterLease;
  with_writer_lease: typeof withAdminWriterLeaseWait;
  append_audit: typeof appendReadyPublishWorkerAuditEventBestEffort;
  now: () => string;
}

export interface ReadyPublishWorkerInput {
  env?: NodeJS.ProcessEnv;
  /** Overrides for tests; production reads MIXLAB_PREPROCESS_LIBRARY_ROOT/_ID from env. */
  library_root?: string;
  library_id?: string;
  wait_ms?: number;
  log?: (line: string) => void;
  deps?: Partial<ReadyPublishWorkerDeps>;
}

export type ReadyPublishWorkerOutcome =
  | { status: "skipped"; reason: string; details?: Record<string, unknown> }
  | {
      status: "completed";
      prepared_source_video_ids: string[];
      result: PublishIndexRequiredSourceVideosResult;
    }
  | { status: "failed"; reason: string; message: string };

function defaultDeps(): ReadyPublishWorkerDeps {
  return {
    resolve_ffmpeg_runtime: resolveFfmpegRuntime,
    run_process: defaultRunProcess,
    read_admin_settings: readAdminSettings,
    inspect_preprocess_safety: inspectPreprocessSafety,
    read_all_source_video_manifests: readAllSourceVideoManifests,
    complete_ready_visual_artifacts: completeReadyVisualArtifacts,
    publish_index_required_source_videos: publishIndexRequiredSourceVideos,
    resolve_source_video_path: resolveReadyPublishSourceVideoPath,
    read_writer_lease: readAdminWriterLease,
    with_writer_lease: withAdminWriterLeaseWait,
    append_audit: appendReadyPublishWorkerAuditEventBestEffort,
    now: () => new Date().toISOString()
  };
}

/**
 * Round2 publication gate: the standalone publish worker now uses the same
 * admin writer lease as Admin commands, enforces runtime_policy.auto_publish_index_enabled,
 * and emits unified operation-log audit events (started/succeeded/skipped/failed/progress)
 * with a system actor instead of stdout-only reporting.
 */
export async function runReadyPublishWorker(
  input: ReadyPublishWorkerInput = {}
): Promise<ReadyPublishWorkerOutcome> {
  const env = input.env ?? process.env;
  const log = input.log ?? ((line: string) => console.log(line));
  const deps: ReadyPublishWorkerDeps = { ...defaultDeps(), ...(input.deps ?? {}) };
  const libraryRoot = input.library_root ?? optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_ROOT) ?? "";
  const holder = readyPublishWorkerHolder();
  const actor = adminCommandSystemActor("发布就绪 worker", "system-task");
  const audit = async (
    eventType: ReadyPublishWorkerAuditEventType,
    extra: { reason?: string; error?: unknown; details?: Record<string, unknown> } = {}
  ): Promise<void> => {
    if (!libraryRoot) {
      return;
    }
    await deps.append_audit({
      library_root: libraryRoot,
      occurred_at: deps.now(),
      event_type: eventType,
      holder,
      actor,
      reason: extra.reason,
      error: extra.error,
      details: extra.details
    });
  };
  const skip = async (
    reason: string,
    details?: Record<string, unknown>
  ): Promise<ReadyPublishWorkerOutcome> => {
    await audit("skipped", { reason, details });
    log("Ready publish worker skipped.");
    log(JSON.stringify({ reason, ...(details ?? {}) }, null, 2));
    return { status: "skipped", reason, ...(details ? { details } : {}) };
  };

  if (!isEnabled(ENABLE_FLAG, env)) {
    return skip(`${ENABLE_FLAG}=1 is required before publishing ready source videos`, {
      required_enable_flags: [ENABLE_FLAG],
      missing_enable_flags: [ENABLE_FLAG].filter((key) => !isEnabled(key, env)),
      required_env_keys: ["MIXLAB_PREPROCESS_LIBRARY_ROOT"],
      missing_env_keys: ["MIXLAB_PREPROCESS_LIBRARY_ROOT"].filter(
        (key) => !optionalTrimmed(env[key])
      )
    });
  }

  if (resolveAdminDockerMvpMode(env) === "v0.1") {
    return skip("admin_docker_mvp_blocks_ready_publish", {
      docker_mvp_mode: "v0.1",
      required_mode_for_publish: "off"
    });
  }

  const missingRuntimeEnvKeys = ["MIXLAB_PREPROCESS_LIBRARY_ROOT"].filter(
    (key) => !optionalTrimmed(env[key])
  );

  if (missingRuntimeEnvKeys.length > 0) {
    const message = "Ready publish worker is enabled, but readiness checks failed.";
    log(message);
    log(JSON.stringify({ missing_env_keys: missingRuntimeEnvKeys }, null, 2));
    return { status: "failed", reason: "missing_runtime_env", message };
  }

  const libraryId = input.library_id ?? optionalTrimmed(env.MIXLAB_PREPROCESS_LIBRARY_ID) ?? "lib_main_001";
  const settings = await deps.read_admin_settings(libraryRoot);

  if (!settings.runtime_policy.auto_publish_index_enabled) {
    return skip("auto_publish_index_disabled", {
      runtime_policy: {
        auto_publish_index_enabled: settings.runtime_policy.auto_publish_index_enabled
      }
    });
  }

  const startedAt = deps.now();
  const safety = await deps.inspect_preprocess_safety({
    library_root: libraryRoot,
    now: startedAt,
    disk_block_usage_percent: parsePositiveIntegerEnv(
      "MIXLAB_PREPROCESS_DISK_BLOCK_USAGE_PERCENT",
      DEFAULT_PREPROCESS_DISK_BLOCK_USAGE_PERCENT,
      env
    ),
    include_processing_guard: false
  });

  if (!safety.safe_to_start) {
    return skip("preprocess_safety_blocked", { safety });
  }

  const coverAtMs = parsePositiveIntegerEnv("MIXLAB_READY_COVER_AT_MS", 1_000, env);
  const coverWidth = parsePositiveIntegerEnv("MIXLAB_READY_COVER_WIDTH", 640, env);
  const keyframeIntervalMs = parsePositiveIntegerEnv("MIXLAB_READY_KEYFRAME_INTERVAL_MS", 5_000, env);
  const keyframeMaxCount = parsePositiveIntegerEnv("MIXLAB_READY_KEYFRAME_MAX_COUNT", 60, env);
  const waitMs = input.wait_ms ?? parseNonNegativeIntegerEnv(
    "MIXLAB_READY_PUBLISH_LEASE_WAIT_MS",
    DEFAULT_LEASE_WAIT_MS,
    env
  );
  const staleMs = parsePositiveIntegerEnv(
    "MIXLAB_READY_PUBLISH_LEASE_STALE_MS",
    DEFAULT_LEASE_STALE_MS,
    env
  );

  let existingLease: AdminWriterLeaseDetails | null = null;
  try {
    existingLease = await deps.read_writer_lease(libraryRoot);
  } catch {
    existingLease = null;
  }

  if (existingLease) {
    await audit("progress", {
      reason: "admin_writer_busy_wait",
      details: { lease: existingLease, wait_ms: waitMs }
    });
    log("Ready publish worker waiting for the admin writer lease.");
    log(
      JSON.stringify(
        {
          event: "admin_writer_busy_wait",
          lease: existingLease,
          wait_ms: waitMs
        },
        null,
        2
      )
    );
  }

  try {
    return await deps.with_writer_lease(
      {
        library_root: libraryRoot,
        holder,
        reason: READY_PUBLISH_WORKER_COMMAND,
        now: startedAt,
        wait_ms: waitMs,
        stale_ms: staleMs
      },
      async (): Promise<ReadyPublishWorkerOutcome> => {
        await audit("started", { details: { wait_ms: waitMs } });

        try {
          const manifests = await deps.read_all_source_video_manifests(libraryRoot);
          const indexRequired = manifests.filter(
            (manifest) => manifest.preprocess_status === "index-required"
          );

          log("Ready publish worker started.");
          log(
            JSON.stringify(
              {
                library_root: libraryRoot,
                library_id: libraryId,
                index_required_count: indexRequired.length,
                cover_at_ms: coverAtMs,
                cover_width: coverWidth,
                keyframe_interval_ms: keyframeIntervalMs,
                keyframe_max_count: keyframeMaxCount
              },
              null,
              2
            )
          );

          const preparedSourceVideoIds: string[] = [];
          let runtime: ReturnType<typeof resolveFfmpegRuntime> | undefined;

          for (const manifest of indexRequired) {
            const coverPath = manifest.cover_path.trim()
              ? manifest.cover_path
              : `.mixlab-library/videos/${manifest.source_video_id}/cover.jpg`;
            const absoluteCoverPath = path.join(libraryRoot, coverPath);

            if (!(await fileExists(absoluteCoverPath))) {
              runtime ??= deps.resolve_ffmpeg_runtime();
              const sourceVideoPath = await deps.resolve_source_video_path({
                library_root: libraryRoot,
                manifest
              });
              const plan = buildFfmpegCoverImagePlan({
                source_path: sourceVideoPath,
                output_path: absoluteCoverPath,
                at_ms: Math.min(coverAtMs, Math.max(0, manifest.duration_ms - 1)),
                width: coverWidth
              });

              deps.run_process(runtime.ffmpeg_path, plan.args);
            }

            await deps.complete_ready_visual_artifacts({
              library_root: libraryRoot,
              source_video_id: manifest.source_video_id,
              cover_path: coverPath,
              keyframes_ms: buildKeyframesMs({
                duration_ms: manifest.duration_ms,
                interval_ms: keyframeIntervalMs,
                max_count: keyframeMaxCount
              }),
              now: deps.now()
            });
            preparedSourceVideoIds.push(manifest.source_video_id);
          }

          const result = await deps.publish_index_required_source_videos({
            library_root: libraryRoot,
            library_id: libraryId,
            now: deps.now()
          });

          await audit("succeeded", {
            details: {
              prepared_source_video_ids: preparedSourceVideoIds,
              published_source_video_ids: result.published_source_video_ids,
              index_version: result.index_version,
              ready_video_count: result.ready_video_count
            }
          });
          log("Ready publish worker completed.");
          log(
            JSON.stringify(
              {
                started_at: startedAt,
                finished_at: deps.now(),
                prepared_source_video_ids: preparedSourceVideoIds,
                result
              },
              null,
              2
            )
          );

          return {
            status: "completed",
            prepared_source_video_ids: preparedSourceVideoIds,
            result
          };
        } catch (error) {
          await audit("failed", { error });
          log("Ready publish worker failed.");
          log(
            JSON.stringify(
              { error: error instanceof Error ? error.message : String(error) },
              null,
              2
            )
          );
          throw error;
        }
      }
    );
  } catch (error) {
    if (error instanceof AdminWriterLeaseError) {
      return skip("admin_writer_busy", {
        lease: error.details.lease,
        wait_ms: waitMs
      });
    }

    return {
      status: "failed",
      reason: "publish_failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main(): Promise<number> {
  await loadProjectEnv();
  const outcome = await runReadyPublishWorker();
  if (outcome.status === "failed") {
    console.error("Ready publish worker failed.");
    console.error(JSON.stringify({ reason: outcome.reason, message: outcome.message }, null, 2));
    return 1;
  }
  return 0;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  process.exit(await main());
}
