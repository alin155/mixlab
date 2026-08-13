import { spawn } from "node:child_process";
import {
  createDashScopeTemporaryFileAudioUploader,
  createFetchDashScopeHttpClient,
  type DashScopeAsrModel
} from "../../asr-core/src/index.ts";
import {
  buildFfprobeSourceMetadataPlan,
  parseFfprobeSourceMetadata,
  resolveFfmpegRuntime
} from "../../ffmpeg-core/src/index.ts";
import {
  getFileIdentity,
  readAllSourceVideoManifests,
  type AdminRuntimePolicy,
  type ScanSourceVideosResult
} from "../../library-fs/src/index.ts";
import {
  runLibraryTextPreprocessWorker,
  runSourceVideoTextPreprocess,
  type RunLibraryTextPreprocessWorkerInput,
  type RunLibraryTextPreprocessWorkerResult
} from "../../preprocess-core/src/index.ts";
import { adminCommandSystemActor } from "./admin-command-audit.ts";
import {
  resolveAdminDockerMvpMode,
  type AdminDockerMvpMode
} from "./admin-command-guard.ts";
import {
  clearAdminIndexVersionCache
} from "./admin-index-versions-query.ts";
import {
  runAdminLibraryScanCommand
} from "./admin-library-commands.ts";
import {
  runAdminSourceVideoPublishCommand,
  type ReadyPublishMedia
} from "./admin-publish-commands.ts";
import {
  runAdminPipelineQueueCommand
} from "./admin-transition-commands.ts";
import {
  createAdminWorkerLifecycleCommands
} from "./admin-worker-lifecycle-commands.ts";
import type { PreprocessSupervisorRunner } from "./preprocess-supervisor.ts";

function optionalTrimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function parsePositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number
): number {
  const raw = optionalTrimmed(env[key]);

  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} 必须是正整数`);
  }

  return parsed;
}

export function resolveAdminAsrPollingConfig(input: {
  env: NodeJS.ProcessEnv;
  asr_mode?: "default" | "long-task";
}): { max_poll_attempts: number; poll_interval_ms: number } {
  const defaultMaxPollAttempts = parsePositiveIntegerEnv(input.env, "MIXLAB_ASR_MAX_POLL_ATTEMPTS", 60);
  const defaultPollIntervalMs = parsePositiveIntegerEnv(input.env, "MIXLAB_ASR_POLL_INTERVAL_MS", 3000);

  if (input.asr_mode !== "long-task") {
    return {
      max_poll_attempts: defaultMaxPollAttempts,
      poll_interval_ms: defaultPollIntervalMs
    };
  }

  return {
    max_poll_attempts: parsePositiveIntegerEnv(
      input.env,
      "MIXLAB_ASR_LONG_TASK_MAX_POLL_ATTEMPTS",
      Math.max(defaultMaxPollAttempts, 9600)
    ),
    poll_interval_ms: parsePositiveIntegerEnv(
      input.env,
      "MIXLAB_ASR_LONG_TASK_POLL_INTERVAL_MS",
      defaultPollIntervalMs
    )
  };
}

async function runProcess(executable: string, args: string[]): Promise<void> {
  await runProcessForStdout(executable, args);
}

function runProcessForStdout(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${executable} 执行失败：${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });
}

export function assertRealPreprocessStartReady(env: NodeJS.ProcessEnv): void {
  if (!optionalTrimmed(env.DASHSCOPE_API_KEY)) {
    throw new Error("语音识别接口密钥未配置，无法启动真实预处理服务");
  }
}

export type AdminPreprocessWorkerCycleInput = Omit<
  RunLibraryTextPreprocessWorkerInput,
  "probe_source_video" | "preprocess_source_video" | "get_content_hash"
>;

export interface RunAdminPreprocessPipelineInput {
  library_root: string;
  library_id: string;
  library_name: string;
  runtime_policy: AdminRuntimePolicy;
  env?: Record<string, string | undefined>;
  docker_mvp_mode?: AdminDockerMvpMode;
  limit?: number;
  source_video_ids?: string[];
  now: () => string;
  media: ReadyPublishMedia;
  should_stop?: () => boolean;
  on_progress?: (result: RunLibraryTextPreprocessWorkerResult) => void;
  on_current_job?: (input: { source_video_id: string; stage: string; now: string }) => Promise<void> | void;
  clear_source_video_page_cache?: (libraryRoot: string) => void;
  run_worker_cycle(input: AdminPreprocessWorkerCycleInput): Promise<RunLibraryTextPreprocessWorkerResult>;
}

export interface RunAdminPreprocessPipelineResult extends RunLibraryTextPreprocessWorkerResult {
  controlled_policy: AdminControlledPreprocessPolicy;
  prepared_source_video_ids: string[];
  published_source_video_ids: string[];
  skipped_source_video_ids: string[];
  published_count: number;
  skipped_count: number;
}

export type AdminControlledPreprocessDisabledAction =
  | "auto-scan";

export interface AdminControlledPreprocessPolicy {
  docker_mvp_mode: AdminDockerMvpMode;
  runtime_policy: AdminRuntimePolicy;
  disabled_actions: AdminControlledPreprocessDisabledAction[];
}

async function buildExistingSourceVideosScanResult(
  libraryRoot: string
): Promise<ScanSourceVideosResult> {
  const manifests = await readAllSourceVideoManifests(libraryRoot);

  return {
    total_video_count: manifests.length,
    new_video_count: 0,
    existing_video_count: manifests.length,
    source_video_ids: manifests.map((manifest) => manifest.source_video_id)
  };
}

export function resolveAdminControlledPreprocessPolicy(input: {
  runtime_policy: AdminRuntimePolicy;
  env?: Record<string, string | undefined>;
  docker_mvp_mode?: AdminDockerMvpMode;
}): AdminControlledPreprocessPolicy {
  const dockerMvpMode = input.docker_mvp_mode ?? resolveAdminDockerMvpMode(input.env);
  const runtimePolicy: AdminRuntimePolicy = { ...input.runtime_policy };
  const disabledActions: AdminControlledPreprocessDisabledAction[] = [];

  if (dockerMvpMode === "v0.1") {
    if (runtimePolicy.auto_scan_enabled) {
      runtimePolicy.auto_scan_enabled = false;
      disabledActions.push("auto-scan");
    }

  }

  return {
    docker_mvp_mode: dockerMvpMode,
    runtime_policy: runtimePolicy,
    disabled_actions: disabledActions
  };
}

export async function runAdminPreprocessPipeline(
  input: RunAdminPreprocessPipelineInput
): Promise<RunAdminPreprocessPipelineResult> {
  const controlledPolicy = resolveAdminControlledPreprocessPolicy({
    runtime_policy: input.runtime_policy,
    env: input.env,
    docker_mvp_mode: input.docker_mvp_mode
  });
  const runtimePolicy = controlledPolicy.runtime_policy;
  let scanResult: ScanSourceVideosResult;
  let shouldClearSourceVideoPageCache = false;

  if (runtimePolicy.auto_scan_enabled) {
    scanResult = await runAdminLibraryScanCommand({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      command_now: input.now(),
      now: input.now,
      actor: adminCommandSystemActor("预处理流水线自动扫描", "system-task")
    });
    shouldClearSourceVideoPageCache = true;
  } else {
    scanResult = await buildExistingSourceVideosScanResult(input.library_root);
  }

  if (runtimePolicy.auto_queue_enabled) {
    await runAdminPipelineQueueCommand({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
      command_now: input.now(),
      now: input.now,
      actor: adminCommandSystemActor("预处理流水线自动入队", "system-task")
    });
    shouldClearSourceVideoPageCache = true;
  }

  if (shouldClearSourceVideoPageCache) {
    input.clear_source_video_page_cache?.(input.library_root);
  }

  const items: RunLibraryTextPreprocessWorkerResult["items"] = [];
  const preparedSourceVideoIds: string[] = [];
  const publishedSourceVideoIds: string[] = [];
  const skippedSourceVideoIds: string[] = [];
  let totalClaimedCount = 0;
  let succeededCount = 0;
  let failedCount = 0;

  while (input.should_stop?.() !== true) {
    const remainingLimit = input.limit ? input.limit - totalClaimedCount : undefined;
    if (remainingLimit !== undefined && remainingLimit <= 0) {
      break;
    }

    const cycleLimit = remainingLimit === undefined
      ? runtimePolicy.concurrent_jobs
      : Math.min(remainingLimit, runtimePolicy.concurrent_jobs);

    const cycleResult = await input.run_worker_cycle({
      library_root: input.library_root,
      library_id: input.library_id,
      library_name: input.library_name,
            worker_id: `admin-worker-${process.pid}`,
            limit: cycleLimit,
            source_video_ids: input.source_video_ids,
            audio_mode: runtimePolicy.audio_mode,
            now: input.now,
            on_current_job: input.on_current_job,
            scan_before_claim: false,
            claim_statuses: ["queued"]
    });
    totalClaimedCount += cycleResult.total_claimed_count;
    succeededCount += cycleResult.succeeded_count;
    failedCount += cycleResult.failed_count;
    items.push(...cycleResult.items);

    if (runtimePolicy.auto_publish_index_enabled) {
      const succeededSourceVideoIds = [...new Set(cycleResult.items
        .filter((item) => item.status === "succeeded")
        .map((item) => item.source_video_id))];

      for (const sourceVideoId of succeededSourceVideoIds) {
        input.on_current_job?.({
          source_video_id: sourceVideoId,
          stage: "publish-ready",
          now: input.now()
        });
        const publishResult = await runAdminSourceVideoPublishCommand({
          library_root: input.library_root,
          library_id: input.library_id,
          command_now: input.now(),
          now: input.now,
          media: input.media,
          source_video_id: sourceVideoId,
          actor: adminCommandSystemActor("预处理流水线自动发布", "system-task"),
          invalidate_index_version_cache: () => clearAdminIndexVersionCache(input.library_root)
        });
        preparedSourceVideoIds.push(...publishResult.prepared_source_video_ids);
        publishedSourceVideoIds.push(...publishResult.published_source_video_ids);
        skippedSourceVideoIds.push(...publishResult.skipped_source_video_ids);
      }
    }

    input.on_progress?.({
      scan_result: scanResult,
      total_claimed_count: totalClaimedCount,
      succeeded_count: succeededCount,
      failed_count: failedCount,
      items
    });

    if (cycleResult.total_claimed_count === 0) {
      break;
    }
  }

  return {
    controlled_policy: controlledPolicy,
    scan_result: scanResult,
    total_claimed_count: totalClaimedCount,
    succeeded_count: succeededCount,
    failed_count: failedCount,
    items,
    prepared_source_video_ids: [...new Set(preparedSourceVideoIds)],
    published_source_video_ids: [...new Set(publishedSourceVideoIds)],
    skipped_source_video_ids: [...new Set(skippedSourceVideoIds)],
    published_count: new Set(publishedSourceVideoIds).size,
    skipped_count: new Set(skippedSourceVideoIds).size
  };
}

export function createRealPreprocessRunner(input: {
  library_root: string;
  library_id: string;
  library_name: string;
  env: NodeJS.ProcessEnv;
  now: () => string;
  media: ReadyPublishMedia;
  clear_source_video_page_cache?: (libraryRoot: string) => void;
}): PreprocessSupervisorRunner {
  return {
    async runOnce(runInput) {
      assertRealPreprocessStartReady(input.env);

      const runtime = resolveFfmpegRuntime(input.env);
      const dashscopeHttp = createFetchDashScopeHttpClient();
      const apiKey = optionalTrimmed(input.env.DASHSCOPE_API_KEY);
      const asrModel = (optionalTrimmed(input.env.MIXLAB_ASR_MODEL) || "paraformer-v2") as DashScopeAsrModel;
      const asrPolling = resolveAdminAsrPollingConfig({
        env: input.env,
        asr_mode: runInput.asr_mode
      });
      const uploader = createDashScopeTemporaryFileAudioUploader({
        api_key: apiKey,
        model: asrModel,
        http: dashscopeHttp
      });

      return runAdminPreprocessPipeline({
        library_root: input.library_root,
        library_id: input.library_id,
        library_name: input.library_name,
        runtime_policy: runInput.runtime_policy,
        env: input.env,
        limit: runInput.limit,
        source_video_ids: runInput.source_video_ids,
        now: input.now,
        media: input.media,
        should_stop: runInput.should_stop,
        on_progress: runInput.on_progress,
        on_current_job: runInput.on_current_job,
        clear_source_video_page_cache: input.clear_source_video_page_cache,
        run_worker_cycle(workerInput) {
          return runLibraryTextPreprocessWorker({
            ...workerInput,
            should_stop: runInput.should_stop,
            lifecycle: createAdminWorkerLifecycleCommands({
              actor: adminCommandSystemActor("预处理工作器生命周期", "system-task")
            }),
            async probe_source_video(probeInput) {
              const plan = buildFfprobeSourceMetadataPlan({
                source_path: probeInput.source_video_path
              });

              return parseFfprobeSourceMetadata(
                await runProcessForStdout(runtime.ffprobe_path, plan.args)
              );
            },
            async get_content_hash(sourceVideoPath) {
              return getFileIdentity(sourceVideoPath, "stat");
            },
            async preprocess_source_video(preprocessInput) {
              return runSourceVideoTextPreprocess({
                library_root: preprocessInput.library_root,
                library_id: preprocessInput.library_id,
                source_video_id: preprocessInput.source_video_id,
                source_video_path: preprocessInput.source_video_path,
                ffmpeg_path: runtime.ffmpeg_path,
                audio_mode: preprocessInput.audio_mode,
                now: preprocessInput.now,
                on_stage: preprocessInput.on_stage,
                command_runner: {
                  async run(executable, args) {
                    await runProcess(executable, args);
                  }
                },
                uploader,
                asr_http: dashscopeHttp,
                asr: {
                  api_key: apiKey,
                  model: asrModel,
                  max_poll_attempts: asrPolling.max_poll_attempts,
                  poll_interval_ms: asrPolling.poll_interval_ms,
                  parameters: {
                    channel_id: [0],
                    language_hints: ["zh", "en"],
                    diarization_enabled: false
                  }
                }
              });
            }
          });
        }
      });
    }
  };
}
