[CmdletBinding()]
param(
  [string]$EnvironmentPath,
  [string]$GatewayBaseUrl = 'http://127.0.0.1:18443',
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:19000',
  [string]$FineractBaseUrl = 'http://127.0.0.1:13000/fineract-provider'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) {
  $EnvironmentPath = Join-Path $PSScriptRoot '..\..\.env'
}
$runId = [Guid]::NewGuid().ToString('N')
$correlationId = "bank-transfer-golden-$runId"
$idempotencyKey = "bank-transfer-golden-$runId"
$namespace = 'bank-transfer-golden'
$customerRealm = 'bank-customer'
$internalRealm = 'bank-internal'
$customerUsername = "golden-customer-$($runId.Substring(0, 12))"
$operatorUsername = "golden-operator-$($runId.Substring(0, 12))"
$customerClient = 'bank-golden-path'
$operatorClient = 'bank-golden-path'
$customerUserId = $null
$operatorUserId = $null
$adminHeaders = $null
$testHeaders = $null
$primaryError = $null
$result = $null
$stage = 'INITIALIZE'
$failureBody = $null
$failureStatus = $null

function Get-EnvironmentValues {
  if (-not (Test-Path -LiteralPath $EnvironmentPath -PathType Leaf)) { throw 'GOLDEN_ENVIRONMENT_MISSING' }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $EnvironmentPath) {
    if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
  }
  foreach ($name in @('KEYCLOAK_ADMIN_USERNAME', 'KEYCLOAK_ADMIN_PASSWORD', 'FINERACT_USERNAME', 'FINERACT_PASSWORD', 'FINERACT_TENANT')) {
    $processValue = [Environment]::GetEnvironmentVariable($name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) { $values[$name] = $processValue }
  }
  if ([string]::IsNullOrWhiteSpace($values['FINERACT_TENANT'])) { $values['FINERACT_TENANT'] = 'default' }
  return $values
}

function Require-Value([hashtable]$Values, [string]$Name) {
  $value = $Values[$Name]
  if ([string]::IsNullOrWhiteSpace($value)) { throw "GOLDEN_CONFIG_MISSING:$Name" }
  return $value
}

function New-Secret {
  $bytes = [byte[]]::new(24)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return 'G1!' + [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'B').Replace('=', 'C')
}

