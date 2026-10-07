import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import path from "node:path";
import { resolveFfmpegRuntime, type FfmpegRuntime } from "../../ffmpeg-core/src/index.ts";
import { runProcess } from "./process.ts";
import { SmartAi } from "./ai.ts";
import { SmartLibrary } from "./library.ts";
import { SmartError, type Candidate, type Composition, type FacePoint, type Job, type OutputSettings } from "./types.ts";
import { atomicPrivateJson } from "./vault.ts";

export interface MediaInfo { width: number; height: number; duration_ms: number; audio: boolean }
export interface Caption { begin_ms: number; end_ms: number; text: string }
const safeAss = (text: string): string => text.replaceAll("\\", "＼").replaceAll("{", "｛").replaceAll("}", "｝").replace(/[\r\n]+/gu, " ");
function srtTime(milliseconds: number): string {
  const value = Math.max(0, Math.round(milliseconds));
  return `${String(Math.floor(value / 3_600_000)).padStart(2, "0")}:${String(Math.floor(value / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")},${String(value % 1000).padStart(3, "0")}`;
}
function assTime(milliseconds: number): string { return srtTime(milliseconds).replace(/^(\d\d):/, value => `${Number(value.slice(0, 2))}:`).replace(/,(\d\d)\d$/, ".$1"); }
export function captionsToSrt(captions: Caption[]): string {
  return captions.map((caption, index) => `${index + 1}\n${srtTime(caption.begin_ms)} --> ${srtTime(caption.end_ms)}\n${caption.text}\n`).join("\n");
}
export function captionsToAss(captions: Caption[], settings: OutputSettings, font: string): string {
  const width = settings.ratio === "9:16" ? 1080 : 1920, height = settings.ratio === "9:16" ? 1920 : 1080;
  const text = (value: string): string => {
    const chars = Array.from(safeAss(value)); const lines: string[] = [];
    const lineWidth = Math.max(8, Math.floor((width - 120) / settings.subtitle_size));
    for (let i = 0; i < chars.length; i += lineWidth) lines.push(chars.slice(i, i + lineWidth).join(""));
    return lines.join("\\N");
  };
  const primary = settings.subtitle_style === "yellow" ? "&H0000E9FF" : "&H00FFFFFF";
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${font},${settings.subtitle_size},${primary},&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2.4,1,2,60,60,100,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n` + captions.map(caption => `Dialogue: 0,${assTime(caption.begin_ms)},${assTime(caption.end_ms)},Default,,0,0,0,,${text(caption.text)}`).join("\n") + "\n";
}
export function positionExpression(points: FacePoint[], field: "x" | "y", fallback: number): string {
  if (!points.length) return String(fallback);
  let expression = String(points.at(-1)![field] ?? fallback);
  for (let index = points.length - 2; index >= 0; index--) {
    const a = points[index]!, b = points[index + 1]!;
    const start = a.at_ms / 1000, end = b.at_ms / 1000;
    const av = a[field] ?? fallback, bv = b[field] ?? fallback;
    if (end > start) expression = `if(lt(t,${end.toFixed(3)}),${av.toFixed(6)}+${(bv - av).toFixed(6)}*max(0,t-${start.toFixed(3)})/${(end - start).toFixed(3)},${expression})`;
  }
  return expression;
}
export function compositionFilter(settings: OutputSettings, composition?: Composition): string {
  const width = settings.ratio === "9:16" ? 1080 : 1920, height = settings.ratio === "9:16" ? 1920 : 1080;
  const ratio = width / height;
  if (settings.crop_mode === "fit") return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`;
  const x = settings.crop_mode === "follow" ? positionExpression(composition?.points ?? [], "x", 0.5) : String(settings.crop_position);
  const y = settings.crop_mode === "follow" ? `max(0,min(ih-oh,ih*(${positionExpression(composition?.points ?? [], "y", 0.3)})-oh*0.28))` : "(ih-oh)/2";
  return `crop=w='trunc(min(iw,ih*${ratio})/2)*2':h='trunc(min(ih,iw/${ratio})/2)*2':x='max(0,min(iw-ow,iw*(${x})-ow/2))':y='${y}',scale=${width}:${height},setsar=1,fps=30`;
}
export async function fileDigest(file: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer);
  return digest.digest("hex");
}
async function exists(file: string): Promise<boolean> { try { return (await stat(file)).isFile(); } catch { return false; } }
export async function ensureSpace(directory: string, requiredBytes: number): Promise<void> {
  const filesystem = await statfs(directory);
  if (filesystem.bavail * filesystem.bsize < requiredBytes) throw new SmartError("disk_space", "本机空间不足，请清理智能剪辑缓存或更换工作区", 409);
}

