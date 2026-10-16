import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loginCutterAccount, registerCutterAccount, logoutCutterSession, validateCutterSession, publicCutterUser, cutterAccountTier, changeCutterAccountPassword, readCurrentCutterRelease, type CutterAccountTier } from "../../library-fs/src/index.ts";
import { WorkspaceCache } from "./cache.ts";
import { Assemblies } from "./assembly.ts";
import { ManualCutter } from "./manual.ts";
import { SmartStore, localDay } from "./store.ts";
import { CredentialVault, atomicPrivateJson } from "./vault.ts";
import { SmartAi, type AiRuntime } from "./ai.ts";
import { SmartLibrary, classifyMatch } from "./library.ts";
import { SmartMedia, fileDigest } from "./media.ts";
import { TikHubClient, type ProviderPage } from "./tikhub.ts";
import { ReferenceProcessor } from "./reference.ts";
import { runProcess } from "./process.ts";
import { renderTemplatePreview, type TemplatePreview } from "./template-preview.ts";
import { resolvedTemplate, validateTemplate, type SubtitleTemplate } from "./templates.ts";
import { retrySourceConnection } from "../../cutter-local/src/network-retry.ts";
import type { DashScopeTemporaryFileHttpClient } from '../../asr-core/src/index.ts';
import { DEFAULT_OUTPUT, SmartError, automaticTitle, splitScript, workReady, includedSegments, boundedNumber, requireText, validatePlatform,
  type Settings, type Work, type WorkSegment, type WorkOrigin, type Job, type Account, type HotVideo, type Rule, type OutputSettings } from "./types.ts";

const now = (): string => new Date().toISOString();
const id = (prefix: string): string => `${prefix}-${randomUUID()}`;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fileExists = async (file: string): Promise<boolean> => !!(await stat(file).catch(() => null))?.isFile();
type AccountStatus = { required: boolean; user: { user_id: string; username: string; tier: CutterAccountTier } | null };

