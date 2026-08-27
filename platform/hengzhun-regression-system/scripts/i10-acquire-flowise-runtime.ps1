[CmdletBinding()]
param(
    [switch]$VerifyOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$productRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$flowiseAppRoot = Join-Path $productRoot 'flowise\app'
$ownedContainer = Join-Path $flowiseAppRoot '.hengzhun-acquisition'
$node20 = Join-Path $productRoot 'runtime\node-v20.20.2-win-x64\node.exe'
$node24 = Join-Path $productRoot 'runtime\node-v24.19.0-win-x64\node.exe'
$npmCli = Join-Path $productRoot 'runtime\node-v24.19.0-win-x64\node_modules\npm\bin\npm-cli.js'
$acquisitionPolicyPath = Join-Path $productRoot 'flowise\i10\flowise-acquisition-policy-v1.json'
$sourcePackagePath = Join-Path $flowiseAppRoot 'package.json'
$sourceLockPath = Join-Path $flowiseAppRoot 'package-lock.json'
$sourceStubsPath = Join-Path $productRoot 'flowise\stubs'

function Assert-OwnedChild([string]$Parent, [string]$Child) {
    $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $childFull = [IO.Path]::GetFullPath($Child)
    if (-not $childFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "I10_FLOWISE_ACQUISITION_PATH_ESCAPE:$childFull"
    }
    return $childFull
}

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$Code) {
    & $Executable @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$Code`:exit=$LASTEXITCODE" }
}

foreach ($required in @($flowiseAppRoot, $node20, $node24, $npmCli, $acquisitionPolicyPath, $sourcePackagePath, $sourceLockPath, $sourceStubsPath)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "I10_FLOWISE_ACQUISITION_PREREQUISITE_MISSING:$required" }
}

$acquisitionPolicy = Get-Content -LiteralPath $acquisitionPolicyPath -Raw | ConvertFrom-Json
$sourcePackage = Get-Content -LiteralPath $sourcePackagePath -Raw | ConvertFrom-Json
if ($acquisitionPolicy.install.ignoreScripts -ne $true) { throw 'I10_FLOWISE_ACQUISITION_IGNORE_SCRIPTS_REQUIRED' }
$policyNative = @($acquisitionPolicy.install.nativeScriptAllowlist | ForEach-Object { "$($_.name)@$($_.version)" } | Sort-Object)
$packageNative = @($sourcePackage.allowScripts.PSObject.Properties | Where-Object Value -eq $true | ForEach-Object Name | Sort-Object)
if (($policyNative -join "`n") -ne ($packageNative -join "`n")) { throw 'I10_FLOWISE_ACQUISITION_NATIVE_ALLOWLIST_DRIFT' }
if ($null -ne $acquisitionPolicy.riskAcceptance) { throw 'I10_FLOWISE_ACQUISITION_RISK_MUST_REMAIN_UNSIGNED' }

function Invoke-CurrentGates {
    Invoke-Checked $node20 @((Join-Path $PSScriptRoot 'i10-build-flowise-runtime-fork.cjs'), 'check') 'I10_FLOWISE_ACQUISITION_CURRENT_FORK_BLOCKED'
    Invoke-Checked $node24 @((Join-Path $PSScriptRoot 'i10-flowise-runtime-probe.cjs')) 'I10_FLOWISE_ACQUISITION_CURRENT_PROBE_BLOCKED'
    Invoke-Checked $node24 @((Join-Path $PSScriptRoot 'i10-flowise-advisory-disposition.cjs')) 'I10_FLOWISE_ACQUISITION_CURRENT_DISPOSITION_BLOCKED'
}

if ($VerifyOnly) {
    Invoke-CurrentGates
    [ordered]@{
        schemaVersion = 'hengzhun-i10-flowise-isolated-acquisition-v1'
        status = 'READY'
        verifyOnly = $true
        ignoreScripts = $true
        nativeScriptAllowlist = $policyNative
        riskAcceptance = $null
        ownedStagingParent = $ownedContainer
        promotionMode = 'SAME_VOLUME_RENAME_WITH_ROLLBACK'
    } | ConvertTo-Json -Depth 4
    exit 0
}

$runId = [guid]::NewGuid().ToString('N')
$stagingRoot = Assert-OwnedChild $ownedContainer (Join-Path $ownedContainer $runId)
$stagingApp = Join-Path $stagingRoot 'app'
$stagingStubs = Join-Path $stagingRoot 'stubs'
$stagedNodeModules = Join-Path $stagingApp 'node_modules'
$targetNodeModules = Join-Path $flowiseAppRoot 'node_modules'
$backupNodeModules = Assert-OwnedChild $flowiseAppRoot (Join-Path $flowiseAppRoot ".hengzhun-node-modules-backup-$runId")
$promoted = $false
$backedUp = $false

try {
    New-Item -ItemType Directory -Path $stagingApp -Force | Out-Null
    Copy-Item -LiteralPath $sourcePackagePath -Destination (Join-Path $stagingApp 'package.json')
    Copy-Item -LiteralPath $sourceLockPath -Destination (Join-Path $stagingApp 'package-lock.json')
    Copy-Item -LiteralPath $sourceStubsPath -Destination $stagingStubs -Recurse
    Invoke-Checked $node24 @($npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', $stagingApp) 'I10_FLOWISE_ACQUISITION_NPM_CI_FAILED'

    foreach ($native in $acquisitionPolicy.install.nativeScriptAllowlist) {
        $manifest = Join-Path $stagedNodeModules ($native.name.Replace('/', '\') + '\package.json')
        if (-not (Test-Path -LiteralPath $manifest)) { throw "I10_FLOWISE_ACQUISITION_NATIVE_MISSING:$($native.name)" }
        $installed = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
        if ($installed.name -ne $native.name -or $installed.version -ne $native.version) {
            throw "I10_FLOWISE_ACQUISITION_NATIVE_IDENTITY_DRIFT:$($native.name)@$($installed.version)"
        }
    }
    $nativeNames = @($acquisitionPolicy.install.nativeScriptAllowlist | ForEach-Object name)
    Invoke-Checked $node24 (@($npmCli, 'rebuild') + $nativeNames + @('--foreground-scripts', '--no-audit', '--no-fund', '--prefix', $stagingApp)) 'I10_FLOWISE_ACQUISITION_NATIVE_REBUILD_FAILED'

    $hadFlowiseAppPath = Test-Path Env:FLOWISE_APP_PATH
    $previousFlowiseAppPath = $env:FLOWISE_APP_PATH
    try {
        $env:FLOWISE_APP_PATH = $stagingApp
        Invoke-Checked $node20 @((Join-Path $PSScriptRoot 'apply-i9-flowise-overlays.cjs')) 'I10_FLOWISE_ACQUISITION_OVERLAY_FAILED'
    } finally {
        if ($hadFlowiseAppPath) { $env:FLOWISE_APP_PATH = $previousFlowiseAppPath } else { Remove-Item Env:FLOWISE_APP_PATH -ErrorAction SilentlyContinue }
    }
    Invoke-Checked $node20 @((Join-Path $PSScriptRoot 'i10-build-flowise-runtime-fork.cjs'), 'apply', '--app-root', $stagingApp, '--acquisition-policy', $acquisitionPolicyPath) 'I10_FLOWISE_ACQUISITION_FORK_FAILED'
    Invoke-Checked $node24 @((Join-Path $PSScriptRoot 'i10-flowise-runtime-probe.cjs'), '--app-root', $stagingApp, '--acquisition-policy', $acquisitionPolicyPath) 'I10_FLOWISE_ACQUISITION_PROBE_FAILED'
    Invoke-Checked $node24 @((Join-Path $PSScriptRoot 'i10-flowise-advisory-disposition.cjs'), '--app-root', $stagingApp) 'I10_FLOWISE_ACQUISITION_DISPOSITION_FAILED'

    Move-Item -LiteralPath $targetNodeModules -Destination $backupNodeModules
    $backedUp = $true
    Move-Item -LiteralPath $stagedNodeModules -Destination $targetNodeModules
    $promoted = $true
    Invoke-CurrentGates

    if (Test-Path -LiteralPath $backupNodeModules) {
        Assert-OwnedChild $flowiseAppRoot $backupNodeModules | Out-Null
        Remove-Item -LiteralPath $backupNodeModules -Recurse -Force
    }
    $backedUp = $false
    [ordered]@{
        schemaVersion = 'hengzhun-i10-flowise-isolated-acquisition-v1'
        status = 'READY'
        verifyOnly = $false
        ignoreScripts = $true
        nativeScriptAllowlist = $policyNative
        riskAcceptance = $null
        promotionMode = 'SAME_VOLUME_RENAME_WITH_ROLLBACK'
    } | ConvertTo-Json -Depth 4
} catch {
    if ($promoted -and (Test-Path -LiteralPath $targetNodeModules)) {
        Assert-OwnedChild $flowiseAppRoot $targetNodeModules | Out-Null
        Remove-Item -LiteralPath $targetNodeModules -Recurse -Force
        $promoted = $false
    }
    if ($backedUp -and (Test-Path -LiteralPath $backupNodeModules)) {
        Move-Item -LiteralPath $backupNodeModules -Destination $targetNodeModules
        $backedUp = $false
    }
    throw
} finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Assert-OwnedChild $ownedContainer $stagingRoot | Out-Null
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
    if ((Test-Path -LiteralPath $ownedContainer) -and -not (Get-ChildItem -LiteralPath $ownedContainer -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $ownedContainer -Force
    }
}
