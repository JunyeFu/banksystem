param(
  [string]$Container = 'mifos-channel-bank-channel-postgres-1',
  [string]$User = 'bank_channel',
  [string]$Database = 'bank_channel',
  [string]$OutputRoot = (Join-Path $PSScriptRoot '..\..\backups\channel')
)
$ErrorActionPreference='Stop'
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$dir=Join-Path $OutputRoot $stamp
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dump=Join-Path $dir "$Database.dump"
$remote="/tmp/$Database-$stamp.dump"
docker exec $Container pg_dump -U $User -Fc -d $Database -f $remote
docker cp "${Container}:$remote" $dump | Out-Null
docker exec $Container rm -f $remote | Out-Null
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLowerInvariant()
"backup=$dump"
"sha256=$hash"
