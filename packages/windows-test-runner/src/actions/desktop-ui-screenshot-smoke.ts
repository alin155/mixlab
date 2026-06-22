import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  window_process_id?: number;
  window_process_name?: string;
  window_process_path?: string;
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
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$code = @"
using System;
using System.Runtime.InteropServices;

public static class MixLabWin32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

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

$proc = Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$windowTitle*" } |
  ForEach-Object {
    $pathValue = Get-MixLabProcessPath $_
    [pscustomobject]@{
      process = $_
      score = Get-MixLabProcessScore $_
      path = $pathValue
    }
  } |
  Where-Object { $_.score -gt 0 } |
  Sort-Object @{ Expression = { $_.score }; Descending = $true },
    @{ Expression = { $_.process.StartTime }; Descending = $true } |
  Select-Object -First 1

if (-not $proc) {
  throw "Real MixLab Cutter window matching '$windowTitle' was not found. Browser, Explorer, cmd, and terminal windows are ignored."
}

$procPath = $proc.path
$proc = $proc.process

[MixLabWin32]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null
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

function Invoke-MixLabAbsoluteClick([int]$x, [int]$y) {
  [MixLabWin32]::SetCursorPos($x, $y) | Out-Null
  [MixLabWin32]::mouse_event(0x0002, $x, $y, 0, 0)
  Start-Sleep -Milliseconds 50
  [MixLabWin32]::mouse_event(0x0004, $x, $y, 0, 0)
}

function Invoke-MixLabFirewallPromptHotspot() {
  # Windows Firewall prompts are system dialogs centered over the app window.
  # UI Automation can miss them when they are owned by the security center, so
  # keep this fallback narrowly aimed at the prompt's bottom action row.
  Invoke-MixLabAbsoluteClick ([int]($rect.Left + ($width * 0.555))) ([int]($rect.Top + ($height * 0.655)))
  Start-Sleep -Milliseconds 500
}

