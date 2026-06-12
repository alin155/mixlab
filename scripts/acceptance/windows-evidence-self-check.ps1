#requires -Version 5.1
param(
  [string]$EvidencePath = ".\windows-acc-008.json"
)

$ErrorActionPreference = "Stop"

function Add-Issue([System.Collections.Generic.List[string]]$Issues, [string]$Message) {
  [void]$Issues.Add($Message)
}

function Test-DraftMarkers($Value, [string]$Path, [System.Collections.Generic.List[string]]$Issues) {
  if ($null -eq $Value) {
    Add-Issue $Issues "$Path is null"
    return
  }

  if ($Value -is [string]) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
      Add-Issue $Issues "$Path is empty"
    }
    return
  }

  if ($Value -is [bool]) {
    if (-not $Value) {
      Add-Issue $Issues "$Path is false"
    }
    return
  }

  if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
    if ([double]$Value -eq 0) {
      Add-Issue $Issues "$Path is zero"
    }
    return
  }

  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    $index = 0
    foreach ($item in $Value) {
      Test-DraftMarkers $item "$Path[$index]" $Issues
      $index += 1
    }
    return
  }

  if ($Value.PSObject -and $Value.PSObject.Properties) {
    foreach ($property in $Value.PSObject.Properties) {
      Test-DraftMarkers $property.Value "$Path.$($property.Name)" $Issues
    }
  }
}

function Test-RelativeAttachment([string]$Reference, [string]$FieldPath, [string]$EvidenceDir, [System.Collections.Generic.List[string]]$Issues) {
  if ([string]::IsNullOrWhiteSpace($Reference)) {
    Add-Issue $Issues "$FieldPath attachment path is empty"
    return ""
  }

  if ([System.IO.Path]::IsPathRooted($Reference) -or $Reference.Contains("\") -or $Reference.Contains("..")) {
    Add-Issue $Issues "$FieldPath attachment path is not portable: $Reference"
    return ""
  }

  $fullPath = Join-Path $EvidenceDir ($Reference -replace "/", [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $fullPath)) {
    Add-Issue $Issues "$FieldPath attachment is missing: $Reference"
    return ""
  }

  $item = Get-Item -LiteralPath $fullPath
  if ($item.Length -le 0) {
    Add-Issue $Issues "$FieldPath attachment is empty: $Reference"
  }

  return $fullPath
}

$MinScreenshotWidth = 640
$MinScreenshotHeight = 360

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

function Test-ScreenshotAttachment([string]$FullPath, [string]$FieldPath, [System.Collections.Generic.List[string]]$Issues) {
  if ([string]::IsNullOrWhiteSpace($FullPath)) {
    return
  }

  $extension = [System.IO.Path]::GetExtension($FullPath).ToLowerInvariant()
  if (@(".png", ".jpg", ".jpeg", ".webp") -notcontains $extension) {
    Add-Issue $Issues "$FieldPath screenshot must use .png, .jpg, .jpeg, or .webp"
    return
  }

  $bytes = [System.IO.File]::ReadAllBytes($FullPath)
  $dimensions = Read-ScreenshotDimensions $bytes $extension
  if ($null -eq $dimensions) {
    Add-Issue $Issues "$FieldPath screenshot must be a real PNG/JPEG/WebP image with readable dimensions"
    return
  }

  if ($dimensions.width -lt $MinScreenshotWidth -or $dimensions.height -lt $MinScreenshotHeight) {
    Add-Issue $Issues "$FieldPath screenshot must be at least ${MinScreenshotWidth}x${MinScreenshotHeight} but was $($dimensions.width)x$($dimensions.height)"
  }
}

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

$ForbiddenDiagnosticPatterns = @(
  "DASHSCOPE_API_KEY",
  "Authorization:\s*Bearer\s+(?!\*\*\*)",
  "sk-[A-Za-z0-9_-]{8,}",
  "signature=",
  "x-oss-signature",
  "full_text",
  "pasted_search_text"
)

function Get-PropertyValue($Object, [string]$Name, $DefaultValue) {
  if ($null -ne $Object) {
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) {
      return $property.Value
    }
  }

  return $DefaultValue
}

function Find-DiagnosticSample($Samples, [string]$Kind) {
  foreach ($sample in @($Samples)) {
    if ((Get-PropertyValue $sample "kind" "") -eq $Kind) {
      return $sample
    }
  }

  return $null
}

function Test-DiagnosticsSamples($Samples, [string]$FieldPath, [System.Collections.Generic.List[string]]$Issues) {
  foreach ($kind in @("success", "failure")) {
    $sample = Find-DiagnosticSample $Samples $kind
    if ($null -eq $sample) {
      Add-Issue $Issues "$FieldPath must include a $kind diagnostics sample"
    }
  }

  $index = 0
  foreach ($sample in @($Samples)) {
    $kind = [string](Get-PropertyValue $sample "kind" "unknown")
    $text = [string](Get-PropertyValue $sample "text" "")

    if (-not [string]::IsNullOrWhiteSpace($text)) {
      $normalized = $text.ToLowerInvariant()
      foreach ($term in $RequiredDiagnosticTerms) {
        if (-not $normalized.Contains($term)) {
          Add-Issue $Issues "$FieldPath[$index].text for $kind diagnostics must include $term"
        }
      }

      foreach ($pattern in $ForbiddenDiagnosticPatterns) {
        if ($text -match $pattern) {
          Add-Issue $Issues "$FieldPath[$index].text for $kind diagnostics contains forbidden secret/private data"
        }
      }
    }

    $index += 1
  }
}

if (-not (Test-Path -LiteralPath $EvidencePath)) {
  Write-Error "Evidence file is missing: $EvidencePath"
}

$evidenceDir = Split-Path -Parent (Resolve-Path -LiteralPath $EvidencePath)
$evidence = Get-Content -Raw -LiteralPath $EvidencePath | ConvertFrom-Json
$issues = [System.Collections.Generic.List[string]]::new()

if ($evidence.acceptance_id -ne "ACC-008") {
  Add-Issue $issues "acceptance_id must be ACC-008"
}

Test-DraftMarkers $evidence "evidence" $issues

foreach ($environment in @($evidence.environments)) {
  $os = $environment.os
  foreach ($screenshot in $environment.screenshots.PSObject.Properties) {
    $fieldPath = "environments[$os].screenshots.$($screenshot.Name)"
    $fullPath = Test-RelativeAttachment $screenshot.Value $fieldPath $evidenceDir $issues
    Test-ScreenshotAttachment $fullPath $fieldPath $issues
  }
  Test-DiagnosticsSamples $environment.diagnostics_samples "environments[$os].diagnostics_samples" $issues
}

if ($issues.Count -gt 0) {
  Write-Host "ACC-008 target-side self-check found $($issues.Count) issue(s):"
  $issues | Select-Object -First 80 | ForEach-Object { Write-Host "- $_" }
  if ($issues.Count -gt 80) {
    Write-Host "- ... $($issues.Count - 80) more"
  }
  exit 1
}

Write-Host "ACC-008 target-side self-check found no draft markers, missing/fake/undersized referenced screenshots, or obvious diagnostics gaps."
Write-Host "Copy windows-acc-008.json plus screenshots/ back to the repository and run npm run validate:target-evidence."
