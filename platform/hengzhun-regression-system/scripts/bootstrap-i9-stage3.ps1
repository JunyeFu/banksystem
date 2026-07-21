$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'I9_BUNDLED_NODE_MISSING' }

& $node (Join-Path $root 'scripts\i9-platform-bootstrap.cjs') @args
exit $LASTEXITCODE
