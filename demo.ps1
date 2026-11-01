[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Command
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$agentRoot = Join-Path $projectRoot 'platform\hengzhun-regression-system'
$environmentFile = Join-Path $projectRoot '.env'
$agentRuntimeFile = Join-Path $agentRoot '.data\runtime.env'
$prepareProgressFile = Join-Path $agentRoot '.data\runtime\demo-prepare-progress.json'
$agentResetRelativePaths = @(
  'runtime.env',
  'runtime',
  'sqlite',
  'artifacts',
  'candidates',
  'stability',
  'midscene-runs',
  'image-ingest',
  'video-ingest',
  'logs'
)

$addresses = [ordered]@{
  fineract = 'http://127.0.0.1:13000/fineract-provider'
  customerPortal = 'http://127.0.0.1:18082/portal/'
  operationsConsole = 'http://127.0.0.1:18083/ops/'
  gateway = 'http://127.0.0.1:18443'
  keycloak = 'http://127.0.0.1:19000'
  qualityPortal = 'http://127.0.0.1:18788/quality/'
}

function Write-JsonResult {
  param([Parameter(Mandatory = $true)]$Value)
  $Value | ConvertTo-Json -Depth 10 -Compress | Write-Output
}

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($Bytes)
  } finally {
    $algorithm.Dispose()
  }
  return ([BitConverter]::ToString($hashBytes) -replace '-', '').ToLowerInvariant()
}

function Write-PrepareProgress {
  param([Parameter(Mandatory = $true)][string]$Phase)

  $directory = Split-Path -Parent $prepareProgressFile
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $record = [ordered]@{ schemaVersion = 'banksystem-demo-prepare-progress/v1'; phase = $Phase; observedAt = [DateTimeOffset]::UtcNow.ToString('O') }
  $temporary = $prepareProgressFile + '.tmp'
  [IO.File]::WriteAllText($temporary, ($record | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
  if ([IO.File]::Exists($prepareProgressFile)) {
    $backup = $prepareProgressFile + '.bak-' + [Guid]::NewGuid().ToString('N')
    try {
      [IO.File]::Replace($temporary, $prepareProgressFile, $backup)
    } finally {
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
  } else {
    [IO.File]::Move($temporary, $prepareProgressFile)
  }
}

function Get-PrepareFailureResult {
  param([Parameter(Mandatory = $true)][string]$Message)

  $parts = $Message.Split(':', 5)
  $result = [ordered]@{ status = 'FAILED'; errorCode = $parts[0]; command = 'prepare' }
  if ($parts.Count -ge 2 -and $parts[0].StartsWith('DEMO_AGENT_RUNTIME_', [StringComparison]::Ordinal) -and $parts[1] -in @('services', 'cli')) {
    $result.runtimeRole = $parts[1]
  }
  if ($parts.Count -ge 4 -and $parts[0] -eq 'DEMO_AGENT_RUNTIME_VERSION_MISMATCH') {
    $runtimeExitCode = 0
    if ([int]::TryParse($parts[2], [ref]$runtimeExitCode)) { $result.runtimeExitCode = $runtimeExitCode }
    $result.runtimeObservedVersion = $parts[3]
    if ($parts.Count -ge 5) { $result.runtimeFailureType = $parts[4] }
  }
  return $result
}

function Get-ConfiguredValues {
  param([string[]]$Paths)

  $values = @{}
  foreach ($path in $Paths) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    foreach ($line in Get-Content -LiteralPath $path) {
      if ($line -match '^([A-Z][A-Z0-9_]+)=(.*)$' -and -not $values.ContainsKey($Matches[1])) {
        $values[$Matches[1]] = $Matches[2]
      }
    }
  }
  return $values
}

function Get-RunningServices {
  param(
    [Parameter(Mandatory = $true)][string]$ComposeFile,
    [Parameter(Mandatory = $true)][string]$EnvFile
  )

  $output = & docker compose --env-file $EnvFile -f $ComposeFile ps --services --filter status=running 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  return @($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Get-AgentStatus {
  $node = Join-Path $agentRoot 'runtime\node-v24.19.0-win-x64\node.exe'
  $currentStatus = Join-Path $agentRoot 'scripts\i10-agent-current-status.cjs'
  if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $currentStatus -PathType Leaf)) {
    return [ordered]@{ status = 'NOT_PREPARED'; healthy = $false; services = @() }
  }

  $output = & $node $currentStatus 2>$null
  if ([string]::IsNullOrWhiteSpace(($output -join ''))) {
    return [ordered]@{ status = 'NOT_RUNNING'; healthy = $false; services = @() }
  }
  try { return ($output -join "`n") | ConvertFrom-Json }
  catch { return [ordered]@{ status = 'INVALID'; healthy = $false; services = @() } }
}

function Get-DemoStatus {
  $dockerVersion = & docker version --format '{{.Server.Version}}' 2>$null
  $dockerReady = $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($dockerVersion -join ''))
  $composeEnvironment = if (Test-Path -LiteralPath $environmentFile -PathType Leaf) { $environmentFile } else { Join-Path $projectRoot '.env.example' }
  $coreRunning = if ($dockerReady) { Get-RunningServices -ComposeFile (Join-Path $projectRoot 'postgresql\docker-compose.isolated.yml') -EnvFile $composeEnvironment } else { @() }
  $channelRunning = if ($dockerReady) { Get-RunningServices -ComposeFile (Join-Path $projectRoot 'compose.channel.yaml') -EnvFile $composeEnvironment } else { @() }
  $agent = Get-AgentStatus
  $configured = Get-ConfiguredValues -Paths @($agentRuntimeFile, $environmentFile)

  $modelName = if ($env:HENGZHUN_MODEL_NAME) { $env:HENGZHUN_MODEL_NAME } else { $configured['HENGZHUN_MODEL_NAME'] }
  $modelBaseUrl = if ($env:HENGZHUN_MODEL_BASE_URL) { $env:HENGZHUN_MODEL_BASE_URL } else { $configured['HENGZHUN_MODEL_BASE_URL'] }
  $modelKey = if ($env:HENGZHUN_MODEL_API_KEY) { $env:HENGZHUN_MODEL_API_KEY } else { $configured['HENGZHUN_MODEL_API_KEY'] }
  $modelBound = -not [string]::IsNullOrWhiteSpace($modelName) -and -not [string]::IsNullOrWhiteSpace($modelBaseUrl) -and -not [string]::IsNullOrWhiteSpace($modelKey)
  $baseUrlHash = $null
  if (-not [string]::IsNullOrWhiteSpace($modelBaseUrl)) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($modelBaseUrl)
    $baseUrlHash = Get-Sha256Hex -Bytes $bytes
  }

  $identityHash = $agent.releaseIdentity.hash
  if ([string]::IsNullOrWhiteSpace($identityHash)) { $identityHash = $configured['HENGZHUN_AUTHORIZE_AGENT_LIVE'] }

  $coreExpected = @('postgresql', 'activemq', 'fineract-server')
  $channelExpected = @('bank-channel-postgres', 'keycloak', 'bank-channel-service', 'test-support-service', 'customer-portal', 'operations-console', 'gateway', 'prometheus', 'grafana', 'loki', 'otel-collector')
  $bankReady = @($coreExpected | Where-Object { $_ -notin $coreRunning }).Count -eq 0 -and @($channelExpected | Where-Object { $_ -notin $channelRunning }).Count -eq 0
  $ready = $dockerReady -and $bankReady -and $agent.healthy -eq $true
  $javaMajor = Get-JavaMajorVersion

  return [ordered]@{
    schemaVersion = 'banksystem-demo-status/v1'
    command = 'status'
    status = if ($ready) { 'READY' } else { 'NOT_READY' }
    docker = [ordered]@{ ready = $dockerReady; version = if ($dockerReady) { ($dockerVersion -join '').Trim() } else { $null } }
    bank = [ordered]@{
      ready = $bankReady
      core = [ordered]@{ running = @($coreRunning); expected = $coreExpected }
      channel = [ordered]@{ running = @($channelRunning); expected = $channelExpected }
    }
    agent = $agent
    releaseIdentity = [ordered]@{ status = if ($identityHash) { 'FROZEN' } else { 'UNAVAILABLE' }; hash = $identityHash }
    modelBinding = [ordered]@{ status = if ($modelBound) { 'BOUND' } else { 'UNBOUND' }; name = $modelName; baseUrlHash = $baseUrlHash }
    runtimePrerequisites = [ordered]@{ java = [ordered]@{ ready = $null -ne $javaMajor -and $javaMajor -ge 21; major = $javaMajor } }
    addresses = $addresses
    runtimeComponents = @('fineract', 'keycloak', 'gateway', 'bankChannel', 'customerPortal', 'operationsConsole', 'harness', 'mcp', 'worker')
  }
}

