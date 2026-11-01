[CmdletBinding()]
param([switch]$Execute)

$ErrorActionPreference = 'Stop'
if (-not $Execute) { throw 'DEMO_CLEAN_CLONE_EXECUTION_REQUIRES_EXPLICIT_SWITCH' }

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sourceEnvironment = Join-Path $projectRoot '.env'
$sourceAgentData = Join-Path $projectRoot 'platform\hengzhun-regression-system\.data'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$isolationId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$runRoot = Join-Path $projectRoot "agent\runs\rf027-s4\$stamp"
$temporaryBase = 'D:\Agent\.codex-temp\banksystem-rf027-s4'
$temporaryRoot = Join-Path $temporaryBase $isolationId
$seedRoot = Join-Path $temporaryRoot 'seed'
$cloneRoot = Join-Path $temporaryRoot 'clone'
$coreProject = "rf027s4core$isolationId"
$channelProject = "rf027s4channel$isolationId"
$coreInternalNetwork = "rf027s4_${isolationId}_internal"
$coreFrontNetwork = "rf027s4_${isolationId}_front"
$prepareProgressSource = Join-Path $cloneRoot 'platform\hengzhun-regression-system\.data\runtime\demo-prepare-progress.json'
$prepareProgressEvidence = Join-Path $runRoot 'prepare-progress.json'
$agentTargets = @('runtime.env', 'runtime', 'sqlite', 'artifacts', 'candidates', 'stability', 'midscene-runs', 'image-ingest', 'video-ingest', 'logs')
$volumes = @(
  'mifos-isolated_core_postgresql_data',
  'mifos-channel_bank_channel_pg_data',
  'mifos-channel_keycloak_data',
  'mifos-channel_grafana_data',
  'mifos-channel_loki_data',
  'mifos-channel_prometheus_data'
)
$byokNames = @('HENGZHUN_MODEL_NAME', 'HENGZHUN_MODEL_BASE_URL', 'HENGZHUN_MODEL_API_KEY')

function Invoke-External {
  param([Parameter(Mandatory = $true)][string]$FilePath, [Parameter(Mandatory = $true)][string[]]$Arguments, [string]$WorkingDirectory = $projectRoot)
  Push-Location $WorkingDirectory
  try { $output = & $FilePath @Arguments 2>&1; $exitCode = $LASTEXITCODE }
  finally { Pop-Location }
  if ($exitCode -ne 0) { throw "DEMO_CLEAN_CLONE_EXTERNAL_FAILED:${FilePath}:${exitCode}" }
  return @($output)
}

function Assert-ChildPath {
  param([Parameter(Mandatory = $true)][string]$Parent, [Parameter(Mandatory = $true)][string]$Child)
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $childPath = [IO.Path]::GetFullPath($Child)
  if (-not $childPath.StartsWith($parentPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'DEMO_CLEAN_CLONE_TEMP_PATH_INVALID' }
}

function Assert-DefaultServicesStopped {
  $core = @(docker ps --filter 'label=com.docker.compose.project=mifos-isolated' --format '{{.ID}}')
  if ($LASTEXITCODE -ne 0) { throw 'DEMO_CLEAN_CLONE_DOCKER_QUERY_FAILED' }
  $channel = @(docker ps --filter 'label=com.docker.compose.project=mifos-channel' --format '{{.ID}}')
  if ($LASTEXITCODE -ne 0) { throw 'DEMO_CLEAN_CLONE_DOCKER_QUERY_FAILED' }
  if (($core.Count + $channel.Count) -ne 0) { throw 'DEMO_CLEAN_CLONE_DEFAULT_SERVICES_MUST_BE_STOPPED' }
}

function Get-ByokConfiguration {
  if (-not (Test-Path -LiteralPath $sourceEnvironment -PathType Leaf)) { throw 'DEMO_CLEAN_CLONE_BYOK_SOURCE_MISSING' }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $sourceEnvironment) {
    if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$' -and $Matches[1] -in $byokNames) { $values[$Matches[1]] = $Matches[2] }
  }
  foreach ($name in $byokNames) {
    if ([string]::IsNullOrWhiteSpace($values[$name]) -or $values[$name] -match '^replace-with') { throw "DEMO_CLEAN_CLONE_BYOK_REQUIRED:$name" }
  }
  return $values
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

function Write-VolumeManifest {
  param([Parameter(Mandatory = $true)][string]$VolumeName, [Parameter(Mandatory = $true)][string]$OutputName, [Parameter(Mandatory = $true)][string]$Image)
  $script = "cd /source && find . -type f -print0 | sort -z | xargs -0 -r sha256sum > /evidence/$OutputName"
  Invoke-External -FilePath 'docker' -Arguments @('run', '--rm', '--mount', "type=volume,src=$VolumeName,dst=/source,readonly", '--mount', "type=bind,src=$runRoot,dst=/evidence", $Image, 'sh', '-lc', $script) | Out-Null
  return (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runRoot $OutputName)).Hash.ToLowerInvariant()
}

