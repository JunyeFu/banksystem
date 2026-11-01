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
$admin = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" `
  -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = 'admin-cli'; grant_type = 'password';
    username = $values['KEYCLOAK_ADMIN_USERNAME']; password = $values['KEYCLOAK_ADMIN_PASSWORD']
  }
$headers = @{ Authorization = "Bearer $($admin.access_token)"; 'Content-Type' = 'application/json' }
$name = 'rf056-negative-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$clientId = $null

function Get-Claims([string]$accessToken) {
  $part = $accessToken.Split('.')[1].Replace('-', '+').Replace('_', '/')
  $part = $part.PadRight($part.Length + ((4 - $part.Length % 4) % 4), '=')
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
}

function Get-ProbeToken([string]$secret) {
  $response = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/bank-customer/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
      client_id = $name; client_secret = $secret; grant_type = 'password';
      username = $values['DEMO_CUSTOMER_USERNAME']; password = $values['DEMO_CUSTOMER_PASSWORD']
    }
  return [string]$response.access_token
}

function Assert-Unauthorized([string]$accessToken) {
  $response = Invoke-WebRequest -SkipHttpErrorCheck -Uri "$GatewayBaseUrl/api/customer/v1/accounts" `
    -Headers @{ Authorization = "Bearer $accessToken" }
  if ([int]$response.StatusCode -ne 401) { throw "RF056_EXPECTED_401_GOT_$([int]$response.StatusCode)" }
}

try {
  $clientBody = @{ clientId = $name; enabled = $true; publicClient = $false; protocol = 'openid-connect';
    standardFlowEnabled = $false; directAccessGrantsEnabled = $true } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients" `
    -Headers $headers -Body $clientBody | Out-Null
  $clients = @(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients?clientId=$name" -Headers $headers |
      Where-Object { $_.clientId -eq $name })
  if ($clients.Count -ne 1) { throw 'RF056_NEGATIVE_CLIENT_NOT_UNIQUE' }
  $clientId = $clients[0].id
  $secret = (Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients/$clientId/client-secret" -Headers $headers).value

  $wrongAudience = Get-ProbeToken $secret
  $claims = Get-Claims $wrongAudience
  if (@($claims.aud) -contains 'bank-channel-service' -or $claims.azp -ne $name -or
      @($claims.realm_access.roles) -notcontains 'CUSTOMER') { throw 'RF056_NEGATIVE_AUDIENCE_PRECONDITION_FAILED' }
  Assert-Unauthorized $wrongAudience

  $mapper = @{ name = 'bank-channel-audience'; protocol = 'openid-connect'; protocolMapper = 'oidc-audience-mapper';
    config = @{ 'included.custom.audience' = 'bank-channel-service'; 'access.token.claim' = 'true'; 'id.token.claim' = 'false' } }
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients/$clientId/protocol-mappers/models" `
    -Headers $headers -Body ($mapper | ConvertTo-Json -Depth 5 -Compress) | Out-Null
  $wrongParty = Get-ProbeToken $secret
  $claims = Get-Claims $wrongParty
  if (@($claims.aud) -notcontains 'bank-channel-service' -or $claims.azp -ne $name -or
      @($claims.realm_access.roles) -notcontains 'CUSTOMER') { throw 'RF056_NEGATIVE_AZP_PRECONDITION_FAILED' }
  Assert-Unauthorized $wrongParty
  Write-Output 'RF056_TOKEN_BOUNDARY=PASS wrongAudience=401 wrongAzp=401 correctRole=PRESENT'
} finally {
  if ($null -ne $clientId) {
    Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/bank-customer/clients/$clientId" -Headers $headers | Out-Null
  }
}