function Wait-DemoReady {
  param(
    [int]$TimeoutSeconds = 30,
    [int]$PollMilliseconds = 500
  )

  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    $status = Get-DemoStatus
    if ($status.status -eq 'READY' -or $stopwatch.Elapsed.TotalSeconds -ge $TimeoutSeconds) {
      return $status
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
}

function Get-ModelConfiguration {
  $configured = Get-ConfiguredValues -Paths @($environmentFile, $agentRuntimeFile)
  $name = if (-not [string]::IsNullOrWhiteSpace($env:HENGZHUN_MODEL_NAME)) { $env:HENGZHUN_MODEL_NAME.Trim() } else { [string]$configured['HENGZHUN_MODEL_NAME'] }
  $baseUrl = if (-not [string]::IsNullOrWhiteSpace($env:HENGZHUN_MODEL_BASE_URL)) { $env:HENGZHUN_MODEL_BASE_URL.Trim() } else { [string]$configured['HENGZHUN_MODEL_BASE_URL'] }
  $apiKey = if (-not [string]::IsNullOrWhiteSpace($env:HENGZHUN_MODEL_API_KEY)) { $env:HENGZHUN_MODEL_API_KEY } else { [string]$configured['HENGZHUN_MODEL_API_KEY'] }

  if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($apiKey)) {
    return [ordered]@{ valid = $false; errorCode = 'DEMO_MODEL_CONFIG_REQUIRED' }
  }
  $uri = $null
  if (-not [Uri]::TryCreate($baseUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http', 'https')) {
    return [ordered]@{ valid = $false; errorCode = 'DEMO_MODEL_BASE_URL_INVALID' }
  }
  return [ordered]@{ valid = $true; name = $name; baseUrl = $uri.AbsoluteUri.TrimEnd('/'); apiKey = $apiKey }
}

function Test-ModelEndpoint {
  param([Parameter(Mandatory = $true)]$Model)

  try {
    $body = @{
      model = $Model.name
      temperature = 0
      max_tokens = 8
      stream = $false
      messages = @(@{ role = 'user'; content = 'Reply READY.' })
    } | ConvertTo-Json -Depth 4 -Compress
    $response = Invoke-WebRequest -Method Post -Uri ("{0}/chat/completions" -f $Model.baseUrl) `
      -Headers @{ Authorization = "Bearer $($Model.apiKey)" } -ContentType 'application/json' -Body $body `
      -TimeoutSec 30 -UseBasicParsing
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) { return $false }
    $value = $response.Content | ConvertFrom-Json
    return @($value.choices).Count -gt 0
  } catch {
    return $false
  }
}

