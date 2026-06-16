<#
.SYNOPSIS
  Stable watchdog for the MixLab Windows shared-folder test agent.

.DESCRIPTION
  This wrapper is intentionally small and changes rarely. It keeps the real
  test agent running, restarts it after crashes or restart requests, and writes
  watchdog status back to the shared folder.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ShareRoot,

  [int]$PollSeconds = 5,

  [int]$HealthTimeoutSeconds = 45,

  [string]$CommandFile = "",

  [string]$AppExePath = "",

  [int]$RestartDelaySeconds = 2,

  [int]$WatchIntervalSeconds = 2,

  [int]$StaleHeartbeatSeconds = 90,

  [switch]$StopExistingProcesses
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$WatchdogVersion = "0.1.7"

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

function Write-WatchdogStatus {
  param(
    [string]$Status,
    [object]$Details = @{}
  )
  Write-JsonFile -Path (Join-SharePath -Parts @("agent-watchdog-status.json")) -Value @{
    schema_version = "1.0"
    agent = "mixlab-cutter-windows-shared-agent-watchdog"
    watchdog_version = $WatchdogVersion
    status = $Status
    updated_at = Get-NowIso
    share_root = $ShareRoot
    machine = $env:COMPUTERNAME
    user = $env:USERNAME
    details = $Details
  }
}

function Write-WatchdogEvent {
  param(
    [string]$Event,
    [object]$Details = @{}
  )
  $logDir = Join-SharePath -Parts @("logs", "agent")
  Ensure-Directory -Path $logDir
  $line = ConvertTo-JsonText -Value @{
    at = Get-NowIso
    watchdog_version = $WatchdogVersion
    event = $Event
    details = $Details
  }
  Add-Content -LiteralPath (Join-Path $logDir "windows-shared-agent-watchdog.ndjson") -Value $line -Encoding UTF8
}

function Get-AgentScriptPath {
  return Join-SharePath -Parts @("windows-shared-test-agent.ps1")
}

function Get-FileStamp {
  param([string]$Path)
  $stamp = @{
    path = $Path
    exists = $false
    length = $null
    last_write_time_utc = ""
    token = ""
  }

  try {
    if (-not [System.IO.File]::Exists($Path)) {
      return $stamp
    }

    $info = Get-Item -LiteralPath $Path -ErrorAction Stop
    $stamp.exists = $true
    $stamp.length = [int64]$info.Length
    $stamp.last_write_time_utc = $info.LastWriteTimeUtc.ToString("o")
    $stamp.token = "$($stamp.length):$($stamp.last_write_time_utc)"
  } catch {
    $stamp.error = $_.Exception.Message
  }

  return $stamp
}

function Build-AgentArguments {
  $agentScript = Get-AgentScriptPath
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $agentScript,
    "-ShareRoot", $ShareRoot,
    "-PollSeconds", [string]$PollSeconds,
    "-HealthTimeoutSeconds", [string]$HealthTimeoutSeconds
  )
  if (-not [string]::IsNullOrWhiteSpace($CommandFile)) {
    $args += @("-CommandFile", $CommandFile)
  }
  if (-not [string]::IsNullOrWhiteSpace($AppExePath)) {
    $args += @("-AppExePath", $AppExePath)
  }
  return $args
}

function Get-AgentHeartbeatSnapshot {
  $path = Join-SharePath -Parts @("agent-heartbeat.json")
  $snapshot = @{
    path = $path
    exists = $false
    age_seconds = $null
    updated_at = ""
  }

  try {
    if (-not [System.IO.File]::Exists($path)) {
      return $snapshot
    }

    $lastWriteUtc = [System.IO.File]::GetLastWriteTimeUtc($path)
    $age = [DateTime]::UtcNow - $lastWriteUtc
    $snapshot.exists = $true
    $snapshot.age_seconds = [int64][Math]::Floor($age.TotalSeconds)
    $snapshot.updated_at = $lastWriteUtc.ToString("o")
  } catch {
    $snapshot.error = $_.Exception.Message
  }

  return $snapshot
}

