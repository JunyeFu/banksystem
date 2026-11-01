[CmdletBinding()]
param([ValidateSet('Business','Performance','Agent','AgentPerformance','Authentication')][string]$Profile='Business')
$ErrorActionPreference='Stop'
$repositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$node=Join-Path $repositoryRoot 'platform/hengzhun-regression-system/runtime/node-v24.19.0-win-x64/node.exe'
if($Profile -in @('Agent','AgentPerformance')) {
  & $node (Join-Path $PSScriptRoot 'rf057-agent.mjs') --check-authority
  if($LASTEXITCODE -ne 0){throw 'RF057_AGENT_LIVE_AUTHORIZATION_REQUIRED'}
}
# Read-only Agent setup imports helper definitions, not the golden transfer
# workflow. Business/performance retain the proven golden entrypoint.
if($Profile -in @('Agent','AgentPerformance','Authentication')) {
  $EnvironmentPath=Join-Path $repositoryRoot '.env'
  $GatewayBaseUrl='http://127.0.0.1:18443';$KeycloakBaseUrl='http://127.0.0.1:19000'
  $FineractBaseUrl='http://127.0.0.1:13000/fineract-provider'
  $customerRealm='bank-customer';$internalRealm='bank-internal'
  $customerClient='bank-golden-path';$operatorClient='bank-golden-path'
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repositoryRoot 'scripts/demo/run-golden-path.ps1'),[ref]$null,[ref]$null)
  foreach($helper in @('Get-EnvironmentValues','Require-Value','New-Secret','New-KeycloakUser','Add-KeycloakRoles','Get-PasswordToken','Remove-KeycloakObject')) {
    $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $helper},$true)
    Invoke-Expression $definition.Extent.Text
  }
  $values=Get-EnvironmentValues;$adminUsername=Require-Value $values 'KEYCLOAK_ADMIN_USERNAME';$adminPassword=Require-Value $values 'KEYCLOAK_ADMIN_PASSWORD'
  $admin=Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id='admin-cli';grant_type='password';username=$adminUsername;password=$adminPassword}
  $adminHeaders=@{Authorization="Bearer $($admin.access_token)";'Content-Type'='application/json'}
  $testHeaders=$null;$golden=$null;$operatorToken=$null
}else {
  $golden=. (Join-Path $repositoryRoot 'scripts/demo/run-golden-path.ps1') | ConvertFrom-Json
}
$createdUsers=New-Object 'System.Collections.Generic.List[object]'
$bankSampleSubjects=New-Object 'System.Collections.Generic.List[string]'
$cleanupFailures=New-Object 'System.Collections.Generic.List[string]'
$probeCustomerId=$null
$cleanupId=[Guid]::NewGuid().ToString('N')
$cleanupPath=Join-Path $repositoryRoot "agent/runs/rf057-cleanup/$cleanupId.json"
function Save-CleanupState([string]$Status) {
  [IO.Directory]::CreateDirectory((Split-Path $cleanupPath)) | Out-Null
  $state=@{schemaVersion='rf057-identity-cleanup/v1';status=$Status;createdAt=[DateTime]::UtcNow.ToString('o');users=@($createdUsers.ToArray());customerSubject=$probeCustomerId;bankSampleSubjects=@($bankSampleSubjects.ToArray());failures=@($cleanupFailures.ToArray())}
  [IO.File]::WriteAllText($cleanupPath,($state | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
}
function New-BankSampleIdentities {
  foreach($label in @('authoring','desktop-1','desktop-2','narrow-1','narrow-2')) {
    $password=New-Secret
    $username='rf057-bank-'+$label+'-'+[Guid]::NewGuid().ToString('N').Substring(0,12)
    $id=New-KeycloakUser $customerRealm $username $password
    $createdUsers.Add(@{realm=$customerRealm;id=$id});$bankSampleSubjects.Add($id)
    Save-CleanupState 'PENDING'
    Add-KeycloakRoles $customerRealm $id @('CUSTOMER')
    @{id=$id;username=$username;password=$password}
  }
}
function Remove-OwnedRegressionIdentities {
  $adminReady=$false;$testReady=$false
  try {
    $freshAdmin=Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id='admin-cli';grant_type='password';username=$adminUsername;password=$adminPassword}
    $adminHeaders.Authorization="Bearer $($freshAdmin.access_token)";$adminReady=$true
  } catch {$cleanupFailures.Add('ADMIN_TOKEN_REFRESH')}
  if($null -ne $probeCustomerId -or $bankSampleSubjects.Count) {
    try {
      $freshTest=Get-PasswordToken $internalRealm $operatorClient $identities.operator.username $identities.operator.password
      $testHeaders=@{Authorization="Bearer $freshTest";'Content-Type'='application/json'};$testReady=$true
    } catch {$cleanupFailures.Add('TEST_TOKEN_REFRESH')}
  }
  if($testReady) {
    if($null -ne $probeCustomerId) {
      try {
        $clear=@{subject=$probeCustomerId;logicalCustomerRef='customer.alice';destinationCustomerRef='customer.bob'} | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/customer-scenario:clear" -Headers $testHeaders -Body $clear | Out-Null
      } catch {$cleanupFailures.Add('CUSTOMER_SCENARIO_CLEAR')}
    }
    $mappingSubjects=@($bankSampleSubjects.ToArray())
    if($null -ne $probeCustomerId){$mappingSubjects+=@($probeCustomerId)}
    foreach($subject in $mappingSubjects) {
      try {Invoke-RestMethod -Method Delete -Uri "$GatewayBaseUrl/internal/test-support/v1/identities/$subject" -Headers $testHeaders | Out-Null}
      catch {$cleanupFailures.Add('IDENTITY_MAPPING:'+ $subject)}
    }
  }
  if($adminReady) {
    foreach($identity in $createdUsers) {
      try {Remove-KeycloakObject $identity.realm 'users' $identity.id}
      catch {$cleanupFailures.Add('KEYCLOAK_USER:'+ $identity.id)}
    }
  }
  $cleanupStatus=if($cleanupFailures.Count){'FAILED'}else{'COMPLETED'}
  Save-CleanupState $cleanupStatus
  Write-Output "RF057_IDENTITY_CLEANUP=$cleanupStatus state=agent/runs/rf057-cleanup/$cleanupId.json"
  if($cleanupFailures.Count){throw 'RF057_IDENTITY_CLEANUP_INCOMPLETE'}
}
try {
  $identities=@{}
  foreach($entry in @(
    @{name='customer'; realm=$customerRealm; roles=@('CUSTOMER')},
    @{name='operator'; realm=$internalRealm; roles=@('PAYMENT_OPERATOR','TEST_SUPPORT')},
    @{name='accountant'; realm=$internalRealm; roles=@('ACCOUNTANT')},
    @{name='maker'; realm=$internalRealm; roles=@('LOAN_OFFICER','LOAN_APPROVER')},
    @{name='checker'; realm=$internalRealm; roles=@('LOAN_APPROVER')}
  )) {
    $password=New-Secret
    $username='rf057-'+$entry.name+'-'+[Guid]::NewGuid().ToString('N').Substring(0,12)
    $id=New-KeycloakUser $entry.realm $username $password
    $createdUsers.Add(@{realm=$entry.realm;id=$id})
    Save-CleanupState 'PENDING'
    Add-KeycloakRoles $entry.realm $id $entry.roles
    $client=if($entry.realm -eq $customerRealm){$customerClient}else{$operatorClient}
    $token=Get-PasswordToken $entry.realm $client $username $password
    $clientRows=@(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$($entry.realm)/clients?clientId=$client" -Headers $adminHeaders | Where-Object { $_.clientId -eq $client })
    $secret=Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$($entry.realm)/clients/$($clientRows[0].id)/client-secret" -Headers $adminHeaders
    $identities[$entry.name]=@{token=$token;username=$username;password=$password;id=$id;realm=$entry.realm;client=$client;clientSecret=$secret.value}
  }
  $probeCustomerId=$identities.customer.id
  $bankSampleIdentities=@()
  if($Profile -eq 'Agent'){$bankSampleIdentities=@(New-BankSampleIdentities)}
  if($Profile -in @('Agent','AgentPerformance','Authentication')) {
    $operatorToken=$identities.operator.token
    $testHeaders=@{Authorization="Bearer $operatorToken";'Content-Type'='application/json';'X-Regression-Namespace'='rf057-agent';'X-Regression-Run-Id'=$cleanupId}
    $sourceFixture=Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures/account.alice.primarySavings" -Headers $testHeaders
    $targetFixture=Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/test-support/v1/fixtures/account.bob.primarySavings" -Headers $testHeaders
    $golden=@{sourceAccountId=[string]$sourceFixture.accountId;targetAccountId=[string]$targetFixture.accountId}
  }
  $link=@{subject=$probeCustomerId;logicalRef='customer.alice'} | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/identities:link" -Headers $testHeaders -Body $link | Out-Null
  $scenarioBody=@{subject=$probeCustomerId;logicalCustomerRef='customer.alice';destinationCustomerRef='customer.bob'} | ConvertTo-Json -Compress
  $scenario=Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/test-support/v1/customer-scenario:seed" -Headers $testHeaders -Body $scenarioBody
  if($scenario.status -ne 'READY'){throw 'RF057_SCENARIO_NOT_READY'}
  $config=@{profile=$Profile;cleanupId=$cleanupId;gateway=$GatewayBaseUrl;keycloak=$KeycloakBaseUrl;fineract=$FineractBaseUrl;identities=$identities;bankSampleIdentities=$bankSampleIdentities;beneficiaryRef=[string]$scenario.beneficiaryId;
    fineractUser=(Require-Value $values 'FINERACT_USERNAME');fineractPassword=(Require-Value $values 'FINERACT_PASSWORD');
    fineractTenant=(Require-Value $values 'FINERACT_TENANT');golden=$golden;testToken=$operatorToken;
    contractHashes=@{operations=(Get-FileHash (Join-Path $repositoryRoot 'contracts/openapi/operations-api.yaml') -Algorithm SHA256).Hash}}
  $entry=if($Profile -in @('Agent','AgentPerformance')){'rf057-agent.mjs'}elseif($Profile -eq 'Authentication'){'rf057/auth-integration.mjs'}else{'rf057/bank.mjs'}
  $driverArguments=if($Profile -eq 'AgentPerformance'){@('--performance')}else{@()}
  $config | ConvertTo-Json -Depth 8 -Compress | & $node (Join-Path $PSScriptRoot $entry) @driverArguments
  if($LASTEXITCODE -ne 0){throw 'RF057_BANK_SUITE_FAILED'}
} finally {
  Remove-OwnedRegressionIdentities
}
