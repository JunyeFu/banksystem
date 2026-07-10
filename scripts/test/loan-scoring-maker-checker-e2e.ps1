param(
  [Parameter(Mandatory=$true)][string]$AdminToken,
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:18082',
  [string]$GatewayBaseUrl = 'http://127.0.0.1:18081'
)
$ErrorActionPreference = 'Stop'
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
function Assert-Equal($actual, $expected, [string]$name) { if ($actual -ne $expected) { throw "$name expected $expected but got $actual" } }

Ensure-Role 'bank-customer' 'CUSTOMER'
Ensure-Role 'bank-internal' 'LOAN_OFFICER'
Ensure-Role 'bank-internal' 'LOAN_APPROVER'
$customer = New-TestUser 'bank-customer' 'loan-score-customer' 'CUSTOMER'
$maker = New-TestUser 'bank-internal' 'loan-score-maker' 'LOAN_OFFICER'
$checker = New-TestUser 'bank-internal' 'loan-score-checker' 'LOAN_APPROVER'
$customerHeaders = @{ Authorization = "Bearer $($customer.Token)"; 'Content-Type' = 'application/json' }
$makerHeaders = @{ Authorization = "Bearer $($maker.Token)"; 'Content-Type' = 'application/json' }
$checkerHeaders = @{ Authorization = "Bearer $($checker.Token)"; 'Content-Type' = 'application/json' }
$application = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/loans/applications" -Headers $customerHeaders -Body (@{amount=100;termMonths=1;purpose='scoring maker checker e2e'}|ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/loans/applications/$($application.applicationId)/submit" -Headers $customerHeaders | Out-Null
$score = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/applications/$($application.applicationId)/score" -Headers $makerHeaders
Assert-Equal $score.status 'SCORED' 'scoring status'
Assert-Equal $score.score 99 'deterministic score'
$approval = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/applications/$($application.applicationId)/approval" -Headers $makerHeaders -Body (@{reason='score reviewed'}|ConvertTo-Json)
$selfStatus = 0
try { Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/approvals/$($approval.approvalId)/approve?version=1" -Headers $makerHeaders -Body (@{reason='self check'}|ConvertTo-Json) | Out-Null }
catch { $selfStatus = $_.Exception.Response.StatusCode.value__ }
Assert-Equal $selfStatus 403 'maker approval-role rejection'
$checked = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/loans/approvals/$($approval.approvalId)/approve?version=1" -Headers $checkerHeaders -Body (@{reason='independent review'}|ConvertTo-Json)
Assert-Equal $checked.status 'APPROVED' 'checker approval status'
try { Write-Output "SCORING=PASS score=$($score.score) MAKER_ROLE_DENIED=PASS CHECKER=PASS application=$($application.applicationId)" }
finally {
  docker exec mifos-channel-channel-db-1 psql -U bank_channel -d bank_channel -c "delete from loan_document where subject in ('$($customer.Id)'); delete from loan_approval where application_id='$($application.applicationId)'; delete from loan_application where application_id='$($application.applicationId)';" | Out-Null
  foreach ($item in $created) {
    try { Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$($item.Realm)/users/$($item.Id)" -Headers $adminHeaders | Out-Null } catch {}
    try { $clients = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$($item.Realm)/clients?clientId=$($item.Client)" -Headers $adminHeaders; foreach ($client in $clients) { Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$($item.Realm)/clients/$($client.id)" -Headers $adminHeaders | Out-Null } } catch {}
  }
}
