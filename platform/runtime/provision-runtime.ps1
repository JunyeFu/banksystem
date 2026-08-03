[CmdletBinding()]
param(
    [string]$AssetRoot = (Join-Path $PSScriptRoot '..\..\nodejs20-midscene')
)

$ErrorActionPreference = 'Stop'

$runtimeRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $runtimeRoot '..\..')).Path
$nodeHome = Join-Path $runtimeRoot 'node-v20.20.2-win-x64'
$npm = Join-Path $nodeHome 'npm.cmd'
$manifestPath = Join-Path $projectRoot 'config\demo-runtime-freeze.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) {
    throw "Project-local npm was not found: $npm"
}

$assetRootResolved = (Resolve-Path -LiteralPath $AssetRoot).Path
$requiredAssetDirectories = @(
    $manifest.chromium.browserDirectory,
    $manifest.ffmpeg.directory
)

foreach ($relativeDirectory in $requiredAssetDirectories) {
    $source = Join-Path $assetRootResolved $relativeDirectory
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Required runtime asset was not found: $source"
    }
}

$packageSpecs = @(
    $manifest.packages.PSObject.Properties | ForEach-Object {
        "$($_.Name)@$($_.Value)"
    }
)

$previousSkipDownload = $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
try {
    & $npm install --prefix $runtimeRoot --no-save --package-lock=false --audit=false --fund=false @packageSpecs
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE"
    }
}
finally {
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = $previousSkipDownload
}

$targetBrowsers = Join-Path $runtimeRoot 'browsers'
New-Item -ItemType Directory -Path $targetBrowsers -Force | Out-Null
foreach ($relativeDirectory in $requiredAssetDirectories) {
    $source = Join-Path $assetRootResolved $relativeDirectory
    $destination = Join-Path $runtimeRoot $relativeDirectory
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force
}

& (Join-Path $runtimeRoot 'verify-runtime.cmd')
exit $LASTEXITCODE
