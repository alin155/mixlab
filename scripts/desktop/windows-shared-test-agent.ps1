<#
.SYNOPSIS
  MixLab Cutter shared-folder test agent for Windows targets.

.DESCRIPTION
  Polls a shared folder for control/cutter-command.json, executes a small
  whitelist of test/update actions, and writes results plus diagnostics back
  to results/runs/<command_id>/.

  This script intentionally does not execute arbitrary shell commands from the
  shared folder. Add new actions to Invoke-AgentCommand when the automation
  contract needs to grow.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ShareRoot,

  [switch]$Once,

  [int]$PollSeconds = 5,

  [string]$CommandFile = "",

  [string]$AppExePath = "",

  [int]$HealthTimeoutSeconds = 45
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$AgentVersion = "0.3.6"
$ApiBaseUrl = "http://127.0.0.1:3789"
$script:ExitAfterCurrentPoll = $false
$script:VolatileTelemetrySuspendUntilUtc = [DateTime]::MinValue
$script:VolatileTelemetryLogUntilUtc = [DateTime]::MinValue
$RunOnce = $PSBoundParameters.ContainsKey("Once")

function Get-NowIso {
  return [DateTime]::UtcNow.ToString("o")
}

function Join-SharePath {
  param([string[]]$Parts)
  $current = $ShareRoot
  foreach ($part in $Parts) {
    $current = Join-Path $current $part
  }
  return $current
}

function Ensure-Directory {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function ConvertTo-JsonText {
  param([object]$Value)
  return ($Value | ConvertTo-Json -Depth 30)
}

function Write-JsonFile {
  param(
    [string]$Path,
    [object]$Value
  )
  Ensure-Directory -Path (Split-Path -Parent $Path)
  $tmp = "$Path.tmp-$PID"
  ConvertTo-JsonText -Value $Value | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Can-WriteVolatileTelemetry {
  return ([DateTime]::UtcNow -ge $script:VolatileTelemetrySuspendUntilUtc)
}

function Suspend-VolatileTelemetry {
  param(
    [string]$Label,
    [string]$Message
  )
  $now = [DateTime]::UtcNow
  $script:VolatileTelemetrySuspendUntilUtc = $now.AddSeconds(15)
  if ($now -ge $script:VolatileTelemetryLogUntilUtc) {
    Write-Host "Failed to write agent ${Label}; suppressing volatile telemetry for 15s: $Message"
    $script:VolatileTelemetryLogUntilUtc = $now.AddSeconds(30)
  }
}

function Read-TextFile {
  param([string]$Path)

  $stream = $null
  $reader = $null
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
    return $reader.ReadToEnd()
  } finally {
    if ($reader) {
      $reader.Close()
    } elseif ($stream) {
      $stream.Close()
    }
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $raw = Read-TextFile -Path $Path
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }
  return ($raw | ConvertFrom-Json)
}

function Write-AgentEvent {
  param(
    [string]$Event,
    [object]$Details = @{}
  )
  $logDir = Join-SharePath -Parts @("logs", "agent")
  Ensure-Directory -Path $logDir
  $line = ConvertTo-JsonText -Value @{
    at = Get-NowIso
    agent_version = $AgentVersion
    event = $Event
    details = $Details
  }
  Add-Content -LiteralPath (Join-Path $logDir "windows-shared-test-agent.ndjson") -Value $line -Encoding UTF8
}

function Write-AgentStatus {
  param(
    [string]$Status,
    [object]$Details = @{}
  )
  Write-JsonFile -Path (Join-SharePath -Parts @("agent-status.json")) -Value @{
    schema_version = "1.0"
    agent = "mixlab-cutter-windows-shared-test-agent"
    agent_version = $AgentVersion
    status = $Status
    updated_at = Get-NowIso
    share_root = $ShareRoot
    machine = $env:COMPUTERNAME
    user = $env:USERNAME
    api_base_url = $ApiBaseUrl
    details = $Details
  }
}

function Write-AgentHeartbeat {
  if (-not (Can-WriteVolatileTelemetry)) {
    return $false
  }

  try {
    Write-JsonFile -Path (Join-SharePath -Parts @("agent-heartbeat.json")) -Value @{
      schema_version = "1.0"
      agent = "mixlab-cutter-windows-shared-test-agent"
      agent_version = $AgentVersion
      updated_at = Get-NowIso
      share_root = $ShareRoot
      machine = $env:COMPUTERNAME
      user = $env:USERNAME
      command_file = Get-CommandPath
    }
    return $true
  } catch {
    Suspend-VolatileTelemetry -Label "heartbeat" -Message $_.Exception.Message
    return $false
  }
}

function Write-AgentLoopError {
  param([object]$ErrorRecord)
  try {
    $details = @{
      error = $ErrorRecord.Exception.Message
      updated_at = Get-NowIso
      command_file = Get-CommandPath
      share_root = $ShareRoot
      agent_version = $AgentVersion
    }
    Write-JsonFile -Path (Join-SharePath -Parts @("agent-loop-error.json")) -Value $details
    Write-AgentStatus -Status "loop_error" -Details $details
    Write-AgentEvent -Event "agent_loop_error" -Details $details
  } catch {
    Write-Host "Failed to write loop error: $($_.Exception.Message)"
  }
}

function Write-AgentCheckpoint {
  param(
    [string]$Stage,
    [object]$Details = @{}
  )
  if (-not (Can-WriteVolatileTelemetry)) {
    return
  }

  try {
    Write-JsonFile -Path (Join-SharePath -Parts @("agent-checkpoint.json")) -Value @{
      schema_version = "1.0"
      agent = "mixlab-cutter-windows-shared-test-agent"
      agent_version = $AgentVersion
      stage = $Stage
      updated_at = Get-NowIso
      share_root = $ShareRoot
      command_file = Get-CommandPath
      machine = $env:COMPUTERNAME
      user = $env:USERNAME
      details = $Details
    }
  } catch {
    Suspend-VolatileTelemetry -Label "checkpoint" -Message $_.Exception.Message
  }
}

function Get-StatePath {
  return Join-SharePath -Parts @("control", "cutter-agent-state.json")
}

function Get-AppStatePath {
  return Join-SharePath -Parts @("control", "cutter-agent-app.json")
}

function Get-CachedAppExePath {
  $state = Read-JsonFile -Path (Get-AppStatePath)
  if (-not $state) {
    return ""
  }
  if ($state.PSObject.Properties.Name -contains "app_exe_path") {
    return [string]$state.app_exe_path
  }
  return ""
}

function Write-CachedAppExePath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return
  }

  try {
    Write-JsonFile -Path (Get-AppStatePath) -Value @{
      schema_version = "1.0"
      app_exe_path = $Path
      updated_at = Get-NowIso
      agent_version = $AgentVersion
      machine = $env:COMPUTERNAME
      user = $env:USERNAME
    }
  } catch {
    Write-AgentEvent -Event "app_exe_cache_write_failed" -Details @{
      path = $Path
      error = $_.Exception.Message
    }
  }
}

function Get-CommandPath {
  if (-not [string]::IsNullOrWhiteSpace($CommandFile)) {
    return $CommandFile
  }
  return Join-SharePath -Parts @("control", "cutter-command.json")
}

function Get-CommandQueueDirectory {
  return Join-SharePath -Parts @("control", "commands")
}