export class SmartMedia {
  readonly ffmpeg: FfmpegRuntime;
  private previews = new Map<string, Promise<string>>();
  constructor(readonly library: SmartLibrary, readonly ai: SmartAi, readonly fonts = process.env.MIXLAB_SMART_FONTS ?? "",
    private cachePolicy: () => { max_bytes: number; pinned: Set<string> } = () => ({ max_bytes: 30 * 1024 ** 3, pinned: new Set() })) {
    this.ffmpeg = resolveFfmpegRuntime();
    const nativeProbe = process.env.MIXLAB_SMART_FFPROBE_PATH || (process.platform === "darwin" && process.arch === "arm64"
      ? ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"].find(file => existsSync(file)) : undefined);
    if (nativeProbe) this.ffmpeg.ffprobe_path = nativeProbe;
  }
  async probe(file: string, signal?: AbortSignal): Promise<MediaInfo> {
    const output = await runProcess(this.ffmpeg.ffprobe_path, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", file], { signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]) });
    const data = JSON.parse(output) as { streams: Array<{ codec_type: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: Array<{ rotation?: number }> }>; format: { duration?: string } };
    const video = data.streams.find(stream => stream.codec_type === "video");
    if (!video?.width || !video.height) throw new SmartError("video_invalid", "媒体没有有效的视频轨道", 422);
    const rotation = Math.abs(Number(video.tags?.rotate ?? video.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? 0));
    return { width: rotation % 180 === 90 ? video.height : video.width, height: rotation % 180 === 90 ? video.width : video.height,
      duration_ms: Math.round(Number(data.format.duration ?? "0") * 1000), audio: data.streams.some(stream => stream.codec_type === "audio") };
  }
  async input(candidate: Candidate, cache: string, signal?: AbortSignal): Promise<string> {
    await mkdir(cache, { recursive: true });
    const destination = path.join(cache, `${candidate.id}.media`), metadata = `${destination}.json`;
    if (await exists(destination) && await exists(metadata)) {
      const saved = JSON.parse(await readFile(metadata, "utf8")) as { size: number; mtime_ms: number; original: Candidate["fingerprint"] };
      const info = await stat(destination);
      if (saved.original.size === candidate.fingerprint.size && saved.original.mtime_ms === candidate.fingerprint.mtime_ms && info.size === saved.size && info.mtimeMs === saved.mtime_ms) return destination;
    }
    const before = await stat(candidate.source_file_path).catch(() => { throw new SmartError("source_unavailable", "源视频不可读取，且本机没有可用缓存，请连接素材库", 409); });
    if (before.size !== candidate.fingerprint.size || Math.abs(before.mtimeMs - candidate.fingerprint.mtime_ms) > 1) throw new SmartError("source_changed", "源视频已经变化，请重新匹配，不能静默替换已确认素材", 409);
    await ensureSpace(cache, before.size + 128 * 1024 * 1024);
    const policy = this.cachePolicy();
    const records: Array<{ file: string; bytes: number; mtime: number; key: string }> = [];
    for (const entry of await readdir(cache, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{32}\.media$/.test(entry.name)) continue;
      const file = path.join(cache, entry.name), info = await stat(file);
      records.push({ file, bytes: info.size, mtime: info.mtimeMs, key: entry.name.replace(/\.media$/, "") });
    }
    let used = records.reduce((sum, item) => sum + item.bytes, 0);
    for (const item of records.sort((a, b) => a.mtime - b.mtime)) {
      if (used + before.size <= policy.max_bytes) break;
      if (policy.pinned.has(item.key) || item.file === destination) continue;
      await rm(item.file, { force: true }); await rm(`${item.file}.json`, { force: true }); used -= item.bytes;
    }
    if (used + before.size > policy.max_bytes) throw new SmartError("source_cache_limit", "素材缓存已达到上限，正在使用的缓存不会被清理，请提高上限或取消不再需要的任务", 409);
    const temporary = `${destination}.partial`;
    const digest = createHash("sha256");
    const hashStream = new Transform({ transform(chunk: Buffer, _encoding, callback) { digest.update(chunk); callback(null, chunk); } });
    await pipeline(createReadStream(candidate.source_file_path), hashStream, createWriteStream(temporary, { mode: 0o600 }), { signal });
    const copiedHash = digest.digest("hex"), expectedHash = candidate.content_hash?.replace(/^sha256:/i, "");
    if (expectedHash && /^[a-f0-9]{64}$/i.test(expectedHash) && copiedHash !== expectedHash.toLowerCase()) {
      await rm(temporary, { force: true }); throw new SmartError("source_hash_changed", "源视频与转写记录的内容校验不一致，请重新处理并发布素材", 409);
    }
    const after = await stat(candidate.source_file_path);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) { await rm(temporary, { force: true }); throw new SmartError("source_changed", "读取时源视频发生变化，请重试匹配", 409); }
    await rename(temporary, destination);
    const copied = await stat(destination);
    await atomicPrivateJson(metadata, { size: copied.size, mtime_ms: copied.mtimeMs, original: candidate.fingerprint, sha256: copiedHash });
    return destination;
  }
  async analyze(candidate: Candidate, source: string, temp: string, ratio: number, signal?: AbortSignal): Promise<Composition> {
    const folder = path.join(temp, `faces-${candidate.id}`); await mkdir(folder, { recursive: true });
    await runProcess(this.ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-ss", String(candidate.begin_ms / 1000), "-i", source, "-t", String((candidate.end_ms - candidate.begin_ms) / 1000), "-vf", "fps=1,scale=640:-2", "-threads", "2", path.join(folder, "frame-%04d.jpg")], { signal });
    const files = (await readdir(folder)).filter(file => /^frame-\d+\.jpg$/.test(file)).sort();
    if (!files.length) throw new SmartError("analysis_failed", "没有取得可分析的视频帧", 422);
    return this.ai.faces(files.map((file, index) => ({ file_path: path.join(folder, file), at_ms: index * 1000 })), ratio, signal);
  }
  async preview(candidate: Candidate, workspace: string): Promise<string> {
    const root = path.join(workspace, 'cache', 'previews'), file = path.join(root, `${candidate.id}.mp4`);
    if (await exists(file)) return file;
    if (!this.previews.has(file)) this.previews.set(file, (async () => {
      await mkdir(root, { recursive: true });
      const info = await stat(candidate.source_file_path).catch(() => { throw new SmartError('source_unavailable', '预览源素材不可读取，请连接公共素材库', 409); });
      if (info.size !== candidate.fingerprint.size || Math.abs(info.mtimeMs - candidate.fingerprint.mtime_ms) > 1) throw new SmartError('source_changed', '源素材已变化，请重新匹配', 409);
      await ensureSpace(root, 128 * 1024 * 1024);
      await runProcess(this.ffmpeg.ffmpeg_path, ['-hide_banner', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-ss', String(candidate.begin_ms / 1000), '-i', candidate.source_file_path,
        '-t', String((candidate.end_ms - candidate.begin_ms) / 1000), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=960:540:force_original_aspect_ratio=decrease,setsar=1',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', '-f', 'mp4', `${file}.partial`], { signal: AbortSignal.timeout(90_000) });
      await rename(`${file}.partial`, file); return file;
    })());
    try { return await this.previews.get(file)!; } finally { this.previews.delete(file); }
  }
  async render(job: Job, signal: AbortSignal, update: () => void): Promise<void> {
    const outputDirectory = path.dirname(job.output_path);
    const temp = path.join(job.workspace_root, "cache", "jobs", job.id);
    const cache = path.join(job.workspace_root, "cache", "source-videos");
    await mkdir(outputDirectory, { recursive: true });
    await mkdir(temp, { recursive: true });
    await ensureSpace(temp, 256 * 1024 * 1024);
    const captions: Caption[] = [], manifestSources: unknown[] = [];
    const files: string[] = []; let offset = 0;
    for (const [index, segment] of job.work.segments.entries()) {
      signal.throwIfAborted(); const candidate = segment.selected!;
      job.phase = `检查源素材 ${index + 1}/${job.work.segments.length}`; update();
      const source = await this.input(candidate, cache, signal);
      const probe = await this.probe(source, signal);
      if (!probe.audio) throw new SmartError("source_audio_missing", "源素材没有音轨，无法拼接原声，请替换片段", 422);
      if (candidate.end_ms > probe.duration_ms + 80) throw new SmartError("source_range", "源片段时间超出实际视频，请重新匹配", 409);
      const key = `${candidate.id}:${job.work.settings.ratio}`;
      if (job.work.settings.crop_mode === "follow" && !job.compositions[key]) {
        job.phase = `人物构图 ${index + 1}/${job.work.segments.length}`; update();
        const ratio = job.work.settings.ratio === "9:16" ? 9 / 16 : 16 / 9;
        job.compositions[key] = Math.abs(probe.width / probe.height - ratio) < 0.005
          ? { usable: true, reason: "保留原比例，无需裁切", points: [], multiple_faces: false }
          : await this.analyze(candidate, source, temp, ratio, signal);
        update();
      }
      if (job.work.settings.crop_mode === "follow" && !job.compositions[key]?.usable) throw new SmartError("composition_review", job.compositions[key]?.reason || "人物构图需要人工确认", 409);
      const clipName = `clip-${String(index + 1).padStart(3, "0")}.mp4`, clip = path.join(temp, clipName);
      if (!job.completed_clips.includes(clipName) || !(await exists(clip))) {
        job.phase = `原声剪辑 ${index + 1}/${job.work.segments.length}`; update();
        await runProcess(this.ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-i", source,
          "-ss", String(candidate.begin_ms / 1000), "-t", String((candidate.end_ms - candidate.begin_ms) / 1000),
          "-map", "0:v:0", "-map", "0:a:0", "-vf", `setpts=PTS-STARTPTS,${compositionFilter(job.work.settings, job.compositions[key])}`,
          "-af", job.work.settings.normalize_audio ? "asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11" : "asetpts=PTS-STARTPTS",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-threads", "2",
          "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1", "-f", "mp4", `${clip}.partial`], {
          signal, onLine: line => { if (signal.aborted) return; const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line); if (match) { const fraction = Math.min(1, Number(match[1]) / 1000 / (candidate.end_ms - candidate.begin_ms)); job.progress = Math.round((index + fraction) / job.work.segments.length * 75); update(); } }
        });
        await rename(`${clip}.partial`, clip);
        job.completed_clips.push(clipName); update();
      }
      const normalized = await this.probe(clip, signal);
      const detail = await this.library.source(this.library.getSnapshot(candidate.snapshot_id), candidate.source_video_id);
      for (const original of detail.transcript.segments.filter(item => candidate.segment_ids.includes(item.segment_id))) {
        const begin = Math.max(0, original.begin_ms - candidate.begin_ms), end = Math.min(normalized.duration_ms, original.end_ms - candidate.begin_ms);
        if (end > begin) captions.push({ begin_ms: offset + begin, end_ms: offset + end, text: original.text });
      }
      manifestSources.push({ source_video_id: candidate.source_video_id, snapshot_id: candidate.snapshot_id, segment_ids: candidate.segment_ids,
        begin_ms: candidate.begin_ms, end_ms: candidate.end_ms, actual: candidate.actual, original_fingerprint: candidate.fingerprint,
        output_begin_ms: offset, output_end_ms: offset + normalized.duration_ms });
      offset += normalized.duration_ms; files.push(clipName);
    }
    signal.throwIfAborted(); job.phase = "合并视频与字幕"; job.progress = 78; update();
    await writeFile(path.join(temp, "concat.txt"), files.map(file => `file '${file}'`).join("\n") + "\n");
    await writeFile(path.join(temp, "subtitles.ass"), captionsToAss(captions, job.work.settings, this.fonts ? "Noto Sans SC" : process.platform === "win32" ? "Microsoft YaHei" : "PingFang SC"));
    const fonts = this.fonts.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'");
    const filters = job.work.settings.subtitles ? ["-vf", `ass=filename='subtitles.ass'${fonts ? `:fontsdir='${fonts}'` : ""}`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-threads", "2"] : ["-c:v", "copy"];
    const result = path.join(temp, "result.partial.mp4");
    await runProcess(this.ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", ...filters,
      "-c:a", "copy", "-movflags", "+faststart", "-progress", "pipe:1", result], {
      signal, cwd: temp, onLine: line => { if (signal.aborted) return; const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line); if (match) { job.progress = 78 + Math.round(Math.min(1, Number(match[1]) / 1000 / offset) * 17); update(); } }
    });
    job.phase = "校验并保存"; job.progress = 96; update();
    const verified = await this.probe(result, signal);
    const width = job.work.settings.ratio === "9:16" ? 1080 : 1920, height = job.work.settings.ratio === "9:16" ? 1920 : 1080;
    if (!verified.audio || verified.width !== width || verified.height !== height || Math.abs(verified.duration_ms - offset) > 1000) throw new SmartError("output_validation", "成片媒体校验失败，未发布结果", 422);
    job.result_sha256 = await fileDigest(result); job.duration_ms = verified.duration_ms; update();
    if (await exists(job.output_path)) throw new SmartError("output_exists", "结果目录已存在视频，停止覆盖，请检查历史结果", 409);
    await writeFile(path.join(temp, "subtitles.srt"), captionsToSrt(captions));
    await rename(path.join(temp, "subtitles.srt"), path.join(outputDirectory, "subtitles.srt"));
    await atomicPrivateJson(job.manifest_path, { schema_version: "1.0", job_id: job.id, work_id: job.work_id, revision: job.revision,
      title: job.work.title, origin: job.work.origin, original_input_script: job.work.original_script, input_script: job.work.script, actual_script: job.work.segments.map(segment => segment.actual).join("\n"),
      settings: job.work.settings, sources: manifestSources, output: { file: "video.mp4", sha256: job.result_sha256, ...verified },
      generated_at: new Date().toISOString() });
    await rename(result, job.output_path);
    job.phase = "已完成"; job.progress = 100;
  }
}