function Write-SourceManifestAndCopy {
  param([Parameter(Mandatory = $true)][string[]]$Files)
  $records = New-Object 'System.Collections.Generic.List[object]'
  foreach ($relative in $Files) {
    if ([IO.Path]::IsPathRooted($relative) -or $relative -split '[\\/]' -contains '..') { throw 'DEMO_CLEAN_CLONE_SOURCE_PATH_INVALID' }
    if ($relative -in @('.env', 'runtime.env') -or $relative -match '(^|/)(\.data|node_modules)(/|$)') { throw "DEMO_CLEAN_CLONE_SECRET_OR_RUNTIME_TRACKED:$relative" }
    $source = Join-Path $projectRoot $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "DEMO_CLEAN_CLONE_SOURCE_FILE_INVALID:$relative" }
    $destination = Join-Path $seedRoot $relative
    Assert-ChildPath -Parent $seedRoot -Child $destination
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Copy-Item -LiteralPath $source -Destination $destination
    $item = Get-Item -LiteralPath $source
    $records.Add([ordered]@{ path = $relative.Replace('\', '/'); length = $item.Length; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash.ToLowerInvariant() })
  }
  $manifestPath = Join-Path $runRoot 'source-candidate.json'
  $records | ConvertTo-Json -Depth 3 -Compress | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
  return [ordered]@{ count = $records.Count; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant() }
}

function Invoke-Demo {
  param([Parameter(Mandatory = $true)][string]$Command, [int]$TimeoutSeconds = 600, [switch]$AllowFailure)
  $stdoutPath = Join-Path $runRoot "demo-$Command-$([Guid]::NewGuid().ToString('N')).stdout"
  $stderrPath = Join-Path $runRoot "demo-$Command-$([Guid]::NewGuid().ToString('N')).stderr"
  $entrypoint = Join-Path $cloneRoot 'demo.ps1'
  $process = Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $entrypoint, $Command) -WorkingDirectory $cloneRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
  try { Wait-Process -Id $process.Id -Timeout $TimeoutSeconds -ErrorAction Stop } catch {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    if ($AllowFailure) { return $null }
    throw "DEMO_CLEAN_CLONE_COMMAND_TIMEOUT:$Command"
  }
  $process.Refresh()
  if ($process.ExitCode -ne 0) {
    if ($AllowFailure) { return $null }
    throw "DEMO_CLEAN_CLONE_COMMAND_FAILED:${Command}:$($process.ExitCode)"
  }
  $stdout = Get-Content -Raw -LiteralPath $stdoutPath
  try { return ($stdout | ConvertFrom-Json) }
  catch {
    if ($AllowFailure) { return $null }
    throw "DEMO_CLEAN_CLONE_COMMAND_OUTPUT_INVALID:$Command"
  }
}

function Remove-IsolatedDockerResources {
  foreach ($project in @($channelProject, $coreProject)) {
    $containers = @(docker ps -aq --filter "label=com.docker.compose.project=$project")
    if ($containers.Count -gt 0) { Invoke-External -FilePath 'docker' -Arguments (@('rm', '-f') + $containers) | Out-Null }
    $volumesToRemove = @(docker volume ls -q --filter "label=com.docker.compose.project=$project")
    if ($volumesToRemove.Count -gt 0) { Invoke-External -FilePath 'docker' -Arguments (@('volume', 'rm') + $volumesToRemove) | Out-Null }
    $networks = @(docker network ls -q --filter "label=com.docker.compose.project=$project")
    if ($networks.Count -gt 0) { Invoke-External -FilePath 'docker' -Arguments (@('network', 'rm') + $networks) | Out-Null }
  }
}

function Capture-PrepareProgress {
  if (Test-Path -LiteralPath $prepareProgressSource -PathType Leaf) {
    Copy-Item -LiteralPath $prepareProgressSource -Destination $prepareProgressEvidence -Force
  }
}

function Assert-IsolatedResourcesRemoved {
  foreach ($project in @($coreProject, $channelProject)) {
    if (@(docker ps -aq --filter "label=com.docker.compose.project=$project").Count -ne 0) { throw "DEMO_CLEAN_CLONE_CONTAINER_REMAINS:$project" }
    if (@(docker volume ls -q --filter "label=com.docker.compose.project=$project").Count -ne 0) { throw "DEMO_CLEAN_CLONE_VOLUME_REMAINS:$project" }
  }
}

Set-Location $projectRoot
Assert-DefaultServicesStopped
if (-not (Test-Path -LiteralPath $sourceEnvironment -PathType Leaf)) { throw 'DEMO_CLEAN_CLONE_BYOK_SOURCE_MISSING' }
$sourceFiles = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard)
if ($LASTEXITCODE -ne 0 -or $sourceFiles.Count -eq 0) { throw 'DEMO_CLEAN_CLONE_SOURCE_LIST_FAILED' }
$byok = Get-ByokConfiguration
Assert-ChildPath -Parent $temporaryBase -Child $temporaryRoot
New-Item -ItemType Directory -Path $runRoot, $seedRoot -Force | Out-Null

