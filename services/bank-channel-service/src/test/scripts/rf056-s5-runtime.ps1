[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$golden = . (Join-Path $repositoryRoot 'scripts/demo/run-golden-path.ps1') | ConvertFrom-Json
$golden | ConvertTo-Json -Compress | Write-Output

# The golden operator owns payments, not reconciliation. Use a separate accountant.
$accountantId = $null
try {
  $accountantPassword = New-Secret
  $accountantName = 'rf056-accountant-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
  $accountantId = New-KeycloakUser $internalRealm $accountantName $accountantPassword
  Add-KeycloakRoles $internalRealm $accountantId @('ACCOUNTANT')
  $accountantToken = Get-PasswordToken $internalRealm $operatorClient $accountantName $accountantPassword
  $accountantHeaders = @{
    Authorization = "Bearer $accountantToken"
    'Content-Type' = 'application/json'
    'X-Correlation-ID' = $golden.correlationId
  }
  foreach ($type in @('CHANNEL_TO_CORE', 'CHANNEL_TO_CLEARING', 'CORE_TO_GENERAL_LEDGER')) {
    $recon = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/internal/reconciliation/run?type=$type" -Headers $accountantHeaders
    if ($recon.status -ne 'MATCHED' -or $recon.differenceCount -ne 0) {
      throw "RF056_S5_RECONCILIATION_FAILED:$type"
    }
    $readback = Invoke-RestMethod -Uri "$GatewayBaseUrl/internal/reconciliation/latest" -Headers $accountantHeaders
    if ($readback.runId -ne $recon.runId -or $readback.status -ne 'MATCHED' -or $readback.differenceCount -ne 0) {
      throw "RF056_S5_RECONCILIATION_READBACK_FAILED:$type"
    }
    $publicRuns = @(Invoke-RestMethod -Uri "$GatewayBaseUrl/api/operations/v1/reconciliations" -Headers $accountantHeaders)
    $publicReadback = @($publicRuns | Where-Object { $_.runId -eq $recon.runId })
    if ($publicReadback.Count -ne 1 -or $publicReadback[0].status -ne 'MATCHED') {
      throw "RF056_S5_OPERATIONS_READBACK_FAILED:$type"
    }
    Write-Output ("RF056_S5_RECON=PASS type={0} runId={1} differences=0 internal=MATCH operations=MATCH" -f $type, $recon.runId)
  }
} finally {
  Remove-KeycloakObject $internalRealm 'users' $accountantId
}
