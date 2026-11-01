[CmdletBinding()]
param(
  [string]$EnvironmentPath = (Join-Path $PSScriptRoot '..\..\.env'),
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:19000',
  [string]$GatewayBaseUrl = 'http://127.0.0.1:18443'
)

$ErrorActionPreference = 'Stop'
$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvironmentPath) {
  if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
foreach ($name in @('KEYCLOAK_ADMIN_USERNAME', 'KEYCLOAK_ADMIN_PASSWORD',
    'DEMO_CUSTOMER_USERNAME', 'DEMO_CUSTOMER_PASSWORD', 'DEMO_OPERATOR_USERNAME', 'DEMO_OPERATOR_PASSWORD')) {
  if ([string]::IsNullOrWhiteSpace($values[$name])) { throw "DEMO_IDENTITY_CONFIG_MISSING:$name" }
}
$admin = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'admin-cli'; grant_type = 'password';
    username = $values['KEYCLOAK_ADMIN_USERNAME']; password = $values['KEYCLOAK_ADMIN_PASSWORD']
  }
$adminHeaders = @{ Authorization = "Bearer $($admin.access_token)"; 'Content-Type' = 'application/json' }

function Ensure-Client([string]$realm, [string]$name, [hashtable]$spec) {
  $base = "$KeycloakBaseUrl/admin/realms/$realm/clients"
  $listed = Invoke-RestMethod -Uri "$base`?clientId=$name" -Headers $adminHeaders
  $matches = @($listed | Where-Object { $_.clientId -eq $name })
  if ($matches.Count -eq 0) {
    $spec.clientId = $name
    $spec.enabled = $true
    $spec.protocol = 'openid-connect'
    Invoke-RestMethod -Method Post -Uri $base -Headers $adminHeaders -Body ($spec | ConvertTo-Json -Depth 8 -Compress) | Out-Null
    $listed = Invoke-RestMethod -Uri "$base`?clientId=$name" -Headers $adminHeaders
    $matches = @($listed | Where-Object { $_.clientId -eq $name })
  }
  if ($matches.Count -ne 1) { throw "DEMO_IDENTITY_CLIENT_NOT_UNIQUE:$realm`:$name" }
  return $matches[0]
}

