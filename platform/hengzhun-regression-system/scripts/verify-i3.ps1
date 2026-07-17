[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$npm = Join-Path $root 'runtime\node-v20.20.2-win-x64\npm.cmd'

Push-Location $root
try {
    & $npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npm run verify:i3:openapi
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npm run test:i3
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npm run verify:i3:results
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I3_RUNTIME_VERIFIED_PUBLIC_PLATFORM_GATE_OPEN'
} finally {
    Pop-Location
}
