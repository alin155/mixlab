#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$EvidencePath = ".\windows-acc-008.json",
  [ValidateSet("windows-10", "windows-11")]
  [string]$Os = "",
  [string]$RepositoryCommitSha = "",
  [string]$EvidenceKitWorkflowRunUrl = "",
  [string]$InstallerFilePath = "",
  [string]$InstallerFileName = "",
  [string]$InstallerFileSha256 = "",
  [string]$InstallerVersion = "",
  [string]$InstallerWorkflowRunUrl = "",
  [string]$SourceRepoProbePath = "$env:USERPROFILE\Documents\mixlab",
  [string]$EvidenceDir = "",
  [string]$FirstRunDoctorScreenshot = "",
  [string]$EngineStatusScreenshot = "",
  [string]$MaterialLocatorPlaybackScreenshot = "",
  [string]$CompletedCutJobScreenshot = "",
  [string]$LocalLibraryNewClipScreenshot = "",
  [string]$SuccessDiagnosticsPath = "",
  [string]$FailureDiagnosticsPath = "",
  [string[]]$PassedPublicLibraryPath = @(),
  [string[]]$PassedFailureCase = @(),
  [switch]$InstalledFromExe,
  [switch]$LaunchedFromStartMenu,
  [switch]$NoCommandLineRequired,
  [switch]$DoctorPassed,
  [switch]$DefaultWorkspacePathOk,
  [switch]$EngineStatusNormal,
  [switch]$EnteredWorkbench,
  [switch]$AllPublicLibraryPathsPassed,
  [switch]$AllFailureCasesPassed,
  [switch]$RequireCurrentEnvironmentComplete
)

$ErrorActionPreference = "Stop"

$PublicLibraryPaths = @(
  "D:\MixLabPublicLibrary",
  "D:\MixLab Public Library",
  "D:\素材库\MixLab公共素材库",
  "E:\MixLabPublicLibrary",
  "\\NAS\MixLab\PublicLibrary",
  "\\NAS\MixLab Public Library",
  "\\NAS\素材库\MixLab公共素材库"
)

$FailureCases = @(
  "public-library-missing",
  "source-videos-missing",
  "mixlab-library-missing",
  "current-index-missing",
  "no-ready-materials",
  "local-workspace-not-writable",
  "local-workspace-inside-public-library",
  "port-3789-occupied",
  "ffmpeg-missing",
  "ffprobe-missing",
  "nas-path-offline",
  "nas-path-unreadable"
)

$PublicPathChecks = @(
  "first_run_selected",
  "doctor_passed",
  "public_library_not_written",
  "ready_materials_visible",
  "search_works",
  "playback_works",
  "one_cut_completed",
  "project_output_folder_opens",
  "local_library_refreshed"
)

$FirstRunChecks = @(
  "installed_from_exe",
  "launched_from_start_menu",
  "no_command_line_required",
  "doctor_passed",
  "default_workspace_path_ok",
  "engine_status_normal",
  "entered_workbench"
)

$CleanMachineChecks = @(
  "node_absent",
  "npm_absent",
  "git_absent",
  "ffmpeg_absent",
  "ffprobe_absent",
  "source_repo_absent"
)

$ForbiddenDiagnosticPatterns = @(
  "DASHSCOPE_API_KEY",
  "Authorization:\s*Bearer\s+(?!\*\*\*)",
  "sk-[A-Za-z0-9_-]{8,}",
  "signature=",
  "x-oss-signature",
  "full_text",
  "pasted_search_text"
)

$RequiredDiagnosticTerms = @(
  "stage",
  "api",
  "log",
  "public",
  "workspace",
  "ffmpeg",
  "ffprobe",
  "doctor",
  "retry"
)

function Get-TargetOs {
  try {
    $caption = (Get-CimInstance -ClassName Win32_OperatingSystem).Caption
    if ($caption -match "Windows 11") {
      return "windows-11"
    }
  } catch {
    # Fall through to Windows 10. ACC-008 supports only Windows 10 and 11.
  }

  return "windows-10"
}

