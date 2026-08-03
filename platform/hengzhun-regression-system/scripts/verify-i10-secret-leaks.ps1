[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'import-i10-runtime-env.ps1')
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
& $node (Join-Path $PSScriptRoot 'verify-i10-secret-leaks.cjs')
exit $LASTEXITCODE
