import { spawnSync } from "node:child_process";
import {
  buildFfmpegCoverImagePlan,
  resolveFfmpegRuntime
} from "../../ffmpeg-core/src/index.ts";
import type { ReadyPublishMedia } from "./admin-publish-commands.ts";

export interface AdminReadyPublishMediaDeps {
  resolve_ffmpeg_runtime?: typeof resolveFfmpegRuntime;
  build_cover_image_plan?: typeof buildFfmpegCoverImagePlan;
  run_process?: (executable: string, args: string[]) => void;
}

export function runAdminReadyPublishProcess(executable: string, args: string[]): void {
  const result = spawnSync(executable, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`${executable} 执行失败：${result.stderr}`);
  }
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

      runProcess(runtime.ffmpeg_path, plan.args);
    }
  };
}
