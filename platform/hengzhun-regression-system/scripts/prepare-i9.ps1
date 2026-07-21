[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'prepare-i2.ps1') | Out-Null

$runtimeEnv = Join-Path $root '.data\runtime.env'
function New-I9RandomValue([int]$Bytes = 48) {
    $buffer = New-Object byte[] $Bytes
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function Add-I9EnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name) {
    if (-not ($Lines | Where-Object { $_ -match ('^\s*' + [Regex]::Escape($Name) + '=') })) {
        $Lines.Add($Name + '=' + (New-I9RandomValue))
    }
}
$lines = [System.Collections.Generic.List[string]]::new()
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object { $lines.Add($_) }
Add-I9EnvValue $lines 'HENGZHUN_WORKER_TOKEN'
Add-I9EnvValue $lines 'HENGZHUN_MCP_TOKEN'
[System.IO.File]::WriteAllLines($runtimeEnv, $lines, [System.Text.UTF8Encoding]::new($false))

. (Join-Path $PSScriptRoot 'import-i9-runtime-env.ps1')
& (Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe') (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') prepare
exit $LASTEXITCODE
