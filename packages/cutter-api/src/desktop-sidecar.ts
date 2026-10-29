import { spawn, type ChildProcess } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  buildCutterApiEnv,
  isWindowsUncPath,
  normalizeDesktopPathForStorage,
  type CutterDesktopConfig
} from "../../desktop-runtime/src/index.ts";
import { appendUsageEvent } from "../../library-fs/src/usage-events.ts";
import {
  createCutterApiServer,
  type CreateCutterApiServerInput,
  type CutterUsageEventRecorder
} from "./index.ts";

const DEFAULT_DESKTOP_SEARCHD_TIMEOUT_MS = 20_000;
const DEFAULT_DESKTOP_SEARCHD_FIRST_PAGE_TIMEOUT_MS = 10_000;
const DEFAULT_DESKTOP_SEARCHD_CURSOR_TIMEOUT_MS = 4_000;
const DEFAULT_DESKTOP_SEARCHD_RETRY_ATTEMPTS = 8;
const DEFAULT_DESKTOP_SEARCHD_RETRY_BACKOFF_MS = 1_200;
const DEFAULT_DESKTOP_SEARCHD_FIRST_PAGE_BUDGET_MS = 18_000;

export interface ResolveDesktopSidecarConfigPathInput {
  args?: readonly string[];
  env?: Partial<Record<string, string | undefined>>;
}

export interface StartCutterApiSidecarInput extends ResolveDesktopSidecarConfigPathInput {
  config_path?: string;
  read_config?: (configPath: string) => Promise<CutterDesktopConfig>;
  create_server?: (input: CreateCutterApiServerInput) => Server;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  apply_env?: (env: Record<string, string>) => void;
  log_event?: (event: SidecarEvent) => Promise<void> | void;
}

export interface CutterApiSidecarHandle {
  api_address: string;
  stop: () => Promise<void>;
}

type SidecarEvent =
  | { event: "starting"; stage: "sidecar_startup" }
  | { event: "ready"; api_address: string }
  | { event: "failed"; stage: string; error: string }
  | { event: "stopping" };

const USAGE_EVENT_WORKER_ARG = "--usage-event-worker";
const USAGE_EVENT_WORKER_ENV = "MIXLAB_SIDECAR_USAGE_WORKER";
const USAGE_EVENT_WORKER_QUEUE_LIMIT = 1_000;
const USAGE_EVENT_WORKER_FLUSH_TIMEOUT_MS = 2_000;
const USAGE_EVENT_WORKER_BACKOFF_MIN_MS = 500;
const USAGE_EVENT_WORKER_BACKOFF_MAX_MS = 30_000;

function isPackagedSidecarExecutable(): boolean {
  const pkg = (process as typeof process & { pkg?: unknown }).pkg;
  if (pkg) {
    return true;
  }

  return path.basename(process.execPath).toLowerCase().includes("cutter-api-sidecar");
}

function usageEventWorkerSpawnArgs(): string[] {
  if (isPackagedSidecarExecutable()) {
    // pkg 会把 CLI 首个参数当作 entry 路径；worker 模式改用环境变量触发。
    return [];
  }

  const scriptPath = process.argv[1];
  return scriptPath ? [...process.execArgv, scriptPath] : [];
}

function usageEventWorkerSpawnEnv(): NodeJS.ProcessEnv {
  return { ...process.env, [USAGE_EVENT_WORKER_ENV]: "1" };
}

export interface UsageEventWorkerStats {
  queued: number;
  dropped: number;
  spawn_failures: number;
  worker_alive: boolean;
  worker_pid?: number;
}

interface AsyncUsageEventRecorderHandle {
  record: CutterUsageEventRecorder;
  dispose: () => Promise<void>;
  stats: () => UsageEventWorkerStats;
}

/**
 * usage analytics 不能阻塞 sidecar 事件循环：NAS 上的 usage SQLite/JSONL 同步写入
 * 会让后续 detail/search/health 请求排队（0.18.13 切换卡顿根因）。
 * 用独立子进程承接写库，主进程只做无 await 的入队/管道写入，队列满时丢弃。
 * worker 崩溃按指数退避重建；sidecar 关闭时 best-effort flush 最多 2s。
 */
