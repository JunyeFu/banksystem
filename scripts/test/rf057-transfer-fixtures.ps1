[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$EnvironmentPath=Join-Path $repositoryRoot '.env'
$GatewayBaseUrl='http://127.0.0.1:18443'
$KeycloakBaseUrl='http://127.0.0.1:19000'
$FineractBaseUrl='http://127.0.0.1:13000/fineract-provider'
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repositoryRoot 'scripts/demo/run-golden-path.ps1'),[ref]$null,[ref]$null)
foreach($helper in @('Get-EnvironmentValues','Require-Value','New-Secret','New-KeycloakUser','Add-KeycloakRoles','Get-PasswordToken','Remove-KeycloakObject','Get-FineractAccount','Get-Balance')) {
  $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $helper},$true)
  Invoke-Expression $definition.Extent.Text
}
$values=Get-EnvironmentValues
$adminUsername=Require-Value $values 'KEYCLOAK_ADMIN_USERNAME'
$adminPassword=Require-Value $values 'KEYCLOAK_ADMIN_PASSWORD'
$admin=Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id='admin-cli';grant_type='password';username=$adminUsername;password=$adminPassword}
$adminHeaders=@{Authorization="Bearer $($admin.access_token)";'Content-Type'='application/json'}
$runId=[Guid]::NewGuid().ToString('N')
$reportPath=Join-Path $repositoryRoot "agent/runs/rf057-transfer-fixtures/$runId.json"
$createdUsers=New-Object 'System.Collections.Generic.List[object]'
$subjects=New-Object 'System.Collections.Generic.List[string]'
$results=New-Object 'System.Collections.Generic.List[object]'
$attempts=New-Object 'System.Collections.Generic.List[object]'
$stage='IDENTITIES';$failure=$null;$cleanupFailures=New-Object 'System.Collections.Generic.List[string]'
$operator=$null;$testHeaders=$null
$baselineBefore=@();$baselineAfter=@();$businessDateBefore=$null;$businessDateAfter=$null
$user=Require-Value $values 'FINERACT_USERNAME';$password=Require-Value $values 'FINERACT_PASSWORD'
$coreHeaders=@{Authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${user}:${password}"));'Fineract-Platform-TenantId'=(Require-Value $values 'FINERACT_TENANT')}
function Get-CoreSnapshot([long]$Id) {
  $account=Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/savingsaccounts/${Id}?associations=transactions" -Headers $coreHeaders
  return [ordered]@{accountId=$Id;balance=(Get-Balance $account).ToString('0.00',[Globalization.CultureInfo]::InvariantCulture);transactionIds=@($account.transactions | ForEach-Object {[string]$_.id} | Sort-Object)}
}
function Save-Report([string]$CleanupStatus) {
  [IO.Directory]::CreateDirectory((Split-Path $reportPath)) | Out-Null
  $status=if($failure -or $cleanupFailures.Count){'FAILED'}elseif($stage -eq 'COMPLETED' -and $CleanupStatus -eq 'COMPLETED'){'PASSED'}else{'IN_PROGRESS'}
  $report=@{schemaVersion='rf057-transfer-fixture-integration/v1';evidenceLevel='INTEGRATION';agentLive=$false;runId=$runId;status=$status;stage=$stage;failure=$failure;cleanup=@{status=$CleanupStatus;failures=@($cleanupFailures.ToArray());ownedUsers=@($createdUsers.ToArray());ownedSubjects=@($subjects.ToArray())};attempts=@($attempts.ToArray());fixtures=@($results.ToArray());baseline=@{before=$baselineBefore;after=$baselineAfter;businessDateBefore=$businessDateBefore;businessDateAfter=$businessDateAfter};createdAt=[DateTime]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText($reportPath,($report | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
}
try {
  $operatorPassword=New-Secret;$operatorUsername='rf057-fixture-operator-'+$runId.Substring(0,12)
  $operatorId=New-KeycloakUser 'bank-internal' $operatorUsername $operatorPassword
  $createdUsers.Add(@{realm='bank-internal';id=$operatorId});Save-Report 'PENDING'
  Add-KeycloakRoles 'bank-internal' $operatorId @('TEST_SUPPORT')
  $operator=@{username=$operatorUsername;password=$operatorPassword}
  $token=Get-PasswordToken 'bank-internal' 'bank-golden-path' $operatorUsername $operatorPassword
  $testHeaders=@{Authorization="Bearer $token";'Content-Type'='application/json';'X-Regression-Namespace'='rf057-transfer-fixtures';'X-Regression-Run-Id'=$runId}
  $stage='BASELINE_READ'
  $node=Join-Path $repositoryRoot 'platform/hengzhun-regression-system/runtime/node-v24.19.0-win-x64/node.exe'
  $catalogSource='const fs=require("node:fs"),yaml=require(process.argv[3]);console.log(JSON.stringify(yaml.parse(fs.readFileSync(process.argv[2],"utf8")).fixtures));'
  $catalogJson=$catalogSource | & $node - (Join-Path $repositoryRoot 'contracts/fixtures/baseline-fixtures.yaml') (Join-Path $repositoryRoot 'platform/hengzhun-regression-system/node_modules/yaml')
  if($LASTEXITCODE -ne 0){throw 'ISOLATED_CATALOG_PARSE_FAILED'}
  $catalog=$catalogJson|ConvertFrom-Json
  $baselineIds=@('account.alice.primarySavings','account.bob.primarySavings') | ForEach-Object {
    $externalId=$catalog.$_.externalId
    $fixture=Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/savingsaccounts/external-id/$externalId" -Headers $coreHeaders
    [long]$fixture.id
  }
  $baselineBefore=@($baselineIds | ForEach-Object {Get-CoreSnapshot $_})
  $before=$baselineBefore | ConvertTo-Json -Depth 6 -Compress
  $stage='BUSINESS_DATES_BEFORE'
  $businessDateBefore=@((Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/businessdate" -Headers $coreHeaders)|ForEach-Object {$_})
  $dateBefore=ConvertTo-Json -InputObject $businessDateBefore -Depth 6 -Compress
  foreach($index in 1..2) {
    $stage="PREPARE_PAIR_$index"
    $customerPassword=New-Secret;$username="rf057-fixture-$index-"+$runId.Substring(0,12)
    $subject=New-KeycloakUser 'bank-customer' $username $customerPassword
    $createdUsers.Add(@{realm='bank-customer';id=$subject});$subjects.Add($subject);Save-Report 'PENDING'
    Add-KeycloakRoles 'bank-customer' $subject @('CUSTOMER')
    $attempt=@{fixtureId=[Guid]::NewGuid().ToString();subject=$subject}
    $attempts.Add($attempt);Save-Report 'PENDING'
    $request=$attempt|ConvertTo-Json -Compress
    $pair=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/transfer-fixtures:prepare" -Headers $testHeaders -Body $request
    if($pair.sourceBalance -isnot [string] -or $pair.targetBalance -isnot [string] -or $pair.sourceBalance -cne '1000.00' -or $pair.targetBalance -cne '2000.00'){throw 'ISOLATED_PAIR_DECIMAL_WIRE_INVALID'}
    if($pair.status -ne 'READY' -or [decimal]$pair.sourceBalance -ne 1000 -or [decimal]$pair.targetBalance -ne 2000 -or $pair.currency -ne 'CNY'){throw 'ISOLATED_PAIR_INVALID'}
    $replay=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/transfer-fixtures:prepare" -Headers $testHeaders -Body $request
    if(($pair|ConvertTo-Json -Compress) -ne ($replay|ConvertTo-Json -Compress)){throw 'ISOLATED_PAIR_REPLAY_CHANGED'}
    $stage="VALIDATE_PAIR_$index"
    $validationBefore=@($pair.sourceAccountId,$pair.targetAccountId)|ForEach-Object {Get-CoreSnapshot $_}
    $validationUri="$GatewayBaseUrl/internal/test-support/v1/transfer-fixtures/$($pair.fixtureId)?subject=$($pair.subject)&beneficiaryRef=$($pair.beneficiaryRef)"
    foreach($validationRepeat in 1..2) {
      $validated=Invoke-RestMethod -Method Get -Uri $validationUri -Headers $testHeaders
      if(($pair|ConvertTo-Json -Compress) -ne ($validated|ConvertTo-Json -Compress)){throw 'ISOLATED_PAIR_VALIDATION_CHANGED'}
    }
    $validationAfter=@($pair.sourceAccountId,$pair.targetAccountId)|ForEach-Object {Get-CoreSnapshot $_}
    if(($validationBefore|ConvertTo-Json -Depth 6 -Compress) -ne ($validationAfter|ConvertTo-Json -Depth 6 -Compress)){throw 'ISOLATED_PAIR_GET_MUTATED_CORE'}
    $attempt.validation=@{status='PASSED';repeatCount=2;before=@($validationBefore);after=@($validationAfter)}
    Save-Report 'PENDING'
    $customerToken=Get-PasswordToken 'bank-customer' 'bank-golden-path' $username $customerPassword
    $customerHeaders=@{Authorization="Bearer $customerToken"}
    $read=Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/accounts/$($pair.sourceAccountId)" -Headers $customerHeaders
    if([long]$read.accountId -ne [long]$pair.sourceAccountId -or [decimal]$read.balance -ne 1000 -or $read.currency -ne 'CNY'){throw 'ISOLATED_GATEWAY_READBACK_INVALID'}
    $beneficiaries=Invoke-RestMethod -Uri "$GatewayBaseUrl/api/customer/v1/beneficiaries" -Headers $customerHeaders
    if(@($beneficiaries.items|Where-Object {$_.beneficiaryId -eq $pair.beneficiaryRef}).Count -ne 1){throw 'ISOLATED_BENEFICIARY_READBACK_INVALID'}
    $coreReadbacks=@()
    foreach($accountId in @($pair.sourceAccountId,$pair.targetAccountId)) {
      $snapshot=Get-CoreSnapshot $accountId
      $expected=if($accountId -eq $pair.sourceAccountId){1000}else{2000}
      if($snapshot.transactionIds.Count -ne 1 -or [decimal]$snapshot.balance -ne $expected){throw 'ISOLATED_INITIAL_HISTORY_INVALID'}
      $coreReadbacks+=$snapshot
    }
    $pair|Add-Member -NotePropertyName coreReadbacks -NotePropertyValue $coreReadbacks
    $results.Add($pair);Save-Report 'PENDING'
  }
  $stage='ISOLATION_AND_BASELINE'
  $ids=@($results|ForEach-Object {$_.sourceAccountId;$_.targetAccountId})
  if(@($ids|Select-Object -Unique).Count -ne 4 -or @($ids|Where-Object {$_ -in $baselineIds}).Count){throw 'CORE_ACCOUNTS_NOT_ISOLATED'}
  $baselineAfter=@($baselineIds|ForEach-Object {Get-CoreSnapshot $_})
  $after=$baselineAfter|ConvertTo-Json -Depth 6 -Compress
  $stage='BUSINESS_DATES_AFTER'
  $businessDateAfter=@((Invoke-RestMethod -Uri "$FineractBaseUrl/api/v1/businessdate" -Headers $coreHeaders)|ForEach-Object {$_})
  $dateAfter=ConvertTo-Json -InputObject $businessDateAfter -Depth 6 -Compress
  if($before -ne $after -or $dateBefore -ne $dateAfter){throw 'RETAINED_BANK_STATE_CHANGED'}
  $stage='COMPLETED'
} catch {
  $failure=@{stage=$stage;errorType=$_.Exception.GetType().Name}
  if($null -ne $_.Exception.Response){$failure.httpStatus=[int]$_.Exception.Response.StatusCode}
  if($_.ErrorDetails.Message -match '^\s*\{') {
    $problem=$_.ErrorDetails.Message|ConvertFrom-Json
    if($problem.code){$failure.code=[string]$problem.code}
    if($null -ne $problem.coreStatus){$failure.coreStatus=[int]$problem.coreStatus}
  }
  if($_.Exception.Message -match '^[A-Z][A-Z0-9_]+$'){$failure.code=$_.Exception.Message}
} finally {
  foreach($subject in $subjects) {
    try {Invoke-RestMethod -Method Delete -Uri "$GatewayBaseUrl/internal/test-support/v1/identities/$subject" -Headers $testHeaders|Out-Null}
    catch {$cleanupFailures.Add('IDENTITY_MAPPING:'+ $subject)}
  }
  foreach($identity in $createdUsers) {
    try {Remove-KeycloakObject $identity.realm 'users' $identity.id}
    catch {$cleanupFailures.Add('KEYCLOAK_USER:'+ $identity.id)}
  }
  Save-Report $(if($cleanupFailures.Count){'FAILED'}else{'COMPLETED'})
}
Write-Output "RF057_TRANSFER_FIXTURES=$(if($failure -or $cleanupFailures.Count){'FAILED'}else{'PASSED'}) stage=$stage report=agent/runs/rf057-transfer-fixtures/$runId.json"
if($failure -or $cleanupFailures.Count){exit 1}
