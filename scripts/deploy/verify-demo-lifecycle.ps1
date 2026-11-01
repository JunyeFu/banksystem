[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$entrypoint = Join-Path $projectRoot 'demo.ps1'

function Invoke-Demo {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [hashtable]$Environment = @{}
  )

  $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("banksystem-demo-stdout-{0}.txt" -f [Guid]::NewGuid().ToString('N'))
  $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("banksystem-demo-stderr-{0}.txt" -f [Guid]::NewGuid().ToString('N'))
  try {
    $processArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $entrypoint)
    $processArguments += $Arguments
    $processParameters = @{
      FilePath = 'pwsh'
      ArgumentList = $processArguments
      WorkingDirectory = $projectRoot
      Wait = $true
      PassThru = $true
      WindowStyle = 'Hidden'
      RedirectStandardOutput = $stdoutPath
      RedirectStandardError = $stderrPath
    }
    if ($Environment.Count -gt 0) { $processParameters.Environment = $Environment }
    $process = Start-Process @processParameters
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -Raw -LiteralPath $stdoutPath } else { '' }
      Stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { '' }
    }
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
  throw 'DEMO_ENTRYPOINT_MISSING'
}

$invalid = Invoke-Demo -Arguments @('__invalid__')
if ($invalid.ExitCode -ne 2) {
  throw "DEMO_INVALID_COMMAND_EXIT_MISMATCH:$($invalid.ExitCode)"
}
$invalidResult = $invalid.Stdout | ConvertFrom-Json
if ($invalidResult.errorCode -ne 'DEMO_COMMAND_INVALID') {
  throw 'DEMO_INVALID_COMMAND_RESULT_MISMATCH'
}

$status = Invoke-Demo -Arguments @('status')
if ($status.ExitCode -notin @(0, 3)) {
  throw "DEMO_STATUS_EXIT_MISMATCH:$($status.ExitCode)"
}
$statusResult = $status.Stdout | ConvertFrom-Json
if ($statusResult.schemaVersion -ne 'banksystem-demo-status/v1' -or $statusResult.command -ne 'status') {
  throw 'DEMO_STATUS_SCHEMA_MISMATCH'
}
if (@($statusResult.addresses.PSObject.Properties).Count -ne 6) {
  throw 'DEMO_STATUS_ADDRESS_COUNT_MISMATCH'
}
foreach ($name in @('fineract', 'customerPortal', 'operationsConsole', 'gateway', 'keycloak', 'qualityPortal')) {
  if (-not $statusResult.addresses.PSObject.Properties[$name]) {
    throw "DEMO_STATUS_ADDRESS_MISSING:$name"
  }
}
if (@($statusResult.runtimeComponents) -contains 'flowise') {
  throw 'DEMO_FLOWISE_RUNTIME_FORBIDDEN'
}
if ($statusResult.runtimePrerequisites.java.ready -ne $true -or [int]$statusResult.runtimePrerequisites.java.major -lt 21) {
  throw 'DEMO_STATUS_JAVA_21_NOT_SELECTED'
}

$invalidModel = Invoke-Demo -Arguments @('prepare') -Environment @{
  HENGZHUN_MODEL_NAME = 'contract-test-model'
  HENGZHUN_MODEL_BASE_URL = 'not-a-url'
  HENGZHUN_MODEL_API_KEY = 'contract-test-key'
}
if ($invalidModel.ExitCode -ne 2) {
  throw "DEMO_INVALID_MODEL_EXIT_MISMATCH:$($invalidModel.ExitCode)"
}
$invalidModelResult = $invalidModel.Stdout | ConvertFrom-Json
if ($invalidModelResult.errorCode -ne 'DEMO_MODEL_BASE_URL_INVALID') {
  throw 'DEMO_INVALID_MODEL_RESULT_MISMATCH'
}

$unavailableModel = Invoke-Demo -Arguments @('prepare') -Environment @{
  HENGZHUN_MODEL_NAME = 'contract-test-model'
  HENGZHUN_MODEL_BASE_URL = 'http://127.0.0.1:1/v1'
  HENGZHUN_MODEL_API_KEY = 'contract-test-key'
}
if ($unavailableModel.ExitCode -ne 3) {
  throw "DEMO_UNAVAILABLE_MODEL_EXIT_MISMATCH:$($unavailableModel.ExitCode)"
}
$unavailableModelResult = $unavailableModel.Stdout | ConvertFrom-Json
if ($unavailableModelResult.errorCode -ne 'DEMO_MODEL_ENDPOINT_UNAVAILABLE') {
  throw 'DEMO_UNAVAILABLE_MODEL_RESULT_MISMATCH'
}

