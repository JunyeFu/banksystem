[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$lifecycle = Join-Path $PSScriptRoot 'i9-lifecycle.cjs'
$testRoot = [IO.Path]::GetFullPath((Join-Path $root '.data\tests\i9-stage5-live'))
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $root '.data\tests'))
if (-not $testRoot.StartsWith($allowedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'I9_STAGE5_TEST_ROOT_OUTSIDE_PRODUCT_DATA'
}

. (Join-Path $PSScriptRoot 'import-i9-runtime-env.ps1')
if (-not $env:MIMO_API_KEY) { throw 'I9_STAGE5_MIMO_CREDENTIAL_REQUIRED' }

Push-Location $root
try {
    & $node $lifecycle stop | Out-Null
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    $env:NODE_ENV = 'test'
    $env:HENGZHUN_I9_TEST_DATA_ROOT = $testRoot
    $env:HENGZHUN_SERVICE_TOKEN = 'svc-' + [guid]::NewGuid().ToString('N')
    $env:HENGZHUN_WORKER_TOKEN = 'wrk-' + [guid]::NewGuid().ToString('N')
    $env:HENGZHUN_MCP_TOKEN = 'mcp-' + [guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_EMAIL = ([guid]::NewGuid().ToString('N') + '@hengzhun.local')
    $env:FLOWISE_ADMIN_PASSWORD = 'P5!' + [guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_NAME = '衡准P5隔离验证'

    & $node $lifecycle start | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node 'scripts\i9-platform-bootstrap.cjs' --allow-register | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $firstText = (& $node 'scripts\i9-agentflow-publish.cjs' | Out-String)
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $first = $firstText | ConvertFrom-Json
    if ($first.status -ne 'HENGZHUN_I9_P5_AGENTFLOW_PUBLISHED' -or -not $first.deployed) { throw 'I9_STAGE5_FIRST_PUBLICATION_FAILED' }
    if ($first.validationIssues -ne 0) { throw ('I9_STAGE5_FLOW_VALIDATION_ISSUES:' + $first.validationIssues) }

    & $node $lifecycle stop | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node $lifecycle start | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $secondText = (& $node 'scripts\i9-agentflow-publish.cjs' | Out-String)
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $second = $secondText | ConvertFrom-Json
    if ($second.exportHash -ne $first.exportHash -or $second.expectedFlowHash -ne $first.expectedFlowHash) {
        throw 'I9_STAGE5_RESTART_EXPORT_HASH_DRIFT'
    }
    if ($second.flowId -ne $first.flowId -or -not $second.deployed -or -not $second.private) {
        throw 'I9_STAGE5_RESTART_PUBLICATION_STATE_DRIFT'
    }
    if ($second.validationIssues -ne 0) { throw ('I9_STAGE5_RESTART_FLOW_VALIDATION_ISSUES:' + $second.validationIssues) }
    Write-Output 'HENGZHUN_I9_STAGE5_PUBLIC_IMPORT_PUBLISH_EXPORT_RESTART_VERIFIED'
} finally {
    & $node $lifecycle stop | Out-Null
    Remove-Item Env:NODE_ENV,Env:HENGZHUN_I9_TEST_DATA_ROOT,Env:HENGZHUN_SERVICE_TOKEN,Env:HENGZHUN_WORKER_TOKEN,Env:HENGZHUN_MCP_TOKEN,Env:FLOWISE_ADMIN_EMAIL,Env:FLOWISE_ADMIN_PASSWORD,Env:FLOWISE_ADMIN_NAME,Env:MIMO_API_KEY -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    Pop-Location
}
