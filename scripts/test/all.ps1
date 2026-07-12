param(
  [Parameter(Mandatory=$true)][string]$AdminToken,
  [Parameter(Mandatory=$true)][string]$FineractUsername,
  [Parameter(Mandatory=$true)][string]$FineractPassword
)
$ErrorActionPreference='Stop'
& "$PSScriptRoot/final-regression.ps1" -RunBackupDrill
& "$PSScriptRoot/customer-transfer-e2e.ps1" -AdminToken $AdminToken -FineractUsername $FineractUsername -FineractPassword $FineractPassword
& "$PSScriptRoot/customer-security-e2e.ps1" -AdminToken $AdminToken
& "$PSScriptRoot/loan-scoring-maker-checker-e2e.ps1" -AdminToken $AdminToken
Write-Output 'ALL_LOCAL_REGRESSION=PASS'
