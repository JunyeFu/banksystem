[CmdletBinding()]
param(
  [string]$EnvironmentPath = (Join-Path $PSScriptRoot '..\..\.env'),
  [string]$BaseUrl = 'http://127.0.0.1:13000/fineract-provider'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EnvironmentPath -PathType Leaf)) {
  throw 'FINERACT_ENVIRONMENT_MISSING'
}

$lines = @(Get-Content -LiteralPath $EnvironmentPath)
$values = @{}
foreach ($line in $lines) {
  if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') {
    $values[$Matches[1]] = $Matches[2]
  }
}

foreach ($name in @('FINERACT_USERNAME', 'FINERACT_PASSWORD', 'FINERACT_ADMIN_USERNAME', 'FINERACT_ADMIN_PASSWORD')) {
  if ([string]::IsNullOrWhiteSpace($values[$name])) {
    throw "FINERACT_CONFIG_MISSING:$name"
  }
}
$tenant = if ([string]::IsNullOrWhiteSpace($values['FINERACT_TENANT'])) { 'default' } else { $values['FINERACT_TENANT'] }
$adminUsername = [string]$values['FINERACT_ADMIN_USERNAME']
$adminPassword = [string]$values['FINERACT_ADMIN_PASSWORD']

if ($values['FINERACT_USERNAME'] -ne $adminUsername) {
  throw 'FINERACT_CHANNEL_ADMIN_IDENTITY_MISMATCH'
}

function New-AuthorizationHeader([string]$Username, [string]$Password) {
  $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Username}:${Password}"))
  return "Basic $encoded"
}

function Test-FineractCredential([string]$Username, [string]$Password) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 15 `
      -Uri "$BaseUrl/api/v1/offices?limit=1" `
      -Headers @{ Authorization = (New-AuthorizationHeader $Username $Password); 'fineract-platform-tenantid' = $tenant }
  } catch {
    throw 'FINERACT_AUTH_PROBE_UNAVAILABLE'
  }
  if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return $true }
  if ($response.StatusCode -eq 401 -or $response.StatusCode -eq 403) { return $false }
  throw "FINERACT_AUTH_PROBE_FAILED:$($response.StatusCode)"
}

$rotated = $false
if (-not (Test-FineractCredential $adminUsername $adminPassword)) {
  if ($adminUsername -ne 'mifos') {
    throw 'FINERACT_ADMIN_CREDENTIAL_MISMATCH'
  }
  $body = @{ password = $adminPassword; repeatPassword = $adminPassword } | ConvertTo-Json -Compress
  try {
    $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 15 -Method Post `
      -Uri "$BaseUrl/api/v1/users/1/pwd" `
      -Headers @{
        Authorization = (New-AuthorizationHeader 'mifos' 'password')
        'fineract-platform-tenantid' = $tenant
        'Content-Type' = 'application/json'
      } -Body $body
  } catch {
    throw 'FINERACT_ADMIN_ROTATION_UNAVAILABLE'
  }
  if ($response.StatusCode -eq 401 -or $response.StatusCode -eq 403) {
    throw 'FINERACT_ADMIN_CREDENTIAL_MISMATCH'
  }
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "FINERACT_ADMIN_ROTATION_FAILED:$($response.StatusCode)"
  }
  if (-not (Test-FineractCredential $adminUsername $adminPassword)) {
    throw 'FINERACT_ADMIN_ROTATION_NOT_EFFECTIVE'
  }
  $rotated = $true
}

$updatedCount = 0
$updated = @($lines | ForEach-Object {
  if ($_ -match '^FINERACT_PASSWORD=') {
    $updatedCount += 1
    "FINERACT_PASSWORD=$adminPassword"
  } else {
    $_
  }
})
if ($updatedCount -ne 1) {
  throw 'FINERACT_CHANNEL_PASSWORD_DECLARATION_INVALID'
}
if ($values['FINERACT_PASSWORD'] -ne $adminPassword) {
  $resolved = (Resolve-Path -LiteralPath $EnvironmentPath).Path
  $temporary = "$resolved.tmp"
  [IO.File]::WriteAllLines($temporary, $updated, (New-Object Text.UTF8Encoding($false)))
  [IO.File]::Move($temporary, $resolved, $true)
}

$outcome = if ($rotated) { 'ROTATED_AND_SYNCHRONIZED' } else { 'VERIFIED_AND_SYNCHRONIZED' }
Write-Output "FINERACT_CREDENTIALS=$outcome"
