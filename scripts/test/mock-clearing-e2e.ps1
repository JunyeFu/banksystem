param([Parameter(Mandatory=$true)][string]$BearerToken,[Parameter(Mandatory=$true)][string]$TransferId)
$ErrorActionPreference='Stop';$h=@{Authorization="Bearer $BearerToken";'Content-Type'='application/json'}
foreach($scenario in @('SUCCESS','TIMEOUT','DUPLICATE','OUT_OF_ORDER')){
  $key="clearing-e2e-$scenario-0001";$r=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18081/api/operations/v1/clearing/payments' -Headers ($h+@{'Idempotency-Key'=$key}) -Body (@{transferId=$TransferId;scenario=$scenario}|ConvertTo-Json);$id=$r.clearingId
  if($scenario -eq 'OUT_OF_ORDER'){Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18081/internal/mock-clearing/$id/deliver/2" -Headers $h|Out-Null;Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18081/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null}else{Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18081/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null;Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18081/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null}
  Write-Output "$scenario=PASS"
}
