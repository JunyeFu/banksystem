param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path)
$ErrorActionPreference = 'Stop'
$snapshotRoot = Join-Path $RepositoryRoot 'tests/e2e/frontend-operations-dashboard/snapshots'
$outputPath = Join-Path $RepositoryRoot 'docs/evidence/frontend/operations-dashboard-visual-baseline.json'
$snapshots = @(Get-ChildItem -LiteralPath $snapshotRoot -Filter 'PV-*.png' | Sort-Object Name)
if ($snapshots.Count -ne 8) { throw "Expected exactly 8 operations dashboard snapshots, found $($snapshots.Count)." }
$cases = foreach ($snapshot in $snapshots) {
  $pv = [System.IO.Path]::GetFileNameWithoutExtension($snapshot.Name)
  [ordered]@{ pv=$pv; pageId='operations.dashboard'; testId="operations-dashboard-visual.spec.ts::$pv"; baselinePath=$snapshot.FullName.Substring($RepositoryRoot.Length + 1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $snapshot.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$snapshot.Length }
}
if (@($cases.sha256 | Sort-Object -Unique).Count -lt 6) { throw 'Operations dashboard snapshots must contain at least six distinct visual states.' }
$evidence = [ordered]@{
  schemaVersion=1; evidenceType='frontend-visual-regression-baseline'; generatedAt=[DateTimeOffset]::UtcNow.ToString('o'); sourceCommit=(git -C $RepositoryRoot rev-parse HEAD).Trim(); contractVersion='operations-dashboard-design-1.0'; baselineVersion='operations-dashboard-windows-chromium-v1';
  environment=[ordered]@{ operatingSystem='Windows'; browser='Chromium'; viewport='1440x900'; locale='zh-CN'; timezone='Asia/Shanghai'; colorScheme='light'; reducedMotion=$true };
  businessAssertions=@('复兴银行运营控制台覆盖展开与折叠壳层、加载、正常和接口错误状态。','仪表盘使用生成式 operations API 客户端读取真实聚合端点。','错误状态提供可执行重试，并经浏览器测试验证可恢复。','视觉数据为确定性合成数据，不包含真实个人信息或密钥。'); cases=$cases
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$utf8NoBom=New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($outputPath,($evidence | ConvertTo-Json -Depth 8),$utf8NoBom); Write-Output $outputPath
