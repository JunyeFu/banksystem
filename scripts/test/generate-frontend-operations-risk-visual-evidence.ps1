param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path)
$ErrorActionPreference = 'Stop'
$snapshotRoot = Join-Path $RepositoryRoot 'tests/e2e/frontend-operations-risk/snapshots'
$outputPath = Join-Path $RepositoryRoot 'docs/evidence/frontend/operations-risk-visual-baseline.json'
$snapshots = @(Get-ChildItem -LiteralPath $snapshotRoot -Filter 'PV-*.png' | Sort-Object Name)
if ($snapshots.Count -ne 18) { throw "Expected exactly 18 operations risk snapshots, found $($snapshots.Count)." }
$cases = foreach ($snapshot in $snapshots) {
  $pv=[System.IO.Path]::GetFileNameWithoutExtension($snapshot.Name); $number=[int]$pv.Substring(3)
  [ordered]@{ pv=$pv; pageId=if($number -le 99){'operations.risk.alerts'}else{'operations.risk.cases'}; testId="operations-risk-visual.spec.ts::$pv"; baselinePath=$snapshot.FullName.Substring($RepositoryRoot.Length+1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $snapshot.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$snapshot.Length }
}
if (@($cases.sha256 | Sort-Object -Unique).Count -ne 18) { throw 'Operations risk snapshots must have 18 unique hashes.' }
$evidence=[ordered]@{
  schemaVersion=1; evidenceType='frontend-visual-regression-baseline'; generatedAt=[DateTimeOffset]::UtcNow.ToString('o'); sourceCommit=(git -C $RepositoryRoot rev-parse HEAD).Trim(); contractVersion='operations-risk-design-1.0'; baselineVersion='operations-risk-windows-chromium-v1';
  environment=[ordered]@{ operatingSystem='Windows'; browser='Chromium'; viewport='1440x900'; locale='zh-CN'; timezone='Asia/Shanghai'; colorScheme='light'; reducedMotion=$true };
  businessAssertions=@('Fuxing Bank operations console covers risk alerts PV-0090 through PV-0099 and risk cases PV-0100 through PV-0107.','Alert and case data comes from persistent risk_decision records through the generated operations API client.','Status filters cover ACTIVE, RESOLVED, and UNDER_REVIEW with independent expanded and collapsed shell baselines.','The source preview package contains mislabeled pages, so state filenames, the accepted operations shell, and the formal business contract are authoritative.','Visual fixtures are deterministic synthetic data and contain no real personal data or secrets.'); cases=$cases
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$utf8NoBom=New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($outputPath,($evidence|ConvertTo-Json -Depth 8),$utf8NoBom); Write-Output $outputPath
