import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runLaunchAppProbe } from "./launch-app-probe.ts";
import type {
  DesktopUiScreenshotPage,
  DesktopUiScreenshotReport,
  FailureCategory
} from "../types.ts";

interface DesktopUiScreenshotOptions {
  window_title?: string;
  settle_ms?: number;
  api_ready_timeout_ms?: number;
  mock_screenshots?: boolean;
}

interface DesktopUiPagePlan {
  id: string;
  label: string;
  action: "sidebar" | "content" | "capture_only";
  x?: number;
  y?: number;
}

interface PowerShellScreenshotResult {
  ok?: boolean;
  window_title?: string;
  local_output_dir?: string;
  window_rect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  pages?: DesktopUiScreenshotPage[];
  error?: string;
}

const DEFAULT_PAGES: DesktopUiPagePlan[] = [
  { id: "project-home", label: "Project Home", action: "sidebar", x: 0.070, y: 0.140 },
  { id: "material-locator", label: "Material Search", action: "sidebar", x: 0.070, y: 0.185 },
  { id: "cut-tasks", label: "Cut Tasks", action: "sidebar", x: 0.070, y: 0.230 },
  { id: "local-library", label: "Local Library", action: "sidebar", x: 0.070, y: 0.275 },
  { id: "public-library", label: "Public Library", action: "sidebar", x: 0.070, y: 0.320 },
  { id: "source-detail", label: "Source Detail", action: "content", x: 0.255, y: 0.320 },
  { id: "cache-management", label: "Cache Management", action: "sidebar", x: 0.070, y: 0.365 },
  { id: "settings", label: "Settings", action: "sidebar", x: 0.070, y: 0.410 }
];

const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readOptions(value: Record<string, unknown> | undefined): DesktopUiScreenshotOptions {
  return {
    window_title: readString(value?.window_title),
    settle_ms: readPositiveNumber(value?.settle_ms, 900),
    api_ready_timeout_ms: readPositiveNumber(value?.api_ready_timeout_ms, 30000),
    mock_screenshots: value?.mock_screenshots === true
  };
}