function New-LocalSecret {
  $bytes = [byte[]]::new(32)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function New-FineractPassword {
  return "Ba1!$(New-LocalSecret)"
}

function Write-LocalEnvironment {
  param([Parameter(Mandatory = $true)]$Model)

  $source = if (Test-Path -LiteralPath $environmentFile -PathType Leaf) { Get-Content -LiteralPath $environmentFile } else { Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') }
  $modelValues = @{ HENGZHUN_MODEL_NAME = $Model.name; HENGZHUN_MODEL_BASE_URL = $Model.baseUrl; HENGZHUN_MODEL_API_KEY = $Model.apiKey }
  $result = New-Object 'System.Collections.Generic.List[string]'
  $present = @{}
  $changed = $false
  foreach ($line in $source) {
    if ($line -notmatch '^([A-Z][A-Z0-9_]+)=(.*)$') {
      $result.Add($line)
      continue
    }
    $name = $Matches[1]
    $value = $Matches[2]
    $present[$name] = $true
    if ($modelValues.ContainsKey($name)) {
      if (-not [string]::IsNullOrWhiteSpace($value) -and $value -ne $modelValues[$name]) { throw "DEMO_MODEL_CONFIG_CONFLICT:$name" }
      $next = $modelValues[$name]
      $changed = $changed -or $value -ne $next
      $result.Add("$name=$next")
      continue
    }
    if ($value -match '^replace-with') {
      $generated = if ($name -eq 'FINERACT_ADMIN_PASSWORD') { New-FineractPassword } else { New-LocalSecret }
      $result.Add("$name=$generated")
      $changed = $true
      continue
    }
    $result.Add($line)
  }
  foreach ($name in @('HENGZHUN_MODEL_NAME', 'HENGZHUN_MODEL_BASE_URL', 'HENGZHUN_MODEL_API_KEY')) {
    if (-not $present.ContainsKey($name)) {
      $result.Add("$name=$($modelValues[$name])")
      $changed = $true
    }
  }
  $identityValues = @{
    DEMO_CUSTOMER_USERNAME = 'demo-customer'
    DEMO_OPERATOR_USERNAME = 'demo-operator'
  }
  foreach ($name in @('DEMO_CUSTOMER_USERNAME', 'DEMO_OPERATOR_USERNAME')) {
    if (-not $present.ContainsKey($name)) {
      $result.Add("$name=$($identityValues[$name])")
      $changed = $true
    }
  }
  foreach ($name in @('DEMO_CUSTOMER_PASSWORD', 'DEMO_OPERATOR_PASSWORD')) {
    if (-not $present.ContainsKey($name)) {
      $result.Add("$name=Demo1!$(New-LocalSecret)")
      $changed = $true
    }
  }
  if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf) -or $changed) {
    [IO.File]::WriteAllLines($environmentFile, $result, (New-Object Text.UTF8Encoding($false)))
  }
}

function Test-CommandAvailable {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $null -ne (Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

function Invoke-JavaVersion {
  param([Parameter(Mandatory = $true)][string]$Executable)

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & $Executable -version 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  return [pscustomobject]@{ exitCode = $exitCode; output = @($output) }
}

function Resolve-JavaExecutable {
  $candidates = New-Object 'System.Collections.Generic.List[string]'
  if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
    $candidates.Add((Join-Path $env:JAVA_HOME 'bin\java.exe'))
  }
  $command = Get-Command -Name 'java' -ErrorAction SilentlyContinue
  if ($null -ne $command) { $candidates.Add($command.Source) }
  $adoptiumRoot = Join-Path $env:ProgramFiles 'Eclipse Adoptium'
  if (Test-Path -LiteralPath $adoptiumRoot -PathType Container) {
    Get-ChildItem -LiteralPath $adoptiumRoot -Directory |
      Where-Object { $_.Name -match '^jdk-21' } |
      Sort-Object Name -Descending |
      ForEach-Object { $candidates.Add((Join-Path $_.FullName 'bin\java.exe')) }
  }
  foreach ($candidate in @($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $versionResult = Invoke-JavaVersion -Executable $candidate
    if ($versionResult.exitCode -ne 0) { continue }
    $match = [regex]::Match(($versionResult.output -join "`n"), 'version\s+"(\d+)')
    if ($match.Success -and [int]$match.Groups[1].Value -ge 21) { return $candidate }
  }
  return $null
}

function Get-JavaMajorVersion {
  $java = Resolve-JavaExecutable
  if ([string]::IsNullOrWhiteSpace($java)) { return $null }
  $versionResult = Invoke-JavaVersion -Executable $java
  if ($versionResult.exitCode -ne 0) { return $null }
  $match = [regex]::Match(($versionResult.output -join "`n"), 'version\s+"(\d+)')
  if (-not $match.Success) { return $null }
  return [int]$match.Groups[1].Value
}

function Assert-PreparePrerequisites {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'DEMO_WINDOWS_REQUIRED' }
  if (-not (Test-CommandAvailable -Name 'docker')) { throw 'DEMO_DOCKER_UNAVAILABLE' }
  $dockerVersion = & docker version --format '{{.Server.Version}}' 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($dockerVersion -join ''))) { throw 'DEMO_DOCKER_UNAVAILABLE' }
  $composeVersion = & docker compose version 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($composeVersion -join ''))) { throw 'DEMO_DOCKER_COMPOSE_UNAVAILABLE' }
  if (-not (Test-CommandAvailable -Name 'tar.exe')) { throw 'DEMO_TAR_UNAVAILABLE' }
  if (-not (Test-CommandAvailable -Name 'curl.exe')) { throw 'DEMO_CURL_UNAVAILABLE' }
  if (-not (Test-CommandAvailable -Name 'node')) { throw 'DEMO_NODE_UNAVAILABLE' }
  $nodeVersion = & node --version 2>$null
  if ($LASTEXITCODE -ne 0 -or [int](([string]$nodeVersion).Trim().TrimStart('v').Split('.')[0]) -lt 20) { throw 'DEMO_NODE_20_REQUIRED' }
  $javaMajor = Get-JavaMajorVersion
  if ($null -eq $javaMajor -or $javaMajor -lt 21) { throw 'DEMO_JAVA_21_REQUIRED' }
}

