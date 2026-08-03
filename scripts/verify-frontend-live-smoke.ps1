[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-StatusCode {
  param([Parameter(Mandatory)][string]$Uri)

  try {
    return [int](Invoke-WebRequest -Uri $Uri -UseBasicParsing -ErrorAction Stop).StatusCode
  } catch {
    if ($null -ne $_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

function Assert-Status {
  param([Parameter(Mandatory)][string]$Uri, [Parameter(Mandatory)][int]$Expected)

  $actual = Get-StatusCode -Uri $Uri
  if ($actual -ne $Expected) {
    throw "Unexpected status for ${Uri}: expected $Expected, got $actual"
  }
}

function Assert-OidcIssuer {
  param([Parameter(Mandatory)][string]$Uri, [Parameter(Mandatory)][string]$ExpectedIssuer)

  $discovery = Invoke-RestMethod -Uri $Uri -UseBasicParsing
  if ($discovery.issuer -ne $ExpectedIssuer) {
    throw "Unexpected issuer for $Uri"
  }
  if ([string]::IsNullOrWhiteSpace($discovery.authorization_endpoint)) {
    throw "OIDC authorization endpoint is missing for $Uri"
  }
}

Assert-Status -Uri 'http://127.0.0.1:18443/health' -Expected 200
Assert-Status -Uri 'http://127.0.0.1:18082/portal/login' -Expected 200
Assert-Status -Uri 'http://127.0.0.1:18083/ops/login' -Expected 200

# A 401 here proves that the static portal proxies to Gateway and that the API
# remains protected when no browser session is supplied. No token is read or sent.
Assert-Status -Uri 'http://127.0.0.1:18082/api/customer/v1/accounts' -Expected 401
Assert-Status -Uri 'http://127.0.0.1:18083/api/operations/v1/eod/latest' -Expected 401

Assert-OidcIssuer -Uri 'http://127.0.0.1:19000/realms/bank-customer/.well-known/openid-configuration' -ExpectedIssuer 'http://127.0.0.1:19000/realms/bank-customer'
Assert-OidcIssuer -Uri 'http://127.0.0.1:19000/realms/bank-internal/.well-known/openid-configuration' -ExpectedIssuer 'http://127.0.0.1:19000/realms/bank-internal'

Write-Output 'FRONTEND_LIVE_SMOKE=PASS portal=protected oidc=ready gateway=healthy'
