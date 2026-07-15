param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
)

$ErrorActionPreference = 'Stop'
$snapshotRoot = Join-Path $RepositoryRoot 'tests/e2e/frontend-transfer/snapshots'
$outputPath = Join-Path $RepositoryRoot 'docs/evidence/frontend/transfer-five-page-visual-baseline.json'
$snapshots = @(Get-ChildItem -LiteralPath $snapshotRoot -Filter 'PV-*.png' | Sort-Object Name)
if ($snapshots.Count -ne 36) {
  throw "Expected exactly 36 transfer visual snapshots, found $($snapshots.Count)."
}

function Resolve-Page([int]$number) {
  if ($number -ge 21 -and $number -le 27) { return 'customer.transfer.list' }
  if ($number -ge 28 -and $number -le 34) { return 'customer.transfer.create' }
  if ($number -ge 35 -and $number -le 38) { return 'customer.transfer.result' }
  if ($number -ge 72 -and $number -le 83) { return 'operations.payment.monitoring' }
  if ($number -ge 84 -and $number -le 89) { return 'operations.payment.detail' }
  throw "Unexpected PV number: $number"
}

$cases = foreach ($snapshot in $snapshots) {
  $pv = [System.IO.Path]::GetFileNameWithoutExtension($snapshot.Name)
  $number = [int]$pv.Substring(3)
  [ordered]@{
    pv = $pv
    pageId = Resolve-Page $number
    testId = "transfer-visual.spec.ts::$pv"
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
  contractVersion = 'transfer-five-page-design-1.2'
  baselineVersion = 'transfer-five-page-windows-chromium-v1'
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
    'Customer transfer list, creation and result states are contract-backed.',
    'Operations monitoring filters, aggregate summary, CSV export and detail navigation are executable.',
    'Settled customer transfers expose a subject-scoped PDF receipt action.',
    'Outbox evidence exposes safe metadata only.',
    'All 36 PV states use deterministic synthetic data and no secrets or real PII.'
  )
  cases = $cases
}

$directory = Split-Path -Parent $outputPath
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$json = $evidence | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Output $outputPath
