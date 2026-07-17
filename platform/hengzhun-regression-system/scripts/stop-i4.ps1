[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'stop-authoring-worker.ps1') | Out-Null
& (Join-Path $PSScriptRoot 'stop-i3.ps1')
