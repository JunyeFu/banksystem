[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'

. (Join-Path $PSScriptRoot 'import-i10-runtime-env.ps1')
& $node (Join-Path $PSScriptRoot 'platform-admin.cjs') reconcile-existing | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $node (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') start
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

try {
    & $node (Join-Path $PSScriptRoot 'platform-admin.cjs') ensure-live | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "I10_PLATFORM_ADMIN_BOOTSTRAP_FAILED:$LASTEXITCODE" }
    & $node (Join-Path $PSScriptRoot 'verify-i10-model-probes.cjs')
    if ($LASTEXITCODE -ne 0) { throw "I10_MODEL_PROBE_FAILED:$LASTEXITCODE" }
    & $node (Join-Path $PSScriptRoot 'i10-agentflow-publish.cjs') --allow-register
    if ($LASTEXITCODE -ne 0) { throw "I10_AGENTFLOW_PUBLICATION_FAILED:$LASTEXITCODE" }
} catch {
    & $node (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') stop | Out-Null
    throw
}