$backupImageOutput = @(Invoke-External -FilePath 'docker' -Arguments @('image', 'inspect', 'debian:bookworm-slim', '--format', '{{.Id}}'))
$backupImage = ([string]$backupImageOutput[0]).Trim()
$sourceEnvironmentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceEnvironment).Hash.ToLowerInvariant()
$agentBeforePath = Join-Path $runRoot 'agent-before.json'
$agentAfterPath = Join-Path $runRoot 'agent-after.json'
$agentBeforeHash = Write-AgentManifest -Root $sourceAgentData -OutputPath $agentBeforePath
$volumeBefore = [ordered]@{}
foreach ($volume in $volumes) {
  Invoke-External -FilePath 'docker' -Arguments @('volume', 'inspect', $volume) | Out-Null
  $volumeBefore[$volume] = Write-VolumeManifest -VolumeName $volume -OutputName "$volume.before.sha256" -Image $backupImage
}

$savedEnvironment = @{}
foreach ($name in @($byokNames + @('HENGZHUN_CORE_COMPOSE_PROJECT', 'HENGZHUN_CHANNEL_COMPOSE_PROJECT', 'HENGZHUN_CORE_INTERNAL_NETWORK', 'HENGZHUN_CORE_FRONT_NETWORK'))) {
  $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$executionError = $null
$cleanupError = $null
$prepare = $null
$up = $null
$status = $null
$down = $null
$sourceManifest = $null
$candidateCommit = $null
$candidateTree = $null
$initialCloneClean = $false
$finalCloneClean = $false
$prebuiltArtifactsAbsent = $false

try {
  $sourceManifest = Write-SourceManifestAndCopy -Files $sourceFiles
  Invoke-External -FilePath 'git' -Arguments @('init', '--initial-branch=main', '--quiet') -WorkingDirectory $seedRoot | Out-Null
  Invoke-External -FilePath 'git' -Arguments @('add', '--all') -WorkingDirectory $seedRoot | Out-Null
  Invoke-External -FilePath 'git' -Arguments @('-c', 'user.name=RF027 verifier', '-c', 'user.email=rf027@local.invalid', 'commit', '--quiet', '-m', 'RF-027 S4 clean candidate') -WorkingDirectory $seedRoot | Out-Null
  $candidateCommitOutput = @(Invoke-External -FilePath 'git' -Arguments @('rev-parse', 'HEAD') -WorkingDirectory $seedRoot)
  $candidateTreeOutput = @(Invoke-External -FilePath 'git' -Arguments @('rev-parse', 'HEAD^{tree}') -WorkingDirectory $seedRoot)
  $candidateCommit = ([string]$candidateCommitOutput[0]).Trim()
  $candidateTree = ([string]$candidateTreeOutput[0]).Trim()
  Invoke-External -FilePath 'git' -Arguments @('clone', '--no-hardlinks', '--quiet', $seedRoot, $cloneRoot) -WorkingDirectory $temporaryRoot | Out-Null
  $cloneCommitOutput = @(Invoke-External -FilePath 'git' -Arguments @('rev-parse', 'HEAD') -WorkingDirectory $cloneRoot)
  $cloneTreeOutput = @(Invoke-External -FilePath 'git' -Arguments @('rev-parse', 'HEAD^{tree}') -WorkingDirectory $cloneRoot)
  $cloneCommit = ([string]$cloneCommitOutput[0]).Trim()
  $cloneTree = ([string]$cloneTreeOutput[0]).Trim()
  if ($cloneCommit -ne $candidateCommit -or $cloneTree -ne $candidateTree) { throw 'DEMO_CLEAN_CLONE_GIT_IDENTITY_MISMATCH' }
  $initialCloneClean = @(git -C $cloneRoot status --porcelain).Count -eq 0
  if (-not $initialCloneClean) { throw 'DEMO_CLEAN_CLONE_INITIAL_STATUS_DIRTY' }
  $prebuiltArtifactsAbsent = -not (Test-Path -LiteralPath (Join-Path $cloneRoot '.env')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'platform\hengzhun-regression-system\.data')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'platform\hengzhun-regression-system\runtime\node_modules')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'platform\hengzhun-regression-system\runtime\node-v20.20.2-win-x64')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'platform\hengzhun-regression-system\runtime\node-v24.19.0-win-x64')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'apps\customer-portal\dist')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'apps\operations-console\dist')) -and
    -not (Test-Path -LiteralPath (Join-Path $cloneRoot 'apps\quality-case-portal\dist'))
  if (-not $prebuiltArtifactsAbsent) { throw 'DEMO_CLEAN_CLONE_PREBUILT_STATE_PRESENT' }

  foreach ($name in $byokNames) { [Environment]::SetEnvironmentVariable($name, $byok[$name], 'Process') }
  $env:HENGZHUN_CORE_COMPOSE_PROJECT = $coreProject
  $env:HENGZHUN_CHANNEL_COMPOSE_PROJECT = $channelProject
  $env:HENGZHUN_CORE_INTERNAL_NETWORK = $coreInternalNetwork
  $env:HENGZHUN_CORE_FRONT_NETWORK = $coreFrontNetwork

  $prepare = Invoke-Demo -Command 'prepare' -TimeoutSeconds 1800
  Capture-PrepareProgress
  if ($prepare.status -ne 'PREPARED') { throw 'DEMO_CLEAN_CLONE_PREPARE_NOT_PREPARED' }
  $up = Invoke-Demo -Command 'up' -TimeoutSeconds 900
  if ($up.status -ne 'READY') { throw 'DEMO_CLEAN_CLONE_UP_NOT_READY' }
  $status = Invoke-Demo -Command 'status' -TimeoutSeconds 120
  if ($status.status -ne 'READY') { throw 'DEMO_CLEAN_CLONE_STATUS_NOT_READY' }
  if ($prepare.releaseIdentity -ne $up.releaseIdentity -or $up.releaseIdentity -ne $status.releaseIdentity.hash) { throw 'DEMO_CLEAN_CLONE_RELEASE_IDENTITY_DRIFT' }
  $down = Invoke-Demo -Command 'down' -TimeoutSeconds 600
  if ($down.status -ne 'STOPPED') { throw 'DEMO_CLEAN_CLONE_DOWN_NOT_STOPPED' }
  $reset = Invoke-Demo -Command 'reset' -TimeoutSeconds 600
  if ($reset.status -ne 'RESET') { throw 'DEMO_CLEAN_CLONE_RESET_FAILED' }
  Assert-IsolatedResourcesRemoved
  $finalCloneClean = @(git -C $cloneRoot status --porcelain).Count -eq 0
  if (-not $finalCloneClean) { throw 'DEMO_CLEAN_CLONE_FINAL_STATUS_DIRTY' }
} catch {
  $executionError = $_
} finally {
  Capture-PrepareProgress
  if (Test-Path -LiteralPath $cloneRoot -PathType Container) {
    try { Invoke-Demo -Command 'down' -TimeoutSeconds 300 -AllowFailure | Out-Null } catch { }
  }
  try { Remove-IsolatedDockerResources } catch { $cleanupError = $_ }
  foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}

