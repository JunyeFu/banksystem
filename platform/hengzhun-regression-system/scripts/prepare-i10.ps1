[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
. (Join-Path $PSScriptRoot 'progress.ps1')
. (Join-Path $PSScriptRoot 'recovery.ps1')
Initialize-HengzhunProgress -Operation 'PREPARE' -StageTotal 5
$operationVersion = 'i10-prepare-recovery-v3'
$lockPath = $null
$inputFingerprint = Get-HengzhunRecoveryInputFingerprint @{
    operationVersion = $operationVersion
    migrationNames = @(Get-ChildItem -LiteralPath (Join-Path $root 'harness\migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object { $_.Name + ':' + $_.Length })
    agentflowBuilder = (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'build-i10-agentflow-v7.cjs')).Length
}

try {
    $lockPath = Enter-HengzhunRecoveryLock -Operation 'PREPARE'
    if ($env:HENGZHUN_RESUME_MODE -eq 'restart') { Remove-HengzhunRecovery -Operation 'PREPARE' }
    $recovery = Read-HengzhunRecovery -Operation 'PREPARE'
    if ($recovery -and ($recovery.status -eq 'INVALIDATED' -or $recovery.operationVersion -ne $operationVersion -or $recovery.inputFingerprint -ne $inputFingerprint)) {
        Remove-HengzhunRecovery -Operation 'PREPARE'
        $recovery = $null
        Write-HengzhunStageResult '已有断点与当前输入不一致，已安全失效并从头执行'
    }
    $completed = New-Object 'System.Collections.Generic.List[string]'
    if ($recovery) {
        foreach ($item in @($recovery.completedItems)) { [void]$completed.Add([string]$item) }
        Write-HengzhunStageResult ("发现有效断点，将验证后续跑：{0}" -f ($completed -join ','))
    }

    Write-HengzhunStage -Index 1 -Name '创建.data运行目录'
    $requiredDirectories = @('.data\runtime','.data\sqlite','.data\artifacts','.data\logs\i9')
    $directoriesValid = ($requiredDirectories | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_) ) }).Count -eq 0
    if (-not ($completed.Contains('directories') -and $directoriesValid)) {
        & (Join-Path $PSScriptRoot 'prepare-i2.ps1') -Mode Directories | Out-Null
        if (-not $completed.Contains('directories')) { [void]$completed.Add('directories') }
        Write-HengzhunRecovery -Operation 'PREPARE' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 1 -StageName '创建.data运行目录' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    }
    Write-HengzhunStageResult '运行目录已准备'

    Write-HengzhunStage -Index 2 -Name '生成或保留内部服务令牌'
    $runtimeEnv = Join-Path $root '.data\runtime.env'
    $tokensValid = $false
    if (Test-Path -LiteralPath $runtimeEnv) {
        $safeLines = Get-Content -LiteralPath $runtimeEnv
        $tokensValid = @('HENGZHUN_SERVICE_TOKEN','HENGZHUN_WORKER_TOKEN','HENGZHUN_MCP_TOKEN').Where({
            $name = $_
            ($safeLines | Where-Object { $_ -match ('^' + [Regex]::Escape($name) + '=(.{24,})$') }).Count -gt 0
        }).Count -eq 3
    }
    if (-not ($completed.Contains('tokens') -and $tokensValid)) {
        & (Join-Path $PSScriptRoot 'prepare-i2.ps1') -Mode ServiceToken | Out-Null
        & (Join-Path $PSScriptRoot 'prepare-i9.ps1') -Mode Tokens | Out-Null
        if (-not $completed.Contains('tokens')) { [void]$completed.Add('tokens') }
        Write-HengzhunRecovery -Operation 'PREPARE' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 2 -StageName '生成或保留内部服务令牌' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    }
    Write-HengzhunStageResult '内部令牌已生成或安全保留，未输出令牌内容'

    Write-HengzhunStage -Index 3 -Name '准备SQLite目录并校验迁移输入'
    $migrations = @(Get-ChildItem -LiteralPath (Join-Path $root 'harness\migrations') -Filter '*.sql' -File | Sort-Object Name)
    if ($migrations.Count -eq 0) { throw 'PREPARE_SQLITE_MIGRATIONS_MISSING' }
    foreach ($migration in $migrations) {
        if ($migration.Length -le 0 -or $migration.Name -notmatch '^\d+_.+\.sql$') { throw "PREPARE_SQLITE_MIGRATION_INVALID:$($migration.Name)" }
    }
    if (-not $completed.Contains('sqlite-input')) { [void]$completed.Add('sqlite-input') }
    Write-HengzhunRecovery -Operation 'PREPARE' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 3 -StageName '准备SQLite目录并校验迁移输入' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    Write-HengzhunStageResult ("SQLite目录已准备，迁移输入{0}个；真正建库在Harness首次启动时执行" -f $migrations.Count)

    Write-HengzhunStage -Index 4 -Name '应用Flowise覆盖并构建I10 Agentflow' -Hint 'TypeScript编译和工作流构建可能需要数十秒'
    $agentflowOutput = Join-Path $root 'flowise\i10\agentflow-v7.json'
    if (-not ($completed.Contains('agentflow-build') -and (Test-Path -LiteralPath $agentflowOutput) -and (Get-Item -LiteralPath $agentflowOutput).Length -gt 0)) {
        & (Join-Path $PSScriptRoot 'prepare-i9.ps1') -Mode Runtime
        & $node (Join-Path $PSScriptRoot 'platform-admin.cjs') reconcile-existing | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "PREPARE_PLATFORM_ADMIN_FAILED:$LASTEXITCODE" }
        & $node (Join-Path $PSScriptRoot 'build-i10-agentflow-v7.cjs')
        if ($LASTEXITCODE -ne 0) { throw "PREPARE_AGENTFLOW_BUILD_FAILED:$LASTEXITCODE" }
        if (-not $completed.Contains('agentflow-build')) { [void]$completed.Add('agentflow-build') }
        Write-HengzhunRecovery -Operation 'PREPARE' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 4 -StageName '应用Flowise覆盖并构建I10 Agentflow' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    }
    Write-HengzhunStageResult 'Flowise覆盖和I10 Agentflow已构建'

    Write-HengzhunStage -Index 5 -Name '验证Agentflow路径和变量来源'
    & $node (Join-Path $PSScriptRoot 'verify-i10-agentflow-v7.cjs')
    if ($LASTEXITCODE -ne 0) { throw "PREPARE_AGENTFLOW_PATH_VERIFY_FAILED:$LASTEXITCODE" }
    Write-HengzhunStageResult '路径和变量来源校验通过'
    Complete-HengzhunRecovery -Operation 'PREPARE' -OperationVersion $operationVersion -Summary @{ migrations = $migrations.Count; agentflowValidated = $true }
    Complete-HengzhunProgress -Message '准备完成'
    Exit-HengzhunRecoveryLock -LockPath $lockPath
    exit 0
} catch {
    $errorCode = if ($_.Exception.Message -match '^([A-Z0-9_]+)') { $Matches[1] } else { 'PREPARE_FAILED' }
    if ($inputFingerprint -and $lockPath) {
        Write-HengzhunRecovery -Operation 'PREPARE' -OperationVersion $operationVersion -Status 'FAILED_RECOVERABLE' -StageIndex $script:HengzhunProgress.StageIndex -StageName $script:HengzhunProgress.StageName -InputFingerprint $inputFingerprint -CompletedItems $completed -LastErrorCode $errorCode -Recoverable $true | Out-Null
    }
    Fail-HengzhunProgress -ErrorValue $_
    Exit-HengzhunRecoveryLock -LockPath $lockPath
    Write-Error (Protect-HengzhunProgressText $_.Exception.Message)
    exit 1
}
