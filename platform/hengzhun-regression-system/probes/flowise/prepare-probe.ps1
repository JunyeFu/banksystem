[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$productRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodeRoot = Join-Path $productRoot 'runtime\node-v20.20.2-win-x64'
$npm = Join-Path $nodeRoot 'npm.cmd'
$runtimeRoot = Join-Path $productRoot '.data\probes\flowise'
$appRoot = Join-Path $runtimeRoot 'app-3.0.12'
$manifest = Join-Path $PSScriptRoot 'runtime-package.json'

if (-not (Test-Path -LiteralPath $npm)) {
    throw "Pinned npm runtime is missing: $npm"
}

New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
Copy-Item -LiteralPath $manifest -Destination (Join-Path $appRoot 'package.json') -Force
& $npm install --prefix $appRoot --omit=dev
if ($LASTEXITCODE -ne 0) {
    throw "Flowise probe dependency installation failed with exit code $LASTEXITCODE"
}

$version = & (Join-Path $nodeRoot 'node.exe') -p "require(process.argv[1] + '/node_modules/flowise/package.json').version" $appRoot
if ($version -ne '3.0.12') {
    throw "Unexpected Flowise version: $version"
}

Write-Host "Flowise probe runtime prepared at $appRoot"