function Get-LatestQueuedCommandPath {
  $queueDir = Get-CommandQueueDirectory
  if (-not (Test-Path -LiteralPath $queueDir)) {
    return ""
  }

  try {
    $latest = Get-ChildItem -LiteralPath $queueDir -Filter "*.json" -File -ErrorAction Stop |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if ($latest) {
      return $latest.FullName
    }
  } catch {
    Write-AgentEvent -Event "command_queue_scan_failed" -Details @{ path = $queueDir; error = $_.Exception.Message }
  }

  return ""
}

function Get-PreferredCommandPath {
  $queuedPath = Get-LatestQueuedCommandPath
  if (-not [string]::IsNullOrWhiteSpace($queuedPath)) {
    return $queuedPath
  }
  return Get-CommandPath
}

function Get-RunDirectory {
  param([string]$CommandId)
  $safe = ($CommandId -replace "[^a-zA-Z0-9_.-]", "_")
  $runDir = Join-SharePath -Parts @("results", "runs", $safe)
  Ensure-Directory -Path $runDir
  return $runDir
}

function Read-AgentCommand {
  $path = Get-PreferredCommandPath
  if (-not (Test-Path -LiteralPath $path)) {
    return $null
  }
  try {
    return Read-JsonFile -Path $path
  } catch {
    Write-AgentEvent -Event "command_read_failed" -Details @{ path = $path; error = $_.Exception.Message }
    return $null
  }
}

function Get-CommandFileSnapshot {
  param([string]$Path = "")

  if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Get-PreferredCommandPath
  }

  $exists = Test-Path -LiteralPath $Path
  $snapshot = @{
    command_file = $Path
    legacy_command_file = Get-CommandPath
    command_queue_dir = Get-CommandQueueDirectory
    exists = [bool]$exists
  }
  if (-not $exists) {
    return $snapshot
  }

  try {
    $item = Get-Item -LiteralPath $Path
    $raw = Read-TextFile -Path $Path
    $snapshot.last_write_time_utc = $item.LastWriteTimeUtc.ToString("o")
    $snapshot.length = $item.Length
    $snapshot.raw_preview = if ($raw.Length -gt 500) { $raw.Substring(0, 500) } else { $raw }
    try {
      $parsed = $raw | ConvertFrom-Json
      if ($parsed.PSObject.Properties.Name -contains "command_id") {
        $snapshot.command_id = [string]$parsed.command_id
      }
      if ($parsed.PSObject.Properties.Name -contains "action") {
        $snapshot.action = [string]$parsed.action
      }
    } catch {
      $snapshot.parse_error = $_.Exception.Message
    }
  } catch {
    $snapshot.read_error = $_.Exception.Message
  }

  return $snapshot
}

function Resolve-CommandId {
  param([object]$Command)
  if ($Command -and $Command.PSObject.Properties.Name -contains "command_id") {
    $value = [string]$Command.command_id
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
  throw "control command must include command_id"
}

function Resolve-CommandAction {
  param([object]$Command)
  if ($Command -and $Command.PSObject.Properties.Name -contains "action") {
    $value = [string]$Command.action
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
  throw "control command must include action"
}

function Get-CommandPayload {
  param([object]$Command)
  if ($Command -and $Command.PSObject.Properties.Name -contains "payload") {
    return $Command.payload
  }
  return $null
}

function Test-CommandAlreadyHandled {
  param([string]$CommandId)
  $state = Read-JsonFile -Path (Get-StatePath)
  if (-not $state) {
    return $false
  }
  if ($state.PSObject.Properties.Name -contains "last_command_id") {
    return ([string]$state.last_command_id) -eq $CommandId
  }
  return $false
}

function Write-CommandHandled {
  param(
    [string]$CommandId,
    [string]$Status,
    [string]$ResultPath
  )
  Write-JsonFile -Path (Get-StatePath) -Value @{
    schema_version = "1.0"
    last_command_id = $CommandId
    last_status = $Status
    last_result_path = $ResultPath
    updated_at = Get-NowIso
  }
}

function Add-CandidatePath {
  param(
    [System.Collections.ArrayList]$Paths,
    [string]$Path
  )
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return
  }

  $normalized = (Convert-ToExeCandidate -Value $Path)
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return
  }
  if (-not $Paths.Contains($normalized)) {
    [void]$Paths.Add($normalized)
  }
}

function Convert-ToExeCandidate {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $trimmed = $Value.Trim()
  $trimmed = $trimmed.Trim("'")
  $trimmed = $trimmed.Trim('"')
  $trimmed = $trimmed -replace '^\\"', ''
  $trimmed = $trimmed -replace '\\"$', ''
  $trimmed = $trimmed.Trim()

  if ($trimmed -match '^"([^"]+\.exe)"') {
    return $matches[1]
  }
  if ($trimmed -match '^(.+?\.exe)(?:\s|,|$)') {
    return $matches[1].Trim('"').Trim("'")
  }
  return $trimmed.Trim('"').Trim("'")
}

function Join-WindowsPathText {
  param(
    [string]$Base,
    [string]$Child
  )
  $cleanBase = Convert-ToExeCandidate -Value $Base
  if ([string]::IsNullOrWhiteSpace($cleanBase)) {
    return ""
  }
  $cleanBase = $cleanBase -replace '[\\/]+$', ''
  $cleanChild = $Child -replace '^[\\/]+', ''
  return "$cleanBase\$cleanChild"
}

function Get-LocalFixedDriveRoots {
  $roots = @()
  try {
    Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue | Where-Object {
      $_.DriveType -eq 3 -and -not [string]::IsNullOrWhiteSpace($_.DeviceID)
    } | ForEach-Object {
      $roots += "$($_.DeviceID)\"
    }
  } catch {
    Write-AgentEvent -Event "fixed_drive_probe_failed" -Details @{ error = $_.Exception.Message }
  }

  if ($roots.Count -eq 0) {
    $roots += @("C:\")
  }

  return $roots
}

function Test-NetworkDrivePath {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $false
  }
  if ($Path.StartsWith("\\")) {
    return $true
  }
  if ($Path -notmatch '^([a-zA-Z]):\\') {
    return $false
  }

  $drive = "$($matches[1].ToUpperInvariant()):"
  try {
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'" -ErrorAction SilentlyContinue
    return ($disk -and $disk.DriveType -eq 4)
  } catch {
    Write-AgentEvent -Event "drive_type_probe_failed" -Details @{ path = $Path; error = $_.Exception.Message }
    return $false
  }
}

function Add-RegistryAppCandidates {
  param([System.Collections.ArrayList]$Paths)

  $registryPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  foreach ($registryPath in $registryPaths) {
    Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $displayName = ""
        if ($_.PSObject.Properties.Name -contains "DisplayName") {
          $displayName = [string]$_.DisplayName
        }
        if ($displayName -notmatch "MixLab\s+Cutter") {
          return
        }

        if ($_.PSObject.Properties.Name -contains "DisplayIcon") {
          Add-CandidatePath -Paths $Paths -Path ([string]$_.DisplayIcon)
        }
        if ($_.PSObject.Properties.Name -contains "InstallLocation") {
          $installLocation = [string]$_.InstallLocation
          if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
            Add-CandidatePath -Paths $Paths -Path (Join-WindowsPathText -Base $installLocation -Child "MixLab Cutter.exe")
          }
        }
      } catch {
        Write-AgentEvent -Event "registry_probe_failed" -Details @{ registry_path = $registryPath; error = $_.Exception.Message }
      }
    }
  }
}

