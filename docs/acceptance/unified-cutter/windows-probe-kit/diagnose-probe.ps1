$ErrorActionPreference='Stop'
$ReportRoot=Split-Path -Parent $MyInvocation.MyCommand.Path
$Tokens=$null; $ParseErrors=$null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $ReportRoot 'install-and-probe.ps1'),[ref]$Tokens,[ref]$ParseErrors) | Out-Null
$state=Join-Path $env:LOCALAPPDATA 'com.mixlab.unifiedcutter.candidate'
$log=Join-Path $state 'engine.log'
$data=[ordered]@{
  collected_at=(Get-Date).ToUniversalTime().ToString('o')
  parse_errors=@($ParseErrors | ForEach-Object { @{ message=$_.Message; line=$_.Extent.StartLineNumber } })
  probe_process_alive=[bool](Get-Process -Id 74100 -ErrorAction SilentlyContinue)
  candidate_installed=Test-Path (Join-Path $env:LOCALAPPDATA 'MixLabUnifiedCandidate-acecfd4')
  candidate_state_exists=Test-Path $state
  engine_log=if(Test-Path $log){@(Get-Content $log -Tail 15)}else{@()}
}
[IO.File]::WriteAllText((Join-Path $ReportRoot 'native-diagnostic.json'),($data|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