export function createAsyncUsageEventRecorder(input: {
  spawn_child?: () => ChildProcess;
  queue_limit?: number;
} = {}): AsyncUsageEventRecorderHandle {
  const queueLimit = input.queue_limit ?? USAGE_EVENT_WORKER_QUEUE_LIMIT;
  const queue: string[] = [];
  let child: ChildProcess | null = null;
  let disposed = false;
  let dropped = 0;
  let spawnFailures = 0;
  let backoffUntil = 0;
  let retryTimer: NodeJS.Timeout | null = null;
  let draining = false;

  const spawnChild = input.spawn_child ?? (() => spawn(process.execPath, usageEventWorkerSpawnArgs(), {
    env: usageEventWorkerSpawnEnv(),
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true
  }));

  function scheduleFlush(delayMs: number): void {
    if (disposed || retryTimer) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush();
    }, Math.max(0, delayMs));
    retryTimer.unref?.();
  }

  function recordWorkerFailure(reason: string): void {
    spawnFailures += 1;
    const attempt = Math.min(spawnFailures, 8);
    const delayMs = Math.min(
      USAGE_EVENT_WORKER_BACKOFF_MAX_MS,
      USAGE_EVENT_WORKER_BACKOFF_MIN_MS * 2 ** Math.max(0, attempt - 1)
    );
    backoffUntil = Date.now() + delayMs;
    try {
      console.error(JSON.stringify({
        event: "cutter_usage_worker_restart_scheduled",
        reason,
        spawn_failures: spawnFailures,
        delay_ms: delayMs
      }));
    } catch {
      // ignore diagnostics failures
    }
    if (!disposed && queue.length > 0) {
      scheduleFlush(delayMs);
    }
  }

  function ensureChild(): ChildProcess | null {
    if (child && !child.killed && child.stdin?.writable) {
      return child;
    }
    if (Date.now() < backoffUntil) {
      scheduleFlush(backoffUntil - Date.now());
      return null;
    }

    try {
      child = spawnChild();
      spawnFailures = 0;
      backoffUntil = 0;
      const spawned = child;
      try {
        console.error(JSON.stringify({ event: "cutter_usage_worker_spawned", pid: spawned.pid }));
      } catch {
        // ignore diagnostics failures
      }
      spawned.stdin?.on("error", () => undefined);
      spawned.on("exit", (code) => {
        if (child === spawned) {
          child = null;
        }
        recordWorkerFailure("exit:" + String(code));
      });
      spawned.on("error", (error) => {
        if (child === spawned) {
          child = null;
        }
        recordWorkerFailure(error instanceof Error ? error.message : String(error));
      });
      return spawned;
    } catch (error) {
      child = null;
      recordWorkerFailure(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  function flush(): void {
    if (disposed || draining || queue.length === 0) {
      return;
    }

    const activeChild = ensureChild();
    if (!activeChild?.stdin?.writable) {
      return;
    }

    draining = true;
    try {
      while (queue.length > 0) {
        const ok = activeChild.stdin.write(queue[0]);
        if (!ok) {
          activeChild.stdin.once("drain", () => {
            draining = false;
            flush();
          });
          return;
        }
        queue.shift();
      }
    } catch {
      // analytics 是 best-effort；子进程失败时下一次事件会重建。
    } finally {
      draining = false;
    }
  }

  const record: CutterUsageEventRecorder = (libraryRoot, event) => {
    if (disposed) {
      return;
    }

    if (queue.length >= queueLimit) {
      dropped += 1;
      if (dropped === 1 || dropped % 100 === 0) {
        try {
          console.error(JSON.stringify({
            event: "cutter_usage_worker_queue_full",
            queue_limit: queueLimit,
            dropped
          }));
        } catch {
          // ignore diagnostics failures
        }
      }
      return;
    }

    try {
      queue.push(JSON.stringify({ library_root: libraryRoot, event }) + "\n");
      scheduleFlush(0);
    } catch {
      dropped += 1;
    }
  };

  async function dispose(): Promise<void> {
    if (disposed) {
      return;
    }
    disposed = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    let activeChild: ChildProcess | null = null;
    try {
      activeChild = ensureChild();
    } catch {
      activeChild = null;
    }

    if (activeChild?.stdin?.writable) {
      try {
        while (queue.length > 0) {
          if (!activeChild.stdin.write(queue.shift()!)) {
            break;
          }
        }
        activeChild.stdin.end();
      } catch {
        // best-effort flush
      }
    }

    if (activeChild) {
      await Promise.race([
        new Promise<void>((resolve) => activeChild!.once("exit", () => resolve())),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, USAGE_EVENT_WORKER_FLUSH_TIMEOUT_MS);
          timer.unref?.();
        })
      ]);
      try {
        activeChild.kill();
      } catch {
        // ignore shutdown errors
      }
    }

    child = null;
    queue.length = 0;
  }

  return {
    record,
    dispose,
    stats: () => ({
      queued: queue.length,
      dropped,
      spawn_failures: spawnFailures,
      worker_alive: Boolean(child && !child.killed),
      ...(child?.pid ? { worker_pid: child.pid } : {})
    })
  };
}

