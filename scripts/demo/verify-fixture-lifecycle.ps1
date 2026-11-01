[CmdletBinding()]
param(
  [string]$EnvironmentPath,
  [string]$GatewayBaseUrl = 'http://127.0.0.1:18443',
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:19000',
  [string]$FineractBaseUrl = 'http://127.0.0.1:13000/fineract-provider'
)

$ErrorActionPreference = 'Stop'
if (-not $EnvironmentPath) { $EnvironmentPath = Join-Path $PSScriptRoot '..\..\.env' }
$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvironmentPath) {
  if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
if ([string]::IsNullOrWhiteSpace($values['FINERACT_TENANT'])) { $values['FINERACT_TENANT'] = 'default' }
function Require([string]$name) {
  if ([string]::IsNullOrWhiteSpace($values[$name])) { throw "RF055_CONFIG_MISSING:$name" }
  return [string]$values[$name]
}
function Counts {
  $result = docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -Atc 'SELECT (SELECT count(*) FROM transfer_order)::text || ''|'' || (SELECT count(*) FROM security_audit_event)::text'
  if ($LASTEXITCODE -ne 0) { throw 'RF055_CHANNEL_COUNT_FAILED' }
  return [string]($result | Select-Object -Last 1)
}
function Assert-SameIds($left, $right) {
  foreach ($key in @('product.demo.primarySavings', 'product.demo.basicLoan', 'customer.alice', 'customer.bob', 'account.alice.primarySavings', 'account.bob.primarySavings')) {
    $field = if ($key.StartsWith('product.')) { 'fineractProductId' } elseif ($key.StartsWith('customer.')) { 'fineractClientId' } else { 'accountId' }
    if ($left.$key.$field -ne $right.$key.$field -or $right.$key.action -ne 'REUSED') {
      throw "RF055_FIXTURE_NOT_IDEMPOTENT:$key"
    }
  }
}

$admin = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'admin-cli'; grant_type = 'password'; username = (Require 'KEYCLOAK_ADMIN_USERNAME');
    password = (Require 'KEYCLOAK_ADMIN_PASSWORD')
  }
$adminHeaders = @{ Authorization = "Bearer $($admin.access_token)" }
$clients = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients?clientId=bank-channel-service" -Headers $adminHeaders
$client = @($clients | Where-Object { $_.clientId -eq 'bank-channel-service' })
if ($client.Count -eq 0) {
  $body = @{ clientId = 'bank-channel-service'; enabled = $true; publicClient = $false;
    protocol = 'openid-connect'; standardFlowEnabled = $false; directAccessGrantsEnabled = $false;
    serviceAccountsEnabled = $true } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients" -Headers ($adminHeaders + @{'Content-Type'='application/json'}) -Body $body | Out-Null
  $clients = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients?clientId=bank-channel-service" -Headers $adminHeaders
  $client = @($clients | Where-Object { $_.clientId -eq 'bank-channel-service' })
}
if ($client.Count -ne 1) { throw 'RF055_SERVICE_CLIENT_NOT_UNIQUE' }
$serviceUser = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients/$($client[0].id)/service-account-user" -Headers $adminHeaders
$role = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/roles/TEST_SUPPORT" -Headers $adminHeaders
Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/users/$($serviceUser.id)/role-mappings/realm" `
  -Headers ($adminHeaders + @{'Content-Type'='application/json'}) -Body (ConvertTo-Json -InputObject @($role) -Compress -Depth 6) | Out-Null
$secret = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients/$($client[0].id)/client-secret" -Headers $adminHeaders
$token = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/bank-internal/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'bank-channel-service'; client_secret = $secret.value; grant_type = 'client_credentials'
  }
$headers = @{ Authorization = "Bearer $($token.access_token)"; 'Content-Type' = 'application/json' }
$before = Counts
$endpoint = "$GatewayBaseUrl/internal/test-support/v1"
$initial = Invoke-RestMethod -Method Post -Uri "$endpoint/fixtures:seed" -Headers $headers -Body '{}'
if ($initial.status -ne 'SEEDED' -or -not $initial.'product.demo.basicLoan'.fineractProductId) {
  throw 'RF055_NEW_SEED_NOT_DEPLOYED'
}
foreach ($cycle in 1..2) {
  $reset = Invoke-RestMethod -Method Post -Uri "$endpoint/fixtures:reset" -Headers $headers -Body '{}'
  if ($reset.status -ne 'RESET') { throw "RF055_RESET_FAILED:$cycle" }
  $seed = Invoke-RestMethod -Method Post -Uri "$endpoint/fixtures:seed" -Headers $headers -Body '{}'
  if ($seed.status -ne 'SEEDED') { throw "RF055_SEED_FAILED:$cycle" }
  Assert-SameIds $initial $seed
}
$after = Counts
$beforeParts = $before.Split('|')
$afterParts = $after.Split('|')
if ($afterParts[0] -ne $beforeParts[0] -or [long]$afterParts[1] -lt [long]$beforeParts[1]) {
  throw 'RF055_BUSINESS_HISTORY_CHANGED'
}

$fineractHeaders = @{ Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$(Require 'FINERACT_USERNAME'):$(Require 'FINERACT_PASSWORD')")); 'fineract-platform-tenantid' = (Require 'FINERACT_TENANT') }
$loanProducts = Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/loanproducts" -Headers $fineractHeaders
$savingsProducts = Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/savingsproducts" -Headers $fineractHeaders
if (@($loanProducts | Where-Object name -eq 'Hengzhun Demo Loan').Count -ne 1) { throw 'RF055_LOAN_PRODUCT_DUPLICATE' }
if (@($savingsProducts | Where-Object name -eq 'BankSystem Demo Savings').Count -ne 1) { throw 'RF055_SAVINGS_PRODUCT_DUPLICATE' }
Write-Output "RF055_FIXTURE_LIFECYCLE=PASS cycles=2 loanProductId=$($initial.'product.demo.basicLoan'.fineractProductId) aliceClientId=$($initial.'customer.alice'.fineractClientId) businessHistory=UNCHANGED"
