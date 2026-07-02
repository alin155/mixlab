import {
  adminDockerMvpCommandBlockedRouteError,
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminPreprocessCommandRouteApiInput {
  library_root: string;
}

export interface AdminPreprocessCommandRouteSettings<TRuntimePolicy> {
  runtime_policy: TRuntimePolicy;
}

export interface AdminPreprocessSupervisorStartInput<TRuntimePolicy> {
  limit?: number;
  source_video_ids?: string[];
  runtime_policy: TRuntimePolicy;
}

export type AdminBulkPreprocessRouteCommand =
  | "preprocess-queue-unprocessed"
  | "preprocess-retry-failed"
  | "preprocess-recover-processing";

export interface AdminBulkPreprocessRouteCommandInput<TApiInput extends AdminPreprocessCommandRouteApiInput> {
  api_input: TApiInput;
  command: AdminBulkPreprocessRouteCommand;
  limit?: number;
}

export interface AdminBulkPreprocessRouteResult {
  affected_count: number;
  skipped_count?: number;
  skipped_source_video_ids?: string[];
  skipped_reasons?: Record<string, string>;
}

export interface AdminPreprocessRecoverSupervisorStatus {
  state: string;
}

export interface AdminPreprocessRecoverSupervisorBlock {
  error_code: string;
  message: string;
}

export interface AdminPreprocessCommandRouteDeps<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult
> {
  read_request_json(): Promise<unknown>;
  read_admin_settings(libraryRoot: string): Promise<AdminPreprocessCommandRouteSettings<TRuntimePolicy>>;
  refresh_runtime_secrets(): Promise<void>;
  assert_real_preprocess_start_ready(): void;
  read_preprocess_safety(input: TApiInput): Promise<TSafety>;
  assert_preprocess_safe_to_start(safety: TSafety): void;
  start_preprocess_supervisor(input: AdminPreprocessSupervisorStartInput<TRuntimePolicy>): TSupervisorStatus;
  stop_preprocess_supervisor(): TSupervisorStatus;
  run_bulk_transition_command(
    input: AdminBulkPreprocessRouteCommandInput<TApiInput>
  ): Promise<TBulkTransitionResult>;
  read_preprocess_supervisor_status(): AdminPreprocessRecoverSupervisorStatus;
  recover_processing_supervisor_block(
    input: { command: "preprocess-recover-processing"; supervisor_state: string }
  ): AdminPreprocessRecoverSupervisorBlock | null;
  clear_source_video_page_cache(libraryRoot: string): void;
}

export type AdminPreprocessCommandRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

function dockerMvpCommandBlockedResult(error: unknown): AdminPreprocessCommandRouteResult | null {
  const dockerMvpBlock = adminDockerMvpCommandBlockedRouteError(error);
  return dockerMvpBlock
    ? {
        handled: true,
        ...dockerMvpBlock
      }
    : null;
}

export interface HandleAdminPreprocessCommandRoutesInput<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminPreprocessCommandRouteDeps<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult
  >;
}

export function matchAdminPreprocessSupervisorStartPath(pathname: string): boolean {
  return pathname === "/api/admin/preprocess/supervisor/start";
}

export function matchAdminPreprocessSupervisorStopPath(pathname: string): boolean {
  return pathname === "/api/admin/preprocess/supervisor/stop";
}

export function matchAdminPreprocessQueueUnprocessedPath(pathname: string): boolean {
  return pathname === "/api/admin/preprocess/queue-unprocessed";
}

export function matchAdminPreprocessRetryFailedPath(pathname: string): boolean {
  return pathname === "/api/admin/preprocess/retry-failed";
}

export function matchAdminPreprocessRecoverProcessingPath(pathname: string): boolean {
  return pathname === "/api/admin/preprocess/recover-processing";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRequestRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error("请求内容必须是对象");
  }

  return body;
}

function parseOptionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${label}必须是正整数`);
  }

  return Number(value);
}

function supervisorStartLimit(body: Record<string, unknown>, sourceVideoIds?: string[]): number | undefined {
  const requestedLimit = parseOptionalPositiveInteger(body.limit, "本次限制");

  if (requestedLimit !== undefined) {
    return requestedLimit;
  }

  return sourceVideoIds?.length;
}

function queueUnprocessedLimit(body: Record<string, unknown>): number | undefined {
  return parseOptionalPositiveInteger(body.queue_unprocessed_limit, "未处理素材入队数量");
}

function parseOptionalSourceVideoIds(body: Record<string, unknown>): string[] | undefined {
  const single = body.source_video_id;
  const multiple = body.source_video_ids;
  const values = Array.isArray(multiple)
    ? multiple
    : typeof single === "string" ? [single] : [];
  const ids = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return undefined;
  }

  for (const id of ids) {
    if (!/^V\d{6}$/.test(id)) {
      throw new Error("指定素材ID必须是 V000001 格式");
    }
  }

  return [...new Set(ids)];
}

function bulkCommandForPath(pathname: string): AdminBulkPreprocessRouteCommand | null {
  if (matchAdminPreprocessQueueUnprocessedPath(pathname)) {
    return "preprocess-queue-unprocessed";
  }

  if (matchAdminPreprocessRetryFailedPath(pathname)) {
    return "preprocess-retry-failed";
  }

  if (matchAdminPreprocessRecoverProcessingPath(pathname)) {
    return "preprocess-recover-processing";
  }

  return null;
}

function recoverProcessingMessage(affectedCount: number): string {
  return affectedCount > 0
    ? `已恢复 ${affectedCount} 个停滞中的处理任务。`
    : "没有需要恢复的处理中任务。";
}

async function handleBulkPreprocessRoute<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult
>(input: {
  route_input: HandleAdminPreprocessCommandRoutesInput<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult
  >;
  command: AdminBulkPreprocessRouteCommand;
}): Promise<AdminPreprocessCommandRouteResult> {
  if (input.command === "preprocess-recover-processing") {
    const supervisorStatus = input.route_input.deps.read_preprocess_supervisor_status();
    const supervisorBlock = input.route_input.deps.recover_processing_supervisor_block({
      command: "preprocess-recover-processing",
      supervisor_state: supervisorStatus.state
    });

    if (supervisorBlock) {
      return {
        handled: true,
        status_code: 409,
        body: apiError(supervisorBlock.error_code, supervisorBlock.message)
      };
    }
  }

  let result: TBulkTransitionResult;
  try {
    result = await input.route_input.deps.run_bulk_transition_command({
      api_input: input.route_input.api_input,
      command: input.command
    });
  } catch (error) {
    const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
    if (dockerMvpBlock) {
      return dockerMvpBlock;
    }

    throw error;
  }
  input.route_input.deps.clear_source_video_page_cache(input.route_input.api_input.library_root);

  return {
    handled: true,
    status_code: 200,
    body: apiOk(input.command === "preprocess-recover-processing"
      ? {
          ...result,
          message: recoverProcessingMessage(result.affected_count)
        }
      : result)
  };
}

export async function handleAdminPreprocessCommandRoutes<
  TApiInput extends AdminPreprocessCommandRouteApiInput,
  TRuntimePolicy,
  TSafety,
  TSupervisorStatus,
  TBulkTransitionResult extends AdminBulkPreprocessRouteResult
>(
  input: HandleAdminPreprocessCommandRoutesInput<
    TApiInput,
    TRuntimePolicy,
    TSafety,
    TSupervisorStatus,
    TBulkTransitionResult
  >
): Promise<AdminPreprocessCommandRouteResult> {
  if (input.method === "POST" && matchAdminPreprocessSupervisorStartPath(input.pathname)) {
    try {
      const body = requireRequestRecord(await input.deps.read_request_json());
      const settings = await input.deps.read_admin_settings(input.api_input.library_root);
      await input.deps.refresh_runtime_secrets();
      input.deps.assert_real_preprocess_start_ready();
      const safety = await input.deps.read_preprocess_safety(input.api_input);

      try {
        input.deps.assert_preprocess_safe_to_start(safety);
      } catch (error) {
        const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
        if (dockerMvpBlock) {
          return dockerMvpBlock;
        }

        return {
          handled: true,
          status_code: 409,
          body: apiError(
            "preprocess_start_blocked",
            error instanceof Error ? error.message : "预处理启动门禁未通过",
            { safety }
          )
        };
      }

      const sourceVideoIds = parseOptionalSourceVideoIds(body);
      const queueLimit = queueUnprocessedLimit(body);
      if (queueLimit !== undefined) {
        const queued = await input.deps.run_bulk_transition_command({
          api_input: input.api_input,
          command: "preprocess-queue-unprocessed",
          limit: queueLimit
        });
        if (queued.affected_count > 0) {
          input.deps.clear_source_video_page_cache(input.api_input.library_root);
        }
      }

      const limit = supervisorStartLimit(body, sourceVideoIds);
      return {
        handled: true,
        status_code: 200,
        body: apiOk(input.deps.start_preprocess_supervisor({
          ...(limit !== undefined ? { limit } : {}),
          ...(sourceVideoIds ? { source_video_ids: sourceVideoIds } : {}),
          runtime_policy: settings.runtime_policy
        }))
      };
    } catch (error) {
      const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
      if (dockerMvpBlock) {
        return dockerMvpBlock;
      }

      return {
        handled: true,
        status_code: 400,
        body: apiError(
          "invalid_request",
          error instanceof Error ? error.message : "启动预处理服务失败"
        )
      };
    }
  }

  if (input.method === "POST" && matchAdminPreprocessSupervisorStopPath(input.pathname)) {
    try {
      return {
        handled: true,
        status_code: 200,
        body: apiOk(input.deps.stop_preprocess_supervisor())
      };
    } catch (error) {
      const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
      if (dockerMvpBlock) {
        return dockerMvpBlock;
      }

      throw error;
    }
  }

  const bulkCommand = bulkCommandForPath(input.pathname);
  if (input.method === "POST" && bulkCommand) {
    return handleBulkPreprocessRoute({
      route_input: input,
      command: bulkCommand
    });
  }

  return { handled: false };
}
