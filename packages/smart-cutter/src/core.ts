import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loginCutterAccount, registerCutterAccount, logoutCutterSession, validateCutterSession, publicCutterUser } from "../../library-fs/src/index.ts";
import { SmartStore, localDay } from "./store.ts";
import { CredentialVault, atomicPrivateJson } from "./vault.ts";
import { SmartAi, type AiRuntime } from "./ai.ts";
import { SmartLibrary, classifyMatch } from "./library.ts";
import { SmartMedia, fileDigest } from "./media.ts";
import { TikHubClient, type ProviderPage } from "./tikhub.ts";
import { ReferenceProcessor } from "./reference.ts";
import { runProcess } from "./process.ts";
import type { DashScopeTemporaryFileHttpClient } from '../../asr-core/src/index.ts';
import { DEFAULT_OUTPUT, SmartError, automaticTitle, splitScript, workReady, boundedNumber, requireText, validatePlatform,
  type Settings, type Work, type WorkSegment, type WorkOrigin, type Job, type Account, type HotVideo, type Rule, type OutputSettings } from "./types.ts";

const now = (): string => new Date().toISOString();
const id = (prefix: string): string => `${prefix}-${randomUUID()}`;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fileExists = async (file: string): Promise<boolean> => !!(await stat(file).catch(() => null))?.isFile();

