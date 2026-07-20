[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

Push-Location $root
try {
    & $node 'node_modules\typescript\bin\tsc'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE3_BUILD_FAILED' }
    & $node '--test' 'tests\i8\context-envelope.test.cjs' 'tests\i8\stage2-agentflow-mcp.test.cjs' 'tests\i8\stage3-deterministic-builder.test.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE3_TESTS_FAILED' }
    & $node '--check' 'mcp\src\server.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE3_MCP_SYNTAX_FAILED' }
    & $node '--check' 'worker\src\i8-candidate-runner.cjs'
    if ($LASTEXITCODE -ne 0) { throw 'I8_STAGE3_RUNNER_SYNTAX_FAILED' }
    Write-Output 'HENGZHUN_I8_STAGE3_DETERMINISTIC_BUILDER_VERIFIED'
}
finally {
    Pop-Location
}
