[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$flowisePackage = Join-Path $root '.data\probes\flowise\app-3.0.12\package.json'

if (-not (Test-Path -LiteralPath $flowisePackage)) {
    throw 'I8_STAGE2_FLOWISE_3_0_12_RUNTIME_MISSING'
}

Push-Location $root
try {
    & $node 'node_modules\typescript\bin\tsc'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE2_BUILD_FAILED' }
    & $node '--test' 'tests\i8\context-envelope.test.cjs' 'tests\i8\stage2-agentflow-mcp.test.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE2_TESTS_FAILED' }
    & $node 'scripts\verify-i3-openapi.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE2_OPENAPI_REGRESSION_FAILED' }
    & $node '--check' 'mcp\src\server.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE2_MCP_SYNTAX_FAILED' }
    Write-Output 'HENGZHUN_I8_STAGE2_AGENTFLOW_MCP_VERIFIED'
}
finally {
    Pop-Location
}
