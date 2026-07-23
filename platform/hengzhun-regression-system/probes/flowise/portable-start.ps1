[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3007
)

$ErrorActionPreference = 'Stop'
$bundleRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = Join-Path $bundleRoot 'runtime\node-v20.20.2-win-x64\node.exe'
$flowise = Join-Path $bundleRoot 'app\node_modules\flowise\bin\run'
$stateRoot = Join-Path $bundleRoot 'state'

if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $flowise)) {
    throw 'Portable Flowise bundle is incomplete: copied Node or Flowise is missing.'
}

$env:DATABASE_TYPE = 'sqlite'
$env:DATABASE_PATH = $stateRoot
$env:SECRETKEY_PATH = Join-Path $stateRoot 'secrets'
$env:BLOB_STORAGE_PATH = Join-Path $stateRoot 'storage'
$env:LOG_PATH = Join-Path $stateRoot 'logs'
$env:DISABLE_FLOWISE_TELEMETRY = 'true'
$env:SECURE_COOKIES = 'false'
$env:PORT = [string]$Port

Write-Host "Starting copied Flowise bundle in the foreground at http://127.0.0.1:$Port"
& $node $flowise start
exit $LASTEXITCODE
