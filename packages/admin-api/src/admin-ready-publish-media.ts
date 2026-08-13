import { spawn } from "node:child_process";
import {
  buildFfmpegCoverImagePlan,
  resolveFfmpegRuntime
} from "../../ffmpeg-core/src/index.ts";
import type { ReadyPublishMedia } from "./admin-publish-commands.ts";

export interface AdminReadyPublishMediaDeps {
  resolve_ffmpeg_runtime?: typeof resolveFfmpegRuntime;
  build_cover_image_plan?: typeof buildFfmpegCoverImagePlan;
  run_process?: (executable: string, args: string[]) => Promise<void> | void;
}

export function runAdminReadyPublishProcess(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`${executable} 执行失败：${error.message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${executable} 执行失败：${stderr}`));
        return;
      }

      resolve();
    });
  });
}

export function createDefaultReadyPublishMedia(
  deps: AdminReadyPublishMediaDeps = {}
): ReadyPublishMedia {
  const resolveRuntime = deps.resolve_ffmpeg_runtime ?? resolveFfmpegRuntime;
  const buildCoverPlan = deps.build_cover_image_plan ?? buildFfmpegCoverImagePlan;
  const runProcess = deps.run_process ?? runAdminReadyPublishProcess;

  return {
    async create_cover(input) {
      const runtime = resolveRuntime();
      const plan = buildCoverPlan({
        source_path: input.source_path,
        output_path: input.output_path,
        at_ms: input.at_ms,
        width: input.width
      });

      await runProcess(runtime.ffmpeg_path, plan.args);
    }
  };
}
