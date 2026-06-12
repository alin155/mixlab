#requires -Version 5.1
param(
  [string]$KitDir = "."
)

$ErrorActionPreference = "Stop"

function Add-Issue([System.Collections.Generic.List[string]]$Issues, [string]$Message) {
  [void]$Issues.Add($Message)
}

function Test-PortableRelativePath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $false
  }
  if ([System.IO.Path]::IsPathRooted($Value) -or $Value.Contains("\") -or $Value.Contains("..")) {
    return $false
  }
  foreach ($part in $Value.Split("/")) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -eq "." -or $part -eq "..") {
      return $false
    }
  }
  return $true
}

function Convert-ToPortablePath([string]$Path) {
  return ($Path -replace "\\", "/")
}

function Get-RelativePortablePath([string]$Root, [string]$FilePath) {
  $trimChars = @([char][System.IO.Path]::DirectorySeparatorChar, [char][System.IO.Path]::AltDirectorySeparatorChar)
  $rootPath = (Get-Item -LiteralPath $Root).FullName.TrimEnd($trimChars)
  $rootUri = [System.Uri]::new($rootPath + [System.IO.Path]::DirectorySeparatorChar)
  $fileUri = [System.Uri]::new((Get-Item -LiteralPath $FilePath).FullName)
  return Convert-ToPortablePath ([System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString()))
}

if (-not (Test-Path -LiteralPath $KitDir)) {
  Write-Error "Evidence kit directory is missing: $KitDir"
}

$resolvedKitDir = (Resolve-Path -LiteralPath $KitDir).Path
$manifestPath = Join-Path $resolvedKitDir "MANIFEST.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Write-Error "MANIFEST.json is missing from $resolvedKitDir"
}

$issues = [System.Collections.Generic.List[string]]::new()
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

if ($manifest.schema_version -ne 1) {
  Add-Issue $issues "MANIFEST.json schema_version must be 1"
}
if ($manifest.artifact_name -ne "mixlab-target-evidence-kit") {
  Add-Issue $issues "MANIFEST.json artifact_name must be mixlab-target-evidence-kit"
}
if ($manifest.generated_by -ne "npm run package:evidence-kit") {
  Add-Issue $issues "MANIFEST.json generated_by must be npm run package:evidence-kit"
}
if ($null -eq $manifest.files) {
  Add-Issue $issues "MANIFEST.json files must be present"
}

$listedPaths = [System.Collections.Generic.HashSet[string]]::new()
foreach ($file in @($manifest.files)) {
  $pathValue = [string]$file.path
  if (-not (Test-PortableRelativePath $pathValue)) {
    Add-Issue $issues "manifest path is not portable: $pathValue"
    continue
  }
  if ($pathValue -eq "MANIFEST.json") {
    Add-Issue $issues "MANIFEST.json must not list itself"
  }
  if (-not $listedPaths.Add($pathValue)) {
    Add-Issue $issues "MANIFEST.json contains duplicate file path: $pathValue"
  }
  if (-not ([string]$file.sha256 -match "^[a-f0-9]{64}$")) {
    Add-Issue $issues "$pathValue sha256 must be a lowercase 64-character digest"
  }
  if (-not ($file.size_bytes -is [int] -or $file.size_bytes -is [long]) -or [long]$file.size_bytes -lt 0) {
    Add-Issue $issues "$pathValue size_bytes must be a non-negative integer"
  }
  if (-not ($file.executable -is [bool])) {
    Add-Issue $issues "$pathValue executable must be a boolean"
  }

  $filePath = Join-Path $resolvedKitDir ($pathValue -replace "/", [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    Add-Issue $issues "$pathValue is listed in MANIFEST.json but missing from the evidence kit"
    continue
  }

  $item = Get-Item -LiteralPath $filePath
  if ([long]$file.size_bytes -ne [long]$item.Length) {
    Add-Issue $issues "$pathValue size_bytes does not match the packaged file"
  }
  if ([string]$file.sha256 -match "^[a-f0-9]{64}$") {
    $actualHash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne [string]$file.sha256) {
      Add-Issue $issues "$pathValue sha256 does not match the packaged file"
    }
  }
}

$actualFiles = Get-ChildItem -LiteralPath $resolvedKitDir -Recurse -File | ForEach-Object {
  Get-RelativePortablePath $resolvedKitDir $_.FullName
}
foreach ($actualFile in $actualFiles) {
  if ($actualFile -ne "MANIFEST.json" -and -not $listedPaths.Contains($actualFile)) {
    Add-Issue $issues "$actualFile exists in the evidence kit but is not listed in MANIFEST.json"
  }
}

if ($issues.Count -gt 0) {
  Write-Host "MixLab evidence kit manifest self-check found $($issues.Count) issue(s):"
  $issues | Select-Object -First 80 | ForEach-Object { Write-Host "- $_" }
  if ($issues.Count -gt 80) {
    Write-Host "- ... $($issues.Count - 80) more"
  }
  exit 1
}

Write-Host "MixLab evidence kit manifest self-check passed for $resolvedKitDir."
