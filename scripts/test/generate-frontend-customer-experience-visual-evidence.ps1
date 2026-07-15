param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path)
$ErrorActionPreference = 'Stop'
$snapshotRoot = Join-Path $RepositoryRoot 'tests/e2e/frontend-customer-experience/snapshots'
$outputPath = Join-Path $RepositoryRoot 'docs/evidence/frontend/customer-experience-visual-baseline.json'
$snapshots = @(Get-ChildItem -LiteralPath $snapshotRoot -Filter 'PV-*.png' | Sort-Object Name)
if ($snapshots.Count -ne 27) { throw "Expected exactly 27 customer experience snapshots, found $($snapshots.Count)." }
function Resolve-Page([int]$number) {
  if ($number -ge 39 -and $number -le 41) { return 'customer.beneficiaries' }
  if ($number -ge 42 -and $number -le 44) { return 'customer.loans' }
  if ($number -ge 45 -and $number -le 48) { return 'customer.loans.apply' }
  if ($number -ge 49 -and $number -le 51) { return 'customer.loan.detail' }
  if ($number -ge 52 -and $number -le 54) { return 'customer.documents' }
  if ($number -ge 55 -and $number -le 59) { return 'customer.messages' }
  if ($number -ge 60 -and $number -le 62) { return 'customer.profile' }
  if ($number -ge 63 -and $number -le 65) { return 'customer.security' }
  throw "Unexpected PV number: $number"
}
$cases = foreach ($snapshot in $snapshots) {
  $pv = [System.IO.Path]::GetFileNameWithoutExtension($snapshot.Name); $number = [int]$pv.Substring(3)
  [ordered]@{ pv=$pv; pageId=Resolve-Page $number; testId="customer-experience-visual.spec.ts::$pv"; baselinePath=$snapshot.FullName.Substring($RepositoryRoot.Length + 1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $snapshot.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$snapshot.Length }
}
if (@($cases.sha256 | Sort-Object -Unique).Count -ne 27) { throw 'Customer experience snapshots must have 27 unique hashes.' }
$evidence = [ordered]@{
  schemaVersion=1; evidenceType='frontend-visual-regression-baseline'; generatedAt=[DateTimeOffset]::UtcNow.ToString('o'); sourceCommit=(git -C $RepositoryRoot rev-parse HEAD).Trim(); contractVersion='customer-experience-design-1.3'; baselineVersion='customer-experience-windows-chromium-v1';
  environment=[ordered]@{ operatingSystem='Windows'; browser='Chromium'; viewport='1440x900'; locale='zh-CN'; timezone='Asia/Shanghai'; colorScheme='light'; reducedMotion=$true };
  businessAssertions=@('复兴银行客户业务页面覆盖 PV-0039 至 PV-0065 的全部 27 个逻辑状态。','贷款、文档、消息、资料和安全设置使用生成式客户 API 契约。','贷款还款计划来自客户隔离的 Fineract 读模型。','文档下载和未读消息标记已读为可执行交互。','视觉数据为确定性合成数据，不包含真实个人信息或密钥。'); cases=$cases
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$utf8NoBom=New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($outputPath,($evidence | ConvertTo-Json -Depth 8),$utf8NoBom); Write-Output $outputPath
