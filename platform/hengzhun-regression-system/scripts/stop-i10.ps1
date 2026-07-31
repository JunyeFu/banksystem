[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'progress.ps1')
Initialize-HengzhunProgress -Operation 'STOP' -StageTotal 4
try {
    & (Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe') (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') stop
    $code = $LASTEXITCODE
    if ($code -ne 0 -and $code -ne 130) { throw "STOP_LIFECYCLE_FAILED:$code" }
    exit $code
} catch {
    Fail-HengzhunProgress -ErrorValue $_ -LogPath '.data/logs/i9'
    Write-Error (Protect-HengzhunProgressText $_.Exception.Message)
    exit 1
}
