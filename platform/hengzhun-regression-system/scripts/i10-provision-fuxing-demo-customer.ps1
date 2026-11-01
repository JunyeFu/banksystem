[CmdletBinding()]
param(
  [switch]$AllowFixtureSeed
)

# Creates an isolated local Keycloak test identity and maps it to an existing
# seeded demonstration customer.  It deliberately never calls fixtures:reset
# or fixtures:seed.  The generated password exists only in process memory and
# is immediately passed to the DPAPI enrollment helper via stdin.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$keycloakContainer = 'mifos-channel-keycloak-1'
$keycloakRunning = docker inspect -f '{{.State.Running}}' $keycloakContainer 2>$null
if ($LASTEXITCODE -ne 0 -or $keycloakRunning -ne 'true') { throw 'I10_BANK_KEYCLOAK_NOT_RUNNING' }

$authoritativeCredentialRef = (& $node (Join-Path $PSScriptRoot 'i10-resolve-live-credential.cjs')).Trim()
if ($LASTEXITCODE -ne 0 -or $authoritativeCredentialRef -notmatch '^credential_[0-9a-f-]{36}$') { throw 'I10_LIVE_CREDENTIAL_NOT_FOUND' }
$existingCredentialJson = (& $node (Join-Path $PSScriptRoot 'i10-read-current-user-credential.cjs') $authoritativeCredentialRef | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'I10_CREDENTIAL_READ_FAILED' }
$existingCredential = $existingCredentialJson | ConvertFrom-Json
$username = [string]$existingCredential.username
$password = [string]$existingCredential.password
if ([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)) { throw 'I10_CREDENTIAL_READ_FAILED' }
$passwordTransport = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($password))

