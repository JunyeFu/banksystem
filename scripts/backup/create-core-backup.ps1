param(
  [string]$ProjectRoot = 'D:\Agent\banksystem',
  [string]$Container = 'mifos-isolated-postgresql-1'
)

$ErrorActionPreference = 'Stop'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupRoot = Join-Path $ProjectRoot "backups/core/$stamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$items = @()
foreach ($database in @('fineract_tenants', 'fineract_default')) {
  $inside = "/tmp/$database-$stamp.dump"
  $outside = Join-Path $backupRoot "$database.dump"
  docker exec $Container pg_dump -U postgres -Fc -d $database -f $inside
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $database" }
  docker exec $Container pg_restore -l $inside | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pg_restore validation failed for $database" }
  docker cp "${Container}:$inside" $outside
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed for $database" }
  docker exec $Container rm -f $inside
  $hash = (Get-FileHash -LiteralPath $outside -Algorithm SHA256).Hash
  $items += [pscustomobject]@{ database = $database; file = $outside; bytes = (Get-Item -LiteralPath $outside).Length; sha256 = $hash; format = 'pg_dump custom (-Fc)' }
}
$manifest = [pscustomobject]@{ createdAtUtc = (Get-Date).ToUniversalTime().ToString('o'); container = $Container; items = $items }
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupRoot 'manifest.json') -Encoding utf8NoBOM
$manifest | ConvertTo-Json -Depth 4
