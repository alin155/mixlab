import {
  adminDockerMvpCommandBlockedRouteError,
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";
import { matchAdminSourceVideoCoverPath } from "./admin-source-video-media-routes.ts";

export interface AdminSourceVideoCommandRouteApiInput {
  library_root: string;
}

export interface AdminSourceVideoCommandRouteCommandInput<TApiInput extends AdminSourceVideoCommandRouteApiInput> {
  api_input: TApiInput;
  source_video_id: string;
  body: unknown;
}

export type AdminSourceVideoTransitionRouteCommand =
  | "source-video-queue"
  | "source-video-retry"
  | "source-video-recover-processing";

export interface AdminSourceVideoTransitionRouteCommandInput<TApiInput extends AdminSourceVideoCommandRouteApiInput> {
  api_input: TApiInput;
  source_video_id: string;
  command: AdminSourceVideoTransitionRouteCommand;
}

export interface AdminSourceVideoPublishRouteCommandInput<TApiInput extends AdminSourceVideoCommandRouteApiInput> {
  api_input: TApiInput;
  source_video_id: string;
}

export interface AdminSourceVideoTransitionRouteResult {
  affected_count: number;
}

export interface AdminSourceVideoRecoverSupervisorStatus {
  state: string;
}

export interface AdminSourceVideoRecoverSupervisorBlock {
  error_code: string;
  message: string;
}

export interface AdminSourceVideoCommandRouteDeps<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic
> {
  read_request_json(): Promise<unknown>;
  run_cover_command(input: AdminSourceVideoCommandRouteCommandInput<TApiInput>): Promise<TManifest | null>;
  run_metadata_command(
    input: AdminSourceVideoCommandRouteCommandInput<TApiInput> & { body: Record<string, unknown> }
  ): Promise<TManifest | null>;
  run_transition_command(
    input: AdminSourceVideoTransitionRouteCommandInput<TApiInput>
  ): Promise<AdminSourceVideoTransitionRouteResult>;
  read_preprocess_supervisor_status(): AdminSourceVideoRecoverSupervisorStatus;
  recover_processing_supervisor_block(
    input: { command: "source-video-recover-processing"; supervisor_state: string }
  ): AdminSourceVideoRecoverSupervisorBlock | null;
  run_publish_command(input: AdminSourceVideoPublishRouteCommandInput<TApiInput>): Promise<unknown>;
  to_public_source_video(manifest: TManifest): TPublic;
  clear_source_video_page_cache(libraryRoot: string): void;
}

export type AdminSourceVideoCommandRouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminSourceVideoCommandRoutesInput<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic
> {
  method: string;
  pathname: string;
  api_input: TApiInput;
  deps: AdminSourceVideoCommandRouteDeps<TApiInput, TManifest, TPublic>;
}

export function matchAdminSourceVideoMetadataPath(pathname: string): string | null {
  const match = /^\/api\/admin\/source-videos\/(V\d{6})\/metadata$/.exec(pathname);
  return match?.[1] ?? null;
}

export function matchAdminSourceVideoQueuePath(pathname: string): string | null {
  const match = /^\/api\/admin\/source-videos\/(V\d{6})\/queue$/.exec(pathname);
  return match?.[1] ?? null;
}

export function matchAdminSourceVideoRetryPath(pathname: string): string | null {
  const match = /^\/api\/admin\/source-videos\/(V\d{6})\/retry$/.exec(pathname);
  return match?.[1] ?? null;
}

export function matchAdminSourceVideoRecoverProcessingPath(pathname: string): string | null {
  const match = /^\/api\/admin\/source-videos\/(V\d{6})\/recover-processing$/.exec(pathname);
  return match?.[1] ?? null;
}

export function matchAdminSourceVideoPublishPath(pathname: string): string | null {
  const match = /^\/api\/admin\/source-videos\/(V\d{6})\/publish$/.exec(pathname);
  return match?.[1] ?? null;
}

function transitionMessage(input: {
  command: AdminSourceVideoTransitionRouteCommand;
  source_video_id: string;
  affected_count: number;
}): string {
  if (input.command === "source-video-queue") {
    return input.affected_count > 0
      ? `已将 ${input.source_video_id} 加入预处理队列。`
      : `${input.source_video_id} 当前状态不能加入预处理队列。`;
  }

  if (input.command === "source-video-retry") {
    return input.affected_count > 0
      ? `已将 ${input.source_video_id} 重新加入预处理队列。`
      : `${input.source_video_id} 当前状态不能重试。`;
  }

  return input.affected_count > 0
    ? `已将 ${input.source_video_id} 从处理中恢复到预处理队列。`
    : `${input.source_video_id} 当前状态不能恢复。`;
}

function dockerMvpCommandBlockedResult(error: unknown): AdminSourceVideoCommandRouteResult | null {
  const dockerMvpBlock = adminDockerMvpCommandBlockedRouteError(error);
  return dockerMvpBlock
    ? {
        handled: true,
        ...dockerMvpBlock
      }
    : null;
}

async function handleTransitionCommandRoute<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic
>(input: {
  route_input: HandleAdminSourceVideoCommandRoutesInput<TApiInput, TManifest, TPublic>;
  source_video_id: string;
  command: AdminSourceVideoTransitionRouteCommand;
}): Promise<AdminSourceVideoCommandRouteResult> {
  if (input.command === "source-video-recover-processing") {
    const supervisorStatus = input.route_input.deps.read_preprocess_supervisor_status();
    const supervisorBlock = input.route_input.deps.recover_processing_supervisor_block({
      command: "source-video-recover-processing",
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

  try {
    const result = await input.route_input.deps.run_transition_command({
      api_input: input.route_input.api_input,
      source_video_id: input.source_video_id,
      command: input.command
    });
    input.route_input.deps.clear_source_video_page_cache(input.route_input.api_input.library_root);

    return {
      handled: true,
      status_code: 200,
      body: apiOk({
        ...result,
        message: transitionMessage({
          command: input.command,
          source_video_id: input.source_video_id,
          affected_count: result.affected_count
        })
      })
    };
  } catch (error) {
    const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
    if (dockerMvpBlock) {
      return dockerMvpBlock;
    }

    throw error;
  }
}

export async function handleAdminSourceVideoCommandRoutes<
  TApiInput extends AdminSourceVideoCommandRouteApiInput,
  TManifest,
  TPublic
>(
  input: HandleAdminSourceVideoCommandRoutesInput<TApiInput, TManifest, TPublic>
): Promise<AdminSourceVideoCommandRouteResult> {
  const coverSourceVideoId = matchAdminSourceVideoCoverPath(input.pathname);
  if (input.method === "PATCH" && coverSourceVideoId) {
    try {
      const updated = await input.deps.run_cover_command({
        api_input: input.api_input,
        source_video_id: coverSourceVideoId,
        body: await input.deps.read_request_json()
      });

      if (!updated) {
        return {
          handled: true,
          status_code: 404,
          body: apiError("not_found", "原视频不存在")
        };
      }

      input.deps.clear_source_video_page_cache(input.api_input.library_root);
      return {
        handled: true,
        status_code: 200,
        body: apiOk(input.deps.to_public_source_video(updated))
      };
    } catch (error) {
      const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
      if (dockerMvpBlock) {
        return dockerMvpBlock;
      }

      const message = error instanceof SyntaxError ? "请求 JSON 格式无效" : (error as Error).message;
      return {
        handled: true,
        status_code: 400,
        body: apiError("invalid_request", message)
      };
    }
  }

  const metadataSourceVideoId = matchAdminSourceVideoMetadataPath(input.pathname);
  if (input.method === "PATCH" && metadataSourceVideoId) {
    try {
      const updated = await input.deps.run_metadata_command({
        api_input: input.api_input,
        source_video_id: metadataSourceVideoId,
        body: await input.deps.read_request_json() as Record<string, unknown>
      });

      if (!updated) {
        return {
          handled: true,
          status_code: 404,
          body: apiError("not_found", "原视频不存在")
        };
      }

      input.deps.clear_source_video_page_cache(input.api_input.library_root);
      return {
        handled: true,
        status_code: 200,
        body: apiOk(input.deps.to_public_source_video(updated))
      };
    } catch (error) {
      const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
      if (dockerMvpBlock) {
        return dockerMvpBlock;
      }

      throw error;
    }
  }

  const queueSourceVideoId = matchAdminSourceVideoQueuePath(input.pathname);
  if (input.method === "POST" && queueSourceVideoId) {
    return handleTransitionCommandRoute({
      route_input: input,
      source_video_id: queueSourceVideoId,
      command: "source-video-queue"
    });
  }

  const retrySourceVideoId = matchAdminSourceVideoRetryPath(input.pathname);
  if (input.method === "POST" && retrySourceVideoId) {
    return handleTransitionCommandRoute({
      route_input: input,
      source_video_id: retrySourceVideoId,
      command: "source-video-retry"
    });
  }

  const recoverProcessingSourceVideoId = matchAdminSourceVideoRecoverProcessingPath(input.pathname);
  if (input.method === "POST" && recoverProcessingSourceVideoId) {
    return handleTransitionCommandRoute({
      route_input: input,
      source_video_id: recoverProcessingSourceVideoId,
      command: "source-video-recover-processing"
    });
  }

  const publishSourceVideoId = matchAdminSourceVideoPublishPath(input.pathname);
  if (input.method === "POST" && publishSourceVideoId) {
    try {
      const result = await input.deps.run_publish_command({
        api_input: input.api_input,
        source_video_id: publishSourceVideoId
      });
      input.deps.clear_source_video_page_cache(input.api_input.library_root);

      return {
        handled: true,
        status_code: 200,
        body: apiOk(result)
      };
    } catch (error) {
      const dockerMvpBlock = dockerMvpCommandBlockedResult(error);
      if (dockerMvpBlock) {
        return dockerMvpBlock;
      }

      throw error;
    }
  }

  return { handled: false };
}
