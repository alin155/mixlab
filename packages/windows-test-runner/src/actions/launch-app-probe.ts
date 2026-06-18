import { spawn } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runProbeApi } from "./probe-api.ts";
import type {
  DesktopDiagnosticFile,
  DesktopDiagnosticsReport,
  FailureCategory,
  LaunchAppCandidate,
  LaunchAppProbeReport
} from "../types.ts";

interface LaunchAppProbeOptions {
  app_path?: string;
  app_args?: string[];
  api_ready_timeout_ms?: number;
  api_probe_timeout_ms?: number;
  force_launch?: boolean;
  skip_api_probe?: boolean;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return undefined;
  }
  return value;
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function readOptions(value: Record<string, unknown> | undefined): LaunchAppProbeOptions {
  return {
    app_path: readString(value?.app_path),
    app_args: readStringArray(value?.app_args),
    api_ready_timeout_ms: readPositiveNumber(value?.api_ready_timeout_ms),
    api_probe_timeout_ms: readPositiveNumber(value?.api_probe_timeout_ms),
    force_launch: value?.force_launch === true,
    skip_api_probe: value?.skip_api_probe === true
  };
}

function buildHealthUrl(apiBaseUrl: string): string {
  return new URL("/health", apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`).toString();
}

async function probeHealth(apiBaseUrl: string, timeoutMs: number): Promise<{
  ok: boolean;
  elapsed_ms: number;
  status_code: number | null;
  error?: string;
}> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildHealthUrl(apiBaseUrl), { signal: controller.signal });
    return {
      ok: response.ok,
      elapsed_ms: Date.now() - started,
      status_code: response.status
    };
  } catch (error) {
    return {
      ok: false,
      elapsed_ms: Date.now() - started,
      status_code: null,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForApiReady(apiBaseUrl: string, timeoutMs: number): Promise<{
  ok: boolean;
  elapsed_ms: number;
  status_code: number | null;
  error?: string;
}> {
  const started = Date.now();
  let latest: Awaited<ReturnType<typeof probeHealth>> | undefined;
  while (Date.now() - started < timeoutMs) {
    latest = await probeHealth(apiBaseUrl, Math.min(1500, timeoutMs));
    if (latest.ok) {
      return {
        ...latest,
        elapsed_ms: Date.now() - started
      };
    }
    await sleep(500);
  }
  return {
    ok: false,
    elapsed_ms: Date.now() - started,
    status_code: latest?.status_code ?? null,
    error: latest?.error ?? "API health did not become ready before timeout."
  };
}

function pushCandidate(candidates: string[], candidate: string | undefined): void {
  if (!candidate || candidates.includes(candidate)) {
    return;
  }
  candidates.push(candidate);
}

function pushParent(parents: string[], parent: string | undefined): void {
  if (!parent || parents.includes(parent)) {
    return;
  }
  parents.push(parent);
}

function defaultStaticAppCandidates(options: LaunchAppProbeOptions): string[] {
  const candidates: string[] = [];
  pushCandidate(candidates, options.app_path);
  pushCandidate(candidates, process.env.MIXLAB_CUTTER_APP_PATH);

  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE;
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env["PROGRAMFILES(X86)"];
  const appData = process.env.APPDATA;
  const programData = process.env.ProgramData ?? process.env.PROGRAMDATA;

  pushCandidate(candidates, localAppData ? path.join(localAppData, "Programs", "MixLab Cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, localAppData ? path.join(localAppData, "Programs", "mixlab-cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, localAppData ? path.join(localAppData, "Programs", "com.mixlab.cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, localAppData ? path.join(localAppData, "MixLab Cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, localAppData ? path.join(localAppData, "mixlab-cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, userProfile ? path.join(userProfile, "AppData", "Local", "Programs", "MixLab Cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, userProfile ? path.join(userProfile, "AppData", "Local", "Programs", "mixlab-cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, programFiles ? path.join(programFiles, "MixLab Cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, programFiles ? path.join(programFiles, "mixlab-cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, programFilesX86 ? path.join(programFilesX86, "MixLab Cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, programFilesX86 ? path.join(programFilesX86, "mixlab-cutter", "MixLab Cutter.exe") : undefined);
  pushCandidate(candidates, userProfile ? path.join(userProfile, "Desktop", "MixLab Cutter.lnk") : undefined);
  pushCandidate(candidates, appData ? path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "MixLab Cutter.lnk") : undefined);
  pushCandidate(candidates, programData ? path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs", "MixLab Cutter.lnk") : undefined);

  if (process.platform !== "win32") {
    pushCandidate(candidates, path.join(os.tmpdir(), "MixLab Cutter.exe"));
  }

  return candidates;
}

function defaultSearchParents(): string[] {
  const parents: string[] = [];
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE;
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env["PROGRAMFILES(X86)"];

  pushParent(parents, process.env.MIXLAB_CUTTER_APP_SEARCH_ROOT);
  pushParent(parents, localAppData ? path.join(localAppData, "Programs") : undefined);
  pushParent(parents, localAppData);
  pushParent(parents, userProfile ? path.join(userProfile, "AppData", "Local", "Programs") : undefined);
  pushParent(parents, programFiles);
  pushParent(parents, programFilesX86);

  return parents;
}

function looksLikeMixLabCutterExe(fileName: string): boolean {
  const normalized = fileName.toLowerCase().replace(/[\s_-]+/g, "");
  return fileName.toLowerCase().endsWith(".exe")
    && normalized.includes("mixlab")
    && normalized.includes("cutter");
}

async function discoverExecutableCandidates(root: string, maxDepth: number): Promise<string[]> {
  const discovered: string[] = [];
  async function visit(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isFile() && looksLikeMixLabCutterExe(entry.name)) {
        discovered.push(entryPath);
      } else if (entry.isDirectory()) {
        const normalizedDir = entry.name.toLowerCase().replace(/[\s_-]+/g, "");
        if (
          depth === 0
          || normalizedDir.includes("mixlab")
          || normalizedDir.includes("cutter")
          || normalizedDir.includes("tauri")
          || normalizedDir.includes("programs")
        ) {
          await visit(entryPath, depth + 1);
        }
      }
    }
  }
  await visit(root, 0);
  return discovered;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isWindowsShortcut(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".lnk");
}

function desktopDiagnosticCandidatePaths(): string[] {
  const candidates: string[] = [];
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;

  function push(candidate: string | undefined): void {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  push(appData ? path.join(appData, "MixLab Cutter", "logs", "desktop-host.ndjson") : undefined);
  push(appData ? path.join(appData, "MixLab Cutter", "logs", "cutter-api-sidecar.stdout.log") : undefined);
  push(appData ? path.join(appData, "MixLab Cutter", "logs", "cutter-api-sidecar.stderr.log") : undefined);
  push(appData ? path.join(appData, "MixLab Cutter", "logs", "mixlab-searchd.stdout.log") : undefined);
  push(appData ? path.join(appData, "MixLab Cutter", "logs", "mixlab-searchd.stderr.log") : undefined);
  push(appData ? path.join(appData, "MixLab Cutter", "cutter-desktop-config.json") : undefined);
  push(appData ? path.join(appData, "com.mixlab.cutter", "cutter-desktop-config.json") : undefined);
  push(localAppData ? path.join(localAppData, "MixLab Cutter", "cutter-desktop-config.json") : undefined);

  return candidates;
}

async function readDiagnosticFile(filePath: string): Promise<DesktopDiagnosticFile> {
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      return {
        path: filePath,
        exists: false,
        error: "path exists but is not a file"
      };
    }
    const raw = await readFile(filePath, "utf8");
    return {
      path: filePath,
      exists: true,
      size_bytes: metadata.size,
      tail: raw.slice(-20_000)
    };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    return {
      path: filePath,
      exists: false,
      ...(code && code !== "ENOENT" ? { error: error instanceof Error ? error.message : String(error) } : {})
    };
  }
}

async function collectDesktopDiagnostics(): Promise<DesktopDiagnosticsReport> {
  return {
    collected_at: new Date().toISOString(),
    appdata: process.env.APPDATA,
    localappdata: process.env.LOCALAPPDATA,
    userprofile: process.env.USERPROFILE,
    files: await Promise.all(desktopDiagnosticCandidatePaths().map(readDiagnosticFile))
  };
}

function launchLocatedApp(appPath: string, appArgs: string[] | undefined): {
  child: ReturnType<typeof spawn>;
  launch_method: "direct" | "windows_shortcut";
  shortcut_path?: string;
  executable_path: string;
} {
  if (process.platform === "win32" && isWindowsShortcut(appPath)) {
    return {
      child: spawn("cmd.exe", ["/c", "start", "", appPath, ...(appArgs ?? [])], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      }),
      launch_method: "windows_shortcut",
      shortcut_path: appPath,
      executable_path: "cmd.exe"
    };
  }

  return {
    child: spawn(appPath, appArgs ?? [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }),
    launch_method: "direct",
    executable_path: appPath
  };
}

async function findAppExecutable(options: LaunchAppProbeOptions): Promise<{
  appPath?: string;
  candidates: LaunchAppCandidate[];
}> {
  const candidatePaths: string[] = [];
  for (const candidate of defaultStaticAppCandidates(options)) {
    pushCandidate(candidatePaths, candidate);
  }
  for (const parent of defaultSearchParents()) {
    for (const candidate of await discoverExecutableCandidates(parent, 4)) {
      pushCandidate(candidatePaths, candidate);
    }
  }

  const candidates: LaunchAppCandidate[] = [];
  for (const candidate of candidatePaths) {
    const exists = await pathExists(candidate);
    candidates.push({ path: candidate, exists });
    if (exists) {
      return { appPath: candidate, candidates };
    }
  }
  return { candidates };
}

export async function runLaunchAppProbe(input: {
  apiBaseUrl: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<{
  report: LaunchAppProbeReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const options = readOptions(input.options);
  const report: LaunchAppProbeReport = {
    api_base_url: input.apiBaseUrl,
    api_ready_before_launch: false,
    api_ready: false,
    api_ready_elapsed_ms: 0,
    app_started: false,
    candidates: []
  };

  const initialHealth = await probeHealth(input.apiBaseUrl, 1000);
  report.api_ready_before_launch = initialHealth.ok;
  report.health_status_code = initialHealth.status_code;
  report.health_error = initialHealth.error;

  if (initialHealth.ok && !options.force_launch) {
    await input.onEvent?.("api_already_ready", "Cutter API is already ready before app launch.");
    report.api_ready = true;
    if (options.skip_api_probe) {
      return { report, passed: true };
    }
    const probeResult = await runProbeApi({
      apiBaseUrl: input.apiBaseUrl,
      timeoutMs: options.api_probe_timeout_ms
    });
    report.probe_api = probeResult.report;
    return {
      report,
      passed: probeResult.passed,
      failure_category: probeResult.failure_category,
      failure_message: probeResult.failure_message
    };
  }

  await input.onEvent?.("locating_app", "Locating installed MixLab Cutter executable.");
  const located = await findAppExecutable(options);
  report.candidates = located.candidates;
  if (!located.appPath) {
    return {
      report,
      passed: false,
      failure_category: "app_executable_not_found",
      failure_message: "MixLab Cutter executable was not found in known install locations."
    };
  }

  report.app_executable_path = located.appPath;
  await input.onEvent?.("launching_app", "Launching MixLab Cutter.", {
    app_executable_path: located.appPath
  });

  try {
    const launched = launchLocatedApp(located.appPath, options.app_args);
    launched.child.unref();
    report.app_started = true;
    report.app_pid = launched.child.pid;
    report.app_launch_method = launched.launch_method;
    report.app_executable_path = launched.executable_path;
    report.app_shortcut_path = launched.shortcut_path;
  } catch (error) {
    report.launch_error = error instanceof Error ? error.message : String(error);
    report.desktop_diagnostics = await collectDesktopDiagnostics();
    return {
      report,
      passed: false,
      failure_category: "app_launch_failure",
      failure_message: report.launch_error
    };
  }

  const timeoutMs = options.api_ready_timeout_ms ?? 30000;
  await input.onEvent?.("waiting_api", "Waiting for MixLab Cutter sidecar API.", {
    api_base_url: input.apiBaseUrl,
    timeout_ms: timeoutMs
  });
  const health = await waitForApiReady(input.apiBaseUrl, timeoutMs);
  report.api_ready = health.ok;
  report.api_ready_elapsed_ms = health.elapsed_ms;
  report.health_status_code = health.status_code;
  report.health_error = health.error;

  if (!health.ok) {
    report.desktop_diagnostics = await collectDesktopDiagnostics();
    return {
      report,
      passed: false,
      failure_category: "api_health_timeout",
      failure_message: health.error ?? "MixLab Cutter sidecar API did not become ready."
    };
  }

  await input.onEvent?.("probing_api", "Running cutter API smoke probes.");
  if (options.skip_api_probe) {
    return { report, passed: true };
  }
  const probeResult = await runProbeApi({
    apiBaseUrl: input.apiBaseUrl,
    timeoutMs: options.api_probe_timeout_ms
  });
  report.probe_api = probeResult.report;

  return {
    report,
    passed: probeResult.passed,
    failure_category: probeResult.failure_category,
    failure_message: probeResult.failure_message
  };
}
