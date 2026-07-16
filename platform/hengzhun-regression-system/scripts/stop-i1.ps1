[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vendorDocker = Join-Path $root '.data\vendor\coze-studio\docker'
$baseCompose = Join-Path $vendorDocker 'docker-compose.yml'
$overrideCompose = Join-Path $root 'coze\studio\docker-compose.hengzhun.yml'
$cozeEnv = Join-Path $vendorDocker '.env'

if ((Test-Path -LiteralPath $baseCompose) -and (Test-Path -LiteralPath $cozeEnv)) {
  docker compose --env-file $cozeEnv -f $baseCompose -f $overrideCompose down
}
docker compose -f (Join-Path $root 'compose.yaml') down

[ordered]@{ status = 'STOPPED'; scope = @('coze-studio', 'hengzhun-regression-system') } |
  ConvertTo-Json -Compress
