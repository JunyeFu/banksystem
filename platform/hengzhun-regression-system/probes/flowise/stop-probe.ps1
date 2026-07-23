[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 3006
)

$ErrorActionPreference = 'Stop'
$productRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $connection) {
    [ordered]@{ status = 'NOT_RUNNING'; port = $Port } | ConvertTo-Json -Compress
    exit 0
}

$processId = [int]$connection.OwningProcess
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
if (-not $processInfo -or -not $processInfo.CommandLine -or -not $processInfo.CommandLine.Contains($productRoot)) {
    throw "Port $Port is not owned by this product; refusing to stop process $processId"
}

Stop-Process -Id $processId
[ordered]@{ status = 'STOPPED'; port = $Port; processId = $processId } | ConvertTo-Json -Compress
