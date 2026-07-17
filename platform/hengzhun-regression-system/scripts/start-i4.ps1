[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'prepare-i4.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'start-i3.ps1')
& (Join-Path $PSScriptRoot 'stop-authoring-worker.ps1') | Out-Null

$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$env:MIDSCENE_MODEL_NAME = $env:MIMO_MODEL_NAME
$env:MIDSCENE_MODEL_BASE_URL = $env:MIMO_MODEL_BASE_URL
$env:MIDSCENE_MODEL_API_KEY = $env:MIMO_MODEL_API_KEY
$env:MIDSCENE_MODEL_FAMILY = 'xiaomi-mimo'
$env:MIDSCENE_MODEL_TIMEOUT = '60000'
$env:MIDSCENE_INSIGHT_MODEL_TIMEOUT = '60000'
$env:MIDSCENE_PLANNING_MODEL_TIMEOUT = '60000'
$env:MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG = 'false'
$authoringOut = Join-Path $root '.data\logs\authoring-worker.stdout.log'
$authoringErr = Join-Path $root '.data\logs\authoring-worker.stderr.log'
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$worker = Join-Path $root 'runtime\midscene-authoring-worker.cjs'
$process = Start-Process -FilePath $node -ArgumentList @($worker) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $authoringOut -RedirectStandardError $authoringErr
[System.IO.File]::WriteAllText((Join-Path $root '.data\authoring-worker.pid'), [string]$process.Id, [System.Text.UTF8Encoding]::new($false))
