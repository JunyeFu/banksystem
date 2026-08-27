[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'import-i9-runtime-env.ps1')
& (Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe') (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') 'status'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
