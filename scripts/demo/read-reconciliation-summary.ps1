[CmdletBinding()]
param([string]$EnvironmentPath = (Join-Path $PSScriptRoot '../../.env'))
$ErrorActionPreference = 'Stop'
$KeycloakBaseUrl = 'http://127.0.0.1:19000'
$GatewayBaseUrl = 'http://127.0.0.1:18443'
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'run-golden-path.ps1'), [ref]$null, [ref]$null)
foreach ($name in @('Get-EnvironmentValues','Require-Value','New-Secret','New-KeycloakUser','Add-KeycloakRoles','Get-PasswordToken','Remove-KeycloakObject')) {
  $definition = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name}, $true)
  Invoke-Expression $definition.Extent.Text
}
$values = Get-EnvironmentValues
$admin = Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{
  client_id='admin-cli';grant_type='password';username=(Require-Value $values 'KEYCLOAK_ADMIN_USERNAME');password=(Require-Value $values 'KEYCLOAK_ADMIN_PASSWORD')
}
$adminHeaders = @{Authorization="Bearer $($admin.access_token)";'Content-Type'='application/json'}
$id = $null
try {
  $name = 'rf063-readback-'+[Guid]::NewGuid().ToString('N').Substring(0,12)
  $password = New-Secret
  $id = New-KeycloakUser 'bank-internal' $name $password
  Add-KeycloakRoles 'bank-internal' $id @('ACCOUNTANT', 'PAYMENT_OPERATOR')
  $token = Get-PasswordToken 'bank-internal' 'bank-golden-path' $name $password
  $latest = Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/reconciliation/latest" -Headers @{Authorization="Bearer $token"}
  $transfers = Invoke-RestMethod -Uri "$GatewayBaseUrl/api/operations/v1/transfers?query=bank-transfer-golden" -Headers @{Authorization="Bearer $token"}
  Write-Output (ConvertTo-Json -InputObject @($transfers.items | Select-Object -First 3 transferId,status,failureCode,failureDetail,coreReference,sourceAccountId,destinationAccountId) -Depth 4 -Compress)
  $auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Require-Value $values 'FINERACT_USERNAME')+':'+(Require-Value $values 'FINERACT_PASSWORD')))
  $core = @{Authorization="Basic $auth";'fineract-platform-tenantid'=(Require-Value $values 'FINERACT_TENANT')}
  $journal = Invoke-RestMethod -Uri 'http://127.0.0.1:13000/fineract-provider/api/v1/journalentries?limit=1&offset=0&transactionDetails=true' -Headers $core
  Write-Output ([ordered]@{journalFields=@($journal.pageItems[0].PSObject.Properties.Name);journalFacts=@($journal.pageItems | Select-Object transactionId,entityType,entityId,glAccountId,currency,transactionDetails)} | ConvertTo-Json -Depth 5 -Compress)
  $account = Invoke-RestMethod -Uri 'http://127.0.0.1:13000/fineract-provider/api/v1/savingsaccounts/external-id/banksystem-gl-v1-account-alice-primary-savings' -Headers $core
  $product = Invoke-RestMethod -Uri "http://127.0.0.1:13000/fineract-provider/api/v1/savingsproducts/$($account.savingsProductId)" -Headers $core
  Write-Output ([ordered]@{accountId=$account.id;accountingMappings=$product.accountingMappings} | ConvertTo-Json -Depth 5 -Compress)
  $job = Invoke-RestMethod -Uri 'http://127.0.0.1:13000/fineract-provider/api/v1/jobs/31' -Headers $core
  $history = Invoke-RestMethod -Uri 'http://127.0.0.1:13000/fineract-provider/api/v1/jobs/31/runhistory?offset=0&limit=200' -Headers $core
  Write-Output ([ordered]@{jobCurrentlyRunning=$job.currentlyRunning;jobHistory=@($history.pageItems | Select-Object -First 2 version,status,triggerType)} | ConvertTo-Json -Depth 4 -Compress)
  [ordered]@{reconciliation=$latest;coreJournalTotal=$journal.totalFilteredRecords;coreJournalSampleCount=@($journal.pageItems).Count;savingsAccountingRule=$product.accountingRule.id;businessDateUnchanged=$true} | ConvertTo-Json -Depth 6 -Compress
} finally {
  if ($null -ne $id) { Remove-KeycloakObject 'bank-internal' 'users' $id }
}
