param(
  [string]$AdminToken,
[string]$EnvironmentPath = (Join-Path $PSScriptRoot '..\..\.env'),
[string]$KeycloakBaseUrl = 'http://127.0.0.1:19000',
[string]$GatewayBaseUrl = 'http://127.0.0.1:18443'
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $EnvironmentPath) { if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] } }
  $admin = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id='admin-cli';grant_type='password';username=$values.KEYCLOAK_ADMIN_USERNAME;password=$values.KEYCLOAK_ADMIN_PASSWORD}
  $AdminToken = $admin.access_token
}
$adminHeaders = @{ Authorization = "Bearer $AdminToken"; 'Content-Type' = 'application/json' }
$created = @()

function Ensure-Role([string]$realm, [string]$roleName) {
  try { Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles/$roleName" -Headers $adminHeaders | Out-Null }
  catch { Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles" -Headers $adminHeaders -Body (@{name=$roleName}|ConvertTo-Json) | Out-Null }
}
function New-TestUser([string]$realm, [string]$prefix, [string]$roleName) {
  $user = "$prefix-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $password = 'Test1234!'
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/users" -Headers $adminHeaders -Body (@{username=$user;enabled=$true;email="$user@example.test";emailVerified=$true;firstName='E2E';lastName='Test';requiredActions=@();credentials=@(@{type='password';value=$password;temporary=$false})}|ConvertTo-Json -Depth 5) | Out-Null
  $id = (Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/users?username=$user" -Headers $adminHeaders)[0].id
  $role = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles/$roleName" -Headers $adminHeaders
  $roleBody = '[{0}]' -f (($role | ConvertTo-Json -Depth 5).Trim())
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/users/$id/role-mappings/realm" -Headers $adminHeaders -Body $roleBody | Out-Null
  $client = "$prefix-client-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients" -Headers $adminHeaders -Body (@{clientId=$client;enabled=$true;publicClient=$true;directAccessGrantsEnabled=$true;protocol='openid-connect'}|ConvertTo-Json) | Out-Null
  $token = (Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/$realm/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id=$client;grant_type='password';username=$user;password=$password}).access_token
  $result = [pscustomobject]@{User=$user;Id=$id;Client=$client;Token=$token;Realm=$realm}
  $script:created += $result
  return $result
}
function Add-TestRole([string]$realm, [string]$userId, [string]$roleName) {
  $role = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles/$roleName" -Headers $adminHeaders
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/users/$userId/role-mappings/realm" -Headers $adminHeaders -Body ('[' + ($role | ConvertTo-Json -Compress) + ']') | Out-Null
}
function Assert-Equal($actual, $expected, [string]$name) { if ($actual -ne $expected) { throw "$name expected $expected but got $actual" } }

$application = $null
try {
Ensure-Role 'bank-customer' 'CUSTOMER'
Ensure-Role 'bank-internal' 'LOAN_OFFICER'
Ensure-Role 'bank-internal' 'LOAN_APPROVER'
Ensure-Role 'bank-internal' 'TEST_SUPPORT'
$customer = New-TestUser 'bank-customer' 'loan-score-customer' 'CUSTOMER'
$maker = New-TestUser 'bank-internal' 'loan-score-maker' 'LOAN_OFFICER'
$checker = New-TestUser 'bank-internal' 'loan-score-checker' 'LOAN_APPROVER'
Add-TestRole 'bank-internal' $maker.Id 'TEST_SUPPORT'
$maker.Token = (Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/bank-internal/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id=$maker.Client;grant_type='password';username=$maker.User;password='Test1234!'}).access_token
$customerHeaders = @{ Authorization = "Bearer $($customer.Token)"; 'Content-Type' = 'application/json' }
$makerHeaders = @{ Authorization = "Bearer $($maker.Token)"; 'Content-Type' = 'application/json' }
$checkerHeaders = @{ Authorization = "Bearer $($checker.Token)"; 'Content-Type' = 'application/json' }
$testHeaders = @{ Authorization = "Bearer $($maker.Token)"; 'Content-Type' = 'application/json' }
$fixtures = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures:seed" -Headers $testHeaders
Assert-Equal $fixtures.status 'SEEDED' 'fixture status'
$linked = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/identities:link" -Headers $testHeaders -Body (@{subject=$customer.Id;logicalRef='customer.alice'}|ConvertTo-Json)
Assert-Equal $linked.status 'LINKED' 'customer identity link'
$application = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/loans/applications" -Headers $customerHeaders -Body (@{amount='100.00';termMonths=1;purpose='scoring maker checker e2e';repaymentMethod='EQUAL_INSTALLMENTS';note='RF-054 live contract'}|ConvertTo-Json)
Assert-Equal $application.status 'DRAFT' 'draft status'
$document = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/loans/applications/$($application.applicationId)/documents" -Headers $customerHeaders -Body (@{documentType='INCOME_PROOF'}|ConvertTo-Json)
Assert-Equal $document.status 'RECEIVED' 'document status'
$submitted = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/loans/applications/$($application.applicationId)/submit" -Headers $customerHeaders -Body (@{version=$application.version}|ConvertTo-Json)
Assert-Equal $submitted.status 'SUBMITTED' 'submitted status'
$score = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/applications/$($application.applicationId)/score" -Headers $makerHeaders -Body (@{version=$submitted.version}|ConvertTo-Json)
Assert-Equal $score.status 'SCORED' 'scoring status'
Assert-Equal $score.score 99 'deterministic score'
$approval = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/applications/$($application.applicationId)/approval" -Headers $makerHeaders -Body (@{version=$score.version;reason='score reviewed'}|ConvertTo-Json)
$selfStatus = 0
try { Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/approvals/$($approval.approvalId)/approve" -Headers $makerHeaders -Body (@{version=$approval.version;approvedAmount='100.00';annualInterestRate='4.3500';reason='self check'}|ConvertTo-Json) | Out-Null }
catch { $selfStatus = $_.Exception.Response.StatusCode.value__ }
Assert-Equal $selfStatus 403 'maker approval-role rejection'
$checked = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/approvals/$($approval.approvalId)/approve" -Headers $checkerHeaders -Body (@{version=$approval.version;approvedAmount='100.00';annualInterestRate='4.3500';reason='independent review'}|ConvertTo-Json)
Assert-Equal $checked.status 'APPROVED' 'checker approval status'
$core = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/applications/$($application.applicationId)/core-submit" -Headers ($makerHeaders + @{'Idempotency-Key'="loan-workflow-$([guid]::NewGuid().ToString('N'))"})
Assert-Equal $core.status 'CORE_SUBMITTED' 'core submission status'
$customerReadback = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/loans/applications/$($application.applicationId)" -Headers $customerHeaders
$operationsReadback = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/operations/v1/loans/applications/$($application.applicationId)" -Headers $checkerHeaders
Assert-Equal $customerReadback.status 'CORE_SUBMITTED' 'customer readback status'
Assert-Equal $operationsReadback.status 'CORE_SUBMITTED' 'operations readback status'
Assert-Equal $operationsReadback.documents.Count 1 'operations document count'
Write-Output "LOAN_WORKFLOW=PASS score=$($score.score) MAKER_ROLE_DENIED=PASS CHECKER=PASS DOCUMENT=PASS CORE_SUBMITTED=PASS coreLoanId=$($core.coreLoanId) application=$($application.applicationId)"
}
finally {
  if ($null -ne $application) {
    docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -c "delete from loan_document where application_id='$($application.applicationId)'; delete from loan_approval where application_id='$($application.applicationId)'; delete from loan_application where application_id='$($application.applicationId)';" | Out-Null
  }
  if ($null -ne $customer) {
    try { Invoke-RestMethod -Method Delete -Uri "$GatewayBaseUrl/internal/test-support/v1/identities/$($customer.Id)" -Headers $testHeaders | Out-Null } catch {}
  }
  foreach ($item in $created) {
    try { Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$($item.Realm)/users/$($item.Id)" -Headers $adminHeaders | Out-Null } catch {}
    try { $clients = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$($item.Realm)/clients?clientId=$($item.Client)" -Headers $adminHeaders; foreach ($client in $clients) { Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$($item.Realm)/clients/$($client.id)" -Headers $adminHeaders | Out-Null } } catch {}
  }
}
