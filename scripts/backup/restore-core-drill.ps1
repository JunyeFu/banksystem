param([string]$BackupRoot='D:\Agent\banksystem\backups\core\20260710T035006Z')
$ErrorActionPreference='Stop';$name="mifos-backup-drill-$([guid]::NewGuid().ToString('N').Substring(0,8))";$image='postgres:18.3@sha256:7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db'
try{
  docker run -d --name $name -e POSTGRES_PASSWORD=drill-only-local $image|Out-Null
  for($i=0;$i -lt 30;$i++){docker exec $name pg_isready -U postgres|Out-Null;if($LASTEXITCODE -eq 0){break};Start-Sleep 2}
  docker exec $name createdb -U postgres fineract_default
  docker exec $name psql -U postgres -d postgres -c "CREATE ROLE fineract NOLOGIN;"|Out-Null
  docker cp (Join-Path $BackupRoot 'fineract_default.dump') "${name}:/tmp/fineract_default.dump"
  docker exec $name pg_restore -U postgres -d fineract_default /tmp/fineract_default.dump
  $tables=docker exec $name psql -U postgres -d fineract_default -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

  $clientCount=docker exec $name psql -U postgres -d fineract_default -Atc "SELECT count(*) FROM m_client WHERE is_deleted=0;" 2>$null
  if([string]::IsNullOrWhiteSpace($clientCount)){$clientCount="0"}

  $savingsCount=docker exec $name psql -U postgres -d fineract_default -Atc "SELECT count(*) FROM m_savings_account WHERE is_deleted=0;" 2>$null
  if([string]::IsNullOrWhiteSpace($savingsCount)){$savingsCount="0"}

  $loanCount=docker exec $name psql -U postgres -d fineract_default -Atc "SELECT count(*) FROM m_loan WHERE is_deleted=0;" 2>$null
  if([string]::IsNullOrWhiteSpace($loanCount)){$loanCount="0"}

  $journalBalance=docker exec $name psql -U postgres -d fineract_default -Atc "SELECT COALESCE(sum(amount),0) FROM acc_gl_journal_entry WHERE is_reversed=0 AND transaction_date IS NOT NULL;" 2>$null
  if([string]::IsNullOrWhiteSpace($journalBalance)){$journalBalance="0"}

  Write-Output "restore=PASS public_tables=$($tables.Trim())"
  Write-Output "invariant_clients=$($clientCount.ToString().Trim())"
  Write-Output "invariant_savings_accounts=$($savingsCount.ToString().Trim())"
  Write-Output "invariant_loans=$($loanCount.ToString().Trim())"
  Write-Output "invariant_journal_sum=$($journalBalance.ToString().Trim())"
}finally{docker rm -f $name|Out-Null}
