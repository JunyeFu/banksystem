[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$lifecycle = Join-Path $PSScriptRoot 'i9-lifecycle.cjs'
$testRoot = [IO.Path]::GetFullPath((Join-Path $root '.data\tests\i9-stage6-probe'))
. (Join-Path $PSScriptRoot 'import-i9-runtime-env.ps1')
if (-not $env:MIMO_API_KEY) { throw 'I9_STAGE6_MIMO_CREDENTIAL_REQUIRED' }
try {
    $portal = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:18082/portal/login' -TimeoutSec 10
    if ($portal.StatusCode -ne 200) { throw 'unexpected status' }
} catch {
    throw 'I9_STAGE6_PORTAL_UNAVAILABLE'
}
Push-Location $root
$probeExit = 2
try {
    & $node $lifecycle stop | Out-Null
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    $env:NODE_ENV='test'; $env:HENGZHUN_I9_TEST_DATA_ROOT=$testRoot
    $env:HENGZHUN_SERVICE_TOKEN='svc-'+[guid]::NewGuid().ToString('N')
    $env:HENGZHUN_WORKER_TOKEN='wrk-'+[guid]::NewGuid().ToString('N')
    $env:HENGZHUN_MCP_TOKEN='mcp-'+[guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_EMAIL=([guid]::NewGuid().ToString('N')+'@hengzhun.local')
    $env:FLOWISE_ADMIN_PASSWORD='P6!'+[guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_NAME='衡准P6探针'
    & $node $lifecycle start | Out-Null
    & $node 'scripts\i9-platform-bootstrap.cjs' --allow-register | Out-Null
    & $node 'scripts\i9-agentflow-publish.cjs' | Out-Null
    & $node 'scripts\probe-i9-stage6-prediction.cjs'
    $probeExit = $LASTEXITCODE
} finally {
    & $node $lifecycle stop | Out-Null
    Remove-Item Env:NODE_ENV,Env:HENGZHUN_I9_TEST_DATA_ROOT,Env:HENGZHUN_SERVICE_TOKEN,Env:HENGZHUN_WORKER_TOKEN,Env:HENGZHUN_MCP_TOKEN,Env:FLOWISE_ADMIN_EMAIL,Env:FLOWISE_ADMIN_PASSWORD,Env:FLOWISE_ADMIN_NAME,Env:MIMO_API_KEY -ErrorAction SilentlyContinue
    if ($probeExit -eq 0 -and (Test-Path -LiteralPath $testRoot)) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    Pop-Location
}
exit $probeExit
