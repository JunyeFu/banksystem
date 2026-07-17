[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'prepare-i4.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'start-i3.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'stop-worker.ps1') | Out-Null

[ordered]@{
    status = 'STARTED'
    batch = 'I5'
    harness = 'http://127.0.0.1:18788'
    worker = 'STOPPED_FOR_CONTROLLED_FAILURE_STIMULUS'
    persistence = 'SQLite only'
} | ConvertTo-Json -Compress
