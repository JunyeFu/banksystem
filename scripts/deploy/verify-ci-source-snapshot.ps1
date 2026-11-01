[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$PreparedRoot)

$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$prepared = (Resolve-Path -LiteralPath $PreparedRoot).Path
$base = 'D:\Agent\.codex-temp\banksystem-rf065\'
if (-not $prepared.StartsWith($base, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path $prepared -Leaf) -notmatch '^[a-f0-9]{32}$') { throw 'RF065_PREPARED_ROOT_INVALID' }
$snapshot = Join-Path $prepared 'source-snapshot'
if (Test-Path -LiteralPath $snapshot) { throw 'RF065_SOURCE_SNAPSHOT_ALREADY_EXISTS' }
$productRelative = 'platform/hengzhun-regression-system'
$product = Join-Path $snapshot $productRelative
function Assert-OwnedPath([string]$Path) {
    if (-not [IO.Path]::GetFullPath($Path).StartsWith($prepared + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'RF065_PATH_OUTSIDE_PREPARED_ROOT' }
}
Assert-OwnedPath $snapshot
& git clone --no-checkout --no-hardlinks $repository $snapshot
if ($LASTEXITCODE -ne 0) { throw 'RF065_SOURCE_CLONE_FAILED' }
Push-Location -LiteralPath $repository
try {
    $files = @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) { throw 'RF065_SOURCE_LIST_FAILED' }
} finally { Pop-Location }
$count = 0
foreach ($relative in @($files | Sort-Object -Unique)) {
    if ($relative -match '(?i)\.env$') { continue }
    if ($relative -match '(^|/)(\.data|node_modules|dist|target|build|\.local|logs|backups|midscene_run)(/|$)' -or $relative -match '^agent/runs/' -or ($relative -match '(^|/)(\.env(?:\..*)?|runtime\.env)$' -and $relative -ne '.env.example') -or $relative -match '\.(pem|key)$') { continue }
    if ($relative.StartsWith("$productRelative/runtime/")) {
        if ($relative -notin @("$productRelative/runtime/package.json", "$productRelative/runtime/package-lock.json")) { continue }
    }
    if ($relative.StartsWith("$productRelative/config/")) {
        if ($relative -notmatch '/(demo-runtime-freeze\.json|[^/]+\.(example|schema)\.json)$') { continue }
    }
    $source = Join-Path $repository $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
    $destination = Join-Path $snapshot $relative
    Assert-OwnedPath $destination
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
    $count++
}
Write-Output "RF065_SOURCE_FILES=$count SNAPSHOT=$snapshot"
foreach ($relative in @('node_modules', 'agent-cli/node_modules', 'controller/node_modules', 'runtime/node_modules', 'runtime/node-v20.20.2-win-x64', 'runtime/node-v24.19.0-win-x64', 'runtime/browsers', 'runtime/media')) {
    $source = Join-Path $prepared $relative
    $destination = Join-Path $product $relative
    Assert-OwnedPath $source
    Assert-OwnedPath $destination
    if (Test-Path -LiteralPath $destination) { throw "RF065_DEPENDENCY_DESTINATION_EXISTS:$relative" }
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "RF065_PREPARED_DEPENDENCY_MISSING:$relative" }
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Move-Item -LiteralPath $source -Destination $destination
}
foreach ($name in @('HENGZHUN_MODEL_NAME', 'HENGZHUN_MODEL_BASE_URL', 'HENGZHUN_MODEL_API_KEY')) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
$node20 = Join-Path $product 'runtime/node-v20.20.2-win-x64/node.exe'
$npm20 = Join-Path $product 'runtime/node-v20.20.2-win-x64/node_modules/npm/bin/npm-cli.js'
$originalPath = $env:PATH
$env:PATH = (Split-Path $node20 -Parent) + ';' + $originalPath
Push-Location -LiteralPath $product
try {
    & $node20 --version
    foreach ($command in @('build', 'typecheck', 'lint', 'check:tests', 'test:registered', 'test:coverage')) {
        Write-Output "RF065_SOURCE_CHECK=$command"
        & $node20 $npm20 run $command
        if ($LASTEXITCODE -ne 0) { throw "RF065_SOURCE_CHECK_FAILED:$command exit=$LASTEXITCODE" }
    }
    Write-Output 'RF065_SOURCE_SNAPSHOT=PASS'
} finally { Pop-Location; $env:PATH = $originalPath }
