$script:HengzhunProgress = $null

function Initialize-HengzhunProgress {
    param([Parameter(Mandatory=$true)][string]$Operation, [int]$StageTotal)
    $enabled = $env:HENGZHUN_PROGRESS -eq '1'
    $script:HengzhunProgress = [ordered]@{
        Enabled = $enabled
        Operation = $Operation.ToUpperInvariant()
        StageTotal = $StageTotal
        StartedAt = [DateTimeOffset]::Now
        LastActivityAt = [DateTimeOffset]::Now
        StageIndex = 0
        StageName = ''
    }
}

function Format-HengzhunDuration([TimeSpan]$Duration) {
    return '{0:00}:{1:00}:{2:00}' -f [Math]::Floor($Duration.TotalHours), $Duration.Minutes, $Duration.Seconds
}

function Protect-HengzhunProgressText([string]$Text) {
    if ($null -eq $Text) { return '' }
    $safe = $Text -replace 'sk-[A-Za-z0-9_-]+', '[REDACTED]'
    $safe = $safe -replace '(?i)Bearer\s+[A-Za-z0-9._~-]+', 'Bearer [REDACTED]'
    $safe = $safe -replace '(?i)((API[_ -]?KEY|PASSWORD|TOKEN|SECRET)\s*[=:]\s*)[^\s,;]+', '$1[REDACTED]'
    return ($safe -replace '[\r\n]+', ' ')
}

function Write-HengzhunStage {
    param(
        [Parameter(Mandatory=$true)][int]$Index,
        [Parameter(Mandatory=$true)][string]$Name,
        [string]$Hint = ''
    )
    if (-not $script:HengzhunProgress.Enabled) { return }
    $script:HengzhunProgress.StageIndex = $Index
    $script:HengzhunProgress.StageName = $Name
    $script:HengzhunProgress.LastActivityAt = [DateTimeOffset]::Now
    $elapsed = Format-HengzhunDuration ([DateTimeOffset]::Now - $script:HengzhunProgress.StartedAt)
    $suffix = if ($Hint) { '｜预计：' + (Protect-HengzhunProgressText $Hint) } else { '' }
    Write-Host ("[{0} {1}/{2}] {3}｜已用：{4}{5}" -f $script:HengzhunProgress.Operation, $Index, $script:HengzhunProgress.StageTotal, (Protect-HengzhunProgressText $Name), $elapsed, $suffix)
}

function Write-HengzhunStageResult {
    param([Parameter(Mandatory=$true)][string]$Message)
    if (-not $script:HengzhunProgress.Enabled) { return }
    $script:HengzhunProgress.LastActivityAt = [DateTimeOffset]::Now
    Write-Host ("[{0} {1}/{2}] {3}" -f $script:HengzhunProgress.Operation, $script:HengzhunProgress.StageIndex, $script:HengzhunProgress.StageTotal, (Protect-HengzhunProgressText $Message))
}

function Complete-HengzhunProgress {
    param([string]$Message = '完成')
    if (-not $script:HengzhunProgress.Enabled) { return }
    $elapsed = Format-HengzhunDuration ([DateTimeOffset]::Now - $script:HengzhunProgress.StartedAt)
    Write-Host ("[{0}] {1}｜总耗时：{2}" -f $script:HengzhunProgress.Operation, (Protect-HengzhunProgressText $Message), $elapsed)
}

function Fail-HengzhunProgress {
    param([Parameter(Mandatory=$true)]$ErrorValue, [string]$LogPath = '')
    if (-not $script:HengzhunProgress.Enabled) { return }
    $elapsed = Format-HengzhunDuration ([DateTimeOffset]::Now - $script:HengzhunProgress.StartedAt)
    $code = if ($ErrorValue.Exception -and $ErrorValue.Exception.Data['ErrorCode']) { $ErrorValue.Exception.Data['ErrorCode'] } else { 'FAILED' }
    $reason = if ($ErrorValue.Exception) { $ErrorValue.Exception.Message } else { [string]$ErrorValue }
    $suffix = if ($LogPath) { '｜日志：' + $LogPath } else { '' }
    Write-Host ("[{0}] 失败｜阶段：{1}/{2} {3}｜错误码：{4}｜原因：{5}｜已用：{6}{7}" -f $script:HengzhunProgress.Operation, $script:HengzhunProgress.StageIndex, $script:HengzhunProgress.StageTotal, (Protect-HengzhunProgressText $script:HengzhunProgress.StageName), $code, (Protect-HengzhunProgressText $reason), $elapsed, $suffix) -ForegroundColor Red
}
