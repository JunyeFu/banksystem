param(
  [string]$BaseUrl='http://127.0.0.1:13000/fineract-provider',
  [string]$Tenant='default',
  [string]$Username=$env:FINERACT_USERNAME,
  [string]$Password=$env:FINERACT_PASSWORD,
  [string]$TargetDate='2026-07-31',
  [string]$RestoreDate='2026-07-10'
)
$ErrorActionPreference='Stop'
$basic=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$Username`:$Password"));$headers=@{Authorization="Basic $basic";'fineract-platform-tenantid'=$Tenant;'Content-Type'='application/json'}
$config=Invoke-RestMethod -Uri "$BaseUrl/api/v1/configurations/name/enable-business-date" -Headers $headers
if(-not $config.enabled){throw 'Fineract business date is disabled'}
try {
  $body=@{type='BUSINESS_DATE';date=$TargetDate;dateFormat='yyyy-MM-dd';locale='en'}|ConvertTo-Json
  $changed=Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/businessdate" -Headers $headers -Body $body
  $actual=(Invoke-RestMethod -Uri "$BaseUrl/api/v1/businessdate/BUSINESS_DATE" -Headers $headers).date -join '-'
  if($actual -ne ([datetime]$TargetDate).ToString('yyyy-M-d')){throw "Business date mismatch: $actual"}
  "business-date=$actual PASS"
} finally {
  $restore=@{type='BUSINESS_DATE';date=$RestoreDate;dateFormat='yyyy-MM-dd';locale='en'}|ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/businessdate" -Headers $headers -Body $restore|Out-Null
}
