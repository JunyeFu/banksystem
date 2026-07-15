param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
)

$ErrorActionPreference = 'Stop'
$snapshotRoot = Join-Path $RepositoryRoot 'tests/e2e/frontend-customer-core/snapshots'
$outputPath = Join-Path $RepositoryRoot 'docs/evidence/frontend/customer-core-visual-baseline.json'
$snapshots = @(Get-ChildItem -LiteralPath $snapshotRoot -Filter 'PV-*.png' | Sort-Object Name)
if ($snapshots.Count -ne 17) {
  throw "Expected exactly 17 customer core visual snapshots, found $($snapshots.Count)."
}

function Resolve-Page([int]$number) {
  if ($number -eq 1) { return 'customer.login.shell' }
  if ($number -eq 2) { return 'customer.authenticated.shell' }
  if ($number -ge 6 -and $number -le 8) { return 'customer.login' }
  if ($number -ge 9 -and $number -le 12) { return 'customer.dashboard' }
  if ($number -ge 13 -and $number -le 16) { return 'customer.account.list' }
  if ($number -ge 17 -and $number -le 20) { return 'customer.account.detail' }
  throw "Unexpected PV number: $number"
}

$cases = foreach ($snapshot in $snapshots) {
  $pv = [System.IO.Path]::GetFileNameWithoutExtension($snapshot.Name)
  $number = [int]$pv.Substring(3)
  [ordered]@{
    pv = $pv
    pageId = Resolve-Page $number
    testId = "customer-core-visual.spec.ts::$pv"
    baselinePath = $snapshot.FullName.Substring($RepositoryRoot.Length + 1).Replace('\', '/')
    sha256 = (Get-FileHash -LiteralPath $snapshot.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    bytes = $snapshot.Length
  }
}

$evidence = [ordered]@{
  schemaVersion = 1
  evidenceType = 'frontend-visual-regression-baseline'
  generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
  sourceCommit = (git -C $RepositoryRoot rev-parse HEAD).Trim()
  contractVersion = 'customer-core-design-1.2'
  baselineVersion = 'customer-core-windows-chromium-v1'
  environment = [ordered]@{
    operatingSystem = 'Windows'
    browser = 'Chromium'
    viewport = '1440x900'
    locale = 'zh-CN'
    timezone = 'Asia/Shanghai'
    colorScheme = 'light'
    reducedMotion = $true
  }
  businessAssertions = @(
    '复兴银行客户登录、首页、账户列表和账户详情状态可执行。',
    'Account summaries and account details are supplied through generated customer API contracts.',
    'Account ownership is checked before savings account details and transactions are returned.',
    'Statement download, transfer prefill and customer navigation actions are executable.',
    'All 17 PV states use deterministic synthetic data and no secrets or real PII.'
  )
  cases = $cases
}

$directory = Split-Path -Parent $outputPath
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$json = $evidence | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Output $outputPath
