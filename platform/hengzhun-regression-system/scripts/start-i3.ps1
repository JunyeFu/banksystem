[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
$workerPidFile = Join-Path $root '.data\worker.pid'
$workerOut = Join-Path $root '.data\logs\worker.stdout.log'
$workerErr = Join-Path $root '.data\logs\worker.stderr.log'

& (Join-Path $PSScriptRoot 'prepare-i3.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'stop-worker.ps1') | Out-Null

docker compose -f (Join-Path $root 'compose.yaml') up -d --build hengzhun-model-gateway hengzhun-harness hengzhun-conformance
if ($LASTEXITCODE -ne 0) { throw 'Failed to start Hengzhun I3 services.' }

$deadline = (Get-Date).AddMinutes(2)
do {
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18788/health' -TimeoutSec 3 }
    catch { $health = $null }
    if ($health.status -eq 'ok') { break }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if ($health.status -ne 'ok') { throw 'Hengzhun Harness did not become healthy.' }

$gatewayDeadline = (Get-Date).AddMinutes(2)
do {
    $gatewayHealth = docker inspect hengzhun-model-gateway --format '{{.State.Health.Status}}' 2>$null
    if ($gatewayHealth -eq 'healthy') { break }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $gatewayDeadline)
if ($gatewayHealth -ne 'healthy') { throw 'Hengzhun model gateway did not become healthy.' }

Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $root '..\..')).Path
$env:HENGZHUN_SOURCE_COMMIT = (git -C $repoRoot rev-parse HEAD).Trim()
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$worker = Join-Path $root 'worker\src\index.cjs'
$process = Start-Process -FilePath $node -ArgumentList @($worker) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $workerOut -RedirectStandardError $workerErr
[System.IO.File]::WriteAllText($workerPidFile, [string]$process.Id, [System.Text.UTF8Encoding]::new($false))

[ordered]@{
    status = 'STARTED'
    harness = 'http://127.0.0.1:18788'
    worker = 'RUNNING'
    modelGateway = 'HEALTHY_INTERNAL_ONLY'
    portal = $env:HENGZHUN_PORTAL_BASE_URL
} | ConvertTo-Json -Compress