function Dismiss-MixLabWindowsFirewallPrompt() {
  $matches = New-Object System.Collections.ArrayList
  $callback = [MixLabWin32+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    if (-not [MixLabWin32]::IsWindowVisible($hWnd)) {
      return $true
    }
    $titleBuilder = New-Object System.Text.StringBuilder 256
    [MixLabWin32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
    $title = $titleBuilder.ToString()
    if ($title -like "*Windows 安全*" -or $title -like "*Windows Security*" -or $title -like "*安全中心*") {
      $dialogRect = New-Object MixLabWin32+RECT
      [MixLabWin32]::GetWindowRect($hWnd, [ref]$dialogRect) | Out-Null
      [void]$matches.Add([pscustomobject]@{
        handle = $hWnd
        title = $title
        left = $dialogRect.Left
        top = $dialogRect.Top
        right = $dialogRect.Right
        bottom = $dialogRect.Bottom
        width = $dialogRect.Right - $dialogRect.Left
        height = $dialogRect.Bottom - $dialogRect.Top
      })
    }
    return $true
  }
  [MixLabWin32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  $dialog = $matches |
    Sort-Object @{ Expression = { $_.width * $_.height }; Descending = $true } |
    Select-Object -First 1
  if ($dialog) {
    [MixLabWin32]::SetForegroundWindow($dialog.handle) | Out-Null
    Start-Sleep -Milliseconds 150
    Invoke-MixLabAbsoluteClick ([int]($dialog.left + ($dialog.width * 0.28))) ([int]($dialog.bottom - 40))
    Start-Sleep -Milliseconds 700
    return $true
  }
  return $false
}

function Dismiss-MixLabBlockingDialog() {
  $matches = New-Object System.Collections.ArrayList
  $callback = [MixLabWin32+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    if ($hWnd -eq $proc.MainWindowHandle) {
      return $true
    }
    if (-not [MixLabWin32]::IsWindowVisible($hWnd)) {
      return $true
    }
    $dialogRect = New-Object MixLabWin32+RECT
    [MixLabWin32]::GetWindowRect($hWnd, [ref]$dialogRect) | Out-Null
    $dialogWidth = $dialogRect.Right - $dialogRect.Left
    $dialogHeight = $dialogRect.Bottom - $dialogRect.Top
    if ($dialogWidth -lt 220 -or $dialogWidth -gt 820 -or $dialogHeight -lt 120 -or $dialogHeight -gt 620) {
      return $true
    }
    $centerX = $dialogRect.Left + ($dialogWidth / 2)
    $centerY = $dialogRect.Top + ($dialogHeight / 2)
    $insideApp = $centerX -gt $rect.Left -and $centerX -lt $rect.Right -and $centerY -gt $rect.Top -and $centerY -lt $rect.Bottom
    if (-not $insideApp) {
      return $true
    }
    $titleBuilder = New-Object System.Text.StringBuilder 256
    [MixLabWin32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
    [void]$matches.Add([pscustomobject]@{
      handle = $hWnd
      title = $titleBuilder.ToString()
      left = $dialogRect.Left
      top = $dialogRect.Top
      right = $dialogRect.Right
      bottom = $dialogRect.Bottom
      width = $dialogWidth
      height = $dialogHeight
    })
    return $true
  }
  [MixLabWin32]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
  $dialog = $matches |
    Sort-Object @{ Expression = { $_.width * $_.height }; Descending = $true } |
    Select-Object -First 1
  if ($dialog) {
    [MixLabWin32]::SetForegroundWindow($dialog.handle) | Out-Null
    Start-Sleep -Milliseconds 150
    Invoke-MixLabAbsoluteClick ([int]($dialog.left + ($dialog.width * 0.75))) ([int]($dialog.bottom - 42))
    Start-Sleep -Milliseconds 500
  }
}

function Invoke-MixLabAutomationDismiss() {
  try {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($window in $windows) {
      $handle = [IntPtr]$window.Current.NativeWindowHandle
      if ($handle -eq $proc.MainWindowHandle) {
        continue
      }
      $dialogRect = $window.Current.BoundingRectangle
      $dialogWidth = $dialogRect.Width
      $dialogHeight = $dialogRect.Height
      if ($dialogWidth -lt 220 -or $dialogWidth -gt 820 -or $dialogHeight -lt 120 -or $dialogHeight -gt 620) {
        continue
      }
      $centerX = $dialogRect.Left + ($dialogWidth / 2)
      $centerY = $dialogRect.Top + ($dialogHeight / 2)
      $insideApp = $centerX -gt $rect.Left -and $centerX -lt $rect.Right -and $centerY -gt $rect.Top -and $centerY -lt $rect.Bottom
      if (-not $insideApp) {
        continue
      }
      $buttonCondition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Button
      )
      $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
      $button = $buttons |
        Sort-Object @{ Expression = { $_.Current.BoundingRectangle.Top }; Descending = $true },
          @{ Expression = { $_.Current.BoundingRectangle.Left }; Descending = $true } |
        Select-Object -First 1
      if ($button) {
        $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $pattern.Invoke()
        Start-Sleep -Milliseconds 700
        return $true
      }
    }
  } catch {
    return $false
  }
  return $false
}

function Invoke-MixLabDialogCancelHotspot() {
  Invoke-MixLabAbsoluteClick ([int]($rect.Left + ($width * 0.68))) ([int]($rect.Top + ($height * 0.63)))
  Start-Sleep -Milliseconds 500
}

function Invoke-MixLabSystemDialogDismissal() {
  for ($dismissIndex = 0; $dismissIndex -lt 4; $dismissIndex += 1) {
    $dismissedFirewall = Dismiss-MixLabWindowsFirewallPrompt
    if (-not $dismissedFirewall) {
      Invoke-MixLabAutomationDismiss | Out-Null
      Dismiss-MixLabBlockingDialog
    }
    Start-Sleep -Milliseconds 250
  }
  Invoke-MixLabFirewallPromptHotspot
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
Invoke-MixLabSystemDialogDismissal
foreach ($page in $pages) {
  $click = $null
  $errorText = $null
  try {
    if ($page.action -eq 'sidebar' -or $page.action -eq 'content') {
      Invoke-MixLabSystemDialogDismissal
      $click = Invoke-MixLabClick $page.x $page.y
      Start-Sleep -Milliseconds $settleMs
    }
    Invoke-MixLabSystemDialogDismissal
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
  window_process_id = $proc.Id
  window_process_name = $proc.ProcessName
  window_process_path = Convert-MixLabJsonPath $procPath
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

async function hashFile(filePath: string): Promise<string | undefined> {
  try {
    return createHash("sha256").update(await readFile(filePath)).digest("hex");
  } catch {
    return undefined;
  }
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
  report.window_process_id = parsed.window_process_id;
  report.window_process_name = parsed.window_process_name;
  report.window_process_path = parsed.window_process_path;
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
  const screenshotHashes = await Promise.all(
    report.pages.filter((page) => page.ok).map((page) => hashFile(page.screenshot_path))
  );
  const uniqueScreenshotCount = new Set(screenshotHashes.filter(Boolean)).size;

  if (!parsed.ok || report.captured_count !== DEFAULT_PAGES.length) {
    return {
      report,
      passed: false,
      failure_category: "desktop_screenshot_failure",
      failure_message: `Expected ${DEFAULT_PAGES.length} screenshots, captured ${report.captured_count}.`
    };
  }
  if (uniqueScreenshotCount < 5) {
    return {
      report,
      passed: false,
      failure_category: "desktop_screenshot_failure",
      failure_message: `Desktop screenshots did not navigate across pages: only ${uniqueScreenshotCount} unique captures.`
    };
  }

  return { report, passed: true };
}
