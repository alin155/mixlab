$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw '未找到 .NET Framework csc.exe' }
$dist = Join-Path $root 'dist'
Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$output = Join-Path $dist 'MixLabCutterRepairTool.exe'
& $csc /nologo /target:winexe /codepage:65001 /optimize+ /out:"$output" /reference:System.dll /reference:System.Core.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $root 'RepairTool.cs')
if ($LASTEXITCODE -ne 0) { throw '编译失败' }
Copy-Item (Join-Path $root 'README.txt') $dist -Force
Get-ChildItem $dist | Select-Object Name,Length | Format-Table -AutoSize
Get-FileHash $output -Algorithm SHA256 | Format-List
