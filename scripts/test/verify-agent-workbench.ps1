param([Parameter(Mandatory=$true)][ValidateSet('Contract','Integration','Browser','LiveReadOnly')][string]$Scope,
    [ValidateSet('Foundation','History','Conversation','Models','All')][string]$Case = 'All')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$productRoot = Join-Path $repoRoot 'platform/hengzhun-regression-system'
$node = Join-Path $productRoot 'runtime/node-v24.19.0-win-x64/node.exe'
# Browser scopes are isolated; they never become a LIVE receipt.
if ($Scope -eq 'Browser') {
    $browserNode = Join-Path $productRoot 'runtime/node-v20.20.2-win-x64/node.exe'
    $cases = if ($Case -eq 'All') { @('Foundation','History','Conversation','Models') } else { @($Case) }
    $qaRoot = $env:HENGZHUN_WORKBENCH_QA_DIR
    try {
        foreach ($selectedCase in $cases) {
            if ($qaRoot -and $Case -eq 'All') { $env:HENGZHUN_WORKBENCH_QA_DIR = Join-Path $qaRoot $selectedCase.ToLowerInvariant() }
            $testFile = switch ($selectedCase) { 'Foundation' { 'foundation.browser.cjs' } 'History' { 'history.browser.cjs' } 'Conversation' { 'conversation.browser.cjs' } 'Models' { 'models.browser.cjs' } }
            & $browserNode --test (Join-Path $repoRoot "apps/quality-case-portal/tests/$testFile")
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
    } finally { $env:HENGZHUN_WORKBENCH_QA_DIR = $qaRoot }
    Write-Output ("AGENT_WORKBENCH=PASS scope=Browser case={0} execution=ISOLATED_BROWSER" -f $Case)
    exit 0
}
if ($Scope -eq 'LiveReadOnly') {
    & $node (Join-Path $repoRoot 'scripts/test/rf068-workbench-live.mjs')
    exit $LASTEXITCODE
}
if ($Scope -eq 'Contract') {
    & $node (Join-Path $productRoot 'agent-cli/bin/generate-workbench-contract.mjs') --check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --test (Join-Path $productRoot 'agent-cli/test/workbench-http.test.mjs') (Join-Path $productRoot 'agent-cli/test/workbench-characterization.test.mjs') (Join-Path $productRoot 'agent-cli/test/workbench-server.test.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node --test (Join-Path $productRoot 'agent-cli/test/workbench-readiness.test.mjs') (Join-Path $repoRoot 'scripts/test/rf068-workbench-acceptance.test.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    # Harness native SQLite uses the pinned Node 20 ABI, not the CLI's Node 24.
    $harnessNode = Join-Path $productRoot 'runtime/node-v20.20.2-win-x64/node.exe'
    & $harnessNode (Join-Path $productRoot 'node_modules/typescript/bin/tsc') --project (Join-Path $productRoot 'tsconfig.json')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $harnessNode (Join-Path $productRoot 'scripts/verification/generate-workbench-metadata.cjs') --check
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $harnessNode --test (Join-Path $productRoot 'scripts/verification/workbench-persistence.test.cjs') (Join-Path $productRoot 'scripts/verification/workbench-mcp.test.cjs') (Join-Path $productRoot 'scripts/verification/workbench-production.test.cjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $harnessNode --test (Join-Path $repoRoot 'scripts/test/rf068-workbench-runtime.test.cjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Output ("AGENT_WORKBENCH=PASS scope={0} execution=ISOLATED_TESTS" -f $Scope)
