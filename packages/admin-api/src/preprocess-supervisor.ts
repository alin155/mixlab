import type { AdminRuntimePolicy } from "../../library-fs/src/index.ts";
import type { RunLibraryTextPreprocessWorkerResult } from "../../preprocess-core/src/index.ts";

export type PreprocessSupervisorState = "idle" | "running" | "stopping" | "failed";

export interface PreprocessSupervisorRunInput {
  limit?: number;
  runtime_policy: AdminRuntimePolicy;
  should_stop?: () => boolean;
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

      void input.runner.runOnce({
        ...runInput,
        should_stop: () => status.stop_requested || runInput.should_stop?.() === true
      })
        .then((result) => {
          status.last_result = result;
          status.state = "idle";
          status.stopped_at = now();
          status.stop_requested = false;
        })
        .catch((error) => {
          status.last_error = errorMessage(error);
          status.state = "failed";
          status.stopped_at = now();
          status.stop_requested = false;
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
