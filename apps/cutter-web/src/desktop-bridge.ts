export interface DesktopBridgeGlobalLike {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}

export interface DesktopConfig {
  api_host: "127.0.0.1";
  api_port: 3789;
  public_library_root: string;
  local_workspace_root: string;
  log_root?: string;
  ffmpeg_path?: string;
  ffprobe_path?: string;
}

export type DesktopNativeInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface DesktopNativeCommandOptions {
  invoke_fn?: DesktopNativeInvoke;
}

export interface DesktopStartEngineOptions extends DesktopNativeCommandOptions {
  wait_for_ready?: () => Promise<void>;
}

export interface DesktopDoctorCheck {
  id: string;
  label: string;
  status: "pass" | "fail";
  message?: string;
}

export interface DesktopDoctorResult {
  status: "pass" | "fail";
  checks: DesktopDoctorCheck[];
}

export interface DesktopDiagnostics {
  stage: string;
  api_address?: string;
  log_path?: string;
  public_library_root?: string;
  local_workspace_root?: string;
  ffmpeg_status?: string;
  latest_error_summary?: string;
}

export type DesktopBridgeEnvironment =
  | {
      mode: "web";
      desktop_available: false;
    }
  | {
      mode: "desktop";
      desktop_available: true;
      api_base_url: "http://127.0.0.1:3789";
    };

export function resolveDesktopBridgeEnvironment(
  globalLike: DesktopBridgeGlobalLike = globalThis as DesktopBridgeGlobalLike
): DesktopBridgeEnvironment {
  if (globalLike.__TAURI_INTERNALS__ || globalLike.__TAURI__) {
    return {
      mode: "desktop",
      desktop_available: true,
      api_base_url: "http://127.0.0.1:3789"
    };
  }

  return {
    mode: "web",
    desktop_available: false
  };
}

export function resolveRuntimeApiBaseUrl(input: {
  vite_api_base_url?: string;
  global_like?: DesktopBridgeGlobalLike;
}): string {
  const desktop = resolveDesktopBridgeEnvironment(input.global_like);
  return desktop.desktop_available ? desktop.api_base_url : input.vite_api_base_url ?? "";
}

async function invokeDesktopCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!resolveDesktopBridgeEnvironment().desktop_available) {
    throw new Error("当前不是桌面运行环境");
  }

  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<T>(command, args);
}

function resolveDesktopInvoke(options?: DesktopNativeCommandOptions): DesktopNativeInvoke {
  return options?.invoke_fn ?? invokeDesktopCommand;
}

export async function chooseDesktopDirectory(title: string): Promise<string | null> {
  if (!resolveDesktopBridgeEnvironment().desktop_available) {
    return null;
  }

  const mod = await import("@tauri-apps/plugin-dialog");
  const selected = await mod.open({
    title,
    directory: true,
    multiple: false
  });

  return typeof selected === "string" ? selected : null;
}

export async function readDesktopConfig(): Promise<DesktopConfig | null> {
  return invokeDesktopCommand<DesktopConfig | null>("desktop_read_config");
}

export async function writeDesktopConfig(config: DesktopConfig): Promise<DesktopConfig> {
  return invokeDesktopCommand<DesktopConfig>("desktop_write_config", { config });
}

export async function desktopConfigPath(): Promise<string> {
  return invokeDesktopCommand<string>("desktop_config_path");
}

export async function desktopLogDirectory(): Promise<string> {
  return invokeDesktopCommand<string>("desktop_log_dir");
}

export async function defaultDesktopWorkspaceRoot(): Promise<string> {
  return invokeDesktopCommand<string>("desktop_default_workspace_root");
}

export async function runDesktopDoctor(config: DesktopConfig): Promise<DesktopDoctorResult> {
  return invokeDesktopCommand<DesktopDoctorResult>("desktop_run_doctor", { config });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export async function waitForDesktopEngineReady(input: {
  api_base_url?: string;
  fetch_fn?: typeof fetch;
  attempts?: number;
  delay_ms?: number;
  sleep_fn?: (milliseconds: number) => Promise<void>;
} = {}): Promise<void> {
  const apiBaseUrl = input.api_base_url ?? "http://127.0.0.1:3789";
  const fetchFn = input.fetch_fn ?? fetch;
  const attempts = input.attempts ?? 30;
  const delayMs = input.delay_ms ?? 250;
  const sleepFn = input.sleep_fn ?? sleep;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchFn(`${apiBaseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // Sidecar is still starting. Retry until the startup budget is exhausted.
    }

    if (attempt < attempts - 1) {
      await sleepFn(delayMs);
    }
  }

  throw new Error("本机引擎启动超时：127.0.0.1:3789 未通过健康检查。");
}

export async function startDesktopEngine(configPath: string, options: DesktopStartEngineOptions = {}): Promise<void> {
  const invoke = resolveDesktopInvoke(options);
  await invoke<void>("desktop_start_engine", { configPath });
  await (options.wait_for_ready ?? waitForDesktopEngineReady)();
}

export async function stopDesktopEngine(): Promise<void> {
  return;
}

export async function openDesktopDirectory(pathValue: string, options: DesktopNativeCommandOptions = {}): Promise<void> {
  if (!pathValue) {
    return;
  }

  const invoke = resolveDesktopInvoke(options);
  await invoke<void>("desktop_open_directory", { pathValue });
}
