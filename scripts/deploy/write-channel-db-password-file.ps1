# Writes the Channel PostgreSQL password file from the prepared local environment.
# Run this after demo.ps1 prepare has materialized .env.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$envFile = Join-Path $root '.env'
$secretsDir = Join-Path $root 'secrets'

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw 'CHANNEL_DB_ENVIRONMENT_MISSING'
}

if (-not (Test-Path -LiteralPath $secretsDir -PathType Container)) {
  New-Item -ItemType Directory -Path $secretsDir | Out-Null
}

$channelDbPassword = $null
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^CHANNEL_DB_PASSWORD=(.*)$') {
    $channelDbPassword = $Matches[1]
  }
}
if ([string]::IsNullOrWhiteSpace($channelDbPassword) -or $channelDbPassword -match '^replace-with') {
  throw 'CHANNEL_DB_PASSWORD_NOT_PREPARED'
}

$secretFile = Join-Path $secretsDir 'channel-db-password.txt'
[IO.File]::WriteAllText($secretFile, $channelDbPassword, (New-Object Text.UTF8Encoding($false)))
Write-Output 'CHANNEL_DB_PASSWORD_FILE=READY'
