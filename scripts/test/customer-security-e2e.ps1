param(
  [Parameter(Mandatory=$true)][string]$AdminToken,
[string]$KeycloakBaseUrl='http://127.0.0.1:19000',
[string]$GatewayBaseUrl='http://127.0.0.1:18443'
)
$ErrorActionPreference='Stop'
$adminHeaders=@{Authorization="Bearer $AdminToken";'Content-Type'='application/json'}
$realm='bank-customer';$userId=$null;$clientName=$null;$transferId=$null;$key="security-e2e-$([guid]::NewGuid().ToString('N').Substring(0,20))"
$beneficiaryId=[guid]::NewGuid()
try {
  $username='security-customer-'+[guid]::NewGuid().ToString('N').Substring(0,8);$password='Test1234!'
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/users" -Headers $adminHeaders -Body (@{username=$username;enabled=$true;email="$username@example.test";emailVerified=$true;firstName='E2E';lastName='Security';requiredActions=@();credentials=@(@{type='password';value=$password;temporary=$false})}|ConvertTo-Json -Depth 5)|Out-Null
  $userId=(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/users?username=$username" -Headers $adminHeaders)[0].id
  $roles=@();foreach($roleName in @('CUSTOMER','CUSTOMER_MFA_VERIFIED')){try{$role=Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles/$roleName" -Headers $adminHeaders}catch{Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles" -Headers $adminHeaders -Body (@{name=$roleName}|ConvertTo-Json)|Out-Null;$role=Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/roles/$roleName" -Headers $adminHeaders};$roles+=$role};$roleBody='['+(($roles|ForEach-Object{$_|ConvertTo-Json -Compress})-join ',')+']';Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/users/$userId/role-mappings/realm" -Headers $adminHeaders -Body $roleBody|Out-Null
  $clientName='security-client-'+[guid]::NewGuid().ToString('N').Substring(0,8)
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients" -Headers $adminHeaders -Body (@{clientId=$clientName;enabled=$true;publicClient=$true;directAccessGrantsEnabled=$true;protocol='openid-connect'}|ConvertTo-Json)|Out-Null
  $token=(Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/$realm/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id=$clientName;grant_type='password';username=$username;password=$password}).access_token
  $headers=@{Authorization="Bearer $token";'Content-Type'='application/json'}
  docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -c "insert into customer_identity(subject,fineract_client_id) values('$userId',1);"|Out-Null
  docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -c "insert into beneficiary(beneficiary_id,subject,account_token,account_last4,display_name,destination_account_id) values('$beneficiaryId','$userId','$('b'*64)','0002','Security E2E beneficiary','2');"|Out-Null
  $foreignStatus=0;try{Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/accounts/2" -Headers $headers|Out-Null}catch{$foreignStatus=$_.Exception.Response.StatusCode.value__}
  $body=@{sourceAccountId='1';beneficiaryId=$beneficiaryId.ToString();amount='1.00';currency='CNY';reference='idempotency e2e'}|ConvertTo-Json
  $first=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers" -Headers ($headers+@{'Idempotency-Key'=$key}) -Body $body
  $transferId=$first.transferId
  $replay=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers" -Headers ($headers+@{'Idempotency-Key'=$key}) -Body $body
  $conflictStatus=0;try{Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers" -Headers ($headers+@{'Idempotency-Key'=$key}) -Body (@{sourceAccountId='1';beneficiaryId=$beneficiaryId.ToString();amount='2.00';currency='CNY';reference='idempotency e2e'}|ConvertTo-Json)|Out-Null}catch{$conflictStatus=$_.Exception.Response.StatusCode.value__}
  if($foreignStatus -ne 404 -or $first.transferId -ne $replay.transferId -or $conflictStatus -ne 409){throw "Security assertions failed: foreign=$foreignStatus replay=$($replay.transferId) conflict=$conflictStatus"}
  Write-Output "CUSTOMER_ISOLATION=PASS foreignAccount=404 IDEMPOTENCY_REPLAY=PASS IDEMPOTENCY_CONFLICT=PASS"
} finally {
  if($transferId){docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -c "delete from outbox_event where aggregate_id='$transferId';delete from ledger_entry where transfer_id='$transferId';delete from transfer_state_history where transfer_id='$transferId';delete from transfer_order where transfer_id='$transferId';delete from idempotency_record where scope_key='$key';"|Out-Null}
  if($userId){docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -c "delete from beneficiary where beneficiary_id='$beneficiaryId';delete from customer_identity where subject='$userId';"|Out-Null;Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$realm/users/$userId" -Headers $adminHeaders|Out-Null}
  if($clientName){$clients=Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients?clientId=$clientName" -Headers $adminHeaders;foreach($client in $clients){Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients/$($client.id)" -Headers $adminHeaders|Out-Null}}
}
