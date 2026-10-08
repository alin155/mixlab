import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCutJob, getExportClipDetail } from "../../cutter-local/src/index.ts";
import type { SmartCore } from "./core.ts";
import type { BasicProject } from "./workspace.ts";
import { SmartError } from "./types.ts";
import { runProcess } from "./process.ts";
import { captionsToSrt, fileDigest } from "./media.ts";
import { atomicPrivateJson } from "./vault.ts";
export interface Assembly {
  id: string; project_id: string; title: string; cut_job_ids: string[];
  status: "queued" | "running" | "paused" | "failed" | "done" | "cancelled";
  phase: string; error: string; completed: number; duration_ms: number;
  output_path: string; workspace_root: string; created_at: string; updated_at: string;
}
export class Assemblies {
  private controller: AbortController | null = null;
  private closed = false;
  constructor(private core: SmartCore) {}
  initialize(): void {
    for (const job of this.core.store.listStatus<Assembly>("assembly", ["running"])) {
      job.status = "paused"; job.phase = "已保存检查点"; this.save(job);
    }
  }
  get busy(): boolean { return !!this.controller; }
  private save(job: Assembly): Assembly { job.updated_at = new Date().toISOString(); return this.core.store.set("assembly", job); }
  async submit(projectId: string, ids: unknown): Promise<Assembly> {
    const project = this.core.store.get<BasicProject>("project", projectId);
    if (!project) throw new SmartError("project_missing", "项目不存在", 404);
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== "string")) throw new SmartError("assembly_items", "请选择 1 至 200 个真实剪切任务");
    for (const id of ids) { const job = await getCutJob({ workspace_root: this.core.manual.workspace, cut_job_id: id }); if (!job || job.project_id !== projectId) throw new SmartError("assembly_scope", "只能合并当前项目的剪切任务"); }
    const id = `M-${randomUUID()}`, timestamp = new Date().toISOString();
    return this.save({ id, project_id: projectId, title: project.title, cut_job_ids: ids, status: "queued", phase: "等待片段剪切", error: "", completed: 0, duration_ms: 0,
      output_path: path.join(this.core.settings.workspace_root, "projects", projectId, "exports", id, "video.mp4"), workspace_root: this.core.settings.workspace_root, created_at: timestamp, updated_at: timestamp });
  }
  control(id: string, action: string): Assembly {
    const job = this.core.store.get<Assembly>("assembly", id);
    if (!job) throw new SmartError("assembly_missing", "合并任务不存在", 404);
    if (["resume", "retry"].includes(action) && ["paused", "failed"].includes(job.status)) {
      if (this.controller) throw new SmartError("assembly_busy", "本机正在处理合并，请稍后继续", 409);
      job.status = "queued"; job.error = ""; job.phase = "等待片段剪切";
    } else if (action === "cancel" && job.status !== "done") {
      if (job.status === "running") this.controller?.abort(); job.status = "cancelled"; job.phase = "已取消";
    } else throw new SmartError("assembly_action", "当前任务状态不支持此操作", 409);
    return this.save(job);
  }
  async drain(): Promise<void> {
    if (this.closed || this.controller || this.core.cacheClearing) return;
    const queued = this.core.store.listStatus<Assembly>("assembly", ["queued"])[0]; if (!queued) return;
    await this.core.requireSession();
    const jobs = await Promise.all(queued.cut_job_ids.map(id => getCutJob({ workspace_root: this.core.manual.workspace, cut_job_id: id })));
    if (jobs.some(job => !job || ["failed", "cancelled"].includes(job.status))) { queued.status = "failed"; queued.error = "有片段未完成，请在任务中心重试对应剪切，再重试合并"; this.save(queued); return; }
    if (jobs.some(job => job!.status !== "done")) return;
    const controller = new AbortController(); this.controller = controller;
    queued.status = "running"; queued.error = ""; queued.phase = "统一片段格式"; this.save(queued);
    try {
      const temp = path.join(queued.workspace_root, "cache", "assemblies", queued.id); await mkdir(temp, { recursive: true });
      const clips = await Promise.all(jobs.map(job => getExportClipDetail({ workspace_root: this.core.manual.workspace, export_clip_id: job!.export_clip_id! })));
      if (clips.some(clip => !clip)) throw new SmartError("clip_missing", "待合并的本地素材已删除", 409);
      const first = await this.core.media.probe(clips[0]!.media_file_path), portrait = first.height > first.width;
      const width = portrait ? 720 : 1280, height = portrait ? 1280 : 720;
      const files: string[] = [], captions: Array<{ begin_ms: number; end_ms: number; text: string }> = [], sources: unknown[] = [];
      let offset = 0;
      for (const [index, clip] of clips.entries()) {
        controller.signal.throwIfAborted(); await this.core.requireSession();
        const digest = await fileDigest(clip!.media_file_path), output = path.join(temp, `${index}.mp4`), marker = `${output}.json`;
        const checkpoint = JSON.parse(await readFile(marker, "utf8").catch(() => "{}")) as { source?: string; output?: string };
        const reusable = checkpoint.source === digest && !!(await stat(output).catch(() => null)) && checkpoint.output === await fileDigest(output);
        if (!reusable) {
          const probe = await this.core.media.probe(clip!.media_file_path);
          await runProcess(this.core.media.ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-i", clip!.media_file_path,
            ...(!probe.audio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : []),
            "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", output], { signal: controller.signal });
          await atomicPrivateJson(marker, { source: digest, output: await fileDigest(output) });
        }
        const probe = await this.core.media.probe(output);
        captions.push({ begin_ms: offset, end_ms: offset + probe.duration_ms, text: clip!.selected_text }); offset += probe.duration_ms;
        sources.push({ export_clip_id: clip!.export_clip_id, source_video_id: clip!.source_video_id, begin_ms: clip!.begin_ms, end_ms: clip!.end_ms, text: clip!.selected_text, sha256: digest });
        files.push(`file '${index}.mp4'`); queued.completed = index + 1; this.save(queued);
      }
      controller.signal.throwIfAborted(); queued.phase = "合并与校验"; this.save(queued);
      await writeFile(path.join(temp, "concat.txt"), files.join("\n")); await mkdir(path.dirname(queued.output_path), { recursive: true });
      const incoming = path.join(temp, "merged.mp4");
      await runProcess(this.core.media.ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "1", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", incoming], { cwd: temp, signal: controller.signal });
      const output = await this.core.media.probe(incoming); if (!output.audio || output.duration_ms <= 0) throw new SmartError("assembly_output", "合并结果校验失败");
      controller.signal.throwIfAborted(); await rename(incoming, queued.output_path);
      await writeFile(path.join(path.dirname(queued.output_path), "subtitles.srt"), captionsToSrt(captions));
      await atomicPrivateJson(path.join(path.dirname(queued.output_path), "sources.json"), { schema_version: "1.0", type: "manual_assembly", project_id: queued.project_id, sources, output: { sha256: await fileDigest(queued.output_path), duration_ms: output.duration_ms, width, height } });
      queued.status = "done"; queued.phase = "已完成"; queued.duration_ms = output.duration_ms; this.save(queued);
    } catch (error) {
      const current = this.core.store.get<Assembly>("assembly", queued.id)!;
      if (current.status !== "cancelled") { current.status = controller.signal.aborted ? "paused" : "failed"; current.error = this.core.vault.redact((error as Error).message); current.phase = controller.signal.aborted ? "已保存检查点" : "需处理"; this.save(current); }
    } finally { this.controller = null; }
  }
  async close(): Promise<void> {
    this.closed = true; this.controller?.abort(); const deadline = Date.now() + 3000;
    while (this.controller && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  }
}
