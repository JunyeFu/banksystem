[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
docker compose -f (Join-Path $root 'compose.yaml') down
if ($LASTEXITCODE -ne 0) { throw 'Failed to stop Hengzhun I2 services.' }
[ordered]@{ status = 'STOPPED'; scope = 'hengzhun-product-services-only' } | ConvertTo-Json -Compress
