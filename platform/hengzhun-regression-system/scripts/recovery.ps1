function Get-HengzhunRecoveryNode {
    $root = Split-Path -Parent $PSScriptRoot
    return Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
}

function Get-HengzhunRecoveryInputFingerprint {
    param([Parameter(Mandatory=$true)]$Value)
    $json = $Value | ConvertTo-Json -Depth 20 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Get-HengzhunRecoveryPath {
    param([Parameter(Mandatory=$true)][string]$Operation)
    $root = Split-Path -Parent $PSScriptRoot
    return Join-Path $root ('.data\recovery\' + $Operation.ToLowerInvariant() + '.json')
}

function Enter-HengzhunRecoveryLock {
    param([Parameter(Mandatory=$true)][string]$Operation)
    $target = (Get-HengzhunRecoveryPath -Operation $Operation) -replace '\.json$', '.lock'
    $directory = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    if (Test-Path -LiteralPath $target) {
        $existing = $null
        try { $existing = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json } catch {}
        if ($existing -and (Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue)) {
            throw "RECOVERY_OPERATION_ALREADY_RUNNING:$Operation"
        }
        Remove-Item -LiteralPath $target -Force
    }
    try {
        $stream = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
        $writer.WriteLine((@{ operation = $Operation.ToUpperInvariant(); pid = $PID; acquiredAt = [DateTimeOffset]::Now.ToString('o') } | ConvertTo-Json -Compress))
        $writer.Dispose()
    } catch {
        throw "RECOVERY_OPERATION_LOCK_FAILED:$Operation"
    }
    return $target
}

function Exit-HengzhunRecoveryLock {
    param([string]$LockPath)
    if ($LockPath) { Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue }
}

function Read-HengzhunRecovery {
    param([Parameter(Mandatory=$true)][string]$Operation)
    $target = Get-HengzhunRecoveryPath -Operation $Operation
    if (-not (Test-Path -LiteralPath $target)) { return $null }
    try { return Get-Content -LiteralPath $target -Raw | ConvertFrom-Json }
    catch { throw "RECOVERY_STATE_INVALID:$Operation" }
}

function Write-HengzhunRecovery {
    param(
        [Parameter(Mandatory=$true)][string]$Operation,
        [Parameter(Mandatory=$true)][string]$OperationVersion,
        [Parameter(Mandatory=$true)][string]$Status,
        [Parameter(Mandatory=$true)][int]$StageIndex,
        [Parameter(Mandatory=$true)][string]$StageName,
        [Parameter(Mandatory=$true)][string]$InputFingerprint,
        [object[]]$CompletedItems = @(),
        [string]$LastErrorCode = '',
        [bool]$Recoverable = $true
    )
    $target = Get-HengzhunRecoveryPath -Operation $Operation
    $directory = Split-Path -Parent $target
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $previous = Read-HengzhunRecovery -Operation $Operation
    $startedAt = if ($previous -and $previous.inputFingerprint -eq $InputFingerprint) { $previous.startedAt } else { [DateTimeOffset]::Now.ToString('o') }
    $value = [ordered]@{
        schemaVersion = 'hengzhun-operation-recovery-v1'
        operation = $Operation.ToUpperInvariant()
        operationVersion = $OperationVersion
        status = $Status
        stageIndex = $StageIndex
        stageName = $StageName
        inputFingerprint = $InputFingerprint
        completedItems = @($CompletedItems)
        startedAt = $startedAt
        updatedAt = [DateTimeOffset]::Now.ToString('o')
        lastErrorCode = if ($LastErrorCode) { $LastErrorCode } else { $null }
        recoverable = $Recoverable
    }
    $temporary = $target + '.' + $PID + '.tmp'
    $value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $target -Force
    return [pscustomobject]$value
}

function Remove-HengzhunRecovery {
    param([Parameter(Mandatory=$true)][string]$Operation)
    Remove-Item -LiteralPath (Get-HengzhunRecoveryPath -Operation $Operation) -Force -ErrorAction SilentlyContinue
}

function Complete-HengzhunRecovery {
    param(
        [Parameter(Mandatory=$true)][string]$Operation,
        [Parameter(Mandatory=$true)][string]$OperationVersion,
        [hashtable]$Summary = @{}
    )
    $root = Split-Path -Parent $PSScriptRoot
    $directory = Join-Path $root '.data\recovery'
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $target = Join-Path $directory ($Operation.ToLowerInvariant() + '-last-success.json')
    $value = [ordered]@{
        schemaVersion = 'hengzhun-operation-recovery-v1'
        operation = $Operation.ToUpperInvariant()
        operationVersion = $OperationVersion
        status = 'COMPLETED'
        completedAt = [DateTimeOffset]::Now.ToString('o')
        summary = $Summary
    }
    $temporary = $target + '.' + $PID + '.tmp'
    $value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $target -Force
    Remove-HengzhunRecovery -Operation $Operation
}
