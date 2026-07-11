param(
  [Parameter(Mandatory=$true)][string]$MakerToken,
  [Parameter(Mandatory=$true)][string]$CheckerToken,
  [Parameter(Mandatory=$true)][string]$TransferId,
  [string]$GatewayBaseUrl = 'http://127.0.0.1:18443'
)
$ErrorActionPreference = 'Stop'
$maker = @{ Authorization = "Bearer $MakerToken"; 'Content-Type' = 'application/json' }
$checker = @{ Authorization = "Bearer $CheckerToken"; 'Content-Type' = 'application/json' }
$decision = $null
try {
  $decision = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/risk/evaluate" -Headers $maker -Body (@{transferId=$TransferId;amount='20000'}|ConvertTo-Json)
  if ($decision.decision -ne 'REVIEW') { throw "Expected REVIEW, got $($decision.decision)" }
  $selfStatus = 0
  try { Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/risk/$($decision.decisionId)/approve?version=1&reason=self" -Headers $maker | Out-Null }
  catch { $selfStatus = $_.Exception.Response.StatusCode.value__ }
  if ($selfStatus -ne 409) { throw "Expected maker self-approval 409, got $selfStatus" }
  $approved = Invoke-RestMethod -Method Post -Uri "$GatewayBaseUrl/api/operations/v1/risk/$($decision.decisionId)/approve?version=1&reason=independent" -Headers $checker
  if ($approved.decision -ne 'ALLOW') { throw "Expected ALLOW, got $($approved.decision)" }
  Write-Output "RISK=PASS decision=REVIEW selfCheck=409 checker=ALLOW decisionId=$($decision.decisionId)"
}
finally {
  if ($null -ne $decision) { docker exec mifos-channel-bank-channel-postgres-1 psql -U bank_channel -d bank_channel -c "delete from risk_decision where decision_id='$($decision.decisionId)';" | Out-Null }
}