export interface CoreOptions { state_root: string; workspace_root?: string; ai: AiRuntime; auth_mode?: "reviewed" | "local_trusted"; provider?: TikHubClient; asr_http?: DashScopeTemporaryFileHttpClient }
export class SmartCore {
  readonly store: SmartStore;
  readonly vault: CredentialVault;
  readonly ai: SmartAi;
  readonly library: SmartLibrary;
  readonly media: SmartMedia;
  readonly provider: TikHubClient;
  readonly references: ReferenceProcessor;
  settings: Settings;
  runtime = { ai_ready: false, ffmpeg_ready: false, library_ready: false, library_count: 0, library_version: "", library_error: "" };
  private controllers = new Map<string, AbortController>();
  private planning = new Set<string>();
  private rendering = false;
  private monitoring = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private session: { device_id: string; session_token: string; user_id: string; username: string } | null = null;
  private configWrites: Promise<unknown> = Promise.resolve();
  constructor(readonly options: CoreOptions) {
    this.store = new SmartStore(options.state_root);
    this.vault = new CredentialVault(options.state_root);
    this.ai = new SmartAi(options.ai);
    this.settings = { library_root: "", workspace_root: options.workspace_root || path.join(os.homedir(), "MixLabSmart"),
      monitor_platform: "douyin", monitor_interval_minutes: 30, request_limit_per_day: 500,
      reference_cache_gb: 30, source_cache_gb: 30, max_download_mb: 500, asr_model: "paraformer-v2", default_source_folder: "", device_id: `smart-${randomUUID()}` };
    this.library = new SmartLibrary(this.store, () => this.settings, (snapshot, query, folder) => this.ai.search(snapshot, query, folder));
    this.media = new SmartMedia(this.library, this.ai, process.env.MIXLAB_SMART_FONTS ?? "", () => ({ max_bytes: this.settings.source_cache_gb * 1024 ** 3,
      pinned: new Set(this.store.listStatus<Job>("job", ["queued", "running", "paused", "failed", "needs_review"]).flatMap(job => job.work.segments.map(segment => segment.selected?.id ?? ""))) }));
    this.provider = options.provider ?? new TikHubClient({ getKey: () => this.vault.get("tikhub"), reserveRequest: () => this.store.reserveRequest(localDay(), this.settings.request_limit_per_day) });
    this.references = new ReferenceProcessor(this.store, this.vault, this.provider, this.media, () => this.settings, options.asr_http);
  }
  async initialize(): Promise<void> {
    await this.vault.initialize();
    const saved = await readFile(path.join(this.options.state_root, "settings.json"), "utf8").catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; });
    if (saved) this.settings = { ...this.settings, ...JSON.parse(saved) };
    const session = this.vault.get("cutter_session");
    if (session) { try { this.session = JSON.parse(session); } catch { this.session = null; } }
    await this.ensureWorkspace(this.settings.workspace_root, this.settings.library_root);
    for (const job of this.store.listStatus<Job>("job", ["running"])) {
      if (job.status === "running") {
        if (job.result_sha256 && await fileExists(job.output_path) && await fileDigest(job.output_path) === job.result_sha256 && await fileExists(job.manifest_path)) {
          job.status = "done"; job.progress = 100; job.phase = "已完成";
        } else { job.status = "paused"; job.error = "上次执行被中断，已保留检查点，请继续任务"; }
        this.store.set("job", job);
        const work = this.store.get<Work>('work', job.work_id);
        if (work && work.revision === job.revision) { work.status = job.status === 'done' ? 'done' : 'ready'; work.error = job.error; this.saveWork(work); }
      }
    }
    for (const work of this.store.listStatus<Work>("work", ["matching"])) { work.status = "draft"; work.error = "上次匹配被中断，请重新生成方案"; this.store.set("work", work); }
    for (const hot of this.store.list<HotVideo>("hot", 10_000)) if (["downloading", "transcribing"].includes(hot.status)) { hot.status = "failed"; hot.error = "应用退出，处理已中断；再次提取将复用已保存的转写任务"; this.store.set("hot", hot); }
    this.store.db.prepare("DELETE FROM rule_claims WHERE work_id=''").run();
    try {
      await runProcess(this.media.ffmpeg.ffmpeg_path, ["-version"], { signal: AbortSignal.timeout(10_000) });
      await runProcess(this.media.ffmpeg.ffprobe_path, ["-version"], { signal: AbortSignal.timeout(10_000) });
      this.runtime.ffmpeg_ready = true;
    } catch { this.runtime.ffmpeg_ready = false; }
    this.runtime.ai_ready = await this.ai.ready();
    this.timer = setInterval(() => { void this.tick(); }, 2000); this.timer.unref();
  }
  private async ensureWorkspace(root: string, library: string): Promise<void> {
    if (!path.isAbsolute(root) || /^\\\\|^\/\//.test(root)) throw new SmartError("workspace_path", "智能工作区必须是本机绝对路径，不能选择网络共享目录");
    await mkdir(root, { recursive: true });
    const actual = await realpath(root);
    if (library) {
      const shared = await realpath(library).catch(() => path.resolve(library));
      const within = (a: string, b: string): boolean => { const relative = path.relative(a, b); return !relative || !relative.startsWith("..") && !path.isAbsolute(relative); };
      if (within(shared, actual) || within(actual, shared)) throw new SmartError("workspace_overlap", "公共素材库和智能工作区必须分开，不能互相包含");
    }
    const marker = path.join(root, ".mixlab-smart-cutter.json");
    if (!await fileExists(marker)) {
      if ((await readdir(root)).length) throw new SmartError("workspace_not_empty", "请选择新的空文件夹或已有智能剪辑工作区，避免与旧剪辑端和个人文件混用");
      await atomicPrivateJson(marker, { product: "mixlab-smart-cutter", schema_version: "1.0" });
    } else if (record(JSON.parse(await readFile(marker, "utf8"))).product !== "mixlab-smart-cutter") throw new SmartError("workspace_marker", "该目录不是智能剪辑工作区");
  }
  publicSettings() { return { ...this.settings, has_tikhub_key: this.vault.has("tikhub"), has_asr_key: this.vault.has("dashscope"), credential_protection: process.platform === "win32" ? "Windows DPAPI" : "开发环境本机私有文件", runtime: { ...this.runtime, semantic: this.ai.indexStatus } }; }
  async updateSettings(body: Record<string, unknown>): Promise<ReturnType<SmartCore["publicSettings"]>> {
    const action = async () => {
      const next = { ...this.settings };
      if (body.library_root !== undefined) next.library_root = typeof body.library_root === "string" ? body.library_root.trim() : requireText(body.library_root, "公共素材路径");
      if (body.workspace_root !== undefined) next.workspace_root = requireText(body.workspace_root, "智能工作区", 2048);
      if (body.monitor_platform !== undefined) next.monitor_platform = validatePlatform(body.monitor_platform);
      if (body.monitor_interval_minutes !== undefined) next.monitor_interval_minutes = boundedNumber(body.monitor_interval_minutes, 5, 1440, "监控间隔");
      if (body.request_limit_per_day !== undefined) next.request_limit_per_day = boundedNumber(body.request_limit_per_day, 1, 10_000, "接口请求上限");
      if (body.reference_cache_gb !== undefined) next.reference_cache_gb = boundedNumber(body.reference_cache_gb, 1, 500, "参考缓存上限");
      if (body.source_cache_gb !== undefined) next.source_cache_gb = boundedNumber(body.source_cache_gb, 1, 500, "素材缓存上限");
      if (body.max_download_mb !== undefined) next.max_download_mb = boundedNumber(body.max_download_mb, 10, 10_000, "单视频下载上限");
      if (body.default_source_folder !== undefined) next.default_source_folder = String(body.default_source_folder).trim();
      if (body.asr_model !== undefined) next.asr_model = requireText(body.asr_model, "转写模型", 80);
      const moved = next.workspace_root !== this.settings.workspace_root || next.library_root !== this.settings.library_root;
      if (moved && (this.rendering || this.planning.size || this.references.active || this.monitoring)) throw new SmartError("runtime_busy", "正在处理作品或参考视频，请等待或暂停任务后修改目录", 409);
      if (next.library_root && !path.isAbsolute(next.library_root)) throw new SmartError("library_path", "公共素材库必须是绝对路径");
      await this.ensureWorkspace(next.workspace_root, next.library_root);
      for (const [input, name] of [["tikhub_api_key", "tikhub"], ["asr_api_key", "dashscope"]]) {
        if (Object.hasOwn(body, input!)) {
          const value = body[input!];
          if (typeof value !== "string" || /[\r\n]/.test(value) || value.length > 4096) throw new SmartError("key_format", "API Key 格式不正确");
          await this.vault.set(name!, value.trim());
        }
      }
      if (body.clear_tikhub_key === true) await this.vault.set("tikhub", "");
      if (body.clear_asr_key === true) await this.vault.set("dashscope", "");
      if (next.library_root !== this.settings.library_root) { this.session = null; await this.vault.set("cutter_session", ""); this.runtime.library_ready = false; }
      await atomicPrivateJson(path.join(this.options.state_root, "settings.json"), next); this.settings = next;
      return this.publicSettings();
    };
    const operation = this.configWrites.then(action); this.configWrites = operation.catch(() => undefined); return operation;
  }
  async authStatus(): Promise<{ required: boolean; user: { user_id: string; username: string } | null }> {
    if (this.options.auth_mode === "local_trusted") return { required: false, user: { user_id: "local-test", username: "本机测试" } };
    if (!this.settings.library_root) return { required: false, user: null };
    if (!this.session) return { required: true, user: null };
    const status = await validateCutterSession(this.settings.library_root, { device_id: this.session.device_id, session_token: this.session.session_token, now: now(), touch: false }).catch(() => ({ ok: false as const, reason: "无法检查账号状态" }));
    return status.ok && status.user.devices.some(device => device.device_id === this.session!.device_id && device.status === "active")
      ? { required: false, user: { user_id: status.user.user_id, username: status.user.username } } : { required: true, user: null };
  }
  async requireSession(): Promise<void> {
    const auth = await this.authStatus();
    if (auth.required || !auth.user) throw new SmartError("login_required", "请登录管理端已审核的剪辑师账号", 401);
  }
  async login(body: Record<string, unknown>, register = false): Promise<unknown> {
    if (!this.settings.library_root) throw new SmartError("library_missing", "请先配置公共素材库");
    const input = { username: requireText(body.username, "用户名", 80), password: requireText(body.password, "密码", 256), device_id: this.settings.device_id, device_name: `MixLab 智能剪辑端 · ${os.hostname()}`, now: now() };
    if (register) return publicCutterUser(await registerCutterAccount(this.settings.library_root, input));
    const result = await loginCutterAccount(this.settings.library_root, input);
    if (!result.ok) throw new SmartError("login_failed", result.reason, 401);
    this.session = { device_id: result.session.device_id, session_token: result.session.session_token, user_id: result.user.user_id, username: result.user.username };
    await this.vault.set("cutter_session", JSON.stringify(this.session));
    return publicCutterUser(result.user);
  }
  async logout(): Promise<void> {
    if (this.session && this.settings.library_root) await logoutCutterSession(this.settings.library_root, { device_id: this.session.device_id, session_token: this.session.session_token });
    this.session = null; await this.vault.set("cutter_session", "");
  }
  async syncLibrary(): Promise<void> {
    await this.requireSession();
    try { const snapshot = await this.library.snapshot(); this.runtime.library_ready = true; this.runtime.library_count = snapshot.ready_video_count; this.runtime.library_version = snapshot.version; this.runtime.library_error = ""; }
    catch (error) { this.runtime.library_error = (error as Error).message; this.runtime.library_ready = false; throw error; }
  }
  work(workId: string): Work {
    const work = this.store.get<Work>("work", workId); if (!work) throw new SmartError("work_missing", "作品不存在", 404); return work;
  }
  private saveWork(work: Work): Work { work.updated_at = now(); return this.store.set("work", work); }
  createWork(script: string, origin: WorkOrigin = { trigger: "manual", kind: "manual_script" }): Work {
    const content = requireText(script, "文案");
    if (splitScript(content).length > 200) throw new SmartError("script_length", "首版单条作品支持最多 200 句，请拆分长文案");
    const work: Work = { id: id("W"), title: automaticTitle(content), script: content, original_script: content, origin,
      revision: 1, status: "draft", snapshot_id: "", segments: [], settings: { ...DEFAULT_OUTPUT, source_folder: this.settings.default_source_folder }, created_at: now(), updated_at: now(), error: "" };
    return this.saveWork(work);
  }
  updateWork(workId: string, body: Record<string, unknown>): Work {
    const work = this.work(workId);
    if (work.status === "matching") throw new SmartError("work_busy", "匹配中，请等待完成后修改", 409);
    if (body.script !== undefined) {
      work.script = requireText(body.script, "文案");
      if (splitScript(work.script).length > 200) throw new SmartError("script_length", "单条作品最多 200 句");
      work.title = automaticTitle(work.script); work.segments = []; work.snapshot_id = ""; work.status = "draft";
    }
    if (body.settings !== undefined) {
      const before = work.settings.source_folder;
      work.settings = this.outputSettings(work.settings, record(body.settings));
      if (before !== work.settings.source_folder) { work.segments = []; work.snapshot_id = ""; work.status = "draft"; }
      else if (work.segments.length) work.status = workReady(work) ? "ready" : "review";
    }
    work.revision++; work.error = ""; return this.saveWork(work);
  }
  private outputSettings(current: OutputSettings, body: Record<string, unknown>): OutputSettings {
    const next = { ...current };
    if (body.ratio !== undefined) { if (!["9:16", "16:9"].includes(String(body.ratio))) throw new SmartError("ratio", "画面比例无效"); next.ratio = body.ratio as OutputSettings["ratio"]; }
    if (body.crop_mode !== undefined) { if (!["follow", "center", "fit"].includes(String(body.crop_mode))) throw new SmartError("crop", "取景方式无效"); next.crop_mode = body.crop_mode as OutputSettings["crop_mode"]; }
    if (body.crop_position !== undefined) next.crop_position = boundedNumber(body.crop_position, 0, 1, "横向构图");
    if (body.subtitle_size !== undefined) next.subtitle_size = boundedNumber(body.subtitle_size, 24, 100, "字幕字号");
    if (body.subtitle_style !== undefined) { if (!["white", "yellow"].includes(String(body.subtitle_style))) throw new SmartError("subtitle_style", "字幕样式无效"); next.subtitle_style = body.subtitle_style as OutputSettings["subtitle_style"]; }
    for (const field of ["subtitles", "normalize_audio", "same_lecturer"] as const) if (body[field] !== undefined) { if (typeof body[field] !== "boolean") throw new SmartError("setting_type", "开关参数无效"); next[field] = body[field] as boolean; }
    if (body.source_folder !== undefined) next.source_folder = String(body.source_folder).trim();
    return next;
  }
  async generatePlan(workId: string): Promise<Work> {
    if (this.planning.has(workId)) throw new SmartError("plan_busy", "该作品正在匹配", 409);
    const work = this.work(workId); const revision = work.revision;
    this.planning.add(workId); work.status = "matching"; work.error = ""; this.saveWork(work);
    try {
      const plan = await this.library.plan(splitScript(work.script), work.settings.source_folder);
      const current = this.work(workId); if (current.revision !== revision) throw new SmartError("plan_revision", "文案版本已变化，请重新匹配", 409);
      current.snapshot_id = plan.snapshot.id; current.segments = plan.segments;
      current.status = workReady(current) ? "ready" : "review"; this.runtime.library_ready = true;
      this.runtime.library_count = plan.snapshot.ready_video_count; this.runtime.library_version = plan.snapshot.version;
      return this.saveWork(current);
    } catch (error) { const current = this.work(workId); current.status = "failed"; current.error = this.vault.redact((error as Error).message); this.saveWork(current); throw error; }
    finally { this.planning.delete(workId); }
  }
  selectSegment(workId: string, segmentId: number, body: Record<string, unknown>): Work {
    const work = this.work(workId); if (work.status === "matching") throw new SmartError("work_busy", "请等待匹配完成", 409);
    if (body.revision !== work.revision) throw new SmartError("plan_revision", "方案已更新，请刷新后操作", 409);
    const segment = work.segments.find(item => item.id === segmentId);
    if (!segment) throw new SmartError("segment_missing", "句子不存在", 404);
    if (typeof body.candidate_id === "string") {
      const candidate = segment.candidates.find(item => item.id === body.candidate_id);
      if (!candidate) throw new SmartError("candidate_missing", "只能选择本方案中已验证的真实片段", 409);
      segment.selected = candidate; segment.actual = candidate.actual; segment.status = classifyMatch(segment.target, candidate.actual); segment.accepted = false;
    }
    if (body.accepted === true) {
      if (segment.status !== "near" || !segment.selected) throw new SmartError("confirmation_invalid", "缺句或关键事实冲突不能通过近似确认，请修改文案或更换片段", 409);
      segment.accepted = true;
    }
    work.revision++; work.status = workReady(work) ? "ready" : "review"; work.error = "";
    return this.saveWork(work);
  }
  async searchSegment(workId: string, segmentId: number, query: string): Promise<Work> {
    const work = this.work(workId), segment = work.segments.find(item => item.id === segmentId);
    if (!segment) throw new SmartError("segment_missing", "句子不存在", 404);
    const revision = work.revision;
    const candidates = await this.library.candidates(this.library.getSnapshot(work.snapshot_id), segment.target, work.settings.source_folder, requireText(query, "搜索内容", 500));
    const current = this.work(workId); if (current.revision !== revision) throw new SmartError("plan_revision", "方案已更新，请重新搜索", 409);
    const target = current.segments.find(item => item.id === segmentId)!;
    target.candidates = [...new Map([...target.candidates, ...candidates].map(candidate => [candidate.id, candidate])).values()].slice(-30);
    return this.saveWork(current);
  }
  enqueue(workId: string): Job {
    const work = this.work(workId);
    if (!workReady(work)) throw new SmartError("review_required", "仍有缺句、近似未确认或事实冲突，请完成审核", 409);
    if (work.settings.same_lecturer && new Set(work.segments.map(segment => segment.selected!.lecturer)).size > 1) throw new SmartError("lecturer_review", "作品混用了不同讲师，请确认素材范围或关闭同讲师约束", 409);
    if (!this.runtime.ffmpeg_ready) throw new SmartError("media_runtime", "本机媒体引擎未就绪", 503);
    const existing = this.store.list<Job>("job").find(job => job.work_id === work.id && job.revision === work.revision && !["cancelled", "failed", "needs_review"].includes(job.status));
    if (existing) return existing;
    const jobId = id("J"), output = path.join(this.settings.workspace_root, "projects", work.id, "exports", jobId);
    const job: Job = { id: jobId, work_id: work.id, revision: work.revision, work: structuredClone(work), status: "queued", phase: "等待本机", progress: 0,
      error: "", created_at: now(), updated_at: now(), output_path: path.join(output, "video.mp4"), manifest_path: path.join(output, "sources.json"), workspace_root: this.settings.workspace_root, duration_ms: 0, completed_clips: [], compositions: {} };
    this.store.set("job", job); work.status = "rendering"; this.saveWork(work); void this.drain(); return job;
  }
  controlJob(jobId: string, action: string): Job {
    const job = this.store.get<Job>("job", jobId); if (!job) throw new SmartError("job_missing", "任务不存在", 404);
    if (action === "pause" && ["queued", "running"].includes(job.status)) { job.status = "paused"; this.controllers.get(jobId)?.abort(); }
    else if (action === "cancel" && ["queued", "running", "paused", "needs_review", "failed"].includes(job.status)) { job.status = "cancelled"; this.controllers.get(jobId)?.abort(); }
    else if (["resume", "retry"].includes(action) && ["paused", "failed", "needs_review"].includes(job.status)) {
      if (this.controllers.has(jobId)) throw new SmartError("job_stopping", "任务正在保存检查点，请稍后继续", 409);
      const work = this.work(job.work_id); if (!workReady(work)) throw new SmartError("review_required", "请先完成作品审核", 409);
      if (work.revision !== job.revision) { job.work = structuredClone(work); job.revision = work.revision; job.completed_clips = []; job.compositions = {}; }
      job.status = "queued"; job.error = "";
    } else throw new SmartError("job_action", "当前任务状态不能执行此操作", 409);
    job.updated_at = now(); this.store.set("job", job);
    const work = this.work(job.work_id);
    if (work.revision === job.revision) {
      work.status = job.status === 'queued' ? 'rendering' : 'ready';
      work.error = job.status === 'paused' ? '任务已暂停，可在任务中心继续' : job.status === 'cancelled' ? '任务已取消，方案已保留' : '';
      this.saveWork(work);
    }
    void this.drain(); return job;
  }
  private async drain(): Promise<void> {
    if (this.rendering || this.closed) return; this.rendering = true;
    try {
      let job;
      while (!this.closed && (job = this.store.listStatus<Job>("job", ["queued"], 1)[0])) {
        const controller = new AbortController(); this.controllers.set(job.id, controller);
        const current = job; current.status = "running";
        const update = () => { if (controller.signal.aborted) return; current.updated_at = now(); this.store.set("job", current); };
        try {
          await this.requireSession(); update(); await this.media.render(current, controller.signal, update);
          current.status = "done"; current.error = ""; update();
          const work = this.work(current.work_id); if (work.revision === current.revision) { work.status = "done"; this.saveWork(work); }
        } catch (error) {
          if (!controller.signal.aborted) {
            current.status = error instanceof SmartError && error.code === "composition_review" ? "needs_review" : "failed";
            current.error = this.vault.redact((error as Error).message); update();
            const work = this.work(current.work_id); if (work.revision === current.revision) { work.status = current.status === "needs_review" ? "review" : "failed"; work.error = current.error; this.saveWork(work); }
          }
        } finally { this.controllers.delete(current.id); }
      }
    } finally { this.rendering = false; }
  }
  async addAccount(body: Record<string, unknown>): Promise<Account> {
    if (this.store.count("account") >= 100) throw new SmartError("account_limit", "当前版本最多监控 100 个账号");
    const platform = validatePlatform(body.platform ?? this.settings.monitor_platform);
    const input = requireText(body.input, "主页链接或账号 ID", 2048);
    const resolved = await this.provider.resolveAccount(platform, input);
    if (this.store.list<Account>("account").some(account => account.platform === platform && (resolved.sec_user_id ? account.sec_user_id === resolved.sec_user_id : account.unique_id === resolved.unique_id))) throw new SmartError("account_duplicate", "该账号已在监控列表中", 409);
    return this.store.set("account", { id: id("A"), platform, name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : resolved.name || resolved.unique_id || resolved.sec_user_id,
      input, sec_user_id: resolved.sec_user_id, unique_id: resolved.unique_id, followers: resolved.followers,
      group: typeof body.group === "string" ? body.group.trim().slice(0, 80) : "默认分组", enabled: true, last_checked_at: "", last_error: "", cursor: "0" });
  }
  updateAccount(accountId: string, body: Record<string, unknown>): Account {
    const account = this.store.get<Account>("account", accountId); if (!account) throw new SmartError("account_missing", "关注账号不存在", 404);
    if (body.enabled !== undefined) { if (typeof body.enabled !== "boolean") throw new SmartError("account_input", "监控开关无效"); account.enabled = body.enabled; }
    if (body.name !== undefined) account.name = requireText(body.name, "账号备注", 80);
    if (body.group !== undefined) account.group = requireText(body.group, "分组", 80);
    return this.store.set("account", account);
  }
  saveRule(body: Record<string, unknown>, ruleId?: string): Rule {
    const existing = ruleId ? this.store.get<Rule>("rule", ruleId) : null;
    if (ruleId && !existing) throw new SmartError("rule_missing", "规则不存在", 404);
    const rule: Rule = existing ?? { id: id("R"), name: "热点原声成片", enabled: false,
      platform: this.settings.monitor_platform, account_group: "", max_age_hours: 24,
      min_likes: 1000, min_growth_per_hour: 0, execution: "review", daily_limit: 5,
      candidates_per_run: 2, source_folder: "", last_run_at: "", last_error: "" };
    if (body.name !== undefined) rule.name = requireText(body.name, "规则名称", 80);
    if (body.enabled !== undefined) { if (typeof body.enabled !== "boolean") throw new SmartError("rule_input", "规则开关无效"); rule.enabled = body.enabled; }
    if (body.platform !== undefined) rule.platform = validatePlatform(body.platform);
    if (body.account_group !== undefined) rule.account_group = String(body.account_group).trim().slice(0, 80);
    if (body.max_age_hours !== undefined) rule.max_age_hours = boundedNumber(body.max_age_hours, 1, 720, "发布时间范围");
    if (body.min_likes !== undefined) rule.min_likes = boundedNumber(body.min_likes, 0, 100_000_000, "点赞阈值");
    if (body.min_growth_per_hour !== undefined) rule.min_growth_per_hour = boundedNumber(body.min_growth_per_hour, 0, 100_000_000, "增长阈值");
    if (body.daily_limit !== undefined) rule.daily_limit = Math.floor(boundedNumber(body.daily_limit, 1, 100, "每日成片上限"));
    if (body.candidates_per_run !== undefined) rule.candidates_per_run = Math.floor(boundedNumber(body.candidates_per_run, 1, 10, "每轮候选数"));
    if (body.source_folder !== undefined) rule.source_folder = String(body.source_folder).trim();
    if (body.execution !== undefined) { if (!["plan", "review", "qualified"].includes(String(body.execution))) throw new SmartError("rule_execution", "执行等级无效"); rule.execution = body.execution as Rule["execution"]; }
    return this.store.set("rule", rule);
  }
  private observed(account: Account, page: ProviderPage): number {
    let added = 0;
    for (const item of page.videos) {
      const hotId = `${account.platform}:${item.video_id}`;
      let hot = this.store.get<HotVideo>("hot", hotId);
      if (!hot) {
        added++;
        hot = { id: hotId, platform: account.platform, video_id: item.video_id, account_id: account.id,
          author: item.author || account.name, title: item.title, published_at: item.published_at,
          duration_ms: item.duration_ms, download_url: item.download_url, cover_url: item.cover_url,
          observations: [], growth_per_hour: null, status: "discovered", error: "", local_video_path: "", local_audio_path: "", transcript: "", asr_task_id: "", asr_model: "", updated_at: now() };
      }
      const observation = { at: now(), stats: item.stats };
      const previous = hot.observations.at(-1);
      const elapsed = previous ? new Date(observation.at).getTime() - new Date(previous.at).getTime() : 0;
      hot.growth_per_hour = elapsed >= 60_000 && previous?.stats.likes !== null && previous?.stats.likes !== undefined && item.stats.likes !== null && item.stats.likes >= previous.stats.likes
        ? (item.stats.likes - previous.stats.likes) / elapsed * 3_600_000 : null;
      hot.observations = [...hot.observations, observation].slice(-48);
      hot.title = item.title || hot.title; hot.download_url = item.download_url || hot.download_url;
      hot.cover_url = item.cover_url || hot.cover_url; hot.updated_at = now();
      this.store.set("hot", hot);
    }
    return added;
  }
  async monitorRun(): Promise<void> {
    if (this.monitoring) throw new SmartError("monitor_busy", "监控检查正在进行", 409);
    await this.requireSession();
    this.monitoring = true;
    const status = { id: "current", running: true, phase: "检查关注账号", started_at: now(), finished_at: "", new_count: 0, error: "" };
    this.store.set("monitor", status);
    try {
      for (const account of this.store.list<Account>("account").filter(item => item.enabled)) {
        try {
          status.phase = `采集 ${account.name}`; this.store.set("monitor", status);
          let cursor = "0";
          for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
            const page = await this.provider.posts(account.platform, account, cursor);
            const known = page.videos.some(video => this.store.get<HotVideo>("hot", `${account.platform}:${video.video_id}`));
            status.new_count += this.observed(account, page);
            const older = page.videos.length > 0 && page.videos.every(video => video.published_at && Date.now() - new Date(video.published_at).getTime() > 72 * 3_600_000);
            if (!page.has_more || page.cursor === cursor || !page.videos.length || older || known) break;
            cursor = page.cursor;
          }
          account.cursor = cursor; account.last_error = ""; account.last_checked_at = now(); this.store.set("account", account);
        } catch (error) {
          account.last_error = this.vault.redact((error as Error).message); account.last_checked_at = now(); this.store.set("account", account);
          status.error = account.last_error;
          if (error instanceof SmartError && ["request_budget", "provider_balance", "provider_unauthorized"].includes(error.code)) break;
        }
      }
      status.phase = "按规则处理候选"; this.store.set("monitor", status);
      for (const rule of this.store.list<Rule>("rule").filter(item => item.enabled)) await this.runRule(rule);
    } finally {
      status.running = false; status.finished_at = now(); status.phase = status.error ? "本轮有需处理事项" : "本轮检查完成";
      this.store.set("monitor", status); this.monitoring = false;
    }
  }
  private async runRule(rule: Rule): Promise<void> {
    rule.last_error = "";
    const accounts = this.store.list<Account>("account");
    const eligible = this.store.list<HotVideo>("hot", 10_000).filter(hot => {
      const account = accounts.find(item => item.id === hot.account_id);
      const likes = hot.observations.at(-1)?.stats.likes;
      const observedAt = new Date(hot.observations.at(-1)?.at ?? 0).getTime();
      return hot.platform === rule.platform && account?.enabled && (!rule.account_group || account.group === rule.account_group) &&
        !!hot.published_at && Date.now() - new Date(hot.published_at).getTime() <= rule.max_age_hours * 3_600_000 &&
        Date.now() - observedAt <= this.settings.monitor_interval_minutes * 120_000 &&
        likes !== null && likes !== undefined && likes >= rule.min_likes &&
        (rule.min_growth_per_hour === 0 || hot.growth_per_hour !== null && hot.growth_per_hour >= rule.min_growth_per_hour);
    }).sort((a, b) => (b.growth_per_hour ?? b.observations.at(-1)?.stats.likes ?? 0) - (a.growth_per_hour ?? a.observations.at(-1)?.stats.likes ?? 0));
    let produced = 0;
    for (const candidate of eligible) {
      if (produced >= rule.candidates_per_run || this.closed) break;
      if (!this.store.claimRule(rule.id, candidate.id, now())) continue;
      try {
        const hot = await this.references.process(candidate.id);
        const work = this.createWork(hot.transcript, { trigger: "automatic", kind: "rule", platform: hot.platform,
          account_id: hot.account_id, account_name: hot.author, rule_id: rule.id, rule_name: rule.name, hot_id: hot.id, reference_title: hot.title });
        work.settings.source_folder = rule.source_folder; this.saveWork(work);
        this.store.bindRuleWork(rule.id, candidate.id, work.id); produced++;
        await this.generatePlan(work.id);
        const ready = this.work(work.id);
        const lecturers = ready.segments.map(segment => segment.selected?.lecturer).filter(Boolean);
        const used = this.store.list<Job>("job").filter(job => job.work.origin.rule_id === rule.id && localDay(new Date(job.created_at)) === localDay() && ["queued", "running", "done", "paused"].includes(job.status)).length;
        if (rule.execution === "qualified" && workReady(ready) && ready.segments.every(segment => segment.status === "exact") && lecturers.length === ready.segments.length && new Set(lecturers).size === 1 && used < rule.daily_limit) this.enqueue(ready.id);
        else if (rule.execution === "qualified") {
          ready.status = 'review';
          ready.error = used >= rule.daily_limit ? '达到该规则今日成片上限，方案已保留' : !ready.segments.every(segment => segment.status === 'exact')
            ? '原声方案需要人工确认，不满足自动导出条件' : '缺少可靠的同讲师标签，需人工审核后导出';
          this.saveWork(ready);
        }
      } catch (error) {
        this.store.releaseUnfinishedRuleClaim(rule.id, candidate.id);
        rule.last_error = this.vault.redact((error as Error).message);
      }
    }
    rule.last_run_at = now(); this.store.set("rule", rule);
  }
  async importHot(hotId: string): Promise<Work> {
    const hot = await this.references.process(hotId);
    return this.createWork(hot.transcript, { trigger: "manual", kind: "hot_manual", platform: hot.platform,
      account_id: hot.account_id, account_name: hot.author, hot_id: hot.id, reference_title: hot.title });
  }
  async state() {
    const auth = await this.authStatus();
    const works = auth.required ? [] : this.store.list<Work>("work", 100).map(work => ({
      id: work.id, title: work.title, origin: work.origin, status: work.status, revision: work.revision,
      created_at: work.created_at, updated_at: work.updated_at, error: work.error, settings: work.settings,
      segment_count: work.segments.length, pending_count: work.segments.filter(segment => segment.status !== "exact" && !segment.accepted).length,
      duration_ms: work.segments.reduce((sum, segment) => sum + (segment.selected ? segment.selected.end_ms - segment.selected.begin_ms : 0), 0)
    }));
    const jobs = auth.required ? [] : this.store.list<Job>("job", 100).map(job => ({
      id: job.id, work_id: job.work_id, title: job.work.title, origin: job.work.origin,
      status: job.status, phase: job.phase, progress: job.progress, error: job.error,
      created_at: job.created_at, updated_at: job.updated_at, duration_ms: job.duration_ms,
      has_output: job.status === "done", ratio: job.work.settings.ratio
    }));
    return { settings: this.publicSettings(), auth, works, jobs,
      accounts: auth.required ? [] : this.store.list<Account>("account", 100),
      hot: auth.required ? [] : this.store.list<HotVideo>("hot", 100).map(({ local_video_path: _video, local_audio_path: _audio, asr_task_id: _task, ...hot }) => hot),
      rules: auth.required ? [] : this.store.list<Rule>("rule", 100),
      monitor: this.store.get<Record<string, unknown>>("monitor", "current"),
      request_count: this.store.requestCount(localDay()), device_name: os.hostname(), limited_to: 100 };
  }
  private async tick(): Promise<void> {
    if (this.closed) return;
    void this.drain();
    if (this.monitoring || !this.vault.has("tikhub") || !this.store.list<Account>("account", 100).some(account => account.enabled)) return;
    const previous = this.store.get<{ finished_at: string }>("monitor", "current");
    if (previous?.finished_at && Date.now() - new Date(previous.finished_at).getTime() < this.settings.monitor_interval_minutes * 60_000) return;
    try { await this.monitorRun(); } catch { /* Detailed failure is preserved in account/rule status; no credentials are logged. */ }
  }
  async close(): Promise<void> {
    this.closed = true; if (this.timer) clearInterval(this.timer);
    for (const [jobId, controller] of this.controllers) {
      const job = this.store.get<Job>("job", jobId);
      if (job && job.status === "running") {
        job.status = "paused"; job.error = "应用退出，已保存检查点"; this.store.set("job", job);
        const work = this.work(job.work_id);
        if (work.revision === job.revision) { work.status = 'ready'; work.error = job.error; this.saveWork(work); }
      }
      controller.abort();
    }
    const deadline = Date.now() + 3000;
    while (this.controllers.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    this.ai.close();
  }
}
