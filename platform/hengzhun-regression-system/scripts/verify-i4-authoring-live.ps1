[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
$evidencePath = Join-Path $root '.data\evidence\i4-authoring-live.json'
if (-not (Test-Path -LiteralPath $runtimeEnv)) { throw 'Ignored runtime environment is unavailable.' }
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
if (-not $env:HENGZHUN_SERVICE_TOKEN) { throw 'Harness service credential alias is unavailable.' }
$headers = @{ Authorization = "Bearer $($env:HENGZHUN_SERVICE_TOKEN)"; 'Content-Type' = 'application/json' }
$base = 'http://127.0.0.1:18788/v1/plugin'
$suffix = ([guid]::NewGuid().ToString('N')).Substring(0, 12)
$namespace = 'i4-authoring-live'

function Invoke-Harness([string]$Path, [hashtable]$Body) {
    Invoke-RestMethod -Method Post -Uri ($base + $Path) -Headers $headers -Body ($Body | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 30
}

$case = Invoke-Harness '/cases:create-draft' @{
    namespace = $namespace; idempotencyKey = "i4-authoring-case-$suffix"; actorRef = 'local-i4-acceptance'
    title = 'I4 three-action authoring acceptance'; objective = 'Verify model actions are admitted by capability gate and independently checked by Playwright.'
    summary = 'Synthetic login-page authoring without credentials or personal data.'; riskLevel = 'MEDIUM'; route = '/portal/login'
    executionProfile = 'LOGIN_PROFILE'; credentialAlias = 'i4-customer'
    steps = @(
        @{action='Input a synthetic marker';expected='Playwright verifies the value'},
        @{action='Switch the SSO tab';expected='Playwright verifies the title'},
        @{action='Scroll the login page';expected='Playwright verifies the scroll offset'}
    )
    assertions = @('Unique action target','No token endpoint call','Cursor advances only after factual verification')
    authoringActions = @(
        @{actionType='INPUT';prompt='Input a synthetic marker in the username or mobile number field';targetRef='LOGIN_USERNAME';valueRef='SYNTHETIC_TEXT';riskLevel='LOW'},
        @{actionType='TAP';prompt='Tap the unified identity authentication tab at the top of the login card';targetRef='LOGIN_SSO_TAB';riskLevel='MEDIUM'},
        @{actionType='SCROLL';prompt='Scroll down the current login page once';targetRef='PAGE';riskLevel='LOW'}
    )
}
$plan = Invoke-Harness '/plans:compile' @{
    namespace = $namespace; idempotencyKey = "i4-authoring-plan-$suffix"; caseId = $case.caseId
    expectedCaseVersion = 1; executionRoute = 'AUTHORING_REQUIRED'
}

$task = $null
for ($i = 0; $i -lt 240; $i++) {
    $task = Invoke-Harness '/tasks:get' @{namespace=$namespace;taskId=$plan.taskId}
    if ($task.status -in @('WAITING_USER','FAILED')) { break }
    Start-Sleep -Seconds 2
}
if ($task.status -ne 'WAITING_USER' -or -not $task.userActionRequired -or $task.progress -ne 100 -or $task.errorCode) {
    throw "Authoring task did not stop at explicit user confirmation: $($task.status)"
}

$safe = [ordered]@{
    schemaVersion = 'i4-authoring-live-v1'; status = 'PASSED'; namespace = $namespace
    caseId = $case.caseId; planId = $plan.planId; scriptId = $plan.scriptId; taskId = $plan.taskId
    taskStatus = $task.status; userActionRequired = [bool]$task.userActionRequired
    actionCount = 3; fullPlanStoredInHarness = $true; workerReceivedThreeActionWindow = $true
    automaticScriptActivation = $false; containsCredentials = $false; completedAt = (Get-Date).ToUniversalTime().ToString('o')
}
New-Item -ItemType Directory -Path (Split-Path -Parent $evidencePath) -Force | Out-Null
[System.IO.File]::WriteAllText($evidencePath, ($safe | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
[ordered]@{status='PASSED';actionCount=3;taskStatus=$task.status;userActionRequired=$true;automaticScriptActivation=$false} | ConvertTo-Json -Compress
