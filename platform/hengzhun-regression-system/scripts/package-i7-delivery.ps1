param(
  [string]$Version = ("internship-" + (Get-Date -Format "yyyyMMdd-HHmmss")),
  [string]$OutputRoot = "",
  [string]$RestoreRoot = "",
  [switch]$SkipRestore
)
$ErrorActionPreference = "Stop"
$ProductRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ProductRoot "..\..")).Path
$Node = Join-Path $ProductRoot "runtime\node-v20.20.2-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $Node)) { throw "FIXED_NODE_RUNTIME_MISSING" }
if (-not [string]::IsNullOrWhiteSpace((git -C $RepoRoot status --porcelain --untracked-files=no))) { throw "DELIVERY_SOURCE_NOT_CLEAN" }

& (Join-Path $ProductRoot "verify.cmd")
if ($LASTEXITCODE -ne 0) { throw "DELIVERY_RUNTIME_VERIFY_FAILED" }

if ([string]::IsNullOrWhiteSpace($OutputRoot)) { $OutputRoot = Join-Path $ProductRoot ".data\delivery-packages" }
$PackageOutput = & (Join-Path $PSScriptRoot "package-i6-offline.ps1") -Version $Version -OutputRoot $OutputRoot
if ($LASTEXITCODE -ne 0) { throw "DELIVERY_OFFLINE_PACKAGE_FAILED" }
$PackageDirectory = [string]($PackageOutput | Select-Object -Last 1)
if (-not (Test-Path -LiteralPath $PackageDirectory)) { throw "DELIVERY_PACKAGE_PATH_INVALID" }

$Acceptance = Join-Path $ProductRoot (".data\delivery-runs\" + $Version + "\delivery-acceptance.json")
& $Node (Join-Path $PSScriptRoot "verify-i7-delivery.cjs") --require-clean --record --package-dir $PackageDirectory --output $Acceptance
if ($LASTEXITCODE -ne 0) { throw "DELIVERY_ACCEPTANCE_FAILED" }

$RestoreDirectory = $null
if (-not $SkipRestore) {
  if ([string]::IsNullOrWhiteSpace($RestoreRoot)) { $RestoreRoot = Join-Path $ProductRoot ".data\delivery-restores" }
  $RestoreDirectory = Join-Path $RestoreRoot $Version
  & (Join-Path $PSScriptRoot "restore-i6-offline.ps1") -PackageDirectory $PackageDirectory -TargetDirectory $RestoreDirectory
  if ($LASTEXITCODE -ne 0) { throw "DELIVERY_RESTORE_FAILED" }
}

[ordered]@{
  status = "HENGZHUN_I7_DELIVERY_PACKAGE_AND_RESTORE_VERIFIED"
  version = $Version
  packageDirectory = $PackageDirectory
  restoreDirectory = $RestoreDirectory
  acceptancePath = $Acceptance
} | ConvertTo-Json -Compress | Write-Output
