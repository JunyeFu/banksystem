[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$npm = Join-Path $root 'runtime\node-v20.20.2-win-x64\npm.cmd'

Push-Location $root
try {
    & $npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npm run verify:openapi
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npm run test:i2
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $npm audit --omit=dev
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I2_VERIFIED'
} finally {
    Pop-Location
}
