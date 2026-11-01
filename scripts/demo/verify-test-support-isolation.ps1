[CmdletBinding()]
param(
  [string]$EnvironmentPath,
  [string]$GatewayBaseUrl = 'http://127.0.0.1:18443',
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:19000'
)

$ErrorActionPreference = 'Stop'
if (-not $EnvironmentPath) { $EnvironmentPath = Join-Path $PSScriptRoot '..\..\.env' }
$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvironmentPath) {
  if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}

$admin = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'admin-cli'; grant_type = 'password'; username = $values['KEYCLOAK_ADMIN_USERNAME'];
    password = $values['KEYCLOAK_ADMIN_PASSWORD']
  }
$adminHeaders = @{ Authorization = "Bearer $($admin.access_token)" }
$clients = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients?clientId=bank-channel-service" -Headers $adminHeaders
$client = @($clients | Where-Object { $_.clientId -eq 'bank-channel-service' })
if ($client.Count -ne 1) { throw 'RF055_TEST_SUPPORT_CLIENT_NOT_UNIQUE' }
$secret = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients/$($client[0].id)/client-secret" -Headers $adminHeaders
$token = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/bank-internal/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'bank-channel-service'; client_secret = $secret.value; grant_type = 'client_credentials'
  }
$accessToken = [string]$token.access_token
$mainStatus = "header = `"Authorization: Bearer $accessToken`"" | docker exec -i mifos-channel-bank-channel-service-1 `
  curl -s -o /dev/null -w '%{http_code}' -K - http://127.0.0.1:8080/internal/test-support/v1/fixtures/customer.alice
if ($LASTEXITCODE -ne 0 -or [string]($mainStatus | Select-Object -Last 1) -ne '404') {
  throw "RF055_MAIN_LISTENER_NOT_ISOLATED:$mainStatus"
}

$headers = @{ Authorization = "Bearer $accessToken"; 'Content-Type' = 'application/json' }
$fixture = Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures/customer.alice" -Headers $headers
if (-not $fixture.fineractClientId) { throw 'RF055_DEDICATED_LISTENER_LOOKUP_FAILED' }
$seed = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures:seed" -Headers $headers -Body '{}'
if ($seed.status -ne 'SEEDED') { throw 'RF055_DEDICATED_LISTENER_SEED_FAILED' }

$defaultServices = @(docker compose --env-file $EnvironmentPath -f (Join-Path $PSScriptRoot '..\..\compose.channel.yaml') config --services)
if ($LASTEXITCODE -ne 0 -or 'mock-clearing-service' -in $defaultServices -or 'test-support-service' -notin $defaultServices) {
  throw 'RF055_DEFAULT_COMPOSE_PROFILE_FAILED'
}
Write-Output "RF055_TEST_SUPPORT_ISOLATION=PASS main=404 dedicated=SEEDED clientId=$($fixture.fineractClientId) mockDefault=ABSENT"
