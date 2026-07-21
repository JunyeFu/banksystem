[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe') (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') start
exit $LASTEXITCODE
