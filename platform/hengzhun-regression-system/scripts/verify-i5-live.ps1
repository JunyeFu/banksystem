[CmdletBinding()]
param(
    [switch]$StopAtClassifiedFailure,
    [switch]$StopAtWaitingUser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $root '..\..')).Path
$runtimeEnv = Join-Path $root '.data\runtime.env'
$values = @{}
Get-Content -LiteralPath $runtimeEnv -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $values[$Matches[1]] = $Matches[2]
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
$serviceToken = $values['HENGZHUN_SERVICE_TOKEN']
$workerToken = $values['HENGZHUN_WORKER_TOKEN']
if (-not $serviceToken -or -not $workerToken) { throw 'Harness runtime authentication is unavailable.' }
$serviceHeaders = @{ Authorization = 'Bearer ' + $serviceToken; 'Content-Type' = 'application/json' }
$workerHeaders = @{ Authorization = 'Bearer ' + $workerToken; 'Content-Type' = 'application/json' }
$baseUrl = 'http://127.0.0.1:18788'
$namespace = 'i5-live-repair'

function Invoke-Harness([string]$Path, $Body, [switch]$Worker) {
    $headers = if ($Worker) { $workerHeaders } else { $serviceHeaders }
    return Invoke-RestMethod -Method Post -Uri ($baseUrl + $Path) -Headers $headers -Body ($Body | ConvertTo-Json -Depth 30 -Compress) -TimeoutSec 60
}

