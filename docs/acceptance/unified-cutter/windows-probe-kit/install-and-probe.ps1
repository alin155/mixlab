$ErrorActionPreference = 'Stop'
$ReportRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReportFile = Join-Path $ReportRoot 'native-startup.json'
$Commit = 'acecfd4'
$CandidateRoot = Join-Path $env:LOCALAPPDATA ('MixLabUnifiedCandidate-' + $Commit)
$data = [ordered]@{ scope = 'isolated native installation, engine readiness and coexistence; no public-library or provider calls'; source_commit = $Commit; started_at = (Get-Date).ToUniversalTime().ToString('o'); status = 'running' }
function Read-Health([string]$url) {
  try { return Invoke-RestMethod -Uri $url -TimeoutSec 3 } catch { return $null }
}
try {
  $old = Read-Health 'http://127.0.0.1:3789/health'
  $data['old_cutter_before'] = [bool]$old
  $meta = Get-Content -Raw (Join-Path $ReportRoot 'installer.json') | ConvertFrom-Json
  $source = Join-Path $ReportRoot $meta.file
  $digest = (Get-FileHash -Algorithm SHA256 $source).Hash.ToLowerInvariant()
  if ($digest -ne $meta.sha256) { throw 'Installer hash does not match candidate metadata.' }
  $data['installer_sha256'] = $digest
  $data['candidate_version'] = $meta.version
  $localInstaller = Join-Path $env:TEMP ('MixLabUnifiedCandidate-' + $Commit + '-setup.exe')
  Copy-Item -LiteralPath $source -Destination $localInstaller -Force
  if ((Get-FileHash -Algorithm SHA256 $localInstaller).Hash.ToLowerInvariant() -ne $digest) { throw 'Local installer copy failed hash validation.' }
  $installed = Start-Process -FilePath $localInstaller -ArgumentList @('/S', ('/D=' + $CandidateRoot)) -PassThru -Wait
  $data['install_exit_code'] = $installed.ExitCode
  if ($installed.ExitCode -ne 0) { throw 'Candidate installer failed.' }
  $app = Get-ChildItem -LiteralPath $CandidateRoot -Filter '*.exe' -File | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1
  if (-not $app) { throw 'Candidate executable was not installed.' }
  $data['install_root'] = $CandidateRoot
  $process = Start-Process -FilePath $app.FullName -PassThru
  $data['app_pid'] = $process.Id
  $data['app_path'] = $app.FullName
  $state = Join-Path $env:LOCALAPPDATA 'com.mixlab.unifiedcutter.candidate'
  $data['state_root'] = $state
  $deadline = (Get-Date).AddSeconds(45)
  $health = $null
  while ((Get-Date) -lt $deadline) {
    $log = Join-Path $state 'engine.log'
    if (Test-Path -LiteralPath $log) {
      $started = Get-Content -LiteralPath $log -Tail 30 | Where-Object { $_ -match '"event":"smart_cutter_started"' } | Select-Object -Last 1
      if ($started) {
        $connection = $started | ConvertFrom-Json
        $health = Read-Health ($connection.url + '/health')
        if ($health) { $data['engine_url'] = $connection.url; break }
      }
    }
    Start-Sleep -Milliseconds 300
  }
  if (-not $health) { throw 'Packaged candidate engine did not become healthy.' }
  $data['health'] = $health
  if (-not $health.runtime.ai_ready -or -not $health.runtime.ffmpeg_ready) { throw 'Packaged AI or FFmpeg runtime is unavailable.' }
  $data['isolated_workspace'] = Test-Path -LiteralPath (Join-Path $state 'workspace/.mixlab-smart-cutter.json')
  if (-not $data.isolated_workspace) { throw 'Candidate did not create an isolated local workspace.' }
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $listener.Start(); $probePort = $listener.LocalEndpoint.Port; $listener.Stop()
  $probeState = Join-Path $state 'shutdown-smoke'
  [IO.Directory]::CreateDirectory($probeState) | Out-Null
  $env:MIXLAB_SMART_STATE_ROOT = $probeState
  $env:MIXLAB_SMART_WORKSPACE_ROOT = Join-Path $probeState 'workspace'
  $env:MIXLAB_SMART_PORT = [string]$probePort
  $env:MIXLAB_SMART_API_TOKEN = [Guid]::NewGuid().ToString()
  $env:MIXLAB_SMART_AUTH_MODE = 'reviewed'
  $env:MIXLAB_SMART_AI_ROOT = Join-Path $CandidateRoot 'runtime'
  $env:MIXLAB_SMART_AI_SCRIPT = Join-Path $CandidateRoot 'runtime/ai-worker.py'
  $env:MIXLAB_SMART_PYTHON = Join-Path $CandidateRoot 'runtime/python/python.exe'
  $env:MIXLAB_SMART_FONTS = Join-Path $CandidateRoot 'runtime/fonts'
  $env:MIXLAB_FFMPEG_PATH = Join-Path $CandidateRoot 'binaries/ffmpeg.exe'
  $env:MIXLAB_FFPROBE_PATH = Join-Path $CandidateRoot 'binaries/ffprobe.exe'
  $probe = Start-Process -FilePath (Join-Path $CandidateRoot 'binaries/node.exe') -ArgumentList @(('"' + (Join-Path $CandidateRoot 'binaries/smart-cutter-api.bundle.mjs') + '"')) -RedirectStandardOutput (Join-Path $probeState 'stdout.log') -RedirectStandardError (Join-Path $probeState 'stderr.log') -PassThru
  try {
    $probeUrl = 'http://127.0.0.1:' + $probePort
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline -and -not (Read-Health ($probeUrl + '/health'))) { Start-Sleep -Milliseconds 200 }
    $headers = @{ 'X-Smart-Token' = $env:MIXLAB_SMART_API_TOKEN }
    $guest = Invoke-RestMethod -Uri ($probeUrl + '/smart/state') -Headers $headers -TimeoutSec 3
    $data['login_required_on_fresh_state'] = $guest.auth.required
    if (-not $guest.auth.required) { throw 'Fresh reviewed candidate did not require login.' }
    $stopped = Invoke-RestMethod -Uri ($probeUrl + '/smart/runtime/shutdown') -Method Post -Headers $headers -TimeoutSec 3
    $data['authenticated_shutdown'] = $stopped.stopping -and $probe.WaitForExit(12000)
    if (-not $data.authenticated_shutdown) { throw 'Packaged engine did not stop after authenticated shutdown.' }
  } finally { if (-not $probe.HasExited) { Stop-Process -Id $probe.Id -ErrorAction SilentlyContinue } }
  $data['old_cutter_after'] = [bool](Read-Health 'http://127.0.0.1:3789/health')
  if ($data.old_cutter_before -and -not $data.old_cutter_after) { throw 'Previously healthy legacy Cutter is no longer healthy.' }
  $data['window_title'] = (Get-Process -Id $process.Id).MainWindowTitle
  $data['status'] = 'passed'
} catch {
  $data['status'] = 'failed'
  $data['error'] = $_.Exception.Message
}
$data['finished_at'] = (Get-Date).ToUniversalTime().ToString('o')
[IO.File]::WriteAllText($ReportFile, ($data | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
