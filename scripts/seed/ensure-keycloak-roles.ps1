param(
  [Parameter(Mandatory=$true)][string]$AdminToken,
  [string]$KeycloakBaseUrl = 'http://127.0.0.1:19000',
  [string]$Realm = 'bank-internal'
)
$ErrorActionPreference='Stop'
$headers=@{Authorization="Bearer $AdminToken";'Content-Type'='application/json'}
$roles = if ($Realm -eq 'bank-customer') {
  @('CUSTOMER','CUSTOMER_MFA_VERIFIED','CUSTOMER_BLOCKED')
} else {
  @('TELLER','LOAN_OFFICER','LOAN_APPROVER','PAYMENT_OPERATOR','PAYMENT_APPROVER','AML_ANALYST','AUDITOR','SYSTEM_ADMIN')
}
foreach($role in $roles){
  try { Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles/$role" -Headers $headers | Out-Null }
  catch { Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles" -Headers $headers -Body (@{name=$role}|ConvertTo-Json) | Out-Null }
}

$defaultRoleAssigned = $false
if ($Realm -eq 'bank-customer') {
  $defaultRoleName = "default-roles-$Realm"
  $effectiveDefaults = @(Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles/$defaultRoleName/composites" -Headers $headers)
  if ($effectiveDefaults.name -notcontains 'CUSTOMER') {
    $customerRole = Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles/CUSTOMER" -Headers $headers
    $body = '[' + ($customerRole | ConvertTo-Json -Compress) + ']'
    Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/admin/realms/$Realm/roles/$defaultRoleName/composites" -Headers $headers -Body $body | Out-Null
  }
  $defaultRoleAssigned = $true
}

"roles=PASS realm=$Realm count=$($roles.Count) customerDefault=$defaultRoleAssigned"
