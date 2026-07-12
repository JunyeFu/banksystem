param(
  [string]$BaseUrl = 'http://127.0.0.1:13000/fineract-provider',
  [string]$Tenant = 'default',
  [string]$Username = $env:FINERACT_USERNAME,
  [string]$Password = $env:FINERACT_PASSWORD
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Username) -or [string]::IsNullOrWhiteSpace($Password)) { throw 'FINERACT_USERNAME and FINERACT_PASSWORD are required' }
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$Username`:$Password"))
$response = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/v1/clients?limit=1" -Headers @{Authorization="Basic $basic"; 'fineract-platform-tenantid'=$Tenant} -TimeoutSec 20
if ($response.StatusCode -ne 200) { throw "Fineract read probe returned $($response.StatusCode)" }
Write-Output 'local-fineract-read=PASS'
