[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'import-i10-runtime-env.ps1')
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

& $node (Join-Path $PSScriptRoot 'verify-i10-model-probes.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $node (Join-Path $PSScriptRoot 'i10-agentflow-publish.cjs') --allow-register
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $node (Join-Path $PSScriptRoot 'i10-stage8-orchestrator.cjs')
exit $LASTEXITCODE

