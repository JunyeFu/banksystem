[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendorDocker = Join-Path $root '.data\vendor\coze-studio\docker'
$baseCompose = Join-Path $vendorDocker 'docker-compose.yml'
$overrideCompose = Join-Path $root 'coze\studio\docker-compose.hengzhun.yml'
$cozeEnv = Join-Path $vendorDocker '.env'

& (Join-Path $PSScriptRoot 'prepare-i1.ps1') | Out-Null

docker compose -f (Join-Path $root 'compose.yaml') up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Failed to start the I1 conformance service.' }

docker compose --env-file $cozeEnv -f $baseCompose -f $overrideCompose up -d
if ($LASTEXITCODE -ne 0) { throw 'Failed to start Coze Studio.' }

[ordered]@{ status = 'STARTED'; console = 'http://127.0.0.1:8888'; network = 'hengzhun-control' } |
  ConvertTo-Json -Compress
