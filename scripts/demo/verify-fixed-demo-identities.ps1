[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$node = Join-Path $root 'platform\hengzhun-regression-system\runtime\node-v20.20.2-win-x64\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'RF055_BROWSER_NODE_MISSING' }
& $node (Join-Path $PSScriptRoot 'verify-fixed-demo-identities.mjs')
if ($LASTEXITCODE -ne 0) { throw 'RF055_BROWSER_IDENTITY_VERIFICATION_FAILED' }
