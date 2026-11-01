[CmdletBinding()]
param([Parameter(Mandatory=$true)][datetime]$CreatedAfter,[Parameter(Mandatory=$true)][datetime]$CreatedBefore,[switch]$Delete)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$EnvironmentPath=Join-Path $root '.env'
$KeycloakBaseUrl='http://127.0.0.1:19000'
# Load only source helper definitions, without executing a new golden transfer.
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'scripts/demo/run-golden-path.ps1'),[ref]$null,[ref]$null)
foreach($name in @('Get-EnvironmentValues','Require-Value')){
  $definition=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  Invoke-Expression $definition.Extent.Text
}
$values=Get-EnvironmentValues
$token=Invoke-RestMethod -Method Post -Uri "$KeycloakBaseUrl/realms/master/protocol/openid-connect/token" -ContentType 'application/x-www-form-urlencoded' -Body @{client_id='admin-cli';grant_type='password';username=(Require-Value $values 'KEYCLOAK_ADMIN_USERNAME');password=(Require-Value $values 'KEYCLOAK_ADMIN_PASSWORD')}
$headers=@{Authorization="Bearer $($token.access_token)"}
$start=[DateTimeOffset]::new($CreatedAfter.ToUniversalTime()).ToUnixTimeMilliseconds()
$end=[DateTimeOffset]::new($CreatedBefore.ToUniversalTime()).ToUnixTimeMilliseconds()
$targets=@()
foreach($realm in @('bank-customer','bank-internal')){
  $users=Invoke-RestMethod -Uri "$KeycloakBaseUrl/admin/realms/$realm/users?search=rf057-&max=100" -Headers $headers
  foreach($user in $users){
    if($user.username -match '^rf057-(customer|operator|accountant|maker|checker)-[a-f0-9]{12}$' -and $user.createdTimestamp -ge $start -and $user.createdTimestamp -le $end){
      $targets+=@{realm=$realm;id=$user.id;roleLabel=$Matches[1];createdTimestamp=$user.createdTimestamp}
    }
  }
}
$targets | ConvertTo-Json -Depth 4 | Write-Output
if($targets.Count -ne 5 -or @($targets.roleLabel | Sort-Object -Unique).Count -ne 5){throw "RF057_RECOVERY_EXACT_SET_NOT_FOUND:$($targets.Count)"}
if($Delete){foreach($target in $targets){Invoke-RestMethod -Method Delete -Uri "$KeycloakBaseUrl/admin/realms/$($target.realm)/users/$($target.id)" -Headers $headers | Out-Null};Write-Output 'RF057_RECOVERY=DELETED_EXACT_FIVE'}
