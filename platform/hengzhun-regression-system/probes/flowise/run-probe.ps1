[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3006,
    [string]$RuntimeName = 'primary'
)

$ErrorActionPreference = 'Stop'
$productRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = Join-Path $productRoot 'runtime\node-v20.20.2-win-x64\node.exe'
$runtimeRoot = Join-Path $productRoot '.data\probes\flowise'
$appRoot = Join-Path $runtimeRoot 'app-3.0.12'
$stateRoot = Join-Path $runtimeRoot "state-$RuntimeName"
$flowise = Join-Path $appRoot 'node_modules\flowise\bin\run'

if (-not (Test-Path -LiteralPath $flowise)) {
    throw 'Flowise probe runtime is missing. Run prepare-probe.ps1 first.'
}

New-Item -ItemType Directory -Force -Path $stateRoot,(Join-Path $stateRoot 'secrets'),(Join-Path $stateRoot 'storage'),(Join-Path $stateRoot 'logs') | Out-Null
$env:DATABASE_TYPE = 'sqlite'
$env:DATABASE_PATH = $stateRoot
$env:SECRETKEY_PATH = Join-Path $stateRoot 'secrets'
$env:BLOB_STORAGE_PATH = Join-Path $stateRoot 'storage'
$env:LOG_PATH = Join-Path $stateRoot 'logs'
$env:DISABLE_FLOWISE_TELEMETRY = 'true'
$env:SECURE_COOKIES = 'false'
$env:PORT = [string]$Port

Write-Host "Starting Flowise probe in the foreground at http://127.0.0.1:$Port"
& $node $flowise start
exit $LASTEXITCODE
