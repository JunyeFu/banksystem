[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

Push-Location $root
try {
    & $node 'node_modules\typescript\bin\tsc'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --test --test-name-pattern 'ONE_TIME binds exact script version' 'tests\i8\stage6-scheduling-inbox.test.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I8_STAGE6_REAL_PLAYWRIGHT_SCHEDULE_VERIFIED'
} finally {
    Pop-Location
}
