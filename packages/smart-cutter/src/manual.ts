import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createCutterApiServer, type CreateCutterApiServerInput } from "../../cutter-api/src/index.ts";
import { buildFfmpegCutPlan, buildFfmpegCoverImagePlan } from "../../ffmpeg-core/src/index.ts";
import { listCutJobs, recoverInterruptedCutJobs } from "../../cutter-local/src/index.ts";
import { runProcess } from "./process.ts";
import { SmartError } from "./types.ts";
import type { SmartCore } from "./core.ts";

/** The mature cutter handler shares the authenticated local server; it never listens on another port. */
export class ManualCutter {
  private input: CreateCutterApiServerInput;
  private handler: ReturnType<typeof createCutterApiServer>;
  private controllers = new Set<AbortController>();
  private closed = false;
  constructor(private core: SmartCore) {
    this.input = { library_root: core.settings.library_root, workspace_root: this.workspace,
      release_cache_root: path.join(this.workspace, "cache"), auth_mode: core.options.auth_mode ?? "reviewed",
      trusted_user_id: "local-test", trusted_username: "本机测试", auto_run_cut_queue: true,
      source_video_cache_max_bytes: core.settings.source_cache_gb * 1024 ** 3,
      cover_runner: async input => {
        if (this.closed) throw new SmartError("engine_stopped", "引擎正在退出");
        const controller = new AbortController(); this.controllers.add(controller);
        try { const plan = buildFfmpegCoverImagePlan({ source_path: input.source_video_path, output_path: input.output_path, at_ms: input.at_ms, width: input.width });
          await runProcess(this.core.media.ffmpeg.ffmpeg_path, plan.args, { signal: controller.signal });
        } finally { this.controllers.delete(controller); }
      },
      cut_runner: async input => {
        if (this.closed) throw new SmartError("engine_stopped", "应用已退出，请重新启动并重试剪切");
        await this.core.requireSession();
        const controller = new AbortController(); this.controllers.add(controller);
        try {
          const plan = buildFfmpegCutPlan({ source_path: input.source_video_path,
            output_path: input.output_path, begin_ms: input.begin_ms, end_ms: input.end_ms,
            cut_mode: input.cut_mode });
          await runProcess(this.core.media.ffmpeg.ffmpeg_path, plan.args, { signal: controller.signal });
        } finally { this.controllers.delete(controller); }
      }
    };
    this.handler = createCutterApiServer(this.input);
  }
  get workspace(): string { return path.join(this.core.settings.workspace_root, "manual"); }
  async initialize(): Promise<void> { await recoverInterruptedCutJobs(this.workspace); }
  update(): void {
    this.input.library_root = this.core.settings.library_root;
    this.input.workspace_root = this.workspace;
    this.input.release_cache_root = path.join(this.workspace, "cache");
    this.input.source_video_cache_max_bytes = this.core.settings.source_cache_gb * 1024 ** 3;
  }
  async busy(): Promise<boolean> {
    return this.controllers.size > 0 || (await listCutJobs({ workspace_root: this.workspace })).jobs.some(job => ["pending", "running"].includes(job.status));
  }
  dispatch(request: IncomingMessage, response: ServerResponse): void {
    if (this.closed) throw new SmartError("engine_stopped", "本机引擎正在退出", 503);
    const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (!/^\/cutter\/(?:source-library|source-folders|source-search|source-videos|local-clips|clip-lists|cut-jobs|workspace|projects|runtime-status)(?:\/|$)/.test(route)) throw new SmartError("route_missing", "该操作不在统一端基础剪辑接口中", 404);
    Object.assign(request.headers, this.core.cutterSessionHeaders());
    this.handler.emit("request", request, response);
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    const deadline = Date.now() + 3000;
    while (this.controllers.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  }
}
