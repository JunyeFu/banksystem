[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$npm = Join-Path $root 'runtime\node-v20.20.2-win-x64\npm.cmd'
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

Push-Location $root
try {
    & $npm run test:i9:stage4
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node 'scripts\verify-i9-stage4-mimo.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Output 'HENGZHUN_I9_STAGE4_MIMO_AND_FOURTEEN_MCP_TOOLS_VERIFIED'
} finally {
    Pop-Location
}