function Test-CommandAbsent([string]$Name) {
  return $null -eq (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-PropertyValue($Object, [string]$Name, $DefaultValue) {
  if ($null -ne $Object) {
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) {
      return $property.Value
    }
  }

  return $DefaultValue
}

function Get-ExistingItemByKey($Items, [string]$Key, [string]$Value) {
  if ($null -eq $Items) {
    return $null
  }

  foreach ($item in @($Items)) {
    if ((Get-PropertyValue $item $Key "") -eq $Value) {
      return $item
    }
  }

  return $null
}

function Assert-TextEvidenceSafe([string]$Text, [string]$SourceLabel) {
  foreach ($pattern in $ForbiddenDiagnosticPatterns) {
    if ($Text -match $pattern) {
      throw "Text evidence contains forbidden secret/private data: $SourceLabel"
    }
  }
}

function Assert-DiagnosticEvidenceUseful([string]$Text, [string]$SourceLabel) {
  if ($Text -eq "") {
    return
  }

  $normalized = $Text.ToLowerInvariant()
  $missingTerms = @()
  foreach ($term in $RequiredDiagnosticTerms) {
    if (-not $normalized.Contains($term)) {
      $missingTerms += $term
    }
  }

  if ($missingTerms.Count -gt 0) {
    throw "Diagnostic evidence must include required terms ($($missingTerms -join ', ')): $SourceLabel"
  }
}

function Read-TextOrExisting([string]$Path, $ExistingValue) {
  $sourceLabel = "diagnostics text"
  $text = ""

  if ($Path -ne "") {
    $sourceLabel = $Path
    $text = Get-Content -Raw -Encoding UTF8 -Path $Path
    if ($text.Trim() -eq "") {
      throw "Diagnostic evidence file must not be empty: $Path"
    }
  } elseif ($null -ne $ExistingValue) {
    $sourceLabel = "existing diagnostics text"
    $text = [string]$ExistingValue
  }

  if ($text -ne "") {
    Assert-TextEvidenceSafe $text $sourceLabel
    Assert-DiagnosticEvidenceUseful $text $sourceLabel
  }

  return $text
}

function Read-FilePrefixBytes([string]$Path, [int]$Count) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $buffer = New-Object byte[] $Count
    $read = $stream.Read($buffer, 0, $Count)
    if ($read -le 0) {
      return [byte[]]@()
    }

    if ($read -eq $Count) {
      return [byte[]]$buffer
    }

    $shortBuffer = New-Object byte[] $read
    [System.Array]::Copy($buffer, $shortBuffer, $read)
    return [byte[]]$shortBuffer
  } finally {
    $stream.Dispose()
  }
}

function Test-BytePrefix([byte[]]$Bytes, [byte[]]$Expected) {
  if ($Bytes.Length -lt $Expected.Length) {
    return $false
  }

  for ($index = 0; $index -lt $Expected.Length; $index += 1) {
    if ($Bytes[$index] -ne $Expected[$index]) {
      return $false
    }
  }

  return $true
}

$MinScreenshotWidth = 640
$MinScreenshotHeight = 360

function Read-UInt16BigEndian([byte[]]$Bytes, [int]$Offset) {
  return (([int]$Bytes[$Offset]) -shl 8) -bor ([int]$Bytes[$Offset + 1])
}

function Read-UInt32BigEndian([byte[]]$Bytes, [int]$Offset) {
  $value = (([int]$Bytes[$Offset]) -shl 24) -bor (([int]$Bytes[$Offset + 1]) -shl 16) -bor (([int]$Bytes[$Offset + 2]) -shl 8) -bor ([int]$Bytes[$Offset + 3])
  return $value
}

function Read-UInt16LittleEndian([byte[]]$Bytes, [int]$Offset) {
  return ([int]$Bytes[$Offset]) -bor (([int]$Bytes[$Offset + 1]) -shl 8)
}

function Read-UInt24LittleEndian([byte[]]$Bytes, [int]$Offset) {
  $value = ([int]$Bytes[$Offset]) -bor (([int]$Bytes[$Offset + 1]) -shl 8) -bor (([int]$Bytes[$Offset + 2]) -shl 16)
  return $value
}

function Read-UInt32LittleEndian([byte[]]$Bytes, [int]$Offset) {
  $value = ([uint32]$Bytes[$Offset]) -bor (([uint32]$Bytes[$Offset + 1]) -shl 8) -bor (([uint32]$Bytes[$Offset + 2]) -shl 16) -bor (([uint32]$Bytes[$Offset + 3]) -shl 24)
  return $value
}

