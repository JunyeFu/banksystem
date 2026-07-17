[CmdletBinding()]
param([switch]$KeepRunning)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    npm.cmd run verify:openapi
    npm.cmd run test:i2
    npm.cmd run test:i3
    npm.cmd run test:i4
    npm.cmd run test:i5
    & (Join-Path $PSScriptRoot 'start-i5.ps1') | Out-Null
    & (Join-Path $PSScriptRoot 'verify-i5-live.ps1')
} finally {
    if (-not $KeepRunning) { & (Join-Path $PSScriptRoot 'stop-i5.ps1') | Out-Null }
    Pop-Location
}