function Add-ShortcutAppCandidates {
  param([System.Collections.ArrayList]$Paths)

  $shortcutRoots = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:USERPROFILE "Desktop"),
    (Join-Path $env:PUBLIC "Desktop")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_) }

  $shell = $null
  try {
    $shell = New-Object -ComObject WScript.Shell
    foreach ($root in $shortcutRoots) {
      Get-ChildItem -LiteralPath $root -Filter "*MixLab Cutter*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        try {
          $shortcut = $shell.CreateShortcut($_.FullName)
          Add-CandidatePath -Paths $Paths -Path ([string]$shortcut.TargetPath)
        } catch {
          Write-AgentEvent -Event "shortcut_probe_failed" -Details @{ path = $_.FullName; error = $_.Exception.Message }
        }
      }
    }
  } catch {
    Write-AgentEvent -Event "shortcut_probe_unavailable" -Details @{ error = $_.Exception.Message }
  }
}

function Add-ProcessAppCandidates {
  param([System.Collections.ArrayList]$Paths)

  Get-Process -Name "MixLab Cutter" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      Add-CandidatePath -Paths $Paths -Path ([string]$_.Path)
    } catch {
      Write-AgentEvent -Event "process_path_probe_failed" -Details @{ process = $_.ProcessName; id = $_.Id; error = $_.Exception.Message }
    }
  }
}

function Add-LogDerivedAppCandidates {
  param([System.Collections.ArrayList]$Paths)

  $desktopLog = Join-Path $env:APPDATA "MixLab Cutter\logs\desktop-host.ndjson"
  if (-not (Test-Path -LiteralPath $desktopLog)) {
    return
  }

  Get-Content -LiteralPath $desktopLog -Tail 250 -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $entry = $_ | ConvertFrom-Json
      if (-not ($entry.PSObject.Properties.Name -contains "details")) {
        return
      }
      $details = $entry.details
      $path = ""
      if ($details.PSObject.Properties.Name -contains "sidecar_path") {
        $path = [string]$details.sidecar_path
      } elseif ($details.PSObject.Properties.Name -contains "searchd_path") {
        $path = [string]$details.searchd_path
      }
      if ([string]::IsNullOrWhiteSpace($path)) {
        return
      }

      $path = Convert-ToExeCandidate -Value $path
      $binaryDir = [IO.Path]::GetDirectoryName($path)
      if ([string]::IsNullOrWhiteSpace($binaryDir)) {
        return
      }
      $appRoot = $binaryDir
      if ([IO.Path]::GetFileName($binaryDir) -in @("binaries", "resources")) {
        $appRoot = [IO.Path]::GetDirectoryName($binaryDir)
      }
      Add-CandidatePath -Paths $Paths -Path (Join-WindowsPathText -Base $appRoot -Child "MixLab Cutter.exe")
      Add-CandidatePath -Paths $Paths -Path (Join-WindowsPathText -Base $binaryDir -Child "MixLab Cutter.exe")
    } catch {
      Write-AgentEvent -Event "desktop_log_probe_failed" -Details @{ error = $_.Exception.Message }
    }
  }
}

function Get-MixLabCutterExeCandidates {
  param([string]$OverrideAppExePath = "")

  $paths = New-Object System.Collections.ArrayList
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_candidates_start"
  Add-CandidatePath -Paths $paths -Path $OverrideAppExePath
  Add-CandidatePath -Paths $paths -Path $AppExePath
  Add-CandidatePath -Paths $paths -Path (Get-CachedAppExePath)

  try {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_candidates_default_paths"
    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    Add-CandidatePath -Paths $paths -Path (Join-WindowsPathText -Base $env:LOCALAPPDATA -Child "Programs\MixLab Cutter\MixLab Cutter.exe")
    Add-CandidatePath -Paths $paths -Path (Join-WindowsPathText -Base $env:ProgramFiles -Child "MixLab Cutter\MixLab Cutter.exe")
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
      Add-CandidatePath -Paths $paths -Path (Join-WindowsPathText -Base $programFilesX86 -Child "MixLab Cutter\MixLab Cutter.exe")
    }
  } catch {
    Write-AgentEvent -Event "default_path_probe_failed" -Details @{ error = $_.Exception.Message }
  }

  try {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_candidates_drive_paths"
    Get-LocalFixedDriveRoots | ForEach-Object {
      Add-CandidatePath -Paths $paths -Path (Join-WindowsPathText -Base $_ -Child "Applications\MixLab Cutter\MixLab Cutter.exe")
    }
  } catch {
    Write-AgentEvent -Event "drive_path_probe_failed" -Details @{ error = $_.Exception.Message }
  }

  try {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_candidates_registry"
    Add-RegistryAppCandidates -Paths $paths
  } catch { Write-AgentEvent -Event "registry_source_failed" -Details @{ error = $_.Exception.Message } }
  try {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_candidates_shortcuts"
    Add-ShortcutAppCandidates -Paths $paths
  } catch { Write-AgentEvent -Event "shortcut_source_failed" -Details @{ error = $_.Exception.Message } }
  try {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_candidates_process"
    Add-ProcessAppCandidates -Paths $paths
  } catch { Write-AgentEvent -Event "process_source_failed" -Details @{ error = $_.Exception.Message } }
  try {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_candidates_logs"
    Add-LogDerivedAppCandidates -Paths $paths
  } catch { Write-AgentEvent -Event "log_source_failed" -Details @{ error = $_.Exception.Message } }

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_candidates_done" -Details @{ count = $paths.Count }

  return @($paths.ToArray())
}

function Find-MixLabCutterExe {
  param([string]$OverrideAppExePath = "")

  $candidates = Get-MixLabCutterExeCandidates -OverrideAppExePath $OverrideAppExePath
  $probeErrors = @()
  foreach ($candidate in $candidates) {
    try {
      Write-AgentHeartbeat | Out-Null
      Write-AgentCheckpoint -Stage "app_candidate_probe" -Details @{ path = $candidate }
      if (Test-NetworkDrivePath -Path $candidate) {
        Write-AgentEvent -Event "app_candidate_skipped_network_drive" -Details @{ path = $candidate }
        continue
      }
      if (Test-Path -LiteralPath $candidate) {
        Write-CachedAppExePath -Path $candidate
        return $candidate
      }
    } catch {
      $probeErrors += @{ path = $candidate; error = $_.Exception.Message }
      Write-AgentEvent -Event "app_candidate_probe_failed" -Details @{ path = $candidate; error = $_.Exception.Message }
    }
  }

  $probeSummary = if ($probeErrors.Count -gt 0) { " Probe errors: $(ConvertTo-JsonText -Value $probeErrors)" } else { "" }
  throw "MixLab Cutter executable was not found. Checked: $($candidates -join '; ').$probeSummary Pass -AppExePath or payload.app_exe_path if it is installed in a custom path."
}

function Get-MixLabCutterAppProcesses {
  $names = @("MixLab Cutter", "mixlab-cutter-desktop")
  $processes = @()
  foreach ($name in $names) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
      $processes += $_
    }
  }
  return $processes
}

