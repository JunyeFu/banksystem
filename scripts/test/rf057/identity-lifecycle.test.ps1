$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot '../rf057-bank.ps1'
$errors=$null;$tokens=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'RF057_LIFECYCLE_PARSE_FAILED'}
foreach($name in @('New-BankSampleIdentities','Remove-OwnedRegressionIdentities')){
  $definition=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  Invoke-Expression $definition.Extent.Text
}
function Assert-Equal($Actual,$Expected){if($Actual -ne $Expected){throw "RF057_LIFECYCLE_ASSERT:$Actual/$Expected"}}
function New-Secret {'test-only-password'}
function New-KeycloakUser($Realm,$Username,$Password){[Guid]::NewGuid().ToString()}
function Add-KeycloakRoles($Realm,$Id,$Roles){if($script:roleFailure -and $bankSampleSubjects.Count -eq 2){throw 'test-only-role-failure'}}
function Save-CleanupState($Status){$script:receipts.Add(@{status=$Status;userCount=$createdUsers.Count;subjectCount=$bankSampleSubjects.Count})}
function Get-PasswordToken {'test-only-token'}
function Invoke-RestMethod {
  param($Method,$Uri,$ContentType,$Body,$Headers)
  if($Uri -like '*/realms/master/*'){return @{access_token='test-only-admin-token'}}
  $script:cleanupCalls.Add($Uri)
  if($script:mappingFailure -and $Uri -like '*/identities/*' -and $script:cleanupCalls.Count -eq 1){throw 'test-only-mapping-failure'}
}
function Remove-KeycloakObject($Realm,$Kind,$Id){
  $script:removedUsers.Add($Id)
  if($script:userFailure -and $script:removedUsers.Count -eq 1){throw 'test-only-user-failure'}
}
$customerRealm='bank-customer';$internalRealm='bank-internal';$operatorClient='test-only-client'
$KeycloakBaseUrl='http://keycloak.invalid';$GatewayBaseUrl='http://bank.invalid';$adminHeaders=@{}
$adminUsername='test-only-admin';$adminPassword='test-only-admin-password';$cleanupId='test-only-cleanup'
$identities=@{operator=@{username='test-only-operator';password='test-only-password'}}
foreach($case in @('success','role-failure','cleanup-failure')){
  $createdUsers=New-Object 'System.Collections.Generic.List[object]'
  $bankSampleSubjects=New-Object 'System.Collections.Generic.List[string]'
  $cleanupFailures=New-Object 'System.Collections.Generic.List[string]'
  $script:receipts=New-Object 'System.Collections.Generic.List[object]'
  $script:cleanupCalls=New-Object 'System.Collections.Generic.List[string]'
  $script:removedUsers=New-Object 'System.Collections.Generic.List[string]'
  $probeCustomerId=$null;$testHeaders=$null
  $script:roleFailure=$case -eq 'role-failure';$script:mappingFailure=$case -eq 'cleanup-failure';$script:userFailure=$script:mappingFailure
  if($script:roleFailure){
    $failed=$false;try {$null=@(New-BankSampleIdentities)}catch {$failed=$true}
    Assert-Equal $failed $true;Assert-Equal $createdUsers.Count 2;Assert-Equal $bankSampleSubjects.Count 2
    Assert-Equal $receipts[-1].subjectCount 2
  }else{
    $samples=@(New-BankSampleIdentities)
    Assert-Equal $samples.Count 5;Assert-Equal $createdUsers.Count 5;Assert-Equal $receipts.Count 5
    Assert-Equal (@($samples.id|Sort-Object -Unique).Count) 5
  }
  $failed=$false;try {Remove-OwnedRegressionIdentities|Out-Null}catch {$failed=$true}
  Assert-Equal $removedUsers.Count $createdUsers.Count;Assert-Equal $cleanupCalls.Count $bankSampleSubjects.Count
  Assert-Equal $failed ($case -eq 'cleanup-failure')
  Assert-Equal $receipts[-1].status $(if($failed){'FAILED'}else{'COMPLETED'})
}
Write-Output 'RF057_IDENTITY_LIFECYCLE_CONTRACT=PASS cases=3 noExternalCalls=true'