function Get-AgentLivenessSnapshot {
  $heartbeat = Get-AgentHeartbeatSnapshot
  $checkpointPath = Join-SharePath -Parts @("agent-checkpoint.json")
  $checkpoint = @{
    path = $checkpointPath
    exists = $false
    age_seconds = $null
    updated_at = ""
  }

  try {
    if ([System.IO.File]::Exists($checkpointPath)) {
      $lastWriteUtc = [System.IO.File]::GetLastWriteTimeUtc($checkpointPath)
      $age = [DateTime]::UtcNow - $lastWriteUtc
      $checkpoint.exists = $true
      $checkpoint.age_seconds = [int64][Math]::Floor($age.TotalSeconds)
      $checkpoint.updated_at = $lastWriteUtc.ToString("o")
    }
  } catch {
    $checkpoint.error = $_.Exception.Message
  }

  return @{
    heartbeat = $heartbeat
    checkpoint = $checkpoint
    best_age_seconds = $heartbeat.age_seconds
    has_recent_signal = ($heartbeat.exists -and $heartbeat.age_seconds -ne $null)
    checkpoint_is_diagnostic = $true
  }
}

function Stop-AgentProcess {
  param(
    [object]$Process,
    [string]$Reason,
    [object]$Details = @{}
  )

  if (-not $Process) {
    return
  }

  try {
    $Process.Refresh()
    if ($Process.HasExited) {
      return
    }

    Write-Host "Stopping agent process $($Process.Id): $Reason"
    Write-WatchdogStatus -Status "agent_stopping" -Details @{
      pid = $Process.Id
      reason = $Reason
      details = $Details
    }
    Write-WatchdogEvent -Event "agent_stopping" -Details @{
      pid = $Process.Id
      reason = $Reason
      details = $Details
    }
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  } catch {
    Write-WatchdogEvent -Event "agent_stop_failed" -Details @{
      pid = $Process.Id
      reason = $Reason
      error = $_.Exception.Message
    }
  }
}

function Test-CommandLineHasAgentMarker {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  foreach ($marker in @("windows-shared-test-agent.ps1", "windows-shared-agent-watchdog.ps1")) {
    if ($CommandLine -like "*$marker*") {
      return $true
    }
  }

  return $false
}

function Stop-ExistingSharedAgentProcesses {
  $stopped = @()

  try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -and
      ($_.Name -ieq "powershell.exe" -or $_.Name -ieq "pwsh.exe") -and
      (Test-CommandLineHasAgentMarker -CommandLine $_.CommandLine)
    } | ForEach-Object {
      try {
        $stopped += @{
          pid = $_.ProcessId
          name = $_.Name
          command_line = $_.CommandLine
        }
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      } catch {
        Write-WatchdogEvent -Event "existing_agent_stop_failed" -Details @{
          pid = $_.ProcessId
          error = $_.Exception.Message
        }
      }
    }
  } catch {
    Write-WatchdogEvent -Event "existing_agent_scan_failed" -Details @{ error = $_.Exception.Message }
  }

  if ($stopped.Count -gt 0) {
    Write-Host "Stopped $($stopped.Count) previous shared agent process(es)."
    Write-WatchdogEvent -Event "existing_agent_processes_stopped" -Details @{ processes = $stopped }
  }
}

Ensure-Directory -Path (Join-SharePath -Parts @("logs", "agent"))
Ensure-Directory -Path (Join-SharePath -Parts @("results", "runs"))
Ensure-Directory -Path (Join-SharePath -Parts @("control"))

Write-Host "MixLab Windows shared agent watchdog v$WatchdogVersion"
Write-Host "Share root: $ShareRoot"
Write-Host "Agent script: $(Get-AgentScriptPath)"
Write-Host "Press Ctrl+C to stop watchdog and agent restarts."
Write-Host ""

Write-WatchdogStatus -Status "starting" -Details @{ agent_script = Get-AgentScriptPath }
Write-WatchdogEvent -Event "watchdog_started" -Details @{ share_root = $ShareRoot; agent_script = Get-AgentScriptPath }
if ($PSBoundParameters.ContainsKey("StopExistingProcesses")) {
  Stop-ExistingSharedAgentProcesses
} else {
  Write-WatchdogEvent -Event "existing_agent_process_cleanup_skipped" -Details @{ reason = "default avoids slow WMI process scans on Windows test hosts" }
}