function Ensure-AudienceMapper([string]$realm, [string]$clientId) {
  $base = "$KeycloakBaseUrl/admin/realms/$realm/clients/$clientId/protocol-mappers/models"
  $existing = @(Invoke-RestMethod -Uri $base -Headers $adminHeaders | Where-Object { $_.name -eq 'bank-channel-audience' })
  $mapper = @{
    name = 'bank-channel-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper'
    config = @{ 'included.custom.audience' = 'bank-channel-service'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' }
  }
  if ($existing.Count -eq 0) {
    Invoke-RestMethod -Method Post -Uri $base -Headers $adminHeaders -Body ($mapper | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  } elseif ($existing.Count -eq 1) {
    $mapper.id = $existing[0].id
    Invoke-RestMethod -Method Put -Uri "$base/$($existing[0].id)" -Headers $adminHeaders -Body ($mapper | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  } else { throw "DEMO_IDENTITY_AUDIENCE_MAPPER_NOT_UNIQUE:$realm`:$clientId" }
}

function Ensure-User([string]$realm, [string]$username, [string]$password, [string[]]$roles) {
  $base = "$KeycloakBaseUrl/admin/realms/$realm/users"
  $listed = Invoke-RestMethod -Uri "$base`?exact=true&username=$username" -Headers $adminHeaders
  $matches = @($listed | Where-Object { $_.username -eq $username })
  if ($matches.Count -eq 0) {
    $body = @{ username = $username; enabled = $true; emailVerified = $true;
      email = "$username@example.invalid"; firstName = 'Demo'; lastName = 'User'; requiredActions = @() }
    Invoke-RestMethod -Method Post -Uri $base -Headers $adminHeaders -Body ($body | ConvertTo-Json -Depth 6 -Compress) | Out-Null
    $listed = Invoke-RestMethod -Uri "$base`?exact=true&username=$username" -Headers $adminHeaders
    $matches = @($listed | Where-Object { $_.username -eq $username })
  }
  if ($matches.Count -ne 1) { throw "DEMO_IDENTITY_USER_NOT_UNIQUE:$realm`:$username" }
  $id = [string]$matches[0].id
  $user = @{ username = $username; enabled = $true; emailVerified = $true;
    email = "$username@example.invalid"; firstName = 'Demo'; lastName = 'User'; requiredActions = @() }
  Invoke-RestMethod -Method Put -Uri "$base/$id" -Headers $adminHeaders -Body ($user | ConvertTo-Json -Depth 6 -Compress) | Out-Null
  Invoke-RestMethod -Method Put -Uri "$base/$id/reset-password" -Headers $adminHeaders `
    -Body (@{ type = 'password'; temporary = $false; value = $password } | ConvertTo-Json -Compress) | Out-Null
  foreach ($name in $roles) {
    $role = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles/$name" -Headers $adminHeaders
    Invoke-RestMethod -Method Post -Uri "$base/$id/role-mappings/realm" -Headers $adminHeaders `
      -Body (ConvertTo-Json -InputObject @($role) -Compress -Depth 6) | Out-Null
  }
  return $id
}

$customerClient = Ensure-Client 'bank-customer' 'customer-portal' @{
  publicClient = $true; standardFlowEnabled = $true; directAccessGrantsEnabled = $false;
  redirectUris = @('http://127.0.0.1:18443/*', 'http://127.0.0.1:18082/*');
  webOrigins = @('http://127.0.0.1:18443', 'http://127.0.0.1:18082');
  attributes = @{ 'pkce.code.challenge.method' = 'S256' }
}
$operatorClient = Ensure-Client 'bank-internal' 'operations-console' @{
  publicClient = $true; standardFlowEnabled = $true; directAccessGrantsEnabled = $false;
  redirectUris = @('http://127.0.0.1:18443/*', 'http://127.0.0.1:18083/*');
  webOrigins = @('http://127.0.0.1:18443', 'http://127.0.0.1:18083');
  attributes = @{ 'pkce.code.challenge.method' = 'S256' }
}
$serviceClient = Ensure-Client 'bank-internal' 'bank-channel-service' @{
  publicClient = $false; standardFlowEnabled = $false; directAccessGrantsEnabled = $false;
  serviceAccountsEnabled = $true
}
$goldenCustomerClient = Ensure-Client 'bank-customer' 'bank-golden-path' @{
  publicClient = $false; standardFlowEnabled = $false; directAccessGrantsEnabled = $true
}
$goldenInternalClient = Ensure-Client 'bank-internal' 'bank-golden-path' @{
  publicClient = $false; standardFlowEnabled = $false; directAccessGrantsEnabled = $true
}
$customerClientConfig = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients/$($customerClient.id)" -Headers $adminHeaders
$customerClientConfig.directAccessGrantsEnabled = $false
Invoke-RestMethod -Method Put -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients/$($customerClient.id)" `
  -Headers $adminHeaders -Body ($customerClientConfig | ConvertTo-Json -Depth 12 -Compress) | Out-Null
$customerClientConfig = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients/$($customerClient.id)" -Headers $adminHeaders
if ($customerClientConfig.directAccessGrantsEnabled) { throw 'DEMO_CUSTOMER_DIRECT_GRANT_STILL_ENABLED' }
Ensure-AudienceMapper 'bank-customer' $customerClient.id
Ensure-AudienceMapper 'bank-internal' $operatorClient.id
Ensure-AudienceMapper 'bank-internal' $serviceClient.id
Ensure-AudienceMapper 'bank-customer' $goldenCustomerClient.id
Ensure-AudienceMapper 'bank-internal' $goldenInternalClient.id
$customerId = Ensure-User 'bank-customer' $values['DEMO_CUSTOMER_USERNAME'] $values['DEMO_CUSTOMER_PASSWORD'] @('CUSTOMER')
$operatorId = Ensure-User 'bank-internal' $values['DEMO_OPERATOR_USERNAME'] $values['DEMO_OPERATOR_PASSWORD'] @('PAYMENT_OPERATOR', 'AUDITOR')

$serviceUser = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients/$($serviceClient.id)/service-account-user" -Headers $adminHeaders
$testRole = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/roles/TEST_SUPPORT" -Headers $adminHeaders
Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/users/$($serviceUser.id)/role-mappings/realm" `
  -Headers $adminHeaders -Body (ConvertTo-Json -InputObject @($testRole) -Compress -Depth 6) | Out-Null
$secret = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-internal/clients/$($serviceClient.id)/client-secret" -Headers $adminHeaders
$token = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/bank-internal/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'bank-channel-service'; client_secret = $secret.value; grant_type = 'client_credentials'
  }
$tokenParts = $token.access_token.Split('.')
$paddedClaims = $tokenParts[1].Replace('-', '+').Replace('_', '/')
$paddedClaims = $paddedClaims.PadRight($paddedClaims.Length + ((4 - $paddedClaims.Length % 4) % 4), '=')
$claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($paddedClaims)) | ConvertFrom-Json
if (-not (@($claims.aud) -contains 'bank-channel-service') -or $claims.azp -ne 'bank-channel-service') {
  throw 'DEMO_SERVICE_TOKEN_CLAIMS_INVALID'
}
$testHeaders = @{ Authorization = "Bearer $($token.access_token)"; 'Content-Type' = 'application/json' }
$seed = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures:seed" -Headers $testHeaders -Body '{}'
if ($seed.status -ne 'SEEDED') { throw 'DEMO_IDENTITY_FIXTURE_NOT_READY' }
$link = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/identities:link" -Headers $testHeaders `
  -Body (@{ subject = $customerId; logicalRef = 'customer.alice' } | ConvertTo-Json -Compress)
if ($link.status -ne 'LINKED') { throw 'DEMO_IDENTITY_MAPPING_FAILED' }
Write-Output "DEMO_FIXED_IDENTITIES=READY customerId=$customerId operatorId=$operatorId fineractClientId=$($seed.'customer.alice'.fineractClientId)"
