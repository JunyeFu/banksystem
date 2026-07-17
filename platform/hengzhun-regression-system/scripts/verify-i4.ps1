[CmdletBinding()]
param([switch]$SkipMidscene)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    npm.cmd run test:i2
    npm.cmd run test:i3
    npm.cmd run test:i4
    & (Join-Path $PSScriptRoot 'start-i4.ps1') | Out-Null
    & (Join-Path $PSScriptRoot 'verify-i4-live.ps1')
    if (-not $SkipMidscene) { & (Join-Path $PSScriptRoot 'verify-i4-midscene.ps1') }
    & (Join-Path $PSScriptRoot 'verify-i4-authoring-live.ps1')
    npm.cmd run verify:i4:results
} finally {
    Pop-Location
}
