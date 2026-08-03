[CmdletBinding()]
param(
    [ValidateSet('All', 'Directories', 'ServiceToken')]
    [string]$Mode = 'All'
)

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
    $firstIndex = -1
    for ($index = 0; $index -lt $Lines.Count;) {
        if ($Lines[$index] -match $pattern) {
            if ($firstIndex -lt 0) {
                $firstIndex = $index
                $index++
            } else {
                $Lines.RemoveAt($index)
            }
        } else {
            $index++
        }
    }
    if ($firstIndex -ge 0) {
        if (-not $PreserveExisting) { $Lines[$firstIndex] = $Name + '=' + $Value }
        return
    }
    $Lines.Add($Name + '=' + $Value)
}

if ($Mode -in @('All', 'Directories')) {
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    foreach ($relative in @('sqlite', 'sqlite\backups', 'artifacts', 'evidence', 'logs')) {
        New-Item -ItemType Directory -Path (Join-Path $data $relative) -Force | Out-Null
    }
}

if ($Mode -in @('All', 'ServiceToken')) {
    New-Item -ItemType Directory -Path $data -Force | Out-Null
    $lines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path -LiteralPath $runtimeEnv -PathType Leaf) {
        Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object { $lines.Add($_) }
    }
    Set-EnvValue $lines 'HENGZHUN_SERVICE_TOKEN' (New-RandomValue 48) $true
    Set-EnvValue $lines 'HENGZHUN_ALLOWED_CLIENTS' '127.0.0.1,::1,172.16.0.0/12' $false
    $temporary = $runtimeEnv + '.' + $PID + '.tmp'
    [System.IO.File]::WriteAllLines($temporary, $lines, [System.Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $runtimeEnv) {
        $backup = $runtimeEnv + '.' + $PID + '.bak'
        [System.IO.File]::Replace($temporary, $runtimeEnv, $backup)
        Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    } else {
        [System.IO.File]::Move($temporary, $runtimeEnv)
    }
}

[ordered]@{
    status = 'READY'
    mode = $Mode
    database = '.data/sqlite/regression_platform.sqlite'
    artifacts = '.data/artifacts'
    secrets = 'generated-or-preserved-without-output'
} | ConvertTo-Json -Compress
