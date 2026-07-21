[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\probe-i9-stage6-live.ps1 2>&1
    $text = ($output | Out-String)
    if ($LASTEXITCODE -ne 0 -or -not $text.Contains('FORWARD_FLOW_VERIFIED')) {
        $output | Write-Output
        throw 'I9_STAGE6_FORWARD_FLOW_LIVE_FAILED'
    }
    $output | Write-Output
    Write-Output 'HENGZHUN_I9_STAGE6_FLOWISE_FORWARD_CONVERSATION_VERIFIED'
} finally {
    Pop-Location
}