export async function runUsageEventWorker(): Promise<void> {
  try {
    console.error(JSON.stringify({
      event: "cutter_usage_worker_started",
      argv: process.argv,
      exec_path: process.execPath
    }));
  } catch {
    // ignore diagnostics failures
  }
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }
    try {
      const payload = JSON.parse(line) as { library_root?: unknown; event?: unknown };
      if (typeof payload.library_root === "string" && payload.event && typeof payload.event === "object") {
        await appendUsageEvent(payload.library_root, payload.event as Parameters<typeof appendUsageEvent>[1]);
      }
    } catch (error) {
      try {
        console.error(JSON.stringify({
          event: "cutter_usage_worker_error",
          error: error instanceof Error ? error.message : String(error)
        }));
      } catch {
        // Worker diagnostics are best-effort.
      }
    }
  }
}

function normalizeDesktopPathForCompare(pathValue: string): string {
  return pathValue.replaceAll("/", "\\").replace(/\\+$/u, "").trim().toLowerCase();
}

function desktopPathIsSameOrChild(candidate: string, parent: string): boolean {
  const normalizedCandidate = normalizeDesktopPathForCompare(candidate);
  const normalizedParent = normalizeDesktopPathForCompare(parent);
  return Boolean(
    normalizedCandidate &&
      normalizedParent &&
      (normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}\\`))
  );
}

function desktopWorkspaceOverlapsPublicLibrary(config: Pick<CutterDesktopConfig, "public_library_root" | "local_workspace_root">): boolean {
  return (
    desktopPathIsSameOrChild(config.local_workspace_root, config.public_library_root) ||
    desktopPathIsSameOrChild(config.public_library_root, config.local_workspace_root)
  );
}

export function resolveDesktopSidecarConfigPath(input: ResolveDesktopSidecarConfigPathInput): string {
  const args = input.args ?? [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--config") {
      const value = args[index + 1]?.trim();
      if (value) {
        return value;
      }
    }

    if (arg?.startsWith("--config=")) {
      const value = arg.slice("--config=".length).trim();
      if (value) {
        return value;
      }
    }
  }

  const envPath = input.env?.MIXLAB_DESKTOP_CONFIG_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  throw new Error("缺少桌面端配置路径：请通过 --config 或 MIXLAB_DESKTOP_CONFIG_PATH 提供配置文件。");
}

export async function readCutterDesktopConfig(configPath: string): Promise<CutterDesktopConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<CutterDesktopConfig>;

  if (parsed.api_host !== "127.0.0.1" || parsed.api_port !== 3789) {
    throw new Error("桌面端配置错误：M18.1 固定使用 127.0.0.1:3789。");
  }
  if (!parsed.public_library_root || !parsed.local_workspace_root) {
    throw new Error("桌面端配置错误：缺少公共素材库或本地工作区路径。");
  }
  if (desktopWorkspaceOverlapsPublicLibrary({
    public_library_root: parsed.public_library_root,
    local_workspace_root: parsed.local_workspace_root
  })) {
    throw new Error("桌面端配置错误：本地工作区不能与公共素材库相同或互相包含。");
  }

  return {
    api_host: "127.0.0.1",
    api_port: 3789,
    public_library_root: parsed.public_library_root,
    local_workspace_root: parsed.local_workspace_root,
    ...(parsed.log_root ? { log_root: parsed.log_root } : {}),
    ...(parsed.ffmpeg_path ? { ffmpeg_path: parsed.ffmpeg_path } : {}),
    ...(parsed.ffprobe_path ? { ffprobe_path: parsed.ffprobe_path } : {})
  };
}

export function buildCutterApiServerInputFromDesktopConfig(
  config: CutterDesktopConfig,
  env: Partial<Record<string, string | undefined>> = {}
): CreateCutterApiServerInput {
  const searchdBaseUrl =
    env.MIXLAB_SEARCHD_BASE_URL?.trim() ||
    env.MIXLAB_CUTTER_SEARCHD_BASE_URL?.trim() ||
    "";
  const searchdCacheRoot =
    env.MIXLAB_CUTTER_SEARCHD_CACHE_ROOT?.trim() || env.MIXLAB_SEARCHD_CACHE_ROOT?.trim() || "";

  const workspaceRoot = normalizeDesktopPathForStorage(config.local_workspace_root);
  const releaseCacheRoot = isWindowsUncPath(workspaceRoot) || /^[a-zA-Z]:[\\/]/.test(workspaceRoot)
    ? path.win32.join(workspaceRoot, "cache")
    : path.join(workspaceRoot, "cache");
  const searchdTimeoutMs = optionalPositiveInteger(
    env.MIXLAB_SEARCHD_TIMEOUT_MS ?? env.MIXLAB_CUTTER_SEARCHD_TIMEOUT_MS
  ) ?? DEFAULT_DESKTOP_SEARCHD_TIMEOUT_MS;
  const searchdFirstPageTimeoutMs = optionalPositiveInteger(
    env.MIXLAB_CUTTER_SEARCHD_FIRST_PAGE_TIMEOUT_MS ?? env.MIXLAB_SEARCHD_FIRST_PAGE_TIMEOUT_MS
  ) ?? DEFAULT_DESKTOP_SEARCHD_FIRST_PAGE_TIMEOUT_MS;
  const searchdCursorTimeoutMs = optionalPositiveInteger(
    env.MIXLAB_CUTTER_SEARCHD_CURSOR_TIMEOUT_MS ?? env.MIXLAB_SEARCHD_CURSOR_TIMEOUT_MS
  ) ?? DEFAULT_DESKTOP_SEARCHD_CURSOR_TIMEOUT_MS;
  const searchdRetryAttempts = optionalPositiveInteger(
    env.MIXLAB_CUTTER_SEARCHD_RETRY_ATTEMPTS ?? env.MIXLAB_SEARCHD_RETRY_ATTEMPTS
  ) ?? DEFAULT_DESKTOP_SEARCHD_RETRY_ATTEMPTS;
  const searchdRetryBackoffMs = optionalPositiveInteger(
    env.MIXLAB_CUTTER_SEARCHD_RETRY_BACKOFF_MS ?? env.MIXLAB_SEARCHD_RETRY_BACKOFF_MS
  ) ?? DEFAULT_DESKTOP_SEARCHD_RETRY_BACKOFF_MS;
  const searchdFirstPageBudgetMs = optionalPositiveInteger(
    env.MIXLAB_CUTTER_SEARCHD_FIRST_PAGE_BUDGET_MS ?? env.MIXLAB_SEARCHD_FIRST_PAGE_BUDGET_MS
  ) ?? DEFAULT_DESKTOP_SEARCHD_FIRST_PAGE_BUDGET_MS;
  const authMode = env.MIXLAB_CUTTER_AUTH_MODE?.trim() === "local_trusted"
    ? "local_trusted"
    : "reviewed";
  const cutTimeoutMsMax = optionalPositiveInteger(env.MIXLAB_CUTTER_FFMPEG_TIMEOUT_MS);

  return {
    library_root: normalizeDesktopPathForStorage(config.public_library_root),
    workspace_root: workspaceRoot,
    release_cache_root: releaseCacheRoot,
    auto_run_cut_queue: true,
    ...(cutTimeoutMsMax === undefined ? {} : { cut_timeout_ms_max: cutTimeoutMsMax }),
    auth_mode: authMode,
    ...(authMode === "local_trusted"
      ? { trusted_username: env.MIXLAB_CUTTER_TRUSTED_USERNAME?.trim() || "本机剪辑师" }
      : {}),
    ...(searchdCacheRoot ? { searchd_cache_root: normalizeDesktopPathForStorage(searchdCacheRoot) } : {}),
    ...(searchdBaseUrl
      ? {
          searchd_base_url: searchdBaseUrl,
          searchd_timeout_ms: searchdTimeoutMs,
          searchd_first_page_timeout_ms: searchdFirstPageTimeoutMs,
          searchd_cursor_timeout_ms: searchdCursorTimeoutMs,
          searchd_retry_attempts: searchdRetryAttempts,
          searchd_retry_backoff_ms: searchdRetryBackoffMs,
          searchd_first_page_budget_ms: searchdFirstPageBudgetMs
        }
      : {})
  };
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function emitSidecarEvent(stdout: Pick<NodeJS.WriteStream, "write">, event: SidecarEvent): void {
  try {
    stdout.write(`${JSON.stringify(event)}\n`);
  } catch {
    // Windows GUI-subsystem packaged executables may not have a writable console stream.
  }
}

async function appendSidecarEventLog(config: CutterDesktopConfig, event: SidecarEvent): Promise<void> {
  const logDir = normalizeDesktopPathForStorage(config.log_root ?? path.join(config.local_workspace_root, "logs"));
  await mkdir(logDir, { recursive: true });
  await appendFile(
    path.join(logDir, "cutter-api-sidecar.ndjson"),
    `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`,
    "utf8"
  );
}

async function writeSidecarEventLogBestEffort(
  writer: ((event: SidecarEvent) => Promise<void> | void) | undefined,
  event: SidecarEvent
): Promise<void> {
  try {
    await writer?.(event);
  } catch {
    // Logging must not prevent the desktop runtime from starting or stopping.
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function startCutterApiSidecar(
  input: StartCutterApiSidecarInput = {}
): Promise<CutterApiSidecarHandle> {
  const stdout = input.stdout ?? process.stdout;
  const readConfig = input.read_config ?? readCutterDesktopConfig;
  const createServer = input.create_server ?? createCutterApiServer;
  let logEvent = input.log_event;

  try {
    const startingEvent: SidecarEvent = { event: "starting", stage: "sidecar_startup" };
    emitSidecarEvent(stdout, startingEvent);
    const configPath = input.config_path ?? resolveDesktopSidecarConfigPath({
      args: input.args ?? process.argv.slice(2),
      env: input.env ?? process.env
    });
    const config = await readConfig(configPath);
    logEvent ??= input.create_server ? undefined : (event: SidecarEvent) => appendSidecarEventLog(config, event);
    await writeSidecarEventLogBestEffort(logEvent, startingEvent);
    const env = buildCutterApiEnv(config);
    (input.apply_env ?? ((values) => Object.assign(process.env, values)))(env);
    const serverInput = buildCutterApiServerInputFromDesktopConfig(config, input.env ?? process.env);
    const usageServiceConfigured = Boolean(process.env.MIXLAB_USAGE_SERVICE_URL?.trim());
    const usageRecorder =
      !input.create_server &&
      !usageServiceConfigured &&
      (isPackagedSidecarExecutable() || process.env.MIXLAB_CUTTER_USAGE_ASYNC === "1")
        ? createAsyncUsageEventRecorder()
        : undefined;
    if (usageRecorder) {
      console.error(JSON.stringify({
        event: "cutter_usage_worker_enabled",
        existing_usage_service: usageServiceConfigured
      }));
      serverInput.usage_event_recorder = usageRecorder.record;
      serverInput.usage_event_worker_stats = usageRecorder.stats;
    }
    const server = createServer(serverInput);

    await listen(server, config.api_port, config.api_host);
    const apiAddress = `http://${config.api_host}:${config.api_port}`;
    const readyEvent: SidecarEvent = { event: "ready", api_address: apiAddress };
    emitSidecarEvent(stdout, readyEvent);
    await writeSidecarEventLogBestEffort(logEvent, readyEvent);

    return {
      api_address: apiAddress,
      stop: async () => {
        const stoppingEvent: SidecarEvent = { event: "stopping" };
        emitSidecarEvent(stdout, stoppingEvent);
        await writeSidecarEventLogBestEffort(logEvent, stoppingEvent);
        await usageRecorder?.dispose();
        await close(server);
      }
    };
  } catch (error) {
    const failedEvent: SidecarEvent = {
      event: "failed",
      stage: "sidecar_startup",
      error: error instanceof Error ? error.message : "未知错误"
    };
    emitSidecarEvent(stdout, failedEvent);
    await writeSidecarEventLogBestEffort(logEvent, failedEvent);
    throw error;
  }
}

