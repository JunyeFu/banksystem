$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'rf057-bank.ps1'),[ref]$null,[ref]$null)
foreach($name in @('Save-CleanupState','Remove-OwnedRegressionIdentities')) {
  $definition=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  Invoke-Expression $definition.Extent.Text
}
# All dependencies below are test-process functions. No network or credential file is used.
function Invoke-RestMethod {param($Method,$Uri,$ContentType,$Body,$Headers)
  if($script:failClear -and $Uri -like '*customer-scenario:clear'){throw 'TEST_CLEAR_FAILURE'}
  return @{access_token='synthetic-only'}
}
function Get-PasswordToken {return 'synthetic-only'}
function Remove-KeycloakObject {}
$Profile='Authentication';$GatewayBaseUrl='http://bank.invalid';$KeycloakBaseUrl='http://keycloak.invalid'
$internalRealm='synthetic';$operatorClient='synthetic';$adminUsername='synthetic';$adminPassword='synthetic'
$adminHeaders=@{};$identities=@{operator=@{username='synthetic';password='synthetic'}}
foreach($failure in @($false,$true)) {
  $script:failClear=$failure
  $cleanupId=[Guid]::NewGuid().ToString('N');$acceptanceRunId=[Guid]::NewGuid().ToString();$acceptanceIdentity='a'*64
  $cleanupPath=Join-Path $repo "agent/runs/interview-repair-20261105/cleanup-producer/$cleanupId.json"
  $createdUsers=New-Object 'System.Collections.Generic.List[object]'
  $createdUsers.Add(@{realm='synthetic';id='synthetic-customer'});$createdUsers.Add(@{realm='synthetic';id='synthetic-sample'})
  $bankSampleSubjects=New-Object 'System.Collections.Generic.List[string]';$bankSampleSubjects.Add('synthetic-sample')
  $cleanupFailures=New-Object 'System.Collections.Generic.List[string]'
  $cleanupResults=New-Object 'System.Collections.Generic.List[object]';$probeCustomerId='synthetic-customer'
  $threw=$false
  try {Remove-OwnedRegressionIdentities | Out-Null} catch {if($_.Exception.Message -ne 'RF057_IDENTITY_CLEANUP_INCOMPLETE'){throw};$threw=$true}
  $receipt=Get-Content -LiteralPath $cleanupPath -Raw | ConvertFrom-Json
  if($receipt.runId -ne $acceptanceRunId -or $receipt.releaseIdentityHash -ne $acceptanceIdentity -or $receipt.ownedResources.Count -ne 5){throw 'CLEANUP_PRODUCER_BINDING_FAILED'}
  if($failure) {
    if(-not $threw -or $receipt.status -ne 'FAILED' -or $receipt.failures.Count -ne 1 -or $receipt.results.Count -ne 4){throw 'CLEANUP_PRODUCER_FAILURE_HIDDEN'}
  }elseif($threw -or $receipt.status -ne 'COMPLETED' -or $receipt.results.Count -ne 5 -or $receipt.failures.Count -ne 0){throw 'CLEANUP_PRODUCER_SUCCESS_FAILED'}
}
Write-Output 'CLEANUP_PRODUCER=PASS cases=2 execution=ISOLATED_NO_NETWORK'