while ($true) {
  $agentScript = Get-AgentScriptPath
  if (-not (Test-Path -LiteralPath $agentScript)) {
    Write-Host "Agent script not found: $agentScript"
    Write-WatchdogStatus -Status "waiting_for_agent_script" -Details @{ agent_script = $agentScript }
    Start-Sleep -Seconds $RestartDelaySeconds
    continue
  }

  $args = Build-AgentArguments
  $startedAgentStamp = Get-FileStamp -Path $agentScript
  Write-Host "Starting agent..."
  Write-WatchdogStatus -Status "agent_starting" -Details @{ agent_script = $agentScript; agent_script_stamp = $startedAgentStamp }
  Write-WatchdogEvent -Event "agent_starting" -Details @{ agent_script = $agentScript; agent_script_stamp = $startedAgentStamp }

  $env:MIXLAB_AGENT_WATCHDOG = "1"
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $args -PassThru
  $env:MIXLAB_AGENT_WATCHDOG = $null

  $startedAt = [DateTime]::UtcNow
  $nextStatusAt = [DateTime]::UtcNow
  Write-Host "Agent started with pid $($process.Id)."
  Write-WatchdogEvent -Event "agent_started" -Details @{ pid = $process.Id; agent_script = $agentScript }

  while ($true) {
    Start-Sleep -Seconds $WatchIntervalSeconds
    $process.Refresh()
    if ($process.HasExited) {
      break
    }

    $liveness = Get-AgentLivenessSnapshot
    $heartbeat = $liveness.heartbeat
    $ageSeconds = $liveness.best_age_seconds
    $runningSeconds = [int64][Math]::Floor(([DateTime]::UtcNow - $startedAt).TotalSeconds)
    $currentAgentStamp = Get-FileStamp -Path $agentScript

    if ($startedAgentStamp.token -ne "" -and $currentAgentStamp.token -ne "" -and $currentAgentStamp.token -ne $startedAgentStamp.token) {
      Stop-AgentProcess -Process $process -Reason "agent_script_changed" -Details @{
        started_agent_script_stamp = $startedAgentStamp
        current_agent_script_stamp = $currentAgentStamp
      }
      break
    }

    if (((-not $liveness.has_recent_signal) -and $runningSeconds -ge $StaleHeartbeatSeconds) -or ($liveness.has_recent_signal -and $ageSeconds -ne $null -and $ageSeconds -ge $StaleHeartbeatSeconds)) {
      Stop-AgentProcess -Process $process -Reason "stale_heartbeat" -Details @{
        liveness = $liveness
        stale_heartbeat_seconds = $StaleHeartbeatSeconds
        running_seconds = $runningSeconds
      }
      break
    }

    if ([DateTime]::UtcNow -ge $nextStatusAt) {
      Write-WatchdogStatus -Status "agent_running" -Details @{
        pid = $process.Id
        running_seconds = $runningSeconds
        liveness = $liveness
        agent_script_stamp = $currentAgentStamp
        watch_interval_seconds = $WatchIntervalSeconds
        stale_heartbeat_seconds = $StaleHeartbeatSeconds
      }
      $nextStatusAt = [DateTime]::UtcNow.AddSeconds(10)
    }
  }

  $process.Refresh()
  $exitCode = if ($process.HasExited) { $process.ExitCode } else { $null }

  Write-Host "Agent exited with code $exitCode. Restarting in $RestartDelaySeconds seconds..."
  Write-WatchdogStatus -Status "agent_exited" -Details @{ exit_code = $exitCode; restart_delay_seconds = $RestartDelaySeconds }
  Write-WatchdogEvent -Event "agent_exited" -Details @{ exit_code = $exitCode; restart_delay_seconds = $RestartDelaySeconds }
  Start-Sleep -Seconds $RestartDelaySeconds
}