function Stop-MixLabCutterProcesses {
  $names = @("MixLab Cutter", "mixlab-cutter-desktop", "cutter-api-sidecar-x86_64-pc-windows-msvc", "cutter-api-sidecar", "mixlab-searchd-x86_64-pc-windows-msvc", "mixlab-searchd")
  $stopped = @()
  foreach ($name in $names) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
      $stopped += @{ name = $_.ProcessName; id = $_.Id }
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
  return $stopped
}

function Start-MixLabCutter {
  param([object]$Payload = $null)

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_process_lookup_start"
  $existingProcesses = @(Get-MixLabCutterAppProcesses)
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_process_lookup_done" -Details @{ count = $existingProcesses.Count }
  $existing = $existingProcesses | Sort-Object Id -Descending | Select-Object -First 1
  if ($existing) {
    $path = ""
    try {
      $path = [string]$existing.Path
    } catch {
      $path = ""
    }
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "app_process_reuse" -Details @{ name = $existing.ProcessName; id = $existing.Id; path = $path }
    Write-AgentEvent -Event "app_process_reused" -Details @{ name = $existing.ProcessName; id = $existing.Id; path = $path }
    Write-CachedAppExePath -Path $path
    return @{ exe = $path; pid = $existing.Id; reused_existing = $true }
  }

  $overrideAppExePath = ""
  if ($Payload -and $Payload.PSObject.Properties.Name -contains "app_exe_path") {
    $overrideAppExePath = [string]$Payload.app_exe_path
  }

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_find_exe_start"
  $exe = Find-MixLabCutterExe -OverrideAppExePath $overrideAppExePath
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_start_process" -Details @{ exe = $exe }
  $process = Start-Process -FilePath $exe -PassThru
  Write-CachedAppExePath -Path $exe
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "app_started" -Details @{ exe = $exe; pid = $process.Id }
  return @{ exe = $exe; pid = $process.Id }
}

function Wait-MixLabApiHealth {
  param([int]$TimeoutSeconds = $HealthTimeoutSeconds)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ""
  do {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "api_health_probe"
    try {
      $response = Invoke-WebRequest -Uri "$ApiBaseUrl/health" -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -eq 200 -and $response.Content -match '"ok"\s*:\s*true') {
        return @{ ready = $true; status_code = $response.StatusCode; content = $response.Content }
      }
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  return @{ ready = $false; error = $lastError }
}

function Invoke-MixLabApiGet {
  param([string]$Path)
  $url = "$ApiBaseUrl$Path"
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "api_get_start" -Details @{ path = $Path }
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
    $body = $null
    if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
      $body = $response.Content | ConvertFrom-Json
    }
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "api_get_done" -Details @{ path = $Path; status_code = $response.StatusCode }
    return @{ ok = $true; path = $Path; status_code = $response.StatusCode; body = $body }
  } catch {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "api_get_failed" -Details @{ path = $Path; error = $_.Exception.Message }
    return @{ ok = $false; path = $Path; error = $_.Exception.Message }
  }
}

function Invoke-ApiProbe {
  param([object]$Payload)
  $timeoutSeconds = 5
  if ($Payload -and $Payload.PSObject.Properties.Name -contains "health_timeout_seconds") {
    $requestedTimeout = [int]$Payload.health_timeout_seconds
    if ($requestedTimeout -gt 0 -and $requestedTimeout -le $HealthTimeoutSeconds) {
      $timeoutSeconds = $requestedTimeout
    }
  }

  $paths = @(
    "/cutter/auth/mode",
    "/cutter/runtime-status",
    "/cutter/source-library?limit=20"
  )
  if ($Payload -and $Payload.PSObject.Properties.Name -contains "paths" -and $Payload.paths) {
    $paths = @()
    foreach ($path in @($Payload.paths)) {
      $pathText = [string]$path
      if ($pathText -eq "/health" -or $pathText.StartsWith("/cutter/")) {
        $paths += $pathText
      }
    }
  }

  Write-AgentCheckpoint -Stage "probe_api_health"
  $health = Wait-MixLabApiHealth -TimeoutSeconds $timeoutSeconds
  $requests = @()
  if ($health.ready) {
    foreach ($path in $paths) {
      $requests += Invoke-MixLabApiGet -Path $path
    }
  }

  return @{
    api_base_url = $ApiBaseUrl
    health = $health
    requests = $requests
  }
}

function Resolve-LatestRelease {
  $manifestPath = Join-SharePath -Parts @("releases", "latest.json")
  if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Read-JsonFile -Path $manifestPath
    $installerFile = [string]$manifest.installer_file
    $installerPath = if ([IO.Path]::IsPathRooted($installerFile)) { $installerFile } else { Join-Path (Split-Path -Parent $manifestPath) $installerFile }
    return @{
      source = "releases/latest.json"
      installer_path = $installerPath
      sha256 = [string]$manifest.sha256
      version = [string]$manifest.version
      commit = [string]$manifest.commit
      silent_args = if ($manifest.PSObject.Properties.Name -contains "silent_args") { [string]$manifest.silent_args } else { "/S" }
    }
  }

  $latestTextPath = Join-SharePath -Parts @("LATEST.txt")
  if (-not (Test-Path -LiteralPath $latestTextPath)) {
    throw "No releases/latest.json or LATEST.txt found under $ShareRoot"
  }
  $latestText = Get-Content -LiteralPath $latestTextPath -Raw -Encoding UTF8
  $installer = [regex]::Match($latestText, "(?m)^Installer:\s*(.+)$").Groups[1].Value.Trim()
  $sha = [regex]::Match($latestText, "(?m)^SHA256:\s*([a-fA-F0-9]{64})$").Groups[1].Value.Trim()
  $commit = [regex]::Match($latestText, "(?m)^Commit:\s*(.+)$").Groups[1].Value.Trim()
  if ([string]::IsNullOrWhiteSpace($installer)) {
    $installer = "MixLab Cutter_0.18.10_x64-setup.exe"
  }
  return @{
    source = "LATEST.txt"
    installer_path = Join-Path $ShareRoot $installer
    sha256 = $sha
    version = ""
    commit = $commit
    silent_args = "/S"
  }
}

function Get-AgentLocalCacheRoot {
  $base = $env:TEMP
  if ([string]::IsNullOrWhiteSpace($base)) {
    $base = [IO.Path]::GetTempPath()
  }
  return Join-Path $base "MixLabWindowsBuilds"
}

function Get-FileLengthSafe {
  param([string]$Path)
  try {
    if ([System.IO.File]::Exists($Path)) {
      return ([System.IO.FileInfo]$Path).Length
    }
  } catch {
    return 0L
  }
  return 0L
}

function Write-LongFileProgress {
  param(
    [string]$Stage,
    [string]$Path,
    [int64]$BytesDone,
    [int64]$TotalBytes = 0
  )

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage $Stage -Details @{
    path = $Path
    bytes_done = $BytesDone
    total_bytes = $TotalBytes
  }
}

