[CmdletBinding()]
param([switch]$Execute)

$ErrorActionPreference = 'Stop'
if (-not $Execute) { throw 'DEMO_COLD_START_EXECUTION_REQUIRES_EXPLICIT_SWITCH' }

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$entrypoint = Join-Path $projectRoot 'demo.ps1'
$agentData = Join-Path $projectRoot 'platform\hengzhun-regression-system\.data'
$runRoot = Join-Path $projectRoot ('agent\runs\rf027-s3\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$agentBackupRoot = Join-Path $runRoot 'agent-state'
$volumeBackupRoot = Join-Path $runRoot 'volumes'
$agentTargets = @('runtime.env', 'runtime', 'sqlite', 'artifacts', 'candidates', 'stability', 'midscene-runs', 'image-ingest', 'video-ingest', 'logs')
$volumes = @(
  [ordered]@{ name = 'mifos-isolated_core_postgresql_data'; project = 'mifos-isolated'; key = 'core_postgresql_data' },
  [ordered]@{ name = 'mifos-channel_bank_channel_pg_data'; project = 'mifos-channel'; key = 'bank_channel_pg_data' },
  [ordered]@{ name = 'mifos-channel_keycloak_data'; project = 'mifos-channel'; key = 'keycloak_data' },
  [ordered]@{ name = 'mifos-channel_grafana_data'; project = 'mifos-channel'; key = 'grafana_data' },
  [ordered]@{ name = 'mifos-channel_loki_data'; project = 'mifos-channel'; key = 'loki_data' },
  [ordered]@{ name = 'mifos-channel_prometheus_data'; project = 'mifos-channel'; key = 'prometheus_data' }
)

function Invoke-External {
  param([Parameter(Mandatory = $true)][string]$FilePath, [Parameter(Mandatory = $true)][string[]]$Arguments)
  $output = & $FilePath @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "DEMO_COLD_EXTERNAL_FAILED:${FilePath}:${LASTEXITCODE}:$($output -join ' ')" }
  return @($output)
}