function New-KeycloakUser([string]$Realm, [string]$Username, [string]$Password) {
  $body = @{
    username = $Username; enabled = $true; email = "$Username@example.test"; emailVerified = $true
    firstName = 'Golden'; lastName = 'Path'; requiredActions = @()
    credentials = @(@{ type = 'password'; value = $Password; temporary = $false })
  } | ConvertTo-Json -Depth 6 -Compress
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$Realm/users" -Headers $adminHeaders -Body $body | Out-Null
  $matches = @(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/users?exact=true&username=$Username" -Headers $adminHeaders)
  if ($matches.Count -ne 1) { throw "GOLDEN_KEYCLOAK_USER_COUNT:$Realm" }
  return [string]$matches[0].id
}

function Add-KeycloakRoles([string]$Realm, [string]$UserId, [string[]]$Names) {
  $roles = @($Names | ForEach-Object { Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles/$_" -Headers $adminHeaders })
  $body = '[' + (($roles | ForEach-Object { $_ | ConvertTo-Json -Compress }) -join ',') + ']'
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$Realm/users/$UserId/role-mappings/realm" -Headers $adminHeaders -Body $body | Out-Null
}

function Get-PasswordToken([string]$Realm, [string]$ClientId, [string]$Username, [string]$Password) {
  $clients = @(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/clients?clientId=$ClientId" -Headers $adminHeaders | Where-Object { $_.clientId -eq $ClientId })
  if ($clients.Count -ne 1) { throw "GOLDEN_CLIENT_NOT_PROVISIONED:$Realm" }
  $clientSecret = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/clients/$($clients[0].id)/client-secret" -Headers $adminHeaders
  $token = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/$Realm/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{ client_id = $ClientId; client_secret = $clientSecret.value; grant_type = 'password'; username = $Username; password = $Password }
  if ([string]::IsNullOrWhiteSpace($token.access_token)) { throw "GOLDEN_TOKEN_MISSING:$Realm" }
  $part = $token.access_token.Split('.')[1].Replace('-', '+').Replace('_', '/')
  $part = $part.PadRight($part.Length + ((4 - $part.Length % 4) % 4), '=')
  $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
  if (-not (@($claims.aud) -contains 'bank-channel-service') -or $claims.azp -ne $ClientId) {
    throw "GOLDEN_TOKEN_CLAIMS_INVALID:$Realm"
  }
  return [string]$token.access_token
}

function Get-FineractAccount([long]$AccountId, [hashtable]$Values) {
  $user = Require-Value $Values 'FINERACT_USERNAME'
  $password = Require-Value $Values 'FINERACT_PASSWORD'
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${user}:${password}"))
  return Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/savingsaccounts/$AccountId" -Headers @{
    Authorization = "Basic $basic"; 'Fineract-Platform-TenantId' = (Require-Value $Values 'FINERACT_TENANT')
  }
}

function Get-Balance($Account) {
  $value = if ($null -ne $Account.summary.accountBalance) { $Account.summary.accountBalance } elseif ($null -ne $Account.accountBalance) { $Account.accountBalance } else { throw 'GOLDEN_BALANCE_MISSING' }
  return [decimal]::Parse([string]$value, [Globalization.CultureInfo]::InvariantCulture)
}

function Remove-KeycloakObject([string]$Realm, [string]$Kind, [string]$Id) {
  if ([string]::IsNullOrWhiteSpace($Id) -or $null -eq $adminHeaders) { return }
  Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$Realm/$Kind/$Id" -Headers $adminHeaders | Out-Null
}

try {
  $stage = 'LOAD_CONFIGURATION'
  $values = Get-EnvironmentValues
  $adminUsername = Require-Value $values 'KEYCLOAK_ADMIN_USERNAME'
  $adminPassword = Require-Value $values 'KEYCLOAK_ADMIN_PASSWORD'
  $adminToken = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{ client_id = 'admin-cli'; grant_type = 'password'; username = $adminUsername; password = $adminPassword }
  if ([string]::IsNullOrWhiteSpace($adminToken.access_token)) { throw 'GOLDEN_KEYCLOAK_ADMIN_TOKEN_MISSING' }
  $adminHeaders = @{ Authorization = "Bearer $($adminToken.access_token)"; 'Content-Type' = 'application/json' }

  $customerPassword = New-Secret
  $operatorPassword = New-Secret
  $customerUserId = New-KeycloakUser $customerRealm $customerUsername $customerPassword
  Add-KeycloakRoles $customerRealm $customerUserId @('CUSTOMER')
  $operatorUserId = New-KeycloakUser $internalRealm $operatorUsername $operatorPassword
  Add-KeycloakRoles $internalRealm $operatorUserId @('TEST_SUPPORT', 'PAYMENT_OPERATOR')

  $customerToken = Get-PasswordToken $customerRealm $customerClient $customerUsername $customerPassword
  $operatorToken = Get-PasswordToken $internalRealm $operatorClient $operatorUsername $operatorPassword
  $customerHeaders = @{ Authorization = "Bearer $customerToken"; 'Content-Type' = 'application/json' }
  $testHeaders = @{ Authorization = "Bearer $operatorToken"; 'Content-Type' = 'application/json'; 'X-Regression-Namespace' = $namespace; 'X-Regression-Run-Id' = $runId }

  $stage = 'SEED_FIXTURES'
  $fixtures = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures:seed" -Headers $testHeaders
  if ($fixtures.status -ne 'SEEDED') { throw 'GOLDEN_FIXTURES_NOT_SEEDED' }
  $linkBody = @{ subject = $customerUserId; logicalRef = 'customer.alice' } | ConvertTo-Json -Compress
  $linked = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/identities:link" -Headers $testHeaders -Body $linkBody
  if ($linked.status -ne 'LINKED') { throw 'GOLDEN_IDENTITY_NOT_LINKED' }
  $scenarioBody = @{ subject = $customerUserId; logicalCustomerRef = 'customer.alice'; destinationCustomerRef = 'customer.bob' } | ConvertTo-Json -Compress
  $scenario = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/customer-scenario:seed" -Headers $testHeaders -Body $scenarioBody
  if ($scenario.status -ne 'READY') { throw "GOLDEN_SCENARIO_NOT_READY_$($scenario.failureStage)_$($scenario.failureHint)" }

  $sourceAccountId = [long]$fixtures.'account.alice.primarySavings'.accountId
  $targetAccountId = [long]$fixtures.'account.bob.primarySavings'.accountId
  $sourceBefore = Get-Balance (Get-FineractAccount $sourceAccountId $values)
  $targetBefore = Get-Balance (Get-FineractAccount $targetAccountId $values)
  $stage = 'READ_ACCOUNT'
  $accountRead = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/accounts/$sourceAccountId" -Headers $customerHeaders
  if ([string]$accountRead.accountId -ne [string]$sourceAccountId -or $accountRead.currency -ne 'CNY' -or $null -eq $accountRead.balance) {
    throw 'GOLDEN_ACCOUNT_READ_MODEL_INVALID'
  }
  $stage = 'DEDUP_BENEFICIARY'
  $destinationFixture = Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures/account.bob.primarySavings" -Headers $testHeaders
  $beneficiaryBody = @{ accountNumber = [string]$destinationFixture.accountNumber; displayName = 'Golden beneficiary' } | ConvertTo-Json -Compress
  $beneficiaryFirst = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/beneficiaries" -Headers $customerHeaders -Body $beneficiaryBody
  $beneficiarySecond = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/beneficiaries" -Headers $customerHeaders -Body $beneficiaryBody
  if ($beneficiaryFirst.beneficiaryId -ne $beneficiarySecond.beneficiaryId) { throw 'GOLDEN_BENEFICIARY_DEDUP_FAILED' }
  $beneficiaries = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/beneficiaries" -Headers $customerHeaders
  $beneficiary = @($beneficiaries.items | Where-Object { $_.beneficiaryId -eq [string]$beneficiaryFirst.beneficiaryId })
  if ($beneficiary.Count -ne 1) { throw "GOLDEN_BENEFICIARY_COUNT:$($beneficiary.Count)" }

  $transferBody = @{
    sourceAccountId = [string]$sourceAccountId; beneficiaryId = [string]$beneficiary[0].beneficiaryId
    amount = '100.00'; currency = 'CNY'; reference = 'bank-transfer-golden'
  } | ConvertTo-Json -Compress
  $writeHeaders = $customerHeaders.Clone()
  $writeHeaders['Idempotency-Key'] = $idempotencyKey
  $writeHeaders['X-Correlation-Id'] = $correlationId
  $stage = 'CREATE_TRANSFER'
  $created = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers" -Headers $writeHeaders -Body $transferBody
  if ($created.status -ne 'CREATED' -or $created.correlationId -ne $correlationId) { throw 'GOLDEN_TRANSFER_CREATE_MISMATCH' }
  $stage = 'CONFIRM_TRANSFER'
  $confirmed = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers/$($created.transferId)/confirm" -Headers $customerHeaders
  if ($confirmed.status -ne 'SETTLED') {
    $failureBody = @{transferId=$created.transferId;status=$confirmed.status;failureCode=$confirmed.failureCode;failureDetail=$confirmed.failureDetail} | ConvertTo-Json -Compress
    throw "GOLDEN_TRANSFER_NOT_SETTLED:$($confirmed.status)"
  }
  $stage = 'READ_STATEMENT'
  $statement = Invoke-WebRequest -UseBasicParsing -Uri "$GatewayBaseUrl/api/customer/v1/statements?accountId=$sourceAccountId&format=csv" -Headers $customerHeaders
  if ([string]$statement.Headers['X-Statement-Balance-Check'] -ne 'true' -or $statement.Content -notmatch '^# openingBalance=.*balanceCheck=true') {
    throw 'GOLDEN_STATEMENT_READ_MODEL_INVALID'
  }

  $customerRead = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/transfers/$($created.transferId)" -Headers $customerHeaders
  $query = [Uri]::EscapeDataString($correlationId)
  $operationsPage = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/operations/v1/transfers?query=$query" -Headers $testHeaders
  if (@($operationsPage.items).Count -ne 1) { throw "GOLDEN_OPERATIONS_RESULT_COUNT:$(@($operationsPage.items).Count)" }
  $operationsRead = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/operations/v1/transfers/$($created.transferId)" -Headers $testHeaders
  $projection = Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/test-support/v1/assertions/accounting-projection/$correlationId" -Headers $testHeaders
  $sourceAfter = Get-Balance (Get-FineractAccount $sourceAccountId $values)
  $targetAfter = Get-Balance (Get-FineractAccount $targetAccountId $values)

  if ($sourceBefore - $sourceAfter -ne [decimal]100) { throw 'GOLDEN_SOURCE_BALANCE_DELTA_MISMATCH' }
  if ($targetAfter - $targetBefore -ne [decimal]100) { throw 'GOLDEN_TARGET_BALANCE_DELTA_MISMATCH' }
  if ($sourceBefore + $targetBefore -ne $sourceAfter + $targetAfter) { throw 'GOLDEN_BALANCE_CONSERVATION_FAILED' }
  if ($customerRead.correlationId -ne $correlationId -or $operationsRead.correlationId -ne $correlationId) { throw 'GOLDEN_CORRELATION_CHAIN_BROKEN' }
  if ($customerRead.status -ne 'SETTLED' -or $operationsRead.status -ne 'SETTLED') { throw 'GOLDEN_READBACK_STATUS_MISMATCH' }
  if ([string]::IsNullOrWhiteSpace($operationsRead.coreReference)) { throw 'GOLDEN_CORE_REFERENCE_MISSING' }
  if (-not $projection.projectionBalanced -or [int]$projection.projectionEntryCount -ne 2) { throw 'GOLDEN_ACCOUNTING_PROJECTION_ASSERTION_FAILED' }

  $result = [ordered]@{
    journeyId = 'bank-transfer-golden'; correlationId = $correlationId
    sourceAccountId = [string]$sourceAccountId; targetAccountId = [string]$targetAccountId
    amount = '100.00'; currency = 'CNY'; fineractTransactionId = [string]$operationsRead.coreReference
    status = 'COMPLETED'
  }
} catch {
  $primaryError = $_
  if ($_.ErrorDetails.Message) { $failureBody = $_.ErrorDetails.Message }
  if ($null -ne $_.Exception.Response) { $failureStatus = [int]$_.Exception.Response.StatusCode }
} finally {
  $cleanupErrors = New-Object 'System.Collections.Generic.List[string]'
  if ($null -ne $testHeaders -and $null -ne $customerUserId) {
    try {
      $clearBody = @{ subject = $customerUserId; logicalCustomerRef = 'customer.alice'; destinationCustomerRef = 'customer.bob' } | ConvertTo-Json -Compress
      Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/customer-scenario:clear" -Headers $testHeaders -Body $clearBody | Out-Null
    } catch { $cleanupErrors.Add('GOLDEN_SCENARIO_CLEANUP_FAILED') }
    try { Invoke-RestMethod -Method Delete -Uri "$GatewayBaseUrl/internal/test-support/v1/identities/$customerUserId" -Headers $testHeaders | Out-Null }
    catch { $cleanupErrors.Add('GOLDEN_IDENTITY_CLEANUP_FAILED') }
  }
  try { Remove-KeycloakObject $customerRealm 'users' $customerUserId } catch { $cleanupErrors.Add('GOLDEN_CUSTOMER_CLEANUP_FAILED') }
  try { Remove-KeycloakObject $internalRealm 'users' $operatorUserId } catch { $cleanupErrors.Add('GOLDEN_OPERATOR_CLEANUP_FAILED') }
  if ($null -eq $primaryError -and $cleanupErrors.Count -gt 0) { $primaryError = [Exception]::new($cleanupErrors[0]) }
}

if ($null -ne $primaryError) {
  $message = if ($primaryError -is [Management.Automation.ErrorRecord]) { $primaryError.Exception.Message } else { $primaryError.Message }
  @{ status = 'FAILED'; errorCode = ([string]$message).Split(':')[0]; stage = $stage; httpStatus = $failureStatus; response = $failureBody; journeyId = 'bank-transfer-golden' } |
    ConvertTo-Json -Compress | Write-Output
  exit 1
}
$result | ConvertTo-Json -Depth 5 -Compress | Write-Output
