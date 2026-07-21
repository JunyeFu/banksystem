[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$lifecycle = Join-Path $PSScriptRoot 'i9-lifecycle.cjs'
$testRoot = [IO.Path]::GetFullPath((Join-Path $root '.data\tests\i9-stage7-probe'))
$portalPort = 28883
. (Join-Path $PSScriptRoot 'import-i9-runtime-env.ps1')
if (-not $env:MIMO_API_KEY) { throw 'I9_STAGE7_MIMO_CREDENTIAL_REQUIRED' }
function Test-TcpPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try { return $client.ConnectAsync('127.0.0.1', $Port).Wait(500) -and $client.Connected }
    catch { return $false }
    finally { $client.Dispose() }
}
if (Test-TcpPort $portalPort) { throw 'I9_STAGE7_PORT_OCCUPIED_UNKNOWN' }
$portalProcess = $null
$probeExit = 2
Push-Location $root
try {
    Write-Output 'I9_P7_STEP_STOP_BASELINE'
    & $node $lifecycle stop | Out-Null
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    $env:NODE_ENV = 'test'; $env:HENGZHUN_I9_TEST_DATA_ROOT = $testRoot
    $env:HENGZHUN_SERVICE_TOKEN = 'svc-' + [guid]::NewGuid().ToString('N')
    $env:HENGZHUN_WORKER_TOKEN = 'wrk-' + [guid]::NewGuid().ToString('N')
    $env:HENGZHUN_MCP_TOKEN = 'mcp-' + [guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_EMAIL = ([guid]::NewGuid().ToString('N') + '@hengzhun.local')
    $env:FLOWISE_ADMIN_PASSWORD = 'P7!' + [guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_NAME = '衡准P7探针'
    $env:HENGZHUN_PORTAL_BASE_URL = "http://127.0.0.1:$portalPort"
    $env:HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME = 'synthetic-user'
    $env:HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD = 'synthetic-password'
    $env:HENGZHUN_I9_P7_PORTAL = "http://127.0.0.1:$portalPort"
    $portalProcess = Start-Process -FilePath $node -ArgumentList 'scripts\i9-p7-controlled-portal.cjs' -WorkingDirectory $root -PassThru -WindowStyle Hidden
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try { if ((Invoke-RestMethod -Uri "$env:HENGZHUN_I9_P7_PORTAL/__health" -TimeoutSec 1).status -eq 'ok') { $ready = $true; break } } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $ready) { throw 'I9_STAGE7_CONTROLLED_PORTAL_NOT_READY' }
    Write-Output 'I9_P7_STEP_PORTAL_READY'
    & $node $lifecycle start | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'I9_STAGE7_PRODUCT_START_FAILED' }
    Write-Output 'I9_P7_STEP_PRODUCT_READY'
    & $node 'scripts\i9-platform-bootstrap.cjs' --allow-register | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'I9_STAGE7_PLATFORM_BOOTSTRAP_FAILED' }
    & $node 'scripts\i9-agentflow-publish.cjs' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'I9_STAGE7_FLOW_PUBLISH_FAILED' }
    Write-Output 'I9_P7_STEP_FLOW_PUBLISHED'
    & $node 'scripts\probe-i9-stage7-prediction.cjs'
    $probeExit = $LASTEXITCODE
} finally {
    & $node $lifecycle stop | Out-Null
    if ($portalProcess -and -not $portalProcess.HasExited) { Stop-Process -Id $portalProcess.Id -Force }
    Remove-Item Env:NODE_ENV,Env:HENGZHUN_I9_TEST_DATA_ROOT,Env:HENGZHUN_SERVICE_TOKEN,Env:HENGZHUN_WORKER_TOKEN,Env:HENGZHUN_MCP_TOKEN,Env:FLOWISE_ADMIN_EMAIL,Env:FLOWISE_ADMIN_PASSWORD,Env:FLOWISE_ADMIN_NAME,Env:HENGZHUN_PORTAL_BASE_URL,Env:HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME,Env:HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD,Env:HENGZHUN_I9_P7_PORTAL,Env:MIMO_API_KEY -ErrorAction SilentlyContinue
    if ($probeExit -eq 0 -and (Test-Path -LiteralPath $testRoot)) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    Pop-Location
}
exit $probeExit
