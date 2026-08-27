[CmdletBinding()]
param(
    [ValidateSet('All', 'Tokens', 'Runtime')]
    [string]$Mode = 'All'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($Mode -eq 'All') {
    & (Join-Path $PSScriptRoot 'prepare-i2.ps1') | Out-Null
}

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
if ($Mode -in @('All', 'Tokens')) {
    $lines = [System.Collections.Generic.List[string]]::new()
    Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object { $lines.Add($_) }
    Add-I9EnvValue $lines 'HENGZHUN_WORKER_TOKEN'
    Add-I9EnvValue $lines 'HENGZHUN_MCP_TOKEN'
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

if ($Mode -in @('All', 'Runtime')) {
    . (Join-Path $PSScriptRoot 'import-i9-runtime-env.ps1')
    $node20 = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
    $forkMarker = Join-Path $root 'flowise\app\node_modules\.hengzhun-runtime-fork-v1.json'
    if (-not (Test-Path -LiteralPath $forkMarker -PathType Leaf)) {
        & $node20 (Join-Path $PSScriptRoot 'apply-i9-flowise-overlays.cjs') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "PREPARE_I9_OVERLAY_FAILED:$LASTEXITCODE" }
    }
    & $node20 (Join-Path $PSScriptRoot 'i10-build-flowise-runtime-fork.cjs') apply | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "PREPARE_I9_FLOWISE_RUNTIME_FORK_FAILED:$LASTEXITCODE" }
    & (Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe') (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') prepare
    if ($LASTEXITCODE -ne 0) { throw "PREPARE_I9_LIFECYCLE_FAILED:$LASTEXITCODE" }
}
return