export interface ShouldRunDirectSidecarInput {
  module_url: string;
  script_path: string | undefined;
  is_pkg?: boolean;
}

export function shouldRunDirectSidecar(input: ShouldRunDirectSidecarInput): boolean {
  if (input.is_pkg) {
    return true;
  }

  return Boolean(input.script_path) && fileURLToPath(input.module_url) === input.script_path;
}

async function runDirectSidecar(): Promise<void> {
  const handle = await startCutterApiSidecar();
  const stopAndExit = async () => {
    await handle.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => {
    void stopAndExit();
  });
  process.once("SIGTERM", () => {
    void stopAndExit();
  });
}

const isUsageEventWorkerProcess =
  process.env[USAGE_EVENT_WORKER_ENV] === "1" || process.argv.includes(USAGE_EVENT_WORKER_ARG);

if (isUsageEventWorkerProcess) {
  void runUsageEventWorker().catch((error) => {
    try {
      process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + "\n");
    } catch {
      // Packaged GUI executables may not have a writable stderr.
    }
    process.exitCode = 1;
  });
} else if (shouldRunDirectSidecar({
  module_url: import.meta.url,
  script_path: process.argv[1],
  is_pkg: Boolean((process as typeof process & { pkg?: unknown }).pkg)
})) {
  void runDirectSidecar().catch((error) => {
    try {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
      );
    } catch {
      // Packaged GUI executables may not have a writable stderr.
    }
    process.exitCode = 1;
  });
}
