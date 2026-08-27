[CmdletBinding()]
param(
    [ValidateSet('all', 'core', 'flowise')]
    [string]$RuntimeName = 'all',
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $root 'runtime'))
$manifestPath = Join-Path $root 'flowise\i10\node-runtime-manifest-v1.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.schemaVersion -ne 'hengzhun-i10-node-runtime-manifest-v1' -or $manifest.platform -ne 'win32-x64') {
    throw 'I10_NODE_RUNTIME_MANIFEST_INVALID'
}

function Resolve-I10RuntimePath {
    param([Parameter(Mandatory=$true)][string]$RelativePath)
    $resolved = [IO.Path]::GetFullPath((Join-Path $root $RelativePath))
    if (-not $resolved.StartsWith(($runtimeRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
        throw "I10_NODE_RUNTIME_PATH_OUTSIDE_RUNTIME:$RelativePath"
    }
    return $resolved
}

function Test-I10Runtime {
    param([Parameter(Mandatory=$true)]$Spec)
    $target = Resolve-I10RuntimePath $Spec.targetDirectory
    $node = Resolve-I10RuntimePath $Spec.executable
    if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { return $false }
    $actual = ([string](& $node --version 2>$null | Select-Object -First 1)).Trim()
    $nodeSucceeded = $?
    $required = ([string]$Spec.version).Trim()
    if (-not $nodeSucceeded -or $actual -ne $required) {
        throw "I10_NODE_RUNTIME_VERSION_MISMATCH:$target`:actual=$actual`:required=$required"
    }
    return $true
}

function Install-I10Runtime {
    param([Parameter(Mandatory=$true)][string]$Name, [Parameter(Mandatory=$true)]$Spec)
    $target = Resolve-I10RuntimePath $Spec.targetDirectory
    if (Test-Path -LiteralPath $target) {
        throw "I10_NODE_RUNTIME_EXISTING_TARGET_INVALID:$target"
    }
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $staging = Join-Path $runtimeRoot ('.node-runtime-staging-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        $archive = Join-Path $staging $Spec.archive
        Invoke-WebRequest -UseBasicParsing -Uri $Spec.url -OutFile $archive
        $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $Spec.sha256) {
            throw "I10_NODE_RUNTIME_ARCHIVE_HASH_MISMATCH:$Name`:actual=$actualHash`:required=$($Spec.sha256)"
        }
        $expanded = Join-Path $staging 'expanded'
        Expand-Archive -LiteralPath $archive -DestinationPath $expanded
        $source = Join-Path $expanded ([IO.Path]::GetFileName($Spec.targetDirectory))
        $sourceNode = Join-Path $source 'node.exe'
        if (-not (Test-Path -LiteralPath $sourceNode -PathType Leaf)) {
            throw "I10_NODE_RUNTIME_ARCHIVE_ROOT_INVALID:$Name"
        }
        $actualVersion = ([string](& $sourceNode --version 2>$null | Select-Object -First 1)).Trim()
        $nodeSucceeded = $?
        $requiredVersion = ([string]$Spec.version).Trim()
        if (-not $nodeSucceeded -or $actualVersion -ne $requiredVersion) {
            throw "I10_NODE_RUNTIME_ARCHIVE_VERSION_MISMATCH:$Name`:actual=$actualVersion`:required=$requiredVersion"
        }
        Move-Item -LiteralPath $source -Destination $target
    }
    finally {
        $resolvedStaging = [IO.Path]::GetFullPath($staging)
        if ($resolvedStaging.StartsWith(($runtimeRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStaging)) {
            Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
        }
    }
    if (-not (Test-I10Runtime $Spec)) { throw "I10_NODE_RUNTIME_PROMOTION_FAILED:$Name" }
}

$names = if ($RuntimeName -eq 'all') { @('core', 'flowise') } else { @($RuntimeName) }
$verified = @()
foreach ($name in $names) {
    $spec = $manifest.runtimes.$name
    if (-not $spec -or $spec.sha256 -notmatch '^[0-9a-f]{64}$' -or $spec.url -notmatch '^https://nodejs\.org/dist/') {
        throw "I10_NODE_RUNTIME_SPEC_INVALID:$name"
    }
    $ready = Test-I10Runtime $spec
    if (-not $ready) {
        if ($VerifyOnly) { throw "I10_NODE_RUNTIME_MISSING:$name`:$($spec.executable)" }
        Install-I10Runtime -Name $name -Spec $spec
    }
    $verified += [ordered]@{ name = $name; version = $spec.version; executable = $spec.executable; sha256 = $spec.sha256 }
}

[ordered]@{
    schemaVersion = 'hengzhun-i10-node-runtime-verification-v1'
    status = 'VERIFIED'
    runtimes = $verified
} | ConvertTo-Json -Depth 5
