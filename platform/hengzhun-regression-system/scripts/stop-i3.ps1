[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'stop-worker.ps1') | Out-Null
docker compose -f (Join-Path $root 'compose.yaml') down
if ($LASTEXITCODE -ne 0) { throw 'Failed to stop Hengzhun I3 services.' }
[ordered]@{ status = 'STOPPED'; scope = 'hengzhun-product-services-only' } | ConvertTo-Json -Compress