function Get-ExecutableVersionResult {
  param([Parameter(Mandatory = $true)][string]$Executable)

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $process.StartInfo.FileName = $Executable
  $process.StartInfo.Arguments = '--version'
  $process.StartInfo.UseShellExecute = $false
  $process.StartInfo.CreateNoWindow = $true
  $process.StartInfo.RedirectStandardOutput = $true
  $process.StartInfo.RedirectStandardError = $true
  try {
    if (-not $process.Start()) { throw [InvalidOperationException]::new('PROCESS_NOT_STARTED') }
    $version = $process.StandardOutput.ReadToEnd().Trim()
    [void]$process.StandardError.ReadToEnd()
    $process.WaitForExit()
    return [pscustomobject]@{ exitCode = $process.ExitCode; version = $version; failureType = 'PROCESS_EXIT' }
  } catch {
    $rootException = $_.Exception
    while ($null -ne $rootException.InnerException) { $rootException = $rootException.InnerException }
    $nativeCode = if ($rootException -is [ComponentModel.Win32Exception]) { $rootException.NativeErrorCode } else { $rootException.HResult }
    $failureType = (($rootException.GetType().Name -replace '[^A-Za-z0-9_]', '') + '_' + $nativeCode)
    return [pscustomobject]@{ exitCode = -1; version = ''; failureType = $failureType }
  } finally {
    $process.Dispose()
  }
}

function Ensure-AgentNodeRuntimes {
  $manifestPath = Join-Path $agentRoot 'agent-cli\node-runtime-manifest-v1.json'
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 'hengzhun-agent-node-runtime/v1' -or $manifest.platform -ne 'win32-x64') { throw 'DEMO_AGENT_RUNTIME_MANIFEST_INVALID' }
  foreach ($runtimeName in @('services', 'cli')) {
    $spec = $manifest.$runtimeName
    $target = Join-Path $agentRoot ($spec.executable.Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      $versionResult = Get-ExecutableVersionResult -Executable $target
      if ($versionResult.exitCode -eq 0 -and $versionResult.version -eq $spec.version) { continue }
      throw "DEMO_AGENT_RUNTIME_INVALID:$runtimeName"
    }
    $runtimeRoot = Join-Path $agentRoot 'runtime'
    $targetDirectory = Split-Path -Parent $target
    if (Test-Path -LiteralPath $targetDirectory) { throw "DEMO_AGENT_RUNTIME_INVALID:$runtimeName" }
    $staging = Join-Path $runtimeRoot ('.demo-runtime-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
      $archive = Join-Path $staging $spec.archive
      $url = ('{0}/v{1}/{2}' -f $manifest.source.TrimEnd('/'), $spec.version.TrimStart('v'), $spec.archive)
      & curl.exe --fail --location --silent --show-error --max-time 120 --output $archive $url 2>$null
      if ($LASTEXITCODE -ne 0) { throw "DEMO_AGENT_RUNTIME_DOWNLOAD_FAILED:$runtimeName" }
      $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actualHash -ne $spec.sha256) { throw "DEMO_AGENT_RUNTIME_HASH_MISMATCH:$runtimeName" }
      & tar.exe -xf $archive -C $staging 2>$null
      if ($LASTEXITCODE -ne 0) { throw "DEMO_AGENT_RUNTIME_ARCHIVE_EXTRACT_FAILED:$runtimeName" }
      $sourceDirectory = Join-Path $staging ([IO.Path]::GetFileName($targetDirectory))
      if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) { throw "DEMO_AGENT_RUNTIME_ARCHIVE_LAYOUT_INVALID:$runtimeName" }
      Move-Item -LiteralPath $sourceDirectory -Destination $targetDirectory
      $versionResult = Get-ExecutableVersionResult -Executable $target
      if ($versionResult.exitCode -ne 0 -or $versionResult.version -ne $spec.version) {
        $observedVersion = if ($versionResult.version -match '^v\d+\.\d+\.\d+$') { $versionResult.version } else { 'EMPTY_OR_INVALID' }
        throw "DEMO_AGENT_RUNTIME_VERSION_MISMATCH:${runtimeName}:$($versionResult.exitCode):${observedVersion}:$($versionResult.failureType)"
      }
    } finally {
      if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    }
  }
}