function Get-Sha256WithHeartbeat {
  param(
    [string]$Path,
    [string]$Stage = "file_hash"
  )

  $totalBytes = Get-FileLengthSafe -Path $Path
  Write-LongFileProgress -Stage "$Stage.start" -Path $Path -BytesDone 0 -TotalBytes $totalBytes

  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = $null
  $bytesRead = 0L
  $nextReportBytes = 8L * 1024L * 1024L
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $buffer = New-Object byte[] (1024 * 1024)
    while ($true) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        break
      }

      $bytesRead += [int64]$read
      $null = $sha.TransformBlock($buffer, 0, $read, $buffer, 0)

      if ($bytesRead -ge $nextReportBytes) {
        Write-LongFileProgress -Stage $Stage -Path $Path -BytesDone $bytesRead -TotalBytes $totalBytes
        $nextReportBytes = $bytesRead + (8L * 1024L * 1024L)
      }
    }

    $empty = New-Object byte[] 0
    $null = $sha.TransformFinalBlock($empty, 0, 0)
    Write-LongFileProgress -Stage "$Stage.done" -Path $Path -BytesDone $bytesRead -TotalBytes $totalBytes
    return (($sha.Hash | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    if ($stream -ne $null) {
      $stream.Dispose()
    }
    if ($sha -ne $null) {
      $sha.Dispose()
    }
  }
}

function Copy-FileWithHeartbeat {
  param(
    [string]$Source,
    [string]$Destination,
    [string]$Stage = "file_copy"
  )

  Ensure-Directory -Path (Split-Path -Parent $Destination)
  $totalBytes = Get-FileLengthSafe -Path $Source
  Write-LongFileProgress -Stage "$Stage.start" -Path $Source -BytesDone 0 -TotalBytes $totalBytes

  $sourceStream = $null
  $destinationStream = $null
  $bytesCopied = 0L
  $nextReportBytes = 8L * 1024L * 1024L
  try {
    $sourceStream = [System.IO.File]::Open($Source, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $destinationStream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
    $buffer = New-Object byte[] (1024 * 1024)
    while ($true) {
      $read = $sourceStream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        break
      }

      $destinationStream.Write($buffer, 0, $read)
      $bytesCopied += [int64]$read
      if ($bytesCopied -ge $nextReportBytes) {
        Write-LongFileProgress -Stage $Stage -Path $Source -BytesDone $bytesCopied -TotalBytes $totalBytes
        $nextReportBytes = $bytesCopied + (8L * 1024L * 1024L)
      }
    }
  } finally {
    if ($destinationStream -ne $null) {
      $destinationStream.Dispose()
    }
    if ($sourceStream -ne $null) {
      $sourceStream.Dispose()
    }
  }

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "$Stage.done" -Details @{
    source = $Source
    destination = $Destination
    bytes_done = $bytesCopied
    total_bytes = $totalBytes
  }
}

function Copy-InstallerToLocalCache {
  param([object]$Release)

  $installerName = Split-Path -Leaf $Release.installer_path
  if ([string]::IsNullOrWhiteSpace($installerName)) {
    $installerName = "MixLab-Cutter-setup.exe"
  }

  $commit = ""
  if ($Release.ContainsKey("commit")) {
    $commit = [string]$Release.commit
  }
  if (-not [string]::IsNullOrWhiteSpace($commit) -and $installerName -notlike "*$commit*") {
    $installerName = [IO.Path]::GetFileNameWithoutExtension($installerName) + "-$commit" + [IO.Path]::GetExtension($installerName)
  }

  $installersDir = Join-Path (Get-AgentLocalCacheRoot) "installers"
  Ensure-Directory -Path $installersDir
  $localInstallerPath = Join-Path $installersDir $installerName

  Copy-FileWithHeartbeat -Source $Release.installer_path -Destination $localInstallerPath -Stage "installer_copy_to_local_cache"
  try {
    Unblock-File -LiteralPath $localInstallerPath -ErrorAction SilentlyContinue
  } catch {
    Write-AgentEvent -Event "installer_unblock_failed" -Details @{
      path = $localInstallerPath
      error = $_.Exception.Message
    }
  }

  return $localInstallerPath
}

function Resolve-LatestWindowsTestRunner {
  $manifestPath = Join-SharePath -Parts @("runner", "latest.json")
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "No runner/latest.json found under $ShareRoot"
  }

  $manifest = Read-JsonFile -Path $manifestPath
  $runnerFile = "MixLabWindowsTestRunner.exe"
  if ($manifest.PSObject.Properties.Name -contains "executable_file" -and -not [string]::IsNullOrWhiteSpace([string]$manifest.executable_file)) {
    $runnerFile = [string]$manifest.executable_file
  }

  $runnerPath = if ([IO.Path]::IsPathRooted($runnerFile)) {
    $runnerFile
  } else {
    Join-Path (Split-Path -Parent $manifestPath) $runnerFile
  }

  $port = 3799
  if ($manifest.PSObject.Properties.Name -contains "default_port" -and [int]$manifest.default_port -gt 0) {
    $port = [int]$manifest.default_port
  }

  return @{
    source = "runner/latest.json"
    runner_path = $runnerPath
    sha256 = [string]$manifest.sha256
    version = [string]$manifest.version
    built_at = [string]$manifest.built_at
    port = $port
  }
}

function Copy-RunnerToLocalCache {
  param([object]$Runner)

  $runnerName = Split-Path -Leaf $Runner.runner_path
  if ([string]::IsNullOrWhiteSpace($runnerName)) {
    $runnerName = "MixLabWindowsTestRunner.exe"
  }

  $sha = ""
  if ($Runner.ContainsKey("sha256")) {
    $sha = [string]$Runner.sha256
  }
  if (-not [string]::IsNullOrWhiteSpace($sha) -and $sha.Length -ge 8) {
    $runnerName = [IO.Path]::GetFileNameWithoutExtension($runnerName) + "-" + $sha.Substring(0, 8) + [IO.Path]::GetExtension($runnerName)
  }

  $runnerDir = Join-Path (Get-AgentLocalCacheRoot) "runner"
  Ensure-Directory -Path $runnerDir
  $localRunnerPath = Join-Path $runnerDir $runnerName

  Copy-FileWithHeartbeat -Source $Runner.runner_path -Destination $localRunnerPath -Stage "runner_copy_to_local_cache"
  try {
    Unblock-File -LiteralPath $localRunnerPath -ErrorAction SilentlyContinue
  } catch {
    Write-AgentEvent -Event "runner_unblock_failed" -Details @{
      path = $localRunnerPath
      error = $_.Exception.Message
    }
  }

  return $localRunnerPath
}

function Stop-MixLabWindowsTestRunnerProcesses {
  $stopped = @()
  $processes = @(Get-Process -Name "MixLabWindowsTestRunner" -ErrorAction SilentlyContinue)
  foreach ($process in $processes) {
    try {
      $stopped += @{ name = $process.ProcessName; id = $process.Id }
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
      $stopped += @{ name = $process.ProcessName; id = $process.Id; error = $_.Exception.Message }
    }
  }
  return $stopped
}

function Wait-WindowsTestRunnerHealth {
  param(
    [int]$TimeoutSeconds = 15,
    [int]$Port = 3799
  )

  $url = "http://127.0.0.1:$Port/health"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ""
  do {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "runner_health_probe" -Details @{ url = $url }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200 -and $response.Content -match '"ok"\s*:\s*true') {
        return @{ ready = $true; url = $url; status_code = $response.StatusCode; content = $response.Content }
      }
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  return @{ ready = $false; url = $url; error = $lastError }
}

