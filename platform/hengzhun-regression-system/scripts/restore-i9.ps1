param([Parameter(Mandatory = $true)][string]$ManifestPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
& $node (Join-Path $root 'scripts\i9-sqlite-snapshot.cjs') restore $ManifestPath
exit $LASTEXITCODE
