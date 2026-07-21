[CmdletBinding()]
param([switch]$Live)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    npm.cmd run test:i9:stage7
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($Live) {
        & (Join-Path $PSScriptRoot 'probe-i9-stage7-live.ps1')
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    Write-Output 'HENGZHUN_I9_STAGE7_REVERSE_FLOW_VERIFIED'
} finally { Pop-Location }