function Start-WindowsTestRunner {
  param([object]$Payload)

  $runner = Resolve-LatestWindowsTestRunner
  $port = [int]$runner.port
  if ($Payload -and $Payload.PSObject.Properties.Name -contains "port" -and [int]$Payload.port -gt 0) {
    $port = [int]$Payload.port
  }

  if ($Payload -and $Payload.PSObject.Properties.Name -contains "stop_existing" -and $Payload.stop_existing) {
    Write-AgentCheckpoint -Stage "runner_stop_existing"
    $stopped = Stop-MixLabWindowsTestRunnerProcesses
  } else {
    $stopped = @()
    $existingHealth = Wait-WindowsTestRunnerHealth -TimeoutSeconds 1 -Port $port
    if ($existingHealth.ready) {
      return @{
        reused_existing = $true
        runner = $runner
        health = $existingHealth
        stopped_processes = $stopped
      }
    }
  }

  Write-AgentCheckpoint -Stage "runner_copy_start" -Details $runner
  $localRunnerPath = Copy-RunnerToLocalCache -Runner $runner
  $actualSha = Get-Sha256WithHeartbeat -Path $localRunnerPath -Stage "runner_sha256"
  if (-not [string]::IsNullOrWhiteSpace([string]$runner.sha256) -and $actualSha.ToLowerInvariant() -ne ([string]$runner.sha256).ToLowerInvariant()) {
    throw "Runner SHA-256 mismatch. expected=$($runner.sha256) actual=$actualSha path=$localRunnerPath"
  }

  $previousShareRoot = [Environment]::GetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT", "Process")
  $previousBuildsRoot = [Environment]::GetEnvironmentVariable("MIXLAB_WINDOWS_BUILDS_ROOT", "Process")
  $previousHost = [Environment]::GetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_HOST", "Process")
  $previousPort = [Environment]::GetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_PORT", "Process")
  try {
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT", $ShareRoot, "Process")
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_BUILDS_ROOT", $ShareRoot, "Process")
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_HOST", "0.0.0.0", "Process")
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_PORT", [string]$port, "Process")

    Write-AgentCheckpoint -Stage "runner_start_process" -Details @{ exe = $localRunnerPath; port = $port }
    $process = Start-Process -FilePath $localRunnerPath -WindowStyle Hidden -PassThru
  } finally {
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_SHARE_ROOT", $previousShareRoot, "Process")
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_BUILDS_ROOT", $previousBuildsRoot, "Process")
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_HOST", $previousHost, "Process")
    [Environment]::SetEnvironmentVariable("MIXLAB_WINDOWS_TEST_RUNNER_PORT", $previousPort, "Process")
  }

  $health = Wait-WindowsTestRunnerHealth -TimeoutSeconds 20 -Port $port
  return @{
    reused_existing = $false
    runner = $runner
    local_runner_path = $localRunnerPath
    sha256 = $actualSha
    pid = $process.Id
    port = $port
    stopped_processes = $stopped
    health = $health
  }
}

function Wait-ProcessWithHeartbeat {
  param(
    [object]$Process,
    [int]$TimeoutSeconds = 600,
    [string]$Stage = "process_wait"
  )

  $started = Get-Date
  while ($true) {
    $Process.Refresh()
    if ($Process.HasExited) {
      return $Process.ExitCode
    }

    $elapsed = [int]((Get-Date) - $started).TotalSeconds
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage $Stage -Details @{
      pid = $Process.Id
      elapsed_seconds = $elapsed
      timeout_seconds = $TimeoutSeconds
    }

    if ($TimeoutSeconds -gt 0 -and $elapsed -ge $TimeoutSeconds) {
      try {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
      } catch {
        Write-AgentEvent -Event "process_timeout_stop_failed" -Details @{
          pid = $Process.Id
          error = $_.Exception.Message
        }
      }
      throw "Process timed out after $TimeoutSeconds seconds during $Stage."
    }

    Start-Sleep -Seconds 2
  }
}

function Install-LatestRelease {
  param([object]$Payload)
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "installer_resolve_release_start"
  $release = Resolve-LatestRelease
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "installer_resolve_release_done" -Details @{
    source = $release.source
    installer_path = $release.installer_path
    version = $release.version
    commit = $release.commit
  }
  if (-not (Test-Path -LiteralPath $release.installer_path)) {
    throw "Installer does not exist: $($release.installer_path)"
  }

  $actualHash = (Get-Sha256WithHeartbeat -Path $release.installer_path -Stage "installer_source_hash").ToLowerInvariant()
  if (-not [string]::IsNullOrWhiteSpace($release.sha256) -and $actualHash -ne $release.sha256.ToLowerInvariant()) {
    throw "Installer SHA256 mismatch. expected=$($release.sha256) actual=$actualHash"
  }

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "installer_stop_processes_start"
  $stopped = Stop-MixLabCutterProcesses
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "installer_stop_processes_done" -Details @{ count = $stopped.Count }
  $silentArgs = $release.silent_args
  if ($Payload -and $Payload.PSObject.Properties.Name -contains "silent_args" -and -not [string]::IsNullOrWhiteSpace([string]$Payload.silent_args)) {
    $silentArgs = [string]$Payload.silent_args
  }

  $installerTimeoutSeconds = 600
  if ($Payload -and $Payload.PSObject.Properties.Name -contains "installer_timeout_seconds") {
    $requestedTimeout = [int]$Payload.installer_timeout_seconds
    if ($requestedTimeout -gt 0) {
      $installerTimeoutSeconds = $requestedTimeout
    }
  }

  Write-AgentCheckpoint -Stage "installer_copy_to_local_cache" -Details @{
    source = $release.installer_path
  }
  $localInstallerPath = Copy-InstallerToLocalCache -Release $release
  $localHash = (Get-Sha256WithHeartbeat -Path $localInstallerPath -Stage "installer_local_hash").ToLowerInvariant()
  if (-not [string]::IsNullOrWhiteSpace($release.sha256) -and $localHash -ne $release.sha256.ToLowerInvariant()) {
    throw "Local installer SHA256 mismatch. expected=$($release.sha256) actual=$localHash"
  }

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "installer_start" -Details @{
    source_path = $release.installer_path
    local_path = $localInstallerPath
    silent_args = $silentArgs
    timeout_seconds = $installerTimeoutSeconds
  }
  $process = Start-Process -FilePath $localInstallerPath -ArgumentList $silentArgs -PassThru
  $exitCode = Wait-ProcessWithHeartbeat -Process $process -TimeoutSeconds $installerTimeoutSeconds -Stage "installer_wait"
  return @{
    release = $release
    stopped_processes = $stopped
    installer_exit_code = $exitCode
    installer_sha256 = $actualHash
    installer_local_sha256 = $localHash
    installer_source_path = $release.installer_path
    installer_run_path = $localInstallerPath
  }
}

function Copy-IfExists {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (Test-Path -LiteralPath $Source) {
    Ensure-Directory -Path (Split-Path -Parent $Destination)
    Copy-Item -LiteralPath $Source -Destination $Destination -Force -Recurse
    return $true
  }
  return $false
}