function Ensure-AgentBrowserRuntime {
  $runtimeRoot = Join-Path $agentRoot 'runtime'
  $manifestPath = Join-Path $runtimeRoot 'package.json'
  $lockPath = Join-Path $runtimeRoot 'package-lock.json'
  $node = Join-Path $runtimeRoot 'node-v20.20.2-win-x64\node.exe'
  $npm = Join-Path $runtimeRoot 'node-v20.20.2-win-x64\npm.cmd'
  $freezePath = Join-Path $agentRoot 'config\demo-runtime-freeze.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $lockPath -PathType Leaf) -or -not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $npm -PathType Leaf) -or -not (Test-Path -LiteralPath $freezePath -PathType Leaf)) { throw 'DEMO_AGENT_BROWSER_RUNTIME_INPUT_MISSING' }
  $freeze = Get-Content -Raw -LiteralPath $freezePath | ConvertFrom-Json
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  foreach ($name in @('playwright', '@midscene/web')) {
    if ($manifest.dependencies.$name -ne $freeze.packages.$name) { throw "DEMO_AGENT_BROWSER_RUNTIME_VERSION_INVALID:$name" }
  }
  $browserDependencyCommand = if (Test-Path -LiteralPath (Join-Path $runtimeRoot 'node_modules') -PathType Container) { 'install' } else { 'ci' }
  Invoke-CheckedCommand -FilePath $npm -Arguments @($browserDependencyCommand, '--install-links', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund') -ErrorCode 'DEMO_AGENT_BROWSER_RUNTIME_INSTALL_FAILED' -WorkingDirectory $runtimeRoot
  $browserPath = Join-Path $runtimeRoot $freeze.chromium.executable
  if (-not (Test-Path -LiteralPath $browserPath -PathType Leaf)) {
    $playwrightCli = Join-Path $runtimeRoot 'node_modules\playwright\cli.js'
    if (-not (Test-Path -LiteralPath $playwrightCli -PathType Leaf)) { throw 'DEMO_AGENT_BROWSER_RUNTIME_INSTALL_FAILED' }
    $previousBrowserPath = $env:PLAYWRIGHT_BROWSERS_PATH
    try {
      $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $runtimeRoot 'browsers'
      Invoke-CheckedCommand -FilePath $node -Arguments @($playwrightCli, 'install', 'chromium') -ErrorCode 'DEMO_AGENT_BROWSER_INSTALL_FAILED' -WorkingDirectory $runtimeRoot
    } finally {
      $env:PLAYWRIGHT_BROWSERS_PATH = $previousBrowserPath
    }
  }
  if (-not (Test-Path -LiteralPath $browserPath -PathType Leaf)) { throw 'DEMO_AGENT_BROWSER_INSTALL_FAILED' }
  & (Join-Path $projectRoot 'scripts\deploy\prepare-agent-media.ps1') -AgentRoot $agentRoot
}

function Assert-PlaywrightReady {
  $node = Join-Path $agentRoot 'runtime\node-v20.20.2-win-x64\node.exe'
  $runtimeRoot = Join-Path $agentRoot 'runtime'
  $freeze = Get-Content -Raw -LiteralPath (Join-Path $agentRoot 'config\demo-runtime-freeze.json') | ConvertFrom-Json
  $browser = Join-Path $runtimeRoot $freeze.chromium.executable
  if (-not (Test-Path -LiteralPath $browser -PathType Leaf)) { throw 'DEMO_PLAYWRIGHT_UNAVAILABLE' }
  $probe = "require('playwright'); require('@midscene/web/playwright');"
  Push-Location $runtimeRoot
  try { & $node -e $probe 2>$null | Out-Null }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'DEMO_PLAYWRIGHT_UNAVAILABLE' }
}

function Get-ReleaseIdentity {
  param([Parameter(Mandatory = $true)]$Model)

  $node = Join-Path $agentRoot 'runtime\node-v20.20.2-win-x64\node.exe'
  $script = "const c=require('node:crypto');const r=require('./scripts/i10-release-identity-v4.cjs');const name=process.argv[1],base=process.argv[2];const identity=r.currentReleaseIdentityV4({modelConfigIdentity:{bindingStatus:'BOUND',providerProtocol:'OPENAI_COMPATIBLE',profile:'CONTROL_GENERIC',modelName:name,baseUrlHash:c.createHash('sha256').update(base).digest('hex'),temperature:0,streaming:false,toolMode:'NONE'}});process.stdout.write(JSON.stringify(identity));"
  Push-Location $agentRoot
  try {
    $output = & $node -e $script $Model.name $Model.baseUrl 2>$null
    $identityExitCode = $LASTEXITCODE
  } finally { Pop-Location }
  if ($identityExitCode -ne 0) { throw 'DEMO_RELEASE_IDENTITY_FAILED' }
  try { return ($output -join '') | ConvertFrom-Json }
  catch { throw 'DEMO_RELEASE_IDENTITY_INVALID' }
}

