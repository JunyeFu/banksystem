[CmdletBinding()]
param([string]$Destination)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$arguments = @((Join-Path $PSScriptRoot 'i9-stage8-portable.cjs'), 'export')
if ($Destination) { $arguments += @('--destination', $Destination) }
& $node @arguments
exit $LASTEXITCODE
