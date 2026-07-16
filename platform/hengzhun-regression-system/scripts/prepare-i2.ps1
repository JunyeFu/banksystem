[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root '.data'
$runtimeEnv = Join-Path $data 'runtime.env'

function New-RandomValue([int]$Bytes = 48) {
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Set-EnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value, [bool]$PreserveExisting = $true) {
    $pattern = '^\s*' + [Regex]::Escape($Name) + '='
    for ($index = 0; $index -lt $Lines.Count; $index++) {
        if ($Lines[$index] -match $pattern) {
            if (-not $PreserveExisting) { $Lines[$index] = $Name + '=' + $Value }
            return
        }
    }
    $Lines.Add($Name + '=' + $Value)
}

New-Item -ItemType Directory -Path $data -Force | Out-Null
foreach ($relative in @('sqlite', 'sqlite\backups', 'artifacts', 'evidence', 'logs')) {
    New-Item -ItemType Directory -Path (Join-Path $data $relative) -Force | Out-Null
}

$lines = [System.Collections.Generic.List[string]]::new()
if (Test-Path -LiteralPath $runtimeEnv -PathType Leaf) {
    Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object { $lines.Add($_) }
}
Set-EnvValue $lines 'HENGZHUN_SERVICE_TOKEN' (New-RandomValue 48) $true
Set-EnvValue $lines 'HENGZHUN_ALLOWED_CLIENTS' '127.0.0.1,::1,172.16.0.0/12' $false
[System.IO.File]::WriteAllLines($runtimeEnv, $lines, [System.Text.UTF8Encoding]::new($false))

[ordered]@{
    status = 'READY'
    database = '.data/sqlite/regression_platform.sqlite'
    artifacts = '.data/artifacts'
    secrets = 'generated-or-preserved-without-output'
} | ConvertTo-Json -Compress
