import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { saveBasicProject, manageLocalClip, type BasicProject } from "./workspace.ts";
import { SmartCore } from "./core.ts";
import { SmartError, requireText, type Job, type HotVideo, type Candidate } from "./types.ts";

const ORIGINS = new Set(["http://127.0.0.1:5178", "http://localhost:5178", ...(process.env.MIXLAB_SMART_DEV_ORIGIN ? [process.env.MIXLAB_SMART_DEV_ORIGIN] : []), "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);
function equalToken(a: string, b: string): boolean { const first = Buffer.from(a), second = Buffer.from(b); return first.length === second.length && timingSafeEqual(first, second); }
function json(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); response.end(JSON.stringify(data));
}
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const buffers: Buffer[] = []; let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk); bytes += value.length;
    if (bytes > 2 * 1024 * 1024) throw new SmartError("body_size", "请求内容过大", 413);
    buffers.push(value);
  }
  if (!bytes) return {};
  let value;
  try { value = JSON.parse(Buffer.concat(buffers).toString("utf8")); } catch { throw new SmartError("invalid_json", "请求格式不正确"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SmartError("invalid_json", "请求必须为 JSON 对象");
  return value as Record<string, unknown>;
}
export async function streamFile(request: IncomingMessage, response: ServerResponse, file: string, type: string): Promise<void> {
  const info = await stat(file).catch(() => { throw new SmartError("file_missing", "文件不可读取或已被移动", 404); });
  if (!info.isFile()) throw new SmartError("file_missing", "文件不可读取", 404);
  let begin = 0, end = info.size - 1, status = 200;
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) { response.writeHead(416, { "Content-Range": `bytes */${info.size}` }); response.end(); return; }
    if (!match[1]) { const suffix = Number(match[2]); begin = Math.max(0, info.size - suffix); }
    else { begin = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (begin > end || begin >= info.size || !Number.isSafeInteger(begin) || !Number.isSafeInteger(end)) { response.writeHead(416, { "Content-Range": `bytes */${info.size}` }); response.end(); return; }
    status = 206;
  }
  response.writeHead(status, { "Content-Type": type, "Content-Length": end - begin + 1, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
    ...(status === 206 ? { "Content-Range": `bytes ${begin}-${end}/${info.size}` } : {}) });
  if (request.method === "HEAD") { response.end(); return; }
  const stream = createReadStream(file, { start: begin, end });
  response.once("close", () => stream.destroy()); stream.once("error", () => response.destroy()); stream.pipe(response);
}
function background(operation: Promise<unknown>): void { void operation.catch(() => { /* Domain state holds errors; credentials and request bodies are never logged. */ }); }
function openPath(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    const child = spawn(command, [target], { windowsHide: true, stdio: "ignore", shell: false });
    child.once("error", () => reject(new SmartError("open_path", "无法打开本机目录", 503))); child.once("spawn", resolve);
  });
}
export function createSmartServer(core: SmartCore, token = "", shutdown?: () => void) {
  return createServer(async (request, response) => {
    try {
      const host = (request.headers.host ?? "").toLowerCase();
      if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw new SmartError("host", "只接受本机请求", 403);
      const origin = request.headers.origin;
      if (origin && !ORIGINS.has(origin)) throw new SmartError("origin", "请求来源不受信任", 403);
      if (origin) { response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Vary", "Origin"); }
      response.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Smart-Token");
      response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS");
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/health" && request.method === "GET") { json(response, 200, { ok: true, product: "mixlab-smart-cutter", version: "0.1.0", runtime: core.runtime }); return; }
      if (token) {
        const incoming = String(request.headers["x-smart-token"] ?? url.searchParams.get("access") ?? "");
        if (!equalToken(incoming, token)) throw new SmartError("local_token", "本机连接凭证无效，请重新打开应用", 401);
      }
      const method = request.method;
      if (url.pathname === "/smart/runtime/shutdown" && method === "POST" && token && shutdown) {
        json(response, 202, { stopping: true }); setImmediate(shutdown); return;
      }
      if (url.pathname.startsWith("/cutter/") || url.pathname.startsWith("/smart/media/")) {
        if (core.cacheClearing || core.configuring) throw new SmartError("cache_busy", "缓存或目录正在调整，请稍后播放或剪切", 409);
        core.activeStreams++;
        response.once("close", () => { core.activeStreams--; });
      }
      if (url.pathname === "/smart/state" && method === "GET") { json(response, 200, await core.state()); return; }
      if (url.pathname === "/smart/settings") {
        if (method === "GET") { json(response, 200, core.publicSettings()); return; }
        if (method === "PUT") { const input = await body(request);
          if (["tikhub_api_key", "asr_api_key", "clear_tikhub_key", "clear_asr_key", "monitor_platform", "monitor_interval_minutes", "request_limit_per_day", "max_download_mb", "asr_model", "reference_cache_gb", "default_source_folder"].some(key => Object.hasOwn(input, key))) await core.requirePro();
          json(response, 200, await core.updateSettings(input)); return; }
      }
      if (url.pathname === "/smart/auth/login" && method === "POST") { json(response, 200, await core.login(await body(request))); return; }
      if (url.pathname === "/smart/auth/register" && method === "POST") { json(response, 201, await core.login(await body(request), true)); return; }
      if (url.pathname === "/smart/auth/logout" && method === "POST") { await core.logout(); json(response, 200, { logged_out: true }); return; }
      if (url.pathname === "/smart/provider/test" && method === "POST") { await core.requirePro(); json(response, 200, await core.provider.testConnection()); return; }
      await core.requireSession();
      if (url.pathname === "/smart/auth/password" && method === "POST") { await core.changePassword(await body(request)); json(response, 200, { changed: true }); return; }
      if ((core.cacheClearing || core.configuring) && method !== "GET") throw new SmartError("cache_busy", "正在清理缓存，请稍后操作", 409);
      if (url.pathname === "/smart/assemblies" && method === "POST") { const input = await body(request); json(response, 202, await core.assemblies.submit(String(input.project_id), input.cut_job_ids)); return; }
      const assemblyRoute = /^\/smart\/assemblies\/([^/]+)\/(action|open|video|srt|manifest)$/.exec(url.pathname);
      if (assemblyRoute) {
        const job = core.store.get<import("./assembly.ts").Assembly>("assembly", decodeURIComponent(assemblyRoute[1]!));
        if (!job) throw new SmartError("assembly_missing", "合并任务不存在", 404);
        if (assemblyRoute[2] === "action" && method === "POST") { json(response, 200, core.assemblies.control(job.id, String((await body(request)).action))); return; }
        if (job.status !== "done") throw new SmartError("output_missing", "任务没有可用成果", 409);
        if (assemblyRoute[2] === "open" && method === "POST") { await openPath(path.dirname(job.output_path)); json(response, 200, { opened: true }); return; }
        if (["GET", "HEAD"].includes(method ?? "")) {
          if (core.cacheClearing) throw new SmartError("cache_busy", "缓存正在清理", 409);
          core.activeStreams++; response.once("close", () => { core.activeStreams--; });
          const name = assemblyRoute[2], file = name === "video" ? job.output_path : path.join(path.dirname(job.output_path), name === "srt" ? "subtitles.srt" : "sources.json");
          await streamFile(request, response, file, name === "video" ? "video/mp4" : name === "srt" ? "text/plain; charset=utf-8" : "application/json"); return;
        }
      }
      if (url.pathname === "/smart/projects") {
        if (method === "GET") { json(response, 200, core.store.list<BasicProject>("project")); return; }
        if (method === "POST") { json(response, 201, saveBasicProject(core, await body(request))); return; }
      }
      const projectRoute = /^\/smart\/projects\/([^/]+)$/.exec(url.pathname);
      if (projectRoute && method === "PATCH") { json(response, 200, saveBasicProject(core, await body(request), decodeURIComponent(projectRoute[1]!))); return; }
      if (projectRoute && method === "DELETE") { if (await core.manual.busy() || core.store.listStatus<import("./assembly.ts").Assembly>("assembly", ["queued", "running", "paused", "failed"]).some(job => job.project_id === decodeURIComponent(projectRoute[1]!))) throw new SmartError("project_busy", "请等待本机任务完成后删除项目记录", 409); core.store.remove("project", decodeURIComponent(projectRoute[1]!)); json(response, 200, { removed: true }); return; }
      const localRoute = /^\/smart\/local\/(E\d{6})$/.exec(url.pathname);
      if (localRoute && method === "PATCH") { await manageLocalClip(core, localRoute[1]!, requireText((await body(request)).title, "素材名称", 120)); json(response, 200, { renamed: true }); return; }
      if (localRoute && method === "DELETE") { await manageLocalClip(core, localRoute[1]!); json(response, 200, { removed: true }); return; }
      if (url.pathname === "/smart/cache" && method === "GET") { json(response, 200, await core.cache.status()); return; }
      if (url.pathname === "/smart/cache/clear" && method === "POST") { json(response, 200, await core.cache.clear((await body(request)).kinds)); return; }
      const deleteOutputs = /^\/cutter\/projects\/([^/]+)\/outputs$/.exec(url.pathname);
      if (deleteOutputs && method === "DELETE" && core.store.listStatus<import("./assembly.ts").Assembly>("assembly", ["queued", "running", "paused", "failed"]).some(job => job.project_id === decodeURIComponent(deleteOutputs[1]!))) throw new SmartError("project_busy", "请完成或取消合并任务后删除项目文件", 409);
      if (url.pathname.startsWith("/cutter/")) { core.manual.dispatch(request, response); return; }
      if (url.pathname === "/smart/library/sync" && method === "POST") { background(core.syncLibrary()); json(response, 202, { started: true }); return; }
      if (url.pathname === "/smart/library/folders" && method === "GET") { json(response, 200, await core.library.folders()); return; }
      if (url.pathname === "/smart/workspace/open" && method === "POST") { await openPath(core.settings.workspace_root); json(response, 200, { opened: true }); return; }
      await core.requirePro();
      if (url.pathname === "/smart/library/index" && method === "POST") {
        const snapshot = await core.library.snapshot(); background(core.ai.buildIndex(snapshot)); json(response, 202, { started: true }); return;
      }
      if (url.pathname === "/smart/library/index/stop" && method === "POST") { core.ai.stopIndex(); json(response, 200, { stopped: true }); return; }

      if (url.pathname === "/smart/works" && method === "POST") { const input = await body(request); json(response, 201, core.createWork(requireText(input.script, "文案"))); return; }
      const supplement = /^\/smart\/works\/([^/]+)\/segments\/(\d+)\/supplement$/.exec(url.pathname);
      if (supplement && method === "POST") { json(response, 200, await core.supplementSegment(decodeURIComponent(supplement[1]!), Number(supplement[2]), await body(request))); return; }
      const workRoute = /^\/smart\/works\/([^/]+)(?:\/(plan|render|search))?$/.exec(url.pathname);
      if (workRoute) {
        const workId = decodeURIComponent(workRoute[1]!);
        if (!workRoute[2] && method === "GET") { json(response, 200, core.work(workId)); return; }
        if (!workRoute[2] && method === "PATCH") { json(response, 200, core.updateWork(workId, await body(request))); return; }
        if (workRoute[2] === "plan" && method === "POST") { background(core.generatePlan(workId)); json(response, 202, { started: true }); return; }
        if (workRoute[2] === "render" && method === "POST") { json(response, 202, core.enqueue(workId)); return; }
        if (workRoute[2] === "search" && method === "POST") { const input = await body(request); json(response, 200, await core.searchSegment(workId, Number(input.segment_id), requireText(input.query, "搜索内容", 500))); return; }
      }
      const segmentRoute = /^\/smart\/works\/([^/]+)\/segments\/(\d+)$/.exec(url.pathname);
      if (segmentRoute && method === "PATCH") { json(response, 200, core.selectSegment(decodeURIComponent(segmentRoute[1]!), Number(segmentRoute[2]), await body(request))); return; }
      const jobRoute = /^\/smart\/jobs\/([^/]+)(?:\/(action|open))?$/.exec(url.pathname);
      if (jobRoute) {
        const jobId = decodeURIComponent(jobRoute[1]!);
        const job = core.store.get<Job>("job", jobId); if (!job) throw new SmartError("job_missing", "任务不存在", 404);
        if (!jobRoute[2] && method === "GET") { json(response, 200, job); return; }
        if (jobRoute[2] === "action" && method === "POST") { json(response, 200, core.controlJob(jobId, String((await body(request)).action))); return; }
        if (jobRoute[2] === "open" && method === "POST") { if (job.status !== "done") throw new SmartError("job_not_done", "任务尚未生成可用结果", 409); await openPath(path.dirname(job.output_path)); json(response, 200, { opened: true }); return; }
      }
      if (url.pathname === "/smart/accounts" && method === "POST") { json(response, 201, await core.addAccount(await body(request))); return; }
      const accountRoute = /^\/smart\/accounts\/([^/]+)$/.exec(url.pathname);
      if (accountRoute && method === "PATCH") { json(response, 200, core.updateAccount(decodeURIComponent(accountRoute[1]!), await body(request))); return; }
      if (accountRoute && method === "DELETE") { core.store.remove("account", decodeURIComponent(accountRoute[1]!)); json(response, 200, { removed: true }); return; }
      if (url.pathname === "/smart/monitor/run" && method === "POST") { background(core.monitorRun()); json(response, 202, { started: true }); return; }
      if (url.pathname === "/smart/rules" && method === "POST") { json(response, 201, core.saveRule(await body(request))); return; }
      const ruleRoute = /^\/smart\/rules\/([^/]+)$/.exec(url.pathname);
      if (ruleRoute && method === "PATCH") { json(response, 200, core.saveRule(await body(request), decodeURIComponent(ruleRoute[1]!))); return; }
      if (ruleRoute && method === "DELETE") { core.store.remove("rule", decodeURIComponent(ruleRoute[1]!)); json(response, 200, { removed: true }); return; }
      const hotRoute = /^\/smart\/hot\/([^/]+)\/(transcribe|import)$/.exec(url.pathname);
      if (hotRoute && method === "POST") {
        const hotId = decodeURIComponent(hotRoute[1]!);
        if (hotRoute[2] === "import") { json(response, 201, await core.importHot(hotId)); return; }
        const input = await body(request);
        if (input.force_resubmit === true) {
          if (core.references.active) throw new SmartError("reference_busy", "正在处理参考视频，请稍后重提", 409);
          const hot = core.store.get<HotVideo>("hot", hotId); if (!hot) throw new SmartError("hot_missing", "参考视频不存在", 404);
          hot.asr_task_id = ""; hot.asr_submitted_at = ""; hot.asr_model = ""; hot.transcript = ""; hot.status = "discovered"; core.store.set("hot", hot);
        }
        background(core.references.process(hotId)); json(response, 202, { started: true }); return;
      }
      const source = /^\/smart\/media\/works\/([^/]+)\/(\d+)\/(media|cover)$/.exec(url.pathname);
      if (source && ["GET", "HEAD"].includes(method ?? "")) {
        const work = core.work(decodeURIComponent(source[1]!)); const segment = work.segments.find(item => item.id === Number(source[2]));
        const requested = url.searchParams.get("candidate");
        const candidate = requested ? segment?.candidates.find(item => item.id === requested) : segment?.selected;
        if (!candidate) throw new SmartError("source_missing", "该句没有可播放片段", 404);
        const file = source[3] === 'cover' ? candidate.cover_file_path : await core.media.preview(candidate, core.settings.workspace_root);
        await streamFile(request, response, file, source[3] === "cover" ? "image/jpeg" : "video/mp4"); return;
      }
      const output = /^\/smart\/media\/jobs\/([^/]+)\/(video|srt|manifest)$/.exec(url.pathname);
      if (output && ["GET", "HEAD"].includes(method ?? "")) {
        const job = core.store.get<Job>("job", decodeURIComponent(output[1]!)); if (!job || job.status !== "done") throw new SmartError("output_missing", "没有可用成片", 404);
        const file = output[2] === "video" ? job.output_path : output[2] === "srt" ? path.join(path.dirname(job.output_path), "subtitles.srt") : job.manifest_path;
        if (output[2] !== 'video') response.setHeader('Content-Disposition', `attachment; filename="${output[2] === 'srt' ? 'subtitles.srt' : 'sources.json'}"`);
        await streamFile(request, response, file, output[2] === "video" ? "video/mp4" : output[2] === "srt" ? "text/plain; charset=utf-8" : "application/json"); return;
      }
      throw new SmartError("not_found", "接口不存在", 404);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const failure = error instanceof SmartError ? error : new SmartError("internal_error", "本机处理失败，请检查配置、文件和任务状态", 500);
      json(response, failure.status, { error: { code: failure.code, message: core.vault.redact(failure.message) } });
    }
  });
}
