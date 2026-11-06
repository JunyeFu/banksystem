param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutputDirectory) { throw 'TEST_OUTPUT_ALREADY_EXISTS' }
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repository 'demo.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'DEMO_SOURCE_PARSE_FAILED' }
foreach ($functionName in @('New-LocalSecret', 'New-FineractPassword', 'Write-LocalEnvironment')) {
  $definition = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName }, $true))
  if ($definition.Count -ne 1) { throw "DEMO_FUNCTION_MISSING:$functionName" }
  . ([scriptblock]::Create($definition[0].Extent.Text))
}
function Assert-Test([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "DEMO_CREDENTIAL_ASSERT:$Message" } }
function Read-TestEnvironment([string]$File) {
  $values = @{}
  foreach ($line in [IO.File]::ReadAllLines($File)) {
    if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
  }
  return $values
}
$model = @{ name = 'synthetic-test-model'; baseUrl = 'https://example.invalid/v1'; apiKey = 'synthetic-test-key-not-real' }
$projectRoot = Join-Path $OutputDirectory 'legacy'
[IO.Directory]::CreateDirectory($projectRoot) | Out-Null
$environmentFile = Join-Path $projectRoot '.env'
[IO.File]::WriteAllLines($environmentFile, @('FINERACT_DB_PASS=synthetic-db-secret', 'EXTRA_SETTING=preserved'))
$output = @(Write-LocalEnvironment -Model $model)
$first = Read-TestEnvironment $environmentFile
Assert-Test (-not [string]::IsNullOrWhiteSpace($first.ACTIVEMQ_PASSWORD)) 'missing MQ credential was not generated'
Assert-Test ($first.ACTIVEMQ_PASSWORD -ne $first.FINERACT_DB_PASS) 'MQ reused database credential'
Assert-Test ($first.EXTRA_SETTING -eq 'preserved' -and $first.FINERACT_DB_PASS -eq 'synthetic-db-secret') 'legacy values changed'
Assert-Test (($output -join '') -notlike "*$($first.ACTIVEMQ_PASSWORD)*") 'credential leaked to output'
$before = [IO.File]::ReadAllText($environmentFile)
Write-LocalEnvironment -Model $model
Assert-Test ([IO.File]::ReadAllText($environmentFile) -eq $before) 'second prepare rotated credentials'

$projectRoot = Join-Path $OutputDirectory 'fresh'
[IO.Directory]::CreateDirectory($projectRoot) | Out-Null
$environmentFile = Join-Path $projectRoot '.env'
[IO.File]::WriteAllLines((Join-Path $projectRoot '.env.example'), @('FINERACT_DB_PASS=replace-with-local-db', 'ACTIVEMQ_PASSWORD=replace-with-local-mq'))
Write-LocalEnvironment -Model $model
$fresh = Read-TestEnvironment $environmentFile
Assert-Test ($fresh.ACTIVEMQ_PASSWORD -notmatch '^replace-with' -and $fresh.ACTIVEMQ_PASSWORD -ne $fresh.FINERACT_DB_PASS) 'fresh credentials not independently generated'

$projectRoot = Join-Path $OutputDirectory 'explicit'
[IO.Directory]::CreateDirectory($projectRoot) | Out-Null
$environmentFile = Join-Path $projectRoot '.env'
[IO.File]::WriteAllLines($environmentFile, @('ACTIVEMQ_PASSWORD=explicit-test-mq-secret'))
Write-LocalEnvironment -Model $model
Assert-Test ((Read-TestEnvironment $environmentFile).ACTIVEMQ_PASSWORD -eq 'explicit-test-mq-secret') 'explicit credential replaced'

$projectRoot = Join-Path $OutputDirectory 'empty'
[IO.Directory]::CreateDirectory($projectRoot) | Out-Null
$environmentFile = Join-Path $projectRoot '.env'
[IO.File]::WriteAllLines($environmentFile, @('ACTIVEMQ_PASSWORD='))
$before = [IO.File]::ReadAllText($environmentFile)
$rejected = $false
try { Write-LocalEnvironment -Model $model } catch {
  if ($_.Exception.Message -ne 'DEMO_MQ_PASSWORD_EMPTY') { throw }
  $rejected = $true
}
Assert-Test $rejected 'empty explicit MQ credential accepted'
Assert-Test ([IO.File]::ReadAllText($environmentFile) -eq $before) 'failed prepare changed credential file'
Write-Output 'DEMO_CREDENTIAL_TESTS=PASS cases=4 originalEnvironmentUsed=false'
