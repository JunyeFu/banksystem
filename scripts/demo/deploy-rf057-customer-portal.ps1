[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$runId=[Guid]::NewGuid().ToString('N')
$outputDirectory=Join-Path $repositoryRoot "agent/runs/rf057-portal-deploy/$runId"
[IO.Directory]::CreateDirectory($outputDirectory)|Out-Null
$composePath=Join-Path $repositoryRoot 'compose.channel.yaml'
$overridePath=Join-Path $outputDirectory 'image.yaml'
$report=[ordered]@{schemaVersion='rf057-portal-deploy/v1';runId=$runId;status='IN_PROGRESS';stage='BASELINE';evidenceLevel='INTEGRATION';agentLive=$false}
function Invoke-DockerChecked([string[]]$Arguments) {
  $result=& docker @Arguments
  if($LASTEXITCODE -ne 0){throw "PORTAL_DOCKER_COMMAND_FAILED_$LASTEXITCODE"}
  return $result
}
function Get-BankContainers {
  return @(Invoke-DockerChecked @('ps','-a','--format','{{.Names}}|{{.ID}}')|Where-Object {$_ -match '^mifos-(channel|isolated)-'}|Sort-Object)
}
try {
  $before=Get-BankContainers
  $volumesBefore=@(Invoke-DockerChecked @('volume','ls','--format','{{.Name}}')|Sort-Object)
  $report.previousImage=Invoke-DockerChecked @('inspect','mifos-channel-customer-portal-1','--format','{{.Image}}')
  $report.containersBefore=$before;$report.volumesBefore=$volumesBefore
  $report.stage='BUILD'
  Invoke-DockerChecked @('compose','-p','mifos-channel','-f',$composePath,'build','customer-portal')|Out-Host
  $image=Invoke-DockerChecked @('image','inspect','local/customer-portal:0.1.0','--format','{{.Id}}')
  if($image -notmatch '^sha256:[0-9a-f]{64}$'){throw 'PORTAL_IMAGE_ID_INVALID'}
  $report.builtImage=$image
  [IO.File]::WriteAllText($overridePath,"services:`n  customer-portal:`n    image: $image`n",[Text.UTF8Encoding]::new($false))
  $report.stage='REPLACE'
  Invoke-DockerChecked @('compose','-p','mifos-channel','-f',$composePath,'-f',$overridePath,'up','-d','--no-deps','--no-build','--pull','never','customer-portal')|Out-Host
  $report.stage='HEALTH'
  for($poll=0;$poll -lt 30;$poll++) {
    $health=Invoke-DockerChecked @('inspect','mifos-channel-customer-portal-1','--format','{{.State.Health.Status}}')
    if($health -eq 'healthy'){break}
    if($health -eq 'unhealthy'){throw 'PORTAL_HEALTH_FAILED'}
    Start-Sleep -Seconds 2
  }
  if($health -ne 'healthy'){throw 'PORTAL_HEALTH_NOT_READY'}
  $report.runningImage=Invoke-DockerChecked @('inspect','mifos-channel-customer-portal-1','--format','{{.Image}}')
  if($report.runningImage -ne $image){throw 'PORTAL_IMAGE_MISMATCH'}
  $report.stage='SERVED_SOURCE'
  $html=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:18082/portal/'
  $assetMatch=[regex]::Match($html.Content,'src="([^"]*/assets/index-[^"]+\.js)"')
  if(!$assetMatch.Success){throw 'PORTAL_ENTRY_ASSET_MISSING'}
  $assetUri=[Uri]::new([Uri]'http://127.0.0.1:18082/portal/',$assetMatch.Groups[1].Value)
  if($assetUri.Host -ne '127.0.0.1' -or $assetUri.Port -ne 18082){throw 'PORTAL_ASSET_ORIGIN_INVALID'}
  $asset=(Invoke-WebRequest -UseBasicParsing -Uri $assetUri.AbsoluteUri).Content
  $targets=@('transfer-source-option-','transfer-beneficiary-option-','transfer-currency','transfer-result-id','transfer-result-status','data-payer-account-id','data-beneficiary-id','data-currency')
  foreach($target in $targets){if(!$asset.Contains($target)){throw 'PORTAL_SERVED_TARGET_MISSING'}}
  $report.servedTargets=$targets;$report.assetPath=$assetUri.AbsolutePath
  $report.stage='PRESERVATION'
  $after=Get-BankContainers;$volumesAfter=@(Invoke-DockerChecked @('volume','ls','--format','{{.Name}}')|Sort-Object)
  $report.containersAfter=$after;$report.volumesAfter=$volumesAfter
  $othersBefore=@($before|Where-Object {$_ -notmatch '^mifos-channel-customer-portal-1\|'})
  $othersAfter=@($after|Where-Object {$_ -notmatch '^mifos-channel-customer-portal-1\|'})
  if(@(Compare-Object $othersBefore $othersAfter).Count){throw 'PORTAL_OTHER_BANK_CONTAINER_CHANGED'}
  if(@(Compare-Object $volumesBefore $volumesAfter).Count){throw 'PORTAL_VOLUME_INVENTORY_CHANGED'}
  $report.stage='COMPLETED';$report.status='PASSED'
} catch {
  $report.status='FAILED';$report.failureType=$_.Exception.GetType().Name
  if($_.Exception.Message -match '^[A-Z][A-Z0-9_]+$'){$report.failureCode=$_.Exception.Message}
} finally {
  [IO.File]::WriteAllText((Join-Path $outputDirectory 'report.json'),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
}
Write-Output "RF057_PORTAL_DEPLOY=$($report.status) stage=$($report.stage) report=agent/runs/rf057-portal-deploy/$runId/report.json"
if($report.status -ne 'PASSED'){exit 1}