function Copy-Diagnostics {
  param([string]$RunDir)
  $diagnosticsDir = Join-Path $RunDir "diagnostics"
  Ensure-Directory -Path $diagnosticsDir
  $copied = @()

  $defaultLogDir = Join-Path $env:APPDATA "MixLab Cutter\logs"
  if (Copy-IfExists -Source $defaultLogDir -Destination (Join-Path $diagnosticsDir "mixlab-cutter-logs")) {
    $copied += $defaultLogDir
  }

  $configCandidates = @(
    (Join-Path $env:APPDATA "com.mixlab.cutter\cutter-desktop-config.json"),
    (Join-Path $env:APPDATA "MixLab Cutter\cutter-desktop-config.json")
  )
  foreach ($candidate in $configCandidates) {
    if (Copy-IfExists -Source $candidate -Destination (Join-Path $diagnosticsDir ("config-" + (Split-Path -Leaf $candidate)))) {
      $copied += $candidate
    }
  }

  return @{ diagnostics_dir = $diagnosticsDir; copied = $copied }
}

function Capture-Screenshot {
  param([string]$RunDir)
  $path = Join-Path $RunDir "screenshot.png"
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    return @{ ok = $true; path = $path; width = $bounds.Width; height = $bounds.Height }
  } catch {
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

function Invoke-SmokeTest {
  param(
    [object]$Payload,
    [string]$RunDir
  )
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_start"
  $launch = $null
  Write-AgentCheckpoint -Stage "smoke_initial_health"
  if (-not (Wait-MixLabApiHealth -TimeoutSeconds 2).ready) {
    Write-AgentHeartbeat | Out-Null
    Write-AgentCheckpoint -Stage "smoke_launch_app"
    $launch = Start-MixLabCutter -Payload $Payload
  }

  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_wait_health"
  $health = Wait-MixLabApiHealth -TimeoutSeconds $HealthTimeoutSeconds
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_collect_auth"
  $authMode = if ($health.ready) { Invoke-MixLabApiGet -Path "/cutter/auth/mode" } else { @{ ok = $false; error = "api health was not ready" } }
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_collect_runtime"
  $runtimeStatus = if ($health.ready) { Invoke-MixLabApiGet -Path "/cutter/runtime-status" } else { @{ ok = $false; error = "api health was not ready" } }
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_collect_source_library"
  $sourceLibrary = if ($health.ready) { Invoke-MixLabApiGet -Path "/cutter/source-library?limit=20" } else { @{ ok = $false; error = "api health was not ready" } }
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_capture_screenshot"
  $screenshot = Capture-Screenshot -RunDir $RunDir
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_copy_diagnostics"
  $diagnostics = Copy-Diagnostics -RunDir $RunDir
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "smoke_done"

  return @{
    launch = $launch
    health = $health
    auth_mode = $authMode
    runtime_status = $runtimeStatus
    source_library = $sourceLibrary
    screenshot = $screenshot
    diagnostics = $diagnostics
  }
}

function Quote-PowerShellArgument {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''") + "'"
}

function Restart-AgentProcess {
  if ($env:MIXLAB_AGENT_WATCHDOG -eq "1") {
    $script:ExitAfterCurrentPoll = $true
    return @{
      message = "agent restart requested; watchdog will relaunch the shared script"
      next_agent_version = $AgentVersion
      watchdog_managed = $true
    }
  }

  $scriptPath = $PSCommandPath
  if ([string]::IsNullOrWhiteSpace($scriptPath)) {
    $scriptPath = $MyInvocation.MyCommand.Path
  }
  if ([string]::IsNullOrWhiteSpace($scriptPath) -or -not (Test-Path -LiteralPath $scriptPath)) {
    throw "Cannot restart agent because current script path is unavailable."
  }

  $scriptArgs = @(
    "-ShareRoot", (Quote-PowerShellArgument -Value $ShareRoot),
    "-PollSeconds", [string]$PollSeconds,
    "-HealthTimeoutSeconds", [string]$HealthTimeoutSeconds
  )
  if (-not [string]::IsNullOrWhiteSpace($CommandFile)) {
    $scriptArgs += @("-CommandFile", (Quote-PowerShellArgument -Value $CommandFile))
  }
  if (-not [string]::IsNullOrWhiteSpace($AppExePath)) {
    $scriptArgs += @("-AppExePath", (Quote-PowerShellArgument -Value $AppExePath))
  }

  $launcher = @"
Start-Sleep -Seconds 2
& $(Quote-PowerShellArgument -Value $scriptPath) $($scriptArgs -join " ")
"@
  $encodedLauncher = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launcher))
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedLauncher)
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $args -WindowStyle Minimized -PassThru
  $script:ExitAfterCurrentPoll = $true
  return @{
    message = "agent restart requested"
    next_agent_version = $AgentVersion
    script_path = $scriptPath
    delay_seconds = 2
    pid = $process.Id
  }
}

function Restart-WatchdogProcess {
  $watchdogPath = Join-SharePath -Parts @("windows-shared-agent-watchdog.ps1")
  if (-not (Test-Path -LiteralPath $watchdogPath)) {
    throw "Cannot restart watchdog because script is missing: $watchdogPath"
  }

  $parentProcessId = $null
  if ($env:MIXLAB_AGENT_WATCHDOG -eq "1") {
    try {
      $selfProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction Stop
      if ($selfProcess -and $selfProcess.ParentProcessId) {
        $parentProcessId = [int]$selfProcess.ParentProcessId
      }
    } catch {
      Write-AgentEvent -Event "watchdog_parent_lookup_failed" -Details @{ error = $_.Exception.Message }
    }
  }

  $watchdogArgs = @(
    "-ShareRoot", (Quote-PowerShellArgument -Value $ShareRoot),
    "-PollSeconds", [string]$PollSeconds,
    "-HealthTimeoutSeconds", [string]$HealthTimeoutSeconds
  )
  if (-not [string]::IsNullOrWhiteSpace($CommandFile)) {
    $watchdogArgs += @("-CommandFile", (Quote-PowerShellArgument -Value $CommandFile))
  }
  if (-not [string]::IsNullOrWhiteSpace($AppExePath)) {
    $watchdogArgs += @("-AppExePath", (Quote-PowerShellArgument -Value $AppExePath))
  }

  $stopParent = ""
  if ($parentProcessId -ne $null) {
    $stopParent = @"
try {
  Stop-Process -Id $parentProcessId -Force -ErrorAction SilentlyContinue
} catch {}
Start-Sleep -Seconds 1
"@
  }

  $launcher = @"
Start-Sleep -Seconds 2
$stopParent
& $(Quote-PowerShellArgument -Value $watchdogPath) $($watchdogArgs -join " ")
"@
  $encodedLauncher = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launcher))
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedLauncher)
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $args -WindowStyle Minimized -PassThru
  $script:ExitAfterCurrentPoll = $true
  return @{
    message = "watchdog restart requested"
    next_agent_version = $AgentVersion
    watchdog_script = $watchdogPath
    previous_watchdog_pid = $parentProcessId
    delay_seconds = 2
    pid = $process.Id
  }
}

