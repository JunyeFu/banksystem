param(
  [Parameter(Mandatory=$true)][string]$AdminToken,
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:19000',
  [string]$Realm = 'bank-internal'
)
$ErrorActionPreference='Stop'
$headers=@{Authorization="Bearer $AdminToken";'Content-Type'='application/json'}
$roles=@('TELLER','LOAN_OFFICER','LOAN_APPROVER','PAYMENT_OPERATOR','PAYMENT_APPROVER','AML_ANALYST','AUDITOR','SYSTEM_ADMIN')
foreach($role in $roles){
  try { Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles/$role" -Headers $headers | Out-Null }
  catch { Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles" -Headers $headers -Body (@{name=$role}|ConvertTo-Json) | Out-Null }
}
"roles=PASS count=$($roles.Count)"
