[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendorDocker = Join-Path $root '.data\vendor\coze-studio\docker'
$baseCompose = Join-Path $vendorDocker 'docker-compose.yml'
$overrideCompose = Join-Path $root 'coze\studio\docker-compose.hengzhun.yml'
$cozeEnv = Join-Path $vendorDocker '.env'

& (Join-Path $PSScriptRoot 'prepare-i1.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'prepare-i2.ps1') | Out-Null

docker compose -f (Join-Path $root 'compose.yaml') up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Failed to start Hengzhun I2 services.' }

docker compose --env-file $cozeEnv -f $baseCompose -f $overrideCompose up -d
if ($LASTEXITCODE -ne 0) { throw 'Failed to start Coze Studio.' }

[ordered]@{
    status = 'STARTED'
    console = 'http://127.0.0.1:8888'
    harness = 'http://hengzhun-harness:18788'
    network = 'hengzhun-control'
} | ConvertTo-Json -Compress