function Invoke-AgentCommand {
  param(
    [string]$Action,
    [object]$Payload,
    [string]$RunDir
  )

  switch ($Action) {
    "ping" {
      return @{ message = "pong"; agent_version = $AgentVersion; share_root = $ShareRoot }
    }
    "collect_logs" {
      return Copy-Diagnostics -RunDir $RunDir
    }
    "probe_api" {
      return Invoke-ApiProbe -Payload $Payload
    }
    "start_test_runner" {
      return Start-WindowsTestRunner -Payload $Payload
    }
    "capture_screenshot" {
      return Capture-Screenshot -RunDir $RunDir
    }
    "stop_app" {
      return @{ stopped_processes = Stop-MixLabCutterProcesses }
    }
    "launch_app" {
      $launch = Start-MixLabCutter -Payload $Payload
      $health = Wait-MixLabApiHealth -TimeoutSeconds $HealthTimeoutSeconds
      return @{ launch = $launch; health = $health }
    }
    "install_latest" {
      return Install-LatestRelease -Payload $Payload
    }
    "install_latest_and_smoke" {
      $install = Install-LatestRelease -Payload $Payload
      $smoke = Invoke-SmokeTest -Payload $Payload -RunDir $RunDir
      return @{ install = $install; smoke = $smoke }
    }
    "smoke_test" {
      return Invoke-SmokeTest -Payload $Payload -RunDir $RunDir
    }
    "restart_agent" {
      return Restart-AgentProcess
    }
    "restart_watchdog" {
      return Restart-WatchdogProcess
    }
    default {
      throw "Unsupported action '$Action'. Allowed actions: ping, collect_logs, probe_api, start_test_runner, capture_screenshot, stop_app, launch_app, install_latest, install_latest_and_smoke, smoke_test, restart_agent, restart_watchdog."
    }
  }
}

function Invoke-OnePoll {
  Write-AgentCheckpoint -Stage "poll_entered"
  Write-AgentHeartbeat | Out-Null
  Write-AgentCheckpoint -Stage "poll_heartbeat_written"
  Write-AgentCheckpoint -Stage "poll_command_snapshot_start"
  $commandSnapshot = Get-CommandFileSnapshot
  Write-AgentCheckpoint -Stage "poll_command_snapshot_done" -Details $commandSnapshot
  Write-AgentCheckpoint -Stage "poll_command_read_start" -Details $commandSnapshot
  $command = Read-AgentCommand
  if (-not $command) {
    Write-AgentCheckpoint -Stage "poll_no_command" -Details $commandSnapshot
    Write-AgentStatus -Status "idle" -Details $commandSnapshot
    return
  }

  $commandId = Resolve-CommandId -Command $command
  Write-AgentCheckpoint -Stage "poll_command_read" -Details @{
    command_id = $commandId
    snapshot = $commandSnapshot
  }
  if (Test-CommandAlreadyHandled -CommandId $commandId) {
    $commandSnapshot.last_command_id = $commandId
    $commandSnapshot.skipped = "already handled"
    Write-AgentCheckpoint -Stage "poll_command_skipped" -Details $commandSnapshot
    Write-AgentStatus -Status "idle" -Details $commandSnapshot
    return
  }

  $action = Resolve-CommandAction -Command $command
  $payload = Get-CommandPayload -Command $command
  $runDir = Get-RunDirectory -CommandId $commandId
  $resultPath = Join-Path $runDir "result.json"
  $startedAt = Get-NowIso
  Write-AgentStatus -Status "running" -Details @{ command_id = $commandId; action = $action; run_dir = $runDir }
  Write-AgentEvent -Event "command_started" -Details @{ command_id = $commandId; action = $action; run_dir = $runDir }

  try {
    $output = Invoke-AgentCommand -Action $action -Payload $payload -RunDir $runDir
    $result = @{
      schema_version = "1.0"
      command_id = $commandId
      action = $action
      status = "passed"
      started_at = $startedAt
      finished_at = Get-NowIso
      run_dir = $runDir
      output = $output
    }
    Write-JsonFile -Path $resultPath -Value $result
    Write-CommandHandled -CommandId $commandId -Status "passed" -ResultPath $resultPath
    Write-AgentStatus -Status "idle" -Details @{ last_command_id = $commandId; last_result_path = $resultPath }
    Write-AgentEvent -Event "command_passed" -Details @{ command_id = $commandId; action = $action; result_path = $resultPath }
  } catch {
    $result = @{
      schema_version = "1.0"
      command_id = $commandId
      action = $action
      status = "failed"
      started_at = $startedAt
      finished_at = Get-NowIso
      run_dir = $runDir
      error = $_.Exception.Message
      output = Copy-Diagnostics -RunDir $runDir
    }
    Write-JsonFile -Path $resultPath -Value $result
    Write-CommandHandled -CommandId $commandId -Status "failed" -ResultPath $resultPath
    Write-AgentStatus -Status "failed" -Details @{ last_command_id = $commandId; last_result_path = $resultPath; error = $_.Exception.Message }
    Write-AgentEvent -Event "command_failed" -Details @{ command_id = $commandId; action = $action; result_path = $resultPath; error = $_.Exception.Message }
  }
}

Ensure-Directory -Path (Join-SharePath -Parts @("control"))
Ensure-Directory -Path (Join-SharePath -Parts @("control", "commands"))
Ensure-Directory -Path (Join-SharePath -Parts @("results", "runs"))
Ensure-Directory -Path (Join-SharePath -Parts @("logs", "agent"))
Write-Host "MixLab Windows shared test agent v$AgentVersion"
Write-Host "Share root: $ShareRoot"
Write-Host "Command file: $(Get-CommandPath)"
Write-Host "API base URL: $ApiBaseUrl"
Write-Host "Press Ctrl+C to stop."
Write-Host ""
Write-Host "Writing startup heartbeat..."
$heartbeatOk = Write-AgentHeartbeat
Write-Host "Startup heartbeat: $heartbeatOk"
try {
  $startupSnapshot = @{
    command_file = Get-CommandPath
    once = $RunOnce
  }
  Write-AgentStatus -Status "idle" -Details $startupSnapshot
  Write-Host "Startup status: written"
} catch {
  Write-Host "Startup status failed: $($_.Exception.Message)"
  throw
}
Write-AgentEvent -Event "agent_started" -Details @{ share_root = $ShareRoot; command_file = Get-CommandPath; once = $RunOnce }
Write-Host "Startup event: written"
Write-Host ""

Write-AgentCheckpoint -Stage "before_loop" -Details @{ once = $RunOnce; poll_seconds = $PollSeconds }
$keepRunning = $true
while ($keepRunning) {
  Write-AgentCheckpoint -Stage "loop_iteration_start" -Details @{ once = $RunOnce; exit_after_current_poll = [bool]$script:ExitAfterCurrentPoll }
  try {
    Invoke-OnePoll
    Write-AgentCheckpoint -Stage "loop_after_poll" -Details @{ once = $RunOnce; exit_after_current_poll = [bool]$script:ExitAfterCurrentPoll }
  } catch {
    Write-Host "Agent loop error: $($_.Exception.Message)"
    Write-AgentLoopError -ErrorRecord $_
  }

  if ($RunOnce) {
    Write-AgentCheckpoint -Stage "loop_exit_once"
    $keepRunning = $false
  } elseif ($script:ExitAfterCurrentPoll) {
    Write-AgentEvent -Event "agent_restart_exit" -Details @{ agent_version = $AgentVersion }
    Write-AgentCheckpoint -Stage "loop_exit_restart"
    $keepRunning = $false
  } else {
    Write-AgentCheckpoint -Stage "loop_sleep" -Details @{ poll_seconds = $PollSeconds }
    Start-Sleep -Seconds $PollSeconds
  }
}
