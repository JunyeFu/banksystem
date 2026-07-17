[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeEnv = Join-Path $root '.data\runtime.env'
$resultPath = Join-Path $root '.data\evidence\i3-live-result.json'

$values = @{}
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
$serviceToken = $values['HENGZHUN_SERVICE_TOKEN']
if (-not $serviceToken) { throw 'Harness service token is unavailable.' }
$headers = @{ Authorization = 'Bearer ' + $serviceToken; 'Content-Type' = 'application/json' }
$baseUrl = 'http://127.0.0.1:18788'
$namespace = 'i3-portal-login'
$suffix = [Guid]::NewGuid().ToString('N')

function Invoke-Harness([string]$Method, [string]$Path, $Body = $null) {
    $parameters = @{ Method = $Method; Uri = $baseUrl + $Path; Headers = $headers; TimeoutSec = 30 }
    if ($null -ne $Body) { $parameters.Body = ($Body | ConvertTo-Json -Depth 20 -Compress) }
    return Invoke-RestMethod @parameters
}

$case = Invoke-Harness POST '/v1/cases/drafts' ([ordered]@{
    namespace = $namespace
    idempotencyKey = 'case:' + $suffix
    actorRef = 'coze-hengzhun-agent'
    title = 'Portal password login and profile consistency'
    objective = 'Enter a synthetic username and password on the bank portal and verify that the header name, avatar, and profile name agree.'
    summary = 'First real I3 vertical regression case.'
    riskLevel = 'LOW'
    route = 'customer.login -> customer.profile'
    steps = @(
        @{ action = 'Open the bank portal and enter the credential alias values'; expected = 'Login completes inside the portal without using the Keycloak login UI' },
        @{ action = 'Read the header name and avatar'; expected = 'The name is non-empty and the avatar matches its first character' },
        @{ action = 'Open the profile page'; expected = 'The profile name equals the header name' }
    )
    assertions = @('Portal password login succeeds', 'Header and profile names are equal', 'Avatar matches the first name character')
    credentialAlias = 'i3-customer'
    knowledgeRetrieval = @{
        sourceAuthority = 'COZE_KNOWLEDGE_BASE'
        query = 'Which deterministic assertions are required for the bank portal login and profile consistency regression?'
        resultSummary = 'Use portal password login, read the header identity, read the profile identity, and compare them deterministically.'
        citationRefs = @('kb://hengzhun/first-case/login-profile-consistency')
    }
})
$caseDetail = Invoke-Harness GET ('/v1/cases/' + [Uri]::EscapeDataString($case.caseId) + '?namespace=' + $namespace)
$plan = Invoke-Harness POST ('/v1/cases/' + [Uri]::EscapeDataString($case.caseId) + '/plans:compile') (@{
    namespace = $namespace; idempotencyKey = 'plan:' + $suffix; expectedCaseVersion = $case.version; executionRoute = 'PLAYWRIGHT'
})
$run = Invoke-Harness POST '/v1/runs' (@{
    namespace = $namespace; idempotencyKey = 'run:' + $suffix; caseId = $case.caseId;
    expectedCaseVersion = $case.version; planId = $plan.planId; environment = 'local'; credentialAlias = 'i3-customer'
})

$polls = 0
do {
    Start-Sleep -Seconds 2
    $task = Invoke-Harness GET ('/v1/tasks/' + [Uri]::EscapeDataString($run.taskId) + '?namespace=' + $namespace)
    $polls++
} while ($task.status -in @('QUEUED', 'RUNNING') -and $polls -lt 45)
if ($task.status -ne 'SUCCEEDED') {
    throw "I3 live run did not succeed: status=$($task.status), errorCode=$($task.errorCode), category=$($task.errorCategory)"
}
$artifact = Invoke-Harness GET ('/v1/artifacts/' + [Uri]::EscapeDataString($task.resultArtifactId) + '/metadata?namespace=' + $namespace)
if (-not $task.runVersion) { throw 'task_get did not return runVersion for decision_submit.' }
$decision = Invoke-Harness POST '/v1/decisions' (@{
    namespace = $namespace; idempotencyKey = 'decision:' + $suffix; targetType = 'RUN_RECOVERY';
    targetId = $run.runId; expectedVersion = $task.runVersion; choice = 'REJECT';
    reason = 'The run succeeded, so recovery is rejected.'; confirmationRef = 'coze-user-confirmed-no-recovery'
})

# Simulate a new Coze conversation retaining only namespace/taskId.
$resumedTask = Invoke-Harness GET ('/v1/tasks/' + [Uri]::EscapeDataString($run.taskId) + '?namespace=' + $namespace)
if ($resumedTask.status -ne 'SUCCEEDED') { throw 'Session recovery task lookup failed.' }

$result = [ordered]@{
    status = 'PASSED'
    caseId = $case.caseId
    knowledgeRetrievalId = $case.knowledgeRetrievalId
    planId = $plan.planId
    runId = $run.runId
    taskId = $run.taskId
    taskStatus = $task.status
    runVersion = $task.runVersion
    artifactId = $artifact.artifactId
    artifactSha256 = $artifact.sha256
    decisionId = $decision.decisionId
    sessionRecovery = 'PASSED'
    toolsCalled = @('case_create_draft','case_get','plan_compile','run_submit','task_get','artifact_get_metadata','decision_submit')
    polls = $polls
}
[System.IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
$result | ConvertTo-Json -Depth 8 -Compress
