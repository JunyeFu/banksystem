param(
  [Parameter(Mandatory=$true)][string]$PackageDirectory,
  [Parameter(Mandatory=$true)][string]$TargetDirectory,
  [switch]$SkipDockerLoad
)
$ErrorActionPreference = "Stop"
$PackageDirectory = (Resolve-Path -LiteralPath $PackageDirectory).Path
if (Test-Path -LiteralPath $TargetDirectory) {
  if ((Get-ChildItem -LiteralPath $TargetDirectory -Force | Measure-Object).Count -gt 0) { throw "RESTORE_TARGET_NOT_EMPTY" }
} else { New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null }

$ProductArchive = Join-Path $PackageDirectory "hengzhun-product.tar"
tar.exe -xf $ProductArchive -C $TargetDirectory
if ($LASTEXITCODE -ne 0) { throw "PRODUCT_RESTORE_FAILED" }
$Node = Join-Path $TargetDirectory "runtime\node-v20.20.2-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $Node)) { throw "RESTORED_NODE_RUNTIME_MISSING" }
& $Node (Join-Path $TargetDirectory "scripts\offline-metadata.cjs") verify $PackageDirectory
if ($LASTEXITCODE -ne 0) { throw "RESTORE_HASH_VERIFY_FAILED" }

$DataRoot = Join-Path $TargetDirectory ".data"
New-Item -ItemType Directory -Path (Join-Path $DataRoot "sqlite") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PackageDirectory "backup\regression_platform.sqlite") -Destination (Join-Path $DataRoot "sqlite\regression_platform.sqlite")
foreach ($Name in @("artifacts", "evidence")) {
  $Archive = Join-Path $PackageDirectory ("backup\" + $Name + ".tar")
  if (Test-Path -LiteralPath $Archive) {
    $Destination = Join-Path $DataRoot $Name
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    tar.exe -xf $Archive -C $Destination
  }
}
if (-not $SkipDockerLoad -and (Test-Path -LiteralPath (Join-Path $PackageDirectory "hengzhun-images.tar"))) {
  docker.exe image load -i (Join-Path $PackageDirectory "hengzhun-images.tar")
  if ($LASTEXITCODE -ne 0) { throw "DOCKER_IMAGE_RESTORE_FAILED" }
}
& $Node (Join-Path $TargetDirectory "scripts\verify-offline-restore.cjs") $TargetDirectory
if ($LASTEXITCODE -ne 0) { throw "RESTORED_SQLITE_VERIFY_FAILED" }
Write-Output $TargetDirectory
