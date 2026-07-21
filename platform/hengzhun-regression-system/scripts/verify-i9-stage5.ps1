[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$npm = Join-Path $root 'runtime\node-v20.20.2-win-x64\npm.cmd'
Push-Location $root
try {
    & $npm run test:i9:stage5
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I9_STAGE5_PUBLICATION_CONTRACT_VERIFIED'
} finally { Pop-Location }
