param(
  [string]$Version = (Get-Date -Format "yyyyMMdd-HHmmss"),
  [string]$OutputRoot = "",
  [switch]$SkipDockerImages
)
$ErrorActionPreference = "Stop"
$ProductRoot = Split-Path -Parent $PSScriptRoot
$Node = Join-Path $ProductRoot "runtime\node-v20.20.2-win-x64\node.exe"
if (-not (Test-Path -LiteralPath $Node)) { throw "FIXED_NODE_RUNTIME_MISSING" }
if ([string]::IsNullOrWhiteSpace($OutputRoot)) { $OutputRoot = Join-Path $ProductRoot ".data\offline-packages" }
$PackageDir = Join-Path $OutputRoot ("hengzhun-i6-" + $Version)
if (Test-Path -LiteralPath $PackageDir) { throw "OFFLINE_PACKAGE_ALREADY_EXISTS" }
New-Item -ItemType Directory -Path $PackageDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $PackageDir "backup") -Force | Out-Null

& $Node (Join-Path $ProductRoot "node_modules\typescript\bin\tsc") -p (Join-Path $ProductRoot "tsconfig.json") --pretty false
if ($LASTEXITCODE -ne 0) { throw "I6_BUILD_FAILED" }

$DatabasePath = Join-Path $ProductRoot ".data\sqlite\regression_platform.sqlite"
$BackupWork = Join-Path $ProductRoot ".data\sqlite\offline-backups"
$BackupPath = & $Node (Join-Path $PSScriptRoot "create-sqlite-backup.cjs") $DatabasePath (Join-Path $ProductRoot "harness\migrations") $BackupWork
if ($LASTEXITCODE -ne 0) { throw "SQLITE_BACKUP_FAILED" }
Copy-Item -LiteralPath $BackupPath.Trim() -Destination (Join-Path $PackageDir "backup\regression_platform.sqlite")

$Artifacts = Join-Path $ProductRoot ".data\artifacts"
if (Test-Path -LiteralPath $Artifacts) { tar.exe -cf (Join-Path $PackageDir "backup\artifacts.tar") -C $Artifacts . }
$Evidence = Join-Path $ProductRoot ".data\evidence"
if (Test-Path -LiteralPath $Evidence) { tar.exe -cf (Join-Path $PackageDir "backup\evidence.tar") -C $Evidence . }

tar.exe --exclude=.data --exclude=.env --exclude=.env.* --exclude=profiles/*.env --exclude=coze/dist --exclude=tests/results --exclude=*.log --exclude=playwright-report --exclude=test-results -cf (Join-Path $PackageDir "hengzhun-product.tar") -C $ProductRoot .
if ($LASTEXITCODE -ne 0) { throw "PRODUCT_ARCHIVE_FAILED" }

$ImageMetadata = Join-Path $PackageDir "image-metadata.json"
if (-not $SkipDockerImages) {
  $Images = @("hengzhun/harness:i6-local", "hengzhun/model-gateway:i3-local", "hengzhun/conformance:i1-local")
  docker.exe image inspect @Images --format '{{json .}}' | ConvertFrom-Json | Select-Object Id,RepoTags,RepoDigests,Architecture,Os | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ImageMetadata -Encoding utf8
  docker.exe image save -o (Join-Path $PackageDir "hengzhun-images.tar") @Images
  if ($LASTEXITCODE -ne 0) { throw "DOCKER_IMAGE_EXPORT_FAILED" }
} else {
  "[]" | Set-Content -LiteralPath $ImageMetadata -Encoding utf8
}

& $Node (Join-Path $PSScriptRoot "offline-metadata.cjs") sbom (Join-Path $ProductRoot "package-lock.json") (Join-Path $PackageDir "sbom.cdx.json")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "restore-i6-offline.ps1") -Destination (Join-Path $PackageDir "restore-i6-offline.ps1")
$SourceCommit = (git -C (Split-Path -Parent $ProductRoot) rev-parse HEAD).Trim()
& $Node (Join-Path $PSScriptRoot "offline-metadata.cjs") manifest $PackageDir $Version $SourceCommit $ImageMetadata
& $Node (Join-Path $PSScriptRoot "offline-metadata.cjs") verify $PackageDir
if ($LASTEXITCODE -ne 0) { throw "OFFLINE_PACKAGE_VERIFY_FAILED" }
Write-Output $PackageDir