export interface CoreOptions { state_root: string; workspace_root?: string; ai: AiRuntime; auth_mode?: "reviewed" | "local_trusted"; test_account_tier?: CutterAccountTier; provider?: TikHubClient; asr_http?: DashScopeTemporaryFileHttpClient }
export class SmartCore {
  readonly store: SmartStore;
  readonly vault: CredentialVault;
  readonly ai: SmartAi;
  readonly library: SmartLibrary;
  readonly media: SmartMedia;
  readonly provider: TikHubClient;
  readonly references: ReferenceProcessor;
  readonly manual: ManualCutter;
  readonly cache: WorkspaceCache;
  readonly assemblies: Assemblies;
  cacheClearing = false;
  configuring = false;
  activeStreams = 0;
  readonly templatePreviews = new Map<string, TemplatePreview>();
  private templatePreviewController: AbortController | null = null;
  settings: Settings;
  runtime = { ai_ready: false, ffmpeg_ready: false, library_ready: false, library_count: 0, library_version: "", library_error: "" };
  libraryConnection = { status: "unchecked" as "unchecked" | "not_configured" | "unavailable" | "published", root: "", version: "", count: 0, message: "尚未检查公共库连接" };
  private libraryProbe: { root: string; pending: ReturnType<typeof readCurrentCutterRelease> } | null = null;
  private controllers = new Map<string, AbortController>();
  private planning = new Set<string>();
  private rendering = false;
  private renderAuthCheck: AbortController | null = null;
  private monitoring = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private session: { device_id: string; session_token: string; user_id: string; username: string } | null = null;
  private authProbe: { root: string; token: string; pending: Promise<AccountStatus> } | null = null;
  private configWrites: Promise<unknown> = Promise.resolve();
  constructor(readonly options: CoreOptions) {
    this.store = new SmartStore(options.state_root);
    this.vault = new CredentialVault(options.state_root);
    this.ai = new SmartAi(options.ai);
    this.settings = { library_root: "", workspace_root: options.workspace_root || path.join(os.homedir(), "MixLabSmart"),
      monitor_platform: "douyin", monitor_interval_minutes: 30, request_limit_per_day: 500,
      reference_cache_gb: 30, source_cache_gb: 30, max_download_mb: 500, asr_model: "paraformer-v2", default_source_folder: "", device_id: `smart-${randomUUID()}` };
    this.library = new SmartLibrary(this.store, () => this.settings, (snapshot, query, folder, progress) => this.ai.search(snapshot, query, folder, progress));
    this.media = new SmartMedia(this.library, this.ai, undefined, () => ({ max_bytes: this.settings.source_cache_gb * 1024 ** 3,
      pinned: new Set(this.store.listStatus<Job>("job", ["queued", "running", "paused", "failed", "needs_review"]).flatMap(job => job.work.segments.map(segment => segment.selected?.id ?? ""))) }));
    this.provider = options.provider ?? new TikHubClient({ getKey: () => this.vault.get("tikhub"), reserveRequest: () => this.store.reserveRequest(localDay(), this.settings.request_limit_per_day) });
    this.references = new ReferenceProcessor(this.store, this.vault, this.provider, this.media, () => this.settings, options.asr_http);
    this.manual = new ManualCutter(this);
    this.cache = new WorkspaceCache(this);
    this.assemblies = new Assemblies(this);
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
    for (const work of this.store.listStatus<Work>("work", ["matching"])) { work.status = "draft"; work.error = "上次匹配被中断，请重新生成方案"; if (work.match_progress) { work.match_progress.phase = "failed"; work.match_progress.updated_at = now(); } this.store.set("work", work); }
    for (const hot of this.store.list<HotVideo>("hot", 10_000)) if (["downloading", "transcribing"].includes(hot.status)) { hot.status = "failed"; hot.error = "应用退出，处理已中断；再次提取将复用已保存的转写任务"; this.store.set("hot", hot); }
    this.store.db.prepare("DELETE FROM rule_claims WHERE work_id=''").run();
    try {
      await runProcess(this.media.ffmpeg.ffmpeg_path, ["-version"], { signal: AbortSignal.timeout(10_000) });
      await runProcess(this.media.ffmpeg.ffprobe_path, ["-version"], { signal: AbortSignal.timeout(10_000) });
      this.runtime.ffmpeg_ready = true;
    } catch { this.runtime.ffmpeg_ready = false; }
    this.runtime.ai_ready = await this.ai.ready();
    this.manual.update(); await this.manual.initialize(); this.assemblies.initialize();
    this.timer = setInterval(() => { void this.tick(); }, 2000); this.timer.unref();
  }
  private async ensureWorkspace(root: string, library: string): Promise<void> {
    if (!path.isAbsolute(root) || /^\\\\|^\/\//.test(root)) throw new SmartError("workspace_path", "智能工作区必须是本机绝对路径，不能选择网络共享目录");
    if (process.platform === "darwin") {
      const mounts = await runProcess("/sbin/mount", [], { signal: AbortSignal.timeout(5000) });
      const networkRoots = mounts.split("\n").map(line => / on (.+) \((?:smbfs|nfs|afpfs|webdav)(?:,|\))/.exec(line)?.[1]).filter((value): value is string => !!value);
      const network = (value: string) => networkRoots.some(mount => { const relative = path.relative(mount, value); return !relative || !relative.startsWith("..") && !path.isAbsolute(relative); });
      if (network(root)) throw new SmartError("workspace_path", "本机工作区不能位于 NAS 或网络卷宗，请选择本机磁盘目录");
      let ancestor = root;
      let actualParent: string;
      for (;;) {
        try { actualParent = await realpath(ancestor); break; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; const parent = path.dirname(ancestor); if (parent === ancestor) throw error; ancestor = parent; }
      }
      if (network(path.join(actualParent, path.relative(ancestor, root)))) throw new SmartError("workspace_path", "本机工作区不能通过链接位于 NAS 或网络卷宗");
    }
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
  publicSettings() { return { ...this.settings, library_connection: { ...this.libraryConnection }, has_tikhub_key: this.vault.has("tikhub"), has_asr_key: this.vault.has("dashscope"), credential_protection: process.platform === "win32" ? "Windows DPAPI" : "本机私有文件（0600）", runtime: { ...this.runtime, semantic: this.ai.indexStatus } }; }
  async checkLibrary() {
    const root = this.settings.library_root;
    const base = { root, version: "", count: 0 };
    if (!root) this.libraryConnection = { ...base, status: "not_configured", message: "请先选择管理端发布的公共素材库" };
    else {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        if (this.libraryProbe?.root !== root) {
          const pending = (async () => { const release = await readCurrentCutterRelease(root); await stat(path.join(root, ".mixlab-library/releases", release.release_version, "catalog.sqlite")); return release; })();
          const probe = { root, pending }; this.libraryProbe = probe;
          void pending.finally(() => { if (this.libraryProbe === probe) this.libraryProbe = null; }).catch(() => undefined);
        }
        const release = await Promise.race([this.libraryProbe!.pending, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new SmartError("library_timeout", "公共库连接超时")), 10000); })]);
        if (this.settings.library_root !== root) return { ...this.libraryConnection };
        this.libraryConnection = { root, status: "published", version: release.release_version, count: release.ready_video_count, message: "已连接管理端发布的公共库；登录后可同步和检索" };
      } catch (error) { if (this.settings.library_root === root) this.libraryConnection = { ...base, status: "unavailable", message: error instanceof SmartError && error.code === "library_timeout" ? "公共库连接超时，请检查 NAS 挂载后重试" : "无法读取发布库，请检查 NAS 挂载、目录和管理端发布状态" }; }
      finally { if (timeout) clearTimeout(timeout); }
    }
    return { ...this.libraryConnection };
  }
  async updateSettings(body: Record<string, unknown>): Promise<ReturnType<SmartCore["publicSettings"]>> {
    const action = async () => {
      if (this.cacheClearing) throw new SmartError("cache_busy", "缓存正在清理，请稍后修改设置", 409);
      this.configuring = true;
      try {
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
      if (body.teacher_folder_bindings !== undefined) {
        if (!body.teacher_folder_bindings || typeof body.teacher_folder_bindings !== "object" || Array.isArray(body.teacher_folder_bindings)) throw new SmartError("teacher_bindings", "老师与素材文件夹的对应关系无效");
        const bindings = record(body.teacher_folder_bindings);
        if (Object.keys(bindings).length > 200 || Object.entries(bindings).some(([folder, teacher]) => !folder.trim() || folder.length > 200 || typeof teacher !== "string" || !teacher.trim() || teacher.length > 80)) throw new SmartError("teacher_bindings", "老师与素材文件夹的对应关系无效");
        if (JSON.stringify(bindings) !== JSON.stringify(this.settings.teacher_folder_bindings || {}) && (this.planning.size || this.rendering || this.monitoring)) throw new SmartError("runtime_busy", "请等待匹配和本机任务完成后调整老师归属", 409);
        next.teacher_folder_bindings = Object.fromEntries(Object.entries(bindings).map(([folder, teacher]) => [folder, (teacher as string).trim()]));
      }
      if (body.asr_model !== undefined) next.asr_model = requireText(body.asr_model, "转写模型", 80);
      const moved = next.workspace_root !== this.settings.workspace_root || next.library_root !== this.settings.library_root;
      if (moved && (this.activeStreams || this.rendering || this.planning.size || this.references.active || this.monitoring || this.store.listStatus("assembly", ["queued", "running", "paused", "failed"]).length || await this.manual.busy())) throw new SmartError("runtime_busy", "正在处理作品或参考视频，请等待或暂停任务后修改目录", 409);
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
      if (next.library_root !== this.settings.library_root) { this.session = null; await this.vault.set("cutter_session", ""); this.runtime.library_ready = false; this.libraryConnection = { status: "unchecked", root: next.library_root, version: "", count: 0, message: "目录已变化，请检查公共库连接" }; }
      await atomicPrivateJson(path.join(this.options.state_root, "settings.json"), next); this.settings = next; this.manual.update();
      return this.publicSettings();
      } finally { this.configuring = false; }
    };
    const operation = this.configWrites.then(action); this.configWrites = operation.catch(() => undefined); return operation;
  }
  async authStatus(): Promise<AccountStatus> {
    if (this.options.auth_mode === "local_trusted") return { required: false, user: { user_id: "local-test", username: "本机测试", tier: this.options.test_account_tier ?? "pro" } };
    if (!this.settings.library_root) return { required: true, user: null };
    if (!this.session) return { required: true, user: null };
    const root = this.settings.library_root, session = this.session;
    if (this.authProbe?.root !== root || this.authProbe.token !== session.session_token) {
      const pending = (async (): Promise<AccountStatus> => {
        // A missing/disconnected account store is an availability failure, not a revoked session.
        await stat(path.join(root, ".mixlab-library/cutter-users/users.json"));
        const status = await validateCutterSession(root, { device_id: session.device_id, session_token: session.session_token, now: now(), touch: false });
        return status.ok && status.user.devices.some(device => device.device_id === session.device_id && device.status === "active")
          ? { required: false, user: { user_id: status.user.user_id, username: status.user.username, tier: await cutterAccountTier(root, status.user.user_id) } } : { required: true, user: null };
      })().catch(() => { throw new SmartError("library_unavailable", "公共库连接中断，暂时无法验证账号；请恢复 NAS 连接后重试，无需修改密码", 503); });
      const probe = { root, token: session.session_token, pending }; this.authProbe = probe;
      void pending.finally(() => { if (this.authProbe === probe) this.authProbe = null; }).catch(() => undefined);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([this.authProbe.pending, new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new SmartError("library_unavailable", "公共库账号读取超时，请检查 NAS 连接后重试；当前登录凭证已保留", 503)), 10000);
      })]);
      return this.session?.session_token === session.session_token && this.settings.library_root === root ? result : this.authStatus();
    } finally { if (timeout) clearTimeout(timeout); }
  }
  async requireSession(): Promise<void> {
    const auth = await this.authStatus();
    if (auth.required || !auth.user) throw new SmartError("login_required", "请登录管理端已审核的剪辑师账号", 401);
  }
  async requirePro(): Promise<void> {
    const auth = await this.authStatus();
    if (auth.required || !auth.user) throw new SmartError("login_required", "请先登录", 401);
    if (auth.user.tier !== "pro") throw new SmartError("pro_required", "文案成片与自动创作需要 Pro 账号", 403);
  }
  cutterSessionHeaders(): Record<string, string> {
    return this.session ? { "x-mixlab-device-id": this.session.device_id, "x-mixlab-session-token": this.session.session_token } : {};
  }
  async changePassword(body: Record<string, unknown>): Promise<void> {
    await this.requireSession();
    if (!this.session) throw new SmartError("login_required", "请使用正式账号登录", 401);
    const result = await changeCutterAccountPassword(this.settings.library_root, { ...this.session,
      current_password: requireText(body.current_password, "当前密码", 256), new_password: requireText(body.new_password, "新密码", 256), now: now() });
    if (!result.ok) throw new SmartError("password_change", result.reason);
    this.session = null; await this.vault.set("cutter_session", "");
  }
  async login(body: Record<string, unknown>, register = false): Promise<unknown> {
    if (!this.settings.library_root) throw new SmartError("library_missing", "请先配置公共素材库");
    const connection = await this.checkLibrary();
    if (connection.status !== "published") throw new SmartError("library_unavailable", connection.message, 503);
    const input = { username: requireText(body.username, "用户名", 80), password: requireText(body.password, "密码", 256), device_id: this.settings.device_id, device_name: `MixLab 智能剪辑端 · ${os.hostname()}`, now: now() };
    if (register) return publicCutterUser(await registerCutterAccount(this.settings.library_root, input));
    const result = await loginCutterAccount(this.settings.library_root, input).catch(() => {
      throw new SmartError("library_unavailable", "无法读取或保存公共库账号，请检查 NAS 连接后重试", 503);
    });
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
    const work = this.store.get<Work>("work", workId); if (!work) throw new SmartError("work_missing", "作品不存在", 404);
    if (work.status === "matching" && work.match_progress?.phase.startsWith("semantic_")) {
      const status = this.ai.indexStatus;
      work.match_progress.semantic = { ...status, version: this.store.get<import("./library.ts").LibrarySnapshot>("snapshot", status.snapshot_id)?.version ?? "" };
    }
    return work;
  }
  private saveWork(work: Work): Work { work.updated_at = now(); return this.store.set("work", work); }
  createWork(script: string, origin: WorkOrigin = { trigger: "manual", kind: "manual_script" }, teacher = ""): Work {
    const content = requireText(script, "文案");
    if (splitScript(content).length > 200) throw new SmartError("script_length", "首版单条作品支持最多 200 句，请拆分长文案");
    const work: Work = { id: id("W"), title: automaticTitle(content), script: content, original_script: content, origin,
      revision: 1, status: "draft", snapshot_id: "", segments: [], settings: { ...DEFAULT_OUTPUT, teacher, source_folder: this.settings.default_source_folder }, created_at: now(), updated_at: now(), error: "" };
    return this.saveWork(work);
  }
  updateWork(workId: string, body: Record<string, unknown>): Work {
    const work = this.work(workId);
    if (work.status === "matching") throw new SmartError("work_busy", "匹配中，请等待完成后修改", 409);
    if (body.script !== undefined) {
      const script = requireText(body.script, "文案");
      if (splitScript(script).length > 200) throw new SmartError("script_length", "单条作品最多 200 句");
      if (script !== work.script) { work.script = script; work.title = automaticTitle(script); work.segments = []; work.snapshot_id = ""; work.status = "draft"; delete work.match_progress; }
    }
    if (body.settings !== undefined) {
      const before = work.settings.source_folder;
      const teacher = work.settings.teacher;
      work.settings = this.outputSettings(work.settings, record(body.settings));
      if (before !== work.settings.source_folder || teacher !== work.settings.teacher) {
        if (before !== work.settings.source_folder) work.snapshot_id = "";
        work.segments = []; work.status = "draft"; delete work.match_progress;
      }
      else if (work.segments.length) work.status = workReady(work) ? "ready" : "review";
    }
    work.revision++; work.error = ""; return this.saveWork(work);
  }
  private outputSettings(current: OutputSettings, body: Record<string, unknown>): OutputSettings {
    const next = { ...current };
    if (body.ratio !== undefined) { if (!["9:16", "16:9"].includes(String(body.ratio))) throw new SmartError("ratio", "画面比例无效"); next.ratio = body.ratio as OutputSettings["ratio"]; }
    if (body.crop_mode !== undefined) { if (!["portrait", "follow", "center", "fit"].includes(String(body.crop_mode))) throw new SmartError("crop", "取景方式无效"); next.crop_mode = body.crop_mode as OutputSettings["crop_mode"]; }
    if (body.shot_size !== undefined) { if (!["wide", "medium", "close"].includes(String(body.shot_size))) throw new SmartError("shot_size", "人物景别无效"); next.shot_size = body.shot_size as OutputSettings["shot_size"]; }
    if (body.crop_position !== undefined) next.crop_position = boundedNumber(body.crop_position, 0, 1, "横向构图");
    if (body.subtitle_size !== undefined) next.subtitle_size = boundedNumber(body.subtitle_size, 24, 100, "字幕字号");
    if (body.subtitle_style !== undefined) { if (!["white", "yellow", "outline", "box", "cinema", "pop"].includes(String(body.subtitle_style))) throw new SmartError("subtitle_style", "字幕样式无效"); next.subtitle_style = body.subtitle_style as OutputSettings["subtitle_style"]; }
    if (body.subtitle_margin !== undefined) next.subtitle_margin = boundedNumber(body.subtitle_margin, 0.03, 0.4, "字幕底部距离");
    if (body.subtitle_template !== undefined) {
      if (body.subtitle_template === null) delete next.subtitle_template;
      else next.subtitle_template = validateTemplate(body.subtitle_template);
    }
    for (const field of ["subtitles", "normalize_audio", "same_lecturer"] as const) if (body[field] !== undefined) { if (typeof body[field] !== "boolean") throw new SmartError("setting_type", "开关参数无效"); next[field] = body[field] as boolean; }
    if (body.source_folder !== undefined) next.source_folder = String(body.source_folder).trim();
    if (body.teacher !== undefined) next.teacher = requireText(body.teacher, "目标老师", 80);
    next.same_lecturer = true;
    return next;
  }
  saveSubtitleTemplate(body: Record<string, unknown>): SubtitleTemplate {
    const settings = this.outputSettings(DEFAULT_OUTPUT, record(body.settings));
    const template = resolvedTemplate(settings);
    if (!template) throw new SmartError("subtitle_template", "请先选择一套系统模板");
    return this.store.set("subtitle-template", validateTemplate({ ...template, id: id("MY"), version: 1, name: requireText(body.name, "模板名称", 30) }));
  }
  async previewTemplate(workId: string, body: Record<string, unknown>): Promise<Omit<TemplatePreview, "file" | "work" | "workspace">> {
    if (this.templatePreviewController || this.rendering) throw new SmartError("preview_busy", "本机正在生成视频，请完成后再预览", 409);
    const work = structuredClone(this.work(workId));
    work.settings = this.outputSettings(work.settings, record(body.settings));
    if (work.settings.teacher !== this.work(workId).settings.teacher || work.settings.source_folder !== this.work(workId).settings.source_folder) throw new SmartError("preview_scope", "素材范围已变化，请保存并重新匹配后预览", 409);
    this.library.assertWorkTeacher(work);
    const controller = new AbortController(); this.templatePreviewController = controller; this.activeStreams++;
    try {
      const result = await renderTemplatePreview(this.media, work, this.settings.workspace_root, this.store.list<Job>("job"), AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]));
      if (this.templatePreviews.size >= 50) this.templatePreviews.delete(this.templatePreviews.keys().next().value!);
      this.templatePreviews.set(result.id, result);
      return { id: result.id, duration_ms: result.duration_ms, warnings: result.warnings };
    } finally { this.templatePreviewController = null; this.activeStreams--; }
  }
  async generatePlan(workId: string): Promise<Work> {
    if (this.planning.has(workId)) throw new SmartError("plan_busy", "该作品正在匹配", 409);
    const work = this.work(workId); const revision = work.revision;
    if (!work.settings.teacher) throw new SmartError("teacher_required", "请先选择目标老师，再生成匹配方案", 409);
    const pinned = work.snapshot_id || work.match_progress?.snapshot_id;
    const script = splitScript(work.script);
    work.match_progress = { phase: "snapshot_check", started_at: now(), updated_at: now(), total_sentences: script.length,
      completed_sentences: 0, current_sentence: 0, exact_matches: 0, near_matches: 0, missing_matches: 0 };
    this.planning.add(workId); work.status = "matching"; work.error = ""; this.saveWork(work);
    try {
      const plan = await this.library.plan(script, work.settings.source_folder, progress => {
        const current = this.work(workId);
        current.match_progress = { ...current.match_progress!, ...progress, updated_at: now() };
        delete current.match_progress.semantic;
        this.saveWork(current);
      }, pinned, work.settings.teacher);
      const current = this.work(workId); if (current.revision !== revision) throw new SmartError("plan_revision", "文案版本已变化，请重新匹配", 409);
      current.snapshot_id = plan.snapshot.id; current.segments = plan.segments;
      current.status = workReady(current) ? "ready" : "review"; this.runtime.library_ready = true;
      this.runtime.library_count = plan.snapshot.ready_video_count; this.runtime.library_version = plan.snapshot.version;
      return this.saveWork(current);
    } catch (error) { const current = this.work(workId); current.status = "failed"; current.error = this.vault.redact((error as Error).message); if (current.match_progress) { current.match_progress.phase = "failed"; current.match_progress.updated_at = now(); } this.saveWork(current); throw error; }
    finally { this.planning.delete(workId); }
  }
  selectSegment(workId: string, segmentId: number, body: Record<string, unknown>): Work {
    const work = this.work(workId); if (work.status === "matching" || work.status === "rendering") throw new SmartError("work_busy", "请等待当前匹配或导出完成", 409);
    if (body.revision !== work.revision) throw new SmartError("plan_revision", "方案已更新，请刷新后操作", 409);
    const segment = work.segments.find(item => item.id === segmentId);
    if (!segment) throw new SmartError("segment_missing", "句子不存在", 404);
    if (typeof body.candidate_id === "string") {
      const candidate = segment.candidates.find(item => item.id === body.candidate_id);
      if (!candidate) throw new SmartError("candidate_missing", "只能选择本方案中已验证的真实片段", 409);
      this.library.assertTeacher(this.library.getSnapshot(work.snapshot_id), work.settings.teacher || "", candidate);
      segment.selected = candidate; segment.actual = candidate.actual; segment.status = classifyMatch(segment.target, candidate.actual); segment.accepted = false; segment.skipped = false;
    }
    if (body.skipped !== undefined) {
      if (typeof body.skipped !== "boolean") throw new SmartError("skip_invalid", "跳过状态必须为开关值");
      segment.skipped = body.skipped;
    }
    if (body.accepted === true) {
      if (segment.skipped) throw new SmartError("confirmation_invalid", "请先恢复此句，再确认原声", 409);
      if (segment.status !== "near" || !segment.selected) throw new SmartError("confirmation_invalid", "缺句或关键事实冲突不能通过近似确认，请修改文案或更换片段", 409);
      this.library.assertTeacher(this.library.getSnapshot(work.snapshot_id), work.settings.teacher || "", segment.selected);
      segment.accepted = true;
    }
    work.revision++; work.status = workReady(work) ? "ready" : "review"; work.error = "";
    return this.saveWork(work);
  }
  acceptAllSegments(workId: string, body: Record<string, unknown>): Work {
    const work = this.work(workId);
    if (work.status === "matching" || work.status === "rendering") throw new SmartError("work_busy", "请等待当前处理完成", 409);
    if (body.revision !== work.revision) throw new SmartError("plan_revision", "方案已更新，请刷新后操作", 409);
    const pending = includedSegments(work).filter(segment => segment.status === "near" && segment.selected && segment.actual.trim() && !segment.accepted);
    if (!pending.length) return work;
    for (const segment of pending) this.library.assertTeacher(this.library.getSnapshot(work.snapshot_id), work.settings.teacher || "", segment.selected!);
    for (const segment of pending) segment.accepted = true;
    work.revision++; work.status = workReady(work) ? "ready" : "review"; work.error = "";
    return this.saveWork(work);
  }
  skipMissingSegments(workId: string, body: Record<string, unknown>): Work {
    const work = this.work(workId);
    if (work.status === "matching" || work.status === "rendering") throw new SmartError("work_busy", "请等待当前匹配或导出完成", 409);
    if (body.revision !== work.revision) throw new SmartError("plan_revision", "方案已更新，请刷新后操作", 409);
    const missing = includedSegments(work).filter(segment => segment.status === "gap" || segment.status === "pending");
    if (!missing.length) return work;
    for (const segment of missing) segment.skipped = true;
    work.revision++; work.status = workReady(work) ? "ready" : "review"; work.error = "";
    return this.saveWork(work);
  }
  rotateSource(workId: string, segmentId: number, body: Record<string, unknown>): Work {
    const work = this.work(workId), candidate = work.segments.find(segment => segment.id === segmentId)?.selected;
    if (work.status === "matching" || work.status === "rendering") throw new SmartError("work_busy", "请等待当前匹配或导出完成", 409);
    if (body.revision !== work.revision) throw new SmartError("plan_revision", "方案已更新，请刷新后操作", 409);
    if (!candidate) throw new SmartError("source_missing", "请先选择需要校正的原声片段", 409);
    if (![0, 90, 180, 270].includes(body.rotation as number)) throw new SmartError("rotation_invalid", "画面方向只支持 0、90、180、270 度");
    this.library.assertTeacher(this.library.getSnapshot(work.snapshot_id), work.settings.teacher || "", candidate);
    const key = this.library.directionKey(candidate), rotation = body.rotation as NonNullable<typeof candidate.rotation>;
    const same = (item: typeof candidate | null) => item && this.library.directionKey(item) === key;
    const affected = this.store.list<Work>("work", this.store.count("work")).filter(item => item.segments.some(segment => same(segment.selected) || segment.candidates.some(same)));
    if (affected.some(item => item.status === "matching" || item.status === "rendering")) throw new SmartError("source_busy", "其他作品正在使用该原片匹配或导出，请完成后校正方向", 409);
    this.store.transact(() => {
      this.store.set("source-direction", { id: key, rotation });
      for (const item of affected) {
        for (const segment of item.segments) {
          if (same(segment.selected)) segment.selected!.rotation = rotation;
          for (const alternative of segment.candidates) if (same(alternative)) alternative.rotation = rotation;
        }
        item.revision++; item.status = workReady(item) ? "ready" : "review"; item.error = ""; this.saveWork(item);
      }
    });
    return this.work(workId);
  }
  async searchSegment(workId: string, segmentId: number, query: string): Promise<Work> {
    const work = this.work(workId), segment = work.segments.find(item => item.id === segmentId);
    if (!segment) throw new SmartError("segment_missing", "句子不存在", 404);
    const revision = work.revision;
    if (!work.settings.teacher) throw new SmartError("teacher_required", "请先选择目标老师并重新匹配", 409);
    const candidates = await this.library.candidates(this.library.getSnapshot(work.snapshot_id), segment.target, work.settings.source_folder, requireText(query, "搜索内容", 500), undefined, undefined, work.settings.teacher);
    const current = this.work(workId); if (current.revision !== revision) throw new SmartError("plan_revision", "方案已更新，请重新搜索", 409);
    const target = current.segments.find(item => item.id === segmentId)!;
    target.candidates = [...new Map([...target.candidates, ...candidates].map(candidate => [candidate.id, candidate])).values()].slice(-30);
    return this.saveWork(current);
  }
  async supplementSegment(workId: string, segmentId: number, body: Record<string, unknown>): Promise<Work> {
    const work = this.work(workId), segment = work.segments.find(item => item.id === segmentId);
    if (!segment) throw new SmartError("segment_missing", "句子不存在", 404);
    if (work.status === "matching" || body.revision !== work.revision) throw new SmartError("plan_revision", "方案已更新，请返回审核后重新补选", 409);
    const candidate = await this.library.selectedRange(this.library.getSnapshot(work.snapshot_id), segment.target, body);
    this.library.assertTeacher(this.library.getSnapshot(work.snapshot_id), work.settings.teacher || "", candidate);
    const current = this.work(workId);
    if (current.revision !== body.revision) throw new SmartError("plan_revision", "方案已更新，请重新补选", 409);
    const target = current.segments.find(item => item.id === segmentId)!;
    target.candidates = [...target.candidates.filter(item => item.id !== candidate.id), candidate].slice(-30);
    target.selected = candidate; target.actual = candidate.actual; target.status = candidate.kind; target.accepted = false; target.skipped = false;
    current.revision++; current.status = workReady(current) ? "ready" : "review"; current.error = "";
    return this.saveWork(current);
  }
  enqueue(workId: string): Job {
    const work = this.work(workId);
    if (!work.settings.teacher) throw new SmartError("teacher_required", "请先选择目标老师并重新匹配", 409);
    if (!includedSegments(work).length) throw new SmartError("empty_work", "至少保留一句已审核的原声片段才能导出", 409);
    if (!workReady(work)) throw new SmartError("review_required", "仍有未处理句子，请审核原声或明确跳过后导出", 409);
    this.library.assertWorkTeacher(work);
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
      this.library.assertWorkTeacher(work);
      if (work.revision !== job.revision) { job.work = structuredClone(work); job.revision = work.revision; job.completed_clips = []; job.clip_checksums = {}; job.compositions = {}; }
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
    if (this.rendering || this.templatePreviewController || this.closed || this.cacheClearing) return; this.rendering = true;
    try {
      let job;
      while (!this.closed && (job = this.store.listStatus<Job>("job", ["queued"], 1)[0])) {
        const controller = new AbortController(); this.controllers.set(job.id, controller);
        const current = job; current.status = "running";
        const update = () => { if (controller.signal.aborted) return; current.updated_at = now(); this.store.set("job", current); };
        try {
          await retrySourceConnection(() => this.requirePro(), { signal: controller.signal,
            onRetry: (retry, total) => { current.phase = `NAS账号连接中断，自动重试 ${retry}/${total}，保留 ${current.completed_clips.length} 段`; update(); }
          }); this.library.assertWorkTeacher(current.work); update(); await this.media.render(current, controller.signal, update);
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
    const teacher = requireText(body.teacher, "绑定老师", 80);
    if (!(await this.library.teachers()).some(item => item.name === teacher)) throw new SmartError("teacher_missing", "请选择公共素材库中的老师", 409);
    const resolved = await this.provider.resolveAccount(platform, input);
    if (this.store.list<Account>("account").some(account => account.platform === platform && (resolved.sec_user_id ? account.sec_user_id === resolved.sec_user_id : account.unique_id === resolved.unique_id))) throw new SmartError("account_duplicate", "该账号已在监控列表中", 409);
    return this.store.set("account", { id: id("A"), platform, name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : resolved.name || resolved.unique_id || resolved.sec_user_id,
      input, teacher, sec_user_id: resolved.sec_user_id, unique_id: resolved.unique_id, followers: resolved.followers,
      group: typeof body.group === "string" ? body.group.trim().slice(0, 80) : "默认分组", enabled: true, last_checked_at: "", last_error: "", cursor: "0" });
  }
  async updateAccount(accountId: string, body: Record<string, unknown>): Promise<Account> {
    const account = this.store.get<Account>("account", accountId); if (!account) throw new SmartError("account_missing", "关注账号不存在", 404);
    if (body.enabled !== undefined) { if (typeof body.enabled !== "boolean") throw new SmartError("account_input", "监控开关无效"); account.enabled = body.enabled; }
    if (body.name !== undefined) account.name = requireText(body.name, "账号备注", 80);
    if (body.group !== undefined) account.group = requireText(body.group, "分组", 80);
    if (body.teacher !== undefined) {
      const teacher = requireText(body.teacher, "绑定老师", 80);
      if (!(await this.library.teachers()).some(item => item.name === teacher)) throw new SmartError("teacher_missing", "请选择公共素材库中的老师", 409);
      account.teacher = teacher;
    }
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
    await this.requirePro();
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
    const budgetKey = `rule:${rule.id}:${localDay()}`;
    let attempted = 0;
    for (const candidate of eligible) {
      if (attempted >= rule.candidates_per_run || this.closed || !this.store.get<Rule>('rule', rule.id)?.enabled) break;
      if (this.store.requestCount(budgetKey) >= rule.daily_limit) { rule.last_error = '达到今日自动处理上限，未继续下载或提交转写'; break; }
      if (!this.store.claimRule(rule.id, candidate.id, now())) continue;
      try {
        const teacher = accounts.find(item => item.id === candidate.account_id)?.teacher;
        if (!teacher) throw new SmartError("teacher_required", "监控账号尚未绑定老师，请在博主监控中绑定后继续", 409);
        this.store.reserveRequest(budgetKey, rule.daily_limit); attempted++;
        const hot = await this.references.process(candidate.id);
        if (this.closed) break;
        const work = this.createWork(hot.transcript, { trigger: "automatic", kind: "rule", platform: hot.platform,
          account_id: hot.account_id, account_name: hot.author, rule_id: rule.id, rule_name: rule.name, hot_id: hot.id, reference_title: hot.title }, teacher);
        work.settings.source_folder = rule.source_folder; this.saveWork(work);
        this.store.bindRuleWork(rule.id, candidate.id, work.id);
        await this.generatePlan(work.id);
        const ready = this.work(work.id);
        // enqueue validates every source against the pinned catalog and confirmed folder bindings.
        // Cached candidate labels may be absent or stale and must not be used as identity proof.
        if (rule.execution === "qualified" && workReady(ready) && ready.segments.every(segment => segment.status === "exact")) this.enqueue(ready.id);
        else if (rule.execution === "qualified") {
          ready.status = 'review';
          ready.error = '原声方案需要人工确认，不满足自动导出条件';
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
      account_id: hot.account_id, account_name: hot.author, hot_id: hot.id, reference_title: hot.title }, this.store.get<Account>("account", hot.account_id)?.teacher || "");
  }
  async state() {
    const auth = await this.authStatus();
    const smartAllowed = !auth.required && auth.user?.tier === "pro";
    const works = !smartAllowed ? [] : this.store.list<Work>("work", 100).map(work => ({
      id: work.id, title: work.title, origin: work.origin, status: work.status, revision: work.revision,
      created_at: work.created_at, updated_at: work.updated_at, error: work.error, settings: work.settings,
      segment_count: work.segments.length, skipped_count: work.segments.filter(segment => segment.skipped).length,
      pending_count: includedSegments(work).filter(segment => segment.status !== "exact" && !segment.accepted).length,
      duration_ms: includedSegments(work).reduce((sum, segment) => sum + (segment.selected ? segment.selected.end_ms - segment.selected.begin_ms : 0), 0)
    }));
    const jobs = !smartAllowed ? [] : this.store.list<Job>("job", 100).map(job => ({
      id: job.id, work_id: job.work_id, title: job.work.title, origin: job.work.origin,
      status: job.status, phase: job.phase, progress: job.progress, error: job.error,
      created_at: job.created_at, updated_at: job.updated_at, duration_ms: job.duration_ms,
      has_output: job.status === "done", ratio: job.work.settings.ratio
    }));
    return { settings: this.publicSettings(), auth, works, jobs, assemblies: auth.required ? [] : this.store.list<import("./assembly.ts").Assembly>("assembly", 100),
      accounts: !smartAllowed ? [] : this.store.list<Account>("account", 100),
      hot: !smartAllowed ? [] : await Promise.all(this.store.list<HotVideo>("hot", 100).map(async ({ local_video_path: _video, local_audio_path: _audio, asr_task_id: _task, ...hot }) => ({ ...hot, video_cached: !!await this.references.videoPath(hot.id).catch(() => null) }))),
      rules: !smartAllowed ? [] : this.store.list<Rule>("rule", 100),
      monitor: this.store.get<Record<string, unknown>>("monitor", "current"),
      request_count: this.store.requestCount(localDay()), device_name: os.hostname(), limited_to: 100 };
  }
  private async tick(): Promise<void> {
    void this.assemblies.drain().catch(() => undefined);
    if (this.closed || this.cacheClearing || this.configuring) return;
    if (this.controllers.size && !this.renderAuthCheck) {
      this.renderAuthCheck = new AbortController();
      try {
        const auth = await retrySourceConnection(() => this.authStatus(), { signal: this.renderAuthCheck.signal }).catch(() => null);
        if (this.closed) return;
        if (!auth || auth.required || auth.user?.tier !== "pro") for (const [jobId, controller] of this.controllers) {
          const job = this.store.get<Job>("job", jobId);
          if (job?.status === "running") {
            job.status = "paused"; job.error = auth ? "账号权限已变化，已保存检查点" : "NAS账号校验连接仍未恢复，已自动重试3次并保存检查点"; this.store.set("job", job); controller.abort();
            const work = this.work(job.work_id);
            if (work.revision === job.revision) { work.status = "ready"; work.error = job.error; this.saveWork(work); }
          }
        }
      } finally { this.renderAuthCheck = null; }
    }
    void this.drain();
    if (this.monitoring || !this.vault.has("tikhub") || !this.store.list<Account>("account", 100).some(account => account.enabled)) return;
    const previous = this.store.get<{ finished_at: string }>("monitor", "current");
    if (previous?.finished_at && Date.now() - new Date(previous.finished_at).getTime() < this.settings.monitor_interval_minutes * 60_000) return;
    try { await this.monitorRun(); } catch { /* Detailed failure is preserved in account/rule status; no credentials are logged. */ }
  }
  async close(): Promise<void> {
    this.templatePreviewController?.abort();
    this.closed = true; if (this.timer) clearInterval(this.timer);
    this.renderAuthCheck?.abort();
    await this.manual.close(); await this.assemblies.close();
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
