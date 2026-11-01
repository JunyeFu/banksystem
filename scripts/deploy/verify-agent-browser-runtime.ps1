[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$agentRoot = Join-Path $projectRoot 'platform\hengzhun-regression-system'
$freeze = Get-Content -Raw -LiteralPath (Join-Path $agentRoot 'config\demo-runtime-freeze.json') | ConvertFrom-Json
$manifestPath = Join-Path $agentRoot 'runtime\package.json'
$lockPath = Join-Path $agentRoot 'runtime\package-lock.json'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'AGENT_BROWSER_RUNTIME_MANIFEST_MISSING' }
if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) { throw 'AGENT_BROWSER_RUNTIME_LOCK_MISSING' }

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
foreach ($name in @('playwright', '@midscene/web')) {
  if ($manifest.dependencies.$name -ne $freeze.packages.$name) { throw "AGENT_BROWSER_RUNTIME_VERSION_MISMATCH:$name" }
}

$lock = Get-Content -Raw -LiteralPath $lockPath | ConvertFrom-Json -AsHashtable
foreach ($name in @('playwright', '@midscene/web')) {
  $resolved = $lock.packages["node_modules/$name"].version
  if ($resolved -ne $freeze.packages.$name) { throw "AGENT_BROWSER_RUNTIME_LOCK_VERSION_MISMATCH:$name" }
}

$source = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'demo.ps1')
if ($source -notmatch 'Ensure-AgentBrowserRuntime') { throw 'AGENT_BROWSER_RUNTIME_PREPARE_MISSING' }
if ($source -match 'flowise') { throw 'AGENT_BROWSER_RUNTIME_FLOWISE_REFERENCE_FORBIDDEN' }

Write-Output "AGENT_BROWSER_RUNTIME_CONTRACT=PASS playwright=$($freeze.packages.playwright) midscene=$($freeze.packages.'@midscene/web') chromium=$($freeze.chromium.revision)"