$agentAfterHash = Write-AgentManifest -Root $sourceAgentData -OutputPath $agentAfterPath
$volumeAfter = [ordered]@{}
foreach ($volume in $volumes) { $volumeAfter[$volume] = Write-VolumeManifest -VolumeName $volume -OutputName "$volume.after.sha256" -Image $backupImage }
$sourceEnvironmentAfterHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceEnvironment).Hash.ToLowerInvariant()
$prepareProgress = if (Test-Path -LiteralPath $prepareProgressEvidence -PathType Leaf) { Get-Content -Raw -LiteralPath $prepareProgressEvidence | ConvertFrom-Json } else { $null }
$originalStatePreserved = $agentBeforeHash -eq $agentAfterHash -and $sourceEnvironmentHash -eq $sourceEnvironmentAfterHash
foreach ($volume in $volumes) { $originalStatePreserved = $originalStatePreserved -and $volumeBefore[$volume] -eq $volumeAfter[$volume] }
try { Assert-DefaultServicesStopped; Assert-IsolatedResourcesRemoved } catch { if ($null -eq $cleanupError) { $cleanupError = $_ } }

if (Test-Path -LiteralPath $temporaryRoot) {
  Assert-ChildPath -Parent $temporaryBase -Child $temporaryRoot
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
}

