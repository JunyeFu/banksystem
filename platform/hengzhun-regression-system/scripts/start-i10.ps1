[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
. (Join-Path $PSScriptRoot 'progress.ps1')
. (Join-Path $PSScriptRoot 'recovery.ps1')
Initialize-HengzhunProgress -Operation 'START' -StageTotal 8
$operationVersion = 'i10-start-recovery-v4'
$lockPath = $null
$inputFingerprint = $null
$completed = New-Object 'System.Collections.Generic.List[string]'

try {
    $lockPath = Enter-HengzhunRecoveryLock -Operation 'START'
    if ($env:HENGZHUN_RESUME_MODE -eq 'restart') { Remove-HengzhunRecovery -Operation 'START' }
    Write-HengzhunStage -Index 1 -Name '读取运行配置并协调本地管理员'
    . (Join-Path $PSScriptRoot 'import-i10-runtime-env.ps1')
    foreach ($required in @('CONTROL_API_KEY','CONTROL_BASE_URL','CONTROL_MODEL_NAME','VISION_API_KEY','VISION_BASE_URL','VISION_MODEL_NAME')) {
        if (-not [Environment]::GetEnvironmentVariable($required, 'Process')) { throw "START_REQUIRED_VARIABLE_MISSING:$required" }
    }
    $hmacKey = [Text.Encoding]::UTF8.GetBytes($env:HENGZHUN_SERVICE_TOKEN)
    $hmac = New-Object Security.Cryptography.HMACSHA256(,$hmacKey)
    try {
        $secretProof = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:CONTROL_API_KEY + "`n" + $env:VISION_API_KEY)))).Replace('-', '').ToLowerInvariant()
    } finally { $hmac.Dispose() }
    $inputFingerprint = Get-HengzhunRecoveryInputFingerprint @{
        operationVersion = $operationVersion
        controlBase = $env:CONTROL_BASE_URL
        controlModel = $env:CONTROL_MODEL_NAME
        visionBase = $env:VISION_BASE_URL
        visionModel = $env:VISION_MODEL_NAME
        secretProof = $secretProof
    }
    $recovery = Read-HengzhunRecovery -Operation 'START'
    if ($recovery -and ($recovery.status -eq 'INVALIDATED' -or $recovery.operationVersion -ne $operationVersion -or $recovery.inputFingerprint -ne $inputFingerprint)) {
        Remove-HengzhunRecovery -Operation 'START'
        $recovery = $null
        Write-HengzhunStageResult '模型或公开配置已变化，旧断点已安全失效'
    }
    if ($recovery) {
        foreach ($item in @($recovery.completedItems)) { [void]$completed.Add([string]$item) }
        Write-HengzhunStageResult ("发现有效断点，将按实时健康状态恢复：{0}" -f ($completed -join ','))
    }
    & $node (Join-Path $PSScriptRoot 'platform-admin.cjs') reconcile-existing | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "START_PLATFORM_ADMIN_RECONCILE_FAILED:$LASTEXITCODE" }
    if (-not $completed.Contains('configuration')) { [void]$completed.Add('configuration') }
    Write-HengzhunRecovery -Operation 'START' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 1 -StageName '读取运行配置并协调本地管理员' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    Write-HengzhunStageResult '运行配置完整，本地管理员已协调'

    $env:HENGZHUN_PROGRESS_SUBTASK = '1'
    & $node (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') start
    if ($LASTEXITCODE -ne 0) { throw "START_LIFECYCLE_FAILED:$LASTEXITCODE" }
    if (-not $completed.Contains('services')) { [void]$completed.Add('services') }
    Write-HengzhunRecovery -Operation 'START' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 4 -StageName '启动并验证四项服务' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null

    Write-HengzhunStage -Index 5 -Name '验证Flowise本地管理员真实登录' -Hint '登录接口单次校验'
    & $node (Join-Path $PSScriptRoot 'platform-admin.cjs') ensure-live | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "I10_PLATFORM_ADMIN_BOOTSTRAP_FAILED:$LASTEXITCODE" }
    if (-not $completed.Contains('flowise-login')) { [void]$completed.Add('flowise-login') }
    Write-HengzhunRecovery -Operation 'START' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 5 -StageName '验证Flowise本地管理员真实登录' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    Write-HengzhunStageResult 'Flowise管理员登录成功并取得会话Cookie'

    $probeEvidence = Join-Path $root '.data\evidence\i10\model-probes\result.json'
    $probeCanResume = $completed.Contains('model-probes') -and (Test-Path -LiteralPath $probeEvidence)
    if ($probeCanResume) {
        try {
            $probe = Get-Content -LiteralPath $probeEvidence -Raw | ConvertFrom-Json
            $probeCanResume = $probe.mock -eq $false -and $probe.degraded -eq $false -and
                $probe.controller.model -eq $env:CONTROL_MODEL_NAME -and $probe.vision.model -eq $env:VISION_MODEL_NAME
        } catch { $probeCanResume = $false }
    }
    if ($probeCanResume) {
        Write-HengzhunStage -Index 6 -Name '恢复已验证的双模型探针结果'
        Write-HengzhunStageResult '模型、端点和密钥HMAC指纹一致，复用真实探针证据'
    } else {
        & $node (Join-Path $PSScriptRoot 'verify-i10-model-probes.cjs')
        if ($LASTEXITCODE -ne 0) { throw "I10_MODEL_PROBE_FAILED:$LASTEXITCODE" }
        if (-not $completed.Contains('model-probes')) { [void]$completed.Add('model-probes') }
        Write-HengzhunRecovery -Operation 'START' -OperationVersion $operationVersion -Status 'RUNNING' -StageIndex 7 -StageName '验证双模型真实探针' -InputFingerprint $inputFingerprint -CompletedItems $completed | Out-Null
    }
    & $node (Join-Path $PSScriptRoot 'i10-agentflow-publish.cjs') --allow-register
    if ($LASTEXITCODE -ne 0) { throw "I10_AGENTFLOW_PUBLICATION_FAILED:$LASTEXITCODE" }
    if (-not $completed.Contains('agentflow-published')) { [void]$completed.Add('agentflow-published') }
    Complete-HengzhunRecovery -Operation 'START' -OperationVersion $operationVersion -Summary @{ services = 4; modelProbes = $true; agentflowPublished = $true }
    Complete-HengzhunProgress -Message '启动、模型探针和Agentflow发布全部完成'
    Exit-HengzhunRecoveryLock -LockPath $lockPath
    exit 0
} catch {
    $message = [string]$_.Exception.Message
    $errorCode = if ($message -match '^([A-Z0-9_]+)') { $Matches[1] } else { 'START_FAILED' }
    $nonRecoverable = $message -match 'START_REQUIRED_VARIABLE_MISSING|START_LIFECYCLE_FAILED:78|I9_PORT_OCCUPIED_UNKNOWN|I9_PROCESS_OWNERSHIP_MISMATCH|RECOVERY_STATE_INVALID'
    if ($inputFingerprint -and $lockPath) {
        Write-HengzhunRecovery -Operation 'START' -OperationVersion $operationVersion -Status $(if ($nonRecoverable) { 'INVALIDATED' } else { 'FAILED_RECOVERABLE' }) -StageIndex $script:HengzhunProgress.StageIndex -StageName $script:HengzhunProgress.StageName -InputFingerprint $inputFingerprint -CompletedItems $completed -LastErrorCode $errorCode -Recoverable (-not $nonRecoverable) | Out-Null
    }
    Fail-HengzhunProgress -ErrorValue $_ -LogPath '.data/logs/i9'
    if ($nonRecoverable) {
        Write-Host '[START] 不可恢复错误，正在回滚本次启动的受管服务……'
        & $node (Join-Path $PSScriptRoot 'i9-lifecycle.cjs') stop | Out-Null
    } else {
        Write-Host '[START] 已保留健康且归属于本包的服务，修正暂时故障后可再次运行START.cmd续跑。'
    }
    Exit-HengzhunRecoveryLock -LockPath $lockPath
    Write-Error (Protect-HengzhunProgressText $_.Exception.Message)
    exit 1
}
