[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$chromium = Join-Path $root 'runtime\browsers\chromium-1217\chrome-win64\chrome.exe'
if (-not (Test-Path $chromium)) { throw 'I8_STAGE7_FIXED_CHROMIUM_MISSING' }

Push-Location $root
try {
    $env:HENGZHUN_I8_STAGE7_LIVE = '1'
    & $node 'node_modules\typescript\bin\tsc'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --test --test-name-pattern 'formal failure' 'tests\i8\stage7-restricted-repair.test.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I8_STAGE7_REAL_CHROMIUM_SIX_RUN_REPAIR_VERIFIED'
} finally {
    Remove-Item Env:HENGZHUN_I8_STAGE7_LIVE -ErrorAction SilentlyContinue
    Pop-Location
}
