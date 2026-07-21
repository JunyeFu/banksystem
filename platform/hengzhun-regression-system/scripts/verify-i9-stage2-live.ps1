[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$lifecycle = Join-Path $PSScriptRoot 'i9-lifecycle.cjs'
$stateFile = Join-Path $root '.data\runtime\i9-processes.json'

$env:HENGZHUN_SERVICE_TOKEN = 'svc-' + [guid]::NewGuid().ToString('N')
$env:HENGZHUN_WORKER_TOKEN = 'wrk-' + [guid]::NewGuid().ToString('N')
$env:HENGZHUN_MCP_TOKEN = 'mcp-' + [guid]::NewGuid().ToString('N')

Push-Location $root
try {
    & $node $lifecycle stop | Out-Null

    $holderOut = Join-Path $root '.data\runtime\port-holder.stdout.log'
    $holderErr = Join-Path $root '.data\runtime\port-holder.stderr.log'
    $env:HENGZHUN_TEST_PORT = '3006'
    $holder = Start-Process -FilePath $node -ArgumentList 'tests\i9\fixtures\port-holder.cjs' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $holderOut -RedirectStandardError $holderErr -PassThru
    Remove-Item Env:HENGZHUN_TEST_PORT -ErrorAction SilentlyContinue
    try {
        $holderReady = $false
        for ($attempt = 0; $attempt -lt 20 -and -not $holderReady; $attempt++) {
            Start-Sleep -Milliseconds 100
            $holderReady = (Test-Path $holderOut) -and ((Get-Content -LiteralPath $holderOut -Raw -ErrorAction SilentlyContinue) -match 'READY')
        }
        if (-not $holderReady) { throw 'I9_PORT_HOLDER_NOT_READY' }
        $ErrorActionPreference = 'Continue'
        $occupiedOutput = (& $node $lifecycle start 2>&1 | Out-String)
        $occupiedExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($occupiedExit -ne 1 -or -not $occupiedOutput.Contains('I9_PORT_OCCUPIED_UNKNOWN')) { throw 'I9_UNKNOWN_PORT_OCCUPANCY_GATE_FAILED' }
        if ($holder.HasExited) { throw 'I9_UNKNOWN_PORT_OWNER_WAS_TERMINATED' }
    } finally {
        if (-not $holder.HasExited) { Stop-Process -Id $holder.Id -Force }
        $holder.WaitForExit()
    }

    $env:NODE_ENV = 'test'
    $env:HENGZHUN_I9_TEST_FAIL_SERVICE = 'worker'
    $ErrorActionPreference = 'Continue'
    $partialOutput = (& $node $lifecycle start 2>&1 | Out-String)
    $partialExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Remove-Item Env:NODE_ENV,Env:HENGZHUN_I9_TEST_FAIL_SERVICE -ErrorAction SilentlyContinue
    if ($partialExit -ne 1 -or -not $partialOutput.Contains('I9_SERVICE_EXITED_DURING_STARTUP')) { throw 'I9_PARTIAL_START_FAILURE_NOT_DETECTED' }
    if (Test-Path $stateFile) { throw 'I9_PARTIAL_START_STATE_NOT_CLEANED' }
    & "$PSScriptRoot\assert-i9-ports-free.ps1" | Out-Null

    & $node $lifecycle start
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node $lifecycle status
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $stateText = Get-Content -LiteralPath $stateFile -Raw
    if ($stateText.Contains($env:HENGZHUN_SERVICE_TOKEN) -or $stateText.Contains($env:HENGZHUN_WORKER_TOKEN) -or $stateText.Contains($env:HENGZHUN_MCP_TOKEN)) {
        throw 'I9_PROCESS_STATE_LEAKED_CREDENTIAL'
    }

    & $node $lifecycle start
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node 'scripts\verify-i9-stage2-sqlite.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node $lifecycle stop
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $node $lifecycle start
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node 'scripts\verify-i9-stage2-sqlite.cjs'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $node $lifecycle stop
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $node $lifecycle status | Out-Null
    if ($LASTEXITCODE -ne 3) { throw 'I9_STOPPED_STATUS_EXPECTED' }
    Write-Output 'HENGZHUN_I9_STAGE2_FOUR_SERVICE_LIFECYCLE_VERIFIED'
} finally {
    & $node $lifecycle stop | Out-Null
    Pop-Location
}
