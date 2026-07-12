[CmdletBinding()]
param(
  [string]$EnvironmentPath = (Join-Path $PSScriptRoot '..\..\.env'),
  [string]$BaseUrl = 'http://127.0.0.1:13000/fineract-provider'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $EnvironmentPath)) {
  throw "Local environment file is missing: $EnvironmentPath"
}

$values = @{}
Get-Content -LiteralPath $EnvironmentPath | Where-Object { $_ -match '^[A-Z0-9_]+=' } | ForEach-Object {
  $parts = $_ -split '=', 2
  $values[$parts[0]] = $parts[1]
}
if ($values.ContainsKey('FINERACT_ADMIN_PASSWORD')) {
  throw 'FINERACT_ADMIN_PASSWORD is already present; refusing to rotate the administrator a second time.'
}

$current = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('mifos:password'))
$headers = @{ Authorization = "Basic $current"; 'fineract-platform-tenantid' = 'default'; 'Content-Type' = 'application/json' }
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$newPassword = 'Ba1!' + [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'B').Replace('=', 'C')
$body = @{ password = $newPassword; repeatPassword = $newPassword } | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/users/1/pwd" -Headers $headers -Body $body | Out-Null
[System.IO.File]::AppendAllText((Resolve-Path -LiteralPath $EnvironmentPath), "`nFINERACT_ADMIN_USERNAME=mifos`nFINERACT_ADMIN_PASSWORD=$newPassword`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Rotated the default Fineract administrator password and stored the replacement only in the local environment file.'
