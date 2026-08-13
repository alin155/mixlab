import type { PreprocessSupervisorStatus } from "./preprocess-supervisor.ts";

export interface PublicPreprocessSupervisorStatus {
  state: PreprocessSupervisorStatus["state"];
  state_label: string;
  worker_id: string;
  started_at: string;
  stopped_at: string;
  last_error: string;
  stop_requested: boolean;
  current_source_video_id: string;
  current_stage: string;
  current_updated_at: string;
  last_result: {
    total_claimed_count: number;
    succeeded_count: number;
    failed_count: number;
  } | null;
}

export function toPublicPreprocessSupervisorStatus(
  status: PreprocessSupervisorStatus
): PublicPreprocessSupervisorStatus {
  return {
    state: status.state,
    state_label: status.state_label,
    worker_id: status.worker_id,
    started_at: status.started_at,
    stopped_at: status.stopped_at,
    last_error: status.last_error,
    stop_requested: status.stop_requested,
    current_source_video_id: status.current_source_video_id,
    current_stage: status.current_stage,
    current_updated_at: status.current_updated_at,
    last_result: status.last_result
      ? {
          total_claimed_count: status.last_result.total_claimed_count,
          succeeded_count: status.last_result.succeeded_count,
          failed_count: status.last_result.failed_count
        }
      : null
  };
}