function Invoke-Demo {
  param([Parameter(Mandatory = $true)][string]$Command)
  $stdoutPath = Join-Path $runRoot ("demo-$Command-{0}.stdout" -f [Guid]::NewGuid().ToString('N'))
  $stderrPath = Join-Path $runRoot ("demo-$Command-{0}.stderr" -f [Guid]::NewGuid().ToString('N'))
  try {
    $process = Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $entrypoint, $Command) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    try { Wait-Process -Id $process.Id -Timeout 600 -ErrorAction Stop } catch {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      throw "DEMO_COLD_COMMAND_TIMEOUT:$Command"
    }
    $process.Refresh()
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -Raw -LiteralPath $stdoutPath } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { '' }
    if ($process.ExitCode -ne 0) { throw "DEMO_COLD_COMMAND_FAILED:${Command}:$($process.ExitCode):$stderr$stdout" }
    return ($stdout | ConvertFrom-Json)
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Write-AgentManifest {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)][string]$OutputPath)
  $records = New-Object 'System.Collections.Generic.List[object]'
  foreach ($relative in $agentTargets) {
    $target = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $item = Get-Item -LiteralPath $target -Force
    if (-not $item.PSIsContainer) {
      $records.Add([ordered]@{ path = $relative.Replace('\', '/'); type = 'file'; length = $item.Length; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash.ToLowerInvariant() })
      continue
    }
    $records.Add([ordered]@{ path = $relative.Replace('\', '/'); type = 'directory' })
    foreach ($child in @(Get-ChildItem -LiteralPath $target -Recurse -Force | Sort-Object FullName)) {
      $childRelative = [IO.Path]::GetRelativePath($Root, $child.FullName).Replace('\', '/')
      if ($child.PSIsContainer) {
        $records.Add([ordered]@{ path = $childRelative; type = 'directory' })
      } else {
        $records.Add([ordered]@{ path = $childRelative; type = 'file'; length = $child.Length; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $child.FullName).Hash.ToLowerInvariant() })
      }
    }
  }
  $records | ConvertTo-Json -Depth 4 -Compress | Set-Content -LiteralPath $OutputPath -Encoding utf8NoBOM
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputPath).Hash.ToLowerInvariant()
}

function Assert-ServicesStopped {
  $coreRunning = @(docker ps --filter 'label=com.docker.compose.project=mifos-isolated' --format '{{.ID}}')
  if ($LASTEXITCODE -ne 0) { throw 'DEMO_COLD_DOCKER_QUERY_FAILED' }
  $channelRunning = @(docker ps --filter 'label=com.docker.compose.project=mifos-channel' --format '{{.ID}}')
  if ($LASTEXITCODE -ne 0) { throw 'DEMO_COLD_DOCKER_QUERY_FAILED' }
  $running = @($coreRunning) + @($channelRunning)
  if ($running.Count -ne 0) { throw 'DEMO_COLD_PROJECT_SERVICES_MUST_BE_STOPPED' }
}

function Assert-ResetState {
  foreach ($volume in $volumes) {
    & docker volume inspect $volume.name *> $null
    if ($LASTEXITCODE -eq 0) { throw "DEMO_COLD_VOLUME_NOT_REMOVED:$($volume.name)" }
  }
  foreach ($relative in $agentTargets) {
    if (Test-Path -LiteralPath (Join-Path $agentData $relative)) { throw "DEMO_COLD_AGENT_STATE_NOT_REMOVED:$relative" }
  }
}

Set-Location $projectRoot
Assert-ServicesStopped
New-Item -ItemType Directory -Path $agentBackupRoot, $volumeBackupRoot -Force | Out-Null
$backupImageOutput = @(Invoke-External -FilePath 'docker' -Arguments @('image', 'inspect', 'debian:bookworm-slim', '--format', '{{.Id}}'))
$backupImage = ([string]$backupImageOutput[0]).Trim()
$volumeEvidence = New-Object 'System.Collections.Generic.List[object]'
$agentMoved = New-Object 'System.Collections.Generic.List[string]'
$resetAttempted = $false
$coldStarted = $false
$firstReady = $null
$secondReady = $null
$originalAgentManifest = Join-Path $runRoot 'agent-before.json'
$restoredAgentManifest = Join-Path $runRoot 'agent-restored.json'
$agentManifestHash = $null
$restoredAgentHash = $null
$executionError = $null

try {
  foreach ($volume in $volumes) {
    Invoke-External -FilePath 'docker' -Arguments @('volume', 'inspect', $volume.name) | Out-Null
    $archiveName = "$($volume.name).tar"
    $manifestName = "$($volume.name).files.sha256"
    $script = "cd /source && tar -cf /backup/$archiveName . && find . -type f -print0 | sort -z | xargs -0 -r sha256sum > /backup/$manifestName"
    Invoke-External -FilePath 'docker' -Arguments @('run', '--rm', '--mount', "type=volume,src=$($volume.name),dst=/source,readonly", '--mount', "type=bind,src=$volumeBackupRoot,dst=/backup", $backupImage, 'sh', '-lc', $script) | Out-Null
    $archivePath = Join-Path $volumeBackupRoot $archiveName
    $manifestPath = Join-Path $volumeBackupRoot $manifestName
    $volumeEvidence.Add([ordered]@{
      name = $volume.name
      archiveSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
      contentManifestSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
    })
  }

  $agentManifestHash = Write-AgentManifest -Root $agentData -OutputPath $originalAgentManifest
  foreach ($relative in $agentTargets) {
    $source = Join-Path $agentData $relative
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $destination = Join-Path $agentBackupRoot $relative
    $parent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Move-Item -LiteralPath $source -Destination $destination
    $agentMoved.Add($relative)
  }

  $resetAttempted = $true
  Invoke-Demo -Command 'reset' | Out-Null
  Assert-ResetState
  Invoke-Demo -Command 'prepare' | Out-Null
  $firstReady = Invoke-Demo -Command 'up'
  if ($firstReady.status -ne 'READY') { throw 'DEMO_COLD_FIRST_START_NOT_READY' }
  Invoke-Demo -Command 'down' | Out-Null
  $secondReady = Invoke-Demo -Command 'up'
  if ($secondReady.status -ne 'READY') { throw 'DEMO_COLD_SECOND_START_NOT_READY' }
  Invoke-Demo -Command 'down' | Out-Null
  $coldStarted = $true
} catch {
  $executionError = $_
  if ($resetAttempted) {
    & docker compose --env-file (Join-Path $projectRoot '.env') -f (Join-Path $projectRoot 'postgresql\docker-compose.isolated.yml') ps --all --format json 2>$null | Set-Content -LiteralPath (Join-Path $runRoot 'failure-core-ps.jsonl') -Encoding utf8NoBOM
    & docker compose --env-file (Join-Path $projectRoot '.env') -f (Join-Path $projectRoot 'compose.channel.yaml') ps --all --format json 2>$null | Set-Content -LiteralPath (Join-Path $runRoot 'failure-channel-ps.jsonl') -Encoding utf8NoBOM
  }
} finally {
  if ($resetAttempted) {
    try { Invoke-Demo -Command 'reset' | Out-Null } catch {
      Write-Warning "DEMO_COLD_CLEANUP_RESET_FAILED:$($_.Exception.Message)"
      try { Invoke-Demo -Command 'down' | Out-Null } catch { Write-Warning "DEMO_COLD_CLEANUP_DOWN_FAILED:$($_.Exception.Message)" }
    }
  }

  foreach ($relative in $agentMoved) {
    $coldTarget = Join-Path $agentData $relative
    if (Test-Path -LiteralPath $coldTarget) { Remove-Item -LiteralPath $coldTarget -Recurse -Force }
    $source = Join-Path $agentBackupRoot $relative
    $parent = Split-Path -Parent $coldTarget
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Move-Item -LiteralPath $source -Destination $coldTarget
  }

  if ($resetAttempted) {
    foreach ($volume in $volumes) {
      & docker volume inspect $volume.name *> $null
      if ($LASTEXITCODE -eq 0) { Invoke-External -FilePath 'docker' -Arguments @('volume', 'rm', $volume.name) | Out-Null }
      Invoke-External -FilePath 'docker' -Arguments @('volume', 'create', '--label', "com.docker.compose.project=$($volume.project)", '--label', "com.docker.compose.volume=$($volume.key)", $volume.name) | Out-Null
      $archiveName = "$($volume.name).tar"
      Invoke-External -FilePath 'docker' -Arguments @('run', '--rm', '--mount', "type=volume,src=$($volume.name),dst=/target", '--mount', "type=bind,src=$volumeBackupRoot,dst=/backup,readonly", $backupImage, 'tar', '-C', '/target', '-xf', "/backup/$archiveName") | Out-Null
      $restoredManifest = "$($volume.name).restored.files.sha256"
      $script = "cd /target && find . -type f -print0 | sort -z | xargs -0 -r sha256sum > /tmp/$restoredManifest && cp /tmp/$restoredManifest /backup/$restoredManifest"
      Invoke-External -FilePath 'docker' -Arguments @('run', '--rm', '--mount', "type=volume,src=$($volume.name),dst=/target,readonly", '--mount', "type=bind,src=$volumeBackupRoot,dst=/backup", $backupImage, 'sh', '-lc', $script) | Out-Null
      $beforeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $volumeBackupRoot "$($volume.name).files.sha256")).Hash
      $afterHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $volumeBackupRoot $restoredManifest)).Hash
      if ($beforeHash -ne $afterHash) { throw "DEMO_COLD_VOLUME_RESTORE_MISMATCH:$($volume.name)" }
    }
  }

  if ($null -ne $agentManifestHash) {
    $restoredAgentHash = Write-AgentManifest -Root $agentData -OutputPath $restoredAgentManifest
    if ($agentManifestHash -ne $restoredAgentHash) { throw 'DEMO_COLD_AGENT_RESTORE_MISMATCH' }
  }
}

if ($null -ne $executionError) { throw $executionError }
if (-not $coldStarted) { throw 'DEMO_COLD_START_DID_NOT_COMPLETE' }

[ordered]@{
  schemaVersion = 'banksystem-demo-cold-start-evidence/v1'
  status = 'PASS'
  backupRoot = [IO.Path]::GetRelativePath($projectRoot, $runRoot).Replace('\', '/')
  releaseIdentity = $firstReady.releaseIdentity
  coldRestartReleaseIdentity = $secondReady.releaseIdentity
  agentManifestSha256 = $agentManifestHash
  volumes = $volumeEvidence
  originalStateRestored = $true
} | ConvertTo-Json -Depth 5 -Compress | Write-Output
