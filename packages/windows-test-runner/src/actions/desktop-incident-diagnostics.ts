import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectDesktopDiagnostics, runLaunchAppProbe } from "./launch-app-probe.ts";
import type {
  ApiProbeResult,
  DesktopIncidentDiagnosticsReport,
  FailureCategory
} from "../types.ts";

interface CutterAuthHeaders {
  device_id: string;
  session_token: string;
}

interface CutterAuthCredentials {
  username: string;
  password: string;
  device_id: string;
  device_name: string;
}

interface DesktopIncidentDiagnosticsOptions {
  window_title?: string;
  api_probe_timeout_ms?: number;
  mock_screenshot?: boolean;
  auth_headers?: CutterAuthHeaders;
  auth_credentials?: CutterAuthCredentials;
}

interface PowerShellIncidentResult {
  ok?: boolean;
  window_title?: string;
  window_process_id?: number;
  window_process_name?: string;
  window_process_path?: string;
  screenshot_path?: string;
  window_rect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  error?: string;
}

const INCIDENT_PROBES: Array<{ id: string; path: string; auth?: boolean }> = [
  { id: "health", path: "/health" },
  { id: "auth_mode", path: "/cutter/auth/mode" },
  { id: "runtime_status", path: "/cutter/runtime-status", auth: true },
  { id: "source_library_first_page", path: "/cutter/source-library?limit=20", auth: true },
  { id: "cut_jobs", path: "/cutter/cut-jobs?limit=80", auth: true }
];

const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readAuthHeaders(value: Record<string, unknown> | undefined): CutterAuthHeaders | undefined {
  const auth = value?.auth_headers;
  if (!isRecord(auth)) {
    return undefined;
  }

  const deviceId = readString(auth.device_id) ?? readString(auth.deviceId);
  const sessionToken = readString(auth.session_token) ?? readString(auth.sessionToken);
  return deviceId && sessionToken
    ? { device_id: deviceId, session_token: sessionToken }
    : undefined;
}

function readAuthCredentials(value: Record<string, unknown> | undefined): CutterAuthCredentials | undefined {
  const credentials = value?.auth_credentials;
  if (!isRecord(credentials)) {
    return undefined;
  }

  const username = readString(credentials.username) ?? readString(credentials.user_name);
  const password = readString(credentials.password);
  const deviceId = readString(credentials.device_id) ?? readString(credentials.deviceId);
  const deviceName = readString(credentials.device_name) ?? readString(credentials.deviceName) ?? "MixLab Windows Test Runner";
  return username && password && deviceId
    ? {
        username,
        password,
        device_id: deviceId,
        device_name: deviceName
      }
    : undefined;
}

function readOptions(value: Record<string, unknown> | undefined): DesktopIncidentDiagnosticsOptions {
  return {
    window_title: readString(value?.window_title),
    api_probe_timeout_ms: readPositiveNumber(value?.api_probe_timeout_ms, 5000),
    mock_screenshot: value?.mock_screenshot === true,
    auth_headers: readAuthHeaders(value),
    auth_credentials: readAuthCredentials(value)
  };
}

function authHeaderRecord(auth: CutterAuthHeaders | undefined): Record<string, string> {
  return auth
    ? {
        "X-MixLab-Device-Id": auth.device_id,
        "X-MixLab-Session-Token": auth.session_token
      }
    : {};
}

function buildUrl(baseUrl: string, pathName: string): string {
  return new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 1000);
  }
}

