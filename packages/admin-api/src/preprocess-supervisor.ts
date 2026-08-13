import type { AdminRuntimePolicy } from "../../library-fs/src/index.ts";
import type { RunLibraryTextPreprocessWorkerResult } from "../../preprocess-core/src/index.ts";

export type PreprocessSupervisorState = "idle" | "running" | "stopping" | "failed";

export interface PreprocessSupervisorRunInput {
  limit?: number;
  source_video_ids?: string[];
  asr_mode?: "default" | "long-task";
  runtime_policy: AdminRuntimePolicy;
  should_stop?: () => boolean;
  on_progress?: (result: RunLibraryTextPreprocessWorkerResult) => void;
  on_current_job?: (input: { source_video_id: string; stage: string; now: string }) => Promise<void> | void;
}

export interface PreprocessSupervisorRunner {
  runOnce(input: PreprocessSupervisorRunInput): Promise<RunLibraryTextPreprocessWorkerResult>;
}

export interface PreprocessSupervisorStatus {
  state: PreprocessSupervisorState;
  state_label: string;
  worker_id: string;
  started_at: string;
  stopped_at: string;
  last_error: string;
  stop_requested: boolean;
  current_source_video_id: string;
  current_stage: string;
  current_updated_at: string;
  last_result: RunLibraryTextPreprocessWorkerResult | null;
}

export interface CreatePreprocessSupervisorInput {
  runner: PreprocessSupervisorRunner;
  worker_id: string;
  now?: () => string;
}

function stateLabel(state: PreprocessSupervisorState): string {
  const labels: Record<PreprocessSupervisorState, string> = {
    idle: "未运行",
    running: "运行中",
    stopping: "停止中",
    failed: "异常"
  };

  return labels[state];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPreprocessSupervisor(input: CreatePreprocessSupervisorInput) {
  const now = input.now ?? (() => new Date().toISOString());
  const status: Omit<PreprocessSupervisorStatus, "state_label"> = {
    state: "idle",
    worker_id: input.worker_id,
    started_at: "",
    stopped_at: "",
    last_error: "",
    stop_requested: false,
    current_source_video_id: "",
    current_stage: "",
    current_updated_at: "",
    last_result: null
  };

  function snapshot(): PreprocessSupervisorStatus {
    return {
      ...status,
      state_label: stateLabel(status.state)
    };
  }

  return {
    status: snapshot,
    start(runInput: PreprocessSupervisorRunInput): PreprocessSupervisorStatus {
      if (status.state === "running" || status.state === "stopping") {
        return snapshot();
      }

      status.state = "running";
      status.started_at = now();
      status.stopped_at = "";
      status.last_error = "";
      status.stop_requested = false;
      status.current_source_video_id = "";
      status.current_stage = "";
      status.current_updated_at = "";
      status.last_result = null;

      void input.runner.runOnce({
        ...runInput,
        should_stop: () => status.stop_requested || runInput.should_stop?.() === true,
        on_current_job: (current) => {
          status.current_source_video_id = current.source_video_id;
          status.current_stage = current.stage;
          status.current_updated_at = current.now;
          runInput.on_current_job?.(current);
        },
        on_progress: (result) => {
          status.last_result = result;
          runInput.on_progress?.(result);
        }
      })
        .then((result) => {
          status.last_result = result;
          status.state = "idle";
          status.stopped_at = now();
          status.stop_requested = false;
          status.current_source_video_id = "";
          status.current_stage = "";
          status.current_updated_at = "";
        })
        .catch((error) => {
          status.last_error = errorMessage(error);
          status.state = "failed";
          status.stopped_at = now();
          status.stop_requested = false;
          status.current_stage = "failed";
        });

      return snapshot();
    },
    stop(): PreprocessSupervisorStatus {
      if (status.state === "running") {
        status.state = "stopping";
        status.stop_requested = true;
      }

      return snapshot();
    }
  };
}
