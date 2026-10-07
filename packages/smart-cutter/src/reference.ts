import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createFetchDashScopeHttpClient, createDashScopeTemporaryFileAudioUploader,
  buildDashScopeSubmitTranscriptionRequest, buildDashScopeQueryTaskRequest,
  convertDashScopeTranscriptionToMixlabTranscript,
  type DashScopeTranscriptionResult, type DashScopeTemporaryFileHttpClient
} from "../../asr-core/src/index.ts";
import { SmartStore } from "./store.ts";
import { CredentialVault } from "./vault.ts";
import { TikHubClient } from "./tikhub.ts";
import { SmartMedia, ensureSpace } from "./media.ts";
import { downloadPublicFile } from "./download.ts";
import { runProcess } from "./process.ts";
import { SmartError, type HotVideo, type Settings } from "./types.ts";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export class ReferenceProcessor {
  private running = new Map<string, Promise<HotVideo>>();
  constructor(private store: SmartStore, private vault: CredentialVault, private provider: TikHubClient,
    private media: SmartMedia, private settings: () => Settings, private asr?: DashScopeTemporaryFileHttpClient) {}
  process(id: string): Promise<HotVideo> {
    const current = this.store.get<HotVideo>("hot", id);
    if (!current) throw new SmartError("hot_missing", "未找到参考视频", 404);
    if (current.status === "ready" && current.transcript) return Promise.resolve(current);
    if (!this.running.has(id)) {
      const operation = this.transcribe(current).finally(() => this.running.delete(id));
      this.running.set(id, operation);
    }
    return this.running.get(id)!;
  }
  get active(): number { return this.running.size; }
  private async reserveCache(bytes: number): Promise<void> {
    const config = this.settings(), root = path.join(config.workspace_root, 'cache', 'references');
    await mkdir(root, { recursive: true });
    const max = config.reference_cache_gb * 1024 ** 3;
    const records: Array<{ id: string; files: string[]; bytes: number; time: number }> = [];
    for (const hot of this.store.list<HotVideo>('hot', 100_000)) {
      const folder = path.join(root, createHash('sha256').update(hot.id).digest('hex').slice(0, 32));
      const files: string[] = []; let size = 0, time = 0;
      for (const name of await readdir(folder).catch(() => [])) {
        if (!['reference.mp4', 'speech.mp3'].includes(name)) continue;
        const file = path.join(folder, name), info = await stat(file);
        files.push(file); size += info.size; time = Math.max(time, info.mtimeMs);
      }
      if (size) records.push({ id: hot.id, files, bytes: size, time });
    }
    let used = records.reduce((sum, item) => sum + item.bytes, 0);
    for (const record of records.sort((a, b) => a.time - b.time)) {
      if (used + bytes <= max) break;
      if (this.running.has(record.id)) continue;
      for (const file of record.files) await rm(file, { force: true });
      used -= record.bytes;
      const hot = this.store.get<HotVideo>('hot', record.id)!;
      hot.local_video_path = ''; hot.local_audio_path = ''; this.store.set('hot', hot);
    }
    if (used + bytes > max) throw new SmartError('reference_cache_limit', '参考视频缓存达到上限，请提高缓存上限或降低单视频下载上限', 409);
  }
  private async transcribe(hot: HotVideo): Promise<HotVideo> {
    const config = this.settings();
    const key = this.vault.get("dashscope");
    if (!key) throw new SmartError("asr_key_missing", "请在设置中配置口播转写的 DashScope Key，视频标题不能替代口播文案", 409);
    const http = this.asr ?? createFetchDashScopeHttpClient((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }));
    const folder = path.join(config.workspace_root, "cache", "references", createHash("sha256").update(hot.id).digest("hex").slice(0, 32));
    await mkdir(folder, { recursive: true });
    const persist = () => { hot.updated_at = new Date().toISOString(); this.store.set("hot", hot); };
    try {
      const video = path.join(folder, "reference.mp4"), audio = path.join(folder, "speech.mp3");
      if (!(await stat(video).catch(() => null))?.isFile()) {
        hot.status = "downloading"; hot.error = ""; persist();
        await this.reserveCache(config.max_download_mb * 1024 * 1024 * 1.2);
        await ensureSpace(folder, config.max_download_mb * 1024 * 1024 + 128 * 1024 * 1024);
        const detail = await this.provider.video(hot.platform, hot.video_id);
        hot.download_url = detail.download_url;
        await downloadPublicFile(detail.download_url, video, config.max_download_mb * 1024 * 1024);
        const info = await this.media.probe(video);
        if (!info.audio) throw new SmartError("reference_audio_missing", "参考视频没有音轨，不能提取口播文案", 422);
        hot.duration_ms = info.duration_ms;
      }
      hot.local_video_path = video; persist();
      if (!(await stat(audio).catch(() => null))?.isFile()) {
        await runProcess(this.media.ffmpeg.ffmpeg_path, ["-hide_banner", "-nostdin", "-y", "-i", video, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", audio]);
      }
      hot.local_audio_path = audio; hot.status = "transcribing"; hot.error = ""; persist();
      if (hot.asr_model && hot.asr_model !== config.asr_model) throw new SmartError("asr_model_changed", "此参考视频的转写任务使用了其他模型，请明确重新转写后再处理", 409);
      if (!hot.asr_task_id) {
        if (hot.asr_submitted_at) throw new SmartError("asr_submission_unknown", "上次转写提交结果未知，为避免重复收费，请核对语音服务任务后明确重新提交", 409);
        const uploader = createDashScopeTemporaryFileAudioUploader({ api_key: key, model: config.asr_model, http });
        const upload = await uploader.uploadAsrAudio({ local_file_path: audio });
        hot.asr_submitted_at = new Date().toISOString(); persist();
        const submitted = record(await http.requestJson(buildDashScopeSubmitTranscriptionRequest({ api_key: key, model: config.asr_model, file_urls: [upload.file_url], parameters: { channel_id: [0], language_hints: ["zh", "en"] } })));
        const output = record(submitted.output);
        if (typeof output.task_id !== "string" || !output.task_id) throw new SmartError("asr_submission", "语音服务没有返回有效任务 ID，未完成转写", 502);
        hot.asr_task_id = output.task_id; hot.asr_model = config.asr_model; persist();
      }
      let transcriptUrl = "";
      for (let attempt = 0; attempt < 100; attempt++) {
        const query = buildDashScopeQueryTaskRequest({ api_key: key, task_id: hot.asr_task_id });
        // The current task-query contract is GET; preserve the legacy ASR helper for existing clients.
        const queried = record(await http.requestJson({ ...query, method: 'GET' }));
        const output = record(queried.output);
        if (output.task_status === "FAILED") throw new SmartError("asr_failed", "口播转写任务失败；已保存任务 ID，重试不会自动重复提交收费任务", 422);
        if (output.task_status === "SUCCEEDED") {
          const results = Array.isArray(output.results) ? output.results.map(record) : [];
          transcriptUrl = String(results.find(item => typeof item.transcription_url === "string")?.transcription_url ?? "");
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      if (!transcriptUrl.startsWith("https://")) throw new SmartError("asr_waiting", "语音转写尚未返回可用结果，已保留任务以便继续查询", 503);
      const transcript = convertDashScopeTranscriptionToMixlabTranscript({ source_video_id: hot.video_id,
        model: hot.asr_model, generated_at: new Date().toISOString(), result: await http.getJson(transcriptUrl) as DashScopeTranscriptionResult });
      if (!transcript.full_text.trim()) throw new SmartError("asr_empty", "视频没有识别出可用口播，不会用视频标题冒充文案", 422);
      await writeFile(path.join(folder, "transcript.json"), JSON.stringify(transcript, null, 2));
      hot.transcript = transcript.full_text; hot.status = "ready"; hot.error = ""; persist();
      return hot;
    } catch (error) {
      hot.status = "failed";
      hot.error = this.vault.redact(error instanceof SmartError ? error.message : "参考视频处理失败，请检查网络、转写服务和本机文件");
      persist(); throw error;
    }
  }
}
