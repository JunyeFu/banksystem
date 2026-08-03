[CmdletBinding()]
param(
  [string]$EnvironmentPath = (Join-Path $PSScriptRoot '..\..\.env')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $EnvironmentPath)) { throw "Local environment file is missing: $EnvironmentPath" }
$lines = Get-Content -LiteralPath $EnvironmentPath
$values = @{}
foreach ($line in $lines) {
  if ($line -match '^[A-Z0-9_]+=') { $parts = $line -split '=', 2; $values[$parts[0]] = $parts[1] }
}
foreach ($name in @('FINERACT_USERNAME', 'FINERACT_ADMIN_USERNAME', 'FINERACT_ADMIN_PASSWORD')) {
  if ([string]::IsNullOrWhiteSpace($values[$name])) { throw "Required local environment variable is absent: $name" }
}
if ($values['FINERACT_USERNAME'] -ne $values['FINERACT_ADMIN_USERNAME']) {
  throw 'Channel and administrator are different Fineract users; rotate the channel service account deliberately instead.'
}
$updated = $lines | ForEach-Object {
  if ($_ -match '^FINERACT_PASSWORD=') { "FINERACT_PASSWORD=$($values['FINERACT_ADMIN_PASSWORD'])" } else { $_ }
}
[System.IO.File]::WriteAllLines((Resolve-Path -LiteralPath $EnvironmentPath), $updated, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Synchronized the local channel credential with the rotated Fineract administrator credential.'
