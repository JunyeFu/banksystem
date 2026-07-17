[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'

function New-RandomValue([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-EnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value, [bool]$PreserveExisting = $true) {
    $pattern = '^\s*' + [Regex]::Escape($Name) + '='
    $firstIndex = -1
    for ($index = 0; $index -lt $Lines.Count;) {
        if ($Lines[$index] -match $pattern) {
            if ($firstIndex -lt 0) {
                $firstIndex = $index
                $index++
            } else {
                $Lines.RemoveAt($index)
            }
        } else {
            $index++
        }
    }
    if ($firstIndex -ge 0) {
        if (-not $PreserveExisting) { $Lines[$firstIndex] = $Name + '=' + $Value }
        return
    }
    $Lines.Add($Name + '=' + $Value)
}

function Get-EnvMap([System.Collections.Generic.List[string]]$Lines) {
    $map = @{}
    foreach ($line in $Lines) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $map[$Matches[1]] = $Matches[2] }
    }
    return $map
}

& (Join-Path $PSScriptRoot 'prepare-i2.ps1') | Out-Null
$lines = [System.Collections.Generic.List[string]]::new()
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object { $lines.Add($_) }
Set-EnvValue $lines 'HENGZHUN_WORKER_TOKEN' (New-RandomValue 48)
Set-EnvValue $lines 'HENGZHUN_CREDENTIAL_I3_CUSTOMER_USERNAME' 'hz-i3-customer' $false
Set-EnvValue $lines 'HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD' (New-RandomValue 36)
Set-EnvValue $lines 'HENGZHUN_PORTAL_BASE_URL' 'http://127.0.0.1:18082'
[System.IO.File]::WriteAllLines($runtimeEnv, $lines, [System.Text.UTF8Encoding]::new($false))
$values = Get-EnvMap $lines

$keycloakContainer = 'mifos-channel-keycloak-1'
$running = docker inspect -f '{{.State.Running}}' $keycloakContainer 2>$null
if ($LASTEXITCODE -ne 0 -or $running -ne 'true') {
    throw 'External bank Keycloak is not running. Start the复兴银行 local environment before I3.'
}

$password = $values['HENGZHUN_CREDENTIAL_I3_CUSTOMER_PASSWORD']
$passwordTransport = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($password))
$containerCommand = @'
set -eu
PHASE=INITIALIZE
trap 'code=$?; if [ "$code" -ne 0 ]; then printf "FAILED_%s" "$PHASE"; fi' EXIT
HZ_PASSWORD_B64=$(cat | tr -cd 'A-Za-z0-9+/=')
HZ_PASSWORD=$(printf %s "$HZ_PASSWORD_B64" | base64 -d)
HZ_USERNAME=hz-i3-customer
KCADM=/opt/keycloak/bin/kcadm.sh
PHASE=AUTHENTICATE
$KCADM config credentials --server http://127.0.0.1:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
PHASE=QUERY_USER
USER_ID=$($KCADM get users -r bank-customer -q exact=true -q username="$HZ_USERNAME" --fields id --format csv --noquotes 2>/dev/null | tail -n 1)
if [ -z "$USER_ID" ]; then
  PHASE=CREATE_USER
  USER_ID=$($KCADM create users -r bank-customer -s username="$HZ_USERNAME" -s enabled=true -s firstName=Hengzhun -s lastName=RegressionCustomer -s email=hz-i3-customer@example.invalid -s emailVerified=true -i 2>/dev/null)
fi
PHASE=UPDATE_USER
$KCADM update users/"$USER_ID" -r bank-customer -s enabled=true -s firstName=Hengzhun -s lastName=RegressionCustomer -s email=hz-i3-customer@example.invalid -s emailVerified=true -s 'requiredActions=[]' >/dev/null 2>&1
PHASE=SET_PASSWORD
$KCADM set-password -r bank-customer --userid "$USER_ID" --new-password "$HZ_PASSWORD" >/dev/null 2>&1
PHASE=ASSIGN_ROLE
$KCADM add-roles -r bank-customer --uid "$USER_ID" --rolename CUSTOMER >/dev/null 2>&1 || true
PHASE=COMPLETE
printf PROVISIONED
'@
$provisionResult = $passwordTransport | docker exec -i $keycloakContainer sh -lc $containerCommand
$provisionText = [string]::Join('', @($provisionResult))
if ($LASTEXITCODE -ne 0 -or $provisionText -notmatch 'PROVISIONED') {
    $phase = if ($provisionText -match 'FAILED_([A-Z_]+)') { $Matches[1] } else { 'UNKNOWN' }
    throw "Failed to provision the synthetic I3 customer in Keycloak at phase $phase."
}
try {
    $loginCheck = Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:19000/realms/bank-customer/protocol/openid-connect/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
        grant_type = 'password'; client_id = 'customer-portal'; username = 'hz-i3-customer'; password = $password
    } -TimeoutSec 15
} catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $reason = 'unknown'
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        try { $problem = $reader.ReadToEnd() | ConvertFrom-Json; $reason = [string]$problem.error } finally { $reader.Dispose() }
    }
    throw "Synthetic I3 customer failed the Keycloak direct-grant readiness check with HTTP $statusCode ($reason)."
}
if ($loginCheck.StatusCode -ne 200) { throw 'Synthetic I3 customer direct-grant readiness check was not successful.' }

[ordered]@{
    status = 'READY'
    credentialAlias = 'i3-customer'
    identity = 'synthetic-keycloak-customer'
    secrets = 'stored-only-in-ignored-runtime-env'
} | ConvertTo-Json -Compress