function Get-AgentRuntimeContract {
  $specPath = Join-Path $agentRoot 'agent-cli\managed-process-spec-v1.json'
  if (-not (Test-Path -LiteralPath $specPath -PathType Leaf)) { throw 'DEMO_AGENT_RUNTIME_CONFIG_INVALID' }
  try { $spec = Get-Content -Raw -LiteralPath $specPath | ConvertFrom-Json }
  catch { throw 'DEMO_AGENT_RUNTIME_CONFIG_INVALID' }
  $runtime = $spec.runtime
  if (
    $spec.schemaVersion -ne 'hengzhun-agent-managed-process-spec/v1' -or
    $runtime.sessionRoot -ne '.data/sessions' -or
    $runtime.harnessUrl -ne 'http://127.0.0.1:18788' -or
    $runtime.mcpUrl -ne 'http://127.0.0.1:18789/mcp' -or
    $runtime.namespace -ne 'hengzhun-local'
  ) { throw 'DEMO_AGENT_RUNTIME_CONFIG_INVALID' }
  return [ordered]@{
    sessionRoot = Join-Path $agentRoot ($runtime.sessionRoot.Replace('/', [IO.Path]::DirectorySeparatorChar))
    harnessUrl = $runtime.harnessUrl
    mcpUrl = $runtime.mcpUrl
    namespace = $runtime.namespace
  }
}

function Write-AgentRuntimeEnvironment {
  param(
    [Parameter(Mandatory = $true)]$Model,
    [Parameter(Mandatory = $true)]$Identity
  )

  $runtimeDirectory = Split-Path -Parent $agentRuntimeFile
  New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  $existing = Get-ConfiguredValues -Paths @($agentRuntimeFile)
  foreach ($tokenName in @('HENGZHUN_SERVICE_TOKEN', 'HENGZHUN_WORKER_TOKEN', 'HENGZHUN_MCP_TOKEN')) {
    if ([string]::IsNullOrWhiteSpace($existing[$tokenName]) -or $existing[$tokenName].Length -lt 32) { $existing[$tokenName] = New-LocalSecret }
  }
  $runtimeContract = Get-AgentRuntimeContract
  $existing['HENGZHUN_AGENT_SESSION_ROOT'] = $runtimeContract.sessionRoot
  $existing['HENGZHUN_HARNESS_URL'] = $runtimeContract.harnessUrl
  $existing['HENGZHUN_MCP_URL'] = $runtimeContract.mcpUrl
  $existing['HENGZHUN_AGENT_NAMESPACE'] = $runtimeContract.namespace
  $existing['HENGZHUN_MODEL_NAME'] = $Model.name
  $existing['HENGZHUN_MODEL_BASE_URL'] = $Model.baseUrl
  $existing['HENGZHUN_MODEL_API_KEY'] = $Model.apiKey
  $existing['HENGZHUN_AUTHORIZE_AGENT_LIVE'] = $Identity.identityHash
  $lines = foreach ($name in $existing.Keys | Sort-Object) { "$name=$($existing[$name])" }
  [IO.File]::WriteAllLines($agentRuntimeFile, $lines, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$ErrorCode,
    [string]$WorkingDirectory = $projectRoot
  )
  Push-Location $WorkingDirectory
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $FilePath @Arguments 2>$null | Out-Null
    $commandExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    Pop-Location
  }
  if ($commandExitCode -ne 0) { throw "${ErrorCode}:$commandExitCode" }
}

function Invoke-Prepare {
  param([Parameter(Mandatory = $true)]$Model)

  Write-PrepareProgress -Phase 'PREREQUISITES'
  Assert-PreparePrerequisites
  Write-PrepareProgress -Phase 'NODE_RUNTIMES'
  Ensure-AgentNodeRuntimes
  Write-PrepareProgress -Phase 'LOCAL_ENVIRONMENT'
  Write-LocalEnvironment -Model $Model
  $agentNpm = Join-Path $agentRoot 'runtime\node-v20.20.2-win-x64\npm.cmd'
  $originalPath = $env:PATH
  $env:PATH = (Split-Path -Parent $agentNpm) + [IO.Path]::PathSeparator + $originalPath
  try {
    Write-PrepareProgress -Phase 'AGENT_DEPENDENCIES'
    $dependencyCommand = if (Test-Path -LiteralPath (Join-Path $agentRoot 'node_modules') -PathType Container) { 'install' } else { 'ci' }
    Invoke-CheckedCommand -FilePath $agentNpm -Arguments @($dependencyCommand, '--no-audit', '--no-fund') -ErrorCode 'DEMO_AGENT_DEPENDENCY_INSTALL_FAILED' -WorkingDirectory $agentRoot
    Write-PrepareProgress -Phase 'AGENT_BUILD'
    Invoke-CheckedCommand -FilePath $agentNpm -Arguments @('run', 'generate:dist') -ErrorCode 'DEMO_AGENT_BUILD_FAILED' -WorkingDirectory $agentRoot
  } finally {
    $env:PATH = $originalPath
  }
  Write-PrepareProgress -Phase 'BROWSER_RUNTIME'
  Ensure-AgentBrowserRuntime
  Write-PrepareProgress -Phase 'PLAYWRIGHT_READY'
  Assert-PlaywrightReady
  Write-PrepareProgress -Phase 'LOCAL_SECRETS'
  Invoke-CheckedCommand -FilePath 'pwsh' -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $projectRoot 'scripts\deploy\write-channel-db-password-file.ps1')) -ErrorCode 'DEMO_SECRET_GENERATION_FAILED'
  foreach ($appName in @('customer-portal', 'operations-console', 'quality-case-portal')) {
    Write-PrepareProgress -Phase ("FRONTEND_IMAGE_$($appName.ToUpperInvariant().Replace('-', '_'))")
    Invoke-CheckedCommand -FilePath 'docker' -Arguments @('build', '--file', 'infra/frontend/Dockerfile', '--build-arg', "APP_NAME=$appName", '--tag', "local/$appName`:0.1.0", '.') -ErrorCode 'DEMO_FRONTEND_IMAGE_BUILD_FAILED'
  }
  Write-PrepareProgress -Phase 'CHANNEL_IMAGES'
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $environmentFile, '-f', 'compose.channel.yaml', 'build') -ErrorCode 'DEMO_CHANNEL_IMAGE_BUILD_FAILED'
  Write-PrepareProgress -Phase 'RELEASE_IDENTITY'
  $identity = Get-ReleaseIdentity -Model $Model
  Write-PrepareProgress -Phase 'AGENT_RUNTIME_ENVIRONMENT'
  Write-AgentRuntimeEnvironment -Model $Model -Identity $identity
  Write-PrepareProgress -Phase 'COMPLETED'
  return [ordered]@{ status = 'PREPARED'; command = 'prepare'; releaseIdentity = $identity.identityHash; modelBinding = [ordered]@{ name = $Model.name; baseUrlHash = $identity.modelConfigIdentity.baseUrlHash } }
}

