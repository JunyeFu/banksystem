[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

Push-Location $root
try {
    & $node 'node_modules\typescript\bin\tsc'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --test `
      'tests\i8\context-envelope.test.cjs' `
      'tests\i8\stage2-agentflow-mcp.test.cjs' `
      'tests\i8\stage3-deterministic-builder.test.cjs' `
      'tests\i8\stage4-stability-certificate.test.cjs' `
      'tests\i8\stage5-controlled-delivery.test.cjs' `
      'tests\i8\stage6-scheduling-inbox.test.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node 'scripts\verify-i3-openapi.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I8_STAGE6_SCHEDULING_AND_INBOX_VERIFIED'
} finally {
    Pop-Location
}
