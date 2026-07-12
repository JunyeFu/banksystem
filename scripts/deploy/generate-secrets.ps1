# Generates Docker secret files from .env values.
# Run this after copying .env.example to .env and filling in real values.
# Usage: pwsh scripts/deploy/generate-secrets.ps1

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$envFile = Join-Path $root '.env'
$secretsDir = Join-Path $root 'secrets'

if (-not (Test-Path $envFile)) {
  Write-Error ".env file not found at $envFile. Copy .env.example first."
  exit 1
}

if (-not (Test-Path $secretsDir)) {
  New-Item -ItemType Directory -Path $secretsDir | Out-Null
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#')) {
    $parts = $line -split '=', 2
    if ($parts.Length -eq 2) {
      $key = $parts[0].Trim()
      $value = $parts[1].Trim()
      Set-Variable -Name $key -Value $value -ErrorAction SilentlyContinue
    }
  }
}

$channelDbPassword = Get-Variable -Name 'CHANNEL_DB_PASSWORD' -ValueOnly -ErrorAction SilentlyContinue
if ($channelDbPassword -and $channelDbPassword -ne 'replace-with-a-local-random-secret') {
  $secretFile = Join-Path $secretsDir 'channel-db-password.txt'
  [System.IO.File]::WriteAllText($secretFile, $channelDbPassword)
  Write-Output "Generated: secrets/channel-db-password.txt"
} else {
  Write-Warning "CHANNEL_DB_PASSWORD not set or still placeholder. Skipping channel-db-password.txt."
}

Write-Output 'Secret generation complete.'