$containerCommand = @'
set -eu
PASSWORD_B64=$(cat | tr -cd 'A-Za-z0-9+/=')
PASSWORD=$(printf %s "$PASSWORD_B64" | base64 -d)
KCADM=/opt/keycloak/bin/kcadm.sh
$KCADM config credentials --server http://127.0.0.1:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
USER_ID=$($KCADM get users -r bank-customer -q username="$HZ_USERNAME" --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
if test -z "$USER_ID"; then USER_ID=$($KCADM create users -r bank-customer -s username="$HZ_USERNAME" -s enabled=true -s firstName=Hengzhun -s lastName=RegressionCustomer -s email="$HZ_USERNAME@example.invalid" -s emailVerified=true -s 'requiredActions=[]' -i 2>/dev/null); fi
test -n "$USER_ID"
$KCADM set-password -r bank-customer --userid "$USER_ID" --new-password "$PASSWORD" >/dev/null 2>&1
$KCADM add-roles -r bank-customer --uid "$USER_ID" --rolename CUSTOMER >/dev/null 2>&1 || true
CLIENT_UUID=$($KCADM get clients -r bank-internal -q clientId=bank-channel-service --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
SERVICE_USER_ID=$($KCADM get clients/$CLIENT_UUID/service-account-user -r bank-internal --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
$KCADM add-roles -r bank-internal --uid "$SERVICE_USER_ID" --rolename TEST_SUPPORT >/dev/null 2>&1 || true
CLIENT_SECRET=$($KCADM get clients/$CLIENT_UUID/client-secret -r bank-internal --fields value --format csv --noquotes 2>/dev/null | tail -n 1)
test -n "$CLIENT_SECRET"
printf '%s|%s' "$USER_ID" "$CLIENT_SECRET"
'@
$containerCommand = $containerCommand.Replace("`r`n", "`n")
$configuration = [string]::Join('', @($passwordTransport | docker exec -e "HZ_USERNAME=$username" -i $keycloakContainer sh -lc $containerCommand))
if ($LASTEXITCODE -ne 0 -or $configuration.IndexOf('|') -lt 1) { throw 'I10_BANK_ACCOUNT_PROVISION_FAILED' }
$separator = $configuration.IndexOf('|')
$subject = $configuration.Substring(0, $separator)
$clientSecret = $configuration.Substring($separator + 1)

try {
  $token = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:19000/realms/bank-internal/protocol/openid-connect/token' -ContentType 'application/x-www-form-urlencoded' -Body @{ grant_type='client_credentials'; client_id='bank-channel-service'; client_secret=$clientSecret } -TimeoutSec 20
  $headers = @{ Authorization = 'Bearer ' + $token.access_token; 'Content-Type' = 'application/json' }
  try {
    $fixture = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:18443/internal/test-support/v1/fixtures/customer.alice' -Headers $headers -TimeoutSec 20
  } catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($statusCode -ne 404 -or -not $AllowFixtureSeed) { throw 'I10_BANK_FIXTURE_NOT_READY' }
    $seeded = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/internal/test-support/v1/fixtures:seed' -Headers $headers -Body '{}' -TimeoutSec 120
    if ($seeded.status -ne 'SEEDED') { throw 'I10_BANK_FIXTURE_SEED_FAILED' }
    $fixture = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:18443/internal/test-support/v1/fixtures/customer.alice' -Headers $headers -TimeoutSec 20
  }
  if (-not $fixture.fineractClientId) { throw 'I10_BANK_FIXTURE_NOT_READY' }
  $linked = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/internal/test-support/v1/identities:link' -Headers $headers -Body (@{ subject=$subject; logicalRef='customer.alice' } | ConvertTo-Json -Compress) -TimeoutSec 20
  if ($linked.status -ne 'LINKED') { throw 'I10_BANK_IDENTITY_LINK_FAILED' }
  try {
    $scenarioFixture = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/internal/test-support/v1/customer-scenario:seed' -Headers $headers -Body (@{ subject=$subject; logicalCustomerRef='customer.alice'; destinationCustomerRef='customer.bob' } | ConvertTo-Json -Compress) -TimeoutSec 60
  } catch {
    # The local/test endpoint intentionally returns only a safe symbolic reason.
    # Do not print response bodies, headers, tokens, or account data here.
    throw 'I10_BANK_SCENARIO_FIXTURE_FAILED'
  }
  if ($scenarioFixture.status -ne 'READY') { throw ('I10_BANK_SCENARIO_FIXTURE_FAILED_' + ([string]$scenarioFixture.failureStage -replace '[^A-Za-z0-9_]', '') + '_' + ([string]$scenarioFixture.failureHint -replace '[^A-Za-z0-9_]', '')) }
  $enrollmentPayload = [ordered]@{ namespace='hengzhun-local'; username=$username; password=$password; label='复兴银行本机受控验收客户'; credentialRef=$authoritativeCredentialRef } | ConvertTo-Json -Compress
  try { $null = $enrollmentPayload | ConvertFrom-Json } catch { throw 'I10_CREDENTIAL_ENROLL_PAYLOAD_INVALID' }
  $enrollmentProcessInfo = [Diagnostics.ProcessStartInfo]::new()
  $enrollmentProcessInfo.FileName = $node
  $enrollmentProcessInfo.Arguments = '"' + (Join-Path $PSScriptRoot 'i10-enroll-current-user-credential.cjs') + '"'
  $enrollmentProcessInfo.UseShellExecute = $false
  $enrollmentProcessInfo.CreateNoWindow = $true
  $enrollmentProcessInfo.RedirectStandardInput = $true
  $enrollmentProcessInfo.RedirectStandardOutput = $true
  $enrollmentProcessInfo.RedirectStandardError = $true
  $enrollmentProcess = [Diagnostics.Process]::new()
  $enrollmentProcess.StartInfo = $enrollmentProcessInfo
  [void]$enrollmentProcess.Start()
  $enrollmentBytes = [Text.UTF8Encoding]::new($false).GetBytes($enrollmentPayload)
  $enrollmentProcess.StandardInput.BaseStream.Write($enrollmentBytes, 0, $enrollmentBytes.Length)
  [Array]::Clear($enrollmentBytes, 0, $enrollmentBytes.Length)
  $enrollmentProcess.StandardInput.Close()
  $enrollment = $enrollmentProcess.StandardOutput.ReadToEnd()
  $enrollmentError = $enrollmentProcess.StandardError.ReadToEnd()
  $enrollmentProcess.WaitForExit()
  if ($enrollmentProcess.ExitCode -ne 0) {
    try {
      $safeEnrollmentFailure = $enrollmentError | ConvertFrom-Json
      throw ('I10_CREDENTIAL_ENROLL_FAILED_' + ([string]$safeEnrollmentFailure.failureStage -replace '[^A-Z0-9_]', '') + '_BYTES_' + [int]$safeEnrollmentFailure.inputBytes + '_FIRST_' + [int]$safeEnrollmentFailure.firstByte)
    } catch [System.Management.Automation.RuntimeException] { throw }
    catch { throw 'I10_CREDENTIAL_ENROLL_FAILED' }
  }
  $enrollmentResult = $enrollment | ConvertFrom-Json
  if ($enrollmentResult.status -ne 'READY' -or [string]::IsNullOrWhiteSpace($enrollmentResult.credentialRef)) { throw 'I10_CREDENTIAL_ENROLL_FAILED' }
  $scenarioPath = Join-Path $root '.data\tests\i10-stage8-live\scenario.json'
  if (Test-Path -LiteralPath $scenarioPath) {
    $scenario = Get-Content -LiteralPath $scenarioPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $scenario.credentialRef = [string]$enrollmentResult.credentialRef
    [IO.File]::WriteAllText($scenarioPath, ($scenario | ConvertTo-Json -Depth 32), [Text.UTF8Encoding]::new($false))
  }
  [ordered]@{ status='READY'; credentialRef=[string]$enrollmentResult.credentialRef; fixture='customer.alice'; scenario='I10_BROWSER_OCR'; resetPerformed=$false; fixtureSeeded=[bool]$AllowFixtureSeed } | ConvertTo-Json -Compress
} finally {
  $password = ''
  $clientSecret = ''
  $configuration = ''
}
