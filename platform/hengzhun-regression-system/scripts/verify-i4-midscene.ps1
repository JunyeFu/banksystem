[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
if (-not (Test-Path -LiteralPath $runtimeEnv)) { throw 'Ignored runtime environment is unavailable. Run prepare:i4 first.' }
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$env:MIDSCENE_MODEL_NAME = $env:MIMO_MODEL_NAME
$env:MIDSCENE_MODEL_BASE_URL = $env:MIMO_MODEL_BASE_URL
$env:MIDSCENE_MODEL_API_KEY = $env:MIMO_MODEL_API_KEY
$env:MIDSCENE_MODEL_FAMILY = 'xiaomi-mimo'
$env:MIDSCENE_MODEL_TIMEOUT = '120000'
$env:MIDSCENE_INSIGHT_MODEL_TIMEOUT = '120000'
$env:MIDSCENE_PLANNING_MODEL_TIMEOUT = '120000'
$env:MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG = 'false'
$env:MIDSCENE_DEBUG_MODEL_RESPONSE = 'false'
$env:HENGZHUN_HARNESS_URL = 'http://127.0.0.1:18788'
& (Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe') (Join-Path $root 'runtime\midscene-plat-v014.cjs')
if ($LASTEXITCODE -ne 0) { throw 'PLAT-V014 capability publication or fail-closed routing verification failed.' }
