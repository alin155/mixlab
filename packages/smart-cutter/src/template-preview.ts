import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SmartMedia, captionsToAss, captionWarnings, compositionFilter, sourceRotationFilter, ensureSpace, type Caption } from "./media.ts";
import { runProcess } from "./process.ts";
import { unifyPortraits } from "./presentation.ts";
import { SmartError, includedSegments, workReady, type Work, type Job, type Composition } from "./types.ts";
import { atomicPrivateJson } from "./vault.ts";

export interface TemplatePreview { id: string; file: string; duration_ms: number; warnings: string[]; work: Work; workspace: string }
export async function renderTemplatePreview(media: SmartMedia, work: Work, workspace: string, jobs: Job[], signal: AbortSignal): Promise<TemplatePreview> {
  if (!workReady(work)) throw new SmartError("review_required", "请先审核或跳过未处理句段，再生成模板预览", 409);
  const id = createHash("sha256").update(JSON.stringify({ renderer: 1, work })).digest("hex");
  const root = path.join(workspace, "cache/template-previews", id), file = path.join(root, "preview.mp4");
  await mkdir(root, { recursive: true });
  const segments = includedSegments(work), compositions: Composition[] = [];
  const settings = work.settings;
  if (settings.subtitles) media.subtitleFilter(settings);
  await ensureSpace(root, 128 * 1024 * 1024);
  // Reuse measurements only for the exact source, rotation, ratio and shot mode. Subtitle edits never search/index the library.
  if (["portrait", "follow"].includes(settings.crop_mode)) {
    for (const segment of segments) {
      signal.throwIfAborted();
      const candidate = segment.selected!;
      const prior = jobs.find(job => job.status === "done" && job.work.settings.ratio === settings.ratio && job.work.settings.crop_mode === settings.crop_mode
        && (job.work.settings.shot_size ?? "medium") === (settings.shot_size ?? "medium")
        && includedSegments(job.work).some(item => item.selected?.id === candidate.id && (item.selected.rotation ?? 0) === (candidate.rotation ?? 0)));
      const key = `${candidate.id}:${candidate.rotation ? `r${candidate.rotation}:` : ""}${settings.ratio}${settings.crop_mode === "portrait" ? `:portrait:${settings.shot_size ?? "medium"}` : ""}`;
      const measurementId = createHash("sha256").update(JSON.stringify({ detector: 1, candidate, ratio: settings.ratio })).digest("hex");
      const measurementFile = path.join(workspace, "cache/template-previews", `measurement-${measurementId}.json`);
      const measured = await readFile(measurementFile, "utf8").then(text => JSON.parse(text) as Composition).catch(() => null);
      const saved = prior?.compositions[key] ?? (measured?.usable && Array.isArray(measured.points) ? measured : null);
      const composition = saved ? structuredClone(saved) : await media.analyze(candidate,
        await media.input(candidate, path.join(workspace, "cache/source-videos"), signal), root, settings.ratio === "9:16" ? 9 / 16 : 16 / 9, signal);
      if (!composition.usable) throw new SmartError("composition_review", composition.reason || "请先确认人物构图", 409);
      if (!saved) await atomicPrivateJson(measurementFile, composition);
      compositions.push(composition);
    }
    if (settings.crop_mode === "portrait") unifyPortraits(compositions, settings);
  }
  const captions: Caption[] = [], clips: string[] = []; let offset = 0;
  for (const [index, segment] of segments.entries()) {
    if (offset >= 8000) break;
    const candidate = segment.selected!, duration = Math.min(8000 - offset, candidate.end_ms - candidate.begin_ms);
    const name = `clip-${index}.mp4`;
    captions.push(...await media.sourceCaptions(candidate, duration, offset));
    clips.push(name); offset += duration;
  }
  const warnings = captionWarnings(captions, settings);
  const result = { id, file, duration_ms: offset, warnings, work, workspace };
  if ((await stat(file).catch(() => null))?.isFile()) return result;
  offset = 0;
  for (const [index, name] of clips.entries()) {
    const candidate = segments[index]!.selected!, duration = Math.min(8000 - offset, candidate.end_ms - candidate.begin_ms);
    const source = await media.input(candidate, path.join(workspace, "cache/source-videos"), signal);
    await runProcess(media.ffmpeg.ffmpeg_path, ["-v", "error", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-ss", String(candidate.begin_ms / 1000), "-i", source,
      "-t", String(duration / 1000), "-map", "0:v:0", "-map", "0:a:0", "-vf", `setpts=PTS-STARTPTS,${sourceRotationFilter(candidate.rotation)}${compositionFilter(settings, compositions[index])}`,
      "-af", settings.normalize_audio ? "asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11" : "asetpts=PTS-STARTPTS", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", path.join(root, name)], { signal });
    offset += duration;
  }
  await writeFile(path.join(root, "concat.txt"), clips.map(name => `file '${name}'`).join("\n") + "\n");
  if (settings.subtitles) await writeFile(path.join(root, "subtitles.ass"), captionsToAss(captions, settings, media.fonts ? "Noto Sans SC" : "PingFang SC"));
  const filters = settings.subtitles ? ["-vf", media.subtitleFilter(settings), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2"] : ["-c:v", "copy"];
  await runProcess(media.ffmpeg.ffmpeg_path, ["-v", "error", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", ...filters, "-c:a", "copy", "-movflags", "+faststart", "result.mp4"], { cwd: root, signal });
  const verified = await media.probe(path.join(root, "result.mp4"), signal);
  if (!verified.audio || Math.abs(verified.duration_ms - offset) > 200) throw new SmartError("preview_invalid", "短预览校验失败，请重试", 422);
  await rename(path.join(root, "result.mp4"), file);
  return { ...result, duration_ms: verified.duration_ms };
}
