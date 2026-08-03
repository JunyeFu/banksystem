param([Parameter(Mandatory=$true)][string]$BearerToken,[Parameter(Mandatory=$true)][string]$TransferId)
$ErrorActionPreference='Stop';$h=@{Authorization="Bearer $BearerToken";'Content-Type'='application/json'}
foreach($scenario in @('SUCCESS_IMMEDIATE','SUCCESS_DELAYED','REJECT_ACCOUNT_INVALID','REJECT_BANK_UNAVAILABLE','TIMEOUT_THEN_SUCCESS','TIMEOUT_THEN_FAIL','RETURN_AFTER_SETTLEMENT','DUPLICATE_CALLBACK','OUT_OF_ORDER_CALLBACK')){
  $key="clearing-e2e-$scenario-$([guid]::NewGuid().ToString('N').Substring(0,8))";$r=Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18443/api/operations/v1/clearing/payments' -Headers ($h+@{'Idempotency-Key'=$key}) -Body (@{transferId=$TransferId;scenario=$scenario}|ConvertTo-Json);$id=$r.clearingId
  if($scenario -eq 'OUT_OF_ORDER_CALLBACK'){Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/2" -Headers $h|Out-Null;Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null}
  elseif($scenario -eq 'DUPLICATE_CALLBACK'){Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null;Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null}
  elseif($scenario -eq 'SUCCESS_DELAYED' -or $scenario -eq 'TIMEOUT_THEN_SUCCESS' -or $scenario -eq 'RETURN_AFTER_SETTLEMENT'){Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null;Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/2" -Headers $h|Out-Null}
  else{Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18443/internal/mock-clearing/$id/deliver/1" -Headers $h|Out-Null}
  Write-Output "$scenario=PASS"
}
