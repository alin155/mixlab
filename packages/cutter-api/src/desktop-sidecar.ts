import { appendFile, mkdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCutterApiEnv,
  normalizeDesktopPathForStorage,
  type CutterDesktopConfig
} from "../../desktop-runtime/src/index.ts";
import { createCutterApiServer, type CreateCutterApiServerInput } from "./index.ts";

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
  config: CutterDesktopConfig
): CreateCutterApiServerInput {
  return {
    library_root: normalizeDesktopPathForStorage(config.public_library_root),
    workspace_root: normalizeDesktopPathForStorage(config.local_workspace_root),
    auth_mode: "local_trusted"
  };
}

function emitSidecarEvent(stdout: Pick<NodeJS.WriteStream, "write">, event: SidecarEvent): void {
  stdout.write(`${JSON.stringify(event)}\n`);
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
    const server = createServer(buildCutterApiServerInputFromDesktopConfig(config));

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

if (shouldRunDirectSidecar({
  module_url: import.meta.url,
  script_path: process.argv[1],
  is_pkg: Boolean((process as typeof process & { pkg?: unknown }).pkg)
})) {
  void runDirectSidecar().catch(() => {
    process.exitCode = 1;
  });
}
