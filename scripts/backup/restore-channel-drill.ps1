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
  "restore=PASS public_tables=$($tables.Trim())"
} finally { docker rm -f $name | Out-Null }