function Invoke-AgentLifecycle {
  param([Parameter(Mandatory = $true)][ValidateSet('start', 'stop')][string]$Action)

  $node = Join-Path $agentRoot 'runtime\node-v24.19.0-win-x64\node.exe'
  $lifecycle = Join-Path $agentRoot 'scripts\i10-agent-lifecycle.cjs'
  if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $lifecycle -PathType Leaf) -or -not (Test-Path -LiteralPath $agentRuntimeFile -PathType Leaf)) {
    throw 'DEMO_AGENT_NOT_PREPARED'
  }
  $output = & $node $lifecycle $Action 2>$null
  if ($LASTEXITCODE -ne 0) { throw "DEMO_AGENT_$($Action.ToUpperInvariant())_FAILED:$LASTEXITCODE" }
  try { return ($output -join '') | ConvertFrom-Json }
  catch { throw "DEMO_AGENT_$($Action.ToUpperInvariant())_INVALID" }
}

function Invoke-Up {
  param([Parameter(Mandatory = $true)]$Model)

  Assert-PreparePrerequisites
  if (-not (Test-Path -LiteralPath $environmentFile -PathType Leaf)) { throw 'DEMO_NOT_PREPARED' }
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $environmentFile, '-f', 'postgresql/docker-compose.isolated.yml', 'up', '-d', '--wait', '--no-build') -ErrorCode 'DEMO_CORE_START_FAILED'
  Invoke-CheckedCommand -FilePath 'pwsh' -Arguments @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    (Join-Path $projectRoot 'scripts\deploy\ensure-fineract-credentials.ps1'),
    '-EnvironmentPath', $environmentFile
  ) -ErrorCode 'DEMO_FINERACT_CREDENTIAL_BOOTSTRAP_FAILED'
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $environmentFile, '-f', 'compose.channel.yaml', 'up', '-d', '--wait', '--no-build') -ErrorCode 'DEMO_CHANNEL_START_FAILED'
  Invoke-CheckedCommand -FilePath 'pwsh' -Arguments @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    (Join-Path $projectRoot 'scripts\demo\provision-fixed-demo-identities.ps1'),
    '-EnvironmentPath', $environmentFile
  ) -ErrorCode 'DEMO_FIXED_IDENTITIES_FAILED'
  Invoke-CheckedCommand -FilePath 'pwsh' -Arguments @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    (Join-Path $agentRoot 'scripts\i10-provision-fuxing-demo-customer.ps1'),
    '-AllowFixtureSeed'
  ) -ErrorCode 'DEMO_CUSTOMER_FIXTURE_BOOTSTRAP_FAILED'
  $agent = Invoke-AgentLifecycle -Action 'start'
  $status = Wait-DemoReady
  if ($status.status -ne 'READY') { throw 'DEMO_RUNTIME_NOT_READY' }
  return [ordered]@{ status = 'READY'; command = 'up'; releaseIdentity = $agent.releaseIdentityHash; addresses = $addresses }
}

function Invoke-Down {
  $composeEnvironment = if (Test-Path -LiteralPath $environmentFile -PathType Leaf) { $environmentFile } else { Join-Path $projectRoot '.env.example' }
  $agentState = Join-Path $agentRoot '.data\runtime\agent-processes.json'
  $agentOutcome = 'NOT_PREPARED'
  if (Test-Path -LiteralPath $agentState -PathType Leaf) {
    $agentOutcome = (Invoke-AgentLifecycle -Action 'stop').status
  }
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $composeEnvironment, '-f', 'compose.channel.yaml', 'down') -ErrorCode 'DEMO_CHANNEL_STOP_FAILED'
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $composeEnvironment, '-f', 'postgresql/docker-compose.isolated.yml', 'down') -ErrorCode 'DEMO_CORE_STOP_FAILED'
  return [ordered]@{ status = 'STOPPED'; command = 'down'; agent = $agentOutcome; volumesPreserved = $true }
}