async function requestProbe(input: {
  id: string;
  path: string;
  baseUrl: string;
  timeoutMs: number;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  includeBody?: boolean;
}): Promise<ApiProbeResult> {
  const url = buildUrl(input.baseUrl, input.path);
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(url, {
      method: input.method ?? "GET",
      headers: {
        ...(input.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        ...input.headers
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal
    });
    const body = await readResponseBody(response);
    return {
      id: input.id,
      path: input.path,
      url,
      ok: response.ok,
      status_code: response.status,
      elapsed_ms: Date.now() - started,
      ...(input.includeBody === false ? {} : { body })
    };
  } catch (error) {
    return {
      id: input.id,
      path: input.path,
      url,
      ok: false,
      status_code: null,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function dataRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    return {};
  }

  return isRecord(body.data) ? body.data : body;
}

async function resolveAuth(input: {
  baseUrl: string;
  timeoutMs: number;
  options: DesktopIncidentDiagnosticsOptions;
}): Promise<{
  headers?: CutterAuthHeaders;
  source: "none" | "headers" | "credentials";
  loginProbe?: ApiProbeResult;
}> {
  if (input.options.auth_headers) {
    return {
      headers: input.options.auth_headers,
      source: "headers"
    };
  }

  if (!input.options.auth_credentials) {
    return { source: "none" };
  }

  const credentials = input.options.auth_credentials;
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  let loginProbe: ApiProbeResult;
  let loginBody: unknown;

  try {
    const response = await fetch(buildUrl(input.baseUrl, "/cutter/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        device_id: credentials.device_id,
        device_name: credentials.device_name
      }),
      signal: controller.signal
    });
    loginBody = await readResponseBody(response);
    loginProbe = {
      id: "auth_login",
      path: "/cutter/auth/login",
      url: buildUrl(input.baseUrl, "/cutter/auth/login"),
      ok: response.ok,
      status_code: response.status,
      elapsed_ms: Date.now() - started
    };
  } catch (error) {
    loginProbe = {
      id: "auth_login",
      path: "/cutter/auth/login",
      url: buildUrl(input.baseUrl, "/cutter/auth/login"),
      ok: false,
      status_code: null,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!loginProbe.ok) {
    return {
      source: "credentials",
      loginProbe
    };
  }

  const data = dataRecord(loginBody);
  const session = isRecord(data.session) ? data.session : {};
  const deviceId = readString(session.device_id) ?? readString(session.deviceId);
  const sessionToken = readString(session.session_token) ?? readString(session.sessionToken);
  return {
    source: "credentials",
    loginProbe,
    headers: deviceId && sessionToken
      ? { device_id: deviceId, session_token: sessionToken }
      : undefined
  };
}

function tail(text: string, maxLength = 20_000): string | undefined {
  return text ? (text.length > maxLength ? text.slice(-maxLength) : text) : undefined;
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function currentWindowScreenshotScript(input: {
  outputDir: string;
  windowTitle: string;
}): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Runtime.InteropServices;

public static class MixLabIncidentWin32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@
Add-Type $code

$outputDir = '${escapePowerShellSingleQuoted(input.outputDir)}'
$windowTitle = '${escapePowerShellSingleQuoted(input.windowTitle)}'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$screenshotPath = Join-Path $outputDir "current-window.png"

function Get-MixLabProcessPath($candidate) {
  try {
    return $candidate.Path
  } catch {
    return ""
  }
}

function Get-MixLabProcessScore($candidate) {
  $name = if ($candidate.ProcessName) { $candidate.ProcessName.ToString().ToLowerInvariant() } else { "" }
  $title = if ($candidate.MainWindowTitle) { $candidate.MainWindowTitle.ToString().ToLowerInvariant() } else { "" }
  $pathValue = (Get-MixLabProcessPath $candidate).ToLowerInvariant()
  $score = 0
  if ($title -like "*$($windowTitle.ToLowerInvariant())*") { $score += 10 }
  if ($name -like "*mixlab*" -and $name -like "*cutter*") { $score += 100 }
  if ($pathValue -like "*mixlab cutter.exe" -or $pathValue -like "*mixlab*cutter*.exe") { $score += 120 }
  if ($name -in @("chrome", "msedge", "firefox", "explorer", "cmd", "powershell", "windowsterminal")) { $score -= 200 }
  return $score
}

$procInfo = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$windowTitle*" } |
  ForEach-Object {
    [pscustomobject]@{
      process = $_
      score = Get-MixLabProcessScore $_
      path = Get-MixLabProcessPath $_
    }
  } |
  Where-Object { $_.score -gt 0 } |
  Sort-Object @{ Expression = { $_.score }; Descending = $true },
    @{ Expression = { $_.process.StartTime }; Descending = $true } |
  Select-Object -First 1

if (-not $procInfo) {
  throw "Real MixLab Cutter window matching '$windowTitle' was not found."
}

$proc = $procInfo.process
[MixLabIncidentWin32]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null
Start-Sleep -Milliseconds 300
[MixLabIncidentWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 300

$rect = New-Object MixLabIncidentWin32+RECT
[MixLabIncidentWin32]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
$width = [Math]::Max(1, $rect.Right - $rect.Left)
$height = [Math]::Max(1, $rect.Bottom - $rect.Top)
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
$bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

[pscustomobject]@{
  ok = $true
  window_title = $proc.MainWindowTitle
  window_process_id = $proc.Id
  window_process_name = $proc.ProcessName
  window_process_path = $procInfo.path
  screenshot_path = $screenshotPath
  window_rect = @{
    left = $rect.Left
    top = $rect.Top
    width = $width
    height = $height
  }
} | ConvertTo-Json -Depth 8
`;
}

async function runPowerShellScreenshot(input: {
  outputDir: string;
  windowTitle: string;
}): Promise<{
  result: PowerShellIncidentResult;
  stdout?: string;
  stderr?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({
        result: {
          ok: false,
          error: error.message
        },
        stdout,
        stderr
      });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({
          result: {
            ok: false,
            error: stderr || `PowerShell exited with ${code}`
          },
          stdout,
          stderr
        });
        return;
      }

      try {
        resolve({
          result: JSON.parse(stdout.trim()) as PowerShellIncidentResult,
          stdout,
          stderr
        });
      } catch (error) {
        resolve({
          result: {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          },
          stdout,
          stderr
        });
      }
    });
    child.stdin.end(currentWindowScreenshotScript(input));
  });
}

export async function runDesktopIncidentDiagnostics(input: {
  apiBaseUrl: string;
  reportDir: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<{
  report: DesktopIncidentDiagnosticsReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const options = readOptions(input.options);
  const outputDir = path.join(input.reportDir, "incident");
  const windowTitle = options.window_title ?? "MixLab Cutter";
  await mkdir(outputDir, { recursive: true });

  await input.onEvent?.("incident_launch_probe", "Checking Cutter sidecar without changing app state.");
  const launchProbe = await runLaunchAppProbe({
    apiBaseUrl: input.apiBaseUrl,
    options: {
      skip_api_probe: true
    },
    onEvent: input.onEvent
  });

  await input.onEvent?.("incident_screenshot", "Capturing current MixLab Cutter window.");
  let screenshotResult: PowerShellIncidentResult;
  let stdout = "";
  let stderr = "";
  if (options.mock_screenshot) {
    const screenshotPath = path.join(outputDir, "current-window.png");
    await writeFile(screenshotPath, Buffer.from(MOCK_PNG_BASE64, "base64"));
    screenshotResult = {
      ok: true,
      screenshot_path: screenshotPath,
      window_title: windowTitle
    };
  } else {
    const result = await runPowerShellScreenshot({
      outputDir,
      windowTitle
    });
    screenshotResult = result.result;
    stdout = result.stdout ?? "";
    stderr = result.stderr ?? "";
  }

  await input.onEvent?.("incident_logs", "Collecting Cutter desktop logs.");
  const desktopDiagnostics = await collectDesktopDiagnostics();

  await input.onEvent?.("incident_api_probes", "Probing Cutter API incident endpoints.");
  const auth = await resolveAuth({
    baseUrl: input.apiBaseUrl,
    timeoutMs: options.api_probe_timeout_ms ?? 5000,
    options
  });
  const probes: ApiProbeResult[] = [];
  for (const probe of INCIDENT_PROBES) {
    probes.push(await requestProbe({
      id: probe.id,
      path: probe.path,
      baseUrl: input.apiBaseUrl,
      timeoutMs: options.api_probe_timeout_ms ?? 5000,
      headers: probe.auth ? authHeaderRecord(auth.headers) : undefined
    }));
  }

  const report: DesktopIncidentDiagnosticsReport = {
    api_base_url: input.apiBaseUrl,
    output_dir: outputDir,
    window_title: screenshotResult.window_title,
    window_process_id: screenshotResult.window_process_id,
    window_process_name: screenshotResult.window_process_name,
    window_process_path: screenshotResult.window_process_path,
    window_rect: screenshotResult.window_rect,
    screenshot_path: screenshotResult.screenshot_path,
    screenshot_ok: screenshotResult.ok === true,
    screenshot_error: screenshotResult.error,
    launch_app_probe: launchProbe.report,
    desktop_diagnostics: desktopDiagnostics,
    probes,
    auth_source: auth.source,
    auth_login_probe: auth.loginProbe,
    script_stdout_tail: tail(stdout),
    script_stderr_tail: tail(stderr)
  };

  if (!report.screenshot_ok) {
    return {
      report,
      passed: false,
      failure_category: "desktop_incident_diagnostics_failure",
      failure_message: report.screenshot_error ?? "Current Cutter window screenshot failed."
    };
  }

  return {
    report,
    passed: true
  };
}
