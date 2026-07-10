[CmdletBinding()]
param(
  [string]$EnvironmentPath = (Join-Path $PSScriptRoot '..\..\.env')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $EnvironmentPath)) {
  throw "Local environment file is missing: $EnvironmentPath. Run restore-runtime-env.ps1 first."
}

$content = Get-Content -LiteralPath $EnvironmentPath
if ($content | Where-Object { $_ -match '^CLEARING_CALLBACK_SECRET=.+$' }) {
  Write-Output 'CLEARING_CALLBACK_SECRET is already present.'
  exit 0
}

$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToHexString($bytes).ToLowerInvariant()
[System.IO.File]::AppendAllText((Resolve-Path -LiteralPath $EnvironmentPath), "`nCLEARING_CALLBACK_SECRET=$secret`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Added a generated CLEARING_CALLBACK_SECRET to the local environment file.'