$suffix = [Guid]::NewGuid().ToString('N')
$import = Invoke-Harness '/v1/plugin/cases:import' ([ordered]@{
    namespace=$namespace; idempotencyKey='import:'+$suffix; actorRef='coze-i5-agent';
    sourceFormat='HENGZHUN_JSON_V1'; sourceRef='live-fixture:portal-login:'+$suffix;
    cases=@([ordered]@{
        externalCaseRef='PORTAL-LOGIN-'+$suffix.Substring(0,8); title='Portal login repair validation';
        objective='Validate the controlled login locator repair path.'; summary='I5 live structured import.';
        riskLevel='LOW'; route='portal.login -> portal.profile'; executionProfile='LOGIN_PROFILE';
        steps=@(@{action='Log in through the portal';expected='Profile becomes visible'});
        assertions=@('Header and profile identity are consistent')
    })
})
$caseId = $import.imported[0].caseId
$plan = Invoke-Harness '/v1/plugin/plans:compile' @{
    namespace=$namespace;idempotencyKey='plan:'+$suffix;caseId=$caseId;expectedCaseVersion=1;executionRoute='PLAYWRIGHT'
}
$run = Invoke-Harness '/v1/plugin/runs:submit' @{
    namespace=$namespace;idempotencyKey='run-failure:'+$suffix;caseId=$caseId;expectedCaseVersion=1;
    planId=$plan.planId;environment='local';credentialAlias='i3-customer'
}
$claimed = Invoke-Harness '/internal/worker/tasks:claim' @{workerId='worker-i5-controlled-stimulus'} -Worker
if ($claimed.taskId -ne $run.taskId) { throw 'Controlled I5 run was not claimed.' }
$diagnostic = [Text.Encoding]::UTF8.GetBytes('{"schemaVersion":"i5-controlled-stimulus-v1","containsCredentials":false}')
$failed = Invoke-Harness ('/internal/worker/tasks/'+[Uri]::EscapeDataString($run.taskId)+':complete') @{
    workerId='worker-i5-controlled-stimulus';outcome='FAILED';summary='Controlled locator failure stimulus.';
    errorCode='LOGIN_USERNAME_LOCATOR_NOT_FOUND';errorCategory='TEST_FAILURE';retryable=$false;userActionRequired=$true;
    evidence=@(@{artifactType='DIAGNOSTIC';mediaType='application/json';redactionStatus='REDACTED';extension='json';
        base64Content=[Convert]::ToBase64String($diagnostic);metadata=@{containsCredentials=$false;controlledStimulus=$true}})
} -Worker
$incident = Invoke-Harness '/v1/plugin/failures:get' @{namespace=$namespace;incidentId=$failed.incidentId}
if ($incident.classification -ne 'LOCATOR') { throw 'Failure was not classified as LOCATOR.' }
if ($StopAtClassifiedFailure) {
    $pending = [ordered]@{
        status='CLASSIFIED_FAILURE';namespace=$namespace;caseId=$caseId;planId=$plan.planId;
        runId=$run.runId;taskId=$run.taskId;incidentId=$failed.incidentId;
        classification=$incident.classification;diagnosticStatus=$incident.diagnosticStatus;
        credentialAlias='i3-customer';automaticActivation=$false
    }
    $pendingPath = Join-Path $root '.data\evidence\i5-coze-pending-incident.json'
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $pendingPath)) | Out-Null
    [System.IO.File]::WriteAllText($pendingPath, ($pending | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
    $pending | ConvertTo-Json -Depth 10 -Compress
    return
}
$candidate = Invoke-Harness '/v1/plugin/repairs:create-candidate' @{
    namespace=$namespace;idempotencyKey='candidate:'+$suffix;incidentId=$failed.incidentId;credentialAlias='i3-customer'
}

$env:HENGZHUN_SOURCE_COMMIT = (git -C $repoRoot rev-parse HEAD).Trim()
$node = Join-Path $root 'runtime\node-v20.20.2-win-x64\node.exe'
$worker = Join-Path $root 'worker\src\index.cjs'
& $node $worker --once | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Isolated repair worker failed.' }
$ready = Invoke-Harness '/v1/plugin/repairs:get-candidate' @{namespace=$namespace;candidateId=$candidate.candidateId}
if ($ready.status -ne 'WAITING_USER' -or -not $ready.activationRequired) { throw 'Candidate did not stop at the user activation gate.' }
if ($StopAtWaitingUser) {
    $pending = [ordered]@{
        status='WAITING_USER';namespace=$namespace;caseId=$caseId;planId=$plan.planId;
        runId=$run.runId;taskId=$run.taskId;incidentId=$failed.incidentId;
        candidateId=$candidate.candidateId;candidateVersion=$ready.version;
        baseScriptVersion=$ready.baseScriptVersion;candidateScriptVersion=$ready.candidateScriptVersion;
        patchHash=$ready.patchHash;credentialAlias='i3-customer';automaticActivation=$false
    }
    $pendingPath = Join-Path $root '.data\evidence\i5-coze-pending-candidate.json'
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $pendingPath)) | Out-Null
    [System.IO.File]::WriteAllText($pendingPath, ($pending | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
    $pending | ConvertTo-Json -Depth 10 -Compress
    return
}
$decision = Invoke-Harness '/v1/plugin/decisions:submit' @{
    namespace=$namespace;idempotencyKey='decision:'+$suffix;targetType='REPAIR_CANDIDATE_ACTIVATION';
    targetId=$candidate.candidateId;expectedVersion=$ready.version;choice='APPROVE';
    reason='Explicit live acceptance of the isolated validated locator candidate.';
    confirmationRef='local-live-i5-explicit-confirmation:'+$suffix
}
$active = Invoke-Harness '/v1/plugin/repairs:get-candidate' @{namespace=$namespace;candidateId=$candidate.candidateId}
if ($active.status -ne 'ACTIVE') { throw 'Candidate was not active after the explicit decision.' }

$rerun = Invoke-Harness '/v1/plugin/runs:submit' @{
    namespace=$namespace;idempotencyKey='run-active:'+$suffix;caseId=$caseId;expectedCaseVersion=1;
    planId=$plan.planId;environment='local';credentialAlias='i3-customer'
}
& $node $worker --once | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Activated script verification worker failed.' }
$finalTask = Invoke-Harness '/v1/plugin/tasks:get' @{namespace=$namespace;taskId=$rerun.taskId}
if ($finalTask.status -ne 'SUCCEEDED') { throw "Activated script rerun failed: $($finalTask.errorCode)" }
$artifact = Invoke-Harness '/v1/plugin/artifacts:get-metadata' @{namespace=$namespace;artifactId=$finalTask.resultArtifactId}

$out = [ordered]@{
    status='PASSED';namespace=$namespace;sourceFormat=$import.status;importBatchId=$import.batchId;caseId=$caseId;
    controlledFailureRunId=$run.runId;incidentId=$failed.incidentId;classification=$incident.classification;
    candidateId=$candidate.candidateId;candidateStatusBeforeDecision=$ready.status;candidateStatusAfterDecision=$active.status;
    activationEffect=$decision.effect;baseScriptVersion=$ready.baseScriptVersion;activeScriptVersion=$active.candidateScriptVersion;
    isolatedValidation=$true;automaticActivation=$false;rerunTaskId=$rerun.taskId;rerunStatus=$finalTask.status;
    artifactId=$artifact.artifactId;artifactSha256=$artifact.sha256;redactionStatus=$artifact.redactionStatus
}
$resultPath = Join-Path $root '.data\evidence\i5-live-result.json'
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $resultPath)) | Out-Null
[System.IO.File]::WriteAllText($resultPath, ($out | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
$out | ConvertTo-Json -Depth 10 -Compress
