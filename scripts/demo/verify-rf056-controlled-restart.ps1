[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

$databases = @('mifos-isolated-postgresql-1', 'mifos-isolated-activemq-1', 'mifos-channel-bank-channel-postgres-1')
$core = @('mifos-isolated-fineract-server-1', 'mifos-channel-keycloak-1')
$channel = @('mifos-channel-bank-channel-service-1', 'mifos-channel-test-support-service-1',
  'mifos-channel-customer-portal-1', 'mifos-channel-operations-console-1', 'mifos-channel-gateway-1',
  'mifos-channel-prometheus-1', 'mifos-channel-grafana-1', 'mifos-channel-loki-1', 'mifos-channel-otel-collector-1')
$containers = $databases + $core + $channel

function Get-MountIdentity {
  $identity = @(& docker inspect --format '{{.Id}}|{{.Name}}|{{json .Mounts}}' $containers)
  if ($LASTEXITCODE -ne 0) { throw 'RF056_RESTART_INSPECT_FAILED' }
  return $identity | Sort-Object
}
function Wait-Healthy([string[]]$Names) {
  $deadline = [DateTime]::UtcNow.AddSeconds(300)
  do {
    $states = @(& docker inspect --format '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $Names)
    if ($LASTEXITCODE -ne 0) { throw 'RF056_RESTART_HEALTH_INSPECT_FAILED' }
    $ready = $true
    foreach ($state in $states) {
      $parts = $state.Split('|')
      if ($parts[1] -ne 'running' -or $parts[2] -eq 'unhealthy') { throw "RF056_RESTART_SERVICE_FAILED:$($parts[0])" }
      if ($parts[2] -eq 'starting') { $ready = $false }
    }
    if ($ready) { return }
    Start-Sleep -Seconds 5
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'RF056_RESTART_HEALTH_NOT_READY'
}

$before = Get-MountIdentity
Wait-Healthy $containers
foreach ($cohort in @(@{names=$databases}, @{names=$core}, @{names=$channel})) {
  & docker restart $cohort.names | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'RF056_RESTART_COMMAND_FAILED' }
  Wait-Healthy $cohort.names
}
$after = Get-MountIdentity
if (@(Compare-Object $before $after).Count -ne 0) { throw 'RF056_RESTART_CONTAINER_OR_MOUNT_CHANGED' }
$mock = @(& docker ps --filter 'label=com.docker.compose.service=mock-clearing-service' --format '{{.Names}}')
if ($LASTEXITCODE -ne 0 -or $mock.Count -ne 0) { throw 'RF056_RESTART_DEFAULT_MOCK_PRESENT' }
Write-Output 'RF056_CONTROLLED_RESTART=PASS core=3 channel=11 containers=PRESERVED mounts=PRESERVED health=READY mock=ABSENT admin_tools=NOT_REQUIRED'
