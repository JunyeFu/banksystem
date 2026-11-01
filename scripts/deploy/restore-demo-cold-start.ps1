[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$RunRoot)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'agent\runs\rf027-s3'))
$resolvedRunRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RunRoot).Path)
if (-not $resolvedRunRoot.StartsWith(($allowedRoot + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'DEMO_COLD_RESTORE_RUN_ROOT_INVALID'
}

$volumeRoot = Join-Path $resolvedRunRoot 'volumes'
$agentBackup = Join-Path $resolvedRunRoot 'agent-state'
$agentData = Join-Path $projectRoot 'platform\hengzhun-regression-system\.data'
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
  if ($LASTEXITCODE -ne 0) { throw "DEMO_COLD_RESTORE_EXTERNAL_FAILED:${FilePath}:${LASTEXITCODE}:$($output -join ' ')" }
  return @($output)
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

$agentBefore = Join-Path $resolvedRunRoot 'agent-before.json'
if (-not (Test-Path -LiteralPath $agentBefore -PathType Leaf) -or -not (Test-Path -LiteralPath $agentBackup -PathType Container)) {
  throw 'DEMO_COLD_RESTORE_AGENT_BACKUP_MISSING'
}
foreach ($volume in $volumes) {
  foreach ($suffix in @('.tar', '.files.sha256')) {
    if (-not (Test-Path -LiteralPath (Join-Path $volumeRoot ($volume.name + $suffix)) -PathType Leaf)) {
      throw "DEMO_COLD_RESTORE_VOLUME_BACKUP_MISSING:$($volume.name)$suffix"
    }
  }
}

Set-Location $projectRoot
$reset = & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot 'demo.ps1') reset 2>&1
if ($LASTEXITCODE -ne 0) { throw "DEMO_COLD_RESTORE_RESET_FAILED:$($reset -join ' ')" }
Write-Output 'RESTORE_COLD_STATE_REMOVED=PASS'

$imageOutput = @(Invoke-External -FilePath 'docker' -Arguments @('image', 'inspect', 'debian:bookworm-slim', '--format', '{{.Id}}'))
$backupImage = ([string]$imageOutput[0]).Trim()
foreach ($volume in $volumes) {
  Invoke-External -FilePath 'docker' -Arguments @('volume', 'create', '--label', "com.docker.compose.project=$($volume.project)", '--label', "com.docker.compose.volume=$($volume.key)", $volume.name) | Out-Null
  Invoke-External -FilePath 'docker' -Arguments @('run', '--rm', '--mount', "type=volume,src=$($volume.name),dst=/target", '--mount', "type=bind,src=$volumeRoot,dst=/backup,readonly", $backupImage, 'tar', '-C', '/target', '-xf', "/backup/$($volume.name).tar") | Out-Null
}
Write-Output 'RESTORE_VOLUME_ARCHIVES=PASS count=6'

foreach ($relative in $agentTargets) {
  $source = Join-Path $agentBackup $relative
  if (-not (Test-Path -LiteralPath $source)) { continue }
  $target = Join-Path $agentData $relative
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Move-Item -LiteralPath $source -Destination $target
}
Write-Output 'RESTORE_AGENT_MOVE=PASS'

foreach ($volume in $volumes) {
  $restoredManifest = "$($volume.name).restored-after-abort.files.sha256"
  $script = "cd /target && find . -type f -print0 | sort -z | xargs -0 -r sha256sum > /tmp/$restoredManifest && cp /tmp/$restoredManifest /backup/$restoredManifest"
  Invoke-External -FilePath 'docker' -Arguments @('run', '--rm', '--mount', "type=volume,src=$($volume.name),dst=/target,readonly", '--mount', "type=bind,src=$volumeRoot,dst=/backup", $backupImage, 'sh', '-lc', $script) | Out-Null
  $beforeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $volumeRoot "$($volume.name).files.sha256")).Hash
  $afterHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $volumeRoot $restoredManifest)).Hash
  if ($beforeHash -ne $afterHash) { throw "DEMO_COLD_RESTORE_VOLUME_MISMATCH:$($volume.name)" }
}
Write-Output 'RESTORE_VOLUME_MANIFESTS=PASS count=6'

$agentRestored = Join-Path $resolvedRunRoot 'agent-restored-after-abort.json'
$beforeAgentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $agentBefore).Hash.ToLowerInvariant()
$afterAgentHash = Write-AgentManifest -Root $agentData -OutputPath $agentRestored
if ($beforeAgentHash -ne $afterAgentHash) { throw "DEMO_COLD_RESTORE_AGENT_MISMATCH:${beforeAgentHash}:${afterAgentHash}" }

[ordered]@{
  schemaVersion = 'banksystem-demo-cold-start-restore/v1'
  status = 'RESTORED'
  runRoot = [IO.Path]::GetRelativePath($projectRoot, $resolvedRunRoot).Replace('\', '/')
  volumeManifestsMatched = 6
  agentManifestSha256 = $afterAgentHash
  legacyVolumePreserved = $true
} | ConvertTo-Json -Compress | Write-Output
