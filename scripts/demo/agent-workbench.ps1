param([Parameter(Mandatory=$true)][ValidateSet('start','status','stop')][string]$Command)
$ErrorActionPreference='Stop'
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$productRoot=Join-Path $repoRoot 'platform/hengzhun-regression-system'
$nodePath=[IO.Path]::GetFullPath((Join-Path $productRoot 'runtime/node-v24.19.0-win-x64/node.exe'))
$entryPath=[IO.Path]::GetFullPath((Join-Path $productRoot 'agent-cli/bin/hz-agent-web.mjs'))
$receiptPath=Join-Path $productRoot '.data/agent-workbench/web-process.json'
function Get-OwnedWebProcess {
    if (-not (Test-Path -LiteralPath $receiptPath)) { return $null }
    $receipt=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $processInfo=Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f [int]$receipt.pid)
    if (-not $processInfo) { return $null }
    # A reused PID is not our old process. Never stop it; the listening-port
    # check below still prevents starting over an unrelated web service.
    if ($processInfo.CreationDate.ToUniversalTime() -ne ([datetime]::Parse($receipt.createdAt)).ToUniversalTime()) { return $null }
    if ($processInfo.ExecutablePath -ne $nodePath -or $processInfo.CommandLine -notlike ('*"'+$entryPath+'"*')) { throw 'AGENT_WEB_PROCESS_OWNERSHIP_CONFLICT' }
    return $processInfo
}
$owned=Get-OwnedWebProcess
if ($Command -eq 'status') {
    if ($owned) { Write-Output ("AGENT_WEB=RUNNING pid={0} url=http://127.0.0.1:18790" -f $owned.ProcessId) }
    else { Write-Output 'AGENT_WEB=NOT_RUNNING' }
    exit 0
}
if ($Command -eq 'stop') {
    if ($owned) { Stop-Process -Id $owned.ProcessId -ErrorAction Stop }
    Write-Output 'AGENT_WEB=STOPPED_OR_NOT_RUNNING otherServices=UNCHANGED outcome=NOT_A_WORKER_CANCELLATION'
    exit 0
}
if ($owned) { Write-Output ("AGENT_WEB=ALREADY_RUNNING pid={0}" -f $owned.ProcessId); exit 0 }
if (Get-NetTCPConnection -State Listen -LocalPort 18790 -ErrorAction SilentlyContinue) { throw 'AGENT_WEB_PORT_IN_USE' }
$processInfo=Start-Process -FilePath $nodePath -ArgumentList ('"'+$entryPath+'"') -WorkingDirectory $productRoot -WindowStyle Hidden -PassThru
$current=Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $processInfo.Id)
if (-not $current) { throw 'AGENT_WEB_START_FAILED' }
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($receiptPath)) | Out-Null
@{pid=$current.ProcessId;createdAt=$current.CreationDate.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output ("AGENT_WEB=SPAWNED pid={0} readiness=CHECK_BOOTSTRAP url=http://127.0.0.1:18790" -f $current.ProcessId)
