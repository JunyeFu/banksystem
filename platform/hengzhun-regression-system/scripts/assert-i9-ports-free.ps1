[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ports = 3006, 18788, 18789
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in $ports }

if ($listeners) {
    $details = $listeners | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)" }
    throw "I9 formal TCP port is already occupied: $($details -join ', ')"
}

Write-Output 'HENGZHUN_I9_PORTS_FREE'