function tail(text: string, maxLength = 20_000): string | undefined {
  if (!text) {
    return undefined;
  }
  return text.length > maxLength ? text.slice(-maxLength) : text;
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function powerShellScript(input: {
  pages: DesktopUiPagePlan[];
  outputDir: string;
  windowTitle: string;
  settleMs: number;
}): string {
  const pagesJson = JSON.stringify(input.pages, null, 2);
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$code = @"
using System;
using System.Runtime.InteropServices;

public static class MixLabWin32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

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
$settleMs = ${Math.round(input.settleMs)}
$pages = @'
${pagesJson}
'@ | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$runId = Split-Path (Split-Path $outputDir -Parent) -Leaf
$localOutputDir = Join-Path ([System.IO.Path]::GetTempPath()) ("mixlab-cutter-screenshots-" + $runId)
New-Item -ItemType Directory -Force -Path $localOutputDir | Out-Null

$proc = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$windowTitle*" } |
  Sort-Object StartTime -Descending |
  Select-Object -First 1

if (-not $proc) {
  throw "Window matching '$windowTitle' was not found."
}

[MixLabWin32]::ShowWindow($proc.MainWindowHandle, 5) | Out-Null
[MixLabWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 500
$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys('{ESC}')
Start-Sleep -Milliseconds 300
[MixLabWin32]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 300

$rect = New-Object MixLabWin32+RECT
[MixLabWin32]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
$width = [Math]::Max(1, $rect.Right - $rect.Left)
$height = [Math]::Max(1, $rect.Bottom - $rect.Top)

function Invoke-MixLabClick([double]$rx, [double]$ry) {
  $x = [int]($rect.Left + ($width * $rx))
  $y = [int]($rect.Top + ($height * $ry))
  [MixLabWin32]::SetCursorPos($x, $y) | Out-Null
  [MixLabWin32]::mouse_event(0x0002, $x, $y, 0, 0)
  Start-Sleep -Milliseconds 50
  [MixLabWin32]::mouse_event(0x0004, $x, $y, 0, 0)
  return @{ x = $x; y = $y }
}

function Save-MixLabScreenshot([string]$id) {
  $localFile = Join-Path $localOutputDir "$id.png"
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
    $bitmap.Save($localFile, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  return $localFile
}

function Convert-MixLabJsonPath([string]$pathValue) {
  if (-not $pathValue) {
    return $pathValue
  }
  return $pathValue.Replace([string][char]92, '/')
}

$captures = @()
foreach ($page in $pages) {
  $click = $null
  $errorText = $null
  try {
    if ($page.action -eq 'sidebar' -or $page.action -eq 'content') {
      $click = Invoke-MixLabClick $page.x $page.y
      Start-Sleep -Milliseconds $settleMs
    }
    $file = Save-MixLabScreenshot $page.id
    $captures += [pscustomobject]@{
      id = $page.id
      label = $page.label
      action = $page.action
      screenshot_path = Convert-MixLabJsonPath $file
      ok = $true
      click_x = if ($click) { $click.x } else { $null }
      click_y = if ($click) { $click.y } else { $null }
      error = $null
    }
  } catch {
    $errorText = $_.Exception.Message
    $captures += [pscustomobject]@{
      id = $page.id
      label = $page.label
      action = $page.action
      screenshot_path = Convert-MixLabJsonPath (Join-Path $localOutputDir "$($page.id).png")
      ok = $false
      click_x = if ($click) { $click.x } else { $null }
      click_y = if ($click) { $click.y } else { $null }
      error = $errorText
    }
  }
}

[pscustomobject]@{
  ok = $true
  window_title = $proc.MainWindowTitle
  local_output_dir = Convert-MixLabJsonPath $localOutputDir
  window_rect = [pscustomobject]@{
    left = $rect.Left
    top = $rect.Top
    width = $width
    height = $height
  }
  pages = $captures
} | ConvertTo-Json -Depth 8
`;
}

function runPowerShell(scriptPath: string): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath
    ], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

function parsePowerShellResult(stdout: string): PowerShellScreenshotResult {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Screenshot PowerShell output did not contain JSON.");
  }
  return JSON.parse(stdout.slice(start, end + 1)) as PowerShellScreenshotResult;
}

async function runMockScreenshots(outputDir: string): Promise<DesktopUiScreenshotPage[]> {
  await mkdir(outputDir, { recursive: true });
  const bytes = Buffer.from(MOCK_PNG_BASE64, "base64");
  const pages: DesktopUiScreenshotPage[] = [];
  for (const page of DEFAULT_PAGES) {
    const screenshotPath = path.join(outputDir, `${page.id}.png`);
    await writeFile(screenshotPath, bytes);
    pages.push({
      id: page.id,
      label: page.label,
      action: page.action,
      screenshot_path: screenshotPath,
      ok: true
    });
  }
  return pages;
}

export async function runDesktopUiScreenshotSmoke(input: {
  apiBaseUrl: string;
  reportDir: string;
  options?: Record<string, unknown>;
  onEvent?: (stage: string, message: string, details?: unknown) => Promise<void>;
}): Promise<{
  report: DesktopUiScreenshotReport;
  passed: boolean;
  failure_category?: FailureCategory;
  failure_message?: string;
}> {
  const options = readOptions(input.options);
  const outputDir = path.join(input.reportDir, "screenshots");
  const report: DesktopUiScreenshotReport = {
    api_base_url: input.apiBaseUrl,
    output_dir: outputDir,
    captured_count: 0,
    pages: []
  };

  if (options.mock_screenshots) {
    report.window_title = options.window_title ?? "MixLab Cutter";
    report.window_rect = { left: 0, top: 0, width: 1440, height: 900 };
    report.pages = await runMockScreenshots(outputDir);
    report.captured_count = report.pages.length;
    return { report, passed: true };
  }

  await input.onEvent?.("launching_or_focusing_app", "Launching or focusing MixLab Cutter before screenshots.");
  const launch = await runLaunchAppProbe({
    apiBaseUrl: input.apiBaseUrl,
    options: {
      api_ready_timeout_ms: options.api_ready_timeout_ms,
      force_launch: true,
      skip_api_probe: true
    },
    onEvent: input.onEvent
  });
  report.launch_app_probe = launch.report;
  if (!launch.passed) {
    return {
      report,
      passed: false,
      failure_category: launch.failure_category,
      failure_message: launch.failure_message
    };
  }

  await input.onEvent?.("capturing_desktop_ui", "Capturing Windows desktop UI screenshots.", {
    output_dir: outputDir
  });

  const scriptDir = await mkdtemp(path.join(os.tmpdir(), "mixlab-desktop-ui-screenshots-"));
  const scriptPath = path.join(scriptDir, "capture-mixlab-cutter.ps1");
  await writeFile(scriptPath, powerShellScript({
    pages: DEFAULT_PAGES,
    outputDir,
    windowTitle: options.window_title ?? "MixLab Cutter",
    settleMs: options.settle_ms ?? 900
  }), "utf8");

  const script = await runPowerShell(scriptPath);
  report.script_stdout_tail = tail(script.stdout);
  report.script_stderr_tail = tail(script.stderr);

  if (script.exitCode !== 0) {
    return {
      report,
      passed: false,
      failure_category: "desktop_screenshot_failure",
      failure_message: `Screenshot PowerShell exited with ${script.exitCode}: ${tail(script.stderr, 2000) ?? tail(script.stdout, 2000) ?? "no output"}`
    };
  }

  let parsed: PowerShellScreenshotResult;
  try {
    parsed = parsePowerShellResult(script.stdout);
  } catch (error) {
    return {
      report,
      passed: false,
      failure_category: "desktop_screenshot_failure",
      failure_message: error instanceof Error ? error.message : String(error)
    };
  }

  report.window_title = parsed.window_title;
  report.window_rect = parsed.window_rect;
  await mkdir(outputDir, { recursive: true });
  report.pages = await Promise.all((parsed.pages ?? []).map(async (page) => {
    const screenshotPath = path.join(outputDir, `${page.id}.png`);
    if (!page.ok) {
      return {
        ...page,
        screenshot_path: screenshotPath
      };
    }
    try {
      await copyFile(page.screenshot_path, screenshotPath);
      return {
        ...page,
        screenshot_path: screenshotPath,
        ok: true
      };
    } catch (error) {
      return {
        ...page,
        screenshot_path: screenshotPath,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
  report.captured_count = report.pages.filter((page) => page.ok).length;

  if (!parsed.ok || report.captured_count !== DEFAULT_PAGES.length) {
    return {
      report,
      passed: false,
      failure_category: "desktop_screenshot_failure",
      failure_message: `Expected ${DEFAULT_PAGES.length} screenshots, captured ${report.captured_count}.`
    };
  }

  return { report, passed: true };
}
