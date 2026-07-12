[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\..\.env')
)

$ErrorActionPreference = 'Stop'

if (Test-Path -LiteralPath $OutputPath) {
  throw "Refusing to overwrite existing local environment file: $OutputPath"
}

function Get-ContainerEnvironmentValue {
  param(
    [Parameter(Mandatory = $true)][string]$Container,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $environment = docker inspect $Container --format '{{range .Config.Env}}{{println .}}{{end}}'
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot inspect running container: $Container"
  }

  $entry = @($environment | Where-Object { $_ -like "$Name=*" }) | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($entry)) {
    throw "Required environment variable $Name is absent from $Container"
  }
  return $entry.Substring($Name.Length + 1)
}

function New-LocalSecret {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToHexString($bytes).ToLowerInvariant()
}

$values = [ordered]@{
  CHANNEL_DB_PASSWORD      = Get-ContainerEnvironmentValue 'mifos-channel-channel-service-1' 'CHANNEL_DB_PASSWORD'
  POSTGRES_PASSWORD        = Get-ContainerEnvironmentValue 'mifos-isolated-postgresql-1' 'POSTGRES_PASSWORD'
  FINERACT_DB_PASS         = Get-ContainerEnvironmentValue 'mifos-isolated-postgresql-1' 'FINERACT_DB_PASS'
  KEYCLOAK_ADMIN_USERNAME  = Get-ContainerEnvironmentValue 'mifos-channel-keycloak-1' 'KC_BOOTSTRAP_ADMIN_USERNAME'
  KEYCLOAK_ADMIN_PASSWORD  = Get-ContainerEnvironmentValue 'mifos-channel-keycloak-1' 'KC_BOOTSTRAP_ADMIN_PASSWORD'
  FINERACT_USERNAME        = Get-ContainerEnvironmentValue 'mifos-channel-channel-service-1' 'FINERACT_USERNAME'
  FINERACT_PASSWORD        = Get-ContainerEnvironmentValue 'mifos-channel-channel-service-1' 'FINERACT_PASSWORD'
  FINERACT_BASE_URL        = Get-ContainerEnvironmentValue 'mifos-channel-channel-service-1' 'FINERACT_BASE_URL'
  CLEARING_CALLBACK_SECRET = New-LocalSecret
}

$lines = @(
  '# Generated from existing running local containers. Never commit this file.'
  '# To rotate any credential, update the appropriate service and recreate it deliberately.'
)
foreach ($entry in $values.GetEnumerator()) {
  $lines += "$($entry.Key)=$($entry.Value)"
}

[System.IO.File]::WriteAllLines((Resolve-Path (Split-Path -Parent $OutputPath)).Path + [System.IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $OutputPath), $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Created local Compose environment file: $OutputPath"