$result = [ordered]@{
  schemaVersion = 'banksystem-demo-clean-clone-evidence/v1'
  status = if ($null -eq $executionError -and $null -eq $cleanupError -and $originalStatePreserved) { 'PASS' } else { 'FAILED' }
  runRoot = [IO.Path]::GetRelativePath($projectRoot, $runRoot).Replace('\', '/')
  sourceFileCount = if ($null -ne $sourceManifest) { $sourceManifest.count } else { 0 }
  sourceManifestSha256 = if ($null -ne $sourceManifest) { $sourceManifest.sha256 } else { $null }
  candidateCommit = $candidateCommit
  candidateTree = $candidateTree
  initialCloneClean = $initialCloneClean
  prebuiltArtifactsAbsent = $prebuiltArtifactsAbsent
  finalCloneClean = $finalCloneClean
  releaseIdentity = if ($null -ne $status) { $status.releaseIdentity.hash } else { $null }
  modelBinding = if ($null -ne $status) { $status.modelBinding } else { $null }
  lifecycle = [ordered]@{
    prepare = if ($null -ne $prepare) { $prepare.status } else { $null }
    up = if ($null -ne $up) { $up.status } else { $null }
    status = if ($null -ne $status) { $status.status } else { $null }
    down = if ($null -ne $down) { $down.status } else { $null }
  }
  prepareLastPhase = if ($null -ne $prepareProgress) { $prepareProgress.phase } else { $null }
  originalAgentManifestSha256 = $agentBeforeHash
  originalVolumeManifestSha256 = $volumeBefore
  originalStatePreserved = $originalStatePreserved
  isolatedResourcesRemoved = $null -eq $cleanupError
  errorCode = if ($null -ne $executionError) { ($executionError.Exception.Message -split ':')[0] } elseif ($null -ne $cleanupError) { ($cleanupError.Exception.Message -split ':')[0] } elseif (-not $originalStatePreserved) { 'DEMO_CLEAN_CLONE_ORIGINAL_STATE_DRIFT' } else { $null }
}
$result | ConvertTo-Json -Depth 8 -Compress | Write-Output
if ($result.status -ne 'PASS') { exit 1 }
