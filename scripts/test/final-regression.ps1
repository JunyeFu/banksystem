param(
  [string]$Gateway='http://127.0.0.1:18081',
  [string]$Fineract='http://127.0.0.1:13000/fineract-provider',
  [switch]$RunBackupDrill
)
$ErrorActionPreference='Stop'
$checks=@()
function Check([string]$Name,[scriptblock]$Action){try{& $Action;$script:checks+="$Name=PASS"}catch{$script:checks+="$Name=FAIL:$($_.Exception.Message)"}}
Check 'gateway-health' {if((Invoke-WebRequest -UseBasicParsing "$Gateway/health").StatusCode -ne 200){throw 'gateway health'}}
Check 'customer-web' {if((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:18080').StatusCode -ne 200){throw 'customer web'}}
Check 'fineract-health' {if((Invoke-WebRequest -UseBasicParsing "$Fineract/actuator/health").StatusCode -ne 200){throw 'fineract health'}}
Check 'unauthorized-customer' {try{Invoke-WebRequest -UseBasicParsing "$Gateway/api/customer/v1/accounts"|Out-Null;throw 'expected 401'}catch{if(-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401){throw}}}
Check 'unauthorized-operations' {try{Invoke-WebRequest -UseBasicParsing "$Gateway/api/operations/v1/cashiers"|Out-Null;throw 'expected 401'}catch{if(-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401){throw}}}
if($RunBackupDrill){Check 'core-restore' {& "$PSScriptRoot\..\backup\restore-core-drill.ps1"|Out-Null};$latest=Get-ChildItem "$PSScriptRoot\..\..\backups\channel" -Recurse -Filter bank_channel.dump|Sort-Object LastWriteTime -Descending|Select-Object -First 1;if($latest){Check 'channel-restore' {& "$PSScriptRoot\..\backup\restore-channel-drill.ps1" -Dump $latest.FullName|Out-Null}}}
$checks
if($checks | Where-Object {$_ -like '*=FAIL*'}){exit 1}
