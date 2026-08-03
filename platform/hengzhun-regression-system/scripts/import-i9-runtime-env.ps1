[CmdletBinding()]
param()

$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
if (-not (Test-Path -LiteralPath $runtimeEnv -PathType Leaf)) { return }

Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}

if (-not $env:MIMO_API_KEY -and $env:MIMO_MODEL_API_KEY) {
    [Environment]::SetEnvironmentVariable('MIMO_API_KEY', $env:MIMO_MODEL_API_KEY, 'Process')
}