function Test-PngSignature([byte[]]$Bytes) {
  return Test-BytePrefix $Bytes ([byte[]](0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
}

function Test-JpegSignature([byte[]]$Bytes) {
  return Test-BytePrefix $Bytes ([byte[]](0xff, 0xd8, 0xff))
}

function Test-WebpSignature([byte[]]$Bytes) {
  if ($Bytes.Length -lt 12) {
    return $false
  }

  $hasRiffPrefix = [System.Text.Encoding]::ASCII.GetString($Bytes, 0, 4) -eq "RIFF"
  $hasWebpType = [System.Text.Encoding]::ASCII.GetString($Bytes, 8, 4) -eq "WEBP"
  return $hasRiffPrefix -and $hasWebpType
}

function Assert-ScreenshotSignature([string]$SourcePath, [string]$Extension) {
  $bytes = Read-FilePrefixBytes $SourcePath 12
  $hasValidSignature = $false

  switch ($Extension) {
    ".png" {
      $hasValidSignature = Test-PngSignature $bytes
    }
    ".jpg" {
      $hasValidSignature = Test-JpegSignature $bytes
    }
    ".jpeg" {
      $hasValidSignature = Test-JpegSignature $bytes
    }
    ".webp" {
      $hasValidSignature = Test-WebpSignature $bytes
    }
  }

  if (-not $hasValidSignature) {
    throw "Screenshot evidence has invalid file signature: $SourcePath"
  }
}

function Read-PngDimensions([byte[]]$Bytes) {
  if (-not (Test-PngSignature $Bytes) -or $Bytes.Length -lt 24 -or [System.Text.Encoding]::ASCII.GetString($Bytes, 12, 4) -ne "IHDR") {
    return $null
  }

  return [pscustomobject]@{
    width = Read-UInt32BigEndian $Bytes 16
    height = Read-UInt32BigEndian $Bytes 20
  }
}

function Read-JpegDimensions([byte[]]$Bytes) {
  $offset = 2
  while ($offset + 4 -le $Bytes.Length) {
    if ($Bytes[$offset] -ne 0xff) {
      $offset += 1
      continue
    }

    while ($offset -lt $Bytes.Length -and $Bytes[$offset] -eq 0xff) {
      $offset += 1
    }
    if ($offset -ge $Bytes.Length) {
      return $null
    }

    $marker = [int]$Bytes[$offset]
    $offset += 1
    if ($marker -eq 0xd9 -or $marker -eq 0xda) {
      return $null
    }
    if ($marker -eq 0x01 -or ($marker -ge 0xd0 -and $marker -le 0xd7)) {
      continue
    }
    if ($offset + 2 -gt $Bytes.Length) {
      return $null
    }

    $segmentLength = Read-UInt16BigEndian $Bytes $offset
    if ($segmentLength -lt 2 -or $offset + $segmentLength -gt $Bytes.Length) {
      return $null
    }

    $isStartOfFrame = (
      ($marker -ge 0xc0 -and $marker -le 0xc3) -or
      ($marker -ge 0xc5 -and $marker -le 0xc7) -or
      ($marker -ge 0xc9 -and $marker -le 0xcb) -or
      ($marker -ge 0xcd -and $marker -le 0xcf)
    )
    if ($isStartOfFrame -and $segmentLength -ge 7) {
      return [pscustomobject]@{
        height = Read-UInt16BigEndian $Bytes ($offset + 3)
        width = Read-UInt16BigEndian $Bytes ($offset + 5)
      }
    }

    $offset += $segmentLength
  }

  return $null
}

function Read-WebpDimensions([byte[]]$Bytes) {
  if (-not (Test-WebpSignature $Bytes) -or $Bytes.Length -lt 30) {
    return $null
  }

  $chunkType = [System.Text.Encoding]::ASCII.GetString($Bytes, 12, 4)
  if ($chunkType -eq "VP8X" -and $Bytes.Length -ge 30) {
    return [pscustomobject]@{
      width = 1 + (Read-UInt24LittleEndian $Bytes 24)
      height = 1 + (Read-UInt24LittleEndian $Bytes 27)
    }
  }

  if ($chunkType -eq "VP8L" -and $Bytes.Length -ge 25 -and $Bytes[20] -eq 0x2f) {
    $bits = Read-UInt32LittleEndian $Bytes 21
    return [pscustomobject]@{
      width = ($bits -band 0x3fff) + 1
      height = (($bits -shr 14) -band 0x3fff) + 1
    }
  }

  if (
    $chunkType -eq "VP8 " -and
    $Bytes.Length -ge 30 -and
    $Bytes[23] -eq 0x9d -and
    $Bytes[24] -eq 0x01 -and
    $Bytes[25] -eq 0x2a
  ) {
    return [pscustomobject]@{
      width = (Read-UInt16LittleEndian $Bytes 26) -band 0x3fff
      height = (Read-UInt16LittleEndian $Bytes 28) -band 0x3fff
    }
  }

  return $null
}

function Read-ScreenshotDimensions([byte[]]$Bytes, [string]$Extension) {
  if ($Extension -eq ".png") {
    return Read-PngDimensions $Bytes
  }
  if ($Extension -eq ".jpg" -or $Extension -eq ".jpeg") {
    return Read-JpegDimensions $Bytes
  }
  if ($Extension -eq ".webp") {
    return Read-WebpDimensions $Bytes
  }
  return $null
}

function Assert-ScreenshotDimensions([string]$SourcePath, [string]$Extension) {
  $bytes = [System.IO.File]::ReadAllBytes($SourcePath)
  $dimensions = Read-ScreenshotDimensions $bytes $extension
  if ($null -eq $dimensions) {
    throw "Screenshot evidence must have readable image dimensions: $SourcePath"
  }

  if ($dimensions.width -lt $MinScreenshotWidth -or $dimensions.height -lt $MinScreenshotHeight) {
    throw "Screenshot evidence must be at least ${MinScreenshotWidth}x${MinScreenshotHeight}: $SourcePath ($($dimensions.width)x$($dimensions.height))"
  }
}

function Resolve-EvidenceInput([string]$ExplicitPath, [string[]]$DefaultNames) {
  if ($ExplicitPath -ne "") {
    return $ExplicitPath
  }

  if ($EvidenceDir -eq "") {
    return ""
  }

  foreach ($name in $DefaultNames) {
    $candidate = Join-Path $EvidenceDir $name
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return ""
}

function Get-StringOrExisting([string]$Value, $ExistingObject, [string]$Field) {
  if ($Value -ne "") {
    return $Value
  }

  return [string](Get-PropertyValue $ExistingObject $Field "")
}

function Get-InstallerFileNameValue($ExistingInstaller) {
  if ($InstallerFileName -ne "") {
    return $InstallerFileName
  }

  if ($InstallerFilePath -ne "") {
    if (-not (Test-Path -LiteralPath $InstallerFilePath -PathType Leaf)) {
      throw "Installer file does not exist: $InstallerFilePath"
    }

    return [System.IO.Path]::GetFileName($InstallerFilePath)
  }

  return [string](Get-PropertyValue $ExistingInstaller "file_name" "")
}

function Get-InstallerFileSha256Value($ExistingInstaller) {
  $value = ""

  if ($InstallerFilePath -ne "") {
    if (-not (Test-Path -LiteralPath $InstallerFilePath -PathType Leaf)) {
      throw "Installer file does not exist: $InstallerFilePath"
    }

    $value = (Get-FileHash -LiteralPath $InstallerFilePath -Algorithm SHA256).Hash.ToLowerInvariant()
  } elseif ($InstallerFileSha256 -ne "") {
    $value = $InstallerFileSha256.ToLowerInvariant()
  } else {
    $value = [string](Get-PropertyValue $ExistingInstaller "file_sha256" "")
  }

  if ($value -ne "" -and $value -notmatch "^[a-f0-9]{64}$") {
    throw "Installer SHA-256 evidence must be a 64-character hex digest"
  }

  return $value
}

function Get-SwitchOrExisting([bool]$Value, $ExistingObject, [string]$Field) {
  return [bool]($Value -or ((Get-PropertyValue $ExistingObject $Field $false) -eq $true))
}

function Copy-ScreenshotAttachment(
  [string]$SourcePath,
  $ExistingObject,
  [string]$Field,
  [string]$EnvironmentOs,
  [string]$FileStem
) {
  if ($SourcePath -eq "") {
    return [string](Get-PropertyValue $ExistingObject $Field "")
  }

  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Screenshot file does not exist: $SourcePath"
  }

  $extension = [System.IO.Path]::GetExtension($SourcePath).ToLowerInvariant()
  if (@(".png", ".jpg", ".jpeg", ".webp") -notcontains $extension) {
    throw "Screenshot file must be .png, .jpg, .jpeg, or .webp: $SourcePath"
  }

  Assert-ScreenshotSignature $SourcePath $extension
  Assert-ScreenshotDimensions $SourcePath $extension

  $relativePath = "screenshots/$EnvironmentOs/$FileStem$extension"
  $destination = Join-Path $EvidenceRoot ($relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar)
  $destinationParent = Split-Path -Parent $destination
  if ($destinationParent -ne "" -and -not (Test-Path -LiteralPath $destinationParent)) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }

  $resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
  $resolvedDestination = [System.IO.Path]::GetFullPath($destination)
  if (-not [string]::Equals($resolvedSource, $resolvedDestination, [System.StringComparison]::OrdinalIgnoreCase)) {
    Copy-Item -LiteralPath $SourcePath -Destination $destination -Force
  }

  return $relativePath
}

function New-PathEvidence($ExistingEnvironment, [string]$Path) {
  $existing = Get-ExistingItemByKey (Get-PropertyValue $ExistingEnvironment "public_library_paths" @()) "path" $Path
  $isPassed = ([bool]$AllPublicLibraryPathsPassed) -or ($PassedPublicLibraryPath -contains $Path)
  $record = [ordered]@{ path = $Path }

  foreach ($field in $PublicPathChecks) {
    $record[$field] = [bool]($isPassed -or ((Get-PropertyValue $existing $field $false) -eq $true))
  }

  return [pscustomobject]$record
}

function New-FailureEvidence($ExistingEnvironment, [string]$Case) {
  $existing = Get-ExistingItemByKey (Get-PropertyValue $ExistingEnvironment "failure_cases" @()) "case" $Case
  $isPassed = ([bool]$AllFailureCasesPassed) -or ($PassedFailureCase -contains $Case)

  return [pscustomobject][ordered]@{
    case = $Case
    diagnostics_shown = [bool]($isPassed -or ((Get-PropertyValue $existing "diagnostics_shown" $false) -eq $true))
    did_not_enter_broken_workbench = [bool]($isPassed -or ((Get-PropertyValue $existing "did_not_enter_broken_workbench" $false) -eq $true))
  }
}

function New-WindowsEnvironment([string]$EnvironmentOs, $ExistingEnvironment) {
  $existingFirstRun = Get-PropertyValue $ExistingEnvironment "first_run" $null
  $existingScreenshots = Get-PropertyValue $ExistingEnvironment "screenshots" $null
  $existingDiagnostics = Get-PropertyValue $ExistingEnvironment "diagnostics_samples" @()
  $existingSuccessDiagnostics = Get-ExistingItemByKey $existingDiagnostics "kind" "success"
  $existingFailureDiagnostics = Get-ExistingItemByKey $existingDiagnostics "kind" "failure"

  return [pscustomobject][ordered]@{
    os = $EnvironmentOs
    clean_machine = [pscustomobject][ordered]@{
      node_absent = Test-CommandAbsent "node"
      npm_absent = Test-CommandAbsent "npm"
      git_absent = Test-CommandAbsent "git"
      ffmpeg_absent = Test-CommandAbsent "ffmpeg"
      ffprobe_absent = Test-CommandAbsent "ffprobe"
      source_repo_absent = -not (Test-Path -LiteralPath $SourceRepoProbePath)
    }
    first_run = [pscustomobject][ordered]@{
      installed_from_exe = Get-SwitchOrExisting ([bool]$InstalledFromExe) $existingFirstRun "installed_from_exe"
      launched_from_start_menu = Get-SwitchOrExisting ([bool]$LaunchedFromStartMenu) $existingFirstRun "launched_from_start_menu"
      no_command_line_required = Get-SwitchOrExisting ([bool]$NoCommandLineRequired) $existingFirstRun "no_command_line_required"
      doctor_passed = Get-SwitchOrExisting ([bool]$DoctorPassed) $existingFirstRun "doctor_passed"
      default_workspace_path_ok = Get-SwitchOrExisting ([bool]$DefaultWorkspacePathOk) $existingFirstRun "default_workspace_path_ok"
      engine_status_normal = Get-SwitchOrExisting ([bool]$EngineStatusNormal) $existingFirstRun "engine_status_normal"
      entered_workbench = Get-SwitchOrExisting ([bool]$EnteredWorkbench) $existingFirstRun "entered_workbench"
    }
    screenshots = [pscustomobject][ordered]@{
      first_run_doctor_pass = Copy-ScreenshotAttachment (Resolve-EvidenceInput $FirstRunDoctorScreenshot @("doctor-pass.png", "doctor-pass.jpg", "doctor-pass.jpeg", "doctor-pass.webp")) $existingScreenshots "first_run_doctor_pass" $EnvironmentOs "doctor-pass"
      engine_status = Copy-ScreenshotAttachment (Resolve-EvidenceInput $EngineStatusScreenshot @("engine-status.png", "engine-status.jpg", "engine-status.jpeg", "engine-status.webp")) $existingScreenshots "engine_status" $EnvironmentOs "engine-status"
      material_locator_playback = Copy-ScreenshotAttachment (Resolve-EvidenceInput $MaterialLocatorPlaybackScreenshot @("material-locator.png", "material-locator.jpg", "material-locator.jpeg", "material-locator.webp")) $existingScreenshots "material_locator_playback" $EnvironmentOs "material-locator"
      completed_cut_job = Copy-ScreenshotAttachment (Resolve-EvidenceInput $CompletedCutJobScreenshot @("cut-job.png", "cut-job.jpg", "cut-job.jpeg", "cut-job.webp", "completed-cut.png", "completed-cut.jpg", "completed-cut.jpeg", "completed-cut.webp")) $existingScreenshots "completed_cut_job" $EnvironmentOs "cut-job"
      local_library_new_clip = Copy-ScreenshotAttachment (Resolve-EvidenceInput $LocalLibraryNewClipScreenshot @("local-library.png", "local-library.jpg", "local-library.jpeg", "local-library.webp")) $existingScreenshots "local_library_new_clip" $EnvironmentOs "local-library"
    }
    public_library_paths = @($PublicLibraryPaths | ForEach-Object { New-PathEvidence $ExistingEnvironment $_ })
    failure_cases = @($FailureCases | ForEach-Object { New-FailureEvidence $ExistingEnvironment $_ })
    diagnostics_samples = @(
      [pscustomobject][ordered]@{
        kind = "success"
        text = Read-TextOrExisting (Resolve-EvidenceInput $SuccessDiagnosticsPath @("success-diagnostics.txt", "diagnostics-success.txt")) (Get-PropertyValue $existingSuccessDiagnostics "text" "")
      },
      [pscustomobject][ordered]@{
        kind = "failure"
        text = Read-TextOrExisting (Resolve-EvidenceInput $FailureDiagnosticsPath @("failure-diagnostics.txt", "diagnostics-failure.txt")) (Get-PropertyValue $existingFailureDiagnostics "text" "")
      }
    )
  }
}

function Assert-FieldsTrue($Object, [string[]]$Fields, [string]$Prefix) {
  foreach ($field in $Fields) {
    if ((Get-PropertyValue $Object $field $false) -ne $true) {
      throw "$Prefix.$field must be true before writing complete ACC-008 environment evidence"
    }
  }
}

function Assert-FieldsNonEmpty($Object, [string[]]$Fields, [string]$Prefix) {
  foreach ($field in $Fields) {
    $value = [string](Get-PropertyValue $Object $field "")
    if ($value.Trim() -eq "") {
      throw "$Prefix.$field must be non-empty before writing complete ACC-008 environment evidence"
    }
  }
}

function Assert-CurrentWindowsEnvironmentComplete($Environment, [string]$EnvironmentOs) {
  Assert-FieldsTrue (Get-PropertyValue $Environment "clean_machine" $null) $CleanMachineChecks "environments[$EnvironmentOs].clean_machine"
  Assert-FieldsTrue (Get-PropertyValue $Environment "first_run" $null) $FirstRunChecks "environments[$EnvironmentOs].first_run"
  Assert-FieldsNonEmpty (Get-PropertyValue $Environment "screenshots" $null) @(
    "first_run_doctor_pass",
    "engine_status",
    "material_locator_playback",
    "completed_cut_job",
    "local_library_new_clip"
  ) "environments[$EnvironmentOs].screenshots"

  foreach ($pathValue in $PublicLibraryPaths) {
    $record = Get-ExistingItemByKey (Get-PropertyValue $Environment "public_library_paths" @()) "path" $pathValue
    if ($null -eq $record) {
      throw "environments[$EnvironmentOs].public_library_paths missing $pathValue"
    }
    Assert-FieldsTrue $record $PublicPathChecks "environments[$EnvironmentOs].public_library_paths[$pathValue]"
  }

  foreach ($failureCase in $FailureCases) {
    $record = Get-ExistingItemByKey (Get-PropertyValue $Environment "failure_cases" @()) "case" $failureCase
    if ($null -eq $record) {
      throw "environments[$EnvironmentOs].failure_cases missing $failureCase"
    }
    Assert-FieldsTrue $record @("diagnostics_shown", "did_not_enter_broken_workbench") "environments[$EnvironmentOs].failure_cases[$failureCase]"
  }

  $diagnostics = Get-PropertyValue $Environment "diagnostics_samples" @()
  foreach ($kind in @("success", "failure")) {
    $sample = Get-ExistingItemByKey $diagnostics "kind" $kind
    $text = [string](Get-PropertyValue $sample "text" "")
    if ($text.Trim() -eq "") {
      throw "environments[$EnvironmentOs].diagnostics_samples[$kind].text must be non-empty before writing complete ACC-008 environment evidence"
    }
    Assert-TextEvidenceSafe $text "environments[$EnvironmentOs].diagnostics_samples[$kind]"
    Assert-DiagnosticEvidenceUseful $text "environments[$EnvironmentOs].diagnostics_samples[$kind]"
  }
}

if ($Os -eq "") {
  $Os = Get-TargetOs
}

$EvidenceRoot = Split-Path -Parent $EvidencePath
if ($EvidenceRoot -eq "") {
  $EvidenceRoot = "."
}
if (-not (Test-Path -LiteralPath $EvidenceRoot)) {
  New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
}

$existingEvidence = $null
if (Test-Path -LiteralPath $EvidencePath) {
  $existingEvidence = Get-Content -Raw -Encoding UTF8 -Path $EvidencePath | ConvertFrom-Json
}

$existingProvenance = Get-PropertyValue $existingEvidence "artifact_provenance" $null
$existingInstaller = Get-PropertyValue $existingEvidence "installer" $null
$existingWindows10 = Get-ExistingItemByKey (Get-PropertyValue $existingEvidence "environments" @()) "os" "windows-10"
$existingWindows11 = Get-ExistingItemByKey (Get-PropertyValue $existingEvidence "environments" @()) "os" "windows-11"

if ($Os -eq "windows-10") {
  $windows10 = New-WindowsEnvironment "windows-10" $existingWindows10
  $windows11 = if ($null -ne $existingWindows11) { $existingWindows11 } else { New-WindowsEnvironment "windows-11" $null }
} else {
  $windows10 = if ($null -ne $existingWindows10) { $existingWindows10 } else { New-WindowsEnvironment "windows-10" $null }
  $windows11 = New-WindowsEnvironment "windows-11" $existingWindows11
}

$evidence = [pscustomobject][ordered]@{
  schema_version = "1.0"
  acceptance_id = "ACC-008"
  collector_note = "Collected by scripts/acceptance/windows-acc-008-collector.ps1. Validate after replacing every remaining empty or false field with real target evidence."
  artifact_provenance = [pscustomobject][ordered]@{
    repository_commit_sha = Get-StringOrExisting $RepositoryCommitSha $existingProvenance "repository_commit_sha"
    evidence_kit_artifact_name = "mixlab-target-evidence-kit"
    evidence_kit_workflow_run_url = Get-StringOrExisting $EvidenceKitWorkflowRunUrl $existingProvenance "evidence_kit_workflow_run_url"
  }
  installer = [pscustomobject][ordered]@{
    file_name = Get-InstallerFileNameValue $existingInstaller
    artifact_name = "mixlab-cutter-windows-exe"
    file_sha256 = Get-InstallerFileSha256Value $existingInstaller
    version = Get-StringOrExisting $InstallerVersion $existingInstaller "version"
    workflow_run_url = Get-StringOrExisting $InstallerWorkflowRunUrl $existingInstaller "workflow_run_url"
  }
  environments = @($windows10, $windows11)
}

if ($RequireCurrentEnvironmentComplete) {
  if ($Os -eq "windows-10") {
    Assert-CurrentWindowsEnvironmentComplete $windows10 "windows-10"
  } else {
    Assert-CurrentWindowsEnvironmentComplete $windows11 "windows-11"
  }
}

$parent = Split-Path -Parent $EvidencePath
if ($parent -ne "" -and -not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

$evidence | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $EvidencePath
Write-Host "Wrote ACC-008 evidence draft to $EvidencePath"
