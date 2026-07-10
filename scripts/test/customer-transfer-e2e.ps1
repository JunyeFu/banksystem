param([Parameter(Mandatory=$true)][string]$AdminToken,[string]$KeycloakBaseUrl='http://127.0.0.1:18082',[string]$GatewayBaseUrl='http://127.0.0.1:18081')
$ErrorActionPreference='Stop'
$h=@{Authorization="Bearer $AdminToken";'Content-Type'='application/json'}
$realm='bank-customer';$uid=$null;$clientName=$null;$transferId=$null;$key="customer-transfer-e2e-$([guid]::NewGuid().ToString('N'))"
try {
  $u='customer-transfer-'+[guid]::NewGuid().ToString('N').Substring(0,8);$p='Test1234!'
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/users" -Headers $h -Body (@{username=$u;enabled=$true;email="$u@example.test";emailVerified=$true;firstName='E2E';lastName='Customer';requiredActions=@();credentials=@(@{type='password';value=$p;temporary=$false})}|ConvertTo-Json -Depth 5)|Out-Null
  $uid=(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/users?username=$u" -Headers $h)[0].id
  $clientName='customer-transfer-client-'+[guid]::NewGuid().ToString('N').Substring(0,8)
  Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients" -Headers $h -Body (@{clientId=$clientName;enabled=$true;publicClient=$true;directAccessGrantsEnabled=$true;protocol='openid-connect'}|ConvertTo-Json)|Out-Null
  $token=(Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/$realm/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id=$clientName;grant_type='password';username=$u;password=$p}).access_token
  $ch=@{Authorization="Bearer $token";'Content-Type'='application/json'}
  docker exec mifos-channel-channel-db-1 psql -U bank_channel -d bank_channel -c "insert into customer_identity(subject,fineract_client_id) values('$uid',1);"|Out-Null
  $me=Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/customers/me" -Headers $ch
  $accounts=Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/accounts" -Headers $ch
  if([string]::IsNullOrWhiteSpace($me.displayName) -or $accounts.items.Count -lt 1){throw 'Customer profile/account query failed'}
  $forbidden=0;try { Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers" -Headers ($ch+@{'Idempotency-Key'="$key-bad"}) -Body (@{sourceAccountId='2';destinationAccountId='1';amount='1.00';currency='CNY'}|ConvertTo-Json)|Out-Null } catch {$forbidden=$_.Exception.Response.StatusCode.value__}
  $t=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/customer/v1/transfers" -Headers ($ch+@{'Idempotency-Key'=$key}) -Body (@{sourceAccountId='1';destinationAccountId='2';amount='1.00';currency='CNY';reference='customer transfer'}|ConvertTo-Json)
  $transferId=$t.transferId;$posted=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/transfers/$transferId/process" -Headers $ch
  if($posted.status -ne 'POSTED'){throw "Customer transfer did not post: $($posted|ConvertTo-Json -Compress)"}
  $json=Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/transfers/$transferId/receipt?format=json" -Headers $ch
  $pdf=Invoke-WebRequest -UseBasicParsing -Uri "$GatewayBaseUrl/api/customer/v1/transfers/$transferId/receipt?format=pdf" -Headers $ch
  $notes=Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/notifications" -Headers $ch
  if($forbidden -ne 403 -or $posted.status -ne 'POSTED' -or $json.sha256.Length -ne 64 -or $pdf.Headers['Content-Type'] -notmatch 'application/pdf' -or $notes.items.Count -lt 1){throw 'Customer transfer assertions failed'}
  Write-Output "CUSTOMER_READ=PASS CUSTOMER_TRANSFER=PASS ownership403=PASS posted=PASS receiptJson=PASS receiptPdf=PASS notification=PASS transferId=$transferId"
} finally {
  if($transferId){docker exec mifos-channel-channel-db-1 psql -U bank_channel -d bank_channel -c "delete from transfer_receipt where transfer_id='$transferId';delete from notification where subject='$uid';delete from transfer_outbox where transfer_id='$transferId';delete from transfer where transfer_id='$transferId';delete from idempotency_record where idempotency_key like 'customer-transfer-e2e-%';"|Out-Null}
  if($uid){docker exec mifos-channel-channel-db-1 psql -U bank_channel -d bank_channel -c "delete from customer_identity where subject='$uid';"|Out-Null;Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$realm/users/$uid" -Headers $h|Out-Null}
  if($clientName){$cs=Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients?clientId=$clientName" -Headers $h;foreach($c in $cs){Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$realm/clients/$($c.id)" -Headers $h|Out-Null}}
}
