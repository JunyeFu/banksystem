[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

Push-Location $root
try {
    & "$PSScriptRoot\assert-i9-ports-free.ps1"
    & $node --test 'tests\i9\stage1-runtime-baseline.test.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node 'scripts\verify-i9-stage1.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I9_STAGE1_RUNTIME_BASELINE_VERIFIED'
} finally {
    Pop-Location
}
