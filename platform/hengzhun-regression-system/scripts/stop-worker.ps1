[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root '.data\worker.pid'
if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
    [ordered]@{ status = 'NOT_RUNNING' } | ConvertTo-Json -Compress
    return
}
$workerPid = [int]([System.IO.File]::ReadAllText($pidFile).Trim())
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$workerPid" -ErrorAction SilentlyContinue
if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine -like '*hengzhun-regression-system*worker*index.cjs*') {
    Stop-Process -Id $workerPid -Force
}
Remove-Item -LiteralPath $pidFile -Force
[ordered]@{ status = 'STOPPED' } | ConvertTo-Json -Compress
