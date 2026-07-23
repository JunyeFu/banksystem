[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot 'prepare-i9.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
& $node (Join-Path $PSScriptRoot 'platform-admin.cjs') reconcile-existing | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $node (Join-Path $PSScriptRoot 'build-i10-agentflow.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $node (Join-Path $PSScriptRoot 'verify-i10-agentflow-paths.cjs')
exit $LASTEXITCODE