function Invoke-Reset {
  Invoke-Down | Out-Null
  $composeEnvironment = if (Test-Path -LiteralPath $environmentFile -PathType Leaf) { $environmentFile } else { Join-Path $projectRoot '.env.example' }
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $composeEnvironment, '-f', 'compose.channel.yaml', 'down', '--volumes') -ErrorCode 'DEMO_CHANNEL_RESET_FAILED'
  Invoke-CheckedCommand -FilePath 'docker' -Arguments @('compose', '--env-file', $composeEnvironment, '-f', 'postgresql/docker-compose.isolated.yml', 'down', '--volumes') -ErrorCode 'DEMO_CORE_RESET_FAILED'
  $agentData = [IO.Path]::GetFullPath((Join-Path $agentRoot '.data'))
  foreach ($relativePath in $agentResetRelativePaths) {
    $target = [IO.Path]::GetFullPath((Join-Path $agentData $relativePath))
    if (-not $target.StartsWith(($agentData + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'DEMO_RESET_TARGET_INVALID' }
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
  return [ordered]@{ status = 'RESET'; command = 'reset'; volumesRemoved = $true; agentRuntimeRemoved = $true }
}

function Invoke-GoldenPath {
  $status = Get-DemoStatus
  if ($status.status -ne 'READY') { throw 'DEMO_RUNTIME_NOT_READY' }
  $runner = Join-Path $projectRoot 'scripts\demo\run-golden-path.ps1'
  if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw 'DEMO_GOLDEN_PATH_RUNNER_MISSING' }
  $output = & pwsh -NoProfile -ExecutionPolicy Bypass -File $runner -EnvironmentPath $environmentFile 2>$null
  $runnerExitCode = $LASTEXITCODE
  try { $parsed = ($output -join '') | ConvertFrom-Json }
  catch { throw 'DEMO_GOLDEN_PATH_RESULT_INVALID' }
  if ($runnerExitCode -ne 0) { throw "$($parsed.errorCode):$runnerExitCode" }
  return $parsed
}

$validCommands = @('prepare', 'up', 'status', 'down', 'reset', 'run-golden-path', 'verify')
if ([string]::IsNullOrWhiteSpace($Command) -or $Command -notin $validCommands) {
  Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = 'DEMO_COMMAND_INVALID'; allowedCommands = $validCommands })
  exit 2
}

if ($Command -eq 'status') {
  $result = Get-DemoStatus
  Write-JsonResult $result
  exit $(if ($result.status -eq 'READY') { 0 } else { 3 })
}

if ($Command -eq 'prepare') {
  $model = Get-ModelConfiguration
  if (-not $model.valid) {
    Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = $model.errorCode; command = 'prepare' })
    exit 2
  }
  if (-not (Test-ModelEndpoint -Model $model)) {
    Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = 'DEMO_MODEL_ENDPOINT_UNAVAILABLE'; command = 'prepare' })
    exit 3
  }
  try {
    Write-JsonResult (Invoke-Prepare -Model $model)
    exit 0
  } catch {
    $failure = Get-PrepareFailureResult -Message $_.Exception.Message
    $errorCode = $failure.errorCode
    Write-JsonResult $failure
    exit $(if ($errorCode -match 'CONFIG|MODEL') { 2 } else { 3 })
  }
}

if ($Command -eq 'up') {
  $model = Get-ModelConfiguration
  if (-not $model.valid) {
    Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = $model.errorCode; command = 'up' })
    exit 2
  }
  try {
    Write-JsonResult (Invoke-Up -Model $model)
    exit 0
  } catch {
    $errorCode = $_.Exception.Message.Split(':')[0]
    Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = $errorCode; command = 'up' })
    exit $(if ($errorCode -match 'CONFIG|MODEL') { 2 } else { 3 })
  }
}

if ($Command -eq 'down' -or $Command -eq 'reset') {
  try {
    $result = if ($Command -eq 'down') { Invoke-Down } else { Invoke-Reset }
    Write-JsonResult $result
    exit 0
  } catch {
    Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = $_.Exception.Message.Split(':')[0]; command = $Command })
    exit 3
  }
}

if ($Command -eq 'run-golden-path') {
  try {
    Write-JsonResult (Invoke-GoldenPath)
    exit 0
  } catch {
    Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = $_.Exception.Message.Split(':')[0]; command = $Command })
    exit 4
  }
}

if ($Command -eq 'verify') {
  try {
    $node = Join-Path $agentRoot 'runtime\node-v24.19.0-win-x64\node.exe'
    if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'DEMO_AGENT_NODE_MISSING' }
    & $node (Join-Path $projectRoot 'scripts\test\rf057-report.mjs')
    if ($LASTEXITCODE -eq 0) { exit 0 }
    exit 5
  } catch {
    Write-JsonResult ([ordered]@{decision='NO_GO'; verificationPerformed=$false; errorCode=$_.Exception.Message.Split(':')[0]})
    exit 5
  }
}

Write-JsonResult ([ordered]@{ status = 'FAILED'; errorCode = 'DEMO_COMMAND_NOT_IMPLEMENTED'; command = $Command })
exit 3
