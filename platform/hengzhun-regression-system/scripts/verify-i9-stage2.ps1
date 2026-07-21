[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

Push-Location $root
try {
    & $node 'node_modules\typescript\bin\tsc'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --test 'tests\i9\stage2-lifecycle-contract.test.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --check 'scripts\i9-lifecycle.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I9_STAGE2_LIFECYCLE_CONTRACT_VERIFIED'
} finally { Pop-Location }
