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
  businessAssertions=@('复兴银行运营控制台覆盖风险告警 PV-0090 至 PV-0099 和风险案件 PV-0100 至 PV-0107。','告警和案件数据来自持久化 risk_decision，并通过生成式 operations API 客户端读取。','状态筛选覆盖 ACTIVE、RESOLVED 和 UNDER_REVIEW，展开与折叠侧栏均有独立基线。','原始预览包对应编号存在错页，视觉实现以状态文件名、统一运营壳层和真实业务契约为准。','视觉数据为确定性合成数据，不包含真实个人信息或密钥。'); cases=$cases
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$utf8NoBom=New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($outputPath,($evidence|ConvertTo-Json -Depth 8),$utf8NoBom); Write-Output $outputPath
