[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    & npm.cmd run test:i9:stage6
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I9_STAGE6_FORWARD_FLOW_CONTRACT_VERIFIED'
} finally {
    Pop-Location
}