$invalidUp = Invoke-Demo -Arguments @('up') -Environment @{
  HENGZHUN_MODEL_NAME = 'contract-test-model'
  HENGZHUN_MODEL_BASE_URL = 'not-a-url'
  HENGZHUN_MODEL_API_KEY = 'contract-test-key'
}
if ($invalidUp.ExitCode -ne 2) {
  throw "DEMO_INVALID_UP_EXIT_MISMATCH:$($invalidUp.ExitCode)"
}
$invalidUpResult = $invalidUp.Stdout | ConvertFrom-Json
if ($invalidUpResult.errorCode -ne 'DEMO_MODEL_BASE_URL_INVALID') {
  throw 'DEMO_INVALID_UP_RESULT_MISMATCH'
}

$source = Get-Content -Raw -LiteralPath $entrypoint
foreach ($required in @('/chat/completions', '-TimeoutSec 30', 'max_tokens = 8')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_MODEL_PROBE_CONTRACT_MISSING:$required" }
}
if ($source.Contains('-SkipHttpErrorCheck', [StringComparison]::Ordinal)) { throw 'DEMO_MODEL_PROBE_PS51_PARAMETER_FORBIDDEN' }
if (-not $source.Contains('-UseBasicParsing', [StringComparison]::Ordinal)) { throw 'DEMO_MODEL_PROBE_PS51_BASIC_PARSING_MISSING' }
if ($source.Contains('$IsWindows', [StringComparison]::Ordinal)) { throw 'DEMO_PS51_ISWINDOWS_AUTOMATIC_VARIABLE_FORBIDDEN' }
if (-not $source.Contains('[Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT', [StringComparison]::Ordinal)) { throw 'DEMO_WINDOWS_PLATFORM_CHECK_MISSING' }
foreach ($forbidden in @('[Security.Cryptography.SHA256]::HashData(', '[Convert]::ToHexString(', '[Security.Cryptography.RandomNumberGenerator]::Fill(')) {
  if ($source.Contains($forbidden, [StringComparison]::Ordinal)) { throw "DEMO_PS51_HASH_API_FORBIDDEN:$forbidden" }
}
foreach ($required in @('function Get-Sha256Hex', '[Security.Cryptography.SHA256]::Create()', '$algorithm.ComputeHash($Bytes)', '[BitConverter]::ToString($hashBytes)')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_PS51_HASH_IMPLEMENTATION_MISSING:$required" }
}
foreach ($required in @('[Security.Cryptography.RandomNumberGenerator]::Create()', '$generator.GetBytes($bytes)', '[BitConverter]::ToString($bytes)')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_PS51_SECRET_GENERATION_MISSING:$required" }
}
foreach ($required in @('function Invoke-JavaVersion', "`$ErrorActionPreference = 'Continue'", 'Invoke-JavaVersion -Executable $candidate', 'Invoke-JavaVersion -Executable $java')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_PS51_JAVA_VERSION_CAPTURE_MISSING:$required" }
}
if ($source.Contains('/models', [StringComparison]::Ordinal)) { throw 'DEMO_MODEL_PROBE_MODELS_ENDPOINT_FORBIDDEN' }
foreach ($forbidden in @('START.cmd', 'start-i9.ps1', 'start-i10.ps1', 'prepare-i9.ps1', 'prepare-i10.ps1')) {
  if ($source.Contains($forbidden, [StringComparison]::OrdinalIgnoreCase)) {
    throw "DEMO_FORBIDDEN_LIFECYCLE_REFERENCE:$forbidden"
  }
}
if ($source -match 'Remove-Item\s+-LiteralPath\s+\$agentData\s+-Recurse') {
  throw 'DEMO_RESET_AGENT_DATA_TREE_FORBIDDEN'
}
if (-not $source.Contains('$agentResetRelativePaths', [StringComparison]::Ordinal)) {
  throw 'DEMO_RESET_AGENT_TARGETS_NOT_EXPLICIT'
}
if (-not $source.Contains("('{0}/v{1}/{2}'", [StringComparison]::Ordinal) -or $source.Contains("('{0}v{1}/{2}'", [StringComparison]::Ordinal)) {
  throw 'DEMO_AGENT_RUNTIME_DOWNLOAD_URL_INVALID'
}
if (-not $source.Contains('DEMO_AGENT_RUNTIME_DOWNLOAD_FAILED', [StringComparison]::Ordinal)) {
  throw 'DEMO_AGENT_RUNTIME_DOWNLOAD_ERROR_CODE_MISSING'
}
foreach ($required in @('Get-PrepareFailureResult', '$result.runtimeRole = $parts[1]', '$result.runtimeExitCode = $runtimeExitCode', '$result.runtimeObservedVersion = $parts[3]', '$result.runtimeFailureType = $parts[4]', 'Get-ExecutableVersionResult', "@('services', 'cli')")) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_AGENT_RUNTIME_SAFE_CONTEXT_MISSING:$required" }
}
foreach ($required in @('function Wait-DemoReady', '[int]$TimeoutSeconds = 30', '[int]$PollMilliseconds = 500', '$status = Wait-DemoReady')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_BOUNDED_READINESS_WAIT_MISSING:$required" }
}
foreach ($required in @('scripts\deploy\ensure-fineract-credentials.ps1', 'DEMO_FINERACT_CREDENTIAL_BOOTSTRAP_FAILED')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_FINERACT_CREDENTIAL_BOOTSTRAP_MISSING:$required" }
}
$coreStartIndex = $source.IndexOf("'postgresql/docker-compose.isolated.yml', 'up', '-d', '--wait', '--no-build'", [StringComparison]::Ordinal)
$credentialBootstrapIndex = $source.IndexOf('scripts\deploy\ensure-fineract-credentials.ps1', [StringComparison]::Ordinal)
$channelStartIndex = $source.IndexOf("'compose.channel.yaml', 'up', '-d', '--wait', '--no-build'", [StringComparison]::Ordinal)
if ($coreStartIndex -lt 0 -or $credentialBootstrapIndex -le $coreStartIndex -or $channelStartIndex -le $credentialBootstrapIndex) {
  throw 'DEMO_FINERACT_CREDENTIAL_BOOTSTRAP_ORDER_INVALID'
}
if ($source -notmatch '(?s)function Wait-DemoReady\s*\{(?<readinessBody>.*?)\r?\n\}\r?\n\r?\nfunction Get-ModelConfiguration') {
  throw 'DEMO_BOUNDED_READINESS_WAIT_CONTRACT_MISMATCH'
}
$readinessBody = $Matches['readinessBody']
foreach ($required in @('Get-DemoStatus', '$stopwatch.Elapsed.TotalSeconds -ge $TimeoutSeconds', 'Start-Sleep -Milliseconds $PollMilliseconds', 'return $status')) {
  if (-not $readinessBody.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_BOUNDED_READINESS_WAIT_CONTRACT_MISMATCH:$required" }
}
if ($readinessBody.Contains('Invoke-AgentLifecycle', [StringComparison]::Ordinal)) {
  throw 'DEMO_BOUNDED_READINESS_WAIT_RESTART_FORBIDDEN'
}
if (-not $source.Contains("Replace('/', [IO.Path]::DirectorySeparatorChar)", [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_PATH_NORMALIZATION_MISSING' }
foreach ($required in @("Test-CommandAvailable -Name 'tar.exe'", 'tar.exe -xf $archive -C $staging', 'DEMO_AGENT_RUNTIME_ARCHIVE_EXTRACT_FAILED')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_AGENT_RUNTIME_EXTRACTOR_CONTRACT_MISSING:$required" }
}
if ($source.Contains('Expand-Archive', [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_LEGACY_EXTRACTOR_PRESENT' }
foreach ($required in @("Test-CommandAvailable -Name 'curl.exe'", 'curl.exe --fail --location --silent --show-error --max-time 120 --output $archive $url')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_AGENT_RUNTIME_DOWNLOADER_CONTRACT_MISSING:$required" }
}
foreach ($required in @("Write-PrepareProgress -Phase 'AGENT_DEPENDENCIES'", "@('ci', '--no-audit', '--no-fund')", 'DEMO_AGENT_DEPENDENCY_INSTALL_FAILED', "Write-PrepareProgress -Phase 'AGENT_BUILD'", "@('run', 'generate:dist')", 'DEMO_AGENT_BUILD_FAILED')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_AGENT_BUILD_CONTRACT_MISSING:$required" }
}
foreach ($required in @('$originalPath = $env:PATH', '$env:PATH = (Split-Path -Parent $agentNpm) + [IO.Path]::PathSeparator + $originalPath', '$env:PATH = $originalPath')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_AGENT_NODE_PATH_CONTRACT_MISSING:$required" }
}
$managedSpecPath = Join-Path $projectRoot 'platform\hengzhun-regression-system\agent-cli\managed-process-spec-v1.json'
$managedSpec = Get-Content -Raw -LiteralPath $managedSpecPath | ConvertFrom-Json
$expectedAgentRuntime = [ordered]@{
  sessionRoot = '.data/sessions'
  harnessUrl = 'http://127.0.0.1:18788'
  mcpUrl = 'http://127.0.0.1:18789/mcp'
  namespace = 'hengzhun-local'
}
if (($managedSpec.runtime | ConvertTo-Json -Compress) -ne ($expectedAgentRuntime | ConvertTo-Json -Compress)) {
  throw 'DEMO_AGENT_RUNTIME_CONFIG_CONTRACT_MISMATCH'
}
foreach ($required in @('Get-AgentRuntimeContract', "`$existing['HENGZHUN_AGENT_SESSION_ROOT']", "`$existing['HENGZHUN_HARNESS_URL']", "`$existing['HENGZHUN_MCP_URL']", "`$existing['HENGZHUN_AGENT_NAMESPACE']")) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_AGENT_RUNTIME_CONFIG_WRITE_MISSING:$required" }
}
if ($source.Contains('Invoke-WebRequest -Uri $url -OutFile $archive', [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_LEGACY_DOWNLOADER_PRESENT' }
if (-not $source.Contains('DEMO_AGENT_RUNTIME_ARCHIVE_LAYOUT_INVALID', [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_LAYOUT_ERROR_CODE_MISSING' }
if ($source.Contains("Join-Path `$sourceDirectory 'node.exe'", [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_PREMOVE_NODE_CHECK_FORBIDDEN' }
if ($source.Contains("`$process.StartInfo.ArgumentList.Add('--version')", [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_PS51_ARGUMENT_LIST_FORBIDDEN' }
if (-not $source.Contains("`$process.StartInfo.Arguments = '--version'", [StringComparison]::Ordinal)) { throw 'DEMO_AGENT_RUNTIME_VERSION_ARGUMENT_MISSING' }
foreach ($required in @('function Invoke-CheckedCommand', "`$ErrorActionPreference = 'Continue'", '$commandExitCode = $LASTEXITCODE', 'if ($commandExitCode -ne 0)')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_PS51_NATIVE_COMMAND_CAPTURE_MISSING:$required" }
}
foreach ($required in @('banksystem-demo-prepare-progress/v1', "Write-PrepareProgress -Phase 'BROWSER_RUNTIME'", "Write-PrepareProgress -Phase 'CHANNEL_IMAGES'")) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_PREPARE_PROGRESS_CONTRACT_MISSING:$required" }
}
if ($source.Contains('[IO.File]::Move($temporary, $prepareProgressFile, $true)', [StringComparison]::Ordinal)) { throw 'DEMO_PREPARE_PROGRESS_PS51_MOVE_OVERLOAD_FORBIDDEN' }
if ($source.Contains('[IO.File]::Replace($temporary, $prepareProgressFile, $null)', [StringComparison]::Ordinal)) { throw 'DEMO_PREPARE_PROGRESS_PS51_NULL_BACKUP_FORBIDDEN' }
foreach ($required in @("`$backup = `$prepareProgressFile + '.bak-'", '[IO.File]::Replace($temporary, $prepareProgressFile, $backup)', 'Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue', '[IO.File]::Move($temporary, $prepareProgressFile)')) {
  if (-not $source.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_PREPARE_PROGRESS_ATOMIC_REPLACE_MISSING:$required" }
}
$goldenRunner = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'scripts\demo\run-golden-path.ps1')
foreach ($required in @('/fixtures:seed', '/identities:link', '/customer-scenario:seed', '/confirm', '/api/operations/v1/transfers?query=', '/assertions/accounting-projection/', "status = 'COMPLETED'")) {
  if (-not $goldenRunner.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_GOLDEN_PATH_CONTRACT_MISSING:$required" }
}
foreach ($forbidden in @('docker exec', 'psql ', 'DELETE FROM transfer_order', 'accounttransfers')) {
  if ($goldenRunner.Contains($forbidden, [StringComparison]::OrdinalIgnoreCase)) { throw "DEMO_GOLDEN_PATH_FORBIDDEN_OPERATION:$forbidden" }
}
$postgresInit = [IO.File]::ReadAllBytes((Join-Path $projectRoot 'postgresql\01-init-unix.sh'))
for ($index = 0; $index -lt $postgresInit.Length - 1; $index++) {
  if ($postgresInit[$index] -eq 13 -and $postgresInit[$index + 1] -eq 10) {
    throw 'DEMO_POSTGRES_INIT_REQUIRES_LF'
  }
}
$attributes = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.gitattributes')
if ($attributes -notmatch '(?m)^\*\.sh\s+text\s+eol=lf\s*$') {
  throw 'DEMO_SHELL_GIT_ATTRIBUTE_REQUIRES_LF'
}
$coldVerifier = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'scripts\deploy\verify-demo-cold-start.ps1')
foreach ($required in @('Start-Process', 'RedirectStandardOutput', 'Wait-Process -Id $process.Id -Timeout 600')) {
  if (-not $coldVerifier.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_COLD_PROCESS_WAIT_CONTRACT_MISSING:$required" }
}
if ($coldVerifier -match '\$output\s*=\s*&\s*pwsh') { throw 'DEMO_COLD_PIPE_CAPTURE_FORBIDDEN' }

$coreCompose = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'postgresql\docker-compose.isolated.yml')
$channelCompose = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'compose.channel.yaml')
$channelApplication = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'services\bank-channel-service\src\main\resources\application.yml')
if ($coreCompose -notmatch '(?m)^name:\s+\$\{HENGZHUN_CORE_COMPOSE_PROJECT:-mifos-isolated\}\s*$') { throw 'DEMO_CORE_PROJECT_ISOLATION_CONTRACT_MISSING' }
if ($coreCompose -notmatch '(?s)fineract-server:.*?healthcheck:.*?wget -q -O /dev/null http://127\.0\.0\.1:8080/fineract-provider/actuator/health') {
  throw 'DEMO_FINERACT_HEALTHCHECK_MISSING'
}
if ($channelCompose -notmatch '(?m)^name:\s+\$\{HENGZHUN_CHANNEL_COMPOSE_PROJECT:-mifos-channel\}\s*$') { throw 'DEMO_CHANNEL_PROJECT_ISOLATION_CONTRACT_MISSING' }
if (-not $channelApplication.Contains('${ACTIVEMQ_BROKER_URL:tcp://activemq:61616}', [StringComparison]::Ordinal) -or $channelApplication.Contains('tcp://mifos-isolated-activemq-1:61616', [StringComparison]::Ordinal)) { throw 'DEMO_CHANNEL_BROKER_SERVICE_ALIAS_MISSING' }
$cleanCloneVerifier = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'scripts\deploy\verify-demo-clean-clone.ps1')
foreach ($required in @('core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard', 'git', 'clone', '--no-hardlinks', 'HENGZHUN_CORE_COMPOSE_PROJECT', 'HENGZHUN_CHANNEL_COMPOSE_PROJECT', 'originalStatePreserved')) {
  if (-not $cleanCloneVerifier.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_CLEAN_CLONE_CONTRACT_MISSING:$required" }
}
if ($cleanCloneVerifier -match 'Copy-Item\s+-LiteralPath\s+\$sourceEnvironment') { throw 'DEMO_CLEAN_CLONE_CREDENTIAL_COPY_FORBIDDEN' }
foreach ($required in @('Capture-PrepareProgress', 'prepare-progress.json', 'prepareLastPhase')) {
  if (-not $cleanCloneVerifier.Contains($required, [StringComparison]::Ordinal)) { throw "DEMO_CLEAN_CLONE_PROGRESS_EVIDENCE_MISSING:$required" }
}

Write-Output 'DEMO_LIFECYCLE_CONTRACT=PASS invalid_exit=2 invalid_model_exit=2 unavailable_model_exit=3 invalid_up_exit=2 status_schema=v1 addresses=6 flowise_runtime=0 reset_scope=explicit postgres_init_lf=1 clean_clone_isolation=1 runtime_error_context=1 runtime_downloader=curl_120s runtime_extractor=tar runtime_final_check=node_version prepare_progress=v1 golden_path=api_only'
