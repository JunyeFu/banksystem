[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'prepare-i3.ps1') | Out-Null
$root = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $root '..\..')).Path
docker compose -f (Join-Path $repoRoot 'compose.channel.yaml') up -d --build bank-channel-service gateway
if ($LASTEXITCODE -ne 0) { throw 'Failed to rebuild the bank test-support API.' }
docker compose -f (Join-Path $repoRoot 'compose.channel.yaml') up -d --force-recreate gateway
if ($LASTEXITCODE -ne 0) { throw 'Failed to refresh the bank gateway upstream.' }

$deadline = (Get-Date).AddMinutes(3)
do {
    try { $bankHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:18443/health' -TimeoutSec 3 }
    catch { $bankHealth = $null }
    if ($bankHealth.status -in @('ok','UP')) { break }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if ($bankHealth.status -notin @('ok','UP')) { throw 'Bank channel service did not become healthy.' }
Start-Sleep -Seconds 5

$keycloakContainer = 'mifos-channel-keycloak-1'
$configurationCommand = @'
set -eu
KCADM=/opt/keycloak/bin/kcadm.sh
$KCADM config credentials --server http://127.0.0.1:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
CUSTOMER_USER_ID=$($KCADM get users -r bank-customer -q exact=true -q username=hz-i3-customer --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
CLIENT_UUID=$($KCADM get clients -r bank-internal -q clientId=bank-channel-service --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
SERVICE_USER_ID=$($KCADM get clients/$CLIENT_UUID/service-account-user -r bank-internal --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
$KCADM add-roles -r bank-internal --uid "$SERVICE_USER_ID" --rolename TEST_SUPPORT >/dev/null 2>&1 || true
CLIENT_SECRET=$($KCADM get clients/$CLIENT_UUID/client-secret -r bank-internal --fields value --format csv --noquotes 2>/dev/null | tail -n 1)
test -n "$CUSTOMER_USER_ID"
test -n "$CLIENT_SECRET"
printf '%s|%s' "$CUSTOMER_USER_ID" "$CLIENT_SECRET"
'@
$configuration = [string]::Join('', @(docker exec $keycloakContainer sh -lc $configurationCommand))
if ($LASTEXITCODE -ne 0 -or $configuration.IndexOf('|') -lt 1) { throw 'Failed to configure the test-support identity.' }
$separator = $configuration.IndexOf('|')
$customerSubject = $configuration.Substring(0, $separator)
$clientSecret = $configuration.Substring($separator + 1)
$token = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:19000/realms/bank-internal/protocol/openid-connect/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
    grant_type='client_credentials'; client_id='bank-channel-service'; client_secret=$clientSecret
} -TimeoutSec 20
$testSupportHeaders = @{ Authorization = 'Bearer ' + $token.access_token; 'Content-Type' = 'application/json' }
$null = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/internal/test-support/v1/fixtures:reset' -Headers $testSupportHeaders -Body '{}' -TimeoutSec 30
$seeded = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/internal/test-support/v1/fixtures:seed' -Headers $testSupportHeaders -Body '{}' -TimeoutSec 120
if ($seeded.status -ne 'SEEDED') { throw 'Synthetic bank fixture seeding failed.' }
$linked = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/internal/test-support/v1/identities:link' -Headers $testSupportHeaders -Body (@{subject=$customerSubject;logicalRef='customer.alice'} | ConvertTo-Json -Compress) -TimeoutSec 30
if ($linked.status -ne 'LINKED') { throw 'Synthetic customer identity link failed.' }
[ordered]@{
    status = 'READY'
    batch = 'I4'
    persistence = 'SQLite only'
    cases = @('LOGIN_PROFILE','ACCOUNT_OWNERSHIP','AUTH_REJECTION_RECOVERY')
    fixture = 'customer.alice linked through authorized test-support API'
    secrets = 'stored-only-in-ignored-runtime-env'
} | ConvertTo-Json -Compress
