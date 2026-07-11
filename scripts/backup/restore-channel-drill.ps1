param(
  [Parameter(Mandatory=$true)][string]$Dump,
  [string]$Image = 'postgres:18.3@sha256:7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db'
)
$ErrorActionPreference='Stop'
$name="channel-restore-drill-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$password="restore-$([guid]::NewGuid().ToString('N'))"
docker run -d --name $name -e POSTGRES_PASSWORD=$password $Image | Out-Null
try {
  for($i=0;$i -lt 30;$i++){if((docker exec $name pg_isready -U postgres) -match 'accepting connections'){break};Start-Sleep 2}
  docker exec $name createdb -U postgres bank_channel | Out-Null
  docker exec $name createuser -U postgres bank_channel | Out-Null
  docker cp $Dump "${name}:/tmp/channel.dump"
  docker exec $name pg_restore --exit-on-error -U postgres -d bank_channel /tmp/channel.dump | Out-Null

  $tables=docker exec $name psql -U postgres -d bank_channel -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

  $invalidStatus=docker exec $name psql -U postgres -d bank_channel -Atc "SELECT count(*) FROM transfer WHERE status NOT IN ('CREATED','VALIDATING','RISK_REVIEW','PENDING_APPROVAL','PENDING_CORE_POSTING','PENDING_CLEARING','SETTLED','FAILED','TIMED_OUT','RETURNED','REVERSAL_PENDING','REVERSED');"

  $auditHashMissing=docker exec $name psql -U postgres -d bank_channel -Atc "SELECT count(*) FROM security_audit_event WHERE record_hash IS NULL OR record_hash='';"

  $orphanHistory=docker exec $name psql -U postgres -d bank_channel -Atc "SELECT count(*) FROM transfer_state_history h LEFT JOIN transfer t ON t.transfer_id=h.transfer_id WHERE t.transfer_id IS NULL;"

  $dupIdempotency=docker exec $name psql -U postgres -d bank_channel -Atc "SELECT count(*) - count(DISTINCT idempotency_key) FROM idempotency_record;"

  $unpublishedOutbox=docker exec $name psql -U postgres -d bank_channel -Atc "SELECT count(*) FROM transfer_outbox WHERE published_at IS NULL;"

  Write-Output "restore=PASS public_tables=$($tables.Trim())"
  Write-Output "invariant_invalid_transfer_status=$($invalidStatus.Trim())"
  Write-Output "invariant_audit_hash_missing=$($auditHashMissing.Trim())"
  Write-Output "invariant_orphan_state_history=$($orphanHistory.Trim())"
  Write-Output "invariant_duplicate_idempotency=$($dupIdempotency.Trim())"
  Write-Output "invariant_unpublished_outbox=$($unpublishedOutbox.Trim())"

  if([int]$invalidStatus.Trim() -gt 0){throw "Invariant failed: invalid transfer status found"}
  if([int]$auditHashMissing.Trim() -gt 0){throw "Invariant failed: audit record hash missing"}
  if([int]$orphanHistory.Trim() -gt 0){throw "Invariant failed: orphan state history records"}
} finally { docker rm -f $name | Out-Null }
