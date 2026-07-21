[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$lifecycle = Join-Path $PSScriptRoot 'i9-lifecycle.cjs'
$testRoot = [IO.Path]::GetFullPath((Join-Path $root '.data\tests\i9-stage3-live'))
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $root '.data\tests'))
if (-not $testRoot.StartsWith($allowedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'I9_STAGE3_TEST_ROOT_OUTSIDE_PRODUCT_DATA'
}

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
    $env:FLOWISE_ADMIN_PASSWORD = 'P3!' + [guid]::NewGuid().ToString('N')
    $env:FLOWISE_ADMIN_NAME = '衡准P3隔离验证'

    & $node $lifecycle start | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $first = (& $node 'scripts\i9-platform-bootstrap.cjs' --allow-register | Out-String)
    if ($LASTEXITCODE -ne 0 -or -not $first.Contains('"fixedReferenceRetrieved": true')) { throw 'I9_STAGE3_PUBLIC_API_BOOTSTRAP_FAILED' }
    $second = (& $node 'scripts\i9-platform-bootstrap.cjs' | Out-String)
    if ($LASTEXITCODE -ne 0 -or -not $second.Contains('"status": "PASS"')) { throw 'I9_STAGE3_PUBLIC_API_IDEMPOTENCY_FAILED' }

    & $node $lifecycle stop | Out-Null
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $backupText = (& $node 'scripts\i9-sqlite-snapshot.cjs' backup | Out-String)
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $backupResult = $backupText | ConvertFrom-Json
    if ($backupResult.status -ne 'BACKUP_CREATED') { throw 'I9_STAGE3_DUAL_SQLITE_BACKUP_FAILED' }
    $restoreText = (& $node 'scripts\i9-sqlite-snapshot.cjs' restore $backupResult.manifestPath | Out-String)
    if ($LASTEXITCODE -ne 0 -or -not $restoreText.Contains('"status": "RESTORED"')) { throw 'I9_STAGE3_DUAL_SQLITE_RESTORE_FAILED' }

    Write-Output 'HENGZHUN_I9_STAGE3_PUBLIC_API_AND_DUAL_SQLITE_LIVE_VERIFIED'
} finally {
    & $node $lifecycle stop | Out-Null
    Remove-Item Env:NODE_ENV,Env:HENGZHUN_I9_TEST_DATA_ROOT,Env:HENGZHUN_SERVICE_TOKEN,Env:HENGZHUN_WORKER_TOKEN,Env:HENGZHUN_MCP_TOKEN,Env:FLOWISE_ADMIN_EMAIL,Env:FLOWISE_ADMIN_PASSWORD,Env:FLOWISE_ADMIN_NAME -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
    Pop-Location
}
